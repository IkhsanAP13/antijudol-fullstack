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

let deviceId = null;
let logQueue = [];
let blocklist = [];
let flushTimer = null;

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
      await updateNetRequestRules(blocklist);
      console.log("Blocklist updated:", blocklist.length, "domains");
    }
  } catch (error) {
    console.error("Failed to update blocklist:", error);
    const stored = await chrome.storage.local.get(["blocklist"]);
    blocklist = stored.blocklist || getDefaultBlocklist();
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
        condition: { regexFilter: rx, resourceTypes: ["main_frame"] },
      });
      rules.push({
        id: 2000 + i,
        priority: 2,
        action: { type: "block" },
        condition: { regexFilter: rx, resourceTypes: ["sub_frame"] },
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
    await fetch(`${CONFIG.API_ENDPOINT}/redirect/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  return gamblingPatterns.some((pattern) => pattern.test(url));
}

// Cek apakah URL cocok dengan salah satu pola di blocklist (DB/admin)
function matchesBlocklist(url) {
  if (!blocklist || blocklist.length === 0) return false;
  const lower = url.toLowerCase();
  return blocklist.some((pattern) => {
    // Ambil "inti" pola: buang protokol & karakter wildcard (* : / )
    const core = String(pattern)
      .toLowerCase()
      .replace(/^\*?:?\/?\/?/, "")
      .replace(/[*]/g, "")
      .replace(/^\/+|\/+$/g, "")
      .trim();
    return core.length >= 3 && lower.includes(core);
  });
}

// Log blocked content
async function logBlock(type, url, details = {}) {
  await ensureDeviceId();
  const log = {
    deviceId,
    timestamp: new Date().toISOString(),
    type, // 'site' atau 'ad'
    url,
    ...details,
  };

  logQueue.push(log);

  // Update stats
  const { stats } = await chrome.storage.local.get(["stats"]);
  const s = stats || { sitesBlocked: 0, adsBlocked: 0, lastSync: Date.now() };
  if (type === "site") s.sitesBlocked++;
  if (type === "ad") s.adsBlocked++;
  await chrome.storage.local.set({ stats: s });

  // Autosave: kirim segera jika batch penuh, atau dalam 2 detik (debounced)
  if (logQueue.length >= CONFIG.LOG_BATCH_SIZE) {
    await flushLogs();
  } else {
    scheduleFlush();
  }
}

// Send logs to backend
async function flushLogs() {
  if (logQueue.length === 0) return;

  const logsToSend = [...logQueue];
  logQueue = [];

  try {
    await fetch(`${CONFIG.API_ENDPOINT}/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logs: logsToSend }),
    });
    console.log("Logs sent:", logsToSend.length);
  } catch (error) {
    console.error("Failed to send logs:", error);
    logQueue = [...logsToSend, ...logQueue]; // re-queue
  }
}

// Send heartbeat to backend
async function sendHeartbeat() {
  try {
    await ensureDeviceId();
    const { stats } = await chrome.storage.local.get(["stats"]);
    await fetch(`${CONFIG.API_ENDPOINT}/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId,
        timestamp: new Date().toISOString(),
        stats: stats || { sitesBlocked: 0, adsBlocked: 0 },
      }),
    });
    console.log("Heartbeat sent");
  } catch (error) {
    console.error("Heartbeat failed:", error);
  }
}

// Handle alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "heartbeat") {
    sendHeartbeat();
  } else if (alarm.name === "syncBlocklist") {
    updateBlocklist();
  } else if (alarm.name === "flushLogs") {
    flushLogs();
  } else if (alarm.name === "syncRedirectConfig") {
    updateRedirectConfig();
  }
});

// Pemblokiran + redirect situs judi kini sepenuhnya ditangani declarativeNetRequest
// (rules.json + dynamic rules), sehingga bekerja walau service worker sedang mati.
// Pencatatan log dilakukan oleh halaman blocked.html yang mengirim pesan 'siteBlocked'.

// Listen for messages from content script, popup & halaman blokir
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "siteBlocked") {
    logBlock("site", message.url || "unknown", { reason: "blocked site" });
    sendResponse({ success: true });
  } else if (message.type === "adBlocked") {
    logBlock("ad", message.url, {
      selector: message.selector,
      reason: message.reason,
      tabId: sender.tab?.id,
    });
    sendResponse({ success: true });
  } else if (message.type === "getStats") {
    chrome.storage.local.get(["stats"]).then(({ stats }) => {
      sendResponse(stats || { sitesBlocked: 0, adsBlocked: 0 });
    });
    return true; // async response
  } else if (message.type === "rgGetConfig") {
    // Kirim config + whitelist (global admin + lokal) ke bridge
    getLocalWhitelist().then((localWhitelist) => {
      sendResponse({
        config: {
          enabled: redirectConfig.enabled,
          sensitivity: redirectConfig.sensitivity,
        },
        globalWhitelist: redirectConfig.whitelist || [],
        localWhitelist,
      });
    });
    return true;
  } else if (message.type === "rgLog") {
    postRedirectLog(message.entry || {});
    sendResponse({ success: true });
  } else if (message.type === "rgAllowOnce") {
    // Buka tujuan yang tadi dibatalkan (Allow Once)
    const url = message.url;
    if (url) {
      if (message.method === "window.open") {
        chrome.tabs.create({ url });
      } else if (sender.tab && sender.tab.id != null) {
        chrome.tabs.update(sender.tab.id, { url });
      } else {
        chrome.tabs.create({ url });
      }
    }
    sendResponse({ success: true });
  } else if (message.type === "rgWhitelistLocal") {
    addLocalWhitelist(message.domain).then((list) =>
      sendResponse({ success: true, localWhitelist: list }),
    );
    return true;
  }
});

console.log("ANTI-JUDOL Background Service Worker Ready");
