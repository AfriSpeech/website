import express from 'express';
import compression from 'compression';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import joinCommunityHandler from './netlify/functions/join-community.mjs';
import { getTrafficData, runTrafficSnapshot, startTrafficScheduler } from './src/lib/traffic-service.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, 'dist');

// Middleware
app.use(compression());
app.use(express.json());

// Global security headers (matching netlify.toml)
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Health check endpoint for Docker / Coolify
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// API: Join Community (supports both /.netlify/functions/join-community and /api/join-community)
const handleJoinCommunity = async (req, res) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || 'localhost';
    const fullUrl = `${protocol}://${host}${req.originalUrl}`;

    const webReq = new Request(fullUrl, {
      method: req.method,
      headers: req.headers,
      body: JSON.stringify(req.body),
    });

    const webRes = await joinCommunityHandler(webReq);
    const body = await webRes.text();

    webRes.headers.forEach((val, key) => res.setHeader(key, val));
    res.status(webRes.status).send(body);
  } catch (err) {
    console.error('[server] join-community error:', err);
    res.status(500).json({ ok: false, error: 'Could not process request.' });
  }
};

app.post('/.netlify/functions/join-community', handleJoinCommunity);
app.post('/api/join-community', handleJoinCommunity);

// API: GitHub Traffic (supports both /.netlify/functions/github-traffic and /api/github-traffic)
const handleGithubTraffic = async (req, res) => {
  try {
    const force = req.query.refresh === '1';
    const data = await getTrafficData({ forceRefresh: force });
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(data);
  } catch (err) {
    console.error('[server] github-traffic error:', err);
    res.status(500).json({ configured: false, error: 'traffic unavailable' });
  }
};

app.get('/.netlify/functions/github-traffic', handleGithubTraffic);
app.get('/api/github-traffic', handleGithubTraffic);

// API: Manual trigger for traffic snapshot (optional token check)
app.post(['/api/traffic-snapshot', '/.netlify/functions/traffic-snapshot'], async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
  }

  const result = await runTrafficSnapshot();
  res.status(result.ok ? 200 : 500).json(result);
});

// Static assets with custom caching headers
app.use('/_astro', express.static(path.join(DIST_DIR, '_astro'), {
  maxAge: '1y',
  immutable: true,
}));

// Serve all other static files
app.use(express.static(DIST_DIR, {
  extensions: ['html'],
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    }
  },
}));

// Fallback 404 handler
app.use((req, res) => {
  const notFoundPath = path.join(DIST_DIR, '404.html');
  if (fs.existsSync(notFoundPath)) {
    res.status(404).sendFile(notFoundPath);
  } else {
    res.status(404).send('404 Not Found');
  }
});

// Start listening
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] AfriSpeech website running on port ${PORT}`);
  startTrafficScheduler();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('[server] HTTP server closed');
    process.exit(0);
  });
});
