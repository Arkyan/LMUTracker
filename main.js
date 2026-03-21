const { app } = require('electron');
const dbManager = require('./modules/databaseManager');
const devLog = require('./main/devLog');
const { createWindow, getAppId } = require('./main/windowManager');
const { autoUpdater, setupUpdaterEvents } = require('./main/updaterSetup');
const { registerIpcHandlers } = require('./main/ipcHandlers');
const { registerIpcHandlers: registerSettingsHandlers } = require('./main/settingsManager');

// AppUserModelId Windows (icône barre des tâches)
try { app.setName('LMU Tracker'); } catch {}
try {
  if (process.platform === 'win32') app.setAppUserModelId(getAppId());
} catch {}

let mainWindow = null;

setupUpdaterEvents(() => mainWindow);
registerIpcHandlers();
registerSettingsHandlers();

app.whenReady().then(() => {
  // Supprimer l'ancien sessions-cache.v1.json (remplacé par SQLite)
  try {
    const fs = require('fs');
    const oldCache = require('path').join(app.getPath('userData'), 'sessions-cache.v1.json');
    if (fs.existsSync(oldCache)) fs.unlinkSync(oldCache);
  } catch {}

  const dbInit = dbManager.initDatabase();
  if (dbInit.ok) {
    devLog('[Main] Base de données initialisée');
  } else {
    console.error('[Main] Erreur d\'initialisation de la base de données:', dbInit.error);
  }

  mainWindow = createWindow();

  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(err => {
        devLog('Impossible de vérifier les mises à jour:', err.message);
      });
    }, 3000);
  }
});

app.on('window-all-closed', () => {
  dbManager.closeDatabase();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  dbManager.closeDatabase();
});
