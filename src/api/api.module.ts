import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DomainModule } from '../domain/domain.module';
import { Site, Session, Decision, Movement } from '../domain/entities';
import { DashboardController } from './dashboard.controller';
import { ImageController } from './image.controller';
import { IngestionModule } from '../ingestion/ingestion.module';

@Module({
    imports: [
        DomainModule,
        IngestionModule,
        TypeOrmModule.forFeature([Site, Session, Decision, Movement]),
    ],
    controllers: [DashboardController, ImageController],
})
export class ApiModule { }
