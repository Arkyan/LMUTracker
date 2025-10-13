const { app, BrowserWindow, ipcMain, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { XMLParser } = require('fast-xml-parser');
const os = require('os');
const { Worker } = require('worker_threads');
const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
};

// Assure l'association correcte de l'icône dans la barre des tâches Windows
// en définissant un AppUserModelID correspondant à build.appId
const getAppId = () => (app.isPackaged ? 'com.lmutracker.app' : 'com.lmutracker.app.dev');
try {
  app.setName('LMU Tracker');
} catch {}
try {
  if (process.platform === 'win32') {
    app.setAppUserModelId(getAppId());
  }
} catch (_) {
  // Pas critique sur autres plateformes / anciennes versions
}

function createWindow() {
  // Choisir l'icône selon la disponibilité (ICO préférable sur Windows)
  const candidateDirs = [
    __dirname,
    // En production, main.js est généralement dans resources/app
    // On tente aussi resources/app et resources au cas où
    path.join(process.resourcesPath || '', 'app'),
    process.resourcesPath || ''
  ].filter(Boolean);
  function resolveFirstExisting(filename) {
    for (const dir of candidateDirs) {
      const p = path.join(dir, filename);
      if (fsSync.existsSync(p)) return p;
    }
    return null;
  }
  let iconPath = resolveFirstExisting('LMUTrackerLogo.webp') || '';
  const icoPath = resolveFirstExisting('LMUTrackerLogo.ico');
  const pngPath = resolveFirstExisting('LMUTrackerLogo.png');

  if (fsSync.existsSync(icoPath)) {
    iconPath = icoPath;
  } else if (fsSync.existsSync(pngPath)) {
    iconPath = pngPath;
  }

  // Charger l'icône explicitement (utile en dev sous Windows)
  let browserIcon;
  try {
    const chosen = icoPath || pngPath || iconPath;
    const img = chosen ? nativeImage.createFromPath(chosen) : nativeImage.createEmpty();
    if (!img.isEmpty()) {
      browserIcon = img;
    }
  } catch {}

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
  icon: browserIcon || iconPath,
  icon: browserIcon || icoPath || pngPath || iconPath || undefined,
    autoHideMenuBar: true, // Cache la barre de menus par défaut (peut être réaffichée avec Alt)
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Définir explicitement les détails d'app pour la barre des tâches Windows
  try {
    if (process.platform === 'win32' && typeof win.setAppDetails === 'function') {
      const appIconPath = fsSync.existsSync(icoPath) ? icoPath : (fsSync.existsSync(pngPath) ? pngPath : iconPath);
      const appIcon = icoPath || pngPath || iconPath || undefined;
      win.setAppDetails({
        appId: getAppId(),
        appIconPath: appIcon,
        relaunchDisplayName: 'LMU Tracker'
      });
    }
  } catch {}



  win.loadFile('index.html');
  win.maximize();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ===========================
// Cache persistant des sessions parsées
// ===========================
const SESSIONS_CACHE_FILE_NAME = 'sessions-cache.v1.json';
let sessionsCache = null; // { [filePath]: { mtimeMs: number, size: number, parsed: any } }
let sessionsCacheLoaded = false;
let sessionsCacheSaveTimer = null;

function getSessionsCachePath() {
  return path.join(app.getPath('userData'), SESSIONS_CACHE_FILE_NAME);
}

async function loadSessionsCacheFromDisk() {
  if (sessionsCacheLoaded && sessionsCache) return sessionsCache;
  try {
    const fp = getSessionsCachePath();
    const content = await fs.readFile(fp, 'utf-8');
    const json = JSON.parse(content);
    sessionsCache = json && typeof json === 'object' ? json : {};
  } catch (_) {
    sessionsCache = {};
  } finally {
    sessionsCacheLoaded = true;
  }
  return sessionsCache;
}

function scheduleSaveSessionsCache() {
  try { if (sessionsCacheSaveTimer) clearTimeout(sessionsCacheSaveTimer); } catch {}
  sessionsCacheSaveTimer = setTimeout(async () => {
    try {
      const fp = getSessionsCachePath();
      try { fsSync.mkdirSync(path.dirname(fp), { recursive: true }); } catch {}
      await fs.writeFile(fp, JSON.stringify(sessionsCache || {}, null, 2), 'utf-8');
    } catch (_) { /* noop */ }
  }, 800);
}

async function getCachedParsedIfFresh(filePath, mtimeMs, size) {
  await loadSessionsCacheFromDisk();
  try {
    const entry = sessionsCache[filePath];
    if (entry && entry.mtimeMs === mtimeMs && entry.size === size && entry.parsed) {
      return { filePath, parsed: entry.parsed, mtimeMs, mtimeIso: new Date(mtimeMs).toISOString() };
    }
  } catch (_) {}
  return null;
}

async function setCachedParsed(filePath, mtimeMs, size, parsed) {
  await loadSessionsCacheFromDisk();
  try {
    sessionsCache[filePath] = { mtimeMs, size, parsed };
    scheduleSaveSessionsCache();
  } catch (_) {}
}

// IPC : ouverture d'un fichier LMU
ipcMain.handle('open-lmu-file', async () => {
  const result = await dialog.showOpenDialog({
    title: "Choisir un fichier de résultats LMU",
    properties: ['openFile'],
    filters: [{ name: 'Fichiers LMU', extensions: ['xml'] }]
  });

  if (result.canceled) return { canceled: true };

  const filePath = result.filePaths[0];
  const content = await fs.readFile(filePath, 'utf-8');

  // Parser XML → JSON (avec attributs)
  const parser = new XMLParser(parserOptions);
  const parsed = parser.parse(content);

  return { canceled: false, filePath, parsed };
});

// Helper: lister tous les fichiers .xml dans un dossier (récursif)
async function getAllXmlFiles(dir) {
  const out = [];
  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.xml')) {
        out.push(full);
      }
    }
  }
  await walk(dir);
  return out;
}

// IPC : ouverture d'un dossier et parsing de tous les .xml
ipcMain.handle('open-lmu-folder', async () => {
  const result = await dialog.showOpenDialog({
    title: "Choisir un dossier contenant des fichiers LMU (.xml)",
    properties: ['openDirectory']
  });

  if (result.canceled) return { canceled: true };

  const folderPath = result.filePaths[0];
  const files = await getAllXmlFiles(folderPath);

  const parser = new XMLParser(parserOptions);
  const parsedFiles = [];

  for (const filePath of files) {
    try {
        const [content, stat] = await Promise.all([
          fs.readFile(filePath, 'utf-8'),
          fs.stat(filePath)
        ]);
        const parsed = parser.parse(content);
        parsedFiles.push({ filePath, parsed, mtimeMs: stat.mtimeMs, mtimeIso: stat.mtime.toISOString() });
    } catch (err) {
      try {
        const stat = await fs.stat(filePath);
        parsedFiles.push({ filePath, error: String(err), mtimeMs: stat.mtimeMs, mtimeIso: stat.mtime.toISOString() });
      } catch {
        parsedFiles.push({ filePath, error: String(err) });
      }
    }
  }

  return { canceled: false, folderPath, count: parsedFiles.length, files: parsedFiles };
});

// IPC: sélectionner un dossier (sans parser)
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Sélectionner un dossier de résultats',
    properties: ['openDirectory']
  });
  if (result.canceled) return { canceled: true };
  return { canceled: false, folderPath: result.filePaths[0] };
});

// IPC: scanner un dossier fourni pour parser tous les .xml
ipcMain.handle('scan-lmu-folder', async (_event, folderPath) => {
  if (!folderPath) {
    return { canceled: true, error: 'Aucun dossier fourni' };
  }
  try {
    const files = await getAllXmlFiles(folderPath);
    const parser = new XMLParser(parserOptions);
    const parsedFiles = [];
    for (const filePath of files) {
      try {
        const [content, stat] = await Promise.all([
          fs.readFile(filePath, 'utf-8'),
          fs.stat(filePath)
        ]);
        const parsed = parser.parse(content);
        parsedFiles.push({ filePath, parsed, mtimeMs: stat.mtimeMs, mtimeIso: stat.mtime.toISOString() });
      } catch (err) {
        try {
          const stat = await fs.stat(filePath);
          parsedFiles.push({ filePath, error: String(err), mtimeMs: stat.mtimeMs, mtimeIso: stat.mtime.toISOString() });
        } catch {
          parsedFiles.push({ filePath, error: String(err) });
        }
      }
    }
    return { canceled: false, folderPath, count: parsedFiles.length, files: parsedFiles };
  } catch (error) {
    return { canceled: true, error: String(error) };
  }
});

// Nouvelle API: lister les fichiers (métadonnées uniquement) triés par mtime desc
ipcMain.handle('list-lmu-files', async (_event, folderPath) => {
  if (!folderPath) {
    return { canceled: true, error: 'Aucun dossier fourni' };
  }
  try {
    const files = await getAllXmlFiles(folderPath);
    const metas = [];
    for (const filePath of files) {
      try {
        const stat = await fs.stat(filePath);
        metas.push({ filePath, mtimeMs: stat.mtimeMs, mtimeIso: stat.mtime.toISOString() });
      } catch (err) {
        metas.push({ filePath, error: String(err) });
      }
    }
    metas.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
    return { canceled: false, folderPath, count: metas.length, filesMeta: metas };
  } catch (error) {
    return { canceled: true, error: String(error) };
  }
});

// Nouvelle API: parser un lot de fichiers par chemins
ipcMain.handle('parse-lmu-files', async (_event, filePaths) => {
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    return { canceled: true, error: 'Aucun fichier fourni' };
  }
  try {
    // Préparer cache et répartir entre hits et manquants
    await loadSessionsCacheFromDisk();
    const cached = [];
    const toParse = [];
    for (const fp of filePaths) {
      try {
        const st = await fs.stat(fp);
        const hit = await getCachedParsedIfFresh(fp, st.mtimeMs, st.size);
        if (hit) {
          cached.push(hit);
        } else {
          toParse.push({ filePath: fp, stat: st });
        }
      } catch (_) {
        toParse.push({ filePath: fp, stat: null });
      }
    }
    let parsedResults = [];
    if (toParse.length > 0) {
      const results = await parseFilesWithWorkerPool(toParse.map(t => t.filePath));
      // Alimenter le cache
      for (const r of results) {
        if (r && r.filePath && r.parsed && typeof r.mtimeMs === 'number') {
          try {
            const st = await fs.stat(r.filePath);
            await setCachedParsed(r.filePath, r.mtimeMs, st.size, r.parsed);
          } catch (_) { /* ignore */ }
        }
      }
      parsedResults = results;
    }
    const all = [...cached, ...parsedResults];
    const byPath = new Map(all.map(x => [x.filePath, x]));
    const ordered = filePaths.map(fp => byPath.get(fp)).filter(Boolean);
    return { canceled: false, count: ordered.length, files: ordered };
  } catch (error) {
    // Fallback: parser côté main avec concurrence limitée si les workers échouent
    try {
      const parser = new XMLParser(parserOptions);
      const CONCURRENCY = Math.min(4, filePaths.length);
      const out = new Array(filePaths.length);
      let idx = 0;
      await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
        for (;;) {
          const i = idx++;
          if (i >= filePaths.length) break;
          const fp = filePaths[i];
          try {
            const [content, stat] = await Promise.all([
              fs.readFile(fp, 'utf-8'),
              fs.stat(fp)
            ]);
            const parsed = parser.parse(content);
            out[i] = { filePath: fp, parsed, mtimeMs: stat.mtimeMs, mtimeIso: stat.mtime.toISOString() };
          } catch (err) {
            try {
              const stat = await fs.stat(fp);
              out[i] = { filePath: fp, error: String(err), mtimeMs: stat.mtimeMs, mtimeIso: stat.mtime.toISOString() };
            } catch {
              out[i] = { filePath: fp, error: String(err) };
            }
          }
        }
      }));
      return { canceled: false, count: out.length, files: out };
    } catch (err2) {
      return { canceled: true, error: String(error || err2) };
    }
  }
});

// ===========================
// Worker pool pour parsing XML
// ===========================
let parseWorkerPool = null;

function resolveWorkerScriptPath() {
  const candidateDirs = [
    __dirname,
    path.join(process.resourcesPath || '', 'app'),
    process.resourcesPath || ''
  ].filter(Boolean);
  for (const dir of candidateDirs) {
    const p = path.join(dir, 'workers', 'parseWorker.js');
    if (fsSync.existsSync(p)) return p;
  }
  // Dernier recours: chemin relatif standard
  return path.join(__dirname, 'workers', 'parseWorker.js');
}

function createWorker(scriptPath) {
  const worker = new Worker(scriptPath, { argv: [], execArgv: [] });
  worker._busy = false;
  worker._current = null;
  return worker;
}

function ensureParseWorkerPool() {
  if (parseWorkerPool) return parseWorkerPool;
  const size = Math.max(1, Math.min(4, (os.cpus?.() ? os.cpus().length - 0 : 4)));
  const script = resolveWorkerScriptPath();
  const workers = Array.from({ length: size }, () => createWorker(script));
  const queue = [];
  const idle = new Set(workers);

  for (const w of workers) {
    w.on('message', (msg) => {
      const job = w._current;
      w._busy = false;
      w._current = null;
      idle.add(w);
      try {
        if (msg && msg.ok && msg.result) {
          job?.resolve(msg.result);
        } else if (msg && msg.result) {
          job?.resolve(msg.result);
        } else {
          job?.reject(new Error('Réponse worker invalide'));
        }
      } finally {
        pump();
      }
    });
    w.on('error', (err) => {
      const job = w._current;
      w._busy = false;
      w._current = null;
      idle.add(w);
      job?.resolve({ filePath: job?.filePath, error: String(err) });
      pump();
    });
    w.on('exit', (code) => {
      // Remplacer le worker s'il sort
      idle.delete(w);
      const nw = createWorker(script);
      workers.push(nw);
      idle.add(nw);
      nw.on('message', (...args) => w.emit('message', ...args));
      nw.on('error', (...args) => w.emit('error', ...args));
      nw.on('exit', (...args) => w.emit('exit', ...args));
      pump();
    });
  }

  function pump() {
    while (idle.size > 0 && queue.length > 0) {
      const w = idle.values().next().value;
      idle.delete(w);
      const job = queue.shift();
      w._busy = true;
      w._current = job;
      try {
        w.postMessage({ filePath: job.filePath });
      } catch (err) {
        w._busy = false;
        w._current = null;
        job.resolve({ filePath: job.filePath, error: String(err) });
        idle.add(w);
      }
    }
  }

  function run(filePath) {
    return new Promise((resolve, reject) => {
      queue.push({ filePath, resolve, reject });
      pump();
    });
  }

  parseWorkerPool = { run };
  return parseWorkerPool;
}

async function parseFilesWithWorkerPool(filePaths) {
  const pool = ensureParseWorkerPool();
  const tasks = filePaths.map(fp => pool.run(fp));
  const results = await Promise.all(tasks);
  return results;
}

// IPC: ouvrir un fichier par chemin précis (pour la page session)
ipcMain.handle('open-lmu-file-by-path', async (_event, filePath) => {
  if (!filePath) return { canceled: true, error: 'Aucun chemin fourni' };
  try {
    const stat = await fs.stat(filePath);
    const hit = await getCachedParsedIfFresh(filePath, stat.mtimeMs, stat.size);
    if (hit) return { canceled: false, ...hit };
    const content = await fs.readFile(filePath, 'utf-8');
    const parser = new XMLParser(parserOptions);
    const parsed = parser.parse(content);
    await setCachedParsed(filePath, stat.mtimeMs, stat.size, parsed);
    return { canceled: false, filePath, parsed, mtimeMs: stat.mtimeMs, mtimeIso: stat.mtime.toISOString() };
  } catch (error) {
    return { canceled: true, error: String(error), filePath };
  }
});

  // ===========================
  // Paramètres (persistance JSON)
  // ===========================
  const SETTINGS_FILE_NAME = 'settings.json';

  async function readSettingsFromDisk() {
    try {
      const filePath = path.join(app.getPath('userData'), SETTINGS_FILE_NAME);
      const content = await fs.readFile(filePath, 'utf-8');
      const json = JSON.parse(content);
      return { ok: true, data: json, filePath };
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        const filePath = path.join(app.getPath('userData'), SETTINGS_FILE_NAME);
        return { ok: true, data: {}, filePath };
      }
      return { ok: false, error: String(error) };
    }
  }

  async function writeSettingsToDisk(settingsObj) {
    try {
      const filePath = path.join(app.getPath('userData'), SETTINGS_FILE_NAME);
      // S'assurer que le dossier userData existe (normalement Electron le crée)
      try { fsSync.mkdirSync(app.getPath('userData'), { recursive: true }); } catch {}
      const json = JSON.stringify(settingsObj || {}, null, 2);
      await fs.writeFile(filePath, json, 'utf-8');
      return { ok: true, filePath };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }

  ipcMain.handle('settings-read', async () => {
    return await readSettingsFromDisk();
  });

  ipcMain.handle('settings-write', async (_event, settingsObj) => {
    return await writeSettingsToDisk(settingsObj);
  });
