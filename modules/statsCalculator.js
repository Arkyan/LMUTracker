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
  
  for (const file of lastScannedFiles) {
    if (file.error) continue;
    
    const session = extractSession(file.parsed);
    if (!session) continue;
    
    // Chercher le pilote dans cette session (nom exact ou dans l'équipe)
    const driver = session.drivers.find(d => 
      d.name === driverName || 
      (d.allDrivers && d.allDrivers.includes(driverName))
    );
    if (!driver) continue;
    
    stats.totalSessions++;
    
    // Détecter si c'est une course (présence de balise <Race> dans le XML)
    const rr = getRaceResultsRoot(file.parsed);
    if (rr && rr.Race) {
      stats.totalRaces++;
    }
    
    // Calculer podiums et victoires par classe (uniquement pour les courses)
    if (rr && rr.Race && isFinite(driver.classPosition) && driver.classPosition > 0) {
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
      const myDriver = session.drivers.find(d => 
        d.name === driverName || 
        (d.allDrivers && d.allDrivers.includes(driverName))
      );
      
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
      const vehicleName = myDriver.car || myDriver.team || myDriver.number || 'Voiture inconnue';
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
          totalLaps: 0
        };
      }
      const v = result[carClass][vehicleName];
      v.sessions++;
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
      delete o.allValidLaps;
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
      const derivedVehicle = myDriver.car || myDriver.team || myDriver.number || 'Voiture inconnue';
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
    invalidateCache
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
    invalidateCache
  };
}

})(); // Fermeture de la fonction IIFE