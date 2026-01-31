import {
  Controller,
  Patch,
  Post,
  Param,
  Body,
  Get,
  Query,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { Movement, Session, SessionStatus } from '../domain/entities';
import { AuditService } from '../audit/audit.service';
import { SessionService } from '../engine/services/session.service';

interface FlipDirectionDto {
  reprocessSession?: boolean;
}

interface SetDirectionDto {
  direction: 'ENTRY' | 'EXIT';
  reprocessSession?: boolean;
}

interface DiscardMovementDto {
  reason?: string;
}

@Controller('api/movements')
export class MovementsController {
  private readonly logger = new Logger(MovementsController.name);

  constructor(
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
    private readonly auditService: AuditService,
    private readonly sessionService: SessionService,
  ) {}

  @Get(':id')
  async getMovement(@Param('id') id: string) {
    const movement = await this.movementRepo.findOne({ where: { id } });
    if (!movement) {
      throw new NotFoundException(`Movement ${id} not found`);
    }
    return movement;
  }

  @Patch(':id/flip-direction')
  async flipDirection(
    @Param('id') id: string,
    @Body() dto: FlipDirectionDto,
  ) {
    const movement = await this.movementRepo.findOne({ where: { id } });
    if (!movement) {
      throw new NotFoundException(`Movement ${id} not found`);
    }

    if (movement.discarded) {
      throw new BadRequestException('Cannot flip direction of discarded movement');
    }

    const oldDirection = movement.direction;
    const newDirection = movement.direction === 'ENTRY' ? 'EXIT' : 'ENTRY';

    // Update the direction
    movement.direction = newDirection;
    await this.movementRepo.save(movement);

    this.logger.log(
      `Flipped movement ${id} direction from ${oldDirection} to ${newDirection}`,
    );

    // Audit the change
    await this.auditService.log({
      entityType: 'MOVEMENT',
      entityId: id,
      action: 'DIRECTION_FLIPPED',
      details: {
        oldDirection,
        newDirection,
      },
      actor: 'SYSTEM', // TODO: Get from auth context
    });

    // Handle session implications
    await this.handleDirectionFlipSessionImpact(movement, oldDirection, newDirection, dto.reprocessSession);

    return {
      success: true,
      movement,
      message: `Direction changed from ${oldDirection} to ${newDirection}`,
    };
  }

  @Patch(':id/set-direction')
  async setDirection(
    @Param('id') id: string,
    @Body() dto: SetDirectionDto,
  ) {
    const movement = await this.movementRepo.findOne({ where: { id } });
    if (!movement) {
      throw new NotFoundException(`Movement ${id} not found`);
    }

    if (movement.discarded) {
      throw new BadRequestException('Cannot set direction of discarded movement');
    }

    if (!['ENTRY', 'EXIT'].includes(dto.direction)) {
      throw new BadRequestException('Direction must be ENTRY or EXIT');
    }

    const oldDirection = movement.direction;
    const newDirection = dto.direction;

    // Update the direction
    movement.direction = newDirection;
    await this.movementRepo.save(movement);

    this.logger.log(
      `Set movement ${id} direction from ${oldDirection} to ${newDirection}`,
    );

    // Audit the change
    await this.auditService.log({
      entityType: 'MOVEMENT',
      entityId: id,
      action: 'DIRECTION_SET',
      details: {
        oldDirection,
        newDirection,
        wasUnknown: oldDirection === 'UNKNOWN',
      },
      actor: 'SYSTEM', // TODO: Get from auth context
    });

    // Handle session implications
    await this.handleDirectionFlipSessionImpact(movement, oldDirection, newDirection, dto.reprocessSession);

    return {
      success: true,
      movement,
      message: `Direction set from ${oldDirection} to ${newDirection}`,
    };
  }

  @Patch(':id/discard')
  async discardMovement(
    @Param('id') id: string,
    @Body() dto: DiscardMovementDto,
  ) {
    const movement = await this.movementRepo.findOne({ where: { id } });
    if (!movement) {
      throw new NotFoundException(`Movement ${id} not found`);
    }

    if (movement.discarded) {
      throw new BadRequestException('Movement already discarded');
    }

    // Mark as discarded
    movement.discarded = true;
    movement.discardReason = dto.reason || 'Manually discarded';
    movement.discardedAt = new Date();
    await this.movementRepo.save(movement);

    this.logger.log(`Discarded movement ${id}: ${dto.reason || 'No reason'}`);

    // Audit the change
    await this.auditService.log({
      entityType: 'MOVEMENT',
      entityId: id,
      action: 'MOVEMENT_DISCARDED',
      details: {
        reason: dto.reason || 'Manually discarded',
      },
      actor: 'SYSTEM', // TODO: Get from auth context
    });

    // Handle session implications - invalidate any session using this movement
    await this.handleDiscardSessionImpact(movement);

    return {
      success: true,
      movement,
      message: 'Movement discarded',
    };
  }

  @Patch(':id/restore')
  async restoreMovement(@Param('id') id: string) {
    const movement = await this.movementRepo.findOne({ where: { id } });
    if (!movement) {
      throw new NotFoundException(`Movement ${id} not found`);
    }

    if (!movement.discarded) {
      throw new BadRequestException('Movement is not discarded');
    }

    movement.discarded = false;
    movement.discardReason = null;
    movement.discardedAt = null;
    await this.movementRepo.save(movement);

    this.logger.log(`Restored movement ${id}`);

    // Audit the change
    await this.auditService.log({
      entityType: 'MOVEMENT',
      entityId: id,
      action: 'MOVEMENT_RESTORED',
      details: {},
      actor: 'SYSTEM',
    });

    return {
      success: true,
      movement,
      message: 'Movement restored',
    };
  }

  /**
   * Handle the session impact when a movement direction is flipped
   */
  private async handleDirectionFlipSessionImpact(
    movement: Movement,
    oldDirection: string,
    newDirection: string,
    reprocess?: boolean,
  ) {
    // Find any session that references this movement
    const sessionAsEntry = await this.sessionRepo.findOne({
      where: { entryMovementId: movement.id },
    });
    const sessionAsExit = await this.sessionRepo.findOne({
      where: { exitMovementId: movement.id },
    });

    if (sessionAsEntry) {
      // This movement was an entry, now it's an exit
      // Mark the session as invalid
      sessionAsEntry.status = SessionStatus.INVALID;
      await this.sessionRepo.save(sessionAsEntry);
      this.logger.warn(
        `Session ${sessionAsEntry.id} marked INVALID due to entry movement direction flip`,
      );
    }

    if (sessionAsExit) {
      // This movement was an exit, now it's an entry
      // Mark the session as invalid
      sessionAsExit.status = SessionStatus.INVALID;
      await this.sessionRepo.save(sessionAsExit);
      this.logger.warn(
        `Session ${sessionAsExit.id} marked INVALID due to exit movement direction flip`,
      );
    }

    // Optionally reprocess the movement with new direction
    if (reprocess) {
      await this.sessionService.processMovement(movement);
    }
  }

  /**
   * Handle the session impact when a movement is discarded
   */
  private async handleDiscardSessionImpact(movement: Movement) {
    const sessionAsEntry = await this.sessionRepo.findOne({
      where: { entryMovementId: movement.id },
    });
    const sessionAsExit = await this.sessionRepo.findOne({
      where: { exitMovementId: movement.id },
    });

    if (sessionAsEntry) {
      sessionAsEntry.status = SessionStatus.INVALID;
      await this.sessionRepo.save(sessionAsEntry);
      this.logger.warn(
        `Session ${sessionAsEntry.id} marked INVALID due to entry movement discard`,
      );
    }

    if (sessionAsExit) {
      // Remove exit from session, revert to provisional
      sessionAsExit.exitMovementId = null;
      sessionAsExit.endTime = null;
      sessionAsExit.durationMinutes = null;
      sessionAsExit.status = SessionStatus.PROVISIONAL;
      await this.sessionRepo.save(sessionAsExit);
      this.logger.warn(
        `Session ${sessionAsExit.id} reverted to PROVISIONAL due to exit movement discard`,
      );
    }
  }

  /**
   * Get sessions that might have first-in-last-out problems
   * (very long duration or other anomalies)
   */
  @Get('anomalies/first-in-last-out')
  async getFirstInLastOutAnomalies(
    @Query('siteId') siteId?: string,
    @Query('minHours') minHours = '24',
  ) {
    const minDurationMinutes = parseInt(minHours, 10) * 60;

    const queryBuilder = this.sessionRepo
      .createQueryBuilder('session')
      .where('session.status = :status', { status: SessionStatus.COMPLETED })
      .andWhere('session.durationMinutes > :minDuration', {
        minDuration: minDurationMinutes,
      });

    if (siteId) {
      queryBuilder.andWhere('session.siteId = :siteId', { siteId });
    }

    const anomalies = await queryBuilder
      .orderBy('session.durationMinutes', 'DESC')
      .limit(50)
      .getMany();

    return {
      count: anomalies.length,
      minHoursThreshold: parseInt(minHours, 10),
      sessions: anomalies,
    };
  }

  /**
   * Manually trigger stale session cleanup
   * POST /api/movements/sessions/cleanup-expired?thresholdHours=48
   */
  @Patch('sessions/cleanup-expired')
  async cleanupExpiredSessions(@Query('thresholdHours') thresholdHoursStr?: string) {
    const thresholdHours = thresholdHoursStr ? parseInt(thresholdHoursStr, 10) : undefined;
    this.logger.log(`Manual trigger: cleaning up expired sessions (threshold: ${thresholdHours || 'default'}h)`);
    const result = await this.sessionService.triggerExpiredSessionCleanup(thresholdHours);
    return {
      message: 'Stale session cleanup completed',
      thresholdHours: thresholdHours || 24,
      ...result,
    };
  }

  /**
   * Get stats on stale sessions
   * GET /api/movements/sessions/stale-stats
   */
  @Get('sessions/stale-stats')
  async getStaleSessionStats() {
    const now = new Date();
    const h24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const h72Ago = new Date(now.getTime() - 72 * 60 * 60 * 1000);
    const d7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [under24h, h24to72, h72to7d, over7d, totalOpen] = await Promise.all([
      this.sessionRepo.count({
        where: { status: SessionStatus.PROVISIONAL, endTime: IsNull() },
      }),
      this.sessionRepo
        .createQueryBuilder('s')
        .where('s.status = :status', { status: SessionStatus.PROVISIONAL })
        .andWhere('s.endTime IS NULL')
        .andWhere('s.startTime < :h24Ago', { h24Ago })
        .andWhere('s.startTime >= :h72Ago', { h72Ago })
        .getCount(),
      this.sessionRepo
        .createQueryBuilder('s')
        .where('s.status = :status', { status: SessionStatus.PROVISIONAL })
        .andWhere('s.endTime IS NULL')
        .andWhere('s.startTime < :h72Ago', { h72Ago })
        .andWhere('s.startTime >= :d7Ago', { d7Ago })
        .getCount(),
      this.sessionRepo
        .createQueryBuilder('s')
        .where('s.status = :status', { status: SessionStatus.PROVISIONAL })
        .andWhere('s.endTime IS NULL')
        .andWhere('s.startTime < :d7Ago', { d7Ago })
        .getCount(),
      this.sessionRepo.count({
        where: { status: SessionStatus.PROVISIONAL, endTime: IsNull() },
      }),
    ]);

    return {
      totalOpenSessions: totalOpen,
      byAge: {
        under24h: totalOpen - (h24to72 + h72to7d + over7d),
        '24h_to_72h': h24to72,
        '72h_to_7d': h72to7d,
        over7d: over7d,
      },
    };
  }
}
