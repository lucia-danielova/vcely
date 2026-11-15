import { store } from '../core/state-store.js';
import { AgroApiService } from '../services/api.js';
import { fetchJson } from '../services/backend-api.js';
import { escapeHtml } from './saas-shell.js';

const VARROA_KEY = 'vcely_varroa_v1';
const SPRAY_KEY = 'vcely_spray_book_v1';
const ONBOARD_KEY = 'vcely_onboarded_emails_v1';
const SHIELD_KEY = 'vcely_shield_active_v1';
let radarTimer = 0;
let radarCircle = null;
let weatherToken = 0;
let lastWeatherHours = [];
let lastWind = { speed: null, fromDeg: null, from: '', to: '', raining: false };

function readList(key) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function readEmailSet(key) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function isOnboarded(email) {
    if (!email) return false;
    return readEmailSet(ONBOARD_KEY).includes(String(email).toLowerCase());
}

function markOnboarded(email) {
    if (!email) return;
    const list = readEmailSet(ONBOARD_KEY);
    const clean = String(email).toLowerCase();
    if (!list.includes(clean)) {
        list.push(clean);
        localStorage.setItem(ONBOARD_KEY, JSON.stringify(list));
    }
}

function isBeeRole(role) {
    return ['BEEKEEPER', 'BEE_HOBBY', 'BEE_BEGINNER', 'BEE_PRO'].includes(role);
}

function isAgroRole(role) {
    return ['AGRO', 'AGRO_PRO', 'GARDENER', 'GARDEN_NEW', 'AGRO_HOBBY'].includes(role);
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

function ownedParcels(state) {
    const userIco = state.currentUser?.ico || '';
    return (state.lpisParcels || []).filter((parcel) => userIco && parcel.ownerIco === userIco);
}

function ownedHives(state) {
    const user = state.currentUser;
    const hives = state.hives || [];
    if (!user) return [];
    const code = String(user.cevz || user.ico || '').trim();
    const email = String(user.email || '').trim().toLowerCase();
    const named = hives.filter((hive) => {
        const hiveCevz = String(hive.cevz || '').trim();
        const hiveEmail = String(hive.email || '').trim().toLowerCase();
        return (code && hiveCevz && hiveCevz === code) || (email && hiveEmail && hiveEmail === email);
    });
    if (named.length) return named;
    if (isBeeRole(user.role) && user.profileLocation) return hives;
    return named;
}

function scanOrigin(state = store.getState()) {
    const user = state.currentUser;
    if (user?.ico) {
        const entity = (state.entities || []).find((row) => String(row.ico) === String(user.ico));
        if (entity && Number.isFinite(Number(entity.lat)) && Number.isFinite(Number(entity.lng))) {
            return { lat: Number(entity.lat), lng: Number(entity.lng), source: `IČO ${user.ico}` };
        }
        const parcel = ownedParcels(state).find((row) => Array.isArray(row.center));
        if (parcel) {
            return { lat: Number(parcel.center[0]), lng: Number(parcel.center[1]), source: `LPIS ${parcel.id}` };
        }
    }
    const loc = user?.profileLocation;
    if (loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng))) {
        return { lat: Number(loc.lat), lng: Number(loc.lng), source: 'lokalita účtu' };
    }
    const hive = ownedHives(state)[0] || (state.hives || [])[0];
    if (hive && Number.isFinite(Number(hive.lat))) {
        return { lat: Number(hive.lat), lng: Number(hive.lng), source: hive.name || 'včelnica' };
    }
    const here = mapCenter();
    return { lat: here.lat, lng: here.lng, source: 'stred mapy' };
}

function shortCrop(crop) {
    const text = String(crop || 'Iná plodina');
    if (/repk/i.test(text)) return 'Repka';
    if (/agát|agat/i.test(text)) return 'Agát';
    if (/lip/i.test(text)) return 'Lipa';
    if (/slnečnic|slnecnic/i.test(text)) return 'Slnečnica';
    if (/pšenic|psenic/i.test(text)) return 'Pšenica';
    if (/kukuric/i.test(text)) return 'Kukurica';
    if (/lúk|luk|tráv|trav|porast/i.test(text)) return 'Lúčne porasty';
    if (/horčic|horcic|sad/i.test(text)) return 'Sad / horčica';
    return text.split('(')[0].trim().slice(0, 22);
}

function cropGlyph(name) {
    if (/Repka/.test(name)) return '🌼';
    if (/Agát/.test(name)) return '🌳';
    if (/Lipa/.test(name)) return '🌿';
    if (/Slnečnica/.test(name)) return '🌻';
    if (/Lúčne|Pšenica/.test(name)) return '🌾';
    if (/Kukurica/.test(name)) return '🌽';
    if (/Sad/.test(name)) return '🍎';
    return '🌱';
}

function bloomFactor(name, month) {
    if (/Repka/.test(name)) return month === 4 || month === 5 ? 0.95 : month === 3 ? 0.35 : 0.08;
    if (/Agát/.test(name)) return month === 5 || month === 6 ? 0.9 : month === 4 ? 0.25 : 0.06;
    if (/Lipa/.test(name)) return month === 6 || month === 7 ? 0.85 : 0.08;
    if (/Slnečnica/.test(name)) return month === 7 || month === 8 ? 0.88 : month === 6 ? 0.3 : 0.07;
    if (/Lúčne|Sad/.test(name)) return month >= 5 && month <= 9 ? 0.7 : 0.18;
    return month >= 4 && month <= 8 ? 0.22 : 0.1;
}

function windCardinal(degrees) {
    const value = Number(degrees);
    if (!Number.isFinite(value)) return '';
    const names = ['sever', 'severovýchod', 'východ', 'juhovýchod', 'juh', 'juhozápad', 'západ', 'severozápad'];
    return names[Math.round(value / 45) % 8];
}

function windShort(degrees) {
    const value = Number(degrees);
    if (!Number.isFinite(value)) return '';
    const names = ['S', 'SV', 'V', 'JV', 'J', 'JZ', 'Z', 'SZ'];
    return names[Math.round(value / 45) % 8];
}

function todayStamp() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

function riskyDaySprays() {
    const today = todayStamp();
    return readList(SPRAY_KEY).filter((row) => {
        const when = String(row.when || '');
        if (!when.startsWith(today)) return false;
        const hour = Number((when.match(/T(\d{2})/) || [])[1]);
        const dayWindow = row.sprayWindow === 'day' || (Number.isFinite(hour) && hour >= 7 && hour < 19);
        return dayWindow || row.toxicity === 'risk' || Number(row.windMs) > 5;
    });
}

function shieldActive(state) {
    if (localStorage.getItem(SHIELD_KEY) === '1') return true;
    const origin = scanOrigin(state);
    const nearHives = hivesNear(origin.lat, origin.lng);
    return Boolean(state.isHiveRadiiVisible && nearHives.length);
}

function ecoScore(state) {
    let score = 100;
    const user = state.currentUser;
    if (shieldActive(state)) score -= 2;
    else score -= 18;
    if (riskyDaySprays().length) score -= 22;
    score -= Math.min((state.sprayAlerts || []).length * 3, 12);
    const varroa = readList(VARROA_KEY);
    const latest = varroa[0];
    if (latest && Number(latest.drop) > 10) score -= 12;
    else if (latest && Number(latest.drop) > 3) score -= 4;
    if (user && !user.ico && !user.cevz) score -= 8;
    if (!user) score -= 6;
    return Math.max(40, Math.min(100, Math.round(score)));
}

function certificateLabel(score) {
    if (score >= 90) return 'Zelený certifikát ochrany opeľovačov';
    if (score >= 70) return 'Žltý certifikát opatrnosti';
    return 'Červený certifikát rizika pre opeľovače';
}

function paintScore(state) {
    const score = ecoScore(state);
    const badge = document.getElementById('eco-score-badge');
    const verified = document.getElementById('eco-verified-badge');
    const certificate = certificateLabel(score);
    if (badge) {
        badge.classList.toggle('is-caution', score < 90 && score >= 70);
        badge.classList.toggle('is-risk', score < 70);
        badge.innerHTML = `<b>🛡️ Eko-Skóre: ${score}/100</b><small>${certificate}</small>`;
    }
    const user = state.currentUser;
    if (verified) {
        const ok = Boolean(user && (user.ico || user.cevz || user.isVerified));
        verified.innerHTML = `<span class="eco-pulse-dot" aria-hidden="true"></span>${ok ? '✓ Overený v RÚZ & CEVZ' : 'Čaká na overenie v RÚZ'}`;
    }
}

function paintWelcome(state) {
    const text = document.getElementById('eco-welcome-text');
    if (!text) return;
    const origin = scanOrigin(state);
    const parcels = parcelsNear(origin.lat, origin.lng);
    const hives = hivesNear(origin.lat, origin.lng);
    const area = parcels.reduce((sum, parcel) => sum + Number(parcel.areaHa || 0), 0);
    const hiveWord = hives.length === 1 ? 'včelie stanovisko' : hives.length < 5 ? 'včelie stanoviská' : 'včelích stanovíšť';
    const blockWord = parcels.length === 1 ? 'pôdny blok' : parcels.length < 5 ? 'pôdne bloky' : 'pôdnych blokov';
    text.textContent = `✨ Váš ekosystém je aktívny: V okruhu 3 km sledujeme ${parcels.length} ${blockWord} LPIS (${area.toFixed(1)} ha), ${hives.length} ${hiveWord} a živú telemetriu počasia.`;
}

function checklistState(state) {
    const user = state.currentUser;
    const verified = Boolean(user && (user.ico || user.cevz || user.isVerified));
    const hasAsset = ownedParcels(state).length > 0 || ownedHives(state).length > 0 || Boolean(user?.profileLocation);
    const shield = shieldActive(state);
    return { verified, hasAsset, shield };
}

function paintChecklist(state) {
    const steps = checklistState(state);
    const done = [steps.verified, steps.hasAsset, steps.shield].filter(Boolean).length;
    const pct = Math.round((done / 3) * 100);
    const bar = document.getElementById('eco-progress-bar');
    const label = document.getElementById('eco-progress-label');
    if (bar) bar.style.width = `${pct}%`;
    if (label) label.textContent = `${pct} %`;

    const verifyBtn = document.getElementById('eco-step-verify');
    const assetBtn = document.getElementById('eco-step-asset');
    const shieldBtn = document.getElementById('eco-step-shield');
    const verifyNote = document.getElementById('eco-step-verify-note');
    const assetNote = document.getElementById('eco-step-asset-note');
    const shieldNote = document.getElementById('eco-step-shield-note');
    verifyBtn?.classList.toggle('is-done', steps.verified);
    assetBtn?.classList.toggle('is-done', steps.hasAsset);
    shieldBtn?.classList.toggle('is-done', steps.shield);
    if (verifyNote) verifyNote.textContent = steps.verified ? 'Subjekt overený v RÚZ / CEVZ' : 'Doplňte IČO alebo CEVZ v profile';
    if (assetNote) assetNote.textContent = steps.hasAsset ? 'Prvá parcela alebo včelnica je v mape' : 'Nakreslite parcelu alebo pridajte stanovište';
    if (shieldNote) shieldNote.textContent = steps.shield ? '3 km strážny štít je aktívny' : 'Zapnite ochranné pásmo a SMS/Push strážcu';
}

function paintNectar(state) {
    const host = document.getElementById('eco-nectar-bars');
    const indexEl = document.getElementById('eco-nectar-index');
    if (!host) return;
    const origin = scanOrigin(state);
    const source = parcelsNear(origin.lat, origin.lng);
    const month = new Date().getMonth() + 1;
    const hiveTags = (state.hives || [])
        .flatMap((hive) => String(hive.nectarTags || '').split(',').map((tag) => tag.trim()).filter(Boolean));
    if (!source.length && !hiveTags.length) {
        host.innerHTML = '<p class="eco-widget-note">V 3 km nie sú evidované LPIS bloky ani znáškové značky včelníc.</p>';
        if (indexEl) indexEl.textContent = 'Index opeľovacej sily v 3 km pásme: bez dát';
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
    hiveTags.forEach((tag) => {
        const name = shortCrop(tag);
        if (!totals.has(name)) totals.set(name, Math.max(1.2, area * 0.08));
    });
    const preferred = ['Repka', 'Agát', 'Slnečnica', 'Lúčne porasty', 'Lipa', 'Sad / horčica'];
    const rows = [...totals.entries()]
        .sort((a, b) => {
            const pa = preferred.indexOf(a[0]);
            const pb = preferred.indexOf(b[0]);
            if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
            return b[1] - a[1];
        })
        .slice(0, 3);
    const display = rows.length ? rows : [['Lúčne porasty', Math.max(area, 1)]];
    host.innerHTML = display.map(([name, ha]) => {
        const share = Math.round((ha / Math.max(area, ha, 1)) * 100);
        const bloom = Math.round(bloomFactor(name, month) * 100);
        const shown = Math.max(share, Math.round((share * bloom) / 100));
        const width = Math.max(8, shown);
        const label = /Repka/.test(name) ? 'Repka olejná' : /Agát/.test(name) ? 'Agát biely' : /Slnečnica/.test(name) ? 'Slnečnica / Lúčne porasty' : name;
        return `<div class="eco-bar-row"><b>${cropGlyph(name)} ${escapeHtml(label)}</b><div class="eco-bar-track"><i style="width:${width}%"></i></div><span>${bloom}%</span></div>`;
    }).join('');
    const hives = hivesNear(origin.lat, origin.lng);
    const colonies = hives.reduce((sum, row) => sum + Number(row.hive.count || 0), 0);
    const floweringHa = display.reduce((sum, [name, ha]) => sum + ha * bloomFactor(name, month), 0);
    const force = floweringHa > 0 ? colonies / floweringHa : colonies > 0 ? 8 : 0;
    const forceLabel = force >= 3 ? 'Vynikajúca' : force >= 1.5 ? 'Silná' : force >= 0.6 ? 'Stredná' : 'Nízka';
    if (indexEl) {
        indexEl.textContent = `Index opeľovacej sily v 3 km pásme: ${forceLabel} · ${force.toFixed(2)} rodín / ha kvitnúcich plodín (${colonies} rodín / ${floweringHa.toFixed(1)} ha)`;
    }
}

function paintGuardianLine(el, phoneOn, shieldOn) {
    if (!el) return;
    el.className = `eco-shield-line ${phoneOn && shieldOn ? '' : 'is-caution'}`;
    const status = phoneOn && shieldOn ? 'AKTÍVNY' : phoneOn ? 'Čaká na 3 km pásmo' : 'DOPLŇTE TELEFÓN';
    el.innerHTML = `🔔 SMS / Web Push strážca 3 km <strong>${status}</strong>`;
}

function paintHealth(state) {
    const user = state.currentUser;
    const beePanel = document.getElementById('eco-health-beekeeper');
    const agroPanel = document.getElementById('eco-health-farmer');
    const bee = isBeeRole(user?.role);
    if (beePanel) beePanel.hidden = !bee && isAgroRole(user?.role);
    if (agroPanel) agroPanel.hidden = bee;
    if (!user) {
        if (beePanel) beePanel.hidden = false;
        if (agroPanel) agroPanel.hidden = false;
    }

    const phoneOn = Boolean(user?.phone);
    const shieldOn = shieldActive(state);
    paintGuardianLine(document.getElementById('eco-guardian-status'), phoneOn, shieldOn);
    paintGuardianLine(document.getElementById('eco-guardian-status-agro'), phoneOn, shieldOn);

    const latest = readList(VARROA_KEY)[0];
    const varroaEl = document.getElementById('eco-varroa-status');
    const dateEl = document.getElementById('eco-varroa-date');
    if (varroaEl) {
        if (!latest) {
            varroaEl.className = 'eco-shield-line';
            varroaEl.innerHTML = 'Varroa check: <strong>bez záznamu</strong>';
        } else {
            const drop = Number(latest.drop || 0);
            const tone = drop > 10 ? 'is-risk' : drop > 3 ? 'is-caution' : '';
            const label = drop > 10 ? 'Kritický spad' : drop > 3 ? 'Zvýšený spad' : 'V poriadku';
            varroaEl.className = `eco-shield-line ${tone}`;
            varroaEl.innerHTML = `Varroa destructor: <strong>${label}</strong> · ${escapeHtml(latest.site || 'stanovište')} ${escapeHtml(String(drop))}/24 h`;
        }
    }
    if (dateEl) {
        if (!latest?.when) dateEl.textContent = 'Posledná kontrola spádu klieštika: zatiaľ nezaznamenaná';
        else {
            const when = new Date(latest.when);
            const stamp = Number.isNaN(when.getTime()) ? latest.when : when.toLocaleString('sk-SK');
            dateEl.textContent = `Posledná kontrola spádu klieštika: ${stamp}`;
        }
    }

    paintDriftRadar();
}

function paintDriftRadar() {
    const caption = document.getElementById('eco-drift-caption');
    const arrow = document.getElementById('eco-drift-arrow');
    const compass = document.getElementById('eco-drift-compass');
    if (!caption) return;
    if (lastWind.fromDeg == null || !Number.isFinite(Number(lastWind.fromDeg))) {
        caption.textContent = 'Načítavam smer vetra z Open-Meteo…';
        return;
    }
    const speed = Number(lastWind.speed || 0);
    const risk = speed > 5 || lastWind.raining;
    compass?.classList.toggle('is-risk', risk);
    if (arrow) arrow.style.transform = `rotate(${Number(lastWind.fromDeg)}deg)`;
    const rain = lastWind.raining ? ' Prebieha zrážka — postrek je zakázaný.' : '';
    caption.innerHTML = risk
        ? `Vietor <strong>${speed.toFixed(1)} m/s</strong> od ${escapeHtml(lastWind.from)}. Prípadný úlet by sa šíril na <strong>${escapeHtml(lastWind.to)}</strong>.${rain}`
        : `Aktuálny vietor ${speed.toFixed(1)} m/s od ${escapeHtml(lastWind.from)}. Úlet by sa šíril smerom na <strong>${escapeHtml(lastWind.to)}</strong>.`;
}

function windowLevel(hour, temp, wind, rain) {
    if (rain || wind > 5) return 'banned';
    const night = hour >= 19 || hour < 6;
    if (night && wind < 4) return 'safe';
    return 'nectar';
}

function paintWeatherChart(hours) {
    const host = document.getElementById('eco-weather-chart');
    const caption = document.getElementById('eco-weather-caption');
    if (!host) return;
    lastWeatherHours = hours;
    const blocks = [];
    for (let i = 0; i < hours.length; i += 3) {
        const slice = hours.slice(i, i + 3);
        if (!slice.length) continue;
        const wind = Math.max(...slice.map((row) => row.wind));
        const temp = slice.reduce((sum, row) => sum + row.temp, 0) / slice.length;
        const rain = slice.some((row) => row.rain);
        const hour = slice[0].hourNum;
        const end = slice[slice.length - 1].hourNum;
        blocks.push({
            start: String(hour).padStart(2, '0'),
            end: String((end + 1) % 24).padStart(2, '0'),
            wind,
            temp,
            rain,
            level: windowLevel(hour, temp, wind, rain)
        });
    }
    const temps = blocks.map((row) => row.temp);
    const min = Math.min(...temps);
    const max = Math.max(...temps);
    const span = Math.max(1, max - min);
    host.innerHTML = blocks.map((row) => {
        const height = 36 + Math.round(((row.temp - min) / span) * 58);
        const title = `${row.start}:00–${row.end}:00 · ${row.temp.toFixed(1)}°C · ${row.wind.toFixed(1)} m/s${row.rain ? ' · zrážky' : ''}`;
        return `<span data-level="${row.level}" style="height:${height}px" title="${title}">${row.wind.toFixed(0)}<i>${row.start}–${row.end}</i></span>`;
    }).join('');
    const safe = blocks.filter((row) => row.level === 'safe').length;
    const nectar = blocks.filter((row) => row.level === 'nectar').length;
    const banned = blocks.filter((row) => row.level === 'banned').length;
    if (caption) {
        caption.textContent = safe
            ? `${safe} bezpečné okná postreku (19:00–06:00, vietor < 4 m/s) · ${nectar} bloky plnej znášky · ${banned} zákazy · Open-Meteo`
            : `V najbližších 24 h nie je zelené okno postreku · ${nectar} bloky letovej aktivity · ${banned} zákazy (vietor > 5 m/s alebo dážď)`;
    }
}

async function loadWeather() {
    const token = ++weatherToken;
    const origin = scanOrigin();
    const caption = document.getElementById('eco-weather-caption');
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${origin.lat.toFixed(4)}&longitude=${origin.lng.toFixed(4)}&current=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation&hourly=temperature_2m,wind_speed_10m,precipitation,precipitation_probability,wind_direction_10m&wind_speed_unit=ms&forecast_hours=24&timezone=Europe%2FBratislava`;
        const data = await fetchJson(url, {}, 8000);
        const times = data?.hourly?.time || [];
        const temps = data?.hourly?.temperature_2m || [];
        const winds = data?.hourly?.wind_speed_10m || [];
        const rainMm = data?.hourly?.precipitation || [];
        const rainProb = data?.hourly?.precipitation_probability || [];
        if (!times.length) throw new Error('empty hourly');
        const current = data.current || {};
        const fromDeg = Number(current.wind_direction_10m);
        const toDeg = (fromDeg + 180) % 360;
        lastWind = {
            speed: Number(current.wind_speed_10m),
            fromDeg,
            from: windCardinal(fromDeg),
            to: windCardinal(toDeg),
            raining: Number(current.precipitation) >= 0.2
        };
        const hours = times.slice(0, 24).map((stamp, index) => {
            const temp = Number(temps[index]);
            const wind = Number(winds[index]);
            const date = new Date(stamp);
            const hourNum = date.getHours();
            const rain = Number(rainMm[index]) >= 0.2 || Number(rainProb[index]) >= 60;
            return {
                hour: `${String(hourNum).padStart(2, '0')}`,
                hourNum,
                temp,
                wind,
                rain,
                level: windowLevel(hourNum, temp, wind, rain)
            };
        });
        if (token !== weatherToken) return;
        paintWeatherChart(hours);
        paintDriftRadar();
    } catch (error) {
        if (caption) caption.textContent = 'Open-Meteo teraz neodpovedá. Graf sa doplní pri ďalšom otvorení.';
    }
}

function paintCommandCenter() {
    const modal = document.getElementById('user-dashboard-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    const state = store.getState();
    paintScore(state);
    paintWelcome(state);
    paintChecklist(state);
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

function reportContext() {
    const state = store.getState();
    const user = state.currentUser;
    const score = ecoScore(state);
    const origin = scanOrigin(state);
    return {
        state,
        user,
        score,
        certificate: certificateLabel(score),
        origin,
        nearHives: hivesNear(origin.lat, origin.lng),
        nearParcels: parcelsNear(origin.lat, origin.lng),
        sprays: readList(SPRAY_KEY),
        varroa: readList(VARROA_KEY),
        alerts: state.sprayAlerts || []
    };
}

function farmerPrintHtml(ctx) {
    const rows = ctx.sprays.map((row) => `<tr><td>${escapeHtml(row.when || '')}</td><td>${escapeHtml(row.parcel || '')}</td><td>${escapeHtml(String(row.areaHa ?? ''))}</td><td>${escapeHtml(row.product || '')}</td><td>${escapeHtml(String(row.windMs ?? ''))}</td><td>${escapeHtml(row.toxicity || '')}</td></tr>`).join('')
        || '<tr><td colspan="6">Bez záznamu v knihe postrekov.</td></tr>';
    const hives = ctx.nearHives.map((row) => `<tr><td>${escapeHtml(row.hive.name)}</td><td>${escapeHtml(row.hive.cevz || '')}</td><td>${escapeHtml(String(row.hive.count))}</td><td>${(row.meters / 1000).toFixed(2)} km</td></tr>`).join('')
        || '<tr><td colspan="4">V 3 km pásme nie je evidovaná včelnica.</td></tr>';
    return `
        <article class="eco-print-sheet">
            <h1>Evidencia aplikácie prípravkov na ochranu rastlín a kontrola 3 km pásma (pre ÚKSÚP)</h1>
            <p>Včely a pôda · zákon č. 405/2011 Z. z. · ${new Date().toLocaleString('sk-SK')}</p>
            <p><b>Subjekt:</b> ${escapeHtml(ctx.user?.name || 'Neprihlásený používateľ')} · IČO ${escapeHtml(ctx.user?.ico || '—')} · Eko-skóre ${ctx.score}/100 (${escapeHtml(ctx.certificate)})</p>
            <p><b>Kontrolný bod:</b> ${escapeHtml(ctx.origin.source)} · ${ctx.origin.lat.toFixed(5)}, ${ctx.origin.lng.toFixed(5)} · LPIS v 3 km: ${ctx.nearParcels.length} · včelnice: ${ctx.nearHives.length}</p>
            <h2>Kniha postrekov</h2>
            <table><thead><tr><th>Dátum</th><th>Parcela</th><th>ha</th><th>Prípravok</th><th>Vietor m/s</th><th>Riziko</th></tr></thead><tbody>${rows}</tbody></table>
            <h2>Včelnice v 3 km ochrannom pásme</h2>
            <table><thead><tr><th>Stanovište</th><th>CEVZ</th><th>Rodiny</th><th>Vzdialenosť</th></tr></thead><tbody>${hives}</tbody></table>
        </article>
    `;
}

function beekeeperPrintHtml(ctx) {
    const hives = (ctx.state.hives || []).map((hive) => `<tr><td>${escapeHtml(hive.name)}</td><td>${escapeHtml(hive.cevz || '')}</td><td>${escapeHtml(String(hive.count))}</td><td>${escapeHtml(hive.nectarTags || '—')}</td><td>${Number(hive.lat).toFixed(5)}, ${Number(hive.lng).toFixed(5)}</td></tr>`).join('')
        || '<tr><td colspan="5">Bez evidovaného stanovišťa.</td></tr>';
    const varroa = ctx.varroa.map((row) => `<tr><td>${escapeHtml(row.when || '')}</td><td>${escapeHtml(row.site || '')}</td><td>${escapeHtml(String(row.drop))}</td><td>${escapeHtml(row.label || '')}</td></tr>`).join('')
        || '<tr><td colspan="4">Monitoring klieštika zatiaľ bez záznamu.</td></tr>';
    const parcels = ctx.nearParcels.map((parcel) => `<tr><td>${escapeHtml(parcel.id)}</td><td>${escapeHtml(parcel.crop || '')}</td><td>${escapeHtml(String(parcel.areaHa ?? ''))}</td></tr>`).join('')
        || '<tr><td colspan="3">V 3 km nie sú evidované LPIS bloky.</td></tr>';
    return `
        <article class="eco-print-sheet">
            <h1>Evidencia stanovíšť včelstiev, znášky a veterinárneho monitoringu (CEVZ / Varroa)</h1>
            <p>Včely a pôda · CEVZ / RVPS · ${new Date().toLocaleString('sk-SK')}</p>
            <p><b>Včelár:</b> ${escapeHtml(ctx.user?.name || 'Neprihlásený používateľ')} · CEVZ ${escapeHtml(ctx.user?.cevz || '—')} · Eko-skóre ${ctx.score}/100 (${escapeHtml(ctx.certificate)})</p>
            <h2>Stanovištia a znáška</h2>
            <table><thead><tr><th>Názov</th><th>CEVZ</th><th>Rodiny</th><th>Znáška</th><th>Súradnice</th></tr></thead><tbody>${hives}</tbody></table>
            <h2>Monitoring Varroa destructor</h2>
            <table><thead><tr><th>Dátum</th><th>Stanovište</th><th>Spad / 24 h</th><th>Semafor</th></tr></thead><tbody>${varroa}</tbody></table>
            <h2>LPIS v 3 km doletovom pásme</h2>
            <table><thead><tr><th>Blok</th><th>Plodina</th><th>ha</th></tr></thead><tbody>${parcels}</tbody></table>
        </article>
    `;
}

function farmerPdfLines(ctx) {
    const lines = [
        'Evidencia aplikacie pripravkov na ochranu rastlin a kontrola 3 km pasma (pre UKSUP)',
        `Subjekt: ${ctx.user?.name || 'Neprihlaseny pouzivatel'}`,
        `ICO: ${ctx.user?.ico || '-'}`,
        `Eko-skore: ${ctx.score}/100 (${ctx.certificate})`,
        `Overenie: ${(ctx.user?.ico || ctx.user?.cevz) ? 'RUZ & CEVZ' : 'caka na overenie'}`,
        `Mapa: ${ctx.origin.lat.toFixed(5)}, ${ctx.origin.lng.toFixed(5)} (${ctx.origin.source})`,
        `LPIS v 3 km: ${ctx.nearParcels.length}`,
        `Vcelnice v 3 km: ${ctx.nearHives.length}`,
        ''
    ];
    ctx.nearParcels.forEach((parcel) => {
        lines.push(`LPIS ${parcel.id} | ${parcel.crop || ''} | ${parcel.areaHa || 0} ha`);
    });
    ctx.nearHives.forEach((row) => {
        lines.push(`CEVZ ${row.hive.cevz || ''} | ${row.hive.name} | ${(row.meters / 1000).toFixed(2)} km`);
    });
    ctx.sprays.slice(0, 12).forEach((row) => {
        lines.push(`Postrek ${row.when || ''} | ${row.parcel || ''} | ${row.product || ''} | ${row.toxicity || ''}`);
    });
    return lines;
}

function beekeeperPdfLines(ctx) {
    const lines = [
        'Evidencia stanovist vcelstiev, znasky a veterinárneho monitoringu (CEVZ / Varroa)',
        `Vcelar: ${ctx.user?.name || 'Neprihlaseny pouzivatel'}`,
        `CEVZ: ${ctx.user?.cevz || '-'}`,
        `Eko-skore: ${ctx.score}/100 (${ctx.certificate})`,
        `Mapa: ${ctx.origin.lat.toFixed(5)}, ${ctx.origin.lng.toFixed(5)}`,
        ''
    ];
    (ctx.state.hives || []).forEach((hive) => {
        lines.push(`Stanoviste ${hive.name} | ${hive.cevz || ''} | ${hive.count} rodin | ${hive.nectarTags || ''}`);
    });
    ctx.varroa.slice(0, 10).forEach((row) => {
        lines.push(`Varroa ${row.when || ''} | ${row.site || ''} | spad ${row.drop}/24h | ${row.label || ''}`);
    });
    ctx.nearParcels.forEach((parcel) => {
        lines.push(`LPIS ${parcel.id} | ${parcel.crop || ''} | ${parcel.areaHa || 0} ha`);
    });
    return lines;
}

function exportOfficialReport() {
    const ctx = reportContext();
    const bee = isBeeRole(ctx.user?.role);
    const html = bee ? beekeeperPrintHtml(ctx) : farmerPrintHtml(ctx);
    const lines = bee ? beekeeperPdfLines(ctx) : farmerPdfLines(ctx);
    const filename = bee ? 'vykaz-cevz-varroa.pdf' : 'vykaz-uksup-3km.pdf';

    const root = document.getElementById('eco-print-root');
    if (root) {
        root.hidden = false;
        root.innerHTML = html;
        window.print();
        window.setTimeout(() => {
            root.hidden = true;
        }, 400);
    }

    const blob = new Blob([buildReportPdf(lines)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    window.showToast?.('Úradný výkaz je pripravený na tlač aj ako PDF', 'success');
}

function startCollisionSimulation(lat, lng, label) {
    const origin = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
        ? { lat: Number(lat), lng: Number(lng), source: label || 'objekt' }
        : scanOrigin();
    window.closeUserDashboardModal?.();
    window.toggleSpraySimulation?.();
    document.body.classList.add('eco-radar-live');
    clearTimeout(radarTimer);
    radarTimer = window.setTimeout(() => {
        document.body.classList.remove('eco-radar-live');
        const liveMap = window.agrogisMap?.map;
        if (radarCircle && liveMap) liveMap.removeLayer(radarCircle);
        radarCircle = null;
    }, 9000);
    const engine = window.agrogisMap;
    const map = engine?.map;
    if (!map || !window.L) return;
    map.setView([origin.lat, origin.lng], 13, { animate: true });
    if (typeof engine.runEcosystemRadarScan === 'function') {
        engine.runEcosystemRadarScan(origin.lat, origin.lng, origin.source || label || '3 km kolízna simulácia');
    } else {
        engine.checkSprayCollision?.(origin.lat, origin.lng, origin.source || label);
    }
    if (radarCircle) map.removeLayer(radarCircle);
    radarCircle = window.L.circle([origin.lat, origin.lng], {
        radius: 3000,
        color: '#F59E0B',
        weight: 2,
        dashArray: '6, 8',
        fillColor: '#F59E0B',
        fillOpacity: 0.18,
        className: 'eco-radar-ring',
        interactive: false
    }).addTo(map);
    window.showToast?.(`3 km radar beží okolo ${origin.source || 'vybraného objektu'}`, 'info');
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

let sprayRadarToken = 0;

async function collisionRows(point) {
    const local = hivesNear(point.lat, point.lng);
    if (typeof window.fetchApiariesInBuffer !== 'function') return local;
    try {
        const remote = await window.fetchApiariesInBuffer(point.lat, point.lng, 3000);
        if (Array.isArray(remote) && remote.length) return remote;
    } catch (error) {
        return local;
    }
    return local;
}

async function paintSprayRadar() {
    const token = ++sprayRadarToken;
    const host = document.getElementById('spray-collision-radar');
    const button = document.getElementById('spray-alert-beekeepers');
    if (!host) return;
    const point = selectedSprayPoint();
    const rows = await collisionRows(point);
    if (token !== sprayRadarToken) return;
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

async function sendSprayAlerts() {
    const point = selectedSprayPoint();
    const rows = await collisionRows(point);
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

function completeVerifyStep() {
    const user = store.getState().currentUser;
    if (user && (user.ico || user.cevz || user.isVerified)) {
        window.showToast?.('Subjekt je overený v RÚZ / CEVZ', 'success');
        paintChecklist(store.getState());
        return;
    }
    window.switchDashboardSection?.('profile');
    window.showToast?.('Doplňte IČO alebo CEVZ — overenie RÚZ/CEVZ sa zapíše do checklistu', 'info');
}

function completeAssetStep() {
    const state = store.getState();
    if (ownedParcels(state).length || ownedHives(state).length) {
        window.showToast?.('Prvá parcela alebo včelnica je už priradená', 'success');
        return;
    }
    window.closeUserDashboardModal?.();
    if (isBeeRole(state.currentUser?.role)) window.toggleAddHiveMode?.();
    else window.toggleDrawPolygonMode?.();
}

function completeShieldStep() {
    localStorage.setItem(SHIELD_KEY, '1');
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
    paintCommandCenter();
    window.showToast?.('3 km strážny štít je aktívny', 'success');
}

async function beginEcosystemOnboarding(user) {
    if (user?.email) markOnboarded(user.email);
    const origin = scanOrigin(store.getState());
    const engine = window.agrogisMap;
    if (engine?.map) {
        engine.map.setView([origin.lat, origin.lng], 13, { animate: true });
        if (typeof engine.runEcosystemRadarScan === 'function') {
            engine.runEcosystemRadarScan(origin.lat, origin.lng, origin.source);
        }
    }
    window.openUserDashboardModal?.();
    paintCommandCenter();
    await loadWeather();
    const parcels = parcelsNear(origin.lat, origin.lng);
    const hives = hivesNear(origin.lat, origin.lng);
    window.showToast?.(`Ekosystémový sken (${origin.source}): ${parcels.length} LPIS blokov, ${hives.length} včelníc v 3 km`, 'success');
}

function maybeBeginOnboarding(user, force = false) {
    if (!user) return;
    if (force || !isOnboarded(user.email)) {
        beginEcosystemOnboarding(user);
    }
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
    document.getElementById('eco-collision-sim')?.addEventListener('click', () => startCollisionSimulation());
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
    document.getElementById('eco-varroa-log')?.addEventListener('click', () => {
        window.openVarroaMonitor?.();
    });
    document.getElementById('eco-step-verify')?.addEventListener('click', completeVerifyStep);
    document.getElementById('eco-step-asset')?.addEventListener('click', completeAssetStep);
    document.getElementById('eco-step-shield')?.addEventListener('click', completeShieldStep);

    window.syncSprayChoicePills = syncSprayChoicePills;
    window.refreshSprayCollisionRadar = refreshSprayCollisionRadar;
    window.startCollisionSimulation = startCollisionSimulation;
    window.beginEcosystemOnboarding = beginEcosystemOnboarding;
    window.maybeBeginOnboarding = maybeBeginOnboarding;
    window.paintEcosystemCenter = paintCommandCenter;
    window.scanEcosystemOrigin = scanOrigin;
    window.exportOfficialReport = exportOfficialReport;
    window.selectedSprayPoint = selectedSprayPoint;
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
    wrap('saveVarroaEntry', () => window.setTimeout(() => {
        paintCommandCenter();
        window.refreshDashboardStats?.();
    }, 0));
    wrap('saveSprayBookEntry', () => window.setTimeout(() => {
        paintCommandCenter();
        window.refreshDashboardStats?.();
    }, 0));

    store.subscribe(() => {
        paintCommandCenter();
        const spray = document.getElementById('spray-book-modal');
        if (spray && !spray.classList.contains('hidden')) paintSprayRadar();
        const hive = document.getElementById('hive-modal');
        if (hive && !hive.classList.contains('hidden')) paintHiveAnalysis();
    });
}
