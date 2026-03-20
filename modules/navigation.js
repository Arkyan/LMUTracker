/**
 * Module de navigation pour LMU Tracker
 * Gère les transitions entre les différentes vues de l'application
 */

(function() {
  let currentView = 'profile';
  let selectedCarClass = 'Hyper';

  const views = {
    profile: null,
    history: null,
    vehicles: null,
    vehicleDetail: null,
    settings: null
  };
  let navButtons = null;

  function initNavigation() {
    views.profile = document.getElementById('view-profile');
    views.history = document.getElementById('view-history');
    views.settings = document.getElementById('view-settings');
    views.vehicles = document.getElementById('view-vehicles');
    views.vehicleDetail = document.getElementById('view-vehicle-detail');
    navButtons = document.querySelectorAll('.nav-btn');

    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetView = btn.dataset.view;
        if (targetView) switchView(targetView);
      });
    });

    switchView('profile');
  }

  function switchView(view) {
    Object.values(views).forEach(v => {
      if (v) v.classList.remove('active');
    });

    if (views[view]) {
      views[view].classList.add('active');
      currentView = view;
    }

    navButtons.forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });

    handleViewSwitch(view);
  }

  function handleViewSwitch(view) {
    if (view === 'profile') {
      try {
        const files = window.LMUFileManager ? window.LMUFileManager.getLastScannedFiles() : null;
        const driverName = window.LMUStorage ? window.LMUStorage.getConfiguredDriverName() : '';
        const profileContainer = document.getElementById('profileContent');
        const needWait = (!files || files.length === 0) && !!(driverName && driverName.trim());
        if (needWait && profileContainer) {
          profileContainer.innerHTML = `
            <div style="text-align:center;padding:24px;">
              <div class="spinner" style="display:inline-block;margin-bottom:8px;"></div>
              <div class="muted">Chargement des sessions…</div>
            </div>
          `;
          let timeoutId;
          const once = () => {
            try { window.removeEventListener('lmu:history-updated', once); } catch(_) {}
            if (timeoutId) clearTimeout(timeoutId);
            window.LMUProfileManager?.generateProfileContent?.();
          };
          try { window.addEventListener('lmu:history-updated', once, { once: true }); } catch(_) { window.addEventListener('lmu:history-updated', once); }
          timeoutId = setTimeout(() => {
            try { window.removeEventListener('lmu:history-updated', once); } catch(_) {}
            window.LMUProfileManager?.generateProfileContent?.();
          }, 3000);
        } else {
          window.LMUProfileManager?.generateProfileContent?.();
        }
      } catch (_) {
        window.LMUProfileManager?.generateProfileContent?.();
      }
    } else if (view === 'history') {
      const container = document.getElementById('results');
      if (!container) return;

      const driverName = window.LMUStorage ? window.LMUStorage.getConfiguredDriverName() : '';
      const folderPath = window.LMUStorage ? window.LMUStorage.getConfiguredResultsFolder() : '';
      const files = window.LMUFileManager ? window.LMUFileManager.getLastScannedFiles() : null;

      const cacheParams = {
        driverName,
        filesLength: files?.length || 0,
        folderPath,
        title: 'Sessions trouvées'
      };

      if (window.LMUCacheManager) {
        const cachedContent = window.LMUCacheManager.getCachedContent('history', cacheParams);
        if (cachedContent) {
          container.innerHTML = cachedContent;
          window.LMUFileManager?.setupCardEvents?.(container);
          return;
        }
      }

      if (files && files.length > 0) {
        window.LMUFileManager?.displayScannedFiles?.(files, 'Sessions trouvées', false);
      } else {
        container.innerHTML = `
          <div class="card no-hover" style="text-align:center;padding:40px;">
            <div style="font-size:48px;margin-bottom:16px;"><i class="fas fa-folder-open"></i></div>
            <h3 style="margin-bottom:12px;color:var(--text);">Aucune session chargée</h3>
            <p style="margin-bottom:20px;color:var(--muted);">
              ${folderPath ? `Dossier configuré: ${folderPath}` : 'Aucun dossier configuré'}
            </p>
            <button class="btn primary" onclick="manualRescan()" ${!folderPath ? 'disabled' : ''}>
              <i class="fas fa-sync-alt"></i> Scanner les sessions
            </button>
            ${!folderPath ? '<p style="margin-top:12px;color:var(--muted);font-size:12px;">Configurez d\'abord un dossier dans les paramètres</p>' : ''}
          </div>
        `;
      }
    } else if (view === 'settings') {
      window.LMUStorage?.loadSavedSettings?.();
    } else if (view === 'vehicles') {
      const container = document.getElementById('vehiclesContent');
      if (!container) return;
      try {
        const driverName = window.LMUStorage ? window.LMUStorage.getConfiguredDriverName() : '';
        const files = window.LMUFileManager ? window.LMUFileManager.getLastScannedFiles() : null;
        if (!driverName || !driverName.trim()) {
          container.innerHTML = `
            <div class="card no-hover" style="text-align:center;padding:40px;">
              <div style="font-size:48px;margin-bottom:16px;"><i class="fas fa-user"></i></div>
              <h3 style="margin-bottom:12px;color:var(--text);">Aucun pilote configuré</h3>
              <p class="muted" style="margin-bottom:16px;">Renseignez votre nom de pilote (ou plusieurs, séparés par des virgules) pour lister vos voitures.</p>
              <button class="btn primary" onclick="switchView('settings')"><i class="fas fa-cog"></i> Aller aux paramètres</button>
            </div>
          `;
          return;
        }
        const data = window.LMUStatsCalculator ? window.LMUStatsCalculator.getCachedVehicleStatsByClass(driverName, files) : {};
        if (window.LMUProfileManager && window.LMUProfileManager.generateVehicleCardsPage) {
          const html = window.LMUProfileManager.generateVehicleCardsPage(data);
          if (!html || !html.trim() || !Object.keys(data || {}).some(k => (data[k]||[]).length > 0)) {
            container.innerHTML = `
              <div class="card no-hover" style="text-align:center;padding:40px;">
                <div style="font-size:48px;margin-bottom:16px;"><i class="fas fa-car"></i></div>
                <h3 style="margin-bottom:12px;color:var(--text);">Aucune voiture jouée trouvée</h3>
                <p class="muted">Vérifiez que des sessions ont été scannées et que le nom du pilote correspond à ceux présents dans les fichiers (swaps inclus).</p>
              </div>
            `;
          } else {
            container.innerHTML = html;
          }
        } else {
          container.innerHTML = '<div class="card no-hover">Aucune donnée disponible.</div>';
        }
      } catch (e) {
        container.innerHTML = `<div class="card no-hover"><p class="muted">Erreur: ${e.message}</p></div>`;
      }
      setTimeout(() => {
        try {
          document.querySelectorAll('#view-vehicles [data-vehicle][data-class]').forEach(el => {
            el.addEventListener('click', () => {
              navigateToVehicleDetail(el.getAttribute('data-vehicle'), el.getAttribute('data-class'));
            });
            el.addEventListener('keydown', (ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                navigateToVehicleDetail(el.getAttribute('data-vehicle'), el.getAttribute('data-class'));
              }
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

    function navigateToVehicleDetail(vehicleName, carClass) {
      window.__lmu_currentVehicleName = vehicleName;
      window.__lmu_currentVehicleClass = carClass;
      try { window.history.pushState({ type: 'vehicle', vehicleName, carClass }, '', '#vehicle'); } catch(_) {}
      switchView('vehicleDetail');
    }
  }

  function getCurrentView() {
    return currentView;
  }

  function filterByCarClass(carClass) {
    selectedCarClass = carClass;
    window.LMUStatsCalculator?.invalidateCache?.();
    window.LMUCacheManager?.invalidateCache?.('profile');
    if (currentView === 'profile') {
      window.LMUProfileManager?.generateProfileContent?.();
    }
  }

  function getSelectedCarClass() {
    return selectedCarClass;
  }

  function navigateToView(view) {
    if (views[view]) {
      switchView(view);
      return true;
    }
    return false;
  }

  function navigateToSettings() { return navigateToView('settings'); }
  function navigateToHistory() { return navigateToView('history'); }
  function navigateToProfile() { return navigateToView('profile'); }

  function manualRescan() {
    window.LMUFileManager?.scanConfiguredFolder?.();
  }

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

    // Exposer globalement pour les onclick dans le HTML généré
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

})();
