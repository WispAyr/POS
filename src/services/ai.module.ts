import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Movement } from '../domain/entities';
import { HailoService } from './hailo.service';
import { ProtectDetectionService } from './protect-detection.service';
import { AnprEnrichmentService } from './anpr-enrichment.service';
import { DetectionAlertService } from './detection-alert.service';
import { AiController } from './ai.controller';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
    }),
    TypeOrmModule.forFeature([Movement]),
    EventEmitterModule.forRoot(),
  ],
  controllers: [AiController],
  providers: [
    HailoService,
    ProtectDetectionService,
    AnprEnrichmentService,
    DetectionAlertService,
  ],
  exports: [
    HailoService,
    ProtectDetectionService,
    AnprEnrichmentService,
    DetectionAlertService,
  ],
})
export class AiModule {}
