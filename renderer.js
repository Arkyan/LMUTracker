// Mini routeur: toggle entre vues
const views = {
  results: document.getElementById('view-results'),
  settings: document.getElementById('view-settings')
};
const navButtons = document.querySelectorAll('.nav-btn');
navButtons.forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
function switchView(view) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[view]?.classList.add('active');
  navButtons.forEach(b => b.classList.toggle('active', b.dataset.view === view));
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
function extractDrivers(sessionNode) {
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
    const avgLapSec = validLapTimes.length ? (validLapTimes.reduce((a,b) => a+b, 0) / validLapTimes.length) : NaN;
    const validTopSpeeds = laps.map(l => l.topSpeed).filter(x => isFinite(x) && x > 0);
    const maxTop = validTopSpeeds.length > 0 ? Math.max(...validTopSpeeds) : NaN;

    return {
      position: toNumber(d.Position),
      classPosition: toNumber(d.ClassPosition),
      name: d.Name || `Driver ${idx+1}`,
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
  // Trier par position quand disponible, sinon par meilleur tour croissant
  drivers.sort((a,b) => {
    if (isFinite(a.position) && isFinite(b.position)) return a.position - b.position;
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
    
    // Cards avec métadonnées XML
    const cards = res.files.map(generateSessionCard).join('');
    
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
    
    switchView('results');
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
    
    // Cards avec métadonnées XML
    const cards = res.files.map(generateSessionCard).join('');
    
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
