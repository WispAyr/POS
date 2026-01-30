import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Site, Permit } from '../domain/entities';
import { MondayIntegrationService } from './monday-integration.service';
import { QRWhitelistService } from './qr-whitelist.service';
import { MondayController } from './monday.controller';
import { QRWhitelistController } from './qr-whitelist.controller';
import { AuditModule } from '../audit/audit.module';
import { EngineModule } from '../engine/engine.module';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    ScheduleModule.forRoot(), // Initialize Scheduler
    TypeOrmModule.forFeature([Site, Permit]),
    forwardRef(() => AuditModule),
    EngineModule, // Provides ReconciliationService for permit reconciliation
  ],
  controllers: [MondayController, QRWhitelistController],
  providers: [MondayIntegrationService, QRWhitelistService],
  exports: [MondayIntegrationService, QRWhitelistService],
})
export class IntegrationModule {}
