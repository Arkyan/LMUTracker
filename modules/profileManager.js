/**
 * Module de gestion du profil pilote pour LMU Tracker
 * Dépend de: storage.js, statsCalculator.js, renderEngine.js, navigation.js
 */

(function() {
  // Version UI pour invalider le cache du profil quand la structure change
  const UI_PROFILE_VERSION = 6;
  // Dernières stats calculées, conservées pour ré-instancier le graphique
  // même quand le HTML provient du cache (le HTML seul ne suffit pas à
  // redessiner un <canvas>).
  let lastComputedStats = null;

  // Générer le contenu complet du profil pilote
  function generateProfileContent() {
  const container = document.getElementById('profileContent');
  if (!container) return;

  const driverName = window.LMUStorage ? window.LMUStorage.getConfiguredDriverName() : '';
  const lastScannedFiles = window.LMUFileManager ? window.LMUFileManager.getLastScannedFiles() : null;
  const selectedCarClass = window.LMUNavigation ? window.LMUNavigation.getSelectedCarClass() : 'Hyper';

  // Paramètres pour le cache
  const cacheParams = {
    driverName,
    filesLength: lastScannedFiles?.length || 0,
    selectedCarClass,
    uiVersion: UI_PROFILE_VERSION
  };

  // Vérifier le cache d'abord
  if (window.LMUCacheManager) {
    const cachedContent = window.LMUCacheManager.getCachedContent('profile', cacheParams);
    if (cachedContent) {
      container.innerHTML = cachedContent;
      renderPositionEvolutionChart(lastComputedStats);
      return;
    }
  }

  if (!driverName) {
    const emptyContent = generateEmptyProfileContent();
    container.innerHTML = emptyContent;
    // Pas besoin de cacher le contenu vide
    return;
  }

  // Calculer les statistiques depuis les sessions scannées (avec cache)
  const stats = window.LMUStatsCalculator ?
    window.LMUStatsCalculator.getCachedDriverStats(driverName, lastScannedFiles) : null;
  const trackStats = window.LMUStatsCalculator ?
    window.LMUStatsCalculator.getCachedTrackStats(driverName, lastScannedFiles, selectedCarClass) : {};
  const vehicleStatsByClass = window.LMUStatsCalculator ?
    window.LMUStatsCalculator.getCachedVehicleStatsByClass(driverName, lastScannedFiles) : {};

  // Vérifier si on a des données
  if (!stats || !lastScannedFiles || lastScannedFiles.length === 0) {
    const noDataContent = generateNoDataContent();
    container.innerHTML = noDataContent;
    return;
  }

  lastComputedStats = stats;

  let html = generateWelcomeSection(driverName, stats);
  html += `<div class="profile-grid">${generatePositionEvolutionPanel(stats)}${generateRecentSessionsSection(stats)}</div>`;

  container.innerHTML = html;
  renderPositionEvolutionChart(stats);

  // Mettre en cache le contenu généré
  if (window.LMUCacheManager) {
    window.LMUCacheManager.setCachedContent('profile', html, cacheParams);
  }
}

// Panneau conteneur du graphique d'évolution du classement (canvas rempli
// après injection du HTML, voir renderPositionEvolutionChart)
function generatePositionEvolutionPanel(stats) {
  return `
    <div class="card">
      <h3 style="margin:0 0 16px 0;color:var(--accent);"><i class="fas fa-chart-line"></i> Évolution du classement</h3>
      <div style="position:relative;height:280px;">
        <canvas id="chart-position-evolution"></canvas>
      </div>
    </div>
  `;
}

// Instancie le graphique Chart.js à partir de stats.recentSessions
// (position + date déjà disponibles, aucun nouveau calcul nécessaire)
function renderPositionEvolutionChart(stats) {
  if (!window.LMUCharts || !stats || !Array.isArray(stats.recentSessions)) return;

  const entries = stats.recentSessions
    .filter(s => Number.isFinite(s.position) && s.position > 0)
    .slice(0, 30)
    .slice()
    .reverse(); // chronologique (le plus ancien à gauche)

  if (entries.length === 0) return;

  const colors = window.LMUCharts.themeColors();
  const labels = entries.map(s => (s.date || '').split(' à ')[0]);
  const positions = entries.map(s => s.position);
  const maxPosition = Math.max(...positions);

  window.LMUCharts.renderChart('chart-position-evolution', {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Position',
        data: positions,
        borderColor: colors.accent,
        backgroundColor: colors.accent,
        pointBackgroundColor: colors.accent,
        pointRadius: 3,
        tension: 0.25,
        fill: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          reverse: true,
          min: 1,
          max: Math.max(maxPosition, 3),
          ticks: { stepSize: 1, color: colors.textSecondary },
          grid: { color: colors.border },
          title: { display: true, text: 'Position', color: colors.textSecondary }
        },
        x: {
          ticks: { color: colors.textSecondary, maxRotation: 0, autoSkip: true },
          grid: { display: false }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => entries[items[0].dataIndex].event,
            label: (item) => {
              const s = entries[item.dataIndex];
              return [`Position: P${s.position}`, `${s.track} · ${s.date}`];
            }
          }
        }
      }
    }
  });
}

// Générer le contenu pour un profil vide (pas de pilote configuré)
function generateEmptyProfileContent() {
  return `
    <div class="card no-hover" style="text-align:center;padding:40px;color:var(--muted);">
      <div style="font-size:48px;margin-bottom:16px;"><i class="fas fa-flag-checkered" style="font-size:48px;"></i></div>
      <h3 style="margin-bottom:12px;color:var(--text);">Aucun nom de pilote configuré</h3>
      <p style="margin-bottom:20px;">Veuillez configurer votre nom de pilote dans les paramètres pour voir vos statistiques.</p>
      <button class="btn primary" onclick="switchView('settings')"><i class="fas fa-cog"></i> Aller aux paramètres</button>
    </div>
  `;
}

// Générer le contenu quand aucune session n'est disponible
function generateNoDataContent() {
  return `
    <div class="card no-hover" style="text-align:center;padding:40px;color:var(--muted);">
      <div style="font-size:48px;margin-bottom:16px;"><i class="fas fa-folder-open" style="font-size:48px;"></i></div>
      <h3 style="margin-bottom:12px;color:var(--text);">Aucune donnée disponible</h3>
      <p style="margin-bottom:20px;">Aucune session n'a été trouvée dans le dossier configuré.<br>Vérifiez que le dossier contient des fichiers de résultats LMU.</p>
      <button class="btn primary" onclick="switchView('settings')"><i class="fas fa-cog"></i> Configurer le dossier</button>
    </div>
  `;
}

// Générer la section de bienvenue avec les statistiques principales
function generateWelcomeSection(driverName, stats) {
  if (!stats) return '';
  
  return `
    <div style="margin-bottom:16px;">
      <h2 style="margin:0 0 4px 0;font-size:19px;font-weight:700;color:var(--text-primary);">
        <i class="fas fa-flag-checkered" style="color:var(--accent);margin-right:8px;"></i>Bonjour, ${driverName}
      </h2>
      <p class="muted" style="margin:0;">Tableau de bord Le Mans Ultimate</p>
    </div>
    <div class="dashboard-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:20px;">
      <div class="stat-tile">
        <div class="stat-tile__label">Sessions</div>
        <div class="stat-tile__value">${stats.totalSessions}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Courses</div>
        <div class="stat-tile__value stat-tile__value--accent">${stats.totalRaces}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Victoires</div>
        <div class="stat-tile__value stat-tile__value--gold">${stats.totalWins}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Podiums</div>
        <div class="stat-tile__value stat-tile__value--purple">${stats.totalPodiums}</div>
      </div>
    </div>
  `;
}

// Générer la section Performance par Circuit
function generateTrackPerformanceSection(trackStats, selectedCarClass, lastScannedFiles) {
  const trackStatsEntries = Object.values(trackStats);
  
  if (trackStatsEntries.length > 0) {
    // Trier par nombre de sessions décroissant
    trackStatsEntries.sort((a, b) => b.sessions - a.sessions);
    
    // Filtrer par classe sélectionnée
    const filteredTrackStats = trackStatsEntries.filter(track => 
      track.classStats && track.classStats[selectedCarClass]
    );
    
    const filterButtons = window.LMURenderEngine ? 
      window.LMURenderEngine.generateClassFilterButtons(selectedCarClass) : '';
    const trackCards = window.LMURenderEngine ? 
      window.LMURenderEngine.generateTrackCards(filteredTrackStats, selectedCarClass) : '';
    
    return `
      <div class="card" style="margin-bottom:24px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3 style="margin:0;color:var(--accent);"><i class="fas fa-flag-checkered"></i> Performance par Circuit</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${filterButtons}
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;">
          ${trackCards}
        </div>
      </div>
    `;
  } else {
    // Section de debug/info si pas de données
    return `
      <div class="card" style="margin-bottom:24px;">
        <h3 style="margin:0 0 16px 0;color:var(--accent);"><i class="fas fa-flag-checkered"></i> Performance par Circuit</h3>
        <div style="padding:16px;background:var(--panel);border-radius:8px;text-align:center;color:var(--muted);">
          <p>Aucune donnée de circuit trouvée.</p>
          ${lastScannedFiles ? `<p style="font-size:12px;">Fichiers scannés: ${lastScannedFiles.length}</p>` : ''}
        </div>
      </div>
    `;
  }
}

// Générer la section des sessions récentes
function generateRecentSessionsSection(stats) {
  if (!stats || !stats.recentSessions) return '';
  
  if (stats.recentSessions.length > 0) {
    const recentSessionCards = window.LMURenderEngine ? 
      window.LMURenderEngine.generateRecentSessionCards(stats.recentSessions.slice(0, 5)) : '';
    
    return `
      <div class="card">
        <h3 style="margin:0 0 16px 0;color:var(--accent);"><i class="fas fa-calendar-alt"></i> Sessions récentes</h3>
        ${recentSessionCards}
        ${stats.recentSessions.length > 5 ? `
          <div style="margin-top:16px;text-align:center;">
            <button class="btn" onclick="switchView('history')"><i class="fas fa-chart-line"></i> Voir tout l'historique</button>
          </div>
        ` : ''}
      </div>
    `;
  } else {
    return `
      <div class="card no-hover" style="text-align:center;padding:40px;">
        <div style="font-size:48px;margin-bottom:16px;opacity:0.6;"><i class="fas fa-chart-bar" style="font-size:48px;"></i></div>
        <h3 style="margin-bottom:12px;color:var(--text);">Aucune session trouvée</h3>
        <p style="margin-bottom:20px;color:var(--muted);">Configurez votre dossier de résultats pour voir vos statistiques.</p>
        <button class="btn primary" onclick="switchView('settings')"><i class="fas fa-cog"></i> Configurer le dossier</button>
      </div>
    `;
  }
}

// Nouvelle section: performances par voiture et par classe
function generateCarClassPerformanceSection(vehicleStatsByClass) {
  const { fmtTime } = window.LMUUtils || {};
  const classNames = Object.keys(vehicleStatsByClass || {});
  if (classNames.length === 0) return '';
  
  // Générer un bloc par classe
  const sections = classNames.sort((a,b) => (window.LMUUtils?.getClassPriority(a)||999) - (window.LMUUtils?.getClassPriority(b)||999)).map(cls => {
    const vehicles = vehicleStatsByClass[cls] || [];
    if (vehicles.length === 0) return '';
    const rows = vehicles.map(v => `
      <tr data-vehicle="${v.vehicleName}" data-class="${cls}">
        <td>${v.vehicleName}</td>
        <td style="text-align:center;">${v.sessions}</td>
        <td style="text-align:center;">${fmtTime ? fmtTime(v.bestLap) : v.bestLap?.toFixed?.(3) || '—'}</td>
        <td style="text-align:center;">${fmtTime ? fmtTime(v.avgLap) : v.avgLap?.toFixed?.(3) || '—'}</td>
        <td style="text-align:center;">${isFinite(v.topSpeed) && v.topSpeed > 0 ? `${Math.round(v.topSpeed)} km/h` : '—'}</td>
      </tr>
    `).join('');
    return `
      <div class="card" style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <h3 style="margin:0;color:var(--accent);"><i class="fas fa-car"></i> ${cls}</h3>
        </div>
        <div style="overflow:auto;">
          <table class="table centered" style="width:100%;">
            <thead>
              <tr>
                <th style="text-align:left;">Voiture</th>
                <th>Sessions</th>
                <th>Meilleur tour</th>
                <th>Moyenne tours</th>
                <th>Vitesse max</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');
  
  return `
    <div class="card" style="margin-bottom:24px;">
      <h3 style="margin:0 0 12px 0;color:var(--accent);"><i class="fas fa-car"></i> Performances par voiture et par classe</h3>
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${sections}
      </div>
    </div>
  `;
}

// Page Voitures: grille de cards (sans stats), groupées par classe
function generateVehicleCardsPage(vehicleStatsByClass) {
  const { fmtTime, getClassInfo } = window.LMUUtils || {};
  const classNames = Object.keys(vehicleStatsByClass || {});
  if (classNames.length === 0) {
    return `
      <div class="card no-hover" style="text-align:center;padding:40px;">
        <div style="font-size:48px;margin-bottom:16px;"><i class="fas fa-car"></i></div>
        <h3 style="margin-bottom:12px;color:var(--text);">Aucune voiture trouvée</h3>
        <p class="muted">Assurez-vous d'avoir scanné des sessions et d'avoir un pilote configuré.</p>
      </div>
    `;
  }
  const sections = classNames.sort((a,b) => (window.LMUUtils?.getClassPriority(a)||999) - (window.LMUUtils?.getClassPriority(b)||999)).map(cls => {
    const vehicles = vehicleStatsByClass[cls] || [];
    if (vehicles.length === 0) return '';
    const classDetails = getClassInfo ? getClassInfo(cls) : { icon: '<i class="fas fa-flag-checkered"></i>', color: 'var(--accent)' };
    const cards = vehicles.map(v => {
      const sessionsText = `${v.sessions ?? 0}`;
      const lapsText = `${v.totalLaps ?? 0}`;
      const circuitsText = `${v.circuits ?? 0}`;

      return `
        <div class="data-row" data-vehicle="${v.vehicleName}" data-class="${cls}" role="button" tabindex="0">
          <span class="data-row__icon"><i class="fas fa-car-side"></i></span>
          <div class="data-row__primary">
            <div class="data-row__title">${v.vehicleName}</div>
          </div>
          <div class="data-row__col">
            <span class="data-row__col-label">Sessions</span>
            <span class="data-row__col-value">${sessionsText}</span>
          </div>
          <div class="data-row__col">
            <span class="data-row__col-label">Tours</span>
            <span class="data-row__col-value">${lapsText}</span>
          </div>
          <div class="data-row__col">
            <span class="data-row__col-label">Circuits</span>
            <span class="data-row__col-value">${circuitsText}</span>
          </div>
          <span class="data-row__chevron"><i class="fas fa-chevron-right"></i></span>
        </div>
      `;
    }).join('');
    return `
      <div class="vehicle-class-section">
        <div class="vehicle-class-header">
          <div class="vehicle-class-title" style="color:${classDetails.color};">${classDetails.icon} ${cls}</div>
          <div class="muted" style="font-size:12px;">${vehicles.length} voiture${vehicles.length > 1 ? 's' : ''}</div>
        </div>
        <div class="row-list">
          ${cards}
        </div>
      </div>
    `;
  }).join('');
  return `
    <div>
      <div class="vehicle-page-header">
        <div>
          <h2 style="margin:0;"><i class="fas fa-car"></i> Voitures</h2>
          <div class="muted" style="margin-top:4px;">Clique sur une voiture pour voir les stats par circuit.</div>
        </div>
      </div>
      ${sections}
    </div>
  `;
}

// Page détail véhicule: stats par circuit pour un véhicule et une classe
function generateVehicleTrackPerformanceSection(vehicleName, carClass, trackStats) {
  const { fmtTime } = window.LMUUtils || {};
  const entries = Object.values(trackStats || {});
  const topSpeedOverall = entries.reduce((max, t) => (isFinite(t.topSpeed) && t.topSpeed > 0) ? Math.max(max, t.topSpeed) : max, 0);
  const sessionsOverall = entries.reduce((sum, t) => sum + (t.sessions || 0), 0);
  const lapsOverall = entries.reduce((sum, t) => sum + (t.totalLaps || 0), 0);

  const header = `
    <div class="vehicle-detail-header">
      <button class="btn" onclick="switchView('vehicles')"><i class="fas fa-arrow-left"></i> Retour</button>
      <div class="vehicle-badge" style="background:var(--accent);"><i class="fas fa-flag-checkered"></i> ${carClass}</div>
    </div>
    <div class="vehicle-detail-hero">
      <div class="vehicle-detail-hero__title"><i class="fas fa-car"></i> ${vehicleName}</div>
      <div class="vehicle-detail-kpis">
        <div class="vehicle-kpi">
          <div class="vehicle-kpi__label">Circuits</div>
          <div class="vehicle-kpi__value">${entries.length}</div>
        </div>
        <div class="vehicle-kpi">
          <div class="vehicle-kpi__label">Sessions</div>
          <div class="vehicle-kpi__value">${sessionsOverall}</div>
        </div>
        <div class="vehicle-kpi">
          <div class="vehicle-kpi__label">Tours</div>
          <div class="vehicle-kpi__value">${lapsOverall}</div>
        </div>
        <div class="vehicle-kpi">
          <div class="vehicle-kpi__label">V.Max</div>
          <div class="vehicle-kpi__value vehicle-kpi__value--accent">${(isFinite(topSpeedOverall) && topSpeedOverall > 0) ? `${Math.round(topSpeedOverall)} km/h` : '—'}</div>
        </div>
      </div>
    </div>
  `;
  if (entries.length === 0) {
    return `
      ${header}
      <div class="card" style="padding:16px;">
        <p class="muted">Aucune donnée trouvée pour ce véhicule dans la classe ${carClass}.</p>
      </div>
    `;
  }
  // trier par nb de sessions desc
  entries.sort((a,b)=> b.sessions - a.sessions);
  const rows = entries.map(t => `
    <tr>
      <td style="text-align:left;">${t.trackName}</td>
      <td style="text-align:center;">${t.sessions}</td>
      <td style=\"text-align:center;\">${t.totalLaps || 0}</td>
      <td style="text-align:center;">${fmtTime ? fmtTime(t.bestLap) : t.bestLap?.toFixed?.(3) || '—'}</td>
      <td style="text-align:center;">${fmtTime ? fmtTime(t.avgLap) : t.avgLap?.toFixed?.(3) || '—'}</td>
      <td style="text-align:center;">${isFinite(t.topSpeed) && t.topSpeed > 0 ? `${Math.round(t.topSpeed)} km/h` : '—'}</td>
    </tr>
  `).join('');

  const hasBestLaps = entries.some(t => isFinite(t.bestLap) && t.bestLap > 0);

  return `
    ${header}
    ${hasBestLaps ? `
    <div class="card" style="margin-bottom:16px;">
      <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:12px;">
        <i class="fas fa-chart-bar" style="color:var(--accent);margin-right:8px;"></i>Meilleur tour par circuit
      </div>
      <div style="position:relative;height:${Math.max(120, entries.length * 36)}px;">
        <canvas id="chart-vehicle-best-lap-by-track"></canvas>
      </div>
    </div>` : ''}
    <div class="card" style="overflow:auto;">
      <table class="table centered" style="width:100%;">
        <thead>
          <tr>
            <th style="text-align:left;">Circuit</th>
            <th>Sessions</th>
            <th>Tours</th>
            <th>Meilleur tour</th>
            <th>Moyenne tours</th>
            <th>Vitesse max</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

// Instancie le bar chart horizontal "meilleur tour par circuit" (véhicule)
function renderVehicleTrackChart(trackStats) {
  if (!window.LMUCharts) return;
  const entries = Object.values(trackStats || {}).filter(t => isFinite(t.bestLap) && t.bestLap > 0);
  if (entries.length === 0) return;

  const { fmtTime } = window.LMUUtils || {};
  entries.sort((a, b) => b.sessions - a.sessions);
  const colors = window.LMUCharts.themeColors();

  window.LMUCharts.renderChart('chart-vehicle-best-lap-by-track', {
    type: 'bar',
    data: {
      labels: entries.map(t => t.trackName),
      datasets: [{
        label: 'Meilleur tour',
        data: entries.map(t => t.bestLap),
        backgroundColor: colors.accent
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { color: colors.textSecondary, callback: (v) => fmtTime ? fmtTime(v) : v },
          grid: { color: colors.border }
        },
        y: {
          ticks: { color: colors.textSecondary },
          grid: { display: false }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (item) => fmtTime ? fmtTime(item.raw) : item.raw }
        }
      }
    }
  });
}

// Actualiser le profil (pour être appelé depuis d'autres modules)
function refreshProfile() {
  generateProfileContent();
}

// Vérifier si le profil peut être généré (pilote configuré)
function canGenerateProfile() {
  const driverName = window.LMUStorage ? window.LMUStorage.getConfiguredDriverName() : '';
  return driverName.trim() !== '';
}

// Export des fonctions
if (typeof window !== 'undefined') {
  window.LMUProfileManager = {
    generateProfileContent,
    generateEmptyProfileContent,
    generateWelcomeSection,
    generateTrackPerformanceSection,
    generateCarClassPerformanceSection,
    generateVehicleCardsPage,
    generateVehicleTrackPerformanceSection,
    renderVehicleTrackChart,
    generateRecentSessionsSection,
    refreshProfile,
    canGenerateProfile
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateProfileContent,
    generateEmptyProfileContent,
    generateWelcomeSection,
    generateTrackPerformanceSection,
    generateCarClassPerformanceSection,
    generateVehicleCardsPage,
    generateVehicleTrackPerformanceSection,
    generateRecentSessionsSection,
    refreshProfile,
    canGenerateProfile
  };
}

})(); // Fermeture de la fonction IIFE