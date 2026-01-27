import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Site, Movement, Session, Decision, AuditLog, Payment, Permit } from './entities';

@Module({
    imports: [TypeOrmModule.forFeature([Site, Movement, Session, Decision, AuditLog, Payment, Permit])],
    exports: [TypeOrmModule],
})
export class DomainModule { }
