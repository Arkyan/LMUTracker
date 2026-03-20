const { autoUpdater } = require('electron-updater');
const devLog = require('./devLog');

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function setupUpdaterEvents(getWindow) {
  autoUpdater.on('checking-for-update', () => {
    devLog('Vérification des mises à jour...');
  });

  autoUpdater.on('update-available', (info) => {
    devLog('Mise à jour disponible:', info.version);
    const win = getWindow();
    if (win) win.webContents.send('update-available', info);
  });

  autoUpdater.on('update-not-available', () => {
    devLog('Application à jour');
  });

  autoUpdater.on('error', (err) => {
    console.error('Erreur lors de la mise à jour:', err);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    devLog(
      `Vitesse de téléchargement: ${progressObj.bytesPerSecond}` +
      ` - Téléchargé ${progressObj.percent}%` +
      ` (${progressObj.transferred}/${progressObj.total})`
    );
    const win = getWindow();
    if (win) win.webContents.send('download-progress', progressObj);
  });

  autoUpdater.on('update-downloaded', (info) => {
    devLog('Mise à jour téléchargée');
    const win = getWindow();
    if (win) win.webContents.send('update-downloaded', info);
  });
}

module.exports = { autoUpdater, setupUpdaterEvents };
