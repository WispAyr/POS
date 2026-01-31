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
  SiteEnforcementRule,
  Site,
  DecisionOutcome,
  Permit,
  Payment,
} from '../domain/entities';
import { EnforcementController } from './enforcement.controller';
import { EnforcementService } from './services/enforcement.service';
import { SiteEnforcementRulesController } from './site-enforcement-rules.controller';
import { SiteEnforcementRulesService } from './services/site-enforcement-rules.service';

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
      SiteEnforcementRule,
      Site,
      Permit,
      Payment,
    ]),
  ],
  controllers: [EnforcementController, SiteEnforcementRulesController],
  providers: [EnforcementService, SiteEnforcementRulesService],
  exports: [EnforcementService, SiteEnforcementRulesService],
})
export class EnforcementModule {}
