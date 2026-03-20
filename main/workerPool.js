const path = require('path');
const fsSync = require('fs');
const os = require('os');
const { Worker } = require('worker_threads');

const ROOT = path.join(__dirname, '..');

let pool = null;

function resolveWorkerScript() {
  const candidates = [
    ROOT,
    path.join(process.resourcesPath || '', 'app'),
    process.resourcesPath || ''
  ].filter(Boolean);

  for (const dir of candidates) {
    const p = path.join(dir, 'workers', 'parseWorker.js');
    if (fsSync.existsSync(p)) return p;
  }
  return path.join(ROOT, 'workers', 'parseWorker.js');
}

function createWorker(scriptPath) {
  const worker = new Worker(scriptPath, { argv: [], execArgv: [] });
  worker._busy = false;
  worker._current = null;
  return worker;
}

function ensurePool() {
  if (pool) return pool;

  const size = Math.max(1, Math.min(4, os.cpus ? os.cpus().length : 4));
  const script = resolveWorkerScript();
  const workers = Array.from({ length: size }, () => createWorker(script));
  const queue = [];
  const idle = new Set(workers);

  function pump() {
    while (idle.size > 0 && queue.length > 0) {
      const worker = idle.values().next().value;
      idle.delete(worker);
      const job = queue.shift();
      worker._busy = true;
      worker._current = job;
      try {
        worker.postMessage({ filePath: job.filePath });
      } catch (err) {
        worker._busy = false;
        worker._current = null;
        idle.add(worker);
        job.resolve({ filePath: job.filePath, error: String(err) });
      }
    }
  }

  function attachWorkerEvents(worker) {
    worker.on('message', (msg) => {
      const job = worker._current;
      worker._busy = false;
      worker._current = null;
      idle.add(worker);
      if (msg && (msg.ok || msg.result)) {
        job?.resolve(msg.result);
      } else {
        job?.reject(new Error('Réponse worker invalide'));
      }
      pump();
    });

    worker.on('error', (err) => {
      const job = worker._current;
      worker._busy = false;
      worker._current = null;
      idle.add(worker);
      job?.resolve({ filePath: job?.filePath, error: String(err) });
      pump();
    });

    worker.on('exit', () => {
      idle.delete(worker);
      const replacement = createWorker(script);
      workers.push(replacement);
      idle.add(replacement);
      attachWorkerEvents(replacement);
      pump();
    });
  }

  for (const worker of workers) {
    attachWorkerEvents(worker);
  }

  pool = {
    run: (filePath) => new Promise((resolve, reject) => {
      queue.push({ filePath, resolve, reject });
      pump();
    })
  };

  return pool;
}

async function parseFilesWithWorkerPool(filePaths) {
  const p = ensurePool();
  return Promise.all(filePaths.map(fp => p.run(fp)));
}

module.exports = { parseFilesWithWorkerPool };
