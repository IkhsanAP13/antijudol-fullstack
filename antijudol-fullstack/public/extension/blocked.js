(function () {

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

  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: 'siteBlocked', url: blockedUrl });
    }
  } catch (e) {

  }

  document.getElementById('backBtn').addEventListener('click', function () {

    location.href = 'https://www.google.com';
  });

  document.getElementById('closeBtn').addEventListener('click', function () {
    window.close();

    setTimeout(function () { location.href = 'https://www.google.com'; }, 200);
  });
})();
