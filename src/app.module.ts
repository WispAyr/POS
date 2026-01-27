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
  ],
  controllers: [AppController],
})
export class AppModule { }
