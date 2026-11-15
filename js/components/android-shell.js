/**
 * Mobile Android app chrome: splash, bottom navigation, safe-area layout.
 */

let splashTimer = null;

export function hideAppSplash() {
  const splash = document.getElementById('app-splash');
  if (!splash) return;
  splash.classList.add('app-splash-hide');
  window.clearTimeout(splashTimer);
  splashTimer = window.setTimeout(() => {
    splash.hidden = true;
    splash.setAttribute('aria-hidden', 'true');
  }, 420);
}

export function showAppSplashBriefly() {
  const splash = document.getElementById('app-splash');
  if (!splash) return;
  splash.hidden = false;
  splash.classList.remove('app-splash-hide');
  splash.setAttribute('aria-hidden', 'false');
  splashTimer = window.setTimeout(hideAppSplash, 900);
}

export function setBottomNavActive(section) {
  document.querySelectorAll('[data-bottom-nav]').forEach((btn) => {
    const active = btn.getAttribute('data-bottom-nav') === section;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-current', active ? 'page' : 'false');
  });
}

export function bindAndroidShell({
  openLanding,
  closeLanding,
  switchTab,
  openAuth,
  isLandingVisible
}) {
  const nav = document.getElementById('android-bottom-nav');
  if (!nav) return;

  nav.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-bottom-nav]');
    if (!btn) return;
    const section = btn.getAttribute('data-bottom-nav');
    setBottomNavActive(section);

    if (section === 'home') {
      openLanding?.();
      return;
    }

    if (isLandingVisible?.()) closeLanding?.();

    if (section === 'map') {
      switchTab?.('layers');
      return;
    }
    if (section === 'search') {
      switchTab?.('search');
      return;
    }
    if (section === 'tools') {
      switchTab?.('tools');
      return;
    }
    if (section === 'account') {
      switchTab?.('portal');
      openAuth?.();
    }
  });

  // Sync active state when landing opens/closes via other controls
  const sync = () => {
    if (isLandingVisible?.()) setBottomNavActive('home');
  };
  window.addEventListener('vcely:landing-changed', sync);
}

export function emitLandingChanged(visible) {
  window.dispatchEvent(new CustomEvent('vcely:landing-changed', { detail: { visible } }));
}

export function applySafeAreaClasses() {
  document.documentElement.classList.add('android-safe-ui');
}
