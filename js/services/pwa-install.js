/**
 * Android / desktop PWA install + update UX.
 */
const DISMISS_KEY = 'vcely_install_dismissed_v1';
const DISMISS_DAYS = 14;

let deferredPrompt = null;
let installUiBound = false;

export function isStandaloneDisplay() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.navigator.standalone === true
    || document.referrer.includes('android-app://');
}

export function isIosSafari() {
  const ua = window.navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const chrome = /CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit && !chrome;
}

function wasRecentlyDismissed() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {}
}

function getBannerEls() {
  return {
    banner: document.getElementById('android-install-banner'),
    installBtn: document.getElementById('android-install-btn'),
    dismissBtn: document.getElementById('android-install-dismiss'),
    iosHint: document.getElementById('android-install-ios-hint'),
    status: document.getElementById('android-install-status')
  };
}

function showBanner(mode) {
  const { banner, iosHint, status, installBtn } = getBannerEls();
  if (!banner || isStandaloneDisplay() || wasRecentlyDismissed()) return;

  banner.hidden = false;
  banner.dataset.mode = mode;
  document.body.classList.add('has-install-banner');

  if (iosHint) iosHint.hidden = mode !== 'ios';
  if (installBtn) installBtn.hidden = mode === 'ios';
  if (status) {
    status.textContent = mode === 'ios'
      ? 'Na iPhone: Zdieľať → Pridať na plochu'
      : 'Nainštalujte si aplikáciu na Android — funguje offline a bez prehliadača';
  }
}

function hideBanner() {
  const { banner } = getBannerEls();
  if (banner) banner.hidden = true;
  document.body.classList.remove('has-install-banner');
}

async function promptInstall() {
  if (!deferredPrompt) {
    showBanner(isIosSafari() ? 'ios' : 'manual');
    return false;
  }
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  if (choice?.outcome === 'accepted') {
    hideBanner();
    return true;
  }
  return false;
}

export function bindPwaInstallUi() {
  if (installUiBound) return;
  installUiBound = true;

  const { installBtn, dismissBtn } = getBannerEls();

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    showBanner('ready');
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideBanner();
    markDismissed();
  });

  if (installBtn) {
    installBtn.addEventListener('click', () => {
      promptInstall();
    });
  }

  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      markDismissed();
      hideBanner();
    });
  }

  // Header / landing CTA hooks
  document.querySelectorAll('[data-pwa-install]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      promptInstall();
    });
  });

  if (isStandaloneDisplay()) {
    document.documentElement.classList.add('is-standalone-app');
    hideBanner();
    return;
  }

  if (isIosSafari() && !wasRecentlyDismissed()) {
    // Soft delay so first paint stays clean
    setTimeout(() => showBanner('ios'), 2400);
  }
}

export function watchServiceWorkerUpdates() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('./service-worker.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          const bar = document.getElementById('app-update-bar');
          if (bar) bar.hidden = false;
        }
      });
    });
  }).catch((error) => {
    console.warn('[Včely] Service worker registration failed:', error);
  });

  const reloadBtn = document.getElementById('app-update-reload');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      const bar = document.getElementById('app-update-bar');
      if (bar) bar.hidden = true;
      window.location.reload();
    });
  }
}

export async function initNativeCapacitorShell() {
  try {
    const cap = window.Capacitor;
    if (!cap?.isNativePlatform?.()) return false;
    document.documentElement.classList.add('is-native-android');
    document.documentElement.classList.add('is-standalone-app');
    return true;
  } catch {
    return false;
  }
}
