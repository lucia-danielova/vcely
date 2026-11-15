/**
 * Cross-platform PWA install + update UX (Android, Windows, iOS).
 */
const DISMISS_KEY = 'vcely_install_dismissed_v1';
const DISMISS_DAYS = 14;

let deferredPrompt = null;
let installUiBound = false;

export function isStandaloneDisplay() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.matchMedia('(display-mode: window-controls-overlay)').matches
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

export function isWindowsDesktop() {
  const ua = window.navigator.userAgent || '';
  const platform = window.navigator.userAgentData?.platform
    || window.navigator.platform
    || '';
  if (/Windows/i.test(platform) || /Win32|Win64|Windows/i.test(ua)) {
    // Exclude Windows Phone / mobile UA leftovers
    return !/Windows Phone|Mobile/i.test(ua);
  }
  return false;
}

export function isAndroidDevice() {
  return /Android/i.test(window.navigator.userAgent || '');
}

/** @returns {'windows'|'android'|'ios'|'desktop'} */
export function getInstallPlatform() {
  if (isIosSafari()) return 'ios';
  if (isAndroidDevice()) return 'android';
  if (isWindowsDesktop()) return 'windows';
  return 'desktop';
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
    title: document.getElementById('pwa-install-title'),
    installBtn: document.getElementById('android-install-btn'),
    dismissBtn: document.getElementById('android-install-dismiss'),
    iosHint: document.getElementById('android-install-ios-hint'),
    windowsHint: document.getElementById('android-install-windows-hint'),
    status: document.getElementById('android-install-status')
  };
}

function copyForMode(mode, platform) {
  if (mode === 'ios') {
    return {
      title: 'Pridať na iPhone',
      status: 'Otvorte Zdieľať a zvoľte Pridať na plochu',
      button: 'Ako na iPhone'
    };
  }
  if (platform === 'windows') {
    return {
      title: mode === 'ready' ? 'Nainštalovať na Windows' : 'Inštalácia na Windows',
      status: mode === 'ready'
        ? 'Samostatné okno bez Edge/Chrome — na pracovnú plochu aj do ponuky Štart'
        : 'V Edge alebo Chrome: menu ⋯ → Aplikácie → Inštalovať túto lokalitu ako aplikáciu',
      // When manual steps are already on screen, hide the primary CTA (no-op "Zobraziť postup").
      button: mode === 'ready' ? 'Inštalovať' : ''
    };
  }
  if (platform === 'android') {
    return {
      title: 'Nainštalovať na Android',
      status: 'Samostatná aplikácia bez prehliadača, s offline shellom',
      button: 'Inštalovať'
    };
  }
  return {
    title: 'Nainštalovať aplikáciu',
    status: 'Funguje na Windows (Edge/Chrome) aj Android — offline shell, bez karty prehliadača',
    button: 'Inštalovať'
  };
}

function showBanner(mode) {
  const { banner, title, iosHint, windowsHint, status, installBtn } = getBannerEls();
  if (!banner || isStandaloneDisplay() || wasRecentlyDismissed()) return;

  const platform = getInstallPlatform();
  const copy = copyForMode(mode, platform);

  banner.hidden = false;
  banner.dataset.mode = mode;
  banner.dataset.platform = platform;
  document.body.classList.add('has-install-banner');

  if (title) title.textContent = copy.title;
  if (status) status.textContent = copy.status;

  const showWindowsSteps = platform === 'windows' && mode !== 'ready';
  if (iosHint) iosHint.hidden = mode !== 'ios';
  if (windowsHint) windowsHint.hidden = !showWindowsSteps;

  if (installBtn) {
    // iOS: no native prompt. Windows manual: steps already visible — hide redundant CTA.
    const hidePrimary = mode === 'ios' || showWindowsSteps || !copy.button;
    installBtn.hidden = hidePrimary;
    if (copy.button) installBtn.textContent = copy.button;
  }

  if (showWindowsSteps && windowsHint) {
    windowsHint.setAttribute('tabindex', '-1');
    try {
      windowsHint.focus({ preventScroll: false });
    } catch {}
  }
}

function hideBanner() {
  const { banner } = getBannerEls();
  if (banner) banner.hidden = true;
  document.body.classList.remove('has-install-banner');
}

async function promptInstall() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (choice?.outcome === 'accepted') {
      hideBanner();
      return true;
    }
    return false;
  }

  const platform = getInstallPlatform();
  if (platform === 'ios') {
    showBanner('ios');
    return false;
  }
  if (platform === 'windows') {
    const { banner, windowsHint } = getBannerEls();
    const stepsAlreadyVisible = banner
      && !banner.hidden
      && banner.dataset.mode === 'windows-manual'
      && windowsHint
      && !windowsHint.hidden;
    if (stepsAlreadyVisible) {
      windowsHint.setAttribute('tabindex', '-1');
      try {
        windowsHint.focus({ preventScroll: false });
      } catch {}
      windowsHint.classList.add('pwa-install-hint-pulse');
      window.setTimeout(() => windowsHint.classList.remove('pwa-install-hint-pulse'), 900);
      return false;
    }
    showBanner('windows-manual');
    return false;
  }
  showBanner('manual');
  return false;
}

function syncInstallCtaLabels() {
  const platform = getInstallPlatform();
  document.querySelectorAll('[data-pwa-install]').forEach((el) => {
    if (el.dataset.pwaLabelLocked === 'true') return;
    if (el.classList.contains('landing-install-button')) {
      el.title = platform === 'windows'
        ? 'Nainštalovať na Windows'
        : platform === 'android'
          ? 'Nainštalovať na Android'
          : 'Nainštalovať aplikáciu';
      return;
    }
    if (el.classList.contains('landing-cta-btn-install')) {
      el.textContent = platform === 'windows'
        ? 'Nainštalovať na Windows'
        : platform === 'android'
          ? 'Nainštalovať na Android'
          : 'Nainštalovať app';
    }
  });
}

export function bindPwaInstallUi() {
  if (installUiBound) return;
  installUiBound = true;

  const { installBtn, dismissBtn } = getBannerEls();
  syncInstallCtaLabels();

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

  // Soft prompts when the browser has not yet fired beforeinstallprompt
  if (!wasRecentlyDismissed()) {
    const platform = getInstallPlatform();
    if (platform === 'ios') {
      setTimeout(() => showBanner('ios'), 2400);
    } else if (platform === 'windows') {
      setTimeout(() => {
        if (!deferredPrompt) showBanner('windows-manual');
      }, 2800);
    }
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
