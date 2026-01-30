import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';

// Configuration
const PHOENIX_URL = process.env.PHOENIX_URL || 'http://142.202.191.208:3000';
const SYNC_ENABLED = process.env.PHOENIX_SYNC_ENABLED !== 'false';

@Injectable()
export class PhoenixSyncService implements OnModuleInit {
  private readonly logger = new Logger(PhoenixSyncService.name);
  private lastPaymentSync: Date | null = null;
  private lastDetectionSync: Date | null = null;
  private isSyncing = false;

  async onModuleInit() {
    if (SYNC_ENABLED) {
      this.logger.log(`Phoenix sync enabled. URL: ${PHOENIX_URL}`);
      // Initial sync after 10 seconds
      setTimeout(() => this.syncAll(), 10000);
    } else {
      this.logger.log('Phoenix sync disabled');
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduledSync() {
    if (SYNC_ENABLED) {
      await this.syncAll();
    }
  }

  async syncAll() {
    if (this.isSyncing) {
      this.logger.debug('Sync already in progress, skipping');
      return;
    }

    this.isSyncing = true;
    try {
      await this.syncPayments();
      await this.syncDetections();
    } catch (error) {
      this.logger.error('Sync failed:', error.message);
    } finally {
      this.isSyncing = false;
    }
  }

  async syncPayments() {
    try {
      const since = this.lastPaymentSync?.toISOString() || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const response = await axios.get(`${PHOENIX_URL}/api/sync/payments`, {
        params: { since, limit: 500 },
        timeout: 30000
      });

      if (response.data.success && response.data.payments?.length > 0) {
        this.logger.log(`Received ${response.data.payments.length} payments from Phoenix`);
        
        for (const payment of response.data.payments) {
          await this.upsertPayment(payment);
        }
        
        this.lastPaymentSync = new Date();
      }
    } catch (error) {
      this.logger.error('Payment sync error:', error.message);
    }
  }

  async syncDetections() {
    try {
      const since = this.lastDetectionSync?.toISOString() || new Date(Date.now() - 60 * 60 * 1000).toISOString();
      
      const response = await axios.get(`${PHOENIX_URL}/api/sync/detections`, {
        params: { since, limit: 500 },
        timeout: 30000
      });

      if (response.data.success && response.data.detections?.length > 0) {
        this.logger.log(`Received ${response.data.detections.length} detections from Phoenix`);
        
        for (const detection of response.data.detections) {
          await this.upsertMovement(detection);
        }
        
        this.lastDetectionSync = new Date();
      }
    } catch (error) {
      this.logger.error('Detection sync error:', error.message);
    }
  }

  private async upsertPayment(phoenixPayment: any) {
    // Map Phoenix payment to POS payment format
    // This is a placeholder - implement based on your actual entity
    this.logger.debug(`Would upsert payment: ${phoenixPayment.payment_id}`);
  }

  private async upsertMovement(detection: any) {
    // Map Phoenix detection to POS movement format
    // This is a placeholder - implement based on your actual entity
    this.logger.debug(`Would upsert movement: ${detection.plate_number} @ ${detection.camera_id}`);
  }

  async getStatus() {
    try {
      const response = await axios.get(`${PHOENIX_URL}/api/sync/status`, { timeout: 5000 });
      return {
        connected: true,
        phoenix: response.data,
        lastPaymentSync: this.lastPaymentSync,
        lastDetectionSync: this.lastDetectionSync
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
        lastPaymentSync: this.lastPaymentSync,
        lastDetectionSync: this.lastDetectionSync
      };
    }
  }
}
