import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const HF_DIR = path.join(DATA_DIR, 'hf');
const HF_FILE = path.join(HF_DIR, 'stats.json');

const BASELINE_MODELS = 1226;
const BASELINE_DATASETS = 3088;

let memoryCache = { t: 0, data: null };
const CACHE_TTL_MS = 10 * 60 * 1000;

export class HfTracker {
  constructor(filePath = HF_FILE) {
    this.filePath = filePath;
    this.dir = path.dirname(filePath);
  }

  async init() {
    await fs.mkdir(this.dir, { recursive: true });
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      const initial = {
        modelsBaseline: BASELINE_MODELS,
        datasetsBaseline: BASELINE_DATASETS,
        modelsCumulative: BASELINE_MODELS,
        datasetsCumulative: BASELINE_DATASETS,
        modelsLastRolling: 0,
        datasetsLastRolling: 0,
        modelsAccumulated: 0,
        datasetsAccumulated: 0,
        lastSnapshotAt: null,
        history: [],
      };
      await this.save(initial);
      return initial;
    }
  }

  async save(data) {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async sync() {
    const state = await this.init();

    let modelsList = [];
    let datasetsList = [];
    try {
      const [mRes, dRes] = await Promise.all([
        fetch('https://huggingface.co/api/models?author=AfriSpeech&limit=100'),
        fetch('https://huggingface.co/api/datasets?author=AfriSpeech&limit=100'),
      ]);
      if (mRes.ok) modelsList = await mRes.json();
      if (dRes.ok) datasetsList = await dRes.json();
    } catch (err) {
      console.warn('[hf-tracker] Fetch failed:', err.message);
    }

    const currentModelsRolling = modelsList.reduce((sum, m) => sum + (m.downloads || 0), 0);
    const currentDatasetsRolling = datasetsList.reduce((sum, d) => sum + (d.downloads || 0), 0);

    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    if (state.modelsLastRolling === 0) {
      state.modelsLastRolling = currentModelsRolling;
    } else if (currentModelsRolling > state.modelsLastRolling) {
      const delta = currentModelsRolling - state.modelsLastRolling;
      state.modelsAccumulated += delta;
      state.modelsLastRolling = currentModelsRolling;
    } else {
      state.modelsLastRolling = currentModelsRolling;
    }

    if (state.datasetsLastRolling === 0) {
      state.datasetsLastRolling = currentDatasetsRolling;
    } else if (currentDatasetsRolling > state.datasetsLastRolling) {
      const delta = currentDatasetsRolling - state.datasetsLastRolling;
      state.datasetsAccumulated += delta;
      state.datasetsLastRolling = currentDatasetsRolling;
    } else {
      state.datasetsLastRolling = currentDatasetsRolling;
    }

    state.modelsCumulative = Math.max(BASELINE_MODELS, BASELINE_MODELS + state.modelsAccumulated);
    state.datasetsCumulative = Math.max(BASELINE_DATASETS, Math.max(currentDatasetsRolling, BASELINE_DATASETS + state.datasetsAccumulated));
    state.lastSnapshotAt = now;

    const existingIndex = state.history.findIndex(h => h.date === today);
    const entry = {
      date: today,
      modelsRolling: currentModelsRolling,
      datasetsRolling: currentDatasetsRolling,
      modelsCumulative: state.modelsCumulative,
      datasetsCumulative: state.datasetsCumulative,
      updatedAt: now,
    };

    if (existingIndex >= 0) {
      state.history[existingIndex] = entry;
    } else {
      state.history.push(entry);
      if (state.history.length > 365) state.history.shift();
    }

    await this.save(state);

    return {
      models: {
        cumulative: state.modelsCumulative,
        rolling30d: currentModelsRolling,
        count: modelsList.length,
        items: modelsList.map(m => ({ id: m.id, downloads: m.downloads, likes: m.likes })),
      },
      datasets: {
        cumulative: state.datasetsCumulative,
        rolling30d: currentDatasetsRolling,
        count: datasetsList.length,
        items: datasetsList.map(d => ({ id: d.id, downloads: d.downloads, likes: d.likes })),
      },
      lastUpdated: now,
    };
  }
}

export const hfTracker = new HfTracker();

export async function getHfStats({ forceRefresh = false } = {}) {
  if (!forceRefresh && memoryCache.data && Date.now() - memoryCache.t < CACHE_TTL_MS) {
    return memoryCache.data;
  }

  try {
    const data = await hfTracker.sync();
    memoryCache = { t: Date.now(), data };
    return data;
  } catch (err) {
    console.error('[hf-service] Failed to get stats:', err);
    if (memoryCache.data) return memoryCache.data;
    return {
      models: { cumulative: BASELINE_MODELS, rolling30d: 207, count: 4, items: [] },
      datasets: { cumulative: 6633, rolling30d: 6633, count: 16, items: [] },
      lastUpdated: new Date().toISOString(),
    };
  }
}

export function startHfScheduler({ intervalMs = 6 * 60 * 60 * 1000 } = {}) {
  setTimeout(() => {
    getHfStats({ forceRefresh: true }).catch(() => {});
  }, 5000);

  return setInterval(() => {
    getHfStats({ forceRefresh: true }).catch(() => {});
  }, intervalMs);
}
