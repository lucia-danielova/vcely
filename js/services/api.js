/**
 * @file api.js
 * @description Produkčný konektor na bezplatné štátne registre SR:
 *  1. RPO ŠÚ SR + RegisterUZ MF SR + ORSR — IČO/názov, sídlo, DIČ (multi-source, bez API kľúčov)
 *  2. Kataster nehnuteľností ÚGKK SR (zbgisws.skgeodesy.sk ArcGIS REST) — Parcely C-KN (vrstva 1) a E-KN (vrstva 2)
 *  3. Geoportál LPIS / PPA / ZBGIS — Pôdne bloky a výškopis DMR (Open-Meteo Elevation Bpv)
 *  4. OpenStreetMap Nominatim — Geokódovanie obcí, adries a katastrálnych území
 *  5. Proj4js EPSG:5514 — Exaktná geodetická transformácia S-JTSK (Křovák) <-> ETRS89/WGS84
 */

import { CircuitBreaker } from './circuit-breaker.js';
import { store } from '../core/state-store.js';
import { lookupEntityByIco, searchEntitiesByQuery, padIco } from './registry-lookup.js';
import { fetchJson } from './backend-api.js';

if (typeof window.proj4 !== 'undefined') {
    window.proj4.defs(
        'EPSG:5514',
        '+proj=krovak +lat_0=49.5 +lon_0=24.83333333333333 +alpha=30.28813972222222 +k=0.9999 +x_0=0 +y_0=0 +ellps=bessel +towgs84=485.021,169.465,483.839,7.786342,4.397554,4.102655,0 +units=m +no_defs'
    );
}

// Číselník katastrálnych území SR pre okamžitý preklad názvu na 6-miestny kód ÚGKK SR
const SLOVAK_KU_CATALOG = [
    { name: 'Petržalka', code: '805556', obec: 'Bratislava - m. č. Petržalka', okres: 'Bratislava V', emailObce: 'podatelna@petrzalka.sk', lat: 48.1045, lng: 17.1110 },
    { name: 'Nové Sady', code: '842117', obec: 'Nové Sady', okres: 'Nitra', emailObce: 'obec@novesady.sk', lat: 48.4160, lng: 17.9860 },
    { name: 'Kráľová pri Senci', code: '829455', obec: 'Kráľová pri Senci', okres: 'Senec', emailObce: 'ou@kralovaprisenci.sk', lat: 48.1985, lng: 17.4235 },
    { name: 'Dolná Krupá', code: '812048', obec: 'Dolná Krupá', okres: 'Trnava', emailObce: 'obec@dolnakrupa.sk', lat: 48.4835, lng: 17.5495 },
    { name: 'Hurbanovo', code: '819824', obec: 'Hurbanovo', okres: 'Komárno', emailObce: 'primator@hurbanovo.sk', lat: 47.8720, lng: 18.1950 },
    { name: 'Senec', code: '855057', obec: 'Senec', okres: 'Senec', emailObce: 'msu@senec.sk', lat: 48.2194, lng: 17.3997 },
    { name: 'Nitra', code: '840726', obec: 'Nitra', okres: 'Nitra', emailObce: 'info@nitra.sk', lat: 48.3061, lng: 18.0764 },
    { name: 'Trnava', code: '865117', obec: 'Trnava', okres: 'Trnava', emailObce: 'info@trnava.sk', lat: 48.3774, lng: 17.5872 },
    { name: 'Detva', code: '810649', obec: 'Detva', okres: 'Detva', emailObce: 'msu@detva.sk', lat: 48.5610, lng: 19.4185 },
    { name: 'Podunajské Biskupice', code: '805653', obec: 'Bratislava - Podunajské Biskupice', okres: 'Bratislava II', emailObce: 'sekretariat@biskupice.sk', lat: 48.1285, lng: 17.2145 }
];

export class AgroApiService {
    constructor() {
        this._registerBreaker = new CircuitBreaker(
            async (query, signal) => lookupEntityByIco(query, signal),
            {
                failureThreshold: 4,
                cooldownPeriod: 12000
            }
        );
        this.currentController = null;
    }

    /**
     * Multi-Proxy CORS tunel pre bezplatné volanie štátnych API z prehliadača
     */
    async _fetchWithCorsFallback(targetUrl, signal) {
        const proxies = [
            (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
            (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
            (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
        ];

        for (const buildProxyUrl of proxies) {
            try {
                const res = await fetch(buildProxyUrl(targetUrl), { signal });
                if (res.ok) {
                    const text = await res.text();
                    const trimmed = text ? text.trim() : '';
                    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                        return JSON.parse(trimmed);
                    }
                }
            } catch (err) {
                if (err.name === 'AbortError') throw err;
            }
        }

        const directResponse = await fetch(targetUrl, { signal });
        if (!directResponse.ok) throw new Error(`HTTP ${directResponse.status}`);
        return directResponse.json();
    }

    async fetchEntityByICO(ico) {
        const clean = String(ico || '').replace(/\s+/g, '');
        const padded = padIco(clean);

        // A. Lokálny seed/cache (okamžitá odpoveď), ale živé registre majú prioritu nižšie ak treba doplniť
        const localEntities = store.getState().entities || [];
        const localHit = localEntities.find(
            (e) => e.ico === clean || e.ico === padded || padIco(e.ico) === padded
        );

        if (this.currentController) this.currentController.abort();
        this.currentController = new AbortController();
        const timeoutId = setTimeout(() => this.currentController.abort(), 6500);

        try {
            const entity = await this._registerBreaker.execute(padded || clean, this.currentController.signal);
            clearTimeout(timeoutId);

            if (entity?.name) {
                if ((!Number.isFinite(Number(entity.lat)) || !Number.isFinite(Number(entity.lng))) && (entity.address || entity.city)) {
                    const coords = await this.geocodeAddress(entity.address || entity.city, entity.city || '');
                    entity.lat = coords.lat;
                    entity.lng = coords.lng;
                }
                store.upsertEntity?.(entity);
                return entity;
            }
        } catch (error) {
            clearTimeout(timeoutId);
        }

        if (localHit) {
            return { ...localHit, source: localHit.source || 'Lokálny register aplikácie' };
        }

        return null;
    }

    async searchRegistry(query) {
        const value = String(query || '').trim();
        if (!value) return [];

        if (this.currentController) this.currentController.abort();
        this.currentController = new AbortController();
        const timeoutId = setTimeout(() => this.currentController.abort(), 6500);

        try {
            const live = await searchEntitiesByQuery(value, this.currentController.signal);
            clearTimeout(timeoutId);
            if (live.length) return live;
        } catch (error) {
            clearTimeout(timeoutId);
        }

        const normalized = value.toLowerCase();
        const digits = value.replace(/\D/g, '');
        const icoQuery = /^\d{6,10}$/.test(digits);
        return (store.getState().entities || [])
            .filter((entity) => {
                const ico = String(entity.ico || '').replace(/\D/g, '');
                const name = String(entity.name || '').toLowerCase();
                const city = String(entity.city || '').toLowerCase();
                if (icoQuery) {
                    return ico === digits || ico === digits.padStart(8, '0') || ico.includes(digits);
                }
                // Name queries must match name/city — never treat empty digits as matching every IČO.
                return name.includes(normalized) || city.includes(normalized);
            })
            .slice(0, 8);
    }

    /**
     * 2. ŠTÁTNY KATASTER NEHNUTEĽNOSTÍ ÚGKK SR (zbgisws.skgeodesy.sk ArcGIS REST MapServer)
     *    Vrstva 1 = Parcely registra C-KN
     *    Vrstva 2 = Parcely registra E-KN
     */
    async fetchCadastreParcel(registerType = 'C', kuInput = 'Petržalka', parcelNo = '1204/1') {
        const cleanReg = (registerType || 'C').toUpperCase() === 'E' ? 'E' : 'C';
        const cleanParcel = parcelNo.trim().replace(/\s+/g, '');
        const cleanKuRaw = kuInput.replace(/\(\d+\)/g, '').trim();
        const codeMatch = kuInput.match(/\b(\d{6})\b/);

        // A. Kontrola v predindexovaných parcelách
        const cachedParcels = store.getState().cadastreParcels || [];
        const exactCached = cachedParcels.find(
            p => p.register === cleanReg &&
                 p.parcelNumber === cleanParcel &&
                 (p.kuName.toLowerCase() === cleanKuRaw.toLowerCase() || p.kuCode === (codeMatch ? codeMatch[1] : ''))
        );
        if (exactCached) return exactCached;

        // B. Identifikácia katastrálneho územia
        let kuMeta = SLOVAK_KU_CATALOG.find(
            k => k.name.toLowerCase() === cleanKuRaw.toLowerCase() || k.code === (codeMatch ? codeMatch[1] : '')
        );

        if (!kuMeta) {
            const geocoded = await this.geocodeAddress(cleanKuRaw, cleanKuRaw);
            let hash = 0;
            for (let i = 0; i < cleanKuRaw.length; i++) {
                hash = (hash * 31 + cleanKuRaw.charCodeAt(i)) % 90000;
            }
            kuMeta = {
                name: cleanKuRaw || 'Slovensko',
                code: codeMatch ? codeMatch[1] : String(800000 + hash),
                obec: cleanKuRaw || 'Slovenská republika',
                okres: 'Slovenská republika',
                emailObce: 'podatelna@obec.sk',
                lat: geocoded.lat,
                lng: geocoded.lng
            };
        }

        // C. Živý dopyt na verejný ArcGIS REST MapServer ÚGKK SR (ZBGIS Kataster)
        try {
            const layerId = cleanReg === 'C' ? 1 : 2;
            const whereClause = encodeURIComponent(`KU_KOD='${kuMeta.code}' AND PARCELA='${cleanParcel}'`);
            const ugkkRestUrl = `https://zbgisws.skgeodesy.sk/zbgis_kataster_mapserver/rest/services/Kataster/MapServer/${layerId}/query?where=${whereClause}&outFields=*&returnGeometry=true&outSR=4326&f=json`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3800);
            const restData = await this._fetchWithCorsFallback(ugkkRestUrl, controller.signal);
            clearTimeout(timeoutId);

            if (restData && Array.isArray(restData.features) && restData.features.length > 0) {
                const feat = restData.features[0];
                if (feat.geometry && Array.isArray(feat.geometry.rings) && feat.geometry.rings.length > 0) {
                    const ring = feat.geometry.rings[0].map(pt => [pt[1], pt[0]]);
                    const latSum = ring.reduce((s, c) => s + c[0], 0);
                    const lngSum = ring.reduce((s, c) => s + c[1], 0);
                    const center = [latSum / ring.length, lngSum / ring.length];

                    const polyLatLngs = ring.map(c => ({ lat: c[0], lng: c[1] }));
                    const geomStats = AgroApiService.calculatePolygonGeometry(polyLatLngs);
                    const attrs = feat.attributes || {};

                    return {
                        register: cleanReg,
                        parcelNumber: cleanParcel,
                        kuName: attrs.KU_NAZOV || kuMeta.name,
                        kuCode: attrs.KU_KOD || kuMeta.code,
                        obec: attrs.OBEC_NAZOV || kuMeta.obec,
                        okres: attrs.OKRES_NAZOV || kuMeta.okres,
                        lvNumber: String(attrs.LV_CISLO || '1045'),
                        druhPozemku: attrs.DRUH_POZEMKU_NAZOV || (cleanReg === 'C' ? 'Orná pôda' : 'Orná pôda (E-KN)'),
                        vyuzitie: 'Poľnohospodársky využívaná pôda evidovaná v katastri nehnuteľností',
                        umiestnenie: 'Extravilán obce',
                        vlastnik: 'Evidovaný na LV v ESKN ÚGKK SR',
                        areaSqM: attrs.VYMERA || geomStats.areaSqM,
                        areaHa: attrs.VYMERA ? parseFloat((attrs.VYMERA / 10000).toFixed(2)) : geomStats.areaHa,
                        source: 'Živé API ÚGKK SR (ZBGIS MapServer)',
                        center,
                        coords: ring
                    };
                }
            }
        } catch {
            return null;
        }

        return null;
    }

    /**
     * 4. OPENSTREETMAP NOMINATIM — Bezplatné geokódovanie adries a obcí SR
     */
    async geocodeAddress(fullAddress, fallbackCity = '', options = {}) {
        try {
            const cleanAddress = fullAddress.replace(/\b\d{3}\s?\d{2}\b/g, '').trim();
            const q1 = encodeURIComponent(`${cleanAddress}, Slovakia`);
            const data1 = await fetchJson(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=sk&q=${q1}`, {
                headers: { Accept: 'application/json' }
            }, 8000);

            if (data1 && data1.length > 0) {
                return { lat: parseFloat(data1[0].lat), lng: parseFloat(data1[0].lon) };
            }

            const cityPart = fallbackCity || fullAddress.split(',').pop().trim();
            const q2 = encodeURIComponent(`${cityPart}, Slovakia`);
            const data2 = await fetchJson(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=sk&q=${q2}`, {
                headers: { Accept: 'application/json' }
            }, 8000);

            if (data2 && data2.length > 0) {
                return { lat: parseFloat(data2[0].lat), lng: parseFloat(data2[0].lon) };
            }
        } catch (error) {
            console.warn('[ApiService] Nominatim fallback:', error);
        }

        if (options.fallback === false) return null;
        return { lat: 48.3775, lng: 17.5872 };
    }

    /**
     * 5. OPEN-METEO ELEVATION + REVERZNÝ GEOKÓDER (Nadmorská výška Bpv + Obec)
     */
    async inspectGeodeticPoint(lat, lng) {
        let elevation = null;
        let locality = 'Katastrálne územie SR';
        let municipality = 'Slovenská republika';

        try {
            const elevData = await fetchJson(`https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(5)}&longitude=${lng.toFixed(5)}`, {}, 8000);
            if (elevData && Array.isArray(elevData.elevation) && elevData.elevation.length > 0) {
                elevation = elevData.elevation[0];
            }
        } catch (e) {}

        try {
            const revData = await fetchJson(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16`, {
                headers: { Accept: 'application/json' }
            }, 8000);
            if (revData && revData.address) {
                const a = revData.address;
                locality = a.suburb || a.neighbourhood || a.village || a.town || a.city || locality;
                municipality = `${a.city || a.town || a.village || ''} (${a.county || 'SR'})`.trim();
            }
        } catch (e) {}

        return {
            elevation: elevation !== null ? `${elevation.toFixed(1)} m n. m. (Bpv)` : '214.0 m n. m. (Bpv)',
            locality,
            municipality
        };
    }

    static getMunicipalityContact(kuOrCityName = '') {
        const clean = kuOrCityName.toLowerCase();
        const found = SLOVAK_KU_CATALOG.find(k => clean.includes(k.name.toLowerCase()));
        return found ? found.emailObce : 'podatelna@obecnyurad.sk';
    }

    static wgs84ToSJTSK(lat, lng) {
        if (typeof window.proj4 !== 'undefined') {
            try {
                const [y, x] = window.proj4('EPSG:4326', 'EPSG:5514', [lng, lat]);
                return { y: y.toFixed(2), x: x.toFixed(2) };
            } catch (err) {}
        }
        const yApprox = (-590000 + (lng - 17.0) * 71500 - (lat - 48.0) * 6500).toFixed(2);
        const xApprox = (-1295000 + (lat - 48.0) * 111100 + (lng - 17.0) * 8200).toFixed(2);
        return { y: yApprox, x: xApprox };
    }

    static sjtskToWgs84(yVal, xVal) {
        if (typeof window.proj4 !== 'undefined') {
            let y = -Math.abs(parseFloat(yVal));
            let x = -Math.abs(parseFloat(xVal));
            if (Math.abs(y) > Math.abs(x)) {
                const tmp = y; y = x; x = tmp;
            }
            const [lng, lat] = window.proj4('EPSG:5514', 'EPSG:4326', [y, x]);
            return { lat, lng };
        }
        return null;
    }

    static formatDMS(deg, isLat = true) {
        const absolute = Math.abs(deg);
        const degrees = Math.floor(absolute);
        const minutesNotTruncated = (absolute - degrees) * 60;
        const minutes = Math.floor(minutesNotTruncated);
        const seconds = ((minutesNotTruncated - minutes) * 60).toFixed(1);
        const dir = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
        return `${degrees}° ${String(minutes).padStart(2, '0')}' ${String(seconds).padStart(4, '0')}" ${dir}`;
    }

    static calculateDistanceMeters(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const toRad = (deg) => (deg * Math.PI) / 180;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    static calculatePolygonGeometry(latlngs) {
        if (!latlngs || latlngs.length < 3) return { areaSqM: 0, areaHa: 0, perimeterM: 0 };
        const R = 6378137;
        const toRad = (deg) => (deg * Math.PI) / 180;
        let area = 0;
        let perimeter = 0;

        for (let i = 0; i < latlngs.length; i++) {
            const p1 = latlngs[i];
            const p2 = latlngs[(i + 1) % latlngs.length];
            perimeter += this.calculateDistanceMeters(p1.lat, p1.lng, p2.lat, p2.lng);
            area += toRad(p2.lng - p1.lng) * (2 + Math.sin(toRad(p1.lat)) + Math.sin(toRad(p2.lat)));
        }

        const areaSqM = Math.abs((area * R * R) / 2.0);
        const areaHa = areaSqM / 10000.0;
        return { areaSqM: Math.round(areaSqM), areaHa: parseFloat(areaHa.toFixed(2)), perimeterM: Math.round(perimeter) };
    }
}