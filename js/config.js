/**
 * Public Supabase settings. The anon key is not a new secret: it is read from
 * configuration already provided to the page (window or meta). Nothing here
 * is logged.
 */

export function readExistingAnonKey() {
    const values = [];
    if (typeof globalThis !== 'undefined') {
        values.push(globalThis.AGROGIS_SUPABASE_ANON_KEY, globalThis.SUPABASE_ANON_KEY);
    }
    if (typeof document !== 'undefined') {
        const meta = document.querySelector('meta[name="agrogis-supabase-anon-key"]');
        if (meta) values.push(meta.getAttribute('content'));
    }
    for (const value of values) {
        if (typeof value !== 'string') continue;
        const key = value.trim();
        if (key.length < 20) continue;
        if (/replace|change-me|changeme|your-anon|placeholder/i.test(key)) continue;
        return key;
    }
    return '';
}
