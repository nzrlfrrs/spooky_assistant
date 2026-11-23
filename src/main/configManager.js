const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../../config.json');

const DEFAULT_CONFIG = {
  aiProvider: 'gemini',
  geminiApiKey: '',
  groqApiKey: '',
  groqModel: 'llama-3.3-70b-versatile',
  openrouterApiKey: '',
  openrouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
  soundEnabled: true,
  ttsEnabled: true,
  jarvisHandsFree: true,
  nudgeIntervalMinutes: 15
};

class ConfigManager {
  static getConfig() {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      }
    } catch (err) {
      console.warn('[ConfigManager] Error reading config:', err.message);
    }
    return { ...DEFAULT_CONFIG };
  }

  static saveConfig(newConfig) {
    try {
      const current = ConfigManager.getConfig();
      const merged = { ...current, ...newConfig };
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
      return { success: true, config: merged };
    } catch (err) {
      console.error('[ConfigManager] Error saving config:', err);
      return { success: false, error: err.message };
    }
  }
}

module.exports = ConfigManager;
