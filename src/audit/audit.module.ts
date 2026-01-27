import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog, Movement, Session, Decision, Payment, Permit } from '../domain/entities';
import { AuditService } from './audit.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([AuditLog, Movement, Session, Decision, Payment, Permit]),
    ],
    providers: [AuditService],
    exports: [AuditService],
})
export class AuditModule { }
