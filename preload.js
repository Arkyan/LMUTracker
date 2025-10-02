const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lmuAPI', {
  openFile: () => ipcRenderer.invoke('open-lmu-file'),
  openFolder: () => ipcRenderer.invoke('open-lmu-folder'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  scanFolder: (folderPath) => ipcRenderer.invoke('scan-lmu-folder', folderPath),
  openFileByPath: (filePath) => ipcRenderer.invoke('open-lmu-file-by-path', filePath)
});
