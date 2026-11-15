# Android aplikácia — Včely a pôda

Profesionálna inštalovateľná aplikácia na ochranu včiel a pôdy. Dva spôsoby inštalácie:

## 1) Okamžitá inštalácia (PWA) — Chrome / Android

1. Otvorte nasadenú HTTPS adresu aplikácie v Chrome na Androide.
2. Zobrazí sa banner **Nainštalovať na Android**, alebo menu ⋮ → **Inštalovať aplikáciu** / **Pridať na plochu**.
3. Aplikácia sa otvára v režime `standalone` (bez Chrome UI), so splash screenom, spodnou navigáciou a offline shellom.

Manifest: `manifest.json`  
Service worker: `service-worker.js`  
Inštalačný UX: `js/services/pwa-install.js`

## 2) Natívny APK (Capacitor)

Projekt obsahuje Capacitor Android wrapper (`android/`, `appId`: `sk.vcely.ochrana`).

### Lokálne

```bash
npm ci
npm run icons
npm run prepare:www
npx cap sync android
npm run android:open   # Android Studio
# alebo
cd android && ./gradlew assembleDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`

### CI

Workflow `.github/workflows/android-apk.yml` zostaví debug APK a nahrá ho ako artifact pri pushoch, ktoré menia frontend / Android konfiguráciu.

## Čo je nové v mobilnom UX

- Splash screen pri štarte
- Banner inštalácie + deep linky (`?view=map`, `?view=register`)
- Spodná Android navigácia (Domov / Mapa / Hľadať / Nástroje / Účet)
- Safe-area padding, maskable ikony, offline stránka
- Capacitor pluginy: App, StatusBar, SplashScreen, Keyboard, Network, Haptics
