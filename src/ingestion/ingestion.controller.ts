import { Body, Controller, Post } from '@nestjs/common';
import { AnprIngestionService } from './services/anpr-ingestion.service';
import { PaymentIngestionService } from './services/payment-ingestion.service';
import { PermitIngestionService } from './services/permit-ingestion.service';
import { IngestAnprDto } from './dto/ingest-anpr.dto';
import { IngestPaymentDto } from './dto/ingest-payment.dto';
import { IngestPermitDto } from './dto/ingest-permit.dto';

@Controller('ingestion')
export class IngestionController {
    constructor(
        private readonly anprService: AnprIngestionService,
        private readonly paymentService: PaymentIngestionService,
        private readonly permitService: PermitIngestionService,
    ) { }

    @Post('anpr')
    async ingestAnpr(@Body() dto: IngestAnprDto) {
        return this.anprService.ingest(dto);
    }

    @Post('payment')
    async ingestPayment(@Body() dto: IngestPaymentDto) {
        return this.paymentService.ingest(dto);
    }

    @Post('permit')
    async ingestPermit(@Body() dto: IngestPermitDto) {
        return this.permitService.ingest(dto);
    }
}
