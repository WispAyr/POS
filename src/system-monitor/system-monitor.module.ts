import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemMonitorService } from './services/system-monitor.service';
import { SystemMonitorSchedulerService } from './services/system-monitor-scheduler.service';
import { SystemMonitorController } from './system-monitor.controller';
import { AlarmModule } from '../alarm/alarm.module';

@Module({
  imports: [AlarmModule],
  controllers: [SystemMonitorController],
  providers: [SystemMonitorService, SystemMonitorSchedulerService],
  exports: [SystemMonitorService],
})
export class SystemMonitorModule {}
