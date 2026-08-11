const CONFIG = {
  API_ENDPOINT: "https://antijudol-fullstack.vercel.app/api",
  HEARTBEAT_INTERVAL: 60000,
  LOG_BATCH_SIZE: 10,
  SYNC_INTERVAL: 300000,
};

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
let deviceToken = null;
let logQueue = [];
let blocklist = [];
let flushTimer = null;

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

function reportHeaders() {
  const h = { "Content-Type": "application/json" };
  if (deviceToken) h["Authorization"] = "Bearer " + deviceToken;
  return h;
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushLogs();
  }, 2000);
}

async function ensureDeviceId() {
  if (deviceId) return deviceId;
  try {
    const s = await chrome.storage.sync.get(["deviceId"]);
    if (s.deviceId) deviceId = s.deviceId;
  } catch (e) {

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

async function initialize() {
  await ensureDeviceId();
  await ensureDeviceToken();
  await ensureStats();
  await registerDevice();
  await updateBlocklist();

  chrome.alarms.create("heartbeat", { periodInMinutes: 0.5 });
  chrome.alarms.create("syncBlocklist", { periodInMinutes: 1 });
  chrome.alarms.create("flushLogs", { periodInMinutes: 5 });
  chrome.alarms.create("syncRedirectConfig", { periodInMinutes: 1 });

  await updateRedirectConfig();

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

function generateDeviceId() {
  if (self.crypto && typeof crypto.randomUUID === "function") {
    return "device_" + crypto.randomUUID();
  }
  return "device_" + Math.random().toString(36).substr(2, 9) + "_" + Date.now();
}

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

function getBrowserInfo() {
  const ua = navigator.userAgent;
  if (ua.includes("Edg")) return "Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  return "Unknown";
}

async function getDeviceInfo() {
  const OS_LABEL = { win: "Windows", mac: "macOS", linux: "Linux", cros: "ChromeOS", android: "Android", openbsd: "OpenBSD" };
  let os = "Unknown";
  let osVersion = "";
  try {
    const platform = await chrome.runtime.getPlatformInfo();
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

  try {
    await updateNetRequestRules(blocklist);
  } catch (e) {
    console.error("Failed to (re)build DNR rules:", e);
  }
}

function patternToRegex(pattern) {
  let p = String(pattern)
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return ".*" + p + ".*";
}

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

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules: buildRules(true),
    });
  } catch (error) {
    console.warn("regexSubstitution ditolak, pakai extensionPath:", error);
    try {

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

let redirectConfig = { enabled: true, sensitivity: "medium", whitelist: [] };

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

function matchesBlocklist(url) {
  if (!blocklist || blocklist.length === 0) return false;
  const lower = url.toLowerCase();
  return blocklist.some((pattern) => {

    const core = String(pattern)
      .toLowerCase()
      .replace(/^\*?:?\/?\/?/, "")
      .replace(/[*]/g, "")
      .replace(/^\/+|\/+$/g, "")
      .trim();
    return core.length >= 3 && lower.includes(core);
  });
}

async function logBlock(type, url, details = {}) {
  await ensureDeviceId();
  const log = {
    deviceId,
    timestamp: new Date().toISOString(),
    type,
    url,
    ...details,
  };

  logQueue.push(log);

  const { stats } = await chrome.storage.local.get(["stats"]);
  const s = stats || { sitesBlocked: 0, adsBlocked: 0, lastSync: Date.now() };
  if (type === "site") s.sitesBlocked++;
  if (type === "ad") s.adsBlocked++;
  await chrome.storage.local.set({ stats: s });

  if (logQueue.length >= CONFIG.LOG_BATCH_SIZE) {
    await flushLogs();
  } else {
    scheduleFlush();
  }
}

async function flushLogs() {
  if (logQueue.length === 0) return;

  const logsToSend = [...logQueue];
  logQueue = [];

  try {
    await ensureDeviceToken();
    await fetch(`${CONFIG.API_ENDPOINT}/logs`, {
      method: "POST",
      headers: reportHeaders(),
      body: JSON.stringify({ logs: logsToSend }),
    });
    console.log("Logs sent:", logsToSend.length);
  } catch (error) {
    console.error("Failed to send logs:", error);
    logQueue = [...logsToSend, ...logQueue];
  }
}

async function sendHeartbeat() {
  try {
    await ensureDeviceId();
    await ensureDeviceToken();
    const { stats } = await chrome.storage.local.get(["stats"]);
    await fetch(`${CONFIG.API_ENDPOINT}/heartbeat`, {
      method: "POST",
      headers: reportHeaders(),
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
    return true;
  } else if (message.type === "rgGetConfig") {

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
