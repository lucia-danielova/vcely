/**
 * @file dashboard.js
 * @description Dashboard Component s profilom, štatistikami, aktivitami, quick actions a weather widget.
 */

import { store } from '../core/state-store.js';
import { globalBus, showNotificationToast } from './event-bus.js';

export class Dashboard {
    constructor(containerId = 'dashboard-container') {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);

        this.mockWeather = {
            temp: 12,
            condition: 'Oblačno',
            humidity: 65,
            windSpeed: 15,
            icon: '⛅'
        };

        this.mockActivities = [
            {
                id: 1,
                type: 'parcel-added',
                title: 'Pridaná nová parcela',
                description: 'LPIS-NR-4401/A',
                timestamp: '2 dni',
                icon: '📍'
            },
            {
                id: 2,
                type: 'search-performed',
                title: 'Vyhľadávanie subjektu',
                description: 'PD Devio Nové Sady (00190225)',
                timestamp: '5 dní',
                icon: '🔍'
            },
            {
                id: 3,
                type: 'collision-detected',
                title: 'Detektovaná kolízia',
                description: '3 km zóna okolo včelnice',
                timestamp: '1 týždeň',
                icon: '⚠️'
            },
            {
                id: 4,
                type: 'export-completed',
                title: 'Mapa exportovaná',
                description: 'GeoJSON format',
                timestamp: '2 týždne',
                icon: '📤'
            }
        ];

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
        this.loadDashboardData();
    }

    render() {
        this.container.innerHTML = `
            <div class="dashboard grid grid-cols-1 lg:grid-cols-3 gap-4 auto-rows-max">
                <!-- LEFT COLUMN: Profile & Stats -->
                <div class="dashboard-left lg:col-span-1 space-y-4">
                    <!-- User Profile Card -->
                    <div class="profile-card bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                        <!-- Header with background -->
                        <div class="h-16 bg-gradient-to-r from-emerald-500 to-emerald-600"></div>

                        <!-- Profile Content -->
                        <div class="relative px-4 pb-4">
                            <!-- Avatar -->
                            <div class="flex items-end justify-between -mt-8 mb-3">
                                <div class="w-16 h-16 rounded-full border-4 border-white bg-emerald-100 flex items-center justify-center text-2xl font-bold text-emerald-700 shadow-sm">
                                    U
                                </div>
                                <button class="edit-profile p-2 rounded-lg hover:bg-slate-100 transition" title="Upraviť profil">
                                    <svg class="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                    </svg>
                                </button>
                            </div>

                            <!-- User Info -->
                            <div class="mb-4">
                                <h2 class="text-lg font-bold text-slate-900" id="profile-name">Užívateľ AgroGIS</h2>
                                <p class="text-sm text-slate-600 mb-2" id="profile-type">Typ účtu: Farmár</p>
                                <div class="flex items-center gap-1 text-xs">
                                    <span class="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                                    <span class="text-emerald-700 font-medium">Aktívny</span>
                                </div>
                            </div>

                            <!-- Quick Stats -->
                            <div class="grid grid-cols-2 gap-2">
                                <div class="stat-badge bg-emerald-50 rounded-lg p-2">
                                    <div class="text-xs text-slate-600">Parcely</div>
                                    <div class="text-xl font-bold text-emerald-700" id="stat-parcels">0</div>
                                </div>
                                <div class="stat-badge bg-blue-50 rounded-lg p-2">
                                    <div class="text-xs text-slate-600">Plocha (ha)</div>
                                    <div class="text-xl font-bold text-blue-700" id="stat-area">0</div>
                                </div>
                            </div>

                            <!-- Divider -->
                            <hr class="my-4 border-slate-200">

                            <!-- Profile Buttons -->
                            <div class="space-y-2">
                                <button class="view-full-profile w-full px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium transition-colors">
                                    👤 Môj profil
                                </button>
                                <button class="manage-entities w-full px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors">
                                    🏢 Moje subjekty
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Statistics Card -->
                    <div class="stats-card bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                        <h3 class="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                            <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                            </svg>
                            Štatistiky
                        </h3>

                        <div class="space-y-3">
                            <div class="stat-row flex items-center justify-between p-2 bg-slate-50 rounded">
                                <span class="text-sm text-slate-600">Počet parcel:</span>
                                <span class="font-bold text-slate-900" id="stats-total-parcels">0</span>
                            </div>
                            <div class="stat-row flex items-center justify-between p-2 bg-slate-50 rounded">
                                <span class="text-sm text-slate-600">Celková plocha:</span>
                                <span class="font-bold text-slate-900"><span id="stats-total-area">0</span> ha</span>
                            </div>
                            <div class="stat-row flex items-center justify-between p-2 bg-slate-50 rounded">
                                <span class="text-sm text-slate-600">Typ subjektu:</span>
                                <span class="font-bold text-slate-900" id="stats-entity-type">-</span>
                            </div>
                            <div class="stat-row flex items-center justify-between p-2 bg-slate-50 rounded">
                                <span class="text-sm text-slate-600">Počet subjektov:</span>
                                <span class="font-bold text-slate-900" id="stats-entity-count">0</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- MIDDLE COLUMN: Activities & Weather -->
                <div class="dashboard-middle lg:col-span-1 space-y-4">
                    <!-- Recent Activities Timeline -->
                    <div class="activities-card bg-white rounded-lg border border-slate-200 shadow-sm">
                        <div class="px-4 py-3 border-b border-slate-200 sticky top-0 bg-white">
                            <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                </svg>
                                Nedávne Aktivity
                            </h3>
                        </div>

                        <div class="activities-timeline px-4 py-3 space-y-3 max-h-96 overflow-y-auto">
                            ${this.mockActivities.map((activity, idx) => `
                                <div class="activity-item flex gap-3 pb-3 ${idx < this.mockActivities.length - 1 ? 'border-b border-slate-100' : ''}">
                                    <div class="flex-shrink-0 text-2xl">${activity.icon}</div>
                                    <div class="flex-1 min-w-0">
                                        <p class="text-sm font-medium text-slate-900">${activity.title}</p>
                                        <p class="text-xs text-slate-600 truncate">${activity.description}</p>
                                        <p class="text-xs text-slate-500 mt-1">${activity.timestamp}</p>
                                    </div>
                                </div>
                            `).join('')}
                        </div>

                        <div class="px-4 py-2 border-t border-slate-200 bg-slate-50">
                            <button class="view-all-activities w-full text-center text-sm text-emerald-700 hover:text-emerald-800 font-medium transition">
                                Zobraziť všetky aktivity →
                            </button>
                        </div>
                    </div>

                    <!-- Weather Widget -->
                    <div class="weather-widget bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                        <div class="bg-gradient-to-r from-sky-400 to-sky-500 px-4 py-6 text-white">
                            <div class="flex items-start justify-between">
                                <div>
                                    <p class="text-sm font-medium opacity-90">Aktuálne Počasie</p>
                                    <div class="text-4xl font-bold mt-1">${this.mockWeather.temp}°C</div>
                                </div>
                                <div class="text-5xl">${this.mockWeather.icon}</div>
                            </div>
                            <p class="text-sm mt-3 opacity-90">${this.mockWeather.condition}</p>
                        </div>

                        <div class="px-4 py-3 space-y-2">
                            <div class="flex items-center justify-between text-sm">
                                <span class="text-slate-600">💧 Vlhkosť:</span>
                                <span class="font-medium text-slate-900">${this.mockWeather.humidity}%</span>
                            </div>
                            <div class="flex items-center justify-between text-sm">
                                <span class="text-slate-600">💨 Vietor:</span>
                                <span class="font-medium text-slate-900">${this.mockWeather.windSpeed} km/h</span>
                            </div>
                            <button class="detail-forecast w-full mt-3 px-3 py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg text-sm font-medium transition-colors">
                                Detailná predpoveď
                            </button>
                        </div>
                    </div>
                </div>

                <!-- RIGHT COLUMN: Quick Actions & Performance -->
                <div class="dashboard-right lg:col-span-1 space-y-4">
                    <!-- Quick Actions -->
                    <div class="quick-actions-card bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                        <h3 class="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                            <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                            </svg>
                            Rýchle Akcie
                        </h3>

                        <div class="space-y-2">
                            <button class="quick-action-btn new-parcel w-full flex items-center gap-2 px-3 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium transition-colors">
                                <span>📍</span>
                                <span>Nová parcela</span>
                            </button>

                            <button class="quick-action-btn import-geojson w-full flex items-center gap-2 px-3 py-2.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg text-sm font-medium transition-colors">
                                <span>📄</span>
                                <span>Nahrať GeoJSON</span>
                            </button>

                            <button class="quick-action-btn detect-collision w-full flex items-center gap-2 px-3 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg text-sm font-medium transition-colors">
                                <span>⚠️</span>
                                <span>Detekcia kolízií</span>
                            </button>

                            <button class="quick-action-btn export-data w-full flex items-center gap-2 px-3 py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-sm font-medium transition-colors">
                                <span>📤</span>
                                <span>Exportovať dáta</span>
                            </button>

                            <button class="quick-action-btn report-spray w-full flex items-center gap-2 px-3 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-sm font-medium transition-colors">
                                <span>🚜</span>
                                <span>Hlásenie spreje</span>
                            </button>
                        </div>
                    </div>

                    <!-- Performance Metrics -->
                    <div class="performance-card bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                        <h3 class="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                            <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                            </svg>
                            Výkon a Metriky
                        </h3>

                        <div class="space-y-3">
                            <!-- API Calls -->
                            <div class="metric-item">
                                <div class="flex items-center justify-between mb-1">
                                    <span class="text-xs font-semibold text-slate-600">API Volania</span>
                                    <span class="text-xs font-bold text-slate-900">1,234</span>
                                </div>
                                <div class="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                                    <div class="h-full bg-emerald-500 rounded-full" style="width: 65%"></div>
                                </div>
                            </div>

                            <!-- Data Processed -->
                            <div class="metric-item">
                                <div class="flex items-center justify-between mb-1">
                                    <span class="text-xs font-semibold text-slate-600">Spracované dáta</span>
                                    <span class="text-xs font-bold text-slate-900">2.4 GB</span>
                                </div>
                                <div class="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                                    <div class="h-full bg-blue-500 rounded-full" style="width: 48%"></div>
                                </div>
                            </div>

                            <!-- Average Response Time -->
                            <div class="metric-item">
                                <div class="flex items-center justify-between mb-1">
                                    <span class="text-xs font-semibold text-slate-600">Priemerný čas odozvy</span>
                                    <span class="text-xs font-bold text-slate-900">245 ms</span>
                                </div>
                                <div class="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                                    <div class="h-full bg-green-500 rounded-full" style="width: 35%"></div>
                                </div>
                            </div>

                            <!-- System Health -->
                            <div class="metric-item">
                                <div class="flex items-center justify-between mb-1">
                                    <span class="text-xs font-semibold text-slate-600">Zdravie systému</span>
                                    <span class="text-xs font-bold text-emerald-700">98.5%</span>
                                </div>
                                <div class="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                                    <div class="h-full bg-emerald-500 rounded-full" style="width: 98.5%"></div>
                                </div>
                            </div>
                        </div>

                        <div class="mt-4 pt-4 border-t border-slate-200">
                            <button class="detailed-metrics w-full text-center text-sm text-emerald-700 hover:text-emerald-800 font-medium transition">
                                Detailné metriky →
                            </button>
                        </div>
                    </div>

                    <!-- Subscription Status -->
                    <div class="subscription-card bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg border border-emerald-200 p-4">
                        <div class="flex items-start justify-between mb-3">
                            <h3 class="text-sm font-bold text-emerald-900">Predplatné Status</h3>
                            <span class="text-xs font-semibold px-2 py-1 bg-emerald-200 text-emerald-800 rounded-full">PREMIUM</span>
                        </div>
                        <p class="text-xs text-emerald-800 mb-3">Ďalšia obnova: <strong>15. decembra 2026</strong></p>
                        <button class="manage-subscription w-full px-3 py-2 bg-white hover:bg-emerald-50 text-emerald-700 rounded-lg text-sm font-medium transition-colors border border-emerald-300">
                            Správa predplatného
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        // Quick actions
        this.container.querySelector('.new-parcel')?.addEventListener('click', () => {
            globalBus.emit('dashboard:action', { action: 'new-parcel' });
            showNotificationToast('Otváram formulár novej parcely...', 'success');
        });

        this.container.querySelector('.import-geojson')?.addEventListener('click', () => {
            globalBus.emit('dashboard:action', { action: 'import-geojson' });
            showNotificationToast('Otváram import GeoJSON...', 'success');
        });

        this.container.querySelector('.detect-collision')?.addEventListener('click', () => {
            globalBus.emit('dashboard:action', { action: 'detect-collision' });
            showNotificationToast('Spúšťam detekciu kolízií...', 'success');
        });

        this.container.querySelector('.export-data')?.addEventListener('click', () => {
            globalBus.emit('dashboard:action', { action: 'export-data' });
            showNotificationToast('Exportujem dáta...', 'success');
        });

        this.container.querySelector('.report-spray')?.addEventListener('click', () => {
            globalBus.emit('dashboard:action', { action: 'report-spray' });
            showNotificationToast('Otváram formulár hlásenia spreje...', 'success');
        });

        // Navigation
        this.container.querySelector('.view-full-profile')?.addEventListener('click', () => {
            window.location.hash = '#/profile/view';
        });

        this.container.querySelector('.manage-entities')?.addEventListener('click', () => {
            window.location.hash = '#/profile/entities';
        });

        this.container.querySelector('.view-all-activities')?.addEventListener('click', () => {
            window.location.hash = '#/activities';
        });

        this.container.querySelector('.detail-forecast')?.addEventListener('click', () => {
            window.location.hash = '#/weather';
        });

        this.container.querySelector('.detailed-metrics')?.addEventListener('click', () => {
            window.location.hash = '#/metrics';
        });

        this.container.querySelector('.manage-subscription')?.addEventListener('click', () => {
            window.location.hash = '#/profile/subscription';
        });

        this.container.querySelector('.edit-profile')?.addEventListener('click', () => {
            window.location.hash = '#/profile/edit';
        });
    }

    loadDashboardData() {
        const state = store.getState();
        
        // Update profile
        const profileName = document.getElementById('profile-name');
        const profileType = document.getElementById('profile-type');
        if (state.currentUser) {
            if (profileName) profileName.textContent = state.currentUser.name || 'Užívateľ AgroGIS';
            if (profileType) profileType.textContent = `Typ účtu: ${state.currentPersona}`;
        }

        // Update statistics
        const parcels = state.cadasterParcels?.length || 0;
        const totalArea = (state.cadasterParcels || []).reduce((sum, p) => sum + (p.areaHa || 0), 0);
        const entities = state.entities?.length || 0;

        const parcelsEl = document.getElementById('stat-parcels');
        const areaEl = document.getElementById('stat-area');
        const totalParcelsEl = document.getElementById('stats-total-parcels');
        const totalAreaEl = document.getElementById('stats-total-area');
        const entityTypeEl = document.getElementById('stats-entity-type');
        const entityCountEl = document.getElementById('stats-entity-count');

        if (parcelsEl) parcelsEl.textContent = parcels;
        if (areaEl) areaEl.textContent = totalArea.toFixed(1);
        if (totalParcelsEl) totalParcelsEl.textContent = parcels;
        if (totalAreaEl) totalAreaEl.textContent = totalArea.toFixed(1);
        if (entityTypeEl) entityTypeEl.textContent = state.currentPersona || '-';
        if (entityCountEl) entityCountEl.textContent = entities;
    }

    subscribeToStore() {
        store.subscribe((state) => {
            this.loadDashboardData();
        });
    }

    updateWeatherWidget(weather) {
        if (weather) {
            Object.assign(this.mockWeather, weather);
            this.render();
            this.attachEventListeners();
        }
    }

    addActivity(activity) {
        this.mockActivities.unshift({
            id: Date.now(),
            ...activity,
            timestamp: 'Práve teraz'
        });
        this.mockActivities = this.mockActivities.slice(0, 10);
        this.render();
        this.attachEventListeners();
    }

    destroy() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}

export default Dashboard;
