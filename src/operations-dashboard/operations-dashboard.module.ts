import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Site, Movement, Decision, Alarm } from '../domain/entities';
import { OperationsDashboardController } from './operations-dashboard.controller';
import { OperationsDashboardService } from './operations-dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([Site, Movement, Decision, Alarm])],
  controllers: [OperationsDashboardController],
  providers: [OperationsDashboardService],
  exports: [OperationsDashboardService],
})
export class OperationsDashboardModule {}
