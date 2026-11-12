# 🎨 AGROGIS Komponenty - Komplétna Dokumentácia

## 📦 Vytvorené Komponenty

### 1. **Navigation Menu** (`/js/components/navigation-menu.js`)
**Súbor:** `navigation-menu.js` | **Veľkosť:** ~16 KB

#### Funkcie:
- 🏠 Horizontálne menu so 7 hlavnými sekciami
- 📱 Mobile hamburger menu s slideout
- 🎯 Active state indikátor
- 👤 User status badge s menom
- ✨ Smooth dropdowns s hover efektmi
- 🚪 Logout s potvrdzovacím dialógom
- 📱 Fully responsive (mobile-first)

#### Sekcie Menu:
1. **Domov** - Úvodná stránka
2. **Mapa** - Interaktívna mapa
3. **Vyhľadávanie** (dropdown)
   - Podľa IČO
   - Subjekty RegisterUZ
   - Včelstvá
4. **Moje Parcely** (dropdown)
   - Zoznam parciel
   - Nová parcela
   - Nahrať GeoJSON
5. **Nástroje** (dropdown)
   - Meranie vzdialenosti
   - Detekcia kolízií
   - Export mapy
   - Hlásenie sprejov
6. **Profil** (dropdown)
   - Môj profil
   - Moje subjekty
   - Predplatné
7. **Nastavenia** (dropdown)
   - Všeobecné
   - Súkromie & Bezpečnosť
   - Notifikácie
   - Odhlásiť sa

---

### 2. **Advanced Search Module** (`/js/components/search-module.js`)
**Súbor:** `search-module.js` | **Veľkosť:** ~20 KB

#### Funkcie:
- 🔍 Live autocomplete s real-time výsledkami
- 📊 Tri režimy vyhľadávania:
  - **IČO** - Vyhľadávanie podľa IČO
  - **Entity** - Subjekty RegisterUZ
  - **Hives** - Včelstvá
- 🎯 Filtry (typ subjektu, mesto, okres)
- ⏱️ Nedávne vyhľadávania (localStorage)
- ⚡ Rýchle filtre (Všetci, Poľnohospodári, Včelárov, Zverení)
- ⏳ Loading spinner pri dotazoch
- 🔄 Autocomplete dropdown s max 8 výsledkami

#### Vyhľadávaných Dát:
- Store: `store.entities` - poľnohospodárske subjekty
- Store: `store.hives` - včelstvá
- Filtruje automaticky podľa názvu a IČO
- Ukladá posledných 10 vyhľadávaní v localStorage

---

### 3. **Map Layer Controller** (`/js/components/map-layers.js`)
**Súbor:** `map-layers.js` | **Veľkosť:** ~18 KB

#### Funkcie:
- 🎨 Ovládanie 6 vrstiev na mape
- ✅ Checkboxes pre viditeľnosť
- 🎚️ Opacity slider (0-100%)
- 📤 Export do PNG a GeoJSON
- 🔗 Merge layers support
- 🔄 Reset layers do pôvodného stavu
- 📖 Interaktívna legenda
- 🎯 Per-layer opacity kontrola

#### Dostupné Vrstvy:
1. **Katastrálne parcely** - Hranice z katastra
2. **LPIS** - Land Parcel Identification System
3. **Hydrometeorológia** - Vodné toky, pôdy
4. **Počasie** - Meteo údaje
5. **Včelstvá** - Poloha úľov
6. **Hlásenia sprejov** - Zóny aplikácií

#### Export Formáty:
- 📷 PNG - Screenshot mapy
- 📄 GeoJSON - Vektorové dáta

---

### 4. **Dashboard Component** (`/js/components/dashboard.js`)
**Súbor:** `dashboard.js` | **Veľkosť:** ~25 KB

#### Funkcie:
- 👤 User profile card s avatárom
- 📊 Štatistiky (počet parcel, plocha, typ subjektu)
- ⏰ Nedávne aktivity (timeline)
- 🌤️ Weather widget s real-time dátami
- ⚡ 5 Quick action tlačidiel
- 📈 Performance metriky s progress barmi
- 💎 Subscription status badge
- 📱 Responsive grid layout

#### Quick Actions:
1. 📍 **Nová parcela** - Vytvorenie novej parcely
2. 📄 **Nahrať GeoJSON** - Import geometrie
3. ⚠️ **Detekcia kolízií** - Hľadanie problémov
4. 📤 **Exportovať dáta** - Export informácií
5. 🚜 **Hlásenie spreje** - Notifikácia pre včelárov

#### Performance Metriky:
- API Volania (počet, limit)
- Spracované dáta (GB)
- Priemerný čas odozvy (ms)
- Zdravie systému (%)

---

## 🔌 Integrácia do Projektu

### HTML Šablóna
```html
<div id="nav-menu-container"></div>
<div id="search-module-container"></div>
<div id="map-layers-container"></div>
<div id="dashboard-container"></div>
<div id="agromap" style="height: 600px;"></div>
<div id="toast-container"></div>
```

### JavaScript Inicializácia
```javascript
import { NavigationMenu } from './js/components/navigation-menu.js';
import { SearchModule } from './js/components/search-module.js';
import { MapLayerController } from './js/components/map-layers.js';
import { Dashboard } from './js/components/dashboard.js';

const navMenu = new NavigationMenu('nav-menu-container');
const search = new SearchModule('search-module-container');
const layers = new MapLayerController(mapEngine, 'map-layers-container');
const dashboard = new Dashboard('dashboard-container');
```

---

## 🎨 Tailwind CSS Štýly

Všetky komponenty používajú **Tailwind CSS** bez externých CSS súborov.

### Farebná Paleta:
- 🟢 **Emerald** (`emerald-*`) - Primárna farba
- 🔵 **Sky** (`sky-*`) - Sekundárna farba
- ⚫ **Slate** (`slate-*`) - Neutrálne farby
- 🟠 **Amber** (`amber-*`) - Varovania
- 🔴 **Rose** (`rose-*`) - Chyby
- 🟣 **Purple** (`purple-*`) - Akcenty

---

## 🔄 Event Bus Komunikácia

Komponenty si medzi sebou komunikujú cez `globalBus`:

### Navigation Menu Events
```javascript
globalBus.on('navigation:changed', (data) => {
    // { href, menuId }
});
globalBus.on('auth:logout', () => {
    // Užívateľ sa odhlásil
});
```

### Search Module Events
```javascript
globalBus.on('search:performed', (data) => {
    // { mode, query, filters, data }
});
```

### Map Layer Controller Events
```javascript
globalBus.on('map:layer-changed', (data) => {
    // { layerId, visible, opacity }
});
globalBus.on('map:exported', (data) => {
    // { format: 'png' | 'geojson' }
});
globalBus.on('map:merge-layers', (data) => {
    // { layers }
});
globalBus.on('map:layers-reset', () => {});
```

### Dashboard Events
```javascript
globalBus.on('dashboard:action', (data) => {
    // { action: 'new-parcel' | 'import-geojson' | ... }
});
```

---

## 💾 State Store Integrácia

Komponenty čítajú a reagujú na zmeny v `store`:

```javascript
store.subscribe((state) => {
    // State changed
});

// Dostupné properties:
store._state.currentUser       // Prihlásený užívateľ
store._state.currentPersona    // Typ účtu
store._state.entities          // Poľnohospodárske subjekty
store._state.hives             // Včelstvá
store._state.cadasterParcels   // Katastrálne parcely
store._state.lpisParcels       // LPIS parcely
```

---

## 📱 Responsive Design

Všetky komponenty sú plne responsive:

### Breakpoints (Tailwind):
- **Mobile** (`< 640px`) - Stack layout, full width
- **Tablet** (`640px - 1024px`) - 2 column layout
- **Desktop** (`> 1024px`) - 3-4 column grid layout

### Mobile Optimizácie:
- Navigation: Hamburger menu namiesto horizontal
- Search: Full width input, simplified filters
- Dashboard: Stack na 1 stĺpec
- Map: Adjustovaná výška, touch-friendly controls

---

## 🧪 Testovací Príklad

Prejdite na: `components-example.html`

```bash
# V prehliadači
window.AGROGIS.testSearch()      # Test vyhľadávania
window.AGROGIS.testWeather()     # Update počasia
window.AGROGIS.testActivity()    # Pridať aktivitu
window.AGROGIS.testNotification() # Test notifikácie
```

---

## 📚 API Reference

### NavigationMenu
```javascript
navMenu.setCurrentUser(user)     // Nastaviť meno užívateľa
navMenu.setActiveMenu(menuId)    // Nastaviť aktívnu sekciu
navMenu.destroy()                 // Zničiť komponent
```

### SearchModule
```javascript
searchModule.performSearch()      // Vykonať vyhľadávanie
searchModule.loadRecentSearches() // Načítať nedávne
searchModule.destroy()            // Zničiť komponent
```

### MapLayerController
```javascript
layerController.toggleLayerVisibility(id, visible) // Prepnúť viditeľnosť
layerController.updateLayerOpacity(id, opacity)    // Zmeniť priehľadnosť
layerController.exportMapAsPNG()  // Exportovať PNG
layerController.exportMapAsGeoJSON() // Exportovať GeoJSON
layerController.mergeLayers()     // Zlúčiť vrstvy
layerController.resetLayers()     // Obnoviť pôvodné
layerController.destroy()         // Zničiť komponent
```

### Dashboard
```javascript
dashboard.addActivity(activity)   // Pridať novú aktivitu
dashboard.updateWeatherWidget(weather) // Aktualizovať počasie
dashboard.loadDashboardData()     // Načítať dáta zo store
dashboard.destroy()               // Zničiť komponent
```

---

## ✨ Produktové Vlastnosti

- ✅ **Vanilla JavaScript** - Bez React, Vue, Angular
- ✅ **Production-Ready** - Optimizovaný, testovaný kód
- ✅ **Modular Architecture** - Čisté, independentné komponenty
- ✅ **Event-Driven** - Komunikácia cez Event Bus
- ✅ **State Management** - Integrácia so store
- ✅ **Tailwind CSS** - Modern, responsive design
- ✅ **localStorage** - Trvalé dáta (nedávne vyhľadávania)
- ✅ **Responsive** - Mobile-first design
- ✅ **Accessible** - ARIA labels a keyboard support
- ✅ **Performant** - Optimalizovaný render, event delegation

---

## 🚀 Nasadenie

1. Kopírujte `/js/components/` súbory do vášho projektu
2. Importujte komponenty v ES6 moduloch
3. Inicializujte s HTML container IDs
4. Pripojte Event Bus listenery
5. Spustite a testujte

---

## 📖 Ďalšie Zdroje

- **Tailwind CSS**: https://tailwindcss.com
- **Leaflet Maps**: https://leafletjs.com
- **State Store**: `js/core/state-store.js`
- **Event Bus**: `js/components/event-bus.js`
- **Map Engine**: `js/components/map-engine.js`

---

**Všetky komponenty sú hotové a production-ready! 🎉**
