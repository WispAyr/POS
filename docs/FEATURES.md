# POS Features Overview

## Core Features

### 1. ANPR Event Processing
- **Automatic ingestion** of vehicle movement events from ANPR cameras
- **VRM normalization** (uppercase, remove spaces)
- **Direction resolution** based on site-specific camera configuration
- **Duplicate detection** prevents reprocessing of identical events
- **Image management** with local storage and URL support
- **Multi-camera support** per site

### 2. Plate Review System 🆕
- **Automatic validation** against UK and international plate formats
- **AI-powered suspicion detection** based on:
  - Low confidence scores (< 0.8)
  - Invalid format patterns
  - Special characters
  - Suspicious patterns (repeated chars, all zeros, etc.)
  - Length validation (2-10 characters)
- **Human review queue** with filtering and search
- **Three review actions**:
  - **Approve**: Confirm plate is correct
  - **Correct**: Update with corrected VRM (with AI suggestions)
  - **Discard**: Mark as invalid/corrupted
- **Bulk operations** for efficient processing
- **OCR error correction** with intelligent suggestions:
  - 0 ↔ O (zero/letter confusion)
  - 1 ↔ I (one/letter confusion)
  - 5 ↔ S, 8 ↔ B, 2 ↔ Z, 6 ↔ G
- **Visual verification** with plate image display
- **Statistics dashboard** showing pending/approved/corrected/discarded counts

### 3. Session Management
- **Automatic session creation** on vehicle entry
- **Session completion** on vehicle exit
- **Duration calculation** with validation
- **Session states**:
  - PROVISIONAL (entry only)
  - COMPLETED (entry + exit)
  - INVALID (data errors)
- **Orphan detection** for exits without entries
- **Integration with plate review** - skips processing for flagged plates

### 4. Rule Engine
- **Payment validation** with configurable grace periods
- **Permit checking** (site-specific and global)
- **Grace period rules** (entry, exit, overstay)
- **Decision outcomes**:
  - COMPLIANT
  - ENFORCEMENT_CANDIDATE
  - PASS_THROUGH
  - ACCESS_GRANTED
  - ACCESS_DENIED
  - REQUIRES_REVIEW
  - CANCELLED
- **Rule priority**: Permits → Payments → Grace Period → Enforcement

### 5. Enforcement Workflow
- **Human review queue** for enforcement candidates
- **Approve/Decline workflow** with operator tracking
- **Vehicle history** lookup
- **Vehicle notes** and **markers** for flagging
- **PCN batch export** functionality
- **Status tracking**:
  - NEW → APPROVED_PCN → EXPORTED_PCN
  - NEW → DECLINED_PCN

### 6. Data Reconciliation
- **Late-arriving payments** automatically reconcile sessions
- **Late-arriving permits** automatically reconcile sessions
- **Decision updates** when new data arrives
- **Audit trail** for all reconciliation actions

### 7. Audit System
- **Comprehensive logging** of all system actions
- **Entity tracking**: Movement, Session, Decision, Payment, Permit, PlateReview
- **Action logging**: Created, Updated, Reconciled, Reviewed, etc.
- **Actor tracking**: User ID, System, API client
- **Relationship tracking**: Parent audit logs, related entities
- **Search capabilities**: By VRM, entity type, action, date range
- **Timeline view**: Full chronological history per VRM
- **Case history**: Complete enforcement decision trail

### 8. Multi-Site Support
- **Site-specific configuration**:
  - Operating models (ANPR, Whitelist, Barrier)
  - Grace periods (entry, exit, overstay)
  - Camera mappings with direction resolution
  - Real-time processing flags
- **Monday.com integration**:
  - Site synchronization
  - Permit synchronization
  - Camera configuration sync
  - Scheduled polling (every 10 minutes)

### 9. Dashboard & UI
- **React-based admin interface** with Vite
- **Dark mode support** with theme persistence
- **Real-time statistics**:
  - Sessions count
  - Decisions count
  - Pending reviews (plates and enforcement)
- **Multi-view navigation**:
  - Dashboard
  - Sites Management
  - **Plate Review Queue** 🆕
  - Enforcement Review Queue
  - PCN Batch Export
  - ANPR Events
  - Parking Events Overview
  - Permits & Whitelist
  - Audit Trail
  - Build History
  - Payment Tracking
  - System Settings
- **Advanced filtering** on all data views
- **Pagination** for large datasets
- **Image galleries** for visual verification

### 10. Payment Integration
- **Multiple payment sources**: App, Kiosk, Terminal, Import
- **Time window validation**
- **Payment tracking view** with reconciliation status
- **Active/expired payment monitoring**

### 11. Permit Management
- **Permit types**: Whitelist, Resident, Staff, Contractor
- **Global and site-specific permits**
- **Date range support** (start/end dates)
- **Active/inactive status**
- **Monday.com synchronization**

## Technical Features

### Backend (NestJS)
- **TypeScript** with strict type checking
- **PostgreSQL** database with TypeORM
- **RESTful API** with comprehensive endpoints
- **Dependency injection** for clean architecture
- **Environment-based configuration**
- **Error handling** with logging
- **Async processing** with error recovery

### Frontend (React)
- **TypeScript** with strict typing
- **Tailwind CSS** for styling
- **Lucide React** icons
- **Axios** for HTTP requests
- **Dark mode** with localStorage persistence
- **Responsive design** for mobile/desktop

### Database
- **PostgreSQL 12+** (recommended 14+)
- **Auto-migrations** in development
- **Indexed queries** for performance
- **JSONB columns** for flexible data
- **Comprehensive schema** with 13+ entities

### DevOps
- **GitHub Actions** CI/CD pipelines
- **Automated testing** (unit and E2E)
- **Security scanning** with CodeQL
- **Dependency audits**
- **Build auditing** with version tracking
- **Automated releases** on version tags

## Security Features

### Data Protection
- **Input validation** on all endpoints
- **SQL injection protection** via TypeORM
- **XSS prevention** via React
- **Audit trail** for accountability
- **Error logging** without sensitive data exposure

### Operational Security
- **Duplicate detection** prevents data pollution
- **Validation** ensures data quality
- **Human review** for suspicious data
- **Operator tracking** for accountability
- **Immutable audit logs**

## Integration Points

### Monday.com
- **Site sync**: Pulls site configuration
- **Permit sync**: Pulls permit/whitelist data
- **Camera sync**: Pulls camera configurations
- **Scheduled polling**: Every 10 minutes
- **Error handling**: Continues on failure

### ANPR Cameras
- **REST API ingestion**: POST /ingestion/anpr
- **Multiple camera types**: Hikvision, Axis, generic
- **Image handling**: URLs or local storage
- **Metadata support**: Confidence, direction, timestamps
- **Flexible schema**: Supports various camera formats

### External Systems
- **Payment systems**: REST API ingestion
- **PCN export**: Batch export for ticketing systems
- **Audit export**: Full audit trail access

## Performance Features

- **Efficient queries** with database indexes
- **Pagination** on all list endpoints
- **Image optimization** with local caching
- **Async processing** prevents blocking
- **Connection pooling** for database
- **Duplicate detection** reduces overhead

## Monitoring & Observability

- **Build audit trail**: Tracks deployments
- **System health**: Online/offline indicators
- **Statistics dashboard**: Real-time metrics
- **Comprehensive logging**: All actions logged
- **Error tracking**: Detailed error logs
- **Performance metrics**: Session counts, decision counts

## Scalability

- **Multi-tenant ready**: Site-based isolation
- **Horizontal scaling**: Stateless backend
- **Database indexing**: Optimized queries
- **Async processing**: Non-blocking operations
- **Configurable limits**: Pagination, batch sizes

## Future Enhancements

### Planned Features
- [ ] User authentication and authorization
- [ ] Role-based access control (RBAC)
- [ ] Email notifications for pending reviews
- [ ] SMS notifications for enforcement
- [ ] Advanced analytics dashboard
- [ ] Machine learning for plate correction
- [ ] Mobile app for on-site review
- [ ] Real-time WebSocket updates
- [ ] Multi-language support

### Integration Roadmap
- [ ] DVLA plate validation API
- [ ] Payment gateway integrations
- [ ] Ticketing system integrations
- [ ] Reporting and analytics tools
- [ ] Third-party ANPR systems

## Documentation

- **[README.md](../README.md)** - Quick start and overview
- **[DEVELOPMENT.md](../DEVELOPMENT.md)** - Development guide
- **[API.md](../API.md)** - Complete API reference
- **[PLATE_REVIEW_SYSTEM.md](./PLATE_REVIEW_SYSTEM.md)** - Plate review system guide
- **[STATE_OF_PLAY.md](../STATE_OF_PLAY.md)** - Current status and roadmap

---

**Last Updated:** January 2024
**System Version:** Production Ready
**Comprehensive Feature Count:** 60+ major features
