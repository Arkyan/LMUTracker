/**
 * Module de génération de HTML et rendu pour LMU Tracker
 * Dépend de: utils.js, xmlParser.js, statsCalculator.js
 */

(function() {
  // Utiliser les fonctions depuis les modules
  const { fmtTime, formatDateTime, getClassInfo, getSessionInfo } = window.LMUUtils || {};
  const { getRaceResultsRoot } = window.LMUXMLParser || {};

// Générer une carte de session pour la liste des fichiers
function generateSessionCard(file) {
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

  const raceLaps = isFinite(finalLaps) && finalLaps > 0 ? `🔄 Tours : ${finalLaps}` : null;
  const trackLength = rr?.TrackLength ? 
    `📏 Circuit : ${parseFloat(rr.TrackLength).toFixed(1)}m` : null;
  const fileName = file.filePath.split(/\\|\//).pop();
  const disabled = !!file.error;
  
  const statsChips = [raceTime, raceLaps, trackLength].filter(Boolean)
    .map(stat => `<span class="chip" style="font-size:11px;">${stat}</span>`).join(' ');
  
  return `<div class="card" style="cursor:${disabled ? 'not-allowed' : 'pointer'};opacity:${disabled ? 0.6 : 1};transition:transform 0.2s, box-shadow 0.2s;" data-file-path="${disabled ? '' : encodeURIComponent(file.filePath)}">
    <div style="margin-bottom:12px;">
      <div style="font-weight:700;color:var(--text);font-size:18px;margin-bottom:4px;">
        🏁 ${event}
      </div>
      <div style="color:var(--muted);font-size:14px;margin-bottom:8px;">
        📍 ${venue}
      </div>
      <div style="color:var(--muted);font-size:12px;margin-bottom:8px;">
        📅 ${timeString}
      </div>
      ${statsChips ? `<div style="margin-bottom:8px;">${statsChips}</div>` : ''}
      <div style="color:var(--muted);font-size:10px;word-break:break-all;">
        📄 ${fileName}
      </div>
      ${file.error ? `<div style="color:var(--err);font-size:12px;margin-top:8px;">❌ ${file.error}</div>` : ''}
    </div>
    ${disabled ? '<span class="chip" style="background:var(--err);color:#000;">Erreur</span>' : '<span class="chip" style="background:var(--brand);color:#fff;">Voir les stats →</span>'}
  </div>`;
}

// Générer les cartes de sessions récentes pour le profil
function generateRecentSessionCards(sessions) {
  const cards = [];
  for (const session of sessions) {
    const sessionInfo = getSessionInfo(session.session);
    
    // Badge pour le mode de jeu
    const gameModeBadge = session.gameMode === 'Multijoueur' 
      ? '<span style="background:#8b5cf6;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-left:4px;">🌐 MULTI</span>'
      : '<span style="background:#64748b;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-left:4px;">👤 SOLO</span>';
    
    cards.push(`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--panel);border-radius:8px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="font-size:20px;">${sessionInfo.icon}</div>
        <div>
          <div style="font-weight:600;color:var(--text);margin-bottom:4px;">${session.event}</div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:4px;">${session.track} • ${session.date}</div>
          <div>${sessionInfo.badge}${gameModeBadge}</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:600;color:var(--ok);">${fmtTime(session.bestLap)}</div>
        <div style="font-size:12px;color:var(--muted);">P${session.position || '?'}</div>
      </div>
    </div>`);
  }
  return cards.join('');
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
    <div style="padding:16px;background:var(--panel);border-radius:8px;border:2px solid var(--border);border-left:4px solid var(--accent);box-shadow:0 2px 8px rgba(0,0,0,0.1);">
      <div style="margin-bottom:12px;">
        <div style="font-weight:600;color:var(--text);margin-bottom:6px;">🏎️ ${track.trackName}</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
          <span style="font-size:12px;color:var(--muted);">📊 ${sessionCount} session(s)</span>
          <span style="font-size:12px;color:var(--muted);">🔄 ${lapCount} tour(s)</span>
          <span style="font-size:12px;color:var(--muted);">📅 ${lastSessionText}</span>
          <span style="font-size:12px;color:var(--accent);font-weight:600;">🏁 ${carClass}</span>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;text-align:center;">
        <div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:4px;">⏱️ MEILLEUR</div>
          <div style="font-weight:600;color:var(--ok);font-size:14px;">${bestLapText}</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:4px;">📊 MOYENNE</div>
          <div style="font-weight:600;color:var(--text);font-size:14px;">${avgLapText}</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--muted);margin-bottom:4px;">🚀 V.MAX</div>
          <div style="font-weight:600;color:var(--accent);font-size:14px;">${topSpeedText}</div>
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
    'Hyper': '⚡',
    'LMP2': '🚀', 
    'LMP2_ELMS': '🚀',
    'LMP3': '🏃',
    'GT3': '🏎️',
    'GTE': '🔥'
  };
  
  return classes.map(carClass => {
    const isActive = selectedCarClass === carClass;
    const icon = classIcons[carClass] || '🏁';
    return `
      <button 
        class="btn ${isActive ? 'primary' : ''}" 
        style="font-size:12px;padding:6px 12px;${isActive ? '' : 'background:var(--panel);color:var(--text);'}"
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
  
  if (fileLabel) html += `<h3 style="margin-bottom:12px;">${fileLabel}</h3>`;
  
  // En-tête de session
  html += `<div style="background:linear-gradient(135deg,rgba(96,165,250,0.1),rgba(167,139,250,0.1));border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:20px;">
    <div style="font-size:18px;font-weight:600;margin-bottom:8px;color:var(--accent);">🏁 ${meta.event || 'Session'}</div>
    <div class="row" style="gap:16px;flex-wrap:wrap;">
      <span class="chip">🏎️ ${meta.track || ''}</span>
      <span class="chip">📅 ${meta.session}</span>
      <span class="chip">🕐 ${meta.time || ''}</span>
      <span class="chip">🔄 Tours max: ${isFinite(meta.mostLaps) ? meta.mostLaps : '—'}</span>
    </div>
  </div>`;
  
  // Tableau des résultats
  html += `<table class="table"><thead><tr>
    <th>🏆</th><th>Pilote</th><th>Classe</th><th>Voiture</th><th>⏱️ Meilleur</th><th>📊 Moyenne</th><th>🔄 Tours</th><th>⛽ Pits</th><th>🚀 V.Max</th><th>🏁 Statut</th>
  </tr></thead><tbody>`;
  
  // Grouper les pilotes par classe pour affichage séparé
  let currentClass = '';
  for (const d of drivers) {
    // Ajouter un séparateur de classe si on change de classe
    if (d.carClass && d.carClass !== currentClass) {
      currentClass = d.carClass;
      const classInfo = getClassInfo(currentClass);
      
      html += `<tr class="class-separator">
        <td colspan="10" style="background:${classInfo.color};color:#fff;font-weight:700;text-align:center;padding:12px;border:none;font-size:14px;">
          ${classInfo.icon} CLASSE ${currentClass.toUpperCase()}
        </td>
      </tr>`;
    }
    
    const driverId = `drv_${(d.displayName||'').replace(/[^a-z0-9]/gi,'_')}_${Math.random().toString(36).slice(2,7)}`;
    
    // Badge de position
    const positionBadge = isFinite(d.classPosition) && d.classPosition > 0 ? 
      `<div class="badge" style="background:${d.classPosition === 1 ? 'linear-gradient(135deg,#fbbf24,#f59e0b)' : 
      d.classPosition === 2 ? 'linear-gradient(135deg,#94a3b8,#64748b)' : 
      d.classPosition === 3 ? 'linear-gradient(135deg,#fb923c,#ea580c)' : 
      'linear-gradient(135deg,var(--accent),var(--brand))'}">${d.classPosition}</div>` : '';
    
    const classPositionDisplay = isFinite(d.classPosition) && d.classPosition > 0 ? `P${d.classPosition}` : '';
    const overallDisplay = isFinite(d.position) && d.position > 0 ? `(${d.position}e Overall)` : '';
    const positionText = classPositionDisplay && overallDisplay ? 
      `${classPositionDisplay} ${overallDisplay}` : classPositionDisplay || overallDisplay || 'N/A';
    
    // Tag de classe
    const classInfo = getClassInfo(d.carClass);
    const classTag = d.carClass ? 
      `<span class="chip" style="background:${classInfo.color};color:#fff;border:none;font-weight:600;font-size:11px;">${d.carClass}</span>` : '';
    
    // Statut de fin
    const finishStatus = d.finishStatus || 'N/A';
    let statusDisplay = '';
    if (finishStatus === 'Finished Normally') {
      statusDisplay = `<span class="chip" style="background:#22c55e;color:#fff;border:none;font-weight:600;font-size:11px;">✅ FINI</span>`;
    } else if (finishStatus === 'DNF') {
      statusDisplay = `<span class="chip" style="background:#ef4444;color:#fff;border:none;font-weight:600;font-size:11px;">❌ DNF</span>`;
    } else {
      statusDisplay = `<span class="chip" style="background:var(--muted);color:#fff;border:none;font-weight:600;font-size:11px;">❓ ${finishStatus}</span>`;
    }
    
    html += `<tr class="section-header" data-target="${driverId}" style="cursor:pointer;">
      <td>${positionBadge}<div style="font-size:11px;color:var(--muted);margin-top:2px;">${positionText}</div></td>
      <td style="font-weight:600;color:var(--text);">${d.displayName || d.name}</td>
      <td>${classTag}</td>
      <td><span class="chip">${d.car || ''}</span></td>
      <td style="font-weight:600;color:var(--ok);">${fmtTime(d.bestLapSec)}</td>
      <td style="color:var(--muted);">${fmtTime(d.avgLapSec)}</td>
      <td>${d.lapsCount}</td>
      <td>${d.pitstops}</td>
      <td style="font-weight:600;color:var(--accent);">${isFinite(d.topSpeedMax) ? d.topSpeedMax.toFixed(1)+' km/h' : '—'}</td>
      <td>${statusDisplay}</td>
    </tr>
    <tr class="section-content" id="${driverId}" style="display:none;">
      <td colspan="10">
        <div class="card" style="margin:8px;background:var(--panel);">
          <div style="font-weight:600;margin-bottom:12px;color:var(--accent);">📋 Tours détaillés</div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;">
            ${generateLapDetailsTable(d.laps)}
          </div>
        </div>
      </td>
    </tr>`;
  }
  
  html += `</tbody></table>`;
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
    <div style="flex:1;min-width:300px;">
      <h4 style="margin:0 0 8px 0;color:var(--muted);font-size:14px;">${title}</h4>
      <table class="table">
        <thead><tr>
          <th>#</th><th>Temps</th><th>S1</th><th>S2</th><th>S3</th><th>TopSpeed</th><th>Pit</th>
        </tr></thead>
        <tbody>
          ${lapsData.map(l => `<tr>
            <td>${isFinite(l.num) ? l.num : ''}</td>
            <td style="font-weight:500;">${fmtTime(l.timeSec)}</td>
            <td>${isFinite(l.s1) ? l.s1.toFixed(3) : ''}</td>
            <td>${isFinite(l.s2) ? l.s2.toFixed(3) : ''}</td>
            <td>${isFinite(l.s3) ? l.s3.toFixed(3) : ''}</td>
            <td>${isFinite(l.topSpeed) && l.topSpeed > 0 ? l.topSpeed.toFixed(1)+' km/h' : '—'}</td>
            <td>${l.pit ? '<span class="chip" style="background:var(--warn);color:#000;">⛽ Pit</span>' : ''}</td>
          </tr>`).join('')}
        </tbody>
      </table>
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
    generateSessionCard,
    generateRecentSessionCards,
    generateTrackCards,
    generateClassFilterButtons,
    renderSessionInto,
    generateLapDetailsTable
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateSessionCard,
    generateRecentSessionCards,
    generateTrackCards,
    generateClassFilterButtons,
    renderSessionInto,
    generateLapDetailsTable
  };
}

})(); // Fermeture de la fonction IIFE