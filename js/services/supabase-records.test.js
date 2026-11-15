const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const records = import(`data:text/javascript;base64,${Buffer.from(readFileSync(path.join(__dirname, 'supabase-records.js'))).toString('base64')}`);

test('apiary rows accept the vcelnice shape and GeoJSON points', async () => {
    const { mapApiaryRow, mapCollisionRow } = await records;
    const apiary = mapApiaryRow({
        id: 7,
        nazov: 'Lesná <včelnica>',
        pocet_rodin: '12',
        geom: { type: 'Point', coordinates: [17.55, 48.48] }
    });
    assert.equal(apiary.name, 'Lesná <včelnica>');
    assert.equal(apiary.count, 12);
    assert.equal(apiary.lat, 48.48);
    assert.equal(apiary.lng, 17.55);

    const collision = mapCollisionRow({
        hive_id: 7,
        hive_name: 'Lesná',
        hive_count: 12,
        lat: 48.48,
        lng: 17.55,
        distance_meters: 1200
    });
    assert.equal(collision.hive_id, 7);
    assert.equal(collision.distance_meters, 1200);
});

test('insert drops unknown columns and falls back when the table is missing', async () => {
    const { insertAdaptive } = await records;
    const calls = [];
    const client = {
        from(table) {
            return {
                insert(payload) {
                    calls.push({ table, payload: { ...payload } });
                    if (table === 'vcelnice') {
                        return Promise.resolve({ error: { code: 'PGRST205', message: "Could not find the table 'public.vcelnice' in the schema cache" } });
                    }
                    if (payload.nectar_tags) {
                        return Promise.resolve({ error: { message: "Could not find the 'nectar_tags' column of 'hives' in the schema cache" } });
                    }
                    return Promise.resolve({ error: null });
                }
            };
        }
    };
    const result = await insertAdaptive(client, ['vcelnice', 'hives'], {
        name: 'Nová',
        nectar_tags: 'Agát',
        lat: 48.1,
        lng: 17.1
    });
    assert.equal(result.ok, true);
    assert.equal(result.table, 'hives');
    assert.equal(calls.at(-1).payload.nectar_tags, undefined);
    assert.equal(calls.at(-1).payload.name, 'Nová');
});

test('a missing client is a failed write', async () => {
    const { insertAdaptive } = await records;
    const result = await insertAdaptive(null, ['vcelnice'], { name: 'Nová' });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unconfigured');
});
