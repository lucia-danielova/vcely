/**
 * @file map-layers.js
 * @description Map Layer Controller s checkboxami, opacity slider, export funkcionalitou a layer merge support.
 */

import { store } from '../core/state-store.js';
import { globalBus, showNotificationToast } from './event-bus.js';

export class MapLayerController {
    constructor(mapEngineInstance, containerId = 'map-layers-container') {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.mapEngine = mapEngineInstance;

        this.layers = [
            {
                id: 'cadastre-parcels',
                name: 'Katastrálne parcely',
                icon: '🏠',
                description: 'Hranice parciel z katastra nehnuteľností',
                visible: true,
                opacity: 0.7,
                type: 'vector'
            },
            {
                id: 'lpis',
                name: 'LPIS',
                icon: '🌾',
                description: 'Land Parcel Identification System - poľnohospodárske parcely',
                visible: true,
                opacity: 0.5,
                type: 'vector'
            },
            {
                id: 'hydrometeo',
                name: 'Hydrometeorológia',
                icon: '💧',
                description: 'Vodné toky, pôdne typy a meteorologické údaje',
                visible: false,
                opacity: 0.4,
                type: 'raster'
            },
            {
                id: 'weather',
                name: 'Počasie',
                icon: '⛅',
                description: 'Aktuálne predpovede počasia a klimatické údaje',
                visible: false,
                opacity: 0.6,
                type: 'raster'
            },
            {
                id: 'hives',
                name: 'Včelstvá',
                icon: '🐝',
                description: 'Poloha registrovaných včelníc a úľov',
                visible: true,
                opacity: 1.0,
                type: 'vector'
            },
            {
                id: 'spray-zones',
                name: 'Hlásenia sprejov',
                icon: '🚜',
                description: 'Zóny plánovaných či vykonaných aplikácií prípravkov',
                visible: false,
                opacity: 0.3,
                type: 'vector'
            }
        ];

        this.activeLayerForOpacity = null;
        this.init();
    }

    init() {
        if (!this.container) {
            console.error(`Container #${this.containerId} not found`);
            return;
        }

        this.render();
        this.attachEventListeners();
        this.subscribeToStore();
    }

    render() {
        this.container.innerHTML = `
            <div class="map-layers-panel bg-white rounded-lg border border-slate-200 shadow-sm max-w-sm">
                <!-- Header -->
                <div class="layers-header px-4 py-3 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white rounded-t-lg">
                    <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/>
                        </svg>
                        Vrstvy Mapy
                    </h3>
                    <div class="flex items-center gap-1">
                        <button class="layers-collapse p-1.5 rounded-md hover:bg-slate-100 transition" title="Zbaliť panel">
                            <svg class="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Layers List -->
                <div class="layers-list space-y-2 px-3 py-3 max-h-96 overflow-y-auto">
                    ${this.layers.map((layer, idx) => this.renderLayerItem(layer, idx)).join('')}
                </div>

                <!-- Opacity Slider (shown when layer selected) -->
                <div class="opacity-control hidden px-4 py-3 border-t border-slate-200 bg-slate-50">
                    <div class="text-xs font-semibold text-slate-700 mb-2">
                        Priehľadnosť: <span class="opacity-value font-mono text-emerald-600">100%</span>
                    </div>
                    <input type="range" class="opacity-slider w-full h-2 bg-slate-300 rounded-lg appearance-none cursor-pointer" 
                           min="0" max="100" value="100">
                    <div class="text-xs text-slate-500 mt-2">Posúňte pre úpravu priehľadnosti vrstvy</div>
                </div>

                <!-- Tools Section -->
                <div class="tools-section border-t border-slate-200 px-4 py-3 space-y-2">
                    <button class="export-map w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-50 
                                   hover:bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                        </svg>
                        Export Mapy
                    </button>

                    <div class="export-options hidden grid grid-cols-2 gap-2">
                        <button class="export-png px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition-colors">
                            📷 Exportovať PNG
                        </button>
                        <button class="export-geojson px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition-colors">
                            📄 Exportovať GeoJSON
                        </button>
                    </div>

                    <button class="merge-layers w-full flex items-center justify-center gap-2 px-3 py-2 bg-sky-50 
                                   hover:bg-sky-100 text-sky-700 rounded-lg text-sm font-medium transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                        </svg>
                        Zlúčiť Vrstvy
                    </button>

                    <button class="reset-layers w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 
                                   hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-medium transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                        </svg>
                        Obnoviť Vrstvami
                    </button>
                </div>

                <!-- Legend -->
                <div class="legend-section border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
                    <div class="font-semibold text-slate-700 mb-2">Legenda:</div>
                    <div class="space-y-1 text-xs">
                        <div class="flex items-center gap-2">
                            <div class="w-3 h-3 rounded-full bg-emerald-500"></div>
                            <span>Aktívna vrstva</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <div class="w-3 h-3 rounded border border-slate-300 bg-white"></div>
                            <span>Neviditeľná vrstva</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderLayerItem(layer, idx) {
        return `
            <div class="layer-item p-3 rounded-lg border transition-all cursor-pointer
                        ${layer.visible ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'}"
                 data-layer-id="${layer.id}">
                <div class="flex items-start gap-3">
                    <!-- Visibility Checkbox -->
                    <div class="flex-shrink-0 pt-0.5">
                        <input type="checkbox" class="layer-checkbox w-4 h-4 rounded border-slate-300 text-emerald-600 
                                                     focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                               ${layer.visible ? 'checked' : ''} data-layer-id="${layer.id}">
                    </div>

                    <!-- Layer Info -->
                    <div class="flex-1 min-w-0">
                        <label class="flex items-center gap-2 cursor-pointer mb-1">
                            <span class="text-lg">${layer.icon}</span>
                            <span class="font-semibold text-slate-900 text-sm">${layer.name}</span>
                            ${layer.visible ? '<span class="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-800">Viditeľná</span>' : ''}
                        </label>
                        <p class="text-xs text-slate-600 leading-relaxed">${layer.description}</p>
                    </div>

                    <!-- More Options -->
                    <button class="layer-options flex-shrink-0 p-1.5 rounded hover:bg-slate-200 transition opacity-0 group-hover:opacity-100"
                            data-layer-id="${layer.id}" title="Možnosti vrstvy">
                        <svg class="w-4 h-4 text-slate-500" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                        </svg>
                    </button>
                </div>

                <!-- Opacity Info (when layer selected) -->
                <div class="layer-opacity-info text-xs text-slate-600 mt-2 flex items-center justify-between pl-7">
                    <span>Priehľadnosť: ${Math.round(layer.opacity * 100)}%</span>
                    <button class="adjust-opacity px-2 py-1 bg-slate-200 hover:bg-slate-300 rounded text-xs transition">
                        Upraviť
                    </button>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        // Layer visibility toggle
        this.container.querySelectorAll('.layer-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const layerId = e.target.getAttribute('data-layer-id');
                this.toggleLayerVisibility(layerId, e.target.checked);
            });
        });

        // Layer selection for opacity adjustment
        this.container.querySelectorAll('.layer-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.layer-options') && !e.target.closest('.layer-checkbox')) {
                    const layerId = item.getAttribute('data-layer-id');
                    this.selectLayerForOpacity(layerId);
                }
            });
        });

        // Opacity slider
        const opacitySlider = this.container.querySelector('.opacity-slider');
        if (opacitySlider) {
            opacitySlider.addEventListener('input', (e) => {
                const opacity = e.target.value / 100;
                this.updateLayerOpacity(this.activeLayerForOpacity, opacity);
                this.container.querySelector('.opacity-value').textContent = e.target.value + '%';
            });
        }

        // Export buttons
        this.container.querySelector('.export-map')?.addEventListener('click', () => {
            this.toggleExportOptions();
        });

        this.container.querySelector('.export-png')?.addEventListener('click', () => {
            this.exportMapAsPNG();
        });

        this.container.querySelector('.export-geojson')?.addEventListener('click', () => {
            this.exportMapAsGeoJSON();
        });

        // Merge layers
        this.container.querySelector('.merge-layers')?.addEventListener('click', () => {
            this.mergeLayers();
        });

        // Reset layers
        this.container.querySelector('.reset-layers')?.addEventListener('click', () => {
            this.resetLayers();
        });

        // Collapse
        this.container.querySelector('.layers-collapse')?.addEventListener('click', () => {
            this.container.classList.toggle('collapsed');
        });
    }

    toggleLayerVisibility(layerId, visible) {
        const layer = this.layers.find(l => l.id === layerId);
        if (layer) {
            layer.visible = visible;
            this.emitLayerUpdate(layer);
            this.render();
            this.attachEventListeners();
            showNotificationToast(`${layer.name}: ${visible ? 'Zobrazená' : 'Skrytá'}`, 'success');
        }
    }

    selectLayerForOpacity(layerId) {
        this.activeLayerForOpacity = layerId;
        const layer = this.layers.find(l => l.id === layerId);
        
        if (layer) {
            const opacityControl = this.container.querySelector('.opacity-control');
            const opacitySlider = this.container.querySelector('.opacity-slider');
            const opacityValue = this.container.querySelector('.opacity-value');

            if (opacityControl && opacitySlider && opacityValue) {
                opacityControl.classList.remove('hidden');
                opacitySlider.value = Math.round(layer.opacity * 100);
                opacityValue.textContent = Math.round(layer.opacity * 100) + '%';
            }
        }
    }

    updateLayerOpacity(layerId, opacity) {
        const layer = this.layers.find(l => l.id === layerId);
        if (layer) {
            layer.opacity = Math.max(0, Math.min(1, opacity));
            this.emitLayerUpdate(layer);
        }
    }

    toggleExportOptions() {
        const options = this.container.querySelector('.export-options');
        options?.classList.toggle('hidden');
    }

    exportMapAsPNG() {
        try {
            const canvas = document.querySelector('.leaflet-container canvas');
            if (!canvas) {
                showNotificationToast('Mapu nie je možné exportovať', 'danger');
                return;
            }

            const link = document.createElement('a');
            link.href = canvas.toDataURL();
            link.download = `agrogis-mapa-${new Date().toISOString().slice(0, 10)}.png`;
            link.click();

            showNotificationToast('Mapa bola exportovaná ako PNG', 'success');
            globalBus.emit('map:exported', { format: 'png' });
        } catch (error) {
            console.error('PNG export error:', error);
            showNotificationToast('Chyba pri exporte PNG', 'danger');
        }
    }

    exportMapAsGeoJSON() {
        try {
            const visibleLayers = this.layers.filter(l => l.visible);
            const geoData = {
                type: 'FeatureCollection',
                features: [],
                metadata: {
                    exportDate: new Date().toISOString(),
                    layers: visibleLayers.map(l => l.name)
                }
            };

            const dataStr = JSON.stringify(geoData, null, 2);
            const link = document.createElement('a');
            link.href = 'data:application/geo+json;charset=utf-8,' + encodeURIComponent(dataStr);
            link.download = `agrogis-mapy-${new Date().toISOString().slice(0, 10)}.geojson`;
            link.click();

            showNotificationToast('Mapa bola exportovaná ako GeoJSON', 'success');
            globalBus.emit('map:exported', { format: 'geojson' });
        } catch (error) {
            console.error('GeoJSON export error:', error);
            showNotificationToast('Chyba pri exporte GeoJSON', 'danger');
        }
    }

    mergeLayers() {
        const visibleLayers = this.layers.filter(l => l.visible);
        if (visibleLayers.length < 2) {
            showNotificationToast('Zvoľte aspoň 2 vrstvy na zlúčenie', 'warning');
            return;
        }

        globalBus.emit('map:merge-layers', { layers: visibleLayers });
        showNotificationToast(`Zlúčovanie ${visibleLayers.length} vrstiev...`, 'success');
    }

    resetLayers() {
        if (confirm('Naozaj chcete vrátiť všetky vrstvy do pôvodného stavu?')) {
            this.layers.forEach(layer => {
                layer.visible = ['cadastre-parcels', 'lpis', 'hives'].includes(layer.id);
                layer.opacity = layer.id === 'hives' ? 1.0 : 0.5;
            });

            this.render();
            this.attachEventListeners();
            showNotificationToast('Vrstvy boli vrátené do pôvodného stavu', 'success');
            globalBus.emit('map:layers-reset');
        }
    }

    emitLayerUpdate(layer) {
        globalBus.emit('map:layer-changed', {
            layerId: layer.id,
            visible: layer.visible,
            opacity: layer.opacity
        });
    }

    subscribeToStore() {
        store.subscribe((state) => {
            // React to store changes if needed
        });
    }

    destroy() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}

export default MapLayerController;
