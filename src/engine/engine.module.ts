import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DomainModule } from '../domain/domain.module';
import { AuditModule } from '../audit/audit.module';
import {
  Session,
  Movement,
  Site,
  Decision,
  Payment,
  Permit,
} from '../domain/entities';
import { SessionService } from './services/session.service';
import { RuleEngineService } from './services/rule-engine.service';
import { ReconciliationService } from './services/reconciliation.service';

@Module({
  imports: [
    DomainModule,
    AuditModule, // Provides AuditService
    TypeOrmModule.forFeature([
      Session,
      Movement,
      Site,
      Decision,
      Payment,
      Permit,
    ]),
  ],
  providers: [SessionService, RuleEngineService, ReconciliationService],
  exports: [SessionService, RuleEngineService, ReconciliationService],
})
export class EngineModule {}
