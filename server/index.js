require('dotenv').config();

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

const app = express();
const port = Number(process.env.PORT || 8000);
const jwtSecret = process.env.JWT_SECRET;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const icoPattern = /^\d{6,10}$/;

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

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
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    name: row.name,
    ico: row.ico || '',
    cevz: row.cevz || '',
    phone: row.phone || '',
    address: row.address || '',
    isVerified: row.is_verified,
    createdAt: row.created_at
  };
}

function cleanIco(value) {
  return String(value || '').replace(/\s/g, '');
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
      status: 'active',
      source: 'RegisterUZ.sk (MF SR)'
    };
  } finally {
    clearTimeout(timeout);
  }
}

app.get('/api/health', async (req, res) => {
  let database = 'not_configured';
  if (pool) {
    try {
      await pool.query('SELECT 1');
      database = 'connected';
    } catch {
      database = 'unavailable';
    }
  }
  res.json({ success: true, service: 'agrogis-api', database });
});

app.post('/api/auth/register', async (req, res, next) => {
  if (!requireDatabase(res)) return;
  if (!jwtSecret) return sendError(res, 503, 'AUTH_NOT_CONFIGURED', 'Nastavte JWT_SECRET.');

  const { email, password, role = 'AGRO', name, ico = '', cevz = '', phone = '', address = '' } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedRole = ['AGRO', 'BEEKEEPER'].includes(role) ? role : null;
  const normalizedIco = role === 'AGRO' ? cleanIco(ico) : '';

  if (!emailPattern.test(normalizedEmail) || typeof password !== 'string' || password.length < 8 || !String(name || '').trim() || !normalizedRole) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Vyžaduje sa platný e-mail, heslo s minimálne 8 znakmi, meno a rola AGRO alebo BEEKEEPER.');
  }
  if (normalizedIco && !icoPattern.test(normalizedIco)) return sendError(res, 400, 'VALIDATION_ERROR', 'IČO musí obsahovať 6 až 10 číslic.');

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO app_users (email, password_hash, role, name, ico, cevz, phone, address)
       VALUES ($1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''), NULLIF($8, ''))
       RETURNING id, email, role, name, ico, cevz, phone, address, is_verified, created_at`,
      [normalizedEmail, passwordHash, normalizedRole, String(name).trim(), normalizedIco, String(cevz).trim(), String(phone).trim(), String(address).trim()]
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
    const result = await pool.query('SELECT id, email, role, name, ico, cevz, phone, address, is_verified, created_at FROM app_users WHERE id = $1', [req.userId]);
    if (!result.rows[0]) return sendError(res, 404, 'USER_NOT_FOUND');
    res.json({ success: true, user: publicUser(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/users/me', authenticate, async (req, res, next) => {
  if (!requireDatabase(res)) return;
  const { name, phone, address } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) return sendError(res, 400, 'VALIDATION_ERROR');
  try {
    const result = await pool.query(
      `UPDATE app_users SET name = $2, phone = $3, address = $4, updated_at = NOW()
       WHERE id = $1 RETURNING id, email, role, name, ico, cevz, phone, address, is_verified, created_at`,
      [req.userId, name.trim(), String(phone || '').trim(), String(address || '').trim()]
    );
    if (!result.rows[0]) return sendError(res, 404, 'USER_NOT_FOUND');
    res.json({ success: true, user: publicUser(result.rows[0]) });
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
      status: 'active',
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
