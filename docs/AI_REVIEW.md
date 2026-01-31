# AI Review System

The AI Review system allows operators to request intelligent analysis of POS data from Skynet (the AI assistant). Reviews can be triggered manually from the Settings page or processed automatically via heartbeat polling.

## Features

### Review Types

| Type | Description | MCP Tool |
|------|-------------|----------|
| **System Health** | Full system overview: active sessions, pending enforcement, recent activity | `pos_ai_review_system` |
| **Enforcement Queue** | Detailed analysis of a specific enforcement decision | `pos_ai_review_enforcement` |
| **VRM History** | Complete vehicle history: sessions, payments, permits, decisions | `pos_ai_review_vrm` |
| **FILO Anomalies** | First-In-Last-Out pattern detection: long stays, missing exits, potential issues | `pos_ai_review_filo` |

### UI Components

- **Settings > AI Review Centre**: Main control panel with enable/disable toggle
- **Quick Actions**: One-click buttons to request each review type
- **Pending Reviews**: Shows queued requests with status
- **Recent Reviews**: Completed reviews with severity badges and recommendations
- **AI Observations**: Recent AI-logged observations from the audit trail

### API Endpoints

#### AI Review Data (`/api/ai-review`)
- `GET /enabled` - Check if AI review is enabled
- `POST /enabled` - Toggle AI review on/off
- `GET /system` - System overview for AI analysis
- `GET /enforcement/:decisionId` - Enforcement case details
- `GET /vrm/:vrm` - Vehicle history
- `GET /filo` - FILO anomalies
- `POST /observation` - Log AI observation to audit trail

#### Review Queue (`/api/ai-review-queue`)
- `POST /request` - Request a new AI review
- `GET /pending` - List pending review requests
- `POST /processing/:id` - Mark review as being processed
- `POST /complete/:id` - Complete review with AI response
- `POST /fail/:id` - Mark review as failed
- `GET /recent` - Get recent completed reviews

### MCP Tools

Available via the POS MCP server for AI assistant integration:

```typescript
// Check for pending reviews
pos_ai_review_queue_pending

// Mark as processing
pos_ai_review_queue_process({ requestId: "..." })

// Fetch data for analysis
pos_ai_review_system({ siteId?: string })
pos_ai_review_enforcement({ decisionId: string })
pos_ai_review_vrm({ vrm: string, siteId?: string })
pos_ai_review_filo({ minHours?: number, siteId?: string, limit?: number })

// Complete the review
pos_ai_review_queue_complete({
  requestId: string,
  summary: string,
  details?: string,
  recommendations?: string,
  severity?: 'INFO' | 'WARNING' | 'CRITICAL'
})

// Log observations
pos_ai_log_observation({
  observationType: string,
  summary: string,
  details?: string,
  recommendations?: string,
  severity?: string,
  relatedEntityType?: string,
  relatedEntityId?: string
})
```

### FILO Anomaly Detection

The FILO (First-In-Last-Out) analysis detects:

1. **Missing Exit Events**: Vehicles with entry but no recorded exit
2. **Very Long Stays**: Sessions exceeding 24 hours
3. **No Payment Coverage**: Long sessions without valid payment or permit
4. **Repeat Offenders**: VRMs with multiple anomalous sessions

Auto-generated recommendations include:
- Camera functionality checks
- Abandoned vehicle alerts
- Enforcement candidate identification
- Watchlist suggestions

### Audit Trail Integration

All AI reviews are logged to the audit trail:
- `AI_REVIEW_REQUESTED` - When operator requests a review
- `AI_REVIEW_COMPLETED` - When AI completes analysis
- `AI_*` observations - Any AI-logged findings

### Configuration

The AI review feature can be enabled/disabled via:
- UI: Settings > AI Review Centre toggle
- API: `POST /api/ai-review/enabled { enabled: boolean }`

When disabled, all review endpoints return 403 Forbidden.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend UI   │────▶│  Review Queue    │────▶│   Clawdbot      │
│  (Settings)     │     │  (In-Memory)     │     │   (Skynet)      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │                        │
                               │                        ▼
                               │                 ┌─────────────────┐
                               │                 │   MCP Tools     │
                               │                 │   (Analysis)    │
                               │                 └─────────────────┘
                               │                        │
                               ▼                        ▼
                        ┌──────────────────┐    ┌─────────────────┐
                        │   Audit Trail    │◀───│   AI Response   │
                        │   (Postgres)     │    │   (Summary)     │
                        └──────────────────┘    └─────────────────┘
```
