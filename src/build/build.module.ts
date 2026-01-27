import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BuildAudit } from '../domain/entities/build-audit.entity';
import { BuildService } from './build.service';

@Module({
  imports: [TypeOrmModule.forFeature([BuildAudit])],
  providers: [BuildService],
  exports: [BuildService],
})
export class BuildModule {}
