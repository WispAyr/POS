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
} from '../../domain/entities';
import { AuditService } from '../../audit/audit.service';

export interface EnrichedDecision {
  id: string;
  vrm: string;
  siteId: string;
  reason: string;
  confidenceScore: number;
  timestamp: string;
  durationMinutes?: number;
  entryTime?: string;
  exitTime?: string;
  metadata?: {
    entryImages?: { url: string; type: string }[];
    exitImages?: { url: string; type: string }[];
  };
}

export interface ParkingEvent {
  sessionId: string;
  vrm: string;
  siteId: string;
  entryTime: string;
  exitTime?: string;
  durationMinutes?: number;
  status: 'PASSTHROUGH' | 'POTENTIAL_PCN' | 'APPROVED_PCN' | 'DECLINED_PCN' | 'EXPORTED_PCN' | 'ACTIVE';
  decisionId?: string;
  reason?: string;
  metadata?: {
    entryImages?: { url: string; type: string }[];
    exitImages?: { url: string; type: string }[];
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
    private readonly auditService: AuditService,
  ) {}

  async getReviewQueue(
    siteIds?: string[],
    dateFrom?: string,
    dateTo?: string,
  ): Promise<EnrichedDecision[]> {
    // Return all ENFORCEMENT_CANDIDATEs that are not yet processed
    const query = this.decisionRepo
      .createQueryBuilder('d')
      .where('d.outcome = :outcome', {
        outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE,
      })
      .andWhere('d.status = :status', { status: 'NEW' })
      .orderBy('d.createdAt', 'DESC');

    // Apply date filters
    if (dateFrom) {
      query.andWhere('d.createdAt >= :dateFrom', {
        dateFrom: new Date(dateFrom),
      });
    }
    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999); // Include full day
      query.andWhere('d.createdAt <= :dateTo', { dateTo: endDate });
    }

    const decisions = await query.getMany();

    // Enrich decisions with session and movement data
    const enriched: EnrichedDecision[] = [];

    for (const decision of decisions) {
      const session = decision.sessionId
        ? await this.sessionRepo.findOne({
            where: { id: decision.sessionId },
          })
        : null;

      // Skip if we can't enrich (shouldn't happen in practice)
      if (!session) continue;

      // Filter by siteIds if provided
      if (siteIds && siteIds.length > 0 && !siteIds.includes(session.siteId))
        continue;

      // Collect images from entry and exit movements separately
      const entryImages: { url: string; type: string }[] = [];
      const exitImages: { url: string; type: string }[] = [];

      if (session.entryMovementId) {
        const entryMovement = await this.movementRepo.findOne({
          where: { id: session.entryMovementId },
        });
        if (entryMovement?.images) {
          entryImages.push(...entryMovement.images);
        }
      }

      if (session.exitMovementId) {
        const exitMovement = await this.movementRepo.findOne({
          where: { id: session.exitMovementId },
        });
        if (exitMovement?.images) {
          exitImages.push(...exitMovement.images);
        }
      }

      enriched.push({
        id: decision.id,
        vrm: session.vrm,
        siteId: session.siteId,
        reason: decision.ruleApplied || decision.rationale,
        confidenceScore: decision.params?.confidenceScore || 0.85,
        timestamp: decision.createdAt.toISOString(),
        durationMinutes: session.durationMinutes,
        entryTime: session.startTime?.toISOString(),
        exitTime: session.endTime?.toISOString(),
        metadata: {
          entryImages,
          exitImages,
        },
      });
    }

    return enriched;
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
  async getApprovedPCNs(siteId?: string): Promise<EnrichedDecision[]> {
    const query = this.decisionRepo
      .createQueryBuilder('d')
      .where('d.outcome = :outcome', {
        outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE,
      })
      .andWhere('d.status = :status', { status: 'APPROVED' })
      .orderBy('d.createdAt', 'DESC');

    const decisions = await query.getMany();

    // Enrich decisions with session and movement data (same as getReviewQueue)
    const enriched: EnrichedDecision[] = [];

    for (const decision of decisions) {
      const session = decision.sessionId
        ? await this.sessionRepo.findOne({
            where: { id: decision.sessionId },
          })
        : null;

      if (!session) continue;
      if (siteId && session.siteId !== siteId) continue;

      const entryImages: { url: string; type: string }[] = [];
      const exitImages: { url: string; type: string }[] = [];

      if (session.entryMovementId) {
        const entryMovement = await this.movementRepo.findOne({
          where: { id: session.entryMovementId },
        });
        if (entryMovement?.images) {
          entryImages.push(...entryMovement.images);
        }
      }

      if (session.exitMovementId) {
        const exitMovement = await this.movementRepo.findOne({
          where: { id: session.exitMovementId },
        });
        if (exitMovement?.images) {
          exitImages.push(...exitMovement.images);
        }
      }

      enriched.push({
        id: decision.id,
        vrm: session.vrm,
        siteId: session.siteId,
        reason: decision.ruleApplied || decision.rationale,
        confidenceScore: decision.params?.confidenceScore || 0.85,
        timestamp: decision.createdAt.toISOString(),
        durationMinutes: session.durationMinutes,
        entryTime: session.startTime?.toISOString(),
        exitTime: session.endTime?.toISOString(),
        metadata: {
          entryImages,
          exitImages,
        },
      });
    }

    return enriched;
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
  ): Promise<ParkingEvent[]> {
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
      decisionMap.set(d.sessionId, d);
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
    const events: ParkingEvent[] = sessions.map((session) => {
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
        },
      };
    });

    return events;
  }
}
