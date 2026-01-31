import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import {
  Site,
  Session,
  SessionStatus,
  Decision,
  DecisionOutcome,
  Movement,
  Payment,
  Permit,
  AuditLog,
} from '../domain/entities';
import { AuditService } from '../audit/audit.service';

interface SystemSettings {
  aiReviewEnabled: boolean;
}

// In-memory settings (could be moved to DB later)
let systemSettings: SystemSettings = {
  aiReviewEnabled: true,
};

@Controller('api/ai-review')
export class AiReviewController {
  constructor(
    @InjectRepository(Site)
    private readonly siteRepo: Repository<Site>,
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Decision)
    private readonly decisionRepo: Repository<Decision>,
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Permit)
    private readonly permitRepo: Repository<Permit>,
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Check if AI review is enabled
   */
  @Get('enabled')
  async isEnabled() {
    return { enabled: systemSettings.aiReviewEnabled };
  }

  /**
   * Toggle AI review feature
   */
  @Post('enabled')
  async setEnabled(@Body() body: { enabled: boolean }) {
    systemSettings.aiReviewEnabled = body.enabled;
    
    // Log the setting change
    await this.auditService.log({
      entityType: 'SYSTEM',
      entityId: 'ai-review-settings',
      action: body.enabled ? 'AI_REVIEW_ENABLED' : 'AI_REVIEW_DISABLED',
      actor: 'OPERATOR',
      details: { enabled: body.enabled },
    });
    
    return { enabled: systemSettings.aiReviewEnabled };
  }

  /**
   * Get comprehensive system overview for AI review
   */
  @Get('system')
  async getSystemOverview(
    @Query('siteId') siteId?: string,
    @Query('includeAuditTrail') includeAuditTrail?: string,
    @Query('auditLimit') auditLimit?: string,
  ) {
    if (!systemSettings.aiReviewEnabled) {
      throw new ForbiddenException('AI review feature is disabled');
    }

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Get counts using query builder to avoid type issues
    const totalSites = await this.siteRepo.count({ where: { active: true } });
    
    const activeSessionsQb = this.sessionRepo.createQueryBuilder('s')
      .where('s.status = :status', { status: SessionStatus.PROVISIONAL });
    if (siteId) activeSessionsQb.andWhere('s.siteId = :siteId', { siteId });
    const activeSessions = await activeSessionsQb.getCount();

    const pendingEnforcementQb = this.decisionRepo.createQueryBuilder('d')
      .where('d.outcome = :outcome', { outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE })
      .andWhere('d.status = :status', { status: 'NEW' });
    const pendingEnforcement = await pendingEnforcementQb.getCount();

    const approvedTodayQb = this.decisionRepo.createQueryBuilder('d')
      .where('d.status = :status', { status: 'APPROVED' })
      .andWhere('d.createdAt >= :since', { since: oneDayAgo });
    const approvedToday = await approvedTodayQb.getCount();

    const rejectedTodayQb = this.decisionRepo.createQueryBuilder('d')
      .where('d.status = :status', { status: 'DECLINED' })
      .andWhere('d.createdAt >= :since', { since: oneDayAgo });
    const rejectedToday = await rejectedTodayQb.getCount();

    const paymentsLastHourQb = this.paymentRepo.createQueryBuilder('p')
      .where('p.createdAt >= :since', { since: oneHourAgo });
    if (siteId) paymentsLastHourQb.andWhere('p.siteId = :siteId', { siteId });
    const paymentsLastHour = await paymentsLastHourQb.getCount();

    const movementsLastHourQb = this.movementRepo.createQueryBuilder('m')
      .where('m.timestamp >= :since', { since: oneHourAgo });
    if (siteId) movementsLastHourQb.andWhere('m.siteId = :siteId', { siteId });
    const movementsLastHour = await movementsLastHourQb.getCount();

    // Get recent enforcement queue items
    const recentEnforcementQueue = await this.decisionRepo
      .createQueryBuilder('d')
      .innerJoin('sessions', 's', 's.id = d."sessionId"')
      .where('d.outcome = :outcome', { outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE })
      .andWhere('d.status = :status', { status: 'NEW' })
      .orderBy('d.createdAt', 'DESC')
      .limit(10)
      .getMany();

    // Get session details for queue items
    const sessionIds = recentEnforcementQueue.map(d => d.sessionId).filter(Boolean);
    const sessions = sessionIds.length > 0 
      ? await this.sessionRepo.findByIds(sessionIds)
      : [];
    const sessionMap = new Map(sessions.map(s => [s.id, s]));

    const enforcementQueueSummary = recentEnforcementQueue.map(d => {
      const session = sessionMap.get(d.sessionId!);
      return {
        decisionId: d.id,
        vrm: session?.vrm || 'UNKNOWN',
        siteId: session?.siteId || 'UNKNOWN',
        reason: d.ruleApplied,
        durationMinutes: session?.durationMinutes,
        createdAt: d.createdAt,
      };
    });

    // Get audit trail if requested
    let recentAudit: AuditLog[] = [];
    if (includeAuditTrail !== 'false') {
      const limit = parseInt(auditLimit || '20', 10);
      const qb = this.auditRepo.createQueryBuilder('a')
        .orderBy('a.timestamp', 'DESC')
        .limit(limit);
      
      if (siteId) {
        qb.andWhere('a.siteId = :siteId', { siteId });
      }
      
      recentAudit = await qb.getMany();
    }

    // Get any AI observations from last 24h
    const recentAiObservations = await this.auditRepo
      .createQueryBuilder('a')
      .where('a.action LIKE :action', { action: 'AI_%' })
      .andWhere('a.timestamp >= :since', { since: oneDayAgo })
      .orderBy('a.timestamp', 'DESC')
      .limit(10)
      .getMany();

    return {
      timestamp: now.toISOString(),
      siteFilter: siteId || 'ALL',
      stats: {
        totalActiveSites: totalSites,
        activeSessions,
        pendingEnforcement,
        decisionsToday: {
          approved: approvedToday,
          rejected: rejectedToday,
        },
        activityLastHour: {
          payments: paymentsLastHour,
          movements: movementsLastHour,
        },
      },
      enforcementQueue: {
        count: pendingEnforcement,
        items: enforcementQueueSummary,
      },
      recentAuditTrail: recentAudit.map(a => ({
        id: a.id,
        action: a.action,
        entityType: a.entityType,
        vrm: a.vrm,
        siteId: a.siteId,
        timestamp: a.timestamp,
        actor: a.actor,
        details: a.details,
      })),
      previousAiObservations: recentAiObservations.map(a => ({
        id: a.id,
        type: a.action,
        timestamp: a.timestamp,
        details: a.details,
      })),
    };
  }

  /**
   * Get detailed enforcement case for AI review
   */
  @Get('enforcement/:decisionId')
  async getEnforcementCase(@Param('decisionId') decisionId: string) {
    if (!systemSettings.aiReviewEnabled) {
      throw new ForbiddenException('AI review feature is disabled');
    }

    // Get the full enforcement case history
    const caseHistory = await this.auditService.getEnforcementCaseHistory(decisionId);
    
    if (!caseHistory) {
      return { error: 'Decision not found', decisionId };
    }

    return caseHistory;
  }

  /**
   * Get complete VRM history for AI review
   */
  @Get('vrm/:vrm')
  async getVrmHistory(
    @Param('vrm') vrm: string,
    @Query('siteId') siteId?: string,
  ) {
    if (!systemSettings.aiReviewEnabled) {
      throw new ForbiddenException('AI review feature is disabled');
    }

    const normalizedVrm = vrm.toUpperCase().replace(/\s/g, '');

    // Get all data for this VRM using query builders
    const sessionsQb = this.sessionRepo.createQueryBuilder('s')
      .where('s.vrm = :vrm', { vrm: normalizedVrm })
      .orderBy('s.startTime', 'DESC')
      .take(50);
    if (siteId) sessionsQb.andWhere('s.siteId = :siteId', { siteId });
    const sessions = await sessionsQb.getMany();

    const paymentsQb = this.paymentRepo.createQueryBuilder('p')
      .where('p.vrm = :vrm', { vrm: normalizedVrm })
      .orderBy('p.startTime', 'DESC')
      .take(50);
    if (siteId) paymentsQb.andWhere('p.siteId = :siteId', { siteId });
    const payments = await paymentsQb.getMany();

    const permitsQb = this.permitRepo.createQueryBuilder('p')
      .where('p.vrm = :vrm', { vrm: normalizedVrm });
    if (siteId) permitsQb.andWhere('p.siteId = :siteId', { siteId });
    const permits = await permitsQb.getMany();

    const movementsQb = this.movementRepo.createQueryBuilder('m')
      .where('m.vrm = :vrm', { vrm: normalizedVrm })
      .orderBy('m.timestamp', 'DESC')
      .take(100);
    if (siteId) movementsQb.andWhere('m.siteId = :siteId', { siteId });
    const movements = await movementsQb.getMany();

    // Get decisions for sessions
    const sessionIds = sessions.map(s => s.id);
    const decisions = sessionIds.length > 0
      ? await this.decisionRepo.find({
          where: sessionIds.map(id => ({ sessionId: id })),
        })
      : [];

    // Get audit trail
    const auditTrail = await this.auditService.getAuditTrailByVrm(normalizedVrm, {
      limit: 50,
    });

    return {
      vrm: normalizedVrm,
      siteFilter: siteId || 'ALL',
      summary: {
        totalSessions: sessions.length,
        totalPayments: payments.length,
        totalPermits: permits.length,
        totalMovements: movements.length,
        totalDecisions: decisions.length,
        enforcementCandidates: decisions.filter(d => d.outcome === DecisionOutcome.ENFORCEMENT_CANDIDATE).length,
        approvedPcns: decisions.filter(d => d.status === 'APPROVED').length,
      },
      sessions: sessions.map(s => ({
        id: s.id,
        siteId: s.siteId,
        startTime: s.startTime,
        endTime: s.endTime,
        durationMinutes: s.durationMinutes,
        status: s.status,
      })),
      payments: payments.map(p => ({
        id: p.id,
        siteId: p.siteId,
        amount: p.amount,
        startTime: p.startTime,
        expiryTime: p.expiryTime,
        source: p.source,
      })),
      permits: permits.map(p => ({
        id: p.id,
        siteId: p.siteId,
        type: p.type,
        active: p.active,
        startDate: p.startDate,
        endDate: p.endDate,
      })),
      decisions: decisions.map(d => ({
        id: d.id,
        sessionId: d.sessionId,
        outcome: d.outcome,
        status: d.status,
        ruleApplied: d.ruleApplied,
        rationale: d.rationale,
        createdAt: d.createdAt,
      })),
      recentMovements: movements.slice(0, 20).map(m => ({
        id: m.id,
        siteId: m.siteId,
        direction: m.direction,
        cameraIds: m.cameraIds,
        timestamp: m.timestamp,
      })),
      auditTrail,
    };
  }

  /**
   * Get FILO (First-In-Last-Out) anomalies for AI review
   */
  @Get('filo')
  async getFiLoAnomalies(
    @Query('minHours') minHours?: string,
    @Query('siteId') siteId?: string,
    @Query('limit') limit?: string,
  ) {
    if (!systemSettings.aiReviewEnabled) {
      throw new ForbiddenException('AI review feature is disabled');
    }

    const hours = parseInt(minHours || '24', 10);
    const maxResults = parseInt(limit || '50', 10);
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Get sessions with unusual patterns: 
    // - Very long duration (potential stuck sessions)
    // - Entry but no exit (still in car park for too long)
    // - Exit without entry (FILO violation)
    const qb = this.sessionRepo.createQueryBuilder('s')
      .where('s.status IN (:...statuses)', { 
        statuses: [SessionStatus.COMPLETED, SessionStatus.PROVISIONAL] 
      })
      .andWhere('s.startTime >= :cutoff', { cutoff })
      .orderBy('s.durationMinutes', 'DESC')
      .take(maxResults);

    if (siteId) {
      qb.andWhere('s.siteId = :siteId', { siteId });
    }

    // Get long-duration sessions (potential anomalies)
    const longSessions = await qb.getMany();

    // Filter to actual FILO anomalies (very long duration > 12 hours)
    const anomalies = longSessions.filter(s => s.durationMinutes && s.durationMinutes > 720);

    // Get movement details for context
    const sessionDetails = await Promise.all(
      anomalies.slice(0, 20).map(async (session) => {
        // Get movements for this VRM/site within session time window
        const movementsQb = this.movementRepo.createQueryBuilder('m')
          .where('m.vrm = :vrm', { vrm: session.vrm })
          .andWhere('m.siteId = :siteId', { siteId: session.siteId })
          .andWhere('m.timestamp >= :start', { start: session.startTime })
          .orderBy('m.timestamp', 'ASC');
        
        if (session.endTime) {
          movementsQb.andWhere('m.timestamp <= :end', { end: session.endTime });
        }
        
        const movements = await movementsQb.take(10).getMany();

        // Check for payment coverage
        const payments = await this.paymentRepo.find({
          where: { vrm: session.vrm, siteId: session.siteId },
          order: { startTime: 'DESC' },
          take: 5,
        });

        // Check for permits
        const permits = await this.permitRepo.find({
          where: { vrm: session.vrm, siteId: session.siteId, active: true },
        });

        return {
          session: {
            id: session.id,
            siteId: session.siteId,
            vrm: session.vrm,
            startTime: session.startTime,
            endTime: session.endTime,
            durationMinutes: session.durationMinutes,
            durationFormatted: session.durationMinutes 
              ? `${Math.floor(session.durationMinutes / 60)}h ${session.durationMinutes % 60}m`
              : 'Unknown',
            status: session.status,
          },
          movements: movements.map(m => ({
            id: m.id,
            direction: m.direction,
            timestamp: m.timestamp,
            cameraId: m.cameraIds?.[0],
          })),
          hasPaymentCoverage: payments.some(p => {
            const paymentEnd = new Date(p.expiryTime || 0);
            const sessionStart = new Date(session.startTime);
            return paymentEnd >= sessionStart;
          }),
          hasPermit: permits.length > 0,
          recentPayments: payments.slice(0, 3).map(p => ({
            id: p.id,
            amount: p.amount,
            startTime: p.startTime,
            expiryTime: p.expiryTime,
          })),
        };
      })
    );

    // Analyze patterns
    const patterns = {
      noExitRecorded: sessionDetails.filter(d => 
        d.movements.length === 1 && d.movements[0].direction === 'IN'
      ).length,
      veryLongStay: sessionDetails.filter(d => 
        d.session.durationMinutes && d.session.durationMinutes > 1440
      ).length, // > 24 hours
      noPaymentCoverage: sessionDetails.filter(d => 
        !d.hasPaymentCoverage && !d.hasPermit
      ).length,
      withPermits: sessionDetails.filter(d => d.hasPermit).length,
    };

    return {
      timestamp: new Date().toISOString(),
      filters: {
        minHours: hours,
        siteId: siteId || 'ALL',
      },
      summary: {
        totalAnomalies: anomalies.length,
        patterns,
      },
      anomalies: sessionDetails,
      recommendations: this.generateFiloRecommendations(patterns, sessionDetails),
    };
  }

  private generateFiloRecommendations(
    patterns: { noExitRecorded: number; veryLongStay: number; noPaymentCoverage: number; withPermits: number },
    details: any[]
  ): string[] {
    const recommendations: string[] = [];

    if (patterns.noExitRecorded > 3) {
      recommendations.push(
        `${patterns.noExitRecorded} vehicles have entry but no exit recorded. Check exit camera functionality or review for overnight parking.`
      );
    }

    if (patterns.veryLongStay > 2) {
      recommendations.push(
        `${patterns.veryLongStay} vehicles have been parked for over 24 hours. Review for abandoned vehicles or long-term parking without authorization.`
      );
    }

    if (patterns.noPaymentCoverage > 5) {
      recommendations.push(
        `${patterns.noPaymentCoverage} anomalous sessions have no payment coverage or permits. These may be enforcement candidates.`
      );
    }

    // Check for specific VRMs with multiple anomalies
    const vrmCounts = new Map<string, number>();
    details.forEach(d => {
      vrmCounts.set(d.session.vrm, (vrmCounts.get(d.session.vrm) || 0) + 1);
    });
    const repeatOffenders = Array.from(vrmCounts.entries()).filter(([_, count]) => count > 1);
    if (repeatOffenders.length > 0) {
      recommendations.push(
        `Repeat anomaly VRMs detected: ${repeatOffenders.map(([vrm, count]) => `${vrm} (${count}x)`).join(', ')}. Consider adding to watchlist.`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('No immediate concerns identified. Continue monitoring.');
    }

    return recommendations;
  }

  /**
   * Log an AI observation to the audit trail
   */
  @Post('observation')
  async logObservation(
    @Body() body: {
      observationType: string;
      summary: string;
      details?: string;
      recommendations?: string;
      severity?: string;
      relatedEntityType?: string;
      relatedEntityId?: string;
      siteId?: string;
      vrm?: string;
    },
  ) {
    if (!systemSettings.aiReviewEnabled) {
      throw new ForbiddenException('AI review feature is disabled');
    }

    const observation = await this.auditService.log({
      entityType: body.relatedEntityType || 'SYSTEM',
      entityId: body.relatedEntityId || 'ai-review',
      action: `AI_${body.observationType}`,
      actor: 'AI_ASSISTANT',
      actorType: 'AI',
      siteId: body.siteId,
      vrm: body.vrm,
      details: {
        summary: body.summary,
        details: body.details,
        recommendations: body.recommendations,
        severity: body.severity || 'INFO',
        timestamp: new Date().toISOString(),
      },
    });

    return {
      success: true,
      observationId: observation.id,
      message: 'AI observation logged to audit trail',
    };
  }
}
