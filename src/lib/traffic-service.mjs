import { defaultStore } from './traffic-store.mjs';
import { collectTraffic, readCumulative } from '../../netlify/functions/lib/traffic.mjs';

const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;

let memoryCache = { t: 0, data: null };
let activeCollection = null;

export async function getTrafficData({ forceRefresh = false, store = defaultStore } = {}) {
  const token = process.env.GITHUB_TOKEN;

  if (!forceRefresh && memoryCache.data && Date.now() - memoryCache.t < CACHE_TTL_MS) {
    return { configured: Boolean(token), ...memoryCache.data };
  }

  let data = await readCumulative({ store });

  if (token) {
    const isStale = !data.lastSnapshotAt || Date.now() - Date.parse(data.lastSnapshotAt) > STALE_AFTER_MS;
    if (isStale || forceRefresh) {
      if (!activeCollection) {
        activeCollection = collectTraffic({ store, token })
          .catch((err) => {
            console.error('[traffic-service] Failed collecting GitHub traffic:', err.message);
          })
          .finally(() => {
            activeCollection = null;
          });
      }
      await activeCollection;
      data = await readCumulative({ store });
    }
  }

  memoryCache = { t: Date.now(), data };
  return { configured: Boolean(token), ...data };
}

export async function runTrafficSnapshot({ store = defaultStore } = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn('[traffic-service] GITHUB_TOKEN not set, skipping traffic snapshot');
    return { ok: false, error: 'missing GITHUB_TOKEN' };
  }

  try {
    const repos = await collectTraffic({ store, token });
    console.log(`[traffic-service] Stored traffic snapshot for ${repos.length} repos`);
    memoryCache = { t: 0, data: null };
    return { ok: true, count: repos.length };
  } catch (err) {
    console.error('[traffic-service] Traffic snapshot failed:', err);
    return { ok: false, error: err.message };
  }
}

export function startTrafficScheduler({ intervalMs = 24 * 60 * 60 * 1000, store = defaultStore } = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log('[traffic-service] GITHUB_TOKEN not configured; automatic traffic sync disabled');
    return null;
  }

  console.log('[traffic-service] Automatic GitHub traffic sync scheduled (every 24h)');

  // Run initial check after 15s to allow server startup
  setTimeout(async () => {
    try {
      const data = await readCumulative({ store });
      const stale = !data.lastSnapshotAt || Date.now() - Date.parse(data.lastSnapshotAt) > STALE_AFTER_MS;
      if (stale) {
        console.log('[traffic-service] Initial traffic snapshot running...');
        await runTrafficSnapshot({ store });
      }
    } catch (e) {
      console.warn('[traffic-service] Initial check failed:', e.message);
    }
  }, 15000);

  const timer = setInterval(() => {
    runTrafficSnapshot({ store });
  }, intervalMs);

  return timer;
}
