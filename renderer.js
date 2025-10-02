// Mini routeur: toggle entre vues
const views = {
  profile: document.getElementById('view-profile'),
  history: document.getElementById('view-history'),
  settings: document.getElementById('view-settings')
};
const navButtons = document.querySelectorAll('.nav-btn');
navButtons.forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
function switchView(view) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[view]?.classList.add('active');
  navButtons.forEach(b => b.classList.toggle('active', b.dataset.view === view));
  
  // Actions spécifiques par vue
  if (view === 'profile') {
    generateProfileContent();
  } else if (view === 'history') {
    if (!lastScannedFiles) {
      scanConfiguredFolder();
    }
  }
}

// Charger et afficher le chemin courant
const resultsFolderInput = document.getElementById('resultsFolder');
const driverNameInput = document.getElementById('driverName');
const currentFolderSpan = document.getElementById('currentFolder');
const filePickerCard = document.getElementById('filePickerCard');
const fileSelect = document.getElementById('fileSelect');
const btnShowFile = document.getElementById('btnShowFile');
let lastScannedFiles = null; // [{filePath, parsed}] ou erreurs
let lastSession = null; // session extraite du fichier affiché

function loadSavedFolder() {
  const saved = localStorage.getItem('lmu.resultsFolder') || '';
  if (resultsFolderInput) resultsFolderInput.value = saved;
  if (currentFolderSpan) currentFolderSpan.textContent = saved ? `Dossier par défaut: ${saved}` : '';
  return saved;
}

function loadSavedDriverName() {
  const saved = localStorage.getItem('lmu.driverName') || '';
  if (driverNameInput) driverNameInput.value = saved;
  return saved;
}

// Fonction utilitaire pour récupérer le nom de pilote configuré
function getConfiguredDriverName() {
  return localStorage.getItem('lmu.driverName') || '';
}

// Fonction pour générer le contenu du profil pilote
function generateProfileContent() {
  const container = document.getElementById('profileContent');
  const driverName = getConfiguredDriverName();
  
  if (!driverName) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--muted);">
        <div style="font-size:48px;margin-bottom:16px;">🏁</div>
        <h3 style="margin-bottom:12px;color:var(--text);">Aucun nom de pilote configuré</h3>
        <p style="margin-bottom:20px;">Veuillez configurer votre nom de pilote dans les paramètres pour voir vos statistiques.</p>
        <button class="btn primary" onclick="switchView('settings')">⚙️ Aller aux paramètres</button>
      </div>
    `;
    return;
  }
  
  // Calculer les statistiques depuis les sessions scannées
  const stats = calculateDriverStats(driverName);
  const trackStats = calculateTrackStats(driverName);
  
  let html = `
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
        
        ${Object.keys(stats.podiumsByClass).length > 0 ? `
          <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:16px;">
            <h4 style="margin:0 0 12px 0;color:var(--accent);font-size:14px;">🏁 Par classe</h4>
            <div style="display:grid;gap:8px;">
              ${Object.entries(stats.podiumsByClass).map(([className, data]) => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:var(--panel-light);border-radius:6px;">
                  <span style="color:var(--text);font-weight:500;">${className}</span>
                  <div style="display:flex;gap:8px;">
                    <span style="color:#fbbf24;font-size:12px;">🥇 ${data.wins}</span>
                    <span style="color:#a855f7;font-size:12px;">🏅 ${data.podiums}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
  
  // Section Performance par Circuit
  const trackStatsEntries = Object.values(trackStats);
  console.log('trackStats:', trackStats);
  console.log('trackStatsEntries.length:', trackStatsEntries.length);
  console.log('lastScannedFiles:', lastScannedFiles);
  
  if (trackStatsEntries.length > 0) {
    // Trier par nombre de sessions décroissant
    trackStatsEntries.sort((a, b) => b.sessions - a.sessions);
    
    html += `
      <div class="card" style="margin-bottom:24px;">
        <h3 style="margin:0 0 16px 0;color:var(--accent);">🏁 Performance par Circuit</h3>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;">
          ${trackStatsEntries.map(track => {
            const bestLapText = isFinite(track.bestLap) ? fmtTime(track.bestLap) : '—';
            const avgLapText = isFinite(track.avgLap) ? fmtTime(track.avgLap) : '—';
            const topSpeedText = track.topSpeed > 0 ? `${track.topSpeed.toFixed(1)} km/h` : '—';
            const lastSessionText = track.lastSession > new Date(0) ? 
              track.lastSession.toLocaleDateString('fr-FR') : '—';
            
            return `
            <div style="padding:16px;background:var(--panel);border-radius:8px;border:2px solid var(--border);border-left:4px solid var(--accent);box-shadow:0 2px 8px rgba(0,0,0,0.1);">
              <div style="margin-bottom:12px;">
                <div style="font-weight:600;color:var(--text);margin-bottom:6px;">🏎️ ${track.trackName}</div>
                <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
                  <span style="font-size:12px;color:var(--muted);">📊 ${track.sessions} session(s)</span>
                  <span style="font-size:12px;color:var(--muted);">🔄 ${track.totalLaps || 0} tour(s)</span>
                  <span style="font-size:12px;color:var(--muted);">📅 ${lastSessionText}</span>
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
            </div>`;
          }).join('')}
        </div>
      </div>
    `;
  } else {
    // Section de debug temporaire
    html += `
      <div class="card" style="margin-bottom:24px;">
        <h3 style="margin:0 0 16px 0;color:var(--accent);">🏁 Performance par Circuit</h3>
        <div style="padding:16px;background:var(--panel);border-radius:8px;text-align:center;color:var(--muted);">
          <p>Aucune donnée de circuit trouvée.</p>
          <p style="font-size:12px;">Debug: trackStats = ${JSON.stringify(trackStats)}</p>
          <p style="font-size:12px;">lastScannedFiles = ${lastScannedFiles ? lastScannedFiles.length + ' fichiers' : 'null'}</p>
        </div>
      </div>
    `;
  }
  
  if (stats.recentSessions.length > 0) {
    html += `
      <div class="card">
        <h3 style="margin:0 0 16px 0;color:var(--accent);">📅 Sessions récentes</h3>
        <div style="display:grid;gap:12px;">
          ${stats.recentSessions.slice(0, 5).map(session => {
            // Déterminer le type et l'icône de session
            const sessionType = session.session.toLowerCase();
            let sessionIcon = '🏎️';
            let sessionBadge = '';
            
            if (sessionType.includes('race')) {
              sessionIcon = '🏁';
              sessionBadge = '<span style="background:#ef4444;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">COURSE</span>';
            } else if (sessionType.includes('qual')) {
              sessionIcon = '⏱️';
              sessionBadge = '<span style="background:#f97316;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">QUALIF</span>';
            } else if (sessionType.includes('practice') || sessionType.includes('practise')) {
              sessionIcon = '🏃';
              sessionBadge = '<span style="background:#22c55e;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">PRACTICE</span>';
            } else {
              sessionIcon = '📊';
              sessionBadge = '<span style="background:var(--muted);color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">SESSION</span>';
            }
            
            // Badge pour le mode de jeu
            const gameModeBadge = session.gameMode === 'Multijoueur' 
              ? '<span style="background:#8b5cf6;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-left:4px;">🌐 MULTI</span>'
              : '<span style="background:#64748b;color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-left:4px;">👤 SOLO</span>';
            
            return `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--panel);border-radius:8px;">
              <div style="display:flex;align-items:center;gap:12px;">
                <div style="font-size:20px;">${sessionIcon}</div>
                <div>
                  <div style="font-weight:600;color:var(--text);margin-bottom:4px;">${session.event}</div>
                  <div style="font-size:12px;color:var(--muted);margin-bottom:4px;">${session.track} • ${session.date}</div>
                  <div>${sessionBadge}${gameModeBadge}</div>
                </div>
              </div>
              <div style="text-align:right;">
                <div style="font-weight:600;color:var(--ok);">${fmtTime(session.bestLap)}</div>
                <div style="font-size:12px;color:var(--muted);">P${session.position || '?'}</div>
              </div>
            </div>`;
          }).join('')}
        </div>
        ${stats.recentSessions.length > 5 ? `
          <div style="margin-top:16px;text-align:center;">
            <button class="btn" onclick="switchView('history')">📊 Voir tout l'historique</button>
          </div>
        ` : ''}
      </div>
    `;
  } else {
    html += `
      <div class="card" style="text-align:center;padding:40px;">
        <div style="font-size:48px;margin-bottom:16px;opacity:0.6;">📊</div>
        <h3 style="margin-bottom:12px;color:var(--text);">Aucune session trouvée</h3>
        <p style="margin-bottom:20px;color:var(--muted);">Configurez votre dossier de résultats pour voir vos statistiques.</p>
        <button class="btn primary" onclick="switchView('settings')">⚙️ Configurer le dossier</button>
      </div>
    `;
  }
  
  container.innerHTML = html;
}

// Fonction pour calculer les statistiques du pilote
function calculateDriverStats(driverName) {
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
    const timestamp = rr.DateTime ? parseInt(rr.DateTime) * 1000 : (file.mtimeIso ? new Date(file.mtimeIso).getTime() : 0);
    
    // Détecter le mode de jeu (Solo/Multijoueur)
    const setting = rr.Setting || '';
    const isMultiplayer = setting.toLowerCase().includes('multiplayer');
    const gameMode = isMultiplayer ? 'Multijoueur' : 'Solo';
    
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
    // Utiliser le timestamp si disponible, sinon fallback sur la date string
    if (a.timestamp && b.timestamp) {
      return b.timestamp - a.timestamp;
    }
    return b.date.localeCompare(a.date);
  });
  
  return stats;
}

// Fonction pour calculer les statistiques par circuit
function calculateTrackStats(driverName) {
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
          totalLaps: 0
        };
      }
      
      const trackData = trackStats[trackCourse];
      trackData.sessions++;
      
      // Date de la dernière session sur ce circuit
      const sessionDate = file.mtimeIso ? new Date(file.mtimeIso) : new Date(0);
      if (sessionDate > trackData.lastSession) {
        trackData.lastSession = sessionDate;
      }
      
      // Meilleur tour
      if (isFinite(myDriver.bestLapSec) && myDriver.bestLapSec > 0 && myDriver.bestLapSec < trackData.bestLap) {
        trackData.bestLap = myDriver.bestLapSec;
      }
      
      // Vitesse de pointe
      if (isFinite(myDriver.topSpeedMax) && myDriver.topSpeedMax > trackData.topSpeed) {
        trackData.topSpeed = myDriver.topSpeedMax;
      }
      
      // Collecter tous les tours valides pour calculer la moyenne globale
      if (myDriver.laps) {
        const validLaps = myDriver.laps
          .map(l => l.timeSec)
          .filter(t => isFinite(t) && t > 0);
        trackData.allValidLaps.push(...validLaps);
        
        // Compter le nombre total de tours (y compris les tours non valides)
        trackData.totalLaps += myDriver.laps.length;
      }
      
    } catch (e) {
      console.warn('Erreur lors du traitement du fichier pour les stats circuit:', file.filePath, e);
    }
  }
  
  // Calculer la moyenne globale pour chaque circuit
  for (const track of Object.values(trackStats)) {
    if (track.allValidLaps.length > 0) {
      track.avgLap = track.allValidLaps.reduce((a, b) => a + b, 0) / track.allValidLaps.length;
    } else {
      track.avgLap = NaN;
    }
    
    // Nettoyer les données temporaires
    delete track.allValidLaps;
    
    // Si pas de meilleur tour trouvé, mettre NaN
    if (track.bestLap === Infinity) {
      track.bestLap = NaN;
    }
  }
  
  console.log('Résultat calculateTrackStats pour', driverName, ':', trackStats);
  return trackStats;
}

try { 
  loadSavedFolder(); 
  loadSavedDriverName();
} catch {}

// -------- Helpers d'interprétation LMU --------
function arrayify(x) { return x == null ? [] : (Array.isArray(x) ? x : [x]); }
function toNumber(v) {
  if (v == null) return NaN; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? NaN : n;
}
function fmtTime(sec) {
  if (!isFinite(sec) || sec <= 0) return '—';
  const m = Math.floor(sec / 60); const s = sec - m * 60; const ms = Math.round((s - Math.floor(s)) * 1000);
  const sInt = Math.floor(s);
  const mm = String(m).padStart(1, '0');
  const ss = String(sInt).padStart(2, '0');
  const mmm = String(ms).padStart(3, '0');
  return `${mm}:${ss}.${mmm}`;
}

// Fonction utilitaire pour formater les dates
function formatDateTime(rr, dt) {
  let timeString = 'Date inconnue';
  if (rr?.DateTime) {
    try {
      const timestamp = parseInt(rr.DateTime) * 1000;
      const date = new Date(timestamp);
      timeString = date.toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric'}) + ' à ' + date.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});
    } catch {
      timeString = rr?.TimeString || 'Date inconnue';
    }
  } else if (rr?.TimeString) {
    try {
      const dateParts = rr.TimeString.match(/(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
      if (dateParts) {
        const [, year, month, day, hour, min, sec] = dateParts;
        timeString = `${day}/${month}/${year} à ${hour}:${min}`;
      } else {
        timeString = rr.TimeString;
      }
    } catch {
      timeString = rr.TimeString;
    }
  } else if (dt) {
    timeString = dt.toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric'}) + ' à ' + dt.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});
  }
  return timeString;
}

// Fonction utilitaire pour générer les cards de session
function generateSessionCard(f) {
  const dt = f.mtimeIso ? new Date(f.mtimeIso) : null;
  const rr = f.parsed?.rFactorXML?.RaceResults || f.parsed?.RaceResults || null;
  const event = rr?.TrackEvent || 'Session inconnue';
  const venue = rr?.TrackVenue || rr?.TrackCourse || 'Circuit inconnu';
  const timeString = formatDateTime(rr, dt);
  
  // Tags plus explicites
  const raceTime = rr?.RaceTime ? `⏱️ Durée : ${rr.RaceTime}m` : null;
  
  // Utiliser la même logique que extractSession pour mostLaps
  const picked = pickSession(rr);
  const node = picked?.node;
  const mostLaps = toNumber(node?.MostLapsCompleted) || toNumber(rr?.MostLapsCompleted) || NaN;
  
  let finalLaps;
  if (isFinite(mostLaps) && mostLaps > 0) {
    finalLaps = mostLaps;
  } else {
    const fallbackLaps = rr?.RaceLaps ?? rr?.TotalLaps ?? rr?.LapsCompleted;
    finalLaps = toNumber(fallbackLaps);
  }

  const raceLaps = isFinite(finalLaps) && finalLaps > 0 ? `🔄 Tours : ${finalLaps}` : null;
  const trackLength = rr?.TrackLength ? `📏 Circuit : ${parseFloat(rr.TrackLength).toFixed(1)}m` : null;
  const fileName = f.filePath.split(/\\|\//).pop();
  const disabled = !!f.error;
  
  const statsChips = [raceTime, raceLaps, trackLength].filter(Boolean)
    .map(stat => `<span class="chip" style="font-size:11px;">${stat}</span>`).join(' ');
  
  return `<div class="card" style="cursor:${disabled ? 'not-allowed' : 'pointer'};opacity:${disabled ? 0.6 : 1};transition:transform 0.2s, box-shadow 0.2s;" data-file-path="${disabled ? '' : encodeURIComponent(f.filePath)}">
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
      ${f.error ? `<div style="color:var(--err);font-size:12px;margin-top:8px;">❌ ${f.error}</div>` : ''}
    </div>
    ${disabled ? '<span class="chip" style="background:var(--err);color:#000;">Erreur</span>' : '<span class="chip" style="background:var(--brand);color:#fff;">Voir les stats →</span>'}
  </div>`;
}
function getRaceResultsRoot(data) {
  return data?.rFactorXML?.RaceResults || data?.RaceResults || null;
}
function pickSession(rr) {
  if (!rr) return null;
  const entries = Object.entries(rr).filter(([k,v]) => v && typeof v === 'object' && ('Driver' in v));
  if (entries.length === 0) return null;
  const priority = (k) => {
    const kk = k.toLowerCase();
    if (kk.includes('race')) return 100;
    if (kk.includes('qual')) return 80;
    if (kk.includes('practice') || kk.includes('practise')) return 60;
    if (kk.includes('warm')) return 50;
    return 10;
  };
  entries.sort((a,b) => priority(b[0]) - priority(a[0]));
  const [name, node] = entries[0];
  return { name, node };
}

// Fonction pour extraire les changements de pilotes depuis le Stream et les Swaps
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
          
          // Ajouter l'ancien pilote (au cas où il ne serait pas encore dans la liste)
          driverChangesByVehicle[vehicle].add(oldDriver);
          // Ajouter le nouveau pilote
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

function extractDrivers(sessionNode) {
  const driverChanges = extractDriverChanges(sessionNode);
  
  const drivers = arrayify(sessionNode.Driver).map((d, idx) => {
    const lapsRaw = arrayify(d.Lap);
    const laps = lapsRaw.map((lap) => {
      if (lap == null) return null;
      if (typeof lap === 'string' || typeof lap === 'number') {
        const t = toNumber(lap);
        return { num: NaN, timeSec: t, s1: NaN, s2: NaN, s3: NaN, topSpeed: NaN, pit: false };
      }
      const at = (k) => toNumber(lap[`@_${k}`]);
      const timeSec = toNumber(lap['#text']);
      return {
        num: toNumber(lap['@_num']),
        timeSec,
        s1: at('s1'), s2: at('s2'), s3: at('s3'),
        topSpeed: at('topspeed'),
        pit: String(lap['@_pit'] ?? '') === '1'
      };
    }).filter(Boolean);

    const validLapTimes = laps.map(l => l.timeSec).filter(t => isFinite(t) && t > 0);
    const bestLapSec = isFinite(toNumber(d.BestLapTime)) ? toNumber(d.BestLapTime) : Math.min(...validLapTimes);
    
    // Moyenne de tous les tours qui ont des temps valides (pas "---.----")
    const avgLapSec = validLapTimes.length ? (validLapTimes.reduce((a,b) => a+b, 0) / validLapTimes.length) : NaN;
    
    const validTopSpeeds = laps.map(l => l.topSpeed).filter(x => isFinite(x) && x > 0);
    const maxTop = validTopSpeeds.length > 0 ? Math.max(...validTopSpeeds) : NaN;

    // Chercher les pilotes supplémentaires via les DriverChanges
    const currentDriverName = d.Name || `Driver ${idx+1}`;
    let allDrivers = [currentDriverName];
    
    // Trouver la voiture correspondante dans les changements de pilotes
    const vehicleName = d.VehName || '';
    if (driverChanges[vehicleName]) {
      // Utiliser tous les pilotes de cette voiture
      allDrivers = [...driverChanges[vehicleName]];
    }

    return {
      position: toNumber(d.Position),
      classPosition: toNumber(d.ClassPosition),
      name: currentDriverName,
      allDrivers: allDrivers, // Tous les pilotes de la voiture
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
      laps
    };
  });
  // Trier par classe puis par position de classe
  drivers.sort((a,b) => {
    // Fonction pour obtenir la priorité de classe
    const getClassPriority = (carClass) => {
      const classPriorities = {
        'Hyper': 1,
        'LMP2_ELMS': 2,
        'LMP2': 3,
        'LMP3': 4,
        'GT3': 5,
        'GTE': 6,
      };
      return classPriorities[carClass] || 999; // Classes inconnues à la fin
    };
    
    const classPriorityA = getClassPriority(a.carClass);
    const classPriorityB = getClassPriority(b.carClass);
    
    // Si différentes classes, trier par priorité de classe
    if (classPriorityA !== classPriorityB) {
      return classPriorityA - classPriorityB;
    }
    
    // Même classe : trier par position de classe
    if (isFinite(a.classPosition) && isFinite(b.classPosition)) {
      return a.classPosition - b.classPosition;
    }
    
    // Fallback : trier par meilleur tour
    return a.bestLapSec - b.bestLapSec;
  });
  return drivers;
}
function extractSession(parsed) {
  const rr = getRaceResultsRoot(parsed);
  if (!rr) return null;
  const picked = pickSession(rr);
  if (!picked) return null;
  const { name, node } = picked;

  const timestamp = parseInt(rr.DateTime) * 1000; // Convertir en millisecondes
  const date = new Date(timestamp);
  const timeString = date.toLocaleDateString('fr-FR', {day:'2-digit', month:'2-digit', year:'numeric'}) + ' à ' + date.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});

  const meta = {
    session: name,
    track: rr.TrackVenue || rr.TrackCourse || '',
    event: rr.TrackEvent || '',
    time: timeString,
    mostLaps: toNumber(node.MostLapsCompleted) || toNumber(rr.MostLapsCompleted) || NaN
  };
  const drivers = extractDrivers(node);
  return { meta, drivers };
}

// Ouverture d'un seul fichier
const btnOpen = document.getElementById('btnOpen');
if (btnOpen) btnOpen.addEventListener('click', async () => {
  const res = await window.lmuAPI.openFile();
  if (res.canceled) return;
  const container = document.getElementById('results');
  container.innerHTML = `<h2>Fichier : ${res.filePath}</h2>`;
  const session = extractSession(res.parsed);
  if (session) {
    renderSessionInto(container, null, session);
    lastSession = session;
    if (filePickerCard) filePickerCard.style.display = 'none';
  } else {
    container.innerHTML += "<pre>" + JSON.stringify(res.parsed, null, 2) + "</pre>";
  }
});

// Scan rapide: utilise selecteur précédent (openFolder) pour test rapide
const btnOpenFolder = document.getElementById('btnOpenFolder');
if (btnOpenFolder) btnOpenFolder.addEventListener('click', async () => {
  const res = await window.lmuAPI.openFolder();
  if (res.canceled) return;

  const container = document.getElementById('results');
  container.innerHTML = `<h2>Dossier : ${res.folderPath}</h2><p><span class=\"spinner\"></span> Scan en cours…</p>`;

  if (Array.isArray(res.files)) {
    lastScannedFiles = res.files;
    
    // Trier les fichiers du plus récent au plus ancien
    const sortedFiles = res.files.slice().sort((a, b) => {
      // Trier par DateTime du XML si disponible, sinon par date de modification du fichier
      const getDateTime = (file) => {
        const rr = file.parsed?.rFactorXML?.RaceResults || file.parsed?.RaceResults;
        if (rr && rr.DateTime) {
          return parseInt(rr.DateTime) * 1000; // Convertir en millisecondes
        }
        return file.mtimeIso ? new Date(file.mtimeIso).getTime() : 0;
      };
      return getDateTime(b) - getDateTime(a); // Plus récent en premier
    });
    
    // Cards avec métadonnées XML
    const cards = sortedFiles.map(generateSessionCard).join('');
    
    container.innerHTML = `<h2>Sessions trouvées</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;margin-top:16px;">
        ${cards}
      </div>`;
    
    // Bind clics sur cards
    container.querySelectorAll('[data-file-path]').forEach(card => {
      const filePath = card.getAttribute('data-file-path');
      if (!filePath) return;
      
      card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-2px)';
        card.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = 'translateY(0)';
        card.style.boxShadow = '';
      });
      
      card.addEventListener('click', () => {
        window.location.href = `session.html?file=${filePath}`;
      });
    });
  }
});

// Settings: choisir un dossier et sauvegarder
const btnSelectFolder = document.getElementById('btnSelectFolder');
const btnSaveSettings = document.getElementById('btnSaveSettings');
if (btnSelectFolder) {
  btnSelectFolder.addEventListener('click', async () => {
    const res = await window.lmuAPI.selectFolder();
    if (!res.canceled) {
      resultsFolderInput.value = res.folderPath;
    }
  });
}

if (btnSaveSettings) {
  btnSaveSettings.addEventListener('click', () => {
    const folderValue = resultsFolderInput.value.trim();
    const driverValue = driverNameInput.value.trim();
    
    localStorage.setItem('lmu.resultsFolder', folderValue);
    localStorage.setItem('lmu.driverName', driverValue);
    
    loadSavedFolder();
    loadSavedDriverName();
    
    // Feedback visuel
    const originalText = btnSaveSettings.textContent;
    btnSaveSettings.textContent = '✅ Sauvegardé !';
    btnSaveSettings.style.background = 'var(--ok)';
    
    setTimeout(() => {
      btnSaveSettings.textContent = originalText;
      btnSaveSettings.style.background = '';
    }, 2000);
    
    // Mettre à jour les statistiques du profil avec le nouveau nom
    generateProfileContent();
    switchView('profile');
    scanConfiguredFolder();
  });
}

// Scanner le dossier configuré et alimenter le sélecteur
async function scanConfiguredFolder() {
  const folder = loadSavedFolder();
  if (!folder) return;
  const container = document.getElementById('results');
  container.innerHTML = `<h2>Dossier (config): ${folder}</h2><p><span class="spinner"></span> Scan en cours…</p>`;
  const res = await window.lmuAPI.scanFolder(folder);
  if (res.canceled) {
    container.innerHTML = `<p class="muted">Scan annulé: ${res.error ?? ''}</p>`;
    return;
  }
  if (Array.isArray(res.files)) {
    lastScannedFiles = res.files;
    
    // Trier les fichiers du plus récent au plus ancien
    const sortedFiles = res.files.slice().sort((a, b) => {
      // Trier par DateTime du XML si disponible, sinon par date de modification du fichier
      const getDateTime = (file) => {
        const rr = file.parsed?.rFactorXML?.RaceResults || file.parsed?.RaceResults;
        if (rr && rr.DateTime) {
          return parseInt(rr.DateTime) * 1000; // Convertir en millisecondes
        }
        return file.mtimeIso ? new Date(file.mtimeIso).getTime() : 0;
      };
      return getDateTime(b) - getDateTime(a); // Plus récent en premier
    });
    
    // Cards avec métadonnées XML
    const cards = sortedFiles.map(generateSessionCard).join('');
    
    container.innerHTML = `<h2>Sessions trouvées</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;margin-top:16px;">
        ${cards}
      </div>`;
    
    // Bind clics sur cards
    container.querySelectorAll('[data-file-path]').forEach(card => {
      const filePath = card.getAttribute('data-file-path');
      if (!filePath) return;
      
      card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-2px)';
        card.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = 'translateY(0)';
        card.style.boxShadow = '';
      });
      
      card.addEventListener('click', () => {
        window.location.href = `session.html?file=${filePath}`;
      });
    });
  }
}

// Optionnel: scanner automatiquement au démarrage si un dossier est configuré
try { scanConfiguredFolder(); } catch {}

// Afficher un fichier choisi depuis le select
if (btnShowFile && fileSelect) {
  btnShowFile.addEventListener('click', () => {
    const path = fileSelect.value;
    const item = (lastScannedFiles || []).find(f => f.filePath === path);
    const container = document.getElementById('results');
    if (!item) {
      container.innerHTML = `<p class="muted">Aucun fichier sélectionné.</p>`;
      return;
    }
    container.innerHTML = `<h2>Fichier : ${item.filePath}</h2>`;
    const session = extractSession(item.parsed);
    if (session) {
      renderSessionInto(container, null, session);
      lastSession = session;
    } else {
      container.innerHTML += `<pre>${JSON.stringify(item.parsed, null, 2)}</pre>`;
    }
  });
}
