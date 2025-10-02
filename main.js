const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { XMLParser } = require('fast-xml-parser');
const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
};

function createWindow() {
  // Choisir l'icône selon la disponibilité (ICO préférable sur Windows)
  let iconPath = path.join(__dirname, 'LMUTrackerLogo.webp');
  const icoPath = path.join(__dirname, 'LMUTrackerLogo.ico');
  const pngPath = path.join(__dirname, 'LMUTrackerLogo.png');
  
  if (fsSync.existsSync(icoPath)) {
    iconPath = icoPath;
  } else if (fsSync.existsSync(pngPath)) {
    iconPath = pngPath;
  }

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    icon: iconPath,
    autoHideMenuBar: true, // Cache la barre de menus par défaut (peut être réaffichée avec Alt)
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Supprimer complètement la barre de menus
  win.setMenuBarVisibility(false);
  win.setMenu(null);

  win.loadFile('index.html');
  win.maximize();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC : ouverture d'un fichier LMU
ipcMain.handle('open-lmu-file', async () => {
  const result = await dialog.showOpenDialog({
    title: "Choisir un fichier de résultats LMU",
    properties: ['openFile'],
    filters: [{ name: 'Fichiers LMU', extensions: ['xml'] }]
  });

  if (result.canceled) return { canceled: true };

  const filePath = result.filePaths[0];
  const content = await fs.readFile(filePath, 'utf-8');

  // Parser XML → JSON (avec attributs)
  const parser = new XMLParser(parserOptions);
  const parsed = parser.parse(content);

  return { canceled: false, filePath, parsed };
});

// Helper: lister tous les fichiers .xml dans un dossier (récursif)
async function getAllXmlFiles(dir) {
  const out = [];
  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.xml')) {
        out.push(full);
      }
    }
  }
  await walk(dir);
  return out;
}

// IPC : ouverture d'un dossier et parsing de tous les .xml
ipcMain.handle('open-lmu-folder', async () => {
  const result = await dialog.showOpenDialog({
    title: "Choisir un dossier contenant des fichiers LMU (.xml)",
    properties: ['openDirectory']
  });

  if (result.canceled) return { canceled: true };

  const folderPath = result.filePaths[0];
  const files = await getAllXmlFiles(folderPath);

  const parser = new XMLParser(parserOptions);
  const parsedFiles = [];

  for (const filePath of files) {
    try {
        const [content, stat] = await Promise.all([
          fs.readFile(filePath, 'utf-8'),
          fs.stat(filePath)
        ]);
        const parsed = parser.parse(content);
        parsedFiles.push({ filePath, parsed, mtimeMs: stat.mtimeMs, mtimeIso: stat.mtime.toISOString() });
    } catch (err) {
      try {
        const stat = await fs.stat(filePath);
        parsedFiles.push({ filePath, error: String(err), mtimeMs: stat.mtimeMs, mtimeIso: stat.mtime.toISOString() });
      } catch {
        parsedFiles.push({ filePath, error: String(err) });
      }
    }
  }

  return { canceled: false, folderPath, count: parsedFiles.length, files: parsedFiles };
});

// IPC: sélectionner un dossier (sans parser)
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Sélectionner un dossier de résultats',
    properties: ['openDirectory']
  });
  if (result.canceled) return { canceled: true };
  return { canceled: false, folderPath: result.filePaths[0] };
});

// IPC: scanner un dossier fourni pour parser tous les .xml
ipcMain.handle('scan-lmu-folder', async (_event, folderPath) => {
  if (!folderPath) {
    return { canceled: true, error: 'Aucun dossier fourni' };
  }
  try {
    const files = await getAllXmlFiles(folderPath);
    const parser = new XMLParser(parserOptions);
    const parsedFiles = [];
    for (const filePath of files) {
      try {
        const [content, stat] = await Promise.all([
          fs.readFile(filePath, 'utf-8'),
          fs.stat(filePath)
        ]);
        const parsed = parser.parse(content);
        parsedFiles.push({ filePath, parsed, mtimeMs: stat.mtimeMs, mtimeIso: stat.mtime.toISOString() });
      } catch (err) {
        try {
          const stat = await fs.stat(filePath);
          parsedFiles.push({ filePath, error: String(err), mtimeMs: stat.mtimeMs, mtimeIso: stat.mtime.toISOString() });
        } catch {
          parsedFiles.push({ filePath, error: String(err) });
        }
      }
    }
    return { canceled: false, folderPath, count: parsedFiles.length, files: parsedFiles };
  } catch (error) {
    return { canceled: true, error: String(error) };
  }
});

// IPC: ouvrir un fichier par chemin précis (pour la page session)
ipcMain.handle('open-lmu-file-by-path', async (_event, filePath) => {
  if (!filePath) return { canceled: true, error: 'Aucun chemin fourni' };
  try {
    const [content, stat] = await Promise.all([
      fs.readFile(filePath, 'utf-8'),
      fs.stat(filePath)
    ]);
    const parser = new XMLParser(parserOptions);
    const parsed = parser.parse(content);
    return { canceled: false, filePath, parsed, mtimeMs: stat.mtimeMs, mtimeIso: stat.mtime.toISOString() };
  } catch (error) {
    return { canceled: true, error: String(error), filePath };
  }
});
