import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Cron, CronExpression } from '@nestjs/schedule';
import { firstValueFrom } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permit, PermitType, PermitSource } from '../domain/entities';
import { AuditService } from '../audit/audit.service';

interface MondayColumnValue {
  id: string;
  text: string;
  value?: string;
}

interface MondayItem {
  id: string;
  name: string;
  column_values: MondayColumnValue[];
}

// Board column IDs (discovered from investigation)
const COLUMNS = {
  STATUS: 'status',
  TERMS: 'text_mkzzzn1e',
  SITE_ID: 'text_mkvxnc8c',
  QR_CODE_LINK: 'link_mkw1sapt',
  JSON_LINK: 'link_mkvxba2n', // Link (INTERNAL ONLY) - contains the JSON URL
  VALIDITY_HOURS: 'text_mkw9v797',
  FILES: 'file_mkzzyr2q',
};

// JSON entry from parking_registrations.json
interface ParkingRegistrationEntry {
  id: string;
  email: string;
  registration: string;
  timestamp: string;
  submittedAt: string;
}

interface QRWhitelistConfig {
  siteId: string;
  validityHours: number[];
  defaultValidityHours: number;
  jsonUrl: string;
  itemName: string;
  mondayItemId: string;
  status: string;
}

export interface QRWhitelistIngestionLog {
  jsonUrl: string;
  mondayItemId: string;
  siteId: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  recordsFound: number;
  recordsProcessed: number;
  recordsSkipped: number;
  errors?: string[];
  timestamp: Date;
}

@Injectable()
export class QRWhitelistService {
  private readonly logger = new Logger(QRWhitelistService.name);
  private readonly mondayApiUrl = 'https://api.monday.com/v2';
  private readonly boardId = 5001075614;
  private readonly apiKey: string;
  private ingestionLogs: QRWhitelistIngestionLog[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    @InjectRepository(Permit)
    private readonly permitRepo: Repository<Permit>,
    private readonly auditService: AuditService,
  ) {
    this.apiKey = this.configService.get<string>('MONDAY_API_KEY') || '';
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async syncQRWhitelists(): Promise<{
    processed: number;
    skipped: number;
    errors: string[];
  }> {
    this.logger.log('Starting QR Whitelist sync...');

    let totalProcessed = 0;
    let totalSkipped = 0;
    const allErrors: string[] = [];

    try {
      // Fetch board items to get QR whitelist configurations
      const items = await this.fetchBoardItems();
      if (!items || items.length === 0) {
        this.logger.warn('No items found in QR Whitelist board');
        return { processed: 0, skipped: 0, errors: ['No items in board'] };
      }

      this.logger.log(`Found ${items.length} items in QR Whitelist board`);

      for (const item of items) {
        try {
          const config = this.parseItemConfig(item);

          if (!config) {
            this.logger.debug(`Skipping item ${item.name}: missing required config`);
            continue;
          }

          // Skip items that are not Active
          if (config.status !== 'Active') {
            this.logger.debug(`Skipping item ${item.name}: status is ${config.status}`);
            continue;
          }

          const result = await this.processQRWhitelist(config);
          totalProcessed += result.processed;
          totalSkipped += result.skipped;
          if (result.errors.length > 0) {
            allErrors.push(...result.errors.map((e) => `${config.itemName}: ${e}`));
          }

          // Store ingestion log
          this.ingestionLogs.push({
            jsonUrl: config.jsonUrl,
            mondayItemId: config.mondayItemId,
            siteId: config.siteId,
            status: result.errors.length > 0 ? 'FAILED' : 'SUCCESS',
            recordsFound: result.found,
            recordsProcessed: result.processed,
            recordsSkipped: result.skipped,
            errors: result.errors.length > 0 ? result.errors : undefined,
            timestamp: new Date(),
          });

          // Keep only last 100 logs
          if (this.ingestionLogs.length > 100) {
            this.ingestionLogs = this.ingestionLogs.slice(-100);
          }
        } catch (err: any) {
          const errorMsg = `Failed to process ${item.name}: ${err.message}`;
          this.logger.error(errorMsg);
          allErrors.push(errorMsg);
        }
      }

      this.logger.log(
        `QR Whitelist sync complete. Processed: ${totalProcessed}, Skipped: ${totalSkipped}, Errors: ${allErrors.length}`,
      );

      // Audit log the sync
      await this.auditService.log({
        entityType: 'QR_WHITELIST_SYNC',
        entityId: `sync-${Date.now()}`,
        action: 'QR_WHITELIST_SYNC_COMPLETE',
        actor: 'SYSTEM',
        actorType: 'SCHEDULER',
        details: {
          itemsInBoard: items.length,
          recordsProcessed: totalProcessed,
          recordsSkipped: totalSkipped,
          errors: allErrors.length > 0 ? allErrors : undefined,
        },
      });

      return { processed: totalProcessed, skipped: totalSkipped, errors: allErrors };
    } catch (err: any) {
      const errorMsg = `QR Whitelist sync failed: ${err.message}`;
      this.logger.error(errorMsg, err.stack);
      allErrors.push(errorMsg);

      // Log the failure
      await this.auditService.log({
        entityType: 'QR_WHITELIST_SYNC',
        entityId: `sync-${Date.now()}`,
        action: 'QR_WHITELIST_SYNC_FAILED',
        actor: 'SYSTEM',
        actorType: 'SCHEDULER',
        details: { error: err.message },
      });

      return { processed: totalProcessed, skipped: totalSkipped, errors: allErrors };
    }
  }

  private async fetchBoardItems(): Promise<MondayItem[] | null> {
    const query = `
      query {
        boards(ids: [${this.boardId}]) {
          items_page(limit: 500) {
            cursor
            items {
              id
              name
              column_values {
                id
                text
                value
              }
            }
          }
        }
      }
    `;

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.mondayApiUrl,
          { query },
          { headers: { Authorization: this.apiKey } },
        ),
      );

      if (response.data.errors) {
        this.logger.error('Monday.com GraphQL errors:', response.data.errors);
        return null;
      }

      return response.data.data?.boards?.[0]?.items_page?.items || [];
    } catch (err: any) {
      this.logger.error(`Failed to fetch board items: ${err.message}`);
      return null;
    }
  }

  private parseItemConfig(item: MondayItem): QRWhitelistConfig | null {
    const getColumnText = (colId: string): string => {
      const col = item.column_values.find((c) => c.id === colId);
      return col?.text || '';
    };

    const getColumnUrl = (colId: string): string | null => {
      const col = item.column_values.find((c) => c.id === colId);
      if (col?.value) {
        try {
          const parsed = JSON.parse(col.value);
          return parsed.url || null;
        } catch {
          return null;
        }
      }
      return col?.text || null;
    };

    // Get the JSON URL from the Link (INTERNAL ONLY) column
    const jsonUrl = getColumnUrl(COLUMNS.JSON_LINK);
    if (!jsonUrl || !jsonUrl.includes('.json')) {
      return null;
    }

    // Get site ID
    const siteId = getColumnText(COLUMNS.SITE_ID);
    if (!siteId) {
      this.logger.warn(`Item ${item.name} has no Site ID`);
      return null;
    }

    // Get validity hours (can be comma-separated list like "24, 48, 72")
    const validityText = getColumnText(COLUMNS.VALIDITY_HOURS);
    let validityHours: number[] = [24]; // Default 24 hours
    if (validityText) {
      validityHours = validityText
        .split(',')
        .map((h) => parseInt(h.trim()))
        .filter((h) => !isNaN(h) && h > 0);
      if (validityHours.length === 0) {
        validityHours = [24];
      }
    }

    // Get status
    const status = getColumnText(COLUMNS.STATUS) || 'Unknown';

    return {
      siteId,
      validityHours,
      defaultValidityHours: validityHours[0], // Use first value as default
      jsonUrl,
      itemName: item.name,
      mondayItemId: item.id,
      status,
    };
  }

  private async processQRWhitelist(config: QRWhitelistConfig): Promise<{
    found: number;
    processed: number;
    skipped: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let processed = 0;
    let skipped = 0;

    this.logger.log(
      `Processing QR whitelist for ${config.itemName} (Site: ${config.siteId}, URL: ${config.jsonUrl})`,
    );

    try {
      // Fetch the JSON file
      const response = await firstValueFrom(
        this.httpService.get<ParkingRegistrationEntry[]>(config.jsonUrl, {
          timeout: 30000,
          headers: { Accept: 'application/json' },
        }),
      );

      const entries = response.data;
      if (!Array.isArray(entries)) {
        throw new Error('JSON response is not an array');
      }

      this.logger.log(`Found ${entries.length} entries in ${config.itemName}`);

      for (const entry of entries) {
        try {
          const result = await this.processEntry(entry, config);
          if (result.created) {
            processed++;
          } else if (result.skipped) {
            skipped++;
          }
        } catch (err: any) {
          errors.push(`Entry ${entry.id}: ${err.message}`);
        }
      }

      return { found: entries.length, processed, skipped, errors };
    } catch (err: any) {
      errors.push(`Failed to fetch JSON: ${err.message}`);
      return { found: 0, processed: 0, skipped: 0, errors };
    }
  }

  private async processEntry(
    entry: ParkingRegistrationEntry,
    config: QRWhitelistConfig,
  ): Promise<{ created: boolean; skipped: boolean; permit?: Permit }> {
    // Normalize VRM
    const vrm = this.normalizeVrm(entry.registration);
    if (!vrm) {
      throw new Error(`Invalid VRM: ${entry.registration}`);
    }

    // Calculate expiry based on timestamp and validity hours
    const submittedAt = new Date(entry.timestamp);
    const expiryAt = new Date(
      submittedAt.getTime() + config.defaultValidityHours * 60 * 60 * 1000,
    );

    // Check if permit already exists with this specific entry ID
    const existingId = `qrw-${config.mondayItemId}-${entry.id}`;
    let permit = await this.permitRepo.findOne({
      where: { mondayItemId: existingId },
    });

    if (permit) {
      // Already processed this entry
      return { created: false, skipped: true };
    }

    // Check if the permit has already expired
    const now = new Date();
    if (expiryAt < now) {
      // Skip expired entries - they don't need to be ingested
      this.logger.debug(
        `Skipping expired entry ${entry.id} for ${vrm} (expired ${expiryAt.toISOString()})`,
      );
      return { created: false, skipped: true };
    }

    // Create new permit
    permit = this.permitRepo.create({
      vrm,
      siteId: config.siteId,
      type: PermitType.QRWHITELIST,
      source: PermitSource.QRWHITELIST,
      startDate: submittedAt,
      endDate: expiryAt,
      active: true,
      mondayItemId: existingId,
      metadata: {
        submitterEmail: entry.email,
        entryId: entry.id,
        jsonUrl: config.jsonUrl,
        qrWhitelistName: config.itemName,
        validityHours: config.defaultValidityHours,
        submittedAt: entry.submittedAt,
      },
    });

    const saved = await this.permitRepo.save(permit);

    // Audit log
    await this.auditService.log({
      entityType: 'PERMIT',
      entityId: saved.id,
      action: 'PERMIT_INGESTED_FROM_QRWHITELIST',
      actor: 'SYSTEM',
      actorType: 'QR_WHITELIST_SERVICE',
      siteId: config.siteId,
      vrm,
      details: {
        source: 'QRWHITELIST',
        qrWhitelistName: config.itemName,
        mondayItemId: config.mondayItemId,
        entryId: entry.id,
        submitterEmail: entry.email,
        validityHours: config.defaultValidityHours,
        startDate: submittedAt.toISOString(),
        endDate: expiryAt.toISOString(),
      },
    });

    this.logger.debug(
      `Ingested QR whitelist permit: ${vrm} (Site: ${config.siteId}, Expires: ${expiryAt.toISOString()})`,
    );

    return { created: true, skipped: false, permit: saved };
  }

  private normalizeVrm(vrm: string | undefined): string | null {
    if (!vrm) return null;

    // Remove spaces, dashes, convert to uppercase
    const normalized = vrm.toUpperCase().replace(/[\s-]/g, '');

    // Basic validation
    if (normalized.length < 2 || normalized.length > 8) {
      return null;
    }

    // Check for valid characters
    if (!/^[A-Z0-9]+$/.test(normalized)) {
      return null;
    }

    return normalized;
  }

  // Manual trigger for testing
  async triggerSync(): Promise<{
    processed: number;
    skipped: number;
    errors: string[];
  }> {
    return this.syncQRWhitelists();
  }

  // Get recent ingestion logs
  getRecentIngestionLogs(limit = 50): QRWhitelistIngestionLog[] {
    return this.ingestionLogs.slice(-limit);
  }

  // Get board structure (for debugging/investigation)
  async getBoardStructure(): Promise<any> {
    const query = `
      query {
        boards(ids: [${this.boardId}]) {
          name
          columns {
            id
            title
            type
          }
          items_page(limit: 5) {
            items {
              id
              name
              column_values {
                id
                text
                value
              }
            }
          }
        }
      }
    `;

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.mondayApiUrl,
          { query },
          { headers: { Authorization: this.apiKey } },
        ),
      );

      return response.data.data?.boards?.[0] || null;
    } catch (err: any) {
      this.logger.error(`Failed to get board structure: ${err.message}`);
      return null;
    }
  }

  // Cleanup expired QR whitelist permits
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredPermits(): Promise<number> {
    const now = new Date();

    const expiredPermits = await this.permitRepo.find({
      where: {
        type: PermitType.QRWHITELIST,
        active: true,
      },
    });

    let deactivated = 0;
    for (const permit of expiredPermits) {
      if (permit.endDate && permit.endDate < now) {
        permit.active = false;
        await this.permitRepo.save(permit);
        deactivated++;
        this.logger.debug(`Deactivated expired QR whitelist permit: ${permit.vrm}`);
      }
    }

    if (deactivated > 0) {
      this.logger.log(`Deactivated ${deactivated} expired QR whitelist permits`);
    }

    return deactivated;
  }
}
