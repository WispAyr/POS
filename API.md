# API Documentation

## Base URL

- **Development:** `http://localhost:3000`
- **Production:** (configured via environment)

## Authentication

**Current Status:** No authentication implemented. All endpoints are publicly accessible.

**Future:** Authentication will be required for all endpoints except public ingestion endpoints.

---

## Ingestion Endpoints

### POST /ingestion/anpr

Ingest an ANPR (Automatic Number Plate Recognition) event from a camera.

**Request Body:**

```json
{
  "siteId": "string (required)",
  "vrm": "string (required, or plateNumber)",
  "plateNumber": "string (optional, alternative to vrm)",
  "timestamp": "ISO 8601 date string (required)",
  "cameraId": "string (required)",
  "direction": "string (optional: TOWARDS, AWAY, ENTRY, EXIT, IN, OUT)",
  "images": [
    {
      "url": "string",
      "type": "plate | overview"
    }
  ],
  "cameraType": "string (optional)",
  "source": "string (optional)",
  "rawData": "object (optional)"
}
```

**Response:**

```json
{
  "movement": {
    "id": "uuid",
    "siteId": "string",
    "vrm": "string",
    "timestamp": "ISO 8601 date",
    "cameraIds": "string",
    "direction": "ENTRY | EXIT",
    "images": [...],
    "ingestedAt": "ISO 8601 date"
  },
  "isNew": true
}
```

**Notes:**
- VRM is normalized (uppercase, spaces removed)
- Direction is determined from site camera configuration
- Duplicate movements (same VRM, site, timestamp) are detected
- Session processing is triggered automatically

---

### POST /ingestion/payment

Ingest a payment record.

**Request Body:**

```json
{
  "siteId": "string (required)",
  "vrm": "string (required)",
  "amount": "number (required)",
  "startTime": "ISO 8601 date string (required)",
  "expiryTime": "ISO 8601 date string (required)",
  "source": "string (optional: APP, KIOSK, TERM, IMPORT)",
  "externalReference": "string (optional)",
  "rawData": "object (optional)"
}
```

**Response:**

```json
{
  "id": "uuid",
  "siteId": "string",
  "vrm": "string",
  "amount": "number",
  "startTime": "ISO 8601 date",
  "expiryTime": "ISO 8601 date",
  "source": "string",
  "ingestedAt": "ISO 8601 date"
}
```

**Notes:**
- Payment reconciliation should be triggered (currently TODO)
- Payments are matched against sessions by VRM, site, and time window

---

### POST /ingestion/permit

Ingest a permit/whitelist record.

**Request Body:**

```json
{
  "siteId": "string (optional, null for global permit)",
  "vrm": "string (required)",
  "type": "string (required: WHITELIST, RESIDENT, STAFF, CONTRACTOR)",
  "startDate": "ISO 8601 date string (required)",
  "endDate": "ISO 8601 date string (optional, null for indefinite)",
  "active": "boolean (optional, default: true)"
}
```

**Response:**

```json
{
  "id": "uuid",
  "siteId": "string | null",
  "vrm": "string",
  "type": "string",
  "startDate": "ISO 8601 date",
  "endDate": "ISO 8601 date | null",
  "active": "boolean",
  "createdAt": "ISO 8601 date"
}
```

**Notes:**
- `siteId: null` indicates a global permit (valid at all sites)
- Permits are checked during rule evaluation

---

## Dashboard/API Endpoints

### GET /api/sites

Get all parking sites.

**Response:**

```json
[
  {
    "id": "string",
    "name": "string",
    "config": {
      "operatingModel": "string",
      "gracePeriods": {
        "entry": "number",
        "exit": "number",
        "overstay": "number"
      },
      "cameras": [
        {
          "id": "string",
          "direction": "ENTRY | EXIT",
          "towardsDirection": "ENTRY | EXIT",
          "awayDirection": "ENTRY | EXIT",
          "name": "string"
        }
      ],
      "realTime": "boolean"
    },
    "active": "boolean",
    "createdAt": "ISO 8601 date",
    "updatedAt": "ISO 8601 date"
  }
]
```

---

### GET /api/stats

Get system statistics.

**Query Parameters:**
- `siteId` (optional): Filter by site

**Response:**

```json
{
  "sessions": "number",
  "decisions": "number",
  "timestamp": "ISO 8601 date"
}
```

**Note:** Current implementation has a bug - `decisions` count uses `sessionId` instead of proper filtering.

---

### GET /api/events

Get ANPR movement events (paginated).

**Query Parameters:**
- `siteId` (optional): Filter by site
- `vrm` (optional): Filter by VRM (partial match, case-insensitive)
- `page` (optional, default: 1): Page number
- `limit` (optional, default: 20, max: 50): Items per page

**Response:**

```json
{
  "data": [
    {
      "id": "uuid",
      "siteId": "string",
      "vrm": "string",
      "timestamp": "ISO 8601 date",
      "cameraIds": "string",
      "direction": "ENTRY | EXIT",
      "images": [...],
      "ingestedAt": "ISO 8601 date"
    }
  ],
  "meta": {
    "total": "number",
    "page": "number",
    "limit": "number",
    "totalPages": "number"
  }
}
```

---

### GET /api/debug/movements

**Development Only** - Get recent movements for debugging.

**Response:**

```json
[
  {
    "id": "uuid",
    "siteId": "string",
    "vrm": "string",
    "timestamp": "ISO 8601 date",
    "cameraIds": "string",
    "direction": "string",
    "images": [...],
    "rawData": {...},
    "ingestedAt": "ISO 8601 date"
  }
]
```

**Note:** Returns last 20 movements, ordered by timestamp DESC.

---

### POST /api/reset

**Development Only** - Clear all system data and images.

**Response:**

```json
{
  "message": "string",
  "deletedImages": "number"
}
```

**Warning:** This deletes all movements, sessions, decisions, and images. Use only in development.

---

### GET /api/images/:filename

Serve a stored image file.

**Path Parameters:**
- `filename`: Image filename (e.g., `uuid-plate.jpg`)

**Response:** Image file (binary)

**Notes:**
- Images are stored in `uploads/images/`
- Filename format: `{uuid}-{type}.{ext}`

---

## Enforcement Endpoints

### GET /enforcement/queue

Get the review queue of enforcement candidates.

**Query Parameters:**
- `siteId` (optional): Filter by site (not fully implemented)

**Response:**

```json
[
  {
    "id": "uuid",
    "sessionId": "string",
    "movementId": "string | null",
    "outcome": "ENFORCEMENT_CANDIDATE",
    "status": "NEW",
    "ruleApplied": "string",
    "rationale": "string",
    "isOperatorOverride": "boolean",
    "operatorId": "string | null",
    "createdAt": "ISO 8601 date"
  }
]
```

**Notes:**
- Returns decisions with `outcome: ENFORCEMENT_CANDIDATE` and `status: NEW`
- Site filtering is not fully implemented (requires session join)

---

### POST /enforcement/review/:id

Review and approve/decline an enforcement decision.

**Path Parameters:**
- `id`: Decision ID (UUID)

**Request Body:**

```json
{
  "action": "APPROVE | DECLINE",
  "operatorId": "string (required)",
  "notes": "string (optional)"
}
```

**Response:**

```json
{
  "id": "uuid",
  "sessionId": "string",
  "outcome": "ENFORCEMENT_CANDIDATE",
  "status": "APPROVED | DECLINED",
  "ruleApplied": "string",
  "rationale": "string",
  "isOperatorOverride": "true",
  "operatorId": "string",
  "createdAt": "ISO 8601 date"
}
```

**Notes:**
- Updates decision status to `APPROVED` or `DECLINED`
- Sets `isOperatorOverride: true`
- Creates audit log entry
- Appends review notes to rationale

---

## Integration Endpoints

### POST /integration/monday/sync

Trigger synchronization with Monday.com.

**Response:**

```json
{
  "message": "Sync completed",
  "sitesSynced": "number",
  "permitsSynced": "number"
}
```

**Notes:**
- Requires `MONDAY_API_KEY` in environment
- Syncs sites from board ID 1893442639
- Syncs whitelists from board ID 1893468235
- Syncs camera configurations from board ID 1952030503 (or env override)

---

## Error Responses

### Standard Error Format

```json
{
  "statusCode": "number",
  "message": "string | string[]",
  "error": "string"
}
```

### Common Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `404` - Not Found
- `500` - Internal Server Error

### Example Error Response

```json
{
  "statusCode": 404,
  "message": "Site not found: INVALID_ID",
  "error": "Not Found"
}
```

---

## Data Models

### Decision Outcome Enum

```typescript
enum DecisionOutcome {
  COMPLIANT = 'COMPLIANT',
  ENFORCEMENT_CANDIDATE = 'ENFORCEMENT_CANDIDATE',
  PASS_THROUGH = 'PASS_THROUGH',
  ACCESS_GRANTED = 'ACCESS_GRANTED',
  ACCESS_DENIED = 'ACCESS_DENIED',
  REQUIRES_REVIEW = 'REQUIRES_REVIEW',
  CANCELLED = 'CANCELLED'
}
```

### Session Status Enum

```typescript
enum SessionStatus {
  PROVISIONAL = 'PROVISIONAL',
  COMPLETED = 'COMPLETED',
  INVALID = 'INVALID'
}
```

### Decision Status

- `NEW` - Initial status for new decisions
- `CANDIDATE` - Alternative status (not currently used)
- `APPROVED` - Operator approved for enforcement
- `DECLINED` - Operator declined enforcement
- `EXPORTED` - Exported to external system (not yet implemented)
- `CLOSED` - Final status (not yet implemented)

---

## Rate Limiting

**Current Status:** No rate limiting implemented.

**Future:** Rate limiting will be implemented for production.

---

## CORS

**Development:** CORS allows all origins (`origin: true`)

**Production:** CORS should be restricted to specific frontend domains.

---

## Versioning

**Current:** No API versioning implemented.

**Future:** API versioning will be added (e.g., `/api/v1/...`).

---

## Webhooks / Real-Time

**Current Status:** No webhooks or real-time updates.

**Future:** WebSocket or Server-Sent Events may be added for real-time updates.

---

## Pagination

Endpoints that support pagination:
- `GET /api/events`

Pagination uses `page` and `limit` query parameters. Default limit is 20, maximum is 50.

---

## Filtering

Endpoints that support filtering:
- `GET /api/events` - Filter by `siteId` and `vrm`
- `GET /api/stats` - Filter by `siteId`
- `GET /enforcement/queue` - Filter by `siteId` (partial)

---

## Examples

### Ingest ANPR Event

```bash
curl -X POST http://localhost:3000/ingestion/anpr \
  -H "Content-Type: application/json" \
  -d '{
    "siteId": "GRN01",
    "vrm": "AB12CDE",
    "timestamp": "2026-01-27T10:00:00Z",
    "cameraId": "Greenford_Cam2",
    "direction": "TOWARDS",
    "images": [
      {
        "url": "http://example.com/image.jpg",
        "type": "plate"
      }
    ]
  }'
```

### Get Enforcement Queue

```bash
curl http://localhost:3000/enforcement/queue
```

### Review Decision

```bash
curl -X POST http://localhost:3000/enforcement/review/decision-uuid \
  -H "Content-Type: application/json" \
  -d '{
    "action": "APPROVE",
    "operatorId": "operator-123",
    "notes": "Valid enforcement case"
  }'
```

---

## Notes

- All timestamps are in ISO 8601 format (UTC)
- UUIDs are used for entity IDs
- VRM (Vehicle Registration Mark) is normalized to uppercase, no spaces
- Image URLs may be external or local (`/api/images/...`)
- The API is currently unauthenticated (development only)
