import { store } from '../core/state-store.js';
import { AgroApiService } from '../services/api.js';
import { escapeHtml } from './saas-shell.js';

const VARROA_KEY = 'vcely_varroa_v1';
const SPRAY_KEY = 'vcely_spray_book_v1';
let radarTimer = 0;
let radarCircle = null;
let weatherToken = 0;

function readList(key) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function sprayLevel(temp, wind) {
    const beeActive = temp >= 12;
    if (wind > 5 || (beeActive && wind > 4 && temp >= 20)) return 'banned';
    if (wind > 3 || temp > 25 || temp < 5 || (beeActive && wind > 3)) return 'caution';
    return 'safe';
}

function mapCenter() {
    const map = window.agrogisMap?.map;
    if (!map) return { lat: 48.35, lng: 17.75 };
    const center = map.getCenter();
    return { lat: center.lat, lng: center.lng };
}

function distanceMeters(lat, lng, otherLat, otherLng) {
    return AgroApiService.calculateDistanceMeters(lat, lng, otherLat, otherLng);
}

function hivesNear(lat, lng, radius = 3000) {
    return (store.getState().hives || [])
        .map((hive) => ({
            hive,
            meters: distanceMeters(lat, lng, Number(hive.lat), Number(hive.lng))
        }))
        .filter((row) => Number.isFinite(row.meters) && row.meters <= radius)
        .sort((a, b) => a.meters - b.meters);
}

function parcelsNear(lat, lng, radius = 3000) {
    return (store.getState().lpisParcels || []).filter((parcel) => {
        const center = Array.isArray(parcel.center) ? parcel.center : null;
        if (!center) return false;
        return distanceMeters(lat, lng, Number(center[0]), Number(center[1])) <= radius;
    });
}

function shortCrop(crop) {
    const text = String(crop || 'Iná plodina');
    if (/repk/i.test(text)) return 'Repka';
    if (/agát|agat/i.test(text)) return 'Agát';
    if (/lip/i.test(text)) return 'Lipa';
    if (/slnečnic|slnecnic/i.test(text)) return 'Slnečnica';
    if (/pšenic|psenic/i.test(text)) return 'Pšenica';
    if (/kukuric/i.test(text)) return 'Kukurica';
    if (/horčic|horcic|sad/i.test(text)) return 'Sad / horčica';
    return text.split('(')[0].trim().slice(0, 22);
}

function ecoScore(state) {
    let score = 98;
    score -= Math.min((state.sprayAlerts || []).length * 4, 24);
    const varroa = readList(VARROA_KEY);
    const latest = varroa[0];
    if (latest && Number(latest.drop) > 10) score -= 12;
    else if (latest && Number(latest.drop) > 3) score -= 4;
    const user = state.currentUser;
    if (user && !user.ico && !user.cevz) score -= 8;
    if (!user) score -= 6;
    return Math.max(40, Math.min(100, score));
}

function paintScore(state) {
    const score = ecoScore(state);
    const badge = document.getElementById('eco-score-badge');
    const verified = document.getElementById('eco-verified-badge');
    const certificate = score >= 90 ? 'Zelený certifikát' : score >= 70 ? 'Žltý certifikát' : 'Červený certifikát';
    if (badge) {
        badge.classList.toggle('is-caution', score < 90 && score >= 70);
        badge.classList.toggle('is-risk', score < 70);
        badge.innerHTML = `<b>Eko-Skóre: ${score}/100</b><small>${certificate}</small>`;
    }
    const user = state.currentUser;
    if (verified) {
        const ok = Boolean(user && (user.ico || user.cevz || user.isVerified));
        verified.textContent = ok ? '✓ Overený v RÚZ & CEVZ' : 'Čaká na overenie v RÚZ';
    }
}

function paintNectar(state) {
    const host = document.getElementById('eco-nectar-bars');
    const indexEl = document.getElementById('eco-nectar-index');
    if (!host) return;
    const here = mapCenter();
    const source = parcelsNear(here.lat, here.lng);
    if (!source.length) {
        host.innerHTML = '<p class="eco-widget-note">V 3 km nie sú evidované LPIS bloky.</p>';
        if (indexEl) indexEl.textContent = 'Aktivita včiel: bez dát · 0 blokov v dosahu';
        return;
    }
    const totals = new Map();
    let area = 0;
    source.forEach((parcel) => {
        const name = shortCrop(parcel.crop);
        const ha = Number(parcel.areaHa || 0);
        totals.set(name, (totals.get(name) || 0) + ha);
        area += ha;
    });
    const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const max = rows[0]?.[1] || 1;
    host.innerHTML = rows.map(([name, ha]) => {
        const pct = Math.round((ha / (area || ha)) * 100);
        const width = Math.max(8, Math.round((ha / max) * 100));
        return `<div class="eco-bar-row"><b>${escapeHtml(name)}</b><div class="eco-bar-track"><i style="width:${width}%"></i></div><span>${pct}%</span></div>`;
    }).join('');
    const beeCrops = rows.filter(([name]) => /Repka|Agát|Lipa|Sad|Slnečnica/.test(name));
    const strength = Math.min(10, Math.round((beeCrops.reduce((sum, row) => sum + row[1], 0) / Math.max(area, 1)) * 10 + 2));
    const label = strength >= 7 ? 'Vysoká' : strength >= 4 ? 'Stredná' : 'Nízka';
    if (indexEl) indexEl.textContent = `Aktivita včiel: ${label} (${strength.toFixed(1)}) · ${source.length} blokov v dosahu`;
}

function paintHealth(state) {
    const guardian = document.getElementById('eco-guardian-status');
    const varroaEl = document.getElementById('eco-varroa-status');
    const user = state.currentUser;
    const phoneOn = Boolean(user?.phone);
    if (guardian) {
        guardian.className = `eco-shield-line ${phoneOn ? '' : 'is-caution'}`;
        guardian.innerHTML = `SMS/Push výstrahy: <strong>${phoneOn ? 'AKTÍVNE' : 'DOPLŇTE TELEFÓN'}</strong>`;
    }
    const latest = readList(VARROA_KEY)[0];
    if (!varroaEl) return;
    if (!latest) {
        varroaEl.className = 'eco-shield-line';
        varroaEl.innerHTML = 'Varroa check: <strong>V poriadku</strong>';
        return;
    }
    const drop = Number(latest.drop || 0);
    const tone = drop > 10 ? 'is-risk' : drop > 3 ? 'is-caution' : '';
    const label = drop > 10 ? 'Kritický spad' : drop > 3 ? 'Zvýšený spad' : 'V poriadku';
    varroaEl.className = `eco-shield-line ${tone}`;
    varroaEl.innerHTML = `Varroa check: <strong>${label}</strong> · ${escapeHtml(latest.site || 'stanovište')} ${escapeHtml(String(drop))}/24 h`;
}

function paintWeatherChart(hours) {
    const host = document.getElementById('eco-weather-chart');
    const caption = document.getElementById('eco-weather-caption');
    if (!host) return;
    const temps = hours.map((row) => row.temp);
    const min = Math.min(...temps);
    const max = Math.max(...temps);
    const span = Math.max(1, max - min);
    host.innerHTML = hours.map((row, index) => {
        const height = 28 + Math.round(((row.temp - min) / span) * 64);
        const label = index % 4 === 0 ? `<i>${row.hour}</i>` : '';
        return `<span data-level="${row.level}" style="height:${height}px" title="${row.hour} ${row.temp.toFixed(1)}°C · ${row.wind.toFixed(1)} m/s">${label}</span>`;
    }).join('');
    const safe = hours.filter((row) => row.level === 'safe').length;
    if (caption) {
        caption.textContent = safe
            ? `${safe} hodín v bezpečnom okne · Open-Meteo, stred mapy`
            : 'V najbližších 24 h nie je bezpečné okno postreku';
    }
}

async function loadWeather() {
    const token = ++weatherToken;
    const here = mapCenter();
    const caption = document.getElementById('eco-weather-caption');
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${here.lat.toFixed(4)}&longitude=${here.lng.toFixed(4)}&hourly=temperature_2m,wind_speed_10m&wind_speed_unit=ms&forecast_hours=24&timezone=Europe%2FBratislava`;
        const response = await fetch(url);
        const data = await response.json();
        const times = data?.hourly?.time || [];
        const temps = data?.hourly?.temperature_2m || [];
        const winds = data?.hourly?.wind_speed_10m || [];
        if (!times.length) throw new Error('empty hourly');
        const hours = times.slice(0, 24).map((stamp, index) => {
            const temp = Number(temps[index]);
            const wind = Number(winds[index]);
            const date = new Date(stamp);
            return {
                hour: `${String(date.getHours()).padStart(2, '0')}`,
                temp,
                wind,
                level: sprayLevel(temp, wind)
            };
        });
        if (token !== weatherToken) return;
        paintWeatherChart(hours);
    } catch (error) {
        if (caption) caption.textContent = 'Open-Meteo teraz neodpovedá. Graf sa doplní pri ďalšom otvorení.';
    }
}

function paintCommandCenter() {
    const modal = document.getElementById('user-dashboard-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    const state = store.getState();
    paintScore(state);
    paintNectar(state);
    paintHealth(state);
}

function stripDiacritics(value) {
    return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function pdfEscape(value) {
    const ascii = stripDiacritics(value).replace(/[^\x20-\x7E]/g, ' ');
    return ascii.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildReportPdf(lines) {
    const commands = ['BT', '/F1 11 Tf', '40 800 Td', '14 TL'];
    lines.slice(0, 48).forEach((line, index) => {
        const text = pdfEscape(line);
        commands.push(index === 0 ? `(${text}) Tj` : `T* (${text}) Tj`);
    });
    commands.push('ET');
    const stream = commands.join('\n');
    const streamLength = new TextEncoder().encode(stream).length;
    const objects = [
        '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
        '2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj',
        '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
        `4 0 obj << /Length ${streamLength} >> stream\n${stream}\nendstream endobj`,
        '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj'
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object) => {
        offsets.push(pdf.length);
        pdf += object + '\n';
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    offsets.slice(1).forEach((offset) => {
        pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    });
    pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return pdf;
}

function exportOfficialReport() {
    const state = store.getState();
    const user = state.currentUser;
    const score = ecoScore(state);
    const certificate = score >= 90 ? 'Zeleny certifikat' : score >= 70 ? 'Zluty certifikat' : 'Cerveny certifikat';
    const here = mapCenter();
    const nearHives = hivesNear(here.lat, here.lng);
    const nearParcels = parcelsNear(here.lat, here.lng);
    const sprays = readList(SPRAY_KEY);
    const lines = [
        'Vcely a poda - uradny vykaz pre UKSUP / CEVZ',
        `Subjekt: ${user?.name || 'Neprihlaseny pouzivatel'}`,
        `Kod: ${user?.ico || user?.cevz || '-'}`,
        `Eko-skore: ${score}/100 (${certificate})`,
        `Overenie: ${(user?.ico || user?.cevz) ? 'RUZ & CEVZ' : 'caka na overenie'}`,
        `Mapa: ${here.lat.toFixed(5)}, ${here.lng.toFixed(5)}`,
        `LPIS v 3 km: ${nearParcels.length}`,
        `Vcelnice v 3 km: ${nearHives.length}`,
        ''
    ];
    nearParcels.forEach((parcel) => {
        lines.push(`LPIS ${parcel.id} | ${parcel.crop || ''} | ${parcel.areaHa || 0} ha`);
    });
    nearHives.forEach((row) => {
        lines.push(`CEVZ ${row.hive.cevz || ''} | ${row.hive.name} | ${(row.meters / 1000).toFixed(2)} km`);
    });
    sprays.slice(0, 12).forEach((row) => {
        lines.push(`Postrek ${row.when || ''} | ${row.parcel || ''} | ${row.product || ''} | ${row.toxicity || ''}`);
    });
    const blob = new Blob([buildReportPdf(lines)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'vykaz-uksup-cevz.pdf';
    anchor.click();
    URL.revokeObjectURL(url);
    window.showToast?.('Úradný výkaz PDF je pripravený', 'success');
}

function startCollisionSimulation() {
    window.closeUserDashboardModal?.();
    window.toggleSpraySimulation?.();
    document.body.classList.add('eco-radar-live');
    clearTimeout(radarTimer);
    radarTimer = window.setTimeout(() => {
        document.body.classList.remove('eco-radar-live');
        const liveMap = window.agrogisMap?.map;
        if (radarCircle && liveMap) liveMap.removeLayer(radarCircle);
        radarCircle = null;
    }, 8000);
    const map = window.agrogisMap?.map;
    if (!map || !window.L) return;
    const center = map.getCenter();
    if (radarCircle) map.removeLayer(radarCircle);
    radarCircle = window.L.circle(center, {
        radius: 3000,
        color: '#F59E0B',
        weight: 2,
        dashArray: '6, 8',
        fillColor: '#F59E0B',
        fillOpacity: 0.18,
        className: 'eco-radar-ring',
        interactive: false
    }).addTo(map);
}

function selectedSprayPoint() {
    const pick = document.getElementById('spray-parcel-pick');
    const value = pick?.value || '';
    const state = store.getState();
    const parcel = (state.lpisParcels || []).find((item) => item.id === value);
    if (parcel?.center) return { lat: Number(parcel.center[0]), lng: Number(parcel.center[1]), label: parcel.id };
    const active = state.activeCadastreParcel;
    if (active?.center && value === `KN-${active.register} ${active.parcelNumber}`) {
        return { lat: Number(active.center[0]), lng: Number(active.center[1]), label: value };
    }
    const here = mapCenter();
    return { lat: here.lat, lng: here.lng, label: 'stred mapy' };
}

function syncSprayParcelFields() {
    const pick = document.getElementById('spray-parcel-pick');
    const parcelInput = document.getElementById('spray-parcel');
    const areaInput = document.getElementById('spray-area');
    if (!pick) return;
    const state = store.getState();
    const chosen = (state.lpisParcels || []).find((item) => item.id === pick.value);
    const active = state.activeCadastreParcel;
    const knLabel = active?.parcelNumber ? `KN-${active.register} ${active.parcelNumber}` : '';
    if (parcelInput && pick.value) parcelInput.value = pick.value;
    if (!areaInput) return;
    if (chosen) {
        areaInput.value = Number(chosen.areaHa || 0).toFixed(2);
        return;
    }
    if (active && pick.value === knLabel) {
        areaInput.value = Number.isFinite(Number(active.areaHa)) ? Number(active.areaHa).toFixed(2) : '';
    }
}

function fillSprayParcels() {
    const pick = document.getElementById('spray-parcel-pick');
    if (!pick) return;
    const previous = pick.value;
    const state = store.getState();
    const options = [];
    (state.lpisParcels || []).forEach((parcel) => {
        const id = escapeHtml(parcel.id);
        const crop = escapeHtml(shortCrop(parcel.crop));
        options.push(`<option value="${id}">${id} · ${crop} · ${Number(parcel.areaHa || 0).toFixed(1)} ha</option>`);
    });
    const active = state.activeCadastreParcel;
    if (active?.parcelNumber) {
        const label = escapeHtml(`KN-${active.register} ${active.parcelNumber}`);
        const kuName = escapeHtml(active.kuName || 'kataster');
        options.unshift(`<option value="${label}">${label} · ${kuName}</option>`);
    }
    if (!options.length) options.push('<option value="">Stred mapy</option>');
    pick.innerHTML = options.join('');
    if (previous && [...pick.options].some((option) => option.value === previous)) pick.value = previous;
    syncSprayParcelFields();
}

function paintSprayRadar() {
    const host = document.getElementById('spray-collision-radar');
    const button = document.getElementById('spray-alert-beekeepers');
    if (!host) return;
    const point = selectedSprayPoint();
    const rows = hivesNear(point.lat, point.lng);
    const colonies = rows.reduce((sum, row) => sum + Number(row.hive.count || 0), 0);
    const sites = rows.length === 1 ? 'stanovište' : rows.length < 5 ? 'stanovištia' : 'stanovíšť';
    const list = rows.length
        ? `<ul>${rows.map((row) => `<li>🐝 ${escapeHtml(row.hive.name)} (${escapeHtml(String(row.hive.count))} rodín) · ${(row.meters / 1000).toFixed(2)} km</li>`).join('')}</ul>`
        : '<p class="eco-radar-ok">V okruhu 3 km nie je evidovaná včelnica.</p>';
    host.innerHTML = `
        <b>Automatický radar kolízií (3 km)</b>
        <p class="${rows.length ? 'eco-radar-hot' : 'eco-radar-ok'}">Zasiahnuté včelnice v 3 km pásme: ${rows.length} ${sites} (${colonies} rodín) · ${escapeHtml(point.label)}</p>
        ${list}
    `;
    if (button) button.textContent = `Odoslať výstrahu včelárom (${rows.length})`;
}

function sendSprayAlerts() {
    const point = selectedSprayPoint();
    const rows = hivesNear(point.lat, point.lng);
    const colonies = rows.reduce((sum, row) => sum + Number(row.hive.count || 0), 0);
    store.setState({
        lastCollisionReport: {
            timestamp: new Date().toLocaleString('sk-SK'),
            lat: point.lat,
            lng: point.lng,
            contextLabel: point.label,
            collisions: rows.map((row) => ({
                hive_id: row.hive.id,
                hive_name: row.hive.name,
                hive_count: Number(row.hive.count) || 0,
                hive_email: row.hive.email,
                lat: row.hive.lat,
                lng: row.hive.lng,
                distance_meters: row.meters
            }))
        }
    });
    if (!rows.length) {
        window.showToast?.('V 3 km nie je komu poslať výstrahu', 'info');
        return;
    }
    window.triggerSprayAlertEmails?.(point.lat, point.lng, rows.length, colonies);
}

function hivePoint() {
    const raw = document.getElementById('modal-hive-coords')?.value || '';
    const match = raw.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (match) return { lat: Number(match[1]), lng: Number(match[2]) };
    return mapCenter();
}

function paintHiveAnalysis() {
    const host = document.getElementById('hive-range-analysis');
    const badge = document.getElementById('hive-lock-badge');
    if (badge) badge.hidden = false;
    if (!host) return;
    const point = hivePoint();
    const blocks = parcelsNear(point.lat, point.lng);
    const area = blocks.reduce((sum, parcel) => sum + Number(parcel.areaHa || 0), 0);
    const alerts = (store.getState().sprayAlerts || []).filter((alert) => {
        if (!Number.isFinite(Number(alert.lat)) || !Number.isFinite(Number(alert.lng))) return false;
        return distanceMeters(point.lat, point.lng, Number(alert.lat), Number(alert.lng)) <= 3000;
    });
    const sprayText = alerts.length ? `${alerts.length} hlásení postreku v pásme` : 'Aktuálne bez hlásených postrekov';
    const blockWord = blocks.length === 1 ? 'pôdny blok' : blocks.length < 5 ? 'pôdne bloky' : 'pôdnych blokov';
    host.innerHTML = `
        <b>Analýza 3 km doletového pásma</b>
        <p class="${alerts.length ? 'eco-radar-hot' : 'eco-radar-ok'}">${blocks.length} ${blockWord} LPIS (${area.toFixed(0)} ha) · ${sprayText}</p>
    `;
}

function reflectChoice(rootId, attribute, hiddenId) {
    const box = document.getElementById(rootId);
    const hidden = document.getElementById(hiddenId);
    if (!box || !hidden) return;
    box.querySelectorAll('button').forEach((button) => {
        button.classList.toggle('is-on', button.getAttribute(attribute) === hidden.value);
    });
}

function syncSprayChoicePills() {
    reflectChoice('spray-window-picks', 'data-window', 'spray-window-value');
    reflectChoice('spray-toxicity', 'data-tox', 'spray-toxicity-value');
}

function refreshSprayCollisionRadar() {
    const pick = document.getElementById('spray-parcel-pick');
    const parcelInput = document.getElementById('spray-parcel');
    const areaInput = document.getElementById('spray-area');
    if (pick) pick.selectedIndex = -1;
    if (parcelInput) parcelInput.value = '';
    if (areaInput) areaInput.value = '';
    paintSprayRadar();
}

function bindChoices(root, attribute, hiddenId) {
    const box = document.getElementById(root);
    const hidden = document.getElementById(hiddenId);
    if (!box || box.dataset.bound === 'true') return;
    box.dataset.bound = 'true';
    box.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button || !box.contains(button)) return;
        box.querySelectorAll('button').forEach((item) => item.classList.remove('is-on'));
        button.classList.add('is-on');
        if (hidden) hidden.value = button.getAttribute(attribute) || '';
        if (root === 'hive-nectar-picks' && hidden) {
            const selected = [...box.querySelectorAll('button.is-on')].map((item) => item.getAttribute('data-nectar'));
            hidden.value = selected.join(', ');
        }
    });
}

function bindNectar() {
    const box = document.getElementById('hive-nectar-picks');
    const hidden = document.getElementById('hive-nectar-tags');
    if (!box || box.dataset.bound === 'true') return;
    box.dataset.bound = 'true';
    box.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        button.classList.toggle('is-on');
        if (hidden) {
            hidden.value = [...box.querySelectorAll('button.is-on')].map((item) => item.getAttribute('data-nectar')).join(', ');
        }
    });
}

function stepColonies(delta) {
    const input = document.getElementById('modal-hive-count');
    if (!input) return;
    const next = Math.min(500, Math.max(1, Number(input.value || 1) + delta));
    input.value = String(next);
}

function aimHiveGps() {
    if (!navigator.geolocation) {
        window.showToast?.('GPS nie je podporované v tomto prehliadači', 'warning');
        return;
    }
    navigator.geolocation.getCurrentPosition(
        (position) => {
            window.retargetHiveCoordinates?.(position.coords.latitude, position.coords.longitude);
            paintHiveAnalysis();
            window.showToast?.('Včelnica je zameraná podľa GPS', 'success');
        },
        () => window.showToast?.('Nepodarilo sa načítať GPS polohu', 'warning')
    );
}

function onDashboardOpen() {
    paintCommandCenter();
    loadWeather();
}

function onSprayOpen() {
    fillSprayParcels();
    paintSprayRadar();
}

function onHiveOpen() {
    paintHiveAnalysis();
}

export function bindEcosystemCenter() {
    if (document.body.dataset.ecosystemBound === 'true') return;
    document.body.dataset.ecosystemBound = 'true';

    document.getElementById('eco-export-pdf')?.addEventListener('click', exportOfficialReport);
    document.getElementById('eco-collision-sim')?.addEventListener('click', startCollisionSimulation);
    document.getElementById('spray-alert-beekeepers')?.addEventListener('click', sendSprayAlerts);
    document.getElementById('spray-parcel-pick')?.addEventListener('change', () => {
        syncSprayParcelFields();
        paintSprayRadar();
    });
    document.getElementById('hive-count-minus')?.addEventListener('click', () => stepColonies(-1));
    document.getElementById('hive-count-plus')?.addEventListener('click', () => stepColonies(1));
    document.getElementById('hive-gps-btn')?.addEventListener('click', aimHiveGps);
    document.getElementById('hive-activate-zone')?.addEventListener('click', () => {
        window.confirmAddHive?.();
    });

    window.syncSprayChoicePills = syncSprayChoicePills;
    window.refreshSprayCollisionRadar = refreshSprayCollisionRadar;
    bindChoices('spray-window-picks', 'data-window', 'spray-window-value');
    bindChoices('spray-toxicity', 'data-tox', 'spray-toxicity-value');
    bindChoices('hive-site-picks', 'data-site', 'hive-site-type');
    bindNectar();

    const wrap = (name, after) => {
        const current = window[name];
        if (typeof current !== 'function' || current.__ecosystemWrapped) return;
        const wrapped = function ecosystemWrapped(...args) {
            const result = current.apply(this, args);
            after();
            return result;
        };
        wrapped.__ecosystemWrapped = true;
        window[name] = wrapped;
    };
    wrap('openUserDashboardModal', onDashboardOpen);
    wrap('openSprayBook', onSprayOpen);
    wrap('openHiveModal', onHiveOpen);

    store.subscribe(() => {
        paintCommandCenter();
        const spray = document.getElementById('spray-book-modal');
        if (spray && !spray.classList.contains('hidden')) paintSprayRadar();
        const hive = document.getElementById('hive-modal');
        if (hive && !hive.classList.contains('hidden')) paintHiveAnalysis();
    });
}
