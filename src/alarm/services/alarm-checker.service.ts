import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan } from 'typeorm';
import {
  AlarmDefinition,
  Payment,
  Movement,
  Decision,
} from '../../domain/entities';
import { DecisionOutcome } from '../../domain/entities/decision.entity';
import { AlarmType } from '../../domain/entities/alarm.enums';
import { AlarmService } from './alarm.service';

@Injectable()
export class AlarmCheckerService {
  private readonly logger = new Logger(AlarmCheckerService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
    @InjectRepository(Decision)
    private readonly decisionRepo: Repository<Decision>,
    private readonly alarmService: AlarmService,
  ) {}

  async checkDefinition(definition: AlarmDefinition): Promise<boolean> {
    this.logger.debug(`Checking alarm definition: ${definition.name}`);

    switch (definition.type) {
      case AlarmType.NO_PAYMENT_DATA:
        return this.checkNoPaymentData(definition);
      case AlarmType.SITE_OFFLINE:
        return this.checkSiteOffline(definition);
      case AlarmType.HIGH_ENFORCEMENT_CANDIDATES:
        return this.checkHighEnforcementCandidates(definition);
      case AlarmType.PAYMENT_SYNC_FAILURE:
        return this.checkPaymentSyncFailure(definition);
      case AlarmType.CUSTOM:
        return this.checkCustomCondition(definition);
      default:
        this.logger.warn(`Unknown alarm type: ${definition.type}`);
        return false;
    }
  }

  private async checkNoPaymentData(definition: AlarmDefinition): Promise<boolean> {
    const conditions = definition.conditions;
    const lookbackHours = conditions.lookbackHours || 24;
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - lookbackHours);

    const siteFilter = definition.siteId ? { siteId: definition.siteId } : {};

    const count = await this.paymentRepo.count({
      where: {
        ...siteFilter,
        ingestedAt: MoreThan(cutoffDate),
      },
    });

    if (count === 0) {
      const siteInfo = definition.siteId
        ? ` for site ${definition.siteId}`
        : ' across all sites';
      await this.alarmService.triggerAlarm(
        definition,
        `No payment data received in the last ${lookbackHours} hours${siteInfo}`,
        { lookbackHours, paymentsFound: 0 },
        definition.siteId ?? undefined,
      );
      return true;
    }

    return false;
  }

  private async checkSiteOffline(definition: AlarmDefinition): Promise<boolean> {
    if (!definition.siteId) {
      this.logger.warn('SITE_OFFLINE check requires siteId');
      return false;
    }

    const conditions = definition.conditions;
    const noMovementMinutes = conditions.noMovementMinutes || 120;
    const cutoffDate = new Date();
    cutoffDate.setMinutes(cutoffDate.getMinutes() - noMovementMinutes);

    const lastMovement = await this.movementRepo.findOne({
      where: {
        siteId: definition.siteId,
      },
      order: { timestamp: 'DESC' },
    });

    if (!lastMovement || lastMovement.timestamp < cutoffDate) {
      const lastMovementTime = lastMovement
        ? lastMovement.timestamp.toISOString()
        : 'never';

      await this.alarmService.triggerAlarm(
        definition,
        `Site ${definition.siteId} appears offline - no movements in ${noMovementMinutes} minutes`,
        {
          noMovementMinutes,
          lastMovementTime,
          siteId: definition.siteId,
        },
        definition.siteId,
      );
      return true;
    }

    return false;
  }

  private async checkHighEnforcementCandidates(
    definition: AlarmDefinition,
  ): Promise<boolean> {
    const conditions = definition.conditions;
    const thresholdCount = conditions.thresholdCount || 50;
    const timeWindowMinutes = conditions.timeWindowMinutes || 60;
    const cutoffDate = new Date();
    cutoffDate.setMinutes(cutoffDate.getMinutes() - timeWindowMinutes);

    const siteFilter = definition.siteId ? { siteId: definition.siteId } : {};

    const count = await this.decisionRepo.count({
      where: {
        ...siteFilter,
        outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE,
        createdAt: MoreThan(cutoffDate),
        status: 'NEW',
      },
    });

    if (count >= thresholdCount) {
      const siteInfo = definition.siteId
        ? ` at site ${definition.siteId}`
        : '';
      await this.alarmService.triggerAlarm(
        definition,
        `High enforcement queue: ${count} candidates in last ${timeWindowMinutes} minutes${siteInfo}`,
        {
          thresholdCount,
          actualCount: count,
          timeWindowMinutes,
        },
        definition.siteId ?? undefined,
      );
      return true;
    }

    return false;
  }

  private async checkPaymentSyncFailure(
    definition: AlarmDefinition,
  ): Promise<boolean> {
    // This is typically triggered by the payment provider system
    // Here we check if there are recent sync failures
    const conditions = definition.conditions;
    const lookbackHours = conditions.lookbackHours || 24;

    // This would need to be integrated with the payment provider module
    // For now, we just log and return false
    this.logger.debug('Payment sync failure check - requires provider integration');
    return false;
  }

  private async checkCustomCondition(
    definition: AlarmDefinition,
  ): Promise<boolean> {
    // Custom conditions would need specific implementation
    this.logger.debug(`Custom condition check for ${definition.name}`);
    return false;
  }

  // Event-based triggers (called from other services)
  async triggerAnprPollerFailure(
    siteId: string,
    errorCount: number,
    lastError?: string,
  ): Promise<void> {
    await this.alarmService.triggerEventAlarm(
      AlarmType.ANPR_POLLER_FAILURE,
      `ANPR poller failure at site ${siteId}: ${errorCount} consecutive errors`,
      { siteId, errorCount, lastError },
      siteId,
    );
  }

  async triggerPaymentSyncFailure(
    providerId: string,
    providerName: string,
    error: string,
  ): Promise<void> {
    await this.alarmService.triggerEventAlarm(
      AlarmType.PAYMENT_SYNC_FAILURE,
      `Payment sync failure for provider ${providerName}: ${error}`,
      { providerId, providerName, error },
    );
  }

  async triggerQRWhitelistSyncFailure(
    errorCount: number,
    errors: string[],
  ): Promise<void> {
    await this.alarmService.triggerEventAlarm(
      AlarmType.QR_WHITELIST_SYNC_FAILURE,
      `QR Whitelist sync failed with ${errorCount} errors`,
      { errorCount, errors: errors.slice(0, 10) },
    );
  }
}
