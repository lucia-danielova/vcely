const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { mock, test } = require('node:test');

const sourcePath = path.join(__dirname, 'pwa-install.js');
const cssPath = path.join(__dirname, '../../css/style.css');

function classList() {
  const classes = new Set();
  return {
    add(name) { classes.add(name); },
    remove(name) { classes.delete(name); },
    contains(name) { return classes.has(name); }
  };
}

function createElement(id) {
  const listeners = {};
  const el = {
    id,
    hidden: false,
    textContent: '',
    title: '',
    dataset: {},
    classList: classList(),
    attributes: {},
    focusCount: 0,
    setAttribute(name, value) { el.attributes[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(el.attributes, name) ? el.attributes[name] : null; },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    click() {
      for (const fn of listeners.click || []) fn({ preventDefault() {} });
    },
    focus() {
      el.focusCount += 1;
      document.activeElement = el;
    }
  };
  return el;
}

function installDom() {
  const byId = {};
  const make = (id, props = {}) => {
    const el = createElement(id);
    Object.assign(el, props);
    byId[id] = el;
    return el;
  };

  const banner = make('android-install-banner', { hidden: true });
  make('pwa-install-title');
  make('android-install-btn');
  make('android-install-dismiss');
  make('android-install-ios-hint', { hidden: true });
  const windowsHint = make('android-install-windows-hint', { hidden: true });
  make('android-install-status');
  const login = make('login-email');
  const register = make('register-name');
  const cta = make('landing-install');

  const documentStub = {
    referrer: '',
    body: { classList: classList() },
    documentElement: { classList: classList() },
    activeElement: login,
    getElementById(id) { return byId[id] || null; },
    querySelectorAll(selector) {
      return selector === '[data-pwa-install]' ? [cta] : [];
    }
  };
  const windowStub = {
    navigator: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      platform: 'Win32',
      userAgentData: { platform: 'Windows' },
      maxTouchPoints: 0,
      standalone: false
    },
    matchMedia() { return { matches: false }; },
    addEventListener() {},
    setTimeout(...args) { return globalThis.setTimeout(...args); },
    location: { reload() {} }
  };
  const storage = new Map();

  const previous = {
    document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
    window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
    localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: documentStub });
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: windowStub });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key)
    }
  });

  return {
    banner,
    windowsHint,
    login,
    register,
    cta,
    restore() {
      for (const [key, descriptor] of Object.entries(previous)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    }
  };
}

async function loadModule() {
  const source = `${readFileSync(sourcePath, 'utf8')}\n// isolate ${Math.random()}\n`;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

test('windows hint focus rule is visible only while the hint is focused', () => {
  const css = readFileSync(cssPath, 'utf8');
  assert.match(
    css,
    /#android-install-windows-hint:focus\s*\{[^}]*outline:\s*2px solid #047857;/
  );
  assert.doesNotMatch(css, /#android-install-windows-hint\s*\{[^}]*outline:\s*none/);
});

test('Windows hint is focused only after an explicit install request', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const automatic = installDom();
  try {
    const first = await loadModule();
    first.bindPwaInstallUi();

    automatic.login.focus();
    mock.timers.tick(2800);

    assert.equal(automatic.banner.hidden, false);
    assert.equal(automatic.windowsHint.hidden, false);
    assert.equal(automatic.windowsHint.focusCount, 0);
    assert.equal(automatic.windowsHint.getAttribute('tabindex'), null);
    assert.equal(document.activeElement, automatic.login);

    automatic.register.focus();
    mock.timers.tick(2800);
    assert.equal(automatic.windowsHint.focusCount, 0);
    assert.equal(document.activeElement, automatic.register);

    automatic.cta.click();
    assert.equal(automatic.windowsHint.focusCount, 1);
    assert.equal(automatic.windowsHint.getAttribute('tabindex'), '-1');
    assert.equal(automatic.windowsHint.classList.contains('pwa-install-hint-pulse'), true);
    assert.equal(document.activeElement, automatic.windowsHint);

    automatic.login.focus();
    mock.timers.tick(900);
    assert.equal(document.activeElement, automatic.login);
    assert.equal(automatic.windowsHint.focusCount, 1);
  } finally {
    mock.timers.reset();
    automatic.restore();
  }

  mock.timers.enable({ apis: ['setTimeout'] });
  const explicit = installDom();
  try {
    const second = await loadModule();
    second.bindPwaInstallUi();

    explicit.cta.click();
    assert.equal(explicit.windowsHint.focusCount, 1);
    assert.equal(document.activeElement, explicit.windowsHint);

    explicit.login.focus();
    mock.timers.tick(2800);

    assert.equal(explicit.banner.hidden, false);
    assert.equal(explicit.windowsHint.focusCount, 1);
    assert.equal(document.activeElement, explicit.login);
  } finally {
    mock.timers.reset();
    explicit.restore();
  }
});
