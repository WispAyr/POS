import {
  Controller,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PaymentProviderService } from './services/payment-provider.service';
import { PaymentProviderIngestionService } from './services/payment-provider-ingestion.service';
import { PaymentProviderType } from '../domain/entities/payment-provider.types';

@Controller('api/payment-webhook')
export class PaymentWebhookController {
  private readonly logger = new Logger(PaymentWebhookController.name);

  constructor(
    private readonly providerService: PaymentProviderService,
    private readonly ingestionService: PaymentProviderIngestionService,
  ) {}

  @Post(':providerId')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Param('providerId') providerId: string,
    @Body() payload: any,
  ) {
    this.logger.log(`Received webhook for provider ${providerId}`);

    // Validate provider exists and is active
    const provider = await this.providerService.findById(providerId);

    if (!provider.active) {
      throw new BadRequestException('Provider is not active');
    }

    if (provider.type !== PaymentProviderType.WEBHOOK) {
      throw new BadRequestException('Provider does not accept webhooks');
    }

    // Extract payment data from webhook payload
    // The payload format depends on the provider's configuration
    const vrm = this.extractField(payload, [
      'vrm',
      'vehicleRegistration',
      'plateNumber',
      'registration',
    ]);
    const amount = this.extractField(payload, [
      'amount',
      'paymentAmount',
      'price',
    ]);
    const startTime = this.extractField(payload, [
      'startTime',
      'start_time',
      'validFrom',
      'from',
    ]);
    const expiryTime = this.extractField(payload, [
      'expiryTime',
      'expiry_time',
      'validUntil',
      'to',
      'expiresAt',
    ]);
    const siteId = this.extractField(payload, [
      'siteId',
      'site_id',
      'carParkId',
      'locationId',
    ]);
    const externalReference = this.extractField(payload, [
      'reference',
      'transactionId',
      'externalReference',
      'paymentId',
    ]);

    // Validate required fields
    if (!vrm) {
      throw new BadRequestException('Missing vehicle registration');
    }
    if (!amount) {
      throw new BadRequestException('Missing payment amount');
    }
    if (!startTime) {
      throw new BadRequestException('Missing start time');
    }
    if (!expiryTime) {
      throw new BadRequestException('Missing expiry time');
    }
    if (!siteId) {
      throw new BadRequestException('Missing site ID');
    }

    // Parse dates
    const parsedStartTime = new Date(startTime);
    const parsedExpiryTime = new Date(expiryTime);

    if (isNaN(parsedStartTime.getTime())) {
      throw new BadRequestException(`Invalid start time: ${startTime}`);
    }
    if (isNaN(parsedExpiryTime.getTime())) {
      throw new BadRequestException(`Invalid expiry time: ${expiryTime}`);
    }

    // Parse amount
    const parsedAmount = typeof amount === 'number' ? amount : parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      throw new BadRequestException(`Invalid amount: ${amount}`);
    }

    try {
      const payment = await this.ingestionService.ingestWebhookPayment(
        providerId,
        siteId,
        {
          vrm,
          amount: parsedAmount,
          startTime: parsedStartTime,
          expiryTime: parsedExpiryTime,
          externalReference,
          rawData: payload,
        },
      );

      this.logger.log(`Ingested payment from webhook: ${payment.id}`);

      return {
        success: true,
        paymentId: payment.id,
        message: 'Payment ingested successfully',
      };
    } catch (err: any) {
      if (err.message === 'Duplicate payment') {
        return {
          success: true,
          duplicate: true,
          message: 'Payment already exists',
        };
      }
      throw err;
    }
  }

  private extractField(payload: any, possibleKeys: string[]): any {
    for (const key of possibleKeys) {
      if (payload[key] !== undefined && payload[key] !== null) {
        return payload[key];
      }
    }
    return undefined;
  }
}
