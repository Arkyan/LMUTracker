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

// Initialiser le module de stockage
function initStorage() {
  // Récupérer les éléments DOM
  resultsFolderInput = document.getElementById('resultsFolder');
  driverNameInput = document.getElementById('driverName');
  currentFolderSpan = document.getElementById('currentFolder');
  btnSaveSettings = document.getElementById('btnSaveSettings');
  
  // Charger les valeurs sauvegardées
  loadSavedSettings();
  
  // Ajouter l'événement de sauvegarde si le bouton existe
  if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', saveSettings);
  }
}

// Charger le dossier de résultats sauvegardé
function loadSavedFolder() {
  const saved = localStorage.getItem(STORAGE_KEYS.RESULTS_FOLDER) || '';
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
  const saved = localStorage.getItem(STORAGE_KEYS.DRIVER_NAME) || '';
  if (driverNameInput) {
    driverNameInput.value = saved;
  }
  return saved;
}

// Charger la classe de voiture sélectionnée
function loadSelectedCarClass() {
  const saved = localStorage.getItem(STORAGE_KEYS.SELECTED_CAR_CLASS) || 'Hyper';
  return saved;
}

// Charger tous les paramètres sauvegardés
function loadSavedSettings() {
  loadSavedFolder();
  loadSavedDriverName();
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
  return localStorage.getItem(STORAGE_KEYS.DRIVER_NAME) || '';
}

// Obtenir le dossier de résultats configuré
function getConfiguredResultsFolder() {
  return localStorage.getItem(STORAGE_KEYS.RESULTS_FOLDER) || '';
}

// Sauvegarder le dossier de résultats
function saveResultsFolder(folderPath) {
  localStorage.setItem(STORAGE_KEYS.RESULTS_FOLDER, folderPath);
  if (currentFolderSpan) {
    currentFolderSpan.textContent = folderPath ? `Dossier par défaut: ${folderPath}` : '';
  }
}

// Sauvegarder le nom de pilote
function saveDriverName(driverName) {
  localStorage.setItem(STORAGE_KEYS.DRIVER_NAME, driverName);
}

// Sauvegarder la classe de voiture sélectionnée
function saveSelectedCarClass(carClass) {
  localStorage.setItem(STORAGE_KEYS.SELECTED_CAR_CLASS, carClass);
}

// Sauvegarder tous les paramètres
function saveSettings() {
  const folderValue = resultsFolderInput ? resultsFolderInput.value.trim() : '';
  const driverValue = driverNameInput ? driverNameInput.value.trim() : '';
  
  // Sauvegarder les valeurs
  saveResultsFolder(folderValue);
  saveDriverName(driverValue);
  
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
function resetSettings() {
  localStorage.removeItem(STORAGE_KEYS.RESULTS_FOLDER);
  localStorage.removeItem(STORAGE_KEYS.DRIVER_NAME);
  localStorage.removeItem(STORAGE_KEYS.SELECTED_CAR_CLASS);
  
  loadSavedSettings();
  
  if (window.LMUStatsCalculator && window.LMUStatsCalculator.invalidateCache) {
    window.LMUStatsCalculator.invalidateCache();
  }
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