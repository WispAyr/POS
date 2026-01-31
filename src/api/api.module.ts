import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DomainModule } from '../domain/domain.module';
import { Site, Session, Decision, Movement, Permit, Payment, AuditLog } from '../domain/entities';
import { DashboardController } from './dashboard.controller';
import { ImageController } from './image.controller';
import { PermitsController } from './permits.controller';
import { HealthController } from './health.controller';
import { AuditController } from './audit.controller';
import { AiReviewController } from './ai-review.controller';
import { AiReviewQueueController } from './ai-review-queue.controller';
import { BuildController } from './build.controller';
import { MovementsController } from './movements.controller';
import { SitesController } from './sites.controller';
import { IngestionModule } from '../ingestion/ingestion.module';
import { IntegrationModule } from '../integration/integration.module';
import { AuditModule } from '../audit/audit.module';
import { BuildModule } from '../build/build.module';
import { EngineModule } from '../engine/engine.module';

@Module({
  imports: [
    DomainModule,
    IngestionModule,
    IntegrationModule,
    AuditModule,
    BuildModule,
    EngineModule, // Provides ReconciliationService for permit reconciliation
    TypeOrmModule.forFeature([Site, Session, Decision, Movement, Permit, Payment, AuditLog]),
  ],
  controllers: [
    DashboardController,
    ImageController,
    PermitsController,
    HealthController,
    AuditController,
    AiReviewController,
    AiReviewQueueController,
    BuildController,
    MovementsController,
    SitesController,
  ],
})
export class ApiModule {}
