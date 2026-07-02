// ANTI-JUDOL Content Script - Ad Blocker
(function () {
  'use strict';

  console.log('ANTI-JUDOL Content Script Loaded');

  // ─── Kata kunci judi (termasuk istilah & brand judol Indonesia) ──────────────
  const GAMBLING_KEYWORDS = [
    // umum
    'bet', 'casino', 'poker', 'gambling', 'slot', 'jackpot', 'roulette', 'blackjack',
    // indonesia
    'judi', 'taruhan', 'togel', 'bandar', 'agen', 'daftar', 'bonus', 'deposit',
    'withdraw', 'rungkad', 'gacor', 'maxwin', 'scatter', 'cuan', 'hoki', 'jp',
    'jitu', 'pasaran', 'parlay', 'sbobet', 'pragmatic', 'olympus', 'mahjong',
    'zeus', 'gates', 'rtp', 'wd', 'anti rungkad', 'banjir', 'pgsoft', 'pg soft',
    'akun pro', 'situs', 'link alternatif', 'diskon', 'bolak balik',
    // pola brand umum (sigacor88, bandar36, koko88, dewacuan, dll)
    'sigacor', 'koko', 'dewa', 'klik', 'gampang', 'win88', '88', '4d', 'toto',
  ];

  // Token yang TERLALU pendek/ambigu → wajib cocok sebagai kata utuh, bukan substring
  const STRICT_TOKENS = new Set(['bet', 'wd', 'jp', '88', '4d', 'rtp']);

  // Selector iklan umum
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
  const PAGE_HOST = location.hostname; // halaman tempat iklan muncul

  // Buat label reason yang informatif untuk disimpan ke DB
  function reasonWithPage(label) {
    return `${label} @ ${PAGE_HOST}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DETEKSI SITUS JUDI BERBASIS ISI HALAMAN (anti-bypass domain acak)
  // Situs judol sering pakai domain unik (gaspenta.xyz, rusia77, ratu89) agar
  // lolos filter kata kunci URL. Di sini kita skor isi halaman: jika banyak
  // sinyal judi, seluruh tab dialihkan ke halaman blokir.
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── ALLOWLIST: host ini TIDAK PERNAH diblokir / diutak-atik ────────────────
  // Mesin pencari, situs edukasi/pemerintah/berita, platform besar, & dashboard.
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

  // ─── SCORING MULTI-INDIKATOR (deteksi berbasis KONTEKS, bukan sekadar keyword) ─
  // Situs judi asli memicu BANYAK kategori indikator sekaligus. Artikel edukasi/
  // berita/hukum paling banter memicu 1 kategori (sekadar menyebut istilah). Maka
  // kita hanya memblokir bila >=3 kategori berbeda menyala, ATAU kombinasi sangat
  // kuat: domain judol + jargon marketing.
  function detectGamblingSite() {
    const bodyText = (document.body ? document.body.innerText : '').toLowerCase();
    const title = (document.title || '').toLowerCase();
    const url = location.href.toLowerCase();
    const host = location.hostname.toLowerCase();
    const meta = getMetaText().toLowerCase();

    // A. Domain / URL mencurigakan
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

    // B. Jargon marketing judi (khas, hampir tak ada di situs sah)
    const JARGON = [
      'rtp live', 'rtp gacor', 'maxwin', 'gacor', 'scatter hitam', 'anti rungkad',
      'link alternatif', 'pola gacor', 'garansi kekalahan', 'wd tercepat',
      'pragmatic play', 'pg soft', 'slot gacor', 'bocoran rtp', 'jackpot terbesar',
      'depo receh', 'mahjong ways', 'starlight princess', 'gates of olympus',
      'server luar', 'x500', 'x1000', 'situs slot',
    ];
    const jargonHits = JARGON.filter((k) => bodyText.includes(k) || title.includes(k)).length;
    const catJargon = jargonHits >= 2;

    // C. Struktur transaksi / registrasi judi
    const hasAuth = /(daftar|login|masuk|register|log ?in)/.test(bodyText);
    const hasMoney = /(deposit|withdraw|wede|saldo|minimal ?depo|min\.? ?depo|top ?up)/.test(bodyText);
    const hasBetAction = /(main sekarang|mainkan sekarang|klaim bonus|klaim sekarang|bonus new member|bonus 100%|pasang taruhan)/.test(bodyText);
    const catTransaction = (hasAuth && hasMoney && jargonHits >= 1) || hasBetAction;

    // D. Widget data live (tabel togel / RTP live) — khas situs judi
    const MARKETS = [
      'hongkong', 'hk siang', 'hk malam', 'sg metro', 'sydney', 'singapore',
      'macau', 'magnum', 'pcso', 'bullseye', 'toto macau',
    ];
    const marketHits = MARKETS.filter((m) => bodyText.includes(m)).length;
    const hasRtpPct = /rtp[^%]{0,12}\d{2,3}([.,]\d+)?\s*%/.test(bodyText);
    const catLiveData = marketHits >= 3 || hasRtpPct;

    // E. Meta / title marketing judi
    const titleMkt = /(slot|togel|judi|casino|gacor|maxwin|rtp|bandar|taruhan)/.test(title);
    const metaMkt = /(slot|togel|judi|casino|gacor|maxwin|rtp|bandar|taruhan)/.test(meta);
    const catMeta =
      (titleMkt && (jargonHits >= 1 || /(gacor|maxwin|resmi|terpercaya|deposit)/.test(title))) ||
      (metaMkt && jargonHits >= 1);

    const cats = {
      url: catUrl,
      jargon: catJargon,
      transaction: catTransaction,
      live: catLiveData,
      meta: catMeta,
    };
    const fired = Object.values(cats).filter(Boolean).length;
    const strongCombo = catUrl && catJargon; // domain judol + jargon = sudah cukup
    return { fired, strongCombo, cats };
  }

  function checkGamblingSite() {
    if (siteRedirected) return;
    if (window.top !== window.self) return; // hanya frame utama
    if (location.protocol.startsWith('chrome-extension')) return;
    if (hostIsAllowlisted(location.hostname)) return; // mesin pencari / edu / gov / berita

    const { fired, strongCombo, cats } = detectGamblingSite();
    if (fired >= 3 || strongCombo) {
      siteRedirected = true;
      const target =
        chrome.runtime.getURL('blocked.html') + '?u=' + encodeURIComponent(location.href);
      console.log('[ANTI-JUDOL] Situs judi terdeteksi (' + fired + ' kategori):', cats);
      location.replace(target);
    }
  }

  // ─── Penyaring HASIL PENCARIAN judol (situs deface / SEO-spam) ────────────────
  // Di mesin pencari kita TIDAK memblokir halaman. Kita hanya menyembunyikan
  // entri hasil yang merupakan situs judi/deface. Hasil sah tetap terlihat.
  function isSearchEngine(rawHost) {
    const host = (rawHost || '').toLowerCase();
    return SEARCH_ENGINES.some((s) => host.includes(s));
  }

  // Jargon judol khas yang muncul di judul/snippet hasil pencarian.
  // Sengaja spesifik agar hasil edukasi/berita tidak ikut tersembunyi.
  const SEARCH_JUDOL_RE = new RegExp(
    [
      'slot\\s?gacor', 'situs\\s?slot', 'slot\\s?online', 'link\\s?(slot|alternatif)',
      'agen\\s?(slot|togel)', 'judi\\s?slot', '\\bgacor\\b', '\\bmaxwin\\b', '\\btogel\\b',
      'toto\\s?(togel|macau|4d|hk|sgp|singapore)', 'bandar\\s?togel', 'gampang\\s?menang',
      'anti\\s?rungkad', 'pola\\s?gacor', 'rtp\\s?(slot|live|gacor)',
      'server\\s?(thailand|kamboja)', '\\bx500\\b', '\\bx1000\\b', 'depo\\s?receh',
      'pragmatic\\s?play', 'pg\\s?soft', '\\b[a-z]{3,}(4d|88|77)\\b',
    ].join('|'),
    'i'
  );

  // Cari container satu entri hasil (Google & Bing punya struktur berbeda)
  function resultContainerOf(node) {
    return (
      node.closest(
        'div.g, div.MjjYud, div.tF2Cxc, div[data-hveid], li.b_algo, div.b_algo, div.result, div.web-result, li'
      ) || node.parentElement
    );
  }

  function filterSearchResults() {
    const heads = document.querySelectorAll('a h3, h2 > a, .b_algo h2, h3.title');
    heads.forEach((h) => {
      const container = resultContainerOf(h);
      if (!container || container.getAttribute('data-antijudol-blocked')) return;
      const text = (container.innerText || '').toLowerCase();
      if (SEARCH_JUDOL_RE.test(text)) {
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

  // Cek apakah sebuah teks mengandung kata judi
  function textHasGambling(raw) {
    if (!raw) return false;
    const text = ' ' + raw.toLowerCase() + ' ';
    return GAMBLING_KEYWORDS.some((kw) => {
      if (STRICT_TOKENS.has(kw)) {
        // cocok sebagai kata utuh (dibatasi non-huruf/angka)
        const re = new RegExp('(^|[^a-z0-9])' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)', 'i');
        return re.test(text);
      }
      return text.includes(kw);
    });
  }

  // Kumpulkan "haystack" dari sebuah elemen: teks + atribut penting + href induk
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
    // href dari anchor terdekat (banner gambar biasanya <a href="affiliate"><img></a>)
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

  // Sembunyikan elemen (dan container banner terdekat bila ada)
  function hideElement(el) {
    if (!el || el.getAttribute('data-antijudol-blocked')) return false;
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.setAttribute('data-antijudol-blocked', 'true');
    return true;
  }

  // Cari container banner yang pantas disembunyikan (anchor/figure/div banner)
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
      /* extension context mungkin invalid saat reload; abaikan */
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

  // ─── Deteksi banner iklan berbasis STRUKTUR (untuk iklan gambar-only) ─────────
  // Banner judol biasanya: <a target="_blank" href="domain-lain"><img banner></a>
  // Teksnya ada di dalam gambar, jadi tak terdeteksi kata kunci. Kita kenali dari
  // pola: link buka tab baru + domain eksternal + gambar berukuran banner.
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
    // ukuran banner umum (leaderboard/rectangle/skyscraper); 0 = belum load, tetap kandidat
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

  // Sembunyikan semua banner iklan eksternal (image-only ads) di halaman
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

  // Hapus pop-up / iklan melayang (fixed/sticky) tanpa perlu klik tombol CLOSE
  function removeOverlayAds() {
    let n = 0;
    const selector =
      'iframe, [class*="pop"], [class*="modal"], [class*="overlay"], [class*="float"],' +
      ' [class*="sticky"], [class*="fixed"], [class*="banner"], [class*="ads"],' +
      ' [id*="pop"], [id*="ads"], [id*="banner"]';
    const candidates = new Set();
    // Overlay biasanya ditempel langsung di <body>
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
      if (rect.width < 200 || rect.height < 30) return; // abaikan elemen kecil

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

  // ─── Pemindaian utama ────────────────────────────────────────────────────────
  function scanForAds() {
    let blocked = 0;

    // 1) Banner gambar: semua <img> yang mengandung petunjuk judi
    document.querySelectorAll('img').forEach((img) => {
      if (img.getAttribute('data-antijudol-blocked')) return;
      if (containsGamblingContent(img)) {
        blockAd(img, 'gambling banner');
        blocked++;
      }
    });

    // 2) Semua anchor (link affiliate judol) — termasuk yang membungkus gambar
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

    // 3) Selector iklan umum + iframe
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
        /* selector invalid */
      }
    });

    // 4) iframe berdasarkan src
    document.querySelectorAll('iframe').forEach((iframe) => {
      if (iframe.getAttribute('data-antijudol-blocked')) return;
      const src = iframe.getAttribute('src') || '';
      if (textHasGambling(src)) {
        blockAd(iframe, 'gambling iframe');
        blocked++;
      }
    });

    // 5) Script mencurigakan
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

    // 6) Banner iklan eksternal (image-only) + pop-up melayang
    blocked += scanBannerAds();
    blocked += removeOverlayAds();

    if (blocked > 0) {
      console.log(`[ANTI-JUDOL] Scan: ${blocked} item disembunyikan`);
    }
  }

  // Gabungan: pindai iklan + cek apakah seluruh situs adalah situs judi
  function runChecks() {
    const host = location.hostname;
    // Mesin pencari: saring entri hasil judol, tapi halaman & hasil lain tetap tampil
    if (isSearchEngine(host)) {
      filterSearchResults();
      return;
    }
    // Situs tepercaya lain (edu, gov, berita): jangan diapa-apakan
    if (hostIsAllowlisted(host)) return;
    checkGamblingSite();
    scanForAds();
  }

  // Scan awal
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runChecks);
  } else {
    runChecks();
  }

  // Cek ulang beberapa kali (konten judol sering dimuat belakangan)
  setTimeout(checkGamblingSite, 500);
  setTimeout(checkGamblingSite, 1500);
  setTimeout(checkGamblingSite, 3500);

  // Scan berkala untuk konten yang dimuat dinamis (+ cek situs judi)
  setInterval(runChecks, 1500);

  // Pantau perubahan DOM (iklan sering disuntikkan belakangan)
  const observer = new MutationObserver((mutations) => {
    const host = location.hostname;
    if (isSearchEngine(host)) {
      filterSearchResults(); // saring hasil judol yg dimuat saat scroll
      return;
    }
    if (hostIsAllowlisted(host)) return; // jangan sentuh situs tepercaya
    let shouldScan = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        shouldScan = true;
        break;
      }
    }
    if (shouldScan) scanForAds();
  });

  function startObserver() {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.body) startObserver();
  else document.addEventListener('DOMContentLoaded', startObserver);

  // Indikator visual jumlah blokir
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
