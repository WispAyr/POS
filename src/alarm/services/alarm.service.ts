import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan, MoreThan } from 'typeorm';
import {
  AlarmDefinition,
  Alarm,
  AlarmNotification,
} from '../../domain/entities';
import {
  AlarmStatus,
  AlarmSeverity,
  NotificationChannel,
  NotificationStatus,
} from '../../domain/entities/alarm.enums';
import { CreateAlarmDefinitionDto } from '../dto/create-alarm-definition.dto';
import { UpdateAlarmDefinitionDto } from '../dto/update-alarm-definition.dto';

@Injectable()
export class AlarmService {
  private readonly logger = new Logger(AlarmService.name);

  constructor(
    @InjectRepository(AlarmDefinition)
    private readonly definitionRepo: Repository<AlarmDefinition>,
    @InjectRepository(Alarm)
    private readonly alarmRepo: Repository<Alarm>,
    @InjectRepository(AlarmNotification)
    private readonly notificationRepo: Repository<AlarmNotification>,
  ) {}

  // Definition CRUD
  async createDefinition(dto: CreateAlarmDefinitionDto): Promise<AlarmDefinition> {
    const definition = this.definitionRepo.create({
      name: dto.name,
      description: dto.description,
      type: dto.type,
      severity: dto.severity || AlarmSeverity.WARNING,
      siteId: dto.siteId,
      conditions: dto.conditions,
      cronSchedule: dto.cronSchedule,
      enabled: dto.enabled ?? true,
      notificationChannels: dto.notificationChannels || [NotificationChannel.IN_APP],
    });

    const saved = await this.definitionRepo.save(definition);
    this.logger.log(`Created alarm definition: ${saved.name} (${saved.id})`);
    return saved;
  }

  async updateDefinition(
    id: string,
    dto: UpdateAlarmDefinitionDto,
  ): Promise<AlarmDefinition> {
    const definition = await this.getDefinitionById(id);

    if (dto.name !== undefined) definition.name = dto.name;
    if (dto.description !== undefined) definition.description = dto.description;
    if (dto.type !== undefined) definition.type = dto.type;
    if (dto.severity !== undefined) definition.severity = dto.severity;
    if (dto.siteId !== undefined) definition.siteId = dto.siteId;
    if (dto.conditions !== undefined) definition.conditions = dto.conditions;
    if (dto.cronSchedule !== undefined) definition.cronSchedule = dto.cronSchedule;
    if (dto.enabled !== undefined) definition.enabled = dto.enabled;
    if (dto.notificationChannels !== undefined) {
      definition.notificationChannels = dto.notificationChannels;
    }

    const saved = await this.definitionRepo.save(definition);
    this.logger.log(`Updated alarm definition: ${saved.name} (${saved.id})`);
    return saved;
  }

  async deleteDefinition(id: string): Promise<void> {
    const definition = await this.getDefinitionById(id);
    await this.definitionRepo.remove(definition);
    this.logger.log(`Deleted alarm definition: ${definition.name} (${id})`);
  }

  async getDefinitionById(id: string): Promise<AlarmDefinition> {
    const definition = await this.definitionRepo.findOne({ where: { id } });
    if (!definition) {
      throw new NotFoundException(`Alarm definition ${id} not found`);
    }
    return definition;
  }

  async getAllDefinitions(): Promise<AlarmDefinition[]> {
    return this.definitionRepo.find({
      order: { name: 'ASC' },
    });
  }

  async getEnabledDefinitions(): Promise<AlarmDefinition[]> {
    return this.definitionRepo.find({
      where: { enabled: true },
      order: { name: 'ASC' },
    });
  }

  async getScheduledDefinitions(): Promise<AlarmDefinition[]> {
    return this.definitionRepo
      .createQueryBuilder('def')
      .where('def.enabled = :enabled', { enabled: true })
      .andWhere('def.cronSchedule IS NOT NULL')
      .getMany();
  }

  // Alarm operations
  async triggerAlarm(
    definition: AlarmDefinition,
    message: string,
    details?: any,
    siteId?: string,
  ): Promise<Alarm> {
    // Check if there's already an active alarm for this definition
    const existingAlarm = await this.alarmRepo.findOne({
      where: {
        definitionId: definition.id,
        status: In([AlarmStatus.TRIGGERED, AlarmStatus.ACKNOWLEDGED]),
      },
    });

    if (existingAlarm) {
      this.logger.debug(
        `Active alarm already exists for definition ${definition.id}`,
      );
      return existingAlarm;
    }

    const alarm = this.alarmRepo.create({
      definitionId: definition.id,
      status: AlarmStatus.TRIGGERED,
      severity: definition.severity,
      siteId: siteId ?? definition.siteId ?? null,
      message,
      details,
      triggeredAt: new Date(),
    });

    const saved = await this.alarmRepo.save(alarm);
    this.logger.warn(
      `Alarm triggered: ${definition.name} - ${message} (${saved.id})`,
    );

    // Create notifications
    await this.createNotifications(saved, definition.notificationChannels);

    return saved;
  }

  async triggerEventAlarm(
    definitionType: string,
    message: string,
    details?: any,
    siteId?: string,
  ): Promise<Alarm | null> {
    // Find event-based definition (no cronSchedule)
    const definition = await this.definitionRepo.findOne({
      where: {
        type: definitionType as any,
        enabled: true,
        cronSchedule: null as any,
      },
    });

    if (!definition) {
      this.logger.debug(`No event-based definition found for type: ${definitionType}`);
      return null;
    }

    return this.triggerAlarm(definition, message, details, siteId);
  }

  async acknowledgeAlarm(
    id: string,
    acknowledgedBy: string,
    notes?: string,
  ): Promise<Alarm> {
    const alarm = await this.getAlarmById(id);

    if (alarm.status !== AlarmStatus.TRIGGERED) {
      throw new Error(`Alarm ${id} is not in TRIGGERED status`);
    }

    alarm.status = AlarmStatus.ACKNOWLEDGED;
    alarm.acknowledgedAt = new Date();
    alarm.acknowledgedBy = acknowledgedBy;
    alarm.acknowledgeNotes = notes ?? null;

    const saved = await this.alarmRepo.save(alarm);
    this.logger.log(`Alarm acknowledged: ${id} by ${acknowledgedBy}`);
    return saved;
  }

  async resolveAlarm(
    id: string,
    resolvedBy: string,
    notes?: string,
  ): Promise<Alarm> {
    const alarm = await this.getAlarmById(id);

    if (alarm.status === AlarmStatus.RESOLVED) {
      throw new Error(`Alarm ${id} is already resolved`);
    }

    alarm.status = AlarmStatus.RESOLVED;
    alarm.resolvedAt = new Date();
    alarm.resolvedBy = resolvedBy;
    alarm.resolveNotes = notes ?? null;

    const saved = await this.alarmRepo.save(alarm);
    this.logger.log(`Alarm resolved: ${id} by ${resolvedBy}`);
    return saved;
  }

  async getAlarmById(id: string): Promise<Alarm> {
    const alarm = await this.alarmRepo.findOne({
      where: { id },
      relations: ['definition'],
    });
    if (!alarm) {
      throw new NotFoundException(`Alarm ${id} not found`);
    }
    return alarm;
  }

  async getActiveAlarms(siteId?: string): Promise<Alarm[]> {
    const query = this.alarmRepo
      .createQueryBuilder('alarm')
      .leftJoinAndSelect('alarm.definition', 'definition')
      .where('alarm.status IN (:...statuses)', {
        statuses: [AlarmStatus.TRIGGERED, AlarmStatus.ACKNOWLEDGED],
      })
      .orderBy('alarm.triggeredAt', 'DESC');

    if (siteId) {
      query.andWhere('(alarm.siteId = :siteId OR alarm.siteId IS NULL)', {
        siteId,
      });
    }

    return query.getMany();
  }

  async getAlarmHistory(
    options: {
      siteId?: string;
      status?: AlarmStatus;
      severity?: AlarmSeverity;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ alarms: Alarm[]; total: number }> {
    const query = this.alarmRepo
      .createQueryBuilder('alarm')
      .leftJoinAndSelect('alarm.definition', 'definition');

    if (options.siteId) {
      query.andWhere('(alarm.siteId = :siteId OR alarm.siteId IS NULL)', {
        siteId: options.siteId,
      });
    }

    if (options.status) {
      query.andWhere('alarm.status = :status', { status: options.status });
    }

    if (options.severity) {
      query.andWhere('alarm.severity = :severity', { severity: options.severity });
    }

    if (options.startDate) {
      query.andWhere('alarm.triggeredAt >= :startDate', {
        startDate: options.startDate,
      });
    }

    if (options.endDate) {
      query.andWhere('alarm.triggeredAt <= :endDate', {
        endDate: options.endDate,
      });
    }

    query.orderBy('alarm.triggeredAt', 'DESC');

    const total = await query.getCount();

    if (options.limit) {
      query.take(options.limit);
    }

    if (options.offset) {
      query.skip(options.offset);
    }

    const alarms = await query.getMany();

    return { alarms, total };
  }

  async getAlarmStats(): Promise<{
    total: number;
    triggered: number;
    acknowledged: number;
    resolved: number;
    bySeverity: { [key: string]: number };
    byType: { [key: string]: number };
  }> {
    const [triggered, acknowledged, resolved] = await Promise.all([
      this.alarmRepo.count({ where: { status: AlarmStatus.TRIGGERED } }),
      this.alarmRepo.count({ where: { status: AlarmStatus.ACKNOWLEDGED } }),
      this.alarmRepo.count({ where: { status: AlarmStatus.RESOLVED } }),
    ]);

    const bySeverity = await this.alarmRepo
      .createQueryBuilder('alarm')
      .select('alarm.severity', 'severity')
      .addSelect('COUNT(*)', 'count')
      .where('alarm.status IN (:...statuses)', {
        statuses: [AlarmStatus.TRIGGERED, AlarmStatus.ACKNOWLEDGED],
      })
      .groupBy('alarm.severity')
      .getRawMany();

    const byType = await this.alarmRepo
      .createQueryBuilder('alarm')
      .leftJoin('alarm.definition', 'definition')
      .select('definition.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .where('alarm.status IN (:...statuses)', {
        statuses: [AlarmStatus.TRIGGERED, AlarmStatus.ACKNOWLEDGED],
      })
      .groupBy('definition.type')
      .getRawMany();

    const severityMap: { [key: string]: number } = {};
    bySeverity.forEach((row) => {
      severityMap[row.severity] = parseInt(row.count);
    });

    const typeMap: { [key: string]: number } = {};
    byType.forEach((row) => {
      typeMap[row.type] = parseInt(row.count);
    });

    return {
      total: triggered + acknowledged,
      triggered,
      acknowledged,
      resolved,
      bySeverity: severityMap,
      byType: typeMap,
    };
  }

  // Notification methods
  private async createNotifications(
    alarm: Alarm,
    channels: NotificationChannel[],
  ): Promise<void> {
    for (const channel of channels) {
      const notification = this.notificationRepo.create({
        alarmId: alarm.id,
        channel,
        status: NotificationStatus.PENDING,
      });

      await this.notificationRepo.save(notification);

      // For IN_APP, mark as sent immediately
      if (channel === NotificationChannel.IN_APP) {
        await this.notificationRepo.update(notification.id, {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
        });
      }
    }
  }

  async getUnreadNotifications(userId?: string): Promise<AlarmNotification[]> {
    const query = this.notificationRepo
      .createQueryBuilder('notification')
      .leftJoinAndSelect('notification.alarm', 'alarm')
      .leftJoinAndSelect('alarm.definition', 'definition')
      .where('notification.channel = :channel', {
        channel: NotificationChannel.IN_APP,
      })
      .andWhere('notification.status IN (:...statuses)', {
        statuses: [NotificationStatus.SENT],
      })
      .andWhere('notification.readAt IS NULL')
      .orderBy('notification.createdAt', 'DESC');

    if (userId) {
      query.andWhere(
        '(notification.userId = :userId OR notification.userId IS NULL)',
        { userId },
      );
    }

    return query.getMany();
  }

  async getUnreadCount(userId?: string): Promise<number> {
    const query = this.notificationRepo
      .createQueryBuilder('notification')
      .where('notification.channel = :channel', {
        channel: NotificationChannel.IN_APP,
      })
      .andWhere('notification.status = :status', {
        status: NotificationStatus.SENT,
      })
      .andWhere('notification.readAt IS NULL');

    if (userId) {
      query.andWhere(
        '(notification.userId = :userId OR notification.userId IS NULL)',
        { userId },
      );
    }

    return query.getCount();
  }

  async markNotificationAsRead(id: string): Promise<AlarmNotification> {
    const notification = await this.notificationRepo.findOne({ where: { id } });
    if (!notification) {
      throw new NotFoundException(`Notification ${id} not found`);
    }

    notification.status = NotificationStatus.READ;
    notification.readAt = new Date();

    return this.notificationRepo.save(notification);
  }

  async markAllNotificationsAsRead(userId?: string): Promise<void> {
    const query = this.notificationRepo
      .createQueryBuilder()
      .update()
      .set({ status: NotificationStatus.READ, readAt: new Date() })
      .where('channel = :channel', { channel: NotificationChannel.IN_APP })
      .andWhere('status = :status', { status: NotificationStatus.SENT })
      .andWhere('readAt IS NULL');

    if (userId) {
      query.andWhere('(userId = :userId OR userId IS NULL)', { userId });
    }

    await query.execute();
  }
}
