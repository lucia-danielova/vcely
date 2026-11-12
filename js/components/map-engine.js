/**
 * @file map-engine.js
 * @description ZBGIS Professional Geodetic Engine — 100% bezkľúčové mapy (Esri Imagery, ZBGIS Topo, OpenTopoMap, Esri Dark), ÚGKK WMS, Live Meteo a 3 km PostGIS kolízie.
 */

import { store } from '../core/state-store.js';
import { AgroApiService } from '../services/api.js';
import { OfflineSyncService } from '../services/offline-sync.js';
import { showNotificationToast } from './event-bus.js';

export class AgroMapEngine {
    constructor(containerId, supabaseClient, isCloudConfigured = false, apiService = null) {
        this.containerId = containerId;
        this.supabase = supabaseClient;
        this.isCloudConfigured = isCloudConfigured;
        this.apiService = apiService || new AgroApiService();

        this.map = null;
        this.baseLayers = {};
        this.currentBaseLayer = null;

        this.companyLayer = L.layerGroup();
        this.lpisVectorLayer = L.layerGroup();
        this.cadastreParcelLayer = L.layerGroup();
        this.hivesLayer = L.layerGroup();
        this.hiveRadiiLayer = L.layerGroup();
        this.sprayLayer = L.layerGroup();
        this.measureLayer = L.layerGroup();
        this.drawLayer = L.layerGroup();

        this.katasterWmsLayer = null;
        this.dmrWmsLayer = null;

        this.measurePoints = [];
        this.drawPolygonPoints = [];
        this.pendingHiveLatLng = null;

        this.initMap();
        this._initStoreSubscription();
    }

    initMap() {
        this.map = L.map(this.containerId, {
            zoomControl: false,
            crs: L.CRS.EPSG3857
        }).setView([48.35, 17.75], 9);

        L.control.zoom({ position: 'bottomright' }).addTo(this.map);
        L.control.scale({ imperial: false, position: 'bottomleft', maxWidth: 220 }).addTo(this.map);

        // ====================================================================
        // 1. 100% BEZPLATNÉ MAPOVÉ PODKLADY BEZ API KĽÚČOV A BEZ VODOZNAKOV
        // ====================================================================

        // A. LETECKÁ ORTOFOTOMOZAIKA SR HYBRID (Esri World Imagery + ÚGKK SR Ortofoto WMS + Esri Názvy obcí)
        const esriWorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; Esri World Imagery &copy; ÚGKK SR ZBGIS',
            maxZoom: 20
        });
        const ugkkOrthoWms = L.tileLayer.wms('https://zbgisws.skgeodesy.sk/zbgis_ortofoto_wms/service.svc/get', {
            layers: '1',
            format: 'image/jpeg',
            transparent: false,
            version: '1.3.0',
            minZoom: 14,
            maxZoom: 20
        });
        const esriHybridLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 20,
            pane: 'overlayPane'
        });
        const orthoHybridGroup = L.layerGroup([esriWorldImagery, ugkkOrthoWms, esriHybridLabels]);

        // B. SVETLÁ ZBGIS TOPOGRAFICKÁ MAPA (Esri World Topographic Map)
        const zbgisTopoLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; Esri World Topographic &copy; ÚGKK SR',
            maxZoom: 19
        });

        // C. PRÍRODA, LESY A VRSTEVNICE (OpenTopoMap)
        const terrainLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenTopoMap (CC-BY-SA) &copy; OpenStreetMap',
            maxZoom: 17
        });

        // D. NOČNÝ KONTRAST (Esri Dark Gray Canvas + Reference)
        const esriDarkBase = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; Esri Dark Gray Canvas',
            maxZoom: 19
        });
        const esriDarkRef = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19
        });
        const darkCanvasGroup = L.layerGroup([esriDarkBase, esriDarkRef]);

        this.baseLayers = {
            ortho: orthoHybridGroup,
            zbgis: zbgisTopoLayer,
            terrain: terrainLayer,
            dark: darkCanvasGroup
        };

        this.currentBaseLayer = orthoHybridGroup;
        this.currentBaseLayer.addTo(this.map);

        // ====================================================================
        // 2. OFICIÁLNE ŠTÁTNE WMS VRSTVY ÚGKK SR (ZBGIS)
        // ====================================================================
        this.katasterWmsLayer = L.tileLayer.wms('https://zbgisws.skgeodesy.sk/zbgis_kataster_wms/service.svc/get', {
            layers: '1,2,3,4,5',
            format: 'image/png',
            transparent: true,
            version: '1.3.0',
            opacity: 0.9,
            attribution: '© ÚGKK SR — Katastrálna mapa ZBGIS',
            minZoom: 14,
            maxZoom: 20
        });

        this.dmrWmsLayer = L.tileLayer.wms('https://zbgisws.skgeodesy.sk/zbgis_dmr_wms/service.svc/get', {
            layers: '0',
            format: 'image/png',
            transparent: true,
            version: '1.3.0',
            opacity: 0.45,
            attribution: '© ÚGKK SR — DMR 5.0 Tieňovaný reliéf',
            minZoom: 8,
            maxZoom: 19
        });

        if (store.getState().isKatasterVisible) {
            this.katasterWmsLayer.addTo(this.map);
            this.map.setZoom(15);
        }

        // 3. Pridanie vektorových vrstiev do mapy
        this.lpisVectorLayer.addTo(this.map);
        this.cadastreParcelLayer.addTo(this.map);
        this.hiveRadiiLayer.addTo(this.map);
        this.sprayLayer.addTo(this.map);
        this.hivesLayer.addTo(this.map);
        this.companyLayer.addTo(this.map);
        this.measureLayer.addTo(this.map);
        this.drawLayer.addTo(this.map);

        this.renderLpisParcels();
        this.renderAllHives();
        this._updateCartographicScale();
        this._initMapEvents();
        this.updateLiveWeatherAtCenter();
    }

    setBaseLayer(layerKey) {
        if (!this.baseLayers[layerKey]) return;
        if (this.currentBaseLayer) this.map.removeLayer(this.currentBaseLayer);
        this.currentBaseLayer = this.baseLayers[layerKey];
        this.currentBaseLayer.addTo(this.map);

        ['ortho', 'zbgis', 'terrain', 'dark'].forEach(k => {
            const sideBtn = document.getElementById(`btn-base-${k}`);
            if (sideBtn) sideBtn.classList.toggle('active-basemap', k === layerKey);

            const floatBtn = document.getElementById(`float-base-${k}`);
            if (floatBtn) floatBtn.classList.toggle('active-float-pill', k === layerKey);
        });
    }

    setLayerOpacity(layerType, percentValue) {
        const opacity = Number(percentValue) / 100;
        if (layerType === 'kataster' && this.katasterWmsLayer) {
            this.katasterWmsLayer.setOpacity(opacity);
        } else if (layerType === 'dmr' && this.dmrWmsLayer) {
            this.dmrWmsLayer.setOpacity(opacity);
        } else if (layerType === 'lpis') {
            store.setState({ lpisOpacity: opacity });
            this.renderLpisParcels(store.getState().activeEntity?.ico || null);
        }
    }

    async updateLiveWeatherAtCenter() {
        if (!this.map) return;
        const c = this.map.getCenter();
        try {
            const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat.toFixed(4)}&longitude=${c.lng.toFixed(4)}&current=temperature_2m,wind_speed_10m`);
            const data = await res.json();
            if (data && data.current) {
                const temp = data.current.temperature_2m;
                const windKmh = data.current.wind_speed_10m;
                const windMs = (windKmh / 3.6).toFixed(1);

                const tempEl = document.getElementById('weather-temp');
                const windEl = document.getElementById('weather-wind');
                const statusEl = document.getElementById('weather-spray-status');

                if (tempEl) tempEl.innerText = `${temp.toFixed(1)}°C`;
                if (windEl) windEl.innerText = `Vietor: ${windMs} m/s`;
                if (statusEl) {
                    if (parseFloat(windMs) <= 4.0 && temp <= 25.0) {
                        statusEl.className = 'bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-extrabold px-2.5 py-0.5 rounded-md';
                        statusEl.innerText = 'Postrek Bezpečný';
                    } else {
                        statusEl.className = 'bg-rose-100 text-rose-800 border border-rose-300 text-[10px] font-extrabold px-2.5 py-0.5 rounded-md';
                        statusEl.innerText = 'Riziko úletu vetrom!';
                    }
                }
            }
        } catch {}
    }

    renderCadastreParcel(parcelData) {
        if (!parcelData || !this.map) return;
        this.cadastreParcelLayer.clearLayers();

        const isCKN = parcelData.register === 'C';
        const strokeColor = isCKN ? '#0284c7' : '#9333ea';
        const fillColor = isCKN ? '#0ea5e9' : '#a855f7';
        const dashPattern = isCKN ? null : '8, 5';

        const polygon = L.polygon(parcelData.coords, {
            color: strokeColor,
            weight: 3.5,
            dashArray: dashPattern,
            fillColor: fillColor,
            fillOpacity: 0.36
        });

        const jtsk = AgroApiService.wgs84ToSJTSK(parcelData.center[0], parcelData.center[1]);
        const fullCode = `${parcelData.register}-KN parc. č. ${parcelData.parcelNumber}`;
        const zbgisUrl = `https://zbgis.skgeodesy.sk/mkzbgis/sk/kataster?pos=${parcelData.center[0].toFixed(6)},${parcelData.center[1].toFixed(6)},17`;

        const labelIcon = L.divIcon({
            className: 'custom-div-marker',
            html: `
                <div style="background: ${isCKN ? '#0369a1' : '#7e22ce'}; color: #ffffff; padding: 4px 10px; border-radius: 8px; font-family: 'JetBrains Mono', monospace; font-weight: 800; font-size: 11px; border: 2px solid #ffffff; box-shadow: 0 4px 14px rgba(0,0,0,0.45); white-space: nowrap;">
                    📐 ${parcelData.register}-KN ${parcelData.parcelNumber}
                </div>
            `,
            iconSize: [120, 26],
            iconAnchor: [60, 13]
        });

        const labelMarker = L.marker(parcelData.center, { icon: labelIcon });

        const popupHtml = `
            <div class="p-2.5 space-y-2 min-w-[270px]">
                <div class="flex items-center justify-between border-b border-stone-200 pb-1.5">
                    <span class="${isCKN ? 'bg-sky-100 text-sky-900 border border-sky-300' : 'bg-purple-100 text-purple-900 border border-purple-300'} font-mono font-bold text-[10px] px-2.5 py-0.5 rounded-full uppercase">
                        📐 ${fullCode}
                    </span>
                    <span class="text-xs font-extrabold text-emerald-700">${parcelData.areaSqM.toLocaleString('sk-SK')} m² (${parcelData.areaHa} ha)</span>
                </div>
                <div class="text-xs space-y-1 text-slate-700">
                    <div><span class="text-slate-500">Katastrálne územie:</span> <b class="text-slate-900">${parcelData.kuName}</b> <span class="font-mono text-slate-500">(${parcelData.kuCode})</span></div>
                    <div><span class="text-slate-500">Obec / Okres:</span> <span>${parcelData.obec} (${parcelData.okres})</span></div>
                    <div><span class="text-slate-500">List vlastníctva:</span> <b class="text-amber-700">LV č. ${parcelData.lvNumber}</b></div>
                    <div><span class="text-slate-500">Druh pozemku:</span> <b class="text-emerald-800">${parcelData.druhPozemku}</b></div>
                    <div><span class="text-slate-500">Vlastník / Užívateľ:</span> <span>${parcelData.vlastnik}</span></div>
                    <div class="text-[10px] font-mono text-sky-700 font-bold pt-1">Ťažisko S-JTSK: Y ${jtsk.y} m, X ${jtsk.x} m</div>
                </div>
                <div class="space-y-1.5 pt-1.5 border-t border-stone-200">
                    <button onclick="window.runSprayCheckOnCoords(${parcelData.center[0]}, ${parcelData.center[1]}, '${fullCode} (${parcelData.kuName})')" class="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] py-2 px-2 rounded-xl shadow-sm transition">
                        ⚠️ Overiť 3 km ochranné pásmo včiel
                    </button>
                    <div class="grid grid-cols-2 gap-1.5">
                        <button onclick="window.promoteCadastreToLpis()" class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] py-1.5 px-2 rounded-xl transition">
                            ➕ Previesť do LPIS
                        </button>
                        <a href="${zbgisUrl}" target="_blank" rel="noopener noreferrer" class="bg-stone-100 hover:bg-stone-200 text-sky-800 font-bold text-[10px] py-1.5 px-2 rounded-xl border border-stone-300 text-center transition block">
                            🔗 Otvoriť v ZBGIS
                        </a>
                    </div>
                </div>
            </div>
        `;

        polygon.bindPopup(popupHtml);
        labelMarker.bindPopup(popupHtml);

        this.cadastreParcelLayer.addLayer(polygon);
        this.cadastreParcelLayer.addLayer(labelMarker);

        this.map.flyTo(parcelData.center, 16, { duration: 1.2 });
        setTimeout(() => polygon.openPopup(), 400);

        this.updateSidebarAnalysisPanel(
            `Kataster ${parcelData.register}-KN`,
            isCKN ? 'bg-sky-100 text-sky-900 border border-sky-300' : 'bg-purple-100 text-purple-900 border border-purple-300',
            `
                <div class="font-extrabold text-slate-900 text-xs">📐 ${fullCode} — k. ú. ${parcelData.kuName} (${parcelData.kuCode})</div>
                <div class="text-[11px] text-emerald-700 font-bold">Výmera: ${parcelData.areaSqM.toLocaleString('sk-SK')} m² (${parcelData.areaHa} ha) | LV č. ${parcelData.lvNumber}</div>
                <div class="text-[11px] text-slate-700">Druh pozemku: <b>${parcelData.druhPozemku}</b></div>
                <div class="text-[10px] font-mono text-sky-700 font-bold">S-JTSK: Y ${jtsk.y} m, X ${jtsk.x} m</div>
                <div class="grid grid-cols-2 gap-1.5 pt-2">
                    <button onclick="window.runSprayCheckOnCoords(${parcelData.center[0]}, ${parcelData.center[1]}, '${fullCode} (${parcelData.kuName})')" class="bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] py-2 px-2 rounded-xl transition">
                        ⚠️ 3 km test včiel
                    </button>
                    <button onclick="window.promoteCadastreToLpis()" class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] py-2 px-2 rounded-xl transition">
                        ➕ Uložiť do LPIS
                    </button>
                </div>
            `
        );
    }

    renderLpisParcels(highlightIco = null) {
        this.lpisVectorLayer.clearLayers();
        const state = store.getState();
        if (!state.isLpisLayerVisible) return;

        const baseFillOpacity = state.lpisOpacity || 0.35;

        state.lpisParcels.forEach(parcel => {
            const isHighlighted = highlightIco && parcel.ownerIco === highlightIco;

            const polygon = L.polygon(parcel.coords, {
                color: isHighlighted ? '#047857' : '#059669',
                weight: isHighlighted ? 4 : 2.5,
                fillColor: isHighlighted ? '#059669' : '#10b981',
                fillOpacity: isHighlighted ? Math.min(0.75, baseFillOpacity + 0.2) : baseFillOpacity
            });

            polygon.bindTooltip(`<b>${parcel.id}</b> (${parcel.areaHa} ha)<br>${parcel.crop}`, {
                sticky: true,
                direction: 'top'
            });

            polygon.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                const currentMode = store.getState().interactionMode;

                if (currentMode === 'SPRAY') {
                    this.checkSprayCollision(e.latlng.lat, e.latlng.lng, parcel);
                    return;
                }
                if (currentMode === 'IDENTIFY') {
                    this.identifyPointOnMap(e.latlng.lat, e.latlng.lng);
                    return;
                }

                this._showParcelPopup(parcel, e.latlng);
            });

            this.lpisVectorLayer.addLayer(polygon);
        });
    }

    _showParcelPopup(parcel, latlng) {
        const targetLatLng = latlng || L.latLng(parcel.center[0], parcel.center[1]);
        const jtsk = AgroApiService.wgs84ToSJTSK(targetLatLng.lat, targetLatLng.lng);

        const popupHtml = `
            <div class="p-2.5 space-y-2 min-w-[255px]">
                <div class="flex items-center justify-between border-b border-stone-200 pb-1">
                    <span class="bg-emerald-100 text-emerald-900 border border-emerald-300 font-mono font-bold text-[10px] px-2.5 py-0.5 rounded-full">${parcel.id}</span>
                    <span class="text-xs font-extrabold text-emerald-700">${parcel.areaHa} ha</span>
                </div>
                <div class="text-xs space-y-1 text-slate-700">
                    <div><span class="text-slate-500">Užívateľ:</span> <b class="text-slate-900">${parcel.ownerName}</b></div>
                    <div><span class="text-slate-500">IČO:</span> <span class="font-mono font-bold">${parcel.ownerIco}</span></div>
                    <div><span class="text-slate-500">Katastrálne územie:</span> <span class="text-sky-700 font-semibold">${parcel.kUzemie || 'SR'}</span></div>
                    <div><span class="text-slate-500">Kultúra:</span> <span>${parcel.kultura}</span></div>
                    <div><span class="text-slate-500">Plodina:</span> <b class="text-amber-700">${parcel.crop}</b></div>
                    <div class="text-[10px] font-mono text-sky-700 font-bold pt-1">S-JTSK: Y ${jtsk.y} m, X ${jtsk.x} m</div>
                </div>
                <button onclick="window.runSprayCheckOnCoords(${parcel.center[0]}, ${parcel.center[1]}, '${parcel.id}')" class="w-full mt-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] py-2 px-2 rounded-xl shadow-sm transition-all">
                    ⚠️ Overiť postrek na tomto bloku (3 km)
                </button>
            </div>
        `;

        L.popup()
            .setLatLng(targetLatLng)
            .setContent(popupHtml)
            .openOn(this.map);

        this.updateSidebarAnalysisPanel(
            'Pozemok zakreslený v aplikácii',
            'bg-emerald-100 text-emerald-900 border border-emerald-300',
            `
                <div class="font-extrabold text-slate-900">${parcel.id} — ${parcel.ownerName}</div>
                <div class="text-[11px] text-slate-600">Výmera: <b class="text-emerald-700">${parcel.areaHa} ha</b> | k. ú.: ${parcel.kUzemie || 'SR'}</div>
                <div class="text-[11px] text-slate-700">Plodina: <b class="text-amber-700">${parcel.crop}</b></div>
                <div class="text-[10px] font-mono text-sky-700 font-bold">S-JTSK: Y ${jtsk.y}, X ${jtsk.x}</div>
                <button onclick="window.runSprayCheckOnCoords(${parcel.center[0]}, ${parcel.center[1]}, '${parcel.id}')" class="w-full mt-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] py-2 px-3 rounded-xl transition">
                    ⚠️ Spustiť 3 km test kolízie s včelstvami
                </button>
            `
        );
    }

    renderAllHives(collidedHiveIds = new Set()) {
        this.hivesLayer.clearLayers();
        this.hiveRadiiLayer.clearLayers();

        const state = store.getState();
        const hives = state.hives || [];

        const countEl = document.getElementById('hive-count-status');
        if (countEl) countEl.innerText = `${hives.length} stanovíšť v mape`;

        if (!state.isHivesLayerVisible) return;

        hives.forEach(hive => {
            const isEndangered = collidedHiveIds.has(hive.id);
            const badgeBg = isEndangered
                ? 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)'
                : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
            const pulseClass = isEndangered ? 'hive-danger-pulse' : '';
            const jtsk = AgroApiService.wgs84ToSJTSK(hive.lat, hive.lng);

            const hiveIcon = L.divIcon({
                className: 'custom-div-marker',
                html: `
                    <div class="${pulseClass}" style="background: ${badgeBg}; color: white; padding: 4px 11px; border-radius: 9999px; font-weight: 800; font-size: 11px; box-shadow: 0 6px 16px rgba(0,0,0,0.45); display: inline-flex; align-items: center; gap: 4px; border: 2px solid #ffffff; white-space: nowrap;">
                        <span>🐝</span>
                        <span>${hive.count} rodín</span>
                    </div>
                `,
                iconSize: [102, 28],
                iconAnchor: [51, 14]
            });

            const marker = L.marker([hive.lat, hive.lng], { icon: hiveIcon });
            marker.bindPopup(`
                <div class="p-2.5 space-y-1.5 min-w-[235px]">
                    <div class="flex items-center justify-between border-b border-stone-200 pb-1">
                        <span class="bg-amber-100 text-amber-900 border border-amber-300 font-mono text-[10px] px-2.5 py-0.5 rounded-full font-bold">${hive.cevz || 'CEVZ-SR'}</span>
                        <span class="text-xs font-extrabold text-amber-700">🐝 ${hive.count} rodín</span>
                    </div>
                    <div class="font-extrabold text-xs text-slate-900 pt-0.5">${hive.name}</div>
                    <div class="text-[11px] text-slate-700">Kontakt: <span class="text-emerald-700 font-semibold">${hive.email || 'neuvedený'}</span></div>
                    <div class="text-[10px] text-sky-700 font-mono font-bold">S-JTSK: Y ${jtsk.y} m, X ${jtsk.x} m</div>
                    <div class="text-[10px] text-slate-500 font-mono">WGS84: ${hive.lat.toFixed(5)}°, ${hive.lng.toFixed(5)}°</div>
                </div>
            `);

            this.hivesLayer.addLayer(marker);

            if (state.isHiveRadiiVisible) {
                const radiusCircle = L.circle([hive.lat, hive.lng], {
                    radius: 3000,
                    color: '#d97706',
                    weight: 2,
                    dashArray: '6, 6',
                    fillColor: '#f59e0b',
                    fillOpacity: 0.12,
                    interactive: false
                });
                this.hiveRadiiLayer.addLayer(radiusCircle);
            }
        });
    }

    renderCompanyMarker(lat, lng, name, ico, address) {
        this.companyLayer.clearLayers();
        this.renderLpisParcels(ico);

        const state = store.getState();
        const ownedParcels = state.lpisParcels.filter(p => p.ownerIco === ico);
        const totalHa = ownedParcels.reduce((sum, p) => sum + p.areaHa, 0).toFixed(2);
        const jtsk = AgroApiService.wgs84ToSJTSK(lat, lng);
        const safeName = name.replace(/'/g, "\\'");

        const customIcon = L.divIcon({
            className: 'custom-div-marker',
            html: `
                <div style="background: linear-gradient(135deg, #059669 0%, #0d9488 100%); color: white; padding: 6px 14px; border-radius: 9999px; font-weight: 800; font-size: 11px; box-shadow: 0 8px 20px rgba(0,0,0,0.45); display: inline-flex; align-items: center; gap: 6px; border: 2px solid #ffffff; white-space: nowrap;">
                    <span>🚜</span>
                    <span>${name}</span>
                </div>
            `,
            iconSize: [190, 34],
            iconAnchor: [95, 17]
        });

        const marker = L.marker([lat, lng], { icon: customIcon });
        marker.bindPopup(`
            <div class="p-2.5 space-y-2 min-w-[255px]">
                <div class="flex items-center justify-between border-b border-stone-200 pb-1">
                    <span class="bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-[10px] px-2.5 py-0.5 rounded-full">Záznam subjektu</span>
                    <span class="font-mono text-xs text-slate-700 font-bold">IČO: ${ico}</span>
                </div>
                <div class="font-extrabold text-sm text-slate-900">🏢 ${name}</div>
                <div class="text-xs text-slate-700">📍 Sídlo: ${address}</div>
                <div class="text-[10px] font-mono text-sky-700 font-bold">S-JTSK: Y ${jtsk.y} m, X ${jtsk.x} m</div>
                <div class="text-[11px] text-slate-600">Pozemky uložené v aplikácii: <b class="text-emerald-700">${ownedParcels.length} (${totalHa} ha)</b></div>
                <button onclick="window.runSprayCheckOnCoords(${lat}, ${lng}, '${safeName}')" class="w-full mt-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] py-2 px-2 rounded-xl transition">
                    ⚠️ Overiť 3 km ochranné pásmo včiel
                </button>
            </div>
        `);

        this.companyLayer.addLayer(marker);
        this.map.flyTo([lat, lng], 13, { duration: 1.2 });
        marker.openPopup();

        this.updateSidebarAnalysisPanel(
            'Subjekt overený',
            'bg-emerald-100 text-emerald-900 border border-emerald-300',
            `
                <div class="font-extrabold text-slate-900 text-sm">🏢 ${name}</div>
                <div class="text-xs text-slate-700">IČO: <span class="font-mono text-emerald-700 font-bold">${ico}</span></div>
                <div class="text-xs text-slate-600">Sídlo: ${address}</div>
                <div class="text-[10px] font-mono text-sky-700 font-bold">S-JTSK: Y ${jtsk.y} m, X ${jtsk.x} m</div>
                <div class="text-xs text-slate-700 pt-1">Pozemky uložené v aplikácii: <b class="text-emerald-700">${ownedParcels.length} (${totalHa} ha)</b></div>
                <button onclick="window.runSprayCheckOnCoords(${lat}, ${lng}, '${safeName}')" class="w-full mt-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] py-2 px-3 rounded-xl transition">
                    ⚠️ Spustiť kontrolu postreku v okolí farmy
                </button>
            `
        );
    }

    async identifyPointOnMap(lat, lng) {
        const jtsk = AgroApiService.wgs84ToSJTSK(lat, lng);
        const dmsLat = AgroApiService.formatDMS(lat, true);
        const dmsLng = AgroApiService.formatDMS(lng, false);

        const hives = store.getState().hives || [];
        let nearestHive = null;
        let minDist = Infinity;
        for (const h of hives) {
            const d = AgroApiService.calculateDistanceMeters(lat, lng, h.lat, h.lng);
            if (d < minDist) {
                minDist = d;
                nearestHive = h;
            }
        }

        const nearestText = nearestHive
            ? `${nearestHive.name} (${(minDist / 1000).toFixed(2)} km)`
            : 'Žiadne v okolí';

        this.updateSidebarAnalysisPanel(
            'Geodetický bod',
            'bg-sky-100 text-sky-900 border border-sky-300',
            `<div class="text-xs text-sky-700 font-bold animate-pulse">Načítavam výškopis Bpv a katastrálne údaje...</div>`
        );

        const geoInfo = await this.apiService.inspectGeodeticPoint(lat, lng);

        const html = `
            <div class="p-2.5 space-y-1.5 min-w-[260px]">
                <div class="flex items-center justify-between border-b border-stone-200 pb-1">
                    <span class="bg-sky-100 text-sky-900 border border-sky-300 font-bold text-[10px] px-2.5 py-0.5 rounded-full uppercase">ℹ️ Identifikácia bodu ZBGIS</span>
                    <span class="font-mono text-[10px] text-amber-700 font-extrabold">${geoInfo.elevation}</span>
                </div>
                <div class="text-xs font-extrabold text-slate-900">${geoInfo.locality}</div>
                <div class="text-[11px] text-slate-600">${geoInfo.municipality}</div>
                <div class="bg-stone-100 p-2 rounded-xl border border-stone-200 font-mono text-[10px] space-y-1">
                    <div class="text-sky-800"><b>S-JTSK [5514]:</b> Y ${jtsk.y} m, X ${jtsk.x} m</div>
                    <div class="text-emerald-800"><b>ETRS89 DMS:</b> ${dmsLat}, ${dmsLng}</div>
                    <div class="text-slate-600"><b>WGS84 DEC:</b> ${lat.toFixed(6)}°, ${lng.toFixed(6)}°</div>
                </div>
                <div class="text-[11px] text-slate-700">Najbližšie včelstvo: <b class="text-amber-700">${nearestText}</b></div>
                <button onclick="window.runSprayCheckOnCoords(${lat}, ${lng}, '${geoInfo.locality.replace(/'/g, "\\'")}')" class="w-full mt-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] py-2 px-2 rounded-xl transition">
                    ⚠️ Overiť 3 km pásmo v tomto bode
                </button>
            </div>
        `;

        L.popup().setLatLng([lat, lng]).setContent(html).openOn(this.map);

        this.updateSidebarAnalysisPanel(
            'Inšpektor S-JTSK',
            'bg-sky-100 text-sky-900 border border-sky-300',
            `
                <div class="font-extrabold text-slate-900 text-xs">${geoInfo.locality} (${geoInfo.municipality})</div>
                <div class="text-[11px] text-amber-700 font-mono font-bold">Výška: ${geoInfo.elevation}</div>
                <div class="text-[10px] font-mono text-sky-800 font-bold">S-JTSK: Y ${jtsk.y} m, X ${jtsk.x} m</div>
                <div class="text-[10px] font-mono text-emerald-800">ETRS89: ${dmsLat}, ${dmsLng}</div>
                <div class="text-[11px] text-slate-700 pt-1">Najbližší CEVZ: <b>${nearestText}</b></div>
            `
        );

        store.setState({ interactionMode: 'NONE' });
    }

    async checkSprayCollision(lat, lng, parcelContext = null) {
        this.sprayLayer.clearLayers();
        const jtsk = AgroApiService.wgs84ToSJTSK(lat, lng);

        const sprayCenterMarker = L.circleMarker([lat, lng], {
            radius: 9,
            color: '#ffffff',
            fillColor: '#e11d48',
            fillOpacity: 1,
            weight: 2.5
        });

        const sprayBufferCircle = L.circle([lat, lng], {
            radius: 3000,
            color: '#e11d48',
            weight: 2.5,
            dashArray: '8, 6',
            fillColor: '#f43f5e',
            fillOpacity: 0.16
        });

        this.sprayLayer.addLayer(sprayBufferCircle);
        this.sprayLayer.addLayer(sprayCenterMarker);

        const collisions = await OfflineSyncService.executeSpatialCollisionCheck(
            this.supabase,
            this.isCloudConfigured,
            lat,
            lng,
            3000
        );

        const collidedIds = new Set(collisions.map(c => c.hive_id));
        this.renderAllHives(collidedIds);

        const contextLabel = parcelContext
            ? (typeof parcelContext === 'string' ? parcelContext : parcelContext.id)
            : `S-JTSK [Y ${jtsk.y}, X ${jtsk.x}]`;

        store.setState({
            lastCollisionReport: {
                timestamp: new Date().toLocaleString('sk-SK'),
                lat,
                lng,
                jtsk,
                contextLabel,
                collisions
            }
        });

        if (collisions.length > 0) {
            let totalEndangeredColonies = 0;

            collisions.forEach(hive => {
                totalEndangeredColonies += Number(hive.hive_count) || 0;
                if (hive.lat && hive.lng) {
                    const line = L.polyline([[lat, lng], [hive.lat, hive.lng]], {
                        color: '#e11d48',
                        weight: 2.5,
                        dashArray: '5, 6'
                    });
                    const distKm = (hive.distance_meters / 1000).toFixed(2);
                    line.bindTooltip(`⚡ ${distKm} km (${hive.hive_name})`, { permanent: false });
                    this.sprayLayer.addLayer(line);
                }
            });

            const listHtml = collisions.map((c, idx) => {
                const km = (c.distance_meters / 1000).toFixed(2);
                return `<div class="flex justify-between items-center border-b border-stone-200 py-1 text-[11px]">
                    <span class="truncate pr-2 text-slate-800">${idx + 1}. <b>${c.hive_name}</b> (${c.hive_count} rod.)</span>
                    <span class="font-mono font-bold text-rose-700 shrink-0">${km} km</span>
                </div>`;
            }).join('');

            sprayCenterMarker.bindPopup(`
                <div class="p-2.5 space-y-2 min-w-[270px]">
                    <div class="flex items-center justify-between">
                        <span class="bg-rose-100 text-rose-900 border border-rose-300 font-bold text-[10px] px-2.5 py-0.5 rounded-full uppercase">⚠️ Kolízia postreku!</span>
                        <span class="text-xs font-extrabold text-rose-700">Pásmo 3 000 m</span>
                    </div>
                    <div class="text-xs font-extrabold text-slate-900">${contextLabel}</div>
                    <div class="text-[11px] text-slate-700">Zasiahnutých stanovíšť: <b class="text-rose-700">${collisions.length}</b> (spolu <b>${totalEndangeredColonies} rodín</b>)</div>
                    <div class="max-h-28 overflow-y-auto bg-stone-50 p-1.5 rounded-xl border border-stone-200">
                        ${listHtml}
                    </div>
                    <div class="grid grid-cols-2 gap-1.5 pt-1">
                        <button onclick="window.triggerSprayAlertEmails(${lat}, ${lng}, ${collisions.length}, ${totalEndangeredColonies})" class="bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] py-2 px-2 rounded-xl shadow-sm transition">
                            📧 Notifikovať (${collisions.length})
                        </button>
                        <button onclick="window.printInspectionReport()" class="bg-stone-100 hover:bg-stone-200 text-slate-800 font-bold text-[11px] py-2 px-2 rounded-xl border border-stone-300 transition">
                            🖨️ Protokol PDF
                        </button>
                    </div>
                </div>
            `).openPopup();

            this.updateSidebarAnalysisPanel(
                `Kolízia: ${collisions.length} CEVZ`,
                'bg-rose-100 text-rose-900 border border-rose-300',
                `
                    <div class="text-rose-700 font-extrabold text-xs">⚠️ Kolízia v 3 km ochrannom pásme!</div>
                    <div class="text-[10px] font-mono text-sky-800 font-bold">${contextLabel}</div>
                    <div class="text-[11px] text-slate-700">Ohrozených spolu: <b>${totalEndangeredColonies} včelích rodín</b></div>
                    <div class="space-y-1 pt-1">${listHtml}</div>
                    <div class="grid grid-cols-2 gap-1.5 pt-2">
                        <button onclick="window.triggerSprayAlertEmails(${lat}, ${lng}, ${collisions.length}, ${totalEndangeredColonies})" class="bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] py-2 px-2 rounded-xl shadow-sm transition">
                            📧 Odoslať výstrahy
                        </button>
                        <button onclick="window.printInspectionReport()" class="bg-stone-100 hover:bg-stone-200 text-slate-800 font-bold text-[11px] py-2 px-2 rounded-xl border border-stone-300 transition">
                            🖨️ Tlač protokolu
                        </button>
                    </div>
                `
            );

            showNotificationToast(`⚠️ VÝSTRAHA: V 3 km okruhu sa nachádza ${collisions.length} stanovíšť (${totalEndangeredColonies} rodín)!`, 'danger');
        } else {
            sprayCenterMarker.bindPopup(`
                <div class="p-2.5 space-y-1.5 min-w-[235px]">
                    <span class="bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-[10px] px-2.5 py-0.5 rounded-full uppercase">✅ Bezpečná zóna</span>
                    <h4 class="font-extrabold text-xs text-slate-900 pt-1">Žiadne včelstvá v okruhu 3 km</h4>
                    <div class="text-[10px] font-mono text-sky-700 font-bold">${contextLabel}</div>
                    <p class="text-[11px] text-slate-600">V ochrannom pásme 3 000 m sa nenachádzajú žiadne evidované stanovištia CEVZ.</p>
                </div>
            `).openPopup();

            this.updateSidebarAnalysisPanel(
                'Bezpečná zóna',
                'bg-emerald-100 text-emerald-900 border border-emerald-300',
                `
                    <div class="text-emerald-700 font-extrabold text-xs">✅ V okruhu 3 km nie sú žiadne včelstvá.</div>
                    <div class="text-[10px] font-mono text-sky-700 font-bold">${contextLabel}</div>
                    <button onclick="window.printInspectionReport()" class="w-full mt-2 bg-stone-100 hover:bg-stone-200 text-slate-800 font-bold text-[11px] py-2 px-2 rounded-xl border border-stone-300 transition">
                        🖨️ Vytlačiť potvrdenie o kontrole
                    </button>
                `
            );

            showNotificationToast('✅ Bezpečná zóna: V okruhu 3 km sa nenachádzajú žiadne včelstvá.', 'success');
        }

        this.map.fitBounds(sprayBufferCircle.getBounds(), { padding: [30, 30], maxZoom: 13 });
        store.setState({ interactionMode: 'NONE' });
    }

    _handleDrawParcelClick(latlng) {
        this.drawPolygonPoints.push(latlng);
        this.drawLayer.clearLayers();

        this.drawPolygonPoints.forEach(pt => {
            L.circleMarker(pt, {
                radius: 5,
                color: '#059669',
                fillColor: '#ffffff',
                fillOpacity: 1
            }).addTo(this.drawLayer);
        });

        if (this.drawPolygonPoints.length >= 2) {
            const poly = L.polygon(this.drawPolygonPoints, {
                color: '#059669',
                weight: 2.5,
                dashArray: '6, 4',
                fillColor: '#10b981',
                fillOpacity: 0.35
            }).addTo(this.drawLayer);

            if (this.drawPolygonPoints.length >= 3) {
                const geom = AgroApiService.calculatePolygonGeometry(this.drawPolygonPoints);
                poly.bindTooltip(`📐 Výmera: <b>${geom.areaHa} ha</b> (${geom.areaSqM.toLocaleString('sk-SK')} m²)<br>Obvod: ${geom.perimeterM} m`, {
                    permanent: true,
                    direction: 'center'
                }).openTooltip();

                this.updateSidebarAnalysisPanel(
                    'Meranie plochy',
                    'bg-emerald-100 text-emerald-900 border border-emerald-300',
                    `
                        <div class="font-extrabold text-slate-900 text-xs">📐 Váš zákres (${this.drawPolygonPoints.length} lomových bodov)</div>
                        <div class="text-xs text-emerald-700 font-bold">Výmera: ${geom.areaHa} ha (${geom.areaSqM.toLocaleString('sk-SK')} m²)</div>
                        <div class="text-[11px] text-slate-600">Obvod parcely: <b>${geom.perimeterM} m</b></div>
                        <button onclick="window.finishPolygonDrawing()" class="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2 px-3 rounded-xl shadow-sm transition">
                            💾 Uložiť zákres v aplikácii
                        </button>
                    `
                );
            }
        }
    }

    finishDrawingParcel() {
        if (this.drawPolygonPoints.length < 3) {
            showNotificationToast('⚠️ Pre vytvorenie parcely zadajte aspoň 3 lomové body v mape.', 'warning');
            return null;
        }

        const geom = AgroApiService.calculatePolygonGeometry(this.drawPolygonPoints);
        const latSum = this.drawPolygonPoints.reduce((s, p) => s + p.lat, 0);
        const lngSum = this.drawPolygonPoints.reduce((s, p) => s + p.lng, 0);
        const center = [latSum / this.drawPolygonPoints.length, lngSum / this.drawPolygonPoints.length];
        const coords = this.drawPolygonPoints.map(p => [p.lat, p.lng]);

        const state = store.getState();
        const user = state.currentUser;
        const activeEntity = state.activeEntity;

        const newParcel = {
            id: `MAP-${Date.now()}`,
            ownerIco: user?.ico || activeEntity?.ico || 'VLASTNÁ',
            ownerName: user?.name || activeEntity?.name || 'Zameraná parcela / Sad',
            ownerEmail: user?.email || '',
            kUzemie: 'Zamerané v S-JTSK',
            crop: 'Novozameraná kultúra',
            areaHa: geom.areaHa,
            kultura: 'Orná pôda / Sad',
            center,
            coords
        };

        store.addLpisParcel(newParcel);
        this.drawPolygonPoints = [];
        this.drawLayer.clearLayers();
        this.renderLpisParcels(user?.ico || activeEntity?.ico || null);
        store.setState({ interactionMode: 'NONE' });

        showNotificationToast(`✅ Zákres ${newParcel.id} (${newParcel.areaHa} ha) bol uložený v aplikácii.`, 'success');
        return newParcel;
    }

    _handleMeasureClick(latlng) {
        this.measurePoints.push(latlng);

        const dot = L.circleMarker(latlng, {
            radius: 5,
            color: '#0284c7',
            fillColor: '#38bdf8',
            fillOpacity: 1
        });
        this.measureLayer.addLayer(dot);

        if (this.measurePoints.length > 1) {
            let totalMeters = 0;
            for (let i = 1; i < this.measurePoints.length; i++) {
                totalMeters += AgroApiService.calculateDistanceMeters(
                    this.measurePoints[i - 1].lat,
                    this.measurePoints[i - 1].lng,
                    this.measurePoints[i].lat,
                    this.measurePoints[i].lng
                );
            }

            const prev = this.measurePoints[this.measurePoints.length - 2];
            const segMeters = AgroApiService.calculateDistanceMeters(prev.lat, prev.lng, latlng.lat, latlng.lng);
            const segLabel = segMeters >= 1000 ? `${(segMeters / 1000).toFixed(2)} km` : `${Math.round(segMeters)} m`;
            const totalLabel = totalMeters >= 1000 ? `${(totalMeters / 1000).toFixed(3)} km` : `${Math.round(totalMeters)} m`;

            const line = L.polyline([prev, latlng], { color: '#0284c7', weight: 3, dashArray: '6, 4' });
            line.bindTooltip(`📏 ${segLabel}`, { permanent: true, direction: 'center', className: 'font-mono text-xs' });
            this.measureLayer.addLayer(line);

            this.updateSidebarAnalysisPanel(
                'Meranie dĺžky',
                'bg-sky-100 text-sky-900 border border-sky-300',
                `<div class="text-xs text-slate-900 font-extrabold">📏 Celková dĺžka: <span class="text-sky-700 font-mono">${totalLabel}</span></div>
                 <div class="text-[11px] text-slate-600">Posledný úsek: ${segLabel} (${this.measurePoints.length} bodov)</div>`
            );
        } else {
            showNotificationToast('📏 Prvý bod zaznamenaný. Kliknite na ďalší bod na mape.', 'info');
        }
    }

    clearAnalyses() {
        this.sprayLayer.clearLayers();
        this.measureLayer.clearLayers();
        this.drawLayer.clearLayers();
        this.cadastreParcelLayer.clearLayers();
        this.measurePoints = [];
        this.drawPolygonPoints = [];
        this.renderAllHives(new Set());
        this.renderLpisParcels(null);
        store.setState({ interactionMode: 'NONE', activeCadastreParcel: null });
        showNotificationToast('🧹 Mapa bola vyčistená od simulácií a meraní.', 'info');
    }

    updateSidebarAnalysisPanel(badgeText, badgeClasses, htmlContent) {
        const badgeEl = document.getElementById('analysis-badge');
        const contentEl = document.getElementById('analysis-content');
        if (badgeEl) {
            badgeEl.className = `text-[10px] font-bold px-2.5 py-0.5 rounded-full font-mono ${badgeClasses}`;
            badgeEl.innerText = badgeText;
        }
        if (contentEl) {
            contentEl.innerHTML = htmlContent;
        }
    }

    _updateCartographicScale() {
        if (!this.map) return;
        const center = this.map.getCenter();
        const zoom = this.map.getZoom();
        const metersPerPixel = (156543.03392 * Math.cos((center.lat * Math.PI) / 180)) / Math.pow(2, zoom);
        const scaleDenominator = Math.round((metersPerPixel * 96) / 0.0254);
        const formattedScale = scaleDenominator.toLocaleString('sk-SK');

        const scaleEl = document.getElementById('footer-scale');
        if (scaleEl) scaleEl.innerText = `Mierka 1 : ${formattedScale}`;

        const zoomEl = document.getElementById('footer-zoom');
        if (zoomEl) zoomEl.innerText = `Zoom: ${zoom}`;
    }

    _initMapEvents() {
        this.map.on('mousemove', (e) => {
            const lat = e.latlng.lat;
            const lng = e.latlng.lng;

            const jtsk = AgroApiService.wgs84ToSJTSK(lat, lng);
            const jtskEl = document.getElementById('footer-jtsk');
            if (jtskEl) {
                jtskEl.innerText = `S-JTSK [EPSG:5514]: Y ${jtsk.y} m, X ${jtsk.x} m`;
            }

            const wgsEl = document.getElementById('footer-latlng');
            if (wgsEl) {
                const dmsLat = AgroApiService.formatDMS(lat, true);
                const dmsLng = AgroApiService.formatDMS(lng, false);
                wgsEl.innerText = `ETRS89: ${dmsLat}, ${dmsLng}`;
            }
        });

        this.map.on('zoomend moveend', () => {
            this._updateCartographicScale();
            this.updateLiveWeatherAtCenter();
        });

        this.map.on('click', (e) => {
            const mode = store.getState().interactionMode;
            if (mode === 'SPRAY') {
                this.checkSprayCollision(e.latlng.lat, e.latlng.lng);
            } else if (mode === 'IDENTIFY') {
                this.identifyPointOnMap(e.latlng.lat, e.latlng.lng);
            } else if (mode === 'ADD_HIVE') {
                this.pendingHiveLatLng = e.latlng;
                window.openHiveModal(e.latlng.lat, e.latlng.lng);
            } else if (mode === 'MEASURE') {
                this._handleMeasureClick(e.latlng);
            } else if (mode === 'DRAW_PARCEL') {
                this._handleDrawParcelClick(e.latlng);
            }
        });
    }

    _initStoreSubscription() {
        store.subscribe((state) => {
            const container = this.map.getContainer();
            container.style.cursor = state.interactionMode !== 'NONE' ? 'crosshair' : '';

            const modeBadge = document.getElementById('active-mode-badge');
            const modeText = document.getElementById('active-mode-text');
            const finishPolyBtn = document.getElementById('btn-finish-poly');

            if (modeBadge && modeText) {
                if (finishPolyBtn) finishPolyBtn.classList.add('hidden');

                if (state.interactionMode === 'SPRAY') {
                    modeBadge.classList.remove('hidden');
                    modeBadge.classList.add('flex');
                    modeText.innerText = '⚠️ Kliknite do mapy pre test postreku (3 km)';
                } else if (state.interactionMode === 'IDENTIFY') {
                    modeBadge.classList.remove('hidden');
                    modeBadge.classList.add('flex');
                    modeText.innerText = 'ℹ️ Kliknite na bod pre S-JTSK a výšku Bpv';
                } else if (state.interactionMode === 'ADD_HIVE') {
                    modeBadge.classList.remove('hidden');
                    modeBadge.classList.add('flex');
                    modeText.innerText = '🐝 Kliknite do mapy pre umiestnenie včelstva';
                } else if (state.interactionMode === 'MEASURE') {
                    modeBadge.classList.remove('hidden');
                    modeBadge.classList.add('flex');
                    modeText.innerText = '📏 Klikajte do mapy pre meranie dĺžky';
                } else if (state.interactionMode === 'DRAW_PARCEL') {
                    modeBadge.classList.remove('hidden');
                    modeBadge.classList.add('flex');
                    modeText.innerText = '📐 Kreslenie poľa: Klikajte lomové body';
                    if (finishPolyBtn) finishPolyBtn.classList.remove('hidden');
                } else {
                    modeBadge.classList.add('hidden');
                    modeBadge.classList.remove('flex');
                }
            }

            const floatKatBtn = document.getElementById('float-kataster-btn');
            const chkKat = document.getElementById('layer-kataster');

            if (state.isKatasterVisible) {
                if (chkKat) chkKat.checked = true;
                if (floatKatBtn) floatKatBtn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold bg-sky-600 text-white border border-sky-700 shadow-md transition flex items-center gap-1.5';
                if (!this.map.hasLayer(this.katasterWmsLayer)) {
                    this.katasterWmsLayer.addTo(this.map);
                    if (this.map.getZoom() < 15) {
                        this.map.setZoom(15);
                        showNotificationToast('🔍 Priblížené na mierku katastra (Zoom 15) pre zobrazenie parciel C-KN a E-KN.', 'info');
                    }
                }
            } else {
                if (chkKat) chkKat.checked = false;
                if (floatKatBtn) floatKatBtn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 transition flex items-center gap-1.5';
                if (this.map.hasLayer(this.katasterWmsLayer)) {
                    this.map.removeLayer(this.katasterWmsLayer);
                }
            }

            if (state.isDmrVisible) {
                if (!this.map.hasLayer(this.dmrWmsLayer)) {
                    this.dmrWmsLayer.addTo(this.map);
                }
            } else {
                if (this.map.hasLayer(this.dmrWmsLayer)) {
                    this.map.removeLayer(this.dmrWmsLayer);
                }
            }
        });
    }
}