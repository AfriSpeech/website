import { getStore } from '@netlify/blobs';
import { collectTraffic, readCumulative } from './lib/traffic.mjs';

const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

let cache = { t: 0, data: null };
const CACHE_TTL_MS = 5 * 60 * 1000;
let collecting = null;

export default async () => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return Response.json({ configured: false, clones: 0, views: 0, repos: [] });
  }

  if (cache.data && Date.now() - cache.t < CACHE_TTL_MS) {
    return Response.json({ configured: true, ...cache.data }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }

  try {
    const store = getStore('github-traffic');
    let data = await readCumulative({ store });

    // Bootstrap or self-heal if the scheduled snapshot hasn't run recently.
    // The first snapshot seeds 14 days of history for free, since that is the
    // window GitHub hands back.
    const stale = !data.lastSnapshotAt || Date.now() - Date.parse(data.lastSnapshotAt) > STALE_AFTER_MS;
    if (stale) {
      collecting = collecting || collectTraffic({ store, token }).finally(() => { collecting = null; });
      await collecting;
      data = await readCumulative({ store });
    }

    cache = { t: Date.now(), data };
    return Response.json({ configured: true, ...data }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch (e) {
    return Response.json({ configured: true, error: 'traffic unavailable' }, { status: 500 });
  }
};
