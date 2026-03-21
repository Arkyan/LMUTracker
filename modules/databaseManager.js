/**
 * Module de gestion de la base de données SQLite pour LMU Tracker
 * Stocke uniquement les données du pilote configuré (positions, tours).
 * Les données complètes d'une session (tous les pilotes) sont lues depuis le XML à la demande.
 */

(function() {
  const Database = require('better-sqlite3');
  const path = require('path');
  const fs = require('fs');
  const { app } = require('electron');

  let db = null;
  const DB_VERSION = 4;

  function arrayify(val) {
    if (val == null) return [];
    return Array.isArray(val) ? val : [val];
  }

  function normalizeName(name) {
    return String(name || '').toLowerCase().trim();
  }

  function getConfiguredDriverNames(configuredDriverName) {
    if (!configuredDriverName) return [];
    return String(configuredDriverName)
      .split(',')
      .map(normalizeName)
      .filter(Boolean);
  }

  // Extraire les co-pilotes depuis Swap + DriverChange du Stream
  function extractDriverChanges(sessionData) {
    const byVehicle = {};
    const ensure = (veh) => {
      if (!veh) return null;
      if (!byVehicle[veh]) byVehicle[veh] = new Set();
      return byVehicle[veh];
    };

    try {
      const changes = arrayify(sessionData?.Stream?.DriverChange);
      for (const change of changes) {
        const text = (change && typeof change === 'object') ? (change['#text'] || '') : change;
        if (typeof text !== 'string') continue;
        const veh = (text.match(/Vehicle="([^"]+)"/) || [])[1];
        const old = (text.match(/Old="([^"]+)"/) || [])[1];
        const nw  = (text.match(/New="([^"]+)"/) || [])[1];
        if (!veh || !old || !nw) continue;
        const set = ensure(veh);
        if (set) { set.add(old); set.add(nw); }
      }
    } catch (_) {}

    try {
      for (const driver of arrayify(sessionData?.Driver)) {
        if (!driver || typeof driver !== 'object') continue;
        const veh = driver.VehName;
        if (!veh) continue;
        const swaps = arrayify(driver.Swap);
        if (!swaps.length) continue;
        const set = ensure(veh);
        if (!set) continue;
        if (driver.Name) set.add(driver.Name);
        for (const swap of swaps) {
          const text = (swap && typeof swap === 'object') ? (swap['#text'] || '') : swap;
          if (typeof text === 'string' && text.trim()) set.add(text);
        }
      }
    } catch (_) {}

    const out = {};
    for (const [veh, set] of Object.entries(byVehicle)) out[veh] = Array.from(set);
    return out;
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  function initDatabase() {
    try {
      const dbPath = path.join(app.getPath('userData'), 'lmutracker.db');
      db = new Database(dbPath);
      db.pragma('journal_mode = WAL');
      createTables();
      migrateDatabase();
      return { ok: true };
    } catch (error) {
      console.error('[DB] Erreur init:', error);
      return { ok: false, error: error.message };
    }
  }

  function createTables() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS file_metadata (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path   TEXT UNIQUE NOT NULL,
        file_hash   TEXT NOT NULL,
        file_size   INTEGER NOT NULL,
        file_mtime  INTEGER NOT NULL,
        indexed_at  INTEGER NOT NULL,
        game_version TEXT,
        track_venue  TEXT,
        track_course TEXT,
        track_event  TEXT,
        track_length REAL,
        date_time    INTEGER,
        time_string  TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_file_path   ON file_metadata(file_path);
      CREATE INDEX IF NOT EXISTS idx_file_hash   ON file_metadata(file_hash);
      CREATE INDEX IF NOT EXISTS idx_date_time   ON file_metadata(date_time);
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id      INTEGER NOT NULL,
        session_name TEXT NOT NULL,
        session_type TEXT NOT NULL,
        date_time    INTEGER,
        time_string  TEXT,
        laps         INTEGER,
        minutes      INTEGER,
        most_laps    INTEGER,
        FOREIGN KEY (file_id) REFERENCES file_metadata(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_session_file_id ON sessions(file_id);
      CREATE INDEX IF NOT EXISTS idx_session_type    ON sessions(session_type);
    `);

    // Un seul driver par session : le pilote configuré (ou un de ses co-pilotes)
    db.exec(`
      CREATE TABLE IF NOT EXISTS drivers (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id    INTEGER NOT NULL,
        name          TEXT NOT NULL,
        position      INTEGER,
        class_position INTEGER,
        finish_status  TEXT,
        laps           INTEGER,
        best_lap_time  REAL,
        best_lap_num   INTEGER,
        vehicle_name   TEXT,
        veh_name       TEXT,
        vehicle_class  TEXT,
        vehicle_number TEXT,
        team_name      TEXT,
        swaps_json     TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_driver_session_id   ON drivers(session_id);
      CREATE INDEX IF NOT EXISTS idx_driver_vehicle_class ON drivers(vehicle_class);
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS laps (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        driver_id INTEGER NOT NULL,
        lap_num   INTEGER NOT NULL,
        lap_time  REAL,
        sector1   REAL,
        sector2   REAL,
        sector3   REAL,
        fuel_used REAL,
        FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_lap_driver_id ON laps(driver_id);
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS db_version (version INTEGER PRIMARY KEY);
    `);

    if (!db.prepare('SELECT version FROM db_version LIMIT 1').get()) {
      db.prepare('INSERT INTO db_version (version) VALUES (?)').run(DB_VERSION);
    }
  }

  function migrateDatabase() {
    if (!db) return;
    try {
      const row = db.prepare('SELECT version FROM db_version LIMIT 1').get();
      const current = row?.version ?? 0;

      // Supprimer stream_data (v3 → v4)
      db.exec('DROP TABLE IF EXISTS stream_data');

      // Ajouter most_laps si absent (schéma v4)
      const sessionCols = db.prepare('PRAGMA table_info(sessions)').all().map(r => r.name);
      if (!sessionCols.includes('most_laps')) {
        db.exec('ALTER TABLE sessions ADD COLUMN most_laps INTEGER');
      }

      // Supprimer is_player si présent (colonne supprimée en v4)
      // SQLite ne supporte pas DROP COLUMN facilement sur vieilles versions, on l'ignore.

      if (current < 4) {
        // Vider les données de sessions/drivers/laps pour forcer une re-indexation propre.
        // file_metadata est préservé pour conserver le tri par date de session.
        db.exec('DELETE FROM laps');
        db.exec('DELETE FROM drivers');
        db.exec('DELETE FROM sessions');
        db.prepare('UPDATE db_version SET version = ?').run(DB_VERSION);
        console.log(`[DB] Migration v${current} → v${DB_VERSION} : sessions nettoyées, re-indexation en cours`);
      }
    } catch (error) {
      console.error('[DB] Erreur migration:', error);
    }
  }

  // ── Hachage / vérification ────────────────────────────────────────────────

  function calculateFileHashFromParts(filePath, size, mtimeKey) {
    const crypto = require('crypto');
    const h = crypto.createHash('md5');
    h.update(`${filePath}:${size}:${mtimeKey}`);
    return h.digest('hex');
  }

  function isFileIndexed(filePath, stats) {
    if (!db) return { indexed: false };
    try {
      const size     = stats?.size != null ? stats.size : null;
      const mtimeKey = stats?.mtimeMs != null ? Math.floor(stats.mtimeMs) : null;

      const row = db.prepare('SELECT id, file_hash, file_size, file_mtime FROM file_metadata WHERE file_path = ?').get(filePath);
      if (!row) return { indexed: false };

      if (size == null || mtimeKey == null) {
        // Fallback legacy hash
        try {
          const crypto = require('crypto');
          const h = crypto.createHash('md5');
          h.update(`${filePath}:${stats?.size}:${stats?.mtimeMs}`);
          const legacyHash = h.digest('hex');
          if (row.file_hash === legacyHash) return { indexed: true, fileId: row.id };
        } catch {}
        return { indexed: false };
      }

      if (Number(row.file_size) !== Number(size) || Number(row.file_mtime) !== Number(mtimeKey)) {
        return { indexed: false };
      }

      // Normaliser le hash si besoin
      const expected = calculateFileHashFromParts(filePath, size, mtimeKey);
      if (row.file_hash !== expected) {
        try { db.prepare('UPDATE file_metadata SET file_hash = ? WHERE id = ?').run(expected, row.id); } catch (_) {}
      }

      return { indexed: true, fileId: row.id };
    } catch (error) {
      console.error('[DB] isFileIndexed:', error);
      return { indexed: false };
    }
  }

  // ── Indexation ────────────────────────────────────────────────────────────

  function indexFile(filePath, stats, parsedData) {
    if (!db) return { ok: false, error: 'Base de données non initialisée' };
    try {
      const raceResults = parsedData?.rFactorXML?.RaceResults || parsedData?.RaceResults;
      if (!raceResults) return { ok: false, error: 'Données RaceResults non trouvées' };

      const fileHash = calculateFileHashFromParts(
        filePath,
        stats.size,
        Math.floor(stats.mtimeMs)
      );

      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO file_metadata (
            file_path, file_hash, file_size, file_mtime, indexed_at,
            game_version, track_venue, track_course, track_event, track_length,
            date_time, time_string
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(file_path) DO UPDATE SET
            file_hash    = excluded.file_hash,
            file_size    = excluded.file_size,
            file_mtime   = excluded.file_mtime,
            indexed_at   = excluded.indexed_at,
            game_version = excluded.game_version,
            track_venue  = excluded.track_venue,
            track_course = excluded.track_course,
            track_event  = excluded.track_event,
            track_length = excluded.track_length,
            date_time    = excluded.date_time,
            time_string  = excluded.time_string
        `).run(
          filePath, fileHash,
          stats.size, Math.floor(stats.mtimeMs), Date.now(),
          raceResults.GameVersion  || null,
          raceResults.TrackVenue   || null,
          raceResults.TrackCourse  || null,
          raceResults.TrackEvent   || null,
          raceResults.TrackLength  ? parseFloat(raceResults.TrackLength) : null,
          raceResults.DateTime     ? parseInt(raceResults.DateTime) : null,
          raceResults.TimeString   || null
        );

        const fileRow = db.prepare('SELECT id FROM file_metadata WHERE file_path = ?').get(filePath);
        if (!fileRow?.id) throw new Error('Impossible de récupérer file_id');
        const fileId = fileRow.id;

        db.prepare('DELETE FROM sessions WHERE file_id = ?').run(fileId);
        indexSessions(fileId, raceResults);
        return fileId;
      });

      const fileId = tx();
      return { ok: true, fileId };
    } catch (error) {
      console.error('[DB] indexFile:', error);
      return { ok: false, error: error.message };
    }
  }

  function indexSessions(fileId, raceResults) {
    const entries = Object.entries(raceResults || {}).filter(([k, v]) => {
      if (!k || !v || typeof v !== 'object') return false;
      const kk = k.toLowerCase();
      if (['stream','gameversion','trackvenue','trackcourse','trackevent','tracklength','datetime','timestring'].includes(kk)) return false;
      if (/(race|qual|practice|practise|warm)/i.test(k)) return true;
      if (/^[qp]\d+$/i.test(k)) return true;
      if ('Driver' in v) return true;
      return false;
    });

    const configuredDriver = getConfiguredDriverName();
    const driverNames = getConfiguredDriverNames(configuredDriver);

    for (const [sessionKey, sessionData] of entries) {
      try {
        const sessionType = getSessionType(sessionKey);
        const mostLaps = sessionData.MostLapsCompleted ? parseInt(sessionData.MostLapsCompleted) : null;

        const sessionInfo = db.prepare(`
          INSERT INTO sessions (file_id, session_name, session_type, date_time, time_string, laps, minutes, most_laps)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          fileId, sessionKey, sessionType,
          sessionData.DateTime ? parseInt(sessionData.DateTime) : null,
          sessionData.TimeString || null,
          sessionData.Laps    ? parseInt(sessionData.Laps)    : null,
          sessionData.Minutes ? parseInt(sessionData.Minutes) : null,
          mostLaps
        );

        const sessionId = sessionInfo.lastInsertRowid;

        if (sessionData.Driver && driverNames.length > 0) {
          const driverChanges = extractDriverChanges(sessionData);
          indexPlayerDriver(sessionId, sessionData.Driver, driverNames, driverChanges);
        }
      } catch (error) {
        console.error(`[DB] indexSessions ${sessionKey}:`, error);
      }
    }
  }

  // Indexe uniquement le pilote configuré (et ses co-pilotes via swap/stream)
  function indexPlayerDriver(sessionId, driversData, driverNames, driverChangesByVehicle) {
    const drivers = arrayify(driversData);

    const matchesConfigured = (driver) => {
      try {
        const vehName = driver?.VehName || '';
        const fromStream = driverChangesByVehicle[vehName];
        const allNames = (fromStream && fromStream.length) ? fromStream : [driver?.Name].filter(Boolean);
        return allNames.map(normalizeName).some(n => driverNames.includes(n));
      } catch (_) {
        return false;
      }
    };

    for (const driver of drivers) {
      if (!driver || typeof driver !== 'object') continue;
      if (!matchesConfigured(driver)) continue;

      try {
        const swaps = (() => {
          try {
            const list = arrayify(driver.Swap)
              .map(s => (s && typeof s === 'object') ? (s['#text'] || '') : s)
              .filter(s => typeof s === 'string' && s.trim());
            return list.length ? JSON.stringify(list) : null;
          } catch (_) { return null; }
        })();

        const driverInfo = db.prepare(`
          INSERT INTO drivers (
            session_id, name, position, class_position, finish_status, laps,
            best_lap_time, best_lap_num, vehicle_name, veh_name, vehicle_class,
            vehicle_number, team_name, swaps_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          sessionId,
          driver.Name        || null,
          driver.Position    ? parseInt(driver.Position)    : null,
          driver.ClassPosition ? parseInt(driver.ClassPosition) : null,
          driver.FinishStatus || null,
          driver.Laps        ? parseInt(driver.Laps)        : null,
          driver.BestLapTime ? parseFloat(driver.BestLapTime) : null,
          driver.BestLapNum  ? parseInt(driver.BestLapNum)  : null,
          driver.VehType || driver.CarType || null,
          driver.VehName     || null,
          driver.CarClass    || null,
          driver.CarNumber   || null,
          driver.TeamName    || null,
          swaps
        );

        if (driver.Lap) {
          indexLaps(driverInfo.lastInsertRowid, driver.Lap);
        }
      } catch (error) {
        console.error('[DB] indexPlayerDriver:', error);
      }
    }
  }

  function indexLaps(driverId, lapsData) {
    for (const lap of arrayify(lapsData)) {
      if (!lap || typeof lap !== 'object') continue;

      const lapNum = lap.num !== undefined ? parseInt(lap.num)
        : lap['@_num'] !== undefined ? parseInt(lap['@_num']) : null;
      if (lapNum === null || isNaN(lapNum)) continue;

      try {
        const lapTime = lap.timeSec  !== undefined ? parseFloat(lap.timeSec)
          : lap['#text'] !== undefined ? parseFloat(lap['#text'])
          : lap.et !== undefined       ? parseFloat(lap.et) : null;

        const s1 = lap.s1 !== undefined ? parseFloat(lap.s1) : lap['@_s1'] !== undefined ? parseFloat(lap['@_s1']) : null;
        const s2 = lap.s2 !== undefined ? parseFloat(lap.s2) : lap['@_s2'] !== undefined ? parseFloat(lap['@_s2']) : null;
        const s3 = lap.s3 !== undefined ? parseFloat(lap.s3) : lap['@_s3'] !== undefined ? parseFloat(lap['@_s3']) : null;
        const fuel = lap.fuel !== undefined ? parseFloat(lap.fuel) : lap['@_fuel'] !== undefined ? parseFloat(lap['@_fuel']) : null;

        db.prepare(`
          INSERT INTO laps (driver_id, lap_num, lap_time, sector1, sector2, sector3, fuel_used)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(driverId, lapNum, lapTime, s1, s2, s3, fuel);
      } catch (error) {
        console.error('[DB] indexLaps:', error);
      }
    }
  }

  // ── Lecture ───────────────────────────────────────────────────────────────

  function getConfiguredDriverName() {
    try {
      const settingsPath = path.join(app.getPath('userData'), 'settings.json');
      if (fs.existsSync(settingsPath)) {
        return JSON.parse(fs.readFileSync(settingsPath, 'utf8')).driverName || null;
      }
    } catch (e) {
      console.warn('[DB] Lecture settings:', e.message);
    }
    return null;
  }

  function getSessionType(key) {
    const k = key.toLowerCase();
    if (k.includes('race')) return 'race';
    if (k.includes('qual') || /^q\d+$/.test(k)) return 'qual';
    if (k.includes('practice') || k.includes('practise') || /^p\d+$/.test(k)) return 'practice';
    if (k.includes('warm')) return 'warmup';
    return 'unknown';
  }

  function getFileData(filePath) {
    if (!db) return null;
    try {
      const fileRow = db.prepare('SELECT * FROM file_metadata WHERE file_path = ?').get(filePath);
      if (!fileRow) return null;

      const sessions = db.prepare('SELECT * FROM sessions WHERE file_id = ?').all(fileRow.id);
      const result = { metadata: fileRow, sessions: [] };

      for (const session of sessions) {
        const drivers = db.prepare('SELECT * FROM drivers WHERE session_id = ?').all(session.id);
        const sessionData = { ...session, drivers: [] };

        for (const driver of drivers) {
          const laps = db.prepare('SELECT * FROM laps WHERE driver_id = ?').all(driver.id);
          sessionData.drivers.push({ ...driver, laps });
        }

        result.sessions.push(sessionData);
      }

      return result;
    } catch (error) {
      console.error('[DB] getFileData:', error);
      return null;
    }
  }

  function getAllFileMetadata() {
    if (!db) return [];
    try {
      return db.prepare('SELECT * FROM file_metadata ORDER BY date_time DESC').all();
    } catch (error) {
      console.error('[DB] getAllFileMetadata:', error);
      return [];
    }
  }

  function getFileTimeInfo(filePath) {
    if (!db) return null;
    try {
      return db.prepare('SELECT date_time, time_string FROM file_metadata WHERE file_path = ?').get(filePath);
    } catch (error) {
      console.error('[DB] getFileTimeInfo:', error);
      return null;
    }
  }

  // Retourne un Map { filePath → { date_time, time_string, file_size, file_mtime } } pour tous les fichiers indexés
  function getAllFileTimeInfoMap() {
    if (!db) return new Map();
    try {
      const rows = db.prepare('SELECT file_path, date_time, time_string, file_size, file_mtime FROM file_metadata').all();
      return new Map(rows.map(r => [r.file_path, r]));
    } catch (error) {
      console.error('[DB] getAllFileTimeInfoMap:', error);
      return new Map();
    }
  }

  // ── Maintenance ───────────────────────────────────────────────────────────

  function cleanupMissingFiles() {
    if (!db) return { ok: false, error: 'Base de données non initialisée' };
    try {
      const allFiles = db.prepare('SELECT id, file_path FROM file_metadata').all();
      let deleted = 0;
      for (const file of allFiles) {
        if (!fs.existsSync(file.file_path)) {
          db.prepare('DELETE FROM file_metadata WHERE id = ?').run(file.id);
          deleted++;
        }
      }
      return { ok: true, deleted };
    } catch (error) {
      console.error('[DB] cleanupMissingFiles:', error);
      return { ok: false, error: error.message };
    }
  }

  function closeDatabase() {
    if (db) {
      db.close();
      db = null;
    }
  }

  function getDatabaseStats() {
    if (!db) return null;
    try {
      const stats = {
        files:    db.prepare('SELECT COUNT(*) as c FROM file_metadata').get().c,
        sessions: db.prepare('SELECT COUNT(*) as c FROM sessions').get().c,
        drivers:  db.prepare('SELECT COUNT(*) as c FROM drivers').get().c,
        laps:     db.prepare('SELECT COUNT(*) as c FROM laps').get().c,
        dbSize:   0
      };
      const dbPath = path.join(app.getPath('userData'), 'lmutracker.db');
      if (fs.existsSync(dbPath)) stats.dbSize = fs.statSync(dbPath).size;
      return stats;
    } catch (error) {
      console.error('[DB] getDatabaseStats:', error);
      return null;
    }
  }

  // Indexer plusieurs fichiers en une seule transaction (beaucoup plus rapide)
  function batchIndexFiles(items) {
    if (!db || !items?.length) return;
    try {
      db.transaction(() => {
        for (const { filePath, stats, parsed } of items) {
          try { _indexFileSingle(filePath, stats, parsed); } catch (_) {}
        }
      })();
    } catch (err) {
      console.error('[DB] batchIndexFiles:', err);
    }
  }

  // Version interne de indexFile sans transaction propre (pour utilisation dans batchIndexFiles)
  function _indexFileSingle(filePath, stats, parsedData) {
    const raceResults = parsedData?.rFactorXML?.RaceResults || parsedData?.RaceResults;
    if (!raceResults) return;

    const fileHash = calculateFileHashFromParts(filePath, stats.size, Math.floor(stats.mtimeMs));

    db.prepare(`
      INSERT INTO file_metadata (
        file_path, file_hash, file_size, file_mtime, indexed_at,
        game_version, track_venue, track_course, track_event, track_length,
        date_time, time_string
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        file_hash    = excluded.file_hash,
        file_size    = excluded.file_size,
        file_mtime   = excluded.file_mtime,
        indexed_at   = excluded.indexed_at,
        game_version = excluded.game_version,
        track_venue  = excluded.track_venue,
        track_course = excluded.track_course,
        track_event  = excluded.track_event,
        track_length = excluded.track_length,
        date_time    = excluded.date_time,
        time_string  = excluded.time_string
    `).run(
      filePath, fileHash,
      stats.size, Math.floor(stats.mtimeMs), Date.now(),
      raceResults.GameVersion  || null,
      raceResults.TrackVenue   || null,
      raceResults.TrackCourse  || null,
      raceResults.TrackEvent   || null,
      raceResults.TrackLength  ? parseFloat(raceResults.TrackLength) : null,
      raceResults.DateTime     ? parseInt(raceResults.DateTime) : null,
      raceResults.TimeString   || null
    );

    const fileRow = db.prepare('SELECT id FROM file_metadata WHERE file_path = ?').get(filePath);
    if (!fileRow?.id) return;
    const fileId = fileRow.id;

    db.prepare('DELETE FROM sessions WHERE file_id = ?').run(fileId);
    indexSessions(fileId, raceResults);
  }

  function resetDatabase() {
    try {
      if (db) {
        try { db.pragma('wal_checkpoint(TRUNCATE)'); db.close(); } catch (_) {}
        db = null;
      }

      const base = app.getPath('userData');
      const dbPath  = path.join(base, 'lmutracker.db');
      const walPath = path.join(base, 'lmutracker.db-wal');
      const shmPath = path.join(base, 'lmutracker.db-shm');

      for (const p of [walPath, shmPath, dbPath]) {
        try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
      }

      return initDatabase();
    } catch (error) {
      console.error('[DB] resetDatabase:', error);
      return { ok: false, error: error.message };
    }
  }

  module.exports = {
    initDatabase,
    isFileIndexed,
    indexFile,
    batchIndexFiles,
    getFileData,
    getAllFileMetadata,
    getFileTimeInfo,
    getAllFileTimeInfoMap,
    cleanupMissingFiles,
    resetDatabase,
    closeDatabase,
    getDatabaseStats
  };

})();
