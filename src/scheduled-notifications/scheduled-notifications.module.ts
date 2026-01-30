import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import {
  NotificationRecipient,
  NotificationTemplate,
  ScheduledNotification,
  ScheduledAction,
  NotificationDeliveryLog,
} from './entities';
import {
  Decision,
  Movement,
  Alarm,
} from '../domain/entities';
import { PlateReview } from '../domain/entities/plate-review.entity';
import { MetricsCollectorService } from './services/metrics-collector.service';
import { TemplateRendererService } from './services/template-renderer.service';
import { TelegramDeliveryService } from './services/telegram-delivery.service';
import { ScheduledNotificationService } from './services/scheduled-notification.service';
import { NotificationSchedulerService } from './services/notification-scheduler.service';
import { ScheduledActionService } from './services/scheduled-action.service';
import { ScheduledNotificationsController } from './scheduled-notifications.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      // Module entities
      NotificationRecipient,
      NotificationTemplate,
      ScheduledNotification,
      ScheduledAction,
      NotificationDeliveryLog,
      // Domain entities for metrics
      Decision,
      Movement,
      Alarm,
      PlateReview,
    ]),
    ScheduleModule.forRoot(),
    ConfigModule,
  ],
  controllers: [ScheduledNotificationsController],
  providers: [
    MetricsCollectorService,
    TemplateRendererService,
    TelegramDeliveryService,
    ScheduledNotificationService,
    NotificationSchedulerService,
    ScheduledActionService,
  ],
  exports: [
    ScheduledNotificationService,
    NotificationSchedulerService,
    TelegramDeliveryService,
    MetricsCollectorService,
  ],
})
export class ScheduledNotificationsModule {}
