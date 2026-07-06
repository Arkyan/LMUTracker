/**
 * Module de génération de HTML et rendu pour LMU Tracker
 * Dépend de: utils.js, xmlParser.js, statsCalculator.js
 */

(function() {
  // Utiliser les fonctions depuis les modules
  const { fmtTime, formatDateTime, getClassInfo, getSessionInfo } = window.LMUUtils || {};
  const { getRaceResultsRoot } = window.LMUXMLParser || {};

// Générer une ligne de session pour la liste de l'historique
function generateSessionRow(file) {
  const dt = file.mtimeIso ? new Date(file.mtimeIso) : null;
  const rr = getRaceResultsRoot(file.parsed);
  const event = rr?.TrackEvent || 'Session inconnue';
  const venue = rr?.TrackVenue || rr?.TrackCourse || 'Circuit inconnu';
  const timeString = formatDateTime(rr, dt);
  
  // Tags informatifs
  const raceTime = rr?.RaceTime ? `⏱️ Durée : ${rr.RaceTime}m` : null;
  
  // Logique pour mostLaps (reprise de la logique originale)
  const picked = window.LMUXMLParser?.pickSession ? window.LMUXMLParser.pickSession(rr) : null;
  const node = picked?.node;
  const mostLaps = window.LMUUtils?.toNumber ? 
    window.LMUUtils.toNumber(node?.MostLapsCompleted) || 
    window.LMUUtils.toNumber(rr?.MostLapsCompleted) || NaN : NaN;
  
  let finalLaps;
  if (isFinite(mostLaps) && mostLaps > 0) {
    finalLaps = mostLaps;
  } else {
    const fallbackLaps = rr?.RaceLaps ?? rr?.TotalLaps ?? rr?.LapsCompleted;
    finalLaps = window.LMUUtils?.toNumber ? window.LMUUtils.toNumber(fallbackLaps) : NaN;
  }

  // Extraire les informations de voiture et classe du pilote configuré dans les paramètres
  let carInfo = null;
  let classInfo = null;
  
  // Récupérer le nom du pilote configuré
  const configuredDriverName = window.LMUStorage ? window.LMUStorage.getConfiguredDriverName() : '';
  
  if (configuredDriverName && node && node.Driver) {
    const drivers = window.LMUUtils?.arrayify ? window.LMUUtils.arrayify(node.Driver) : [node.Driver];
    
    // Chercher le pilote configuré dans la liste des pilotes
    const playerDriver = drivers.find(driver => {
      const driverName = driver.Name || '';
      // Comparaison case-insensitive pour plus de flexibilité
      return driverName.toLowerCase().includes(configuredDriverName.toLowerCase());
    });
    
    if (playerDriver) {
      const car = playerDriver.CarType || playerDriver.VehType || playerDriver.VehName || '';
      const carClass = playerDriver.CarClass || '';
      
      if (car) {
        carInfo = `${car}`;
      }
      if (carClass) {
        const classDetails = getClassInfo ? getClassInfo(carClass) : { icon: '<i class="fas fa-flag-checkered"></i>', color: 'var(--accent)' };
        classInfo = `<span class="class-badge" style="background:${classDetails.color};">${carClass}</span>`;
      }
    }
  }

  const fileName = file.filePath.split(/\\|\//).pop();
  const disabled = !!file.error;

  return `<div class="data-row${disabled ? ' is-disabled' : ''}" data-file-path="${disabled ? '' : encodeURIComponent(file.filePath)}" title="${fileName}">
    <span class="data-row__icon"><i class="fas fa-flag-checkered"></i></span>
    <div class="data-row__primary">
      <div class="data-row__title">${event}</div>
      <div class="data-row__subtitle"><i class="fas fa-map-marker-alt"></i> ${venue} · ${timeString}</div>
    </div>
    ${carInfo ? `<div class="data-row__col"><span class="data-row__col-label">Voiture</span><span class="data-row__col-value">${carInfo}</span></div>` : ''}
    ${classInfo ? `<div class="data-row__col">${classInfo}</div>` : ''}
    ${disabled
      ? `<span class="chip chip--danger"><i class="fas fa-times-circle"></i> ${file.error}</span>`
      : '<span class="data-row__chevron"><i class="fas fa-chevron-right"></i></span>'}
  </div>`;
}

// Générer les cartes de sessions récentes pour le profil
function generateRecentSessionCards(sessions) {
  const cards = [];
  for (const session of sessions) {
    const sessionInfo = getSessionInfo(session.session);
    
    // Badge pour le mode de jeu
    const gameModeBadge = session.gameMode === 'Multijoueur'
      ? '<span class="badge-mode badge-mode--multi"><i class="fas fa-globe"></i> MULTI</span>'
      : '<span class="badge-mode badge-mode--solo"><i class="fas fa-user"></i> SOLO</span>';

    cards.push(`
    <div class="data-row">
      <span class="data-row__icon">${sessionInfo.icon}</span>
      <div class="data-row__primary">
        <div class="data-row__title">${session.event} ${sessionInfo.badge}${gameModeBadge}</div>
        <div class="data-row__subtitle">${session.track} · ${session.date}</div>
      </div>
      <div class="data-row__col">
        <span class="data-row__col-label">P${session.position || '?'}</span>
        <span class="data-row__col-value data-row__col-value--accent mono">${fmtTime(session.bestLap)}</span>
      </div>
    </div>`);
  }
  return `<div class="row-list">${cards.join('')}</div>`;
}

// Générer les cartes de circuit pour les statistiques par circuit
function generateTrackCards(trackStatsEntries, carClass = 'Hyper') {
  const cards = [];
  for (const track of trackStatsEntries) {
    // Utiliser les stats de la classe spécifique
    const stats = track.classStats && track.classStats[carClass] 
      ? track.classStats[carClass] 
      : null;
    
    if (!stats) continue; // Ignorer si pas de stats pour cette classe
    
    const bestLapText = isFinite(stats.bestLap) ? fmtTime(stats.bestLap) : '—';
    const avgLapText = isFinite(stats.avgLap) ? fmtTime(stats.avgLap) : '—';
    const topSpeedText = stats.topSpeed > 0 ? `${stats.topSpeed.toFixed(1)} km/h` : '—';
    const lastSessionText = track.lastSession > new Date(0) ? 
      track.lastSession.toLocaleDateString('fr-FR') : '—';
    
    // Utiliser les stats de la classe sélectionnée
    const sessionCount = stats.sessions || 0;
    const lapCount = stats.totalLaps || 0;
    
    cards.push(`
    <div class="track-card">
      <div class="track-card__header">
        <div class="track-card__title"><i class="fas fa-road"></i> ${track.trackName}</div>
        <div class="track-card__meta-row">
          <span class="track-card__meta-item"><i class="fas fa-chart-line"></i> ${sessionCount} session(s)</span>
          <span class="track-card__meta-item"><i class="fas fa-redo"></i> ${lapCount} tour(s)</span>
          <span class="track-card__meta-item"><i class="fas fa-calendar-alt"></i> ${lastSessionText}</span>
          <span class="track-card__class-tag"><i class="fas fa-flag-checkered"></i> ${carClass}</span>
        </div>
      </div>
      <div class="track-card__kpis">
        <div>
          <div class="track-card__kpi-label"><i class="fas fa-stopwatch"></i> MEILLEUR</div>
          <div class="track-card__kpi-value track-card__kpi-value--ok mono">${bestLapText}</div>
        </div>
        <div>
          <div class="track-card__kpi-label"><i class="fas fa-chart-line"></i> MOYENNE</div>
          <div class="track-card__kpi-value mono">${avgLapText}</div>
        </div>
        <div>
          <div class="track-card__kpi-label"><i class="fas fa-tachometer-alt"></i> V.MAX</div>
          <div class="track-card__kpi-value track-card__kpi-value--accent mono">${topSpeedText}</div>
        </div>
      </div>
    </div>`);
  }
  return cards.join('');
}

// Générer les boutons de filtre par classe
function generateClassFilterButtons(selectedCarClass) {
  const classes = ['Hyper','LMP2_ELMS', 'LMP2', 'LMP3', 'GT3', 'GTE'];
  const classIcons = {
    'Hyper': '<i class="fas fa-bolt"></i>',
    'LMP2': '<i class="fas fa-rocket"></i>', 
    'LMP2_ELMS': '<i class="fas fa-rocket"></i>',
    'LMP3': '<i class="fas fa-running"></i>',
    'GT3': '<i class="fas fa-car-side"></i>',
    'GTE': '<i class="fas fa-fire"></i>'
  };
  
  return classes.map(carClass => {
    const isActive = selectedCarClass === carClass;
    const icon = classIcons[carClass] || '<i class="fas fa-flag-checkered"></i>';
    return `
      <button
        class="btn class-filter-btn ${isActive ? 'primary' : ''}"
        onclick="filterByCarClass('${carClass}')"
      >
        ${icon} ${carClass}
      </button>
    `;
  }).join('');
}

// Fonction pour rendre une session complète dans un conteneur
function renderSessionInto(container, fileLabel, session) {
  const { meta, drivers } = session;
  let html = '';
  // fileLabel volontairement ignoré pour ne plus afficher le nom/chemin du fichier
  
  // En-tête de session
  html += `<div class="session-hero">
    <div class="session-hero__title"><i class="fas fa-flag-checkered"></i> ${meta.event || 'Session'}</div>
    <div class="row" style="gap:16px;flex-wrap:wrap;">
      <span class="chip"><i class="fas fa-road"></i> ${meta.track || ''}</span>
      <span class="chip"><i class="fas fa-calendar-alt"></i> ${meta.session}</span>
      <span class="chip"><i class="fas fa-clock"></i> ${meta.time || ''}</span>
      <span class="chip"><i class="fas fa-redo"></i> Tours max: ${isFinite(meta.mostLaps) ? meta.mostLaps : '—'}</span>
    </div>
  </div>`;
  
  // Tableau des résultats (plein largeur du conteneur)
  html += `<div style="overflow-x:auto;"><table class="table centered" style="width:100%;"><thead><tr>
    <th><i class="fas fa-trophy"></i></th><th>Pilote</th><th>Classe</th><th>Voiture</th><th><i class="fas fa-stopwatch"></i> Meilleur</th><th><i class="fas fa-chart-line"></i> Moyenne</th><th><i class="fas fa-redo"></i> Tours</th><th><i class="fas fa-gas-pump"></i> Pits</th><th><i class="fas fa-tachometer-alt"></i> V.Max</th><th><i class="fas fa-flag-checkered"></i> Statut</th>
  </tr></thead><tbody>`;
  
  // Grouper les pilotes par classe pour affichage séparé
  let currentClass = '';
  for (const d of drivers) {
    // Ajouter un séparateur de classe si on change de classe
    if (d.carClass && d.carClass !== currentClass) {
      currentClass = d.carClass;
      const classInfo = getClassInfo(currentClass);
      
      html += `<tr class="class-separator">
        <td colspan="10" class="class-separator-cell" style="background:rgb(from ${classInfo.color} r g b / 0.1);border-left:3px solid ${classInfo.color};color:${classInfo.color};">
          ${classInfo.icon} ${currentClass.toUpperCase()}
        </td>
      </tr>`;
    }

    const driverId = `drv_${(d.displayName||'').replace(/[^a-z0-9]/gi,'_')}_${Math.random().toString(36).slice(2,7)}`;

    // Badge de position
    const positionBadgeClass = d.classPosition === 1 ? 'badge-position--gold'
      : d.classPosition === 2 ? 'badge-position--silver'
      : d.classPosition === 3 ? 'badge-position--bronze'
      : 'badge-position--other';
    const positionBadge = isFinite(d.classPosition) && d.classPosition > 0 ?
      `<div class="badge ${positionBadgeClass}">${d.classPosition}</div>` : '';
    
    const classPositionDisplay = isFinite(d.classPosition) && d.classPosition > 0 ? `P${d.classPosition}` : '';
    const overallDisplay = isFinite(d.position) && d.position > 0 ? `(${d.position}e Overall)` : '';
    const positionText = classPositionDisplay && overallDisplay ? 
      `${classPositionDisplay} ${overallDisplay}` : classPositionDisplay || overallDisplay || 'N/A';
    
    // Tag de classe
    const classInfo = getClassInfo(d.carClass);
    const classTag = d.carClass ?
      `<span class="chip class-tag" style="background:${classInfo.color};">${d.carClass}</span>` : '';

    // Statut de fin
    const finishStatus = d.finishStatus || 'N/A';
    let statusDisplay = '';
    if (finishStatus === 'Finished Normally') {
      statusDisplay = `<span class="chip chip--success"><i class="fas fa-check"></i> FINI</span>`;
    } else if (finishStatus === 'DNF') {
      statusDisplay = `<span class="chip chip--danger"><i class="fas fa-times"></i> DNF</span>`;
    } else {
      statusDisplay = `<span class="chip chip--neutral"><i class="fas fa-question"></i> ${finishStatus}</span>`;
    }

    html += `<tr class="section-header" data-target="${driverId}" style="cursor:pointer;">
      <td>${positionBadge}<div class="driver-position-note">${positionText}</div></td>
      <td class="driver-name-cell">${d.displayName || d.name}</td>
      <td>${classTag}</td>
      <td><span class="chip">${d.car || ''}</span></td>
      <td class="driver-laptime-cell mono">${fmtTime(d.bestLapSec)}</td>
      <td class="driver-avglap-cell mono">${fmtTime(d.avgLapSec)}</td>
      <td class="mono">${d.lapsCount}</td>
      <td class="mono">${d.pitstops}</td>
      <td class="driver-topspeed-cell mono">${isFinite(d.topSpeedMax) ? d.topSpeedMax.toFixed(1)+' km/h' : '—'}</td>
      <td>${statusDisplay}</td>
    </tr>
    <tr class="section-content" id="${driverId}" style="display:none;">
      <td colspan="10">
        <div class="card driver-detail-card">
          <div class="driver-detail-card__title"><i class="fas fa-clipboard-list"></i> Tours détaillés</div>
          <div class="driver-detail-card__tables">
            ${generateLapDetailsTable(d.laps)}
          </div>
        </div>
      </td>
    </tr>`;
  }
  
  html += `</tbody></table></div>`;
  container.innerHTML = html;
  
  // Ajouter les événements de clic pour les détails des pilotes
  container.querySelectorAll('.section-header').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.getAttribute('data-target');
      const block = container.querySelector(`#${CSS.escape(id)}`);
      if (!block) return;
      const isHidden = getComputedStyle(block).display === 'none';
      block.style.display = isHidden ? '' : 'none';
    });
  });
}

// Générer le tableau des détails des tours
function generateLapDetailsTable(laps) {
  // Diviser les tours en deux colonnes
  const midPoint = Math.ceil(laps.length / 2);
  const leftLaps = laps.slice(0, midPoint);
  const rightLaps = laps.slice(midPoint);
  
  const createTableColumn = (lapsData, title) => `
    <div class="lap-table-col">
      <h4 class="lap-table-col__title">${title}</h4>
      <div style="overflow-x:auto;">
      <table class="table" style="width:100%;">
        <thead><tr>
          <th>#</th><th>Temps</th><th>S1</th><th>S2</th><th>S3</th><th>TopSpeed</th><th>Pit</th>
        </tr></thead>
        <tbody>
          ${lapsData.map(l => `<tr>
            <td class="mono">${isFinite(l.num) ? l.num : ''}</td>
            <td class="mono" style="font-weight:500;">${fmtTime(l.timeSec)}</td>
            <td class="mono">${isFinite(l.s1) ? l.s1.toFixed(3) : ''}</td>
            <td class="mono">${isFinite(l.s2) ? l.s2.toFixed(3) : ''}</td>
            <td class="mono">${isFinite(l.s3) ? l.s3.toFixed(3) : ''}</td>
            <td class="mono">${isFinite(l.topSpeed) && l.topSpeed > 0 ? l.topSpeed.toFixed(1)+' km/h' : '—'}</td>
            <td>${l.pit ? '<span class="chip chip--warning"><i class="fas fa-gas-pump"></i> Pit</span>' : ''}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      </div>
    </div>
  `;

  let html = '';
  if (leftLaps.length > 0) {
    html += createTableColumn(leftLaps, `Tours 1-${leftLaps.length}`);
  }
  if (rightLaps.length > 0) {
    html += createTableColumn(rightLaps, `Tours ${leftLaps.length + 1}-${laps.length}`);
  }
  return html;
}

// Export des fonctions
if (typeof window !== 'undefined') {
  window.LMURenderEngine = {
    generateSessionRow,
    generateRecentSessionCards,
    generateTrackCards,
    generateClassFilterButtons,
    renderSessionInto,
    generateLapDetailsTable
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateSessionRow,
    generateRecentSessionCards,
    generateTrackCards,
    generateClassFilterButtons,
    renderSessionInto,
    generateLapDetailsTable
  };
}

})(); // Fermeture de la fonction IIFE