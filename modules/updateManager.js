/**
 * Module de gestion des mises à jour pour LMU Tracker
 */

// Écouter les événements de mise à jour via le bridge electron
window.electron?.ipcRenderer?.on('update-available', (event, info) => {
  showUpdateNotification({
    title: 'Mise à jour disponible',
    message: `La version ${info.version} est disponible. Voulez-vous la télécharger ?`,
    buttons: [
      { text: 'Télécharger', action: () => downloadUpdate() },
      { text: 'Plus tard', action: () => closeUpdateNotification() }
    ]
  });
});

window.electron?.ipcRenderer?.on('download-progress', (event, progress) => {
  updateDownloadProgress({
    percent: progress.percent,
    transferred: formatBytes(progress.transferred),
    total: formatBytes(progress.total),
    speed: formatBytes(progress.bytesPerSecond) + '/s'
  });
});

window.electron?.ipcRenderer?.on('update-downloaded', () => {
  const updateStatus = document.getElementById('updateStatus');
  if (updateStatus) updateStatus.style.display = 'block';

  showUpdateNotification({
    title: 'Mise à jour prête',
    message: 'La mise à jour a été téléchargée. L\'application redémarrera pour l\'installer.',
    buttons: [
      { text: 'Redémarrer maintenant', action: () => installUpdate() },
      { text: 'Au prochain démarrage', action: () => closeUpdateNotification() }
    ]
  });
});

async function checkForUpdates() {
  try {
    return await window.lmuAPI.checkForUpdates();
  } catch (error) {
    console.error('[Update] Erreur vérification:', error);
    throw error;
  }
}

// Initialiser les éléments UI présents dans la vue Settings (idempotent)
async function initUpdateSettingsUI() {
  const versionElement = document.getElementById('appVersion');
  if (versionElement && versionElement.dataset.lmuInit !== '1') {
    versionElement.dataset.lmuInit = '1';
    try {
      const version = await window.lmuAPI.getAppVersion();
      versionElement.textContent = `v${version}`;
    } catch (_) {
      versionElement.textContent = 'Inconnue';
    }
  }

  const btnCheckUpdates = document.getElementById('btnCheckUpdates');
  if (btnCheckUpdates && btnCheckUpdates.dataset.lmuBound !== '1') {
    btnCheckUpdates.dataset.lmuBound = '1';
    btnCheckUpdates.addEventListener('click', async () => {
      const originalHTML = btnCheckUpdates.innerHTML;
      btnCheckUpdates.disabled = true;
      btnCheckUpdates.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Vérification...';
      try {
        await checkForUpdates();
        setTimeout(() => {
          if (!document.getElementById('update-notification')) {
            btnCheckUpdates.innerHTML = '<i class="fas fa-check"></i> Application à jour';
            btnCheckUpdates.style.cssText = 'background:rgba(34,197,94,0.1);border-color:rgba(34,197,94,0.3);color:#22c55e;';
            setTimeout(() => {
              btnCheckUpdates.innerHTML = originalHTML;
              btnCheckUpdates.disabled = false;
              btnCheckUpdates.style.cssText = '';
            }, 3000);
          } else {
            btnCheckUpdates.innerHTML = originalHTML;
            btnCheckUpdates.disabled = false;
          }
        }, 2000);
      } catch (_) {
        btnCheckUpdates.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Erreur';
        btnCheckUpdates.style.cssText = 'background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.3);color:#ef4444;';
        setTimeout(() => {
          btnCheckUpdates.innerHTML = originalHTML;
          btnCheckUpdates.disabled = false;
          btnCheckUpdates.style.cssText = '';
        }, 3000);
      }
    });
  }
}

async function downloadUpdate() {
  try {
    showDownloadProgress();
    await window.lmuAPI.downloadUpdate();
  } catch (error) {
    console.error('[Update] Erreur téléchargement:', error);
  }
}

async function installUpdate() {
  try {
    await window.lmuAPI.installUpdate();
  } catch (error) {
    console.error('[Update] Erreur installation:', error);
  }
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals < 0 ? 0 : decimals)) + ' ' + sizes[i];
}

function showUpdateNotification(options) {
  const existing = document.getElementById('update-notification');
  if (existing) existing.remove();

  const notification = document.createElement('div');
  notification.id = 'update-notification';
  notification.className = 'update-notification';
  notification.innerHTML = `
    <div class="update-content">
      <h3><i class="fas fa-bell"></i>${options.title}</h3>
      <p>${options.message}</p>
      <div class="update-buttons">
        ${options.buttons.map((btn, index) => `<button id="update-btn-${index}">${btn.text}</button>`).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(notification);
  options.buttons.forEach((btn, index) => {
    document.getElementById(`update-btn-${index}`).addEventListener('click', btn.action);
  });
}

function showDownloadProgress() {
  const notification = document.getElementById('update-notification');
  if (notification) {
    notification.innerHTML = `
      <div class="update-content">
        <h3>Téléchargement en cours...</h3>
        <div class="progress-bar">
          <div id="progress-fill" class="progress-fill" style="width:0%"></div>
        </div>
        <p id="progress-text">0%</p>
      </div>
    `;
  }
}

function updateDownloadProgress(progress) {
  const fill = document.getElementById('progress-fill');
  const text = document.getElementById('progress-text');
  if (fill && text) {
    fill.style.width = progress.percent + '%';
    text.textContent = `${progress.percent.toFixed(1)}% - ${progress.transferred}/${progress.total} (${progress.speed})`;
  }
}

function closeUpdateNotification() {
  document.getElementById('update-notification')?.remove();
}

// Exposer l'init manuel (appelé depuis renderer.js après injection de la vue settings)
window.LMUUpdateManager = {
  init: initUpdateSettingsUI
};
