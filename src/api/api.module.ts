import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DomainModule } from '../domain/domain.module';
import { Site, Session, Decision, Movement, Permit } from '../domain/entities';
import { DashboardController } from './dashboard.controller';
import { ImageController } from './image.controller';
import { PermitsController } from './permits.controller';
import { HealthController } from './health.controller';
import { IngestionModule } from '../ingestion/ingestion.module';

@Module({
    imports: [
        DomainModule,
        IngestionModule,
        TypeOrmModule.forFeature([Site, Session, Decision, Movement, Permit]),
    ],
    controllers: [DashboardController, ImageController, PermitsController, HealthController],
})
export class ApiModule { }
