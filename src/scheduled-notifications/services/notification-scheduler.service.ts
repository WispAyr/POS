import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScheduledNotificationService } from './scheduled-notification.service';
import { TemplateRendererService } from './template-renderer.service';
import { TelegramDeliveryService } from './telegram-delivery.service';
import { ScheduledNotification } from '../entities/scheduled-notification.entity';
import { DeliveryStatus } from '../entities/notification-delivery-log.entity';
import { RecipientType } from '../entities/notification-recipient.entity';

interface ScheduledCheck {
  notification: ScheduledNotification;
  lastRun?: Date;
  nextRun?: Date;
}

@Injectable()
export class NotificationSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(NotificationSchedulerService.name);
  private scheduledNotifications: Map<string, ScheduledCheck> = new Map();

  constructor(
    private readonly notificationService: ScheduledNotificationService,
    private readonly templateRenderer: TemplateRendererService,
    private readonly telegramDelivery: TelegramDeliveryService,
  ) {}

  async onModuleInit() {
    await this.refreshScheduledNotifications();
  }

  async refreshScheduledNotifications(): Promise<void> {
    const notifications = await this.notificationService.getEnabledNotifications();
    this.scheduledNotifications.clear();

    for (const notification of notifications) {
      this.scheduledNotifications.set(notification.id, {
        notification,
        nextRun: notification.nextRunAt ?? undefined,
      });
    }

    this.logger.log(
      `Loaded ${this.scheduledNotifications.size} scheduled notifications`,
    );
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async checkScheduledNotifications(): Promise<void> {
    const now = new Date();

    for (const [id, check] of this.scheduledNotifications) {
      if (check.nextRun && check.nextRun <= now) {
        try {
          this.logger.debug(`Running scheduled notification: ${check.notification.name}`);
          await this.executeNotification(check.notification);

          // Update last run and calculate next run
          check.lastRun = now;
          await this.notificationService.updateLastRun(id, now);

          // Refresh to get updated nextRunAt
          const updated = await this.notificationService.getNotificationById(id);
          check.nextRun = updated.nextRunAt ?? undefined;
        } catch (err: any) {
          this.logger.error(
            `Failed to execute notification ${check.notification.name}: ${err.message}`,
            err.stack,
          );
        }
      }
    }
  }

  async executeNotification(notification: ScheduledNotification): Promise<void> {
    const { template, recipientIds, variableConfig, siteId } = notification;

    if (!template) {
      this.logger.error(`Template not found for notification: ${notification.name}`);
      return;
    }

    // Render the message
    const renderedMessage = await this.templateRenderer.renderTemplate(
      template.body,
      variableConfig,
      siteId ?? undefined,
    );

    // Get enabled recipients
    const recipients = await this.notificationService.getRecipientsByIds(recipientIds);

    if (recipients.length === 0) {
      this.logger.warn(`No enabled recipients for notification: ${notification.name}`);
      return;
    }

    // Send to each recipient
    for (const recipient of recipients) {
      // Create delivery log
      const log = await this.notificationService.createDeliveryLog(
        notification.id,
        recipient.id,
        renderedMessage,
      );

      // Only send to Telegram recipients for now
      if (
        recipient.type === RecipientType.TELEGRAM_USER ||
        recipient.type === RecipientType.TELEGRAM_GROUP
      ) {
        const result = await this.telegramDelivery.sendMessage(
          recipient.identifier,
          renderedMessage,
        );

        if (result.success) {
          await this.notificationService.updateDeliveryLogStatus(
            log.id,
            DeliveryStatus.SENT,
          );
          this.logger.log(
            `Sent notification "${notification.name}" to ${recipient.name}`,
          );
        } else {
          await this.notificationService.updateDeliveryLogStatus(
            log.id,
            DeliveryStatus.FAILED,
            { error: result.error },
          );
          this.logger.error(
            `Failed to send notification "${notification.name}" to ${recipient.name}: ${result.error}`,
          );
        }
      } else if (recipient.type === RecipientType.EMAIL) {
        // Email delivery not yet implemented
        this.logger.warn(`Email delivery not implemented for recipient: ${recipient.name}`);
        await this.notificationService.updateDeliveryLogStatus(
          log.id,
          DeliveryStatus.FAILED,
          { error: 'Email delivery not implemented' },
        );
      }
    }
  }

  async runManualNotification(notificationId: string): Promise<{
    success: boolean;
    recipientCount: number;
    message: string;
  }> {
    const notification = await this.notificationService.getNotificationById(notificationId);

    try {
      await this.executeNotification(notification);
      const recipients = await this.notificationService.getRecipientsByIds(
        notification.recipientIds,
      );

      return {
        success: true,
        recipientCount: recipients.length,
        message: `Notification sent to ${recipients.length} recipient(s)`,
      };
    } catch (err: any) {
      return {
        success: false,
        recipientCount: 0,
        message: err.message,
      };
    }
  }

  getScheduledNotifications(): Array<{
    id: string;
    name: string;
    cronSchedule: string;
    lastRun?: Date;
    nextRun?: Date;
    enabled: boolean;
  }> {
    const result: Array<{
      id: string;
      name: string;
      cronSchedule: string;
      lastRun?: Date;
      nextRun?: Date;
      enabled: boolean;
    }> = [];

    for (const [id, check] of this.scheduledNotifications) {
      result.push({
        id,
        name: check.notification.name,
        cronSchedule: check.notification.cronSchedule,
        lastRun: check.lastRun,
        nextRun: check.nextRun,
        enabled: check.notification.enabled,
      });
    }

    return result;
  }
}
