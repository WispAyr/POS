import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Between, In } from 'typeorm';
import { AuditLog } from '../domain/entities/audit-log.entity';
import {
  Movement,
  Session,
  Decision,
  Payment,
  Permit,
} from '../domain/entities';

export interface AuditContext {
  entityType: string;
  entityId: string;
  action: string;
  actor?: string;
  actorType?: string;
  actorContext?: any;
  ipAddress?: string;
  details?: any;
  relatedEntities?: Array<{
    entityType: string;
    entityId: string;
    relationship: string;
  }>;
  traceId?: string;
  parentAuditId?: string;
  siteId?: string;
  vrm?: string;
  metadata?: any;
}

export interface AuditQueryOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  actionFilter?: string[];
  actorFilter?: string;
}

export interface AuditTimeline {
  vrm: string;
  events: AuditLog[];
  movements: Movement[];
  sessions: Session[];
  decisions: Decision[];
  payments: Payment[];
  permits: Permit[];
  timeline: Array<{
    timestamp: Date;
    type: string;
    description: string;
    auditLog: AuditLog;
  }>;
}

export interface EnforcementCaseHistory {
  decisionId: string;
  decision: Decision;
  session: Session;
  entryMovement?: Movement;
  exitMovement?: Movement;
  payments: Payment[];
  permits: Permit[];
  auditTrail: AuditLog[];
  timeline: Array<{
    timestamp: Date;
    event: string;
    actor: string;
    details: any;
  }>;
}

/**
 * Comprehensive audit service for system-wide logging and traceability
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Decision)
    private readonly decisionRepo: Repository<Decision>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Permit)
    private readonly permitRepo: Repository<Permit>,
  ) {}

  /**
   * Core audit logging method
   */
  async log(context: AuditContext): Promise<AuditLog> {
    const audit = this.auditRepo.create({
      entityType: context.entityType,
      entityId: context.entityId,
      action: context.action,
      actor: context.actor || 'SYSTEM',
      actorType: context.actorType || 'SYSTEM',
      actorContext: context.actorContext,
      ipAddress: context.ipAddress,
      details: context.details || {},
      relatedEntities: context.relatedEntities || [],
      traceId: context.traceId,
      parentAuditId: context.parentAuditId,
      siteId: context.siteId,
      vrm: context.vrm,
      metadata: context.metadata,
      timestamp: new Date(),
    });

    const saved = await this.auditRepo.save(audit);
    this.logger.debug(
      `Audit logged: ${context.action} for ${context.entityType}:${context.entityId}`,
    );
    return saved;
  }

  /**
   * Log ANPR movement ingestion
   */
  async logMovementIngestion(
    movement: Movement,
    isNew: boolean,
    parentAuditId?: string,
  ): Promise<AuditLog> {
    return this.log({
      entityType: 'MOVEMENT',
      entityId: movement.id,
      action: isNew ? 'MOVEMENT_INGESTED' : 'MOVEMENT_DUPLICATE_DETECTED',
      actor: 'SYSTEM',
      actorType: 'SYSTEM',
      details: {
        vrm: movement.vrm,
        siteId: movement.siteId,
        timestamp: movement.timestamp,
        direction: movement.direction,
        cameraId: movement.cameraIds,
        images:
          movement.images?.map((img) => ({
            url: img.url,
            type: img.type,
            timestamp: img.timestamp,
          })) || [],
        source:
          movement.rawData?.source || movement.rawData?.cameraType || 'UNKNOWN',
        rawData: movement.rawData,
        isNew,
      },
      relatedEntities: [
        {
          entityType: 'SITE',
          entityId: movement.siteId,
          relationship: 'OCCURRED_AT',
        },
      ],
      siteId: movement.siteId,
      vrm: movement.vrm,
      parentAuditId,
      metadata: {
        ingestionMethod: 'API',
        duplicateCheck: !isNew,
      },
    });
  }

  /**
   * Log session creation
   */
  async logSessionCreation(
    session: Session,
    entryMovement: Movement,
    entryAuditId?: string,
  ): Promise<AuditLog> {
    return this.log({
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
        {
          entityType: 'MOVEMENT',
          entityId: entryMovement.id,
          relationship: 'CREATED_BY',
        },
        {
          entityType: 'SITE',
          entityId: session.siteId,
          relationship: 'OCCURRED_AT',
        },
      ],
      siteId: session.siteId,
      vrm: session.vrm,
      parentAuditId: entryAuditId,
    });
  }

  /**
   * Log session completion
   */
  async logSessionCompletion(
    session: Session,
    exitMovement: Movement,
    sessionCreatedAuditId?: string,
    exitAuditId?: string,
  ): Promise<AuditLog> {
    return this.log({
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
        newStatus: session.status,
      },
      relatedEntities: [
        {
          entityType: 'MOVEMENT',
          entityId: exitMovement.id,
          relationship: 'COMPLETED_BY',
        },
      ],
      siteId: session.siteId,
      vrm: session.vrm,
      parentAuditId: sessionCreatedAuditId || exitAuditId,
    });
  }

  /**
   * Log decision creation
   */
  async logDecisionCreation(
    decision: Decision,
    session: Session,
    sessionCompletedAuditId?: string,
  ): Promise<AuditLog> {
    return this.log({
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
      relatedEntities: decision.sessionId
        ? [
            {
              entityType: 'SESSION',
              entityId: decision.sessionId,
              relationship: 'EVALUATES',
            },
          ]
        : [],
      siteId: session.siteId,
      vrm: session.vrm,
      parentAuditId: sessionCompletedAuditId,
    });
  }

  /**
   * Log enforcement review
   */
  async logEnforcementReview(
    decision: Decision,
    operatorId: string,
    action: 'APPROVE' | 'DECLINE',
    notes?: string,
    previousStatus?: string,
    decisionCreatedAuditId?: string,
  ): Promise<AuditLog> {
    return this.log({
      entityType: 'DECISION',
      entityId: decision.id,
      action: 'ENFORCEMENT_REVIEWED',
      actor: operatorId,
      actorType: 'USER',
      details: {
        previousStatus: previousStatus || decision.status,
        newStatus: decision.status,
        action,
        notes,
        reviewTimestamp: new Date(),
      },
      relatedEntities: decision.sessionId
        ? [
            {
              entityType: 'SESSION',
              entityId: decision.sessionId,
              relationship: 'REVIEWS',
            },
          ]
        : [],
      parentAuditId: decisionCreatedAuditId,
    });
  }

  /**
   * Log payment ingestion
   */
  async logPaymentIngestion(payment: Payment): Promise<AuditLog> {
    return this.log({
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
      relatedEntities: [
        {
          entityType: 'SITE',
          entityId: payment.siteId,
          relationship: 'OCCURRED_AT',
        },
      ],
      siteId: payment.siteId,
      vrm: payment.vrm,
      metadata: {
        reconciliationTriggered: true,
      },
    });
  }

  /**
   * Log permit ingestion
   */
  async logPermitIngestion(permit: Permit): Promise<AuditLog> {
    return this.log({
      entityType: 'PERMIT',
      entityId: permit.id,
      action: 'PERMIT_INGESTED',
      actor: 'SYSTEM',
      actorType: 'SYSTEM',
      details: {
        vrm: permit.vrm,
        siteId: permit.siteId,
        type: permit.type,
        startDate: permit.startDate,
        endDate: permit.endDate,
        active: permit.active,
      },
      relatedEntities: permit.siteId
        ? [
            {
              entityType: 'SITE',
              entityId: permit.siteId,
              relationship: 'APPLIES_TO',
            },
          ]
        : [],
      siteId: permit.siteId || undefined,
      vrm: permit.vrm,
    });
  }

  /**
   * Log reconciliation trigger
   */
  async logReconciliationTrigger(
    triggerType: 'PAYMENT' | 'PERMIT',
    triggerEntityId: string,
    vrm: string,
    siteId: string,
  ): Promise<AuditLog> {
    return this.log({
      entityType: triggerType,
      entityId: triggerEntityId,
      action: 'RECONCILIATION_TRIGGERED',
      actor: 'SYSTEM',
      actorType: 'RECONCILIATION_SERVICE',
      details: {
        trigger: `${triggerType}_ARRIVED`,
        vrm,
        siteId,
      },
      relatedEntities: [
        {
          entityType: triggerType,
          entityId: triggerEntityId,
          relationship: 'TRIGGERS',
        },
      ],
      siteId,
      vrm,
    });
  }

  /**
   * Log decision reconciliation
   */
  async logDecisionReconciliation(
    decision: Decision,
    oldDecision: Decision,
    triggerEntityId: string,
    triggerType: string,
    reconciliationTriggerAuditId?: string,
  ): Promise<AuditLog> {
    return this.log({
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
        reason: `LATE_${triggerType}_ARRIVED`,
        reconciliationTimestamp: new Date(),
      },
      relatedEntities: [
        {
          entityType: triggerType,
          entityId: triggerEntityId,
          relationship: 'TRIGGERED_BY',
        },
        ...(decision.sessionId
          ? [
              {
                entityType: 'SESSION',
                entityId: decision.sessionId,
                relationship: 'AFFECTS',
              },
            ]
          : []),
      ],
      parentAuditId: reconciliationTriggerAuditId,
    });
  }

  /**
   * Get complete audit trail for a VRM
   */
  async getAuditTrailByVrm(
    vrm: string,
    options?: AuditQueryOptions,
  ): Promise<AuditLog[]> {
    const normalizedVrm = vrm.toUpperCase().replace(/\s/g, '');
    const where: FindOptionsWhere<AuditLog> = { vrm: normalizedVrm };

    if (options?.startDate || options?.endDate) {
      where.timestamp = Between(
        options.startDate || new Date(0),
        options.endDate || new Date(),
      );
    }

    if (options?.actionFilter) {
      where.action = In(options.actionFilter) as any;
    }

    if (options?.actorFilter) {
      where.actor = options.actorFilter;
    }

    const query = this.auditRepo
      .createQueryBuilder('audit')
      .where('audit.vrm = :vrm', { vrm: normalizedVrm })
      .orderBy('audit.timestamp', 'ASC');

    if (options?.startDate) {
      query.andWhere('audit.timestamp >= :startDate', {
        startDate: options.startDate,
      });
    }

    if (options?.endDate) {
      query.andWhere('audit.timestamp <= :endDate', {
        endDate: options.endDate,
      });
    }

    if (options?.actionFilter && options.actionFilter.length > 0) {
      query.andWhere('audit.action IN (:...actions)', {
        actions: options.actionFilter,
      });
    }

    if (options?.actorFilter) {
      query.andWhere('audit.actor = :actor', { actor: options.actorFilter });
    }

    if (options?.limit) {
      query.take(options.limit);
    }

    if (options?.offset) {
      query.skip(options.offset);
    }

    return query.getMany();
  }

  /**
   * Get audit trail for a specific entity
   */
  async getAuditTrailByEntity(
    entityType: string,
    entityId: string,
  ): Promise<AuditLog[]> {
    return this.auditRepo.find({
      where: {
        entityType,
        entityId,
      },
      order: { timestamp: 'ASC' },
    });
  }

  /**
   * Get complete timeline for a VRM with all related entities
   */
  async getTimeline(
    vrm: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<AuditTimeline> {
    const normalizedVrm = vrm.toUpperCase().replace(/\s/g, '');

    // Get all audit logs
    const auditLogs = await this.getAuditTrailByVrm(normalizedVrm, {
      startDate,
      endDate,
    });

    // Extract entity IDs from audit logs
    const movementIds = new Set<string>();
    const sessionIds = new Set<string>();
    const decisionIds = new Set<string>();
    const paymentIds = new Set<string>();
    const permitIds = new Set<string>();

    auditLogs.forEach((log) => {
      if (log.entityType === 'MOVEMENT') movementIds.add(log.entityId);
      if (log.entityType === 'SESSION') sessionIds.add(log.entityId);
      if (log.entityType === 'DECISION') decisionIds.add(log.entityId);
      if (log.entityType === 'PAYMENT') paymentIds.add(log.entityId);
      if (log.entityType === 'PERMIT') permitIds.add(log.entityId);

      log.relatedEntities?.forEach((rel) => {
        if (rel.entityType === 'MOVEMENT') movementIds.add(rel.entityId);
        if (rel.entityType === 'SESSION') sessionIds.add(rel.entityId);
        if (rel.entityType === 'DECISION') decisionIds.add(rel.entityId);
        if (rel.entityType === 'PAYMENT') paymentIds.add(rel.entityId);
        if (rel.entityType === 'PERMIT') permitIds.add(rel.entityId);
      });
    });

    // Fetch all related entities
    const [movements, sessions, decisions, payments, permits] =
      await Promise.all([
        movementIds.size > 0
          ? this.movementRepo.findBy({ id: In(Array.from(movementIds)) })
          : [],
        sessionIds.size > 0
          ? this.sessionRepo.findBy({ id: In(Array.from(sessionIds)) })
          : [],
        decisionIds.size > 0
          ? this.decisionRepo.findBy({ id: In(Array.from(decisionIds)) })
          : [],
        paymentIds.size > 0
          ? this.paymentRepo.findBy({ id: In(Array.from(paymentIds)) })
          : [],
        permitIds.size > 0
          ? this.permitRepo.findBy({ id: In(Array.from(permitIds)) })
          : [],
      ]);

    // Build timeline
    const timeline = auditLogs.map((log) => ({
      timestamp: log.timestamp,
      type: log.action,
      description: this.getActionDescription(log),
      auditLog: log,
    }));

    return {
      vrm: normalizedVrm,
      events: auditLogs,
      movements,
      sessions,
      decisions,
      payments,
      permits,
      timeline: timeline.sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
      ),
    };
  }

  /**
   * Get complete enforcement case history
   */
  async getEnforcementCaseHistory(
    decisionId: string,
  ): Promise<EnforcementCaseHistory> {
    const decision = await this.decisionRepo.findOne({
      where: { id: decisionId },
    });
    if (!decision) {
      throw new Error(`Decision ${decisionId} not found`);
    }

    if (!decision.sessionId) {
      throw new Error(`Decision ${decisionId} has no associated session`);
    }

    const session = await this.sessionRepo.findOne({
      where: { id: decision.sessionId },
    });
    if (!session) {
      throw new Error(`Session ${decision.sessionId} not found`);
    }

    // Get all audit logs related to this enforcement case
    const auditTrail = await this.getAuditTrailByVrm(session.vrm);

    // Get related entities
    const [entryMovement, exitMovement] = await Promise.all([
      session.entryMovementId
        ? this.movementRepo.findOne({ where: { id: session.entryMovementId } })
        : null,
      session.exitMovementId
        ? this.movementRepo.findOne({ where: { id: session.exitMovementId } })
        : null,
    ]);

    const [payments, permits] = await Promise.all([
      this.paymentRepo.find({
        where: { vrm: session.vrm, siteId: session.siteId },
      }),
      this.permitRepo.find({
        where: [
          { vrm: session.vrm, siteId: session.siteId },
          { vrm: session.vrm, siteId: null as any },
        ],
      }),
    ]);

    // Build timeline
    const timeline = auditTrail
      .filter(
        (log) =>
          (log.entityType === 'MOVEMENT' &&
            (log.entityId === session.entryMovementId ||
              log.entityId === session.exitMovementId)) ||
          (log.entityType === 'SESSION' && log.entityId === session.id) ||
          (log.entityType === 'DECISION' && log.entityId === decision.id),
      )
      .map((log) => ({
        timestamp: log.timestamp,
        event: log.action,
        actor: log.actor,
        details: log.details,
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return {
      decisionId,
      decision,
      session,
      entryMovement: entryMovement || undefined,
      exitMovement: exitMovement || undefined,
      payments,
      permits,
      auditTrail,
      timeline,
    };
  }

  /**
   * Search audit logs with flexible criteria
   */
  async searchAuditLogs(query: {
    vrm?: string;
    siteId?: string;
    entityType?: string;
    entityId?: string;
    action?: string;
    actor?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<AuditLog[]> {
    const qb = this.auditRepo.createQueryBuilder('audit');

    if (query.vrm) {
      qb.andWhere('audit.vrm = :vrm', {
        vrm: query.vrm.toUpperCase().replace(/\s/g, ''),
      });
    }

    if (query.siteId) {
      qb.andWhere('audit.siteId = :siteId', { siteId: query.siteId });
    }

    if (query.entityType) {
      qb.andWhere('audit.entityType = :entityType', {
        entityType: query.entityType,
      });
    }

    if (query.entityId) {
      qb.andWhere('audit.entityId = :entityId', { entityId: query.entityId });
    }

    if (query.action) {
      qb.andWhere('audit.action = :action', { action: query.action });
    }

    if (query.actor) {
      qb.andWhere('audit.actor = :actor', { actor: query.actor });
    }

    if (query.startDate) {
      qb.andWhere('audit.timestamp >= :startDate', {
        startDate: query.startDate,
      });
    }

    if (query.endDate) {
      qb.andWhere('audit.timestamp <= :endDate', { endDate: query.endDate });
    }

    qb.orderBy('audit.timestamp', 'DESC');

    if (query.limit) {
      qb.take(query.limit);
    }

    if (query.offset) {
      qb.skip(query.offset);
    }

    return qb.getMany();
  }

  /**
   * Log email fetch from payment provider
   */
  async logEmailFetch(
    providerId: string,
    providerName: string,
    emailCount: number,
    details?: any,
  ): Promise<AuditLog> {
    return this.log({
      entityType: 'PAYMENT_PROVIDER',
      entityId: providerId,
      action: 'EMAIL_FETCH',
      actor: 'SYSTEM',
      actorType: 'PAYMENT_PROVIDER',
      details: {
        providerName,
        emailCount,
        ...details,
      },
      relatedEntities: [
        {
          entityType: 'PAYMENT_PROVIDER',
          entityId: providerId,
          relationship: 'FETCHED_FROM',
        },
      ],
    });
  }

  /**
   * Log ingestion error from payment provider
   */
  async logIngestionError(
    providerId: string,
    providerName: string,
    ingestionLogId: string,
    error: string,
    details?: any,
  ): Promise<AuditLog> {
    return this.log({
      entityType: 'PAYMENT_INGESTION_LOG',
      entityId: ingestionLogId,
      action: 'INGESTION_ERROR',
      actor: 'SYSTEM',
      actorType: 'PAYMENT_PROVIDER',
      details: {
        providerId,
        providerName,
        error,
        ...details,
      },
      relatedEntities: [
        {
          entityType: 'PAYMENT_PROVIDER',
          entityId: providerId,
          relationship: 'INGESTED_BY',
        },
      ],
    });
  }

  /**
   * Get human-readable action description
   */
  private getActionDescription(log: AuditLog): string {
    const actionMap: { [key: string]: string } = {
      MOVEMENT_INGESTED: `ANPR movement ingested for ${log.vrm}`,
      SESSION_CREATED: `Parking session created for ${log.vrm}`,
      SESSION_COMPLETED: `Parking session completed for ${log.vrm}`,
      DECISION_CREATED: `Decision created: ${log.details?.outcome}`,
      ENFORCEMENT_REVIEWED: `Enforcement reviewed by ${log.actor}`,
      PAYMENT_INGESTED: `Payment ingested for ${log.vrm}`,
      PERMIT_INGESTED: `Permit ingested for ${log.vrm}`,
      RECONCILIATION_TRIGGERED: `Reconciliation triggered`,
      DECISION_RECONCILED: `Decision reconciled`,
      PAYMENT_INGESTED_FROM_PROVIDER: `Payment ingested from provider for ${log.vrm}`,
      EMAIL_FETCH: `Emails fetched from payment provider`,
      INGESTION_ERROR: `Ingestion error occurred`,
    };

    return actionMap[log.action] || log.action;
  }
}
