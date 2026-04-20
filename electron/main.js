const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { execSync, execFile } = require('child_process');
const pty = require('node-pty');

const STORAGE_DIR = path.join(app.getPath('userData'), '.polpo-control-panel');
const PROMPTS_FILE = path.join(STORAGE_DIR, 'prompts.json');
const SLOTS_FILE = path.join(STORAGE_DIR, 'slots.json');

function ensureStorage() {
  if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
  if (!fs.existsSync(PROMPTS_FILE)) fs.writeFileSync(PROMPTS_FILE, '[]');
  if (!fs.existsSync(SLOTS_FILE)) fs.writeFileSync(SLOTS_FILE, '[]');
}

const terminals = new Map();

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: '🐙 Polpo Control Panel',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0f1a',
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  return win;
}

app.whenReady().then(() => {
  ensureStorage();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  terminals.forEach((t) => t.kill());
  terminals.clear();
  if (process.platform !== 'darwin') app.quit();
});

// ═══════ PROMPTS ═══════

ipcMain.handle('prompts:load', () => JSON.parse(fs.readFileSync(PROMPTS_FILE, 'utf-8')));
ipcMain.handle('prompts:save', (_e, data) => { fs.writeFileSync(PROMPTS_FILE, JSON.stringify(data, null, 2)); return true; });

// ═══════ SLOTS (action center saved prompts) ═══════

ipcMain.handle('slots:load', () => JSON.parse(fs.readFileSync(SLOTS_FILE, 'utf-8')));
ipcMain.handle('slots:save', (_e, data) => { fs.writeFileSync(SLOTS_FILE, JSON.stringify(data, null, 2)); return true; });

// ═══════ FOLDER ═══════

ipcMain.handle('dialog:openFolder', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('shell:openPath', (_e, p) => shell.openPath(p));

// ═══════ TERMINAL (sessions + sub-agents) ═══════

const PROVIDER_COMMANDS = { claude: 'claude', codex: 'codex', gemini: 'gemini' };

ipcMain.handle('terminal:create', (_e, { id, provider, cwd, initialPrompt, isSubAgent }) => {
  const shell_cmd = PROVIDER_COMMANDS[provider] || provider;
  // Sub-agents use 120×24 (same as main app SessionManager.createSession for sub-agents)
  const cols = 120;
  const rows = isSubAgent ? 24 : 30;
  const home = process.env.HOME || '';
  const extraPaths = [
    `${home}/.local/bin`,
    `${home}/.nvm/current/bin`,
    '/usr/local/bin',
    '/opt/homebrew/bin',
  ].filter(p => p && p !== '/bin');
  const extendedPath = [...new Set([...extraPaths, ...(process.env.PATH || '').split(':')])].join(':');

  const term = pty.spawn(shell_cmd, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: cwd || process.env.HOME,
    env: { ...process.env, TERM: 'xterm-256color', PATH: extendedPath },
  });
  terminals.set(id, term);

  term.onData((data) => {
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('terminal:data', { id, data }));
  });
  term.onExit(({ exitCode }) => {
    terminals.delete(id);
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('terminal:exit', { id, exitCode }));
  });

  // Prompt injection — same technique as main app:
  // Bracketed Paste Mode (BPM) + separate Enter + proper delays
  if (initialPrompt) {
    const delay = isSubAgent ? 2000 : 500; // sub-agents need longer for CLI init
    const BPM_START = '\x1b[200~';
    const BPM_END = '\x1b[201~';

    setTimeout(() => {
      if (!terminals.has(id)) return;
      // Wrap in bracketed paste mode so multi-line prompts arrive atomically
      term.write(BPM_START + initialPrompt + BPM_END);
      // Send Enter separately after paste is processed
      setTimeout(() => {
        if (terminals.has(id)) term.write('\r');
      }, 300);
    }, delay);
  }

  return true;
});

ipcMain.handle('terminal:write', (_e, { id, data }) => { const t = terminals.get(id); if (t) t.write(data); return !!t; });
ipcMain.handle('terminal:resize', (_e, { id, cols, rows }) => { const t = terminals.get(id); if (t) t.resize(cols, rows); return !!t; });
ipcMain.handle('terminal:kill', (_e, { id }) => { const t = terminals.get(id); if (t) { t.kill(); terminals.delete(id); } return true; });

// ═══════ CODE MAPPING ═══════

ipcMain.handle('workspace:scan', (_e, { cwd, maxDepth }) => {
  const ignore = new Set(['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', '.venv', 'vendor', '.polpo-assets']);
  const results = { dirs: 0, files: 0, items: [] };

  function scan(dir, depth, prefix) {
    if (depth > (maxDepth || 3)) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.env') continue;
      if (ignore.has(e.name)) continue;
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) {
        results.dirs++;
        results.items.push({ name: e.name, type: 'dir', depth, path: fp });
        scan(fp, depth + 1, prefix + '  ');
      } else {
        results.files++;
        let size = 0;
        try { size = fs.statSync(fp).size; } catch {}
        results.items.push({ name: e.name, type: 'file', depth, size, path: fp });
      }
      if (results.items.length > 200) return;
    }
  }

  scan(cwd, 0, '');
  return results;
});

// ═══════ GIT ═══════

function gitExec(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 10000 }).trim();
  } catch (e) {
    return e.stdout ? e.stdout.trim() : '';
  }
}

ipcMain.handle('git:status', (_e, { cwd }) => {
  try {
    const branch = gitExec('git rev-parse --abbrev-ref HEAD', cwd);
    const statusRaw = gitExec('git status --porcelain', cwd);
    const files = statusRaw.split('\n').filter(Boolean).map((line) => {
      const statusCode = line.substring(0, 2);
      const filepath = line.substring(3);
      let status = 'modified';
      if (statusCode.includes('A') || statusCode.includes('?')) status = 'added';
      else if (statusCode.includes('D')) status = 'deleted';
      else if (statusCode.includes('R')) status = 'renamed';
      else if (statusCode.includes('U')) status = 'conflict';
      const staged = statusCode[0] !== ' ' && statusCode[0] !== '?';
      return { path: filepath, status, statusCode, staged };
    });
    return { ok: true, branch, files, counts: { total: files.length, modified: files.filter(f => f.status === 'modified').length, added: files.filter(f => f.status === 'added').length, deleted: files.filter(f => f.status === 'deleted').length } };
  } catch (e) {
    return { ok: false, error: e.message, branch: '', files: [] };
  }
});

ipcMain.handle('git:stageAll', (_e, { cwd }) => { gitExec('git add -A', cwd); return true; });
ipcMain.handle('git:stage', (_e, { cwd, filepath }) => { gitExec(`git add "${filepath}"`, cwd); return true; });

ipcMain.handle('git:commit', (_e, { cwd, message }) => {
  try {
    gitExec(`git commit -m "${message.replace(/"/g, '\\"')}"`, cwd);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('git:diff', (_e, { cwd, filepath }) => {
  return gitExec(filepath ? `git diff -- "${filepath}"` : 'git diff', cwd);
});

ipcMain.handle('git:log', (_e, { cwd, count }) => {
  const raw = gitExec(`git log --oneline -${count || 10}`, cwd);
  return raw.split('\n').filter(Boolean).map((l) => {
    const [hash, ...rest] = l.split(' ');
    return { hash, message: rest.join(' ') };
  });
});

ipcMain.handle('git:pull', (_e, { cwd }) => {
  try { return { ok: true, output: gitExec('git pull', cwd) }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('git:push', (_e, { cwd }) => {
  try { return { ok: true, output: gitExec('git push', cwd) }; }
  catch (e) { return { ok: false, error: e.message }; }
});

// ═══════ ASSETS ═══════

function getAssetsDir(cwd) {
  const d = path.join(cwd, '.polpo-assets');
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}

ipcMain.handle('assets:list', (_e, { cwd }) => {
  const dir = getAssetsDir(cwd);
  try {
    return fs.readdirSync(dir).map((name) => {
      const fp = path.join(dir, name);
      const stat = fs.statSync(fp);
      const ext = path.extname(name).toLowerCase();
      const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext);
      return { name, size: stat.size, isImage, createdAt: stat.birthtime.toISOString(), modifiedAt: stat.mtime.toISOString() };
    });
  } catch { return []; }
});

ipcMain.handle('assets:upload', async (_e, { cwd }) => {
  const r = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
  if (r.canceled) return [];
  const dir = getAssetsDir(cwd);
  const uploaded = [];
  for (const src of r.filePaths) {
    const name = path.basename(src);
    fs.copyFileSync(src, path.join(dir, name));
    uploaded.push(name);
  }
  return uploaded;
});

ipcMain.handle('assets:delete', (_e, { cwd, name }) => {
  const fp = path.join(getAssetsDir(cwd), name);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  return true;
});

ipcMain.handle('assets:rename', (_e, { cwd, oldName, newName }) => {
  const dir = getAssetsDir(cwd);
  fs.renameSync(path.join(dir, oldName), path.join(dir, newName));
  return true;
});

ipcMain.handle('assets:readImage', (_e, { cwd, name }) => {
  const fp = path.join(getAssetsDir(cwd), name);
  const buf = fs.readFileSync(fp);
  const ext = path.extname(name).toLowerCase();
  const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp' }[ext] || 'application/octet-stream';
  return `data:${mime};base64,${buf.toString('base64')}`;
});

ipcMain.handle('assets:openFolder', (_e, { cwd }) => {
  shell.openPath(getAssetsDir(cwd));
  return true;
});

// ═══════ EXTERNAL SPAWN SERVER (Sprint 4) ═══════
// Listens on 127.0.0.1:9977 — local only, never exposed externally.
// Auth: X-Polpo-Token header must match POLPO_SPAWN_TOKEN env var (default: 'polpo-local').

const SPAWN_PORT = 9977;
const SPAWN_HOST = '127.0.0.1';
const SPAWN_TOKEN = process.env.POLPO_SPAWN_TOKEN || 'polpo-local';

function notifyRenderer(event, payload) {
  BrowserWindow.getAllWindows().forEach(w => w.webContents.send(event, payload));
}

const spawnServer = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, version: '0.1.0-alpha' }));
    return;
  }

  // Auth required for all other routes
  if (req.headers['x-polpo-token'] !== SPAWN_TOKEN) {
    res.writeHead(401);
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }

  if (req.method === 'POST' && req.url === '/spawn') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      try {
        const { task, cwd, mode, provider } = JSON.parse(body);
        if (!task) { res.writeHead(400); res.end(JSON.stringify({ error: 'task required' })); return; }
        const payload = {
          task: String(task).slice(0, 2000),
          cwd: cwd ? String(cwd) : null,
          mode: mode || 'sprint',
          provider: provider || 'claude',
        };
        notifyRenderer('spawn:external', payload);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, message: 'spawning session' }));
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'invalid json' }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'not found' }));
});

app.whenReady().then(() => {
  spawnServer.listen(SPAWN_PORT, SPAWN_HOST, () => {
    console.log(`[polpo] spawn server on ${SPAWN_HOST}:${SPAWN_PORT}`);
  });
});

app.on('before-quit', () => spawnServer.close());

// ═══════ VOICE ALERT + DOCK BADGE (Sprint 5) ═══════

const voiceAlertedSessions = new Map();
const VOICE_COOLDOWN_MS = 120000;

ipcMain.handle('voice:alert', (_e, { sessionName }) => {
  const now = Date.now();
  if (voiceAlertedSessions.has(sessionName) && now - voiceAlertedSessions.get(sessionName) < VOICE_COOLDOWN_MS) return false;
  voiceAlertedSessions.set(sessionName, now);
  const python = '/usr/local/bin/python3.10';
  const script = path.join(process.env.HOME || '', 'scripts', 'voice_briefing.py');
  const text = `Signore, ${sessionName} chiede input. Intervento richiesto.`;
  execFile(python, [script, text, '--play'], { timeout: 30000 }, (err) => {
    if (err) console.warn('[polpo] voice alert error:', err.message);
  });
  return true;
});

ipcMain.handle('dock:badge', (_e, { count }) => {
  if (process.platform === 'darwin') app.dock.setBadge(count > 0 ? String(count) : '');
  return true;
});
