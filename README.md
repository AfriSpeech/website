# AfriSpeech website

The site behind [afrispeech.org](https://afrispeech.org) — open-source NLP models,
datasets and tools for African languages.

Built with [Astro](https://astro.build) and Tailwind CSS, deployed on Netlify.

## Local development

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
```

## Live statistics

Dataset and model download counts come from the Hugging Face API at page load.

GitHub download figures are **cumulative repository clones**. GitHub's traffic API
only exposes a rolling 14-day window, so the totals are accumulated by us:

- `netlify/functions/traffic-snapshot.mjs` runs daily and stores each repo's
  per-day traffic in [Netlify Blobs](https://docs.netlify.com/blobs/overview/),
  keyed by date — so re-running a snapshot rewrites the same days rather than
  inflating a running total.
- `netlify/functions/github-traffic.mjs` serves the cumulative totals to the site,
  and bootstraps a snapshot itself if the cron hasn't run recently.
- `src/lib/github-traffic.mjs` resolves figures at build time, falling back from
  Blobs → the GitHub API's 14-day window → the committed snapshot in
  `src/data/traffic-fallback.json`, so a page never renders a blank.

Refresh the committed fallback with `npm run refresh-traffic`.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `GITHUB_TOKEN` | yes | Reads repo traffic. Needs `repo` scope (or fine-grained read access to the org's repos). |
| `NETLIFY_API_TOKEN` | no | Lets the build read cumulative totals from Blobs. Without it the build uses the 14-day figure and the client corrects it on load. |

Copy `.env.example` to `.env` for local use. `.env` is gitignored.

## Credits

Adinkra symbol artwork is from [Adinkra Icons](https://github.com/kevinkhagan/adinkra-icons)
(Apache-2.0) — see `src/icons/adinkra/NOTICE`. The symbols themselves are traditional
designs of the Akan people of Ghana and Côte d'Ivoire.
