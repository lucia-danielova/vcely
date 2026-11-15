#!/usr/bin/env node
/**
 * Copies the static web shell into www/ for Capacitor Android packaging.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');

const ENTRIES = [
  'index.html',
  'offline.html',
  '404.html',
  'manifest.json',
  'service-worker.js',
  'css',
  'js',
  'assets'
];

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

rmrf(WWW);
fs.mkdirSync(WWW, { recursive: true });

for (const entry of ENTRIES) {
  const src = path.join(ROOT, entry);
  if (!fs.existsSync(src)) {
    console.warn('skip missing', entry);
    continue;
  }
  copyRecursive(src, path.join(WWW, entry));
}

console.log('Prepared www/ for Capacitor sync');
