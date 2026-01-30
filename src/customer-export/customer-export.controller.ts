import {
  Controller,
  Get,
  Post,
  Param,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { CustomerExportService } from './services/customer-export.service';
import { CustomerExportSchedulerService } from './services/customer-export-scheduler.service';
import { ExportStatusDto, ManifestDto } from './dto';

@Controller('api/customer-export')
export class CustomerExportController {
  constructor(
    private readonly exportService: CustomerExportService,
    private readonly schedulerService: CustomerExportSchedulerService,
  ) {}

  /**
   * Trigger manual generation for all sites
   */
  @Post('generate')
  @HttpCode(HttpStatus.ACCEPTED)
  async generateAll() {
    const log = await this.exportService.generateAllSiteData();
    return {
      message: 'Export started',
      logId: log.id,
      status: log.status,
      sitesProcessed: log.sitesProcessed,
    };
  }

  /**
   * Trigger manual generation for a single site
   */
  @Post('generate/:siteId')
  @HttpCode(HttpStatus.ACCEPTED)
  async generateSingle(@Param('siteId') siteId: string) {
    const log = await this.exportService.generateSingleSiteData(siteId);
    return {
      message: 'Single site export completed',
      logId: log.id,
      siteId,
      status: log.status,
      whitelistCount: log.totalWhitelistRecords,
      paymentsCount: log.totalPaymentRecords,
    };
  }

  /**
   * Get last generation status
   */
  @Get('status')
  async getStatus(): Promise<ExportStatusDto & { scheduler: any }> {
    const log = await this.exportService.getLatestExportStatus();
    const schedulerStatus = this.schedulerService.getSchedulerStatus();

    if (!log) {
      return {
        id: '',
        siteId: null,
        status: 'PENDING',
        sitesProcessed: 0,
        totalWhitelistRecords: 0,
        totalPaymentRecords: 0,
        errors: null,
        completedAt: null,
        startedAt: new Date(),
        scheduler: schedulerStatus,
      };
    }

    return {
      id: log.id,
      siteId: log.siteId,
      status: log.status,
      sitesProcessed: log.sitesProcessed,
      totalWhitelistRecords: log.totalWhitelistRecords,
      totalPaymentRecords: log.totalPaymentRecords,
      errors: log.errors,
      completedAt: log.completedAt,
      startedAt: log.startedAt,
      scheduler: schedulerStatus,
    };
  }

  /**
   * Get manifest of available files
   */
  @Get('manifest')
  async getManifest(): Promise<ManifestDto> {
    const manifest = await this.exportService.getManifest();
    if (!manifest) {
      throw new NotFoundException('Manifest not found. Run an export first.');
    }
    return manifest;
  }

  /**
   * Regenerate manifest from existing files
   */
  @Post('manifest/regenerate')
  @HttpCode(HttpStatus.OK)
  async regenerateManifest() {
    await this.exportService.generateManifest();
    return { message: 'Manifest regenerated' };
  }
}
