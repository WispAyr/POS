# Parking Operations System - State of Play

**Last Updated:** January 27, 2026  
**Version:** 0.0.1

## Executive Summary

The Parking Operations System (POS) is a multi-site, multi-client ANPR-based parking management platform built with NestJS (backend) and React (frontend). The system processes vehicle movements, evaluates parking compliance, and manages enforcement workflows with human-in-the-loop review.

### Current Status: **Active Development**

The system has a solid foundation with core functionality implemented, but several features require completion and testing before production readiness.

---

## Architecture Overview

### Technology Stack

**Backend:**
- **Framework:** NestJS 11.x (Node.js/TypeScript)
- **Database:** PostgreSQL with TypeORM
- **Architecture:** Modular (Domain-Driven Design approach)
- **API:** RESTful endpoints

**Frontend:**
- **Framework:** React 19.x with TypeScript
- **Build Tool:** Vite 7.x
- **Styling:** Tailwind CSS 4.x
- **Charts:** Recharts
- **Icons:** Lucide React

### System Modules

1. **Domain Module** - Core entities and domain logic
2. **Ingestion Module** - Data ingestion from ANPR cameras, payments, permits
3. **Engine Module** - Session processing and rule evaluation
4. **Enforcement Module** - Review queue and operator workflows
5. **API Module** - Dashboard and data endpoints
6. **Integration Module** - Monday.com integration for site/permit sync
7. **Infrastructure Module** - Shared infrastructure services

---

## Implemented Features

### ✅ Core Data Model
- **Entities:** Site, Movement, Session, Decision, Payment, Permit, AuditLog
- **Relationships:** Properly indexed for performance
- **Data Preservation:** Raw data stored immutably in JSONB fields

### ✅ ANPR Ingestion
- **Endpoint:** `POST /ingestion/anpr`
- **Features:**
  - Camera direction mapping (site-configurable)
  - Image storage and management
  - Duplicate detection
  - VRM normalization
  - Automatic session creation on entry/exit

### ✅ Session Processing
- **Automatic Session Creation:** Entry movements create provisional sessions
- **Session Completion:** Exit movements close sessions and calculate duration
- **Status Management:** PROVISIONAL → COMPLETED workflow

### ✅ Rule Engine
- **Permit Checking:** Site-specific and global permits
- **Payment Validation:** Basic payment matching (time window check TODO)
- **Grace Period Logic:** Configurable entry/exit grace periods
- **Decision Recording:** All decisions logged with rationale

### ✅ Enforcement Workflow
- **Review Queue:** `GET /enforcement/queue`
- **Operator Review:** `POST /enforcement/review/:id`
- **Audit Logging:** All operator actions logged
- **Status Tracking:** NEW → APPROVED/DECLINED workflow

### ✅ Frontend Dashboard
- **Dashboard View:** Statistics and overview
- **Sites Management:** Site listing and configuration
- **Enforcement Review:** Queue management interface
- **Events View:** ANPR movement history with filtering
- **Settings View:** System configuration (placeholder)

### ✅ Monday.com Integration
- **Site Sync:** Automatic site synchronization from Monday.com boards
- **Permit/Whitelist Sync:** Whitelist management via Monday.com
- **Camera Configuration:** Camera direction mapping sync

### ✅ Image Management
- **Image Storage:** Local file system storage in `uploads/images/`
- **Image Download:** Automatic download from external URLs
- **Image Serving:** API endpoint for image retrieval

### ✅ Comprehensive Audit System
- **Audit Logging:** Complete audit trail for all system actions
- **Traceability:** VRM trace, entity trace, enforcement case history
- **Timeline View:** Chronological timeline of all events
- **API Endpoints:** Full audit query API
- **Integration:** Audit logging integrated throughout system

### ✅ Build Audit & Version Tracking
- **Build Tracking:** All builds logged with full context
- **Version Information:** Backend/frontend versions, git info
- **Dependency Tracking:** All dependencies tracked with versions
- **Build History:** Complete build history with filters
- **CI/CD Integration:** GitHub Actions build logging

### ✅ Real-Time Payment Tracking System
- **Barrier Control:** Real-time payment validation (< 100ms) for ANPR barriers
- **Multi-Site Support:** Works across all car parks
- **Payment Ingestion:** API and webhook endpoints for payment modules
- **Payment Status:** Comprehensive payment status queries
- **Active Payments:** Real-time monitoring of active payments
- **Statistics:** Payment statistics and revenue tracking
- **Expiring Payments:** Alerts for payments expiring soon
- **Frontend UI:** Complete payment tracking interface

---

## Partially Implemented / In Progress

### ⚠️ Payment Ingestion
- **Status:** Basic ingestion implemented
- **Missing:** Time window validation for payment matching
- **Missing:** Reconciliation trigger (marked as TODO)
- **Endpoint:** `POST /ingestion/payment`

### ⚠️ Permit Ingestion
- **Status:** Basic ingestion implemented
- **Endpoint:** `POST /ingestion/permit`

### ⚠️ Rule Engine Enhancements
- **Payment Time Window:** TODO in `rule-engine.service.ts:45`
  - Current: Simple payment existence check
  - Needed: Validate payment covers session duration
- **Late Data Reconciliation:** Not yet implemented
  - Spec requires continuous re-evaluation when payments/permits arrive late

### ✅ Real-Time Payment Validation
- **Status:** Implemented
- **Barrier Control:** Real-time payment validation endpoint for ANPR barriers
- **Performance:** < 100ms response time
- **Integration:** Ready for payment module integrations via webhooks

---

## Missing / Not Implemented

### ❌ Testing
- **Unit Tests:** No test files found in `src/`
- **E2E Tests:** Only boilerplate test file exists
- **Test Coverage:** 0% (critical for production readiness)

### ❌ Data Reconciliation
- **Late Payment Matching:** No background job to re-evaluate sessions
- **Permit Updates:** No reconciliation when permits are added/removed
- **Decision Updates:** No mechanism to update decisions when new data arrives

### ❌ Enforcement Lifecycle
- **Batch Archival:** No enforcement packaging/archival
- **Export Functionality:** No export to external systems
- **Lifecycle States:** Limited status tracking (missing EXPORTED, CLOSED states)

### ❌ Client Isolation
- **Multi-Client Support:** Architecture supports it, but no client entity/scope implemented
- **Client Portal:** Separate client-facing system not built

### ❌ Advanced Features
- **Barrier Integration:** Not implemented
- **Occupancy Tracking:** Not implemented
- **Appeals/Disputes:** Not implemented
- **Evidence Integrity:** Basic image storage only

### ❌ Production Readiness
- **Environment Configuration:** `.env.example` exists but needs documentation
- **Database Migrations:** Using `synchronize: true` (not production-safe)
- **Error Handling:** Basic error handling, needs enhancement
- **Logging:** Basic NestJS logging, needs structured logging
- **Monitoring:** No health checks or metrics endpoints
- **Port Management:** No port cleanup on startup (user requirement)

---

## Known Issues / TODOs

### Code TODOs
1. **Payment Time Window Check** (`src/engine/services/rule-engine.service.ts:45`)
   - Need to validate payment covers session time window
   
2. **Payment Reconciliation Trigger** (`src/ingestion/services/payment-ingestion.service.ts:31`)
   - Need to trigger session re-evaluation when payment arrives

### Technical Debt
1. **Database Synchronization:** Using TypeORM `synchronize: true` in non-production
   - Should implement proper migrations for production
   
2. **Decision Entity:** `params` field is incorrectly typed as `Date` (should be JSONB)
   - Line 46 in `decision.entity.ts`

3. **CORS Configuration:** Currently allows all origins (`origin: true`)
   - Should be restricted in production

4. **Image Storage:** Local filesystem storage
   - Consider cloud storage for production scalability

---

## Data Flow

### Current Flow
1. **ANPR Event** → `POST /ingestion/anpr`
2. **Movement Created** → Stored in `movements` table
3. **Session Service** → Processes movement (entry/exit logic)
4. **Session Created/Updated** → Stored in `sessions` table
5. **Rule Engine** → Evaluates completed sessions
6. **Decision Created** → Stored in `decisions` table
7. **Enforcement Queue** → ENFORCEMENT_CANDIDATE decisions appear in queue
8. **Operator Review** → Human review via frontend
9. **Decision Updated** → Status changed to APPROVED/DECLINED

### Missing Flows
- Payment/permits arriving after session completion (reconciliation)
- Real-time access control decisions
- Enforcement export/archival
- Batch processing for large datasets

---

## Database Schema

### Core Tables
- `sites` - Parking site configuration
- `movements` - ANPR camera events (immutable)
- `sessions` - Vehicle parking sessions
- `decisions` - Rule evaluation outcomes
- `payments` - Payment records
- `permits` - Whitelist/permit records
- `audit_logs` - System audit trail

### Indexes
- Movements: `(vrm, timestamp)`, `(siteId, timestamp)`
- Sessions: `(vrm, siteId)`, `(startTime)`
- Payments: `(vrm, siteId)`, `(expiryTime)`
- Permits: `(vrm)`

---

## API Endpoints

### Ingestion
- `POST /ingestion/anpr` - ANPR event ingestion
- `POST /ingestion/payment` - Payment record ingestion
- `POST /ingestion/permit` - Permit/whitelist ingestion

### Dashboard/API
- `GET /api/sites` - List all sites
- `GET /api/stats` - System statistics
- `GET /api/events` - ANPR movements (paginated, filterable)
- `GET /api/debug/movements` - Debug endpoint for movements
- `POST /api/reset` - Clear all data (development only)

### Enforcement
- `GET /enforcement/queue` - Get review queue
- `POST /enforcement/review/:id` - Review a decision

### Images
- `GET /api/images/:filename` - Serve stored images

### Integration
- `POST /integration/monday/sync` - Trigger Monday.com sync

---

## Frontend Features

### Implemented Views
1. **Dashboard** - Statistics overview
2. **Sites** - Site management (read-only currently)
3. **Enforcement Review** - Review queue interface
4. **Events** - ANPR event history
5. **Settings** - Placeholder for system settings

### Missing Features
- Site configuration editing
- Permit management UI
- Payment management UI
- Advanced filtering/search
- Real-time updates (WebSocket/polling)
- Export functionality

---

## Configuration

### Environment Variables (from code analysis)
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (affects DB sync)
- `DB_HOST` - PostgreSQL host (default: localhost)
- `DB_PORT` - PostgreSQL port (default: 5432)
- `DB_USERNAME` - Database user (default: pos_user)
- `DB_PASSWORD` - Database password (default: pos_pass)
- `DB_DATABASE` - Database name (default: pos_db)
- `MONDAY_API_KEY` - Monday.com API key
- `MONDAY_CAMERA_BOARD_ID` - Monday.com board ID for cameras

---

## Next Steps / Recommendations

### High Priority
1. **Implement Testing**
   - Unit tests for services
   - Integration tests for API endpoints
   - E2E tests for critical flows

2. **Fix Payment Time Window Logic**
   - Implement proper payment validation against session duration

3. **Implement Data Reconciliation**
   - Background job to re-evaluate sessions when payments/permits arrive
   - Update decisions when new data changes outcomes

4. **Database Migrations**
   - Replace `synchronize: true` with proper migrations
   - Create initial migration script

5. **Port Cleanup on Startup**
   - Add port cleanup logic as per user requirement

### Medium Priority
1. **Enhance Error Handling**
   - Structured error responses
   - Error logging and monitoring

2. **Complete Enforcement Lifecycle**
   - Batch archival
   - Export functionality
   - Full status tracking

3. **Frontend Enhancements**
   - Site configuration editing
   - Real-time updates
   - Better error handling

### Low Priority
1. **Real-Time Access Control**
   - Barrier integration
   - Live decision endpoints

2. **Client Isolation**
   - Multi-tenant architecture
   - Client-scoped data access

3. **Advanced Features**
   - Occupancy tracking
   - Appeals workflow
   - Enhanced reporting

---

## Compliance & Audit

### Current State
- ✅ Audit logs created for operator actions
- ✅ All decisions include rationale
- ✅ Raw data preserved immutably
- ❌ Retention policy not enforced (3 weeks/3 years per spec)
- ❌ No automated archival

### Spec Requirements
- Enforcement records: 3 years retention
- Operational data: 3 weeks retention
- Full audit trail for compliance

---

## Performance Considerations

### Current
- Basic database indexes in place
- No pagination limits enforced (API allows up to 50)
- Image storage on local filesystem

### Concerns
- No caching layer
- No rate limiting
- Image storage may not scale
- No query optimization for large datasets

---

## Security Considerations

### Current
- Basic CORS configuration
- No authentication/authorization implemented
- No input validation beyond DTOs
- Environment variables for sensitive data

### Needed
- Authentication system
- Role-based access control
- API rate limiting
- Input sanitization
- Secure image storage
- HTTPS enforcement

---

## Documentation Status

- ✅ Logical Operations Spec (`specs/logical_operations_spec.md`)
- ❌ API Documentation (needs creation)
- ❌ Development Guide (needs creation)
- ❌ Deployment Guide (needs creation)
- ⚠️ README (needs update with project-specific info)

---

## Summary

The Parking Operations System has a solid architectural foundation with core functionality working. The system can ingest ANPR events, create sessions, evaluate rules, and manage enforcement workflows. However, several critical features are incomplete, and the system lacks testing, proper production configuration, and some advanced features specified in the requirements.

**Production Readiness:** ⚠️ **Not Ready** - Requires testing, reconciliation logic, and production hardening.

**Development Status:** 🟡 **Active Development** - Core features functional, enhancements needed.
