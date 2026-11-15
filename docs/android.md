# Android aplikácia — Včely a pôda

Spoločný návod na inštaláciu (Windows + Android + iPhone): **[install.md](./install.md)**.

## Natívny APK (Capacitor)

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

## Mobilný UX (Android)

- Splash screen pri štarte
- Banner inštalácie + deep linky (`?view=map`, `?view=register`)
- Spodná Android navigácia (Domov / Mapa / Hľadať / Nástroje / Účet)
- Safe-area padding, maskable ikony, offline stránka
- Capacitor pluginy: App, StatusBar, SplashScreen, Keyboard, Network, Haptics
