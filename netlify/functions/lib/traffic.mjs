// Cumulative GitHub traffic tracking.
//
// GitHub's traffic API only exposes a rolling 14-day window, so a cumulative
// total has to be accumulated by us. Each snapshot stores per-day counts keyed
// by date, so re-running a snapshot re-writes the same days instead of adding
// to a running total — merging is idempotent and safe to run as often as we
// like. Cumulative totals are then the sum of every day we have ever stored.

export const ORG = 'AfriSpeech';
const IGNORED_REPOS = new Set(['.github']);
const KEY_PREFIX = 'repo:';
const META_KEY = 'meta';

const ghHeaders = token => ({
  Authorization: `Bearer ${token}`,
  'User-Agent': 'afrispeech-website',
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
});

const dayOf = timestamp => String(timestamp).slice(0, 10);

/**
 * Merge a 14-day traffic window into the days we already have. A day already
 * on record is raised to the higher of the two counts, never lowered: today's
 * count is still climbing, and an older snapshot of it may be behind.
 */
export function mergeDays(days = {}, incoming = [], field) {
  const merged = { ...days };
  for (const entry of incoming) {
    const day = dayOf(entry.timestamp);
    if (!day) continue;
    const existing = merged[day] ? { ...merged[day] } : {};
    existing[field] = Math.max(existing[field] || 0, entry.count || 0);
    existing[`${field}Uniques`] = Math.max(existing[`${field}Uniques`] || 0, entry.uniques || 0);
    merged[day] = existing;
  }
  return merged;
}

export function totalsFor(days = {}) {
  let clones = 0, cloneUniques = 0, views = 0, viewUniques = 0;
  for (const day of Object.values(days)) {
    clones += day.clones || 0;
    cloneUniques += day.clonesUniques || 0;
    views += day.views || 0;
    viewUniques += day.viewsUniques || 0;
  }
  return { clones, cloneUniques, views, viewUniques };
}

async function fetchJson(url, token) {
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok) return null;
  return res.json();
}

/** Snapshot every org repo's traffic window and merge it into the store. */
export async function collectTraffic({ store, token, org = ORG }) {
  const repoList = await fetchJson(`https://api.github.com/orgs/${org}/repos?per_page=100&type=all`, token);
  if (!Array.isArray(repoList)) throw new Error('could not list org repos');

  const repos = [];
  for (const repo of repoList) {
    if (IGNORED_REPOS.has(repo.name)) continue;
    const [clonesData, viewsData] = await Promise.all([
      fetchJson(`https://api.github.com/repos/${repo.full_name}/traffic/clones`, token),
      fetchJson(`https://api.github.com/repos/${repo.full_name}/traffic/views`, token),
    ]);

    const key = KEY_PREFIX + repo.name;
    const stored = (await store.get(key, { type: 'json' })) || {};
    let days = stored.days || {};
    if (clonesData) days = mergeDays(days, clonesData.clones, 'clones');
    if (viewsData) days = mergeDays(days, viewsData.views, 'views');

    const record = {
      name: repo.name,
      description: repo.description || '',
      language: repo.language || '',
      html_url: repo.html_url,
      days,
      updatedAt: new Date().toISOString(),
    };
    await store.setJSON(key, record);
    repos.push(record);
  }

  await store.setJSON(META_KEY, { lastSnapshotAt: new Date().toISOString(), repoCount: repos.length });
  return repos;
}

/** Read cumulative per-repo and org-wide totals out of the store. */
export async function readCumulative({ store }) {
  const { blobs = [] } = await store.list({ prefix: KEY_PREFIX });
  const records = await Promise.all(
    blobs.map(blob => store.get(blob.key, { type: 'json' })),
  );

  let clones = 0, views = 0, uniques = 0;
  let firstDay = null;
  const repos = [];

  for (const record of records) {
    if (!record) continue;
    const totals = totalsFor(record.days);
    clones += totals.clones;
    views += totals.views;
    uniques += totals.viewUniques;
    const days = Object.keys(record.days || {}).sort();
    if (days.length && (!firstDay || days[0] < firstDay)) firstDay = days[0];
    repos.push({
      name: record.name,
      clones: totals.clones,
      cloneUniques: totals.cloneUniques,
      views: totals.views,
      days: days.length,
    });
  }

  repos.sort((a, b) => b.clones - a.clones);
  const meta = (await store.get(META_KEY, { type: 'json' })) || {};
  return { clones, views, uniques, repos, since: firstDay, lastSnapshotAt: meta.lastSnapshotAt || null };
}
