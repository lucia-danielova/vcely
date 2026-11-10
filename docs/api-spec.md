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
  "accountType": "registered_entity",
  "ico": "00123456",
  "isVerified": false
}
```

Success response:
```json
{
  "success": true,
  "user": {
    "id": 1,
    "email": "user@example.com",
    "accountType": "registered_entity",
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
Updates the user profile.

Example body:
```json
{
  "email": "new@example.com"
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
Returns LPIS parcel listings relevant to the user or selected scope.

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
