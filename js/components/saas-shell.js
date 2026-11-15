/**
 * Full-screen dashboard chrome: omnibox, mode switch, weather card,
 * coordinate copy, and the mobile bottom sheet. Search and map actions
 * stay in the existing functions.
 */

import { store } from '../core/state-store.js';
import { AgroApiService } from '../services/api.js';

const PERSONA_BY_MODE = {
    hobby: 'AGRO_HOBBY',
    farmer: 'AGRO_PRO',
    beekeeper: 'BEE_PRO'
};

const geocoder = new AgroApiService();
let omniFilter = '';
let sheetDrag = null;

export function classifyOmniboxQuery(raw, filter = '') {
    const value = String(raw || '').trim();
    const compact = value.replace(/\s+/g, '');
    if (/^\d{8}$/.test(compact)) {
        return { kind: 'ico', ico: compact };
    }

    const parcelMatch = value.match(/(\d{1,5}\/\d{1,4})/);
    const explicitRegister = /\bE(?:-KN)?\b/i.test(value) || filter === 'ekn' ? 'E' : 'C';
    const namedParcel = value.match(/^(.+?[A-Za-zÀ-ž].+?)\s+(\d{1,5}(?:\/\d{1,4})?)$/);
    if (namedParcel && !/^\d{8}$/.test(compact)) {
        return {
            kind: 'parcel',
            parcel: namedParcel[2],
            ku: namedParcel[1].replace(/\b(?:C|E)(?:-KN)?\b/gi, '').trim(),
            register: explicitRegister
        };
    }
    const bareNumber = value.match(/\b\d{1,5}\b/);
    const wantsParcel = Boolean(parcelMatch) || filter === 'ckn' || filter === 'ekn';
    if (wantsParcel) {
        const parcel = parcelMatch ? parcelMatch[1] : (bareNumber ? bareNumber[0] : '');
        if (parcel) {
            const ku = value
                .replace(parcel, ' ')
                .replace(/\b(?:C|E)(?:-KN)?\b/gi, ' ')
                .replace(/kataster|parcela|k\.?\s*ú\.?/gi, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            return {
                kind: 'parcel',
                parcel,
                ku,
                register: filter === 'ekn' ? 'E' : explicitRegister
            };
        }
    }

    return { kind: 'place', query: value };
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function suggestionPool(query) {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    const hits = [];
    const datalist = document.getElementById('ku-datalist');
    if (datalist) {
        datalist.querySelectorAll('option').forEach((option) => {
            const label = option.value || '';
            if (label.toLowerCase().includes(needle)) {
                hits.push({
                    kind: 'ku',
                    label,
                    detail: 'Katastrálne územie',
                    ku: label.replace(/\s*\(\d+\)\s*$/, '')
                });
            }
        });
    }

    const state = store.getState();
    (state.entities || []).forEach((entity) => {
        const haystack = `${entity.name || ''} ${entity.city || ''} ${entity.ico || ''} ${entity.address || ''}`.toLowerCase();
        if (haystack.includes(needle)) {
            hits.push({
                kind: 'entity',
                label: entity.name,
                detail: `${entity.ico || 'bez IČO'} · ${entity.city || 'obec'}`,
                ico: entity.ico
            });
        }
    });
    (state.hives || []).forEach((hive) => {
        const haystack = `${hive.name || ''} ${hive.cevz || ''}`.toLowerCase();
        if (haystack.includes(needle)) {
            hits.push({
                kind: 'hive',
                label: hive.name,
                detail: hive.cevz || 'Včelnica',
                id: hive.id,
                hive
            });
        }
    });
    (state.lpisParcels || []).forEach((parcel) => {
        const haystack = `${parcel.id || ''} ${parcel.crop || ''} ${parcel.kUzemie || ''} ${parcel.ownerName || ''}`.toLowerCase();
        if (haystack.includes(needle)) {
            hits.push({
                kind: 'lpis',
                label: parcel.id,
                detail: `${parcel.crop || 'LPIS'} · ${parcel.ownerName || ''}`,
                id: parcel.id,
                parcel
            });
        }
    });

    const preferred = omniFilter === 'hives' ? 'hive' : (omniFilter === 'lpis' ? 'lpis' : '');
    hits.sort((left, right) => {
        if (left.kind === preferred && right.kind !== preferred) return -1;
        if (right.kind === preferred && left.kind !== preferred) return 1;
        return 0;
    });
    return hits.slice(0, 8);
}

function renderSuggestions(query) {
    const box = document.getElementById('saas-omni-suggest');
    if (!box) return;
    const classified = classifyOmniboxQuery(query, omniFilter);
    if (classified.kind !== 'place') {
        box.hidden = true;
        box.innerHTML = '';
        return;
    }
    const hits = suggestionPool(query);
    if (!hits.length) {
        box.hidden = true;
        box.innerHTML = '';
        return;
    }
    box.hidden = false;
    box.innerHTML = hits.map((hit, index) => `
        <button type="button" class="saas-suggest-item" data-suggest-index="${index}">
            <span>${escapeHtml(hit.label)}</span>
            <small>${escapeHtml(hit.detail)}</small>
        </button>
    `).join('');
    box.querySelectorAll('[data-suggest-index]').forEach((button) => {
        button.addEventListener('click', () => {
            const hit = hits[Number(button.getAttribute('data-suggest-index'))];
            applySuggestion(hit);
        });
    });
}

async function applySuggestion(hit) {
    const box = document.getElementById('saas-omni-suggest');
    if (box) box.hidden = true;
    if (!hit) return;
    if (hit.kind === 'entity' && hit.ico) {
        const input = document.getElementById('ico-input');
        const omni = document.getElementById('saas-omnibox');
        if (input) input.value = hit.ico;
        if (omni) omni.value = hit.ico;
        if (typeof window.handleEntityVerification === 'function') {
            await window.handleEntityVerification();
        }
        return;
    }
    if (hit.kind === 'ku') {
        const kuInput = document.getElementById('cadastre-ku-input');
        if (kuInput) kuInput.value = hit.ku;
        await flyToPlace(hit.ku);
        return;
    }
    if (hit.kind === 'hive' && typeof window.focusHiveOnMap === 'function') {
        window.focusHiveOnMap(hit.id);
        window.agrogisMap?.showApiaryInspector?.(hit.hive);
        return;
    }
    if (hit.kind === 'lpis' && typeof window.focusLpisParcelOnMap === 'function') {
        window.focusLpisParcelOnMap(hit.id);
        window.agrogisMap?._showParcelPopup?.(hit.parcel);
    }
}

async function flyToPlace(query) {
    const position = await geocoder.geocodeAddress(query, query);
    const map = window.agrogisMap?.map;
    if (map && Number.isFinite(position.lat) && Number.isFinite(position.lng)) {
        map.flyTo([position.lat, position.lng], 13, { duration: 0.8 });
    }
    const kuInput = document.getElementById('cadastre-ku-input');
    if (kuInput && query) kuInput.value = query;
    if (typeof window.showToast === 'function') {
        window.showToast(`Obec alebo kataster: ${query}`, 'info');
    }
}

export async function runOmniboxSearch(raw) {
    const classified = classifyOmniboxQuery(raw, omniFilter);
    if (!classified || (classified.kind === 'place' && !classified.query)) return;

    if (classified.kind === 'ico') {
        const input = document.getElementById('ico-input');
        if (input) input.value = classified.ico;
        if (typeof window.switchSidebarTab === 'function') window.switchSidebarTab('search');
        if (typeof window.handleEntityVerification === 'function') {
            await window.handleEntityVerification();
        }
        return;
    }

    if (classified.kind === 'parcel') {
        const kuInput = document.getElementById('cadastre-ku-input');
        const parcelInput = document.getElementById('cadastre-parcel-input');
        if (parcelInput) parcelInput.value = classified.parcel;
        if (kuInput && classified.ku) kuInput.value = classified.ku;
        if (typeof window.selectCadastreRegister === 'function') {
            window.selectCadastreRegister(classified.register);
        }
        if (typeof window.switchSidebarTab === 'function') window.switchSidebarTab('search');
        if (typeof window.handleCadastreParcelSearch === 'function') {
            await window.handleCadastreParcelSearch();
        }
        return;
    }

    const hits = suggestionPool(classified.query);
    if (hits.length === 1) {
        await applySuggestion(hits[0]);
        return;
    }
    renderSuggestions(classified.query);
    if (!hits.length) await flyToPlace(classified.query);
}

function setFilter(next) {
    omniFilter = omniFilter === next ? '' : next;
    document.querySelectorAll('[data-omni-filter]').forEach((button) => {
        button.classList.toggle('is-active', button.getAttribute('data-omni-filter') === omniFilter);
    });
    if (next === 'ckn' && typeof window.selectCadastreRegister === 'function') window.selectCadastreRegister('C');
    if (next === 'ekn' && typeof window.selectCadastreRegister === 'function') window.selectCadastreRegister('E');
    if (next === 'lpis') {
        const box = document.getElementById('layer-lpis');
        if (box && !box.checked) {
            box.checked = true;
            window.toggleLpisLayer?.(true);
        }
    }
    if (next === 'hives') {
        const hives = document.getElementById('layer-hives');
        const radii = document.getElementById('layer-hive-radii');
        if (hives && !hives.checked) {
            hives.checked = true;
            window.toggleHivesLayer?.(true);
        }
        if (radii && !radii.checked) {
            radii.checked = true;
            window.toggleHiveRadiiLayer?.(true);
        }
    }
    const omni = document.getElementById('saas-omnibox');
    if (omni) renderSuggestions(omni.value);
}

export function setDashboardMode(mode) {
    const persona = PERSONA_BY_MODE[mode] || PERSONA_BY_MODE.farmer;
    if (typeof window.selectUserPersona === 'function') {
        window.selectUserPersona(persona);
    }
}

export function openProfileFromLayerBar() {
    const userControls = document.getElementById('header-user-controls');
    const loggedIn = userControls && !userControls.classList.contains('hidden');
    if (loggedIn && typeof window.openUserDashboardModal === 'function') {
        window.openUserDashboardModal();
        return;
    }
    if (typeof window.openAuthModal === 'function') window.openAuthModal('login');
}

export function saasToggleLayer(which) {
    if (which === 'lpis') {
        const box = document.getElementById('layer-lpis');
        const next = box ? !box.checked : true;
        if (box) box.checked = next;
        window.toggleLpisLayer?.(next);
    }
    if (which === 'hives') {
        const hives = document.getElementById('layer-hives');
        const radii = document.getElementById('layer-hive-radii');
        const next = !(hives?.checked && radii?.checked);
        if (hives) hives.checked = next;
        if (radii) radii.checked = next;
        window.toggleHivesLayer?.(next);
        window.toggleHiveRadiiLayer?.(next);
    }
    syncLayerBar(store.getState());
}

function syncLayerBar(state) {
    const kataster = document.getElementById('layerbar-kataster');
    const lpis = document.getElementById('layerbar-lpis');
    const hives = document.getElementById('layerbar-hives');
    const ortho = document.getElementById('layerbar-ortho');
    if (kataster) kataster.classList.toggle('is-on', Boolean(state.isKatasterVisible));
    if (lpis) lpis.classList.toggle('is-on', state.isLpisLayerVisible !== false);
    if (hives) hives.classList.toggle('is-on', Boolean(state.isHivesLayerVisible && state.isHiveRadiiVisible));
    if (ortho) ortho.classList.add('is-on');
    const katasterCheck = document.getElementById('layer-kataster');
    const lpisCheck = document.getElementById('layer-lpis');
    const hivesCheck = document.getElementById('layer-hives');
    const radiiCheck = document.getElementById('layer-hive-radii');
    if (katasterCheck) katasterCheck.checked = Boolean(state.isKatasterVisible);
    if (lpisCheck) lpisCheck.checked = state.isLpisLayerVisible !== false;
    if (hivesCheck) hivesCheck.checked = Boolean(state.isHivesLayerVisible);
    if (radiiCheck) radiiCheck.checked = Boolean(state.isHiveRadiiVisible);
}

async function copyCoordinates() {
    const text = ['footer-jtsk', 'footer-latlng', 'footer-scale', 'footer-zoom']
        .map((id) => document.getElementById(id)?.textContent?.trim() || '')
        .filter(Boolean)
        .join(' | ');
    if (!text) return;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            const area = document.createElement('textarea');
            area.value = text;
            document.body.appendChild(area);
            area.select();
            document.execCommand('copy');
            area.remove();
        }
        window.showToast?.('Súradnice skopírované', 'success');
    } catch (error) {
        window.showToast?.('Súradnice sa nepodarilo skopírovať', 'warning');
    }
}

function bindSheetDrag() {
    const sheet = document.getElementById('left-sidebar');
    const handle = document.getElementById('saas-sheet-handle');
    if (!sheet || !handle || handle.dataset.bound === 'true') return;
    handle.dataset.bound = 'true';

    handle.addEventListener('pointerdown', (event) => {
        if (window.innerWidth > 767) return;
        sheetDrag = {
            startY: event.clientY,
            startH: sheet.getBoundingClientRect().height
        };
        handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', (event) => {
        if (!sheetDrag || !handle.hasPointerCapture(event.pointerId)) return;
        const next = Math.min(
            window.innerHeight * 0.86,
            Math.max(120, sheetDrag.startH + (sheetDrag.startY - event.clientY))
        );
        sheet.style.height = `${next}px`;
        document.documentElement.style.setProperty('--sheet-h', `${next}px`);
    });
    const endDrag = () => {
        sheetDrag = null;
    };
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
}

function bindWeatherCard() {
    const pill = document.getElementById('weather-safety-pill');
    const card = document.getElementById('weather-condition-card');
    if (!pill || !card || pill.dataset.bound === 'true') return;
    pill.dataset.bound = 'true';
    pill.addEventListener('click', () => {
        const open = card.hidden;
        card.hidden = !open;
        pill.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
}

function bindOmnibox() {
    const omni = document.getElementById('saas-omnibox');
    const filterBtn = document.getElementById('saas-omni-filter');
    const filters = document.getElementById('saas-omni-filters');
    if (!omni || omni.dataset.bound === 'true') return;
    omni.dataset.bound = 'true';

    omni.addEventListener('input', () => {
        const classified = classifyOmniboxQuery(omni.value, omniFilter);
        if (classified.kind === 'ico') {
            runOmniboxSearch(omni.value);
            return;
        }
        renderSuggestions(omni.value);
    });
    omni.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            runOmniboxSearch(omni.value);
        }
    });
    filterBtn?.addEventListener('click', () => {
        if (!filters) return;
        filters.hidden = !filters.hidden;
        filterBtn.setAttribute('aria-expanded', filters.hidden ? 'false' : 'true');
    });
    filters?.querySelectorAll('[data-omni-filter]').forEach((button) => {
        button.addEventListener('click', () => {
            setFilter(button.getAttribute('data-omni-filter') || '');
        });
    });
}

export function bindSaasShell() {
    bindOmnibox();
    bindWeatherCard();
    bindSheetDrag();

    const coord = document.getElementById('geo-coord-pill');
    if (coord && coord.dataset.bound !== 'true') {
        coord.dataset.bound = 'true';
        coord.addEventListener('click', () => {
            copyCoordinates();
        });
        coord.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                copyCoordinates();
            }
        });
    }

    const closeInspector = document.getElementById('inspector-close');
    closeInspector?.addEventListener('click', () => {
        document.getElementById('analysis-result-panel')?.classList.remove('is-visible');
    });

    document.querySelectorAll('[data-dashboard-mode]').forEach((button) => {
        if (button.dataset.bound === 'true') return;
        button.dataset.bound = 'true';
        button.addEventListener('click', () => {
            setDashboardMode(button.getAttribute('data-dashboard-mode'));
        });
    });

    store.subscribe((state) => {
        syncLayerBar(state);
    });
    syncLayerBar(store.getState());

    window.setDashboardMode = setDashboardMode;
    window.openProfileFromLayerBar = openProfileFromLayerBar;
    window.saasToggleLayer = saasToggleLayer;
    window.runOmniboxSearch = runOmniboxSearch;
    window.classifyOmniboxQuery = classifyOmniboxQuery;
}
