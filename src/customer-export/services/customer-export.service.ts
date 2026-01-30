import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, IsNull, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { Site, Payment, Permit } from '../../domain/entities';
import {
  CustomerExportLog,
  CustomerExportError,
} from '../../domain/entities/customer-export-log.entity';
import {
  CustomerSiteData,
  WhitelistEntry,
  ParkingEntry,
} from '../dto/customer-site-data.dto';
import { ManifestDto, ManifestSiteEntry } from '../dto/export-status.dto';

@Injectable()
export class CustomerExportService {
  private readonly logger = new Logger(CustomerExportService.name);
  private readonly outputDir: string;
  private readonly ttlMinutes: number;

  constructor(
    @InjectRepository(Site)
    private readonly siteRepo: Repository<Site>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Permit)
    private readonly permitRepo: Repository<Permit>,
    @InjectRepository(CustomerExportLog)
    private readonly exportLogRepo: Repository<CustomerExportLog>,
    private readonly configService: ConfigService,
  ) {
    this.outputDir = this.configService.get<string>(
      'CUSTOMER_EXPORT_OUTPUT_DIR',
      '/data/customer-export',
    );
    this.ttlMinutes = this.configService.get<number>(
      'CUSTOMER_EXPORT_TTL_MINUTES',
      10,
    );
  }

  /**
   * Normalize VRM to uppercase without spaces
   */
  private normalizeVrm(vrm: string): string {
    return vrm.toUpperCase().replace(/\s+/g, '');
  }

  /**
   * Generate data for a single site
   */
  async generateSiteData(siteId: string): Promise<CustomerSiteData> {
    const site = await this.siteRepo.findOne({ where: { id: siteId } });
    if (!site) {
      throw new Error(`Site ${siteId} not found`);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMinutes * 60 * 1000);

    // Get active permits (whitelist entries) for this site
    const permits = await this.getActivePermits(siteId, now);

    // Get active payments for this site
    const payments = await this.getActivePayments(siteId, now);

    // Transform to output format
    const whitelist: WhitelistEntry[] = permits.map((permit) => ({
      vrm: this.normalizeVrm(permit.vrm),
      type: permit.type as WhitelistEntry['type'],
      validFrom: permit.startDate.toISOString(),
      validUntil: permit.endDate?.toISOString() || null,
    }));

    const parking: ParkingEntry[] = payments.map((payment) => ({
      vrm: this.normalizeVrm(payment.vrm),
      startTime: payment.startTime.toISOString(),
      expiryTime: payment.expiryTime.toISOString(),
    }));

    return {
      siteId: site.id,
      siteName: site.name,
      generatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      config: {
        operatingModel: site.config?.operatingModel || 'ANPR',
        gracePeriods: site.config?.gracePeriods
          ? {
              entry: site.config.gracePeriods.entry,
              exit: site.config.gracePeriods.exit,
            }
          : undefined,
      },
      whitelist,
      parking,
      stats: {
        whitelistCount: whitelist.length,
        activePaymentsCount: parking.length,
      },
    };
  }

  /**
   * Get active permits for a site (including global permits)
   */
  private async getActivePermits(siteId: string, now: Date): Promise<Permit[]> {
    // Query for site-specific and global permits that are active
    const permits = await this.permitRepo
      .createQueryBuilder('permit')
      .where('permit.active = :active', { active: true })
      .andWhere(
        '(permit.siteId = :siteId OR permit.siteId IS NULL)',
        { siteId },
      )
      .andWhere(
        '(permit.endDate > :now OR permit.endDate IS NULL)',
        { now },
      )
      .andWhere('permit.startDate <= :now', { now })
      .getMany();

    return permits;
  }

  /**
   * Get active payments for a site
   */
  private async getActivePayments(siteId: string, now: Date): Promise<Payment[]> {
    return this.paymentRepo.find({
      where: {
        siteId,
        expiryTime: MoreThan(now),
      },
    });
  }

  /**
   * Write site data to a JSON file
   */
  async writeSiteDataFile(siteId: string, data: CustomerSiteData): Promise<void> {
    await this.ensureOutputDir();
    const filePath = path.join(this.outputDir, `site-${siteId}.json`);
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    this.logger.debug(`Written export file: ${filePath}`);
  }

  /**
   * Generate data for all active sites
   */
  async generateAllSiteData(): Promise<CustomerExportLog> {
    const log = this.exportLogRepo.create({
      siteId: null,
      status: 'PENDING',
    });
    await this.exportLogRepo.save(log);

    const errors: CustomerExportError[] = [];
    let sitesProcessed = 0;
    let totalWhitelistRecords = 0;
    let totalPaymentRecords = 0;
    const manifestSites: ManifestSiteEntry[] = [];

    try {
      const sites = await this.siteRepo.find({ where: { active: true } });
      this.logger.log(`Starting export for ${sites.length} active sites`);

      for (const site of sites) {
        try {
          const data = await this.generateSiteData(site.id);
          await this.writeSiteDataFile(site.id, data);

          sitesProcessed++;
          totalWhitelistRecords += data.stats.whitelistCount;
          totalPaymentRecords += data.stats.activePaymentsCount;

          manifestSites.push({
            siteId: site.id,
            siteName: site.name,
            file: `site-${site.id}.json`,
            whitelistCount: data.stats.whitelistCount,
            activePaymentsCount: data.stats.activePaymentsCount,
            generatedAt: data.generatedAt,
          });
        } catch (err: any) {
          this.logger.error(`Failed to export site ${site.id}: ${err.message}`);
          errors.push({ siteId: site.id, error: err.message });
        }
      }

      // Generate manifest
      await this.generateManifest(manifestSites);

      // Update log
      log.status = errors.length > 0 ? 'FAILED' : 'COMPLETED';
      log.sitesProcessed = sitesProcessed;
      log.totalWhitelistRecords = totalWhitelistRecords;
      log.totalPaymentRecords = totalPaymentRecords;
      log.errors = errors.length > 0 ? errors : null;
      log.completedAt = new Date();
      await this.exportLogRepo.save(log);

      this.logger.log(
        `Export completed: ${sitesProcessed} sites, ${totalWhitelistRecords} whitelist entries, ${totalPaymentRecords} payments`,
      );
    } catch (err: any) {
      log.status = 'FAILED';
      log.errors = [{ siteId: 'SYSTEM', error: err.message }];
      log.completedAt = new Date();
      await this.exportLogRepo.save(log);
      this.logger.error(`Export failed: ${err.message}`);
    }

    return log;
  }

  /**
   * Generate data for a single site and write to file
   */
  async generateSingleSiteData(siteId: string): Promise<CustomerExportLog> {
    const log = this.exportLogRepo.create({
      siteId,
      status: 'PENDING',
    });
    await this.exportLogRepo.save(log);

    try {
      const data = await this.generateSiteData(siteId);
      await this.writeSiteDataFile(siteId, data);

      log.status = 'COMPLETED';
      log.sitesProcessed = 1;
      log.totalWhitelistRecords = data.stats.whitelistCount;
      log.totalPaymentRecords = data.stats.activePaymentsCount;
      log.completedAt = new Date();
      await this.exportLogRepo.save(log);

      this.logger.log(
        `Single site export completed: ${siteId} - ${data.stats.whitelistCount} whitelist, ${data.stats.activePaymentsCount} payments`,
      );
    } catch (err: any) {
      log.status = 'FAILED';
      log.errors = [{ siteId, error: err.message }];
      log.completedAt = new Date();
      await this.exportLogRepo.save(log);
      this.logger.error(`Single site export failed for ${siteId}: ${err.message}`);
    }

    return log;
  }

  /**
   * Generate manifest.json listing all site files
   */
  async generateManifest(sites?: ManifestSiteEntry[]): Promise<void> {
    await this.ensureOutputDir();

    let manifestSites = sites;

    // If sites not provided, scan the output directory
    if (!manifestSites) {
      manifestSites = await this.scanExistingFiles();
    }

    const manifest: ManifestDto = {
      generatedAt: new Date().toISOString(),
      sites: manifestSites,
    };

    const manifestPath = path.join(this.outputDir, 'manifest.json');
    await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    this.logger.debug(`Written manifest: ${manifestPath}`);
  }

  /**
   * Scan existing export files to rebuild manifest
   */
  private async scanExistingFiles(): Promise<ManifestSiteEntry[]> {
    const entries: ManifestSiteEntry[] = [];

    try {
      const files = await fs.promises.readdir(this.outputDir);
      for (const file of files) {
        if (file.startsWith('site-') && file.endsWith('.json')) {
          const filePath = path.join(this.outputDir, file);
          const content = await fs.promises.readFile(filePath, 'utf8');
          const data: CustomerSiteData = JSON.parse(content);
          entries.push({
            siteId: data.siteId,
            siteName: data.siteName,
            file,
            whitelistCount: data.stats.whitelistCount,
            activePaymentsCount: data.stats.activePaymentsCount,
            generatedAt: data.generatedAt,
          });
        }
      }
    } catch (err) {
      this.logger.warn(`Could not scan export directory: ${err}`);
    }

    return entries;
  }

  /**
   * Ensure output directory exists
   */
  private async ensureOutputDir(): Promise<void> {
    try {
      await fs.promises.access(this.outputDir);
    } catch {
      await fs.promises.mkdir(this.outputDir, { recursive: true });
      this.logger.log(`Created output directory: ${this.outputDir}`);
    }
  }

  /**
   * Get the latest export status
   */
  async getLatestExportStatus(): Promise<CustomerExportLog | null> {
    return this.exportLogRepo.findOne({
      where: { siteId: IsNull() },
      order: { startedAt: 'DESC' },
    });
  }

  /**
   * Get the current manifest
   */
  async getManifest(): Promise<ManifestDto | null> {
    const manifestPath = path.join(this.outputDir, 'manifest.json');
    try {
      const content = await fs.promises.readFile(manifestPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
}
