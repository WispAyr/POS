import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DomainModule } from '../domain/domain.module';
import { AuditModule } from '../audit/audit.module';
import { EngineModule } from '../engine/engine.module';
import {
  Decision,
  Session,
  Movement,
  VehicleNote,
  VehicleMarker,
} from '../domain/entities';
import { EnforcementController } from './enforcement.controller';
import { EnforcementService } from './services/enforcement.service';

@Module({
  imports: [
    DomainModule,
    AuditModule, // Provides AuditService
    EngineModule, // Provides EnforcementReevaluationService
    TypeOrmModule.forFeature([
      Decision,
      Session,
      Movement,
      VehicleNote,
      VehicleMarker,
    ]),
  ],
  controllers: [EnforcementController],
  providers: [EnforcementService],
  exports: [EnforcementService],
})
export class EnforcementModule {}
