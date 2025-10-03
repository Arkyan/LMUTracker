/**
 * Module de gestion du stockage local pour LMU Tracker
 * Gère le localStorage et la configuration utilisateur
 */

(function() {
  // Clés de stockage
  const STORAGE_KEYS = {
  RESULTS_FOLDER: 'lmu.resultsFolder',
  DRIVER_NAME: 'lmu.driverName',
  SELECTED_CAR_CLASS: 'lmu.selectedCarClass'
};

// Éléments DOM
let resultsFolderInput = null;
let driverNameInput = null;
let currentFolderSpan = null;
let btnSaveSettings = null;

// Cache en mémoire des paramètres persistés
let persistedSettings = {
  resultsFolder: '',
  driverName: '',
  selectedCarClass: 'Hyper'
};

// Utilitaires: lire/écrire via l'API preload (IPC)
async function readPersistedSettings() {
  try {
    if (window.lmuAPI && window.lmuAPI.readSettings) {
      const res = await window.lmuAPI.readSettings();
      if (res && res.ok) {
        return res.data || {};
      }
    }
  } catch (e) {}
  return {};
}

async function writePersistedSettings(data) {
  try {
    if (window.lmuAPI && window.lmuAPI.writeSettings) {
      await window.lmuAPI.writeSettings(data || {});
    }
  } catch (e) {}
}

// Initialiser le module de stockage
async function initStorage() {
  // Récupérer les éléments DOM
  resultsFolderInput = document.getElementById('resultsFolder');
  driverNameInput = document.getElementById('driverName');
  currentFolderSpan = document.getElementById('currentFolder');
  btnSaveSettings = document.getElementById('btnSaveSettings');
  
  // Charger les valeurs sauvegardées (persistées JSON)
  await ensureSettingsLoaded();
  applySettingsToUI();
  
  // Ajouter l'événement de sauvegarde si le bouton existe
  if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', saveSettings);
  }
}

// Charger le dossier de résultats sauvegardé
function loadSavedFolder() {
  const saved = persistedSettings.resultsFolder || '';
  if (resultsFolderInput) {
    resultsFolderInput.value = saved;
  }
  if (currentFolderSpan) {
    currentFolderSpan.textContent = saved ? `Dossier par défaut: ${saved}` : '';
  }
  return saved;
}

// Charger le nom de pilote sauvegardé
function loadSavedDriverName() {
  const saved = persistedSettings.driverName || '';
  if (driverNameInput) {
    driverNameInput.value = saved;
  }
  return saved;
}

// Charger la classe de voiture sélectionnée
function loadSelectedCarClass() {
  return persistedSettings.selectedCarClass || 'Hyper';
}

// Charger tous les paramètres sauvegardés
function loadSavedSettings() {
  // Compat: conserve la signature (utilisée ailleurs) mais lit depuis le cache
  applySettingsToUI();
  const selectedClass = loadSelectedCarClass();
  
  // Mettre à jour la navigation avec la classe sélectionnée
  if (window.LMUNavigation && window.LMUNavigation.filterByCarClass) {
    // Note: On ne déclenche pas filterByCarClass ici pour éviter de régénérer le profil
    // avant que tous les modules soient initialisés
  }
  
  return {
    folder: loadSavedFolder(),
    driverName: loadSavedDriverName(),
    selectedCarClass: selectedClass
  };
}

// Obtenir le nom de pilote configuré
function getConfiguredDriverName() {
  return persistedSettings.driverName || '';
}

// Obtenir le dossier de résultats configuré
function getConfiguredResultsFolder() {
  return persistedSettings.resultsFolder || '';
}

// Sauvegarder le dossier de résultats
function saveResultsFolder(folderPath) {
  persistedSettings.resultsFolder = folderPath || '';
  if (currentFolderSpan) {
    currentFolderSpan.textContent = folderPath ? `Dossier par défaut: ${folderPath}` : '';
  }
}

// Sauvegarder le nom de pilote
function saveDriverName(driverName) {
  persistedSettings.driverName = driverName || '';
}

// Sauvegarder la classe de voiture sélectionnée
function saveSelectedCarClass(carClass) {
  persistedSettings.selectedCarClass = carClass || 'Hyper';
}

// Sauvegarder tous les paramètres
async function saveSettings() {
  const folderValue = resultsFolderInput ? resultsFolderInput.value.trim() : '';
  const driverValue = driverNameInput ? driverNameInput.value.trim() : '';
  
  // Sauvegarder les valeurs
  saveResultsFolder(folderValue);
  saveDriverName(driverValue);
  await writePersistedSettings(persistedSettings);
  
  // Recharger les valeurs pour mettre à jour l'affichage
  loadSavedFolder();
  loadSavedDriverName();
  
  // Feedback visuel
  if (btnSaveSettings) {
    const originalText = btnSaveSettings.textContent;
    btnSaveSettings.textContent = '✅ Sauvegardé !';
    btnSaveSettings.style.background = 'var(--ok)';
    
    setTimeout(() => {
      btnSaveSettings.textContent = originalText;
      btnSaveSettings.style.background = '';
    }, 2000);
  }
  
  // Invalider le cache des statistiques car le nom de pilote a peut-être changé
  if (window.LMUStatsCalculator && window.LMUStatsCalculator.invalidateCache) {
    window.LMUStatsCalculator.invalidateCache();
  }
  
  // Invalider le cache des vues car les paramètres ont changé
  if (window.LMUCacheManager && window.LMUCacheManager.invalidateCache) {
    window.LMUCacheManager.invalidateCache();
  }
  
  // Mettre à jour le profil avec les nouveaux paramètres
  if (window.LMUProfileManager && window.LMUProfileManager.generateProfileContent) {
    window.LMUProfileManager.generateProfileContent();
  }
  
  // Passer à la vue profil pour voir les changements
  if (window.LMUNavigation && window.LMUNavigation.navigateToProfile) {
    window.LMUNavigation.navigateToProfile();
  }
  
  // Scanner le nouveau dossier si nécessaire
  if (window.LMUFileManager && window.LMUFileManager.scanConfiguredFolder) {
    window.LMUFileManager.scanConfiguredFolder();
  }
  
  return true;
}

// Mettre à jour le dossier de résultats (appelé depuis le sélecteur de dossier)
function updateResultsFolder(folderPath) {
  if (resultsFolderInput) {
    resultsFolderInput.value = folderPath;
  }
  saveResultsFolder(folderPath || '');
}

// Vérifier si les paramètres de base sont configurés
function areBasicSettingsConfigured() {
  const driverName = getConfiguredDriverName();
  const resultsFolder = getConfiguredResultsFolder();
  
  return driverName.trim() !== '' && resultsFolder.trim() !== '';
}

// Obtenir tous les paramètres actuels
function getAllSettings() {
  return {
    resultsFolder: getConfiguredResultsFolder(),
    driverName: getConfiguredDriverName(),
    selectedCarClass: loadSelectedCarClass()
  };
}

// Réinitialiser tous les paramètres
async function resetSettings() {
  persistedSettings = { resultsFolder: '', driverName: '', selectedCarClass: 'Hyper' };
  await writePersistedSettings(persistedSettings);
  applySettingsToUI();
  
  if (window.LMUStatsCalculator && window.LMUStatsCalculator.invalidateCache) {
    window.LMUStatsCalculator.invalidateCache();
  }
}

// Charger depuis JSON au démarrage et migrer localStorage -> JSON si nécessaire
async function ensureSettingsLoaded() {
  const fromDisk = await readPersistedSettings();
  const diskHasValues = fromDisk && (fromDisk.resultsFolder || fromDisk.driverName || fromDisk.selectedCarClass);

  if (diskHasValues) {
    persistedSettings = {
      resultsFolder: fromDisk.resultsFolder || '',
      driverName: fromDisk.driverName || '',
      selectedCarClass: fromDisk.selectedCarClass || 'Hyper'
    };
  } else {
    // Migration depuis localStorage si présent
    try {
      const lsFolder = localStorage.getItem(STORAGE_KEYS.RESULTS_FOLDER) || '';
      const lsDriver = localStorage.getItem(STORAGE_KEYS.DRIVER_NAME) || '';
      const lsClass = localStorage.getItem(STORAGE_KEYS.SELECTED_CAR_CLASS) || 'Hyper';
      persistedSettings = { resultsFolder: lsFolder, driverName: lsDriver, selectedCarClass: lsClass };
      await writePersistedSettings(persistedSettings);
    } catch (_) {
      // Fallback par défaut
      persistedSettings = { resultsFolder: '', driverName: '', selectedCarClass: 'Hyper' };
      await writePersistedSettings(persistedSettings);
    }
  }
}

function applySettingsToUI() {
  if (resultsFolderInput) resultsFolderInput.value = persistedSettings.resultsFolder || '';
  if (driverNameInput) driverNameInput.value = persistedSettings.driverName || '';
  if (currentFolderSpan) currentFolderSpan.textContent = persistedSettings.resultsFolder ? `Dossier par défaut: ${persistedSettings.resultsFolder}` : '';
}

// Export des fonctions
if (typeof window !== 'undefined') {
  window.LMUStorage = {
    initStorage,
    loadSavedFolder,
    loadSavedDriverName,
    loadSelectedCarClass,
    loadSavedSettings,
    getConfiguredDriverName,
    getConfiguredResultsFolder,
    saveResultsFolder,
    saveDriverName,
    saveSelectedCarClass,
    saveSettings,
    updateResultsFolder,
    areBasicSettingsConfigured,
    getAllSettings,
    resetSettings,
    STORAGE_KEYS
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initStorage,
    loadSavedFolder,
    loadSavedDriverName,
    loadSelectedCarClass,
    loadSavedSettings,
    getConfiguredDriverName,
    getConfiguredResultsFolder,
    saveResultsFolder,
    saveDriverName,
    saveSelectedCarClass,
    saveSettings,
    updateResultsFolder,
    areBasicSettingsConfigured,
    getAllSettings,
    resetSettings,
    STORAGE_KEYS
  };
}

})(); // Fermeture de la fonction IIFE