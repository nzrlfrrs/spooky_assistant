# Spooky Assistant

A lightweight Windows desktop companion built with Electron. Spooky sits on your desktop as an animated ghost widget and expands into a daily planner, meeting notetaker, and voice-triggered assistant.

## Features

- **Desktop Widget & Panel**
  - Transparent, always-on-top floating ghost with eye tracking, idle animation, and a 3D spin celebration when you check off a task.
  - Click the ghost to expand the planner drawer; drag it anywhere on screen.
  - Optional Windows auto-start on login (no terminal window).

- **Daily Task & Schedule Manager**
  - Full CRUD for tasks with priority levels, live deadline countdowns, and a 7-day strip plus custom date picker.
  - Natural-language task input (e.g. `"Submit report Nov 30 at 2 PM"`) parsed into date, time, and priority.
  - Deadline reminders 30 minutes before due time.

- **Google Calendar Sync**
  - Pull upcoming events from Google Calendar using your private `.ics` feed URL (auto-syncs on startup or via manual refresh).
  - One-click export of any local task to Google Calendar.

- **Meeting Notetaker (MoM)**
  - Records from your microphone (offline meetings) or mixed system audio + mic (Zoom, Google Meet, Discord) with a live waveform visualizer.
  - Generates structured Minutes of Meeting: summary, key points, action items (1-click add to tasks), and follow-up suggestions.
  - Automatically saves each session (including full transcript) as a `.md` file in `notulensi/`.

- **Multi-Provider Chat & Hands-Free Voice Commands**
  - Switch between **Gemini**, **Groq** (Llama 3.3 70B), and **OpenRouter** in Settings.
  - Local Windows wake-word listener (`"Hey Spooky"` via `System.Speech`, zero API calls while idle) plus a global `Ctrl+Shift+S` hotkey.
  - Supports opening Windows apps, launching URLs/Google searches, starting or stopping meeting recordings, and adding tasks by voice or text.
  - Neural TTS responses synced with on-screen bubbles.

## Project Structure

```text
src/
├── main/
│   ├── main.js              # Electron window, tray, IPC handlers, auto-start
│   ├── aiEngine.js          # Multi-provider chat, task parsing, audio MoM & TTS
│   ├── taskManager.js       # Local JSON task store & deadline reminder loop
│   ├── calendarSync.js      # Zero-dependency iCal (.ics) parser & GCal links
│   ├── jarvisController.js  # Local Windows wake-word listener & app launcher
│   └── configManager.js     # Local config persistence
├── preload/
│   └── preload.js           # Context-isolated IPC bridge
└── renderer/
    ├── index.html
    ├── style.css
    └── app.js
```

## Getting Started

### Prerequisites

- Node.js 18+
- Windows 10/11 (required for local `System.Speech` wake-word detection and system audio capture)
- A [Google AI Studio](https://aistudio.google.com/) API key (used for audio meeting notes, neural TTS, and default chat)

### Installation

```bash
git clone https://github.com/nzrlfrrs/spooky_assistant.git
cd spooky_assistant
npm install
npm start
```

### Configuration

Copy `config.example.json` to `config.json` (or configure directly inside the app under the **Settings** tab):

- **Gemini API Key** — required for meeting audio transcription, MoM generation, and neural TTS.
- **Groq / OpenRouter API Key** *(optional)* — faster or alternative models for chat.
- **Google Calendar iCal URL** *(optional)* — found in Google Calendar under *Settings → Integrate calendar → Secret address in iCal format*.

Local files (`config.json`, `tasks.json`, and `notulensi/`) are gitignored and stay strictly on your machine.

## License

MIT
