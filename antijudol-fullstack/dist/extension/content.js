// ANTI-JUDOL Content Script - Ad Blocker
(function() {
  'use strict';
  
  console.log('ANTI-JUDOL Content Script Loaded');
  
  // Gambling-related keywords for ad detection
  const GAMBLING_KEYWORDS = [
    'bet', 'casino', 'poker', 'gambling', 'slot', 'jackpot',
    'judi', 'taruhan', 'togel', 'bandar', 'agen', 'daftar',
    'bonus', 'deposit', 'withdraw', 'roulette', 'blackjack'
  ];
  
  // Common ad selectors
  const AD_SELECTORS = [
    'iframe[src*="doubleclick"]',
    'iframe[src*="googlesyndication"]',
    'div[class*="ad-"]',
    'div[id*="ad-"]',
    'div[class*="advertisement"]',
    'div[id*="advertisement"]',
    '.ad-container',
    '.advertisement',
    '[data-ad-slot]',
    'ins.adsbygoogle'
  ];
  
  // Block counter
  let adsBlockedCount = 0;
  
  // Check if element contains gambling content
  function containsGamblingContent(element) {
    const text = element.textContent?.toLowerCase() || '';
    const html = element.innerHTML?.toLowerCase() || '';
    const src = element.getAttribute('src')?.toLowerCase() || '';
    const href = element.getAttribute('href')?.toLowerCase() || '';
    
    const content = `${text} ${html} ${src} ${href}`;
    
    return GAMBLING_KEYWORDS.some(keyword => content.includes(keyword));
  }
  
  // Hide and log blocked ad
  function blockAd(element, reason) {
    if (element.hasAttribute('data-antijudol-blocked')) return;
    
    element.style.display = 'none !important';
    element.style.visibility = 'hidden !important';
    element.style.opacity = '0 !important';
    element.style.height = '0 !important';
    element.style.width = '0 !important';
    element.setAttribute('data-antijudol-blocked', 'true');
    
    adsBlockedCount++;
    
    // Log to background
    chrome.runtime.sendMessage({
      type: 'adBlocked',
      url: window.location.href,
      selector: getSelector(element),
      reason: reason
    });
    
    console.log(`[ANTI-JUDOL] Blocked ${reason}:`, element);
  }
  
  // Get CSS selector for element
  function getSelector(element) {
    if (element.id) return `#${element.id}`;
    if (element.className) return `.${element.className.split(' ')[0]}`;
    return element.tagName.toLowerCase();
  }
  
  // Scan for gambling ads
  function scanForAds() {
    let blockedInThisScan = 0;
    
    // Check all ad-like elements
    AD_SELECTORS.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          if (containsGamblingContent(element)) {
            blockAd(element, 'gambling ad');
            blockedInThisScan++;
          }
        });
      } catch (e) {
        console.error('Error scanning selector:', selector, e);
      }
    });
    
    // Check all iframes
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
      const src = iframe.getAttribute('src') || '';
      if (GAMBLING_KEYWORDS.some(keyword => src.toLowerCase().includes(keyword))) {
        blockAd(iframe, 'gambling iframe');
        blockedInThisScan++;
      }
    });
    
    // Check all links
    const links = document.querySelectorAll('a[href*="http"]');
    links.forEach(link => {
      if (containsGamblingContent(link)) {
        const href = link.getAttribute('href');
        link.removeAttribute('href');
        link.style.pointerEvents = 'none';
        link.style.opacity = '0.3';
        link.setAttribute('data-antijudol-blocked', 'true');
        blockedInThisScan++;
        
        chrome.runtime.sendMessage({
          type: 'adBlocked',
          url: href,
          selector: 'a',
          reason: 'gambling link'
        });
      }
    });
    
    // Check for suspicious scripts
    const scripts = document.querySelectorAll('script[src]');
    scripts.forEach(script => {
      const src = script.getAttribute('src') || '';
      if (GAMBLING_KEYWORDS.some(keyword => src.toLowerCase().includes(keyword))) {
        script.remove();
        blockedInThisScan++;
        
        chrome.runtime.sendMessage({
          type: 'adBlocked',
          url: src,
          selector: 'script',
          reason: 'gambling script'
        });
      }
    });
    
    if (blockedInThisScan > 0) {
      console.log(`[ANTI-JUDOL] Scan complete: ${blockedInThisScan} items blocked`);
    }
  }
  
  // Initial scan
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanForAds);
  } else {
    scanForAds();
  }
  
  // Scan periodically for dynamically loaded content
  setInterval(scanForAds, 2000);
  
  // Watch for DOM changes
  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    
    mutations.forEach(mutation => {
      if (mutation.addedNodes.length > 0) {
        shouldScan = true;
      }
    });
    
    if (shouldScan) {
      scanForAds();
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Add visual indicator
  function addIndicator() {
    if (document.getElementById('antijudol-indicator')) return;
    
    const indicator = document.createElement('div');
    indicator.id = 'antijudol-indicator';
    indicator.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 12px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 999999;
      pointer-events: none;
      transition: opacity 0.3s;
    `;
    indicator.textContent = `🛡️ ANTI-JUDOL: ${adsBlockedCount} blocked`;
    document.body.appendChild(indicator);
    
    // Update indicator when ads are blocked
    setInterval(() => {
      const existing = document.getElementById('antijudol-indicator');
      if (existing) {
        existing.textContent = `🛡️ ANTI-JUDOL: ${adsBlockedCount} blocked`;
      }
    }, 1000);
  }
  
  // Add indicator when page is ready
  if (document.body) {
    addIndicator();
  } else {
    document.addEventListener('DOMContentLoaded', addIndicator);
  }
  
  console.log('[ANTI-JUDOL] Content Script Active - Monitoring for gambling content');
})();
