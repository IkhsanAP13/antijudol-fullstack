(function () {
  'use strict';

  console.log('ANTI-JUDOL Content Script Loaded');

  const GAMBLING_KEYWORDS = [

    'bet', 'casino', 'poker', 'gambling', 'slot', 'jackpot', 'roulette', 'blackjack',

    'judi', 'taruhan', 'togel', 'bandar', 'agen', 'daftar', 'bonus', 'deposit',
    'withdraw', 'rungkad', 'gacor', 'maxwin', 'scatter', 'cuan', 'hoki', 'jp',
    'jitu', 'pasaran', 'parlay', 'sbobet', 'pragmatic', 'olympus', 'mahjong',
    'zeus', 'gates', 'rtp', 'wd', 'anti rungkad', 'banjir', 'pgsoft', 'pg soft',
    'akun pro', 'situs', 'link alternatif', 'diskon', 'bolak balik',

    'sigacor', 'koko', 'dewa', 'klik', 'gampang', 'win88', '88', '4d', 'toto',
  ];

  const STRICT_TOKENS = new Set(['bet', 'wd', 'jp', '88', '4d', 'rtp']);

  const AD_SELECTORS = [
    'iframe[src*="doubleclick"]',
    'iframe[src*="googlesyndication"]',
    'div[class*="ad-"]',
    'div[id*="ad-"]',
    'div[class*="advertisement"]',
    'div[id*="advertisement"]',
    'div[class*="banner"]',
    'div[id*="banner"]',
    '.ad-container',
    '.advertisement',
    '[data-ad-slot]',
    'ins.adsbygoogle',
  ];

  let adsBlockedCount = 0;
  const PAGE_HOST = location.hostname;

  function reasonWithPage(label) {
    return `${label} @ ${PAGE_HOST}`;
  }

  const SKIP_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0'];
  const SEARCH_ENGINES = [
    'google.', 'bing.com', 'duckduckgo.com', 'search.brave.com', 'search.yahoo.',
    'yahoo.com', 'ecosia.org', 'yandex.', 'baidu.com', 'startpage.com', 'qwant.com',
  ];
  const TRUSTED_TLD = ['.go.id', '.gov', '.edu', '.ac.id', '.sch.id', '.desa.id', '.mil'];
  const TRUSTED_HOSTS = [
    'wikipedia.org', 'wikimedia.org', 'who.int', 'un.org', 'kbbi.kemdikbud.go.id',
    'kompas.com', 'detik.com', 'cnnindonesia.com', 'tribunnews.com', 'liputan6.com',
    'tempo.co', 'antaranews.com', 'suara.com', 'kumparan.com', 'bbc.com', 'bbc.co.uk',
    'hukumonline.com', 'komdigi.go.id', 'kominfo.go.id', 'mkri.id',
    'youtube.com', 'facebook.com', 'twitter.com', 'x.com', 'instagram.com',
    'tiktok.com', 'reddit.com', 'github.com', 'medium.com', 'scholar.google.com',

    'chatgpt.com', 'openai.com', 'oaiusercontent.com', 'microsoft.com', 'microsoftonline.com',
    'live.com', 'office.com', 'outlook.com', 'bing.com', 'apple.com', 'icloud.com',
    'whatsapp.com', 'telegram.org', 'discord.com', 'slack.com', 'zoom.us', 'notion.so',
    'figma.com', 'canva.com', 'dropbox.com', 'netflix.com', 'spotify.com', 'linkedin.com',
    'gitlab.com',
  ];

  function hostIsAllowlisted(rawHost) {
    const host = (rawHost || '').toLowerCase();
    if (!host) return false;
    if (SKIP_HOSTS.includes(host)) return true;
    if (SEARCH_ENGINES.some((s) => host.includes(s))) return true;
    if (TRUSTED_TLD.some((t) => host.endsWith(t))) return true;
    if (TRUSTED_HOSTS.some((h) => host === h || host.endsWith('.' + h))) return true;
    return false;
  }

  let siteRedirected = false;

  function getMetaText() {
    let s = '';
    document
      .querySelectorAll(
        'meta[name="description"], meta[name="keywords"], meta[property="og:title"], meta[property="og:description"]'
      )
      .forEach((m) => {
        s += ' ' + (m.getAttribute('content') || '');
      });
    return s;
  }

  function detectGamblingSite() {
    const bodyText = (document.body ? document.body.innerText : '').toLowerCase();
    const title = (document.title || '').toLowerCase();
    const url = location.href.toLowerCase();
    const host = location.hostname.toLowerCase();
    const meta = getMetaText().toLowerCase();

    const SUS_TLD = [
      '.sbs', '.xyz', '.top', '.live', '.vip', '.club', '.icu', '.cfd',
      '.bet', '.win', '.buzz', '.fun', '.cc', '.wtf', '.lol', '.rest',
    ];
    const URL_TOKENS = [
      'slot', 'togel', 'casino', 'judi', 'gacor', 'maxwin', 'rtp', 'scatter',
      'toto', 'pragmatic', 'poker', 'bandar', 'jackpot',
    ];
    const tldSus = SUS_TLD.some((t) => host.endsWith(t));
    const domToken = URL_TOKENS.some((t) => host.includes(t));
    const urlToken = URL_TOKENS.some((t) => url.replace(host, '').includes(t));
    const catUrl = domToken || (tldSus && /\d/.test(host)) || (tldSus && urlToken);

    const JARGON = [
      'rtp live', 'rtp gacor', 'maxwin', 'gacor', 'scatter hitam', 'anti rungkad',
      'link alternatif', 'pola gacor', 'garansi kekalahan', 'wd tercepat',
      'pragmatic play', 'pg soft', 'slot gacor', 'bocoran rtp', 'jackpot terbesar',
      'depo receh', 'mahjong ways', 'starlight princess', 'gates of olympus',
      'server luar', 'x500', 'x1000', 'situs slot',
    ];
    const jargonHits = JARGON.filter((k) => bodyText.includes(k) || title.includes(k)).length;
    const catJargon = jargonHits >= 2;

    const hasAuth = /(daftar|login|masuk|register|log ?in)/.test(bodyText);
    const hasMoney = /(deposit|withdraw|wede|saldo|minimal ?depo|min\.? ?depo|top ?up)/.test(bodyText);
    const hasBetAction = /(main sekarang|mainkan sekarang|klaim bonus|klaim sekarang|bonus new member|bonus 100%|pasang taruhan)/.test(bodyText);
    const catTransaction = (hasAuth && hasMoney && jargonHits >= 1) || hasBetAction;

    const MARKETS = [
      'hongkong', 'hk siang', 'hk malam', 'sg metro', 'sydney', 'singapore',
      'macau', 'magnum', 'pcso', 'bullseye', 'toto macau',
    ];
    const marketHits = MARKETS.filter((m) => bodyText.includes(m)).length;
    const hasRtpPct = /rtp[^%]{0,12}\d{2,3}([.,]\d+)?\s*%/.test(bodyText);
    const catLiveData = marketHits >= 3 || hasRtpPct;

    const titleMkt = /(slot|togel|judi|casino|gacor|maxwin|rtp|bandar|taruhan)/.test(title);
    const metaMkt = /(slot|togel|judi|casino|gacor|maxwin|rtp|bandar|taruhan)/.test(meta);
    const catMeta =
      (titleMkt && (jargonHits >= 1 || /(gacor|maxwin|resmi|terpercaya|deposit)/.test(title))) ||
      (metaMkt && jargonHits >= 1);

    const TITLE_STRONG = [
      'situs slot', 'slot gacor', 'slot online', 'slot depo', 'depo slot', 'judi slot',
      'bandar togel', 'bandar judi', 'agen slot', 'agen togel', 'toto togel', 'situs togel',
      'auto gacor', 'depo 5k', 'depo 10k', 'depo 25k', 'slot deposit', 'link slot',
      'raih maxwin', 'situs judi',
    ];
    const titlePlusMeta = title + ' ' + meta;
    const titleHits = TITLE_STRONG.filter((k) => titlePlusMeta.includes(k)).length;

    const cats = {
      url: catUrl,
      jargon: catJargon,
      transaction: catTransaction,
      live: catLiveData,
      meta: catMeta,
    };
    const fired = Object.values(cats).filter(Boolean).length;

    const strongCombo = (catUrl && catJargon) || titleHits >= 1;
    return { fired, strongCombo, cats, titleHits };
  }

  function checkGamblingSite() {
    if (siteRedirected) return;
    if (window.top !== window.self) return;
    if (location.protocol.startsWith('chrome-extension')) return;
    if (hostIsAllowlisted(location.hostname)) return;

    const { fired, strongCombo, cats } = detectGamblingSite();
    if (fired >= 3 || strongCombo) {
      siteRedirected = true;
      const target =
        chrome.runtime.getURL('blocked.html') + '?u=' + encodeURIComponent(location.href);
      console.log('[ANTI-JUDOL] Situs judi terdeteksi (' + fired + ' kategori):', cats);
      location.replace(target);
    }
  }

  function isSearchEngine(rawHost) {
    const host = (rawHost || '').toLowerCase();

    if (host.includes('google.')) {
      return host.startsWith('www.google.') || /^google\.[a-z.]+$/.test(host);
    }
    return SEARCH_ENGINES.some((s) => host.includes(s));
  }

  function normalizeJudol(s) {
    if (!s) return '';
    let t = s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    t = t.toLowerCase();
    const map = {
      'đ': 'd', 'ø': 'o', 'ł': 'l', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe',
      'ç': 'c', 'ñ': 'n', 'ı': 'i', 'ð': 'd', 'þ': 'th', 'ĸ': 'k',
    };
    t = t.replace(/[đøłßæœçñıðþĸ]/g, (c) => map[c] || c);
    t = t.replace(/[​-‍﻿­]/g, '');
    t = t.replace(/[^a-z0-9]+/g, ' ').trim();
    return t;
  }

  const SEARCH_JUDOL_RE = new RegExp(
    [
      'slot ?gacor', 'situs ?slot', 'slot ?online', 'link ?(slot|alternatif)',
      'agen ?(slot|togel)', 'judi ?slot', 'gacor', 'maxwin', 'maxwien', 'maxwi',
      'togel', 'toto ?(togel|macau|4d|hk|sgp|singapore|888)', 'bandar ?togel',
      'gampang ?menang', 'rungkad', 'anti ?rungkad', 'pola ?gacor',
      'rtp ?(slot|live|gacor)', 'server ?(thailand|kamboja|luar)', 'x ?[0-9]{3,4}',
      'depo ?receh', 'pragmatic ?play', 'pg ?soft', 'scatter', 'sk?[ae]tt?er',
      'pecah ?selayar', 'wede', 'member ?baru ?100', 'new ?member ?100',
      'jamin ?(wede|maxwin|jp)', '[a-z]{3,}(4d|88|77)', 'jackpot ?(maxwin|terbesar)',
    ].join('|'),
    'i'
  );

  function matchJudolText(raw) {
    const norm = normalizeJudol(raw);
    const collapsed = norm.replace(/([a-z])\1+/g, '$1');
    return SEARCH_JUDOL_RE.test(norm) || SEARCH_JUDOL_RE.test(collapsed);
  }

  function resultContainerOf(node) {
    const known = node.closest(
      'div.g, div.MjjYud, div.tF2Cxc, div[data-hveid], div[data-text-ad],' +
      ' div.uEierd, li.b_algo, div.b_algo, div.result, div.web-result, li'
    );
    if (known) return known;

    let el = node;
    for (let i = 0; i < 5 && el && el.parentElement; i++) {
      el = el.parentElement;
      if (el.querySelector('a[href]') && (el.innerText || '').length > 20) return el;
    }
    return node.parentElement || node;
  }

  function filterSearchResults() {
    const heads = document.querySelectorAll(
      'a h3, h2 > a, .b_algo h2, h3.title, [role="heading"], div[aria-level]'
    );
    heads.forEach((h) => {
      const container = resultContainerOf(h);
      if (!container || container.getAttribute('data-antijudol-blocked')) return;
      if (matchJudolText(container.innerText || container.textContent || '')) {
        hideElement(container);
        try {
          chrome.runtime.sendMessage({
            type: 'adBlocked',
            url: location.href,
            selector: 'search-result',
            reason: reasonWithPage('judol search result'),
          });
        } catch (e) {}
      }
    });
  }

  function textHasGambling(raw) {
    if (!raw) return false;
    const text = ' ' + raw.toLowerCase() + ' ';
    return GAMBLING_KEYWORDS.some((kw) => {
      if (STRICT_TOKENS.has(kw)) {

        const re = new RegExp('(^|[^a-z0-9])' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)', 'i');
        return re.test(text);
      }
      return text.includes(kw);
    });
  }

  function buildHaystack(element) {
    const parts = [];
    parts.push(element.textContent || '');
    parts.push(element.getAttribute('alt') || '');
    parts.push(element.getAttribute('title') || '');
    parts.push(element.getAttribute('aria-label') || '');
    parts.push(element.getAttribute('src') || '');
    parts.push(element.getAttribute('href') || '');
    parts.push(element.getAttribute('data-src') || '');
    parts.push(element.className || '');
    parts.push(element.id || '');
    const bg = element.style?.backgroundImage || '';
    if (bg) parts.push(bg);

    const anchor = element.closest && element.closest('a');
    if (anchor) {
      parts.push(anchor.getAttribute('href') || '');
      parts.push(anchor.getAttribute('title') || '');
    }
    return parts.join(' ');
  }

  function containsGamblingContent(element) {
    return textHasGambling(buildHaystack(element));
  }

  function hideElement(el) {
    if (!el || el.getAttribute('data-antijudol-blocked')) return false;
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.setAttribute('data-antijudol-blocked', 'true');
    return true;
  }

  function pickBannerContainer(el) {
    const anchor = el.closest('a');
    if (anchor) return anchor;
    const banner = el.closest('[class*="banner"], [class*="ad"], figure');
    if (banner) return banner;
    return el;
  }

  function blockAd(element, reason) {
    const target = pickBannerContainer(element);
    if (!hideElement(target)) return;
    adsBlockedCount++;

    try {
      chrome.runtime.sendMessage({
        type: 'adBlocked',
        url: (element.closest('a')?.getAttribute('href')) || window.location.href,
        selector: getSelector(target),
        reason: reasonWithPage(reason),
      });
    } catch (e) {

    }

    console.log(`[ANTI-JUDOL] Blocked ${reason}:`, target);
  }

  function getSelector(element) {
    if (element.id) return `#${element.id}`;
    if (element.className && typeof element.className === 'string') {
      return `.${element.className.split(' ')[0]}`;
    }
    return element.tagName.toLowerCase();
  }

  function isExternalNewTabBanner(a) {
    if (!a) return false;
    if (a.getAttribute('target') !== '_blank') return false;
    const img = a.querySelector('img');
    if (!img) return false;
    let external = false;
    try {
      const u = new URL(a.getAttribute('href') || '', location.href);
      external = !!u.hostname && u.hostname !== location.hostname;
    } catch (e) {
      external = false;
    }
    if (!external) return false;
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;

    return (w >= 200 && h >= 40) || (w >= 120 && h >= 240) || (w === 0 && h === 0);
  }

  function isFixedOrSticky(el) {
    try {
      const pos = getComputedStyle(el).position;
      return pos === 'fixed' || pos === 'sticky';
    } catch (e) {
      return false;
    }
  }

  function scanBannerAds() {
    let n = 0;
    document.querySelectorAll('a[target="_blank"]').forEach((a) => {
      if (a.getAttribute('data-antijudol-blocked')) return;
      if (isExternalNewTabBanner(a)) {
        if (hideElement(a)) {
          adsBlockedCount++;
          n++;
          try {
            chrome.runtime.sendMessage({
              type: 'adBlocked',
              url: a.getAttribute('href') || location.href,
              selector: 'a[target=_blank]',
              reason: reasonWithPage('banner ad'),
            });
          } catch (e) {}
        }
      }
    });
    return n;
  }

  function removeOverlayAds() {
    let n = 0;
    const selector =
      'iframe, [class*="pop"], [class*="modal"], [class*="overlay"], [class*="float"],' +
      ' [class*="sticky"], [class*="fixed"], [class*="banner"], [class*="ads"],' +
      ' [id*="pop"], [id*="ads"], [id*="banner"]';
    const candidates = new Set();

    if (document.body) {
      for (const c of document.body.children) candidates.add(c);
    }
    document.querySelectorAll(selector).forEach((el) => candidates.add(el));

    candidates.forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      if (el.id === 'antijudol-indicator') return;
      if (el.getAttribute('data-antijudol-blocked')) return;
      if (!isFixedOrSticky(el)) return;

      const rect = el.getBoundingClientRect();
      if (rect.width < 200 || rect.height < 30) return;

      const hasGambling = textHasGambling(buildHaystack(el));
      const adAnchor = el.querySelector('a[target="_blank"]');
      const isAdOverlay = adAnchor ? isExternalNewTabBanner(adAnchor) : false;

      if (hasGambling || isAdOverlay) {
        if (hideElement(el)) {
          adsBlockedCount++;
          n++;
          try {
            chrome.runtime.sendMessage({
              type: 'adBlocked',
              url: (adAnchor && adAnchor.getAttribute('href')) || location.href,
              selector: getSelector(el),
              reason: reasonWithPage('popup ad'),
            });
          } catch (e) {}
        }
      }
    });
    return n;
  }

  function scanForAds() {
    let blocked = 0;

    document.querySelectorAll('img').forEach((img) => {
      if (img.getAttribute('data-antijudol-blocked')) return;
      if (containsGamblingContent(img)) {
        blockAd(img, 'gambling banner');
        blocked++;
      }
    });

    document.querySelectorAll('a[href]').forEach((a) => {
      if (a.getAttribute('data-antijudol-blocked')) return;
      const href = a.getAttribute('href') || '';
      if (textHasGambling(href) || containsGamblingContent(a)) {
        if (hideElement(a)) {
          adsBlockedCount++;
          blocked++;
          try {
            chrome.runtime.sendMessage({
              type: 'adBlocked', url: href, selector: 'a', reason: reasonWithPage('gambling link'),
            });
          } catch (e) {}
        }
      }
    });

    AD_SELECTORS.forEach((selector) => {
      try {
        document.querySelectorAll(selector).forEach((el) => {
          if (el.getAttribute('data-antijudol-blocked')) return;
          if (containsGamblingContent(el)) {
            blockAd(el, 'gambling ad');
            blocked++;
          }
        });
      } catch (e) {

      }
    });

    document.querySelectorAll('iframe').forEach((iframe) => {
      if (iframe.getAttribute('data-antijudol-blocked')) return;
      const src = iframe.getAttribute('src') || '';
      if (textHasGambling(src)) {
        blockAd(iframe, 'gambling iframe');
        blocked++;
      }
    });

    document.querySelectorAll('script[src]').forEach((script) => {
      const src = script.getAttribute('src') || '';
      if (textHasGambling(src)) {
        script.remove();
        blocked++;
        try {
          chrome.runtime.sendMessage({
            type: 'adBlocked', url: src, selector: 'script', reason: reasonWithPage('gambling script'),
          });
        } catch (e) {}
      }
    });

    blocked += scanBannerAds();
    blocked += removeOverlayAds();

    if (blocked > 0) {
      console.log(`[ANTI-JUDOL] Scan: ${blocked} item disembunyikan`);
    }
  }

  function runChecks() {
    const host = location.hostname;

    if (isSearchEngine(host)) {
      filterSearchResults();
      return;
    }

    if (hostIsAllowlisted(host)) return;
    checkGamblingSite();
    scanForAds();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runChecks);
  } else {
    runChecks();
  }

  setTimeout(checkGamblingSite, 500);
  setTimeout(checkGamblingSite, 1500);
  setTimeout(checkGamblingSite, 3500);

  setInterval(runChecks, 1500);

  let obsTimer = null;
  const observer = new MutationObserver((mutations) => {
    const host = location.hostname;
    if (hostIsAllowlisted(host) && !isSearchEngine(host)) return;
    let added = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        added = true;
        break;
      }
    }
    if (!added || obsTimer) return;

    obsTimer = setTimeout(() => {
      obsTimer = null;
      if (isSearchEngine(location.hostname)) filterSearchResults();
      else scanForAds();
    }, 400);
  });

  function startObserver() {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.body) startObserver();
  else document.addEventListener('DOMContentLoaded', startObserver);

  function addIndicator() {
    if (document.getElementById('antijudol-indicator')) return;
    const indicator = document.createElement('div');
    indicator.id = 'antijudol-indicator';
    indicator.style.cssText = `
      position: fixed; bottom: 20px; right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white; padding: 8px 16px; border-radius: 20px;
      font-family: system-ui, -apple-system, sans-serif; font-size: 12px;
      font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 2147483647; pointer-events: none; transition: opacity 0.3s;
    `;
    indicator.textContent = `🛡️ ANTI-JUDOL: ${adsBlockedCount} diblokir`;
    document.body.appendChild(indicator);

    setInterval(() => {
      const existing = document.getElementById('antijudol-indicator');
      if (existing) existing.textContent = `🛡️ ANTI-JUDOL: ${adsBlockedCount} diblokir`;
    }, 1000);
  }

  if (!hostIsAllowlisted(location.hostname)) {
    if (document.body) addIndicator();
    else document.addEventListener('DOMContentLoaded', addIndicator);
  }

  console.log('[ANTI-JUDOL] Content Script Active - Monitoring for gambling content');
})();
