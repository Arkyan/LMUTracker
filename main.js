const { app, BrowserWindow, ipcMain, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { XMLParser } = require('fast-xml-parser');
const os = require('os');
const { Worker } = require('worker_threads');
const dbManager = require('./modules/databaseManager');
const { autoUpdater } = require('electron-updater');
const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
};

// Fonction de log qui ne s'exécute qu'en développement
const devLog = (...args) => {
  if (!app.isPackaged) {
    console.log(...args);
  }
};

// Variable globale pour la fenêtre principale
let mainWindow = null;

// Configuration de l'auto-updater
autoUpdater.autoDownload = false; // Ne télécharge pas automatiquement
autoUpdater.autoInstallOnAppQuit = true; // Installe au prochain redémarrage

// Gestion des événements de mise à jour
autoUpdater.on('checking-for-update', () => {
  devLog('Vérification des mises à jour...');
});

autoUpdater.on('update-available', (info) => {
  devLog('Mise à jour disponible:', info.version);
  // Afficher une notification à l'utilisateur
  if (mainWindow) {
    mainWindow.webContents.send('update-available', info);
  }
});

autoUpdater.on('update-not-available', (info) => {
  devLog('Application à jour');
});

autoUpdater.on('error', (err) => {
  console.error('Erreur lors de la mise à jour:', err);
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = `Vitesse de téléchargement: ${progressObj.bytesPerSecond}`;
  log_message = log_message + ` - Téléchargé ${progressObj.percent}%`;
  log_message = log_message + ` (${progressObj.transferred}/${progressObj.total})`;
  devLog(log_message);
  if (mainWindow) {
    mainWindow.webContents.send('download-progress', progressObj);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  devLog('Mise à jour téléchargée');
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', info);
  }
});

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
    // En production avec asar, l'icône est dans app.asar.unpacked
    path.join(process.resourcesPath || '', 'app.asar.unpacked'),
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
    icon: iconPath,
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
  
  // Assigner à la variable globale
  mainWindow = win;
  
  // Désactiver les DevTools en production
  if (app.isPackaged) {
    win.webContents.on('before-input-event', (event, input) => {
      // Bloquer F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
      if (
        input.key === 'F12' ||
        (input.control && input.shift && ['I', 'J', 'C'].includes(input.key.toUpperCase()))
      ) {
        event.preventDefault();
      }
    });
  }
  
  return win;
}

app.whenReady().then(() => {
  // Initialiser la base de données
  const dbInit = dbManager.initDatabase();
  if (dbInit.ok) {
    devLog('[Main] Base de données initialisée');
  } else {
    console.error('[Main] Erreur d\'initialisation de la base de données:', dbInit.error);
  }
  
  createWindow();
  
  // Vérifier les mises à jour (seulement en production)
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(err => {
        devLog('Impossible de vérifier les mises à jour:', err.message);
      });
    }, 3000); // Attendre 3 secondes après le démarrage
  }
});

app.on('window-all-closed', () => {
  dbManager.closeDatabase();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  dbManager.closeDatabase();
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

    const parseTimeStringToMs = (timeString) => {
      try {
        if (!timeString) return null;
        const m = String(timeString).match(/(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
        if (!m) return null;
        const [, year, month, day, hour, min, sec] = m;
        const dt = new Date(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour),
          Number(min),
          Number(sec)
        );
        const ms = dt.getTime();
        return Number.isFinite(ms) ? ms : null;
      } catch {
        return null;
      }
    };

    for (const filePath of files) {
      try {
        const stat = await fs.stat(filePath);

        // Si le fichier est indexé et à jour, récupérer la date de session stockée en BDD
        let sessionTimeMs = null;
        try {
          const dbCheck = dbManager.isFileIndexed(filePath, stat);
          if (dbCheck && dbCheck.indexed && typeof dbManager.getFileTimeInfo === 'function') {
            const info = dbManager.getFileTimeInfo(filePath);
            if (info && info.date_time) {
              sessionTimeMs = parseInt(info.date_time) * 1000;
            } else if (info && info.time_string) {
              sessionTimeMs = parseTimeStringToMs(info.time_string);
            }
          }
        } catch (_) {}

        metas.push({
          filePath,
          mtimeMs: stat.mtimeMs,
          mtimeIso: stat.mtime.toISOString(),
          sessionTimeMs
        });
      } catch (err) {
        metas.push({ filePath, error: String(err) });
      }
    }

    // Tri: date de session (BDD) d'abord, sinon fallback mtime
    metas.sort((a, b) => {
      const aT = (a && a.sessionTimeMs) ? a.sessionTimeMs : 0;
      const bT = (b && b.sessionTimeMs) ? b.sessionTimeMs : 0;
      if (aT !== bT) return bT - aT;
      return (b.mtimeMs || 0) - (a.mtimeMs || 0);
    });
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
    // Vérifier d'abord quels fichiers sont déjà en BDD
    const cached = [];
    const toParse = [];
    
    const isDbDataCompatible = (dbData) => {
      try {
        const sessions = Array.isArray(dbData?.sessions) ? dbData.sessions : [];

        // Si la BDD ne contient aucun pilote, les stats/historique seront incomplets.
        // Forcer alors un re-parse du XML (et donc une réindexation DB).
        const totalDrivers = sessions.reduce((acc, s) => {
          const drivers = Array.isArray(s?.drivers) ? s.drivers : [];
          return acc + drivers.length;
        }, 0);
        if (totalDrivers <= 0) return false;

        const hasRace = sessions.some(s => {
          const name = String(s?.session_name || '').toLowerCase();
          const type = String(s?.session_type || '').toLowerCase();
          return type === 'race' || name.includes('race');
        });
        if (!hasRace) return true; // rien à valider côté podiums/victoires

        for (const s of sessions) {
          const name = String(s?.session_name || '').toLowerCase();
          const type = String(s?.session_type || '').toLowerCase();
          if (!(type === 'race' || name.includes('race'))) continue;
          const drivers = Array.isArray(s?.drivers) ? s.drivers : [];
          for (const d of drivers) {
            if (d && d.class_position != null) return true;
          }
        }
        return false;
      } catch {
        return false;
      }
    };

    for (const fp of filePaths) {
      try {
        const st = await fs.stat(fp);
        const dbCheck = dbManager.isFileIndexed(fp, st);
        
        if (dbCheck.indexed) {
          // Récupérer depuis la BDD
          const dbData = dbManager.getFileData(fp);
          if (dbData && isDbDataCompatible(dbData)) {
            // Convertir les données BDD au format attendu
            const parsed = convertDbDataToParsedFormat(dbData);

            // Enrichir avec la date de session de la BDD (pour tri/affichage côté renderer)
            let sessionTimeMs = null;
            try {
              const dt = dbData && dbData.metadata && dbData.metadata.date_time;
              if (dt) sessionTimeMs = parseInt(dt) * 1000;
            } catch (_) {}
            cached.push({ 
              filePath: fp, 
              parsed, 
              mtimeMs: st.mtimeMs, 
              mtimeIso: st.mtime.toISOString(),
              sessionTimeMs,
              fromDb: true 
            });
          } else {
            toParse.push({ filePath: fp, stat: st });
          }
        } else {
          toParse.push({ filePath: fp, stat: st });
        }
      } catch (err) {
        toParse.push({ filePath: fp, stat: null });
      }
    }
    
    let parsedResults = [];
    if (toParse.length > 0) {
      const results = await parseFilesWithWorkerPool(toParse.map(t => t.filePath));
      
      // Indexer dans la BDD et alimenter le cache JSON (fallback)
      for (const r of results) {
        if (r && r.filePath && r.parsed && typeof r.mtimeMs === 'number') {
          try {
            const st = await fs.stat(r.filePath);
            
            // Indexer dans la BDD
            dbManager.indexFile(r.filePath, st, r.parsed);
            
            // Alimenter aussi le cache JSON pour compatibilité
            await setCachedParsed(r.filePath, r.mtimeMs, st.size, r.parsed);
          } catch (_) { /* ignore */ }
        }
      }
      parsedResults = results;
    }

    // Enrichir les résultats parsés avec une date de session (si disponible)
    try {
      parsedResults = (parsedResults || []).map(r => {
        if (!r || !r.parsed) return r;
        const rr = r.parsed?.rFactorXML?.RaceResults || r.parsed?.RaceResults;
        let sessionTimeMs = null;
        try {
          if (rr && rr.DateTime) {
            sessionTimeMs = parseInt(rr.DateTime) * 1000;
          }
        } catch (_) {}
        return { ...r, sessionTimeMs };
      });
    } catch (_) {}
    
    const all = [...cached, ...parsedResults];
    const byPath = new Map(all.map(x => [x.filePath, x]));
    const ordered = filePaths.map(fp => byPath.get(fp)).filter(Boolean);
    
    devLog(`[Parse] ${cached.length} depuis BDD, ${parsedResults.length} parsés`);
    
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
            
            // Indexer dans la BDD
            dbManager.indexFile(fp, stat, parsed);
            
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

// Fonction helper pour convertir les données BDD au format parsé attendu
function convertDbDataToParsedFormat(dbData) {
  if (!dbData || !dbData.metadata) return null;
  
  const raceResults = {
    GameVersion: dbData.metadata.game_version,
    TrackVenue: dbData.metadata.track_venue,
    TrackCourse: dbData.metadata.track_course,
    TrackEvent: dbData.metadata.track_event,
    TrackLength: dbData.metadata.track_length,
    DateTime: dbData.metadata.date_time,
    TimeString: dbData.metadata.time_string
  };
  
  // Reconstruire les sessions
  if (dbData.sessions && Array.isArray(dbData.sessions)) {
    for (const session of dbData.sessions) {
      const sessionData = {
        DateTime: session.date_time,
        TimeString: session.time_string,
        Laps: session.laps,
        Minutes: session.minutes
      };
      
      // Ajouter les pilotes
      if (session.drivers && Array.isArray(session.drivers)) {
        sessionData.Driver = session.drivers.map(driver => {
          const driverData = {
            Name: driver.name,
            isPlayer: driver.is_player,
            Position: driver.position,
            ClassPosition: driver.class_position,
            FinishStatus: driver.finish_status,
            Laps: driver.laps,
            BestLapTime: driver.best_lap_time,
            BestLapNum: driver.best_lap_num,
            VehType: driver.vehicle_name,
            VehName: driver.veh_name || null,
            CarClass: driver.vehicle_class,
            CarNumber: driver.vehicle_number,
            TeamName: driver.team_name
          };

          // Ajouter les swaps (si disponibles)
          try {
            if (driver.swaps_json) {
              const swaps = JSON.parse(driver.swaps_json);
              if (Array.isArray(swaps) && swaps.length) {
                driverData.Swap = swaps;
              }
            }
          } catch (_) {}
          
          // Ajouter les tours
          if (driver.laps && Array.isArray(driver.laps)) {
            driverData.Lap = driver.laps.map(lap => ({
              '@_num': lap.lap_num,
              '#text': lap.lap_time,
              '@_s1': lap.sector1,
              '@_s2': lap.sector2,
              '@_s3': lap.sector3,
              '@_fuel': lap.fuel_used
            }));
          }
          
          return driverData;
        });
      }
      
      // Ajouter le Stream
      if (session.stream) {
        sessionData.Stream = session.stream;
      }
      
      raceResults[session.session_name] = sessionData;
    }
  }
  
  return { rFactorXML: { RaceResults: raceResults } };
}

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

  // ===========================
  // API Base de données
  // ===========================
  ipcMain.handle('db-get-stats', async () => {
    try {
      const stats = dbManager.getDatabaseStats();
      return { ok: true, stats };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  ipcMain.handle('db-get-all-files', async () => {
    try {
      const files = dbManager.getAllFileMetadata();
      return { ok: true, files };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  ipcMain.handle('db-cleanup', async () => {
    try {
      const result = dbManager.cleanupMissingFiles();
      return result;
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  ipcMain.handle('db-get-file-data', async (_event, filePath) => {
    try {
      const data = dbManager.getFileData(filePath);
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  ipcMain.handle('db-reset', async () => {
    try {
      const result = dbManager.resetDatabase();
      return result;
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });
  // Handlers pour les mises à jour
  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('check-for-updates', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { ok: true, updateInfo: result };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('download-update', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall();
  });