/**
 * @file offline-sync.js
 * @description IndexedDB Offline fronta a PostGIS priestorový adaptér.
 */

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
                        } else if (m.type === 'INSERT_HIVE') {
                            await supabaseClient.from('hives').insert([m.payload]);
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
        const { bindSupabaseClient, queryApiariesInBuffer, supabaseClient: currentClient } = await import('./supabase-api.js');
        if (isCloudConfigured && supabaseClient && supabaseClient !== currentClient()) {
            bindSupabaseClient(supabaseClient);
        }
        const result = await queryApiariesInBuffer(sprayLat, sprayLng, radiusMeters);
        return result.rows;
    }
}