const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  mergeEntities,
  padIco,
  cleanIco,
  lookupEntityByIco,
  searchEntitiesByQuery,
  fetchFromSlovenskoDigital,
  fetchFromStatisticsSkRpoByIco,
  fetchFromApinoByIco,
  getApinoApiKey
} = require('./registry');

test('padIco zero-pads short IČO values', () => {
  assert.equal(padIco('123'), '00000123');
  assert.equal(padIco('47700203'), '47700203');
  assert.equal(cleanIco('47 700 203'), '47700203');
});

test('mergeEntities prefers richer address and unions sources', () => {
  const merged = mergeEntities([
    {
      ico: '47700203',
      name: 'NaVidieku.sk s. r. o.',
      city: 'Bratislava',
      source: 'ŠÚ SR RPO (api.statistics.sk)'
    },
    {
      ico: '47700203',
      name: 'NaVidieku.sk s. r. o.',
      address: 'Kadnárova 62, 83153 Bratislava - mestská časť Rača',
      city: 'Bratislava - mestská časť Rača',
      dic: '2024060687',
      source: 'RegisterUZ.sk (MF SR)'
    },
    {
      ico: '47700203',
      name: 'NaVidieku.sk s. r. o.',
      address: 'Kadnárova 62, 831 53 Bratislava',
      fileReference: 'Sro 97909/B',
      source: 'ORSR (sluzby.orsr.sk)'
    },
    {
      ico: '47700203',
      name: 'NaVidieku.sk s. r. o.',
      dic: '2024060687',
      source: 'Slovensko.Digital Datahub (datahub.ekosystem.slovensko.digital)'
    }
  ]);

  assert.equal(merged.ico, '47700203');
  assert.equal(merged.dic, '2024060687');
  assert.equal(merged.fileReference, 'Sro 97909/B');
  assert.match(merged.address, /Kadnárova/);
  assert.ok(merged.sources.length >= 3);
  assert.match(merged.source, /statistics\.sk|RPO/i);
  assert.match(merged.source, /RegisterUZ/);
  assert.match(merged.source, /ORSR/);
  assert.match(merged.source, /Slovensko\.Digital/);
});

test('live IČO lookup returns merged public registry data for a known company', async () => {
  const entity = await lookupEntityByIco('47700203');
  assert.ok(entity, 'expected a live registry hit');
  assert.equal(String(entity.ico).replace(/\D/g, ''), '47700203');
  assert.match(entity.name, /NaVidieku/i);
  assert.ok(entity.address || entity.city, 'expected seat/address');
  assert.ok(
    /RPO|RegisterUZ|ORSR|Slovensko\.Digital|statistics\.sk/i.test(entity.source || ''),
    `unexpected source: ${entity.source}`
  );
});

test('api.statistics.sk RPO answers for a known IČO', async (t) => {
  const entity = await fetchFromStatisticsSkRpoByIco('47700203');
  if (!entity) {
    t.skip('ŠÚ SR RPO temporarily unavailable (rate limit / network)');
    return;
  }
  assert.match(entity.name, /NaVidieku/i);
  assert.match(entity.source, /statistics\.sk/);
});

test('Slovensko.Digital Datahub RUZ answers via shared RegisterUZ id', async () => {
  const entity = await fetchFromSlovenskoDigital('47700203');
  assert.ok(entity, 'expected Slovensko.Digital Datahub hit');
  assert.match(entity.name, /NaVidieku/i);
  assert.match(entity.source, /Slovensko\.Digital/);
});

test('live name search finds companies without paid keys', async () => {
  const rows = await searchEntitiesByQuery('NaVidieku');
  assert.ok(Array.isArray(rows));
  assert.ok(
    rows.some((row) => String(row.ico || '').includes('47700203')),
    `expected IČO 47700203 in ${JSON.stringify(rows.map((r) => r.ico))}`
  );
});

test('Apino RPO returns organization and people when APINO_API_KEY is set', async (t) => {
  if (!getApinoApiKey()) {
    t.skip('APINO_API_KEY not configured');
    return;
  }
  const entity = await fetchFromApinoByIco('47700203');
  if (!entity) {
    t.skip('Apino temporarily unavailable');
    return;
  }
  assert.match(entity.name, /NaVidieku/i);
  assert.ok(Array.isArray(entity.people));
  assert.ok(entity.people.length >= 1);
  assert.match(entity.source, /Apino/);
});
