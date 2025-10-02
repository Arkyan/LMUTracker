/**
 * Module de navigation pour LMU Tracker
 * Gère les transitions entre les différentes vues de l'application
 */

(function() {
  // État de navigation
  let currentView = 'profile';
let selectedCarClass = 'Hyper';

// Éléments DOM
const views = {
  profile: null,
  history: null,
  settings: null
};
let navButtons = null;

// Initialiser le système de navigation
function initNavigation() {
  console.log('=== Initialisation du module Navigation ===');
  
  // Récupérer les éléments DOM
  views.profile = document.getElementById('view-profile');
  views.history = document.getElementById('view-history');
  views.settings = document.getElementById('view-settings');
  navButtons = document.querySelectorAll('.nav-btn');
  
  console.log('Éléments DOM trouvés:');
  console.log('- view-profile:', !!views.profile);
  console.log('- view-history:', !!views.history);
  console.log('- view-settings:', !!views.settings);
  console.log('- nav-btn count:', navButtons.length);
  
  // Ajouter les événements de clic sur les boutons de navigation
  navButtons.forEach((btn, index) => {
    console.log(`Ajout événement sur bouton ${index}, data-view:`, btn.dataset.view);
    btn.addEventListener('click', () => {
      const targetView = btn.dataset.view;
      console.log('Clic sur bouton navigation, vue cible:', targetView);
      if (targetView) {
        switchView(targetView);
      }
    });
  });
  
  // Démarrer sur la vue profil
  console.log('Démarrage sur la vue profil...');
  switchView('profile');
  console.log('=== Navigation initialisée ===');
}

// Changer de vue
function switchView(view) {
  console.log(`=== Changement de vue vers: ${view} ===`);
  
  // Masquer toutes les vues
  Object.values(views).forEach((v, index) => {
    if (v) {
      v.classList.remove('active');
      console.log(`Vue ${Object.keys(views)[index]} masquée`);
    }
  });
  
  // Afficher la vue demandée
  if (views[view]) {
    views[view].classList.add('active');
    currentView = view;
    console.log(`Vue ${view} affichée`);
  } else {
    console.error(`Vue ${view} non trouvée!`);
  }
  
  // Mettre à jour les boutons de navigation
  navButtons.forEach(b => {
    const isActive = b.dataset.view === view;
    b.classList.toggle('active', isActive);
    console.log(`Bouton ${b.dataset.view}: ${isActive ? 'actif' : 'inactif'}`);
  });
  
  // Actions spécifiques par vue
  handleViewSwitch(view);
  console.log(`=== Changement de vue terminé ===`);
}

// Gérer les actions spécifiques lors du changement de vue
function handleViewSwitch(view) {
  if (view === 'profile') {
    // Générer le contenu du profil si le module ProfileManager est disponible
    if (window.LMUProfileManager && window.LMUProfileManager.generateProfileContent) {
      window.LMUProfileManager.generateProfileContent();
    }
  } else if (view === 'history') {
    // Scanner le dossier configuré si pas encore fait
    if (window.LMUFileManager && window.LMUFileManager.scanConfiguredFolder && 
        !window.LMUFileManager.getLastScannedFiles()) {
      window.LMUFileManager.scanConfiguredFolder();
    }
  } else if (view === 'settings') {
    // Charger les paramètres sauvegardés
    if (window.LMUStorage) {
      window.LMUStorage.loadSavedSettings();
    }
  }
}

// Obtenir la vue actuelle
function getCurrentView() {
  return currentView;
}

// Filtrer par classe de voiture (pour les statistiques par circuit)
function filterByCarClass(carClass) {
  selectedCarClass = carClass;
  
  // Invalider le cache des stats car le filtre a changé
  if (window.LMUStatsCalculator && window.LMUStatsCalculator.invalidateCache) {
    window.LMUStatsCalculator.invalidateCache();
  }
  
  // Régénérer le contenu du profil si on est sur cette vue
  if (currentView === 'profile' && window.LMUProfileManager && 
      window.LMUProfileManager.generateProfileContent) {
    window.LMUProfileManager.generateProfileContent();
  }
}

// Obtenir la classe de voiture sélectionnée
function getSelectedCarClass() {
  return selectedCarClass;
}

// Navigation programmatique vers une vue spécifique
function navigateToView(view) {
  if (views[view]) {
    switchView(view);
    return true;
  }
  return false;
}

// Naviguer vers les paramètres (raccourci utilisé dans plusieurs endroits)
function navigateToSettings() {
  return navigateToView('settings');
}

// Naviguer vers l'historique
function navigateToHistory() {
  return navigateToView('history');
}

// Naviguer vers le profil
function navigateToProfile() {
  return navigateToView('profile');
}

// Export des fonctions
if (typeof window !== 'undefined') {
  window.LMUNavigation = {
    initNavigation,
    switchView,
    handleViewSwitch,
    getCurrentView,
    filterByCarClass,
    getSelectedCarClass,
    navigateToView,
    navigateToSettings,
    navigateToHistory,
    navigateToProfile
  };
  
  // Expose filterByCarClass globalement pour les onclick dans le HTML
  window.filterByCarClass = filterByCarClass;
  window.switchView = switchView;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initNavigation,
    switchView,
    handleViewSwitch,
    getCurrentView,
    filterByCarClass,
    getSelectedCarClass,
    navigateToView,
    navigateToSettings,
    navigateToHistory,
    navigateToProfile
  };
}

})(); // Fermeture de la fonction IIFE