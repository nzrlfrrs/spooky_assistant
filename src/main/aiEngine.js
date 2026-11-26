const ConfigManager = require('./configManager');

const GEMINI_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.8-flash'
];

function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

class AIEngine {
  static extractText(data) {
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const text = parts
      .filter((p) => typeof p.text === 'string' && !p.thought)
      .map((p) => p.text)
      .join('')
      .trim();
    return text || null;
  }

  static shouldIncludeTasks(query) {
    return /(tugas|jadwal|deadline|agenda|hari ini|besok|minggu|kumpul|rapat|meeting|sibuk|kerjain|kerjaan)/i.test(query || '');
  }

  static buildChatSystemPrompt(query, taskSummary) {
    const base =
      "Kamu adalah Spooky, hantu kecil lucu yang tinggal di layar laptop pengguna dan jadi teman ngobrol dekatnya. " +
      "Ngobrollah seperti teman akrab beneran: santai, hangat, nyambung, sesekali bercanda ringan, dan pakai bahasa Indonesia sehari-hari yang natural (boleh pakai 'aku-kamu' yang luwes, hindari gaya bahasa CS/robot yang kaku). " +
      "Jangan melulu membahas tugas, jadwal, atau produktivitas kalau pengguna sedang ngobrol santai tentang hal lain seperti cuaca, curhat, film, makanan, atau hobi. " +
      "Jawab ringkas dan mengalir (2-4 kalimat), pakai emotikon secukupnya (👻✨) biar hidup.";
    if (taskSummary && AIEngine.shouldIncludeTasks(query)) {
      return (
        `${base}\n\n` +
        `DATA JADWAL ASLI PENGGUNA:\n${taskSummary}\n\n` +
        `ATURAN KETAT JADWAL: Hanya sebutkan tugas/jadwal yang BENAR-BENAR ada di DATA JADWAL ASLI di atas. ` +
        `DILARANG KERAS mengarang, menebak, atau membuat jadwal/meeting fiktif. Jika tertulis KOSONG, bilang jujur bahwa jadwalnya sedang kosong.`
      );
    }
    return base;
  }

  static async callOpenAICompatible(endpoint, apiKey, model, systemInstruction, messages, extraHeaders = {}, jsonMode = false) {
    const payload = {
      model,
      messages: [
        { role: 'system', content: systemInstruction },
        ...messages.map((m) => ({
          role: m.role === 'model' || m.role === 'assistant' ? 'assistant' : 'user',
          content: String(m.text || m.content || '')
        }))
      ],
      temperature: jsonMode ? 0.2 : 0.8,
      max_tokens: jsonMode ? 1024 : 512
    };
    if (jsonMode) payload.response_format = { type: 'json_object' };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12000)
    });

    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${errTxt.slice(0, 120)}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return content ? content.trim() : null;
  }

  static async askAI(userQuery, history = [], taskSummary = '') {
    const config = ConfigManager.getConfig();
    const provider = config.aiProvider || 'gemini';
    const systemInstruction = AIEngine.buildChatSystemPrompt(userQuery, taskSummary);

    // Normalize history turns
    const turns = [];
    if (Array.isArray(history)) {
      history.slice(-16).forEach((m) => {
        if (m && m.text) turns.push({ role: m.role === 'model' ? 'model' : 'user', text: String(m.text) });
      });
    }
    if (!turns.length || turns[turns.length - 1].role !== 'user' || turns[turns.length - 1].text !== userQuery) {
      turns.push({ role: 'user', text: userQuery });
    }

    // 1. Primary provider: Groq
    if (provider === 'groq' && config.groqApiKey && config.groqApiKey.trim()) {
      try {
        const reply = await AIEngine.callOpenAICompatible(
          'https://api.groq.com/openai/v1/chat/completions',
          config.groqApiKey.trim(),
          config.groqModel || 'llama-3.3-70b-versatile',
          systemInstruction,
          turns
        );
        if (reply) return reply;
      } catch (err) {
        console.warn('[AIEngine] Groq chat failed, falling back:', err.message);
      }
    }

    // 2. Primary provider: OpenRouter
    if (provider === 'openrouter' && config.openrouterApiKey && config.openrouterApiKey.trim()) {
      try {
        const reply = await AIEngine.callOpenAICompatible(
          'https://openrouter.ai/api/v1/chat/completions',
          config.openrouterApiKey.trim(),
          config.openrouterModel || 'meta-llama/llama-3.3-70b-instruct:free',
          systemInstruction,
          turns,
          { 'HTTP-Referer': 'https://spooky-assistant.local', 'X-Title': 'Spooky Assistant' }
        );
        if (reply) return reply;
      } catch (err) {
        console.warn('[AIEngine] OpenRouter chat failed, falling back:', err.message);
      }
    }

    // 3. Default / Fallback: Gemini
    const geminiKey = config.geminiApiKey ? config.geminiApiKey.trim() : '';
    if (geminiKey) {
      try {
        const response = await AIEngine.callGeminiText(geminiKey, systemInstruction, turns);
        if (response) return response;
      } catch (err) {
        console.warn('[AIEngine] Gemini API call failed:', err.message);
      }
    }

    return AIEngine.localSmartResponse(userQuery);
  }

  static async callGeminiText(apiKey, systemInstruction, turns) {
    const contents = turns.map((m) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.text }]
    }));

    for (const model of GEMINI_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const body = {
          contents,
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.8
          }
        };

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000)
        });

        if (res.ok) {
          const data = await res.json();
          const text = AIEngine.extractText(data);
          if (text) return text;
        }
      } catch (err) {
        // Try fallback model
      }
    }

    return null;
  }

  // Parse natural language task input into structured task format
  static async parseTaskWithAI(text) {
    const config = ConfigManager.getConfig();
    const apiKey = config.geminiApiKey ? config.geminiApiKey.trim() : '';
    const now = new Date();
    const todayStr = ymd(now);

    if (apiKey) {
      const prompt = `Ekstrak informasi tugas dari teks pengguna berikut ke dalam format JSON murni tanpa markdown wrapper:
Teks: "${text}"
Hari ini: ${todayStr} (Hari: ${now.toLocaleDateString('id-ID', { weekday: 'long' })})

Format JSON yang wajib dihasilkan:
{
  "title": "judul tugas yang bersih dan jelas",
  "date": "YYYY-MM-DD",
  "time": "HH:MM (24-jam format, jika tidak disebutkan default 18:00)",
  "priority": "high" | "medium" | "low"
}`;

      for (const model of GEMINI_MODELS) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          const body = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
          };

          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });

          if (res.ok) {
            const data = await res.json();
            const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawJson) {
              const parsed = JSON.parse(rawJson);
              if (parsed.title) return parsed;
            }
          }
        } catch (e) {
          // fallback
        }
      }
    }

    // Local fallback regex parsing
    let date = todayStr;
    const lower = text.toLowerCase();
    if (lower.includes('besok')) {
      const d = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      date = ymd(d);
    } else if (lower.includes('lusa')) {
      const d = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      date = ymd(d);
    }

    return {
      title: text.replace(/besok|lusa|jam \d+/gi, '').trim() || text,
      date: date,
      time: '18:00',
      priority: lower.includes('penting') || lower.includes('urgent') ? 'high' : 'medium'
    };
  }

  // Generate structured Minutes of Meeting (MoM) with Action Items & Suggestions
  static async generateMeetingNotes(transcript) {
    const config = ConfigManager.getConfig();
    const apiKey = config.geminiApiKey ? config.geminiApiKey.trim() : '';

    if (!transcript || transcript.trim().length === 0) {
      return {
        summary: "Belum ada rekaman suara atau transkrip meeting yang tercatat.",
        keyPoints: [],
        actionItems: [],
        aiSuggestions: ["Nyalakan mikrofon saat meeting dimulai untuk mencatat notulensi otomatis."]
      };
    }

    if (apiKey) {
      const prompt = `Kamu adalah AI Meeting Notetaker & Executive Butler profesional.
Analisis percakapan/transkrip rapat berikut dan buatkan Minutes of Meeting (MoM) yang sangat terstruktur dalam format JSON murni:

Transkrip Rapat:
"""
${transcript}
"""

Hasilkan JSON dengan struktur persis berikut (tanpa blok markdown):
{
  "summary": "Ringkasan eksekutif 2-3 kalimat mengenai hasil dan topik utama rapat.",
  "keyPoints": [
    "Poin pembahasan penting 1",
    "Poin pembahasan penting 2",
    "Keputusan yang disepakati"
  ],
  "actionItems": [
    {
      "task": "Tindakan / tugas spesifik yang harus dikerjakan",
      "assignee": "Nama PIC / Semua Tim",
      "deadline": "Perkiraan waktu deadline (contoh: 'Besok', 'Jumat ini', atau 'Minggu depan')"
    }
  ],
  "aiSuggestions": [
    "Saran strategis / tindak lanjut praktis dari hasil pembicaraan",
    "Potensi risiko atau hal yang perlu diwaspadai"
  ]
}`;

      for (const model of GEMINI_MODELS) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          const body = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.3 }
          };

          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });

          if (res.ok) {
            const data = await res.json();
            const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawJson) {
              const cleaned = rawJson.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
              return JSON.parse(cleaned);
            }
          }
        } catch (err) {
          // fallback
        }
      }
    }

    // Local smart fallback
    return {
      summary: "Transkrip meeting berhasil dicatat secara lokal.",
      keyPoints: [
        "Pembahasan seputar perkembangan pekerjaan dan tugas tim.",
        "Penyelarasan target dan pembagian tanggung jawab."
      ],
      actionItems: [
        {
          task: "Review kembali hasil diskusi rapat",
          assignee: "Saya",
          deadline: "Hari ini"
        }
      ],
      aiSuggestions: [
        "Pastikan action item segera dicatat ke daftar tugas harian agar tidak terlewat."
      ]
    };
  }

  // Analyze recorded meeting audio directly via Gemini multimodal audio input
  static async analyzeMeetingAudio(audioBase64, mimeType = 'audio/webm') {
    const config = ConfigManager.getConfig();
    const apiKey = config.geminiApiKey ? config.geminiApiKey.trim() : '';

    if (!audioBase64) {
      return {
        error: true,
        summary: "Tidak ada data audio yang diterima.",
        transcript: "",
        keyPoints: [],
        actionItems: [],
        aiSuggestions: []
      };
    }

    if (!apiKey) {
      return {
        error: true,
        summary: "Gemini API Key belum diatur. Isi di tab Pengaturan (⚙️) terlebih dahulu.",
        transcript: "",
        keyPoints: [],
        actionItems: [],
        aiSuggestions: ["Tambahkan Gemini API Key di tab Pengaturan agar Spooky bisa mendengarkan audio meeting."]
      };
    }

    const prompt = `Kamu adalah AI Meeting Notetaker & Executive Butler profesional.
Dengarkan rekaman audio rapat/diskusi ini dengan teliti (bisa berbahasa Indonesia, Inggris, atau campuran).
Tugasmu:
1. Buat transkrip yang bersih dan mudah dibaca dari isi pembicaraan.
2. Buat Minutes of Meeting (MoM) yang terstruktur.
3. Ekstrak semua action items / tugas yang perlu dikerjakan beserta perkiraan deadline-nya.
4. Berikan saran strategis / tindak lanjut yang konkret berdasarkan pembicaraan.

Hasilkan JSON murni dengan struktur persis berikut (tanpa markdown):
{
  "transcript": "Transkrip rapi dari isi pembicaraan di audio.",
  "summary": "Ringkasan eksekutif 2-3 kalimat mengenai inti rapat.",
  "keyPoints": [
    "Poin pembahasan penting 1",
    "Poin pembahasan penting 2"
  ],
  "actionItems": [
    {
      "task": "Tugas spesifik yang harus dikerjakan",
      "assignee": "Nama PIC atau Umum",
      "deadline": "Perkiraan deadline (contoh: 'Besok jam 14:00', 'Jumat ini', atau 'Minggu depan')"
    }
  ],
  "aiSuggestions": [
    "Saran strategis / output rekomendasi dari pembicaraan",
    "Hal penting yang perlu di-follow-up"
  ]
}`;

    for (const model of GEMINI_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const body = {
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType.split(';')[0] || 'audio/webm',
                    data: audioBase64
                  }
                }
              ]
            }
          ],
          generationConfig: { responseMimeType: "application/json", temperature: 0.3 }
        };

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(25000)
        });

        if (res.ok) {
          const data = await res.json();
          const rawJson = AIEngine.extractText(data);
          if (rawJson) {
            const cleaned = rawJson.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
            return JSON.parse(cleaned);
          }
        }
      } catch (err) {
        console.warn(`[AIEngine] Audio MoM failed on ${model}:`, err.message);
      }
    }

    return {
      error: true,
      summary: "Gagal memproses audio ke Gemini API. Coba periksa koneksi internet atau API Key di Pengaturan.",
      transcript: "",
      keyPoints: [],
      actionItems: [],
      aiSuggestions: ["Kamu juga bisa menempelkan transkrip teks secara manual lalu klik Buat Notulensi."]
    };
  }

  // Klasifikasi cepat perintah Jarvis berbasis teks (buka app, buka web, rekam rapat, dll.)
  static detectQuickCommand(text) {
    const q = (text || '').trim();
    const low = q.toLowerCase();

    if (/(mulai|start|nyalakan|jalanin|buka).*(rekam|notulen|notulensi|rapat|meeting)/i.test(low)) {
      return { intent: 'start_meeting', target: '', reply: 'Siap! Aku mulai rekam notulensi rapat sekarang ya 🎙️👻' };
    }
    if (/(stop|berhenti|hentikan|selesai|matikan).*(rekam|notulen|notulensi|rapat|meeting)/i.test(low)) {
      return { intent: 'stop_meeting', target: '', reply: 'Oke, rekaman dihentikan! Aku susun notulensinya sekarang ✨' };
    }
    if (/(buka|lihat|tampilkan).*(jadwal|tugas|daftar tugas)/i.test(low)) {
      return { intent: 'open_tasks', target: '', reply: 'Siap, aku bukain daftar tugas dan jadwalmu ya 📜👻' };
    }

    const addMatch = q.match(/^(?:tolong\s+)?(?:tambah(?:in|kan)?|catat(?:in|kan)?|ingatkan|ingetin)\s+(?:tugas\s+|jadwal\s+)?(.+)/i);
    if (addMatch && addMatch[1]) {
      return { intent: 'add_task', target: addMatch[1].trim(), reply: `Oke, aku catat "${addMatch[1].trim()}" ke daftar tugasmu! ✨` };
    }

    const openMatch = q.match(/^(?:tolong\s+)?(?:buka(?:in|kan)?|jalanin|open)\s+(.+)/i);
    if (openMatch && openMatch[1]) {
      const target = openMatch[1].trim();
      const webMap = {
        youtube: 'https://www.youtube.com',
        google: 'https://www.google.com',
        gmail: 'https://mail.google.com',
        github: 'https://github.com',
        chatgpt: 'https://chatgpt.com',
        instagram: 'https://www.instagram.com',
        tiktok: 'https://www.tiktok.com',
        netflix: 'https://www.netflix.com',
        canva: 'https://www.canva.com',
        meet: 'https://meet.google.com',
        'google meet': 'https://meet.google.com',
        drive: 'https://drive.google.com'
      };
      const tLow = target.toLowerCase();
      for (const [k, url] of Object.entries(webMap)) {
        if (tLow === k || tLow.startsWith(k + ' ')) {
          return { intent: 'open_url', target: url, reply: `Siap, aku bukain ${k} sekarang ya 🚀👻` };
        }
      }
      if (/^https?:\/\/|\.(com|id|org|net|io|ai)\b/i.test(target)) {
        return { intent: 'open_url', target, reply: `Oke, aku buka ${target} sekarang! 🌐` };
      }
      return { intent: 'open_app', target, reply: `Siap, aku bukain ${target} sekarang ya 🚀👻` };
    }

    const searchMatch = q.match(/^(?:tolong\s+)?(?:cari(?:in|kan)?|search|googling)\s+(.+?)(?:\s+di\s+google)?$/i);
    if (searchMatch && searchMatch[1]) {
      return {
        intent: 'open_url',
        target: 'https://www.google.com/search?q=' + encodeURIComponent(searchMatch[1].trim()),
        reply: `Siap, aku cariin "${searchMatch[1].trim()}" di Google ya 🔍👻`
      };
    }

    return null;
  }

  // Dengarkan perintah suara Jarvis via Gemini Audio dan keluarkan intent + balasan
  static async processJarvisAudio(audioBase64, mimeType = 'audio/webm', taskSummary = '') {
    const config = ConfigManager.getConfig();
    const apiKey = config.geminiApiKey ? config.geminiApiKey.trim() : '';
    if (!apiKey || !audioBase64) {
      return { intent: 'chat', target: '', transcript: '', reply: 'Maaf, suara belum bisa diproses. Pastikan Gemini API Key terisi ya 👻' };
    }

    const prompt = `Kamu adalah Spooky, asisten suara desktop ala Jarvis yang ramah & santai.
Dengarkan perintah suara pengguna berikut, lalu pahami maksudnya dan keluarkan JSON murni (tanpa markdown):
${taskSummary ? `\nDATA JADWAL ASLI PENGGUNA:\n${taskSummary}\n(Jangan mengarang jadwal yang tidak ada di data ini!)` : ''}

Pilihan "intent":
- "open_app": membuka aplikasi Windows (target: nama app seperti "chrome", "vscode", "spotify", "notepad", "calculator", "discord", "zoom", "whatsapp", "explorer", "word", "excel")
- "open_url": membuka website atau mencari di Google (target: URL lengkap https://...)
- "start_meeting": mulai merekam notulensi rapat
- "stop_meeting": menghentikan rekaman rapat
- "open_tasks": membuka daftar tugas/jadwal
- "add_task": menambah tugas baru (target: kalimat tugas beserta waktunya, misal "Kumpul laporan besok jam 3 sore")
- "chat": jika hanya ngobrol santai atau bertanya biasa (target: "")

Format JSON wajib:
{
  "transcript": "apa yang diucapkan pengguna",
  "intent": "open_app" | "open_url" | "start_meeting" | "stop_meeting" | "open_tasks" | "add_task" | "chat",
  "target": "isi target sesuai intent",
  "reply": "balasan singkat, hangat, & natural dari Spooky (1-2 kalimat bahasa Indonesia)"
}`;

    for (const model of GEMINI_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const body = {
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType.split(';')[0] || 'audio/webm', data: audioBase64 } }
              ]
            }
          ],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.25 }
        };
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000)
        });
        if (res.ok) {
          const data = await res.json();
          const rawJson = AIEngine.extractText(data);
          if (rawJson) {
            const cleaned = rawJson.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
            return JSON.parse(cleaned);
          }
        }
      } catch (err) {
        console.warn(`[AIEngine] Jarvis audio failed on ${model}:`, err.message);
      }
    }

    return { intent: 'chat', target: '', transcript: '', reply: 'Maaf, tadi suaranya kurang jelas. Boleh ulangi lagi? 👻' };
  }

  // Neural Cute TTS via Gemini TTS (suara imut bahasa Indonesia natural)
  static async synthesizeCuteVoice(text) {
    const config = ConfigManager.getConfig();
    const apiKey = config.geminiApiKey ? config.geminiApiKey.trim() : '';
    const clean = String(text || '')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
      .replace(/[*_`#]/g, '')
      .trim();
    if (!apiKey || !clean) return null;

    if (!AIEngine._ttsCache) AIEngine._ttsCache = new Map();
    if (AIEngine._ttsCache.has(clean)) return AIEngine._ttsCache.get(clean);

    const ttsModels = ['gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'];
    const prompt = `Ucapkan kalimat berikut dengan suara yang sangat imut, ceria, lembut, dan menggemaskan seperti karakter hantu kecil animasi yang ramah. Ucapkan hanya kalimat ini saja tanpa tambahan apa pun:\n"${clean}"`;

    for (const model of ttsModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const body = {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Leda' } }
            }
          }
        };
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(12000)
        });
        if (res.ok) {
          const data = await res.json();
          const inline = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
          if (inline && inline.data) {
            const result = { data: inline.data, mimeType: inline.mimeType || 'audio/l16; rate=24000' };
            if (AIEngine._ttsCache.size >= 30) {
              const firstKey = AIEngine._ttsCache.keys().next().value;
              AIEngine._ttsCache.delete(firstKey);
            }
            AIEngine._ttsCache.set(clean, result);
            return result;
          }
        }
      } catch (err) {
        console.warn(`[AIEngine] TTS failed on ${model}:`, err.message);
      }
    }
    return null;
  }

  static async analyzeClassSession({ audioBase64 = '', mimeType = 'audio/webm', transcript = '', slides = [] }) {
    const config = ConfigManager.getConfig();
    const apiKey = config.geminiApiKey ? config.geminiApiKey.trim() : '';

    if (!apiKey) {
      return {
        error: true,
        title: 'Catatan Kelas',
        summary: 'Gemini API Key belum diatur di Tab Pengaturan.',
        transcript: transcript || '',
        concepts: [],
        codeAndSlides: [],
        assignments: [],
        quiz: []
      };
    }

    if (!audioBase64 && !transcript.trim() && (!slides || !slides.length)) {
      return {
        error: true,
        title: 'Catatan Kelas',
        summary: 'Belum ada rekaman suara, slide yang ditangkap, atau teks materi.',
        transcript: '',
        concepts: [],
        codeAndSlides: [],
        assignments: [],
        quiz: []
      };
    }

    const prompt = `Kamu adalah asisten belajar mahasiswa yang cerdas dan jago menjelaskan materi kuliah dengan bahasa Indonesia yang jelas dan runtut.
Analisis seluruh bahan kelas online berikut (rekaman suara dosen, tangkapan layar slide/kode, dan/atau catatan teks) lalu buat Catatan Kuliah terstruktur dalam format JSON murni tanpa markdown:
${transcript ? `\nCatatan/Transkrip Teks:\n"""\n${transcript}\n"""` : ''}

Hasilkan JSON dengan struktur persis berikut:
{
  "title": "Judul topik materi kuliah yang spesifik",
  "transcript": "Transkrip rapi dari penjelasan dosen jika ada audio, atau kosong jika tidak ada audio",
  "summary": "Ringkasan materi 2-4 kalimat yang mudah dipahami",
  "concepts": [
    "Konsep / istilah penting 1: penjelasan singkat",
    "Konsep / istilah penting 2: penjelasan singkat"
  ],
  "codeAndSlides": [
    "Penjelasan kode, rumus, atau isi slide yang terlihat di tangkapan layar"
  ],
  "assignments": [
    {
      "task": "PR, kuis, atau tugas kuliah yang disebutkan",
      "deadline": "Perkiraan deadline jika disebutkan"
    }
  ],
  "quiz": [
    {
      "question": "Pertanyaan latihan untuk menguji pemahaman materi ini",
      "answer": "Jawaban singkat dan tepat"
    }
  ]
}`;

    const parts = [{ text: prompt }];
    if (audioBase64) {
      parts.push({
        inline_data: {
          mime_type: mimeType.split(';')[0] || 'audio/webm',
          data: audioBase64
        }
      });
    }
    if (Array.isArray(slides) && slides.length) {
      slides.slice(-6).forEach((s) => {
        if (s && s.data) {
          parts.push({
            inline_data: {
              mime_type: 'image/jpeg',
              data: s.data
            }
          });
        }
      });
    }

    for (const model of GEMINI_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const body = {
          contents: [{ role: 'user', parts }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 2048 }
        };
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30000)
        });
        if (res.ok) {
          const data = await res.json();
          const rawJson = AIEngine.extractText(data);
          if (rawJson) {
            const cleaned = rawJson.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
            return JSON.parse(cleaned);
          }
        }
      } catch (err) {
        console.warn(`[AIEngine] Class session failed on ${model}:`, err.message);
      }
    }

    return {
      error: true,
      title: 'Catatan Kelas',
      summary: 'Gagal memproses materi kelas ke Gemini API. Coba lagi sebentar ya.',
      transcript: transcript || '',
      concepts: [],
      codeAndSlides: [],
      assignments: [],
      quiz: []
    };
  }

  static async explainScreenNow(screenshotBase64, contextText = '') {
    const config = ConfigManager.getConfig();
    const apiKey = config.geminiApiKey ? config.geminiApiKey.trim() : '';
    if (!apiKey || !screenshotBase64) {
      return 'Belum bisa membaca layar. Pastikan Gemini API Key sudah diisi di Pengaturan ya 👻';
    }

    const prompt =
      'Kamu adalah Spooky, teman belajar yang jago menjelaskan materi kuliah/koding dengan bahasa Indonesia santai dan gampang dipahami. ' +
      'Lihat tangkapan layar kelas online ini (bisa berupa slide, kode, rumus, atau Colab). ' +
      'Jelaskan inti yang sedang dibahas di layar dalam 3-4 kalimat singkat yang langsung paham (tanpa basa-basi panjang).' +
      (contextText ? `\nKonteks catatan barusan:\n${contextText.slice(-500)}` : '');

    for (const model of GEMINI_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const body = {
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                { inline_data: { mime_type: 'image/jpeg', data: screenshotBase64 } }
              ]
            }
          ],
          generationConfig: { maxOutputTokens: 1024, temperature: 0.5 }
        };
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000)
        });
        if (res.ok) {
          const data = await res.json();
          const text = AIEngine.extractText(data);
          if (text) return text;
        }
      } catch (err) {
        console.warn(`[AIEngine] Explain screen failed on ${model}:`, err.message);
      }
    }
    return 'Maaf, gagal membaca layar saat ini. Coba klik lagi sebentar ya 👻';
  }

  static localSmartResponse(query) {
    const q = query.toLowerCase();
    if (q.includes('jadwal') || q.includes('tugas')) {
      return "Kamu bisa cek tab 'Jadwal & Tugas' di dashboard untuk melihat deadline hari ini dan minggu depan ya! 👻📋";
    }
    if (q.includes('rapat') || q.includes('meeting') || q.includes('notulen')) {
      return "Klik tab 'Meeting Notetaker' lalu nyalakan mikrofon, nanti aku catatkan semua poin penting dan tugasnya! 🎙️✨";
    }
    return "Aku di sini siap menemanimu mengatur jadwal dan mencatat notulensi meeting! Ada yang bisa kubantu? 👻🤍";
  }
}

module.exports = AIEngine;
