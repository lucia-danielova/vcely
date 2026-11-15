# Supabase / PostGIS (Včely a pôda)

Project URL: `https://mwvtwfmerozjelyymmxg.supabase.co`

## Anon key (public)

The browser client resolves the anon key from, in order:

1. `window.__VCELY_SUPABASE_ANON_KEY__`
2. `<meta name="supabase-anon-key" content="…">` in `index.html`
3. `localStorage.vcely_supabase_anon_key`

Never commit the service_role key. The anon key is safe for the client when RLS is enabled.

## Schema

Run `database/supabase-postgis.sql` in the Supabase SQL editor. It creates:

- `vcelnice` — apiaries with generated PostGIS `geography` point
- `evidencia_postrekov` — spray book entries
- RPC `get_apiaries_in_buffer(spray_lat, spray_lng, radius_meters)` — 3 km collision check

## App wiring

- `js/services/supabase-client.js` — client + CRUD helpers
- `js/app.js` — loads `vcelnice` onto the map, saves hives/sprays
- `js/services/offline-sync.js` — IndexedDB queue + spatial collision (RPC then local haversine)
- Leaflet draws `L.circle(..., { radius: 3000 })` for each apiary when radii are visible
