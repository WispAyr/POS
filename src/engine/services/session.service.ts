import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Session, Movement, SessionStatus } from '../../domain/entities';
import { RuleEngineService } from './rule-engine.service';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
    private readonly ruleEngine: RuleEngineService,
    private readonly auditService: AuditService,
  ) {}

  async processMovement(movement: Movement): Promise<void> {
    this.logger.log(`Processing movement ${movement.id} for session logic`);

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
    const session = this.sessionRepo.create({
      siteId: movement.siteId,
      vrm: movement.vrm,
      entryMovementId: movement.id,
      startTime: movement.timestamp,
      status: SessionStatus.PROVISIONAL,
    });

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
}
