import { CustomerExportStatus, CustomerExportError } from '../../domain/entities/customer-export-log.entity';

export interface ExportStatusDto {
  id: string;
  siteId: string | null;
  status: CustomerExportStatus;
  sitesProcessed: number;
  totalWhitelistRecords: number;
  totalPaymentRecords: number;
  errors: CustomerExportError[] | null;
  completedAt: Date | null;
  startedAt: Date;
}

export interface ManifestSiteEntry {
  siteId: string;
  siteName: string;
  file: string;
  whitelistCount: number;
  activePaymentsCount: number;
  generatedAt: string;
}

export interface ManifestDto {
  generatedAt: string;
  sites: ManifestSiteEntry[];
}
