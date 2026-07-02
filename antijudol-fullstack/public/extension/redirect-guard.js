// ============================================================================
// ANTI-JUDOL — Malicious Redirect Protection (MAIN world)
// ----------------------------------------------------------------------------
// Berjalan di "dunia" script halaman (world: MAIN) pada document_start sehingga
// bisa membungkus API navigasi SEBELUM script halaman memakainya.
//
// Prinsip: JANGAN blokir semua redirect. Blokir hanya redirect LINTAS-DOMAIN yang
// tidak disertai interaksi pengguna yang sah (gesture pada elemen navigasi), atau
// yang berasal dari klik area kosong / overlay tersembunyi (malvertising).
// Redirect login/OAuth/pembayaran/CAPTCHA & domain whitelist selalu diizinkan.
//
// State disimpan dalam closure (IIFE) agar tidak bisa diubah script halaman.
// ============================================================================
(function () {
  'use strict';

  // ─── Konfigurasi (default aman; diperbarui dari extension via postMessage) ───
  let cfg = {
    enabled: true,
    sensitivity: 'medium', // 'low' | 'medium' | 'high'
  };
  let globalWhitelist = []; // dari admin (backend)
  let localWhitelist = []; // dari tombol "Whitelist" pengguna

  const GESTURE_WINDOW = { low: 2500, medium: 1500, high: 800 };

  // Jejak interaksi pengguna terakhir yang tepercaya (isTrusted)
  let lastGesture = { t: -Infinity, navElement: false };

  // Izin "Allow Once": URL yang disetujui pengguna untuk 1x navigasi
  let allowOnceUrl = null;

  // Pola yang SELALU diizinkan (login/OAuth/pembayaran/CAPTCHA)
  const EXEMPT_RE = new RegExp(
    [
      'accounts\\.google\\.', 'login\\.microsoftonline\\.', 'login\\.live\\.',
      'appleid\\.apple\\.com', 'github\\.com/(login|sessions)', 'gitlab\\.com/users/sign_in',
      'facebook\\.com/(login|dialog|v\\d)', 'api\\.twitter\\.com/oauth', 'x\\.com/i/oauth',
      'linkedin\\.com/(oauth|checkpoint)', 'auth0\\.com', 'okta\\.com', 'onelogin\\.com',
      'paypal\\.com', 'stripe\\.com', 'checkout\\.stripe', 'js\\.stripe', 'midtrans',
      'xendit', 'doku\\.', 'gopay', 'ovo\\.', 'dana\\.id',
      'recaptcha', 'hcaptcha', 'turnstile', 'challenges\\.cloudflare',
      '/oauth2?/', '/openid', '/sso/', '/saml', '/auth/', '/signin', '/login',
    ].join('|'),
    'i'
  );

  // ─── Utilitas domain ─────────────────────────────────────────────────────
  function baseDomain(host) {
    const parts = String(host || '').toLowerCase().split('.').filter(Boolean);
    if (parts.length <= 2) return parts.join('.');
    return parts.slice(-2).join('.'); // pendekatan sederhana eTLD+1
  }

  function isSameSite(targetUrl) {
    try {
      return baseDomain(targetUrl.hostname) === baseDomain(location.hostname);
    } catch (e) {
      return true; // gagal parse → anggap aman (jangan blokir)
    }
  }

  function isWhitelisted(host) {
    const h = String(host || '').toLowerCase();
    const all = globalWhitelist.concat(localWhitelist);
    return all.some((w) => {
      w = String(w || '').toLowerCase().replace(/^\*?\.?/, '');
      return w && (h === w || h.endsWith('.' + w) || baseDomain(h) === w);
    });
  }

  function hasRecentGesture() {
    const win = GESTURE_WINDOW[cfg.sensitivity] || GESTURE_WINDOW.medium;
    return performance.now() - lastGesture.t < win;
  }

  // ─── Pelacakan gesture pengguna (capture phase, hanya event tepercaya) ───────
  const NAV_SELECTOR =
    'a[href], button, [role="button"], input[type="submit"], input[type="button"],' +
    ' input[type="image"], [onclick], summary, label, select, option';

  function recordGesture(e) {
    if (!e.isTrusted) return; // event sintetis dari script diabaikan
    let navEl = false;
    try {
      navEl = !!(e.target && e.target.closest && e.target.closest(NAV_SELECTOR));
    } catch (err) {
      navEl = false;
    }
    lastGesture = { t: performance.now(), navElement: navEl };
  }

  [
    'pointerdown', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend', 'keydown', 'submit',
  ].forEach((type) => {
    window.addEventListener(type, recordGesture, true);
  });

  // ─── Klasifikasi sebuah percobaan navigasi ───────────────────────────────
  function decide(rawUrl, method) {
    if (!cfg.enabled) return { block: false };

    let target;
    try {
      target = new URL(rawUrl, location.href);
    } catch (e) {
      return { block: false }; // URL relatif/aneh → biarkan browser yang urus
    }

    // Hanya http/https yang dievaluasi (abaikan blob:, about:, mailto:, dst.)
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return { block: false };

    // Allow Once yang disetujui pengguna
    if (allowOnceUrl && target.href === allowOnceUrl) {
      allowOnceUrl = null;
      return { block: false };
    }

    if (isSameSite(target)) return { block: false, reason: 'same-site' };
    if (isWhitelisted(target.hostname)) return { block: false, reason: 'whitelist' };
    if (EXEMPT_RE.test(target.href)) return { block: false, reason: 'exempt' };

    const noGesture = !hasRecentGesture();
    const blankGesture = hasRecentGesture() && !lastGesture.navElement;

    let block = false;
    let reason = '';

    if (noGesture) {
      block = true;
      reason = 'Redirect otomatis tanpa interaksi pengguna (timer/script)';
    } else if (blankGesture && (cfg.sensitivity === 'medium' || cfg.sensitivity === 'high')) {
      block = true;
      reason = 'Klik pada area kosong memicu perpindahan ke domain lain';
    } else if (cfg.sensitivity === 'high' && !lastGesture.navElement) {
      block = true;
      reason = 'Perpindahan domain tanpa klik pada elemen navigasi yang jelas';
    }

    if (block && method === 'window.open') {
      reason += ' — membuka tab/jendela baru';
    }
    return { block, reason, target: target.href };
  }

  // ─── Lapor ke bridge (isolated world) untuk notifikasi + log ─────────────
  function report(info, method, rawUrl) {
    try {
      window.postMessage(
        {
          source: 'ANTIJUDOL_RG_EVENT',
          url: info.target || rawUrl || '',
          reason: info.reason || 'Redirect mencurigakan',
          method: method,
          from: location.href,
          ts: Date.now(),
        },
        location.origin || '*'
      );
    } catch (e) {
      /* abaikan */
    }
  }

  // ─── Bungkus API navigasi ────────────────────────────────────────────────
  const _open = window.open;
  window.open = function (url, name, features) {
    const d = decide(url || '', 'window.open');
    if (d.block) {
      report(d, 'window.open', url);
      return null; // batalkan popup
    }
    return _open.apply(this, arguments);
  };

  const _assign = Location.prototype.assign;
  Location.prototype.assign = function (url) {
    if (this === window.location) {
      const d = decide(url, 'location.assign');
      if (d.block) {
        report(d, 'location.assign', url);
        return; // batalkan navigasi
      }
    }
    return _assign.call(this, url);
  };

  const _replace = Location.prototype.replace;
  Location.prototype.replace = function (url) {
    if (this === window.location) {
      const d = decide(url, 'location.replace');
      if (d.block) {
        report(d, 'location.replace', url);
        return;
      }
    }
    return _replace.call(this, url);
  };

  // ─── Deteksi klik pada OVERLAY / link tersembunyi (blank-area redirect) ──────
  // Malvertising sering menaruh <a> transparan menutupi seluruh layar sehingga
  // klik di "area kosong" sebenarnya mengklik link ke domain lain.
  document.addEventListener(
    'click',
    function (e) {
      if (!cfg.enabled) return;
      let a;
      try {
        a = e.target && e.target.closest && e.target.closest('a[href]');
      } catch (err) {
        return;
      }
      if (!a) return;

      let target;
      try {
        target = new URL(a.href, location.href);
      } catch (err) {
        return;
      }
      if (target.protocol !== 'http:' && target.protocol !== 'https:') return;
      if (isSameSite(target) || isWhitelisted(target.hostname) || EXEMPT_RE.test(target.href)) return;

      const r = a.getBoundingClientRect();
      const viewport = (window.innerWidth || 1) * (window.innerHeight || 1);
      const bigArea = r.width * r.height > viewport * 0.5;

      let invisible = false;
      try {
        const cs = getComputedStyle(a);
        invisible =
          parseFloat(cs.opacity) < 0.1 ||
          cs.visibility === 'hidden' ||
          (a.textContent.trim() === '' && !a.querySelector('img'));
      } catch (err) {
        invisible = false;
      }

      // Link menutupi >50% layar DAN transparan/tanpa konten → overlay jahat
      if (bigArea && invisible) {
        e.preventDefault();
        e.stopPropagation();
        report(
          { reason: 'Klik area kosong dipetakan ke link tersembunyi (overlay)', target: target.href },
          'overlay-anchor',
          a.href
        );
      }
    },
    true
  );

  // ─── Terima config & perintah dari bridge (isolated world) ───────────────
  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || typeof d !== 'object') return;

    if (d.source === 'ANTIJUDOL_RG_CFG') {
      if (d.config && typeof d.config === 'object') {
        cfg = { enabled: d.config.enabled !== false, sensitivity: d.config.sensitivity || 'medium' };
      }
      if (Array.isArray(d.globalWhitelist)) globalWhitelist = d.globalWhitelist;
      if (Array.isArray(d.localWhitelist)) localWhitelist = d.localWhitelist;
    } else if (d.source === 'ANTIJUDOL_RG_ALLOW_ONCE' && typeof d.url === 'string') {
      allowOnceUrl = d.url; // navigasi berikutnya ke URL ini diizinkan sekali
    }
  });

  console.log('[ANTI-JUDOL] Redirect Guard aktif (MAIN world)');
})();
