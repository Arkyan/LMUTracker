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
  parseLmuFiles: (filePaths) => ipcRenderer.invoke('parse-lmu-files', filePaths)
});
