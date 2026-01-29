import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Site,
  Movement,
  Session,
  Decision,
  AuditLog,
  Payment,
  Permit,
  BuildAudit,
  VehicleNote,
  VehicleMarker,
  PaymentProvider,
  PaymentProviderSite,
  PaymentIngestionLog,
  AlarmDefinition,
  Alarm,
  AlarmNotification,
} from './entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Site,
      Movement,
      Session,
      Decision,
      AuditLog,
      Payment,
      Permit,
      BuildAudit,
      VehicleNote,
      VehicleMarker,
      PaymentProvider,
      PaymentProviderSite,
      PaymentIngestionLog,
      AlarmDefinition,
      Alarm,
      AlarmNotification,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DomainModule {}
