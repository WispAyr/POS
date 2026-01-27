# Audit System Design & Specification

## Overview

The Parking Operations System requires a comprehensive audit trail that functions as a syslog for all enforcement activities and platform operations. The audit system must provide complete traceability from any data point (VRM, decision, session, etc.) back to the original camera event and images, documenting how, why, when, and by whom every action was performed.

## Objectives

1. **Complete Traceability** - Trace any enforcement case back to original camera events
2. **Compliance** - Meet legal and regulatory requirements for evidence handling
3. **Dispute Resolution** - Provide clear audit trail for appeals and disputes
4. **Forensic Analysis** - Enable investigation of system behavior and decisions
5. **Accountability** - Track all human and system actions with timestamps and actors

## Audit Principles

### 1. Immutability
- Audit logs are **never modified or deleted** (except per retention policy)
- All logs are append-only
- Original data is preserved alongside audit records

### 2. Completeness
- **Every significant action** is logged
- No gaps in the audit trail
- All decision points are documented

### 3. Timeliness
- Logs are created **immediately** when actions occur
- No batching or delayed logging
- Real-time audit trail

### 4. Traceability
- Every log entry links to related entities
- Chain of custody is maintained
- Full data lineage is available

### 5. Searchability
- Fast queries by VRM, entity ID, timestamp, actor
- Efficient indexing for common queries
- Support for complex audit investigations

## Audit Log Structure

### Enhanced AuditLog Entity

```typescript
@Entity('audit_logs')
export class AuditLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    // Core Identification
    @Column()
    entityType: string; // 'MOVEMENT', 'SESSION', 'DECISION', 'PAYMENT', 'PERMIT', 'ENFORCEMENT', etc.
    
    @Column()
    entityId: string; // ID of the entity being audited

    // Action Details
    @Column()
    action: string; // Standardized action code (see Action Codes below)
    
    @Column({ type: 'jsonb' })
    details: AuditDetails; // Structured details (see below)

    // Actor Information
    @Column({ default: 'SYSTEM' })
    actor: string; // 'SYSTEM', User ID, API Key, etc.
    
    @Column({ nullable: true })
    actorType: string; // 'SYSTEM', 'USER', 'API', 'SCHEDULER', 'INTEGRATION'
    
    @Column({ nullable: true })
    ipAddress: string; // For API requests
    
    @Column({ type: 'jsonb', nullable: true })
    actorContext: any; // Additional actor context (user role, API client, etc.)

    // Traceability
    @Column({ type: 'jsonb', nullable: true })
    relatedEntities: RelatedEntity[]; // Links to related entities
    
    @Column({ nullable: true })
    traceId: string; // Correlation ID for request tracing
    
    @Column({ nullable: true })
    parentAuditId: string; // Link to parent audit log (for cascading actions)

    // Context
    @Column({ nullable: true })
    siteId: string; // Site context
    
    @Column({ nullable: true })
    vrm: string; // VRM context (for fast VRM-based queries)
    
    @Column({ type: 'jsonb', nullable: true })
    metadata: any; // Additional metadata (request ID, session ID, etc.)

    // Timestamps
    @CreateDateColumn()
    timestamp: Date; // When the action occurred
    
    @Column({ type: 'timestamp', nullable: true })
    processedAt: Date; // When the action was processed (for async operations)
}
```

### AuditDetails Structure

```typescript
interface AuditDetails {
    // What changed
    previousState?: any; // Previous state of entity
    newState?: any; // New state of entity
    changes?: { [key: string]: { from: any; to: any } }; // Specific field changes
    
    // Why it changed
    reason?: string; // Human-readable reason
    ruleApplied?: string; // Rule or policy that triggered action
    rationale?: string; // Decision rationale
    
    // How it changed
    method?: string; // 'AUTO', 'MANUAL', 'API', 'RECONCILIATION', etc.
    source?: string; // Source of change (API endpoint, service name, etc.)
    
    // Additional context
    images?: string[]; // Related image IDs/URLs
    evidence?: EvidenceReference[]; // Links to evidence
    errors?: string[]; // Any errors encountered
    warnings?: string[]; // Any warnings
}
```

### RelatedEntity Structure

```typescript
interface RelatedEntity {
    entityType: string; // 'MOVEMENT', 'SESSION', 'DECISION', etc.
    entityId: string; // ID of related entity
    relationship: string; // 'CREATED_BY', 'TRIGGERED_BY', 'AFFECTS', 'REFERENCES', etc.
}
```

### EvidenceReference Structure

```typescript
interface EvidenceReference {
    type: 'IMAGE' | 'DOCUMENT' | 'VIDEO' | 'DATA_EXPORT';
    id: string; // Evidence ID
    url?: string; // URL to evidence
    hash?: string; // Integrity hash
    timestamp?: Date; // When evidence was captured
}
```

## Action Codes

### Standardized Action Codes

#### Data Ingestion
- `MOVEMENT_INGESTED` - ANPR movement received
- `MOVEMENT_DUPLICATE_DETECTED` - Duplicate movement detected
- `PAYMENT_INGESTED` - Payment record received
- `PERMIT_INGESTED` - Permit/whitelist received
- `IMAGE_STORED` - Image stored locally
- `IMAGE_DOWNLOADED` - Image downloaded from external source

#### Session Processing
- `SESSION_CREATED` - New parking session created
- `SESSION_UPDATED` - Session updated (exit added, duration calculated)
- `SESSION_COMPLETED` - Session marked as completed
- `SESSION_INVALIDATED` - Session marked as invalid

#### Rule Evaluation
- `DECISION_CREATED` - Rule evaluation decision created
- `DECISION_RECONCILED` - Decision updated due to reconciliation
- `RULE_EVALUATED` - Rule evaluation performed
- `RULE_OVERRIDE` - Rule outcome overridden by operator

#### Enforcement
- `ENFORCEMENT_QUEUED` - Decision added to enforcement queue
- `ENFORCEMENT_REVIEWED` - Operator reviewed enforcement case
- `ENFORCEMENT_APPROVED` - Enforcement approved
- `ENFORCEMENT_DECLINED` - Enforcement declined
- `ENFORCEMENT_EXPORTED` - Enforcement exported to external system
- `ENFORCEMENT_ARCHIVED` - Enforcement archived

#### Data Reconciliation
- `RECONCILIATION_TRIGGERED` - Reconciliation process started
- `RECONCILIATION_SESSION_RE_EVALUATED` - Session re-evaluated
- `RECONCILIATION_DECISION_UPDATED` - Decision updated by reconciliation

#### Configuration
- `SITE_CREATED` - Site created
- `SITE_UPDATED` - Site configuration updated
- `SITE_DEACTIVATED` - Site deactivated
- `PERMIT_CREATED` - Permit created
- `PERMIT_UPDATED` - Permit updated
- `PERMIT_DELETED` - Permit deleted

#### Integration
- `MONDAY_SYNC_STARTED` - Monday.com sync started
- `MONDAY_SYNC_COMPLETED` - Monday.com sync completed
- `MONDAY_PERMIT_PUSHED` - Permit pushed to Monday.com
- `MONDAY_PERMIT_UPDATED` - Permit updated on Monday.com
- `MONDAY_PERMIT_DELETED` - Permit deleted from Monday.com

#### System
- `SYSTEM_STARTUP` - System started
- `SYSTEM_SHUTDOWN` - System shutdown
- `HEALTH_CHECK` - Health check performed
- `ERROR_OCCURRED` - Error logged
- `WARNING_RAISED` - Warning logged

## Audit Points

### 1. Data Ingestion

**ANPR Movement Ingestion:**
```typescript
{
    entityType: 'MOVEMENT',
    entityId: movement.id,
    action: 'MOVEMENT_INGESTED',
    actor: 'SYSTEM',
    actorType: 'SYSTEM',
    details: {
        vrm: movement.vrm,
        siteId: movement.siteId,
        timestamp: movement.timestamp,
        direction: movement.direction,
        cameraId: movement.cameraIds,
        images: movement.images.map(img => img.url),
        source: 'ANPR_CAMERA',
        rawData: movement.rawData,
    },
    relatedEntities: [
        { entityType: 'SITE', entityId: movement.siteId, relationship: 'OCCURRED_AT' }
    ],
    siteId: movement.siteId,
    vrm: movement.vrm,
    metadata: {
        ingestionMethod: 'API',
        duplicateCheck: false,
    }
}
```

**Payment Ingestion:**
```typescript
{
    entityType: 'PAYMENT',
    entityId: payment.id,
    action: 'PAYMENT_INGESTED',
    actor: 'SYSTEM',
    actorType: 'SYSTEM',
    details: {
        vrm: payment.vrm,
        siteId: payment.siteId,
        amount: payment.amount,
        startTime: payment.startTime,
        expiryTime: payment.expiryTime,
        source: payment.source,
        externalReference: payment.externalReference,
    },
    siteId: payment.siteId,
    vrm: payment.vrm,
    metadata: {
        reconciliationTriggered: true,
    }
}
```

### 2. Session Processing

**Session Created:**
```typescript
{
    entityType: 'SESSION',
    entityId: session.id,
    action: 'SESSION_CREATED',
    actor: 'SYSTEM',
    actorType: 'SYSTEM',
    details: {
        vrm: session.vrm,
        siteId: session.siteId,
        entryTime: session.startTime,
        entryMovementId: session.entryMovementId,
        status: session.status,
    },
    relatedEntities: [
        { entityType: 'MOVEMENT', entityId: session.entryMovementId, relationship: 'CREATED_BY' },
        { entityType: 'SITE', entityId: session.siteId, relationship: 'OCCURRED_AT' }
    ],
    siteId: session.siteId,
    vrm: session.vrm,
    parentAuditId: entryMovementAuditId, // Link to movement ingestion audit
}
```

**Session Completed:**
```typescript
{
    entityType: 'SESSION',
    entityId: session.id,
    action: 'SESSION_COMPLETED',
    actor: 'SYSTEM',
    actorType: 'SYSTEM',
    details: {
        exitTime: session.endTime,
        durationMinutes: session.durationMinutes,
        exitMovementId: session.exitMovementId,
        previousStatus: 'PROVISIONAL',
        newStatus: 'COMPLETED',
    },
    relatedEntities: [
        { entityType: 'MOVEMENT', entityId: session.exitMovementId, relationship: 'COMPLETED_BY' }
    ],
    parentAuditId: sessionCreatedAuditId,
}
```

### 3. Rule Evaluation

**Decision Created:**
```typescript
{
    entityType: 'DECISION',
    entityId: decision.id,
    action: 'DECISION_CREATED',
    actor: 'SYSTEM',
    actorType: 'RULE_ENGINE',
    details: {
        outcome: decision.outcome,
        ruleApplied: decision.ruleApplied,
        rationale: decision.rationale,
        sessionId: decision.sessionId,
        evaluationTimestamp: new Date(),
    },
    relatedEntities: [
        { entityType: 'SESSION', entityId: decision.sessionId, relationship: 'EVALUATES' }
    ],
    siteId: session.siteId,
    vrm: session.vrm,
    parentAuditId: sessionCompletedAuditId,
}
```

### 4. Enforcement Actions

**Enforcement Reviewed:**
```typescript
{
    entityType: 'DECISION',
    entityId: decision.id,
    action: 'ENFORCEMENT_REVIEWED',
    actor: operatorId,
    actorType: 'USER',
    details: {
        previousStatus: 'NEW',
        newStatus: decision.status,
        action: 'APPROVE' | 'DECLINE',
        notes: notes,
        reviewTimestamp: new Date(),
    },
    relatedEntities: [
        { entityType: 'SESSION', entityId: decision.sessionId, relationship: 'REVIEWS' }
    ],
    parentAuditId: decisionCreatedAuditId,
}
```

### 5. Data Reconciliation

**Reconciliation Triggered:**
```typescript
{
    entityType: 'PAYMENT',
    entityId: payment.id,
    action: 'RECONCILIATION_TRIGGERED',
    actor: 'SYSTEM',
    actorType: 'RECONCILIATION_SERVICE',
    details: {
        trigger: 'PAYMENT_ARRIVED',
        vrm: payment.vrm,
        siteId: payment.siteId,
        paymentPeriod: {
            start: payment.startTime,
            end: payment.expiryTime,
        },
    },
    relatedEntities: [
        { entityType: 'PAYMENT', entityId: payment.id, relationship: 'TRIGGERS' }
    ],
    siteId: payment.siteId,
    vrm: payment.vrm,
}
```

**Decision Updated by Reconciliation:**
```typescript
{
    entityType: 'DECISION',
    entityId: decision.id,
    action: 'DECISION_RECONCILED',
    actor: 'SYSTEM',
    actorType: 'RECONCILIATION_SERVICE',
    details: {
        previousOutcome: oldDecision.outcome,
        newOutcome: decision.outcome,
        previousRule: oldDecision.ruleApplied,
        newRule: decision.ruleApplied,
        reason: 'LATE_PAYMENT_ARRIVED',
        reconciliationTimestamp: new Date(),
    },
    relatedEntities: [
        { entityType: 'PAYMENT', entityId: payment.id, relationship: 'TRIGGERED_BY' },
        { entityType: 'SESSION', entityId: decision.sessionId, relationship: 'AFFECTS' }
    ],
    parentAuditId: reconciliationTriggeredAuditId,
}
```

## Traceability Features

### 1. VRM Trace

**Query:** "Show complete audit trail for VRM ABC123"

**Returns:**
- All movements for VRM
- All sessions for VRM
- All payments for VRM
- All permits for VRM
- All decisions for VRM
- All enforcement actions for VRM
- All reconciliation events for VRM
- Chronological timeline of all events

### 2. Decision Trace

**Query:** "Show how decision XYZ was created"

**Returns:**
- Decision creation audit log
- Session that triggered decision
- Entry and exit movements
- Images associated with movements
- Payments/permits checked
- Rules evaluated
- Complete decision rationale

### 3. Enforcement Case Trace

**Query:** "Show complete enforcement case history"

**Returns:**
- Initial camera events (entry/exit)
- Images captured
- Session creation and completion
- Rule evaluation
- Decision creation
- Queue placement
- Operator review actions
- Approval/decline
- Export/archival actions
- All related audit logs in chronological order

### 4. Image Trace

**Query:** "Show all actions involving image ABC.jpg"

**Returns:**
- Image ingestion
- Image storage
- Image association with movements
- Image viewing/downloading
- Image deletion (if applicable)
- All entities that reference the image

## Audit Service Design

### AuditService Interface

```typescript
@Injectable()
export class AuditService {
    // Core logging
    async log(action: AuditAction, context: AuditContext): Promise<AuditLog>;
    
    // Specialized logging
    async logMovementIngestion(movement: Movement): Promise<AuditLog>;
    async logSessionCreation(session: Session, entryMovement: Movement): Promise<AuditLog>;
    async logSessionCompletion(session: Session, exitMovement: Movement): Promise<AuditLog>;
    async logDecisionCreation(decision: Decision, session: Session): Promise<AuditLog>;
    async logEnforcementReview(decision: Decision, operatorId: string, action: string, notes?: string): Promise<AuditLog>;
    async logReconciliation(trigger: ReconciliationTrigger, results: ReconciliationResults): Promise<AuditLog[]>;
    
    // Query methods
    async getAuditTrailByVrm(vrm: string, options?: AuditQueryOptions): Promise<AuditLog[]>;
    async getAuditTrailByEntity(entityType: string, entityId: string): Promise<AuditLog[]>;
    async getAuditTrailByDecision(decisionId: string): Promise<AuditLog[]>;
    async getAuditTrailByEnforcement(decisionId: string): Promise<AuditLog[]>;
    async getAuditTrailByImage(imageId: string): Promise<AuditLog[]>;
    
    // Timeline methods
    async getTimeline(vrm: string, startDate?: Date, endDate?: Date): Promise<AuditTimeline>;
    async getEnforcementCaseHistory(decisionId: string): Promise<EnforcementCaseHistory>;
    
    // Search methods
    async searchAuditLogs(query: AuditSearchQuery): Promise<AuditLog[]>;
}
```

## Integration Points

### 1. Ingestion Module
- Log every ANPR movement ingestion
- Log payment/permit ingestion
- Log image storage
- Link to source data

### 2. Engine Module
- Log session creation/completion
- Log rule evaluations
- Log decision creation
- Link sessions to movements

### 3. Enforcement Module
- Log queue operations
- Log operator reviews
- Log approvals/declines
- Log exports/archival

### 4. Reconciliation Module
- Log reconciliation triggers
- Log re-evaluations
- Log decision updates
- Link to triggering events

### 5. API Module
- Log API requests (optional, for sensitive operations)
- Log data exports
- Log configuration changes

### 6. Integration Module
- Log Monday.com syncs
- Log external system interactions
- Log integration errors

## Indexing Strategy

### Required Indexes

```sql
-- Fast VRM queries
CREATE INDEX idx_audit_logs_vrm ON audit_logs(vrm, timestamp DESC);

-- Fast entity queries
CREATE INDEX idx_audit_logs_entity ON audit_logs(entityType, entityId, timestamp DESC);

-- Fast site queries
CREATE INDEX idx_audit_logs_site ON audit_logs(siteId, timestamp DESC) WHERE siteId IS NOT NULL;

-- Fast actor queries
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor, timestamp DESC);

-- Fast action queries
CREATE INDEX idx_audit_logs_action ON audit_logs(action, timestamp DESC);

-- Fast trace queries
CREATE INDEX idx_audit_logs_trace ON audit_logs(traceId) WHERE traceId IS NOT NULL;

-- Fast parent queries
CREATE INDEX idx_audit_logs_parent ON audit_logs(parentAuditId) WHERE parentAuditId IS NOT NULL;

-- Time-based queries
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
```

## Retention Policy

### Implementation

- **Enforcement-related logs:** 3 years retention
- **Operational logs:** 3 weeks retention
- **System logs:** 1 week retention

### Archival Strategy

1. **Active Logs** - Current period (hot storage)
2. **Archived Logs** - Past period (cold storage)
3. **Deleted Logs** - Beyond retention (removed)

### Automated Cleanup

- Scheduled job to archive old logs
- Separate job to delete beyond retention
- Maintain audit log of archival/deletion operations

## Performance Considerations

### High-Volume Logging

- **Async Logging** - Don't block main operations
- **Batch Inserts** - Group related logs when possible
- **Partitioning** - Partition by timestamp for large datasets
- **Compression** - Compress archived logs

### Query Optimization

- **Materialized Views** - Pre-computed common queries
- **Caching** - Cache frequent audit trail queries
- **Pagination** - Always paginate large result sets

## Security & Integrity

### Log Protection

- **Immutable Storage** - Prevent modification
- **Access Control** - Restrict who can read audit logs
- **Encryption** - Encrypt sensitive audit data
- **Integrity Checks** - Hash-based integrity verification

### Compliance

- **Tamper Evidence** - Detect any unauthorized changes
- **Chain of Custody** - Track all access to audit logs
- **Export Capabilities** - Export audit trails for legal purposes

## Implementation Phases

### Phase 1: Core Audit Service
- Enhanced AuditLog entity
- Basic AuditService implementation
- Integration with key modules (ingestion, engine, enforcement)

### Phase 2: Traceability
- VRM trace queries
- Decision trace queries
- Enforcement case history
- Timeline generation

### Phase 3: Advanced Features
- Search capabilities
- Reporting
- Archival system
- Retention policy enforcement

### Phase 4: Performance & Scale
- Partitioning
- Caching
- Materialized views
- Performance optimization

## Example Use Cases

### Use Case 1: Dispute Resolution

**Scenario:** Customer disputes parking charge for VRM ABC123

**Process:**
1. Query audit trail for VRM ABC123
2. Show complete timeline:
   - Entry movement at 10:00 AM (with image)
   - Session created
   - Exit movement at 12:00 PM (with image)
   - Session completed (2 hour duration)
   - Payment checked (none found)
   - Permit checked (none found)
   - Decision created: ENFORCEMENT_CANDIDATE
   - Operator reviewed and approved
3. Provide all evidence (images, timestamps, rationale)
4. Export audit trail for legal purposes

### Use Case 2: System Investigation

**Scenario:** Investigate why a payment wasn't applied

**Process:**
1. Query audit trail for payment ID
2. Show:
   - Payment ingested at 2:00 PM
   - Reconciliation triggered
   - Sessions re-evaluated
   - Decision updated from ENFORCEMENT_CANDIDATE to COMPLIANT
3. Show reconciliation logic and timing
4. Verify payment time window coverage

### Use Case 3: Operator Action Review

**Scenario:** Review all actions by operator "operator-123"

**Process:**
1. Query audit logs by actor = "operator-123"
2. Show all reviews, approvals, declines
3. Show context for each action
4. Generate compliance report

## API Endpoints

### Audit Query Endpoints

```
GET /api/audit/vrm/:vrm
GET /api/audit/entity/:entityType/:entityId
GET /api/audit/decision/:decisionId
GET /api/audit/enforcement/:decisionId
GET /api/audit/timeline/:vrm
GET /api/audit/search
```

## Next Steps

1. Implement enhanced AuditLog entity
2. Create AuditService
3. Integrate audit logging throughout system
4. Implement traceability queries
5. Add audit API endpoints
6. Implement retention and archival
