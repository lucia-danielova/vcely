try {
  require('dotenv').config();
} catch {
  // dotenv is optional outside the Express boot path
}

/**
 * Free public Slovak company registries (no API keys / secrets).
 *
 * Live (verified answering without auth):
 *  - ŠÚ SR RPO — https://api.statistics.sk/rpo/v1/search
 *    (bare https://statistics.sk does not resolve; www.statistics.sk is Cloudflare HTML)
 *  - RegisterUZ MF SR — https://www.registeruz.sk/cruz-public/api/...
 *  - ORSR MS SR — https://sluzby.orsr.sk/api/legal-person
 *  - Slovensko.Digital Datahub RUZ — https://datahub.ekosystem.slovensko.digital/api/data/ruz/accounting_entities/:id
 *    (bare https://slovensko.digital returns HTML; Autoform requires a paid token — dropped)
 *  - Apino.sk RPO — https://api.apino.sk/api/v1/organizations (APINO_API_KEY, server-only; includes people)
 *
 * Tried and dropped:
 *  - https://statistics.sk (DNS NXDOMAIN)
 *  - https://www.statistics.sk / slovak.statistics.sk (Cloudflare challenge HTML)
 *  - https://slovensko.digital (marketing HTML, not JSON)
 *  - Autoform ekosystem.slovensko.digital (401 without private_access_token)
 *  - RPVS open-data (403 / HTML only)
 *  - data.gov.sk CKAN package_search (redirect / non-JSON)
 *  - Finančná správa VAT payer HTML lists (no open JSON by IČO)
 *  - Finstat / commercial aggregators (paid)
 */

const RPO_SEARCH = 'https://api.statistics.sk/rpo/v1/search';
const REGISTER_UZ_LIST = 'https://www.registeruz.sk/cruz-public/api/uctovne-jednotky';
const REGISTER_UZ_DETAIL = 'https://www.registeruz.sk/cruz-public/api/uctovna-jednotka';
const ORSR_SEARCH = 'https://sluzby.orsr.sk/api/legal-person';
const SD_DATAHUB_RUZ = 'https://datahub.ekosystem.slovensko.digital/api/data/ruz/accounting_entities';
const APINO_BASE = 'https://api.apino.sk/api/v1';

function getApinoApiKey() {
  const key = String(process.env.APINO_API_KEY || '').trim();
  return key.startsWith('apino_') ? key : '';
}

function cleanIco(value) {
  return String(value || '').replace(/\D/g, '');
}

function padIco(value) {
  const digits = cleanIco(value);
  return digits ? digits.padStart(8, '0') : '';
}

function pickLatest(entries, valueKey = 'value') {
  if (!Array.isArray(entries) || !entries.length) return '';
  const current = entries.find((entry) => entry?.current === true) || entries[entries.length - 1];
  if (typeof current?.[valueKey] === 'string') return current[valueKey].trim();
  if (typeof current?.value === 'string') return current.value.trim();
  if (current?.value && typeof current.value.value === 'string') return current.value.value.trim();
  return '';
}

function formatRpoAddress(address) {
  if (!address || typeof address !== 'object') return { street: '', city: '', postalCode: '', address: '' };
  const streetParts = [address.street, address.buildingNumber || address.regNumber]
    .map((part) => (part == null || part === 0 ? '' : String(part).trim()))
    .filter(Boolean);
  const street = streetParts.join(' ').trim();
  const city = String(address.municipality?.value || address.municipality || '').trim();
  const postalCode = String((address.postalCodes && address.postalCodes[0]) || address.postalCode || '').trim();
  const addressLine = [street, [postalCode, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return { street, city, postalCode, address: addressLine };
}

function mergeEntities(parts) {
  const usable = parts.filter((part) => part && (part.name || part.ico));
  if (!usable.length) return null;

  const sources = [];
  const merged = {
    ico: '',
    name: '',
    type: '',
    address: '',
    city: '',
    street: '',
    postalCode: '',
    dic: '',
    fileReference: '',
    establishment: '',
    activities: [],
    people: [],
    skNace: '',
    lat: null,
    lng: null,
    source: '',
    sources: [],
    registerUzId: null
  };

  for (const part of usable) {
    if (part.ico && !merged.ico) merged.ico = padIco(part.ico) || part.ico;
    if (part.name && (!merged.name || part.name.length > merged.name.length)) merged.name = part.name;
    if (part.type && !merged.type) merged.type = part.type;
    if (part.address && (!merged.address || part.address.length > merged.address.length)) merged.address = part.address;
    if (part.city && !merged.city) merged.city = part.city;
    if (part.street && !merged.street) merged.street = part.street;
    if (part.postalCode && !merged.postalCode) merged.postalCode = part.postalCode;
    if (part.dic && !merged.dic) merged.dic = part.dic;
    if (part.fileReference && !merged.fileReference) merged.fileReference = part.fileReference;
    if (part.establishment && !merged.establishment) merged.establishment = part.establishment;
    if (part.skNace && !merged.skNace) merged.skNace = part.skNace;
    if (part.registerUzId && !merged.registerUzId) merged.registerUzId = part.registerUzId;
    if (Array.isArray(part.activities) && part.activities.length && !merged.activities.length) {
      merged.activities = part.activities.slice(0, 8);
    }
    if (Array.isArray(part.people) && part.people.length && !merged.people.length) {
      merged.people = part.people.slice(0, 12);
    }
    if (Number.isFinite(Number(part.lat)) && merged.lat == null) merged.lat = Number(part.lat);
    if (Number.isFinite(Number(part.lng)) && merged.lng == null) merged.lng = Number(part.lng);
    // Prefer full register names from part.sources; fall back to part.source.
    // Skip already-compacted labels (contain '+') so re-merges do not pollute sources.
    if (Array.isArray(part.sources) && part.sources.length) {
      for (const full of part.sources) {
        if (full && !String(full).includes('+')) sources.push(String(full));
      }
    } else if (part.source && !String(part.source).includes('+')) {
      sources.push(String(part.source));
    }
  }

  merged.sources = [...new Set(sources)];
  // Compact label fits registered_entities.source VARCHAR limit; full names stay in `sources`.
  merged.source = compactSourceLabel(merged.sources);
  if (!merged.address && (merged.street || merged.city)) {
    merged.address = [merged.street, [merged.postalCode, merged.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  }
  return merged.name || merged.ico ? merged : null;
}

const SOURCE_SHORT_LABELS = [
  [/Apino/i, 'Apino'],
  [/statistics\.sk|ŠÚ SR RPO|\bRPO\b/i, 'RPO'],
  [/RegisterUZ|RÚZ/i, 'RÚZ'],
  [/ORSR/i, 'ORSR'],
  [/Slovensko\.Digital|datahub|Datahub/i, 'Datahub'],
  [/Lokálny|local/i, 'Lokálny']
];

function expandSourceTokens(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  // Already-compacted labels like "RPO+ORSR+Datahub" must split, not match as one RPO hit.
  if (text.includes('+')) {
    return text.split('+').map((part) => part.trim()).filter(Boolean);
  }
  return [text];
}

function compactSourceLabel(sources, maxLen = 120) {
  const list = Array.isArray(sources) ? sources.filter(Boolean) : [];
  if (!list.length) return 'Verejné registre SR';
  const shorts = [];
  for (const source of list) {
    for (const token of expandSourceTokens(source)) {
      const hit = SOURCE_SHORT_LABELS.find(([pattern]) => pattern.test(token));
      const label = hit ? hit[1] : token.slice(0, 24);
      if (!shorts.includes(label)) shorts.push(label);
    }
  }
  const joined = shorts.join('+') || 'Verejné registre SR';
  return joined.length <= maxLen ? joined : `${joined.slice(0, maxLen - 1)}…`;
}

async function fetchJson(url, { signal, timeoutMs = 5000, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...headers }
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

async function fetchRegisterUzId(ico, signal) {
  const padded = padIco(ico);
  const list = await fetchJson(
    `${REGISTER_UZ_LIST}?zmenene-od=2000-01-01&ico=${encodeURIComponent(padded)}&max-zaznamov=1`,
    { signal, timeoutMs: 4500 }
  );
  return Array.isArray(list?.id) ? list.id[0] : null;
}

async function fetchFromStatisticsSkRpoByIco(ico, signal) {
  const padded = padIco(ico);
  const data = await fetchJson(`${RPO_SEARCH}?identifier=${encodeURIComponent(padded)}&onlyActive=true`, {
    signal,
    timeoutMs: 4500
  });
  const row = data?.results?.[0];
  if (!row) return null;
  const addr = formatRpoAddress(row.addresses?.[0]);
  const legalForm = pickLatest(row.legalForms);
  return {
    ico: pickLatest(row.identifiers) || padded,
    name: pickLatest(row.fullNames) || '',
    type: legalForm || row.sourceRegister?.value?.value || 'RPO ŠÚ SR',
    address: addr.address,
    city: addr.city,
    street: addr.street,
    postalCode: addr.postalCode,
    establishment: row.establishment || '',
    fileReference: row.sourceRegister?.registrationNumbers?.[0]?.value || '',
    source: 'ŠÚ SR RPO (api.statistics.sk)'
  };
}

async function fetchFromStatisticsSkRpoByName(name, signal) {
  const query = String(name || '').trim();
  if (query.length < 2) return [];
  const data = await fetchJson(
    `${RPO_SEARCH}?fullName=${encodeURIComponent(query)}&onlyActive=true`,
    { signal, timeoutMs: 5000 }
  );
  const rows = Array.isArray(data?.results) ? data.results.slice(0, 8) : [];
  return rows.map((row) => {
    const addr = formatRpoAddress(row.addresses?.[0]);
    return {
      ico: pickLatest(row.identifiers) || '',
      name: pickLatest(row.fullNames) || '',
      type: pickLatest(row.legalForms) || row.sourceRegister?.value?.value || 'RPO ŠÚ SR',
      address: addr.address,
      city: addr.city,
      street: addr.street,
      postalCode: addr.postalCode,
      establishment: row.establishment || '',
      source: 'ŠÚ SR RPO (api.statistics.sk)'
    };
  }).filter((row) => row.name || row.ico);
}

async function fetchFromRegisterUz(ico, signal) {
  const padded = padIco(ico);
  const id = await fetchRegisterUzId(padded, signal);
  if (!id) return null;
  const detail = await fetchJson(`${REGISTER_UZ_DETAIL}?id=${encodeURIComponent(id)}`, {
    signal,
    timeoutMs: 4500
  });
  if (!detail?.nazovUJ) return null;
  const city = String(detail.mesto || '').trim();
  const street = String(detail.ulica || '').trim();
  const postalCode = String(detail.psc || '').trim();
  return {
    ico: String(detail.ico || padded),
    name: String(detail.nazovUJ).trim(),
    type: detail.pravnaForma ? `Právna forma: ${detail.pravnaForma}` : 'Registrovaný subjekt SR (RÚZ)',
    address: [street, [postalCode, city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    city,
    street,
    postalCode,
    dic: String(detail.dic || '').trim(),
    skNace: String(detail.skNace || '').trim(),
    establishment: String(detail.datumZalozenia || '').trim(),
    registerUzId: id,
    source: 'RegisterUZ.sk (MF SR)'
  };
}

/**
 * Slovensko.Digital open Datahub mirrors RegisterUZ IDs (free JSON, no token).
 * Resolve id via RegisterUZ list, then enrich from datahub.
 */
async function fetchFromSlovenskoDigital(ico, signal, knownId = null) {
  const padded = padIco(ico);
  const id = knownId || await fetchRegisterUzId(padded, signal);
  if (!id) return null;
  const detail = await fetchJson(`${SD_DATAHUB_RUZ}/${encodeURIComponent(id)}`, {
    signal,
    timeoutMs: 4500
  });
  if (!detail || (!detail.corporate_body_name && !detail.cin)) return null;
  const city = String(detail.city || detail.municipality?.name_sk || '').trim();
  const street = String(detail.street || '').trim();
  const postalCode = String(detail.postal_code || '').trim();
  const legalForm = detail.legal_form?.name_sk || '';
  const skNace = detail.sk_nace_category?.code || detail.sk_nace_category?.name_sk || '';
  return {
    ico: String(detail.cin || padded),
    name: String(detail.corporate_body_name || '').trim(),
    type: legalForm || 'Slovensko.Digital Datahub',
    address: [street, [postalCode, city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    city,
    street,
    postalCode,
    dic: detail.tin != null ? String(detail.tin) : '',
    skNace: String(skNace || ''),
    establishment: detail.established_on ? String(detail.established_on) : '',
    registerUzId: id,
    source: 'Slovensko.Digital Datahub (datahub.ekosystem.slovensko.digital)'
  };
}

async function fetchFromOrsr(query, signal) {
  const value = String(query || '').trim();
  if (!value) return [];
  // NameLike=true can hang; exact / prefix match without it answers reliably.
  const data = await fetchJson(
    `${ORSR_SEARCH}?Filter.CorporateBodyFullNameOrRegistrationNumber=${encodeURIComponent(value)}`,
    { signal, timeoutMs: 5000 }
  );
  const rows = Array.isArray(data?.data) ? data.data.slice(0, 8) : [];
  return rows.map((row) => {
    const street = String(row.physicalAddressLine1 || '').trim();
    const line2 = String(row.physicalAddressLine2 || '').trim();
    const city = line2.replace(/^\d[\d\s]+\s*/, '').trim() || line2;
    const postalMatch = line2.match(/\d{3}\s?\d{2}/);
    return {
      ico: String(row.registrationNumber || '').trim(),
      name: String(row.corporateBodyFullName || '').trim(),
      type: row.fileReference?.section ? `ORSR ${row.fileReference.section}` : 'Obchodný register SR',
      address: [street, line2].filter(Boolean).join(', '),
      city,
      street,
      postalCode: postalMatch ? postalMatch[0].replace(/\s/g, '') : '',
      fileReference: row.fileReference?.formattedValueSpaced || '',
      source: 'ORSR (sluzby.orsr.sk)'
    };
  }).filter((row) => row.name || row.ico);
}

function mapApinoOrg(row) {
  if (!row) return null;
  const city = String(row.municipality || '').trim();
  const street = String(row.street || '').trim();
  const postalCode = String(row.postal_code || '').trim();
  const address = String(row.address || [street, [postalCode, city].filter(Boolean).join(' ')].filter(Boolean).join(', ')).trim();
  return {
    ico: String(row.cin || '').trim(),
    name: String(row.name || '').replace(/__hl__|__\/hl__/g, '').trim(),
    type: 'Apino RPO',
    address,
    city,
    street,
    postalCode,
    source: 'Apino.sk RPO (api.apino.sk)'
  };
}

async function fetchFromApinoByIco(ico, signal) {
  const key = getApinoApiKey();
  if (!key) return null;
  const padded = padIco(ico);
  const [org, peoplePayload] = await Promise.all([
    fetchJson(`${APINO_BASE}/organizations/${encodeURIComponent(padded)}?country=SK`, {
      signal,
      timeoutMs: 5000,
      headers: { Authorization: `Bearer ${key}` }
    }),
    fetchJson(`${APINO_BASE}/organizations/${encodeURIComponent(padded)}/people?country=SK`, {
      signal,
      timeoutMs: 5000,
      headers: { Authorization: `Bearer ${key}` }
    })
  ]);

  // 300 multi-country responses return { choices, error } without name.
  if (!org || org.error || !org.name) return null;
  const mapped = mapApinoOrg(org);
  if (!mapped) return null;

  const people = Array.isArray(peoplePayload?.data)
    ? peoplePayload.data
      .filter((person) => person?.is_current !== false)
      .map((person) => ({
        name: String(person.person_name || '').trim(),
        role: String(person.role_description || person.role_type || '').trim(),
        roleType: String(person.role_type || '').trim(),
        validFrom: person.valid_from || ''
      }))
      .filter((person) => person.name)
    : [];

  if (people.length) mapped.people = people;
  return mapped;
}

async function fetchFromApinoByName(name, signal) {
  const key = getApinoApiKey();
  if (!key) return [];
  const query = String(name || '').trim();
  if (query.length < 2) return [];
  const data = await fetchJson(
    `${APINO_BASE}/organizations?name=${encodeURIComponent(query)}&country_code=SK`,
    {
      signal,
      timeoutMs: 5000,
      headers: { Authorization: `Bearer ${key}` }
    }
  );
  const rows = Array.isArray(data?.data) ? data.data.slice(0, 8) : [];
  return rows.map(mapApinoOrg).filter(Boolean);
}

async function lookupEntityByIco(ico, signal) {
  const padded = padIco(ico);
  if (!/^\d{6,10}$/.test(cleanIco(ico))) return null;

  const registerUzId = await fetchRegisterUzId(padded, signal);

  const [rpo, ruz, sd, orsrRows, apino] = await Promise.all([
    fetchFromStatisticsSkRpoByIco(padded, signal),
    fetchFromRegisterUz(padded, signal),
    fetchFromSlovenskoDigital(padded, signal, registerUzId),
    fetchFromOrsr(padded, signal),
    fetchFromApinoByIco(padded, signal)
  ]);

  return mergeEntities([apino, rpo, ruz, sd, ...(orsrRows || [])]);
}

async function searchEntitiesByQuery(query, signal) {
  const value = String(query || '').trim();
  if (!value) return [];
  const digits = cleanIco(value);

  if (/^\d{6,10}$/.test(digits)) {
    const entity = await lookupEntityByIco(digits, signal);
    return entity ? [entity] : [];
  }

  const [rpoRows, orsrRows, apinoRows] = await Promise.all([
    fetchFromStatisticsSkRpoByName(value, signal),
    fetchFromOrsr(value, signal),
    fetchFromApinoByName(value, signal)
  ]);

  const byIco = new Map();
  for (const row of [...(apinoRows || []), ...(rpoRows || []), ...(orsrRows || [])]) {
    const key = padIco(row.ico) || row.name;
    const existing = byIco.get(key);
    byIco.set(key, existing ? mergeEntities([existing, row]) : row);
  }

  // Enrich first few IČO hits via RegisterUZ + Slovensko.Digital + Apino people when possible.
  const enriched = [];
  for (const row of [...byIco.values()].slice(0, 5)) {
    if (!row.ico) {
      enriched.push(row);
      continue;
    }
    const [ruz, sd, apino] = await Promise.all([
      fetchFromRegisterUz(row.ico, signal),
      fetchFromSlovenskoDigital(row.ico, signal),
      fetchFromApinoByIco(row.ico, signal)
    ]);
    enriched.push(mergeEntities([row, apino, ruz, sd]) || row);
  }
  return enriched.filter(Boolean).slice(0, 10);
}

module.exports = {
  cleanIco,
  padIco,
  mergeEntities,
  compactSourceLabel,
  formatRpoAddress,
  lookupEntityByIco,
  searchEntitiesByQuery,
  fetchFromStatisticsSkRpoByIco,
  fetchFromStatisticsSkRpoByName,
  fetchFromRegisterUz,
  fetchFromSlovenskoDigital,
  fetchFromOrsr,
  fetchFromApinoByIco,
  fetchFromApinoByName,
  getApinoApiKey
};
