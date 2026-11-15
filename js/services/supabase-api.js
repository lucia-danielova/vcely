import { store } from '../core/state-store.js';
import { AgroApiService } from './api.js';
import {
    apiaryInsertRow,
    insertAdaptive,
    isMissingTable,
    mapApiaryRow,
    mapCollisionRow,
    sprayInsertRow
} from './supabase-records.js';

let boundClient = null;

const BUFFER_CALLS = [
    ['get_apiaries_in_buffer', (lat, lng, radius) => ({ lat, lng, radius_meters: radius })],
    ['get_apiaries_in_buffer', (lat, lng, radius) => ({ p_lat: lat, p_lng: lng, p_radius_meters: radius })],
    ['get_apiaries_in_buffer', (lat, lng, radius) => ({ spray_lat: lat, spray_lng: lng, radius_meters: radius })],
    ['check_spray_collision_optimized', (lat, lng, radius) => ({ spray_lat: lat, spray_lng: lng, radius_meters: radius })]
];

let workingCall = null;

export function bindSupabaseClient(client) {
    boundClient = client || null;
    workingCall = null;
}

export function supabaseClient() {
    return boundClient;
}

function localCollisions(lat, lng, radius) {
    return (store.getState().hives || [])
        .map((hive) => ({
            hive_id: hive.id,
            hive_name: hive.name,
            hive_count: Number(hive.count) || 0,
            hive_email: hive.email || '',
            hive_cevz: hive.cevz || '',
            lat: Number(hive.lat),
            lng: Number(hive.lng),
            distance_meters: AgroApiService.calculateDistanceMeters(lat, lng, Number(hive.lat), Number(hive.lng))
        }))
        .filter((row) => Number.isFinite(row.distance_meters) && row.distance_meters <= radius)
        .sort((a, b) => a.distance_meters - b.distance_meters);
}

async function callBuffer(client, lat, lng, radius) {
    const attempts = workingCall ? [workingCall] : BUFFER_CALLS;
    let lastError = null;
    for (const attempt of attempts) {
        try {
            const { data, error } = await client.rpc(attempt[0], attempt[1](lat, lng, radius));
            if (!error && Array.isArray(data)) {
                workingCall = attempt;
                return {
                    ok: true,
                    rows: data
                        .map(mapCollisionRow)
                        .filter((row) => Number.isFinite(row.distance_meters) && row.distance_meters <= radius)
                        .sort((a, b) => a.distance_meters - b.distance_meters)
                };
            }
            lastError = error;
            if (error && !/PGRST202|Could not find the function|schema cache/i.test(`${error.code || ''} ${error.message || ''}`)) {
                break;
            }
        } catch (error) {
            lastError = error;
        }
    }
    workingCall = null;
    return { ok: false, rows: [], reason: lastError ? 'rejected' : 'failed' };
}

export async function queryApiariesInBuffer(lat, lng, radius = 3000) {
    const client = boundClient;
    if (client && typeof navigator !== 'undefined' && navigator.onLine !== false) {
        const remote = await callBuffer(client, lat, lng, radius);
        if (remote.ok) return remote;
    }
    return { ok: false, rows: localCollisions(lat, lng, radius) };
}

async function selectTable(client, table) {
    const { data, error } = await client.from(table).select('*').limit(500);
    if (!error && Array.isArray(data)) {
        return {
            ok: true,
            rows: data.map(mapApiaryRow).filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng))
        };
    }
    if (error && isMissingTable(error)) return { ok: false, missing: true, rows: [] };
    return { ok: false, missing: false, rows: [] };
}

export async function loadRemoteApiaries() {
    const client = boundClient;
    if (!client) return false;
    try {
        let selected = await selectTable(client, 'vcelnice');
        if (!selected.ok && selected.missing) selected = await selectTable(client, 'hives');
        if (!selected.ok) return false;
        const local = store.getState().hives || [];
        const merged = new Map(local.map((hive) => [String(hive.id), hive]));
        selected.rows.forEach((row) => merged.set(String(row.id), row));
        store.setState({ hives: [...merged.values()] });
        return true;
    } catch (error) {
        return false;
    }
}

export function saveRemoteApiary(hive) {
    return insertAdaptive(boundClient, ['vcelnice', 'hives'], apiaryInsertRow(hive));
}

export function saveRemoteSpray(entry) {
    return insertAdaptive(boundClient, ['evidencia_postrekov', 'spray_book'], sprayInsertRow(entry));
}
