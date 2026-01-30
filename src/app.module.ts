import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DomainModule } from './domain/domain.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { EngineModule } from './engine/engine.module';
import { EnforcementModule } from './enforcement/enforcement.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { ApiModule } from './api/api.module';
import { IntegrationModule } from './integration/integration.module';
import { AuditModule } from './audit/audit.module';
import { BuildModule } from './build/build.module';
import { PaymentModule } from './payment/payment.module';
import { CommonModule } from './common/common.module';
import { PlateReviewModule } from './plate-review/plate-review.module';
import { PaymentProviderModule } from './payment-provider/payment-provider.module';
import { AlarmModule } from './alarm/alarm.module';
import { CustomerExportModule } from './customer-export/customer-export.module';
import { SearchModule } from './search/search.module';
import { SystemMonitorModule } from './system-monitor/system-monitor.module';
import { OperationsDashboardModule } from './operations-dashboard/operations-dashboard.module';
import { ScheduledNotificationsModule } from './scheduled-notifications/scheduled-notifications.module';
import { LiveOpsModule } from './live-ops/live-ops.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME', 'pos_user'),
        password: configService.get<string>('DB_PASSWORD', 'pos_pass'),
        database: configService.get<string>('DB_DATABASE', 'pos_db'),
        autoLoadEntities: true,
        synchronize: configService.get<string>('NODE_ENV') !== 'production',
      }),
      inject: [ConfigService],
    }),
    DomainModule,
    IngestionModule,
    EngineModule,
    EnforcementModule,
    InfrastructureModule,
    ApiModule,
    IntegrationModule,
    AuditModule,
    BuildModule,
    PaymentModule,
    CommonModule,
    PlateReviewModule,
    PaymentProviderModule,
    AlarmModule,
    CustomerExportModule,
    SearchModule,
    SystemMonitorModule,
    OperationsDashboardModule,
    ScheduledNotificationsModule,
    LiveOpsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
