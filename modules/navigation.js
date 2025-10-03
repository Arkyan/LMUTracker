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
  vehicles: null,
  vehicleDetail: null,
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
  views.vehicles = document.getElementById('view-vehicles');
  views.vehicleDetail = document.getElementById('view-vehicle-detail');
  navButtons = document.querySelectorAll('.nav-btn');
  
  console.log('Éléments DOM trouvés:');
  console.log('- view-profile:', !!views.profile);
  console.log('- view-history:', !!views.history);
  console.log('- view-settings:', !!views.settings);
  console.log('- view-vehicles:', !!views.vehicles);
  console.log('- view-vehicle-detail:', !!views.vehicleDetail);
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
    // Attendre que les sessions soient chargées (au moins le premier lot) avant de générer le profil
    try {
      const files = window.LMUFileManager ? window.LMUFileManager.getLastScannedFiles() : null;
      const driverName = window.LMUStorage ? window.LMUStorage.getConfiguredDriverName() : '';
      const profileContainer = document.getElementById('profileContent');
      const needWait = (!files || files.length === 0) && !!(driverName && driverName.trim());
      if (needWait && profileContainer) {
        // Afficher un état de chargement discret
        profileContainer.innerHTML = `
          <div style="text-align:center;padding:24px;">
            <div class="spinner" style="display:inline-block;margin-bottom:8px;"></div>
            <div class="muted">Chargement des sessions…</div>
          </div>
        `;
        // Écouter une seule fois la mise à jour de l'historique
        const once = (ev) => {
          try { window.removeEventListener('lmu:history-updated', once); } catch(_) {}
          if (window.LMUProfileManager && window.LMUProfileManager.generateProfileContent) {
            window.LMUProfileManager.generateProfileContent();
          }
        };
        try { window.addEventListener('lmu:history-updated', once, { once: true }); } catch(_) { window.addEventListener('lmu:history-updated', once); }
      } else {
        // Générer immédiatement si on a déjà des sessions ou si aucun pilote n'est configuré
        if (window.LMUProfileManager && window.LMUProfileManager.generateProfileContent) {
          window.LMUProfileManager.generateProfileContent();
        }
      }
    } catch (_) {
      if (window.LMUProfileManager && window.LMUProfileManager.generateProfileContent) {
        window.LMUProfileManager.generateProfileContent();
      }
    }
  } else if (view === 'history') {
    const container = document.getElementById('results');
    if (!container) return;
    
    // Paramètres pour le cache
    const driverName = window.LMUStorage ? window.LMUStorage.getConfiguredDriverName() : '';
    const folderPath = window.LMUStorage ? window.LMUStorage.getConfiguredResultsFolder() : '';
    const files = window.LMUFileManager ? window.LMUFileManager.getLastScannedFiles() : null;
    
    const cacheParams = {
      driverName,
      filesLength: files?.length || 0,
      folderPath,
      title: 'Sessions trouvées'
    };
    
    // Essayer d'abord le cache
    if (window.LMUCacheManager) {
      const cachedContent = window.LMUCacheManager.getCachedContent('history', cacheParams);
      if (cachedContent) {
        console.log('Navigation: utilisation du cache pour l\'historique');
        container.innerHTML = cachedContent;
        // Réattacher les événements
        if (window.LMUFileManager && window.LMUFileManager.setupCardEvents) {
          window.LMUFileManager.setupCardEvents(container);
        }
        return;
      }
    }
    
    // Si pas de cache, vérifier s'il y a des fichiers scannés
    if (files && files.length > 0) {
      console.log('Navigation: affichage des fichiers scannés depuis la mémoire');
      if (window.LMUFileManager && window.LMUFileManager.displayScannedFiles) {
        window.LMUFileManager.displayScannedFiles(files, 'Sessions trouvées', false);
      }
    } else {
      // Afficher un message demandant de scanner
      console.log('Navigation: aucun fichier scanné, affichage du message');
      container.innerHTML = `
        <div class="card" style="text-align:center;padding:40px;">
          <div style="font-size:48px;margin-bottom:16px;">📁</div>
          <h3 style="margin-bottom:12px;color:var(--text);">Aucune session chargée</h3>
          <p style="margin-bottom:20px;color:var(--muted);">
            ${folderPath ? `Dossier configuré: ${folderPath}` : 'Aucun dossier configuré'}
          </p>
          <button class="btn primary" onclick="manualRescan()" ${!folderPath ? 'disabled' : ''}>
            🔄 Scanner les sessions
          </button>
          ${!folderPath ? '<p style="margin-top:12px;color:var(--muted);font-size:12px;">Configurez d\'abord un dossier dans les paramètres</p>' : ''}
        </div>
      `;
    }
  } else if (view === 'settings') {
    // Charger les paramètres sauvegardés
    if (window.LMUStorage) {
      window.LMUStorage.loadSavedSettings();
    }
  } else if (view === 'vehicles') {
    const container = document.getElementById('vehiclesContent');
    if (!container) return;
    try {
      const driverName = window.LMUStorage ? window.LMUStorage.getConfiguredDriverName() : '';
      const files = window.LMUFileManager ? window.LMUFileManager.getLastScannedFiles() : null;
      if (!driverName || !driverName.trim()) {
        container.innerHTML = `
          <div class="card" style="text-align:center;padding:40px;">
            <div style="font-size:48px;margin-bottom:16px;">👤</div>
            <h3 style="margin-bottom:12px;color:var(--text);">Aucun pilote configuré</h3>
            <p class="muted" style="margin-bottom:16px;">Renseignez votre nom de pilote (ou plusieurs, séparés par des virgules) pour lister vos voitures.</p>
            <button class="btn primary" onclick="switchView('settings')">⚙️ Aller aux paramètres</button>
          </div>
        `;
        return;
      }
      const data = window.LMUStatsCalculator ? window.LMUStatsCalculator.getCachedVehicleStatsByClass(driverName, files) : {};
      // Page voitures: afficher des cards cliquables sans stats
      if (window.LMUProfileManager && window.LMUProfileManager.generateVehicleCardsPage) {
        const html = window.LMUProfileManager.generateVehicleCardsPage(data);
        // Si pas de sections rendues (aucun véhicule) on affiche un message plus explicite
        if (!html || !html.trim() || !Object.keys(data || {}).some(k => (data[k]||[]).length > 0)) {
          container.innerHTML = `
            <div class="card" style="text-align:center;padding:40px;">
              <div style="font-size:48px;margin-bottom:16px;">🚘</div>
              <h3 style="margin-bottom:12px;color:var(--text);">Aucune voiture jouée trouvée</h3>
              <p class="muted">Vérifiez que des sessions ont été scannées et que le nom du pilote correspond à ceux présents dans les fichiers (swaps inclus).</p>
            </div>
          `;
        } else {
          container.innerHTML = html;
        }
      } else {
        container.innerHTML = '<div class="card">Aucune donnée disponible.</div>';
      }
    } catch (e) {
      container.innerHTML = `<div class="card"><p class="muted">Erreur: ${e.message}</p></div>`;
    }
    // rendre les cards cliquables vers le détail
    setTimeout(() => {
      try {
        document.querySelectorAll('#view-vehicles [data-vehicle][data-class]').forEach(el => {
          el.addEventListener('click', () => {
            const vehicleName = el.getAttribute('data-vehicle');
            const carClass = el.getAttribute('data-class');
            navigateToVehicleDetail(vehicleName, carClass);
          });
          el.style.cursor = 'pointer';
        });
      } catch (_) {}
    }, 0);
  } else if (view === 'vehicleDetail') {
    const container = document.getElementById('vehicleDetailContent');
    if (!container) return;
    const vehicleName = window.__lmu_currentVehicleName || '';
    const carClass = window.__lmu_currentVehicleClass || '';
    const driverName = window.LMUStorage ? window.LMUStorage.getConfiguredDriverName() : '';
    const files = window.LMUFileManager ? window.LMUFileManager.getLastScannedFiles() : null;
    const trackStats = window.LMUStatsCalculator ? window.LMUStatsCalculator.getCachedTrackStatsForVehicle(driverName, files, vehicleName, carClass) : {};
    if (window.LMUProfileManager && window.LMUProfileManager.generateVehicleTrackPerformanceSection) {
      container.innerHTML = window.LMUProfileManager.generateVehicleTrackPerformanceSection(vehicleName, carClass, trackStats);
    } else {
      container.innerHTML = `<div class="card"><p class="muted">Aucune donnée disponible</p></div>`;
    }
  }

// Navigation programmée vers le détail véhicule
function navigateToVehicleDetail(vehicleName, carClass) {
  window.__lmu_currentVehicleName = vehicleName;
  window.__lmu_currentVehicleClass = carClass;
  if (window.history && window.history.pushState) {
    try { window.history.pushState({ type: 'vehicle', vehicleName, carClass }, '', '#vehicle'); } catch(_) {}
  }
  switchView('vehicleDetail');
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
  
  // Invalider seulement le cache du profil car la classe a changé
  if (window.LMUCacheManager && window.LMUCacheManager.invalidateCache) {
    window.LMUCacheManager.invalidateCache('profile');
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

// Fonction pour rescanner manuellement le dossier
function manualRescan() {
  if (window.LMUFileManager && window.LMUFileManager.scanConfiguredFolder) {
    window.LMUFileManager.scanConfiguredFolder();
  }
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
    navigateToProfile,
    manualRescan
  };
  
  // Expose filterByCarClass et manualRescan globalement pour les onclick dans le HTML
  window.filterByCarClass = filterByCarClass;
  window.switchView = switchView;
  window.manualRescan = manualRescan;
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