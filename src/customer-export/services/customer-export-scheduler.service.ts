import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CronJob } from 'cron';
import { CustomerExportService } from './customer-export.service';

@Injectable()
export class CustomerExportSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(CustomerExportSchedulerService.name);
  private readonly enabled: boolean;
  private readonly cronSchedule: string;

  constructor(
    private readonly exportService: CustomerExportService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {
    this.enabled = this.configService.get<string>('CUSTOMER_EXPORT_ENABLED', 'true') === 'true';
    this.cronSchedule = this.configService.get<string>(
      'CUSTOMER_EXPORT_CRON',
      '*/5 * * * *', // Default: every 5 minutes
    );
  }

  onModuleInit() {
    if (!this.enabled) {
      this.logger.log('Customer export scheduler is disabled');
      return;
    }

    // Add dynamic cron job based on config
    const job = new CronJob(this.cronSchedule, () => {
      this.runScheduledExport();
    });

    this.schedulerRegistry.addCronJob('customer-export', job);
    job.start();

    this.logger.log(`Customer export scheduler initialized with cron: ${this.cronSchedule}`);
  }

  /**
   * Run the scheduled export
   */
  private async runScheduledExport(): Promise<void> {
    this.logger.log('Starting scheduled customer export');
    try {
      const result = await this.exportService.generateAllSiteData();
      this.logger.log(
        `Scheduled export completed: ${result.sitesProcessed} sites, status: ${result.status}`,
      );
    } catch (err: any) {
      this.logger.error(`Scheduled export failed: ${err.message}`);
    }
  }

  /**
   * Manual trigger for export (can be called from controller)
   */
  async triggerExport(): Promise<void> {
    this.logger.log('Manual export triggered');
    await this.runScheduledExport();
  }

  /**
   * Get scheduler status
   */
  getSchedulerStatus(): { enabled: boolean; cronSchedule: string; nextRun: Date | null } {
    let nextRun: Date | null = null;

    try {
      const job = this.schedulerRegistry.getCronJob('customer-export');
      if (job) {
        nextRun = job.nextDate().toJSDate();
      }
    } catch {
      // Job not registered
    }

    return {
      enabled: this.enabled,
      cronSchedule: this.cronSchedule,
      nextRun,
    };
  }
}
