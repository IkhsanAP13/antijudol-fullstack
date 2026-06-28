// ANTI-JUDOL Background Service Worker
const CONFIG = {
  API_ENDPOINT: 'https://your-backend-api.com/api', // TODO: Replace with your backend
  HEARTBEAT_INTERVAL: 60000, // 1 minute
  LOG_BATCH_SIZE: 10,
  SYNC_INTERVAL: 300000 // 5 minutes
};

let deviceId = null;
let logQueue = [];
let blocklist = [];

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  console.log('ANTI-JUDOL Extension Installed');
  
  // Generate or retrieve device ID
  const stored = await chrome.storage.local.get(['deviceId']);
  if (!stored.deviceId) {
    deviceId = generateDeviceId();
    await chrome.storage.local.set({ deviceId });
  } else {
    deviceId = stored.deviceId;
  }
  
  // Register device with backend
  await registerDevice();
  
  // Load blocklist from backend
  await updateBlocklist();
  
  // Set up periodic tasks
  chrome.alarms.create('heartbeat', { periodInMinutes: 1 });
  chrome.alarms.create('syncBlocklist', { periodInMinutes: 60 });
  chrome.alarms.create('flushLogs', { periodInMinutes: 5 });
  
  // Initialize stats
  await chrome.storage.local.set({ 
    stats: { 
      sitesBlocked: 0, 
      adsBlocked: 0,
      lastSync: Date.now()
    }
  });
});

// Generate unique device ID
function generateDeviceId() {
  return 'device_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

// Register device with backend
async function registerDevice() {
  try {
    const deviceInfo = {
      deviceId: deviceId,
      extensionVersion: chrome.runtime.getManifest().version,
      browser: getBrowserInfo(),
      registeredAt: new Date().toISOString()
    };
    
    const response = await fetch(`${CONFIG.API_ENDPOINT}/devices/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deviceInfo)
    });
    
    if (response.ok) {
      console.log('Device registered successfully');
    }
  } catch (error) {
    console.error('Failed to register device:', error);
  }
}

// Get browser information
function getBrowserInfo() {
  const ua = navigator.userAgent;
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Edge')) return 'Edge';
  return 'Unknown';
}

// Update blocklist from server
async function updateBlocklist() {
  try {
    const response = await fetch(`${CONFIG.API_ENDPOINT}/blocklist`);
    if (response.ok) {
      blocklist = await response.json();
      await chrome.storage.local.set({ blocklist, lastBlocklistUpdate: Date.now() });
      
      // Update declarativeNetRequest rules
      await updateNetRequestRules(blocklist);
      console.log('Blocklist updated:', blocklist.length, 'domains');
    }
  } catch (error) {
    console.error('Failed to update blocklist:', error);
    // Load cached blocklist
    const stored = await chrome.storage.local.get(['blocklist']);
    if (stored.blocklist) {
      blocklist = stored.blocklist;
    } else {
      // Fallback blocklist
      blocklist = getDefaultBlocklist();
    }
  }
}

// Update declarativeNetRequest rules for site blocking
async function updateNetRequestRules(domains) {
  const rules = domains.map((domain, index) => ({
    id: index + 1,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: domain,
      resourceTypes: ['main_frame', 'sub_frame']
    }
  }));
  
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: rules.map(r => r.id),
      addRules: rules
    });
  } catch (error) {
    console.error('Failed to update rules:', error);
  }
}

// Default blocklist
function getDefaultBlocklist() {
  return [
    '*://bet*.com/*',
    '*://casino*.com/*',
    '*://poker*.com/*',
    '*://gambling*.com/*',
    '*://slot*.com/*',
    '*://judi*.com/*',
    '*://taruhan*.com/*',
    '*://togel*.com/*'
  ];
}

// Check if URL matches gambling patterns
function isGamblingUrl(url) {
  const gamblingPatterns = [
    /bet/i, /casino/i, /poker/i, /gambling/i, /slot/i,
    /judi/i, /taruhan/i, /togel/i, /jackpot/i, /roulette/i
  ];
  
  return gamblingPatterns.some(pattern => pattern.test(url));
}

// Log blocked content
async function logBlock(type, url, details = {}) {
  const log = {
    deviceId,
    timestamp: new Date().toISOString(),
    type, // 'site' or 'ad'
    url,
    ...details
  };
  
  logQueue.push(log);
  
  // Update stats
  const { stats } = await chrome.storage.local.get(['stats']);
  if (type === 'site') stats.sitesBlocked++;
  if (type === 'ad') stats.adsBlocked++;
  await chrome.storage.local.set({ stats });
  
  // Send to backend if queue is full
  if (logQueue.length >= CONFIG.LOG_BATCH_SIZE) {
    await flushLogs();
  }
}

// Send logs to backend
async function flushLogs() {
  if (logQueue.length === 0) return;
  
  const logsToSend = [...logQueue];
  logQueue = [];
  
  try {
    await fetch(`${CONFIG.API_ENDPOINT}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logs: logsToSend })
    });
    console.log('Logs sent:', logsToSend.length);
  } catch (error) {
    console.error('Failed to send logs:', error);
    // Re-queue logs
    logQueue = [...logsToSend, ...logQueue];
  }
}

// Send heartbeat to backend
async function sendHeartbeat() {
  try {
    const { stats } = await chrome.storage.local.get(['stats']);
    await fetch(`${CONFIG.API_ENDPOINT}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        timestamp: new Date().toISOString(),
        stats
      })
    });
  } catch (error) {
    console.error('Heartbeat failed:', error);
  }
}

// Handle alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'heartbeat') {
    sendHeartbeat();
  } else if (alarm.name === 'syncBlocklist') {
    updateBlocklist();
  } else if (alarm.name === 'flushLogs') {
    flushLogs();
  }
});

// Listen for blocked requests
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (isGamblingUrl(details.url)) {
      logBlock('site', details.url, { tabId: details.tabId });
      return { cancel: true };
    }
  },
  { urls: ['<all_urls>'] },
  ['blocking']
);

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'adBlocked') {
    logBlock('ad', message.url, { 
      selector: message.selector,
      tabId: sender.tab?.id 
    });
    sendResponse({ success: true });
  } else if (message.type === 'getStats') {
    chrome.storage.local.get(['stats']).then(({ stats }) => {
      sendResponse(stats);
    });
    return true; // Keep channel open for async response
  }
});

console.log('ANTI-JUDOL Background Service Worker Ready');
