// ========================================================
// Google Calendar Sync Helper (iCal .ics Parser + Quick-Add URL)
// Zero external dependencies
// ========================================================

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toLocalYmd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toLocalHm(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// Parse iCal DTSTART value (supports YYYYMMDD, YYYYMMDDTHHMMSS, YYYYMMDDTHHMMSSZ)
function parseIcsDate(rawVal) {
  if (!rawVal) return null;
  const val = rawVal.trim();

  // All-day date: YYYYMMDD
  const dateOnly = val.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    return {
      date: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`,
      time: '09:00',
      allDay: true
    };
  }

  // DateTime: YYYYMMDDTHHMMSS(Z?)
  const dt = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (dt) {
    const [, y, mo, da, h, mi, s, isUtc] = dt;
    const d = isUtc
      ? new Date(Date.UTC(+y, +mo - 1, +da, +h, +mi, +s))
      : new Date(+y, +mo - 1, +da, +h, +mi, +s);
    if (isNaN(d.getTime())) return null;
    return {
      date: toLocalYmd(d),
      time: toLocalHm(d),
      allDay: false
    };
  }
  return null;
}

function unescapeIcsText(str) {
  return String(str || '')
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function parseICS(icsText) {
  // Unfold folded iCal lines (CRLF + space/tab)
  const unfolded = String(icsText || '').replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  const events = [];
  let inEvent = false;
  let current = {};

  const now = new Date();
  const minDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  const maxDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 60);

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      inEvent = false;
      if (current.title && current.date) {
        const dObj = new Date(`${current.date}T${current.time || '09:00'}:00`);
        if (!isNaN(dObj.getTime()) && dObj >= minDate && dObj <= maxDate) {
          events.push({
            gcalUid: current.uid || `${current.date}-${current.title}`,
            title: current.title,
            date: current.date,
            time: current.time || '09:00',
            priority: 'medium',
            fromGCal: true
          });
        }
      }
      continue;
    }
    if (!inEvent) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const rawKey = line.slice(0, colonIdx).toUpperCase();
    const key = rawKey.split(';')[0];
    const value = line.slice(colonIdx + 1);

    if (key === 'UID') current.uid = value.trim();
    else if (key === 'SUMMARY') current.title = unescapeIcsText(value);
    else if (key === 'DTSTART') {
      const parsed = parseIcsDate(value);
      if (parsed) {
        current.date = parsed.date;
        current.time = parsed.time;
      }
    }
  }

  return events;
}

async function fetchGoogleCalendarEvents(icsUrl) {
  const url = String(icsUrl || '').trim();
  if (!url) return { success: false, error: 'URL iCal (.ics) Google Calendar belum diisi.' };
  if (!/^https?:\/\//i.test(url)) return { success: false, error: 'URL iCal harus diawali https://' };

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return { success: false, error: `Gagal mengambil kalender (HTTP ${res.status}).` };
    const text = await res.text();
    if (!text.includes('BEGIN:VCALENDAR')) {
      return { success: false, error: 'Link bukan format iCal (.ics) Google Calendar yang valid.' };
    }
    const events = parseICS(text);
    return { success: true, events };
  } catch (err) {
    return { success: false, error: `Gagal terhubung ke Google Calendar: ${err.message}` };
  }
}

// Build 1-click Google Calendar "Add Event" URL (zero OAuth required!)
function buildGoogleCalendarAddUrl(task) {
  const title = task.title || 'Tugas dari Spooky';
  const dateStr = task.date || toLocalYmd(new Date());
  const timeStr = task.time || '09:00';
  const start = new Date(`${dateStr}T${timeStr}:00`);
  const end = new Date(start.getTime() + 60 * 60 * 1000); // default 1 jam

  const fmtUtc = (d) =>
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T` +
    `${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}00Z`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${fmtUtc(start)}/${fmtUtc(end)}`,
    details: `Dijadwalkan lewat Spooky Assistant (Prioritas: ${task.priority || 'medium'})`
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

module.exports = {
  parseICS,
  fetchGoogleCalendarEvents,
  buildGoogleCalendarAddUrl
};
