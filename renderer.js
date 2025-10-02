/**
 * LMU Tracker - Fichier principal
 * Coordonne les différents modules de l'application
 */

(function() {
  // Variables globales pour compatibilité avec l'application
  let lastScannedFiles = null;
  let lastSession = null;
  let cachedStats = null;
  let cachedTrackStats = null;
  let selectedCarClass = 'Hyper';
})();

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM chargé, attente du chargement des modules...');
  
  // Attendre que tous les modules soient chargés
  const checkModulesLoaded = () => {
    const requiredModules = [
      'LMUUtils',
      'LMUXMLParser', 
      'LMUStatsCalculator',
      'LMURenderEngine',
      'LMUStorage',
      'LMUNavigation',
      'LMUFileManager',
      'LMUProfileManager'
    ];
    
    const loadedModules = requiredModules.filter(module => window[module]);
    console.log(`Modules chargés: ${loadedModules.length}/${requiredModules.length}`);
    console.log('Chargés:', loadedModules);
    console.log('Manquants:', requiredModules.filter(module => !window[module]));
    
    if (loadedModules.length === requiredModules.length) {
      console.log('Tous les modules sont chargés, initialisation...');
      initializeApp();
    } else {
      console.log('Attente des modules manquants...');
      setTimeout(checkModulesLoaded, 100);
    }
  };
  
  // Commencer la vérification après un court délai pour laisser les scripts se charger
  setTimeout(checkModulesLoaded, 50);
});

// Initialiser tous les modules
function initializeApp() {
  console.log('Initialisation de LMU Tracker...');
  
  // Vérifier que tous les modules sont chargés
  console.log('Modules disponibles:');
  console.log('- LMUUtils:', !!window.LMUUtils);
  console.log('- LMUXMLParser:', !!window.LMUXMLParser);
  console.log('- LMUStatsCalculator:', !!window.LMUStatsCalculator);
  console.log('- LMURenderEngine:', !!window.LMURenderEngine);
  console.log('- LMUStorage:', !!window.LMUStorage);
  console.log('- LMUNavigation:', !!window.LMUNavigation);
  console.log('- LMUFileManager:', !!window.LMUFileManager);
  console.log('- LMUProfileManager:', !!window.LMUProfileManager);
  
  try {
    // Initialiser les modules dans l'ordre de dépendance
    if (window.LMUStorage) {
      console.log('Initialisation du module Storage...');
      window.LMUStorage.initStorage();
    } else {
      console.error('Module LMUStorage non disponible');
    }
    
    if (window.LMUNavigation) {
      console.log('Initialisation du module Navigation...');
      window.LMUNavigation.initNavigation();
    } else {
      console.error('Module LMUNavigation non disponible');
    }
    
    if (window.LMUFileManager) {
      console.log('Initialisation du module FileManager...');
      window.LMUFileManager.initFileManager();
    } else {
      console.error('Module LMUFileManager non disponible');
    }
    
    console.log('LMU Tracker initialisé avec succès !');
  } catch (error) {
    console.error('Erreur lors de l\'initialisation:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Fonctions de compatibilité pour l'ancien code
function generateProfileContent() {
  if (window.LMUProfileManager && window.LMUProfileManager.generateProfileContent) {
    window.LMUProfileManager.generateProfileContent();
  }
}

function scanConfiguredFolder() {
  if (window.LMUFileManager && window.LMUFileManager.scanConfiguredFolder) {
    window.LMUFileManager.scanConfiguredFolder();
  }
}

function switchView(view) {
  if (window.LMUNavigation && window.LMUNavigation.switchView) {
    window.LMUNavigation.switchView(view);
  }
}

function filterByCarClass(carClass) {
  if (window.LMUNavigation && window.LMUNavigation.filterByCarClass) {
    window.LMUNavigation.filterByCarClass(carClass);
  }
}

function loadSavedFolder() {
  if (window.LMUStorage && window.LMUStorage.loadSavedFolder) {
    return window.LMUStorage.loadSavedFolder();
  }
  return '';
}

function loadSavedDriverName() {
  if (window.LMUStorage && window.LMUStorage.loadSavedDriverName) {
    return window.LMUStorage.loadSavedDriverName();
  }
  return '';
}

function getConfiguredDriverName() {
  if (window.LMUStorage && window.LMUStorage.getConfiguredDriverName) {
    return window.LMUStorage.getConfiguredDriverName();
  }
  return '';
}

// Proxy pour les autres fonctions qui pourraient être appelées depuis l'extérieur
function invalidateCache() {
  if (window.LMUStatsCalculator && window.LMUStatsCalculator.invalidateCache) {
    window.LMUStatsCalculator.invalidateCache();
  }
}

// Synchroniser l'état global avec les modules
function syncGlobalState() {
  if (window.LMUFileManager) {
    lastScannedFiles = window.LMUFileManager.getLastScannedFiles();
    lastSession = window.LMUFileManager.getLastSession();
  }
  
  if (window.LMUNavigation) {
    selectedCarClass = window.LMUNavigation.getSelectedCarClass();
  }
}

// Appeler la synchronisation régulièrement
setInterval(syncGlobalState, 1000);

// Tentative de chargement initial des paramètres et scan
try {
  setTimeout(() => {
    loadSavedFolder();
    loadSavedDriverName();
    scanConfiguredFolder();
  }, 100);
} catch (error) {
  console.warn('Erreur lors du chargement initial:', error);
}