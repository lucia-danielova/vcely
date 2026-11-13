const LPIS_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/;

function isValidLpisId(value) {
  return LPIS_ID_PATTERN.test(String(value || '').trim());
}

function isLpisSourceConfigured(env = process.env) {
  return Boolean(String(env.LPIS_API_URL || '').trim());
}

function normalizeLpisParcel(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const externalRegisterId = String(raw.externalRegisterId ?? raw.lpisId ?? raw.blockId ?? raw.id ?? '').trim();
  if (!externalRegisterId) return null;
  const geometry = raw.geometry && typeof raw.geometry.type === 'string' && Array.isArray(raw.geometry.coordinates) ? raw.geometry : null;
  return {
    externalRegisterId: externalRegisterId.slice(0, 100),
    areaHa: Number(raw.areaHa ?? raw.area_ha ?? raw.vymeraHa ?? raw.vymera_ha ?? 0) || 0,
    crop: String(raw.crop ?? raw.plodina ?? 'Neurčená plodina').slice(0, 255),
    geometry
  };
}

// Upstream contract: GET {baseUrl}?lpisId=<id> returns a JSON array
// or an object with a `parcels` array of LPIS block records.
async function fetchLpisParcelsFromSource({ lpisId, baseUrl, fetchImpl = fetch, timeoutMs = 5000 }) {
  const base = String(baseUrl || '').trim();
  if (!base) return [];
  const url = `${base}${base.includes('?') ? '&' : '?'}lpisId=${encodeURIComponent(lpisId)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) {
      const error = new Error(`LPIS source responded with HTTP ${response.status}`);
      error.code = 'LPIS_SOURCE_ERROR';
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    const list = Array.isArray(payload) ? payload : payload?.parcels;
    if (!Array.isArray(list)) {
      const error = new Error('LPIS source returned an unexpected payload');
      error.code = 'LPIS_SOURCE_ERROR';
      throw error;
    }
    return list.map(normalizeLpisParcel).filter(Boolean);
  } finally {
    clearTimeout(timeout);
  }
}

async function listLocalLpisParcels(pool, userId, lpisId = '') {
  const params = [userId];
  let filter = '';
  if (lpisId) {
    params.push(`${lpisId}%`);
    filter = 'AND external_register_id ILIKE $2';
  }
  const result = await pool.query(
    `SELECT external_register_id AS "externalRegisterId", area_ha AS "areaHa", crop,
     ST_AsGeoJSON(geom)::json AS geometry
     FROM user_parcels WHERE user_id = $1 ${filter} ORDER BY created_at DESC LIMIT 200`,
    params
  );
  return result.rows.map(normalizeLpisParcel).filter(Boolean);
}

module.exports = {
  isValidLpisId,
  isLpisSourceConfigured,
  normalizeLpisParcel,
  fetchLpisParcelsFromSource,
  listLocalLpisParcels
};
