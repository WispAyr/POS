import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Payment,
  Permit,
  Session,
  Movement,
  VehicleNote,
  VehicleMarker,
} from '../domain/entities';
import { VrmSearchService } from './vrm-search.service';
import { VrmSearchController } from './vrm-search.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payment,
      Permit,
      Session,
      Movement,
      VehicleNote,
      VehicleMarker,
    ]),
  ],
  controllers: [VrmSearchController],
  providers: [VrmSearchService],
  exports: [VrmSearchService],
})
export class SearchModule {}
