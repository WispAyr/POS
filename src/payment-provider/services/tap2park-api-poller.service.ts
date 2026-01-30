import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import {
  Payment,
  PaymentProvider,
  PaymentProviderSite,
  PaymentIngestionLog,
  SyncStatus,
  IngestionStatus,
} from '../../domain/entities';
import { ReconciliationService } from '../../engine/services/reconciliation.service';
import { AuditService } from '../../audit/audit.service';

interface Tap2ParkPayment {
  location_code: number;
  parking_starts: string;
  parking_ends: string;
  vrm: string;
}

@Injectable()
export class Tap2ParkApiPollerService implements OnModuleInit {
  private readonly logger = new Logger(Tap2ParkApiPollerService.name);
  private readonly apiUrl = 'https://api.tap2park.co.uk';
  private readonly apiKey: string;
  private providerId: string | null = null;
  private siteIdByLocationCode: Map<string, string> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(PaymentProvider)
    private readonly providerRepo: Repository<PaymentProvider>,
    @InjectRepository(PaymentProviderSite)
    private readonly providerSiteRepo: Repository<PaymentProviderSite>,
    @InjectRepository(PaymentIngestionLog)
    private readonly ingestionLogRepo: Repository<PaymentIngestionLog>,
    private readonly reconciliationService: ReconciliationService,
    private readonly auditService: AuditService,
  ) {
    this.apiKey = this.configService.get<string>('TAP2PARK_API_KEY') || '';
  }

  async onModuleInit() {
    await this.loadProviderConfig();
    // Run initial sync after 30 seconds to let the app fully start
    setTimeout(() => this.pollPayments(), 30000);
  }

  private async loadProviderConfig() {
    try {
      // Find Tap2Park provider
      const provider = await this.providerRepo.findOne({
        where: { name: 'Tap2Park' },
      });

      if (!provider) {
        this.logger.warn('Tap2Park provider not found in database');
        return;
      }

      this.providerId = provider.id;

      // Load site mappings
      const siteMappings = await this.providerSiteRepo.find({
        where: { providerId: provider.id, active: true },
      });

      this.siteIdByLocationCode.clear();
      for (const mapping of siteMappings) {
        const tap2parkIds = mapping.siteMapping?.tap2parkIds || [];
        for (const locationCode of tap2parkIds) {
          this.siteIdByLocationCode.set(locationCode, mapping.siteId);
        }
      }

      this.logger.log(
        `Loaded ${this.siteIdByLocationCode.size} Tap2Park location mappings`,
      );
    } catch (error) {
      this.logger.error('Failed to load Tap2Park provider config', error);
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async pollPayments() {
    if (!this.apiKey) {
      this.logger.warn('TAP2PARK_API_KEY not configured, skipping poll');
      return;
    }

    // Reload mappings in case they changed
    await this.loadProviderConfig();

    if (this.siteIdByLocationCode.size === 0) {
      this.logger.warn('No Tap2Park site mappings configured, skipping poll');
      return;
    }

    this.logger.log('Starting Tap2Park payment poll...');

    // Create ingestion log entry
    let ingestionLog: PaymentIngestionLog | null = null;
    if (this.providerId) {
      ingestionLog = this.ingestionLogRepo.create({
        providerId: this.providerId,
        source: 'API',
        status: IngestionStatus.PENDING,
        recordsFound: 0,
        recordsIngested: 0,
        recordsSkipped: 0,
        recordsFailed: 0,
      });
      ingestionLog = await this.ingestionLogRepo.save(ingestionLog);
    }

    try {
      // Fetch all active payments
      const payments = await this.fetchActivePayments();
      this.logger.log(`Fetched ${payments.length} active payments from Tap2Park`);

      let ingested = 0;
      let skipped = 0;
      let errors = 0;
      const errorMessages: string[] = [];
      const parsedData: any[] = [];

      for (const payment of payments) {
        try {
          const result = await this.processPayment(payment, ingestionLog?.id);
          if (result === 'ingested') {
            ingested++;
            parsedData.push({
              vrm: payment.vrm,
              locationCode: payment.location_code,
              startTime: payment.parking_starts,
              expiryTime: payment.parking_ends,
              status: 'ingested',
            });
          } else if (result === 'skipped') {
            skipped++;
          }
        } catch (error: any) {
          errors++;
          errorMessages.push(`${payment.vrm}: ${error.message || 'Unknown error'}`);
          this.logger.error(
            `Error processing payment for ${payment.vrm}`,
            error,
          );
        }
      }

      this.logger.log(
        `Tap2Park poll complete: ${ingested} ingested, ${skipped} skipped, ${errors} errors`,
      );

      // Update ingestion log
      if (ingestionLog) {
        await this.ingestionLogRepo.update(ingestionLog.id, {
          status: errors > 0 ? IngestionStatus.PARTIAL : IngestionStatus.COMPLETED,
          recordsFound: payments.length,
          recordsIngested: ingested,
          recordsSkipped: skipped,
          recordsFailed: errors,
          errors: errorMessages.length > 0 ? errorMessages.map(msg => ({ message: msg, timestamp: new Date() })) : undefined,
          parsedData: parsedData.length > 0 ? parsedData as any : undefined,
          processedAt: new Date(),
        });
      }

      // Update provider sync status
      if (this.providerId) {
        await this.providerRepo.update(this.providerId, {
          lastSyncAt: new Date(),
          lastSyncStatus: errors > 0 ? SyncStatus.PARTIAL : SyncStatus.SUCCESS,
          lastSyncDetails: {
            recordsFound: payments.length,
            recordsIngested: ingested,
            recordsSkipped: skipped,
            errors: errors > 0 ? [`${errors} payments failed to process`] : undefined,
          },
        });
      }
    } catch (error: any) {
      this.logger.error('Tap2Park poll failed', error);

      // Update ingestion log on failure
      if (ingestionLog) {
        await this.ingestionLogRepo.update(ingestionLog.id, {
          status: IngestionStatus.FAILED,
          errors: [{ message: error.message || 'Unknown error', timestamp: new Date() }],
          processedAt: new Date(),
        });
      }

      if (this.providerId) {
        await this.providerRepo.update(this.providerId, {
          lastSyncAt: new Date(),
          lastSyncStatus: SyncStatus.FAILED,
          lastSyncDetails: { errors: [error.message || 'Unknown error'] },
        });
      }
    }
  }

  private async fetchActivePayments(): Promise<Tap2ParkPayment[]> {
    const response = await firstValueFrom(
      this.httpService.get<Tap2ParkPayment[]>(`${this.apiUrl}/active/all`, {
        headers: { 't2p-key': this.apiKey },
        timeout: 30000,
      }),
    );

    return response.data || [];
  }

  private async processPayment(
    tap2parkPayment: Tap2ParkPayment,
    ingestionLogId?: string,
  ): Promise<'ingested' | 'skipped'> {
    const locationCode = String(tap2parkPayment.location_code);
    const siteId = this.siteIdByLocationCode.get(locationCode);

    if (!siteId) {
      // Location code not mapped to any of our sites - skip
      return 'skipped';
    }

    const vrm = tap2parkPayment.vrm.toUpperCase().replace(/\s/g, '');
    const startTime = new Date(tap2parkPayment.parking_starts);
    const expiryTime = new Date(tap2parkPayment.parking_ends);

    // Generate unique external reference
    const externalRef = `T2P_${locationCode}_${vrm}_${startTime.getTime()}`;

    // Check if payment already exists
    const existing = await this.paymentRepo.findOne({
      where: { externalReference: externalRef },
    });

    if (existing) {
      // Update expiry time if it changed
      if (existing.expiryTime.getTime() !== expiryTime.getTime()) {
        existing.expiryTime = expiryTime;
        await this.paymentRepo.save(existing);
        this.logger.debug(`Updated expiry for ${vrm} at ${siteId}`);
      }
      return 'skipped';
    }

    // Create new payment
    const payment = this.paymentRepo.create({
      siteId,
      vrm,
      amount: 0, // Tap2Park API doesn't provide amount
      startTime,
      expiryTime,
      source: 'TAP2PARK',
      externalReference: externalRef,
      rawData: tap2parkPayment,
      providerId: this.providerId,
      ingestionLogId: ingestionLogId || null,
    });

    const saved = await this.paymentRepo.save(payment);
    this.logger.debug(
      `Ingested Tap2Park payment: ${vrm} at ${siteId} (${locationCode})`,
    );

    // Audit log
    await this.auditService.logPaymentIngestion(saved);

    // Trigger reconciliation
    this.reconciliationService
      .reconcilePayment(
        saved.vrm,
        saved.siteId,
        saved.startTime,
        saved.expiryTime,
        saved.id,
      )
      .catch((err) => {
        this.logger.error(`Reconciliation error for ${saved.id}`, err);
      });

    return 'ingested';
  }

  async triggerManualSync(): Promise<{
    total: number;
    ingested: number;
    skipped: number;
    errors: number;
  }> {
    await this.pollPayments();
    
    // Return the last sync details
    if (this.providerId) {
      const provider = await this.providerRepo.findOne({
        where: { id: this.providerId },
      });
      return provider?.lastSyncDetails as any || { total: 0, ingested: 0, skipped: 0, errors: 0 };
    }
    
    return { total: 0, ingested: 0, skipped: 0, errors: 0 };
  }

  /**
   * Import historical payments for a date range
   */
  async importHistoricalData(
    fromDate: Date,
    toDate: Date,
  ): Promise<{
    total: number;
    ingested: number;
    skipped: number;
    errors: number;
    dateRange: { from: string; to: string };
  }> {
    if (!this.apiKey) {
      throw new Error('TAP2PARK_API_KEY not configured');
    }

    await this.loadProviderConfig();

    if (this.siteIdByLocationCode.size === 0) {
      throw new Error('No Tap2Park site mappings configured');
    }

    this.logger.log(
      `Starting Tap2Park historical import: ${fromDate.toISOString()} to ${toDate.toISOString()}`,
    );

    let allPayments: Tap2ParkPayment[] = [];

    // Fetch historical data in daily chunks to avoid API limits
    const currentDate = new Date(fromDate);
    while (currentDate <= toDate) {
      const dayStart = new Date(currentDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(23, 59, 59, 999);

      try {
        const dayPayments = await this.fetchHistoricalPayments(dayStart, dayEnd);
        allPayments = allPayments.concat(dayPayments);
        this.logger.debug(
          `Fetched ${dayPayments.length} payments for ${currentDate.toISOString().split('T')[0]}`,
        );
      } catch (error: any) {
        this.logger.warn(
          `Failed to fetch payments for ${currentDate.toISOString().split('T')[0]}: ${error.message}`,
        );
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);

      // Rate limiting - small delay between requests
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    this.logger.log(
      `Fetched ${allPayments.length} historical payments from Tap2Park`,
    );

    let ingested = 0;
    let skipped = 0;
    let errors = 0;

    for (const payment of allPayments) {
      try {
        const result = await this.processPayment(payment);
        if (result === 'ingested') ingested++;
        else if (result === 'skipped') skipped++;
      } catch (error) {
        errors++;
        this.logger.error(
          `Error processing historical payment for ${payment.vrm}`,
          error,
        );
      }
    }

    this.logger.log(
      `Historical import complete: ${ingested} ingested, ${skipped} skipped, ${errors} errors`,
    );

    return {
      total: allPayments.length,
      ingested,
      skipped,
      errors,
      dateRange: {
        from: fromDate.toISOString().split('T')[0],
        to: toDate.toISOString().split('T')[0],
      },
    };
  }

  /**
   * Fetch historical payments for a specific date range
   */
  private async fetchHistoricalPayments(
    from: Date,
    to: Date,
  ): Promise<Tap2ParkPayment[]> {
    // Try the history endpoint with date params
    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];

    try {
      // Primary endpoint - /history with date range
      const response = await firstValueFrom(
        this.httpService.get<Tap2ParkPayment[]>(`${this.apiUrl}/history`, {
          headers: { 't2p-key': this.apiKey },
          params: { from: fromStr, to: toStr },
          timeout: 60000,
        }),
      );
      return response.data || [];
    } catch (error: any) {
      // Fallback - try /payments endpoint
      if (error.response?.status === 404) {
        const response = await firstValueFrom(
          this.httpService.get<Tap2ParkPayment[]>(`${this.apiUrl}/payments`, {
            headers: { 't2p-key': this.apiKey },
            params: { from: fromStr, to: toStr },
            timeout: 60000,
          }),
        );
        return response.data || [];
      }
      throw error;
    }
  }
}
