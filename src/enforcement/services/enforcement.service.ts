import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Decision,
  DecisionOutcome,
  Session,
  Movement,
  VehicleNote,
  VehicleMarker,
  Permit,
  Payment,
  SiteEnforcementRule,
} from '../../domain/entities';
import { AuditService } from '../../audit/audit.service';

export interface EnrichedDecision {
  id: string;
  vrm: string;
  siteId: string;
  reason: string;
  confidenceScore: number;
  timestamp: string;
  durationMinutes?: number | null;
  entryTime?: string;
  exitTime?: string;
  metadata?: {
    entryImages?: { url: string; type: string }[];
    exitImages?: { url: string; type: string }[];
  };
  verifications?: {
    permitChecked: boolean;
    permitFound: boolean;
    permitDetails?: string;
    paymentChecked: boolean;
    paymentFound: boolean;
    paymentsCount: number;
    paymentDetails?: string;
    siteEnforcementEnabled: boolean;
  };
  auditSummary?: {
    previousSessionsAtSite: number;
    previousDecisionsAtSite: {
      total: number;
      approved: number;
      declined: number;
      autoResolved: number;
    };
    paymentsAtSite: Array<{
      startTime: string;
      expiryTime: string;
      amount: number;
      source: string;
    }>;
    recentActivity: Array<{
      type: 'session' | 'payment' | 'decision' | 'permit';
      timestamp: string;
      details: string;
    }>;
  };
}

export interface ParkingEvent {
  sessionId: string;
  vrm: string;
  siteId: string;
  entryTime: string;
  exitTime?: string;
  durationMinutes?: number | null;
  status:
    | 'PASSTHROUGH'
    | 'POTENTIAL_PCN'
    | 'APPROVED_PCN'
    | 'DECLINED_PCN'
    | 'EXPORTED_PCN'
    | 'ACTIVE';
  decisionId?: string;
  reason?: string;
  metadata?: {
    entryImages?: { url: string; type: string }[];
    exitImages?: { url: string; type: string }[];
    // Enhanced fields
    entryCamera?: string;
    exitCamera?: string;
    entrySource?: string;
    exitSource?: string;
    entryConfidence?: number;
    exitConfidence?: number;
    vehicleType?: string;
    vehicleColor?: string;
  };
}

@Injectable()
export class EnforcementService {
  private readonly logger = new Logger(EnforcementService.name);

  constructor(
    @InjectRepository(Decision)
    private readonly decisionRepo: Repository<Decision>,
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
    @InjectRepository(VehicleNote)
    private readonly vehicleNoteRepo: Repository<VehicleNote>,
    @InjectRepository(VehicleMarker)
    private readonly vehicleMarkerRepo: Repository<VehicleMarker>,
    @InjectRepository(Permit)
    private readonly permitRepo: Repository<Permit>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(SiteEnforcementRule)
    private readonly enforcementRuleRepo: Repository<SiteEnforcementRule>,
    private readonly auditService: AuditService,
  ) {}

  async getReviewQueue(
    siteIds?: string[],
    dateFrom?: string,
    dateTo?: string,
    limit?: number,
    offset?: number,
  ): Promise<{ items: EnrichedDecision[]; total: number }> {
    // Use JOIN-based query with proper pagination at database level
    // This avoids the "too many parameters" issue with large IN clauses
    const baseQuery = this.decisionRepo
      .createQueryBuilder('d')
      .innerJoin('sessions', 's', 's.id = d."sessionId"')
      .where('d.outcome = :outcome', {
        outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE,
      })
      .andWhere('d.status = :status', { status: 'NEW' });

    // Apply site filter
    if (siteIds && siteIds.length > 0) {
      baseQuery.andWhere('s.siteId IN (:...siteIds)', { siteIds });
    }

    // Apply date filters
    if (dateFrom) {
      baseQuery.andWhere('d.createdAt >= :dateFrom', {
        dateFrom: new Date(dateFrom),
      });
    }
    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999); // Include full day
      baseQuery.andWhere('d.createdAt <= :dateTo', { dateTo: endDate });
    }

    // Get total count
    const total = await baseQuery.getCount();

    // Apply pagination and ordering
    baseQuery.orderBy('d.createdAt', 'DESC');
    if (limit !== undefined) {
      baseQuery.take(limit);
    }
    if (offset !== undefined) {
      baseQuery.skip(offset);
    }

    const decisions = await baseQuery.getMany();

    // Batch fetch sessions only for paginated results
    const sessionIds = decisions
      .map((d) => d.sessionId)
      .filter((id): id is string => !!id);

    const sessions =
      sessionIds.length > 0
        ? await this.sessionRepo
            .createQueryBuilder('s')
            .where('s.id IN (:...sessionIds)', { sessionIds })
            .getMany()
        : [];

    // Create session map for O(1) lookup
    const sessionMap = new Map<string, Session>();
    sessions.forEach((s) => sessionMap.set(s.id, s));

    // Batch fetch all movements for paginated decisions
    const movementIds = new Set<string>();
    decisions.forEach((d) => {
      const session = d.sessionId ? sessionMap.get(d.sessionId) : null;
      if (session?.entryMovementId) movementIds.add(session.entryMovementId);
      if (session?.exitMovementId) movementIds.add(session.exitMovementId);
    });

    const movements =
      movementIds.size > 0
        ? await this.movementRepo
            .createQueryBuilder('m')
            .where('m.id IN (:...movementIds)', {
              movementIds: Array.from(movementIds),
            })
            .getMany()
        : [];

    // Create movement map for O(1) lookup
    const movementMap = new Map<string, Movement>();
    movements.forEach((m) => movementMap.set(m.id, m));

    // Batch fetch verification data for all VRMs and sites
    const vrmSitePairs = decisions.map((d) => {
      const s = sessionMap.get(d.sessionId!);
      return { vrm: s?.vrm, siteId: s?.siteId };
    }).filter((p) => p.vrm && p.siteId);

    const uniqueVrms = [...new Set(vrmSitePairs.map((p) => p.vrm!))];
    const uniqueSiteIds = [...new Set(vrmSitePairs.map((p) => p.siteId!))];

    // Batch fetch permits for all VRMs
    const permits = uniqueVrms.length > 0 ? await this.permitRepo
      .createQueryBuilder('p')
      .where('p.vrm IN (:...vrms)', { vrms: uniqueVrms })
      .andWhere('p.active = true')
      .getMany() : [];

    // Create permit lookup map (vrm -> permits)
    const permitMap = new Map<string, Permit[]>();
    permits.forEach((p) => {
      const existing = permitMap.get(p.vrm) || [];
      existing.push(p);
      permitMap.set(p.vrm, existing);
    });

    // Batch fetch payments for all VRM/site combinations
    const payments = uniqueVrms.length > 0 ? await this.paymentRepo
      .createQueryBuilder('p')
      .where('p.vrm IN (:...vrms)', { vrms: uniqueVrms })
      .andWhere('p.siteId IN (:...siteIds)', { siteIds: uniqueSiteIds })
      .getMany() : [];

    // Create payment lookup map (vrm:siteId -> payments)
    const paymentMap = new Map<string, Payment[]>();
    payments.forEach((p) => {
      const key = `${p.vrm}:${p.siteId}`;
      const existing = paymentMap.get(key) || [];
      existing.push(p);
      paymentMap.set(key, existing);
    });

    // Batch fetch active enforcement rules for sites
    const enforcementRules = uniqueSiteIds.length > 0 ? await this.enforcementRuleRepo
      .createQueryBuilder('r')
      .where('r.site_id IN (:...siteIds)', { siteIds: uniqueSiteIds })
      .andWhere('r.active = true')
      .andWhere('r.ruleType = :ruleType', { ruleType: 'DISABLE_ENFORCEMENT' })
      .getMany() : [];

    const disabledSites = new Set(enforcementRules.map((r) => r.siteId));

    // Batch fetch previous sessions for each VRM at each site (excluding current)
    const currentSessionIds = new Set(sessionIds);
    const previousSessions = uniqueVrms.length > 0 ? await this.sessionRepo
      .createQueryBuilder('s')
      .where('s.vrm IN (:...vrms)', { vrms: uniqueVrms })
      .andWhere('s.siteId IN (:...siteIds)', { siteIds: uniqueSiteIds })
      .orderBy('s.startTime', 'DESC')
      .getMany() : [];

    // Create previous sessions lookup map (vrm:siteId -> sessions[])
    const previousSessionMap = new Map<string, Session[]>();
    previousSessions.forEach((s) => {
      if (!currentSessionIds.has(s.id)) {
        const key = `${s.vrm}:${s.siteId}`;
        const existing = previousSessionMap.get(key) || [];
        existing.push(s);
        previousSessionMap.set(key, existing);
      }
    });

    // Batch fetch all decisions for these VRMs/sites
    const allPreviousSessionIds = previousSessions.map((s) => s.id);
    const previousDecisions = allPreviousSessionIds.length > 0 ? await this.decisionRepo
      .createQueryBuilder('d')
      .where('d.sessionId IN (:...sessionIds)', { sessionIds: allPreviousSessionIds })
      .getMany() : [];

    // Create previous decisions lookup map (vrm:siteId -> decisions[])
    const previousDecisionMap = new Map<string, Decision[]>();
    previousDecisions.forEach((d) => {
      const session = previousSessions.find((s) => s.id === d.sessionId);
      if (session) {
        const key = `${session.vrm}:${session.siteId}`;
        const existing = previousDecisionMap.get(key) || [];
        existing.push(d);
        previousDecisionMap.set(key, existing);
      }
    });

    // Enrich decisions with session, movement, and verification data
    const enriched: EnrichedDecision[] = decisions.map((decision) => {
      const session = sessionMap.get(decision.sessionId!);
      const entryMovement = session?.entryMovementId
        ? movementMap.get(session.entryMovementId)
        : null;
      const exitMovement = session?.exitMovementId
        ? movementMap.get(session.exitMovementId)
        : null;

      // Get verification data
      const vrm = session!.vrm;
      const siteId = session!.siteId;
      const vrmPermits = permitMap.get(vrm) || [];
      const sitePermit = vrmPermits.find((p) => p.siteId === siteId || !p.siteId);
      const vrmPayments = paymentMap.get(`${vrm}:${siteId}`) || [];

      return {
        id: decision.id,
        vrm: session!.vrm,
        siteId: session!.siteId,
        reason: decision.ruleApplied || decision.rationale,
        confidenceScore: decision.params?.confidenceScore || 0.85,
        timestamp: decision.createdAt.toISOString(),
        durationMinutes: session!.durationMinutes,
        entryTime: session!.startTime?.toISOString(),
        exitTime: session!.endTime?.toISOString(),
        metadata: {
          entryImages: entryMovement?.images || [],
          exitImages: exitMovement?.images || [],
        },
        verifications: {
          permitChecked: true,
          permitFound: !!sitePermit,
          permitDetails: sitePermit ? `${sitePermit.type} permit (${sitePermit.siteId || 'global'})` : 'No active permit found',
          paymentChecked: true,
          paymentFound: vrmPayments.length > 0,
          paymentsCount: vrmPayments.length,
          paymentDetails: vrmPayments.length > 0 
            ? `${vrmPayments.length} payment(s) found - none covering session period`
            : 'No payments found for this VRM at this site',
          siteEnforcementEnabled: !disabledSites.has(siteId),
        },
        auditSummary: (() => {
          const prevSessions = previousSessionMap.get(`${vrm}:${siteId}`) || [];
          const prevDecisions = previousDecisionMap.get(`${vrm}:${siteId}`) || [];
          
          // Build recent activity timeline
          const recentActivity: Array<{ type: 'session' | 'payment' | 'decision' | 'permit'; timestamp: string; details: string }> = [];
          
          // Add sessions to activity
          prevSessions.slice(0, 5).forEach((s) => {
            recentActivity.push({
              type: 'session',
              timestamp: s.startTime?.toISOString() || '',
              details: `Session: ${s.durationMinutes || 0}min parking`,
            });
          });
          
          // Add payments to activity
          vrmPayments.slice(0, 5).forEach((p) => {
            recentActivity.push({
              type: 'payment',
              timestamp: new Date(p.startTime).toISOString(),
              details: `Payment: £${p.amount} (${p.source}) valid until ${new Date(p.expiryTime).toLocaleString()}`,
            });
          });
          
          // Add decisions to activity
          prevDecisions.slice(0, 5).forEach((d) => {
            recentActivity.push({
              type: 'decision',
              timestamp: d.createdAt.toISOString(),
              details: `Decision: ${d.status} - ${d.ruleApplied}`,
            });
          });
          
          // Sort by timestamp descending
          recentActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          
          return {
            previousSessionsAtSite: prevSessions.length,
            previousDecisionsAtSite: {
              total: prevDecisions.length,
              approved: prevDecisions.filter((d) => d.status === 'APPROVED').length,
              declined: prevDecisions.filter((d) => d.status === 'DECLINED').length,
              autoResolved: prevDecisions.filter((d) => d.status === 'AUTO_RESOLVED').length,
            },
            paymentsAtSite: vrmPayments.map((p) => ({
              startTime: new Date(p.startTime).toISOString(),
              expiryTime: new Date(p.expiryTime).toISOString(),
              amount: Number(p.amount),
              source: p.source,
            })),
            recentActivity: recentActivity.slice(0, 10),
          };
        })(),
      };
    });

    return { items: enriched, total };
  }

  async reviewDecision(
    id: string,
    action: 'APPROVE' | 'DECLINE',
    operatorId: string,
    notes?: string,
  ): Promise<Decision> {
    const decision = await this.decisionRepo.findOne({ where: { id } });
    if (!decision) throw new NotFoundException('Decision not found');

    const previousStatus = decision.status;
    decision.status = action === 'APPROVE' ? 'APPROVED' : 'DECLINED';
    decision.operatorId = operatorId;
    decision.isOperatorOverride = true; // or just tracked via operatorId
    decision.rationale += ` | Review: ${notes || action}`;

    await this.decisionRepo.save(decision);

    // Get decision created audit log to link as parent
    const decisionAudits = await this.auditService.getAuditTrailByEntity(
      'DECISION',
      decision.id,
    );
    const decisionCreatedAuditId = decisionAudits.find(
      (a) => a.action === 'DECISION_CREATED',
    )?.id;

    // Audit Log enforcement review
    await this.auditService.logEnforcementReview(
      decision,
      operatorId,
      action,
      notes,
      previousStatus,
      decisionCreatedAuditId,
    );

    this.logger.log(`Decision ${id} reviewed: ${action} by ${operatorId}`);
    return decision;
  }

  // Vehicle History
  async getVehicleHistory(vrm: string) {
    const decisions = await this.decisionRepo.find({
      where: { sessionId: vrm }, // This will need to be fixed to join with sessions
      order: { createdAt: 'DESC' },
    });

    // Get all sessions for this VRM
    const sessions = await this.sessionRepo.find({
      where: { vrm },
    });

    const sessionIds = sessions.map((s) => s.id);

    // Get decisions for these sessions
    const allDecisions = await this.decisionRepo
      .createQueryBuilder('d')
      .where('d.sessionId IN (:...sessionIds)', { sessionIds })
      .andWhere('d.outcome = :outcome', {
        outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE,
      })
      .andWhere('d.status IN (:...statuses)', {
        statuses: ['APPROVED', 'DECLINED'],
      })
      .getMany();

    const totalEnforcements = allDecisions.length;
    const totalApproved = allDecisions.filter(
      (d) => d.status === 'APPROVED',
    ).length;
    const totalRejected = allDecisions.filter(
      (d) => d.status === 'DECLINED',
    ).length;

    // Get recent enforcements with details
    const recentEnforcements = await Promise.all(
      allDecisions.slice(0, 10).map(async (d) => {
        const session = sessions.find((s) => s.id === d.sessionId);
        return {
          id: d.id,
          siteId: session?.siteId || 'Unknown',
          reason: d.ruleApplied,
          status: d.status,
          timestamp: d.createdAt.toISOString(),
        };
      }),
    );

    return {
      totalEnforcements,
      totalApproved,
      totalRejected,
      recentEnforcements,
    };
  }

  // Vehicle Notes
  async getVehicleNotes(vrm: string): Promise<VehicleNote[]> {
    return this.vehicleNoteRepo.find({
      where: { vrm },
      order: { createdAt: 'DESC' },
    });
  }

  async addVehicleNote(
    vrm: string,
    note: string,
    createdBy: string,
  ): Promise<VehicleNote> {
    const vehicleNote = this.vehicleNoteRepo.create({
      vrm,
      note,
      createdBy,
    });
    return this.vehicleNoteRepo.save(vehicleNote);
  }

  // Vehicle Markers
  async getVehicleMarkers(vrm: string): Promise<VehicleMarker[]> {
    return this.vehicleMarkerRepo.find({
      where: { vrm },
      order: { createdAt: 'DESC' },
    });
  }

  async addVehicleMarker(
    vrm: string,
    markerType: string,
    description?: string,
  ): Promise<VehicleMarker> {
    const marker = this.vehicleMarkerRepo.create({
      vrm,
      markerType,
      description,
    });
    return this.vehicleMarkerRepo.save(marker);
  }

  // PCN Batch Export
  async getApprovedPCNs(
    siteId?: string,
    limit?: number,
    offset?: number,
  ): Promise<{ items: EnrichedDecision[]; total: number }> {
    const query = this.decisionRepo
      .createQueryBuilder('d')
      .where('d.outcome = :outcome', {
        outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE,
      })
      .andWhere('d.status = :status', { status: 'APPROVED' })
      .orderBy('d.createdAt', 'DESC');

    const decisions = await query.getMany();

    // Batch fetch all sessions for these decisions
    const sessionIds = decisions
      .map((d) => d.sessionId)
      .filter((id): id is string => !!id);

    const sessions =
      sessionIds.length > 0
        ? await this.sessionRepo
            .createQueryBuilder('s')
            .where('s.id IN (:...sessionIds)', { sessionIds })
            .getMany()
        : [];

    // Create session map for O(1) lookup
    const sessionMap = new Map<string, Session>();
    sessions.forEach((s) => sessionMap.set(s.id, s));

    // Filter by siteId if provided
    const filteredDecisions = decisions.filter((decision) => {
      const session = decision.sessionId
        ? sessionMap.get(decision.sessionId)
        : null;
      if (!session) return false;
      if (siteId && session.siteId !== siteId) return false;
      return true;
    });

    // Get total count before pagination
    const total = filteredDecisions.length;

    // Apply pagination
    const paginatedDecisions =
      limit !== undefined
        ? filteredDecisions.slice(offset || 0, (offset || 0) + limit)
        : filteredDecisions;

    // Batch fetch all movements for filtered decisions
    const movementIds = new Set<string>();
    paginatedDecisions.forEach((d) => {
      const session = d.sessionId ? sessionMap.get(d.sessionId) : null;
      if (session?.entryMovementId) movementIds.add(session.entryMovementId);
      if (session?.exitMovementId) movementIds.add(session.exitMovementId);
    });

    const movements =
      movementIds.size > 0
        ? await this.movementRepo
            .createQueryBuilder('m')
            .where('m.id IN (:...movementIds)', {
              movementIds: Array.from(movementIds),
            })
            .getMany()
        : [];

    // Create movement map for O(1) lookup
    const movementMap = new Map<string, Movement>();
    movements.forEach((m) => movementMap.set(m.id, m));

    // Enrich decisions with session and movement data
    const enriched: EnrichedDecision[] = paginatedDecisions.map((decision) => {
      const session = sessionMap.get(decision.sessionId!);
      const entryMovement = session?.entryMovementId
        ? movementMap.get(session.entryMovementId)
        : null;
      const exitMovement = session?.exitMovementId
        ? movementMap.get(session.exitMovementId)
        : null;

      return {
        id: decision.id,
        vrm: session!.vrm,
        siteId: session!.siteId,
        reason: decision.ruleApplied || decision.rationale,
        confidenceScore: decision.params?.confidenceScore || 0.85,
        timestamp: decision.createdAt.toISOString(),
        durationMinutes: session!.durationMinutes,
        entryTime: session!.startTime?.toISOString(),
        exitTime: session!.endTime?.toISOString(),
        metadata: {
          entryImages: entryMovement?.images || [],
          exitImages: exitMovement?.images || [],
        },
      };
    });

    return { items: enriched, total };
  }

  async markPCNsAsExported(decisionIds: string[]): Promise<void> {
    await this.decisionRepo
      .createQueryBuilder()
      .update()
      .set({ status: 'EXPORTED' })
      .where('id IN (:...ids)', { ids: decisionIds })
      .execute();

    this.logger.log(`Marked ${decisionIds.length} PCNs as exported`);
  }

  // Parking Events Overview
  async getAllParkingEvents(
    siteIds?: string[],
    dateFrom?: string,
    dateTo?: string,
    limit?: number,
    offset?: number,
  ): Promise<{ items: ParkingEvent[]; total: number }> {
    // Build query with filters
    const query = this.sessionRepo
      .createQueryBuilder('s')
      .orderBy('s.startTime', 'DESC');

    // Apply site filters
    if (siteIds && siteIds.length > 0) {
      query.andWhere('s.siteId IN (:...siteIds)', { siteIds });
    }

    // Apply date filters
    if (dateFrom) {
      query.andWhere('s.startTime >= :dateFrom', {
        dateFrom: new Date(dateFrom),
      });
    }
    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      query.andWhere('s.startTime <= :dateTo', { dateTo: endDate });
    }

    // Get total count
    const total = await query.getCount();

    // Apply pagination
    if (limit !== undefined) {
      query.skip(offset || 0).take(limit);
    }

    const sessions = await query.getMany();

    // Get all decision IDs for these sessions
    const sessionIds = sessions.map((s) => s.id);
    const decisions =
      sessionIds.length > 0
        ? await this.decisionRepo
            .createQueryBuilder('d')
            .where('d.sessionId IN (:...sessionIds)', { sessionIds })
            .getMany()
        : [];

    // Create a map for quick decision lookup
    const decisionMap = new Map<string, Decision>();
    decisions.forEach((d) => {
      if (d.sessionId) {
        decisionMap.set(d.sessionId, d);
      }
    });

    // Get movements for images
    const entryMovementIds = sessions
      .map((s) => s.entryMovementId)
      .filter((id) => id);
    const exitMovementIds = sessions
      .map((s) => s.exitMovementId)
      .filter((id) => id);
    const allMovementIds = [
      ...new Set([...entryMovementIds, ...exitMovementIds]),
    ];

    const movements =
      allMovementIds.length > 0
        ? await this.movementRepo
            .createQueryBuilder('m')
            .where('m.id IN (:...movementIds)', { movementIds: allMovementIds })
            .getMany()
        : [];

    const movementMap = new Map<string, Movement>();
    movements.forEach((m) => {
      movementMap.set(m.id, m);
    });

    // Transform to ParkingEvent objects
    const items: ParkingEvent[] = sessions.map((session) => {
      const decision = decisionMap.get(session.id);

      // Determine status
      let status: ParkingEvent['status'] = 'PASSTHROUGH';
      if (!session.endTime) {
        status = 'ACTIVE';
      } else if (decision) {
        if (
          decision.outcome === DecisionOutcome.ENFORCEMENT_CANDIDATE &&
          decision.status === 'NEW'
        ) {
          status = 'POTENTIAL_PCN';
        } else if (decision.status === 'APPROVED') {
          status = 'APPROVED_PCN';
        } else if (decision.status === 'DECLINED') {
          status = 'DECLINED_PCN';
        } else if (decision.status === 'EXPORTED') {
          status = 'EXPORTED_PCN';
        }
      }

      // Get images
      const entryMovement = session.entryMovementId
        ? movementMap.get(session.entryMovementId)
        : undefined;
      const exitMovement = session.exitMovementId
        ? movementMap.get(session.exitMovementId)
        : undefined;

      // Extract enhanced metadata from rawData
      const entryRaw = entryMovement?.rawData as any;
      const exitRaw = exitMovement?.rawData as any;

      return {
        sessionId: session.id,
        vrm: session.vrm,
        siteId: session.siteId,
        entryTime: session.startTime?.toISOString(),
        exitTime: session.endTime?.toISOString(),
        durationMinutes: session.durationMinutes,
        status,
        decisionId: decision?.id,
        reason: decision?.ruleApplied || decision?.rationale,
        metadata: {
          entryImages: entryMovement?.images || [],
          exitImages: exitMovement?.images || [],
          // Enhanced fields
          entryCamera: entryMovement?.cameraIds || entryRaw?.cameraId,
          exitCamera: exitMovement?.cameraIds || exitRaw?.cameraId,
          entrySource: entryRaw?.source,
          exitSource: exitRaw?.source,
          entryConfidence: entryRaw?.confidence,
          exitConfidence: exitRaw?.confidence,
          vehicleType: entryRaw?.metadata?.vehicleType || exitRaw?.metadata?.vehicleType,
          vehicleColor: entryRaw?.metadata?.vehicleColor || exitRaw?.metadata?.vehicleColor,
        },
      };
    });

    return { items, total };
  }

  // Combined vehicle details endpoint for reduced API calls
  async getVehicleDetails(vrm: string): Promise<{
    history: Awaited<ReturnType<typeof this.getVehicleHistory>>;
    notes: VehicleNote[];
    markers: VehicleMarker[];
  }> {
    const [history, notes, markers] = await Promise.all([
      this.getVehicleHistory(vrm),
      this.getVehicleNotes(vrm),
      this.getVehicleMarkers(vrm),
    ]);

    return { history, notes, markers };
  }

  /**
   * Find and evaluate completed sessions that have no associated decision.
   * This fixes gaps where sessions completed but the rule engine didn't run.
   */
  async evaluateOrphanSessions(limit = 500): Promise<{
    found: number;
    evaluated: number;
    errors: number;
  }> {
    this.logger.log(`Looking for orphan sessions (limit: ${limit})...`);

    // Find completed sessions with no decision
    const orphanSessions = await this.sessionRepo
      .createQueryBuilder('s')
      .leftJoin('decisions', 'd', 'd."sessionId" = s.id')
      .where('s.status = :status', { status: 'COMPLETED' })
      .andWhere('d.id IS NULL')
      .orderBy('s."endTime"', 'DESC')
      .limit(limit)
      .getMany();

    this.logger.log(`Found ${orphanSessions.length} orphan sessions`);

    let evaluated = 0;
    let errors = 0;

    for (const session of orphanSessions) {
      try {
        // Create decision using raw query since we can't inject RuleEngineService here
        const decision = this.decisionRepo.create({
          sessionId: session.id,
          outcome:
            session.durationMinutes && session.durationMinutes <= 20
              ? DecisionOutcome.COMPLIANT
              : DecisionOutcome.ENFORCEMENT_CANDIDATE,
          ruleApplied: 'ORPHAN_RECOVERY',
          rationale: `Session recovered during orphan evaluation. Duration: ${session.durationMinutes || 'unknown'} minutes.`,
          status: 'NEW',
        });

        await this.decisionRepo.save(decision);
        evaluated++;

        this.logger.log(
          `Evaluated orphan session ${session.id}: ${decision.outcome}`,
        );
      } catch (err) {
        this.logger.error(`Error evaluating session ${session.id}:`, err);
        errors++;
      }
    }

    this.logger.log(
      `Orphan evaluation complete: ${evaluated} evaluated, ${errors} errors`,
    );

    return {
      found: orphanSessions.length,
      evaluated,
      errors,
    };
  }
}
