import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationTemplate } from '../entities/notification-template.entity';
import { NotificationRecipient, RecipientType } from '../entities/notification-recipient.entity';
import { ScheduledNotification } from '../entities/scheduled-notification.entity';
import { NotificationDeliveryLog, DeliveryStatus } from '../entities/notification-delivery-log.entity';
import { CreateTemplateDto, UpdateTemplateDto } from '../dto/create-template.dto';
import { CreateRecipientDto, UpdateRecipientDto } from '../dto/create-recipient.dto';
import {
  CreateScheduledNotificationDto,
  UpdateScheduledNotificationDto,
} from '../dto/create-scheduled-notification.dto';
import { TelegramDeliveryService, TelegramRecipient } from './telegram-delivery.service';

@Injectable()
export class ScheduledNotificationService {
  private readonly logger = new Logger(ScheduledNotificationService.name);

  constructor(
    @InjectRepository(NotificationTemplate)
    private readonly templateRepo: Repository<NotificationTemplate>,
    @InjectRepository(NotificationRecipient)
    private readonly recipientRepo: Repository<NotificationRecipient>,
    @InjectRepository(ScheduledNotification)
    private readonly notificationRepo: Repository<ScheduledNotification>,
    @InjectRepository(NotificationDeliveryLog)
    private readonly deliveryLogRepo: Repository<NotificationDeliveryLog>,
    private readonly telegramDelivery: TelegramDeliveryService,
  ) {}

  // Template CRUD
  async createTemplate(dto: CreateTemplateDto): Promise<NotificationTemplate> {
    const template = this.templateRepo.create({
      name: dto.name,
      description: dto.description,
      body: dto.body,
      variables: dto.variables,
      enabled: dto.enabled ?? true,
    });

    const saved = await this.templateRepo.save(template);
    this.logger.log(`Created template: ${saved.name} (${saved.id})`);
    return saved;
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto): Promise<NotificationTemplate> {
    const template = await this.getTemplateById(id);

    if (dto.name !== undefined) template.name = dto.name;
    if (dto.description !== undefined) template.description = dto.description;
    if (dto.body !== undefined) template.body = dto.body;
    if (dto.variables !== undefined) template.variables = dto.variables;
    if (dto.enabled !== undefined) template.enabled = dto.enabled;

    const saved = await this.templateRepo.save(template);
    this.logger.log(`Updated template: ${saved.name} (${saved.id})`);
    return saved;
  }

  async deleteTemplate(id: string): Promise<void> {
    const template = await this.getTemplateById(id);
    await this.templateRepo.remove(template);
    this.logger.log(`Deleted template: ${template.name} (${id})`);
  }

  async getTemplateById(id: string): Promise<NotificationTemplate> {
    const template = await this.templateRepo.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Template ${id} not found`);
    }
    return template;
  }

  async getAllTemplates(): Promise<NotificationTemplate[]> {
    return this.templateRepo.find({ order: { name: 'ASC' } });
  }

  // Recipient CRUD
  async createRecipient(dto: CreateRecipientDto): Promise<NotificationRecipient> {
    const recipient = this.recipientRepo.create({
      type: dto.type,
      name: dto.name,
      identifier: dto.identifier,
      telegramUsername: dto.telegramUsername,
      enabled: dto.enabled ?? true,
      metadata: dto.metadata,
    });

    const saved = await this.recipientRepo.save(recipient);
    this.logger.log(`Created recipient: ${saved.name} (${saved.id})`);
    return saved;
  }

  async updateRecipient(id: string, dto: UpdateRecipientDto): Promise<NotificationRecipient> {
    const recipient = await this.getRecipientById(id);

    if (dto.type !== undefined) recipient.type = dto.type;
    if (dto.name !== undefined) recipient.name = dto.name;
    if (dto.identifier !== undefined) recipient.identifier = dto.identifier;
    if (dto.telegramUsername !== undefined) recipient.telegramUsername = dto.telegramUsername;
    if (dto.enabled !== undefined) recipient.enabled = dto.enabled;
    if (dto.metadata !== undefined) recipient.metadata = dto.metadata;

    const saved = await this.recipientRepo.save(recipient);
    this.logger.log(`Updated recipient: ${saved.name} (${saved.id})`);
    return saved;
  }

  async deleteRecipient(id: string): Promise<void> {
    const recipient = await this.getRecipientById(id);
    await this.recipientRepo.remove(recipient);
    this.logger.log(`Deleted recipient: ${recipient.name} (${id})`);
  }

  async getRecipientById(id: string): Promise<NotificationRecipient> {
    const recipient = await this.recipientRepo.findOne({ where: { id } });
    if (!recipient) {
      throw new NotFoundException(`Recipient ${id} not found`);
    }
    return recipient;
  }

  async getAllRecipients(): Promise<NotificationRecipient[]> {
    return this.recipientRepo.find({ order: { name: 'ASC' } });
  }

  async getRecipientsByIds(ids: string[]): Promise<NotificationRecipient[]> {
    if (ids.length === 0) return [];
    return this.recipientRepo
      .createQueryBuilder('recipient')
      .where('recipient.id IN (:...ids)', { ids })
      .andWhere('recipient.enabled = :enabled', { enabled: true })
      .getMany();
  }

  async syncTelegramRecipients(): Promise<{ added: number; updated: number }> {
    const telegramRecipients = await this.telegramDelivery.getRecipients();
    let added = 0;
    let updated = 0;

    for (const tgRecipient of telegramRecipients) {
      const existingRecipient = await this.recipientRepo.findOne({
        where: { identifier: tgRecipient.id.toString() },
      });

      if (existingRecipient) {
        // Update existing
        const name = this.getTelegramRecipientName(tgRecipient);
        if (existingRecipient.name !== name || existingRecipient.telegramUsername !== tgRecipient.username) {
          existingRecipient.name = name;
          existingRecipient.telegramUsername = tgRecipient.username ?? null;
          await this.recipientRepo.save(existingRecipient);
          updated++;
        }
      } else {
        // Create new
        const newRecipient = this.recipientRepo.create({
          type: tgRecipient.type === 'group' ? RecipientType.TELEGRAM_GROUP : RecipientType.TELEGRAM_USER,
          name: this.getTelegramRecipientName(tgRecipient),
          identifier: tgRecipient.id.toString(),
          telegramUsername: tgRecipient.username ?? null,
          enabled: true,
          metadata: { syncedFromTelegram: true },
        });
        await this.recipientRepo.save(newRecipient);
        added++;
      }
    }

    this.logger.log(`Telegram sync: ${added} added, ${updated} updated`);
    return { added, updated };
  }

  private getTelegramRecipientName(recipient: TelegramRecipient): string {
    if (recipient.title) return recipient.title;
    if (recipient.firstName) return recipient.firstName;
    if (recipient.username) return `@${recipient.username}`;
    return `Telegram ${recipient.id}`;
  }

  // Scheduled Notification CRUD
  async createNotification(dto: CreateScheduledNotificationDto): Promise<ScheduledNotification> {
    // Validate template exists
    await this.getTemplateById(dto.templateId);

    const notification = this.notificationRepo.create({
      name: dto.name,
      description: dto.description,
      cronSchedule: dto.cronSchedule,
      templateId: dto.templateId,
      recipientIds: dto.recipientIds,
      variableConfig: dto.variableConfig,
      siteId: dto.siteId,
      enabled: dto.enabled ?? true,
      nextRunAt: this.calculateNextRun(dto.cronSchedule),
    });

    const saved = await this.notificationRepo.save(notification);
    this.logger.log(`Created scheduled notification: ${saved.name} (${saved.id})`);
    return saved;
  }

  async updateNotification(
    id: string,
    dto: UpdateScheduledNotificationDto,
  ): Promise<ScheduledNotification> {
    const notification = await this.getNotificationById(id);

    if (dto.name !== undefined) notification.name = dto.name;
    if (dto.description !== undefined) notification.description = dto.description;
    if (dto.cronSchedule !== undefined) {
      notification.cronSchedule = dto.cronSchedule;
      notification.nextRunAt = this.calculateNextRun(dto.cronSchedule);
    }
    if (dto.templateId !== undefined) {
      await this.getTemplateById(dto.templateId);
      notification.templateId = dto.templateId;
    }
    if (dto.recipientIds !== undefined) notification.recipientIds = dto.recipientIds;
    if (dto.variableConfig !== undefined) notification.variableConfig = dto.variableConfig;
    if (dto.siteId !== undefined) notification.siteId = dto.siteId;
    if (dto.enabled !== undefined) notification.enabled = dto.enabled;

    const saved = await this.notificationRepo.save(notification);
    this.logger.log(`Updated scheduled notification: ${saved.name} (${saved.id})`);
    return saved;
  }

  async deleteNotification(id: string): Promise<void> {
    const notification = await this.getNotificationById(id);
    await this.notificationRepo.remove(notification);
    this.logger.log(`Deleted scheduled notification: ${notification.name} (${id})`);
  }

  async getNotificationById(id: string): Promise<ScheduledNotification> {
    const notification = await this.notificationRepo.findOne({
      where: { id },
      relations: ['template'],
    });
    if (!notification) {
      throw new NotFoundException(`Scheduled notification ${id} not found`);
    }
    return notification;
  }

  async getAllNotifications(): Promise<ScheduledNotification[]> {
    return this.notificationRepo.find({
      order: { name: 'ASC' },
      relations: ['template'],
    });
  }

  async getEnabledNotifications(): Promise<ScheduledNotification[]> {
    return this.notificationRepo.find({
      where: { enabled: true },
      relations: ['template'],
    });
  }

  async getDueNotifications(): Promise<ScheduledNotification[]> {
    const now = new Date();
    return this.notificationRepo
      .createQueryBuilder('notification')
      .leftJoinAndSelect('notification.template', 'template')
      .where('notification.enabled = :enabled', { enabled: true })
      .andWhere('notification.nextRunAt <= :now', { now })
      .getMany();
  }

  async updateLastRun(id: string, now: Date): Promise<void> {
    const notification = await this.getNotificationById(id);
    notification.lastRunAt = now;
    notification.nextRunAt = this.calculateNextRun(notification.cronSchedule);
    await this.notificationRepo.save(notification);
  }

  // Delivery Logs
  async createDeliveryLog(
    scheduledNotificationId: string,
    recipientId: string,
    renderedMessage: string,
  ): Promise<NotificationDeliveryLog> {
    const log = this.deliveryLogRepo.create({
      scheduledNotificationId,
      recipientId,
      status: DeliveryStatus.PENDING,
      renderedMessage,
    });
    return this.deliveryLogRepo.save(log);
  }

  async updateDeliveryLogStatus(
    id: string,
    status: DeliveryStatus,
    error?: Record<string, any>,
  ): Promise<void> {
    await this.deliveryLogRepo.update(id, {
      status,
      sentAt: status === DeliveryStatus.SENT ? new Date() : undefined,
      error,
    });
  }

  async getDeliveryHistory(
    notificationId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<{ logs: NotificationDeliveryLog[]; total: number }> {
    const query = this.deliveryLogRepo
      .createQueryBuilder('log')
      .where('log.scheduledNotificationId = :notificationId', { notificationId })
      .orderBy('log.createdAt', 'DESC');

    const total = await query.getCount();

    if (options.limit) {
      query.take(options.limit);
    }
    if (options.offset) {
      query.skip(options.offset);
    }

    const logs = await query.getMany();
    return { logs, total };
  }

  // Cron calculation
  private calculateNextRun(cronSchedule: string): Date | null {
    if (!cronSchedule) return null;

    const parts = cronSchedule.split(' ');
    if (parts.length !== 5) {
      this.logger.warn(`Invalid cron expression: ${cronSchedule}`);
      return null;
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    const now = new Date();
    const next = new Date(now);

    // Handle specific time patterns
    if (minute !== '*' && hour !== '*') {
      const targetHour = parseInt(hour);
      const targetMinute = parseInt(minute);

      next.setHours(targetHour, targetMinute, 0, 0);

      // Handle day of week patterns like 1-5 (Mon-Fri)
      if (dayOfWeek !== '*') {
        const daysOfWeek = this.parseDaysOfWeek(dayOfWeek);
        while (!daysOfWeek.includes(next.getDay()) || next <= now) {
          next.setDate(next.getDate() + 1);
          next.setHours(targetHour, targetMinute, 0, 0);
        }
      } else if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
    } else if (minute.startsWith('*/')) {
      const interval = parseInt(minute.substring(2));
      const currentMinute = now.getMinutes();
      const nextMinute = Math.ceil((currentMinute + 1) / interval) * interval;

      if (nextMinute >= 60) {
        next.setHours(next.getHours() + 1);
        next.setMinutes(nextMinute - 60);
      } else {
        next.setMinutes(nextMinute);
      }
      next.setSeconds(0);
      next.setMilliseconds(0);
    } else if (hour.startsWith('*/')) {
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

  private parseDaysOfWeek(dayOfWeek: string): number[] {
    const days: number[] = [];

    // Handle ranges like 1-5
    if (dayOfWeek.includes('-')) {
      const [start, end] = dayOfWeek.split('-').map(Number);
      for (let i = start; i <= end; i++) {
        days.push(i);
      }
    }
    // Handle lists like 1,3,5
    else if (dayOfWeek.includes(',')) {
      days.push(...dayOfWeek.split(',').map(Number));
    }
    // Single day
    else {
      days.push(parseInt(dayOfWeek));
    }

    return days;
  }
}
