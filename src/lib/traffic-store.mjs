import fs from 'node:fs/promises';
import path from 'node:path';
import fallbackSnapshot from '../data/traffic-fallback.json' with { type: 'json' };

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const TRAFFIC_DIR = path.join(DATA_DIR, 'traffic');

export class FileStore {
  constructor(dir = TRAFFIC_DIR) {
    this.dir = dir;
    this.ready = null;
  }

  async init() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      await fs.mkdir(this.dir, { recursive: true });
      await this._seedIfNeeded();
    })();
    return this.ready;
  }

  _safePath(key) {
    const safe = key.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    return path.join(this.dir, `${safe}.json`);
  }

  async _seedIfNeeded() {
    const metaPath = this._safePath('meta');
    try {
      await fs.access(metaPath);
      return;
    } catch {
      // Need seeding
    }

    if (!fallbackSnapshot?.repos?.length) return;

    const date = fallbackSnapshot.since || '2026-08-27';

    for (const repo of fallbackSnapshot.repos) {
      const record = {
        name: repo.name,
        description: '',
        language: '',
        days: {
          [date]: {
            clones: repo.clones || 0,
            clonesUniques: repo.cloneUniques || 0,
            views: repo.views || 0,
            viewsUniques: 0,
          },
        },
        updatedAt: new Date().toISOString(),
      };
      await fs.writeFile(this._safePath(`repo:${repo.name}`), JSON.stringify(record, null, 2), 'utf-8');
    }

    await fs.writeFile(
      metaPath,
      JSON.stringify({
        lastSnapshotAt: fallbackSnapshot.lastSnapshotAt || new Date().toISOString(),
        repoCount: fallbackSnapshot.repos.length,
      }, null, 2),
      'utf-8',
    );
  }

  async get(key, options = {}) {
    await this.init();
    try {
      const content = await fs.readFile(this._safePath(key), 'utf-8');
      return options.type === 'json' ? JSON.parse(content) : content;
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async setJSON(key, value) {
    await this.init();
    await fs.writeFile(this._safePath(key), JSON.stringify(value, null, 2), 'utf-8');
  }

  async list({ prefix = '' } = {}) {
    await this.init();
    try {
      const files = await fs.readdir(this.dir);
      const safePrefix = prefix.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      const blobs = files
        .filter(f => f.startsWith(safePrefix) && f.endsWith('.json'))
        .map(f => {
          const raw = f.slice(0, -5);
          const key = prefix ? prefix + raw.slice(safePrefix.length) : raw;
          return { key };
        });
      return { blobs };
    } catch {
      return { blobs: [] };
    }
  }
}

export const defaultStore = new FileStore();
