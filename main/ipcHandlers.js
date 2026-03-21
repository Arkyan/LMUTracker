const { ipcMain, dialog, app } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { XMLParser } = require('fast-xml-parser');
const dbManager = require('../modules/databaseManager');
const { autoUpdater } = require('./updaterSetup');
const { parseFilesWithWorkerPool } = require('./workerPool');
const devLog = require('./devLog');

// ── Indexation en arrière-plan ────────────────────────────────────────────
// L'indexation SQLite est déportée hors du chemin critique IPC pour éviter
// de bloquer le main process (et donc l'UI) pendant les scans.

const _bgQueue = [];
let _bgRunning = false;

function scheduleIndex(filePath, stats, parsed) {
  _bgQueue.push({ filePath, stats, parsed });
  if (!_bgRunning) {
    _bgRunning = true;
    setImmediate(_drainBgQueue);
  }
}

function _drainBgQueue() {
  if (!_bgQueue.length) {
    _bgRunning = false;
    return;
  }
  // Traiter un lot de 8 fichiers en une seule transaction SQLite
  const batch = _bgQueue.splice(0, 8);
  try { dbManager.batchIndexFiles(batch); } catch (_) {}
  setImmediate(_drainBgQueue);
}

const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
};

// ── Helpers ────────────────────────────────────────────────────────────────

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

function parseTimeStringToMs(timeString) {
  try {
    if (!timeString) return null;
    const m = String(timeString).match(/(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    const [, year, month, day, hour, min, sec] = m;
    const ms = new Date(
      Number(year), Number(month) - 1, Number(day),
      Number(hour), Number(min), Number(sec)
    ).getTime();
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

function isDbDataCompatible(dbData) {
  try {
    const sessions = Array.isArray(dbData?.sessions) ? dbData.sessions : [];
    // Données compatibles si au moins une session est indexée (schéma v4).
    // La migration v3→v4 vide la table sessions, donc sessions.length === 0
    // indique une indexation incomplète et force un re-parse.
    // La présence ou non de drivers est indépendante : un fichier sans pilote
    // correspondant est quand même correctement indexé.
    return sessions.length > 0;
  } catch {
    return false;
  }
}

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

  for (const session of (dbData.sessions || [])) {
    const sessionData = {
      DateTime: session.date_time,
      TimeString: session.time_string,
      Laps: session.laps,
      Minutes: session.minutes
    };

    if (Array.isArray(session.drivers)) {
      sessionData.Driver = session.drivers.map(driver => {
        const driverData = {
          Name: driver.name,
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

        try {
          if (driver.swaps_json) {
            const swaps = JSON.parse(driver.swaps_json);
            if (Array.isArray(swaps) && swaps.length) driverData.Swap = swaps;
          }
        } catch {}

        if (Array.isArray(driver.laps)) {
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

    if (session.most_laps) sessionData.MostLapsCompleted = session.most_laps;
    raceResults[session.session_name] = sessionData;
  }

  return { rFactorXML: { RaceResults: raceResults } };
}

async function parseFolderFiles(folderPath) {
  const parser = new XMLParser(parserOptions);
  const files = await getAllXmlFiles(folderPath);
  const parsedFiles = [];

  for (const filePath of files) {
    try {
      const [content, stat] = await Promise.all([fs.readFile(filePath, 'utf-8'), fs.stat(filePath)]);
      parsedFiles.push({ filePath, parsed: parser.parse(content), mtimeMs: stat.mtimeMs, mtimeIso: stat.mtime.toISOString() });
    } catch (err) {
      try {
        const stat = await fs.stat(filePath);
        parsedFiles.push({ filePath, error: String(err), mtimeMs: stat.mtimeMs, mtimeIso: stat.mtime.toISOString() });
      } catch {
        parsedFiles.push({ filePath, error: String(err) });
      }
    }
  }
  return parsedFiles;
}

// Fallback: parsing séquentiel côté main thread (si les workers échouent)
async function parseFilesMainThread(filePaths) {
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
        const [content, stat] = await Promise.all([fs.readFile(fp, 'utf-8'), fs.stat(fp)]);
        const parsed = parser.parse(content);
        scheduleIndex(fp, stat, parsed);
        out[i] = { filePath: fp, parsed, mtimeMs: stat.mtimeMs, mtimeIso: stat.mtime.toISOString(), size: stat.size };
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
  return out;
}

// ── IPC Handlers ───────────────────────────────────────────────────────────

function registerIpcHandlers() {

  // Ouvrir un fichier unique
  ipcMain.handle('open-lmu-file', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choisir un fichier de résultats LMU',
      properties: ['openFile'],
      filters: [{ name: 'Fichiers LMU', extensions: ['xml'] }]
    });
    if (result.canceled) return { canceled: true };
    const filePath = result.filePaths[0];
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = new XMLParser(parserOptions).parse(content);
    return { canceled: false, filePath, parsed };
  });

  // Ouvrir un dossier et parser tous les .xml
  ipcMain.handle('open-lmu-folder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choisir un dossier contenant des fichiers LMU (.xml)',
      properties: ['openDirectory']
    });
    if (result.canceled) return { canceled: true };
    const folderPath = result.filePaths[0];
    const files = await parseFolderFiles(folderPath);
    return { canceled: false, folderPath, count: files.length, files };
  });

  // Sélectionner un dossier (sans parser)
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Sélectionner un dossier de résultats',
      properties: ['openDirectory']
    });
    if (result.canceled) return { canceled: true };
    return { canceled: false, folderPath: result.filePaths[0] };
  });

  // Scanner un dossier fourni
  ipcMain.handle('scan-lmu-folder', async (_event, folderPath) => {
    if (!folderPath) return { canceled: true, error: 'Aucun dossier fourni' };
    try {
      const files = await parseFolderFiles(folderPath);
      return { canceled: false, folderPath, count: files.length, files };
    } catch (error) {
      return { canceled: true, error: String(error) };
    }
  });

  // Lister les fichiers (métadonnées uniquement), triés par date de session
  ipcMain.handle('list-lmu-files', async (_event, folderPath) => {
    if (!folderPath) return { canceled: true, error: 'Aucun dossier fourni' };
    try {
      const files = await getAllXmlFiles(folderPath);

      // Une seule requête DB pour tous les fichiers indexés
      const dbInfoMap = typeof dbManager.getAllFileTimeInfoMap === 'function'
        ? dbManager.getAllFileTimeInfoMap()
        : new Map();

      // fs.stat en parallèle (par lots de 64 pour ne pas saturer l'OS)
      const STAT_CONCURRENCY = 64;
      const metas = new Array(files.length);
      let idx = 0;
      await Promise.all(Array.from({ length: Math.min(STAT_CONCURRENCY, files.length) }, async () => {
        for (;;) {
          const i = idx++;
          if (i >= files.length) break;
          const filePath = files[i];
          try {
            const stat = await fs.stat(filePath);
            let sessionTimeMs = null;
            const dbInfo = dbInfoMap.get(filePath);
            if (dbInfo) {
              const isFresh = Number(dbInfo.file_size) === stat.size && Number(dbInfo.file_mtime) === Math.floor(stat.mtimeMs);
              if (isFresh) {
                if (dbInfo.date_time) sessionTimeMs = parseInt(dbInfo.date_time) * 1000;
                else if (dbInfo.time_string) sessionTimeMs = parseTimeStringToMs(dbInfo.time_string);
              }
            }
            metas[i] = { filePath, mtimeMs: stat.mtimeMs, mtimeIso: stat.mtime.toISOString(), sessionTimeMs };
          } catch (err) {
            metas[i] = { filePath, error: String(err) };
          }
        }
      }));

      const validMetas = metas.filter(Boolean);
      validMetas.sort((a, b) => {
        const aT = a?.sessionTimeMs || 0;
        const bT = b?.sessionTimeMs || 0;
        if (aT !== bT) return bT - aT;
        return (b.mtimeMs || 0) - (a.mtimeMs || 0);
      });

      return { canceled: false, folderPath, count: validMetas.length, filesMeta: validMetas };
    } catch (error) {
      return { canceled: true, error: String(error) };
    }
  });

  // Parser un lot de fichiers par chemins
  ipcMain.handle('parse-lmu-files', async (_event, filePaths) => {
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      return { canceled: true, error: 'Aucun fichier fourni' };
    }
    try {
      const cached = [];
      const toParse = [];

      // Une seule requête DB pour tous les fichiers du lot
      const dbInfoMap = typeof dbManager.getAllFileTimeInfoMap === 'function'
        ? dbManager.getAllFileTimeInfoMap()
        : new Map();

      // fs.stat en parallèle sur le lot
      const statResults = await Promise.all(filePaths.map(fp =>
        fs.stat(fp).then(st => ({ fp, st })).catch(() => ({ fp, st: null }))
      ));

      for (const { fp, st } of statResults) {
        if (!st) { toParse.push(fp); continue; }
        try {
          const dbInfo = dbInfoMap.get(fp);
          const isFresh = dbInfo &&
            Number(dbInfo.file_size) === st.size &&
            Number(dbInfo.file_mtime) === Math.floor(st.mtimeMs);
          if (isFresh) {
            const dbData = dbManager.getFileData(fp);
            if (dbData && isDbDataCompatible(dbData)) {
              const parsed = convertDbDataToParsedFormat(dbData);
              let sessionTimeMs = null;
              try {
                const dt = dbData?.metadata?.date_time;
                if (dt) sessionTimeMs = parseInt(dt) * 1000;
              } catch {}
              cached.push({ filePath: fp, parsed, mtimeMs: st.mtimeMs, mtimeIso: st.mtime.toISOString(), sessionTimeMs, fromDb: true });
            } else {
              toParse.push(fp);
            }
          } else {
            toParse.push(fp);
          }
        } catch {
          toParse.push(fp);
        }
      }

      let parsedResults = [];
      if (toParse.length > 0) {
        parsedResults = await parseFilesWithWorkerPool(toParse);

        // Indexation en arrière-plan : ne bloque PAS le main process ni la réponse IPC.
        // Le worker inclut déjà mtimeMs et size — pas besoin de fs.stat supplémentaire.
        for (const r of parsedResults) {
          if (r?.filePath && r?.parsed && typeof r.mtimeMs === 'number') {
            scheduleIndex(r.filePath, { size: r.size ?? 0, mtimeMs: r.mtimeMs }, r.parsed);
          }
        }

        // Enrichir avec la date de session
        parsedResults = parsedResults.map(r => {
          if (!r?.parsed) return r;
          const rr = r.parsed?.rFactorXML?.RaceResults || r.parsed?.RaceResults;
          let sessionTimeMs = null;
          try { if (rr?.DateTime) sessionTimeMs = parseInt(rr.DateTime) * 1000; } catch {}
          return { ...r, sessionTimeMs };
        });
      }

      const all = [...cached, ...parsedResults];
      const byPath = new Map(all.map(x => [x.filePath, x]));
      const ordered = filePaths.map(fp => byPath.get(fp)).filter(Boolean);

      devLog(`[Parse] ${cached.length} depuis BDD, ${parsedResults.length} parsés`);
      return { canceled: false, count: ordered.length, files: ordered };
    } catch (error) {
      // Fallback main thread
      try {
        const out = await parseFilesMainThread(filePaths);
        return { canceled: false, count: out.length, files: out };
      } catch (err2) {
        return { canceled: true, error: String(error || err2) };
      }
    }
  });

  // Ouvrir un fichier par chemin (pour la page session)
  ipcMain.handle('open-lmu-file-by-path', async (_event, filePath) => {
    if (!filePath) return { canceled: true, error: 'Aucun chemin fourni' };
    try {
      const [content, stat] = await Promise.all([fs.readFile(filePath, 'utf-8'), fs.stat(filePath)]);
      const parsed = new XMLParser(parserOptions).parse(content);
      return { canceled: false, filePath, parsed, mtimeMs: stat.mtimeMs, mtimeIso: stat.mtime.toISOString() };
    } catch (error) {
      return { canceled: true, error: String(error), filePath };
    }
  });

  // Lire un fragment de vue HTML
  ipcMain.handle('read-view', async (_event, viewName) => {
    const viewMap = {
      profile: 'profile.html',
      history: 'history.html',
      vehicles: 'vehicles.html',
      'vehicle-detail': 'vehicle-detail.html',
      tracks: 'tracks.html',
      'track-detail': 'track-detail.html',
      settings: 'settings.html'
    };
    const fileName = viewMap[String(viewName || '')];
    if (!fileName) return { ok: false, error: 'Vue inconnue' };
    try {
      const viewPath = path.join(__dirname, '..', 'views', fileName);
      const content = await fs.readFile(viewPath, 'utf-8');
      return { ok: true, viewName: String(viewName), content };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  // ── Base de données ──

  ipcMain.handle('db-get-stats', async () => {
    try {
      return { ok: true, stats: dbManager.getDatabaseStats() };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  ipcMain.handle('db-get-all-files', async () => {
    try {
      return { ok: true, files: dbManager.getAllFileMetadata() };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  ipcMain.handle('db-cleanup', async () => {
    try {
      return dbManager.cleanupMissingFiles();
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  ipcMain.handle('db-get-file-data', async (_event, filePath) => {
    try {
      return { ok: true, data: dbManager.getFileData(filePath) };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  ipcMain.handle('db-reset', async () => {
    try {
      return dbManager.resetDatabase();
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  // ── Mises à jour ──

  ipcMain.handle('get-app-version', () => app.getVersion());

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
}

module.exports = { registerIpcHandlers };
