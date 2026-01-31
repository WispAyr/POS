import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Movement } from '../domain/entities';
import { HailoService } from './hailo.service';
import { HailoValidationService } from './hailo-validation.service';
import { ProtectDetectionService } from './protect-detection.service';
import { AnprEnrichmentService } from './anpr-enrichment.service';
import { DetectionAlertService } from './detection-alert.service';
import { AiController } from './ai.controller';
import { PlateReviewModule } from '../plate-review/plate-review.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
    }),
    TypeOrmModule.forFeature([Movement]),
    EventEmitterModule.forRoot(),
    forwardRef(() => PlateReviewModule),
    AuditModule,
  ],
  controllers: [AiController],
  providers: [
    HailoService,
    HailoValidationService,
    ProtectDetectionService,
    AnprEnrichmentService,
    DetectionAlertService,
  ],
  exports: [
    HailoService,
    HailoValidationService,
    ProtectDetectionService,
    AnprEnrichmentService,
    DetectionAlertService,
  ],
})
export class AiModule {}
