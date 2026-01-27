import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DomainModule } from '../domain/domain.module';
import { Session, Movement, Site, Decision, Payment, Permit } from '../domain/entities';
import { SessionService } from './services/session.service';
import { RuleEngineService } from './services/rule-engine.service';

@Module({
    imports: [
        DomainModule,
        TypeOrmModule.forFeature([Session, Movement, Site, Decision, Payment, Permit]),
    ],
    providers: [SessionService, RuleEngineService],
    exports: [SessionService, RuleEngineService],
})
export class EngineModule { }
