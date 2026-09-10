// Refresh the committed traffic snapshot used as the last-resort build-time
// fallback. Run with GITHUB_TOKEN set (or Netlify Blobs credentials, which
// give the true cumulative totals rather than the 14-day window):
//
//   node --env-file=.env scripts/refresh-traffic-fallback.mjs

import { writeFile } from 'node:fs/promises';
import { getTraffic } from '../src/lib/github-traffic.mjs';

const OUT = new URL('../src/data/traffic-fallback.json', import.meta.url);

const data = await getTraffic();
if (data.source === 'snapshot-file' || data.source === 'none') {
  console.error(`refusing to overwrite the snapshot from source "${data.source}" — set GITHUB_TOKEN or Netlify Blobs credentials`);
  process.exit(1);
}

const { source, ...snapshot } = data;
await writeFile(OUT, JSON.stringify({ ...snapshot, generatedAt: new Date().toISOString(), generatedFrom: source }, null, 2) + '\n');
console.log(`wrote snapshot: ${snapshot.repos.length} repos, ${snapshot.clones} clones (from ${source})`);
