// Module pour gérer les notifications de mise à jour dans l'interface utilisateur
// À inclure dans votre renderer.js ou créer un module séparé

// Écouter les événements de mise à jour

// Mise à jour disponible
window.electron?.ipcRenderer?.on('update-available', (event, info) => {
  console.log('Mise à jour disponible:', info);
  
  // Créer une notification dans l'interface
  showUpdateNotification({
    title: 'Mise à jour disponible',
    message: `La version ${info.version} est disponible. Voulez-vous la télécharger ?`,
    version: info.version,
    buttons: [
      {
        text: 'Télécharger',
        action: () => downloadUpdate()
      },
      {
        text: 'Plus tard',
        action: () => closeUpdateNotification()
      }
    ]
  });
});

// Progression du téléchargement
window.electron?.ipcRenderer?.on('download-progress', (event, progress) => {
  console.log(`Téléchargement: ${progress.percent.toFixed(2)}%`);
  
  updateDownloadProgress({
    percent: progress.percent,
    transferred: formatBytes(progress.transferred),
    total: formatBytes(progress.total),
    speed: formatBytes(progress.bytesPerSecond) + '/s'
  });
});

// Mise à jour téléchargée
window.electron?.ipcRenderer?.on('update-downloaded', (event, info) => {
  console.log('Mise à jour téléchargée, prête à installer');
  
  // Afficher l'indicateur dans les paramètres
  const updateStatus = document.getElementById('updateStatus');
  if (updateStatus) {
    updateStatus.style.display = 'block';
  }
  
  showUpdateNotification({
    title: 'Mise à jour prête',
    message: 'La mise à jour a été téléchargée. L\'application redémarrera pour l\'installer.',
    buttons: [
      {
        text: 'Redémarrer maintenant',
        action: () => installUpdate()
      },
      {
        text: 'Au prochain démarrage',
        action: () => closeUpdateNotification()
      }
    ]
  });
});

// Fonctions helper
async function checkForUpdates() {
  try {
    const result = await window.lmuAPI.checkForUpdates();
    if (!result.ok) {
      console.error('Erreur lors de la vérification:', result.error);
    }
    return result;
  } catch (error) {
    console.error('Erreur:', error);
    throw error;
  }
}

async function downloadUpdate() {
  try {
    console.log('Début du téléchargement de la mise à jour...');
    
    // Afficher la barre de progression AVANT de commencer le téléchargement
    showDownloadProgress();
    
    const result = await window.lmuAPI.downloadUpdate();
    console.log('Résultat du téléchargement:', result);
    
    if (!result.ok) {
      console.error('Échec du téléchargement:', result.error);
    }
  } catch (error) {
    console.error('Erreur lors du téléchargement:', error);
  }
}

async function installUpdate() {
  try {
    console.log('Installation de la mise à jour et redémarrage...');
    await window.lmuAPI.installUpdate();
  } catch (error) {
    console.error('Erreur lors de l\'installation:', error);
  }
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Exemple d'implémentation de l'interface utilisateur
function showUpdateNotification(options) {
  // Fermer la notification existante si elle existe
  const existing = document.getElementById('update-notification');
  if (existing) {
    existing.remove();
  }
  
  // Créer un élément de notification
  const notification = document.createElement('div');
  notification.id = 'update-notification';
  notification.className = 'update-notification';
  notification.innerHTML = `
    <div class="update-content">
      <h3><i class="fas fa-bell"></i>${options.title}</h3>
      <p>${options.message}</p>
      <div class="update-buttons">
        ${options.buttons.map((btn, index) => 
          `<button id="update-btn-${index}">${btn.text}</button>`
        ).join('')}
      </div>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Attacher les événements aux boutons
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
          <div id="progress-fill" class="progress-fill" style="width: 0%"></div>
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
  const notification = document.getElementById('update-notification');
  if (notification) {
    notification.remove();
  }
}

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', async () => {
  // Afficher la version de l'app dans les paramètres
  const versionElement = document.getElementById('appVersion');
  if (versionElement) {
    try {
      const version = await window.lmuAPI.getAppVersion();
      versionElement.textContent = `v${version}`;
    } catch (error) {
      console.error('Erreur lors de la récupération de la version:', error);
      versionElement.textContent = 'Inconnue';
    }
  }

  // Gérer le bouton de vérification des mises à jour
  const btnCheckUpdates = document.getElementById('btnCheckUpdates');
  if (btnCheckUpdates) {
    btnCheckUpdates.addEventListener('click', async () => {
      const icon = btnCheckUpdates.querySelector('i');
      const originalHTML = btnCheckUpdates.innerHTML;
      
      btnCheckUpdates.disabled = true;
      btnCheckUpdates.innerHTML = '<i class=\"fas fa-spinner fa-spin\"></i> Vérification...';
      
      try {
        await checkForUpdates();
        
        // Attendre 2 secondes pour laisser le temps à la notification d'apparaître si disponible
        setTimeout(() => {
          if (!document.getElementById('update-notification')) {
            // Pas de mise à jour disponible
            btnCheckUpdates.innerHTML = '<i class=\"fas fa-check\"></i> Application à jour';
            btnCheckUpdates.style.background = 'rgba(34,197,94,0.1)';
            btnCheckUpdates.style.borderColor = 'rgba(34,197,94,0.3)';
            btnCheckUpdates.style.color = '#22c55e';
            
            setTimeout(() => {
              btnCheckUpdates.innerHTML = originalHTML;
              btnCheckUpdates.disabled = false;
              btnCheckUpdates.style = '';
            }, 3000);
          } else {
            btnCheckUpdates.innerHTML = originalHTML;
            btnCheckUpdates.disabled = false;
          }
        }, 2000);
      } catch (error) {
        console.error('Erreur lors de la vérification:', error);
        btnCheckUpdates.innerHTML = '<i class=\"fas fa-exclamation-triangle\"></i> Erreur';
        btnCheckUpdates.style.background = 'rgba(239,68,68,0.1)';
        btnCheckUpdates.style.borderColor = 'rgba(239,68,68,0.3)';
        btnCheckUpdates.style.color = '#ef4444';
        
        setTimeout(() => {
          btnCheckUpdates.innerHTML = originalHTML;
          btnCheckUpdates.disabled = false;
          btnCheckUpdates.style = '';
        }, 3000);
      }
    });
  }
});

// CSS à ajouter à votre styles.css
const updateStyles = `
.update-notification {
  position: fixed;
  top: 20px;
  right: 20px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 10000;
  min-width: 300px;
  max-width: 400px;
}

.update-content h3 {
  margin: 0 0 10px 0;
  color: #333;
}

.update-content p {
  margin: 0 0 15px 0;
  color: #666;
}

.update-buttons {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.update-buttons button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.update-buttons button:first-child {
  background: #0066cc;
  color: white;
}

.update-buttons button:first-child:hover {
  background: #0052a3;
}

.update-buttons button:last-child {
  background: #f0f0f0;
  color: #333;
}

.progress-bar {
  width: 100%;
  height: 20px;
  background: #f0f0f0;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 10px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #0066cc, #0052a3);
  transition: width 0.3s ease;
}

#progress-text {
  font-size: 12px;
  color: #666;
  text-align: center;
}
`;
