import { getStore } from '@netlify/blobs';
import { collectTraffic } from './lib/traffic.mjs';

// Runs on a cron so no traffic day is ever lost: GitHub only keeps a rolling
// 14-day window, and anything older than that is gone for good.
export const config = { schedule: '@daily' };

export default async () => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn('traffic-snapshot: GITHUB_TOKEN not set, skipping');
    return new Response('missing GITHUB_TOKEN', { status: 200 });
  }

  const store = getStore('github-traffic');
  const repos = await collectTraffic({ store, token });
  console.log(`traffic-snapshot: stored traffic for ${repos.length} repos`);
  return new Response(`ok: ${repos.length} repos`, { status: 200 });
};
