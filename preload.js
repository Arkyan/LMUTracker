const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lmuAPI', {
  openFile: () => ipcRenderer.invoke('open-lmu-file'),
  openFolder: () => ipcRenderer.invoke('open-lmu-folder'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  scanFolder: (folderPath) => ipcRenderer.invoke('scan-lmu-folder', folderPath),
  openFileByPath: (filePath) => ipcRenderer.invoke('open-lmu-file-by-path', filePath),
  // Paramètres persistés
  readSettings: () => ipcRenderer.invoke('settings-read'),
  writeSettings: (settingsObj) => ipcRenderer.invoke('settings-write', settingsObj),
  // Nouveau: listing meta et parsing par lots
  listLmuFiles: (folderPath) => ipcRenderer.invoke('list-lmu-files', folderPath),
  parseLmuFiles: (filePaths) => ipcRenderer.invoke('parse-lmu-files', filePaths),
  // API Base de données
  dbGetStats: () => ipcRenderer.invoke('db-get-stats'),
  dbGetAllFiles: () => ipcRenderer.invoke('db-get-all-files'),
  dbCleanup: () => ipcRenderer.invoke('db-cleanup'),
  dbGetFileData: (filePath) => ipcRenderer.invoke('db-get-file-data', filePath),
  dbReset: () => ipcRenderer.invoke('db-reset'),
  // API Mises à jour
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update')
});

// Exposer l'API electron pour les événements de mise à jour
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    on: (channel, func) => {
      const validChannels = ['update-available', 'download-progress', 'update-downloaded'];
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, (event, ...args) => func(event, ...args));
      }
    }
  }
});
