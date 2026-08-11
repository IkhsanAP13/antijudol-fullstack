
document.addEventListener('DOMContentLoaded', async () => {
  
  const { deviceId } = await chrome.storage.local.get(['deviceId']);
  if (deviceId) {
    document.getElementById('deviceId').textContent = deviceId;
  }
  
  
  loadStats();
  
  
  document.getElementById('refreshBtn').addEventListener('click', loadStats);
  
  
  setInterval(loadStats, 10000);
});

async function loadStats() {
  try {
    
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
