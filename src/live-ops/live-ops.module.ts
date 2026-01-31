import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Site, Movement } from '../domain/entities';
import { LiveOpsController } from './live-ops.controller';
import { LiveOpsService } from './live-ops.service';
import { VehicleActivityController } from './vehicle-activity.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Site, Movement])],
  controllers: [LiveOpsController, VehicleActivityController],
  providers: [LiveOpsService],
  exports: [LiveOpsService],
})
export class LiveOpsModule {}
