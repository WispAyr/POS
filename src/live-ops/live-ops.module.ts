import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Site } from '../domain/entities';
import { LiveOpsController } from './live-ops.controller';
import { LiveOpsService } from './live-ops.service';

@Module({
  imports: [TypeOrmModule.forFeature([Site])],
  controllers: [LiveOpsController],
  providers: [LiveOpsService],
  exports: [LiveOpsService],
})
export class LiveOpsModule {}
