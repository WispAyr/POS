import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import {
  AlarmDefinition,
  Alarm,
  AlarmNotification,
  Payment,
  Movement,
  Decision,
} from '../domain/entities';
import { AlarmService } from './services/alarm.service';
import { AlarmCheckerService } from './services/alarm-checker.service';
import { AlarmSchedulerService } from './services/alarm-scheduler.service';
import { AlarmNotificationService } from './services/alarm-notification.service';
import { AlarmActionService } from './services/alarm-action.service';
import { AlarmController } from './alarm.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AlarmDefinition,
      Alarm,
      AlarmNotification,
      Payment,
      Movement,
      Decision,
    ]),
    ScheduleModule.forRoot(),
    HttpModule.register({ timeout: 30000 }),
  ],
  controllers: [AlarmController],
  providers: [
    AlarmService,
    AlarmCheckerService,
    AlarmSchedulerService,
    AlarmNotificationService,
    AlarmActionService,
  ],
  exports: [AlarmService, AlarmCheckerService, AlarmActionService],
})
export class AlarmModule {}
