import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Decision, DecisionOutcome } from '../../domain/entities';
import { RuleEngineService } from './rule-engine.service';
import { AuditService } from '../../audit/audit.service';

/**
 * Scheduled service to periodically re-evaluate enforcement candidates.
 *
 * This ensures that enforcement candidates (NEW/CANDIDATE status) are re-checked
 * against the latest permit and payment data. This catches cases where:
 * - Permits were added/updated without triggering immediate reconciliation
 * - Payments arrived through channels that didn't trigger reconciliation
 * - Data was manually corrected in the database
 *
 * IMPORTANT: Human-reviewed decisions (APPROVED, REJECTED, EXPORTED, etc.)
 * are NEVER automatically changed. Only a human can modify those statuses.
 */
@Injectable()
export class EnforcementReevaluationService {
  private readonly logger = new Logger(EnforcementReevaluationService.name);

  // Statuses that can be automatically re-evaluated
  private readonly REEVALUATABLE_STATUSES = ['NEW', 'CANDIDATE'];

  constructor(
    @InjectRepository(Decision)
    private readonly decisionRepo: Repository<Decision>,
    private readonly ruleEngine: RuleEngineService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Re-evaluate enforcement candidates every 30 minutes.
   * Only NEW and CANDIDATE decisions are checked - human-reviewed decisions are protected.
   */
  @Cron('*/30 * * * *')
  async reevaluateEnforcementCandidates(): Promise<{
    evaluated: number;
    updated: number;
    errors: number;
  }> {
    this.logger.log('Starting scheduled enforcement candidate re-evaluation...');

    let evaluated = 0;
    let updated = 0;
    let errors = 0;

    try {
      // Find all enforcement candidates that haven't been human-reviewed
      const candidates = await this.decisionRepo.find({
        where: {
          outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE,
          status: In(this.REEVALUATABLE_STATUSES),
        },
        relations: ['session'],
        order: { createdAt: 'ASC' },
        take: 500, // Batch limit to prevent memory issues
      });

      this.logger.log(
        `Found ${candidates.length} enforcement candidates to re-evaluate`,
      );

      for (const decision of candidates) {
        try {
          if (!decision.session) {
            this.logger.warn(
              `Decision ${decision.id} has no associated session, skipping`,
            );
            continue;
          }

          // Skip sessions that haven't completed (no exit)
          if (!decision.session.endTime) {
            continue;
          }

          evaluated++;

          // Re-evaluate with the rule engine
          const newDecision = await this.ruleEngine.evaluateSession(
            decision.session,
          );

          // Check if outcome changed
          if (decision.outcome !== newDecision.outcome) {
            this.logger.log(
              `Decision ${decision.id} changed: ${decision.outcome} → ${newDecision.outcome}`,
            );

            // Capture old state for audit
            const oldOutcome = decision.outcome;
            const oldRationale = decision.rationale;

            // Update the decision
            decision.outcome = newDecision.outcome;
            decision.ruleApplied = newDecision.ruleApplied;
            decision.rationale = `${decision.rationale} | AUTO_REEVALUATED: ${newDecision.rationale}`;

            await this.decisionRepo.save(decision);

            // Audit log the change
            await this.auditService.log({
              entityType: 'DECISION',
              entityId: decision.id,
              action: 'DECISION_AUTO_REEVALUATED',
              actor: 'SYSTEM',
              actorType: 'SCHEDULER',
              siteId: decision.session.siteId,
              vrm: decision.session.vrm,
              details: {
                sessionId: decision.sessionId,
                previousOutcome: oldOutcome,
                newOutcome: newDecision.outcome,
                previousRationale: oldRationale,
                newRationale: newDecision.rationale,
                triggerType: 'SCHEDULED_REEVALUATION',
              },
            });

            updated++;
          }
        } catch (err: any) {
          this.logger.error(
            `Error re-evaluating decision ${decision.id}: ${err.message}`,
          );
          errors++;
        }
      }

      this.logger.log(
        `Enforcement re-evaluation complete. Evaluated: ${evaluated}, Updated: ${updated}, Errors: ${errors}`,
      );

      // Audit log the batch run
      await this.auditService.log({
        entityType: 'ENFORCEMENT_REEVALUATION',
        entityId: `reevaluation-${Date.now()}`,
        action: 'SCHEDULED_REEVALUATION_COMPLETE',
        actor: 'SYSTEM',
        actorType: 'SCHEDULER',
        details: {
          candidatesFound: candidates.length,
          evaluated,
          updated,
          errors,
        },
      });
    } catch (err: any) {
      this.logger.error(
        `Enforcement re-evaluation failed: ${err.message}`,
        err.stack,
      );

      await this.auditService.log({
        entityType: 'ENFORCEMENT_REEVALUATION',
        entityId: `reevaluation-${Date.now()}`,
        action: 'SCHEDULED_REEVALUATION_FAILED',
        actor: 'SYSTEM',
        actorType: 'SCHEDULER',
        details: { error: err.message },
      });
    }

    return { evaluated, updated, errors };
  }

  /**
   * Manual trigger for re-evaluation (for testing/admin use)
   */
  async triggerReevaluation(): Promise<{
    evaluated: number;
    updated: number;
    errors: number;
  }> {
    return this.reevaluateEnforcementCandidates();
  }

  /**
   * Re-evaluate a specific decision (admin function)
   * Still respects the human-reviewed protection.
   */
  async reevaluateDecision(decisionId: string): Promise<{
    changed: boolean;
    previousOutcome?: string;
    newOutcome?: string;
    message: string;
  }> {
    const decision = await this.decisionRepo.findOne({
      where: { id: decisionId },
      relations: ['session'],
    });

    if (!decision) {
      return { changed: false, message: 'Decision not found' };
    }

    if (!this.REEVALUATABLE_STATUSES.includes(decision.status)) {
      return {
        changed: false,
        message: `Cannot re-evaluate decision with status '${decision.status}'. Only NEW and CANDIDATE statuses can be automatically re-evaluated. Human-reviewed decisions require manual intervention.`,
      };
    }

    if (!decision.session || !decision.session.endTime) {
      return {
        changed: false,
        message: 'Session not found or not completed',
      };
    }

    const newDecision = await this.ruleEngine.evaluateSession(decision.session);

    if (decision.outcome === newDecision.outcome) {
      return {
        changed: false,
        previousOutcome: decision.outcome,
        newOutcome: newDecision.outcome,
        message: 'No change in outcome',
      };
    }

    const previousOutcome = decision.outcome;

    decision.outcome = newDecision.outcome;
    decision.ruleApplied = newDecision.ruleApplied;
    decision.rationale = `${decision.rationale} | MANUAL_REEVALUATED: ${newDecision.rationale}`;

    await this.decisionRepo.save(decision);

    await this.auditService.log({
      entityType: 'DECISION',
      entityId: decision.id,
      action: 'DECISION_MANUAL_REEVALUATED',
      actor: 'ADMIN',
      actorType: 'USER',
      siteId: decision.session.siteId,
      vrm: decision.session.vrm,
      details: {
        sessionId: decision.sessionId,
        previousOutcome,
        newOutcome: newDecision.outcome,
        triggerType: 'MANUAL_REEVALUATION',
      },
    });

    return {
      changed: true,
      previousOutcome,
      newOutcome: newDecision.outcome,
      message: `Decision updated from ${previousOutcome} to ${newDecision.outcome}`,
    };
  }
}
