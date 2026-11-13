const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  isValidLpisId,
  isLpisSourceConfigured,
  normalizeLpisParcel,
  fetchLpisParcelsFromSource,
  listLocalLpisParcels
} = require('./lpis');

test('isValidLpisId accepts common LPIS identifiers and rejects unsafe input', () => {
  assert.equal(isValidLpisId('LPIS-NR-4401/A'.replace('/', '_')), true);
  assert.equal(isValidLpisId('ABC123'), true);
  assert.equal(isValidLpisId('ab'), false);
  assert.equal(isValidLpisId(''), false);
  assert.equal(isValidLpisId("1'; DROP TABLE app_users;--"), false);
  assert.equal(isValidLpisId('x'.repeat(65)), false);
});

test('normalizeLpisParcel maps varied upstream field names to the canonical shape', () => {
  const geometry = { type: 'Polygon', coordinates: [[[17.1, 48.1], [17.2, 48.1], [17.2, 48.2], [17.1, 48.1]]] };
  assert.deepEqual(normalizeLpisParcel({ lpisId: 'L-1', vymeraHa: 12.5, plodina: 'Pšenica', geometry }), {
    externalRegisterId: 'L-1',
    areaHa: 12.5,
    crop: 'Pšenica',
    geometry
  });
  assert.deepEqual(normalizeLpisParcel({ blockId: 'L-2', area_ha: '3.5' }), {
    externalRegisterId: 'L-2',
    areaHa: 3.5,
    crop: 'Neurčená plodina',
    geometry: null
  });
  assert.equal(normalizeLpisParcel({ areaHa: 5 }), null);
  assert.equal(normalizeLpisParcel(null), null);
});

test('fetchLpisParcelsFromSource queries the configured source and normalizes the list payload', async () => {
  const seen = [];
  const parcels = await fetchLpisParcelsFromSource({
    lpisId: 'FARM-7',
    baseUrl: 'https://lpis.example.test/api',
    fetchImpl: async (url) => {
      seen.push(url);
      return new Response(JSON.stringify({ parcels: [{ id: 'L-9', areaHa: 1.25 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  });

  assert.equal(seen[0], 'https://lpis.example.test/api?lpisId=FARM-7');
  assert.deepEqual(parcels, [{ externalRegisterId: 'L-9', areaHa: 1.25, crop: 'Neurčená plodina', geometry: null }]);
});

test('fetchLpisParcelsFromSource fails with LPIS_SOURCE_ERROR on non-OK and invalid payloads', async () => {
  await assert.rejects(
    fetchLpisParcelsFromSource({
      lpisId: 'FARM-7',
      baseUrl: 'https://lpis.example.test/api',
      fetchImpl: async () => new Response('upstream down', { status: 502 })
    }),
    (error) => error.code === 'LPIS_SOURCE_ERROR' && error.status === 502
  );

  await assert.rejects(
    fetchLpisParcelsFromSource({
      lpisId: 'FARM-7',
      baseUrl: 'https://lpis.example.test/api',
      fetchImpl: async () => new Response(JSON.stringify({ unexpected: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }),
    (error) => error.code === 'LPIS_SOURCE_ERROR'
  );
});

test('fetchLpisParcelsFromSource returns an empty list when no source is configured', async () => {
  const parcels = await fetchLpisParcelsFromSource({ lpisId: 'FARM-7', baseUrl: '' });
  assert.deepEqual(parcels, []);
});

test('isLpisSourceConfigured reflects the LPIS_API_URL environment variable', () => {
  assert.equal(isLpisSourceConfigured({ LPIS_API_URL: 'https://lpis.example.test' }), true);
  assert.equal(isLpisSourceConfigured({}), false);
  assert.equal(isLpisSourceConfigured({ LPIS_API_URL: '   ' }), false);
});

test('listLocalLpisParcels scopes the query to the user and optional LPIS prefix', async () => {
  const calls = [];
  const pool = {
    async query(text, params) {
      calls.push({ text, params });
      return {
        rows: [{
          externalRegisterId: 'LPIS-NR-4401',
          areaHa: 64.82,
          crop: 'Repka olejná',
          geometry: { type: 'Polygon', coordinates: [[[17.9, 48.4], [17.99, 48.4], [17.99, 48.41], [17.9, 48.4]]] }
        }]
      };
    }
  };

  const withFilter = await listLocalLpisParcels(pool, 'user-1', 'LPIS-NR');
  assert.equal(calls[0].params.length, 2);
  assert.deepEqual(calls[0].params, ['user-1', 'LPIS-NR%']);
  assert.match(calls[0].text, /ILIKE \$2/);
  assert.equal(withFilter[0].externalRegisterId, 'LPIS-NR-4401');
  assert.equal(withFilter[0].areaHa, 64.82);

  const withoutFilter = await listLocalLpisParcels(pool, 'user-1');
  assert.equal(withoutFilter.length, 1);
  assert.deepEqual(calls[1].params, ['user-1']);
});
