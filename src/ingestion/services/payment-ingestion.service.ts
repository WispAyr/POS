import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '../../domain/entities';
import { IngestPaymentDto } from '../dto/ingest-payment.dto';

@Injectable()
export class PaymentIngestionService {
    private readonly logger = new Logger(PaymentIngestionService.name);

    constructor(
        @InjectRepository(Payment)
        private readonly paymentRepo: Repository<Payment>,
    ) { }

    async ingest(dto: IngestPaymentDto): Promise<Payment> {
        const payment = this.paymentRepo.create({
            siteId: dto.siteId,
            vrm: dto.vrm.toUpperCase().replace(/\s/g, ''),
            amount: dto.amount,
            startTime: new Date(dto.startTime),
            expiryTime: new Date(dto.expiryTime),
            source: dto.source,
            externalReference: dto.externalReference,
            rawData: dto,
        });

        const saved = await this.paymentRepo.save(payment);
        this.logger.log(`Ingested payment: ${saved.id} for VRM ${saved.vrm}, Expiry: ${saved.expiryTime}`);

        // TODO: Trigger Reconciliation (Async)
        return saved;
    }
}
