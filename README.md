# 👻 Spooky — Dynamic Mini Ghost AI Assistant

Asisten desktop dinamis bertema *haunted glass* dengan karakter hantu mini interaktif untuk membantu mengatur jadwal tugas harian, mencatat notulensi rapat secara otomatis, ngobrol santai, dan menjalankan perintah suara ala Jarvis.

## ✨ Fitur Utama

1. **Karakter Mini Ghost Dinamis & Interaktif**
   - Melayang ringan di desktop dengan animasi ujung kain tertiup angin, mata mengikuti kursor, berkedip natural, dan memakai headset menyala saat merekam rapat.
   - Panel dashboard muncul menyatu dari karakter hantu, dengan selebrasi putaran 3D volumetrik saat tugas diselesaikan.
2. **Smart Daily Task & Schedule Manager (CRUD Lengkap)**
   - Cincin progres harian, strip 7 hari + pemilih tanggal bebas (`Pilih 📅`), hitung mundur deadline hidup, dan pengingat otomatis menjelang batas waktu.
   - Tambah tugas pakai bahasa natural (*"Kumpul laporan 30 Nov jam 2 siang"*) atau form manual (`📅`), klik kartu untuk edit, centang untuk selebrasi, atau hapus.
3. **Live Meeting Notetaker & AI MoM (Online / Offline)**
   - Mendukung rekaman **Mikrofon (Offline)** maupun **Sistem + Mic (Zoom/Meet/Discord)** dengan *live audio waveform*.
   - Menghasilkan transkrip, ringkasan, poin utama, saran strategis AI, dan **Action Items** dengan tombol 1-klik `+ Jadwal`.
   - Otomatis tersimpan sebagai file Markdown di folder `notulensi/` lengkap dengan tombol **Buka File** & **Buka Folder**.
4. **Tab Tanya Multi-Provider AI & Memori Percakapan**
   - Mendukung **Gemini**, **Groq (Llama 3.3 70B)**, dan **OpenRouter** yang bisa diganti lewat Tab Pengaturan (`⚙️`).
   - Memori percakapan multi-turn + akurat membaca jadwal asli tanpa mengarang.
5. **Jarvis Hands-Free (`"Hey Spooky"`) & Sistem Suara**
   - Deteksi panggilan lokal di Windows (`System.Speech`, 0% kuota internet saat standby) untuk membuka aplikasi/website, memulai/menghentikan notulensi rapat, atau menambah tugas.
   - Dilengkapi efek suara Web Audio dan suara bicara (TTS) yang bisa diatur di Pengaturan.

## 🚀 Cara Menjalankan

```bash
npm install
npm start
```

Buka tab **Atur (`⚙️`)** untuk mengisi API Key (Gemini / Groq / OpenRouter) dan mengatur preferensi suara atau mode Jarvis.
