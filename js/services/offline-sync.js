/**
 * @file offline-sync.js
 * @description IndexedDB Offline fronta a PostGIS priestorový adaptér (Supabase).
 */

import { store } from '../core/state-store.js';
import { AgroApiService } from './api.js';
import { showNotificationToast } from '../components/event-bus.js';
import { getApiariesInBuffer } from './supabase-client.js';

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

    static async synchronize(supabaseClient, isCloudConfigured) {
        if (!navigator.onLine || !isCloudConfigured || !supabaseClient) return;
        try {
            const db = await this.openDB();
            const tx = db.transaction([STORE_NAME], 'readwrite');
            const objectStore = tx.objectStore(STORE_NAME);
            const request = objectStore.getAll();

            request.onsuccess = async () => {
                const mutations = request.result;
                if (!mutations || mutations.length === 0) return;

                for (const m of mutations) {
                    try {
                        if (m.type === 'UPSERT_ENTITY') {
                            await supabaseClient.from('registered_entities').upsert([m.payload], { onConflict: 'ico' });
                        } else if (m.type === 'INSERT_HIVE' || m.type === 'INSERT_VCELNICA') {
                            await supabaseClient.from('vcelnice').insert([m.payload]);
                        } else if (m.type === 'INSERT_SPRAY' || m.type === 'INSERT_EVIDENCIA_POSTREKU') {
                            await supabaseClient.from('evidencia_postrekov').insert([m.payload]);
                        }
                        const deleteTx = db.transaction([STORE_NAME], 'readwrite');
                        deleteTx.objectStore(STORE_NAME).delete(m.id);
                    } catch (syncErr) {}
                }
                showNotificationToast('✅ Offline fronta bola zosynchronizovaná so Supabase.', 'success');
            };
        } catch (error) {}
    }

    static async executeSpatialCollisionCheck(supabaseClient, isCloudConfigured, sprayLat, sprayLng, radiusMeters = 3000) {
        if (isCloudConfigured && supabaseClient && navigator.onLine) {
            try {
                const rows = await getApiariesInBuffer(supabaseClient, sprayLat, sprayLng, radiusMeters);
                if (Array.isArray(rows) && rows.length > 0) {
                    return rows.map((row) => ({
                        hive_id: row.hive_id ?? row.id,
                        hive_name: row.hive_name ?? row.nazov,
                        hive_count: Number(row.hive_count ?? row.pocet_rodin) || 0,
                        hive_email: row.hive_email ?? row.email ?? 'ochrana@vcelari.sk',
                        hive_cevz: row.hive_cevz ?? row.cevz ?? 'CEVZ-SR',
                        lat: Number(row.lat),
                        lng: Number(row.lng),
                        distance_meters: Number(row.distance_meters)
                    }));
                }
            } catch (err) {
                try {
                    const { data, error } = await supabaseClient.rpc('check_spray_collision_optimized', {
                        spray_lat: sprayLat,
                        spray_lng: sprayLng,
                        radius_meters: radiusMeters
                    });
                    if (!error && Array.isArray(data) && data.length > 0) return data;
                } catch {
                    /* fall through to local */
                }
            }
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
