require('dotenv').config();

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');
const { isValidLpisId, isLpisSourceConfigured, fetchLpisParcelsFromSource, listLocalLpisParcels } = require('./lpis');

const app = express();
const port = Number(process.env.PORT || 8000);
const jwtSecret = process.env.JWT_SECRET;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const icoPattern = /^\d{6,10}$/;
const allowedRoles = new Set(['AGRO', 'AGRO_PRO', 'BEEKEEPER', 'BEE_HOBBY', 'BEE_BEGINNER', 'GARDENER', 'GARDEN_NEW']);

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// CORS: allow the GitHub Pages frontend (and extra origins via CORS_ORIGINS,
// comma-separated) to call the API cross-origin. Same-origin requests have no
// Origin header and always pass through.
const defaultAllowedOrigins = ['https://lucia-danielova.github.io'];
const allowedOrigins = new Set(
  [...defaultAllowedOrigins, ...String(process.env.CORS_ORIGINS || '').split(',')]
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean)
);

app.use('/api', (req, res, next) => {
  const origin = (req.headers.origin || '').replace(/\/+$/, '');
  if (origin && allowedOrigins.has(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Max-Age', '86400');
    return res.sendStatus(204);
  }
  next();
});

function sendError(res, status, error, details) {
  res.status(status).json({ success: false, error, ...(details ? { details } : {}) });
}

function requireDatabase(res) {
  if (!pool) {
    sendError(res, 503, 'DATABASE_NOT_CONFIGURED', 'Nastavte DATABASE_URL a spustite npm run db:migrate.');
    return false;
  }
  return true;
}

function signToken(userId) {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 })).toString('base64url');
  const signature = crypto.createHmac('sha256', jwtSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function authenticate(req, res, next) {
  const token = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || !jwtSecret) return sendError(res, 401, 'UNAUTHORIZED');

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return sendError(res, 401, 'UNAUTHORIZED');

  const expected = crypto.createHmac('sha256', jwtSecret).update(payload).digest();
  let received;
  try {
    received = Buffer.from(signature, 'base64url');
  } catch {
    return sendError(res, 401, 'UNAUTHORIZED');
  }
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return sendError(res, 401, 'UNAUTHORIZED');
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!claims.sub || claims.exp <= Date.now() / 1000) return sendError(res, 401, 'UNAUTHORIZED');
    req.userId = claims.sub;
    next();
  } catch {
    sendError(res, 401, 'UNAUTHORIZED');
  }
}

function publicUser(row) {
  const lat = Number(row.profile_location_lat);
  const lng = Number(row.profile_location_lng);
  const hasProfileLocation = Number.isFinite(lat) && Number.isFinite(lng);

  return {
    id: row.id,
    email: row.email,
    role: row.role,
    name: row.name,
    ico: row.ico || '',
    cevz: row.cevz || '',
    phone: row.phone || '',
    address: row.address || '',
    lpisId: row.lpis_id || '',
    companyName: row.company_name || '',
    profileLocation: hasProfileLocation ? { lat, lng } : null,
    isVerified: row.is_verified,
    createdAt: row.created_at
  };
}

function cleanIco(value) {
  return String(value || '').replace(/\s/g, '');
}

function normalizeRole(rawRole) {
  const role = String(rawRole || '').trim();
  return allowedRoles.has(role) ? role : 'AGRO';
}

const cevzPattern = /^CEVZ-SK-\d{4}$/;

async function generateCevzCode() {
  // Retry against the unique index: concurrent inserts can draw the same number.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `CEVZ-SK-${crypto.randomInt(1000, 10000)}`;
    const existing = await pool.query('SELECT 1 FROM app_users WHERE cevz = $1', [candidate]);
    if (!existing.rows.length) return candidate;
  }
  throw new Error('CEVZ_GENERATION_FAILED');
}

async function fetchRegisterUz(ico) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const url = `https://www.registeruz.sk/cruz-public/api/uctovne-jednotky?zmenene-od=2000-01-01&ico=${encodeURIComponent(ico.padStart(8, '0'))}`;
    const listResponse = await fetch(url, { signal: controller.signal });
    if (!listResponse.ok) return null;
    const list = await listResponse.json();
    const id = Array.isArray(list?.id) ? list.id[0] : null;
    if (!id) return null;

    const detailResponse = await fetch(`https://www.registeruz.sk/cruz-public/api/uctovna-jednotka?id=${encodeURIComponent(id)}`, { signal: controller.signal });
    if (!detailResponse.ok) return null;
    const detail = await detailResponse.json();
    const city = String(detail.mesto || '').trim();
    const street = String(detail.ulica || '').trim();
    const postalCode = String(detail.psc || '').trim();
    return {
      ico: String(detail.ico || ico.padStart(8, '0')),
      name: String(detail.nazovUJ || '').trim(),
      type: detail.pravnaForma ? `Právna forma: ${detail.pravnaForma}` : 'Registrovaný subjekt SR (RÚZ)',
      address: [street, [postalCode, city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      city,
      source: 'RegisterUZ.sk (MF SR)'
    };
  } finally {
    clearTimeout(timeout);
  }
}

app.get('/api/health', async (req, res) => {
  if (!pool) {
    return sendError(res, 503, 'DATABASE_NOT_CONFIGURED');
  }
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, service: 'agrogis-api', database: 'connected' });
  } catch {
    sendError(res, 503, 'DATABASE_UNAVAILABLE');
  }
});

app.post('/api/auth/register', async (req, res, next) => {
  if (!requireDatabase(res)) return;
  if (!jwtSecret) return sendError(res, 503, 'AUTH_NOT_CONFIGURED', 'Nastavte JWT_SECRET.');

  const body = req.body || {};
  const { email, password, role, name, ico = '', cevz = '', phone = '', address = '', lpisId = '', profileLocation = null, companyName = '', companySearch = '' } = body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedRole = normalizeRole(role);
  const normalizedIco = ['AGRO', 'AGRO_PRO'].includes(normalizedRole) ? cleanIco(ico) : '';
  const isBeeRole = normalizedRole === 'BEEKEEPER' || normalizedRole === 'BEE_HOBBY' || normalizedRole === 'BEE_BEGINNER';
  let cleanCevz = isBeeRole ? String(cevz || '').trim() : '';
  const cleanLpisId = ['AGRO', 'AGRO_PRO'].includes(normalizedRole) ? String(lpisId || '').trim() : '';
  const cleanCompanyName = ['AGRO', 'AGRO_PRO', 'BEEKEEPER'].includes(normalizedRole) ? String(companyName || companySearch || '').trim() : '';
  const location = profileLocation && typeof profileLocation === 'object' ? profileLocation : null;
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);

  if (!emailPattern.test(normalizedEmail) || typeof password !== 'string' || password.length < 6 || !String(name || '').trim() || !allowedRoles.has(normalizedRole)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Vyžaduje sa platný e-mail, heslo s minimálne 6 znakmi, meno a zvolený profil.');
  }
  if (normalizedIco && !icoPattern.test(normalizedIco)) return sendError(res, 400, 'VALIDATION_ERROR', 'IČO musí obsahovať 6 až 10 číslic.');
  if (cleanCevz && !cevzPattern.test(cleanCevz)) return sendError(res, 400, 'VALIDATION_ERROR', 'CEVZ kód musí mať tvar CEVZ-SK-XXXX.');

  try {
    if (isBeeRole && !cleanCevz) cleanCevz = await generateCevzCode();
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO app_users (email, password_hash, role, name, ico, cevz, phone, address, lpis_id, profile_location_lat, profile_location_lng, company_name)
       VALUES ($1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''), NULLIF($8, ''), NULLIF($9, ''), $10, $11, NULLIF($12, ''))
       RETURNING id, email, role, name, ico, cevz, phone, address, lpis_id, profile_location_lat, profile_location_lng, company_name, is_verified, created_at`,
      [normalizedEmail, passwordHash, normalizedRole, String(name).trim(), normalizedIco, cleanCevz, String(phone).trim(), String(address).trim(), cleanLpisId, hasLocation ? lat : null, hasLocation ? lng : null, cleanCompanyName]
    );
    const user = publicUser(result.rows[0]);
    res.status(201).json({ success: true, token: signToken(user.id), user });
  } catch (error) {
    if (error.code === '23505') return sendError(res, 409, 'EMAIL_ALREADY_EXISTS');
    next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  if (!requireDatabase(res)) return;
  if (!jwtSecret) return sendError(res, 503, 'AUTH_NOT_CONFIGURED', 'Nastavte JWT_SECRET.');
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password;
  if (!emailPattern.test(email) || typeof password !== 'string') return sendError(res, 400, 'VALIDATION_ERROR');

  try {
    const result = await pool.query('SELECT * FROM app_users WHERE email = $1', [email]);
    const row = result.rows[0];
    if (!row || !(await bcrypt.compare(password, row.password_hash))) return sendError(res, 401, 'INVALID_CREDENTIALS');
    const user = publicUser(row);
    res.json({ success: true, token: signToken(user.id), user });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', (req, res) => res.json({ success: true }));

app.get('/api/users/me', authenticate, async (req, res, next) => {
  if (!requireDatabase(res)) return;
  try {
    const result = await pool.query(
      `SELECT id, email, role, name, ico, cevz, phone, address, lpis_id, profile_location_lat, profile_location_lng, company_name, is_verified, created_at
       FROM app_users WHERE id = $1`,
      [req.userId]
    );
    if (!result.rows[0]) return sendError(res, 404, 'USER_NOT_FOUND');
    res.json({ success: true, user: publicUser(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/users/me', authenticate, async (req, res, next) => {
  if (!requireDatabase(res)) return;
  const { name, phone, address, lpisId, companyName, profileLocation } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) return sendError(res, 400, 'VALIDATION_ERROR');
  const lat = Number(profileLocation?.lat);
  const lng = Number(profileLocation?.lng);
  const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);
  try {
    const result = await pool.query(
      `UPDATE app_users SET name = $2, phone = $3, address = $4, lpis_id = NULLIF($5, ''), company_name = NULLIF($6, ''), profile_location_lat = $7, profile_location_lng = $8, updated_at = NOW()
       WHERE id = $1 RETURNING id, email, role, name, ico, cevz, phone, address, lpis_id, profile_location_lat, profile_location_lng, company_name, is_verified, created_at`,
      [req.userId, name.trim(), String(phone || '').trim(), String(address || '').trim(), String(lpisId || '').trim(), String(companyName || '').trim(), hasLocation ? lat : null, hasLocation ? lng : null]
    );
    if (!result.rows[0]) return sendError(res, 404, 'USER_NOT_FOUND');
    res.json({ success: true, user: publicUser(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/users/me', authenticate, async (req, res, next) => {
  if (!requireDatabase(res)) return;
  try {
    const result = await pool.query('DELETE FROM app_users WHERE id = $1 RETURNING id', [req.userId]);
    if (!result.rows[0]) return sendError(res, 404, 'USER_NOT_FOUND');
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/registry/verify-entity', async (req, res, next) => {
  if (!requireDatabase(res)) return;
  const ico = cleanIco(req.body?.ico);
  if (!icoPattern.test(ico)) return sendError(res, 400, 'VALIDATION_ERROR', 'IČO musí obsahovať 6 až 10 číslic.');

  try {
    const cached = await pool.query('SELECT * FROM registered_entities WHERE ico = $1', [ico.padStart(8, '0')]);
    let entity = cached.rows[0] ? {
      ico: cached.rows[0].ico,
      name: cached.rows[0].name,
      type: cached.rows[0].type,
      address: cached.rows[0].address,
      city: cached.rows[0].city,
      lat: cached.rows[0].lat,
      lng: cached.rows[0].lng,
      source: cached.rows[0].source
    } : await fetchRegisterUz(ico);

    if (!entity?.name) return sendError(res, 404, 'ENTITY_NOT_FOUND');
    await pool.query(
      `INSERT INTO registered_entities (ico, name, type, address, city, lat, lng, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (ico) DO UPDATE SET name=EXCLUDED.name, type=EXCLUDED.type, address=EXCLUDED.address,
       city=EXCLUDED.city, lat=COALESCE(EXCLUDED.lat, registered_entities.lat), lng=COALESCE(EXCLUDED.lng, registered_entities.lng), source=EXCLUDED.source, updated_at=NOW()`,
      [entity.ico.padStart(8, '0'), entity.name, entity.type || null, entity.address || null, entity.city || null, entity.lat || null, entity.lng || null, entity.source]
    );
    res.json({ success: true, entity });
  } catch (error) {
    if (error.name === 'AbortError') return sendError(res, 504, 'REGISTRY_TIMEOUT');
    next(error);
  }
});

app.get('/api/registry/entities', async (req, res, next) => {
  if (!requireDatabase(res)) return;
  const query = String(req.query.q || '').trim();
  if (query.length < 2) return res.json({ success: true, entities: [] });
  try {
    const result = await pool.query(
      `SELECT ico, name, type, address, city, lat, lng, source
       FROM registered_entities WHERE ico ILIKE $1 OR name ILIKE $2 OR city ILIKE $2
       ORDER BY name LIMIT 20`,
      [`%${cleanIco(query)}%`, `%${query}%`]
    );
    res.json({ success: true, entities: result.rows });
  } catch (error) {
    next(error);
  }
});

app.get('/api/registry/lpis', authenticate, async (req, res, next) => {
  if (!requireDatabase(res)) return;
  const lpisId = String(req.query.lpisId || '').trim();
  if (lpisId && !isValidLpisId(lpisId)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'LPIS ID musí obsahovať 3 až 64 znakov (písmená, číslice, pomlčka, podčiarkovník).');
  }
  try {
    const localParcels = await listLocalLpisParcels(pool, req.userId, lpisId);
    let externalParcels = [];
    let source = 'local';
    if (lpisId && isLpisSourceConfigured()) {
      externalParcels = await fetchLpisParcelsFromSource({ lpisId, baseUrl: process.env.LPIS_API_URL });
      source = 'lpis-api';
    }
    res.json({ success: true, source, parcels: [...externalParcels, ...localParcels] });
  } catch (error) {
    if (error.name === 'AbortError') return sendError(res, 504, 'LPIS_TIMEOUT', 'LPIS zdroj neodpovedal v časovom limite.');
    if (error.code === 'LPIS_SOURCE_ERROR') return sendError(res, 502, 'LPIS_SOURCE_ERROR', 'LPIS zdroj vrátil chybu alebo neplatné dáta.');
    next(error);
  }
});

app.post('/api/parcels/save', authenticate, async (req, res, next) => {
  if (!requireDatabase(res)) return;
  const { externalRegisterId, geometry, areaHa, crop = 'Neurčená plodina' } = req.body || {};
  if (!externalRegisterId || geometry?.type !== 'Polygon' || !Array.isArray(geometry.coordinates?.[0]) || geometry.coordinates[0].length < 4) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Vyžaduje sa identifikátor a platný GeoJSON Polygon.');
  }
  try {
    const result = await pool.query(
      `INSERT INTO user_parcels (user_id, external_register_id, geom, area_ha, crop)
       VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), $4, $5) RETURNING id`,
      [req.userId, String(externalRegisterId).slice(0, 100), JSON.stringify(geometry), Number(areaHa) || 0, String(crop).slice(0, 255)]
    );
    res.status(201).json({ success: true, parcelId: result.rows[0].id });
  } catch (error) {
    next(error);
  }
});

app.get('/api/parcels', authenticate, async (req, res, next) => {
  if (!requireDatabase(res)) return;
  try {
    const result = await pool.query(
      `SELECT id AS "parcelId", external_register_id AS "externalRegisterId", area_ha AS "areaHa", crop,
       ST_AsGeoJSON(geom)::json AS geometry FROM user_parcels WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.userId]
    );
    res.json({ success: true, parcels: result.rows });
  } catch (error) {
    next(error);
  }
});

// Parcely konkrétneho subjektu podľa IČO (vzor /farmari/:ico/parcely z
// dokumentu) — FeatureCollection pre priame vykreslenie na mape.
app.get('/api/parcels/by-ico/:ico', async (req, res, next) => {
  if (!requireDatabase(res)) return;
  const ico = cleanIco(req.params.ico);
  if (!icoPattern.test(ico)) return sendError(res, 400, 'VALIDATION_ERROR', 'IČO musí obsahovať 6 až 10 číslic.');
  try {
    const result = await pool.query(
      `SELECT json_build_object(
         'type', 'FeatureCollection',
         'features', COALESCE(json_agg(ST_AsGeoJSON(t.*)::json), '[]'::json)
       ) AS geojson
       FROM (
         SELECT p.id, p.external_register_id, p.area_ha, p.crop, u.name AS owner_name, p.geom
         FROM user_parcels p
         JOIN app_users u ON u.id = p.user_id
         WHERE u.ico = $1
         ORDER BY p.id
         LIMIT 2000
       ) AS t`,
      [ico.padStart(8, '0')]
    );
    res.json(result.rows[0].geojson);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/parcels/:id', authenticate, async (req, res, next) => {
  if (!requireDatabase(res)) return;
  try {
    const result = await pool.query('DELETE FROM user_parcels WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    if (!result.rowCount) return sendError(res, 404, 'PARCEL_NOT_FOUND');
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

function parseLatLng(body) {
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

app.post('/api/hives', authenticate, async (req, res, next) => {
  if (!requireDatabase(res)) return;
  const { name, count = 1, cevz = '', email = '' } = req.body || {};
  const point = parseLatLng(req.body);
  if (!String(name || '').trim() || !point) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Vyžaduje sa názov stanovišťa a platné súradnice.');
  }
  const colonyCount = Math.max(1, Math.min(500, Math.trunc(Number(count)) || 1));
  try {
    const result = await pool.query(
      `INSERT INTO hives (owner_id, name, colony_count, cevz, contact_email, geom)
       VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography)
       RETURNING id`,
      [req.userId, String(name).trim().slice(0, 255), colonyCount, String(cevz).slice(0, 100), String(email).trim().slice(0, 255), point.lng, point.lat]
    );
    res.status(201).json({ success: true, hiveId: result.rows[0].id });
  } catch (error) {
    next(error);
  }
});

app.get('/api/hives/mine', authenticate, async (req, res, next) => {
  if (!requireDatabase(res)) return;
  try {
    const result = await pool.query(
      `SELECT id, name, colony_count AS "count", cevz, contact_email AS "email",
       ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng, created_at AS "createdAt"
       FROM hives WHERE owner_id = $1 ORDER BY created_at DESC`,
      [req.userId]
    );
    res.json({ success: true, hives: result.rows });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/hives/:id', authenticate, async (req, res, next) => {
  if (!requireDatabase(res)) return;
  try {
    const result = await pool.query('DELETE FROM hives WHERE id = $1 AND owner_id = $2', [req.params.id, req.userId]);
    if (!result.rowCount) return sendError(res, 404, 'HIVE_NOT_FOUND');
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// BBOX GeoJSON endpoint podľa ZBGIS vzoru (dokument, Part 1): mapa si sťahuje
// len parcely vo viditeľnom výreze, priamo ako FeatureCollection pre webový
// klient. Verejný endpoint bez citlivých údajov vlastníkov.
app.get('/api/map/parcels', async (req, res, next) => {
  if (!requireDatabase(res)) return;
  const parts = String(req.query.bbox || '').split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Parameter bbox musí mať tvar minLng,minLat,maxLng,maxLat.');
  }
  const [minLng, minLat, maxLng, maxLat] = parts;
  if (minLng >= maxLng || minLat >= maxLat || Math.abs(minLat) > 90 || Math.abs(maxLat) > 90 || Math.abs(minLng) > 180 || Math.abs(maxLng) > 180) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Neplatný rozsah súradníc v parametri bbox.');
  }
  try {
    const result = await pool.query('SELECT public.map_parcels_geojson($1, $2, $3, $4) AS geojson', [minLng, minLat, maxLng, maxLat]);
    res.json(result.rows[0].geojson);
  } catch (error) {
    next(error);
  }
});

// GDPR (plán, krok 6.2): verejný náhľad nevracia presnú polohu ani kontakt
// vlastníka — súradnice sú zaokrúhlené na mriežku ~1 km a údaje anonymizované.
app.get('/api/hives/public', async (req, res, next) => {
  if (!requireDatabase(res)) return;
  try {
    const result = await pool.query(
      `SELECT id, colony_count AS "count",
       ROUND(ST_Y(geom::geometry)::numeric, 2)::double precision AS lat,
       ROUND(ST_X(geom::geometry)::numeric, 2)::double precision AS lng
       FROM hives`
    );
    res.json({ success: true, anonymized: true, hives: result.rows });
  } catch (error) {
    next(error);
  }
});

const sprayAlertStatuses = new Set(['NAPLANOVANY', 'PREBIEHA', 'DOKONCENY', 'ZRUSENY']);

function parseTimestamp(value) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

// Spatial alert engine (plán, krok 5.1): pri hlásení postreku sa cez
// check_spray_collision_optimized nájdu včelnice v 3 km ochrannom pásme.
// Evidencia rozšírená podľa dokumentu (evidencia_postrekov): prípravok,
// účinná látka, dávka, plánované obdobie a stav.
app.post('/api/spray-alerts', authenticate, async (req, res, next) => {
  if (!requireDatabase(res)) return;
  const {
    locationLabel = '', note = '', radiusMeters = 3000,
    preparationName = '', activeSubstance = '', dosePerHa = null,
    plannedFrom = null, plannedTo = null
  } = req.body || {};
  const point = parseLatLng(req.body);
  if (!point) return sendError(res, 400, 'VALIDATION_ERROR', 'Vyžadujú sa platné súradnice miesta postreku.');
  const radius = Math.max(100, Math.min(20000, Number(radiusMeters) || 3000));

  const from = parseTimestamp(plannedFrom);
  const to = parseTimestamp(plannedTo);
  if (from === undefined || to === undefined) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Neplatný formát plánovaného dátumu postreku.');
  }
  if (from && to && to < from) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Koniec plánovaného postreku nemôže byť pred jeho začiatkom.');
  }
  const dose = dosePerHa === null || dosePerHa === '' ? null : Number(dosePerHa);
  if (dose !== null && (!Number.isFinite(dose) || dose < 0)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Dávka na hektár musí byť nezáporné číslo.');
  }

  try {
    const collisions = await pool.query(
      'SELECT * FROM public.check_spray_collision_optimized($1, $2, $3)',
      [point.lat, point.lng, radius]
    );
    const result = await pool.query(
      `INSERT INTO spray_alerts (sender_id, location_label, geom, note, preparation_name, active_substance, dose_per_ha, planned_from, planned_to)
       VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''), $8, $9, $10)
       RETURNING id, created_at AS "createdAt"`,
      [
        req.userId,
        String(locationLabel || `Súradnice ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`).slice(0, 255),
        point.lng, point.lat, String(note).slice(0, 2000),
        String(preparationName).slice(0, 255), String(activeSubstance).slice(0, 255),
        dose, from, to
      ]
    );
    res.status(201).json({
      success: true,
      alertId: result.rows[0].id,
      createdAt: result.rows[0].createdAt,
      status: 'NAPLANOVANY',
      radiusMeters: radius,
      affectedHives: collisions.rows.map((row) => ({
        hiveId: row.hive_id,
        hiveName: row.hive_name,
        hiveCount: row.hive_count,
        cevz: row.hive_cevz,
        distanceMeters: Math.round(row.distance_meters)
      })),
      affectedColonies: collisions.rows.reduce((sum, row) => sum + Number(row.hive_count || 0), 0)
    });
  } catch (error) {
    next(error);
  }
});

// Zmena stavu postreku (Naplanovany -> Prebieha -> Dokonceny / Zruseny),
// môže ju robiť len odosielateľ hlásenia.
app.patch('/api/spray-alerts/:id/status', authenticate, async (req, res, next) => {
  if (!requireDatabase(res)) return;
  const status = String(req.body?.status || '').trim().toUpperCase();
  if (!sprayAlertStatuses.has(status)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Stav musí byť jeden z: NAPLANOVANY, PREBIEHA, DOKONCENY, ZRUSENY.');
  }
  try {
    const result = await pool.query(
      `UPDATE spray_alerts SET status = $2 WHERE id = $1 AND sender_id = $3
       RETURNING id, status, updated_at AS "updatedAt"`,
      [req.params.id, status, req.userId]
    );
    if (!result.rows[0]) return sendError(res, 404, 'ALERT_NOT_FOUND');
    res.json({ success: true, ...result.rows[0] });
  } catch (error) {
    next(error);
  }
});

app.get('/api/spray-alerts/mine', authenticate, async (req, res, next) => {
  if (!requireDatabase(res)) return;
  try {
    const result = await pool.query(
      `SELECT DISTINCT sa.id, sa.location_label AS "locationLabel", sa.note,
       sa.preparation_name AS "preparationName", sa.active_substance AS "activeSubstance",
       sa.dose_per_ha AS "dosePerHa", sa.planned_from AS "plannedFrom", sa.planned_to AS "plannedTo",
       sa.status, sa.created_at AS "createdAt", sa.updated_at AS "updatedAt",
       ST_Y(sa.geom::geometry) AS lat, ST_X(sa.geom::geometry) AS lng,
       (sa.sender_id = $1) AS "isSender"
       FROM spray_alerts sa
       WHERE sa.sender_id = $1
          OR EXISTS (
            SELECT 1 FROM hives h
            WHERE h.owner_id = $1 AND ST_DWithin(h.geom, sa.geom, 3000)
          )
       ORDER BY sa.created_at DESC LIMIT 200`,
      [req.userId]
    );
    res.json({ success: true, alerts: result.rows });
  } catch (error) {
    next(error);
  }
});

app.use('/api', (req, res) => sendError(res, 404, 'NOT_FOUND'));
app.use(express.static(path.resolve(__dirname, '..')));
app.use((error, req, res, next) => {
  console.error('[api]', error.message);
  sendError(res, 500, 'INTERNAL_ERROR');
});

if (require.main === module) {
  app.listen(port, () => console.log(`AGROGIS API listening on http://localhost:${port}`));
}

module.exports = { app, signToken };
