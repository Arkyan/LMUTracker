const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

const SETTINGS_FILE = 'settings.json';

function getSettingsPath() {
  return path.join(app.getPath('userData'), SETTINGS_FILE);
}

async function readSettings() {
  try {
    const content = await fs.readFile(getSettingsPath(), 'utf-8');
    return { ok: true, data: JSON.parse(content) };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { ok: true, data: {} };
    }
    return { ok: false, error: String(error) };
  }
}

async function writeSettings(settingsObj) {
  try {
    try { fsSync.mkdirSync(app.getPath('userData'), { recursive: true }); } catch {}
    await fs.writeFile(getSettingsPath(), JSON.stringify(settingsObj || {}, null, 2), 'utf-8');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

// Lecture synchrone du thème seul, utilisée par le script de démarrage bloquant
// (index.html/session.html) pour poser data-theme sur <html> avant le premier
// paint et éviter un flash du mauvais thème.
function readThemeSync() {
  try {
    const content = fsSync.readFileSync(getSettingsPath(), 'utf-8');
    const data = JSON.parse(content);
    return data.theme === 'light' ? 'light' : 'dark';
  } catch (_) {
    return 'dark';
  }
}

function registerIpcHandlers() {
  ipcMain.handle('settings-read', () => readSettings());
  ipcMain.handle('settings-write', (_event, settingsObj) => writeSettings(settingsObj));
  ipcMain.on('settings-read-theme-sync', (event) => {
    event.returnValue = readThemeSync();
  });
}

module.exports = { readSettings, writeSettings, registerIpcHandlers };
