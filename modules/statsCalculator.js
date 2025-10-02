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

// Invalider le cache
function invalidateCache() {
  cachedStats = null;
  cachedTrackStats = null;
}

// Export des fonctions
if (typeof window !== 'undefined') {
  window.LMUStatsCalculator = {
    calculateDriverStats,
    calculateTrackStats,
    getCachedDriverStats,
    getCachedTrackStats,
    invalidateCache
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateDriverStats,
    calculateTrackStats,
    getCachedDriverStats,
    getCachedTrackStats,
    invalidateCache
  };
}

})(); // Fermeture de la fonction IIFE