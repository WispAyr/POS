import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { ScheduledAction, ActionType } from '../entities/scheduled-action.entity';
import { CreateScheduledActionDto, UpdateScheduledActionDto } from '../dto/create-scheduled-action.dto';
import { MetricsCollectorService } from './metrics-collector.service';

interface ActionCheck {
  action: ScheduledAction;
  lastRun?: Date;
  nextRun?: Date;
}

@Injectable()
export class ScheduledActionService implements OnModuleInit {
  private readonly logger = new Logger(ScheduledActionService.name);
  private scheduledActions: Map<string, ActionCheck> = new Map();
  private readonly mondayApiKey: string;
  private readonly mondayApiUrl = 'https://api.monday.com/v2';

  constructor(
    @InjectRepository(ScheduledAction)
    private readonly actionRepo: Repository<ScheduledAction>,
    private readonly metricsCollector: MetricsCollectorService,
    private readonly configService: ConfigService,
  ) {
    this.mondayApiKey = this.configService.get<string>('MONDAY_API_KEY', '');
  }

  async onModuleInit() {
    await this.refreshScheduledActions();
  }

  async refreshScheduledActions(): Promise<void> {
    const actions = await this.getEnabledActions();
    this.scheduledActions.clear();

    for (const action of actions) {
      this.scheduledActions.set(action.id, {
        action,
        nextRun: action.nextRunAt ?? undefined,
      });
    }

    this.logger.log(`Loaded ${this.scheduledActions.size} scheduled actions`);
  }

  // CRUD Operations
  async createAction(dto: CreateScheduledActionDto): Promise<ScheduledAction> {
    const action = this.actionRepo.create({
      name: dto.name,
      description: dto.description,
      actionType: dto.actionType,
      cronSchedule: dto.cronSchedule,
      config: dto.config,
      siteId: dto.siteId,
      enabled: dto.enabled ?? true,
      nextRunAt: this.calculateNextRun(dto.cronSchedule),
    });

    const saved = await this.actionRepo.save(action);
    this.logger.log(`Created scheduled action: ${saved.name} (${saved.id})`);
    await this.refreshScheduledActions();
    return saved;
  }

  async updateAction(id: string, dto: UpdateScheduledActionDto): Promise<ScheduledAction> {
    const action = await this.getActionById(id);

    if (dto.name !== undefined) action.name = dto.name;
    if (dto.description !== undefined) action.description = dto.description;
    if (dto.actionType !== undefined) action.actionType = dto.actionType;
    if (dto.cronSchedule !== undefined) {
      action.cronSchedule = dto.cronSchedule;
      action.nextRunAt = this.calculateNextRun(dto.cronSchedule);
    }
    if (dto.config !== undefined) action.config = dto.config;
    if (dto.siteId !== undefined) action.siteId = dto.siteId;
    if (dto.enabled !== undefined) action.enabled = dto.enabled;

    const saved = await this.actionRepo.save(action);
    this.logger.log(`Updated scheduled action: ${saved.name} (${saved.id})`);
    await this.refreshScheduledActions();
    return saved;
  }

  async deleteAction(id: string): Promise<void> {
    const action = await this.getActionById(id);
    await this.actionRepo.remove(action);
    this.logger.log(`Deleted scheduled action: ${action.name} (${id})`);
    await this.refreshScheduledActions();
  }

  async getActionById(id: string): Promise<ScheduledAction> {
    const action = await this.actionRepo.findOne({ where: { id } });
    if (!action) {
      throw new NotFoundException(`Scheduled action ${id} not found`);
    }
    return action;
  }

  async getAllActions(): Promise<ScheduledAction[]> {
    return this.actionRepo.find({ order: { name: 'ASC' } });
  }

  async getEnabledActions(): Promise<ScheduledAction[]> {
    return this.actionRepo.find({ where: { enabled: true } });
  }

  // Scheduler
  @Cron(CronExpression.EVERY_MINUTE)
  async checkScheduledActions(): Promise<void> {
    const now = new Date();

    for (const [id, check] of this.scheduledActions) {
      if (check.nextRun && check.nextRun <= now) {
        try {
          this.logger.debug(`Running scheduled action: ${check.action.name}`);
          const result = await this.executeAction(check.action);

          // Update action with result
          check.action.lastRunAt = now;
          check.action.nextRunAt = this.calculateNextRun(check.action.cronSchedule);
          check.action.lastRunResult = result;
          await this.actionRepo.save(check.action);

          check.lastRun = now;
          check.nextRun = check.action.nextRunAt ?? undefined;
        } catch (err: any) {
          this.logger.error(
            `Failed to execute action ${check.action.name}: ${err.message}`,
            err.stack,
          );

          // Save error result
          check.action.lastRunAt = now;
          check.action.lastRunResult = { error: err.message };
          await this.actionRepo.save(check.action);
        }
      }
    }
  }

  async executeAction(action: ScheduledAction): Promise<Record<string, any>> {
    switch (action.actionType) {
      case ActionType.MONDAY_UPDATE:
        return this.executeMondayUpdate(action);
      default:
        throw new Error(`Unknown action type: ${action.actionType}`);
    }
  }

  private async executeMondayUpdate(action: ScheduledAction): Promise<Record<string, any>> {
    const { boardId, itemId, columnMappings } = action.config;

    if (!this.mondayApiKey) {
      throw new Error('MONDAY_API_KEY not configured');
    }

    // Collect metrics for column values
    const columnValues: Record<string, string> = {};
    for (const mapping of columnMappings) {
      const value = await this.metricsCollector.collectMetric(
        mapping.metricKey,
        action.siteId ?? undefined,
      );
      columnValues[mapping.columnId] = String(value);
    }

    // Prepare Monday.com mutation
    const mutation = `
      mutation {
        change_multiple_column_values(
          board_id: ${boardId},
          item_id: ${itemId},
          column_values: "${JSON.stringify(columnValues).replace(/"/g, '\\"')}"
        ) {
          id
        }
      }
    `;

    const response = await fetch(this.mondayApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.mondayApiKey,
      },
      body: JSON.stringify({ query: mutation }),
    });

    const result = await response.json();

    if (result.errors) {
      throw new Error(`Monday.com API error: ${JSON.stringify(result.errors)}`);
    }

    this.logger.log(`Updated Monday.com board ${boardId}, item ${itemId}`);
    return {
      success: true,
      boardId,
      itemId,
      columnValues,
      response: result,
    };
  }

  async runManualAction(actionId: string): Promise<Record<string, any>> {
    const action = await this.getActionById(actionId);
    return this.executeAction(action);
  }

  getScheduledActions(): Array<{
    id: string;
    name: string;
    actionType: ActionType;
    cronSchedule: string;
    lastRun?: Date;
    nextRun?: Date;
    enabled: boolean;
  }> {
    const result: Array<{
      id: string;
      name: string;
      actionType: ActionType;
      cronSchedule: string;
      lastRun?: Date;
      nextRun?: Date;
      enabled: boolean;
    }> = [];

    for (const [id, check] of this.scheduledActions) {
      result.push({
        id,
        name: check.action.name,
        actionType: check.action.actionType,
        cronSchedule: check.action.cronSchedule,
        lastRun: check.lastRun,
        nextRun: check.nextRun,
        enabled: check.action.enabled,
      });
    }

    return result;
  }

  private calculateNextRun(cronSchedule: string): Date | null {
    if (!cronSchedule) return null;

    const parts = cronSchedule.split(' ');
    if (parts.length !== 5) {
      this.logger.warn(`Invalid cron expression: ${cronSchedule}`);
      return null;
    }

    const [minute, hour] = parts;
    const now = new Date();
    const next = new Date(now);

    if (minute !== '*' && hour !== '*') {
      const targetHour = parseInt(hour);
      const targetMinute = parseInt(minute);

      next.setHours(targetHour, targetMinute, 0, 0);

      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
    } else {
      next.setHours(next.getHours() + 1);
      next.setMinutes(0);
      next.setSeconds(0);
    }

    return next;
  }
}
