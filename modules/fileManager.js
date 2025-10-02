/**
 * Module de gestion des fichiers pour LMU Tracker
 * Gère le scan des dossiers, l'ouverture de fichiers et la gestion de l'historique
 */

(function() {
  // Variables d'état
  let lastScannedFiles = null; // [{filePath, parsed}] ou erreurs
let lastSession = null; // session extraite du fichier affiché

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
  
  // Scanner automatiquement le dossier configuré au démarrage
  setTimeout(() => {
    scanConfiguredFolder();
  }, 100);
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
  
  displayScannedFiles(res.files, `Dossier : ${res.folderPath}`);
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
  
  const res = await window.lmuAPI.scanFolder(folder);
  if (res.canceled) {
    container.innerHTML = `<p class="muted">Scan annulé: ${res.error ?? ''}</p>`;
    return;
  }
  
  if (Array.isArray(res.files)) {
    displayScannedFiles(res.files, `Sessions trouvées`);
  }
}

// Afficher les fichiers scannés
function displayScannedFiles(files, title) {
  lastScannedFiles = files;
  
  // Invalider le cache lors du changement de données
  if (window.LMUStatsCalculator && window.LMUStatsCalculator.invalidateCache) {
    window.LMUStatsCalculator.invalidateCache();
  }
  
  // Trier les fichiers du plus récent au plus ancien
  const sortedFiles = files.slice().sort((a, b) => {
    const getDateTime = (file) => {
      const rr = window.LMUXMLParser ? window.LMUXMLParser.getRaceResultsRoot(file.parsed) : null;
      if (rr && rr.DateTime) {
        return parseInt(rr.DateTime) * 1000; // Convertir en millisecondes
      }
      return file.mtimeIso ? new Date(file.mtimeIso).getTime() : 0;
    };
    return getDateTime(b) - getDateTime(a); // Plus récent en premier
  });
  
  // Générer les cartes avec le renderEngine
  const cards = sortedFiles.map(file => 
    window.LMURenderEngine ? window.LMURenderEngine.generateSessionCard(file) : ''
  ).join('');
  
  const container = document.getElementById('results');
  if (!container) return;
  
  container.innerHTML = `<h2>${title}</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;margin-top:16px;">
      ${cards}
    </div>`;
  
  // Ajouter les événements de clic sur les cartes
  setupCardEvents(container);
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
    
    // Navigation vers la page de session
    card.addEventListener('click', () => {
      window.location.href = `session.html?file=${filePath}`;
    });
  });
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