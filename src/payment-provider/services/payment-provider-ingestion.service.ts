import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Payment,
  PaymentProvider,
  PaymentProviderSite,
} from '../../domain/entities';
import {
  ParsedPaymentRecord,
  IngestionError,
  IngestionStatus,
} from '../../domain/entities/payment-provider.types';
import { AuditService } from '../../audit/audit.service';
import { PaymentProviderService } from './payment-provider.service';

export interface IngestionResult {
  ingested: number;
  skipped: number;
  failed: number;
  errors: IngestionError[];
}

@Injectable()
export class PaymentProviderIngestionService {
  private readonly logger = new Logger(PaymentProviderIngestionService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(PaymentProviderSite)
    private readonly providerSiteRepo: Repository<PaymentProviderSite>,
    private readonly providerService: PaymentProviderService,
    private readonly auditService: AuditService,
  ) {}

  async ingestParsedRecords(
    provider: PaymentProvider,
    ingestionLogId: string,
    records: ParsedPaymentRecord[],
  ): Promise<IngestionResult> {
    const result: IngestionResult = {
      ingested: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    // Get site mappings for this provider
    const siteMappings = await this.providerSiteRepo.find({
      where: { providerId: provider.id, active: true },
    });

    const siteMap = new Map<string, PaymentProviderSite>();
    for (const mapping of siteMappings) {
      // Map by various identifiers
      if (mapping.siteMapping?.emailSiteIdentifier) {
        siteMap.set(mapping.siteMapping.emailSiteIdentifier.toLowerCase(), mapping);
      }
      if (mapping.siteMapping?.apiSiteCode) {
        siteMap.set(mapping.siteMapping.apiSiteCode.toLowerCase(), mapping);
      }
      // Also map by siteId directly
      siteMap.set(mapping.siteId.toLowerCase(), mapping);
    }

    for (let i = 0; i < records.length; i++) {
      const record = records[i];

      try {
        // Resolve site ID
        let siteId: string | null = null;

        if (record.siteIdentifier) {
          const mapping = siteMap.get(record.siteIdentifier.toLowerCase());
          if (mapping) {
            siteId = mapping.siteId;
          }
        }

        // If only one site mapped, use that
        if (!siteId && siteMappings.length === 1) {
          siteId = siteMappings[0].siteId;
        }

        if (!siteId) {
          result.failed++;
          result.errors.push({
            row: i + 1,
            field: 'siteIdentifier',
            value: record.siteIdentifier,
            message: `Unable to resolve site for identifier: ${record.siteIdentifier}`,
            timestamp: new Date(),
          });
          continue;
        }

        // Check for duplicate payment
        const isDuplicate = await this.checkDuplicatePayment(
          siteId,
          record.vrm,
          record.startTime,
          record.expiryTime,
          record.amount,
        );

        if (isDuplicate) {
          result.skipped++;
          this.logger.debug(
            `Skipping duplicate payment for ${record.vrm} at ${siteId}`,
          );
          continue;
        }

        // Create payment
        const payment = this.paymentRepo.create({
          siteId,
          vrm: record.vrm,
          amount: record.amount,
          startTime: record.startTime,
          expiryTime: record.expiryTime,
          source: 'PROVIDER',
          externalReference: record.externalReference,
          providerId: provider.id,
          ingestionLogId,
          rawData: record.rawRow,
        });

        const saved = await this.paymentRepo.save(payment);
        result.ingested++;

        // Audit log
        await this.auditService.log({
          entityType: 'PAYMENT',
          entityId: saved.id,
          action: 'PAYMENT_INGESTED_FROM_PROVIDER',
          actor: 'SYSTEM',
          actorType: 'PAYMENT_PROVIDER',
          siteId,
          vrm: record.vrm,
          details: {
            providerId: provider.id,
            providerName: provider.name,
            ingestionLogId,
            amount: record.amount,
            startTime: record.startTime,
            expiryTime: record.expiryTime,
          },
          relatedEntities: [
            {
              entityType: 'PAYMENT_PROVIDER',
              entityId: provider.id,
              relationship: 'INGESTED_BY',
            },
            {
              entityType: 'PAYMENT_INGESTION_LOG',
              entityId: ingestionLogId,
              relationship: 'LOGGED_IN',
            },
          ],
        });

        this.logger.debug(
          `Ingested payment for ${record.vrm} at ${siteId}: ${saved.id}`,
        );
      } catch (err: any) {
        result.failed++;
        result.errors.push({
          row: i + 1,
          message: err.message,
          value: record,
          timestamp: new Date(),
        });
        this.logger.error(
          `Failed to ingest payment record ${i + 1}: ${err.message}`,
        );
      }
    }

    this.logger.log(
      `Ingestion complete for provider ${provider.name}: ${result.ingested} ingested, ${result.skipped} skipped, ${result.failed} failed`,
    );

    return result;
  }

  private async checkDuplicatePayment(
    siteId: string,
    vrm: string,
    startTime: Date,
    expiryTime: Date,
    amount: number,
  ): Promise<boolean> {
    // Check for existing payment with same VRM, site, and time window
    const existing = await this.paymentRepo
      .createQueryBuilder('payment')
      .where('payment.siteId = :siteId', { siteId })
      .andWhere('payment.vrm = :vrm', { vrm })
      .andWhere('payment.startTime = :startTime', { startTime })
      .andWhere('payment.expiryTime = :expiryTime', { expiryTime })
      .andWhere('payment.amount = :amount', { amount })
      .getOne();

    return !!existing;
  }

  async ingestWebhookPayment(
    providerId: string,
    siteId: string,
    payload: {
      vrm: string;
      amount: number;
      startTime: Date;
      expiryTime: Date;
      externalReference?: string;
      rawData?: any;
    },
  ): Promise<Payment> {
    const provider = await this.providerService.findById(providerId);

    // Normalize VRM
    const vrm = payload.vrm.toUpperCase().replace(/[\s-]/g, '');

    // Create ingestion log for the webhook
    const log = await this.providerService.createIngestionLog({
      providerId,
      source: 'WEBHOOK',
      status: IngestionStatus.PROCESSING,
      recordsFound: 1,
    });

    try {
      // Check for duplicate
      const isDuplicate = await this.checkDuplicatePayment(
        siteId,
        vrm,
        payload.startTime,
        payload.expiryTime,
        payload.amount,
      );

      if (isDuplicate) {
        await this.providerService.updateIngestionLog(log.id, {
          status: IngestionStatus.COMPLETED,
          recordsSkipped: 1,
          processedAt: new Date(),
        });
        throw new Error('Duplicate payment');
      }

      // Create payment
      const payment = this.paymentRepo.create({
        siteId,
        vrm,
        amount: payload.amount,
        startTime: payload.startTime,
        expiryTime: payload.expiryTime,
        source: 'PROVIDER',
        externalReference: payload.externalReference,
        providerId,
        ingestionLogId: log.id,
        rawData: payload.rawData,
      });

      const saved = await this.paymentRepo.save(payment);

      // Update log
      await this.providerService.updateIngestionLog(log.id, {
        status: IngestionStatus.COMPLETED,
        recordsIngested: 1,
        processedAt: new Date(),
      });

      // Audit log
      await this.auditService.log({
        entityType: 'PAYMENT',
        entityId: saved.id,
        action: 'PAYMENT_INGESTED_FROM_PROVIDER',
        actor: 'SYSTEM',
        actorType: 'WEBHOOK',
        siteId,
        vrm,
        details: {
          providerId,
          providerName: provider.name,
          ingestionLogId: log.id,
          amount: payload.amount,
          startTime: payload.startTime,
          expiryTime: payload.expiryTime,
        },
      });

      return saved;
    } catch (err: any) {
      await this.providerService.updateIngestionLog(log.id, {
        status: IngestionStatus.FAILED,
        recordsFailed: 1,
        errors: [{ message: err.message, timestamp: new Date() }],
        processedAt: new Date(),
      });
      throw err;
    }
  }
}
