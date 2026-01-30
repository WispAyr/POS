import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Site, Payment, Permit } from '../domain/entities';
import { CustomerExportLog } from '../domain/entities/customer-export-log.entity';
import { CustomerExportController } from './customer-export.controller';
import { CustomerExportService } from './services/customer-export.service';
import { CustomerExportSchedulerService } from './services/customer-export-scheduler.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Site, Payment, Permit, CustomerExportLog]),
    ScheduleModule.forRoot(),
  ],
  controllers: [CustomerExportController],
  providers: [CustomerExportService, CustomerExportSchedulerService],
  exports: [CustomerExportService],
})
export class CustomerExportModule {}
