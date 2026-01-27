import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment, Site } from '../domain/entities';
import { PaymentTrackingService } from './payment-tracking.service';
import { PaymentController } from './payment.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Payment, Site]),
        AuditModule,
    ],
    providers: [PaymentTrackingService],
    controllers: [PaymentController],
    exports: [PaymentTrackingService],
})
export class PaymentModule { }
