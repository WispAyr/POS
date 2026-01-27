import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Site, Permit } from '../domain/entities';
import { MondayIntegrationService } from './monday-integration.service';

import { MondayController } from './monday.controller';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    ScheduleModule.forRoot(), // Initialize Scheduler
    TypeOrmModule.forFeature([Site, Permit]),
  ],
  controllers: [MondayController],
  providers: [MondayIntegrationService],
  exports: [MondayIntegrationService],
})
export class IntegrationModule {}
