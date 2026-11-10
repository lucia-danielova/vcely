# AGROGIS SLOVENSKO — Architecture Overview

## 1. Purpose

AGROGIS SLOVENSKO is a web-based geographic decision-support platform for beekeepers and farmers in Slovakia. The project combines map visualization, spatial analysis, registry data lookup, and user role-based workflows.

The system is designed around four main goals:
- protect beehives from pesticide spraying hazards
- validate entities by ICO and public registry data
- map land parcels, LPIS blocks, and cadastre areas
- provide a simple but powerful GIS interface for everyday use

## 2. High-level architecture

### Frontend
- HTML5, CSS3, JavaScript (ES6+)
- Leaflet.js for map rendering
- Tailwind CSS for modern layout and UI styling
- Dynamic state handling for user persona switching, map modes, and sidebar tabs

### Backend
- Node.js / FastAPI-ready API design
- Authentication and account workflows
- Registry validation logic for ICO / entity checks
- Spatial queries and geodata processing

### Data layer
- PostgreSQL + PostGIS
- Spatial geometry storage
- GiST indexes for parcel and polygon lookups
- Support for GeoJSON import/export and spatial intersections

## 3. Major system components

### 3.1 Landing portal
The landing screen is a 50/50 split interface:
- left side for beekeepers
- right side for farmers

Each side contains persona cards:
- BEE_PRO
- BEE_HOBBY
- AGRO_PRO
- AGRO_HOBBY

This acts as a role-selection and entry gateway before the user reaches the GIS dashboard.

### 3.2 Main GIS dashboard
The main application includes:
- top header with role indicator and quick actions
- left sidebar with tabs for search, layers, tools, and user account
- central map area with interactive layers and controls
- bottom status bar with system state and map context

### 3.3 Search panel
The search panel supports:
- entity lookup by ICO, company name, or municipality
- cadastre parcel lookup using C-KN / E-KN data model
- LPIS parcel list display

### 3.4 Layers panel
This panel controls visual map content, including:
- base maps (ortho, topographic, terrain, dark mode)
- potential WMS/WFS integration points
- land and ecological overlays

### 3.5 Tools panel
Contains operational tools like:
- spray simulation
- add hive mode
- draw polygon / parcel tool
- identify tool
- measure tool
- export and analysis actions

### 3.6 Auth and account system
The user flow includes:
- login modal
- registration modal
- user dashboard modal
- role-oriented behavior depending on selected persona

## 4. User personas and role logic

### Beekeeper personas
- BEE_PRO: professional beekeeper workflow
- BEE_HOBBY: simplified hobbyist workflow

### Farmer personas
- AGRO_PRO: professional agricultural workflow
- AGRO_HOBBY: simplified agricultural workflow

Each persona changes the UI state, ambient messaging, and contextual map tools.

## 5. Data model concept

### User model
A user can be:
- registered entity
- hobby user

Key fields:
- email
- password hash
- account type
- ICO
- verification flag
- registration timestamp

### Parcel model
Each parcel stores:
- parcel ID
- user reference
- external registry ID
- geometry polygon
- created timestamp

### Pending request model
Stored for manual review when a user or organization cannot be verified automatically.

## 6. Spatial features

The platform conceptually supports:
- parcel overlay with GIS coordinates
- intersection analysis between parcels and protected areas
- bee safety radius simulation around apiaries
- land verification for agricultural planning
- map-based risk evaluation for spraying events

## 7. Typical data flow

### Scenario: beekeeping safety check
1. user selects beekeeper persona
2. user adds hive/parcel object to map
3. map calculates nearby risk zones
4. system checks distance from spray zones or registered agricultural polygons
5. risk result is displayed in analysis panel

### Scenario: entity validation
1. user enters ICO or company name
2. frontend sends request to backend
3. backend validates through registry / connector logic
4. result is saved to UI analysis panel and optional pending request database

## 8. Security and operational considerations

- use secure password hashing
- validate all incoming GeoJSON payloads
- restrict admin-only endpoints
- protect spatial endpoints from invalid geometry input
- log important change and verification actions

## 9. Recommended technical roadmap

### Phase 1
- finalize role and persona flow
- build landing portal and dashboard layout
- implement map rendering and base-layer switching

### Phase 2
- connect frontend to backend API
- add auth and session management
- begin database integration for users and parcels

### Phase 3
- implement spatial intersection queries
- connect registry verification and LPIS/cadastre lookups
- add export and reporting modules

### Phase 4
- add admin panel
- add audit logs
- add production deployment configuration

## 10. Summary

AGROGIS SLOVENSKO is a modern GIS-driven platform that blends environmental safety, geodata integration, and role-specific UX into one product. Its architecture supports both hobby and professional use while staying open for future expansion with real registry integration, PostGIS analytics, and admin workflows.
