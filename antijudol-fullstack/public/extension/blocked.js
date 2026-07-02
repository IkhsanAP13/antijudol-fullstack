// ANTI-JUDOL — logic halaman blokir (eksternal, agar patuh CSP MV3 'script-src self')
(function () {
  // ─── Suara alert (MP3 EAS yang dibundel) saat halaman blokir muncul ─────
  let alertPlayed = false;
  function fireAlert() {
    try {
      const audio = new Audio('alert.mp3');
      audio.volume = 1.0;
      const p = audio.play();
      if (p && typeof p.then === 'function') {
        p.then(function () { alertPlayed = true; }).catch(function () { armGestureFallback(); });
      } else {
        alertPlayed = true;
      }
    } catch (e) {
      armGestureFallback();
    }
  }
  // Jika autoplay diblokir browser, bunyikan pada interaksi pertama
  function armGestureFallback() {
    if (alertPlayed) return;
    const onFirst = function () {
      document.removeEventListener('pointerdown', onFirst);
      document.removeEventListener('keydown', onFirst);
      fireAlert();
    };
    document.addEventListener('pointerdown', onFirst, { once: true });
    document.addEventListener('keydown', onFirst, { once: true });
  }
  fireAlert();

  // Ambil URL yang diblokir dari parameter ?u=
  const params = new URLSearchParams(location.search);
  const blocked = params.get('u');
  let blockedUrl = 'Situs perjudian terdeteksi';
  if (blocked) {
    try {
      blockedUrl = decodeURIComponent(blocked);
    } catch (e) {
      blockedUrl = blocked;
    }
  }

  // URL asli tetap dicatat ke database (walau tidak ditampilkan ke pengguna)
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: 'siteBlocked', url: blockedUrl });
    }
  } catch (e) {
    /* abaikan */
  }

  document.getElementById('backBtn').addEventListener('click', function () {
    // Arahkan ke halaman aman (Google) daripada history.back yang bisa kembali ke situs judi
    location.href = 'https://www.google.com';
  });

  document.getElementById('closeBtn').addEventListener('click', function () {
    window.close();
    // Jika tab tidak bisa ditutup (bukan dibuka oleh script), arahkan ke halaman aman
    setTimeout(function () { location.href = 'https://www.google.com'; }, 200);
  });
})();
