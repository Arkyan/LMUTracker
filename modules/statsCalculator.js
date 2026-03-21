/**
 * Module de calcul des statistiques pour LMU Tracker
 * Dépend de: utils.js, xmlParser.js
 */

(function() {
  // Utiliser les fonctions depuis les modules utils et xmlParser
  const { toNumber, formatDateTime } = window.LMUUtils || {};
  const { getRaceResultsRoot, extractSession } = window.LMUXMLParser || {};

// Cache pour optimiser les performances
let cachedStats = null;
let cachedTrackStats = null;
let cachedVehicleStats = null;
let cachedVehicleTrackStats = null;

// Helpers pour faire correspondre des noms de pilotes de manière flexible
function normalizeName(name) {
  return String(name || '').toLowerCase().trim();
}

function parseConfiguredDriverNames(input) {
  const raw = String(input || '');
  if (!raw.trim()) return [];
  // Autoriser séparateurs: virgule, slash, pipe, point-virgule
  return raw
    .split(/[,/|;]+/)
    .map(s => normalizeName(s))
    .filter(Boolean);
}

// Calculer les statistiques d'un pilote
function calculateDriverStats(driverName, lastScannedFiles) {
  const stats = {
    totalSessions: 0,
    totalRaces: 0,
    bestLap: Infinity,
    topSpeed: 0,
    recentSessions: [],
    podiumsByClass: {}, // {className: {wins: 0, podiums: 0}}
    totalWins: 0,
    totalPodiums: 0
  };
  
  if (!lastScannedFiles) return stats;

  const driverNames = parseConfiguredDriverNames(driverName);
  if (driverNames.length === 0) return stats;

  const isRaceFromRR = (rr) => {
    try {
      if (!rr) return false;
      return Object.entries(rr)
        .filter(([k, v]) => v && typeof v === 'object' && ('Driver' in v))
        .some(([k]) => String(k).toLowerCase().includes('race'));
    } catch (_) {
      return false;
    }
  };
  
  for (const file of lastScannedFiles) {
    if (file.error) continue;
    
    const session = extractSession(file.parsed);
    if (!session) continue;
    
    // Chercher le pilote dans cette session (matching flexible + aliases)
    const driver = session.drivers.find(d => {
      const primary = normalizeName(d.name);
      if (driverNames.includes(primary)) return true;
      const aliases = (d.allDrivers || []).map(normalizeName);
      return aliases.some(n => driverNames.includes(n));
    });
    if (!driver) continue;
    
    stats.totalSessions++;
    
    // Détecter si c'est une course (présence de balise <Race> dans le XML)
    const rr = getRaceResultsRoot(file.parsed);
    const isRace = isRaceFromRR(rr);
    if (isRace) {
      stats.totalRaces++;
    }
    
    // Calculer podiums et victoires par classe (uniquement pour les courses)
    if (isRace && isFinite(driver.classPosition) && driver.classPosition > 0) {
      const carClass = driver.carClass || 'Unknown';
      
      // Initialiser la classe si nécessaire
      if (!stats.podiumsByClass[carClass]) {
        stats.podiumsByClass[carClass] = { wins: 0, podiums: 0 };
      }
      
      // Podium (P1, P2, P3)
      if (driver.classPosition <= 3) {
        stats.podiumsByClass[carClass].podiums++;
        stats.totalPodiums++;
        
        // Victoire (P1)
        if (driver.classPosition === 1) {
          stats.podiumsByClass[carClass].wins++;
          stats.totalWins++;
        }
      }
    }
    
    // Meilleur tour
    if (isFinite(driver.bestLapSec) && driver.bestLapSec < stats.bestLap) {
      stats.bestLap = driver.bestLapSec;
    }
    
    // Vitesse max
    if (isFinite(driver.topSpeedMax) && driver.topSpeedMax > stats.topSpeed) {
      stats.topSpeed = driver.topSpeedMax;
    }
    
    // Ajouter à l'historique des sessions récentes
    const timeString = formatDateTime(rr, file.mtimeIso ? new Date(file.mtimeIso) : null);
    const timestamp = rr.DateTime ? parseInt(rr.DateTime) * 1000 : 
      (file.mtimeIso ? new Date(file.mtimeIso).getTime() : 0);
    
    // Détecter le mode de jeu (Solo/Multijoueur)
    const gameMode = window.LMUUtils?.getGameMode ? 
      window.LMUUtils.getGameMode(rr) : 
      'Solo';
    
    stats.recentSessions.push({
      event: session.meta.event || 'Session',
      track: session.meta.track || '',
      date: timeString,
      timestamp: timestamp,
      bestLap: driver.bestLapSec,
      position: driver.position,
      session: session.meta.session,
      gameMode: gameMode
    });
  }
  
  // Trier les sessions par timestamp (plus récentes en premier)
  stats.recentSessions.sort((a, b) => {
    if (a.timestamp && b.timestamp) {
      return b.timestamp - a.timestamp;
    }
    return b.date.localeCompare(a.date);
  });
  
  return stats;
}

// Calculer les statistiques par circuit
function calculateTrackStats(driverName, lastScannedFiles) {
  const trackStats = {};
  
  if (!lastScannedFiles) return trackStats;

  const driverNames = parseConfiguredDriverNames(driverName);
  if (driverNames.length === 0) return trackStats;
  
  for (const file of lastScannedFiles) {
    if (file.error) continue;
    
    try {
      const rr = getRaceResultsRoot(file.parsed);
      if (!rr) continue;
      
      const trackCourse = rr.TrackCourse || rr.TrackVenue || 'Circuit inconnu';
      
      // Utiliser extractSession pour simplifier et réutiliser la logique existante
      const session = extractSession(file.parsed);
      if (!session) continue;
      
      // Chercher notre pilote dans cette session
      const myDriver = session.drivers.find(d => {
        const primary = normalizeName(d.name);
        if (driverNames.includes(primary)) return true;
        const aliases = (d.allDrivers || []).map(normalizeName);
        return aliases.some(n => driverNames.includes(n));
      });
      
      if (!myDriver) continue;
      
      // Initialiser les stats du circuit si nécessaire
      if (!trackStats[trackCourse]) {
        trackStats[trackCourse] = {
          trackName: trackCourse,
          sessions: 0,
          bestLap: Infinity,
          avgLap: 0,
          allValidLaps: [],
          topSpeed: 0,
          lastSession: new Date(0),
          totalLaps: 0,
          classStats: {} // Stats par classe
        };
      }
      
      const trackData = trackStats[trackCourse];
      trackData.sessions++;
      
      // Date de la dernière session sur ce circuit
      const sessionDate = file.mtimeIso ? new Date(file.mtimeIso) : new Date(0);
      if (sessionDate > trackData.lastSession) {
        trackData.lastSession = sessionDate;
      }
      
      // Meilleur tour global
      if (isFinite(myDriver.bestLapSec) && myDriver.bestLapSec > 0 && 
          myDriver.bestLapSec < trackData.bestLap) {
        trackData.bestLap = myDriver.bestLapSec;
      }
      
      // Vitesse de pointe globale
      if (isFinite(myDriver.topSpeedMax) && myDriver.topSpeedMax > trackData.topSpeed) {
        trackData.topSpeed = myDriver.topSpeedMax;
      }
      
      // Collecter tous les tours valides pour calculer la moyenne globale
      if (myDriver.laps) {
        const validLaps = myDriver.laps
          .map(l => l.timeSec)
          .filter(t => isFinite(t) && t > 0);
        trackData.allValidLaps.push(...validLaps);
        trackData.totalLaps += myDriver.laps.length;
      }
      
      // Stats par classe de voiture
      const carClass = myDriver.carClass || 'Unknown';
      if (carClass !== 'Unknown') {
        // Initialiser les stats de cette classe si nécessaire
        if (!trackData.classStats[carClass]) {
          trackData.classStats[carClass] = {
            sessions: 0,
            bestLap: Infinity,
            avgLap: 0,
            allValidLaps: [],
            topSpeed: 0,
            totalLaps: 0
          };
        }
        
        const classData = trackData.classStats[carClass];
        classData.sessions++;
        
        // Meilleur tour pour cette classe
        if (isFinite(myDriver.bestLapSec) && myDriver.bestLapSec > 0 && 
            myDriver.bestLapSec < classData.bestLap) {
          classData.bestLap = myDriver.bestLapSec;
        }
        
        // Vitesse de pointe pour cette classe
        if (isFinite(myDriver.topSpeedMax) && myDriver.topSpeedMax > classData.topSpeed) {
          classData.topSpeed = myDriver.topSpeedMax;
        }
        
        // Tours valides pour cette classe
        if (myDriver.laps) {
          const validLaps = myDriver.laps
            .map(l => l.timeSec)
            .filter(t => isFinite(t) && t > 0);
          classData.allValidLaps.push(...validLaps);
          classData.totalLaps += myDriver.laps.length;
        }
      }
      
    } catch (e) {
      console.warn('Erreur lors du traitement du fichier pour les stats circuit:', file.filePath, e);
    }
  }
  
  // Calculer les moyennes pour chaque circuit
  for (const track of Object.values(trackStats)) {
    // Moyenne globale
    if (track.allValidLaps.length > 0) {
      track.avgLap = track.allValidLaps.reduce((a, b) => a + b, 0) / track.allValidLaps.length;
    } else {
      track.avgLap = NaN;
    }
    
    // Nettoyer les données temporaires globales
    delete track.allValidLaps;
    
    // Si pas de meilleur tour trouvé, mettre NaN
    if (track.bestLap === Infinity) {
      track.bestLap = NaN;
    }
    
    // Calculer les moyennes par classe
    for (const classData of Object.values(track.classStats)) {
      if (classData.allValidLaps.length > 0) {
        classData.avgLap = classData.allValidLaps.reduce((a, b) => a + b, 0) / classData.allValidLaps.length;
      } else {
        classData.avgLap = NaN;
      }
      
      // Nettoyer les données temporaires de classe
      delete classData.allValidLaps;
      
      // Si pas de meilleur tour trouvé, mettre NaN
      if (classData.bestLap === Infinity) {
        classData.bestLap = NaN;
      }
    }
  }
  
  return trackStats;
}

// Calculer les performances par voiture groupées par classe pour un pilote
function calculateVehicleStatsByClass(driverName, lastScannedFiles) {
  const result = {}; // { [className]: { [vehicleName]: { sessions, bestLap, avgLap, allValidLaps, topSpeed, totalLaps } } }
  if (!lastScannedFiles) return {};
  const driverNames = parseConfiguredDriverNames(driverName);
  if (driverNames.length === 0) return {};
  
  for (const file of lastScannedFiles) {
    if (file.error) continue;
    try {
      const rr = getRaceResultsRoot(file.parsed);
      const trackCourse = rr?.TrackCourse || rr?.TrackVenue || 'Circuit inconnu';
      const session = extractSession(file.parsed);
      if (!session) continue;
      const myDriver = session.drivers.find(d => {
        const primary = normalizeName(d.name);
        if (driverNames.includes(primary)) return true;
        const aliases = (d.allDrivers || []).map(normalizeName);
        return aliases.some(n => driverNames.includes(n));
      });
      if (!myDriver) continue;
      const carClass = myDriver.carClass || 'Unknown';
      const vehicleName = myDriver.car || 'Voiture inconnue';
      if (!result[carClass]) result[carClass] = {};
      if (!result[carClass][vehicleName]) {
        result[carClass][vehicleName] = {
          className: carClass,
          vehicleName,
          sessions: 0,
          bestLap: Infinity,
          avgLap: 0,
          allValidLaps: [],
          topSpeed: 0,
          totalLaps: 0,
          _tracks: new Set()
        };
      }
      const v = result[carClass][vehicleName];
      v.sessions++;
      try { v._tracks.add(trackCourse); } catch (_) {}
      if (isFinite(myDriver.bestLapSec) && myDriver.bestLapSec > 0 && myDriver.bestLapSec < v.bestLap) {
        v.bestLap = myDriver.bestLapSec;
      }
      if (isFinite(myDriver.topSpeedMax) && myDriver.topSpeedMax > v.topSpeed) {
        v.topSpeed = myDriver.topSpeedMax;
      }
      if (myDriver.laps) {
        const valid = myDriver.laps.map(l => l.timeSec).filter(t => isFinite(t) && t > 0);
        v.allValidLaps.push(...valid);
        v.totalLaps += myDriver.laps.length;
      }
    } catch (e) {
      // continuer
    }
  }
  // Post-traitement: calculer les moyennes et nettoyer
  const out = {};
  for (const [cls, vehicles] of Object.entries(result)) {
    out[cls] = Object.values(vehicles).map(v => {
      const o = { ...v };
      if (o.allValidLaps.length > 0) {
        o.avgLap = o.allValidLaps.reduce((a,b)=>a+b,0) / o.allValidLaps.length;
      } else {
        o.avgLap = NaN;
      }
      try {
        o.circuits = o._tracks ? o._tracks.size : 0;
      } catch (_) {
        o.circuits = 0;
      }
      delete o.allValidLaps;
      delete o._tracks;
      if (o.bestLap === Infinity) o.bestLap = NaN;
      return o;
    }).sort((a, b) => b.sessions - a.sessions);
  }
  return out;
}

// Calculer les stats par circuit pour un véhicule et une classe donnés
function calculateTrackStatsForVehicle(driverName, lastScannedFiles, vehicleName, carClass) {
  const trackStats = {};
  if (!lastScannedFiles) return trackStats;
  const driverNames = parseConfiguredDriverNames(driverName);
  if (driverNames.length === 0) return trackStats;
  
  for (const file of lastScannedFiles) {
    if (file.error) continue;
    try {
      const rr = getRaceResultsRoot(file.parsed);
      if (!rr) continue;
      const trackCourse = rr.TrackCourse || rr.TrackVenue || 'Circuit inconnu';
      const session = extractSession(file.parsed);
      if (!session) continue;
      const myDriver = session.drivers.find(d => {
        const primary = normalizeName(d.name);
        if (driverNames.includes(primary)) return true;
        const aliases = (d.allDrivers || []).map(normalizeName);
        return aliases.some(n => driverNames.includes(n));
      });
      if (!myDriver) continue;
      const driverClass = myDriver.carClass || 'Unknown';
      const derivedVehicle = myDriver.car || 'Voiture inconnue';
      if (driverClass !== carClass) continue;
      if (derivedVehicle !== vehicleName) continue;
      
      if (!trackStats[trackCourse]) {
        trackStats[trackCourse] = {
          trackName: trackCourse,
          sessions: 0,
          bestLap: Infinity,
          avgLap: 0,
          allValidLaps: [],
          topSpeed: 0,
          totalLaps: 0
        };
      }
      const t = trackStats[trackCourse];
      t.sessions++;
      if (isFinite(myDriver.bestLapSec) && myDriver.bestLapSec > 0 && myDriver.bestLapSec < t.bestLap) {
        t.bestLap = myDriver.bestLapSec;
      }
      if (isFinite(myDriver.topSpeedMax) && myDriver.topSpeedMax > t.topSpeed) {
        t.topSpeed = myDriver.topSpeedMax;
      }
      if (myDriver.laps) {
        const valid = myDriver.laps.map(l => l.timeSec).filter(sec => isFinite(sec) && sec > 0);
        t.allValidLaps.push(...valid);
        t.totalLaps += myDriver.laps.length;
      }
    } catch (_) { /* ignore */ }
  }
  // Finaliser avg et bestLap NaN
  for (const ts of Object.values(trackStats)) {
    if (ts.allValidLaps.length > 0) {
      ts.avgLap = ts.allValidLaps.reduce((a,b)=>a+b,0) / ts.allValidLaps.length;
    } else {
      ts.avgLap = NaN;
    }
    delete ts.allValidLaps;
    if (ts.bestLap === Infinity) ts.bestLap = NaN;
  }
  return trackStats;
}

// Fonctions de cache pour optimiser les performances
function getCachedDriverStats(driverName, lastScannedFiles) {
  if (!cachedStats || 
      cachedStats.driverName !== driverName || 
      cachedStats.filesLength !== (lastScannedFiles?.length || 0)) {
    cachedStats = {
      driverName,
      filesLength: lastScannedFiles?.length || 0,
      data: calculateDriverStats(driverName, lastScannedFiles)
    };
  }
  return cachedStats.data;
}

function getCachedTrackStats(driverName, lastScannedFiles, selectedCarClass) {
  if (!cachedTrackStats || 
      cachedTrackStats.driverName !== driverName || 
      cachedTrackStats.filesLength !== (lastScannedFiles?.length || 0) || 
      cachedTrackStats.selectedClass !== selectedCarClass) {
    cachedTrackStats = {
      driverName,
      filesLength: lastScannedFiles?.length || 0,
      selectedClass: selectedCarClass,
      data: calculateTrackStats(driverName, lastScannedFiles)
    };
  }
  return cachedTrackStats.data;
}

function getCachedVehicleStatsByClass(driverName, lastScannedFiles) {
  if (!cachedVehicleStats ||
      cachedVehicleStats.driverName !== driverName ||
      cachedVehicleStats.filesLength !== (lastScannedFiles?.length || 0)) {
    cachedVehicleStats = {
      driverName,
      filesLength: lastScannedFiles?.length || 0,
      data: calculateVehicleStatsByClass(driverName, lastScannedFiles)
    };
  }
  return cachedVehicleStats.data;
}

function getCachedTrackStatsForVehicle(driverName, lastScannedFiles, vehicleName, carClass) {
  if (!cachedVehicleTrackStats ||
      cachedVehicleTrackStats.driverName !== driverName ||
      cachedVehicleTrackStats.filesLength !== (lastScannedFiles?.length || 0) ||
      cachedVehicleTrackStats.vehicleName !== vehicleName ||
      cachedVehicleTrackStats.carClass !== carClass) {
    cachedVehicleTrackStats = {
      driverName,
      filesLength: lastScannedFiles?.length || 0,
      vehicleName,
      carClass,
      data: calculateTrackStatsForVehicle(driverName, lastScannedFiles, vehicleName, carClass)
    };
  }
  return cachedVehicleTrackStats.data;
}

// Invalider le cache
function invalidateCache() {
  cachedStats = null;
  cachedTrackStats = null;
  cachedVehicleStats = null;
  cachedVehicleTrackStats = null;
}

// Retourner la liste de tous les circuits avec leurs meilleurs temps/sessions pour un pilote
// Returns: { [trackKey]: { venue, course, event, bestLapSec, sessionCount, lapCount, vehicles: Set<string> } }
// trackKey = `${TrackVenue}||${TrackCourse}`
function getTracksForDriver(driverName, files) {
  const result = {};
  if (!files) return result;
  const driverNames = parseConfiguredDriverNames(driverName);
  if (driverNames.length === 0) return result;

  for (const file of files) {
    if (file.error) continue;
    try {
      const rr = getRaceResultsRoot(file.parsed);
      if (!rr) continue;
      const venue = rr.TrackVenue || '';
      const course = rr.TrackCourse || '';
      const event = rr.TrackEvent || '';
      const trackKey = `${venue}||${course}`;

      const session = extractSession(file.parsed);
      if (!session) continue;

      const myDriver = session.drivers.find(d => {
        const primary = normalizeName(d.name);
        if (driverNames.includes(primary)) return true;
        const aliases = (d.allDrivers || []).map(normalizeName);
        return aliases.some(n => driverNames.includes(n));
      });
      if (!myDriver) continue;

      if (!result[trackKey]) {
        result[trackKey] = {
          venue,
          course,
          event,
          bestLapSec: Infinity,
          sessionCount: 0,
          lapCount: 0,
          vehicles: new Set()
        };
      }
      const entry = result[trackKey];
      entry.sessionCount++;
      if (isFinite(myDriver.bestLapSec) && myDriver.bestLapSec > 0 && myDriver.bestLapSec < entry.bestLapSec) {
        entry.bestLapSec = myDriver.bestLapSec;
      }
      entry.lapCount += (myDriver.laps || []).length;
      const vehicleName = myDriver.car || '';
      if (vehicleName) entry.vehicles.add(vehicleName);
    } catch (_) {}
  }

  // Normalize Infinity -> NaN
  for (const entry of Object.values(result)) {
    if (entry.bestLapSec === Infinity) entry.bestLapSec = NaN;
  }
  return result;
}

// Retourner les stats détaillées pour un circuit et un véhicule donnés
function getTrackDetailStats(driverName, files, trackVenue, trackCourse, vehicleName) {
  const result = {
    trackVenue,
    trackCourse,
    vehicleName,
    sessions: [],
    allLaps: [],
    bestLapSec: NaN,
    avgLapSec: NaN,
    stdDev: NaN,
    bestS1: NaN,
    bestS2: NaN,
    bestS3: NaN,
    totalLaps: 0
  };
  if (!files) return result;
  const driverNames = parseConfiguredDriverNames(driverName);
  if (driverNames.length === 0) return result;

  const vehicleLower = String(vehicleName || '').toLowerCase();

  for (const file of files) {
    if (file.error) continue;
    try {
      const rr = getRaceResultsRoot(file.parsed);
      if (!rr) continue;
      const fVenue = rr.TrackVenue || '';
      const fCourse = rr.TrackCourse || '';
      if (fVenue !== trackVenue || fCourse !== trackCourse) continue;

      const session = extractSession(file.parsed);
      if (!session) continue;

      // Determine session type from session name
      const sessionNameRaw = session.meta.session || '';
      const sessionNameLower = sessionNameRaw.toLowerCase();
      let sessionType;
      if (sessionNameLower.includes('race')) sessionType = 'race';
      else if (sessionNameLower.includes('qual')) sessionType = 'qual';
      else if (sessionNameLower.includes('practice') || sessionNameLower.includes('practise') || sessionNameLower.includes('warm')) sessionType = 'practice';
      else sessionType = 'other';

      const myDriver = session.drivers.find(d => {
        const primary = normalizeName(d.name);
        const nameMatch = driverNames.includes(primary) ||
          (d.allDrivers || []).map(normalizeName).some(n => driverNames.includes(n));
        if (!nameMatch) return false;
        // Vehicle matching: case-insensitive includes
        const driverVeh = String(d.car || '').toLowerCase();
        return vehicleLower && driverVeh.includes(vehicleLower) || vehicleLower === driverVeh;
      });
      if (!myDriver) continue;

      const timestamp = rr.DateTime ? parseInt(rr.DateTime) * 1000 :
        (file.mtimeIso ? new Date(file.mtimeIso).getTime() : 0);

      const dateStr = window.LMUUtils?.formatDateTime
        ? window.LMUUtils.formatDateTime(rr, file.mtimeIso ? new Date(file.mtimeIso) : null)
        : (rr.TimeString || '');

      // Process laps
      const laps = [];
      for (const lap of (myDriver.laps || [])) {
        const t = lap.timeSec;
        if (!isFinite(t) || t <= 0) continue;
        laps.push({
          num: lap.num,
          timeSec: t,
          s1: isFinite(lap.s1) && lap.s1 > 0 ? lap.s1 : NaN,
          s2: isFinite(lap.s2) && lap.s2 > 0 ? lap.s2 : NaN,
          s3: isFinite(lap.s3) && lap.s3 > 0 ? lap.s3 : NaN,
          topSpeed: isFinite(lap.topSpeed) && lap.topSpeed > 0 ? lap.topSpeed : NaN,
          pit: !!lap.pit,
          isBest: false
        });
      }

      // Compute per-session best and avg (non-pit only)
      const nonPitTimes = laps.filter(l => !l.pit).map(l => l.timeSec);
      const sessionBest = nonPitTimes.length ? Math.min(...nonPitTimes) : NaN;
      const sessionAvg = nonPitTimes.length ? nonPitTimes.reduce((a, b) => a + b, 0) / nonPitTimes.length : NaN;

      result.sessions.push({
        date: dateStr,
        timestamp,
        sessionType,
        sessionName: sessionNameRaw,
        filePath: file.filePath,
        mtimeMs: file.mtimeMs,
        laps,
        bestLapSec: sessionBest,
        avgLapSec: sessionAvg,
        lapCount: laps.length
      });

      result.allLaps.push(...laps);
    } catch (_) {}
  }

  // Sort sessions by timestamp descending
  result.sessions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  // Global stats across all laps
  const allNonPit = result.allLaps.filter(l => !l.pit && isFinite(l.timeSec) && l.timeSec > 0);
  if (allNonPit.length > 0) {
    result.bestLapSec = Math.min(...allNonPit.map(l => l.timeSec));
    result.avgLapSec = allNonPit.reduce((a, l) => a + l.timeSec, 0) / allNonPit.length;

    // StdDev: exclude outliers > avg + 2*stdDev iteratively
    let times = allNonPit.map(l => l.timeSec);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const variance = times.reduce((a, t) => a + (t - avg) ** 2, 0) / times.length;
    const stdDevRaw = Math.sqrt(variance);
    const filtered = times.filter(t => t <= avg + 2 * stdDevRaw);
    if (filtered.length > 1) {
      const avg2 = filtered.reduce((a, b) => a + b, 0) / filtered.length;
      const variance2 = filtered.reduce((a, t) => a + (t - avg2) ** 2, 0) / filtered.length;
      result.stdDev = Math.sqrt(variance2);
    } else {
      result.stdDev = stdDevRaw;
    }
  }

  // Best sectors
  const s1Vals = result.allLaps.map(l => l.s1).filter(v => isFinite(v) && v > 0);
  const s2Vals = result.allLaps.map(l => l.s2).filter(v => isFinite(v) && v > 0);
  const s3Vals = result.allLaps.map(l => l.s3).filter(v => isFinite(v) && v > 0);
  result.bestS1 = s1Vals.length ? Math.min(...s1Vals) : NaN;
  result.bestS2 = s2Vals.length ? Math.min(...s2Vals) : NaN;
  result.bestS3 = s3Vals.length ? Math.min(...s3Vals) : NaN;

  result.totalLaps = result.allLaps.length;

  // Mark best lap isBest
  if (isFinite(result.bestLapSec)) {
    let marked = false;
    for (const lap of result.allLaps) {
      if (!marked && lap.timeSec === result.bestLapSec) {
        lap.isBest = true;
        marked = true;
      }
    }
    // Also mark in sessions
    for (const sess of result.sessions) {
      let sessMarked = false;
      for (const lap of sess.laps) {
        if (!sessMarked && lap.timeSec === result.bestLapSec) {
          lap.isBest = true;
          sessMarked = true;
        }
      }
    }
  }

  return result;
}

// Export des fonctions
if (typeof window !== 'undefined') {
  window.LMUStatsCalculator = {
    calculateDriverStats,
    calculateTrackStats,
    calculateVehicleStatsByClass,
    calculateTrackStatsForVehicle,
    getCachedDriverStats,
    getCachedTrackStats,
    getCachedVehicleStatsByClass,
    getCachedTrackStatsForVehicle,
    invalidateCache,
    getTracksForDriver,
    getTrackDetailStats
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateDriverStats,
    calculateTrackStats,
    calculateVehicleStatsByClass,
    calculateTrackStatsForVehicle,
    getCachedDriverStats,
    getCachedTrackStats,
    getCachedVehicleStatsByClass,
    getCachedTrackStatsForVehicle,
    invalidateCache,
    getTracksForDriver,
    getTrackDetailStats
  };
}

})(); // Fermeture de la fonction IIFE