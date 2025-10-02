/**
 * Module de parsing des fichiers XML LMU
 * Dépend de: utils.js
 */

(function() {
  // Utiliser les fonctions utilitaires depuis le module utils
  const { arrayify, toNumber } = window.LMUUtils || {};

// Obtenir la racine RaceResults d'un fichier XML parsé
function getRaceResultsRoot(data) {
  return data?.rFactorXML?.RaceResults || data?.RaceResults || null;
}

// Choisir la session la plus pertinente (course > qualif > practice)
function pickSession(rr) {
  if (!rr) return null;
  
  const entries = Object.entries(rr).filter(([k, v]) => 
    v && typeof v === 'object' && ('Driver' in v)
  );
  
  if (entries.length === 0) return null;
  
  const priority = (k) => {
    const kk = k.toLowerCase();
    if (kk.includes('race')) return 100;
    if (kk.includes('qual')) return 80;
    if (kk.includes('practice') || kk.includes('practise')) return 60;
    if (kk.includes('warm')) return 50;
    return 10;
  };
  
  entries.sort((a, b) => priority(b[0]) - priority(a[0]));
  const [name, node] = entries[0];
  return { name, node };
}

// Extraire les changements de pilotes depuis le Stream et les Swaps
function extractDriverChanges(sessionNode) {
  const driverChangesByVehicle = {};
  const stream = sessionNode.Stream;
  
  // Traiter les DriverChange depuis le Stream
  if (stream && stream.DriverChange) {
    const changes = arrayify(stream.DriverChange);
    changes.forEach(change => {
      const changeText = change['#text'] || change;
      if (typeof changeText === 'string') {
        // Parser: Slot=X Vehicle="Team #XX:YY" Old="Pilote1" New="Pilote2"
        const slotMatch = changeText.match(/Slot=(\d+)/);
        const vehicleMatch = changeText.match(/Vehicle="([^"]+)"/);
        const oldMatch = changeText.match(/Old="([^"]+)"/);
        const newMatch = changeText.match(/New="([^"]+)"/);
        
        if (slotMatch && vehicleMatch && oldMatch && newMatch) {
          const vehicle = vehicleMatch[1];
          const oldDriver = oldMatch[1];
          const newDriver = newMatch[1];
          
          if (!driverChangesByVehicle[vehicle]) {
            driverChangesByVehicle[vehicle] = new Set([oldDriver]);
          }
          
          driverChangesByVehicle[vehicle].add(oldDriver);
          driverChangesByVehicle[vehicle].add(newDriver);
        }
      }
    });
  }
  
  // Traiter les Swaps directement dans les données de pilotes
  if (sessionNode.Driver) {
    const drivers = arrayify(sessionNode.Driver);
    drivers.forEach(driver => {
      const vehicleName = driver.VehName;
      if (vehicleName && driver.Swap) {
        const swaps = arrayify(driver.Swap);
        
        if (!driverChangesByVehicle[vehicleName]) {
          driverChangesByVehicle[vehicleName] = new Set();
        }
        
        // Ajouter le pilote principal
        if (driver.Name) {
          driverChangesByVehicle[vehicleName].add(driver.Name);
        }
        
        // Ajouter tous les pilotes des swaps
        swaps.forEach(swap => {
          const swapText = swap['#text'] || swap;
          if (typeof swapText === 'string') {
            driverChangesByVehicle[vehicleName].add(swapText);
          }
        });
      }
    });
  }
  
  // Convertir les Sets en arrays
  const result = {};
  for (const [vehicle, driversSet] of Object.entries(driverChangesByVehicle)) {
    result[vehicle] = Array.from(driversSet);
  }
  
  return result;
}

// Extraire les données des pilotes d'une session
function extractDrivers(sessionNode) {
  const driverChanges = extractDriverChanges(sessionNode);
  
  const drivers = arrayify(sessionNode.Driver).map((d, idx) => {
    const lapsRaw = arrayify(d.Lap);
    const laps = lapsRaw.map((lap) => {
      if (lap == null) return null;
      if (typeof lap === 'string' || typeof lap === 'number') {
        const t = toNumber(lap);
        return { 
          num: NaN, 
          timeSec: t, 
          s1: NaN, 
          s2: NaN, 
          s3: NaN, 
          topSpeed: NaN, 
          pit: false 
        };
      }
      const at = (k) => toNumber(lap[`@_${k}`]);
      const timeSec = toNumber(lap['#text']);
      return {
        num: toNumber(lap['@_num']),
        timeSec,
        s1: at('s1'),
        s2: at('s2'),
        s3: at('s3'),
        topSpeed: at('topspeed'),
        pit: String(lap['@_pit'] ?? '') === '1'
      };
    }).filter(Boolean);

    const validLapTimes = laps.map(l => l.timeSec).filter(t => isFinite(t) && t > 0);
    const bestLapSec = isFinite(toNumber(d.BestLapTime)) ? 
      toNumber(d.BestLapTime) : 
      Math.min(...validLapTimes);
    
    // Moyenne de tous les tours qui ont des temps valides
    const avgLapSec = validLapTimes.length ? 
      (validLapTimes.reduce((a, b) => a + b, 0) / validLapTimes.length) : 
      NaN;
    
    const validTopSpeeds = laps.map(l => l.topSpeed).filter(x => isFinite(x) && x > 0);
    const maxTop = validTopSpeeds.length > 0 ? Math.max(...validTopSpeeds) : NaN;

    // Chercher les pilotes supplémentaires via les DriverChanges
    const currentDriverName = d.Name || `Driver ${idx + 1}`;
    let allDrivers = [currentDriverName];
    
    // Trouver la voiture correspondante dans les changements de pilotes
    const vehicleName = d.VehName || '';
    if (driverChanges[vehicleName]) {
      allDrivers = [...driverChanges[vehicleName]];
    }

    return {
      position: toNumber(d.Position),
      classPosition: toNumber(d.ClassPosition),
      name: currentDriverName,
      allDrivers: allDrivers,
      displayName: allDrivers.length > 1 ? allDrivers.join(' / ') : currentDriverName,
      car: d.CarType || d.VehName || '',
      carClass: d.CarClass || '',
      number: d.CarNumber || '',
      team: d.TeamName || '',
      lapsCount: toNumber(d.Laps) || laps.length,
      pitstops: toNumber(d.Pitstops) || 0,
      bestLapSec,
      avgLapSec,
      topSpeedMax: isFinite(maxTop) ? maxTop : NaN,
      laps,
      finishStatus: d.FinishStatus || 'N/A'
    };
  });

  // Trier par classe puis par position de classe
  drivers.sort((a, b) => {
    const getClassPriority = window.LMUUtils?.getClassPriority || ((carClass) => {
      const classPriorities = {
        'Hyper': 1,
        'LMP2_ELMS': 2,
        'LMP2': 3,
        'LMP3': 4,
        'GT3': 5,
        'GTE': 6,
      };
      return classPriorities[carClass] || 999;
    });
    
    const classPriorityA = getClassPriority(a.carClass);
    const classPriorityB = getClassPriority(b.carClass);
    
    if (classPriorityA !== classPriorityB) {
      return classPriorityA - classPriorityB;
    }
    
    if (isFinite(a.classPosition) && isFinite(b.classPosition)) {
      return a.classPosition - b.classPosition;
    }
    
    return a.bestLapSec - b.bestLapSec;
  });

  return drivers;
}

// Extraire une session complète depuis un fichier XML parsé
function extractSession(parsed) {
  const rr = getRaceResultsRoot(parsed);
  if (!rr) return null;
  
  const picked = pickSession(rr);
  if (!picked) return null;
  
  const { name, node } = picked;

  // Extraire les événements du stream
  const stream = node.Stream || rr.Stream || null;
  const sectors = arrayify(stream?.Sector).map(s => ({ 
    et: toNumber(s?.['@_et'] ?? s?.et), 
    text: typeof s === 'string' ? s : (s?.['#text'] || '') 
  }));
  const scores = arrayify(stream?.Score).map(s => ({ 
    et: toNumber(s?.['@_et'] ?? s?.et), 
    text: typeof s === 'string' ? s : (s?.['#text'] || '') 
  }));
  const incidents = arrayify(stream?.Incident).map(s => ({ 
    et: toNumber(s?.['@_et'] ?? s?.et), 
    text: typeof s === 'string' ? s : (s?.['#text'] || '') 
  }));

  // Formatage de la date
  const formattedTime = window.LMUUtils?.formatDateTime ? 
    window.LMUUtils.formatDateTime(rr, null) : 
    rr.TimeString || '';

  const meta = {
    session: name,
    track: rr.TrackVenue || rr.TrackCourse || '',
    event: rr.TrackEvent || '',
    time: formattedTime,
    mostLaps: toNumber(node.MostLapsCompleted) || toNumber(rr.MostLapsCompleted) || NaN,
    sectors,
    scores,
    incidents
  };

  const drivers = extractDrivers(node);
  return { meta, drivers };
}

// Export des fonctions
if (typeof window !== 'undefined') {
  window.LMUXMLParser = {
    getRaceResultsRoot,
    pickSession,
    extractDriverChanges,
    extractDrivers,
    extractSession
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getRaceResultsRoot,
    pickSession,
    extractDriverChanges,
    extractDrivers,
    extractSession
  };
}

})(); // Fermeture de la fonction IIFE