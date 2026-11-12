/**
 * @file search-module.js
 * @description Advanced Search Module s live autocomplete, vyhľadávovaním subjektov, filtrami a nedávnymi vyhľadávaniami.
 */

import { store } from '../core/state-store.js';
import { AgroApiService } from '../services/api.js';
import { globalBus, showNotificationToast } from './event-bus.js';

export class SearchModule {
    constructor(containerId = 'search-module-container') {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.apiService = new AgroApiService();

        this.searchMode = 'ico'; // 'ico' | 'entity' | 'hives'
        this.selectedFilters = {
            type: null,
            city: null,
            district: null
        };
        this.recentSearches = this.loadRecentSearches();
        this.autocompleteResults = [];
        this.isSearching = false;
        this.searchInput = null;
        this.autocompleteDropdown = null;

        this.entityTypes = [
            'Všetci',
            'Poľnohospodári',
            'Včelárov',
            'Zverené',
            'Fyzické osoby'
        ];

        this.cities = [
            'Bratislava', 'Košice', 'Prešov', 'Banská Bystrica', 'Nitra',
            'Trenčín', 'Trnava', 'Žilina', 'Martin', 'Zvolen'
        ];

        this.districts = [
            'Bratislava I', 'Bratislava II', 'Bratislava III', 'Bratislava IV', 'Bratislava V',
            'Nitra', 'Topoľčany', 'Zlaté Moravce', 'Košice I', 'Košice II'
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
    }

    render() {
        this.container.innerHTML = `
            <div class="search-module bg-white rounded-lg border border-slate-200 shadow-sm">
                <!-- Search Mode Tabs -->
                <div class="search-mode-tabs flex border-b border-slate-200">
                    <button class="search-mode-tab flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 
                                   ${this.searchMode === 'ico' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-600 hover:text-slate-900'}"
                            data-mode="ico">
                        🔍 Vyhľadávanie podľa IČO
                    </button>
                    <button class="search-mode-tab flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2
                                   ${this.searchMode === 'entity' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-600 hover:text-slate-900'}"
                            data-mode="entity">
                        🏢 Subjekty RegisterUZ
                    </button>
                    <button class="search-mode-tab flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2
                                   ${this.searchMode === 'hives' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-600 hover:text-slate-900'}"
                            data-mode="hives">
                        🐝 Včelstvá
                    </button>
                </div>

                <!-- Search Bar -->
                <div class="search-bar-section p-4 border-b border-slate-200">
                    <div class="relative">
                        <input type="text" 
                               class="search-input w-full px-4 py-3 pr-12 rounded-lg bg-slate-50 border border-slate-300 
                                      focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 
                                      transition-all text-sm placeholder-slate-500"
                               placeholder="${this.getSearchPlaceholder()}"
                               autocomplete="off">
                        <div class="absolute right-3 top-1/2 -translate-y-1/2">
                            <svg class="search-icon w-5 h-5 text-slate-400 hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                            </svg>
                            <div class="search-spinner hidden animate-spin">
                                <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                                </svg>
                            </div>
                        </div>

                        <!-- Autocomplete Dropdown -->
                        <div class="search-autocomplete hidden absolute top-full left-0 right-0 mt-2 bg-white border border-slate-300 
                                    rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                            <div class="autocomplete-results space-y-1 p-2"></div>
                        </div>
                    </div>
                </div>

                <!-- Quick Filters -->
                <div class="quick-filters-section px-4 py-3 border-b border-slate-200">
                    <div class="text-xs font-semibold text-slate-600 mb-2">Rýchle filtre:</div>
                    <div class="flex flex-wrap gap-2">
                        ${this.entityTypes.map(type => `
                            <button class="quick-filter-btn px-3 py-1.5 text-xs font-medium rounded-full transition-all
                                          ${type === 'Všetci' ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-transparent'}"
                                    data-filter-type="${type}">
                                ${type}
                            </button>
                        `).join('')}
                    </div>
                </div>

                <!-- Advanced Filters -->
                <div class="advanced-filters-section px-4 py-4 border-b border-slate-200">
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <!-- Type Filter -->
                        <div>
                            <label class="block text-xs font-semibold text-slate-700 mb-2">Typ subjektu</label>
                            <select class="filter-type w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 
                                          focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 text-sm">
                                <option value="">Všetci</option>
                                <option value="agricultura">Poľnohospodári</option>
                                <option value="beekeepers">Včelárov</option>
                                <option value="trust">Zverené</option>
                                <option value="private">Fyzické osoby</option>
                            </select>
                        </div>

                        <!-- City Filter -->
                        <div>
                            <label class="block text-xs font-semibold text-slate-700 mb-2">Mesto</label>
                            <select class="filter-city w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 
                                          focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 text-sm">
                                <option value="">Všetky mestá</option>
                                ${this.cities.map(city => `<option value="${city}">${city}</option>`).join('')}
                            </select>
                        </div>

                        <!-- District Filter -->
                        <div>
                            <label class="block text-xs font-semibold text-slate-700 mb-2">Okres</label>
                            <select class="filter-district w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 
                                          focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 text-sm">
                                <option value="">Všetky okresy</option>
                                ${this.districts.map(district => `<option value="${district}">${district}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Search Results or Recent Searches -->
                <div class="search-results-section px-4 py-4">
                    <div id="search-results-content">
                        ${this.recentSearches.length > 0 ? this.renderRecentSearches() : this.renderEmptyState()}
                    </div>
                </div>
            </div>
        `;

        this.searchInput = this.container.querySelector('.search-input');
        this.autocompleteDropdown = this.container.querySelector('.search-autocomplete');
    }

    renderRecentSearches() {
        return `
            <div class="recent-searches">
                <div class="text-xs font-semibold text-slate-600 mb-3 flex items-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    Nedávne vyhľadávania
                </div>
                <div class="space-y-2">
                    ${this.recentSearches.slice(0, 5).map((search, idx) => `
                        <button class="recent-search-item w-full text-left px-3 py-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 
                                       border border-slate-200 transition-colors text-sm text-slate-700 flex items-center justify-between group"
                                data-search-index="${idx}">
                            <div class="flex items-center gap-2 flex-1 min-w-0">
                                <span class="text-slate-400 text-xs">${search.mode === 'ico' ? '🔍' : search.mode === 'entity' ? '🏢' : '🐝'}</span>
                                <div class="flex-1 min-w-0">
                                    <div class="text-slate-900 font-medium truncate">${search.query}</div>
                                    <div class="text-xs text-slate-500">${search.timestamp}</div>
                                </div>
                            </div>
                            <button class="delete-search opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-slate-200 rounded"
                                    data-search-index="${idx}">
                                <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                                </svg>
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderEmptyState() {
        return `
            <div class="empty-state text-center py-8">
                <div class="text-3xl mb-2">🔍</div>
                <div class="text-sm text-slate-600">Zadajte vyhľadávaný výraz a začnite hľadať</div>
            </div>
        `;
    }

    getSearchPlaceholder() {
        const placeholders = {
            'ico': 'Zadajte IČO (napr. 00190225)...',
            'entity': 'Zadajte názov subjektu z RegisterUZ...',
            'hives': 'Zadajte názov včelnice alebo mesto...'
        };
        return placeholders[this.searchMode] || 'Vyhľadávajte...';
    }

    attachEventListeners() {
        // Mode tabs
        this.container.querySelectorAll('[data-mode]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.searchMode = e.target.getAttribute('data-mode');
                this.searchInput?.value && this.performSearch();
                this.render();
                this.attachEventListeners();
            });
        });

        // Search input
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => this.handleSearchInput(e));
            this.searchInput.addEventListener('focus', () => this.showAutocomplete());
            this.searchInput.addEventListener('blur', () => {
                setTimeout(() => this.autocompleteDropdown?.classList.add('hidden'), 200);
            });
        }

        // Quick filters
        this.container.querySelectorAll('[data-filter-type]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.container.querySelectorAll('[data-filter-type]').forEach(b => {
                    b.classList.remove('bg-emerald-100', 'text-emerald-700', 'border-emerald-300');
                    b.classList.add('bg-slate-100', 'text-slate-700', 'border-transparent');
                });
                e.target.classList.remove('bg-slate-100', 'text-slate-700', 'border-transparent');
                e.target.classList.add('bg-emerald-100', 'text-emerald-700', 'border-emerald-300');
                this.selectedFilters.type = e.target.getAttribute('data-filter-type');
            });
        });

        // Advanced filters
        this.container.querySelector('.filter-type')?.addEventListener('change', (e) => {
            this.selectedFilters.type = e.target.value || null;
        });

        this.container.querySelector('.filter-city')?.addEventListener('change', (e) => {
            this.selectedFilters.city = e.target.value || null;
        });

        this.container.querySelector('.filter-district')?.addEventListener('change', (e) => {
            this.selectedFilters.district = e.target.value || null;
        });

        // Recent searches
        this.container.querySelectorAll('.recent-search-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!e.target.closest('.delete-search')) {
                    const idx = parseInt(btn.getAttribute('data-search-index'));
                    this.searchInput.value = this.recentSearches[idx].query;
                    this.performSearch();
                }
            });
        });

        // Delete recent search
        this.container.querySelectorAll('.delete-search').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.getAttribute('data-search-index'));
                this.recentSearches.splice(idx, 1);
                this.saveRecentSearches();
                this.render();
                this.attachEventListeners();
            });
        });
    }

    handleSearchInput(e) {
        const query = e.target.value.trim();
        
        if (query.length < 2) {
            this.autocompleteDropdown?.classList.add('hidden');
            return;
        }

        this.fetchAutocompleteResults(query);
    }

    async fetchAutocompleteResults(query) {
        this.isSearching = true;
        this.showLoadingSpinner(true);

        try {
            let results = [];

            if (this.searchMode === 'ico') {
                results = await this.searchByICO(query);
            } else if (this.searchMode === 'entity') {
                results = await this.searchEntity(query);
            } else if (this.searchMode === 'hives') {
                results = await this.searchHives(query);
            }

            this.autocompleteResults = results.slice(0, 8);
            this.renderAutocompleteResults();
            this.autocompleteDropdown?.classList.remove('hidden');
        } catch (error) {
            console.error('Search error:', error);
            showNotificationToast('Chyba pri vyhľadávaní', 'danger');
        } finally {
            this.isSearching = false;
            this.showLoadingSpinner(false);
        }
    }

    async searchByICO(query) {
        const allEntities = store._state.entities || [];
        return allEntities.filter(e => e.ico.includes(query)).map(e => ({
            id: e.ico,
            title: e.ico,
            subtitle: e.name,
            data: e
        }));
    }

    async searchEntity(query) {
        const allEntities = store._state.entities || [];
        return allEntities.filter(e => e.name.toLowerCase().includes(query.toLowerCase())).map(e => ({
            id: e.ico,
            title: e.name,
            subtitle: e.type,
            data: e
        }));
    }

    async searchHives(query) {
        const allHives = store._state.hives || [];
        return allHives.filter(h => h.name.toLowerCase().includes(query.toLowerCase())).map(h => ({
            id: h.id,
            title: h.name,
            subtitle: h.city || 'Mesto',
            data: h
        }));
    }

    renderAutocompleteResults() {
        const resultsContainer = this.autocompleteDropdown?.querySelector('.autocomplete-results');
        if (!resultsContainer) return;

        resultsContainer.innerHTML = this.autocompleteResults.map(result => `
            <button class="autocomplete-result block w-full text-left px-3 py-2 rounded-md hover:bg-emerald-50 transition-colors text-sm"
                    data-result-id="${result.id}">
                <div class="font-medium text-slate-900">${result.title}</div>
                <div class="text-xs text-slate-600 truncate">${result.subtitle}</div>
            </button>
        `).join('') || '<div class="p-2 text-sm text-slate-600 text-center">Žiadne výsledky</div>';

        this.autocompleteDropdown?.querySelectorAll('.autocomplete-result').forEach(btn => {
            btn.addEventListener('click', () => {
                const resultId = btn.getAttribute('data-result-id');
                const result = this.autocompleteResults.find(r => r.id === resultId);
                if (result) {
                    this.selectResult(result);
                }
            });
        });
    }

    selectResult(result) {
        this.searchInput.value = result.title;
        this.autocompleteDropdown?.classList.add('hidden');
        this.performSearch(result.data);
    }

    performSearch(data = null) {
        const query = this.searchInput.value.trim();
        if (!query) return;

        this.addToRecentSearches(query);
        globalBus.emit('search:performed', {
            mode: this.searchMode,
            query,
            filters: this.selectedFilters,
            data
        });

        showNotificationToast(`Vyhľadávanie: ${query}`, 'success');
    }

    showAutocomplete() {
        if (this.searchInput.value.length >= 2 && this.autocompleteResults.length > 0) {
            this.autocompleteDropdown?.classList.remove('hidden');
        }
    }

    showLoadingSpinner(show) {
        const spinner = this.container.querySelector('.search-spinner');
        const icon = this.container.querySelector('.search-icon');
        if (show) {
            spinner?.classList.remove('hidden');
            icon?.classList.add('hidden');
        } else {
            spinner?.classList.add('hidden');
            icon?.classList.remove('hidden');
        }
    }

    addToRecentSearches(query) {
        const timestamp = new Date().toLocaleString('sk-SK');
        this.recentSearches.unshift({
            query,
            mode: this.searchMode,
            timestamp,
            filters: { ...this.selectedFilters }
        });
        this.recentSearches = this.recentSearches.slice(0, 10);
        this.saveRecentSearches();
    }

    loadRecentSearches() {
        const stored = localStorage.getItem('agrogis_recent_searches');
        return stored ? JSON.parse(stored) : [];
    }

    saveRecentSearches() {
        localStorage.setItem('agrogis_recent_searches', JSON.stringify(this.recentSearches));
    }

    destroy() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}

export default SearchModule;
