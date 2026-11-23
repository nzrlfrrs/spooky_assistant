const { spawn, exec } = require('child_process');
const { shell } = require('electron');
const EventEmitter = require('events');

// Daftar aplikasi Windows yang aman dibuka lewat perintah Jarvis
const APP_MAP = {
  chrome: 'start "" chrome',
  browser: 'start "" chrome',
  edge: 'start "" msedge',
  vscode: 'start "" code',
  code: 'start "" code',
  notepad: 'start "" notepad',
  catatan: 'start "" notepad',
  calculator: 'start "" calc',
  kalkulator: 'start "" calc',
  explorer: 'start "" explorer',
  file: 'start "" explorer',
  spotify: 'start "" spotify:',
  discord: 'start "" discord:',
  whatsapp: 'start "" whatsapp:',
  zoom: 'start "" zoommtg:',
  cmd: 'start "" cmd',
  terminal: 'start "" wt',
  powershell: 'start "" powershell',
  paint: 'start "" mspaint',
  word: 'start "" winword',
  excel: 'start "" excel',
  powerpoint: 'start "" powerpnt',
  settings: 'start "" ms-settings:'
};

class JarvisController extends EventEmitter {
  constructor() {
    super();
    this.psProcess = null;
    this.isRunning = false;
    this.isPaused = false;
    this.lastWakeTs = 0;
  }

  startWakeListener() {
    if (this.isRunning || process.platform !== 'win32') return;

    const psScript = `
      Add-Type -AssemblyName System.Speech
      try {
        $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine
        $choices = New-Object System.Speech.Recognition.Choices @("Spooky", "Hey Spooky", "Halo Spooky", "Hello Spooky", "Hi Spooky", "Ok Spooky", "Hey Ghost", "Ghost")
        $gb = New-Object System.Speech.Recognition.GrammarBuilder $choices
        $grammar = New-Object System.Speech.Recognition.Grammar $gb
        $engine.LoadGrammar($grammar)
        $engine.SetInputToDefaultAudioDevice()
        $engine.InitialSilenceTimeout = [TimeSpan]::Zero
        $engine.BabbleTimeout = [TimeSpan]::Zero
        $engine.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(400)
        Register-ObjectEvent -InputObject $engine -EventName SpeechRecognized -Action {
          $res = $Event.SourceEventArgs.Result
          if ($res -ne $null) {
            $conf = [Math]::Round($res.Confidence, 2)
            [Console]::WriteLine("HEARD:" + $res.Text + ":" + $conf)
            if ($res.Confidence -ge 0.35) {
              [Console]::WriteLine("WAKE:" + $res.Text + ":" + $conf)
            }
            [Console]::Out.Flush()
          }
        } | Out-Null
        $engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
        [Console]::WriteLine("READY")
        [Console]::Out.Flush()
        while ($true) {
          Start-Sleep -Milliseconds 500
        }
      } catch {
        [Console]::WriteLine("ERR:" + $_.Exception.Message)
        [Console]::Out.Flush()
      }
    `;

    try {
      this.psProcess = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      this.isRunning = true;

      this.psProcess.stdout.on('data', (chunk) => {
        const lines = chunk.toString('utf8').split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed === 'READY' || trimmed.startsWith('HEARD:') || trimmed.startsWith('ERR:')) {
            console.log('[Jarvis]', trimmed);
          }
          if (trimmed.startsWith('WAKE:')) {
            const now = Date.now();
            if (!this.isPaused && now - this.lastWakeTs > 4500) {
              this.lastWakeTs = now;
              this.emit('wake', { raw: trimmed });
            }
          }
        }
      });

      this.psProcess.on('exit', () => {
        this.isRunning = false;
        this.psProcess = null;
      });
    } catch (err) {
      console.warn('[JarvisController] Failed to start wake listener:', err.message);
      this.isRunning = false;
    }
  }

  setPaused(paused) {
    this.isPaused = !!paused;
  }

  stopWakeListener() {
    this.isRunning = false;
    if (this.psProcess) {
      try {
        this.psProcess.kill();
      } catch {}
      this.psProcess = null;
    }
  }

  // Eksekusi perintah OS yang aman (buka aplikasi atau URL)
  static executeSystemAction(intent, target) {
    if (intent === 'open_app' && target) {
      const key = String(target).toLowerCase().trim();
      for (const [alias, cmd] of Object.entries(APP_MAP)) {
        if (key.includes(alias)) {
          exec(cmd, { windowsHide: true });
          return { ok: true, launched: alias };
        }
      }
      return { ok: false, reason: `Aplikasi "${target}" belum terdaftar.` };
    }

    if (intent === 'open_url' && target) {
      let url = String(target).trim();
      if (!/^https?:\/\//i.test(url)) {
        if (url.includes('.') && !url.includes(' ')) {
          url = 'https://' + url;
        } else {
          url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
        }
      }
      shell.openExternal(url);
      return { ok: true, launched: url };
    }

    return { ok: false };
  }
}

module.exports = JarvisController;
