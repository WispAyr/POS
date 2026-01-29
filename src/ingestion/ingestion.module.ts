import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DomainModule } from '../domain/domain.module';
import { Movement, Site, Payment, Permit } from '../domain/entities';
import { EngineModule } from '../engine/engine.module';
import { AuditModule } from '../audit/audit.module';
import { IngestionController } from './ingestion.controller';
import { AnprIngestionService } from './services/anpr-ingestion.service';
import { PaymentIngestionService } from './services/payment-ingestion.service';
import { AnprPollerService } from './services/anpr-poller.service';
import { AnprSyncService } from './services/anpr-sync.service';
import { AnprFolderImportService } from './services/anpr-folder-import.service';
import { PermitIngestionService } from './services/permit-ingestion.service';
import { ImageService } from './services/image.service';
import { AnprPollerController } from './anpr-poller.controller';
import { HttpModule } from '@nestjs/axios';
import { IntegrationModule } from '../integration/integration.module';

@Module({
  imports: [
    DomainModule,
    EngineModule, // Provides ReconciliationService
    AuditModule, // Provides AuditService
    HttpModule,
    ConfigModule,
    forwardRef(() => IntegrationModule),
    TypeOrmModule.forFeature([Movement, Site, Payment, Permit]),
  ],
  controllers: [IngestionController, AnprPollerController],
  providers: [
    AnprIngestionService,
    PaymentIngestionService,
    PermitIngestionService,
    AnprPollerService,
    AnprSyncService,
    AnprFolderImportService,
    ImageService,
  ],
  exports: [
    AnprIngestionService,
    PaymentIngestionService,
    PermitIngestionService,
    AnprSyncService,
    AnprFolderImportService,
    ImageService,
  ],
})
export class IngestionModule {}
