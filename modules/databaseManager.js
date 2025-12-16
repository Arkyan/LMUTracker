/**
 * Module de gestion de la base de données SQLite pour LMU Tracker
 * Permet d'éviter de réindexer les fichiers déjà parsés
 */

(function() {
  const Database = require('better-sqlite3');
  const path = require('path');
  const fs = require('fs');
  const { app } = require('electron');

  let db = null;
  const DB_VERSION = 1;

  // Initialiser la base de données
  function initDatabase() {
    try {
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'lmutracker.db');
      
      console.log(`[DB] Initialisation de la base de données: ${dbPath}`);
      
      db = new Database(dbPath);
      db.pragma('journal_mode = WAL'); // Write-Ahead Logging pour meilleures performances
      
      // Créer les tables si elles n'existent pas
      createTables();
      
      console.log('[DB] Base de données initialisée avec succès');
      return { ok: true };
    } catch (error) {
      console.error('[DB] Erreur lors de l\'initialisation:', error);
      return { ok: false, error: error.message };
    }
  }

  // Créer les tables
  function createTables() {
    // Table pour stocker les métadonnées des fichiers
    db.exec(`
      CREATE TABLE IF NOT EXISTS file_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT UNIQUE NOT NULL,
        file_hash TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        file_mtime INTEGER NOT NULL,
        indexed_at INTEGER NOT NULL,
        game_version TEXT,
        track_venue TEXT,
        track_course TEXT,
        track_event TEXT,
        track_length REAL,
        date_time INTEGER,
        time_string TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_file_path ON file_metadata(file_path);
      CREATE INDEX IF NOT EXISTS idx_file_hash ON file_metadata(file_hash);
      CREATE INDEX IF NOT EXISTS idx_indexed_at ON file_metadata(indexed_at);
      CREATE INDEX IF NOT EXISTS idx_track_venue ON file_metadata(track_venue);
    `);

    // Table pour stocker les sessions
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER NOT NULL,
        session_name TEXT NOT NULL,
        session_type TEXT NOT NULL,
        date_time INTEGER,
        time_string TEXT,
        laps INTEGER,
        minutes INTEGER,
        FOREIGN KEY (file_id) REFERENCES file_metadata(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_session_file_id ON sessions(file_id);
      CREATE INDEX IF NOT EXISTS idx_session_type ON sessions(session_type);
    `);

    // Table pour stocker les pilotes de chaque session
    db.exec(`
      CREATE TABLE IF NOT EXISTS drivers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        is_player INTEGER DEFAULT 0,
        position INTEGER,
        finish_status TEXT,
        laps INTEGER,
        best_lap_time REAL,
        best_lap_num INTEGER,
        vehicle_name TEXT,
        vehicle_class TEXT,
        vehicle_number TEXT,
        team_name TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_driver_session_id ON drivers(session_id);
      CREATE INDEX IF NOT EXISTS idx_driver_name ON drivers(name);
      CREATE INDEX IF NOT EXISTS idx_driver_vehicle_class ON drivers(vehicle_class);
    `);

    // Table pour stocker les tours de chaque pilote
    db.exec(`
      CREATE TABLE IF NOT EXISTS laps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        driver_id INTEGER NOT NULL,
        lap_num INTEGER NOT NULL,
        lap_time REAL,
        sector1 REAL,
        sector2 REAL,
        sector3 REAL,
        fuel_used REAL,
        FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_lap_driver_id ON laps(driver_id);
      CREATE INDEX IF NOT EXISTS idx_lap_num ON laps(lap_num);
    `);

    // Table pour stocker les données brutes du Stream (JSON compressé)
    db.exec(`
      CREATE TABLE IF NOT EXISTS stream_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        stream_json TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_stream_session_id ON stream_data(session_id);
    `);

    // Table pour la version de la BDD
    db.exec(`
      CREATE TABLE IF NOT EXISTS db_version (
        version INTEGER PRIMARY KEY
      );
    `);

    // Insérer la version si elle n'existe pas
    const versionRow = db.prepare('SELECT version FROM db_version LIMIT 1').get();
    if (!versionRow) {
      db.prepare('INSERT INTO db_version (version) VALUES (?)').run(DB_VERSION);
    }
  }

  // Calculer un hash simple pour un fichier (basé sur chemin + taille + mtime)
  function calculateFileHash(filePath, stats) {
    const crypto = require('crypto');
    const hash = crypto.createHash('md5');
    hash.update(`${filePath}:${stats.size}:${stats.mtimeMs}`);
    return hash.digest('hex');
  }

  // Vérifier si un fichier est déjà indexé et à jour
  function isFileIndexed(filePath, stats) {
    if (!db) return false;

    try {
      const fileHash = calculateFileHash(filePath, stats);
      const row = db.prepare(`
        SELECT id, file_hash 
        FROM file_metadata 
        WHERE file_path = ? AND file_hash = ?
      `).get(filePath, fileHash);

      return row ? { indexed: true, fileId: row.id } : { indexed: false };
    } catch (error) {
      console.error('[DB] Erreur lors de la vérification du fichier:', error);
      return { indexed: false };
    }
  }

  // Indexer un fichier complet
  function indexFile(filePath, stats, parsedData) {
    if (!db) return { ok: false, error: 'Base de données non initialisée' };

    try {
      const fileHash = calculateFileHash(filePath, stats);
      const raceResults = parsedData?.rFactorXML?.RaceResults || parsedData?.RaceResults;

      if (!raceResults) {
        return { ok: false, error: 'Données RaceResults non trouvées' };
      }

      // Commencer une transaction
      const insertTransaction = db.transaction((filePath, fileHash, stats, raceResults) => {
        // Insérer ou mettre à jour les métadonnées du fichier
        const fileInfo = db.prepare(`
          INSERT INTO file_metadata (
            file_path, file_hash, file_size, file_mtime, indexed_at,
            game_version, track_venue, track_course, track_event, track_length,
            date_time, time_string
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(file_path) DO UPDATE SET
            file_hash = excluded.file_hash,
            file_size = excluded.file_size,
            file_mtime = excluded.file_mtime,
            indexed_at = excluded.indexed_at,
            game_version = excluded.game_version,
            track_venue = excluded.track_venue,
            track_course = excluded.track_course,
            track_event = excluded.track_event,
            track_length = excluded.track_length,
            date_time = excluded.date_time,
            time_string = excluded.time_string
        `).run(
          filePath,
          fileHash,
          stats.size,
          Math.floor(stats.mtimeMs),
          Date.now(),
          raceResults.GameVersion || null,
          raceResults.TrackVenue || null,
          raceResults.TrackCourse || null,
          raceResults.TrackEvent || null,
          raceResults.TrackLength ? parseFloat(raceResults.TrackLength) : null,
          raceResults.DateTime ? parseInt(raceResults.DateTime) : null,
          raceResults.TimeString || null
        );

        const fileId = fileInfo.lastInsertRowid;

        // Supprimer les anciennes sessions pour ce fichier
        db.prepare('DELETE FROM sessions WHERE file_id = ?').run(fileId);

        // Indexer les sessions
        indexSessions(fileId, raceResults);

        return fileId;
      });

      const fileId = insertTransaction(filePath, fileHash, stats, raceResults);
      
      console.log(`[DB] Fichier indexé: ${filePath} (ID: ${fileId})`);
      return { ok: true, fileId };
    } catch (error) {
      console.error('[DB] Erreur lors de l\'indexation du fichier:', error);
      return { ok: false, error: error.message };
    }
  }

  // Indexer les sessions d'un fichier
  function indexSessions(fileId, raceResults) {
    const sessionKeys = [
      'Practice1', 'Practice2', 'Practice3', 'Practice4',
      'Qualifying1', 'Qualifying2', 'Qualifying3', 'Qualifying4',
      'Warmup', 'Race1', 'Race2', 'Race'
    ];

    for (const sessionKey of sessionKeys) {
      const sessionData = raceResults[sessionKey];
      if (!sessionData || typeof sessionData !== 'object') continue;

      try {
        const sessionType = getSessionType(sessionKey);
        const sessionInfo = db.prepare(`
          INSERT INTO sessions (
            file_id, session_name, session_type, date_time, time_string, laps, minutes
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          fileId,
          sessionKey,
          sessionType,
          sessionData.DateTime ? parseInt(sessionData.DateTime) : null,
          sessionData.TimeString || null,
          sessionData.Laps ? parseInt(sessionData.Laps) : null,
          sessionData.Minutes ? parseInt(sessionData.Minutes) : null
        );

        const sessionId = sessionInfo.lastInsertRowid;

        // Indexer les pilotes
        if (sessionData.Driver) {
          indexDrivers(sessionId, sessionData.Driver);
        }

        // Stocker le Stream en JSON
        if (sessionData.Stream) {
          const streamJson = JSON.stringify(sessionData.Stream);
          db.prepare(`
            INSERT INTO stream_data (session_id, stream_json)
            VALUES (?, ?)
          `).run(sessionId, streamJson);
        }
      } catch (error) {
        console.error(`[DB] Erreur lors de l'indexation de la session ${sessionKey}:`, error);
      }
    }
  }

  // Indexer les pilotes d'une session
  function indexDrivers(sessionId, driversData) {
    const drivers = Array.isArray(driversData) ? driversData : [driversData];

    for (const driver of drivers) {
      if (!driver || typeof driver !== 'object') continue;

      try {
        const driverInfo = db.prepare(`
          INSERT INTO drivers (
            session_id, name, is_player, position, finish_status, laps,
            best_lap_time, best_lap_num, vehicle_name, vehicle_class,
            vehicle_number, team_name
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          sessionId,
          driver.Name || null,
          driver.isPlayer === 1 ? 1 : 0,
          driver.Position ? parseInt(driver.Position) : null,
          driver.FinishStatus || null,
          driver.Laps ? parseInt(driver.Laps) : null,
          driver.BestLapTime ? parseFloat(driver.BestLapTime) : null,
          driver.BestLapNum ? parseInt(driver.BestLapNum) : null,
          driver.VehType || driver.VehName || null,
          driver.VehClass || null,
          driver.CarNumber || null,
          driver.TeamName || null
        );

        const driverId = driverInfo.lastInsertRowid;

        // Indexer les tours
        if (driver.Lap) {
          indexLaps(driverId, driver.Lap);
        }
      } catch (error) {
        console.error(`[DB] Erreur lors de l'indexation du pilote:`, error);
      }
    }
  }

  // Indexer les tours d'un pilote
  function indexLaps(driverId, lapsData) {
    const laps = Array.isArray(lapsData) ? lapsData : [lapsData];

    for (const lap of laps) {
      if (!lap || typeof lap !== 'object') continue;

      // Skip si pas de lap_num (requis)
      const lapNum = lap.num !== undefined ? parseInt(lap.num) : null;
      if (lapNum === null || isNaN(lapNum)) continue;

      try {
        db.prepare(`
          INSERT INTO laps (
            driver_id, lap_num, lap_time, sector1, sector2, sector3, fuel_used
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          driverId,
          lapNum,
          lap.et ? parseFloat(lap.et) : null,
          lap.s1 ? parseFloat(lap.s1) : null,
          lap.s2 ? parseFloat(lap.s2) : null,
          lap.s3 ? parseFloat(lap.s3) : null,
          lap.fuel ? parseFloat(lap.fuel) : null
        );
      } catch (error) {
        console.error(`[DB] Erreur lors de l'indexation du tour:`, error);
      }
    }
  }

  // Déterminer le type de session
  function getSessionType(sessionKey) {
    const key = sessionKey.toLowerCase();
    if (key.includes('race')) return 'race';
    if (key.includes('qual')) return 'qual';
    if (key.includes('practice') || key.includes('practise')) return 'practice';
    if (key.includes('warm')) return 'warmup';
    return 'unknown';
  }

  // Récupérer les données d'un fichier depuis la BDD
  function getFileData(filePath) {
    if (!db) return null;

    try {
      const fileRow = db.prepare(`
        SELECT * FROM file_metadata WHERE file_path = ?
      `).get(filePath);

      if (!fileRow) return null;

      const sessions = db.prepare(`
        SELECT * FROM sessions WHERE file_id = ?
      `).all(fileRow.id);

      const result = {
        metadata: fileRow,
        sessions: []
      };

      for (const session of sessions) {
        const drivers = db.prepare(`
          SELECT * FROM drivers WHERE session_id = ?
        `).all(session.id);

        const streamRow = db.prepare(`
          SELECT stream_json FROM stream_data WHERE session_id = ?
        `).get(session.id);

        const sessionData = {
          ...session,
          drivers: [],
          stream: streamRow ? JSON.parse(streamRow.stream_json) : null
        };

        for (const driver of drivers) {
          const laps = db.prepare(`
            SELECT * FROM laps WHERE driver_id = ?
          `).all(driver.id);

          sessionData.drivers.push({
            ...driver,
            laps
          });
        }

        result.sessions.push(sessionData);
      }

      return result;
    } catch (error) {
      console.error('[DB] Erreur lors de la récupération des données:', error);
      return null;
    }
  }

  // Récupérer toutes les métadonnées des fichiers indexés
  function getAllFileMetadata() {
    if (!db) return [];

    try {
      return db.prepare(`
        SELECT * FROM file_metadata ORDER BY date_time DESC
      `).all();
    } catch (error) {
      console.error('[DB] Erreur lors de la récupération des métadonnées:', error);
      return [];
    }
  }

  // Nettoyer les fichiers qui n'existent plus
  function cleanupMissingFiles() {
    if (!db) return { ok: false, error: 'Base de données non initialisée' };

    try {
      const allFiles = db.prepare('SELECT id, file_path FROM file_metadata').all();
      let deleted = 0;

      console.log(`[DB] Nettoyage: vérification de ${allFiles.length} fichiers...`);

      for (const file of allFiles) {
        const exists = fs.existsSync(file.file_path);
        console.log(`[DB] Fichier ${file.file_path}: ${exists ? 'existe' : 'MANQUANT'}`);
        
        if (!exists) {
          db.prepare('DELETE FROM file_metadata WHERE id = ?').run(file.id);
          deleted++;
          console.log(`[DB] Fichier supprimé de la BDD: ${file.file_path}`);
        }
      }

      console.log(`[DB] Nettoyage terminé: ${deleted} fichier(s) supprimé(s)`);
      return { ok: true, deleted };
    } catch (error) {
      console.error('[DB] Erreur lors du nettoyage:', error);
      return { ok: false, error: error.message };
    }
  }

  // Fermer la base de données
  function closeDatabase() {
    if (db) {
      db.close();
      db = null;
      console.log('[DB] Base de données fermée');
    }
  }

  // Obtenir les statistiques de la BDD
  function getDatabaseStats() {
    if (!db) return null;

    try {
      const stats = {
        files: db.prepare('SELECT COUNT(*) as count FROM file_metadata').get().count,
        sessions: db.prepare('SELECT COUNT(*) as count FROM sessions').get().count,
        drivers: db.prepare('SELECT COUNT(*) as count FROM drivers').get().count,
        laps: db.prepare('SELECT COUNT(*) as count FROM laps').get().count,
        dbSize: 0
      };

      // Taille de la BDD
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'lmutracker.db');
      if (fs.existsSync(dbPath)) {
        stats.dbSize = fs.statSync(dbPath).size;
      }

      return stats;
    } catch (error) {
      console.error('[DB] Erreur lors de la récupération des statistiques:', error);
      return null;
    }
  }

  // Supprimer complètement la base de données et la réinitialiser
  function resetDatabase() {
    try {
      console.log('[DB] Réinitialisation de la base de données...');
      
      // Fermer la connexion si ouverte
      if (db) {
        db.close();
        db = null;
      }

      // Supprimer le fichier de la base de données
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'lmutracker.db');
      const walPath = path.join(userDataPath, 'lmutracker.db-wal');
      const shmPath = path.join(userDataPath, 'lmutracker.db-shm');

      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        console.log('[DB] Fichier de base de données supprimé');
      }

      // Supprimer les fichiers WAL et SHM si présents
      if (fs.existsSync(walPath)) {
        fs.unlinkSync(walPath);
      }
      if (fs.existsSync(shmPath)) {
        fs.unlinkSync(shmPath);
      }

      // Réinitialiser
      const initResult = initDatabase();
      
      if (initResult.ok) {
        console.log('[DB] Base de données réinitialisée avec succès');
        return { ok: true, message: 'Base de données réinitialisée' };
      } else {
        return { ok: false, error: initResult.error };
      }
    } catch (error) {
      console.error('[DB] Erreur lors de la réinitialisation:', error);
      return { ok: false, error: error.message };
    }
  }

  // Exporter les fonctions
  module.exports = {
    initDatabase,
    isFileIndexed,
    indexFile,
    getFileData,
    getAllFileMetadata,
    cleanupMissingFiles,
    resetDatabase,
    closeDatabase,
    getDatabaseStats
  };

})();
