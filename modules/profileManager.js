/**
 * Module de gestion du profil pilote pour LMU Tracker
 * Dépend de: storage.js, statsCalculator.js, renderEngine.js, navigation.js
 */

(function() {
  // Version UI pour invalider le cache du profil quand la structure change
  const UI_PROFILE_VERSION = 3;
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
  
  let html = generateWelcomeSection(driverName, stats);
  html += generateTrackPerformanceSection(trackStats, selectedCarClass, lastScannedFiles);
  html += generateCarClassPerformanceSection(vehicleStatsByClass);
  html += generateRecentSessionsSection(stats);
  
  container.innerHTML = html;
  
  // Mettre en cache le contenu généré
  if (window.LMUCacheManager) {
    window.LMUCacheManager.setCachedContent('profile', html, cacheParams);
  }
}

// Générer le contenu pour un profil vide (pas de pilote configuré)
function generateEmptyProfileContent() {
  return `
    <div style="text-align:center;padding:40px;color:var(--muted);">
      <div style="font-size:48px;margin-bottom:16px;">🏁</div>
      <h3 style="margin-bottom:12px;color:var(--text);">Aucun nom de pilote configuré</h3>
      <p style="margin-bottom:20px;">Veuillez configurer votre nom de pilote dans les paramètres pour voir vos statistiques.</p>
      <button class="btn primary" onclick="switchView('settings')">⚙️ Aller aux paramètres</button>
    </div>
  `;
}

// Générer la section de bienvenue avec les statistiques principales
function generateWelcomeSection(driverName, stats) {
  if (!stats) return '';
  
  return `
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:24px;margin-bottom:24px;">
      <!-- Carte de bienvenue -->
      <div class="card" style="background:linear-gradient(135deg,rgba(96,165,250,0.1),rgba(167,139,250,0.1));border:1px solid var(--border);">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;">
          <div style="width:64px;height:64px;background:linear-gradient(135deg,var(--brand),var(--accent));border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:28px;color:#fff;">🏁</div>
          <div>
            <h2 style="margin:0;font-size:24px;color:var(--text);">Bonjour, ${driverName} !</h2>
            <p style="margin:4px 0 0 0;color:var(--muted);">Bienvenue dans votre tableau de bord LMU</p>
          </div>
        </div>
        ${stats.totalSessions > 0 ? `
          <div class="row" style="gap:16px;flex-wrap:wrap;">
            <div class="chip" style="background:var(--ok);color:#000;font-weight:600;">🏆 ${stats.totalRaces} course(s)</div>
            <div class="chip" style="background:var(--accent);color:#fff;font-weight:600;">🏃 ${stats.totalSessions} session(s)</div>
            <div class="chip" style="background:#fbbf24;color:#000;font-weight:600;">🥇 ${stats.totalWins} victoire(s)</div>
            <div class="chip" style="background:#a855f7;color:#fff;font-weight:600;">🏅 ${stats.totalPodiums} podium(s)</div>
          </div>
        ` : ''}
      </div>
      
      <!-- Statistiques rapides -->
      <div class="card">
        <h3 style="margin:0 0 16px 0;color:var(--accent);">📊 Statistiques</h3>
        <div style="display:grid;gap:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="color:var(--muted);">Sessions totales</span>
            <strong style="color:var(--text);">${stats.totalSessions}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="color:var(--muted);">Courses</span>
            <strong style="color:var(--text);">${stats.totalRaces}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="color:var(--muted);">Victoires totales</span>
            <strong style="color:#fbbf24;">${stats.totalWins}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="color:var(--muted);">Podiums totaux</span>
            <strong style="color:#a855f7;">${stats.totalPodiums}</strong>
          </div>
        </div>
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
          <h3 style="margin:0;color:var(--accent);">🏁 Performance par Circuit</h3>
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
        <h3 style="margin:0 0 16px 0;color:var(--accent);">🏁 Performance par Circuit</h3>
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
        <h3 style="margin:0 0 16px 0;color:var(--accent);">📅 Sessions récentes</h3>
        <div style="display:grid;gap:12px;">
          ${recentSessionCards}
        </div>
        ${stats.recentSessions.length > 5 ? `
          <div style="margin-top:16px;text-align:center;">
            <button class="btn" onclick="switchView('history')">📊 Voir tout l'historique</button>
          </div>
        ` : ''}
      </div>
    `;
  } else {
    return `
      <div class="card" style="text-align:center;padding:40px;">
        <div style="font-size:48px;margin-bottom:16px;opacity:0.6;">📊</div>
        <h3 style="margin-bottom:12px;color:var(--text);">Aucune session trouvée</h3>
        <p style="margin-bottom:20px;color:var(--muted);">Configurez votre dossier de résultats pour voir vos statistiques.</p>
        <button class="btn primary" onclick="switchView('settings')">⚙️ Configurer le dossier</button>
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
          <h3 style="margin:0;color:var(--accent);">🚗 ${cls}</h3>
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
      <h3 style="margin:0 0 12px 0;color:var(--accent);">🚘 Performances par voiture et par classe</h3>
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${sections}
      </div>
    </div>
  `;
}

// Page Voitures: grille de cards (sans stats), groupées par classe
function generateVehicleCardsPage(vehicleStatsByClass) {
  const classNames = Object.keys(vehicleStatsByClass || {});
  if (classNames.length === 0) {
    return `
      <div class="card" style="text-align:center;padding:40px;">
        <div style="font-size:48px;margin-bottom:16px;">🚘</div>
        <h3 style="margin-bottom:12px;color:var(--text);">Aucune voiture trouvée</h3>
        <p class="muted">Assurez-vous d'avoir scanné des sessions et d'avoir un pilote configuré.</p>
      </div>
    `;
  }
  const sections = classNames.sort((a,b) => (window.LMUUtils?.getClassPriority(a)||999) - (window.LMUUtils?.getClassPriority(b)||999)).map(cls => {
    const vehicles = vehicleStatsByClass[cls] || [];
    if (vehicles.length === 0) return '';
    const cards = vehicles.map(v => `
      <div class="card" data-vehicle="${v.vehicleName}" data-class="${cls}" style="cursor:pointer;">
        <div class="row" style="justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;border-radius:8px;background:var(--panel);display:flex;align-items:center;justify-content:center;">🏎️</div>
            <div>
              <div style="font-weight:600;color:var(--text);">${v.vehicleName}</div>
              <div class="muted" style="font-size:12px;">${cls} • ${v.totalLaps ?? 0} tour${(v.totalLaps ?? 0) > 1 ? 's' : ''}</div>
            </div>
          </div>
          <div class="muted" style="font-size:12px;">Voir détail ➜</div>
        </div>
      </div>
    `).join('');
    return `
      <div class="card" style="margin-bottom:16px;">
        <h3 style="margin:0 0 8px 0;color:var(--accent);">${cls}</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">
          ${cards}
        </div>
      </div>
    `;
  }).join('');
  return `
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h2 style="margin:0;">🚘 Voitures</h2>
      </div>
      ${sections}
    </div>
  `;
}

// Page détail véhicule: stats par circuit pour un véhicule et une classe
function generateVehicleTrackPerformanceSection(vehicleName, carClass, trackStats) {
  const { fmtTime } = window.LMUUtils || {};
  const entries = Object.values(trackStats || {});
  const header = `
    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;">
      <button class="btn" onclick="switchView('vehicles')">⬅️ Retour</button>
      <div class="muted" style="font-size:12px;">Classe: ${carClass}</div>
    </div>
    <h2 style="margin:0 0 8px 0;">🚗 ${vehicleName}</h2>
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
  return `
    ${header}
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