const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Prompts
  loadPrompts: () => ipcRenderer.invoke('prompts:load'),
  savePrompts: (p) => ipcRenderer.invoke('prompts:save', p),

  // Slots (action center)
  loadSlots: () => ipcRenderer.invoke('slots:load'),
  saveSlots: (s) => ipcRenderer.invoke('slots:save', s),

  // Folder
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),

  // Terminal
  createTerminal: (opts) => ipcRenderer.invoke('terminal:create', opts),
  writeTerminal: (id, data) => ipcRenderer.invoke('terminal:write', { id, data }),
  resizeTerminal: (id, cols, rows) => ipcRenderer.invoke('terminal:resize', { id, cols, rows }),
  killTerminal: (id) => ipcRenderer.invoke('terminal:kill', { id }),
  onTerminalData: (cb) => ipcRenderer.on('terminal:data', (_e, p) => cb(p)),
  onTerminalExit: (cb) => ipcRenderer.on('terminal:exit', (_e, p) => cb(p)),

  // Workspace scan
  workspaceScan: (cwd, maxDepth) => ipcRenderer.invoke('workspace:scan', { cwd, maxDepth }),

  // Git
  gitStatus: (cwd) => ipcRenderer.invoke('git:status', { cwd }),
  gitStageAll: (cwd) => ipcRenderer.invoke('git:stageAll', { cwd }),
  gitStage: (cwd, filepath) => ipcRenderer.invoke('git:stage', { cwd, filepath }),
  gitCommit: (cwd, message) => ipcRenderer.invoke('git:commit', { cwd, message }),
  gitDiff: (cwd, filepath) => ipcRenderer.invoke('git:diff', { cwd, filepath }),
  gitLog: (cwd, count) => ipcRenderer.invoke('git:log', { cwd, count }),
  gitPull: (cwd) => ipcRenderer.invoke('git:pull', { cwd }),
  gitPush: (cwd) => ipcRenderer.invoke('git:push', { cwd }),

  // Assets
  assetsList: (cwd) => ipcRenderer.invoke('assets:list', { cwd }),
  assetsUpload: (cwd) => ipcRenderer.invoke('assets:upload', { cwd }),
  assetsDelete: (cwd, name) => ipcRenderer.invoke('assets:delete', { cwd, name }),
  assetsRename: (cwd, oldName, newName) => ipcRenderer.invoke('assets:rename', { cwd, oldName, newName }),
  assetsReadImage: (cwd, name) => ipcRenderer.invoke('assets:readImage', { cwd, name }),
  assetsOpenFolder: (cwd) => ipcRenderer.invoke('assets:openFolder', { cwd }),
});
