const { app } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

const CACHE_FILE = 'sessions-cache.v1.json';

let cache = null;
let loaded = false;
let saveTimer = null;

function getCachePath() {
  return path.join(app.getPath('userData'), CACHE_FILE);
}

async function loadCache() {
  if (loaded && cache) return cache;
  try {
    const content = await fs.readFile(getCachePath(), 'utf-8');
    const json = JSON.parse(content);
    cache = json && typeof json === 'object' ? json : {};
  } catch {
    cache = {};
  } finally {
    loaded = true;
  }
  return cache;
}

function scheduleSave() {
  try { if (saveTimer) clearTimeout(saveTimer); } catch {}
  saveTimer = setTimeout(async () => {
    try {
      const fp = getCachePath();
      try { fsSync.mkdirSync(path.dirname(fp), { recursive: true }); } catch {}
      await fs.writeFile(fp, JSON.stringify(cache || {}, null, 2), 'utf-8');
    } catch {}
  }, 800);
}

async function getCachedParsedIfFresh(filePath, mtimeMs, size) {
  await loadCache();
  try {
    const entry = cache[filePath];
    if (entry && entry.mtimeMs === mtimeMs && entry.size === size && entry.parsed) {
      return { filePath, parsed: entry.parsed, mtimeMs, mtimeIso: new Date(mtimeMs).toISOString() };
    }
  } catch {}
  return null;
}

async function setCachedParsed(filePath, mtimeMs, size, parsed) {
  await loadCache();
  try {
    cache[filePath] = { mtimeMs, size, parsed };
    scheduleSave();
  } catch {}
}

module.exports = { getCachedParsedIfFresh, setCachedParsed };
