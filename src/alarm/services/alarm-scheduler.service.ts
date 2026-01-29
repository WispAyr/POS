import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AlarmService } from './alarm.service';
import { AlarmCheckerService } from './alarm-checker.service';
import { AlarmDefinition } from '../../domain/entities';

interface ScheduledCheck {
  definition: AlarmDefinition;
  lastRun?: Date;
  nextRun?: Date;
}

@Injectable()
export class AlarmSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(AlarmSchedulerService.name);
  private scheduledChecks: Map<string, ScheduledCheck> = new Map();

  constructor(
    private readonly alarmService: AlarmService,
    private readonly checkerService: AlarmCheckerService,
  ) {}

  async onModuleInit() {
    await this.refreshScheduledDefinitions();
  }

  async refreshScheduledDefinitions(): Promise<void> {
    const definitions = await this.alarmService.getScheduledDefinitions();
    this.scheduledChecks.clear();

    for (const def of definitions) {
      this.scheduledChecks.set(def.id, {
        definition: def,
        nextRun: this.calculateNextRun(def.cronSchedule),
      });
    }

    this.logger.log(
      `Loaded ${this.scheduledChecks.size} scheduled alarm definitions`,
    );
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async checkScheduledAlarms(): Promise<void> {
    const now = new Date();

    for (const [id, check] of this.scheduledChecks) {
      if (check.nextRun && check.nextRun <= now) {
        try {
          this.logger.debug(`Running scheduled check: ${check.definition.name}`);
          await this.checkerService.checkDefinition(check.definition);

          // Update last run and calculate next run
          check.lastRun = now;
          check.nextRun = this.calculateNextRun(check.definition.cronSchedule);
        } catch (err: any) {
          this.logger.error(
            `Failed to run scheduled check ${check.definition.name}: ${err.message}`,
            err.stack,
          );
        }
      }
    }
  }

  private calculateNextRun(cronSchedule: string): Date | undefined {
    if (!cronSchedule) return undefined;

    // Parse cron expression and calculate next run time
    // Simple implementation for common patterns
    const parts = cronSchedule.split(' ');
    if (parts.length !== 5) {
      this.logger.warn(`Invalid cron expression: ${cronSchedule}`);
      return undefined;
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    const now = new Date();
    const next = new Date(now);

    // Handle specific time patterns
    if (minute !== '*' && hour !== '*') {
      // Specific time, e.g., '0 3 * * *' (3:00 AM daily)
      const targetHour = parseInt(hour);
      const targetMinute = parseInt(minute);

      next.setHours(targetHour, targetMinute, 0, 0);

      // If the time has passed today, schedule for tomorrow
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
    } else if (minute.startsWith('*/')) {
      // Every N minutes, e.g., '*/15 * * * *'
      const interval = parseInt(minute.substring(2));
      const currentMinute = now.getMinutes();
      const nextMinute = Math.ceil(currentMinute / interval) * interval;

      if (nextMinute >= 60) {
        next.setHours(next.getHours() + 1);
        next.setMinutes(nextMinute - 60);
      } else if (nextMinute === currentMinute) {
        next.setMinutes(nextMinute + interval);
        if (next.getMinutes() >= 60) {
          next.setHours(next.getHours() + 1);
          next.setMinutes(next.getMinutes() - 60);
        }
      } else {
        next.setMinutes(nextMinute);
      }
      next.setSeconds(0);
      next.setMilliseconds(0);
    } else if (hour.startsWith('*/')) {
      // Every N hours
      const interval = parseInt(hour.substring(2));
      const currentHour = now.getHours();
      const nextHour = Math.ceil((currentHour + 1) / interval) * interval;

      if (nextHour >= 24) {
        next.setDate(next.getDate() + 1);
        next.setHours(0);
      } else {
        next.setHours(nextHour);
      }
      next.setMinutes(parseInt(minute) || 0);
      next.setSeconds(0);
      next.setMilliseconds(0);
    } else {
      // Default: run in 1 hour
      next.setHours(next.getHours() + 1);
      next.setMinutes(0);
      next.setSeconds(0);
    }

    return next;
  }

  async runManualCheck(definitionId: string): Promise<boolean> {
    const definition = await this.alarmService.getDefinitionById(definitionId);
    return this.checkerService.checkDefinition(definition);
  }

  getScheduledChecks(): Array<{
    id: string;
    name: string;
    cronSchedule: string;
    lastRun?: Date;
    nextRun?: Date;
  }> {
    const result: Array<{
      id: string;
      name: string;
      cronSchedule: string;
      lastRun?: Date;
      nextRun?: Date;
    }> = [];

    for (const [id, check] of this.scheduledChecks) {
      result.push({
        id,
        name: check.definition.name,
        cronSchedule: check.definition.cronSchedule,
        lastRun: check.lastRun,
        nextRun: check.nextRun,
      });
    }

    return result;
  }
}
