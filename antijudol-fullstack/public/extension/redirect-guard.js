(function () {
  'use strict';

  function isTrustedHost(raw) {
    const h = (raw || '').toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0') return true;
    if (
      h.includes('google.') || h.includes('gstatic') || h.includes('googleusercontent') ||
      h.includes('oaiusercontent') || h.includes('oaistatic')
    ) return true;
    const domains = [
      'youtube.com', 'chatgpt.com', 'openai.com', 'microsoft.com', 'microsoftonline.com',
      'live.com', 'office.com', 'outlook.com', 'bing.com', 'github.com', 'gitlab.com',
      'apple.com', 'icloud.com', 'whatsapp.com', 'telegram.org', 'discord.com', 'slack.com',
      'zoom.us', 'notion.so', 'figma.com', 'canva.com', 'dropbox.com', 'netflix.com',
      'spotify.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com',
      'tiktok.com', 'reddit.com', 'wikipedia.org', 'wikimedia.org',
    ];
    if (domains.some((d) => h === d || h.endsWith('.' + d))) return true;
    const tlds = ['.go.id', '.ac.id', '.edu', '.gov', '.sch.id', '.mil'];
    if (tlds.some((t) => h.endsWith(t))) return true;
    return false;
  }
  if (isTrustedHost(location.hostname)) {
    console.log('[ANTI-JUDOL] Redirect Guard dinonaktifkan di host tepercaya');
    return;
  }

  if (window.top !== window.self) return;

  let cfg = {
    enabled: true,
    sensitivity: 'medium',
  };
  let globalWhitelist = [];
  let localWhitelist = [];

  const GESTURE_WINDOW = { low: 2500, medium: 1500, high: 800 };

  let lastGesture = { t: -Infinity, navElement: false };

  let allowOnceUrl = null;

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

  function baseDomain(host) {
    const parts = String(host || '').toLowerCase().split('.').filter(Boolean);
    if (parts.length <= 2) return parts.join('.');
    return parts.slice(-2).join('.');
  }

  function isSameSite(targetUrl) {
    try {
      return baseDomain(targetUrl.hostname) === baseDomain(location.hostname);
    } catch (e) {
      return true;
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

  const NAV_SELECTOR =
    'a[href], button, [role="button"], input[type="submit"], input[type="button"],' +
    ' input[type="image"], [onclick], summary, label, select, option';

  function recordGesture(e) {
    if (!e.isTrusted) return;
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

  function decide(rawUrl, method) {
    if (!cfg.enabled) return { block: false };

    let target;
    try {
      target = new URL(rawUrl, location.href);
    } catch (e) {
      return { block: false };
    }

    if (target.protocol !== 'http:' && target.protocol !== 'https:') return { block: false };

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
        '*'
      );
    } catch (e) {

    }
  }

  const _open = window.open;
  window.open = function (url, name, features) {
    const d = decide(url || '', 'window.open');
    if (d.block) {
      report(d, 'window.open', url);
      return null;
    }
    return _open.apply(this, arguments);
  };

  const _assign = Location.prototype.assign;
  Location.prototype.assign = function (url) {
    if (this === window.location) {
      const d = decide(url, 'location.assign');
      if (d.block) {
        report(d, 'location.assign', url);
        return;
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
      allowOnceUrl = d.url;
    }
  });

  console.log('[ANTI-JUDOL] Redirect Guard aktif (MAIN world)');
})();
