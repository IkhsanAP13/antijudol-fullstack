# Changelog — ANTI-JUDOL

Semua penambahan dan perbaikan fitur signifikan pada sistem ANTI-JUDOL
(dashboard admin, backend, dan browser extension).

## [Unreleased] — 2026-07-02

### Dashboard Admin

- **Tema Dark/Light mode** dengan tombol toggle di header; pilihan disimpan ke
  `localStorage` dan mengikuti preferensi sistem.
  Berkas: `src/context/ThemeContext.tsx`, `src/components/ThemeToggle.tsx`,
  `src/App.tsx`, `src/pages/Dashboard.tsx`.
- **Indikator koneksi extension** (badge "Extension Online/Terputus") dan waktu
  update terakhir di header.
- **Polling dipercepat** dari 30 detik menjadi 10 detik agar terasa real-time.
- **Statistik memakai data asli** (bukan angka contoh): grafik konten diblokir
  per hari dan distribusi situs vs iklan. Berkas: `src/components/dashboard/Statistics.tsx`.
- **Real-time Alerts** menampilkan aktivitas pemblokiran terbaru dari data nyata.
  Berkas: `src/components/dashboard/RealtimeAlerts.tsx`.
- **Status device** dihitung dari `last_seen` (online bila aktif < 5 menit).

### Koneksi Extension ↔ Backend

- Perbaikan endpoint API extension dari alamat placeholder ke `http://localhost:3001/api`.
- Registrasi perangkat + heartbeat menjadi andal: berjalan ulang saat browser
  start dan dikirim setiap 1 menit sehingga status "online" bertahan.
  Berkas: `public/extension/background.js`.

### Pemblokiran Iklan Judol

- Deteksi banner via `href`/`alt`/`src` + daftar kata kunci judol Indonesia diperluas.
- **Deteksi banner berbasis struktur**: link `target="_blank"` ke domain eksternal
  yang berisi gambar berukuran banner (menangani iklan gambar-only).
- **Penghapusan pop-up / iklan melayang** (`position: fixed`/`sticky`) otomatis
  tanpa perlu menekan tombol "CLOSE".
- **Autosave iklan diblokir** ke database dipercepat (~2 detik, debounced) dan
  mencatat domain halaman asal iklan.
- **Tab "Iklan Diblokir"** di dashboard: ringkasan, domain judol teratas, dan
  tabel hasil. Berkas: `src/components/dashboard/BlockedAds.tsx`.
- API `GET /api/logs` mendukung filter `?type=ad` dan mengembalikan `reason`.

### Pemblokiran Situs Judi

- **Tab "Blokir Situs"** untuk mengelola domain (tambah/hapus); disinkronkan ke
  extension setiap 1 menit. Berkas: `src/components/dashboard/SiteBlocking.tsx`.
- **Deteksi situs judi berbasis isi halaman** (anti-bypass domain acak) dengan
  penilaian sinyal judi pada konten.
- **Halaman blokir bermerek** `blocked.html` via `declarativeNetRequest` redirect,
  bekerja walau service worker sedang mati (SW-independent).
- Pencatatan blokir situs ke database melalui pesan dari halaman blokir.

### Anti Overblocking (Deteksi Lebih Cerdas)

- **Allowlist** mesin pencari (Google, Bing, DuckDuckGo, dll.), TLD tepercaya
  (`.go.id`, `.ac.id`, `.edu`, `.gov`), situs berita, dan platform besar —
  tidak pernah diblokir.
- **Scoring multi-indikator berbasis 5 kategori** (domain, jargon, transaksi,
  data live, meta): situs diblokir hanya jika ≥ 3 kategori menyala atau
  kombinasi domain-judol + jargon.
- **Penyaring hasil pencarian**: menyembunyikan entri hasil judol/deface di
  Google/Bing sementara hasil sah tetap tampil.
  Berkas: `public/extension/content.js`.

### Konten Halaman Blokir

- Menampilkan **dasar hukum**: UU ITE Pasal 27 ayat (2) jo. Pasal 45 ayat (3)
  (penjara ≤ 10 tahun / denda ≤ Rp10 miliar) serta Pasal 303 KUHP.
- **Audio alarm EAS** saat halaman blokir / notifikasi muncul, dengan fallback
  bila autoplay diblokir browser. Berkas: `public/extension/blocked.js`,
  `public/extension/alert.mp3`.
- Perbaikan error **Content Security Policy** MV3: script inline dipindahkan ke
  berkas eksternal `blocked.js`.

### Malicious Redirect Protection

- **Guard (MAIN world)**: mencegat `window.open`, `location.assign`, dan
  `location.replace`; melacak gesture pengguna; mendeteksi klik area kosong /
  overlay tersembunyi; menetralkan `meta refresh` lintas-domain.
  Berkas: `public/extension/redirect-guard.js`.
- **Bridge (isolated world)**: notifikasi in-page dengan tombol **Izinkan Sekali**,
  **Whitelist domain**, dan **Tutup**. Berkas: `public/extension/redirect-bridge.js`.
- Pengecualian otomatis untuk login/OAuth, pembayaran, dan CAPTCHA; ditambah
  whitelist global (admin) dan lokal (per-browser).
- **Endpoint & tabel backend** dibuat otomatis saat start (`redirect_settings`,
  `redirect_whitelist`, `redirect_logs`): `GET/POST /api/redirect/config`,
  `POST /api/redirect/whitelist`, `GET/POST /api/redirect/logs`.
  Berkas: `server.js`.
- **Tab "Proteksi Redirect"** di dashboard: on/off, sensitivitas (Low/Medium/High),
  kelola whitelist, dan tabel log. Berkas: `src/components/dashboard/RedirectProtection.tsx`.

### Catatan Teknis

- Intersepsi langsung `location.href = "..."` tidak dapat dibungkus dari
  JavaScript (properti non-configurable browser); dimitigasi oleh deteksi situs
  judi + blocklist DNR.
- Audio alarm EAS berdurasi ± 26 detik; dapat dipotong / dihentikan otomatis
  bila diperlukan.

---

### Cara Menerapkan Perubahan

1. Build ulang frontend bila ada perubahan dashboard: `npm run build`
2. Jalankan server: `node .\server.js` (tabel proteksi redirect dibuat otomatis)
3. Reload extension di `chrome://extensions` (tombol 🔄) bila ada perubahan
   pada berkas `public/extension/`.
