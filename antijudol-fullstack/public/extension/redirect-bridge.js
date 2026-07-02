// ============================================================================
// ANTI-JUDOL — Malicious Redirect Protection (Bridge, isolated world)
// ----------------------------------------------------------------------------
// Jembatan antara guard (MAIN world) dan extension:
//  - Mengambil konfigurasi + whitelist dari background, mengirimnya ke guard.
//  - Menerima event "redirect diblokir" dari guard, menampilkan notifikasi
//    in-page, mencatat log ke backend, serta menangani Allow Once & Whitelist.
//  - Menetralkan <meta http-equiv="refresh"> lintas-domain otomatis.
// ============================================================================
(function () {
  'use strict';

  const isTop = window.top === window.self;

  // ─── Kirim konfigurasi ke guard (MAIN world) di frame ini ─────────────────
  function pushConfigToGuard(data) {
    try {
      window.postMessage(
        {
          source: 'ANTIJUDOL_RG_CFG',
          config: data.config || { enabled: true, sensitivity: 'medium' },
          globalWhitelist: data.globalWhitelist || [],
          localWhitelist: data.localWhitelist || [],
        },
        location.origin || '*'
      );
    } catch (e) {
      /* abaikan */
    }
  }

  function requestConfig() {
    try {
      chrome.runtime.sendMessage({ type: 'rgGetConfig' }, (resp) => {
        if (chrome.runtime.lastError || !resp) return;
        pushConfigToGuard(resp);
      });
    } catch (e) {
      /* extension context invalid saat reload; abaikan */
    }
  }

  // Ambil config di awal, lalu segarkan berkala & saat background memberitahu
  requestConfig();
  setInterval(requestConfig, 60000);
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'rgConfigUpdated') requestConfig();
    });
  } catch (e) {
    /* abaikan */
  }

  // ─── Netralkan meta refresh lintas-domain (auto redirect) ─────────────────
  function neutralizeMetaRefresh() {
    document.querySelectorAll('meta[http-equiv="refresh" i]').forEach((m) => {
      const content = m.getAttribute('content') || '';
      const match = content.match(/url\s*=\s*(.+)$/i);
      if (!match) return;
      let dest;
      try {
        dest = new URL(match[1].trim().replace(/['"]/g, ''), location.href);
      } catch (e) {
        return;
      }
      const sameSite =
        dest.hostname.split('.').slice(-2).join('.') ===
        location.hostname.split('.').slice(-2).join('.');
      if (!sameSite && (dest.protocol === 'http:' || dest.protocol === 'https:')) {
        m.parentNode && m.parentNode.removeChild(m);
        onBlocked({
          url: dest.href,
          reason: 'Auto-redirect via meta refresh ke domain lain',
          method: 'meta-refresh',
          from: location.href,
          ts: Date.now(),
        });
      }
    });
  }
  neutralizeMetaRefresh();
  document.addEventListener('DOMContentLoaded', neutralizeMetaRefresh);

  // ─── Terima event blokir dari guard ──────────────────────────────────────
  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.source !== 'ANTIJUDOL_RG_EVENT') return;
    onBlocked(d);
  });

  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch (e) {
      return url;
    }
  }

  function onBlocked(entry) {
    // Catat ke backend (lewat background). Hanya sekali per event.
    try {
      chrome.runtime.sendMessage({
        type: 'rgLog',
        entry: {
          target: entry.url || '',
          from: entry.from || location.href,
          reason: entry.reason || '',
          method: entry.method || '',
          ts: entry.ts || Date.now(),
        },
      });
    } catch (e) {
      /* abaikan */
    }
    // Notifikasi hanya di frame teratas agar tidak dobel dari iframe
    if (isTop) showNotification(entry);
  }

  // ─── Suara alert (MP3 EAS yang dibundel) saat notifikasi muncul ─────────
  function playBlockAlert() {
    try {
      const url = chrome.runtime.getURL('alert.mp3');
      const audio = new Audio(url);
      audio.volume = 1.0;
      const p = audio.play();
      if (p && p.catch) p.catch(function () { /* autoplay diblokir; abaikan */ });
    } catch (e) {
      /* abaikan */
    }
  }

  // ─── UI notifikasi in-page ────────────────────────────────────────────────
  let container = null;

  function ensureContainer() {
    if (container && document.documentElement.contains(container)) return container;
    container = document.createElement('div');
    container.id = 'antijudol-rg-notifications';
    container.style.cssText = [
      'position:fixed', 'top:16px', 'right:16px', 'z-index:2147483647',
      'display:flex', 'flex-direction:column', 'gap:10px',
      'max-width:360px', 'font-family:system-ui,-apple-system,sans-serif',
    ].join(';');
    (document.documentElement || document.body).appendChild(container);
    return container;
  }

  function showNotification(entry) {
    playBlockAlert(); // bunyikan alert saat notifikasi muncul
    const host = hostOf(entry.url);
    const card = document.createElement('div');
    card.style.cssText = [
      'background:#1e1b4b', 'color:#fff', 'border:1px solid rgba(255,255,255,.15)',
      'border-left:4px solid #ef4444', 'border-radius:12px', 'padding:14px 16px',
      'box-shadow:0 10px 30px rgba(0,0,0,.35)', 'font-size:13px', 'line-height:1.45',
      'animation:none',
    ].join(';');

    const title = document.createElement('div');
    title.style.cssText = 'font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:6px;';
    title.textContent = '🛡️ Redirect Diblokir';

    const domain = document.createElement('div');
    domain.style.cssText = 'margin-bottom:4px;';
    domain.innerHTML = 'Tujuan: <b style="color:#fca5a5;word-break:break-all">' + escapeHtml(host) + '</b>';

    const reason = document.createElement('div');
    reason.style.cssText = 'opacity:.85;margin-bottom:10px;font-size:12px;';
    reason.textContent = entry.reason || 'Redirect mencurigakan';

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

    const btnAllow = mkButton('Izinkan Sekali', '#fff', '#4c1d95');
    btnAllow.onclick = function () {
      allowOnce(entry);
      card.remove();
    };
    const btnWhitelist = mkButton('Whitelist domain', 'rgba(255,255,255,.12)', '#fff');
    btnWhitelist.onclick = function () {
      whitelistDomain(host);
      card.remove();
    };
    const btnClose = mkButton('Tutup', 'rgba(255,255,255,.12)', '#fff');
    btnClose.onclick = function () {
      card.remove();
    };

    actions.appendChild(btnAllow);
    actions.appendChild(btnWhitelist);
    actions.appendChild(btnClose);

    card.appendChild(title);
    card.appendChild(domain);
    card.appendChild(reason);
    card.appendChild(actions);

    const box = ensureContainer();
    box.appendChild(card);

    // Auto-hilang setelah 12 detik
    setTimeout(() => card.remove(), 12000);
  }

  function mkButton(text, bg, color) {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = [
      'padding:7px 12px', 'border:none', 'border-radius:8px', 'cursor:pointer',
      'font-size:12px', 'font-weight:600', 'background:' + bg, 'color:' + color,
    ].join(';');
    return b;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  // ─── Aksi pengguna ────────────────────────────────────────────────────────
  function allowOnce(entry) {
    // Izinkan retry di guard (jika halaman mencoba lagi) ...
    try {
      window.postMessage({ source: 'ANTIJUDOL_RG_ALLOW_ONCE', url: entry.url }, location.origin || '*');
    } catch (e) {}
    // ... dan buka tujuannya lewat background (navigasi asli sudah dibatalkan)
    try {
      chrome.runtime.sendMessage({ type: 'rgAllowOnce', url: entry.url, method: entry.method });
    } catch (e) {}
  }

  function whitelistDomain(host) {
    try {
      chrome.runtime.sendMessage({ type: 'rgWhitelistLocal', domain: host }, () => requestConfig());
    } catch (e) {}
  }

  console.log('[ANTI-JUDOL] Redirect Bridge aktif (isolated world)');
})();
