# Inštalácia — Včely a pôda (Windows + Android)

Aplikácia je Progressive Web App (PWA). Po inštalácii beží v samostatnom okne bez karty prehliadača, so splash screenom a offline shellom.

Live adresa: [https://lucia-danielova.github.io/vcely/](https://lucia-danielova.github.io/vcely/)

---

## Windows (Edge alebo Chrome)

1. Otvorte aplikáciu v **Microsoft Edge** alebo **Google Chrome** na Windows.
2. Po chvíli sa zobrazí banner **Nainštalovať na Windows**, alebo:
   - **Edge:** menu **⋯** → **Aplikácie** → **Inštalovať túto lokalitu ako aplikáciu**
   - **Chrome:** menu **⋮** → **Uložiť a zdieľať** / **Inštalovať aplikáciu…**
3. Potvrďte inštaláciu. Ikona sa objaví v ponuke **Štart** a môžete ju pripnúť na pracovnú plochu / panel úloh.
4. Ďalšie spustenie otvára samostatné okno (bez adresného riadku).

Windows podporuje aj `window-controls-overlay` z `manifest.json` — natívnejší vzhľad titulkového pruhu.

---

## Android (Chrome)

1. Otvorte HTTPS adresu v Chrome.
2. Banner **Nainštalovať na Android**, alebo ⋮ → **Inštalovať aplikáciu** / **Pridať na plochu**.
3. Aplikácia beží v `standalone` režime so spodnou navigáciou.

Natívny APK (Capacitor): pozri [android.md](./android.md).

---

## iPhone (Safari)

Zdieľať → **Pridať na plochu** (bez natívneho `beforeinstallprompt`).

---

## Technické súbory

| Súbor | Úloha |
|-------|--------|
| `manifest.json` | názov, ikony, `display_override`, screenshots |
| `service-worker.js` | offline shell |
| `js/services/pwa-install.js` | platformovo-aware banner (Windows / Android / iOS) |

Na HTTPS (GitHub Pages alebo Render) musí byť dostupný service worker — bez neho prehliadač inštaláciu neponúkne.
