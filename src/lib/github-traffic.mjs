// Build-time source for GitHub download (clone) figures.
//
// Netlify only injects NETLIFY_BLOBS_CONTEXT into serverless and edge
// functions, not into the build command, so reading the cumulative store at
// build time needs an explicit siteID + personal access token. Three layers,
// best first, so a page never renders a blank or a stale invented number:
//
//   1. Netlify Blobs — the real cumulative totals the daily snapshot builds up.
//   2. GitHub API direct — the rolling 14-day window. Real, just conservative.
//   3. Committed snapshot (src/data/traffic-fallback.json) — last known good.
//
// Whichever layer answers, the client-side fetch of
// /.netlify/functions/github-traffic still replaces these with live cumulative
// numbers once the page loads.

import { collectTraffic, readCumulative, totalsFor, mergeDays, ORG } from '../../netlify/functions/lib/traffic.mjs';
// Statically imported so the bundler resolves it: import.meta.url points at a
// build chunk, not at src/, once Vite has bundled this module.
import fallbackSnapshot from '../data/traffic-fallback.json';

async function fromBlobs() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
  if (!process.env.NETLIFY_BLOBS_CONTEXT && !(siteID && token)) return null;

  const { getStore } = await import('@netlify/blobs');
  const store = process.env.NETLIFY_BLOBS_CONTEXT
    ? getStore('github-traffic')
    : getStore({ name: 'github-traffic', siteID, token });

  const data = await readCumulative({ store });
  if (!data.repos.length) return null;
  return { ...data, source: 'blobs' };
}

async function fromGitHub() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;

  // Reuse the snapshot collector with an in-memory store: same merge logic,
  // nothing persisted, giving the 14-day window as a floor.
  const memory = new Map();
  const store = {
    get: async key => memory.get(key) || null,
    setJSON: async (key, value) => { memory.set(key, value); },
    list: async ({ prefix }) => ({ blobs: [...memory.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }),
  };
  await collectTraffic({ store, token });
  const data = await readCumulative({ store });
  if (!data.repos.length) return null;
  return { ...data, source: 'github-14d' };
}

async function fromFallbackFile() {
  if (!fallbackSnapshot?.repos?.length) return null;
  return { ...fallbackSnapshot, source: 'snapshot-file' };
}

let cached = null;

/** Cumulative GitHub traffic, resolved once per build. */
export async function getTraffic() {
  if (cached) return cached;

  for (const layer of [fromBlobs, fromGitHub, fromFallbackFile]) {
    try {
      const data = await layer();
      if (data) {
        cached = data;
        console.log(`[github-traffic] ${data.repos.length} repos, ${data.clones} clones (source: ${data.source})`);
        return cached;
      }
    } catch (e) {
      console.warn(`[github-traffic] ${layer.name} failed: ${e.message}`);
    }
  }

  cached = { clones: 0, views: 0, repos: [], since: null, source: 'none' };
  return cached;
}

/** Cumulative clones keyed by repo name. */
export async function getDownloadsByRepo() {
  const { repos } = await getTraffic();
  return Object.fromEntries(repos.map(r => [r.name, r.clones]));
}

export { ORG, totalsFor, mergeDays };
