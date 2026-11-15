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
  assert.ok(merged.source.length <= 120, `source too long for DB: ${merged.source}`);
  assert.match(merged.source, /RPO/);
  assert.match(merged.source, /RÚZ|RUZ/i);
  assert.match(merged.source, /ORSR/);
  assert.match(merged.source, /Datahub|Apino/);
  assert.ok(merged.sources.some((s) => /RegisterUZ/i.test(s)));
  assert.ok(merged.sources.some((s) => /Slovensko\.Digital|ORSR|statistics\.sk/i.test(s)));
});

test('compact source label stays within VARCHAR(120)', () => {
  const { compactSourceLabel } = require('./registry');
  const label = compactSourceLabel([
    'ŠÚ SR RPO (api.statistics.sk)',
    'RegisterUZ.sk (MF SR)',
    'ORSR (sluzby.orsr.sk)',
    'Slovensko.Digital Datahub (datahub.ekosystem.slovensko.digital)',
    'Apino.sk RPO (api.apino.sk)'
  ]);
  assert.ok(label.length <= 120);
  assert.match(label, /Apino/);
  assert.match(label, /RPO/);
  assert.match(label, /RÚZ|ORSR|Datahub/);
});

test('re-merge keeps full sources and expands compacted labels', () => {
  const first = mergeEntities([
    { ico: '47700203', name: 'NaVidieku.sk s. r. o.', source: 'ŠÚ SR RPO (api.statistics.sk)' },
    { ico: '47700203', name: 'NaVidieku.sk s. r. o.', source: 'ORSR (sluzby.orsr.sk)' }
  ]);
  const second = mergeEntities([
    first,
    { ico: '47700203', name: 'NaVidieku.sk s. r. o.', source: 'RegisterUZ.sk (MF SR)' },
    {
      ico: '47700203',
      name: 'NaVidieku.sk s. r. o.',
      source: 'Slovensko.Digital Datahub (datahub.ekosystem.slovensko.digital)'
    }
  ]);

  assert.ok(second.sources.some((s) => /statistics\.sk/i.test(s)));
  assert.ok(second.sources.some((s) => /ORSR/i.test(s)));
  assert.ok(second.sources.some((s) => /RegisterUZ/i.test(s)));
  assert.ok(second.sources.some((s) => /Slovensko\.Digital/i.test(s)));
  assert.equal(second.sources.some((s) => String(s).includes('+')), false);
  assert.ok(second.source.length <= 120);
  assert.match(second.source, /RPO/);
  assert.match(second.source, /ORSR/);
  assert.match(second.source, /RÚZ/);
  assert.match(second.source, /Datahub/);

  // Compacted-only input must still expand all tokens, not collapse to RPO.
  const fromCompact = mergeEntities([
    { ico: '47700203', name: 'X', source: 'RPO+ORSR', sources: ['ŠÚ SR RPO (api.statistics.sk)', 'ORSR (sluzby.orsr.sk)'] },
    { ico: '47700203', name: 'X', source: 'RegisterUZ.sk (MF SR)' }
  ]);
  assert.match(fromCompact.source, /RPO/);
  assert.match(fromCompact.source, /ORSR/);
  assert.match(fromCompact.source, /RÚZ/);
  assert.ok(fromCompact.sources.some((s) => /RegisterUZ/i.test(s)));
  assert.ok(fromCompact.sources.some((s) => /statistics\.sk|ORSR/i.test(s)));
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
