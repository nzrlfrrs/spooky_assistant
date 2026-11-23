const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ghostAPI', {
  // Window & Movement
  getWindowPos: () => ipcRenderer.invoke('get-window-pos'),
  setWindowPos: (pos) => ipcRenderer.send('set-window-pos', pos),
  setWindowMode: (mode) => ipcRenderer.send('set-window-mode', mode),
  setIgnoreMouseEvents: (ignore, options) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore, options);
  },
  onExpandDashboard: (callback) => {
    const sub = () => callback();
    ipcRenderer.on('expand-dashboard', sub);
    return () => ipcRenderer.removeListener('expand-dashboard', sub);
  },
  closeApp: () => ipcRenderer.send('app-close'),
  minimizeApp: () => ipcRenderer.send('app-minimize'),
  getVersion: () => ipcRenderer.invoke('get-version'),

  // Tasks & Reminders
  getTasks: () => ipcRenderer.invoke('task-get'),
  addTask: (data) => ipcRenderer.invoke('task-add', data),
  toggleTask: (id) => ipcRenderer.invoke('task-toggle', id),
  updateTask: (id, updates) => ipcRenderer.invoke('task-update', { id, updates }),
  deleteTask: (id) => ipcRenderer.invoke('task-delete', id),
  parseTaskWithAI: (text) => ipcRenderer.invoke('task-parse-ai', text),
  syncGoogleCalendar: (customUrl) => ipcRenderer.invoke('gcal-sync', customUrl),
  openInGoogleCalendar: (task) => ipcRenderer.invoke('gcal-open-add', task),
  onTaskReminder: (callback) => {
    const sub = (event, data) => callback(data);
    ipcRenderer.on('task-reminder', sub);
    return () => ipcRenderer.removeListener('task-reminder', sub);
  },

  // Live Meeting Notetaker
  generateMeetingMoM: (transcript) => ipcRenderer.invoke('meeting-generate-mom', transcript),
  analyzeMeetingAudio: (audioBase64, mimeType) =>
    ipcRenderer.invoke('meeting-analyze-audio', { audioBase64, mimeType }),
  saveMeetingFile: (markdown, filename) =>
    ipcRenderer.invoke('meeting-save-file', { markdown, filename }),
  openFilePath: (filePath) => ipcRenderer.invoke('open-file-path', filePath),
  showFileInFolder: (filePath) => ipcRenderer.invoke('show-file-in-folder', filePath),

  // AI Chat & Jarvis Voice Commands
  askAI: (query, history = []) => ipcRenderer.invoke('ai-ask', { query, history }),
  jarvisProcessAudio: (audioBase64, mimeType) =>
    ipcRenderer.invoke('jarvis-process-audio', { audioBase64, mimeType }),
  synthesizeTTS: (text) => ipcRenderer.invoke('tts-synthesize', text),
  jarvisSetPaused: (paused) => ipcRenderer.send('jarvis-set-paused', paused),
  onJarvisWake: (callback) => {
    const sub = (event, data) => callback(data);
    ipcRenderer.on('jarvis-wake', sub);
    return () => ipcRenderer.removeListener('jarvis-wake', sub);
  },

  // Config
  getConfig: () => ipcRenderer.invoke('config-get'),
  saveConfig: (cfg) => ipcRenderer.invoke('config-save', cfg)
});
