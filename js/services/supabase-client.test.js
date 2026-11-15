/**
 * Sanity checks for the browser Supabase client module (source inspection; no network).
 */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const source = readFileSync(path.join(__dirname, 'supabase-client.js'), 'utf8');

test('supabase-client pins the project URL and exposes CRUD helpers', () => {
  assert.match(source, /mwvtwfmerozjelyymmxg\.supabase\.co/);
  assert.match(source, /export async function fetchVcelnice/);
  assert.match(source, /export async function insertVcelnica/);
  assert.match(source, /export async function insertEvidenciaPostreku/);
  assert.match(source, /export async function getApiariesInBuffer/);
  assert.match(source, /get_apiaries_in_buffer/);
  assert.match(source, /from\('vcelnice'\)/);
  assert.match(source, /from\('evidencia_postrekov'\)/);
});

test('mapVcelnicaRow handles GeoJSON and required fields', () => {
  assert.match(source, /function mapVcelnicaRow/);
  assert.match(source, /geom_geojson/);
  assert.match(source, /pocet_rodin/);
  assert.match(source, /typ_stanovista/);
});
