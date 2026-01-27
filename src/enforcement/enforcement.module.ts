import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DomainModule } from '../domain/domain.module';
import { AuditModule } from '../audit/audit.module';
import { Decision } from '../domain/entities';
import { EnforcementController } from './enforcement.controller';
import { EnforcementService } from './services/enforcement.service';

@Module({
    imports: [
        DomainModule,
        AuditModule, // Provides AuditService
        TypeOrmModule.forFeature([Decision]),
    ],
    controllers: [EnforcementController],
    providers: [EnforcementService],
    exports: [EnforcementService],
})
export class EnforcementModule { }
