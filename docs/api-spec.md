# AGROGIS SLOVENSKO — API Specification

## 1. Overview

This document describes the main API contract for the AGROGIS SLOVENSKO application. It is intended for backend development, frontend integration, and future service expansion.

Base URL:
- /api

Protocol:
- JSON over HTTP
- REST-style endpoints
- optional auth via JWT or session token in future production versions

## 2. Authentication endpoints

### POST /api/auth/register
Registers a new user.

Request body:
```json
{
  "email": "user@example.com",
  "password": "StrongPass123",
  "role": "AGRO_PRO",
  "name": "PD Example",
  "ico": "00123456",
  "cevz": "",
  "phone": "+421 900 000 000",
  "address": "Obec 1, 900 00 Obec",
  "lpisId": "LPIS-NR-4401",
  "companyName": "PD Example",
  "profileLocation": { "lat": 48.1486, "lng": 17.1077 }
}
```

Notes:
- `role` must be one of `AGRO`, `AGRO_PRO`, `BEEKEEPER`, `BEE_HOBBY`, `BEE_BEGINNER`, `GARDENER`, `GARDEN_NEW`.
- `ico` is stored only for `AGRO` / `AGRO_PRO`, `cevz` only for the beekeeper roles, `lpisId` only for `AGRO` / `AGRO_PRO`, and `companyName` for `AGRO` / `AGRO_PRO` / `BEEKEEPER`.
- `profileLocation` is optional and used by community roles to anchor the account on the map.

Success response:
```json
{
  "success": true,
  "token": "jwt-token",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "AGRO_PRO",
    "lpisId": "LPIS-NR-4401",
    "companyName": "PD Example",
    "profileLocation": { "lat": 48.1486, "lng": 17.1077 },
    "isVerified": false
  }
}
```

Error response:
```json
{
  "success": false,
  "error": "EMAIL_ALREADY_EXISTS"
}
```

### POST /api/auth/login
Authenticates an existing user.

Request body:
```json
{
  "email": "user@example.com",
  "password": "StrongPass123"
}
```

Success response:
```json
{
  "success": true,
  "token": "jwt-token",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "accountType": "registered_entity"
  }
}
```

### POST /api/auth/logout
Log the current user out.

Response:
```json
{
  "success": true
}
```

## 3. User and profile endpoints

### GET /api/users/me
Returns the current authenticated user profile.

Response:
```json
{
  "id": 1,
  "email": "user@example.com",
  "accountType": "registered_entity",
  "ico": "00123456",
  "isVerified": false
}
```

### PATCH /api/users/me
Updates the user profile. Requires authentication.

Example body:
```json
{
  "name": "PD Example",
  "phone": "+421 900 000 000",
  "address": "Obec 1, 900 00 Obec",
  "lpisId": "LPIS-NR-4401",
  "companyName": "PD Example",
  "profileLocation": { "lat": 48.1486, "lng": 17.1077 }
}
```

Response: the updated user object in the same shape as registration.

### DELETE /api/users/me
Deletes the current user's account. Requires authentication.

Response:
```json
{
  "success": true
}
```

## 4. Parcel endpoints

### POST /api/parcels/save
Saves a parcel polygon for the current user.

Request body:
```json
{
  "externalRegisterId": "LPIS-123",
  "geometry": {
    "type": "Polygon",
    "coordinates": [
      [
        [17.1, 48.1],
        [17.2, 48.1],
        [17.2, 48.2],
        [17.1, 48.2],
        [17.1, 48.1]
      ]
    ]
  }
}
```

Success response:
```json
{
  "success": true,
  "parcelId": 14
}
```

### GET /api/parcels
Returns a list of parcels for the current user.

Response:
```json
{
  "success": true,
  "parcels": [
    {
      "parcelId": 14,
      "externalRegisterId": "LPIS-123"
    }
  ]
}
```

### DELETE /api/parcels/:id
Deletes a specific parcel.

Response:
```json
{
  "success": true
}
```

## 5. Spatial analysis endpoints

### POST /api/spatial/intersect
Checks whether a geometry intersects existing parcels or protected zones.

Request body:
```json
{
  "geojson": {
    "type": "Polygon",
    "coordinates": [
      [
        [17.0, 48.0],
        [17.4, 48.0],
        [17.4, 48.4],
        [17.0, 48.4],
        [17.0, 48.0]
      ]
    ]
  }
}
```

Success response:
```json
{
  "success": true,
  "intersections": [
    {
      "parcelId": 14,
      "externalRegisterId": "LPIS-123"
    }
  ]
}
```

### POST /api/spatial/buffer-check
Checks for zones within a specified radius.

Example body:
```json
{
  "lat": 48.1519,
  "lng": 17.1094,
  "radiusMeters": 3000
}
```

Response:
```json
{
  "success": true,
  "withinRadius": true,
  "riskLevel": "medium"
}
```

## 6. Registry and verification endpoints

### POST /api/registry/verify-entity
Validates an entity by ICO or business identifier.

Request body:
```json
{
  "ico": "00123456"
}
```

Response:
```json
{
  "success": true,
  "entity": {
    "name": "Example Company Ltd.",
    "ico": "00123456",
    "status": "active"
  }
}
```

### GET /api/registry/lpis
Returns LPIS parcel listings relevant to the authenticated user. Requires authentication.

Query parameters:
- `lpisId` (optional): LPIS farm/block identifier, 3–64 characters (letters, digits, `-`, `_`). Filters results by identifier prefix.

Behavior:
- Always returns parcels saved by the current user (source `user_parcels`).
- When the `LPIS_API_URL` environment variable is configured and `lpisId` is provided, the server additionally queries the external LPIS source (`GET {LPIS_API_URL}?lpisId=<id>`, expecting a JSON array or `{ "parcels": [...] }`), normalizes the records, and merges them into the response.

Response:
```json
{
  "success": true,
  "source": "local | lpis-api",
  "parcels": [
    {
      "externalRegisterId": "LPIS-NR-4401",
      "areaHa": 64.82,
      "crop": "Repka olejná",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[17.9, 48.4], [17.99, 48.4], [17.99, 48.41], [17.9, 48.4]]]
      }
    }
  ]
}
```

Error responses:
- `400 VALIDATION_ERROR` — invalid `lpisId` format
- `502 LPIS_SOURCE_ERROR` — external LPIS source returned an error or unexpected payload
- `504 LPIS_TIMEOUT` — external LPIS source did not respond within 5 seconds

## 7. Admin endpoints

### GET /api/admin/pending-requests
Returns all pending manual verification requests.

### PATCH /api/admin/pending-requests/:id
Approves or rejects a request.

Request body:
```json
{
  "status": "APPROVED"
}
```

## 8. Error format

Standard error response:
```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "details": "ICO is required when accountType is registered_entity"
}
```

## 9. Notes for implementation

- validate incoming GeoJSON structure before storing to PostGIS
- require authentication for user-owned parcel operations
- enforce admin checks for review endpoints
- log all verification and request changes
- use database transactions for spatial writes and ownership checks

## 10. Recommended future extensions

- WebSocket events for live map updates
- export endpoint for PDF / GIS reports
- satellite or WMS layer service adapters
- offline caching for partial map data
- role-based policy checks for each endpoint
