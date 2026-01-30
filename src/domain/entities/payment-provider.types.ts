/**
 * Payment Provider Types and Enums
 */

export enum PaymentProviderType {
  EMAIL = 'EMAIL',
  API = 'API',
  WEBHOOK = 'WEBHOOK',
  FILE_DROP = 'FILE_DROP',
}

export enum IngestionStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  PARTIAL = 'PARTIAL',
}

export enum SyncStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  PARTIAL = 'PARTIAL',
  NO_DATA = 'NO_DATA',
}

export interface EmailParserConfig {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  credentialsEnvKey: string; // Name of env var prefix (NOT the actual credentials)
  mailbox: string;
  fromFilter?: string;
  subjectFilter?: string;
  attachmentType: 'CSV' | 'EXCEL';
  parserConfig: {
    skipRows?: number;
    headerRow?: number; // 0-indexed row number containing column headers
    delimiter?: string;
    columnMapping: {
      vrm: string;
      amount: string;
      startTime: string;
      expiryTime: string;
      siteIdentifier?: string;
      externalReference?: string;
    };
    dateFormat?: string;
    siteMapping?: Record<string, string>; // Maps provider site IDs to system site IDs
  };
}

export interface ApiProviderConfig {
  baseUrl: string;
  credentialsEnvKey: string;
  authType: 'BASIC' | 'BEARER' | 'API_KEY';
  endpoints: {
    payments?: string;
    status?: string;
  };
}

export interface WebhookProviderConfig {
  webhookSecret?: string;
  validateSignature: boolean;
  payloadMapping: {
    vrm: string;
    amount: string;
    startTime: string;
    expiryTime: string;
    siteIdentifier?: string;
  };
}

export interface FileDropProviderConfig {
  watchPath: string;
  filePattern: string;
  processedPath: string;
  parserConfig: EmailParserConfig['parserConfig'];
}

export type PaymentProviderConfig =
  | EmailParserConfig
  | ApiProviderConfig
  | WebhookProviderConfig
  | FileDropProviderConfig;

export interface SiteMappingConfig {
  emailSiteIdentifier?: string;
  apiSiteCode?: string;
  webhookSiteId?: string;
}

export interface AttachmentInfo {
  filename: string;
  contentType: string;
  size: number;
  checksum?: string;
}

export interface IngestionError {
  row?: number;
  field?: string;
  value?: any;
  message: string;
  timestamp: Date;
}

export interface ParsedPaymentRecord {
  vrm: string;
  amount: number;
  startTime: Date;
  expiryTime: Date;
  siteIdentifier?: string;
  externalReference?: string;
  rawRow?: any;
}
