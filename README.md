# AGROGIS SLOVENSKO

## Developer Blueprint a technická špecifikácia

Tento dokument slúži ako technický manuál pre projekt AGROGIS SLOVENSKO a obsahuje detailný rozbor štruktúry aplikácie, architektúry, implementačného plánu a databázových modelov.

---

## 1. Architektúra a technologický stack

### Database Layer: PostgreSQL + PostGIS
- Účel: relačná databáza s podporou priestorových údajov
- Funkcie: geometria, polygóny, multipolygóny, R-Tree / GiST indexy
- Použitie: spracovanie zemepisných údajov, katastrálnych parcel, LPIS blokov, včelstiev a priestorových dotazov

### Backend Layer: Node.js (Express) alebo Python (FastAPI)
- Účel: správa API endpointov, autentifikácia používateľov, validácia IČO a priestorové dotazy
- Zodpovednosť: registrácia, login, ukladanie parcel, komunikácia s externými registermi

### Frontend Layer: HTML5, Modern JavaScript (ES6+), CSS3
- Účel: interaktívne používateľské rozhranie
- Zodpovednosť: mapové vrstvy, stav aplikácie, UI komponenty, zobrazenie údajov

### Mapping Library & Services: Leaflet.js alebo OpenLayers
- Účel: vykresľovanie vektorových a rastrových vrstiev
- Protokoly: WMS a WFS pre mapové vrstvy a vyhľadávanie geografických dát

---

## 2. Detailný postup vývoja krok za krokom

### FÁZA 1: Návrh a inicializácia databázovej štruktúry (PostGIS)

Predpis pre vytvorenie základných tabuliek v PostgreSQL s podporou PostGIS:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

### Tabuľka používateľov (users)

Uchováva informácie o registrácii, typoch účtov a oprávneniach.

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT gen_random_uuid() UNIQUE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    account_type VARCHAR(50) NOT NULL,
    ico VARCHAR(10) UNIQUE,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Tabuľka priestorových objektov / parciel (parcels)

Ukladá geografické polygóny priradené k používateľom.

```sql
CREATE TABLE parcels (
    parcel_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    external_register_id VARCHAR(100),
    geom GEOMETRY(Polygon, 4328) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_parcels_geom ON parcels USING GIST (geom);
```

### Tabuľka čakajúcich požiadaviek (pending_requests)

Pre subjekty, ktoré sa nenašli v automatických registroch a vyžadujú manuálne schválenie.

```sql
CREATE TABLE pending_requests (
    request_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    submitted_data JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### FÁZA 2: Implementácia backendovej logiky a API endpointov

Backend bude spracovávať nasledujúce kľúčové trasy:

- `POST /api/auth/register`
  - prijíma údaje používateľa
  - ak je zadané IČO, backend overí jeho existenciu v externých registroch

- `POST /api/parcels/save`
  - prijíma GeoJSON polygón alebo ID parcely
  - ukladá ho do tabuľky `parcels` pre prihláseného používateľa

- `POST /api/spatial/intersect`
  - vykonáva PostGIS priestorový dotaz na zistenie prienikov medzi objektmi

Príklad SQL dotazu:

```sql
SELECT p.parcel_id, p.external_register_id
FROM parcels p
WHERE ST_Intersects(p.geom, ST_GeomFromGeoJSON($1));
```

---

## 3. English translation (Developer Blueprint)

### TECHNICAL SPECIFICATION AND IMPLEMENTATION PLAN

#### 1. ARCHITECTURE AND TECHNOLOGY STACK

**Database Layer: PostgreSQL + PostGIS**
- Purpose: relational database with extensions for handling vector geographic data
- Use cases: Geometry/Geography types, polygons, multipolygons, R-Tree/GiST spatial indexes

**Backend Layer: Node.js (Express) or Python (FastAPI)**
- Purpose: API request management, user authentication, ICO validation, and execution of spatial queries against the database

**Frontend Layer: HTML5, Modern JavaScript (ES6+), CSS3**
- Purpose: interactive UI, state management, map rendering

**Mapping Library & Services: Leaflet.js or OpenLayers**
- Purpose: rendering vector and raster layers
- Standards: WMS and WFS for map rendering and geographic data delivery

#### 2. STEP-BY-STEP DEVELOPMENT GUIDE

**PHASE 1: Design and Initialization of the Database Schema (PostGIS)**

Activate PostGIS:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

**Users table** stores registration info, account types and company ICO.

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT gen_random_uuid() UNIQUE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    account_type VARCHAR(50) NOT NULL,
    ico VARCHAR(10) UNIQUE,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Parcels table** stores user-assigned geographic polygons with a GiST index.

```sql
CREATE TABLE parcels (
    parcel_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    external_register_id VARCHAR(100),
    geom GEOMETRY(Polygon, 4328) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_parcels_geom ON parcels USING GIST (geom);
```

**Pending Requests table** stores unverified requests awaiting admin approval.

```sql
CREATE TABLE pending_requests (
    request_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    submitted_data JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**PHASE 2: Backend Logic and API Endpoints**

- `POST /api/auth/register`
- `POST /api/parcels/save`
- `POST /api/spatial/intersect`

Spatial intersection example:

```sql
SELECT p.parcel_id, p.external_register_id
FROM parcels p
WHERE ST_Intersects(p.geom, ST_GeomFromGeoJSON($1));
```

---

## 4. Zhrnutie projektu

AGROGIS SLOVENSKO je navrhnutý ako geopriestorová platforma pre včelárov a poľnohospodárov s primárnym dôrazom na:

- ochranu včelstiev pred postrekmi
- overenie subjektov podľa IČO
- zobrazenie parcelných a LPIS údajov
- podporu pre priestorové analýzy a GIS procesy
- jednoduché a prehľadné použitie v modernom webovom rozhraní

Tento dokument slúži ako základ pre ďalší vývoj, implementáciu, testovanie a nasadenie projektu v produkčnom prostredí.
