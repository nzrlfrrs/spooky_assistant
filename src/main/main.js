const { app, BrowserWindow, ipcMain, screen, nativeImage, Tray, Menu, shell, globalShortcut, desktopCapturer } = require('electron');
const fs = require('fs');
const path = require('path');
const TaskManager = require('./taskManager');
const AIEngine = require('./aiEngine');
const ConfigManager = require('./configManager');
const JarvisController = require('./jarvisController');
const { fetchGoogleCalendarEvents, buildGoogleCalendarAddUrl } = require('./calendarSync');

// Prevent GPU cache lock contention
app.commandLine.appendSwitch('disable-gpu-cache');
app.commandLine.appendSwitch('disable-http-cache');

let mainWindow = null;
let taskManager = null;
let jarvis = null;
let tray = null;
let currentWindowMode = 'compact'; // 'compact' | 'expanded'

function createDummyTrayIcon() {
  const iconBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAA0SURBVDhPY2AYBeMAsgQGB4f/UIwN4FI86v6PA5BhGDB4uNEMgBvG4fT/j0M/YfD/0QxAAQBwWw9R1j2+kAAAAABJRU5ErkJggg==';
  return nativeImage.createFromDataURL(iconBase64);
}

function applyAutoStart(enabled) {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      path: process.execPath,
      args: app.isPackaged ? [] : [app.getAppPath()]
    });
  } catch (err) {
    console.warn('[AutoStart] Failed to update login item:', err.message);
  }
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  const winWidth = 460;
  const winHeight = 680;

  // Initial placement at bottom right above taskbar
  const posX = Math.max(0, screenWidth - winWidth - 25);
  const posY = Math.max(0, screenHeight - winHeight - 25);

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: posX,
    y: posY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  // Initialize TaskManager
  taskManager = new TaskManager(path.join(__dirname, '../../tasks.json'));
  taskManager.on('reminder', (reminder) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.webContents.send('task-reminder', reminder);
    }
  });

  // Initialize Jarvis Hands-Free Wake Word Listener ("Spooky")
  jarvis = new JarvisController();
  jarvis.on('wake', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('jarvis-wake', data);
    }
  });
  const cfg = ConfigManager.getConfig();
  if (cfg.jarvisHandsFree !== false) {
    jarvis.startWakeListener();
  }
  applyAutoStart(!!cfg.autoStart);

  // Tray setup
  try {
    const icon = createDummyTrayIcon();
    tray = new Tray(icon);
    updateTrayMenu();
    tray.setToolTip('Spooky - Mini Ghost AI Assistant & Notetaker');
  } catch (err) {
    console.warn('[Tray] Failed to initialize tray:', err.message);
  }
}

function toggleWindowVisibility() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isVisible()) mainWindow.hide();
  else mainWindow.show();
}

function resetGhostPosition() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const [w, h] = mainWindow.getSize();
  mainWindow.setPosition(Math.max(0, width - w - 25), Math.max(0, height - h - 25));
  if (!mainWindow.isVisible()) mainWindow.show();
}

function updateTrayMenu() {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Spooky - Smart Ghost Assistant', enabled: false },
    { type: 'separator' },
    {
      label: 'Buka Dashboard',
      click: () => {
        if (mainWindow) {
          if (!mainWindow.isVisible()) mainWindow.show();
          mainWindow.webContents.send('expand-dashboard');
        }
      }
    },
    {
      label: 'Sembunyikan / Munculkan (Ctrl+Shift+H)',
      click: () => toggleWindowVisibility()
    },
    {
      label: 'Posisikan ke Pojok Kanan Bawah',
      click: () => resetGhostPosition()
    },
    { type: 'separator' },
    { label: 'Keluar', click: () => app.quit() }
  ]);
  tray.setContextMenu(contextMenu);
}

ipcMain.on('ghost-context-menu', (event, isPeeking) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const menu = Menu.buildFromTemplate([
    {
      label: 'Buka Dashboard',
      click: () => mainWindow.webContents.send('expand-dashboard')
    },
    {
      label: isPeeking ? 'Munculkan Penuh' : 'Minggir ke Pinggir (Ngintip)',
      click: () => mainWindow.webContents.send('toggle-peek')
    },
    {
      label: 'Sembunyikan ke Tray (Ctrl+Shift+H)',
      click: () => mainWindow.hide()
    },
    {
      label: 'Posisikan ke Pojok Kanan Bawah',
      click: () => resetGhostPosition()
    },
    { type: 'separator' },
    { label: 'Keluar', click: () => app.quit() }
  ]);
  menu.popup({ window: mainWindow });
});

// Window movement handlers
ipcMain.handle('get-window-pos', () => {
  if (mainWindow) return mainWindow.getPosition();
  return [0, 0];
});

ipcMain.on('set-window-pos', (event, { x, y }) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setPosition(Math.round(x), Math.round(y));
  }
});

// Window resize handler (Compact floating ghost vs Expanded dashboard)
ipcMain.on('set-window-mode', (event, mode) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  currentWindowMode = mode;
  // Renderer manages layout smoothly within transparent window bounds
});

// Task Manager IPC Handlers
ipcMain.handle('task-get', () => {
  return taskManager ? taskManager.getTasks() : [];
});

ipcMain.handle('task-add', (event, taskData) => {
  return taskManager ? taskManager.addTask(taskData) : null;
});

ipcMain.handle('task-toggle', (event, id) => {
  return taskManager ? taskManager.toggleTask(id) : null;
});

ipcMain.handle('task-update', (event, { id, updates }) => {
  return taskManager ? taskManager.updateTask(id, updates) : null;
});

ipcMain.handle('task-delete', (event, id) => {
  return taskManager ? taskManager.deleteTask(id) : null;
});

ipcMain.handle('task-parse-ai', async (event, text) => {
  return await AIEngine.parseTaskWithAI(text);
});

// Google Calendar Sync Handlers
ipcMain.handle('gcal-sync', async (event, customUrl) => {
  const cfg = ConfigManager.getConfig();
  const url = (customUrl != null ? customUrl : cfg.gcalIcsUrl) || '';
  const res = await fetchGoogleCalendarEvents(url);
  if (!res.success) return res;
  const merged = taskManager ? taskManager.mergeGoogleCalendarEvents(res.events) : { count: 0, tasks: [] };
  return { success: true, count: merged.count, tasks: merged.tasks };
});

ipcMain.handle('gcal-open-add', async (event, task) => {
  const url = buildGoogleCalendarAddUrl(task || {});
  await shell.openExternal(url);
  return { success: true, url };
});

// Meeting Notetaker & AI IPC Handlers
ipcMain.handle('meeting-generate-mom', async (event, transcript) => {
  return await AIEngine.generateMeetingNotes(transcript);
});

ipcMain.handle('meeting-analyze-audio', async (event, { audioBase64, mimeType }) => {
  return await AIEngine.analyzeMeetingAudio(audioBase64, mimeType);
});

ipcMain.handle('meeting-save-file', (event, { markdown, filename, folder = 'notulensi' }) => {
  try {
    const safeFolder = folder === 'catatan_kelas' ? 'catatan_kelas' : 'notulensi';
    const dir = path.join(__dirname, '../../', safeFolder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safeName = (filename || `Catatan_${Date.now()}.md`).replace(/[<>:"/\\|?*]/g, '_');
    const fullPath = path.join(dir, safeName);
    fs.writeFileSync(fullPath, markdown, 'utf8');
    return { success: true, filePath: fullPath, fileName: safeName };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

async function capturePrimaryScreenJpeg() {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1280, height: 720 }
  });
  if (!sources || !sources.length) return null;
  const jpegBuf = sources[0].thumbnail.toJPEG(72);
  return jpegBuf.toString('base64');
}

ipcMain.handle('capture-screen-slide', async () => {
  try {
    const data = await capturePrimaryScreenJpeg();
    if (!data) return { success: false, error: 'Gagal menangkap layar.' };
    const now = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return {
      success: true,
      data,
      time: `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('class-analyze-session', async (event, payload) => {
  return await AIEngine.analyzeClassSession(payload || {});
});

ipcMain.handle('session-transcribe-chunk', async (event, payload) => {
  return await AIEngine.transcribeAudioChunk(payload || {});
});

ipcMain.handle('class-explain-now', async (event, contextText = '') => {
  try {
    const shot = await capturePrimaryScreenJpeg();
    if (!shot) return { reply: 'Gagal menangkap layar kelas saat ini 👻' };
    const reply = await AIEngine.explainScreenNow(shot, contextText);
    return await attachTtsAudio({ reply });
  } catch (err) {
    return { reply: `Gagal menjelaskan layar: ${err.message}` };
  }
});

ipcMain.handle('open-file-path', async (event, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    await shell.openPath(filePath);
    return true;
  }
  return false;
});

ipcMain.handle('show-file-in-folder', (event, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return true;
  }
  return false;
});

function buildTaskSummary() {
  const now = new Date();
  const nowLabel = now.toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  let taskSummary = `Waktu sekarang: ${nowLabel}\n`;
  if (taskManager) {
    const active = taskManager
      .getTasks()
      .filter((t) => !t.completed)
      .sort((a, b) => new Date(`${a.date}T${a.time || '23:59'}:00`) - new Date(`${b.date}T${b.time || '23:59'}:00`))
      .slice(0, 10);
    if (active.length) {
      taskSummary += 'Daftar tugas aktif (diurutkan dari yang paling dekat):\n' +
        active.map((t) =>
          `- "${t.title}" | Tanggal: ${t.date} | Jam: ${t.time || 'bebas'} | Prioritas: ${t.priority}` +
          (t.description ? ` | Catatan: ${t.description.slice(0, 120)}` : '')
        ).join('\n');
    } else {
      taskSummary += 'Daftar tugas aktif: KOSONG (tidak ada tugas atau jadwal apa pun saat ini).';
    }
  }
  return taskSummary;
}

async function attachTtsAudio(res) {
  const cfg = ConfigManager.getConfig();
  if (res && res.reply && cfg.ttsEnabled !== false) {
    try {
      res.ttsAudio = await AIEngine.synthesizeCuteVoice(res.reply);
    } catch {}
  }
  return res;
}

ipcMain.handle('ai-ask', async (event, payload) => {
  const query = typeof payload === 'string' ? payload : payload?.query || '';
  const history = typeof payload === 'object' && Array.isArray(payload?.history) ? payload.history : [];

  const cmd = AIEngine.detectQuickCommand(query);
  if (cmd) {
    let result = { ...cmd };
    if (cmd.intent === 'open_app' || cmd.intent === 'open_url') {
      const execRes = JarvisController.executeSystemAction(cmd.intent, cmd.target);
      if (!execRes.ok && execRes.reason) {
        result = { reply: execRes.reason, intent: 'chat', target: '' };
      }
    }
    return await attachTtsAudio(result);
  }

  const text = await AIEngine.askAI(query, history, buildTaskSummary());
  return await attachTtsAudio({ reply: text, intent: 'chat', target: '' });
});

ipcMain.handle('jarvis-process-audio', async (event, { audioBase64, mimeType }) => {
  const res = await AIEngine.processJarvisAudio(audioBase64, mimeType, buildTaskSummary());
  if (res && (res.intent === 'open_app' || res.intent === 'open_url')) {
    const execRes = JarvisController.executeSystemAction(res.intent, res.target);
    if (!execRes.ok && execRes.reason) {
      res.reply = execRes.reason;
    }
  }
  return await attachTtsAudio(res);
});

ipcMain.on('jarvis-set-paused', (event, paused) => {
  if (jarvis) jarvis.setPaused(paused);
});

ipcMain.handle('tts-synthesize', async (event, text) => {
  return await AIEngine.synthesizeCuteVoice(text);
});

// Config Handlers
ipcMain.handle('config-get', () => {
  return ConfigManager.getConfig();
});

ipcMain.handle('config-save', (event, newConfig) => {
  const saved = ConfigManager.saveConfig(newConfig);
  if (saved && saved.config) {
    if (jarvis) {
      if (saved.config.jarvisHandsFree !== false) jarvis.startWakeListener();
      else jarvis.stopWakeListener();
    }
    applyAutoStart(!!saved.config.autoStart);
  }
  return saved;
});

// Mouse Event Pass-through for transparent Electron window
ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(ignore, options || { forward: true });
  }
});

ipcMain.on('app-close', () => {
  app.quit();
});

ipcMain.on('app-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('get-version', () => {
  return app.getVersion();
});

app.whenReady().then(() => {
  createWindow();

  // Shortcut cadangan global: Ctrl+Shift+S untuk langsung panggil Jarvis dari app mana saja
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.webContents.send('jarvis-wake', { raw: 'HOTKEY' });
    }
  });

  globalShortcut.register('CommandOrControl+Shift+H', () => {
    toggleWindowVisibility();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (jarvis) jarvis.stopWakeListener();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (jarvis) jarvis.stopWakeListener();
});
