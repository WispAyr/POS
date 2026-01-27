import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Session, Decision, DecisionOutcome } from '../../domain/entities';
import { RuleEngineService } from './rule-engine.service';
import { AuditService } from '../../audit/audit.service';

/**
 * Service for reconciling sessions when late-arriving data (payments, permits) arrives
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Decision)
    private readonly decisionRepo: Repository<Decision>,
    private readonly ruleEngine: RuleEngineService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Re-evaluate sessions for a VRM when new payment arrives
   */
  async reconcilePayment(
    vrm: string,
    siteId: string,
    paymentStartTime: Date,
    paymentExpiryTime: Date,
    paymentId?: string,
  ): Promise<{
    sessionsReevaluated: number;
    decisionsUpdated: number;
  }> {
    this.logger.log(
      `Reconciling sessions for VRM ${vrm} at site ${siteId} with payment period ${paymentStartTime} to ${paymentExpiryTime}`,
    );

    // Log reconciliation trigger
    const reconciliationAudit = paymentId
      ? await this.auditService.logReconciliationTrigger(
          'PAYMENT',
          paymentId,
          vrm,
          siteId,
        )
      : undefined;

    // Find sessions that:
    // 1. Match VRM and site
    // 2. Overlap with payment time window
    // 3. Have been completed (have endTime)
    const sessions = await this.sessionRepo.find({
      where: {
        vrm,
        siteId,
      },
      order: { startTime: 'DESC' },
    });

    const completedSessions = sessions.filter((s) => s.endTime !== null);

    // Filter sessions that overlap with payment period
    const overlappingSessions = completedSessions.filter((session) => {
      const sessionStart = session.startTime.getTime();
      const sessionEnd = session.endTime.getTime();
      const paymentStart = paymentStartTime.getTime();
      const paymentExpiry = paymentExpiryTime.getTime();

      // Session overlaps if:
      // - Session starts before payment expires AND
      // - Session ends after payment starts
      return sessionStart < paymentExpiry && sessionEnd > paymentStart;
    });

    this.logger.log(
      `Found ${overlappingSessions.length} sessions to re-evaluate`,
    );

    let decisionsUpdated = 0;

    for (const session of overlappingSessions) {
      // Get existing decision
      const existingDecision = await this.decisionRepo.findOne({
        where: { sessionId: session.id },
        order: { createdAt: 'DESC' },
      });

      // Re-evaluate with rule engine
      const newDecision = await this.ruleEngine.evaluateSession(session);

      // Check if outcome changed
      if (
        existingDecision &&
        existingDecision.outcome !== newDecision.outcome
      ) {
        this.logger.log(
          `Decision changed for session ${session.id}: ` +
            `${existingDecision.outcome} → ${newDecision.outcome}`,
        );

        // Update existing decision or create new one
        if (
          existingDecision.status === 'NEW' ||
          existingDecision.status === 'CANDIDATE'
        ) {
          // Update existing decision if not yet processed
          const oldDecision = { ...existingDecision };
          existingDecision.outcome = newDecision.outcome;
          existingDecision.ruleApplied = newDecision.ruleApplied;
          existingDecision.rationale = `${existingDecision.rationale} | RECONCILED: ${newDecision.rationale}`;
          await this.decisionRepo.save(existingDecision);

          // Audit log decision reconciliation
          await this.auditService.logDecisionReconciliation(
            existingDecision,
            oldDecision,
            paymentId || 'unknown',
            'PAYMENT',
            reconciliationAudit?.id,
          );

          decisionsUpdated++;
        } else {
          // Decision already processed, log but don't change
          this.logger.warn(
            `Cannot update decision ${existingDecision.id} - already ${existingDecision.status}`,
          );
        }
      }
    }

    return {
      sessionsReevaluated: overlappingSessions.length,
      decisionsUpdated,
    };
  }

  /**
   * Re-evaluate sessions for a VRM when permit is added/updated
   */
  async reconcilePermit(
    vrm: string,
    siteId: string | null,
    permitActive: boolean,
  ): Promise<{
    sessionsReevaluated: number;
    decisionsUpdated: number;
  }> {
    this.logger.log(
      `Reconciling sessions for VRM ${vrm} with permit (site: ${siteId}, active: ${permitActive})`,
    );

    if (!permitActive) {
      // Permit removed/deactivated - only affects future sessions
      return { sessionsReevaluated: 0, decisionsUpdated: 0 };
    }

    // Find completed sessions for this VRM
    const query = this.sessionRepo
      .createQueryBuilder('session')
      .where('session.vrm = :vrm', { vrm })
      .andWhere('session.endTime IS NOT NULL');

    if (siteId) {
      query.andWhere('session.siteId = :siteId', { siteId });
    }

    const sessions = await query.orderBy('session.startTime', 'DESC').getMany();

    this.logger.log(`Found ${sessions.length} sessions to re-evaluate`);

    let decisionsUpdated = 0;

    for (const session of sessions) {
      const existingDecision = await this.decisionRepo.findOne({
        where: { sessionId: session.id },
        order: { createdAt: 'DESC' },
      });

      // Re-evaluate
      const newDecision = await this.ruleEngine.evaluateSession(session);

      if (
        existingDecision &&
        existingDecision.outcome !== newDecision.outcome
      ) {
        this.logger.log(
          `Decision changed for session ${session.id}: ` +
            `${existingDecision.outcome} → ${newDecision.outcome}`,
        );

        if (
          existingDecision.status === 'NEW' ||
          existingDecision.status === 'CANDIDATE'
        ) {
          existingDecision.outcome = newDecision.outcome;
          existingDecision.ruleApplied = newDecision.ruleApplied;
          existingDecision.rationale = `${existingDecision.rationale} | RECONCILED: ${newDecision.rationale}`;
          await this.decisionRepo.save(existingDecision);
          decisionsUpdated++;
        }
      }
    }

    return {
      sessionsReevaluated: sessions.length,
      decisionsUpdated,
    };
  }

  /**
   * Re-evaluate all sessions for a site (useful for bulk operations)
   */
  async reconcileSite(
    siteId: string,
    limit: number = 100,
  ): Promise<{
    sessionsReevaluated: number;
    decisionsUpdated: number;
  }> {
    this.logger.log(`Reconciling all sessions for site ${siteId}`);

    const sessions = await this.sessionRepo.find({
      where: { siteId },
      take: limit,
      order: { startTime: 'DESC' },
    });

    const completedSessions = sessions.filter((s) => s.endTime !== null);

    let decisionsUpdated = 0;

    for (const session of completedSessions) {
      const existingDecision = await this.decisionRepo.findOne({
        where: { sessionId: session.id },
        order: { createdAt: 'DESC' },
      });

      const newDecision = await this.ruleEngine.evaluateSession(session);

      if (
        existingDecision &&
        existingDecision.outcome !== newDecision.outcome
      ) {
        if (
          existingDecision.status === 'NEW' ||
          existingDecision.status === 'CANDIDATE'
        ) {
          existingDecision.outcome = newDecision.outcome;
          existingDecision.ruleApplied = newDecision.ruleApplied;
          existingDecision.rationale = `${existingDecision.rationale} | RECONCILED: ${newDecision.rationale}`;
          await this.decisionRepo.save(existingDecision);
          decisionsUpdated++;
        }
      }
    }

    return {
      sessionsReevaluated: completedSessions.length,
      decisionsUpdated,
    };
  }
}
