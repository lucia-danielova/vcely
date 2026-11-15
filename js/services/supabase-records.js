export function numberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

export function pointFromRow(row) {
    const lat = numberOrNull(row?.lat ?? row?.latitude ?? row?.zem_sirka ?? row?.center_lat);
    const lng = numberOrNull(row?.lng ?? row?.lon ?? row?.longitude ?? row?.zem_dlzka ?? row?.center_lng);
    if (lat != null && lng != null) return { lat, lng };
    const geom = row?.geom;
    if (geom && geom.type === 'Point' && Array.isArray(geom.coordinates)) {
        return {
            lat: numberOrNull(geom.coordinates[1]),
            lng: numberOrNull(geom.coordinates[0])
        };
    }
    return { lat: null, lng: null };
}

export function mapApiaryRow(row) {
    const point = pointFromRow(row);
    return {
        id: row?.id ?? row?.hive_id ?? row?.vcelnica_id,
        name: row?.name || row?.nazov || row?.hive_name || 'Včelnica',
        count: Number(row?.count ?? row?.colony_count ?? row?.pocet_rodin ?? row?.hive_count ?? 0) || 0,
        email: row?.email || row?.contact_email || row?.hive_email || '',
        cevz: row?.cevz || row?.hive_cevz || '',
        lat: point.lat,
        lng: point.lng,
        siteType: row?.site_type || row?.typ || 'permanent',
        nectarTags: row?.nectar_tags || row?.znaska || '',
        remote: true
    };
}

export function mapCollisionRow(row) {
    const point = pointFromRow(row);
    const distance = numberOrNull(row?.distance_meters ?? row?.distance ?? row?.vzdialenost_m);
    return {
        hive_id: row?.hive_id ?? row?.id ?? row?.vcelnica_id,
        hive_name: row?.hive_name || row?.name || row?.nazov || 'Včelnica',
        hive_count: Number(row?.hive_count ?? row?.count ?? row?.colony_count ?? row?.pocet_rodin ?? 0) || 0,
        hive_email: row?.hive_email || row?.email || row?.contact_email || '',
        hive_cevz: row?.hive_cevz || row?.cevz || '',
        lat: point.lat,
        lng: point.lng,
        distance_meters: distance == null ? Number.POSITIVE_INFINITY : distance
    };
}

export function isMissingTable(error) {
    const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`;
    return /PGRST205|42P01|does not exist|Could not find the table/i.test(text);
}

export function missingColumn(error) {
    const match = String(error?.message || '').match(/Could not find the '([^']+)' column/i);
    return match ? match[1] : '';
}

export function apiaryInsertRow(hive) {
    const count = Number(hive.count) || 1;
    return {
        name: hive.name,
        colony_count: count,
        count,
        cevz: hive.cevz || null,
        email: hive.email || null,
        contact_email: hive.email || null,
        lat: hive.lat,
        lng: hive.lng,
        site_type: hive.siteType || 'permanent',
        nectar_tags: hive.nectarTags || '',
        geom: { type: 'Point', coordinates: [hive.lng, hive.lat] }
    };
}

export function sprayInsertRow(entry) {
    const applied = entry.when ? new Date(entry.when) : new Date();
    const appliedAt = Number.isNaN(applied.getTime()) ? new Date().toISOString() : applied.toISOString();
    return {
        parcel_label: entry.parcel,
        parcela: entry.parcel,
        area_ha: entry.areaHa,
        vymera_ha: entry.areaHa,
        product_name: entry.product,
        pripravok: entry.product,
        wind_ms: entry.windMs,
        vietor_ms: entry.windMs,
        temp_c: entry.tempC,
        teplota_c: entry.tempC,
        applied_at: appliedAt,
        toxicity: entry.toxicity || '',
        toxicita: entry.toxicity || '',
        spray_window: entry.sprayWindow || '',
        okno: entry.sprayWindow || '',
        lat: entry.lat,
        lng: entry.lng
    };
}

export async function insertAdaptive(client, tables, row) {
    if (!client || typeof client.from !== 'function') {
        return { ok: false, reason: 'unconfigured' };
    }
    let payload = { ...row };
    let index = 0;
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const table = tables[index];
        if (!table) return { ok: false, reason: 'schema mismatch' };
        const { error } = await client.from(table).insert(payload);
        if (!error) return { ok: true, table };
        const column = missingColumn(error);
        if (column && Object.prototype.hasOwnProperty.call(payload, column)) {
            delete payload[column];
            continue;
        }
        if (isMissingTable(error) && index < tables.length - 1) {
            index += 1;
            payload = { ...row };
            continue;
        }
        return { ok: false, reason: 'rejected' };
    }
    return { ok: false, reason: 'schema mismatch' };
}
