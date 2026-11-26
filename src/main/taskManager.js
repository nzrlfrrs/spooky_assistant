const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

class TaskManager extends EventEmitter {
  constructor(storagePath) {
    super();
    this.storagePath = storagePath || path.join(__dirname, '../../tasks.json');
    this.tasks = [];
    this.checkInterval = null;
    this.loadTasks();
    this.startDeadlineChecker();
  }

  loadTasks() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        this.tasks = JSON.parse(raw);
      } else {
        // Default sample tasks to immediately show the power of the task manager
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const nextWeek = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

        this.tasks = [
          {
            id: 'task-1',
            title: 'Selesaikan Desain UI & Wireframe',
            date: ymd(now),
            time: '17:00',
            priority: 'high',
            completed: false,
            createdAt: now.toISOString()
          },
          {
            id: 'task-2',
            title: 'Review Catatan Meeting & Follow-up',
            date: ymd(tomorrow),
            time: '10:00',
            priority: 'medium',
            completed: false,
            createdAt: now.toISOString()
          },
          {
            id: 'task-3',
            title: 'Weekly Sprint Retrospective',
            date: ymd(nextWeek),
            time: '14:00',
            priority: 'low',
            completed: false,
            createdAt: now.toISOString()
          }
        ];
        this.saveToFile();
      }
    } catch (err) {
      console.warn('[TaskManager] Failed to load tasks:', err.message);
      this.tasks = [];
    }
  }

  saveToFile() {
    try {
      fs.writeFileSync(this.storagePath, JSON.stringify(this.tasks, null, 2), 'utf8');
    } catch (err) {
      console.error('[TaskManager] Failed to save tasks:', err.message);
    }
  }

  getTasks() {
    return this.tasks;
  }

  addTask(taskData) {
    const newTask = {
      id: 'task-' + Date.now(),
      title: taskData.title || 'Tugas Baru',
      description: typeof taskData.description === 'string' ? taskData.description.trim() : '',
      date: taskData.date || ymd(new Date()),
      time: taskData.time || '18:00',
      priority: taskData.priority || 'medium',
      completed: false,
      fromMeeting: !!taskData.fromMeeting,
      createdAt: new Date().toISOString()
    };
    this.tasks.push(newTask);
    this.saveToFile();
    return newTask;
  }

  toggleTask(id) {
    const task = this.tasks.find((t) => t.id === id);
    if (task) {
      task.completed = !task.completed;
      this.saveToFile();
      return task;
    }
    return null;
  }

  updateTask(id, updates) {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return null;

    const scheduleChanged =
      (updates.date && updates.date !== task.date) ||
      (updates.time && updates.time !== task.time);

    if (typeof updates.title === 'string' && updates.title.trim()) {
      task.title = updates.title.trim();
    }
    if (typeof updates.description === 'string') {
      task.description = updates.description.trim();
    }
    if (updates.date) task.date = updates.date;
    if (updates.time) task.time = updates.time;
    if (updates.priority) task.priority = updates.priority;

    if (scheduleChanged) {
      task.notified30m = false;
      task.notifiedOverdue = false;
    }

    this.saveToFile();
    return task;
  }

  deleteTask(id) {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx !== -1) {
      const removed = this.tasks.splice(idx, 1)[0];
      this.saveToFile();
      return removed;
    }
    return null;
  }

  mergeGoogleCalendarEvents(gcalEvents = []) {
    const existingByUid = new Map();
    this.tasks.forEach((t) => {
      if (t.fromGCal && t.gcalUid) existingByUid.set(t.gcalUid, t);
    });

    const localTasks = this.tasks.filter((t) => !t.fromGCal);
    const mergedGCal = gcalEvents.map((ev) => {
      const prev = existingByUid.get(ev.gcalUid);
      const prevDesc =
        prev && prev.description && prev.description.trim() !== 'This is an event reminder'
          ? prev.description
          : '';
      return {
        id: prev ? prev.id : 'gcal-' + Buffer.from(ev.gcalUid).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14),
        title: ev.title,
        description: ev.description || prevDesc,
        date: ev.date,
        time: ev.time || '09:00',
        priority: prev ? prev.priority : 'medium',
        completed: prev ? !!prev.completed : false,
        fromGCal: true,
        gcalUid: ev.gcalUid,
        createdAt: prev ? prev.createdAt : new Date().toISOString()
      };
    });

    this.tasks = [...localTasks, ...mergedGCal];
    this.saveToFile();
    return { count: mergedGCal.length, tasks: this.tasks };
  }

  startDeadlineChecker() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    // Check every 60 seconds
    this.checkInterval = setInterval(() => {
      this.checkDeadlines();
    }, 60000);
  }

  checkDeadlines() {
    const now = new Date();
    const urgentTasks = [];
    const overdueTasks = [];

    this.tasks.forEach((t) => {
      if (t.completed || !t.date) return;

      const dueDateTime = new Date(`${t.date}T${t.time || '23:59'}:00`);
      if (isNaN(dueDateTime.getTime())) return;
      const diffMinutes = Math.round((dueDateTime.getTime() - now.getTime()) / 60000);

      if (diffMinutes > 0 && diffMinutes <= 30 && !t.notified30m) {
        t.notified30m = true;
        urgentTasks.push({ task: t, diffMinutes });
      } else if (diffMinutes <= 0 && diffMinutes >= -1440 && !t.notifiedOverdue) {
        t.notifiedOverdue = true;
        overdueTasks.push(t);
      }
    });

    if (!urgentTasks.length && !overdueTasks.length) return false;
    this.saveToFile();

    const formatTitles = (list) => {
      const shown = list.slice(0, 3).map((t) => `"${t.title}"`).join(', ');
      return list.length > 3 ? `${shown}, +${list.length - 3} lainnya` : shown;
    };

    if (urgentTasks.length === 1) {
      const { task, diffMinutes } = urgentTasks[0];
      this.emit('reminder', {
        task,
        count: 1,
        message: `Tugas "${task.title}" deadline ${diffMinutes} menit lagi lho! 👻⏰`,
        type: 'urgent'
      });
    } else if (urgentTasks.length > 1) {
      const minLeft = Math.min(...urgentTasks.map((u) => u.diffMinutes));
      this.emit('reminder', {
        count: urgentTasks.length,
        message: `Ada ${urgentTasks.length} deadline ${minLeft} menit lagi: ${formatTitles(urgentTasks.map((u) => u.task))}! 👻⏰`,
        type: 'urgent'
      });
    }

    if (overdueTasks.length === 1) {
      const task = overdueTasks[0];
      this.emit('reminder', {
        task,
        count: 1,
        message: `Tugas "${task.title}" sudah melewati batas waktu deadline! 👻⚠️`,
        type: 'overdue'
      });
    } else if (overdueTasks.length > 1) {
      this.emit('reminder', {
        count: overdueTasks.length,
        message: `Ada ${overdueTasks.length} deadline terlewat hari ini: ${formatTitles(overdueTasks)}! 👻⚠️`,
        type: 'overdue'
      });
    }

    return true;
  }

  emitDailyBriefing() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const toYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const todayStr = toYmd(now);
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const tomorrowStr = toYmd(tomorrow);

    const todayTasks = this.tasks.filter((t) => !t.completed && t.date === todayStr);
    const tomorrowTasks = this.tasks.filter((t) => !t.completed && t.date === tomorrowStr);
    if (!todayTasks.length && !tomorrowTasks.length) return false;

    const preview = (list) => {
      const names = list.slice(0, 2).map((t) => `"${t.title}"`).join(', ');
      return list.length > 2 ? `${names}, +${list.length - 2} lainnya` : names;
    };

    let message = '';
    if (todayTasks.length && tomorrowTasks.length) {
      message = `Rekap jadwal: hari ini ada ${todayTasks.length} tugas (${preview(todayTasks)}) dan besok ada ${tomorrowTasks.length} deadline menanti! 👻📋`;
    } else if (todayTasks.length) {
      message = `Rekap hari ini: ada ${todayTasks.length} tugas (${preview(todayTasks)})! 👻📋`;
    } else {
      message = `Pengingat H-1: besok ada ${tomorrowTasks.length} deadline (${preview(tomorrowTasks)}), siap-siap ya! 👻📅`;
    }

    this.emit('reminder', {
      count: todayTasks.length + tomorrowTasks.length,
      message,
      type: 'briefing'
    });
    return true;
  }
}

module.exports = TaskManager;
