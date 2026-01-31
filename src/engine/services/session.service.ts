import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Session, Movement, SessionStatus, Site } from '../../domain/entities';
import { RuleEngineService } from './rule-engine.service';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  // Default session expiry threshold in hours (can be overridden per-site)
  private readonly DEFAULT_SESSION_EXPIRY_HOURS = 24;

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
    @InjectRepository(Site)
    private readonly siteRepo: Repository<Site>,
    private readonly ruleEngine: RuleEngineService,
    private readonly auditService: AuditService,
  ) {}

  async processMovement(movement: Movement): Promise<void> {
    this.logger.log(`Processing movement ${movement.id} for session logic`);

    // Skip processing if movement requires human review
    if (movement.requiresReview) {
      this.logger.log(
        `Movement ${movement.id} requires human review. Skipping session processing.`,
      );
      return;
    }

    // Skip processing if movement is discarded
    if (movement.discarded) {
      this.logger.log(
        `Movement ${movement.id} is discarded. Skipping session processing.`,
      );
      return;
    }

    if (movement.direction === 'ENTRY') {
      await this.handleEntry(movement);
    } else if (movement.direction === 'EXIT') {
      await this.handleExit(movement);
    } else {
      this.logger.log(
        `Movement ${movement.id} direction ${movement.direction} ignored`,
      );
    }
  }

  private async handleEntry(movement: Movement) {
    // Check for existing open session at same site for same VRM
    const existingOpenSession = await this.sessionRepo.findOne({
      where: {
        siteId: movement.siteId,
        vrm: movement.vrm,
        endTime: IsNull(),
      },
      order: { startTime: 'DESC' },
    });

    if (existingOpenSession) {
      // Don't create duplicate - log and skip
      this.logger.log(
        `Skipping duplicate entry for VRM ${movement.vrm} - open session ${existingOpenSession.id} already exists (started ${existingOpenSession.startTime.toISOString()})`,
      );
      
      // Audit the skipped duplicate
      await this.auditService.log({
        entityType: 'MOVEMENT',
        entityId: movement.id,
        action: 'DUPLICATE_ENTRY_SKIPPED',
        actor: 'SYSTEM',
        actorType: 'SYSTEM',
        details: {
          reason: 'Open session already exists for this VRM at this site',
          existingSessionId: existingOpenSession.id,
          existingSessionStart: existingOpenSession.startTime,
        },
        vrm: movement.vrm,
        siteId: movement.siteId,
      });
      return;
    }

    const session = this.sessionRepo.create({
      siteId: movement.siteId,
      vrm: movement.vrm,
      entryMovementId: movement.id,
      startTime: movement.timestamp,
      status: SessionStatus.PROVISIONAL,
    });

    try {
      const savedSession = await this.sessionRepo.save(session);
      this.logger.log(
        `Created new session ${savedSession.id} for VRM ${savedSession.vrm}`,
      );

      // Get movement audit log to link as parent
      const movementAudits = await this.auditService.getAuditTrailByEntity(
        'MOVEMENT',
        movement.id,
      );
      const movementAuditId =
        movementAudits.length > 0 ? movementAudits[0].id : undefined;

      // Audit log session creation
      await this.auditService.logSessionCreation(
        savedSession,
        movement,
        movementAuditId,
      );
    } catch (error: any) {
      // Handle race condition: unique constraint violation means another session was just created
      if (error?.code === '23505' || error?.message?.includes('duplicate key')) {
        this.logger.log(
          `Race condition: Session for VRM ${movement.vrm} at site ${movement.siteId} was just created by another process`,
        );
        await this.auditService.log({
          entityType: 'MOVEMENT',
          entityId: movement.id,
          action: 'DUPLICATE_ENTRY_SKIPPED',
          actor: 'SYSTEM',
          actorType: 'SYSTEM',
          details: {
            reason: 'Race condition - session created by concurrent process',
          },
          vrm: movement.vrm,
          siteId: movement.siteId,
        });
      } else {
        throw error;
      }
    }
  }

  private async handleExit(movement: Movement) {
    const openSession = await this.sessionRepo.findOne({
      where: {
        siteId: movement.siteId,
        vrm: movement.vrm,
        endTime: IsNull(),
      },
      order: { startTime: 'DESC' },
    });

    if (openSession) {
      const durationMinutes = Math.floor(
        (movement.timestamp.getTime() - openSession.startTime.getTime()) /
          60000,
      );

      // Validate timestamp - exit must be after entry
      if (durationMinutes < 0) {
        this.logger.warn(
          `Exit timestamp (${movement.timestamp}) is before entry timestamp (${openSession.startTime}) for session ${openSession.id}. Treating as orphan exit.`,
        );
        return; // Don't close the session with invalid data
      }

      openSession.exitMovementId = movement.id;
      openSession.endTime = movement.timestamp;
      openSession.durationMinutes = durationMinutes;
      openSession.status = SessionStatus.COMPLETED;

      const savedSession = await this.sessionRepo.save(openSession);
      this.logger.log(
        `Closed session ${savedSession.id}. Duration: ${savedSession.durationMinutes} min`,
      );

      // Get audit logs for linking
      const sessionAudits = await this.auditService.getAuditTrailByEntity(
        'SESSION',
        savedSession.id,
      );
      const sessionCreatedAuditId = sessionAudits.find(
        (a) => a.action === 'SESSION_CREATED',
      )?.id;
      const exitAudits = await this.auditService.getAuditTrailByEntity(
        'MOVEMENT',
        movement.id,
      );
      const exitAuditId = exitAudits.length > 0 ? exitAudits[0].id : undefined;

      // Audit log session completion
      const sessionCompletedAudit =
        await this.auditService.logSessionCompletion(
          savedSession,
          movement,
          sessionCreatedAuditId,
          exitAuditId,
        );

      // Trigger Rule Evaluation
      await this.ruleEngine.evaluateSession(savedSession).catch((err) => {
        this.logger.error(
          `Error evaluating session ${savedSession.id}`,
          err.stack,
        );
      });
    } else {
      this.logger.warn(`Orphan exit for VRM ${movement.vrm}`);
      // Handle orphan logic if needed
    }
  }

  /**
   * Scheduled job to auto-close stale sessions that have exceeded the expiry threshold.
   * Runs every hour. Sessions older than the threshold (default 24h) with no exit are marked EXPIRED.
   * @param overrideThresholdHours - Optional override for the threshold (for manual triggers)
   */
  @Cron(CronExpression.EVERY_HOUR)
  async closeExpiredSessions(overrideThresholdHours?: number): Promise<{ closed: number; errors: number }> {
    const thresholdHours = overrideThresholdHours ?? this.DEFAULT_SESSION_EXPIRY_HOURS;
    this.logger.log(`Running stale session cleanup (threshold: ${thresholdHours}h)...`);

    let closed = 0;
    let errors = 0;

    try {
      const cutoffTime = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);

      // Find all stale PROVISIONAL sessions
      const staleSessions = await this.sessionRepo.find({
        where: {
          status: SessionStatus.PROVISIONAL,
          endTime: IsNull(),
          startTime: LessThan(cutoffTime),
        },
        take: 1000, // Process in batches
      });

      this.logger.log(`Found ${staleSessions.length} stale sessions to close`);

      for (const session of staleSessions) {
        try {
          // Mark as expired (no exit detected)
          session.status = SessionStatus.EXPIRED;
          session.endTime = new Date(); // Use current time as synthetic end
          session.durationMinutes = Math.floor(
            (session.endTime.getTime() - session.startTime.getTime()) / 60000,
          );

          await this.sessionRepo.save(session);

          // Audit the auto-closure
          await this.auditService.log({
            entityType: 'SESSION',
            entityId: session.id,
            action: 'SESSION_EXPIRED',
            actor: 'SYSTEM',
            actorType: 'SYSTEM',
            details: {
              reason: 'Auto-closed: no exit detected within threshold',
              thresholdHours,
              entryTime: session.startTime,
              autoClosedAt: session.endTime,
              calculatedDuration: session.durationMinutes,
            },
            vrm: session.vrm,
            siteId: session.siteId,
          });

          closed++;
        } catch (err: any) {
          this.logger.error(`Failed to close session ${session.id}: ${err.message}`);
          errors++;
        }
      }

      this.logger.log(`Stale session cleanup complete: ${closed} closed, ${errors} errors`);
    } catch (err: any) {
      this.logger.error(`Stale session cleanup failed: ${err.message}`);
    }

    return { closed, errors };
  }

  /**
   * Manual trigger for stale session cleanup (for API endpoint)
   * @param thresholdHours - Override the default threshold (default: 24 hours)
   */
  async triggerExpiredSessionCleanup(thresholdHours?: number): Promise<{ closed: number; errors: number }> {
    return this.closeExpiredSessions(thresholdHours);
  }
}
