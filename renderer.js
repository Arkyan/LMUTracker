/**
 * LMU Tracker - Fichier principal
 * Coordonne les différents modules de l'application
 */

// Tous les modules <script> sont synchrones et chargés avant renderer.js.
// DOMContentLoaded garantit que window.LMU* sont disponibles dès ici.
document.addEventListener('DOMContentLoaded', function() {
  window.__lmuProfileAutoloadDone = false;
  initializeApp();
});

// Initialiser tous les modules
async function initializeApp() {
  try {
    // Charger le HTML des vues depuis des fichiers séparés.
    // Doit être fait avant initNavigation/initFileManager car ces modules cherchent des IDs.
    try {
      if (window.lmuAPI && typeof window.lmuAPI.readView === 'function') {
        const viewTargets = [
          { viewName: 'profile', elementId: 'view-profile' },
          { viewName: 'history', elementId: 'view-history' },
          { viewName: 'vehicles', elementId: 'view-vehicles' },
          { viewName: 'vehicle-detail', elementId: 'view-vehicle-detail' },
          { viewName: 'settings', elementId: 'view-settings' }
        ];

        for (const t of viewTargets) {
          const el = document.getElementById(t.elementId);
          if (!el) continue;
          if (el.dataset && el.dataset.lmuViewLoaded === '1') continue;
          const res = await window.lmuAPI.readView(t.viewName);
          if (res && res.ok && typeof res.content === 'string') {
            el.innerHTML = res.content;
            if (el.dataset) el.dataset.lmuViewLoaded = '1';
          }
        }

        // Les vues sont injectées après DOMContentLoaded; relancer les init UI.
        try {
          if (window.LMUDatabaseUI && typeof window.LMUDatabaseUI.init === 'function') {
            window.LMUDatabaseUI.init();
          }
        } catch (_) {}
        try {
          if (window.LMUUpdateManager && typeof window.LMUUpdateManager.init === 'function') {
            await window.LMUUpdateManager.init();
          }
        } catch (_) {}
      }
    } catch (_) {}

    // Initialiser les modules dans l'ordre de dépendance
    if (window.LMUStorage) {
      try {
        await window.LMUStorage.initStorage();
      } catch (_) {}
    }

    if (window.LMUNavigation) {
      window.LMUNavigation.initNavigation();
    }

    if (window.LMUFileManager) {
      window.LMUFileManager.initFileManager();
    }

    // Restaurer le cache d'historique si disponible
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

    handleUrlHash();
    performInitialScan();

    // Régénérer le profil / les vues Voitures quand l'historique est mis à jour
    window.addEventListener('lmu:history-updated', () => {
      const nav = window.LMUNavigation;
      const current = nav && typeof nav.getCurrentView === 'function' ? nav.getCurrentView() : '';
      const driverName = window.LMUStorage ? window.LMUStorage.getConfiguredDriverName() : '';
      const isAutoLoading = !!window.__lmu_autoLoading;
      const delay = isAutoLoading ? 500 : 150;

      if (current === 'profile' && driverName && window.LMUProfileManager) {
        clearTimeout(window.__lmu_profileRegenerateTimer);
        window.__lmu_profileRegenerateTimer = setTimeout(() => {
          window.LMUProfileManager.generateProfileContent();
        }, delay);
      }

      clearTimeout(window.__lmu_reRenderViewTimer);
      window.__lmu_reRenderViewTimer = setTimeout(() => {
        if ((current === 'vehicles' || current === 'vehicleDetail') && nav) {
          nav.switchView(current);
        }
      }, delay);
    });

    // Navigation SPA via bouton retour/avancer
    window.addEventListener('popstate', (ev) => {
      const state = ev.state;
      if (!state || state.type === 'history') {
        window.LMUFileManager?.restoreHistoryFromCache?.();
      } else if (state.type === 'session' && state.filePath) {
        window.LMUFileManager?.renderSessionInPlace?.(state.filePath);
      }
    });
  } catch (error) {
    console.error('[LMUTracker] Erreur initialisation:', error);
  }
}

// Afficher/cacher l'overlay de démarrage
function setStartupOverlay(visible) {
  const overlay = document.getElementById('startupOverlay');
  if (overlay) overlay.style.display = visible ? 'block' : 'none';
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
  const hash = window.location.hash.slice(1);
  if (hash && ['profile', 'history', 'vehicles', 'vehicle', 'settings'].includes(hash)) {
    window.LMUNavigation?.switchView?.(hash);
  }
}

// Effectuer le scan initial au lancement
function performInitialScan() {
  setTimeout(() => {
    try {
      const folderPath = window.LMUStorage ? window.LMUStorage.getConfiguredResultsFolder() : '';
      if (!folderPath || !folderPath.trim()) return;

      const loadAll = window.LMUStorage?.loadLoadAllSessionsDirectly?.();
      if (loadAll) {
        let lastDetail = { rendered: 0, totalMeta: 0 };
        let overlayShown = false;
        const onUpdate = (ev) => {
          lastDetail = ev?.detail || lastDetail;
          if (lastDetail.totalMeta > 0 && !overlayShown) {
            setStartupOverlay(true);
            overlayShown = true;
          }
          updateStartupProgress(lastDetail.rendered || 0, lastDetail.totalMeta || 0, 'Chargement des sessions…');
        };
        window.addEventListener('lmu:history-updated', onUpdate);
        window.LMUFileManager?.scanConfiguredFolder?.();
        const checkDone = () => {
          const done = lastDetail.totalMeta > 0 && lastDetail.rendered >= lastDetail.totalMeta;
          if (done || lastDetail.totalMeta === 0) {
            setStartupOverlay(false);
            window.removeEventListener('lmu:history-updated', onUpdate);
          } else {
            setTimeout(checkDone, 200);
          }
        };
        setTimeout(checkDone, 300);
      } else {
        window.LMUFileManager?.scanConfiguredFolder?.();
      }
    } catch (_) {}
  }, 500);
}

// Fonctions de compatibilité
function generateProfileContent() {
  window.LMUProfileManager?.generateProfileContent?.();
}

function scanConfiguredFolder() {
  window.LMUFileManager?.scanConfiguredFolder?.();
}
