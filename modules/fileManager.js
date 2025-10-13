/**
 * Module de gestion des fichiers pour LMU Tracker
 * Gère le scan des dossiers, l'ouverture de fichiers et la gestion de l'historique
 */

(function() {
  // Variables d'état
  let lastScannedFiles = null; // [{filePath, parsed}] ou erreurs
let lastSession = null; // session extraite du fichier affiché

  // État d'affichage de l'historique (lazy loading)
  const historyState = {
    filesMetaSorted: [], // [{filePath, mtimeMs, mtimeIso}]
    renderedCount: 0,
    // Demande: 48 par lot
    pageSize: 48,
    title: 'Sessions trouvées',
    cacheParams: null,
    filter: 'all', // all | race | qual | practice
    isAutoLoading: false,
    autoLoadBatchCounter: 0
  };

// Éléments DOM
let filePickerCard = null;
let fileSelect = null;
let btnShowFile = null;
let btnSelectFolder = null;

// Initialiser le gestionnaire de fichiers
function initFileManager() {
  // Récupérer les éléments DOM
  filePickerCard = document.getElementById('filePickerCard');
  fileSelect = document.getElementById('fileSelect');
  btnShowFile = document.getElementById('btnShowFile');
  btnSelectFolder = document.getElementById('btnSelectFolder');
  
  // Ajouter les événements
  setupEventListeners();
}

// Configurer les événements
function setupEventListeners() {
  // Bouton d'ouverture d'un fichier unique
  const btnOpen = document.getElementById('btnOpen');
  if (btnOpen) {
    btnOpen.addEventListener('click', openSingleFile);
  }
  
  // Bouton d'ouverture d'un dossier
  const btnOpenFolder = document.getElementById('btnOpenFolder');
  if (btnOpenFolder) {
    btnOpenFolder.addEventListener('click', openFolderDialog);
  }
  
  // Bouton de sélection de dossier pour les paramètres
  if (btnSelectFolder) {
    btnSelectFolder.addEventListener('click', selectFolderForSettings);
  }
  
  // Bouton d'affichage d'un fichier sélectionné
  if (btnShowFile && fileSelect) {
    btnShowFile.addEventListener('click', showSelectedFile);
  }
}

// Ouvrir un fichier unique
async function openSingleFile() {
  const res = await window.lmuAPI.openFile();
  if (res.canceled) return;
  
  const container = document.getElementById('results');
  if (!container) return;
  
  container.innerHTML = `<h2>Fichier : ${res.filePath}</h2>`;
  
  const session = window.LMUXMLParser ? window.LMUXMLParser.extractSession(res.parsed) : null;
  if (session) {
    if (window.LMURenderEngine && window.LMURenderEngine.renderSessionInto) {
      window.LMURenderEngine.renderSessionInto(container, null, session);
    }
    lastSession = session;
    if (filePickerCard) filePickerCard.style.display = 'none';
  } else {
    container.innerHTML += "<pre>" + JSON.stringify(res.parsed, null, 2) + "</pre>";
  }
}

// Ouvrir un dossier via dialogue
async function openFolderDialog() {
  const res = await window.lmuAPI.openFolder();
  if (res.canceled) return;
  
  displayScannedFiles(res.files, `Dossier : ${res.folderPath}`, true);
}

// Sélectionner un dossier pour les paramètres
async function selectFolderForSettings() {
  const res = await window.lmuAPI.selectFolder();
  if (!res.canceled && window.LMUStorage) {
    window.LMUStorage.updateResultsFolder(res.folderPath);
  }
}

// Scanner le dossier configuré
async function scanConfiguredFolder() {
  if (!window.LMUStorage) return;
  
  const folder = window.LMUStorage.getConfiguredResultsFolder();
  if (!folder) return;
  
  const container = document.getElementById('results');
  if (!container) return;
  
  container.innerHTML = `<h2>Dossier (config): ${folder}</h2><p><span class="spinner"></span> Scan en cours…</p>`;
  
  // Nouveau flux: d'abord lister les fichiers (métadonnées), sans parser
  const listRes = await window.lmuAPI.listLmuFiles(folder);
  if (listRes.canceled) {
    container.innerHTML = `<p class="muted">Scan annulé: ${listRes.error ?? ''}</p>`;
    return;
  }
  // Trier par plus récent (listRes.filesMeta est déjà trié dans main)
  historyState.filesMetaSorted = Array.isArray(listRes.filesMeta) ? listRes.filesMeta.slice() : [];
  historyState.renderedCount = 0;
  // Parser uniquement le premier lot
  const firstBatchPaths = historyState.filesMetaSorted.slice(0, historyState.pageSize).map(m => m.filePath);
  if (firstBatchPaths.length === 0) {
    displayScannedFiles([], `Sessions trouvées`, true);
    return;
  }
  const parseRes = await window.lmuAPI.parseLmuFiles(firstBatchPaths);
  if (parseRes.canceled) {
    container.innerHTML = `<p class="muted">Erreur lors du parsing: ${parseRes.error ?? ''}</p>`;
    return;
  }
    // Afficher le premier lot en respectant les types sélectionnés (Paramètres)
    try {
      const loadTypes = window.LMUStorage && window.LMUStorage.loadSelectedLoadTypes ? window.LMUStorage.loadSelectedLoadTypes() : { race: true, qual: true, practice: true };
      const typeOk = (t) => (t === 'race' && loadTypes.race) || (t === 'qual' && loadTypes.qual) || (t === 'practice' && loadTypes.practice) || (t === 'unknown');
      const firstFiles = (parseRes.files || []).filter(f => typeOk(getFileSessionType(f)));
      displayScannedFiles(firstFiles, `Sessions trouvées`, true);
    } catch (_) {
      displayScannedFiles(parseRes.files || [], `Sessions trouvées`, true);
    }
  // Avancer le compteur rendu (lot parsé)
  historyState.renderedCount = firstBatchPaths.length;

  // Si l'option "tout charger" est activée, enchaîner automatiquement les lots restants
  try {
    const loadAll = !!(window.LMUStorage && window.LMUStorage.loadLoadAllSessionsDirectly && window.LMUStorage.loadLoadAllSessionsDirectly());
    if (loadAll) {
      startAutoLoadProgress();
      await autoLoadAllBatches();
      stopAutoLoadProgress();
    }
  } catch (_) {}
}

// Afficher les fichiers scannés
function displayScannedFiles(files, title, isNewScan = true) {
  lastScannedFiles = files;
  
  const driverName = window.LMUStorage ? window.LMUStorage.getConfiguredDriverName() : '';
  const folderPath = window.LMUStorage ? window.LMUStorage.getConfiguredResultsFolder() : '';
  
  // Paramètres pour le cache
  const cacheParams = {
    driverName,
    filesLength: files.length,
    folderPath,
    title,
    filter: historyState.filter
  };
  historyState.cacheParams = cacheParams;
  
  // Vérifier le cache d'abord
  if (window.LMUCacheManager) {
    const cachedContent = window.LMUCacheManager.getCachedContent('history', cacheParams);
    if (cachedContent) {
      const container = document.getElementById('results');
      if (container) {
        container.innerHTML = cachedContent;
        // Réattacher les événements après avoir restauré le contenu du cache
        setupCardEvents(container);
        return;
      }
    }
  }
  
  // Invalider le cache seulement pour un nouveau scan
  if (isNewScan) {
    if (window.LMUStatsCalculator && window.LMUStatsCalculator.invalidateCache) {
      window.LMUStatsCalculator.invalidateCache();
    }
    
    // Invalider seulement le cache de l'historique car les fichiers ont changé
    if (window.LMUCacheManager && window.LMUCacheManager.invalidateCache) {
      window.LMUCacheManager.invalidateCache('history');
      window.LMUCacheManager.invalidateCache('profile'); // Le profil dépend aussi des fichiers
    }
  }
  
  // Les fichiers fournis sont déjà le lot courant à afficher; ne pas re-trier ici.
  // Conserver dans lastScannedFiles; renderedCount est géré lors du scan initial et des chargements.
  if (isNewScan) {
    historyState.renderedCount = files.length;
  }
  historyState.title = title;
  
  const container = document.getElementById('results');
  if (!container) return;
  
  // Rendre le squelette (header + grille + bouton 'Charger plus' + filtres)
  renderHistorySkeleton(container, title);
  // Accumuler les fichiers parsés et n'afficher que ceux correspondant au filtre
  accumulateParsedBatch(files);
  const filtered = filterFilesForHistory(files);
  appendHistoryCards(filtered);
  updateLoadMoreVisibility();
  // Assurer que la barre de progression est masquée au rendu initial
  try {
    const wrap = document.getElementById('historyProgressWrap');
    if (wrap) wrap.style.display = 'none';
  } catch (_) {}

  // Auto-chargement du profil au démarrage (une seule fois)
  // Si on démarre sur la vue profil, qu'un pilote est configuré et que c'est un nouveau scan,
  // générer le contenu du profil automatiquement sans nécessiter de clic utilisateur.
  try {
    const onProfileView = window.LMUNavigation && typeof window.LMUNavigation.getCurrentView === 'function'
      ? window.LMUNavigation.getCurrentView() === 'profile'
      : false;
    const hasDriver = !!(driverName && driverName.trim());
    if (isNewScan && onProfileView && hasDriver && !window.__lmuProfileAutoloadDone) {
      window.__lmuProfileAutoloadDone = true;
      if (window.LMUProfileManager && typeof window.LMUProfileManager.generateProfileContent === 'function') {
        window.LMUProfileManager.generateProfileContent();
      }
    }
  } catch (_) { /* no-op */ }
}

// Rendre l'entête et la grille vide + bouton 'Charger plus'
function renderHistorySkeleton(container, title) {
  const isActive = (k) => historyState.filter === k ? 'background:var(--brand);color:#fff;' : 'background:var(--panel);color:var(--text);';
  const skeleton = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px;flex-wrap:wrap;">
      <h2 style="margin:0;">${title}</h2>
      <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;">
        <div class="row" style="gap:6px;">
          <button class="btn" style="font-size:12px;padding:6px 10px;${isActive('all')}" onclick="setHistoryFilter('all')">Tous</button>
          <button class="btn" style="font-size:12px;padding:6px 10px;${isActive('race')}" onclick="setHistoryFilter('race')">🏁 Course</button>
          <button class="btn" style="font-size:12px;padding:6px 10px;${isActive('qual')}" onclick="setHistoryFilter('qual')">⏱️ Qualif</button>
          <button class="btn" style="font-size:12px;padding:6px 10px;${isActive('practice')}" onclick="setHistoryFilter('practice')">🧪 Essais</button>
        </div>
        <button class="btn" onclick="manualRescan()" style="font-size:12px;padding:6px 12px;">🔄 Actualiser</button>
        <button class="btn" id="btnLoadAllHistory" onclick="loadAllHistory()" style="font-size:12px;padding:6px 12px;">⚡ Charger tout</button>
      </div>
    </div>
    <div id="historyProgressWrap" style="display:none;margin-bottom:12px;">
      <div class="muted" id="historyProgressText" style="font-size:12px;margin-bottom:6px;">Chargement…</div>
      <div style="height:8px;background:var(--panel);border-radius:6px;overflow:hidden;">
        <div id="historyProgressBar" style="height:100%;width:0%;background:linear-gradient(90deg,var(--brand),var(--accent));transition:width .2s ease;"></div>
      </div>
    </div>
    <div id="historyGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;"></div>
    <div id="historyLoadMore" style="margin-top:16px;text-align:center;">
      <button class="btn" id="btnLoadMoreHistory" onclick="loadMoreHistory()">⬇️ Charger plus</button>
    </div>
  `;
  container.innerHTML = skeleton;
}

// Afficher/mettre à jour la barre de progression
function updateProgress(current, total) {
  const wrap = document.getElementById('historyProgressWrap');
  const bar = document.getElementById('historyProgressBar');
  const txt = document.getElementById('historyProgressText');
  if (!wrap || !bar || !txt) return;
  wrap.style.display = '';
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  bar.style.width = pct + '%';
  txt.textContent = `Chargement des sessions… ${current}/${total}`;
  const btn = document.getElementById('btnLoadMoreHistory');
  const loadMoreWrap = document.getElementById('historyLoadMore');
  if (loadMoreWrap) loadMoreWrap.style.display = 'none';
}

function startAutoLoadProgress() {
  historyState.isAutoLoading = true;
  historyState.autoLoadBatchCounter = 0;
  try { window.__lmu_autoLoading = true; } catch (_) {}
  updateProgress(historyState.renderedCount, historyState.filesMetaSorted.length);
  try {
    const btnAll = document.getElementById('btnLoadAllHistory');
    if (btnAll) btnAll.style.display = 'none';
  } catch (_) {}
}

function stopAutoLoadProgress() {
  const wrap = document.getElementById('historyProgressWrap');
  if (wrap) wrap.style.display = 'none';
  updateLoadMoreVisibility();
  historyState.isAutoLoading = false;
  try { window.__lmu_autoLoading = false; } catch (_) {}
  // Réécrire le cache avec l'état final (progress cachée)
  try {
    const container = document.getElementById('results');
    if (container) {
      const html = container.innerHTML;
      if (window.LMUCacheManager) {
        window.LMUCacheManager.setCachedContent('history', html, historyState.cacheParams);
      }
      localStorage.setItem('lmu.cachedHistoryHTML', html);
      localStorage.setItem('lmu.cachedHistoryMeta', JSON.stringify(historyState.cacheParams || {}));
    }
  } catch (_) {}
  // Lancer une invalidation/rafraîchissement final modéré
  try {
    if (window.LMUStatsCalculator && window.LMUStatsCalculator.invalidateCache) {
      window.LMUStatsCalculator.invalidateCache();
    }
    if (window.LMUCacheManager && window.LMUCacheManager.invalidateCache) {
      window.LMUCacheManager.invalidateCache('profile');
      window.LMUCacheManager.invalidateCache('vehicles');
      window.LMUCacheManager.invalidateCache('vehicleDetail');
    }
    const detail = { rendered: historyState.renderedCount, totalMeta: historyState.filesMetaSorted.length };
    window.dispatchEvent(new CustomEvent('lmu:history-updated', { detail }));
  } catch (_) {}
}

// Charger automatiquement tous les lots restants
async function autoLoadAllBatches() {
  const total = historyState.filesMetaSorted.length;
  const followupBatchSize = 3; // lots plus petits pour fluidifier l'UI
  while (historyState.renderedCount < total) {
    const start = historyState.renderedCount;
    const end = Math.min(start + followupBatchSize, total);
    const nextBatchPaths = historyState.filesMetaSorted.slice(start, end).map(m => m.filePath);
    try {
      const parseRes = await window.lmuAPI.parseLmuFiles(nextBatchPaths);
      if (parseRes && !parseRes.canceled) {
          // Filtrer selon les types sélectionnés (Paramètres)
          let files = parseRes.files || [];
          try {
            const loadTypes = window.LMUStorage && window.LMUStorage.loadSelectedLoadTypes ? window.LMUStorage.loadSelectedLoadTypes() : { race: true, qual: true, practice: true };
            const typeOk = (t) => (t === 'race' && loadTypes.race) || (t === 'qual' && loadTypes.qual) || (t === 'practice' && loadTypes.practice) || (t === 'unknown');
            files = files.filter(f => typeOk(getFileSessionType(f)));
          } catch (_) {}
        accumulateParsedBatch(files);
        const filtered = filterFilesForHistory(files);
        appendHistoryCards(filtered);
        historyState.renderedCount = end;
        updateProgress(historyState.renderedCount, total);
      } else {
        break;
      }
    } catch (_) {
      break;
    }
    // Laisser respirer l'UI
    await new Promise(r => setTimeout(r, 0));
  }
}

// Rendre le prochain lot de cartes et mettre à jour le cache/événements
function renderNextHistoryBatch() {
  const container = document.getElementById('results');
  const grid = document.getElementById('historyGrid');
  if (!container || !grid) return;

  const start = historyState.renderedCount;
  const end = Math.min(start + historyState.pageSize, historyState.filesMetaSorted.length);
  if (start >= end) {
    // Rien à ajouter
    updateLoadMoreVisibility();
    return;
  }
  const nextBatchPaths = historyState.filesMetaSorted.slice(start, end).map(m => m.filePath);
  // Demander au main process de parser le prochain lot
  window.lmuAPI.parseLmuFiles(nextBatchPaths).then(parseRes => {
    if (parseRes && !parseRes.canceled) {
        // Filtrer selon les types sélectionnés (Paramètres)
        let files = parseRes.files || [];
        try {
          const loadTypes = window.LMUStorage && window.LMUStorage.loadSelectedLoadTypes ? window.LMUStorage.loadSelectedLoadTypes() : { race: true, qual: true, practice: true };
          const typeOk = (t) => (t === 'race' && loadTypes.race) || (t === 'qual' && loadTypes.qual) || (t === 'practice' && loadTypes.practice) || (t === 'unknown');
          files = files.filter(f => typeOk(getFileSessionType(f)));
        } catch (_) {}
      accumulateParsedBatch(files);
      const filtered = filterFilesForHistory(files);
      appendHistoryCards(filtered);
      historyState.renderedCount = end;
    }
    updateLoadMoreVisibility();
  }).catch(() => updateLoadMoreVisibility());
}

// Accumuler les fichiers parsés (tous, quel que soit le filtre UI)
function accumulateParsedBatch(files) {
  try {
    if (!Array.isArray(lastScannedFiles)) lastScannedFiles = [];
    const existing = new Map(lastScannedFiles.map(f => [f.filePath, true]));
    for (const f of files) {
      if (f && f.filePath && !existing.has(f.filePath)) {
        lastScannedFiles.push(f);
        existing.set(f.filePath, true);
      }
    }
  } catch (_) {}
}

// Déterminer le type de session d'un fichier parsé
function getFileSessionType(file) {
  try {
    const rr = window.LMUXMLParser ? window.LMUXMLParser.getRaceResultsRoot(file.parsed) : null;
    const picked = rr && window.LMUXMLParser ? window.LMUXMLParser.pickSession(rr) : null;
    const name = (picked && picked.name || '').toLowerCase();
    if (!name) return 'unknown';
    if (name.includes('race')) return 'race';
    if (name.includes('qual')) return 'qual';
    if (name.includes('practice') || name.includes('practise') || name.includes('warm')) return 'practice';
    return 'unknown';
  } catch (_) { return 'unknown'; }
}

// Filtrer une liste (lot) selon le filtre courant
function filterFilesForHistory(list) {
  if (historyState.filter === 'all') return list;
  const want = historyState.filter;
  const out = [];
  for (const f of list) {
    const t = getFileSessionType(f);
    if (t === want) out.push(f);
  }
  return out;
}

function appendHistoryCards(files) {
  const container = document.getElementById('results');
  const grid = document.getElementById('historyGrid');
  if (!container || !grid) return;
  // Fusionner ce lot dans la liste globale pour que les stats/profil incluent ces sessions
  try {
    if (!Array.isArray(lastScannedFiles)) lastScannedFiles = [];
    const existing = new Map(lastScannedFiles.map(f => [f.filePath, true]));
    for (const f of files) {
      if (f && f.filePath && !existing.has(f.filePath)) {
        lastScannedFiles.push(f);
        existing.set(f.filePath, true);
      }
    }
  } catch (_) {}
  const cards = files.map(file => window.LMURenderEngine ? window.LMURenderEngine.generateSessionCard(file) : '').join('');
  const temp = document.createElement('div');
  temp.innerHTML = cards;
  Array.from(temp.children).forEach(child => grid.appendChild(child));
  // Événements
  setupCardEvents(grid);
  // Cache
  try {
    // Mettre à jour les params de cache avec le nouveau total courant
    if (historyState && historyState.cacheParams) {
      historyState.cacheParams.filesLength = Array.isArray(lastScannedFiles) ? lastScannedFiles.length : (historyState.cacheParams.filesLength || 0);
    }
    if (!historyState.isAutoLoading) {
      const html = container.innerHTML;
      if (window.LMUCacheManager) {
        window.LMUCacheManager.setCachedContent('history', html, historyState.cacheParams);
      }
      localStorage.setItem('lmu.cachedHistoryHTML', html);
      localStorage.setItem('lmu.cachedHistoryMeta', JSON.stringify(historyState.cacheParams));
    }
  } catch (_) {}
  // Invalidations/évènements: throttle pendant auto-chargement
  try {
    const totalMeta = historyState.filesMetaSorted.length;
    let shouldNotify = true;
    if (historyState.isAutoLoading) {
      historyState.autoLoadBatchCounter = (historyState.autoLoadBatchCounter || 0) + 1;
      // Ne notifier et invalider que toutes les 3 batches, ou à la fin
      shouldNotify = (historyState.autoLoadBatchCounter % 3 === 0) || (historyState.renderedCount >= totalMeta);
    }
    if (shouldNotify) {
      if (window.LMUStatsCalculator && window.LMUStatsCalculator.invalidateCache) {
        window.LMUStatsCalculator.invalidateCache();
      }
      if (window.LMUCacheManager && window.LMUCacheManager.invalidateCache) {
        window.LMUCacheManager.invalidateCache('profile');
        window.LMUCacheManager.invalidateCache('vehicles');
        window.LMUCacheManager.invalidateCache('vehicleDetail');
      }
      const detail = { rendered: historyState.renderedCount, totalMeta };
      window.dispatchEvent(new CustomEvent('lmu:history-updated', { detail }));
    }
  } catch (_) {}
}

function updateLoadMoreVisibility() {
  const btn = document.getElementById('btnLoadMoreHistory');
  const loadMoreWrap = document.getElementById('historyLoadMore');
  const btnAll = document.getElementById('btnLoadAllHistory');
  if (!btn || !loadMoreWrap) return;
  const hasMore = historyState.renderedCount < historyState.filesMetaSorted.length;
  if (historyState.isAutoLoading) {
    loadMoreWrap.style.display = 'none';
    if (btnAll) btnAll.style.display = 'none';
  } else if (!hasMore) {
    loadMoreWrap.style.display = 'none';
    if (btnAll) btnAll.style.display = 'none';
  } else {
    loadMoreWrap.style.display = '';
    if (btnAll) btnAll.style.display = '';
  }
}

// Changer le filtre et re-rendre la grille avec les fichiers déjà parsés
function setHistoryFilter(filter) {
  historyState.filter = filter;
  const container = document.getElementById('results');
  if (!container) return;
  // Recréer le header (pour l'état actif des boutons)
  renderHistorySkeleton(container, historyState.title || 'Sessions trouvées');
  const grid = document.getElementById('historyGrid');
  if (!grid) return;
  // Filtrer sur l'ensemble des fichiers parsés à ce stade
  const list = Array.isArray(lastScannedFiles) ? lastScannedFiles.slice() : [];
  const filtered = filterFilesForHistory(list);
  appendHistoryCards(filtered);
  updateLoadMoreVisibility();
}

// Handler global pour le bouton 'Charger plus'
function loadMoreHistory() {
  renderNextHistoryBatch();
}

// Handler global pour le bouton 'Charger tout'
async function loadAllHistory() {
  if (historyState.isAutoLoading) return;
  const total = historyState.filesMetaSorted.length;
  if (historyState.renderedCount >= total) {
    updateLoadMoreVisibility();
    return;
  }
  startAutoLoadProgress();
  await autoLoadAllBatches();
  stopAutoLoadProgress();
}

// Configurer les événements sur les cartes de session
function setupCardEvents(container) {
  container.querySelectorAll('[data-file-path]').forEach(card => {
    const filePath = card.getAttribute('data-file-path');
    if (!filePath) return;
    
    // Effets de survol
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-2px)';
      card.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
    });
    
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'translateY(0)';
      card.style.boxShadow = '';
    });
    
    // Rendu in-place de la session (SPA) sans rechargement
    card.addEventListener('click', async () => {
      const decodedPath = decodeURIComponent(filePath);
      try {
        window.history.pushState({ type: 'session', filePath: decodedPath }, '', '#session');
      } catch (_) {}
      renderSessionInPlace(decodedPath);
    });
  });
}

// Rendu d'une session dans la vue historique sans changer de page
async function renderSessionInPlace(absFilePath) {
  const container = document.getElementById('results');
  if (!container) return;
  
    container.innerHTML = `<div class="row" style="justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;">
      <button class="btn" id="btnBackToHistory">⬅️ Retour</button>
      <span class="muted" style="font-size:12px;word-break:break-all;">${absFilePath}</span>
    </div>
    <div id="sessionView" class="card"><span class="spinner"></span> Chargement de la session…</div>`;
  
  const btn = container.querySelector('#btnBackToHistory');
  if (btn) btn.addEventListener('click', (e) => {
    e.preventDefault();
    try { window.history.back(); } catch (_) { restoreHistoryFromCache(); }
  });
  
  try {
    const res = await window.lmuAPI.openFileByPath(absFilePath);
    if (res.canceled) {
      container.querySelector('#sessionView').innerHTML = `<p class="muted">Erreur: ${res.error || 'inconnue'}</p>`;
      return;
    }
    const session = window.LMUXMLParser ? window.LMUXMLParser.extractSession(res.parsed) : null;
    if (!session) {
      container.querySelector('#sessionView').innerHTML = `<pre>${JSON.stringify(res.parsed, null, 2)}</pre>`;
      return;
    }
    if (window.LMURenderEngine && window.LMURenderEngine.renderSessionInto) {
      window.LMURenderEngine.renderSessionInto(container.querySelector('#sessionView'), res.filePath, session);
    } else {
      container.querySelector('#sessionView').innerHTML = '<p class="muted">Module de rendu non disponible.</p>';
    }
  } catch (error) {
    console.error('Erreur lors du rendu de la session:', error);
    const el = container.querySelector('#sessionView');
    if (el) el.innerHTML = `<p class="muted">Erreur lors du chargement: ${error.message}</p>`;
  }
}

// Restaurer la liste de l'historique depuis le cache persistant
function restoreHistoryFromCache() {
  const container = document.getElementById('results');
  if (!container) return false;
  try {
    const cached = localStorage.getItem('lmu.cachedHistoryHTML');
    if (!cached) return false;
    container.innerHTML = cached;
    setupCardEvents(container);
    try { window.history.replaceState({ type: 'history' }, '', '#history'); } catch (_) {}
    return true;
  } catch (_) { return false; }
}

// Afficher un fichier sélectionné depuis le sélecteur
function showSelectedFile() {
  if (!fileSelect) return;
  
  const path = fileSelect.value;
  const item = (lastScannedFiles || []).find(f => f.filePath === path);
  const container = document.getElementById('results');
  
  if (!container) return;
  
  if (!item) {
    container.innerHTML = `<p class="muted">Aucun fichier sélectionné.</p>`;
    return;
  }
  
  container.innerHTML = `<h2>Fichier : ${item.filePath}</h2>`;
  
  const session = window.LMUXMLParser ? window.LMUXMLParser.extractSession(item.parsed) : null;
  if (session) {
    if (window.LMURenderEngine && window.LMURenderEngine.renderSessionInto) {
      window.LMURenderEngine.renderSessionInto(container, null, session);
    }
    lastSession = session;
  } else {
    container.innerHTML += `<pre>${JSON.stringify(item.parsed, null, 2)}</pre>`;
  }
}

// Obtenir les derniers fichiers scannés
function getLastScannedFiles() {
  return lastScannedFiles;
}

// Obtenir la dernière session affichée
function getLastSession() {
  return lastSession;
}

// Définir les fichiers scannés (pour usage externe)
function setLastScannedFiles(files) {
  lastScannedFiles = files;
  
  // Invalider le cache
  if (window.LMUStatsCalculator && window.LMUStatsCalculator.invalidateCache) {
    window.LMUStatsCalculator.invalidateCache();
  }
}

// Vérifier si des fichiers ont été scannés
function hasScannedFiles() {
  return lastScannedFiles && lastScannedFiles.length > 0;
}

// Obtenir le nombre de fichiers valides scannés
function getValidFileCount() {
  if (!lastScannedFiles) return 0;
  return lastScannedFiles.filter(f => !f.error).length;
}

// Obtenir le nombre de fichiers avec erreurs
function getErrorFileCount() {
  if (!lastScannedFiles) return 0;
  return lastScannedFiles.filter(f => f.error).length;
}

// Réinitialiser l'état des fichiers
function resetFileState() {
  lastScannedFiles = null;
  lastSession = null;
  
  if (window.LMUStatsCalculator && window.LMUStatsCalculator.invalidateCache) {
    window.LMUStatsCalculator.invalidateCache();
  }
}

// Export des fonctions
if (typeof window !== 'undefined') {
  window.LMUFileManager = {
    initFileManager,
    setupEventListeners,
    openSingleFile,
    openFolderDialog,
    selectFolderForSettings,
    scanConfiguredFolder,
    displayScannedFiles,
    setupCardEvents,
    renderSessionInPlace,
    restoreHistoryFromCache,
    showSelectedFile,
    getLastScannedFiles,
    getLastSession,
    setLastScannedFiles,
    hasScannedFiles,
    getValidFileCount,
    getErrorFileCount,
    resetFileState
  };
  // Exposer loadMoreHistory pour l'onclick du bouton
  window.loadMoreHistory = loadMoreHistory;
  window.loadAllHistory = loadAllHistory;
  // Exposer le filtre pour l'onclick des boutons
  window.setHistoryFilter = setHistoryFilter;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initFileManager,
    setupEventListeners,
    openSingleFile,
    openFolderDialog,
    selectFolderForSettings,
    scanConfiguredFolder,
    displayScannedFiles,
    setupCardEvents,
    showSelectedFile,
    getLastScannedFiles,
    getLastSession,
    setLastScannedFiles,
    hasScannedFiles,
    getValidFileCount,
    getErrorFileCount,
    resetFileState
  };
}

})(); // Fermeture de la fonction IIFE