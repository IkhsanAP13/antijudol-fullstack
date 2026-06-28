// ANTI-JUDOL Popup Script
document.addEventListener('DOMContentLoaded', async () => {
  // Load device ID
  const { deviceId } = await chrome.storage.local.get(['deviceId']);
  if (deviceId) {
    document.getElementById('deviceId').textContent = deviceId;
  }
  
  // Load and display stats
  loadStats();
  
  // Refresh button
  document.getElementById('refreshBtn').addEventListener('click', loadStats);
  
  // Auto-refresh every 10 seconds
  setInterval(loadStats, 10000);
});

async function loadStats() {
  try {
    // Get stats from background
    chrome.runtime.sendMessage({ type: 'getStats' }, (stats) => {
      if (stats) {
        document.getElementById('sitesBlocked').textContent = stats.sitesBlocked || 0;
        document.getElementById('adsBlocked').textContent = stats.adsBlocked || 0;
      }
    });
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}
