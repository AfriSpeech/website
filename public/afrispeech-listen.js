/**
 * AfriSpeech Listen widget.
 *
 *   <script src="https://afrispeech.org/afrispeech-listen.js" defer></script>
 *
 * Optional attributes:
 *   data-lang      force a starting language (an afriso code, e.g. "swa")
 *   data-position  "bottom-right" (default) or "bottom-left"
 *   data-label     button text, default "Listen"
 *
 * The page is read in the browser rather than fetched by our server, so it
 * works on pages that block automated requests and on anything rendered by
 * JavaScript. Readability is only downloaded once someone actually clicks, so
 * a site owner pays nothing until a reader uses the button.
 *
 * Styles are shipped in this file on purpose: the host site's stylesheet does
 * not know about our class names, and Tailwind is not present on their page.
 */
(function () {
  'use strict';

  var script = document.currentScript ||
    document.querySelector('script[src*="afrispeech-listen"]');
  if (!script || script.dataset.afrispeechReady) return;
  script.dataset.afrispeechReady = '1';

  var ORIGIN = new URL(script.src).origin;
  /* The synthesis service is a separate deployment: it spends a metered Gemini
     quota, so it lives apart from the site that embeds this widget. */
  var SPEECH = script.dataset.endpoint || 'https://listen.afrispeech.org';
  /* A browser-delivered key is not a secret: anyone can read it from the page
     source. It exists to let the service tell widget traffic apart from stray
     calls, and nothing more.

     Nor is the service's origin allowlist a lock. An Origin header is set by
     the browser and only the browser, so curl sends none and anyone can forge
     one. The allowlist stops other people's pages from spending the quota from
     a reader's browser, which is worth having. What caps what a caller can
     actually cost is the service's rate limits, so host it somewhere that has
     them configured. */
  var SPEECH_KEY = script.dataset.key || '';
  var POLL_MIN_MS = 1200;
  var POLL_MAX_MS = 4000;
  var POLL_TIMEOUT_MS = 180000;
  var READABILITY = ORIGIN + '/afrispeech/readability.min.js';
  var CATALOGUE_TTL = 24 * 60 * 60 * 1000;
  var MIN_CHARS = 180;
  var UNSUPPORTED = 'Sorry, this webpage is not supported.';

  var cfg = {
    lang: script.dataset.lang || '',
    position: script.dataset.position === 'bottom-left' ? 'left' : 'right',
    label: script.dataset.label || 'Listen',
  };

  /* ------------------------------------------------------------- catalogue */

  function loadCatalogue() {
    var fresh = readCache();
    if (fresh) return Promise.resolve(fresh);
    /* The catalogue comes from the synthesis service, not from this site. It
       used to come from a function of our own, which meant the widget only
       worked on pages that also ran that function. Asking the service directly
       means the widget is one file you can drop onto any site. */
    return fetch(SPEECH + '/languages', { headers: { accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var list = (data && data.languages) || [];
        if (!list.length) throw new Error('empty catalogue');
        writeCache(list);
        return list;
      });
  }

  function readCache() {
    try {
      var raw = localStorage.getItem('afrispeech.languages');
      if (!raw) return null;
      var box = JSON.parse(raw);
      if (!box || !box.list || !box.list.length) return null;
      if (Date.now() - box.at > CATALOGUE_TTL) return null;
      return box.list;
    } catch (e) { return null; }
  }

  function writeCache(list) {
    try {
      localStorage.setItem('afrispeech.languages', JSON.stringify({ at: Date.now(), list: list }));
    } catch (e) { /* private mode; we just refetch next time */ }
  }

  /* ------------------------------------------------------------- extraction */

  var readabilityPromise = null;

  function loadReadability() {
    if (window.Readability) return Promise.resolve(window.Readability);
    if (readabilityPromise) return readabilityPromise;
    readabilityPromise = new Promise(function (resolve, reject) {
      var tag = document.createElement('script');
      tag.src = READABILITY;
      tag.async = true;
      tag.onload = function () {
        if (window.Readability) resolve(window.Readability);
        else reject(new Error('Readability did not load'));
      };
      tag.onerror = function () { reject(new Error('Readability failed to load')); };
      document.head.appendChild(tag);
    });
    return readabilityPromise;
  }

  /** Read the page we are sitting on, without sending it anywhere first. */
  function readThisPage() {
    return loadReadability().then(function (Readability) {
      var clone = document.cloneNode(true);
      // Readability chokes on our own widget markup if it is left in place.
      var panels = clone.querySelectorAll('[data-afrispeech-root]');
      for (var i = 0; i < panels.length; i += 1) panels[i].remove();

      var article = new Readability(clone, { charThreshold: 200 }).parse();
      var text = (article && article.textContent ? article.textContent : '')
        .replace(/\s+/g, ' ')
        .trim();

      if (text.length < MIN_CHARS) {
        var err = new Error(UNSUPPORTED);
        err.code = 'unsupported';
        throw err;
      }

      return { text: text };
    });
  }

  /* ------------------------------------------------------------------ audio */

  function speechHeaders(extra) {
    var headers = { accept: 'application/json' };
    if (SPEECH_KEY) headers['x-listen-key'] = SPEECH_KEY;
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) headers[k] = extra[k];
    return headers;
  }

  function speechError(response, fallback) {
    return response.json().catch(function () { return {}; }).then(function (body) {
      var err = new Error(body.error || fallback);
      err.code = body.error === UNSUPPORTED ? 'unsupported' : 'failed';
      err.status = response.status;
      throw err;
    });
  }

  /** Start a run for the words to be read, and hand back its id. */
  function startRun(text, lang) {
    return fetch(SPEECH + '/speak', {
      method: 'POST',
      headers: speechHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        text: text,
        lang: lang,
        locale: navigator.language || 'en',
      }),
    }).then(function (response) {
      if (!response.ok) return speechError(response, 'We could not build the audio.');
      return response.json().then(function (body) {
        if (!body || !body.workflowRunId) throw new Error('The service did not return a run id.');
        return body.workflowRunId;
      });
    });
  }
  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /** Poll until the run finishes, reporting how long we have been waiting. */
  function waitForRun(runId, onProgress) {
    var startedAt = Date.now();
    var delay = POLL_MIN_MS;
    return fetch(SPEECH + '/status?run=' + encodeURIComponent(runId), { headers: speechHeaders() })
      .then(function (response) {
        if (!response.ok) return speechError(response, 'We lost track of that recording.');
        return response.json();
      })
      .then(function (meta) {
        var waited = Date.now() - startedAt;
        if (meta.state === 'done') return meta;
        if (meta.state === 'error') {
          var err = new Error(meta.error || 'We could not build the audio.');
          err.code = meta.error === UNSUPPORTED ? 'unsupported' : 'failed';
          throw err;
        }
        if (waited > POLL_TIMEOUT_MS) throw new Error('That took too long. Please try again.');
        if (onProgress) onProgress(waited);
        return wait(delay).then(function () {
          delay = Math.min(Math.round(delay * 1.4), POLL_MAX_MS);
          return waitForRun(runId, onProgress);
        });
      });
  }

  function fetchAudio(runId) {
    return fetch(SPEECH + '/audio?run=' + encodeURIComponent(runId), { headers: speechHeaders() })
      .then(function (response) {
        if (!response.ok) return speechError(response, 'The audio is no longer available.');
        return response.blob();
      });
  }

  function buildAudio(text, lang, onProgress) {
    return startRun(text, lang).then(function (runId) {
      return waitForRun(runId, onProgress).then(function (meta) {
        return fetchAudio(runId).then(function (blob) { return { blob: blob, meta: meta }; });
      });
    });
  }

  function decode(value) {
    if (!value) return '';
    try { return decodeURIComponent(value); } catch (e) { return value; }
  }

  /* ------------------------------------------------------------------- view */

  var root = document.createElement('div');
  root.setAttribute('data-afrispeech-root', '');
  root.className = 'afs-listen afs-listen--' + cfg.position;

  var style = document.createElement('style');
  style.textContent = [
    '.afs-listen{position:fixed;bottom:20px;z-index:2147483000;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.4}',
    '.afs-listen--right{right:20px}','.afs-listen--left{left:20px}',
    '.afs-listen__row{display:flex;align-items:stretch;background:#fff;border:1px solid #D4DAD6;border-radius:999px;box-shadow:0 8px 24px rgba(16,24,40,.12);overflow:hidden}',
    '.afs-listen__btn{appearance:none;border:0;background:#52B788;color:#081C15;font-weight:600;font-size:14px;padding:11px 18px;cursor:pointer;display:flex;align-items:center;gap:8px;white-space:nowrap;flex:0 0 auto}',
    '.afs-listen__btn:hover{background:#37845F;color:#fff}','.afs-listen__btn:disabled{opacity:.65;cursor:progress}',
    '.afs-listen__btn svg{width:16px;height:16px;fill:currentColor}',
    '.afs-listen__sel{appearance:none;-webkit-appearance:none;border:0;background:#fff url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="%233B4540" stroke-width="1.5"/></svg>\') no-repeat right 10px center;color:#3B4540;font-size:13px;padding:0 26px 0 14px;cursor:pointer;flex:1 1 auto;min-width:0;max-width:230px}',
    '.afs-listen__panel{margin-top:10px;background:#fff;border:1px solid #D4DAD6;border-radius:12px;box-shadow:0 8px 24px rgba(16,24,40,.12);padding:14px;width:300px;max-width:calc(100vw - 40px)}',
    '.afs-listen__panel[hidden]{display:none}',
    '.afs-listen__audio{width:100%;margin:2px 0 8px}',
    '.afs-listen__note{font-size:12px;color:#5F6F66;margin:0 0 6px}',
    '.afs-listen__note--warn{background:#FDF3E3;border:1px solid #E8C88A;color:#7A5410;border-radius:8px;padding:8px 10px;margin:0 0 8px}',
    '.afs-listen__err{font-size:13px;color:#9B2C2C;margin:0}','.afs-listen__link{color:#2D6A4F;font-size:12px}',
    '.afs-listen__head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}',
    '.afs-listen__lang{font-size:12px;font-weight:600;color:#2D6A4F}',
    '.afs-listen__close{border:0;background:none;color:#717E76;cursor:pointer;font-size:18px;line-height:1;padding:2px 4px}',
  ].join('');

  function icon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a3.5 3.5 0 0 0-2-3.15v6.3a3.5 3.5 0 0 0 2-3.15z"/></svg>';
  }

  function build() {
    document.head.appendChild(style);
    document.body.appendChild(root);

    root.innerHTML =
      '<div class="afs-listen__row">' +
        '<select class="afs-listen__sel" aria-label="Language"></select>' +
        '<button class="afs-listen__btn" type="button">' + icon() + '<span class="afs-listen__text">' + cfg.label + '</span></button>' +
      '</div>' +
      '<div class="afs-listen__panel" hidden></div>';

    var button = root.querySelector('.afs-listen__btn');
    var select = root.querySelector('.afs-listen__sel');
    var panel = root.querySelector('.afs-listen__panel');

    loadCatalogue().then(function (list) {
      /* The first option is a prompt, not a choice: it carries no language and
         cannot be selected, so nothing is chosen until the reader picks. The
         catalogue is only ever the languages the service can actually speak, so
         it is not padded with English to fill the gap. */
      select.innerHTML = placeholder() + list.map(function (l) {
        return '<option value="' + l.code + '">' + escapeHtml(l.name) + '</option>';
      }).join('');
    }).catch(function () {
      /* Catalogue unreachable: there is nothing honest to offer, and quietly
         defaulting to a language the reader did not ask for is worse than
         saying so. */
      select.innerHTML = placeholder();
      select.disabled = true;
      button.disabled = true;
      panel.hidden = false;
      panel.innerHTML = '<p class="afs-listen__note">The list of languages could not be ' +
        'loaded, so Listen is unavailable just now.</p>';
    });

    function placeholder() {
      return '<option value="" disabled selected>Select a language</option>';
    }

    button.addEventListener('click', function () { start(); });
    select.addEventListener('click', function (event) { event.stopPropagation(); });

    function start() {
      if (!select.value) {
        panel.hidden = false;
        panel.innerHTML = '<p class="afs-listen__note">Choose a language to read this ' +
          'page in, then press Listen again.</p>';
        return;
      }
      button.disabled = true;
      button.querySelector('.afs-listen__text').textContent = 'Preparing…';
      panel.hidden = false;
      panel.innerHTML = '<p class="afs-listen__note">Reading this page…</p>';

      readThisPage()
        .then(function (page) {
          // A full page is a minute or two of waiting, and nothing is being
          // recorded yet: the text is being turned into speech. Say that once,
          // naming the language they picked, rather than counting seconds at
          // someone who cannot tell what the number is counting towards.
          var chosen = select.options[select.selectedIndex];
          var languageName = chosen ? chosen.textContent : 'audio';
          panel.innerHTML = '<p class="afs-listen__note">Making a ' +
            escapeHtml(languageName) + ' recording. This usually takes a minute or two, and it will start playing on its own.</p>';
          return buildAudio(page.text, select.value);
        })
        .then(function (result) {
          var url = URL.createObjectURL(result.blob);
          var meta = result.meta;
          panel.innerHTML =
            '<div class="afs-listen__head"><span class="afs-listen__lang">' +
              escapeHtml(meta.language || 'Audio') + '</span>' +
              '<button class="afs-listen__close" type="button" aria-label="Close">&times;</button></div>' +
            (meta.truncated
              ? '<p class="afs-listen__note afs-listen__note--warn">This page was long, so we read only the first ' +
                meta.chars.toLocaleString() + ' of ' + meta.totalChars.toLocaleString() + ' characters.</p>'
              : '') +
            '<audio class="afs-listen__audio" controls autoplay src="' + url + '"></audio>' +
              // Attribution, not documentation. The old link was built from
              // ORIGIN, which is wherever this script happens to be served from, so
              // on a staging deploy it pointed at that deploy's about page. The
              // brand's home is fixed, so point there instead.
              '<p class="afs-listen__note">Powered by ' +
                '<a class="afs-listen__link" href="https://afrispeech.org" target="_blank" rel="noopener">AfriSpeech</a></p>';
          var close = panel.querySelector('.afs-listen__close');
          close.addEventListener('click', function () {
            panel.hidden = true;
            URL.revokeObjectURL(url);
          });
          reset();
        })
        .catch(function (error) {
          panel.innerHTML = error.code === 'unsupported'
            ? '<p class="afs-listen__err">' + UNSUPPORTED + '</p>'
            : '<p class="afs-listen__err">' + escapeHtml(error.message) + '</p>';
          reset();
        });
    }

    function reset() {
      button.disabled = false;
      button.querySelector('.afs-listen__text').textContent = cfg.label;
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
