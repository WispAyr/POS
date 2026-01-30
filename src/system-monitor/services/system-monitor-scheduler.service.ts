import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SystemMonitorService } from './system-monitor.service';
import { AlarmService } from '../../alarm/services/alarm.service';
import { AlarmType, AlarmSeverity, NotificationChannel } from '../../domain/entities/alarm.enums';

@Injectable()
export class SystemMonitorSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SystemMonitorSchedulerService.name);
  private lastStatus: 'healthy' | 'warning' | 'critical' = 'healthy';

  constructor(
    private readonly monitorService: SystemMonitorService,
    private readonly alarmService: AlarmService,
  ) {}

  async onModuleInit() {
    // Run initial check
    await this.checkSystemHealth();
    this.logger.log('System monitor scheduler initialized');
  }

  /**
   * Check system health every minute
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkSystemHealth(): Promise<void> {
    try {
      const health = await this.monitorService.getHealthStatus();

      // Log status change
      if (health.status !== this.lastStatus) {
        this.logger.log(
          `System health status changed: ${this.lastStatus} -> ${health.status}`,
        );
        this.lastStatus = health.status;
      }

      // Trigger alarms for failed checks
      for (const check of health.checks) {
        if (check.status === 'fail') {
          await this.triggerAlarm(check.name, check.message || '', AlarmSeverity.CRITICAL);
        } else if (check.status === 'warn') {
          await this.triggerAlarm(check.name, check.message || '', AlarmSeverity.WARNING);
        }
      }

      // Log metrics periodically (every 5 minutes)
      const now = new Date();
      if (now.getMinutes() % 5 === 0) {
        const metrics = await this.monitorService.getMetrics();
        this.logger.debug(
          `System metrics: CPU ${metrics.cpu.usage}%, Memory ${metrics.memory.usagePercent}%, ` +
            `Load ${metrics.cpu.loadAverage[0].toFixed(2)}`,
        );
      }
    } catch (err: any) {
      this.logger.error(`Failed to check system health: ${err.message}`, err.stack);
    }
  }

  /**
   * Trigger an alarm for a system issue
   */
  private async triggerAlarm(
    checkName: string,
    message: string,
    severity: AlarmSeverity,
  ): Promise<void> {
    try {
      // Find or create alarm definition for this check
      const definitions = await this.alarmService.getAllDefinitions();
      let definition = definitions.find(
        (d: any) =>
          d.type === AlarmType.CUSTOM &&
          d.name === `System: ${checkName}`,
      );

      if (!definition) {
        // Create definition for this check type
        definition = await this.alarmService.createDefinition({
          name: `System: ${checkName}`,
          description: `System health check alarm for ${checkName}`,
          type: AlarmType.CUSTOM,
          severity,
          conditions: { checkName },
          enabled: true,
          notificationChannels: [NotificationChannel.IN_APP],
        });
      }

      // Check if there's already an active alarm for this
      const activeAlarms = await this.alarmService.getActiveAlarms();
      const existingAlarm = activeAlarms.find(
        (a) => a.definitionId === definition!.id && a.status === 'TRIGGERED',
      );

      if (!existingAlarm) {
        // Trigger new alarm
        await this.alarmService.triggerAlarm(definition, message, {
          checkName,
          timestamp: new Date().toISOString(),
        });
        this.logger.warn(`System alarm triggered: ${checkName} - ${message}`);
      }
    } catch (err: any) {
      this.logger.error(`Failed to trigger alarm for ${checkName}: ${err.message}`);
    }
  }

  /**
   * Collect extended metrics every 5 minutes for trending
   */
  @Cron('*/5 * * * *')
  async collectMetricsForTrending(): Promise<void> {
    try {
      const metrics = await this.monitorService.getMetrics();

      // TODO: Store metrics in time-series database or log for analysis
      this.logger.debug(
        `Metrics collected: CPU=${metrics.cpu.usage}%, Mem=${metrics.memory.usagePercent}%, ` +
          `Disk=${metrics.disks[0]?.usagePercent || 0}%`,
      );
    } catch (err: any) {
      this.logger.error(`Failed to collect metrics: ${err.message}`);
    }
  }
}
