import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import {
  Payment,
  PaymentProvider,
  PaymentProviderSite,
  PaymentIngestionLog,
} from '../domain/entities';
import { AuditModule } from '../audit/audit.module';
import { EngineModule } from '../engine/engine.module';
import { PaymentProviderService } from './services/payment-provider.service';
import { EmailPaymentPollerService } from './services/email-payment-poller.service';
import { EmailPaymentParserService } from './services/email-payment-parser.service';
import { PaymentProviderIngestionService } from './services/payment-provider-ingestion.service';
import { PaymentProviderMondayService } from './services/payment-provider-monday.service';
import { Tap2ParkApiPollerService } from './services/tap2park-api-poller.service';
import { PaymentProviderController } from './payment-provider.controller';
import { PaymentWebhookController } from './payment-webhook.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payment,
      PaymentProvider,
      PaymentProviderSite,
      PaymentIngestionLog,
    ]),
    HttpModule,
    ScheduleModule.forRoot(),
    forwardRef(() => AuditModule),
    forwardRef(() => EngineModule),
  ],
  controllers: [PaymentProviderController, PaymentWebhookController],
  providers: [
    PaymentProviderService,
    EmailPaymentPollerService,
    EmailPaymentParserService,
    PaymentProviderIngestionService,
    PaymentProviderMondayService,
    Tap2ParkApiPollerService,
  ],
  exports: [
    PaymentProviderService,
    PaymentProviderIngestionService,
    Tap2ParkApiPollerService,
  ],
})
export class PaymentProviderModule {}
