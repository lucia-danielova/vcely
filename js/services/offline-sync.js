/**
 * @file offline-sync.js
 * @description IndexedDB Offline fronta a PostGIS priestorový adaptér.
 */

import { store } from '../core/state-store.js';
import { AgroApiService } from './api.js';
import { showNotificationToast } from '../components/event-bus.js';

const DB_NAME = 'AgrogisEnterpriseDB';
const STORE_NAME = 'offline_mutations';
const DB_VERSION = 1;

export class OfflineSyncService {
    static openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = (e) => reject(e.target.error);
            request.onsuccess = (e) => resolve(e.target.result);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                }
            };
        });
    }

    static async enqueueMutation(type, payload) {
        try {
            const db = await this.openDB();
            const tx = db.transaction([STORE_NAME], 'readwrite');
            tx.objectStore(STORE_NAME).add({ type, payload, createdAt: new Date().toISOString() });
        } catch (error) {}
    }

    static async _readMutations() {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_NAME], 'readonly');
            const request = tx.objectStore(STORE_NAME).getAll();
            request.onsuccess = () => resolve({ db, mutations: request.result || [] });
            request.onerror = () => reject(request.error);
        });
    }

    static async _deleteMutation(db, id) {
        const deleteTx = db.transaction([STORE_NAME], 'readwrite');
        deleteTx.objectStore(STORE_NAME).delete(id);
    }

    static async synchronize(supabaseClient, isCloudConfigured) {
        if (!navigator.onLine || !isCloudConfigured || !supabaseClient) return;
        try {
            const { db, mutations } = await this._readMutations();
            const cloud = mutations.filter((m) => m.type === 'UPSERT_ENTITY' || m.type === 'INSERT_HIVE');
            if (!cloud.length) return;
            let flushed = 0;
            for (const m of cloud) {
                try {
                    if (m.type === 'UPSERT_ENTITY') {
                        await supabaseClient.from('registered_entities').upsert([m.payload], { onConflict: 'ico' });
                    } else if (m.type === 'INSERT_HIVE') {
                        await supabaseClient.from('hives').insert([m.payload]);
                    }
                    await this._deleteMutation(db, m.id);
                    flushed += 1;
                } catch (syncErr) {}
            }
            if (flushed) showNotificationToast('✅ Offline fronta bola zosynchronizovaná so Supabase.', 'success');
        } catch (error) {}
    }

    static async synchronizeBackend(api) {
        if (!navigator.onLine || !api?.hasToken?.()) return 0;
        try {
            const { db, mutations } = await this._readMutations();
            const pending = mutations.filter((m) => String(m.type || '').startsWith('API_'));
            if (!pending.length) return 0;
            let flushed = 0;
            for (const m of pending) {
                try {
                    if (m.type === 'API_SAVE_HIVE') await api.saveHive(m.payload);
                    else if (m.type === 'API_SAVE_PARCEL') await api.saveParcel(m.payload);
                    else if (m.type === 'API_SPRAY_ALERT') await api.reportSprayAlert(m.payload);
                    else continue;
                    await this._deleteMutation(db, m.id);
                    flushed += 1;
                } catch (syncErr) {
                    if (!api.isUnavailable?.(syncErr) && syncErr.status && syncErr.status < 500) {
                        await this._deleteMutation(db, m.id);
                    }
                }
            }
            if (flushed) showNotificationToast(`✅ ${flushed} záznamov sa dorazilo do cloudu.`, 'success');
            return flushed;
        } catch (error) {
            return 0;
        }
    }

    static async executeSpatialCollisionCheck(supabaseClient, isCloudConfigured, sprayLat, sprayLng, radiusMeters = 3000) {
        if (isCloudConfigured && supabaseClient && navigator.onLine) {
            try {
                const buffer = await supabaseClient.rpc('get_apiaries_in_buffer', {
                    p_lat: sprayLat,
                    p_lng: sprayLng,
                    p_radius_m: radiusMeters
                });
                if (!buffer.error && Array.isArray(buffer.data) && buffer.data.length > 0) {
                    return buffer.data.map((row) => ({
                        hive_id: row.hive_id ?? row.id,
                        hive_name: row.hive_name || row.nazov || row.name || 'Včelnica',
                        hive_count: Number(row.hive_count ?? row.pocet_rodin ?? row.count ?? 0),
                        hive_email: row.hive_email || row.email || '',
                        hive_cevz: row.hive_cevz || row.cevz || '',
                        lat: Number(row.lat),
                        lng: Number(row.lng),
                        distance_meters: Number(row.distance_meters ?? row.vzdialenost_m ?? 0)
                    }));
                }
                const { data, error } = await supabaseClient.rpc('check_spray_collision_optimized', {
                    spray_lat: sprayLat,
                    spray_lng: sprayLng,
                    radius_meters: radiusMeters
                });
                if (!error && Array.isArray(data) && data.length > 0) return data;
            } catch (err) {}
        }

        const allHives = store.getState().hives;
        const collisions = [];

        for (const hive of allHives) {
            const dist = AgroApiService.calculateDistanceMeters(sprayLat, sprayLng, hive.lat, hive.lng);
            if (dist <= radiusMeters) {
                collisions.push({
                    hive_id: hive.id,
                    hive_name: hive.name,
                    hive_count: Number(hive.count) || 0,
                    hive_email: hive.email || 'ochrana@vcelari.sk',
                    hive_cevz: hive.cevz || 'CEVZ-SR',
                    lat: hive.lat,
                    lng: hive.lng,
                    distance_meters: dist
                });
            }
        }

        collisions.sort((a, b) => a.distance_meters - b.distance_meters);
        return collisions;
    }
}