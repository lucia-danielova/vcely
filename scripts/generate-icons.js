#!/usr/bin/env node
/**
 * Generates Android / PWA icon set from the brand SVG (any + maskable).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const SVG = path.join(ASSETS, 'agrogis-icon.svg');

const SIZES = [48, 72, 96, 128, 144, 192, 256, 384, 512];

async function renderAny(size) {
  const out = path.join(ASSETS, `icon-${size}.png`);
  await sharp(SVG)
    .resize(size, size, { fit: 'contain', background: { r: 4, g: 120, b: 87, alpha: 1 } })
    .png()
    .toFile(out);
  return out;
}

async function renderMaskable(size) {
  // Safe zone ~80% for Android adaptive icons
  const pad = Math.round(size * 0.1);
  const inner = size - pad * 2;
  const icon = await sharp(SVG)
    .resize(inner, inner, { fit: 'contain', background: { r: 4, g: 120, b: 87, alpha: 1 } })
    .png()
    .toBuffer();

  const out = path.join(ASSETS, `icon-maskable-${size}.png`);
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 4, g: 120, b: 87 }
    }
  })
    .composite([{ input: icon, left: pad, top: pad }])
    .png()
    .toFile(out);
  return out;
}

async function main() {
  if (!fs.existsSync(SVG)) {
    console.error('Missing', SVG);
    process.exit(1);
  }

  for (const size of SIZES) {
    await renderAny(size);
    await renderMaskable(size);
  }

  // Canonical aliases used by existing HTML / SW
  await sharp(path.join(ASSETS, 'icon-192.png')).toFile(path.join(ASSETS, 'agrogis-192.png'));
  await sharp(path.join(ASSETS, 'icon-512.png')).toFile(path.join(ASSETS, 'agrogis-512.png'));
  await sharp(path.join(ASSETS, 'icon-maskable-512.png')).toFile(path.join(ASSETS, 'agrogis-maskable-512.png'));

  // Android splash / TWA background plate
  await sharp({
    create: {
      width: 1280,
      height: 720,
      channels: 3,
      background: { r: 234, g: 243, b: 226 }
    }
  })
    .composite([{
      input: await sharp(SVG).resize(256, 256).png().toBuffer(),
      gravity: 'centre'
    }])
    .png()
    .toFile(path.join(ASSETS, 'splash-wide.png'));

  await sharp({
    create: {
      width: 1080,
      height: 1920,
      channels: 3,
      background: { r: 234, g: 243, b: 226 }
    }
  })
    .composite([{
      input: await sharp(SVG).resize(320, 320).png().toBuffer(),
      gravity: 'centre'
    }])
    .png()
    .toFile(path.join(ASSETS, 'splash-narrow.png'));

  console.log('Generated PWA / Android icons in assets/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
