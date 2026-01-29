import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlateReview } from '../domain/entities/plate-review.entity';
import { PlateValidationRule } from '../domain/entities/plate-validation-rule.entity';
import { Movement } from '../domain/entities/movement.entity';
import { PlateReviewController } from './plate-review.controller';
import { PlateReviewService } from './services/plate-review.service';
import { PlateValidationService } from './services/plate-validation.service';
import { AuditModule } from '../audit/audit.module';
import { EngineModule } from '../engine/engine.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlateReview, PlateValidationRule, Movement]),
    AuditModule,
    EngineModule,
  ],
  controllers: [PlateReviewController],
  providers: [PlateReviewService, PlateValidationService],
  exports: [PlateReviewService, PlateValidationService],
})
export class PlateReviewModule {}
