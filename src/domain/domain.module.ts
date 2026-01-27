import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Site, Movement, Session, Decision, AuditLog, Payment, Permit, BuildAudit } from './entities';

@Module({
    imports: [TypeOrmModule.forFeature([Site, Movement, Session, Decision, AuditLog, Payment, Permit, BuildAudit])],
    exports: [TypeOrmModule],
})
export class DomainModule { }
