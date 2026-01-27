import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Query,
    HttpCode,
    HttpStatus,
    UseGuards,
    Header,
} from '@nestjs/common';
import { PaymentTrackingService } from './payment-tracking.service';
import { PaymentIngestionService } from '../ingestion/services/payment-ingestion.service';
import { IngestPaymentDto } from '../ingestion/dto/ingest-payment.dto';

/**
 * Payment Controller
 * 
 * Provides endpoints for:
 * - Real-time payment validation (for barrier control)
 * - Payment ingestion (webhooks, APIs)
 * - Payment status queries
 * - Payment statistics
 */
@Controller('api/payment')
export class PaymentController {
    constructor(
        private readonly paymentTrackingService: PaymentTrackingService,
        private readonly paymentIngestionService: PaymentIngestionService,
    ) { }

    /**
     * Real-time payment validation for barrier control
     * 
     * This endpoint is designed for ANPR-controlled barriers to check
     * if a vehicle has valid payment before allowing entry/exit.
     * 
     * Returns fast response (< 100ms) for real-time systems.
     */
    @Get('validate/:siteId/:vrm')
    @HttpCode(HttpStatus.OK)
    @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
    async validatePayment(
        @Param('siteId') siteId: string,
        @Param('vrm') vrm: string,
        @Query('timestamp') timestamp?: string,
    ) {
        const checkTime = timestamp ? new Date(timestamp) : undefined;
        return this.paymentTrackingService.validatePaymentForAccess(vrm, siteId, checkTime);
    }

    /**
     * Payment status query
     * 
     * Returns comprehensive payment status for a vehicle at a site
     */
    @Get('status/:siteId/:vrm')
    async getPaymentStatus(
        @Param('siteId') siteId: string,
        @Param('vrm') vrm: string,
    ) {
        return this.paymentTrackingService.getPaymentStatus(vrm, siteId);
    }

    /**
     * Ingest payment (webhook/API endpoint)
     * 
     * Accepts payments from payment machines, apps, kiosks, etc.
     * Supports future payment module integrations.
     */
    @Post('ingest')
    @HttpCode(HttpStatus.CREATED)
    async ingestPayment(@Body() dto: IngestPaymentDto) {
        return this.paymentIngestionService.ingest(dto);
    }

    /**
     * Webhook endpoint for payment modules
     * 
     * Designed for integration with external payment systems.
     * Accepts webhook payloads from payment machines.
     */
    @Post('webhook')
    @HttpCode(HttpStatus.OK)
    async paymentWebhook(@Body() payload: any) {
        // Transform webhook payload to IngestPaymentDto
        // This allows different payment modules to send different formats
        const dto: IngestPaymentDto = {
            siteId: payload.siteId || payload.site_id,
            vrm: payload.vrm || payload.vehicleRegistration || payload.plateNumber,
            amount: payload.amount || payload.paymentAmount,
            startTime: payload.startTime || payload.start_time || payload.validFrom,
            expiryTime: payload.expiryTime || payload.expiry_time || payload.validUntil || payload.expiresAt,
            source: payload.source || payload.paymentSource || 'WEBHOOK',
            externalReference: payload.reference || payload.transactionId || payload.externalReference,
        };

        // Validate required fields
        if (!dto.siteId || !dto.vrm || !dto.amount || !dto.startTime || !dto.expiryTime) {
            throw new Error('Missing required payment fields');
        }

        return this.paymentIngestionService.ingest(dto);
    }

    /**
     * Get active payments for a site
     * 
     * Useful for monitoring and dashboard displays
     */
    @Get('active/:siteId')
    async getActivePayments(@Param('siteId') siteId: string) {
        return this.paymentTrackingService.getActivePaymentsForSite(siteId);
    }

    /**
     * Get payment statistics for a site
     */
    @Get('statistics/:siteId')
    async getPaymentStatistics(
        @Param('siteId') siteId: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        return this.paymentTrackingService.getPaymentStatistics(
            siteId,
            startDate ? new Date(startDate) : undefined,
            endDate ? new Date(endDate) : undefined,
        );
    }

    /**
     * Get payments expiring soon
     * 
     * Useful for sending notifications or alerts
     */
    @Get('expiring/:siteId')
    async getExpiringPayments(
        @Param('siteId') siteId: string,
        @Query('minutes') minutes?: string,
    ) {
        const minutesNum = minutes ? parseInt(minutes, 10) : 30;
        return this.paymentTrackingService.getPaymentsExpiringSoon(siteId, minutesNum);
    }

    /**
     * Check if payment machine integration is enabled for a site
     */
    @Get('machine-enabled/:siteId')
    async isPaymentMachineEnabled(@Param('siteId') siteId: string) {
        return {
            enabled: await this.paymentTrackingService.isPaymentMachineEnabled(siteId),
        };
    }
}
