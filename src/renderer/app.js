// ========================================================
// Spooky - Renderer
// Tahap 2: hantu & mode | Tahap 3: tugas dinamis, chat, pengaturan
// ========================================================
const api = window.ghostAPI;
const $ = (id) => document.getElementById(id);

// ---------- DOM ----------
const body = document.body;
const compactView = $('compactView');
const dashboardDrawer = $('dashboardDrawer');
const ghostDragArea = $('ghostDragArea');
const ghostMascot = $('ghostMascot');
const eyeLeft = $('eyeLeft');
const eyeRight = $('eyeRight');
const floatingBubble = $('floatingBubble');
const bubbleTitle = $('bubbleTitle');
const bubbleText = $('bubbleText');
const chipStatusText = $('chipStatusText');
const meetingHeadset = $('meetingHeadset');
const headerDragHandle = $('headerDragHandle');
const navTabs = document.querySelectorAll('.nav-tab');
const tabPanes = document.querySelectorAll('.tab-pane');
const tabIndicator = $('tabIndicator');

// ---------- State ----------
let mode = 'compact';
let bubbleTimer = null;
let isMouseDown = false;
let isDragging = false;
let dragStart = { x: 0, y: 0, winX: 0, winY: 0 };
const DRAG_THRESHOLD = 5;

let tasks = [];
let selectedDay = ymd(new Date()); // 'YYYY-MM-DD' | 'all'

// ---------- Util tanggal ----------
function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function dueDate(t) { return new Date(`${t.date}T${t.time || '23:59'}:00`); }
function fmtDur(mins) {
  if (mins < 60) return `${mins} mnt`;
  if (mins < 1440) return `${Math.floor(mins / 60)}j ${mins % 60}m`;
  return `${Math.floor(mins / 1440)} hari`;
}
function countdown(t) {
  if (t.completed) return 'Selesai';
  const mins = Math.round((dueDate(t) - new Date()) / 60000);
  return mins < 0 ? `Telat ${fmtDur(-mins)}` : `${fmtDur(mins)} lagi`;
}
function urgency(t) {
  if (t.completed) return 'done';
  const mins = Math.round((dueDate(t) - new Date()) / 60000);
  if (mins < 0) return 'overdue';
  if (mins < 180) return 'soon';
  return t.priority || 'medium';
}
function timeUsedPct(t) {
  const created = new Date(t.createdAt || Date.now());
  const due = dueDate(t);
  const total = due - created;
  if (total <= 0) return 100;
  return Math.max(0, Math.min(100, ((Date.now() - created) / total) * 100));
}

// ---------- Click-through window transparan ----------
[ghostDragArea, floatingBubble, dashboardDrawer].forEach((el) => {
  el.addEventListener('mouseenter', () => api.setIgnoreMouseEvents(false));
  el.addEventListener('mouseleave', () => {
    if (!isMouseDown) api.setIgnoreMouseEvents(true, { forward: true });
  });
});
api.setIgnoreMouseEvents(true, { forward: true });

// ---------- Bubble hantu ----------
function showBubble(text, title = 'SPOOKY', ms = 6000) {
  bubbleTitle.textContent = title;
  bubbleText.textContent = text;
  floatingBubble.style.display = 'block';
  clearTimeout(bubbleTimer);
  if (ms > 0) bubbleTimer = setTimeout(hideBubble, ms);
}
function hideBubble() {
  floatingBubble.style.display = 'none';
  if (mode === 'compact') api.setIgnoreMouseEvents(true, { forward: true });
}
$('closeBubbleBtn').addEventListener('click', (e) => { e.stopPropagation(); hideBubble(); });

// ---------- Mode: hantu kecil <-> panel terbuka ----------
function setMode(next) {
  mode = next;
  const expanded = next === 'expanded';
  body.className = expanded ? 'mode-expanded' : 'mode-compact';
  dashboardDrawer.style.display = expanded ? 'flex' : 'none';
  api.setWindowMode(next);
  if (expanded) {
    hideBubble();
    refreshHeader();
    loadTasks();
    requestAnimationFrame(moveIndicator);
  } else {
    api.setIgnoreMouseEvents(true, { forward: true });
  }
}
$('collapseDashBtn').addEventListener('click', () => setMode('compact'));
$('closeAppBtn').addEventListener('click', () => api.closeApp());
api.onExpandDashboard(() => setMode('expanded'));

// ---------- Drag & klik hantu ----------
async function beginDrag(e) {
  if (e.button !== 0) return;
  isMouseDown = true;
  isDragging = false;
  const pos = await api.getWindowPos();
  dragStart = { x: e.screenX, y: e.screenY, winX: pos[0], winY: pos[1] };
}
ghostDragArea.addEventListener('mousedown', beginDrag);
headerDragHandle.addEventListener('mousedown', beginDrag);

window.addEventListener('mousemove', (e) => {
  trackEyes(e);
  if (!isMouseDown) return;
  const dx = e.screenX - dragStart.x;
  const dy = e.screenY - dragStart.y;
  if (!isDragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) isDragging = true;
  if (isDragging) api.setWindowPos({ x: dragStart.winX + dx, y: dragStart.winY + dy });
});

window.addEventListener('mouseup', (e) => {
  if (!isMouseDown) return;
  isMouseDown = false;
  const wasClick = !isDragging && e.button === 0;
  isDragging = false;
  if (wasClick && ghostDragArea.contains(e.target)) {
    playPopSound();
    setMode(mode === 'compact' ? 'expanded' : 'compact');
  }
});

// ---------- Mata & kedip ----------
function trackEyes(e) {
  [eyeLeft, eyeRight].forEach((eye) => {
    const r = eye.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const ang = Math.atan2(e.clientY - cy, e.clientX - cx);
    const dist = Math.min(3, Math.hypot(e.clientX - cx, e.clientY - cy) / 40);
    eye.style.transform = `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist}px)`;
  });
}
setInterval(() => {
  ghostMascot.classList.add('blinking');
  setTimeout(() => ghostMascot.classList.remove('blinking'), 160);
}, 3800);

function ghostHappy() {
  ghostMascot.classList.add('happy');
  setTimeout(() => ghostMascot.classList.remove('happy'), 1500);
}

// ---------- Sistem Suara Imut (Efek Suara Hantu Lucu + TTS Cute) ----------
let soundEnabled = true;
let ttsEnabled = true;
api.getConfig().then((cfg) => {
  soundEnabled = cfg.soundEnabled !== false;
  ttsEnabled = cfg.ttsEnabled !== false;
}).catch(() => {});

function playSynthSeq(steps, vol = 0.055) {
  if (!soundEnabled) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    let maxEnd = 0;
    steps.forEach(({ f, fEnd, at, dur, type = 'sine', v }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      const t = ctx.currentTime + at;
      osc.frequency.setValueAtTime(f, t);
      if (fEnd) osc.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
      const peak = v != null ? v : vol;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(peak, t + Math.min(0.015, dur * 0.25));
      gain.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      maxEnd = Math.max(maxEnd, at + dur);
    });
    setTimeout(() => ctx.close(), Math.ceil((maxEnd + 0.15) * 1000));
  } catch {}
}

// Efek kilau imut saat tugas selesai (sparkle bell arpeggio)
function playCheerChime() {
  playSynthSeq([
    { f: 784, fEnd: 880, at: 0, dur: 0.1, type: 'sine', v: 0.05 },
    { f: 1046.5, at: 0.07, dur: 0.12, type: 'triangle', v: 0.055 },
    { f: 1318.5, at: 0.14, dur: 0.13, type: 'sine', v: 0.055 },
    { f: 1568, at: 0.21, dur: 0.16, type: 'sine', v: 0.05 },
    { f: 2093, at: 0.28, dur: 0.26, type: 'sine', v: 0.04 }
  ]);
}

// Efek "bloop!" lucu saat klik Spooky / buka panel
function playPopSound() {
  playSynthSeq([
    { f: 440, fEnd: 820, at: 0, dur: 0.085, type: 'sine', v: 0.045 },
    { f: 980, fEnd: 1180, at: 0.055, dur: 0.07, type: 'sine', v: 0.028 }
  ]);
}

// Efek kecil lembut saat pindah tab
function playTabSound() {
  playSynthSeq([{ f: 560, fEnd: 740, at: 0, dur: 0.045, type: 'sine', v: 0.022 }]);
}

// Efek "boop-ti-ling!" imut saat Jarvis terpanggil ("Hey Spooky")
function playWakeChime() {
  playSynthSeq([
    { f: 587, fEnd: 880, at: 0, dur: 0.09, type: 'sine', v: 0.055 },
    { f: 1174.66, at: 0.08, dur: 0.14, type: 'triangle', v: 0.05 },
    { f: 1567.98, at: 0.16, dur: 0.22, type: 'sine', v: 0.05 }
  ]);
}

// Efek blip-bloop imut saat mulai / stop rekaman meeting
function playRecSound(starting) {
  playSynthSeq(
    starting
      ? [
          { f: 520, fEnd: 780, at: 0, dur: 0.08, type: 'sine', v: 0.045 },
          { f: 880, fEnd: 1175, at: 0.07, dur: 0.12, type: 'sine', v: 0.045 }
        ]
      : [
          { f: 1046, fEnd: 784, at: 0, dur: 0.09, type: 'sine', v: 0.045 },
          { f: 740, fEnd: 523, at: 0.08, dur: 0.13, type: 'sine', v: 0.045 }
        ]
  );
}

// Efek lonceng imut "ding-dong~" untuk pengingat deadline
function playReminderSound() {
  playSynthSeq([
    { f: 1046.5, at: 0, dur: 0.16, type: 'sine', v: 0.055 },
    { f: 1318.5, at: 0.14, dur: 0.22, type: 'sine', v: 0.05 },
    { f: 1568, at: 0.28, dur: 0.28, type: 'triangle', v: 0.038 }
  ]);
}

// Suara bicara Spooky (Neural Cute Indonesian TTS via Gemini, fallback browser TTS)
let activeVoiceCtx = null;

function playPcmAudio(base64, mimeType = 'audio/l16; rate=24000') {
  try {
    if (activeVoiceCtx) {
      activeVoiceCtx.close().catch(() => {});
      activeVoiceCtx = null;
    }
    const rateMatch = String(mimeType).match(/rate=(\d+)/i);
    const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;

    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const view = new DataView(bytes.buffer);
    const samples = Math.floor(bytes.byteLength / 2);
    const float32 = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      float32[i] = view.getInt16(i * 2, true) / 32768;
    }

    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    activeVoiceCtx = ctx;
    const buffer = ctx.createBuffer(1, samples, sampleRate);
    buffer.getChannelData(0).set(float32);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 1.06; // Sentuhan sedikit lebih imut & ceria
    src.connect(ctx.destination);
    src.onended = () => {
      if (activeVoiceCtx === ctx) {
        ctx.close().catch(() => {});
        activeVoiceCtx = null;
      }
    };
    src.start();
    return true;
  } catch {
    return false;
  }
}

async function speakText(text, preloadedAudio = null, onStart = null) {
  if (!ttsEnabled || !text) {
    if (onStart) onStart();
    return;
  }
  const clean = String(text)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/[*_`#]/g, '')
    .trim();
  if (!clean) {
    if (onStart) onStart();
    return;
  }

  // 1. Jika audio TTS sudah disiapkan dari backend, putar instan bersamaan dengan teks!
  if (preloadedAudio && preloadedAudio.data) {
    if (onStart) onStart();
    playSynthSeq([{ f: 680, fEnd: 1020, at: 0, dur: 0.06, type: 'sine', v: 0.025 }]);
    if (playPcmAudio(preloadedAudio.data, preloadedAudio.mimeType)) return;
  }

  // 2. Jika belum preloaded, ambil audio dulu baru tampilkan teks & putar bersamaan
  try {
    if (api.synthesizeTTS) {
      const audio = await api.synthesizeTTS(clean);
      if (audio && audio.data) {
        if (onStart) onStart();
        playSynthSeq([{ f: 680, fEnd: 1020, at: 0, dur: 0.06, type: 'sine', v: 0.025 }]);
        if (playPcmAudio(audio.data, audio.mimeType)) return;
      }
    }
  } catch {}

  // 3. Fallback lokal jika offline
  if (onStart) onStart();
  try {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(clean);
    const voices = window.speechSynthesis.getVoices();
    const cuteVoice =
      voices.find((v) => /id[-_]/i.test(v.lang) && /gadis|google|female/i.test(v.name)) ||
      voices.find((v) => /id[-_]/i.test(v.lang)) ||
      voices.find((v) => /zira|google|female/i.test(v.name));
    if (cuteVoice) utt.voice = cuteVoice;
    utt.lang = cuteVoice ? cuteVoice.lang : 'id-ID';
    utt.rate = 1.08;
    utt.pitch = 1.48;
    window.speechSynthesis.speak(utt);
  } catch {}
}

// ---------- Selebrasi 3D volumetrik (muter 360° kayak gelas tanpa gepeng) ----------
let celebrateRaf = null;
let trailInterval = null;
function ghostCelebrate() {
  cancelAnimationFrame(celebrateRaf);
  clearInterval(trailInterval);

  const eyesRow = $('ghostEyesRow');
  const mouth = $('ghostMouth');
  const armL = document.querySelector('.arm-l');
  const armR = document.querySelector('.arm-r');
  const shadow = document.querySelector('.ghost-floor-shadow');

  compactView.classList.add('celebrating');
  playCheerChime();

  const symbols = ['✨', '✦', '★', '💜', '✧'];
  trailInterval = setInterval(() => {
    const r = ghostMascot.getBoundingClientRect();
    const s = document.createElement('span');
    s.className = 'trail-spark';
    s.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    s.style.left = (r.left + r.width / 2 + (Math.random() - 0.5) * 68) + 'px';
    s.style.top = (r.top + r.height / 2 + (Math.random() - 0.5) * 68) + 'px';
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 750);
  }, 130);

  const duration = 1150;
  const start = performance.now();

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    // Smooth ease-in-out cubic
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const theta = ease * Math.PI * 2; // 0 -> 360 deg
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);

    // Lompat kecil dengan squash & stretch halus (badan tetap bulat 3D)
    const hopY = -Math.sin(t * Math.PI) * 20;
    const sx = 1 - 0.05 * Math.abs(sinT);
    const sy = 1 + 0.05 * Math.sin(t * Math.PI);
    ghostMascot.style.transform = `translateY(${hopY.toFixed(1)}px) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;

    if (shadow) {
      const shScale = 1 - 0.25 * Math.sin(t * Math.PI);
      shadow.style.transform = `scale(${shScale.toFixed(3)})`;
      shadow.style.opacity = (0.8 - 0.35 * Math.sin(t * Math.PI)).toFixed(2);
    }

    // Mata & mulut mengitari permukaan lengkung depan (foreshortening 3D)
    if (cosT > 0.06) {
      const faceOpacity = Math.min(1, (cosT - 0.06) * 2.4);
      const faceScaleX = Math.max(0.18, cosT);
      if (eyesRow) {
        eyesRow.style.opacity = faceOpacity.toFixed(2);
        eyesRow.style.transform = `translateX(${(sinT * 34).toFixed(1)}px) scaleX(${faceScaleX.toFixed(3)})`;
      }
      if (mouth) {
        mouth.style.opacity = faceOpacity.toFixed(2);
        mouth.setAttribute('cx', (80 + sinT * 38).toFixed(1));
        mouth.setAttribute('rx', (2.4 * faceScaleX).toFixed(2));
      }
    } else {
      if (eyesRow) eyesRow.style.opacity = '0';
      if (mouth) mouth.style.opacity = '0';
    }

    // Tangan kiri & kanan mengorbit 3D di sisi tubuh (radius 60 dari tengah 80)
    if (armL && armR) {
      const lx = 80 - cosT * 60;
      const rx = 80 + cosT * 60;
      const lDepth = 0.8 + 0.25 * (-sinT);
      const rDepth = 0.8 + 0.25 * sinT;
      armL.setAttribute('cx', lx.toFixed(1));
      armL.setAttribute('rx', (9 * Math.max(0.45, Math.abs(cosT)) * lDepth).toFixed(1));
      armL.style.opacity = (-sinT > -0.35 ? 1 : 0.35).toFixed(2);
      armR.setAttribute('cx', rx.toFixed(1));
      armR.setAttribute('rx', (9 * Math.max(0.45, Math.abs(cosT)) * rDepth).toFixed(1));
      armR.style.opacity = (sinT > -0.35 ? 1 : 0.35).toFixed(2);
    }

    if (t < 1) {
      celebrateRaf = requestAnimationFrame(frame);
    } else {
      // Reset ke kondisi normal
      clearInterval(trailInterval);
      compactView.classList.remove('celebrating');
      ghostMascot.style.transform = '';
      if (shadow) { shadow.style.transform = ''; shadow.style.opacity = ''; }
      if (eyesRow) { eyesRow.style.opacity = ''; eyesRow.style.transform = ''; }
      if (mouth) { mouth.style.opacity = ''; mouth.setAttribute('cx', '80'); mouth.setAttribute('rx', '2.4'); }
      if (armL) { armL.setAttribute('cx', '20'); armL.setAttribute('rx', '9'); armL.style.opacity = ''; }
      if (armR) { armR.setAttribute('cx', '140'); armR.setAttribute('rx', '9'); armR.style.opacity = ''; }
    }
  }

  celebrateRaf = requestAnimationFrame(frame);
}

// ---------- Tab + indikator geser ----------
function moveIndicator() {
  const active = document.querySelector('.nav-tab.active');
  if (!active) return;
  tabIndicator.style.width = active.offsetWidth + 'px';
  tabIndicator.style.transform = `translateX(${active.offsetLeft}px)`;
}
navTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    playTabSound();
    navTabs.forEach((t) => t.classList.remove('active'));
    tabPanes.forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    $(tab.dataset.tab).classList.add('active');
    moveIndicator();
    if (tab.dataset.tab === 'tabSettings') loadSettings();
  });
});

// ---------- Header sapaan ----------
function refreshHeader() {
  const now = new Date();
  const h = now.getHours();
  const sapa = h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
  $('dashHello').textContent = `${sapa} 👻`;
  $('dashDate').textContent = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ---------- Toast ----------
let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

// ---------- Percikan ----------
function burst(el) {
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  for (let i = 0; i < 9; i++) {
    const s = document.createElement('span');
    s.className = 'spark';
    const ang = (Math.PI * 2 * i) / 9;
    const d = 22 + Math.random() * 16;
    s.style.left = cx + 'px';
    s.style.top = cy + 'px';
    s.style.setProperty('--dx', Math.cos(ang) * d + 'px');
    s.style.setProperty('--dy', Math.sin(ang) * d + 'px');
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 750);
  }
}

// ========================================================
// TUGAS & JADWAL
// ========================================================
async function loadTasks() {
  tasks = await api.getTasks();
  renderAll();
}

function renderAll() {
  renderHero();
  renderDayStrip();
  renderTasks();
  updateChip();
}

function renderHero() {
  const today = ymd(new Date());
  const todays = tasks.filter((t) => t.date === today);
  const done = todays.filter((t) => t.completed).length;
  const total = todays.length;
  const overdue = tasks.filter((t) => !t.completed && dueDate(t) < new Date());
  const upcoming = tasks
    .filter((t) => !t.completed && dueDate(t) >= new Date())
    .sort((a, b) => dueDate(a) - dueDate(b))[0];

  $('ringLabel').textContent = `${done}/${total}`;
  $('ringFg').style.strokeDashoffset = 169.65 * (1 - (total ? done / total : 0));

  let title;
  let sub = '';
  if (overdue.length) {
    title = `${overdue.length} tugas telat! 😱`;
    sub = 'Kerjakan yang paling mendesak dulu ya.';
  } else if (total && done === total) {
    title = 'Semua tugas hari ini beres! 🎉';
    sub = 'Hebat, saatnya santai sebentar.';
  } else if (total) {
    title = `${total - done} tugas lagi hari ini`;
    sub = upcoming ? `Berikutnya: ${upcoming.title} (${countdown(upcoming)})` : '';
  } else {
    title = 'Hari ini kosong 👻';
    sub = upcoming ? `Berikutnya: ${upcoming.title} (${countdown(upcoming)})` : 'Tambah tugas di bawah ya~';
  }
  $('heroTitle').textContent = title;
  $('heroSub').textContent = sub;
}

function renderDayStrip() {
  const strip = $('dayStrip');
  strip.innerHTML = '';
  const names = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const base = new Date();
  const weekKeys = new Set();

  for (let i = 0; i < 7; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    const key = ymd(d);
    weekKeys.add(key);
    const count = tasks.filter((t) => t.date === key && !t.completed).length;
    const b = document.createElement('button');
    b.className = 'day-chip' + (selectedDay === key ? ' active' : '');
    b.innerHTML =
      `<span class="dc-name">${i === 0 ? 'Hari ini' : i === 1 ? 'Besok' : names[d.getDay()]}</span>` +
      `<span class="dc-num">${d.getDate()}</span>` +
      (count ? `<span class="dc-dot">${count}</span>` : '');
    b.addEventListener('click', () => { selectedDay = key; renderAll(); });
    strip.appendChild(b);
  }

  // Jika user memilih tanggal di luar 7 hari (misal tgl 30 ke atas / bulan depan)
  if (selectedDay !== 'all' && !weekKeys.has(selectedDay)) {
    const customD = new Date(`${selectedDay}T00:00:00`);
    if (!isNaN(customD.getTime())) {
      const count = tasks.filter((t) => t.date === selectedDay && !t.completed).length;
      const c = document.createElement('button');
      c.className = 'day-chip active';
      c.innerHTML =
        `<span class="dc-name">${months[customD.getMonth()]}</span>` +
        `<span class="dc-num">${customD.getDate()}</span>` +
        (count ? `<span class="dc-dot">${count}</span>` : '');
      strip.appendChild(c);
    }
  }

  const pick = document.createElement('button');
  pick.className = 'day-chip all';
  pick.title = 'Pilih tanggal bebas (tgl 30, bulan depan, dll.)';
  pick.innerHTML = `<span class="dc-name">Pilih</span><span class="dc-num">📅</span>`;
  pick.addEventListener('click', () => {
    const picker = $('customDatePicker');
    picker.value = selectedDay !== 'all' ? selectedDay : ymd(new Date());
    if (picker.showPicker) picker.showPicker();
    else picker.click();
  });
  strip.appendChild(pick);

  const all = document.createElement('button');
  all.className = 'day-chip all' + (selectedDay === 'all' ? ' active' : '');
  all.innerHTML = `<span class="dc-name">Semua</span><span class="dc-num">∞</span>`;
  all.addEventListener('click', () => { selectedDay = 'all'; renderAll(); });
  strip.appendChild(all);
}

$('customDatePicker').addEventListener('change', (e) => {
  if (e.target.value) {
    selectedDay = e.target.value;
    renderAll();
  }
});

// Scroll mouse wheel vertikal -> geser strip tanggal kiri/kanan dengan mulus
$('dayStrip').addEventListener('wheel', (e) => {
  if (Math.abs(e.deltaY) > 0) {
    e.preventDefault();
    $('dayStrip').scrollLeft += e.deltaY;
  }
}, { passive: false });

function renderTasks() {
  const list = $('taskListContainer');
  list.innerHTML = '';
  const shown = tasks
    .filter((t) => selectedDay === 'all' || t.date === selectedDay)
    .sort((a, b) => (a.completed - b.completed) || (dueDate(a) - dueDate(b)));

  if (!shown.length) {
    list.innerHTML =
      `<div class="empty-state"><div class="empty-icon">👻</div>` +
      `<div class="empty-title">Sepi banget di sini...</div>` +
      `<div class="empty-text">Belum ada tugas. Ketik di bawah, nanti aku yang atur jadwalnya.</div></div>`;
    return;
  }

  shown.forEach((t, i) => {
    const u = urgency(t);
    const card = document.createElement('div');
    card.className = `task-card urgency-${u}`;
    card.style.setProperty('--i', i);
    card.innerHTML =
      `<button class="task-check" title="Selesai">${t.completed ? '✓' : ''}</button>` +
      `<div class="task-body" title="Klik untuk edit">` +
        `<div class="task-title"></div>` +
        `<div class="task-meta"><span>⏰ ${t.time || '--:--'}</span><span class="t-count">${countdown(t)}</span>` +
        `${t.fromMeeting ? '<span class="t-from">dari rapat</span>' : ''}` +
        `${t.fromGCal ? '<span class="t-gcal">📅 GCal</span>' : ''}</div>` +
      `</div>` +
      `<div class="task-actions">` +
        `${!t.fromGCal ? '<button class="task-gcal" title="Kirim ke Google Calendar">📅</button>' : ''}` +
        `<button class="task-edit" title="Edit tugas">✎</button>` +
        `<button class="task-del" title="Hapus">✕</button>` +
      `</div>` +
      `<div class="task-bar"><span style="width:${t.completed ? 100 : timeUsedPct(t)}%"></span></div>`;
    card.querySelector('.task-title').textContent = t.title;

    const check = card.querySelector('.task-check');
    check.addEventListener('click', async () => {
      const updated = await api.toggleTask(t.id);
      if (updated) {
        Object.assign(t, updated);
        if (updated.completed) {
          burst(check);
          ghostCelebrate();
          const cheers = [
            `Yeay! "${t.title}" selesai! 🎉👻`,
            `Keren banget! Satu tugas beres~ ✨`,
            `Wuhu! Spooky bangga sama kamu! 💜`
          ];
          toast(cheers[Math.floor(Math.random() * cheers.length)]);
        }
        renderAll();
      }
    });
    const gcalBtn = card.querySelector('.task-gcal');
    if (gcalBtn) {
      gcalBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        playPopSound();
        await api.openInGoogleCalendar(t);
        toast(`📅 Membuka Google Calendar untuk "${t.title}"`);
      });
    }
    card.querySelector('.task-body').addEventListener('click', () => openEditSheet(t));
    card.querySelector('.task-edit').addEventListener('click', (e) => {
      e.stopPropagation();
      openEditSheet(t);
    });
    card.querySelector('.task-del').addEventListener('click', async (e) => {
      e.stopPropagation();
      await api.deleteTask(t.id);
      tasks = tasks.filter((x) => x.id !== t.id);
      renderAll();
    });
    list.appendChild(card);
  });
}

// ---------- Sheet Tambah / Edit Tugas ----------
let editingTaskId = null; // null = mode tambah manual, string = mode edit
let isEditSheetOpen = false;
let editingPrio = 'medium';

function setEditPrio(prio) {
  editingPrio = prio || 'medium';
  document.querySelectorAll('#editPrioGroup .prio-pill').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.prio === editingPrio);
  });
}

function openEditSheet(task) {
  isEditSheetOpen = true;
  if (task) {
    editingTaskId = task.id;
    $('editSheetTitle').textContent = '✎ Edit Tugas';
    $('btnSaveEdit').textContent = 'Simpan Perubahan';
    $('editTaskTitle').value = task.title || '';
    $('editTaskDate').value = task.date || ymd(new Date());
    $('editTaskTime').value = task.time || '18:00';
    setEditPrio(task.priority || 'medium');
  } else {
    editingTaskId = null;
    $('editSheetTitle').textContent = '📅 Tambah Tugas & Tanggal Bebas';
    $('btnSaveEdit').textContent = 'Simpan Tugas';
    $('editTaskTitle').value = $('taskNaturalInput').value.trim();
    $('editTaskDate').value = selectedDay !== 'all' ? selectedDay : ymd(new Date());
    $('editTaskTime').value = '18:00';
    setEditPrio('medium');
  }
  $('editSheetBackdrop').style.display = 'flex';
  setTimeout(() => $('editTaskTitle').focus(), 40);
}

function closeEditSheet() {
  isEditSheetOpen = false;
  editingTaskId = null;
  $('editSheetBackdrop').style.display = 'none';
}

async function saveEditSheet() {
  if (!isEditSheetOpen) return;
  const title = $('editTaskTitle').value.trim();
  if (!title) {
    toast('Judul tugas tidak boleh kosong ya.');
    $('editTaskTitle').focus();
    return;
  }
  const data = {
    title,
    date: $('editTaskDate').value || ymd(new Date()),
    time: $('editTaskTime').value || '18:00',
    priority: editingPrio
  };

  if (editingTaskId) {
    const updated = await api.updateTask(editingTaskId, data);
    if (updated) {
      const idx = tasks.findIndex((x) => x.id === editingTaskId);
      if (idx !== -1) tasks[idx] = updated;
      if (selectedDay !== 'all') selectedDay = updated.date;
      closeEditSheet();
      ghostHappy();
      toast(`✎ "${updated.title}" diperbarui • ${updated.date} ${updated.time}`);
      renderAll();
    }
  } else {
    const created = await api.addTask(data);
    if (created) {
      tasks.push(created);
      $('taskNaturalInput').value = '';
      if (selectedDay !== 'all') selectedDay = created.date;
      closeEditSheet();
      ghostHappy();
      toast(`✨ "${created.title}" ditambahkan • ${created.date} ${created.time}`);
      renderAll();
    }
  }
}

$('btnAddManual').addEventListener('click', () => openEditSheet(null));

document.querySelectorAll('#editPrioGroup .prio-pill').forEach((btn) => {
  btn.addEventListener('click', () => setEditPrio(btn.dataset.prio));
});
$('btnSaveEdit').addEventListener('click', saveEditSheet);
$('btnCancelEdit').addEventListener('click', closeEditSheet);
$('btnCloseEdit').addEventListener('click', closeEditSheet);
$('editSheetBackdrop').addEventListener('click', (e) => {
  if (e.target === $('editSheetBackdrop')) closeEditSheet();
});
$('editTaskTitle').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveEditSheet();
  if (e.key === 'Escape') closeEditSheet();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isEditSheetOpen) closeEditSheet();
});

function updateChip() {
  const today = ymd(new Date());
  const left = tasks.filter((t) => t.date === today && !t.completed).length;
  const overdue = tasks.some((t) => !t.completed && dueDate(t) < new Date());
  chipStatusText.textContent = overdue ? 'Ada tugas telat!' : left ? `${left} tugas hari ini` : 'Hari ini santai';
}

// Tambah tugas dengan bahasa natural
async function addTaskFromInput() {
  const input = $('taskNaturalInput');
  const btn = $('btnAddTask');
  const text = input.value.trim();
  if (!text) return;
  btn.disabled = true;
  btn.textContent = 'Memproses...';
  try {
    const parsed = await api.parseTaskWithAI(text);
    const created = await api.addTask(parsed);
    tasks.push(created);
    selectedDay = created.date >= ymd(new Date()) ? created.date : selectedDay;
    input.value = '';
    toast(`✨ "${created.title}" ditambahkan • ${created.date} ${created.time}`);
    renderAll();
  } catch (err) {
    toast('Gagal menambah tugas, coba lagi ya.');
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ Tambah';
  }
}
$('btnAddTask').addEventListener('click', addTaskFromInput);
$('taskNaturalInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') addTaskFromInput(); });

// Hitung mundur hidup
setInterval(() => { if (mode === 'expanded') { renderHero(); renderTasks(); } updateChip(); }, 30000);

// Pengingat dari backend
api.onTaskReminder((r) => {
  playReminderSound();
  speakText(r.message, null, () => {
    if (mode === 'compact') showBubble(r.message, 'PENGINGAT', 10000);
    else toast(r.message);
  });
  loadTasks();
});

// ========================================================
// NOTULENSI MEETING AI (Audio Capture, Live Wave & MoM)
// ========================================================
let audioSourceMode = 'mic'; // 'mic' | 'both'
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let activeStreams = [];
let recAudioCtx = null;
let recAnalyser = null;
let waveRaf = null;
let recTimerInterval = null;
let recStartMs = 0;
let lastMoM = null;

const waveCanvas = $('audioWaveCanvas');
const waveCtx = waveCanvas ? waveCanvas.getContext('2d') : null;

function drawIdleWave() {
  if (!waveCtx || !waveCanvas) return;
  const w = waveCanvas.width;
  const h = waveCanvas.height;
  waveCtx.clearRect(0, 0, w, h);
  waveCtx.strokeStyle = 'rgba(167, 139, 250, 0.25)';
  waveCtx.lineWidth = 1.5;
  waveCtx.beginPath();
  waveCtx.moveTo(10, h / 2);
  waveCtx.lineTo(w - 10, h / 2);
  waveCtx.stroke();
}

function drawLiveWave() {
  if (!isRecording || !recAnalyser || !waveCtx) return;
  const buf = new Uint8Array(recAnalyser.frequencyBinCount);
  recAnalyser.getByteFrequencyData(buf);
  const w = waveCanvas.width;
  const h = waveCanvas.height;
  waveCtx.clearRect(0, 0, w, h);

  const barCount = 42;
  const step = Math.max(1, Math.floor(buf.length / barCount));
  const barW = (w - 20) / barCount;

  for (let i = 0; i < barCount; i++) {
    const val = buf[i * step] / 255;
    const barH = Math.max(4, val * (h - 8));
    const x = 10 + i * barW;
    const y = (h - barH) / 2;
    const grad = waveCtx.createLinearGradient(0, y, 0, y + barH);
    grad.addColorStop(0, '#c4b5fd');
    grad.addColorStop(1, '#7c3aed');
    waveCtx.fillStyle = grad;
    waveCtx.fillRect(x, y, Math.max(2, barW - 3), barH);
  }
  waveRaf = requestAnimationFrame(drawLiveWave);
}

function formatTimer(ms) {
  const sec = Math.floor(ms / 1000);
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = String(reader.result || '');
      resolve(res.includes(',') ? res.split(',')[1] : res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

document.querySelectorAll('#audioSourceRow .source-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (isRecording) return;
    audioSourceMode = btn.dataset.source;
    document.querySelectorAll('#audioSourceRow .source-pill').forEach((b) =>
      b.classList.toggle('active', b === btn)
    );
  });
});

async function startMeetingRecording() {
  try {
    activeStreams = [];
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    activeStreams.push(micStream);

    const AC = window.AudioContext || window.webkitAudioContext;
    recAudioCtx = new AC();
    const dest = recAudioCtx.createMediaStreamDestination();
    recAnalyser = recAudioCtx.createAnalyser();
    recAnalyser.fftSize = 256;

    const micSrc = recAudioCtx.createMediaStreamSource(micStream);
    micSrc.connect(dest);
    micSrc.connect(recAnalyser);

    if (audioSourceMode === 'both') {
      try {
        const sysStream = await navigator.mediaDevices.getUserMedia({
          audio: { mandatory: { chromeMediaSource: 'desktop' } },
          video: { mandatory: { chromeMediaSource: 'desktop', maxWidth: 1, maxHeight: 1 } }
        });
        sysStream.getVideoTracks().forEach((tr) => tr.stop());
        if (sysStream.getAudioTracks().length > 0) {
          activeStreams.push(sysStream);
          const sysSrc = recAudioCtx.createMediaStreamSource(sysStream);
          sysSrc.connect(dest);
          sysSrc.connect(recAnalyser);
        }
      } catch (sysErr) {
        toast('Audio sistem tidak tersedia, lanjut pakai mikrofon saja 🎙️');
      }
    }

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    audioChunks = [];
    mediaRecorder = new MediaRecorder(dest.stream, { mimeType, audioBitsPerSecond: 32000 });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const recordedMime = mediaRecorder.mimeType || 'audio/webm';
      cleanupRecordingResources();
      if (!audioChunks.length) return;
      const blob = new Blob(audioChunks, { type: recordedMime });
      await processRecordedAudio(blob, recordedMime);
    };

    mediaRecorder.start(1000);
    isRecording = true;
    recStartMs = Date.now();
    api.jarvisSetPaused(true);
    playRecSound(true);

    $('meetingBadge').classList.add('recording');
    $('meetingStatusLabel').textContent = audioSourceMode === 'both' ? 'Merekam Sistem + Mic...' : 'Merekam Mikrofon...';
    $('btnToggleRecord').classList.add('recording');
    $('btnRecIcon').textContent = '⏹️';
    $('btnRecLabel').textContent = 'Stop & Buat Notulensi';
    $('btnGenerateMoM').disabled = true;
    window.spooky.setMeetingMode(true);

    recTimerInterval = setInterval(() => {
      $('meetingTimer').textContent = formatTimer(Date.now() - recStartMs);
    }, 500);
    drawLiveWave();
  } catch (err) {
    cleanupRecordingResources();
    toast('Gagal akses mikrofon. Pastikan izin mic aktif ya.');
  }
}

function stopMeetingRecording() {
  if (!isRecording || !mediaRecorder) return;
  isRecording = false;
  playRecSound(false);
  $('meetingStatusLabel').textContent = 'Memproses audio...';
  $('btnToggleRecord').disabled = true;
  mediaRecorder.stop();
}

function cleanupRecordingResources() {
  isRecording = false;
  api.jarvisSetPaused(false);
  cancelAnimationFrame(waveRaf);
  clearInterval(recTimerInterval);
  activeStreams.forEach((st) => st.getTracks().forEach((tr) => tr.stop()));
  activeStreams = [];
  if (recAudioCtx) {
    recAudioCtx.close().catch(() => {});
    recAudioCtx = null;
  }
  recAnalyser = null;
  $('meetingBadge').classList.remove('recording');
  $('btnToggleRecord').classList.remove('recording');
  $('btnRecIcon').textContent = '🎙️';
  $('btnRecLabel').textContent = 'Mulai Rekam Meeting';
  window.spooky.setMeetingMode(false);
  drawIdleWave();
}

async function processRecordedAudio(blob, mimeType) {
  $('meetingStatusLabel').textContent = 'AI sedang menyusun notulensi...';
  $('btnGenerateMoM').disabled = true;
  $('btnToggleRecord').disabled = true;
  toast('🎧 Spooky sedang mendengarkan rekaman & membuat MoM...');
  try {
    const base64 = await blobToBase64(blob);
    const result = await api.analyzeMeetingAudio(base64, mimeType);
    if (result.transcript) {
      const existing = $('transcriptInput').value.trim();
      $('transcriptInput').value = existing
        ? `${existing}\n\n${result.transcript}`
        : result.transcript;
    }
    renderMoM(result);
    if (!result.error) {
      ghostHappy();
      toast('✨ Notulensi rapat berhasil dibuat!');
    } else {
      toast(result.summary || 'Gagal menganalisis audio.');
    }
  } catch (err) {
    toast('Gagal memproses rekaman audio, coba lagi ya.');
  } finally {
    $('meetingStatusLabel').textContent = 'Siap Merekam';
    $('btnToggleRecord').disabled = false;
    $('btnGenerateMoM').disabled = false;
  }
}

async function generateMoMFromText() {
  const transcript = $('transcriptInput').value.trim();
  if (!transcript) {
    toast('Rekam suara atau tempel teks transkrip rapat dulu ya.');
    $('transcriptInput').focus();
    return;
  }
  const btn = $('btnGenerateMoM');
  btn.disabled = true;
  btn.textContent = '⏳ Menyusun...';
  try {
    const result = await api.generateMeetingMoM(transcript);
    renderMoM(result);
    ghostHappy();
    toast('✨ Notulensi MoM siap dilihat!');
  } catch (err) {
    toast('Gagal membuat notulensi, coba lagi ya.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>⚡</span> Buat Notulensi';
  }
}

function renderMoM(mom) {
  lastMoM = mom;
  $('momOutputCard').style.display = 'flex';
  $('momSummary').textContent = mom.summary || '-';

  const kpList = $('momKeyPoints');
  kpList.innerHTML = '';
  (mom.keyPoints || []).forEach((pt) => {
    const li = document.createElement('li');
    li.textContent = pt;
    kpList.appendChild(li);
  });
  if (!kpList.children.length) kpList.innerHTML = '<li>Tidak ada poin utama tercatat.</li>';

  const aiList = $('momActionItems');
  aiList.innerHTML = '';
  (mom.actionItems || []).forEach((item) => {
    const row = document.createElement('div');
    row.className = 'action-item-row';
    const taskText = typeof item === 'string' ? item : item.task;
    const assignee = typeof item === 'object' && item.assignee ? item.assignee : 'Umum';
    const deadline = typeof item === 'object' && item.deadline ? item.deadline : '';

    row.innerHTML =
      `<div class="action-item-title">` +
        `<div class="ai-task-name"></div>` +
        `<div class="action-item-meta">👤 ${assignee}${deadline ? ` • ⏰ ${deadline}` : ''}</div>` +
      `</div>` +
      `<button type="button" class="btn-add-action">+ Jadwal</button>`;
    row.querySelector('.ai-task-name').textContent = taskText;

    const addBtn = row.querySelector('.btn-add-action');
    addBtn.addEventListener('click', async () => {
      addBtn.disabled = true;
      addBtn.textContent = '...';
      try {
        const natural = deadline ? `${taskText} ${deadline}` : taskText;
        const parsed = await api.parseTaskWithAI(natural);
        const created = await api.addTask({ ...parsed, title: taskText, fromMeeting: true });
        if (created) {
          tasks.push(created);
          renderAll();
          ghostHappy();
          addBtn.classList.add('added');
          addBtn.textContent = '✓ Masuk';
          toast(`✅ "${created.title}" masuk ke jadwal (${created.date})`);
        }
      } catch {
        addBtn.disabled = false;
        addBtn.textContent = '+ Jadwal';
        toast('Gagal memasukkan tugas.');
      }
    });
    aiList.appendChild(row);
  });
  if (!aiList.children.length) {
    aiList.innerHTML = '<div class="mom-text">Tidak ada action item spesifik.</div>';
  }

  const sugList = $('momSuggestions');
  sugList.innerHTML = '';
  (mom.aiSuggestions || []).forEach((s) => {
    const li = document.createElement('li');
    li.textContent = s;
    sugList.appendChild(li);
  });
  if (!sugList.children.length) sugList.innerHTML = '<li>Belum ada saran tambahan.</li>';

  autoSaveMoMFile(mom);
  $('momOutputCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

let lastMoMFilePath = null;

function buildMoMMarkdown(mom, transcriptText = '') {
  const now = new Date();
  const stamp = now.toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' });
  const lines = [
    '# Notulensi Meeting (Spooky AI)',
    `> Dicatat pada: ${stamp}`,
    '',
    '## Ringkasan',
    mom.summary || '-',
    '',
    '## Poin Utama',
    ...((mom.keyPoints || []).length ? mom.keyPoints.map((p) => `- ${p}`) : ['- (Tidak ada poin utama)']),
    '',
    '## Action Items',
    ...((mom.actionItems || []).length
      ? mom.actionItems.map((a) =>
          typeof a === 'string'
            ? `- [ ] ${a}`
            : `- [ ] ${a.task} (PIC: ${a.assignee || 'Umum'}${a.deadline ? `, Deadline: ${a.deadline}` : ''})`
        )
      : ['- (Tidak ada action item)']),
    '',
    '## Saran & Tindak Lanjut AI',
    ...((mom.aiSuggestions || []).length ? mom.aiSuggestions.map((s) => `- ${s}`) : ['- (Belum ada saran)'])
  ];
  const fullTranscript = (mom.transcript || transcriptText || '').trim();
  if (fullTranscript) {
    lines.push('', '---', '', '## Transkrip Lengkap', fullTranscript);
  }
  return lines.join('\n');
}

async function autoSaveMoMFile(mom) {
  if (!mom || mom.error) {
    $('momFileBar').style.display = 'none';
    lastMoMFilePath = null;
    return;
  }
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const fileName = `Notulensi_${ymd(now)}_${p(now.getHours())}-${p(now.getMinutes())}.md`;
  const md = buildMoMMarkdown(mom, $('transcriptInput').value.trim());
  const saved = await api.saveMeetingFile(md, fileName);
  if (saved && saved.success) {
    lastMoMFilePath = saved.filePath;
    $('momFileName').textContent = `📄 ${saved.fileName}`;
    $('momFileBar').style.display = 'flex';
  }
}

$('btnToggleRecord').addEventListener('click', () => {
  if (isRecording) stopMeetingRecording();
  else startMeetingRecording();
});
$('btnGenerateMoM').addEventListener('click', generateMoMFromText);
$('btnClearTranscript').addEventListener('click', () => {
  $('transcriptInput').value = '';
  $('momOutputCard').style.display = 'none';
  $('momFileBar').style.display = 'none';
  $('meetingTimer').textContent = '00:00';
  lastMoM = null;
  lastMoMFilePath = null;
});
$('btnOpenMoMFile').addEventListener('click', () => {
  if (lastMoMFilePath) api.openFilePath(lastMoMFilePath);
});
$('btnOpenMoMFolder').addEventListener('click', () => {
  if (lastMoMFilePath) api.showFileInFolder(lastMoMFilePath);
});
$('btnCopyMoM').addEventListener('click', async () => {
  if (!lastMoM) return;
  try {
    await navigator.clipboard.writeText(buildMoMMarkdown(lastMoM, $('transcriptInput').value.trim()));
    toast('📋 Notulensi disalin dalam format Markdown!');
  } catch {
    toast('Gagal menyalin ke clipboard.');
  }
});
drawIdleWave();

// ========================================================
// CHAT (dengan memori percakapan)
// ========================================================
const chatHistory = $('chatHistory');
const chatMemory = [];

function addChatMsg(text, who) {
  const row = document.createElement('div');
  row.className = `chat-msg ${who}`;
  const b = document.createElement('div');
  b.className = 'msg-bubble';
  if (text === null) b.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
  else b.textContent = text;
  row.appendChild(b);
  chatHistory.appendChild(row);
  chatHistory.scrollTop = chatHistory.scrollHeight;
  return b;
}
function switchTab(tabId) {
  navTabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === tabId));
  tabPanes.forEach((p) => p.classList.toggle('active', p.id === tabId));
  requestAnimationFrame(moveIndicator);
}

async function executeJarvisIntent(res, spoken = false) {
  if (!res) return '';
  const reply = typeof res === 'string' ? res : (res.reply || 'Siap! 👻');
  const intent = typeof res === 'object' ? res.intent : 'chat';
  const target = typeof res === 'object' ? res.target : '';

  if (intent === 'start_meeting') {
    setMode('expanded');
    switchTab('tabMeeting');
    if (!isRecording) setTimeout(() => startMeetingRecording(), 250);
  } else if (intent === 'stop_meeting') {
    if (isRecording) stopMeetingRecording();
  } else if (intent === 'open_tasks') {
    setMode('expanded');
    switchTab('tabTasks');
  } else if (intent === 'add_task' && target) {
    try {
      const parsed = await api.parseTaskWithAI(target);
      const created = await api.addTask(parsed);
      if (created) {
        tasks.push(created);
        if (selectedDay !== 'all') selectedDay = created.date;
        renderAll();
        ghostHappy();
      }
    } catch {}
  } else if (intent === 'open_app' || intent === 'open_url') {
    ghostHappy();
  }

  if (spoken) {
    const preloaded = typeof res === 'object' ? res.ttsAudio : null;
    await speakText(reply, preloaded, () => {
      if (mode === 'compact') showBubble(reply, 'SPOOKY', 7000);
      else toast(reply);
    });
  }
  return reply;
}

// ---------- Jarvis Hands-Free & Tombol Mic Perintah ----------
let isJarvisListening = false;

async function listenJarvisCommand(fromWakeWord = false) {
  if (isJarvisListening || isRecording) return;
  isJarvisListening = true;
  api.jarvisSetPaused(true);

  const micBtn = $('btnVoiceCmd');
  if (micBtn) micBtn.classList.add('listening');
  ghostMascot.classList.add('listening');
  playWakeChime();

  if (mode === 'compact') showBubble('Ya, ada apa? Aku dengerin... 👂✨', 'SPOOKY', 6000);
  else toast('👂 Spooky mendengarkan perintahmu (4 detik)...');

  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    const chunks = [];
    const rec = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 });
    rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

    const audioDone = new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
    });

    rec.start();
    await new Promise((r) => setTimeout(r, 4200));
    if (rec.state !== 'inactive') rec.stop();
    const blob = await audioDone;

    stream.getTracks().forEach((tr) => tr.stop());
    stream = null;

    if (mode === 'compact') showBubble('Sebentar ya, aku proses... ✨', 'SPOOKY', 6000);
    const base64 = await blobToBase64(blob);
    const res = await api.jarvisProcessAudio(base64, blob.type || 'audio/webm');

    if (res && res.transcript) {
      addChatMsg(`🎙️ ${res.transcript}`, 'user');
      chatMemory.push({ role: 'user', text: res.transcript });
    }
    const reply = await executeJarvisIntent(res, true);
    if (reply) {
      addChatMsg(reply, 'bot');
      chatMemory.push({ role: 'model', text: reply });
    }
  } catch (err) {
    if (mode === 'compact') showBubble('Gagal mendengarkan mikrofon 😿', 'SPOOKY', 4000);
    else toast('Gagal mengakses mikrofon untuk perintah suara.');
  } finally {
    if (stream) stream.getTracks().forEach((tr) => tr.stop());
    if (micBtn) micBtn.classList.remove('listening');
    ghostMascot.classList.remove('listening');
    isJarvisListening = false;
    if (!isRecording) api.jarvisSetPaused(false);
  }
}

api.onJarvisWake(() => {
  listenJarvisCommand(true);
});
$('btnVoiceCmd').addEventListener('click', () => listenJarvisCommand(false));

async function sendChat(textOverride) {
  const input = $('chatInput');
  const text = (textOverride || input.value).trim();
  if (!text) return;
  input.value = '';
  addChatMsg(text, 'user');
  chatMemory.push({ role: 'user', text });
  const typing = addChatMsg(null, 'bot');
  const res = await api.askAI(text, chatMemory.slice(-16));
  const reply = await executeJarvisIntent(res, false);
  typing.textContent = reply;
  chatMemory.push({ role: 'model', text: reply });
  chatHistory.scrollTop = chatHistory.scrollHeight;
}
$('btnSendChat').addEventListener('click', () => sendChat());
$('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
document.querySelectorAll('.prompt-chip').forEach((c) =>
  c.addEventListener('click', () => sendChat(c.dataset.prompt))
);

// ========================================================
// PENGATURAN (Multi-Provider AI)
// ========================================================
let selectedProvider = 'gemini';

function setSelectedProvider(prov) {
  selectedProvider = prov || 'gemini';
  document.querySelectorAll('#cfgProviderGroup .prio-pill').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.provider === selectedProvider);
  });
  $('cfgGroqFields').style.display = selectedProvider === 'groq' ? 'flex' : 'none';
  $('cfgOpenRouterFields').style.display = selectedProvider === 'openrouter' ? 'flex' : 'none';
  updateChatPlaceholder();
}

function updateChatPlaceholder() {
  const labels = {
    gemini: 'Ngobrol sama Spooky (Gemini)...',
    groq: 'Ngobrol sama Spooky (⚡ Groq)...',
    openrouter: 'Ngobrol sama Spooky (🌐 OpenRouter)...'
  };
  $('chatInput').placeholder = labels[selectedProvider] || 'Ngobrol apa saja sama Spooky...';
}

document.querySelectorAll('#cfgProviderGroup .prio-pill').forEach((btn) => {
  btn.addEventListener('click', () => setSelectedProvider(btn.dataset.provider));
});

async function runGCalSync(customUrl = null, silent = false) {
  const btn = $('btnSyncGcalNow');
  const heroBtn = $('btnHeroSyncGcal');
  if (btn) { btn.disabled = true; btn.classList.add('spinning'); }
  if (heroBtn) { heroBtn.disabled = true; heroBtn.classList.add('spinning'); }
  try {
    const res = await api.syncGoogleCalendar(customUrl);
    if (res && res.success) {
      tasks = res.tasks || tasks;
      renderAll();
      if (!silent) {
        ghostHappy();
        toast(`📅 Sinkron berhasil! ${res.count} jadwal Google Calendar dimuat.`);
      }
    } else if (!silent) {
      toast(res?.error || 'Gagal sinkronisasi Google Calendar.');
    }
  } catch {
    if (!silent) toast('Gagal menghubungi Google Calendar.');
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('spinning'); }
    if (heroBtn) { heroBtn.disabled = false; heroBtn.classList.remove('spinning'); }
  }
}

$('btnSyncGcalNow').addEventListener('click', () => runGCalSync($('cfgGcalUrl').value.trim(), false));
$('btnHeroSyncGcal').addEventListener('click', () => runGCalSync(null, false));

async function loadSettings() {
  const cfg = await api.getConfig();
  $('cfgApiKey').value = cfg.geminiApiKey || '';
  $('cfgGroqKey').value = cfg.groqApiKey || '';
  $('cfgGroqModel').value = cfg.groqModel || 'llama-3.3-70b-versatile';
  $('cfgOrKey').value = cfg.openrouterApiKey || '';
  $('cfgOrModel').value = cfg.openrouterModel || 'meta-llama/llama-3.3-70b-instruct:free';
  $('cfgGcalUrl').value = cfg.gcalIcsUrl || '';
  $('cfgJarvisToggle').checked = cfg.jarvisHandsFree !== false;
  $('cfgTtsToggle').checked = cfg.ttsEnabled !== false;
  $('cfgSoundToggle').checked = cfg.soundEnabled !== false;
  $('cfgAutoStartToggle').checked = !!cfg.autoStart;
  $('btnHeroSyncGcal').style.display = cfg.gcalIcsUrl ? 'flex' : 'none';
  setSelectedProvider(cfg.aiProvider || 'gemini');
}

$('btnSaveConfig').addEventListener('click', async () => {
  const cfg = await api.getConfig();
  soundEnabled = $('cfgSoundToggle').checked;
  ttsEnabled = $('cfgTtsToggle').checked;
  const gcalUrl = $('cfgGcalUrl').value.trim();
  await api.saveConfig({
    ...cfg,
    aiProvider: selectedProvider,
    geminiApiKey: $('cfgApiKey').value.trim(),
    groqApiKey: $('cfgGroqKey').value.trim(),
    groqModel: $('cfgGroqModel').value,
    openrouterApiKey: $('cfgOrKey').value.trim(),
    openrouterModel: $('cfgOrModel').value.trim() || 'meta-llama/llama-3.3-70b-instruct:free',
    gcalIcsUrl: gcalUrl,
    jarvisHandsFree: $('cfgJarvisToggle').checked,
    ttsEnabled,
    soundEnabled,
    autoStart: $('cfgAutoStartToggle').checked
  });
  $('btnHeroSyncGcal').style.display = gcalUrl ? 'flex' : 'none';
  updateChatPlaceholder();
  ghostHappy();
  toast(`✨ Pengaturan disimpan (Provider: ${selectedProvider.toUpperCase()})`);
  if (gcalUrl && gcalUrl !== cfg.gcalIcsUrl) {
    runGCalSync(gcalUrl, false);
  }
  const b = $('btnSaveConfig');
  b.textContent = 'Tersimpan ✓';
  setTimeout(() => (b.textContent = 'Simpan Pengaturan'), 1600);
});

api.getConfig().then((cfg) => {
  selectedProvider = cfg.aiProvider || 'gemini';
  updateChatPlaceholder();
  if (cfg.gcalIcsUrl) {
    $('btnHeroSyncGcal').style.display = 'flex';
    runGCalSync(cfg.gcalIcsUrl, true);
  }
}).catch(() => {});

// Dipakai tahap berikutnya (rapat)
window.spooky = {
  showBubble,
  toast,
  loadTasks,
  setMeetingMode: (on) => {
    meetingHeadset.style.display = on ? 'block' : 'none';
    chipStatusText.textContent = on ? 'Merekam meeting...' : 'Hari ini santai';
    $('ghostQuickChip').classList.toggle('force-show', !!on);
  }
};

// ---------- Init ----------
setMode('compact');
loadTasks();
setTimeout(() => showBubble('Halo! Aku Spooky 👻 Klik aku untuk buka panel.', 'SPOOKY', 5000), 600);
