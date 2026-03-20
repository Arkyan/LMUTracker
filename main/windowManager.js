const { BrowserWindow, app, nativeImage } = require('electron');
const path = require('path');
const fsSync = require('fs');

const ROOT = path.join(__dirname, '..');

function getAppId() {
  return app.isPackaged ? 'com.lmutracker.app' : 'com.lmutracker.app.dev';
}

function resolveIcon(filename) {
  const candidates = [
    ROOT,
    path.join(process.resourcesPath || '', 'app.asar.unpacked'),
    path.join(process.resourcesPath || '', 'app'),
    process.resourcesPath || ''
  ].filter(Boolean);

  for (const dir of candidates) {
    const p = path.join(dir, filename);
    if (fsSync.existsSync(p)) return p;
  }
  return null;
}

function createWindow() {
  const icoPath = resolveIcon('LMUTrackerLogo.ico');
  const pngPath = resolveIcon('LMUTrackerLogo.png');
  const iconPath = icoPath || pngPath || resolveIcon('LMUTrackerLogo.webp') || '';

  let browserIcon;
  try {
    const img = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
    if (!img.isEmpty()) browserIcon = img;
  } catch {}

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    icon: browserIcon || iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  try {
    if (process.platform === 'win32' && typeof win.setAppDetails === 'function') {
      win.setAppDetails({
        appId: getAppId(),
        appIconPath: iconPath || undefined,
        relaunchDisplayName: 'LMU Tracker'
      });
    }
  } catch {}

  win.loadFile(path.join(ROOT, 'index.html'));
  win.maximize();

  if (app.isPackaged) {
    win.webContents.on('before-input-event', (event, input) => {
      if (
        input.key === 'F12' ||
        (input.control && input.shift && ['I', 'J', 'C'].includes(input.key.toUpperCase()))
      ) {
        event.preventDefault();
      }
    });
  }

  return win;
}

module.exports = { createWindow, getAppId };
