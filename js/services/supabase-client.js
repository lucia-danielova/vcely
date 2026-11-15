/**
 * Supabase client for Včely a pôda.
 * URL is fixed to the project; the public anon key is resolved from config
 * (meta tag, window global, or localStorage) — never commit private service keys.
 */

export const SUPABASE_URL = 'https://mwvtwfmerozjelyymmxg.supabase.co';

const ANON_STORAGE_KEY = 'vcely_supabase_anon_key';

function readAnonKey() {
  if (typeof window !== 'undefined' && window.__VCELY_SUPABASE_ANON_KEY__) {
    return String(window.__VCELY_SUPABASE_ANON_KEY__).trim();
  }
  if (typeof document !== 'undefined') {
    const meta = document.querySelector('meta[name="supabase-anon-key"]');
    const fromMeta = meta?.getAttribute('content')?.trim();
    if (fromMeta) return fromMeta;
  }
  try {
    const stored = localStorage.getItem(ANON_STORAGE_KEY);
    if (stored) return stored.trim();
  } catch {
    /* ignore */
  }
  return '';
}

export function isSupabaseConfigured() {
  return Boolean(readAnonKey());
}

export function createSupabaseClient() {
  const anonKey = readAnonKey();
  if (!anonKey) return { client: null, configured: false, url: SUPABASE_URL };
  if (typeof window === 'undefined' || !window.supabase?.createClient) {
    console.warn('[Včely] Supabase JS SDK nie je načítané.');
    return { client: null, configured: false, url: SUPABASE_URL };
  }
  const client = window.supabase.createClient(SUPABASE_URL, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  return { client, configured: true, url: SUPABASE_URL };
}

/**
 * Map a vcelnice row (PostGIS / JSON) into the in-app hive shape.
 */
export function mapVcelnicaRow(row) {
  if (!row) return null;
  let lat = Number(row.lat);
  let lng = Number(row.lng);
  if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && row.geom_geojson) {
    try {
      const geom = typeof row.geom_geojson === 'string' ? JSON.parse(row.geom_geojson) : row.geom_geojson;
      if (geom?.type === 'Point' && Array.isArray(geom.coordinates)) {
        lng = Number(geom.coordinates[0]);
        lat = Number(geom.coordinates[1]);
      }
    } catch {
      /* ignore */
    }
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id: row.id || row.uuid || `sb-${lat}-${lng}`,
    serverId: row.id || null,
    name: row.nazov || row.name || 'Včelnica',
    count: Number(row.pocet_rodin || row.count || 1) || 1,
    email: row.email || row.kontakt_email || '',
    cevz: row.cevz || row.kod_cevz || '',
    lat,
    lng,
    siteType: row.typ_stanovista || row.site_type || 'permanent',
    nectarTags: row.znaska_tagy || row.nectar_tags || '',
    source: 'supabase:vcelnice'
  };
}

export async function fetchVcelnice(client) {
  if (!client) return [];
  const primary = await client
    .from('vcelnice')
    .select('id, nazov, pocet_rodin, email, cevz, lat, lng, typ_stanovista, znaska_tagy')
    .order('id', { ascending: false })
    .limit(500);
  if (!primary.error) {
    return (primary.data || []).map(mapVcelnicaRow).filter(Boolean);
  }
  const retry = await client.from('vcelnice').select('*').limit(500);
  if (retry.error) throw retry.error;
  return (retry.data || []).map(mapVcelnicaRow).filter(Boolean);
}

export async function insertVcelnica(client, hive) {
  if (!client || !hive) return null;
  const payload = {
    nazov: hive.name,
    pocet_rodin: Number(hive.count) || 1,
    email: hive.email || null,
    cevz: hive.cevz || null,
    lat: hive.lat,
    lng: hive.lng,
    typ_stanovista: hive.siteType || 'permanent',
    znaska_tagy: hive.nectarTags || null
  };
  const { data, error } = await client.from('vcelnice').insert([payload]).select('id').single();
  if (error) throw error;
  return data?.id || null;
}

export async function insertEvidenciaPostreku(client, entry, location = {}) {
  if (!client || !entry) return null;
  const payload = {
    parcela: entry.parcel || null,
    plocha_ha: Number(entry.areaHa) || null,
    pripravok: entry.product || null,
    vietor_ms: Number(entry.windMs) || null,
    teplota_c: Number(entry.tempC) || null,
    termin: entry.when || null,
    toxicita: entry.toxicity || null,
    okno_postreku: entry.sprayWindow || null,
    lat: Number.isFinite(Number(location.lat)) ? Number(location.lat) : null,
    lng: Number.isFinite(Number(location.lng)) ? Number(location.lng) : null
  };
  const { data, error } = await client.from('evidencia_postrekov').insert([payload]).select('id').single();
  if (error) throw error;
  return data?.id || null;
}

export async function getApiariesInBuffer(client, lat, lng, radiusMeters = 3000) {
  if (!client) return null;
  const { data, error } = await client.rpc('get_apiaries_in_buffer', {
    spray_lat: lat,
    spray_lng: lng,
    radius_meters: radiusMeters
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
