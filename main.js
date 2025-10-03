const { app, BrowserWindow, ipcMain, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { XMLParser } = require('fast-xml-parser');
const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
};

// Assure l'association correcte de l'icône dans la barre des tâches Windows
// en définissant un AppUserModelID correspondant à build.appId
const getAppId = () => (app.isPackaged ? 'com.lmutracker.app' : 'com.lmutracker.app.dev');
try {
  app.setName('LMU Tracker');
} catch {}
try {
  if (process.platform === 'win32') {
    app.setAppUserModelId(getAppId());
  }
} catch (_) {
  // Pas critique sur autres plateformes / anciennes versions
}

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

  // Charger l'icône explicitement (utile en dev sous Windows)
  let browserIcon;
  try {
    const img = nativeImage.createFromPath(iconPath);
    if (!img.isEmpty()) {
      browserIcon = img;
    }
  } catch {}

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
  icon: browserIcon || iconPath,
    autoHideMenuBar: true, // Cache la barre de menus par défaut (peut être réaffichée avec Alt)
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Définir explicitement les détails d'app pour la barre des tâches Windows
  try {
    if (process.platform === 'win32' && typeof win.setAppDetails === 'function') {
      const appIconPath = fsSync.existsSync(icoPath) ? icoPath : (fsSync.existsSync(pngPath) ? pngPath : iconPath);
      win.setAppDetails({
        appId: getAppId(),
        appIconPath,
        relaunchDisplayName: 'LMU Tracker'
      });
    }
  } catch {}



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

// Nouvelle API: lister les fichiers (métadonnées uniquement) triés par mtime desc
ipcMain.handle('list-lmu-files', async (_event, folderPath) => {
  if (!folderPath) {
    return { canceled: true, error: 'Aucun dossier fourni' };
  }
  try {
    const files = await getAllXmlFiles(folderPath);
    const metas = [];
    for (const filePath of files) {
      try {
        const stat = await fs.stat(filePath);
        metas.push({ filePath, mtimeMs: stat.mtimeMs, mtimeIso: stat.mtime.toISOString() });
      } catch (err) {
        metas.push({ filePath, error: String(err) });
      }
    }
    metas.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
    return { canceled: false, folderPath, count: metas.length, filesMeta: metas };
  } catch (error) {
    return { canceled: true, error: String(error) };
  }
});

// Nouvelle API: parser un lot de fichiers par chemins
ipcMain.handle('parse-lmu-files', async (_event, filePaths) => {
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    return { canceled: true, error: 'Aucun fichier fourni' };
  }
  try {
    const parser = new XMLParser(parserOptions);
    const parsedFiles = [];
    for (const filePath of filePaths) {
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
    return { canceled: false, count: parsedFiles.length, files: parsedFiles };
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

  // ===========================
  // Paramètres (persistance JSON)
  // ===========================
  const SETTINGS_FILE_NAME = 'settings.json';

  async function readSettingsFromDisk() {
    try {
      const filePath = path.join(app.getPath('userData'), SETTINGS_FILE_NAME);
      const content = await fs.readFile(filePath, 'utf-8');
      const json = JSON.parse(content);
      return { ok: true, data: json, filePath };
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        const filePath = path.join(app.getPath('userData'), SETTINGS_FILE_NAME);
        return { ok: true, data: {}, filePath };
      }
      return { ok: false, error: String(error) };
    }
  }

  async function writeSettingsToDisk(settingsObj) {
    try {
      const filePath = path.join(app.getPath('userData'), SETTINGS_FILE_NAME);
      // S'assurer que le dossier userData existe (normalement Electron le crée)
      try { fsSync.mkdirSync(app.getPath('userData'), { recursive: true }); } catch {}
      const json = JSON.stringify(settingsObj || {}, null, 2);
      await fs.writeFile(filePath, json, 'utf-8');
      return { ok: true, filePath };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }

  ipcMain.handle('settings-read', async () => {
    return await readSettingsFromDisk();
  });

  ipcMain.handle('settings-write', async (_event, settingsObj) => {
    return await writeSettingsToDisk(settingsObj);
  });
