/**
 * LMU Tracker - Fichier principal
 * Coordonne les différents modules de l'application
 */

// Note: les états applicatifs (sessions, sélection de classe, etc.) sont gérés
// par les modules (FileManager/Navigation/Storage/StatsCalculator). Garder
// renderer.js comme orchestrateur, sans variables globales dupliquées.

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM chargé, attente du chargement des modules...');
  // Flag global pour éviter de régénérer le profil plusieurs fois automatiquement
  if (typeof window !== 'undefined' && window.__lmuProfileAutoloadDone === undefined) {
    window.__lmuProfileAutoloadDone = false;
  }
  
  // Attendre que tous les modules soient chargés
  const checkModulesLoaded = () => {
    const requiredModules = [
      'LMUUtils',
      'LMUXMLParser', 
      'LMUStatsCalculator',
      'LMURenderEngine',
      'LMUCacheManager',
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
async function initializeApp() {
  console.log('Initialisation de LMU Tracker...');
  
  // Vérifier que tous les modules sont chargés
  console.log('Modules disponibles:');
  console.log('- LMUUtils:', !!window.LMUUtils);
  console.log('- LMUXMLParser:', !!window.LMUXMLParser);
  console.log('- LMUStatsCalculator:', !!window.LMUStatsCalculator);
  console.log('- LMURenderEngine:', !!window.LMURenderEngine);
  console.log('- LMUCacheManager:', !!window.LMUCacheManager);
  console.log('- LMUStorage:', !!window.LMUStorage);
  console.log('- LMUNavigation:', !!window.LMUNavigation);
  console.log('- LMUFileManager:', !!window.LMUFileManager);
  console.log('- LMUProfileManager:', !!window.LMUProfileManager);
  
  try {
    // Initialiser les modules dans l'ordre de dépendance
    if (window.LMUStorage) {
      console.log('Initialisation du module Storage...');
      try {
        await window.LMUStorage.initStorage();
      } catch (e) {
        console.warn('Init Storage async a échoué ou a été interrompu:', e);
      }
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
    
    // Mode préchargement: si on veut tout charger avant d'afficher, on montrera un overlay
    // On garde le cache d'historique comme fallback si overlay n'est pas utilisé
    try {
      const cached = localStorage.getItem('lmu.cachedHistoryHTML');
      if (cached) {
        const container = document.getElementById('results');
        if (container) {
          container.innerHTML = cached;
          if (window.LMUFileManager && window.LMUFileManager.setupCardEvents) {
            window.LMUFileManager.setupCardEvents(container);
          }
        }
      }
    } catch (_) {}

    // Gérer la navigation basée sur le hash de l'URL
    handleUrlHash();
    
    // Effectuer le scan initial si un dossier est configuré
    performInitialScan();

    // Quand l'historique rend un lot, (re)générer le profil si on est sur profil
    try {
      window.addEventListener('lmu:history-updated', () => {
        const onProfileView = window.LMUNavigation && typeof window.LMUNavigation.getCurrentView === 'function'
          ? window.LMUNavigation.getCurrentView() === 'profile' : false;
        const driverName = window.LMUStorage ? window.LMUStorage.getConfiguredDriverName() : '';
        const isAutoLoading = !!window.__lmu_autoLoading;
        if (onProfileView && driverName && window.LMUProfileManager && window.LMUProfileManager.generateProfileContent) {
          // Evite de spammer: petite temporisation debounce
          clearTimeout(window.__lmu_profileRegenerateTimer);
          window.__lmu_profileRegenerateTimer = setTimeout(() => {
            window.LMUProfileManager.generateProfileContent();
          }, isAutoLoading ? 500 : 150);
        }
        // Rafraîchir aussi les vues Voitures / Détail véhicule si elles sont affichées
        const current = window.LMUNavigation && typeof window.LMUNavigation.getCurrentView === 'function'
          ? window.LMUNavigation.getCurrentView() : '';
        clearTimeout(window.__lmu_reRenderViewTimer);
        window.__lmu_reRenderViewTimer = setTimeout(() => {
          if (current === 'vehicles' || current === 'vehicleDetail') {
            if (window.LMUNavigation && typeof window.LMUNavigation.switchView === 'function') {
              window.LMUNavigation.switchView(current);
            }
          }
        }, isAutoLoading ? 500 : 150);
      });
    } catch (_) {}

    // Ecouter les retours/avancées navigateur pour SPA
    window.addEventListener('popstate', (ev) => {
      const state = ev.state;
      if (!state) {
        // Si pas d'état, tenter restauration de l'historique
        if (window.LMUFileManager && window.LMUFileManager.restoreHistoryFromCache) {
          window.LMUFileManager.restoreHistoryFromCache();
        }
        return;
      }
      if (state.type === 'history') {
        if (window.LMUFileManager && window.LMUFileManager.restoreHistoryFromCache) {
          window.LMUFileManager.restoreHistoryFromCache();
        }
      } else if (state.type === 'session' && state.filePath) {
        if (window.LMUFileManager && window.LMUFileManager.renderSessionInPlace) {
          window.LMUFileManager.renderSessionInPlace(state.filePath);
        }
      }
    });
    
    console.log('LMU Tracker initialisé avec succès !');
  } catch (error) {
    console.error('Erreur lors de l\'initialisation:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Afficher/cacher l'overlay de démarrage
function setStartupOverlay(visible) {
  const overlay = document.getElementById('startupOverlay');
  if (!overlay) return;
  overlay.style.display = visible ? 'block' : 'none';
}

function updateStartupProgress(current, total, text) {
  const bar = document.getElementById('startupProgressBar');
  const counter = document.getElementById('startupCounter');
  const label = document.getElementById('startupText');
  if (!bar || !counter || !label) return;
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  bar.style.width = pct + '%';
  counter.textContent = `${current} / ${total}`;
  if (text) label.textContent = text;
}

// Gérer la navigation basée sur le hash de l'URL
function handleUrlHash() {
  const hash = window.location.hash.slice(1); // Enlever le #
  
  if (hash && ['profile', 'history', 'vehicles', 'vehicle', 'settings'].includes(hash)) {
    console.log(`Navigation vers la vue "${hash}" basée sur l'URL`);
    if (window.LMUNavigation && window.LMUNavigation.switchView) {
      window.LMUNavigation.switchView(hash);
    }
  }
}

// Effectuer le scan initial au lancement
function performInitialScan() {
  // Attendre un peu que tous les modules soient complètement initialisés
  setTimeout(() => {
    try {
      const folderPath = window.LMUStorage ? window.LMUStorage.getConfiguredResultsFolder() : '';
      const driverName = window.LMUStorage ? window.LMUStorage.getConfiguredDriverName() : '';
      const loadAll = window.LMUStorage && window.LMUStorage.loadLoadAllSessionsDirectly && window.LMUStorage.loadLoadAllSessionsDirectly();
      
      console.log('Scan initial - Dossier configuré:', folderPath);
      console.log('Scan initial - Pilote configuré:', driverName);
      
      if (folderPath && folderPath.trim() !== '') {
        console.log('Lancement du scan initial...');
        // Si l’option tout charger est activée, proposer un préchargement bloquant UI
        if (loadAll) {
          // Brancher sur les évènements d'avancement de l'historique
          let lastDetail = { rendered: 0, totalMeta: 0 };
          let overlayShown = false;
          const onUpdate = (ev) => {
            lastDetail = ev?.detail || lastDetail;
            // N'afficher l'overlay que s'il y a effectivement des fichiers à charger
            if (lastDetail.totalMeta > 0 && !overlayShown) {
              setStartupOverlay(true);
              overlayShown = true;
            }
            updateStartupProgress(lastDetail.rendered || 0, lastDetail.totalMeta || 0, 'Chargement des sessions…');
          };
          try { window.addEventListener('lmu:history-updated', onUpdate); } catch(_) {}
          // Démarrer le scan (il lancera l’auto-chargement qui émet l’événement)
          if (window.LMUFileManager && window.LMUFileManager.scanConfiguredFolder) {
            window.LMUFileManager.scanConfiguredFolder();
          }
          // Observer la fin: quand rendered == totalMeta (et > 0), on ferme l’overlay
          const checkDone = () => {
            const done = (lastDetail.totalMeta > 0) && (lastDetail.rendered >= lastDetail.totalMeta);
            // Ou si totalMeta est 0 (aucun fichier), ne rien afficher et arrêter
            const noFiles = lastDetail.totalMeta === 0;
            if (done || noFiles) {
              setStartupOverlay(false);
              try { window.removeEventListener('lmu:history-updated', onUpdate); } catch(_) {}
            } else {
              setTimeout(checkDone, 200);
            }
          };
          setTimeout(checkDone, 300);
        } else {
          if (window.LMUFileManager && window.LMUFileManager.scanConfiguredFolder) {
            window.LMUFileManager.scanConfiguredFolder();
          }
        }
      } else {
        console.log('Aucun dossier configuré, pas de scan initial');
      }
    } catch (error) {
      console.warn('Erreur lors du scan initial:', error);
    }
  }, 500); // Délai pour s'assurer que tous les modules sont prêts
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

