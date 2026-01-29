import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alarm, AlarmNotification } from '../../domain/entities';
import {
  NotificationChannel,
  NotificationStatus,
} from '../../domain/entities/alarm.enums';

@Injectable()
export class AlarmNotificationService {
  private readonly logger = new Logger(AlarmNotificationService.name);

  constructor(
    @InjectRepository(AlarmNotification)
    private readonly notificationRepo: Repository<AlarmNotification>,
  ) {}

  async sendNotification(
    alarm: Alarm,
    channel: NotificationChannel,
    recipient?: string,
    userId?: string,
  ): Promise<AlarmNotification> {
    const notification = this.notificationRepo.create({
      alarmId: alarm.id,
      channel,
      userId,
      recipient,
      status: NotificationStatus.PENDING,
    });

    const saved = await this.notificationRepo.save(notification);

    // Process based on channel
    switch (channel) {
      case NotificationChannel.IN_APP:
        await this.sendInAppNotification(saved, alarm);
        break;
      case NotificationChannel.EMAIL:
        await this.sendEmailNotification(saved, alarm);
        break;
      case NotificationChannel.SMS:
        await this.sendSmsNotification(saved, alarm);
        break;
    }

    return saved;
  }

  private async sendInAppNotification(
    notification: AlarmNotification,
    alarm: Alarm,
  ): Promise<void> {
    // IN_APP notifications are marked as sent immediately
    // They'll be displayed in the notification bell
    await this.notificationRepo.update(notification.id, {
      status: NotificationStatus.SENT,
      sentAt: new Date(),
    });
    this.logger.debug(`In-app notification created for alarm ${alarm.id}`);
  }

  private async sendEmailNotification(
    notification: AlarmNotification,
    alarm: Alarm,
  ): Promise<void> {
    // Email notification - placeholder for future implementation
    // Would integrate with email service (SendGrid, AWS SES, etc.)

    if (!notification.recipient) {
      this.logger.warn(
        `Email notification ${notification.id} has no recipient`,
      );
      notification.status = NotificationStatus.FAILED;
      notification.metadata = { error: 'No recipient specified' };
      await this.notificationRepo.save(notification);
      return;
    }

    try {
      // TODO: Implement email sending
      // await this.emailService.send({
      //   to: notification.recipient,
      //   subject: `[${alarm.severity}] ${alarm.message}`,
      //   body: this.formatEmailBody(alarm),
      // });

      this.logger.log(
        `Email notification queued for ${notification.recipient}`,
      );

      // For now, mark as sent (placeholder)
      await this.notificationRepo.update(notification.id, {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
      });
    } catch (err: any) {
      this.logger.error(
        `Failed to send email notification: ${err.message}`,
      );
      notification.status = NotificationStatus.FAILED;
      notification.metadata = { error: err.message };
      await this.notificationRepo.save(notification);
    }
  }

  private async sendSmsNotification(
    notification: AlarmNotification,
    alarm: Alarm,
  ): Promise<void> {
    // SMS notification - placeholder for future implementation
    // Would integrate with SMS service (Twilio, etc.)

    if (!notification.recipient) {
      this.logger.warn(
        `SMS notification ${notification.id} has no recipient`,
      );
      notification.status = NotificationStatus.FAILED;
      notification.metadata = { error: 'No recipient specified' };
      await this.notificationRepo.save(notification);
      return;
    }

    try {
      // TODO: Implement SMS sending
      // await this.smsService.send({
      //   to: notification.recipient,
      //   message: `[${alarm.severity}] ${alarm.message}`,
      // });

      this.logger.log(`SMS notification queued for ${notification.recipient}`);

      // For now, mark as sent (placeholder)
      await this.notificationRepo.update(notification.id, {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
      });
    } catch (err: any) {
      this.logger.error(`Failed to send SMS notification: ${err.message}`);
      notification.status = NotificationStatus.FAILED;
      notification.metadata = { error: err.message };
      await this.notificationRepo.save(notification);
    }
  }

  async retryFailedNotifications(): Promise<number> {
    const failed = await this.notificationRepo.find({
      where: { status: NotificationStatus.FAILED },
      relations: ['alarm'],
    });

    let retried = 0;
    for (const notification of failed) {
      try {
        await this.sendNotification(
          notification.alarm,
          notification.channel,
          notification.recipient,
          notification.userId,
        );
        retried++;
      } catch (err: any) {
        this.logger.error(
          `Failed to retry notification ${notification.id}: ${err.message}`,
        );
      }
    }

    return retried;
  }

  async getPendingNotifications(): Promise<AlarmNotification[]> {
    return this.notificationRepo.find({
      where: { status: NotificationStatus.PENDING },
      relations: ['alarm'],
    });
  }
}
