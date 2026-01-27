import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DomainModule } from '../domain/domain.module';
import { Decision, AuditLog } from '../domain/entities';
import { EnforcementController } from './enforcement.controller';
import { EnforcementService } from './services/enforcement.service';

@Module({
    imports: [
        DomainModule,
        TypeOrmModule.forFeature([Decision, AuditLog]),
    ],
    controllers: [EnforcementController],
    providers: [EnforcementService],
    exports: [EnforcementService],
})
export class EnforcementModule { }
