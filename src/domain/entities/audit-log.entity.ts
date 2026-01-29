import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export interface RelatedEntity {
  entityType: string;
  entityId: string;
  relationship: string;
}

export interface AuditDetails {
  previousState?: any;
  newState?: any;
  changes?: { [key: string]: { from: any; to: any } };
  reason?: string;
  ruleApplied?: string;
  rationale?: string;
  method?: string;
  source?: string;
  images?: string[];
  evidence?: Array<{
    type: 'IMAGE' | 'DOCUMENT' | 'VIDEO' | 'DATA_EXPORT';
    id: string;
    url?: string;
    hash?: string;
    timestamp?: Date;
  }>;
  errors?: string[];
  warnings?: string[];
  [key: string]: any;
}

@Entity('audit_logs')
@Index(['vrm', 'timestamp'])
@Index(['entityType', 'entityId', 'timestamp'])
@Index(['siteId', 'timestamp'])
@Index(['actor', 'timestamp'])
@Index(['action', 'timestamp'])
@Index(['traceId'])
@Index(['parentAuditId'])
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
  action: string; // Standardized action code (MOVEMENT_INGESTED, SESSION_CREATED, etc.)

  @Column({ type: 'jsonb' })
  details: AuditDetails; // Structured details

  // Actor Information
  @Column({ default: 'SYSTEM' })
  actor: string; // 'SYSTEM', User ID, API Key, etc.

  @Column({ type: 'varchar', nullable: true })
  actorType: string; // 'SYSTEM', 'USER', 'API', 'SCHEDULER', 'INTEGRATION'

  @Column({ type: 'varchar', nullable: true })
  ipAddress: string; // For API requests

  @Column({ type: 'jsonb', nullable: true })
  actorContext: any; // Additional actor context (user role, API client, etc.)

  // Traceability
  @Column({ type: 'jsonb', nullable: true })
  relatedEntities: RelatedEntity[]; // Links to related entities

  @Column({ type: 'varchar', nullable: true })
  traceId: string; // Correlation ID for request tracing

  @Column({ type: 'uuid', nullable: true })
  parentAuditId: string; // Link to parent audit log (for cascading actions)

  // Context
  @Column({ type: 'varchar', nullable: true })
  siteId: string; // Site context

  @Column({ type: 'varchar', nullable: true })
  vrm: string; // VRM context (for fast VRM-based queries)

  @Column({ type: 'jsonb', nullable: true })
  metadata: any; // Additional metadata (request ID, session ID, etc.)

  // Timestamps
  @CreateDateColumn()
  timestamp: Date; // When the action occurred

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date; // When the action was processed (for async operations)
}
