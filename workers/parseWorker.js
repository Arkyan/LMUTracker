const { parentPort } = require('worker_threads');
const fs = require('fs').promises;
const { XMLParser } = require('fast-xml-parser');

const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
};

const parser = new XMLParser(parserOptions);

parentPort.on('message', async (msg) => {
  const filePath = msg?.filePath;
  if (!filePath) {
    parentPort.postMessage({ ok: false, result: { error: 'Aucun chemin fourni' } });
    return;
  }
  try {
    const [content, stat] = await Promise.all([
      fs.readFile(filePath, 'utf-8'),
      fs.stat(filePath)
    ]);
    const parsed = parser.parse(content);
    parentPort.postMessage({ ok: true, result: { filePath, parsed, mtimeMs: stat.mtimeMs, mtimeIso: stat.mtime.toISOString() } });
  } catch (err) {
    try {
      const stat = await fs.stat(filePath);
      parentPort.postMessage({ ok: false, result: { filePath, error: String(err), mtimeMs: stat.mtimeMs, mtimeIso: stat.mtime.toISOString() } });
    } catch {
      parentPort.postMessage({ ok: false, result: { filePath, error: String(err) } });
    }
  }
});
