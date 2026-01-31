import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Movement, Payment, Site } from '../domain/entities';

// Configuration
const PHOENIX_URL = process.env.PHOENIX_URL || 'http://142.202.191.208:3000';
const SYNC_ENABLED = process.env.PHOENIX_SYNC_ENABLED !== 'false';

// Site code mapping from Phoenix camera names
const SITE_MAPPING: Record<string, string> = {
  yorkshireinbusiness: 'YIB01',
  yib: 'YIB01',
  southport: 'SPS01',
  sps: 'SPS01',
  seymour: 'SMM01',
  semour: 'SMM01',
  malthouse: 'SMM01',
  coastal: 'CPZ01',
  cpz: 'CPZ01',
  greenford: 'GRN01',
  bridlington: 'BPD01',
  kyle: 'KMS01',
};

@Injectable()
export class PhoenixSyncService implements OnModuleInit {
  private readonly logger = new Logger(PhoenixSyncService.name);
  private lastPaymentSync: Date | null = null;
  private lastDetectionSync: Date | null = null;
  private isSyncing = false;

  constructor(
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Site)
    private readonly siteRepo: Repository<Site>,
  ) {}

  // Cache for site camera configs
  private siteConfigCache: Map<string, Site['config']> = new Map();

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
      return { skipped: true };
    }

    this.isSyncing = true;
    const results = { payments: 0, detections: 0, errors: [] as string[] };

    try {
      results.payments = await this.syncPayments();
      results.detections = await this.syncDetections();
    } catch (error: any) {
      this.logger.error('Sync failed:', error.message);
      results.errors.push(error.message);
    } finally {
      this.isSyncing = false;
    }

    return results;
  }

  async syncPayments(): Promise<number> {
    try {
      const since =
        this.lastPaymentSync?.toISOString() ||
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const response = await axios.get(`${PHOENIX_URL}/api/sync/payments`, {
        params: { since, limit: 500 },
        timeout: 30000,
      });

      if (response.data.success && response.data.payments?.length > 0) {
        this.logger.log(
          `Received ${response.data.payments.length} payments from Phoenix`,
        );

        let count = 0;
        for (const payment of response.data.payments) {
          const saved = await this.upsertPayment(payment);
          if (saved) count++;
        }

        this.lastPaymentSync = new Date();
        return count;
      }

      return 0;
    } catch (error: any) {
      this.logger.error('Payment sync error:', error.message);
      return 0;
    }
  }

  async syncDetections(): Promise<number> {
    try {
      const since =
        this.lastDetectionSync?.toISOString() ||
        new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const response = await axios.get(`${PHOENIX_URL}/api/sync/detections`, {
        params: { since, limit: 500 },
        timeout: 30000,
      });

      if (response.data.success && response.data.detections?.length > 0) {
        this.logger.log(
          `Received ${response.data.detections.length} detections from Phoenix`,
        );

        let count = 0;
        for (const detection of response.data.detections) {
          const saved = await this.upsertMovement(detection);
          if (saved) count++;
        }

        this.lastDetectionSync = new Date();
        return count;
      }

      return 0;
    } catch (error: any) {
      this.logger.error('Detection sync error:', error.message);
      return 0;
    }
  }

  private mapSiteCode(cameraName: string): string {
    const lower = cameraName.toLowerCase();
    for (const [pattern, code] of Object.entries(SITE_MAPPING)) {
      if (lower.includes(pattern)) {
        return code;
      }
    }
    return 'UNKNOWN';
  }

  private async upsertPayment(phoenixPayment: any): Promise<boolean> {
    try {
      // Check if database connection is still active
      if (!this.paymentRepo.manager.connection.isInitialized) {
        this.logger.warn('Database connection not initialized, skipping payment upsert');
        return false;
      }
      
      const externalRef = phoenixPayment.payment_id || phoenixPayment.id;

      // Check if payment already exists
      const existing = await this.paymentRepo.findOne({
        where: { externalReference: externalRef },
      });

      if (existing) {
        return false; // Already have it
      }

      // Validate timestamps before creating
      const startTime = new Date(phoenixPayment.start_time || phoenixPayment.timestamp);
      const expiryTime = new Date(phoenixPayment.expiry_time || phoenixPayment.end_time);
      
      // Skip records with invalid timestamps
      if (isNaN(startTime.getTime()) || isNaN(expiryTime.getTime())) {
        this.logger.debug(`Skipping payment with invalid timestamps: ${externalRef}`);
        return false;
      }
      
      const payment = this.paymentRepo.create({
        vrm: phoenixPayment.vrm || phoenixPayment.plate_number,
        siteId: this.mapSiteCode(phoenixPayment.site || phoenixPayment.camera_id || ''),
        startTime,
        expiryTime,
        amount: phoenixPayment.amount || 0,
        source: phoenixPayment.provider || 'PHOENIX',
        externalReference: externalRef,
        rawData: phoenixPayment,
      });

      await this.paymentRepo.save(payment);
      this.logger.debug(`Saved payment: ${payment.vrm} @ ${payment.siteId}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to upsert payment: ${error.message}`);
      return false;
    }
  }

  private async upsertMovement(detection: any): Promise<boolean> {
    try {
      // Check if database connection is still active
      if (!this.movementRepo.manager.connection.isInitialized) {
        this.logger.warn('Database connection not initialized, skipping movement upsert');
        return false;
      }
      
      const vrm = detection.plate_number || detection.vrm;
      const timestamp = new Date(detection.timestamp || detection.detected_at);
      const siteId = this.mapSiteCode(detection.camera_id || detection.camera_name || '');

      // Validate timestamp
      if (isNaN(timestamp.getTime())) {
        this.logger.debug(`Skipping detection with invalid timestamp for VRM: ${vrm}`);
        return false;
      }

      // Check for duplicate (same plate, site, within 30 seconds)
      const windowStart = new Date(timestamp.getTime() - 30000);
      const windowEnd = new Date(timestamp.getTime() + 30000);

      const existing = await this.movementRepo
        .createQueryBuilder('m')
        .where('m.vrm = :vrm', { vrm })
        .andWhere('m.siteId = :siteId', { siteId })
        .andWhere('m.timestamp BETWEEN :start AND :end', {
          start: windowStart,
          end: windowEnd,
        })
        .getOne();

      if (existing) {
        return false; // Duplicate
      }

      // Extract and save images from Phoenix detection
      const images = await this.extractAndSaveImages(detection);
      const cameraId = detection.camera_id || detection.camera_name || 'phoenix';

      const movement = this.movementRepo.create({
        vrm,
        siteId,
        timestamp,
        cameraIds: cameraId,
        direction: await this.mapDirection(detection.direction, siteId, cameraId),
        rawData: detection,
        images,
      });

      await this.movementRepo.save(movement);
      this.logger.debug(`Saved movement: ${vrm} @ ${siteId} (${images.length} images)`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to upsert movement: ${error.message}`);
      return false;
    }
  }

  private async mapDirection(
    dir: string | undefined,
    siteId: string,
    cameraId: string,
  ): Promise<string> {
    if (!dir) return 'UNKNOWN';
    const lower = dir.toLowerCase();

    // Direct entry/exit mappings
    if (lower.includes('entry') || lower === 'in') return 'ENTRY';
    if (lower.includes('exit') || lower === 'out') return 'EXIT';

    // Handle Away/Towards using camera config
    if (lower === 'away' || lower === 'towards') {
      // Get site config (cached)
      let config = this.siteConfigCache.get(siteId);
      if (!config) {
        const site = await this.siteRepo.findOne({ where: { id: siteId } });
        if (site?.config) {
          config = site.config;
          this.siteConfigCache.set(siteId, config);
        }
      }

      // Find camera config
      const camera = config?.cameras?.find(
        (c) => c.id === cameraId || c.name === cameraId,
      );

      if (camera) {
        if (lower === 'towards' && camera.towardsDirection) {
          return camera.towardsDirection;
        }
        if (lower === 'away' && camera.awayDirection) {
          return camera.awayDirection;
        }
        // Fallback to fixed direction if Away/Towards not configured
        if (camera.direction) {
          // If camera has a fixed direction, use it
          // (this is a fallback for simple setups)
          return camera.direction;
        }
      }

      this.logger.debug(
        `No direction mapping for camera ${cameraId} at site ${siteId}, direction: ${dir}`,
      );
    }

    return 'UNKNOWN';
  }

  /**
   * Extract base64 images from Phoenix detection and save to disk
   */
  private async extractAndSaveImages(
    detection: any,
  ): Promise<Array<{ url: string; type: 'plate' | 'overview' | 'context' }>> {
    const images: Array<{ url: string; type: 'plate' | 'overview' | 'context' }> = [];
    const uploadDir = path.join(process.cwd(), 'uploads', 'images');

    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    try {
      // Check for images in raw_data.decodes[0]
      const decode = detection.raw_data?.decodes?.[0];
      if (!decode) return images;

      // Save plate image if available
      if (decode.plate && decode.plate.length > 100) {
        const plateFilename = `${uuidv4()}-plate.jpg`;
        const platePath = path.join(uploadDir, plateFilename);
        const plateBuffer = Buffer.from(decode.plate, 'base64');
        fs.writeFileSync(platePath, plateBuffer);
        images.push({ url: `/api/images/${plateFilename}`, type: 'plate' });
      }

      // Save overview image if available
      if (decode.overview && decode.overview.length > 100) {
        const overviewFilename = `${uuidv4()}-overview.jpg`;
        const overviewPath = path.join(uploadDir, overviewFilename);
        const overviewBuffer = Buffer.from(decode.overview, 'base64');
        fs.writeFileSync(overviewPath, overviewBuffer);
        images.push({ url: `/api/images/${overviewFilename}`, type: 'overview' });
      }
    } catch (error: any) {
      this.logger.warn(`Failed to extract images: ${error.message}`);
    }

    return images;
  }

  async getStatus() {
    try {
      const response = await axios.get(`${PHOENIX_URL}/api/sync/status`, {
        timeout: 5000,
      });
      return {
        connected: true,
        phoenix: response.data,
        lastPaymentSync: this.lastPaymentSync,
        lastDetectionSync: this.lastDetectionSync,
      };
    } catch (error: any) {
      return {
        connected: false,
        error: error.message,
        lastPaymentSync: this.lastPaymentSync,
        lastDetectionSync: this.lastDetectionSync,
      };
    }
  }

  // Manual trigger endpoint
  async triggerSync() {
    return this.syncAll();
  }
}
