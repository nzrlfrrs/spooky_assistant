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
    this.tasks.forEach((t) => {
      if (t.completed) return;
      if (!t.date) return;

      const dueDateTime = new Date(`${t.date}T${t.time || '23:59'}:00`);
      const diffMs = dueDateTime.getTime() - now.getTime();
      const diffMinutes = Math.round(diffMs / 60000);

      // Trigger reminder if due within 30 minutes, or overdue within the last 5 minutes
      if (diffMinutes > 0 && diffMinutes <= 30 && !t.notified30m) {
        t.notified30m = true;
        this.emit('reminder', {
          task: t,
          message: `Tugas "${t.title}" deadline ${diffMinutes} menit lagi lho! 👻⏰`,
          type: 'urgent'
        });
        this.saveToFile();
      } else if (diffMinutes <= 0 && diffMinutes >= -5 && !t.notifiedOverdue) {
        t.notifiedOverdue = true;
        this.emit('reminder', {
          task: t,
          message: `Tugas "${t.title}" sudah melewati batas waktu deadline! 👻⚠️`,
          type: 'overdue'
        });
        this.saveToFile();
      }
    });
  }
}

module.exports = TaskManager;
