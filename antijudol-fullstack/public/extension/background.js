// ANTI-JUDOL Background Service Worker
// ─────────────────────────────────────────────────────────────────────────────
// GANTI API_ENDPOINT sesuai lokasi backend:
//   • Lokal (uji di 1 laptop):  'http://localhost:3001/api'
//   • Online (Railway/produksi): 'https://NAMA-APP.up.railway.app/api'  (WAJIB https)
// Setelah mengganti, reload extension di chrome://extensions.
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  API_ENDPOINT: "https://antijudol-fullstack.vercel.app/api",
  HEARTBEAT_INTERVAL: 60000, // 1 menit
  LOG_BATCH_SIZE: 10,
  SYNC_INTERVAL: 300000, // 5 menit
};

// Domain tepercaya yang TIDAK PERNAH dikenai aturan DNR (agar Gmail/Google Workspace,
// aplikasi besar, dsb. tidak salah blokir — mereka memuat konten via iframe lintas-domain).
const TRUSTED_DNR_DOMAINS = [
  "google.com", "googleusercontent.com", "gstatic.com", "googleapis.com",
  "youtube.com", "ytimg.com", "ggpht.com",
  "microsoft.com", "microsoftonline.com", "office.com", "office365.com",
  "live.com", "outlook.com", "bing.com", "sharepoint.com",
  "github.com", "githubusercontent.com", "githubassets.com",
  "apple.com", "icloud.com", "whatsapp.com", "telegram.org",
  "discord.com", "discordapp.com", "slack.com", "zoom.us",
  "notion.so", "figma.com", "canva.com", "dropbox.com",
  "netflix.com", "spotify.com", "facebook.com", "fbcdn.net",
  "instagram.com", "twitter.com", "x.com", "twimg.com",
  "linkedin.com", "licdn.com", "tiktok.com", "reddit.com",
  "redditstatic.com", "wikipedia.org", "wikimedia.org",
];

let deviceId = null;
let deviceToken = null; // token rahasia per perangkat (anti-spoof laporan)
let logQueue = [];
let blocklist = [];
let flushTimer = null;

// Muat token perangkat dari storage (sync lebih dulu agar tahan reinstall)
async function ensureDeviceToken() {
  if (deviceToken) return deviceToken;
  try {
    const s = await chrome.storage.sync.get(["deviceToken"]);
    if (s.deviceToken) deviceToken = s.deviceToken;
  } catch (e) {}
  if (!deviceToken) {
    const l = await chrome.storage.local.get(["deviceToken"]);
    if (l.deviceToken) deviceToken = l.deviceToken;
  }
  return deviceToken;
}

// Header untuk request laporan ke backend (sertakan token perangkat bila ada)
function reportHeaders() {
  const h = { "Content-Type": "application/json" };
  if (deviceToken) h["Authorization"] = "Bearer " + deviceToken;
  return h;
}

// Jadwalkan autosave cepat ke database (debounce 2 detik setelah blokir terakhir)
function scheduleFlush() {
  if (flushTimer) return; // sudah dijadwalkan
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushLogs();
  }, 2000);
}

// ─── Inisialisasi state (dipanggil di banyak titik karena SW MV3 mudah mati) ──
// Device ID unik & stabil:
//  1) storage.sync  → BERTAHAN saat ekstensi di-install ulang (bila profil Chrome sama)
//  2) storage.local → migrasi ID lama agar tidak jadi perangkat baru
//  3) crypto.randomUUID() → generate baru bila belum ada
async function ensureDeviceId() {
  if (deviceId) return deviceId;
  try {
    const s = await chrome.storage.sync.get(["deviceId"]);
    if (s.deviceId) deviceId = s.deviceId;
  } catch (e) {
    /* storage.sync bisa dinonaktifkan di lingkungan tertentu */
  }
  if (!deviceId) {
    const l = await chrome.storage.local.get(["deviceId"]);
    deviceId = l.deviceId || generateDeviceId();
    try {
      await chrome.storage.sync.set({ deviceId });
    } catch (e) {}
  }
  await chrome.storage.local.set({ deviceId });
  return deviceId;
}

async function ensureStats() {
  const { stats } = await chrome.storage.local.get(["stats"]);
  if (!stats) {
    await chrome.storage.local.set({
      stats: { sitesBlocked: 0, adsBlocked: 0, lastSync: Date.now() },
    });
  }
}

// Setup penuh: dipanggil saat install & startup
async function initialize() {
  await ensureDeviceId();
  await ensureDeviceToken();
  await ensureStats();
  await registerDevice();
  await updateBlocklist();

  // Alarm periodik (idempotent: aman dibuat ulang)
  chrome.alarms.create("heartbeat", { periodInMinutes: 0.5 });
  chrome.alarms.create("syncBlocklist", { periodInMinutes: 1 });
  chrome.alarms.create("flushLogs", { periodInMinutes: 5 });
  chrome.alarms.create("syncRedirectConfig", { periodInMinutes: 1 });

  // Ambil config proteksi redirect
  await updateRedirectConfig();

  // Kirim heartbeat sekali langsung supaya dashboard cepat update
  await sendHeartbeat();
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("ANTI-JUDOL Extension Installed");
  initialize();
});

chrome.runtime.onStartup.addListener(() => {
  console.log("ANTI-JUDOL Extension Startup");
  initialize();
});

// Generate unique device ID (UUID v4 bila tersedia)
function generateDeviceId() {
  if (self.crypto && typeof crypto.randomUUID === "function") {
    return "device_" + crypto.randomUUID();
  }
  return "device_" + Math.random().toString(36).substr(2, 9) + "_" + Date.now();
}

// Register device with backend
async function registerDevice() {
  try {
    await ensureDeviceId();
    const info = await getDeviceInfo();
    const deviceInfo = {
      deviceId: deviceId,
      extensionVersion: chrome.runtime.getManifest().version,
      browser: getBrowserInfo(),
      os: info.os,
      osVersion: info.osVersion,
      registeredAt: new Date().toISOString(),
    };

    const response = await fetch(`${CONFIG.API_ENDPOINT}/devices/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deviceInfo),
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      // Simpan token perangkat (hanya diterbitkan sekali saat enroll pertama)
      if (data && data.deviceToken) {
        deviceToken = data.deviceToken;
        try {
          await chrome.storage.sync.set({ deviceToken });
        } catch (e) {}
        await chrome.storage.local.set({ deviceToken });
      }
      console.log("Device registered successfully");
    }
  } catch (error) {
    console.error("Failed to register device:", error);
  }
}

// Get browser information
function getBrowserInfo() {
  const ua = navigator.userAgent;
  if (ua.includes("Edg")) return "Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  return "Unknown";
}

// Ambil OS & versinya (data yang diizinkan untuk ekstensi)
async function getDeviceInfo() {
  const OS_LABEL = { win: "Windows", mac: "macOS", linux: "Linux", cros: "ChromeOS", android: "Android", openbsd: "OpenBSD" };
  let os = "Unknown";
  let osVersion = "";
  try {
    const platform = await chrome.runtime.getPlatformInfo(); // { os, arch }
    os = OS_LABEL[platform.os] || platform.os || "Unknown";
  } catch (e) {}
  try {
    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
      const hi = await navigator.userAgentData.getHighEntropyValues(["platformVersion"]);
      osVersion = hi.platformVersion || "";
    }
  } catch (e) {}
  return { os, osVersion };
}

// Update blocklist from server
async function updateBlocklist() {
  try {
    const response = await fetch(`${CONFIG.API_ENDPOINT}/blocklist`);
    if (response.ok) {
      blocklist = await response.json();
      await chrome.storage.local.set({
        blocklist,
        lastBlocklistUpdate: Date.now(),
      });
      console.log("Blocklist updated:", blocklist.length, "domains");
    }
  } catch (error) {
    console.error("Failed to update blocklist:", error);
    const stored = await chrome.storage.local.get(["blocklist"]);
    blocklist = stored.blocklist || getDefaultBlocklist();
  }
  // Selalu bangun ulang aturan DNR (mis. saat reload agar pengecualian domain
  // tepercaya diterapkan) walau fetch blocklist gagal / memakai cache.
  try {
    await updateNetRequestRules(blocklist);
  } catch (e) {
    console.error("Failed to (re)build DNR rules:", e);
  }
}

// Ubah pola blocklist ("*://bet*.com/*" atau "ratu5.sbs") jadi regex RE2 utuh.
// Match seluruh URL agar \0 pada regexSubstitution = URL asli.
function patternToRegex(pattern) {
  let p = String(pattern)
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // escape karakter regex
    .replace(/\*/g, ".*"); // wildcard -> .*
  return ".*" + p + ".*";
}

// Update declarativeNetRequest dynamic rules:
//  - main_frame  -> REDIRECT ke halaman blokir (dijalankan mesin browser,
//                   tidak bergantung service worker; membawa URL asli via \0)
//  - sub_frame   -> BLOCK diam-diam (iklan iframe judi)
async function updateNetRequestRules(domains) {
  const blockedPage = chrome.runtime.getURL("blocked.html");
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((r) => r.id);

  const buildRules = (useUrlParam) => {
    const rules = [];
    domains.forEach((domain, i) => {
      const rx = patternToRegex(domain);
      rules.push({
        id: 1000 + i,
        priority: 2,
        action: {
          type: "redirect",
          redirect: useUrlParam
            ? { regexSubstitution: blockedPage + "?u=\\0" }
            : { extensionPath: "/blocked.html" },
        },
        condition: {
          regexFilter: rx,
          resourceTypes: ["main_frame"],
          excludedInitiatorDomains: TRUSTED_DNR_DOMAINS,
          excludedRequestDomains: TRUSTED_DNR_DOMAINS,
        },
      });
      rules.push({
        id: 2000 + i,
        priority: 2,
        action: { type: "block" },
        condition: {
          regexFilter: rx,
          resourceTypes: ["sub_frame"],
          excludedInitiatorDomains: TRUSTED_DNR_DOMAINS,
          excludedRequestDomains: TRUSTED_DNR_DOMAINS,
        },
      });
    });
    return rules;
  };

  try {
    // Coba redirect dengan URL asli (regexSubstitution)
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules: buildRules(true),
    });
  } catch (error) {
    console.warn("regexSubstitution ditolak, pakai extensionPath:", error);
    try {
      // Fallback: redirect ke halaman blokir tanpa parameter URL
      const current = await chrome.declarativeNetRequest.getDynamicRules();
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: current.map((r) => r.id),
        addRules: buildRules(false),
      });
    } catch (e2) {
      console.error("Failed to update rules:", e2);
    }
  }
}

// Default blocklist
function getDefaultBlocklist() {
  return [
    "*bet*",
    "*casino*",
    "*poker*",
    "*gambling*",
    "*slot*",
    "*judi*",
    "*taruhan*",
    "*togel*",
    "*gacor*",
    "*maxwin*",
    "*scatter*",
    "*sigacor*",
    "*bandar*",
    "*pragmatic*",
    "*sbobet*",
    "*rungkad*",
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// MALICIOUS REDIRECT PROTECTION — config & log
// ═══════════════════════════════════════════════════════════════════════════
let redirectConfig = { enabled: true, sensitivity: "medium", whitelist: [] };

// Ambil konfigurasi proteksi redirect dari backend (dikelola admin di dashboard)
async function updateRedirectConfig() {
  try {
    const res = await fetch(`${CONFIG.API_ENDPOINT}/redirect/config`);
    if (res.ok) {
      const data = await res.json();
      redirectConfig = {
        enabled: data.enabled !== false,
        sensitivity: data.sensitivity || "medium",
        whitelist: Array.isArray(data.whitelist) ? data.whitelist : [],
      };
      await chrome.storage.local.set({ redirectConfig });
    }
  } catch (e) {
    const stored = await chrome.storage.local.get(["redirectConfig"]);
    if (stored.redirectConfig) redirectConfig = stored.redirectConfig;
  }
}

// Whitelist LOKAL per-browser (dari tombol "Whitelist" di notifikasi)
async function getLocalWhitelist() {
  const { rgLocalWhitelist } = await chrome.storage.local.get([
    "rgLocalWhitelist",
  ]);
  return Array.isArray(rgLocalWhitelist) ? rgLocalWhitelist : [];
}

async function addLocalWhitelist(domain) {
  const list = await getLocalWhitelist();
  const d = String(domain || "")
    .toLowerCase()
    .replace(/^www\./, "");
  if (d && !list.includes(d)) list.push(d);
  await chrome.storage.local.set({ rgLocalWhitelist: list });
  return list;
}

// Kirim log redirect yang diblokir ke backend (tampil di dashboard)
async function postRedirectLog(entry) {
  try {
    await ensureDeviceId();
    await ensureDeviceToken();
    await fetch(`${CONFIG.API_ENDPOINT}/redirect/logs`, {
      method: "POST",
      headers: reportHeaders(),
      body: JSON.stringify({
        deviceId,
        target: entry.target || "",
        from: entry.from || "",
        reason: entry.reason || "",
        method: entry.method || "",
        timestamp: new Date(entry.ts || Date.now()).toISOString(),
      }),
    });
  } catch (e) {
    console.error("Failed to post redirect log:", e);
  }
}

// Check if URL matches gambling patterns
function isGamblingUrl(url) {
  const gamblingPatterns = [
    /bet/i,
    /casino/i,
    /poker/i,
    /gambling/i,
    /slot/i,
    /judi/i,
    /taruhan/i,
    /togel/i,
    /jackpot/i,
    /roulette/i,
    /gacor/i,
    /maxwin/i,
    /scatter/i,
    /sigacor/i,
    /bandar/i,
    /pragmatic/i,
    /sbobet/i,
    /rungkad/i,
    /cuan/i,
    /\bhoki/i,
  ];
  return gambli