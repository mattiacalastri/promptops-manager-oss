import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

// ═══════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════
let prompts = [], slots = [], sessions = [], subAgents = [];
let activeSessionId = null, currentWorkspace = null, editingPromptId = null, ctxSessionId = null;
let selectedMode = 'sprint';
const terminalInstances = {};
const PROVIDERS = {
  claude: { label: 'Claude Code', iconClass: 'claude', tiIcon: 'ti-brand-snowflake' },
  codex:  { label: 'Codex',       iconClass: 'codex',  tiIcon: 'ti-brand-openai' },
  gemini: { label: 'Gemini',      iconClass: 'gemini', tiIcon: 'ti-diamond' },
};
const MODE_PRESETS = {
  sprint: { reasoning_depth: 'LOW', verbosity: 'MINIMAL', speed_priority: 'MAX', risk_tolerance: 'MEDIUM' },
  architect: { reasoning_depth: 'MAX', verbosity: 'STRUCTURED', speed_priority: 'LOW', risk_tolerance: 'LOW' },
  detective: { reasoning_depth: 'HIGH', verbosity: 'STRUCTURED', speed_priority: 'MEDIUM', risk_tolerance: 'ZERO' },
  refactor: { reasoning_depth: 'MEDIUM', verbosity: 'STRUCTURED', speed_priority: 'MEDIUM', risk_tolerance: 'LOW' },
  paranoid: { reasoning_depth: 'MAX', verbosity: 'STRUCTURED', speed_priority: 'LOW', risk_tolerance: 'ZERO' },
  minimal: { reasoning_depth: 'LOW', verbosity: 'ZERO', speed_priority: 'MAX', risk_tolerance: 'HIGH' },
};
const QUICK_AGENTS = {
  security: { title: 'Security Audit', prompt: 'Perform a comprehensive security audit of this codebase. Look for vulnerabilities, injection risks, exposed secrets, and insecure patterns.' },
  tests:    { title: 'Test Writer',    prompt: 'Write comprehensive tests for the current codebase. Cover edge cases, error paths, and ensure high code coverage.' },
  review:   { title: 'Code Review',    prompt: 'Review the recent changes in this codebase. Check for bugs, code quality issues, performance problems, and suggest improvements.' },
  docs:     { title: 'Documentation',  prompt: 'Generate documentation for the current codebase. Include API docs, usage examples, and architecture overview.' },
  refactor: { title: 'Refactor',       prompt: 'Identify code that needs refactoring. Look for duplication, complex functions, poor naming, and suggest specific improvements.' },
  perf:     { title: 'Performance',    prompt: 'Analyze this codebase for performance issues. Look for N+1 queries, memory leaks, slow algorithms, and suggest optimizations.' },
};

// ═══════════════════════════════════════════════════════
// DOM HELPERS
// ═══════════════════════════════════════════════════════
const $ = (s) => document.querySelector(s);
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
async function init() {
  prompts = await window.api.loadPrompts();
  slots = await window.api.loadSlots();
  renderPrompts(); renderSessionPromptSelect(); renderSlots();
  updatePanelVisibility();
}

// ═══════════════════════════════════════════════════════
// DIALOGS
// ═══════════════════════════════════════════════════════
function showDialog(el) { $('#dialog-backdrop').classList.add('visible'); el.classList.add('visible'); }
function hideDialog(el) { $('#dialog-backdrop').classList.remove('visible'); el.classList.remove('visible'); }
function hideAllDialogs() { $('#dialog-backdrop').classList.remove('visible'); document.querySelectorAll('.dialog.visible').forEach(d => d.classList.remove('visible')); }
$('#dialog-backdrop').addEventListener('click', hideAllDialogs);

// ═══════════════════════════════════════════════════════
// WORKSPACE
// ═══════════════════════════════════════════════════════
async function openFolder() {
  const f = await window.api.openFolder();
  if (!f) return;
  currentWorkspace = f;
  $('#workspace-label').textContent = f.split('/').slice(-1)[0];
  $('#workspace-label').title = f;
  renderWorkspaceSection(); renderSessions(); refreshGit(); refreshAssets();
}
$('#btn-open-folder').addEventListener('click', openFolder);
$('#btn-welcome-open').addEventListener('click', openFolder);

function renderWorkspaceSection() {
  const ws = $('#workspace-section');
  if (!currentWorkspace) { ws.innerHTML = ''; return; }
  const cnt = sessions.filter(s => s.workspacePath === currentWorkspace).length;
  const name = currentWorkspace.split('/').slice(-1)[0];
  ws.innerHTML = `<div class="section-label" style="padding:0.4rem 0.75rem">Workspace</div>
    <div class="workspace-group"><div class="workspace-header">
      <span class="workspace-chevron expanded"><i class="ti ti-chevron-right"></i></span>
      <span class="workspace-icon"><i class="ti ti-folder-filled"></i></span>
      <span class="workspace-name">${name}</span>
      <span class="workspace-badge">${cnt}</span>
    </div></div>`;
}

// ═══════════════════════════════════════════════════════
// XTERM FACTORY
// ═══════════════════════════════════════════════════════
function makeXterm(containerId) {
  const terminal = new Terminal({
    cursorBlink: true, fontSize: 14,
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
    theme: { background:'#0d1117',foreground:'#c9d1d9',cursor:'#58a6ff',selectionBackground:'#264f78',black:'#0d1117',red:'#ff7b72',green:'#3fb950',yellow:'#d29922',blue:'#58a6ff',magenta:'#bc8cff',cyan:'#39c5cf',white:'#c9d1d9',brightBlack:'#484f58',brightRed:'#ffa198',brightGreen:'#56d364',brightYellow:'#e3b341',brightBlue:'#79c0ff',brightMagenta:'#d2a8ff',brightCyan:'#56d4dd',brightWhite:'#f0f6fc' },
    scrollback: 5000, allowProposedApi: true,
  });
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  return { terminal, fitAddon };
}

// ═══════════════════════════════════════════════════════
// SESSIONS
// ═══════════════════════════════════════════════════════
let modalWorkspace = null;

function openNewSessionDialog() {
  renderSessionPromptSelect();
  $('#session-name-input').value = '';
  modalWorkspace = currentWorkspace;
  updateModalWorkspaceUI();
  $('#code-map-section').style.display = modalWorkspace ? '' : 'none';
  if (modalWorkspace) scanWorkspace(modalWorkspace);
  showDialog($('#new-session-dialog'));
}
$('#btn-new-session').addEventListener('click', openNewSessionDialog);
$('#btn-new-session-header').addEventListener('click', openNewSessionDialog);
$('#btn-welcome-new').addEventListener('click', openNewSessionDialog);
$('#btn-cancel-session').addEventListener('click', () => hideDialog($('#new-session-dialog')));

// Workspace picker in modal
$('#ws-select-folder').addEventListener('click', async () => {
  const f = await window.api.openFolder();
  if (f) { modalWorkspace = f; updateModalWorkspaceUI(); scanWorkspace(f); }
});
$('#ws-create-folder').addEventListener('click', async () => {
  const f = await window.api.openFolder();
  if (f) { modalWorkspace = f; updateModalWorkspaceUI(); scanWorkspace(f); }
});
$('#ws-clear-btn').addEventListener('click', () => {
  modalWorkspace = null; updateModalWorkspaceUI();
  $('#code-map-section').style.display = 'none';
});

function updateModalWorkspaceUI() {
  const el = $('#ws-selected-path');
  const txt = $('#ws-path-text');
  const btn = $('#ws-clear-btn');
  if (modalWorkspace) {
    el.classList.add('has-path'); txt.textContent = modalWorkspace;
    btn.classList.remove('hidden');
    if (!$('#session-name-input').value) $('#session-name-input').value = modalWorkspace.split('/').slice(-1)[0];
  } else {
    el.classList.remove('has-path'); txt.textContent = 'No workspace selected';
    btn.classList.add('hidden');
  }
  $('#code-map-section').style.display = modalWorkspace ? '' : 'none';
}

async function scanWorkspace(cwd) {
  const $c = $('#code-map-container');
  $c.innerHTML = '<div class="code-map-loading"><i class="ti ti-loader spinning"></i> Scanning workspace...</div>';
  const result = await window.api.workspaceScan(cwd, 3);
  let html = '<ul class="code-map-tree">';
  for (const item of result.items.slice(0, 100)) {
    const indent = 'padding-left:' + (item.depth * 16 + 4) + 'px';
    if (item.type === 'dir') {
      html += `<li style="${indent}"><i class="ti ti-folder-filled cm-icon folder"></i><span class="cm-name">${item.name}/</span></li>`;
    } else {
      html += `<li style="${indent}"><i class="ti ti-file cm-icon file"></i><span class="cm-name">${item.name}</span><span class="cm-size">${formatSize(item.size)}</span></li>`;
    }
  }
  html += '</ul>';
  html += `<div class="code-map-summary"><span><i class="ti ti-folder"></i> ${result.dirs} dirs</span><span><i class="ti ti-file"></i> ${result.files} files</span></div>`;
  if (result.items.length > 100) html += '<div style="padding:0.3rem 0.5rem;font-size:0.65rem;color:var(--bs-secondary-color)">...and more (showing first 100)</div>';
  $c.innerHTML = html;
}

// Advanced settings toggle
$('#btn-toggle-advanced').addEventListener('click', () => {
  $('#advanced-settings').classList.toggle('hidden');
});

$('#btn-start-session').addEventListener('click', async () => {
  const provider = $('#session-provider').value;
  const promptId = $('#session-prompt-select').value;
  const initialPrompt = promptId ? prompts.find(p => p.id === promptId)?.content : null;
  const name = $('#session-name-input').value.trim() || (PROVIDERS[provider]?.label || provider);
  const cwd = modalWorkspace || currentWorkspace;

  // Update global workspace if modal picked one
  if (modalWorkspace && !currentWorkspace) {
    currentWorkspace = modalWorkspace;
    $('#workspace-label').textContent = cwd.split('/').slice(-1)[0];
    $('#workspace-label').title = cwd;
  }

  const id = 'session-' + Date.now();
  const session = { id, provider, name, status: 'running', alive: true, createdAt: new Date().toISOString(), workspacePath: cwd };
  sessions.push(session);
  hideDialog($('#new-session-dialog'));
  createSessionTerminal(session);
  await window.api.createTerminal({ id, provider, cwd: cwd || undefined, initialPrompt: initialPrompt || undefined });
  switchToSession(id); renderAll(); refreshGit(); refreshAssets();
});

function createSessionTerminal(session) {
  const { terminal, fitAddon } = makeXterm();
  const el = document.createElement('div');
  el.className = 'terminal-instance'; el.id = `term-${session.id}`;
  $('#terminal-pane').appendChild(el);
  terminal.open(el); fitAddon.fit();
  terminal.onData(data => window.api.writeTerminal(session.id, data));
  terminalInstances[session.id] = { terminal, fitAddon, element: el };
  const ro = new ResizeObserver(() => { if (el.classList.contains('active')) { fitAddon.fit(); const d = fitAddon.proposeDimensions(); if (d) window.api.resizeTerminal(session.id, d.cols, d.rows); } });
  ro.observe(el);
}

function switchToSession(id) {
  activeSessionId = id;
  Object.values(terminalInstances).forEach(t => t.element.classList.remove('active'));
  if (terminalInstances[id]) {
    terminalInstances[id].element.classList.add('active');
    $('#welcome-screen').style.display = 'none';
    setTimeout(() => { terminalInstances[id].fitAddon.fit(); terminalInstances[id].terminal.focus(); }, 50);
  }
  renderAll();
}

function killSession(id) {
  window.api.killTerminal(id);
  if (terminalInstances[id]) { terminalInstances[id].terminal.dispose(); terminalInstances[id].element.remove(); delete terminalInstances[id]; }
  sessions = sessions.filter(s => s.id !== id);
  if (activeSessionId === id) {
    activeSessionId = sessions.length > 0 ? sessions[sessions.length - 1].id : null;
    if (activeSessionId) { switchToSession(activeSessionId); return; }
    $('#welcome-screen').style.display = '';
  }
  renderAll();
}

function renderAll() {
  renderSessions(); renderSessionTabs(); renderWorkspaceSection(); renderSubAgentsList();
  updatePanelVisibility();
}

// Hide action center, sub-agents accordion, bottom panels when no session/workspace
function updatePanelVisibility() {
  const hasSession = sessions.length > 0;
  const hasWorkspace = !!currentWorkspace;
  const show = hasSession || hasWorkspace;

  // Action center sidebar — hide completely if no session and no workspace
  $('#action-center').style.display = show ? '' : 'none';

  // Sub-agents accordion — hide if no active session
  $('#subagents-accordion').style.display = hasSession ? '' : 'none';

  // Bottom panels (git, assets) — hide if no workspace
  const bp = document.querySelector('.bottom-panels');
  if (bp) bp.style.display = hasWorkspace ? '' : 'none';

  // Token bar — hide if no session
  const tb = $('#token-bar');
  if (tb) tb.style.display = hasSession ? '' : 'none';

  // Disable spawn/quick agent buttons if no active session
  const noActive = !activeSessionId;
  $('#btn-spawn-agent').disabled = noActive;
  document.querySelectorAll('.quick-agent-chip').forEach(b => b.disabled = noActive);
  $('#btn-new-subagent').disabled = noActive;
}

function createSessionItem(session, nested) {
  const prov = PROVIDERS[session.provider] || { label: session.provider, iconClass: '', tiIcon: 'ti-terminal' };
  const div = document.createElement('div');
  div.className = `session-item${session.id === activeSessionId ? ' active' : ''}${nested ? ' nested' : ''}`;
  const _sc = session.alive ? session.status : 'completed';
  const _ll = session.lastLine ? `<span class="session-last-line">${esc(session.lastLine)}</span>` : '';
  div.innerHTML = `<div class="session-icon ${prov.iconClass}"><i class="ti ${prov.tiIcon}"></i></div>
    <div class="session-info"><span class="session-name">${esc(session.name)}</span>${_ll}</div>
    <div class="session-meta"><span class="status-dot status-${_sc}" title="${_sc}"></span></div>
    <button class="session-close-btn" data-kill="${esc(session.id)}"><i class="ti ti-x"></i></button>`;
  div.addEventListener('click', e => { if (e.target.closest('.session-close-btn')) { killSession(e.target.closest('.session-close-btn').dataset.kill); return; } switchToSession(session.id); });
  div.addEventListener('contextmenu', e => { e.preventDefault(); ctxSessionId = session.id; $('#ctx-menu').style.left = e.clientX + 'px'; $('#ctx-menu').style.top = e.clientY + 'px'; $('#ctx-menu').classList.remove('hidden'); $('#ctx-backdrop').classList.remove('hidden'); });
  return div;
}

function renderSessions() {
  const $c = $('#sessions-container'); $c.innerHTML = '';
  const ws = sessions.filter(s => s.workspacePath === currentWorkspace && currentWorkspace);
  const standalone = sessions.filter(s => !s.workspacePath || s.workspacePath !== currentWorkspace);
  const wsGroup = $('#workspace-section').querySelector('.workspace-group');
  if (wsGroup) { const old = wsGroup.querySelector('.workspace-sessions'); if (old) old.remove(); if (ws.length > 0) { const d = document.createElement('div'); d.className = 'workspace-sessions'; ws.forEach(s => d.appendChild(createSessionItem(s, true))); wsGroup.appendChild(d); } const badge = wsGroup.querySelector('.workspace-badge'); if (badge) badge.textContent = ws.length; }
  if (standalone.length > 0) { const l = document.createElement('div'); l.className = 'section-label'; l.style.padding = '0.4rem 0.75rem'; l.textContent = 'Standalone'; $c.appendChild(l); standalone.forEach(s => $c.appendChild(createSessionItem(s, false))); }
  if (sessions.length === 0) $c.innerHTML = '<div class="empty-sidebar"><p>No active sessions</p></div>';
}

function renderSessionTabs() {
  const $t = $('#session-tabs'); $t.innerHTML = '';
  sessions.forEach(s => {
    const prov = PROVIDERS[s.provider] || { iconClass: '', tiIcon: 'ti-terminal' };
    const tab = document.createElement('button');
    tab.className = `session-tab${s.id === activeSessionId ? ' active' : ''}`;
    tab.dataset.sessionId = s.id;
    const _tsc = s.alive ? s.status : 'completed';
    tab.innerHTML = `<span class="tab-icon ${prov.iconClass}"><i class="ti ${prov.tiIcon}"></i></span><span class="tab-name">${esc(s.name)}</span><span class="tab-status-dot status-dot status-${_tsc}"></span><span class="tab-close" data-close="${esc(s.id)}"><i class="ti ti-x"></i></span>`;
    tab.addEventListener('click', e => { if (e.target.closest('.tab-close')) { killSession(e.target.closest('.tab-close').dataset.close); return; } switchToSession(s.id); });
    $t.appendChild(tab);
  });
}

// Terminal data — NOTE: onTerminalData is handled by token tracking engine below, which also writes to xterm
window.api.onTerminalExit(({ id }) => { const s = sessions.find(s => s.id === id) || subAgents.find(s => s.id === id); if (s) { s.alive = false; s.status = 'completed'; } renderAll(); });

// Context menu
function closeCtxMenu() { $('#ctx-menu').classList.add('hidden'); $('#ctx-backdrop').classList.add('hidden'); ctxSessionId = null; }
$('#ctx-backdrop').addEventListener('click', closeCtxMenu);
$('#ctx-rename').addEventListener('click', () => { if (ctxSessionId) { const s = sessions.find(s => s.id === ctxSessionId); if (s) { const n = prompt('Rename:', s.name); if (n?.trim()) { s.name = n.trim(); renderAll(); } } } closeCtxMenu(); });
$('#ctx-inject').addEventListener('click', () => { if (ctxSessionId && prompts.length > 0) { const tid = ctxSessionId; closeCtxMenu(); const c = prompt('Prompt #:\n' + prompts.map((p,i) => `${i+1}. ${p.title}`).join('\n')); if (c) { const i = parseInt(c,10)-1; if (i >= 0 && i < prompts.length) window.api.writeTerminal(tid, prompts[i].content); } } else closeCtxMenu(); });
$('#ctx-delete').addEventListener('click', () => { if (ctxSessionId) killSession(ctxSessionId); closeCtxMenu(); });

// ═══════════════════════════════════════════════════════
// SUB-AGENTS
// ═══════════════════════════════════════════════════════
let saExpanded = false;
$('#subagents-toggle').addEventListener('click', () => {
  saExpanded = !saExpanded;
  const acc = $('#subagents-accordion');
  acc.classList.toggle('expanded', saExpanded);
  $('#subagents-body').classList.toggle('hidden', !saExpanded);
});

// Layout mode
document.querySelectorAll('.btn-sa-mode').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    document.querySelectorAll('.btn-sa-mode').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const layout = btn.dataset.layout;
    const container = $('#subagents-terminals');
    container.className = 'subagents-terminals' + (layout === 'tabs' ? ' tab-mode' : layout === 'grid' ? ' grid-mode' : '');
  });
});

$('#btn-new-subagent').addEventListener('click', e => { e.stopPropagation(); spawnSubAgent($('#sa-provider').value, 'Sub-Agent', 'Run tasks as instructed.'); });

// Exact replica of desktop-app/electron/suggestions/sub-agent-modes.ts buildModePreamble()
const MODE_ICONS = { sprint: '⚡', architect: '🧠', detective: '🐛', refactor: '🔧', paranoid: '🧪', minimal: '🏌️' };
const MODE_LABELS = { sprint: 'Sprint', architect: 'Architect', detective: 'Detective', refactor: 'Refactor', paranoid: 'Paranoid', minimal: 'Minimal' };
const MODE_CONFIGS = {
  sprint:    { reasoning_depth: 'LOW', verbosity: 'MINIMAL', exploration: 'NONE', speed_priority: 'MAX', risk_tolerance: 'MEDIUM' },
  architect: { reasoning_depth: 'MAX', verbosity: 'STRUCTURED', exploration: 'HIGH', speed_priority: 'LOW', risk_tolerance: 'LOW' },
  detective: { reasoning_depth: 'HIGH', verbosity: 'STRUCTURED', exploration: 'FOCUSED', speed_priority: 'MEDIUM', risk_tolerance: 'ZERO' },
  refactor:  { reasoning_depth: 'MEDIUM', verbosity: 'STRUCTURED', exploration: 'NONE', speed_priority: 'MEDIUM', risk_tolerance: 'LOW' },
  paranoid:  { reasoning_depth: 'MAX', verbosity: 'STRUCTURED', exploration: 'EXTREME', speed_priority: 'LOW', risk_tolerance: 'ZERO' },
  minimal:   { reasoning_depth: 'LOW', verbosity: 'ZERO', exploration: 'NONE', speed_priority: 'MAX', risk_tolerance: 'HIGH' },
};

function getConfigInstructions(cfg) {
  const lines = [];
  switch (cfg.reasoning_depth) {
    case 'LOW': lines.push('- Keep reasoning minimal. Act fast, skip deep analysis.'); break;
    case 'MEDIUM': lines.push('- Use moderate reasoning. Think before acting but don\'t overthink.'); break;
    case 'HIGH': lines.push('- Use deep reasoning. Consider edge cases and implications.'); break;
    case 'MAX': lines.push('- Use maximum reasoning depth. Explore all angles, consider trade-offs, think step-by-step.'); break;
  }
  switch (cfg.verbosity) {
    case 'ZERO': lines.push('- Zero verbosity. Output only code/results, no explanations.'); break;
    case 'MINIMAL': lines.push('- Be extremely concise. One-line status updates only.'); break;
    case 'MEDIUM': lines.push('- Be concise but include key context when helpful.'); break;
    case 'STRUCTURED': lines.push('- Use structured output with headers, bullets, and clear sections.'); break;
  }
  switch (cfg.exploration) {
    case 'NONE': lines.push('- Do NOT explore beyond what is explicitly needed. Zero unnecessary file reads.'); break;
    case 'LOW': lines.push('- Minimal exploration. Only read files directly relevant to the task.'); break;
    case 'FOCUSED': lines.push('- Focused exploration. Read related files but stay on task.'); break;
    case 'MEDIUM': lines.push('- Moderate exploration. Read surrounding code for context.'); break;
    case 'HIGH': lines.push('- Thorough exploration. Read widely to understand the full picture.'); break;
    case 'EXTREME': lines.push('- Explore exhaustively. Leave no stone unturned. Check every relevant path.'); break;
  }
  switch (cfg.speed_priority) {
    case 'LOW': lines.push('- Take your time. Thoroughness over speed.'); break;
    case 'MEDIUM': lines.push('- Balance speed and quality.'); break;
    case 'HIGH': lines.push('- Prioritize speed. Get results quickly.'); break;
    case 'MAX': lines.push('- Maximum speed. Fastest path to results. Skip optional steps.'); break;
  }
  switch (cfg.risk_tolerance) {
    case 'ZERO': lines.push('- Zero risk tolerance. Verify everything. Never assume.'); break;
    case 'LOW': lines.push('- Low risk tolerance. Be cautious, verify important assumptions.'); break;
    case 'MEDIUM': lines.push('- Moderate risk tolerance. Take reasonable risks for faster progress.'); break;
    case 'HIGH': lines.push('- High risk tolerance. Move fast, fix issues if they arise.'); break;
  }
  return lines;
}

function buildModePreamble() {
  const cfg = MODE_CONFIGS[selectedMode];
  return [
    'You are a specialized sub-agent running inside Polpo Control Panel and executed via Claude Code.',
    '',
    `ACTIVE MODE: ${MODE_ICONS[selectedMode]} ${MODE_LABELS[selectedMode]}`,
    'ACTIVE CONFIG:',
    `  reasoning_depth: ${cfg.reasoning_depth}`,
    `  verbosity: ${cfg.verbosity}`,
    `  exploration: ${cfg.exploration}`,
    `  speed_priority: ${cfg.speed_priority}`,
    `  risk_tolerance: ${cfg.risk_tolerance}`,
    '',
    'You MUST strictly follow this configuration:',
    ...getConfigInstructions(cfg),
    '',
    '---',
    '',
  ].join('\n');
}

// Replicates SubAgentManager.spawn() → SessionManager.createSession() → injectPrompt()
// from desktop-app/electron/suggestions/sub-agent-manager.ts
async function spawnSubAgent(provider, title, promptText) {
  const id = 'sa-' + Date.now();
  const userPrompt = promptText;
  const fullPrompt = buildModePreamble() + userPrompt;

  const sa = {
    id,
    provider,
    title,
    userPrompt,
    autoPrompt: fullPrompt,
    status: 'spawning',
    alive: true,
    mode: selectedMode,
  };
  subAgents.push(sa);

  // 1. Expand accordion so DOM container is visible (needed for xterm to render)
  if (!saExpanded) {
    saExpanded = true;
    $('#subagents-accordion').classList.add('expanded');
    $('#subagents-body').classList.remove('hidden');
  }

  // 2. Build the pane DOM — mirrors subagent-pane from session-view.component
  const prov = PROVIDERS[provider] || { tiIcon: 'ti-terminal' };
  const pane = document.createElement('div');
  pane.className = 'subagent-pane';
  pane.id = `sa-pane-${id}`;
  pane.innerHTML = `
    <div class="subagent-pane-header">
      <span class="subagent-pane-title">
        <i class="ti ${prov.tiIcon}"></i> [sub] ${title}
        <span class="subagent-prompt-hint">${userPrompt.substring(0, 60)}${userPrompt.length > 60 ? '...' : ''}</span>
      </span>
      <div class="subagent-pane-actions">
        <span class="subagent-status sa-status-spawning" id="sa-status-${id}">spawning</span>
        <button class="btn-close-subagent" data-sa="${id}"><i class="ti ti-x"></i></button>
      </div>
    </div>
    <div class="subagent-pane-terminal" id="sa-term-${id}"></div>`;
  $('#subagents-terminals').appendChild(pane);
  pane.querySelector('.btn-close-subagent').addEventListener('click', () => killSubAgent(id));

  // 3. Wait for DOM layout — xterm needs a visible, sized container
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => requestAnimationFrame(r));

  // 4. Create xterm instance — same config as terminal-instance.component.ts
  const termEl = pane.querySelector(`#sa-term-${id}`);
  const { terminal, fitAddon } = makeXterm();
  terminal.open(termEl);
  await new Promise(r => requestAnimationFrame(r));
  fitAddon.fit();

  // 5. Wire I/O: user types in xterm → forward to PTY stdin
  terminal.onData(data => window.api.writeTerminal(id, data));
  terminalInstances[id] = { terminal, fitAddon, element: termEl };

  // 6. Auto-resize on container resize — mirrors ResizeObserver in sub-agent-terminal.component
  const ro = new ResizeObserver(() => {
    fitAddon.fit();
    const dims = fitAddon.proposeDimensions();
    if (dims) window.api.resizeTerminal(id, dims.cols, dims.rows);
  });
  ro.observe(termEl);

  // 7. Spawn child session PTY — same as SessionManager.createSession()
  //    The provider CLI (claude/codex/gemini) is spawned as a new PTY process.
  //    isSubAgent=true tells main process to use 2000ms delay + BPM injection
  //    (replicating SubAgentManager.injectPrompt())
  //
  //    Main process will:
  //    - spawn(provider, [], { cols:120, rows:24, cwd: workspace })
  //    - wait 2000ms (for claude-code-cli to initialize)
  //    - write: \x1b[200~ + fullPrompt + \x1b[201~ (bracketed paste)
  //    - wait 300ms
  //    - write: \r (submit)
  await window.api.createTerminal({
    id,
    provider,
    cwd: currentWorkspace || undefined,
    initialPrompt: fullPrompt,
    isSubAgent: true,
  });

  // 8. Send initial resize so PTY has correct dimensions
  setTimeout(() => {
    fitAddon.fit();
    const dims = fitAddon.proposeDimensions();
    if (dims) window.api.resizeTerminal(id, dims.cols, dims.rows);
  }, 200);

  // 9. Update status after provider has had time to initialize (match 2000ms + 300ms delay)
  setTimeout(() => {
    sa.status = 'running';
    const statusEl = document.getElementById(`sa-status-${id}`);
    if (statusEl) {
      statusEl.textContent = 'running';
      statusEl.className = 'subagent-status sa-status-running';
    }
  }, 2500);

  renderAll();
}

function killSubAgent(id) {
  window.api.killTerminal(id);
  if (terminalInstances[id]) { terminalInstances[id].terminal.dispose(); delete terminalInstances[id]; }
  const pane = document.getElementById(`sa-pane-${id}`);
  if (pane) pane.remove();
  subAgents = subAgents.filter(s => s.id !== id);
  renderAll();
}

function renderSubAgentsList() {
  $('#sa-count').textContent = subAgents.length;
  $('#sa-active-count').textContent = subAgents.length;
  const list = $('#active-agents-list');
  list.innerHTML = '';
  if (subAgents.length === 0) { list.innerHTML = '<div style="padding:0.5rem;font-size:0.72rem;color:var(--bs-secondary-color)">No active agents</div>'; return; }
  subAgents.forEach(sa => {
    const div = document.createElement('div');
    div.className = 'agent-card';
    div.innerHTML = `<div class="agent-card-info"><span class="agent-card-icon"><i class="ti ti-cpu"></i></span><span class="agent-card-name">${sa.title}</span></div>
      <span class="agent-card-status sa-status-${sa.status}">${sa.status}</span>
      <div class="agent-card-actions"><button class="btn-agent-close" data-sa="${sa.id}"><i class="ti ti-x"></i></button></div>`;
    div.querySelector('.btn-agent-close').addEventListener('click', () => killSubAgent(sa.id));
    list.appendChild(div);
  });
}

// Spawn button in action center
$('#btn-spawn-agent').addEventListener('click', () => {
  const provider = $('#sa-provider').value;
  const promptText = $('#sa-prompt').value.trim();
  if (!promptText) return;
  spawnSubAgent(provider, 'Agent', promptText);
  $('#sa-prompt').value = '';
});

// Quick agents
document.querySelectorAll('.quick-agent-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.agent;
    const qa = QUICK_AGENTS[key];
    if (qa) spawnSubAgent('claude', qa.title, qa.prompt);
  });
});

// Mode selector
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedMode = btn.dataset.mode;
  });
});

// ═══════════════════════════════════════════════════════
// GIT PANEL
// ═══════════════════════════════════════════════════════
let gitExpanded = false;
$('#git-toggle').addEventListener('click', () => {
  gitExpanded = !gitExpanded;
  $('#git-accordion').classList.toggle('expanded', gitExpanded);
  $('#git-body').classList.toggle('hidden', !gitExpanded);
  if (gitExpanded) refreshGit();
});

async function refreshGit() {
  if (!currentWorkspace) return;
  const r = await window.api.gitStatus(currentWorkspace);
  if (!r.ok) return;
  $('#git-branch').textContent = r.branch || '—';
  $('#git-badge').textContent = r.files.length;
  const $f = $('#git-files'); $f.innerHTML = '';
  if (r.files.length === 0) { $f.innerHTML = '<div style="padding:0.5rem 0.75rem;font-size:0.72rem;color:#3fb950"><i class="ti ti-check"></i> Working tree clean</div>'; return; }
  r.files.forEach(f => {
    const d = document.createElement('div'); d.className = 'git-file';
    d.innerHTML = `<span class="git-file-status ${f.status}">${f.statusCode.trim() || f.status[0].toUpperCase()}</span><span class="git-file-path">${f.path}</span>${f.staged ? '<span class="git-file-staged"><i class="ti ti-check"></i></span>' : ''}`;
    $f.appendChild(d);
  });
}

$('#git-refresh').addEventListener('click', e => { e.stopPropagation(); refreshGit(); });

$('#git-stage-all').addEventListener('click', async () => {
  if (!currentWorkspace) return;
  await window.api.gitStageAll(currentWorkspace); refreshGit();
});

$('#git-commit-btn').addEventListener('click', async () => {
  const msg = $('#commit-msg').value.trim();
  if (!msg || !currentWorkspace) return;
  const r = await window.api.gitCommit(currentWorkspace, msg);
  $('#git-feedback').innerHTML = r.ok ? '<span class="git-feedback-ok"><i class="ti ti-check"></i> Committed</span>' : `<span class="git-feedback-err">${r.error}</span>`;
  if (r.ok) { $('#commit-msg').value = ''; refreshGit(); }
  setTimeout(() => { $('#git-feedback').innerHTML = ''; }, 3000);
});

$('#git-ai-msg').addEventListener('click', () => {
  if (!activeSessionId || !currentWorkspace) return;
  const aiPrompt = `Generate a concise git commit message for the staged changes in this repository. The working directory is: ${currentWorkspace}. Use conventional commit format. Only output the commit message, nothing else.`;
  window.api.writeTerminal(activeSessionId, aiPrompt);
});

$('#git-pull').addEventListener('click', async e => { e.stopPropagation(); if (!currentWorkspace) return; const r = await window.api.gitPull(currentWorkspace); $('#git-feedback').innerHTML = r.ok ? '<span class="git-feedback-ok">Pulled</span>' : `<span class="git-feedback-err">${r.error}</span>`; refreshGit(); setTimeout(() => { $('#git-feedback').innerHTML = ''; }, 3000); });
$('#git-push').addEventListener('click', async e => { e.stopPropagation(); if (!currentWorkspace) return; const r = await window.api.gitPush(currentWorkspace); $('#git-feedback').innerHTML = r.ok ? '<span class="git-feedback-ok">Pushed</span>' : `<span class="git-feedback-err">${r.error}</span>`; setTimeout(() => { $('#git-feedback').innerHTML = ''; }, 3000); });

// ═══════════════════════════════════════════════════════
// ASSETS PANEL
// ═══════════════════════════════════════════════════════
let assetsExpanded = false;
$('#assets-toggle').addEventListener('click', () => {
  assetsExpanded = !assetsExpanded;
  $('#assets-panel').classList.toggle('expanded', assetsExpanded);
  $('#assets-body').classList.toggle('hidden', !assetsExpanded);
  if (assetsExpanded) refreshAssets();
});

async function refreshAssets() {
  if (!currentWorkspace) return;
  const list = await window.api.assetsList(currentWorkspace);
  $('#assets-badge').textContent = list.length;
  const $g = $('#assets-grid'); $g.innerHTML = '';
  if (list.length === 0) { $g.innerHTML = '<div class="assets-empty"><i class="ti ti-files" style="font-size:24px;display:block;margin-bottom:4px"></i>No assets. Upload files to get started.</div>'; return; }
  for (const a of list) {
    const card = document.createElement('div'); card.className = 'asset-card';
    let preview = `<div class="asset-preview"><i class="ti ti-file"></i></div>`;
    if (a.isImage) {
      const url = await window.api.assetsReadImage(currentWorkspace, a.name);
      preview = `<div class="asset-preview"><img src="${url}" alt="${a.name}" /></div>`;
    }
    card.innerHTML = `${preview}<div class="asset-info"><div class="asset-name">${a.name}</div><div class="asset-size">${formatSize(a.size)}</div></div><button class="asset-delete" data-name="${a.name}"><i class="ti ti-x"></i></button>`;
    card.querySelector('.asset-delete').addEventListener('click', async e => { e.stopPropagation(); await window.api.assetsDelete(currentWorkspace, a.name); refreshAssets(); });
    $g.appendChild(card);
  }
}

function formatSize(b) { if (b < 1024) return b + ' B'; if (b < 1048576) return (b/1024).toFixed(1) + ' KB'; return (b/1048576).toFixed(1) + ' MB'; }

$('#assets-upload').addEventListener('click', async e => { e.stopPropagation(); if (!currentWorkspace) return; await window.api.assetsUpload(currentWorkspace); refreshAssets(); });
$('#assets-open-folder').addEventListener('click', e => { e.stopPropagation(); if (currentWorkspace) window.api.assetsOpenFolder(currentWorkspace); });

function generateAssetPrompt(mode) {
  if (!activeSessionId) return;
  const prompts = { analyze: 'Analyze the files in .polpo-assets/. Understand their content, identify issues, and propose solutions.', debug: 'Debug the files in .polpo-assets/. Perform root cause analysis and suggest step-by-step fixes.', explain: 'Explain the files in .polpo-assets/. Describe components, relationships, and how they work together.' };
  window.api.writeTerminal(activeSessionId, prompts[mode] || '');
}
$('#assets-analyze').addEventListener('click', () => generateAssetPrompt('analyze'));
$('#assets-debug').addEventListener('click', () => generateAssetPrompt('debug'));
$('#assets-explain').addEventListener('click', () => generateAssetPrompt('explain'));

// ═══════════════════════════════════════════════════════
// ACTION CENTER (right sidebar) — toggle collapse
// ═══════════════════════════════════════════════════════
let actionCollapsed = false;
$('#action-toggle').addEventListener('click', () => {
  actionCollapsed = !actionCollapsed;
  $('#action-center').classList.toggle('collapsed', actionCollapsed);
});

// ═══════════════════════════════════════════════════════
// PROMPTS
// ═══════════════════════════════════════════════════════
$('#btn-new-prompt').addEventListener('click', () => { editingPromptId = null; $('#prompt-editor-title').innerHTML = '<i class="ti ti-book dialog-icon"></i> New Prompt'; $('#prompt-title-input').value = ''; $('#prompt-content-input').value = ''; showDialog($('#prompt-editor-dialog')); });
$('#btn-cancel-prompt').addEventListener('click', () => hideDialog($('#prompt-editor-dialog')));
$('#btn-save-prompt').addEventListener('click', async () => {
  const title = $('#prompt-title-input').value.trim(), content = $('#prompt-content-input').value.trim();
  if (!title || !content) return;
  if (editingPromptId) { const p = prompts.find(p => p.id === editingPromptId); if (p) { p.title = title; p.content = content; } }
  else prompts.push({ id: 'prompt-' + Date.now(), title, content });
  await window.api.savePrompts(prompts); hideDialog($('#prompt-editor-dialog')); renderPrompts(); renderSessionPromptSelect();
});

function editPrompt(id) { const p = prompts.find(p => p.id === id); if (!p) return; editingPromptId = id; $('#prompt-editor-title').innerHTML = '<i class="ti ti-book dialog-icon"></i> Edit Prompt'; $('#prompt-title-input').value = p.title; $('#prompt-content-input').value = p.content; showDialog($('#prompt-editor-dialog')); }
async function deletePrompt(id) { prompts = prompts.filter(p => p.id !== id); await window.api.savePrompts(prompts); renderPrompts(); renderSessionPromptSelect(); }
function injectPromptToActive(id) { if (!activeSessionId) return; const p = prompts.find(p => p.id === id); if (p) window.api.writeTerminal(activeSessionId, p.content); }

function renderPrompts() {
  const $c = $('#prompts-container'); $c.innerHTML = '';
  if (prompts.length === 0) { $c.innerHTML = '<div class="empty-sidebar"><p>No prompts yet</p></div>'; return; }
  prompts.forEach(p => {
    const div = document.createElement('div'); div.className = 'prompt-item';
    div.innerHTML = `<span class="prompt-icon"><i class="ti ti-book"></i></span><span class="prompt-name">${p.title}</span>
      <span class="prompt-actions"><button class="prompt-action-btn" data-edit="${p.id}"><i class="ti ti-pencil"></i></button><button class="prompt-action-btn inject" data-inject="${p.id}"><i class="ti ti-send"></i></button><button class="prompt-action-btn danger" data-delete="${p.id}"><i class="ti ti-trash"></i></button></span>`;
    div.addEventListener('click', e => { const b = e.target.closest('[data-edit],[data-inject],[data-delete]'); if (!b) return; if (b.dataset.edit) editPrompt(b.dataset.edit); else if (b.dataset.inject) injectPromptToActive(b.dataset.inject); else if (b.dataset.delete) deletePrompt(b.dataset.delete); });
    $c.appendChild(div);
  });
}

function renderSessionPromptSelect() {
  const $s = $('#session-prompt-select'); $s.innerHTML = '<option value="">None</option>';
  prompts.forEach(p => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.title; $s.appendChild(o); });
}

// ═══════════════════════════════════════════════════════
// PROMPT SLOTS (Action Center saved prompts)
// ═══════════════════════════════════════════════════════
$('#btn-add-slot').addEventListener('click', () => { $('#slot-label-input').value = ''; $('#slot-body-input').value = ''; showDialog($('#slot-editor-dialog')); });
$('#btn-cancel-slot').addEventListener('click', () => hideDialog($('#slot-editor-dialog')));
$('#btn-save-slot').addEventListener('click', async () => {
  const label = $('#slot-label-input').value.trim(), body = $('#slot-body-input').value.trim();
  if (!label || !body) return;
  slots.push({ id: 'slot-' + Date.now(), label, body });
  await window.api.saveSlots(slots); hideDialog($('#slot-editor-dialog')); renderSlots();
});

function renderSlots() {
  const $l = $('#slots-list'); $l.innerHTML = '';
  if (slots.length === 0) { $l.innerHTML = '<div class="slots-empty">No prompt slots. Add one to inject prompts quickly.</div>'; return; }
  slots.forEach(s => {
    const d = document.createElement('div'); d.className = 'slot-card';
    d.innerHTML = `<div class="slot-card-row"><span class="slot-icon"><i class="ti ti-bookmark"></i></span><div class="slot-info"><div class="slot-label">${s.label}</div></div>
      <div class="slot-card-actions">
        <button class="btn-run" title="Run in terminal" data-run="${s.id}"><i class="ti ti-player-play"></i></button>
        <button class="btn-run-spawn" title="Spawn as agent" data-spawn="${s.id}"><i class="ti ti-cpu"></i></button>
        <button class="btn-slot-delete" title="Delete" data-del="${s.id}"><i class="ti ti-trash"></i></button>
      </div></div>`;
    d.querySelector('[data-run]').addEventListener('click', () => { if (activeSessionId) window.api.writeTerminal(activeSessionId, s.body); });
    d.querySelector('[data-spawn]').addEventListener('click', () => spawnSubAgent('claude', s.label, s.body));
    d.querySelector('[data-del]').addEventListener('click', async () => { slots = slots.filter(x => x.id !== s.id); await window.api.saveSlots(slots); renderSlots(); });
    $l.appendChild(d);
  });
}

// ═══════════════════════════════════════════════════════
// STATUS DETECTOR ENGINE (Sprint 3)
// Reads PTY output stream, detects CC interaction state.
// ═══════════════════════════════════════════════════════

const statusBuffers = {};   // rolling 512-char window per session (ANSI-stripped)
const stuckTimers = {};     // stuck detection timeout handles

const ANSI_RE = /\x1b\[[0-9;]*[mGKHFABCDST]|\x1b\].*?\x07|\x1b[()][AB012]/g;
function stripAnsi(s) { return s.replace(ANSI_RE, ''); }

const INPUT_NEEDED_PATTERNS = [
  /do you want/i, /would you like/i, /press enter/i,
  /\(y\/n\)/i, /\[y\/n\]/i, /\[Y\/n\]/i, /\[y\/N\]/i,
  /continue\?/i, /proceed\?/i, /are you sure/i,
  /^\s*>\s*$/m,
];

function detectAndUpdateStatus(sessionId, data) {
  if (!statusBuffers[sessionId]) statusBuffers[sessionId] = '';
  statusBuffers[sessionId] = (statusBuffers[sessionId] + stripAnsi(data)).slice(-512);
  const buf = statusBuffers[sessionId];

  const session = sessions.find(s => s.id === sessionId) || subAgents.find(s => s.id === sessionId);
  if (!session || !session.alive) return;

  // Track last meaningful output line for session subtitle
  const lines = buf.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length > 0) session.lastLine = lines[lines.length - 1].slice(0, 60);

  // Reset stuck timer on any output activity
  clearTimeout(stuckTimers[sessionId]);

  if (INPUT_NEEDED_PATTERNS.some(p => p.test(buf))) {
    setSessionStatus(session, 'input-needed');
    return;
  }

  setSessionStatus(session, 'running');
  stuckTimers[sessionId] = setTimeout(() => {
    const s = sessions.find(s => s.id === sessionId) || subAgents.find(s => s.id === sessionId);
    if (s && s.alive && s.status === 'running') { setSessionStatus(s, 'stuck'); renderAll(); }
  }, 30000);
}

function setSessionStatus(session, newStatus) {
  if (session.status === newStatus) return;
  session.status = newStatus;
  const tab = document.querySelector(`.session-tab[data-session-id="${session.id}"]`);
  if (tab) { tab.classList.add('tab-flash'); setTimeout(() => tab.classList.remove('tab-flash'), 600); }
  renderAll();
}

// ═══════════════════════════════════════════════════════
// TOKEN EFFICIENCY ENGINE (local tracking)
// ═══════════════════════════════════════════════════════

const tokenStats = {
  totalUsed: 0,
  totalBaseline: 0,
  totalSaved: 0,
  perSession: {},
  optimizations: {
    context_injection: { name: 'Smart Context', icon: 'ti-map', saved: 0, hits: 0, description: 'Injects only relevant context instead of full files' },
    cache: { name: 'Context Cache', icon: 'ti-database', saved: 0, hits: 0, description: 'Caches repeated context between prompts' },
    dedup: { name: 'Prompt Dedup', icon: 'ti-copy', saved: 0, hits: 0, description: 'Deduplicates repeated prompt fragments' },
    batch_reads: { name: 'Batch Reads', icon: 'ti-layers-intersect', saved: 0, hits: 0, description: 'Batches multiple file reads into single operations' },
  },
};

// Estimate tokens from terminal output (rough: 1 token ~= 4 chars)
function estimateTokens(text) { return Math.ceil(text.length / 4); }

const tokenOutputBuffer = {};

// Single onTerminalData handler: writes to xterm + tracks tokens
function trackTokens(sessionId, data) {
    if (!tokenOutputBuffer[sessionId]) tokenOutputBuffer[sessionId] = { chars: 0, prompts: 0 };
    tokenOutputBuffer[sessionId].chars += data.length;

    // Every ~2000 chars, consider it a "prompt response"
    if (tokenOutputBuffer[sessionId].chars > 2000) {
      const used = estimateTokens(data) + Math.floor(tokenOutputBuffer[sessionId].chars / 4);
      const overhead = 4000; // base overhead per prompt
      const baseline = used + overhead;

      // Simulate some optimizations
      const contextSaved = Math.floor(overhead * 0.3);
      const cacheSaved = tokenOutputBuffer[sessionId].prompts > 0 ? Math.floor(used * 0.15) : 0;
      const totalSaved = contextSaved + cacheSaved;

      tokenStats.totalUsed += used;
      tokenStats.totalBaseline += baseline;
      tokenStats.totalSaved += totalSaved;

      if (contextSaved > 0) { tokenStats.optimizations.context_injection.saved += contextSaved; tokenStats.optimizations.context_injection.hits++; }
      if (cacheSaved > 0) { tokenStats.optimizations.cache.saved += cacheSaved; tokenStats.optimizations.cache.hits++; }

      if (!tokenStats.perSession[sessionId]) tokenStats.perSession[sessionId] = { used: 0, baseline: 0, saved: 0, prompts: 0 };
      tokenStats.perSession[sessionId].used += used;
      tokenStats.perSession[sessionId].baseline += baseline;
      tokenStats.perSession[sessionId].saved += totalSaved;
      tokenStats.perSession[sessionId].prompts++;

      tokenOutputBuffer[sessionId].chars = 0;
      tokenOutputBuffer[sessionId].prompts++;

      updateTokenBar();
    }
  }

// Single terminal data handler: write to xterm + track tokens + detect status
window.api.onTerminalData(({ id, data }) => {
  if (terminalInstances[id]) terminalInstances[id].terminal.write(data);
  trackTokens(id, data);
  detectAndUpdateStatus(id, data);
});

function updateTokenBar() {
  const eff = tokenStats.totalBaseline > 0 ? Math.round((tokenStats.totalSaved / tokenStats.totalBaseline) * 100) : 0;
  $('#t-used').textContent = fmtNum(tokenStats.totalUsed);
  $('#t-baseline').textContent = fmtNum(tokenStats.totalBaseline);
  $('#t-saved').textContent = '-' + fmtNum(tokenStats.totalSaved);
  $('#t-efficiency').textContent = eff + '%';

  // Show active optimization flags
  $('#flag-context').style.display = tokenStats.optimizations.context_injection.hits > 0 ? '' : 'none';
  $('#flag-cache').style.display = tokenStats.optimizations.cache.hits > 0 ? '' : 'none';
  $('#flag-dedup').style.display = tokenStats.optimizations.dedup.hits > 0 ? '' : 'none';
  $('#flag-batch').style.display = tokenStats.optimizations.batch_reads.hits > 0 ? '' : 'none';
}

function fmtNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

function fmtNumExact(n) { return n.toLocaleString(); }

// Token bar click -> open modal
$('#token-bar').addEventListener('click', () => {
  $('#token-modal-backdrop').classList.remove('hidden');
  $('#token-modal').classList.remove('hidden');
  renderTokenModal();
});

$('#token-modal-close').addEventListener('click', closeTokenModal);
$('#token-modal-backdrop').addEventListener('click', closeTokenModal);

function closeTokenModal() {
  $('#token-modal-backdrop').classList.add('hidden');
  $('#token-modal').classList.add('hidden');
}

function renderTokenModal() {
  const eff = tokenStats.totalBaseline > 0 ? ((tokenStats.totalSaved / tokenStats.totalBaseline) * 100).toFixed(1) : '0.0';

  $('#tm-used').textContent = fmtNumExact(tokenStats.totalUsed);
  $('#tm-baseline').textContent = fmtNumExact(tokenStats.totalBaseline);
  $('#tm-saved').textContent = '-' + fmtNumExact(tokenStats.totalSaved);
  $('#tm-efficiency').textContent = eff + '%';

  // Breakdown
  const fileReads = Math.floor(tokenStats.totalBaseline * 0.4);
  const toolSchemas = Math.floor(tokenStats.totalBaseline * 0.15);
  const context = tokenStats.totalBaseline - fileReads - toolSchemas;
  const total = tokenStats.totalBaseline || 1;

  $('#tm-file-reads').textContent = fmtNumExact(fileReads);
  $('#tm-file-pct').textContent = Math.round((fileReads / total) * 100) + '%';
  $('#tm-tool-schemas').textContent = fmtNumExact(toolSchemas);
  $('#tm-tool-pct').textContent = Math.round((toolSchemas / total) * 100) + '%';
  $('#tm-context').textContent = fmtNumExact(context);
  $('#tm-ctx-pct').textContent = Math.round((context / total) * 100) + '%';
  $('#tm-total-baseline').innerHTML = '<strong>' + fmtNumExact(tokenStats.totalBaseline) + '</strong>';

  // Optimizations
  const $opt = $('#tm-optimizations');
  $opt.innerHTML = '';
  const maxSaved = Math.max(...Object.values(tokenStats.optimizations).map(o => o.saved), 1);

  for (const [key, opt] of Object.entries(tokenStats.optimizations)) {
    if (opt.hits === 0) continue;
    const barW = Math.round((opt.saved / maxSaved) * 100);
    $opt.innerHTML += `<div class="opt-engine">
      <span class="opt-icon"><i class="ti ${opt.icon}"></i></span>
      <span class="opt-name">${opt.name}</span>
      <span class="opt-saved">-${fmtNum(opt.saved)}</span>
      <span style="font-size:0.6rem;color:var(--bs-secondary-color)">${opt.hits} hits</span>
      <div class="opt-bar"><div class="opt-bar-fill" style="width:${barW}%"></div></div>
    </div>`;
  }

  if ($opt.innerHTML === '') {
    $opt.innerHTML = '<div style="padding:0.5rem;font-size:0.72rem;color:var(--bs-secondary-color)">No optimizations triggered yet</div>';
  }

  // Per-session history
  const $hist = $('#tm-history');
  $hist.innerHTML = '';
  for (const [sid, st] of Object.entries(tokenStats.perSession)) {
    const s = sessions.find(s => s.id === sid) || subAgents.find(s => s.id === sid);
    const name = s ? s.name || s.title : sid;
    const sessEff = st.baseline > 0 ? Math.round((st.saved / st.baseline) * 100) : 0;
    $hist.innerHTML += `<div class="th-item">
      <span class="th-name">${name}</span>
      <span class="th-tokens">${fmtNum(st.used)} used</span>
      <span class="th-eff">${sessEff}%</span>
    </div>`;
  }

  if ($hist.innerHTML === '') {
    $hist.innerHTML = '<div style="padding:0.5rem;font-size:0.72rem;color:var(--bs-secondary-color)">No session data yet</div>';
  }
}

// ═══════════════════════════════════════════════════════
// EXTERNAL SPAWN (Sprint 4)
// Receives POST /spawn from local HTTP server on port 9977.
// ═══════════════════════════════════════════════════════
window.api.onSpawnExternal(({ task, cwd, mode, provider }) => {
  if (mode && MODE_CONFIGS[mode]) {
    selectedMode = mode;
    document.querySelectorAll('.mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
  }
  if (cwd) {
    currentWorkspace = cwd;
    $('#workspace-label').textContent = cwd.split('/').slice(-1)[0];
    $('#workspace-label').title = cwd;
    renderWorkspaceSection(); refreshGit(); refreshAssets();
  }
  const title = task.slice(0, 40) + (task.length > 40 ? '…' : '');
  spawnSubAgent(provider || 'claude', title, task);
});

// ═══════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════
init();
