/**
 * Alarm System Enums
 */

export enum AlarmType {
  NO_PAYMENT_DATA = 'NO_PAYMENT_DATA',
  ANPR_POLLER_FAILURE = 'ANPR_POLLER_FAILURE',
  HIGH_ENFORCEMENT_CANDIDATES = 'HIGH_ENFORCEMENT_CANDIDATES',
  SITE_OFFLINE = 'SITE_OFFLINE',
  PAYMENT_SYNC_FAILURE = 'PAYMENT_SYNC_FAILURE',
  QR_WHITELIST_SYNC_FAILURE = 'QR_WHITELIST_SYNC_FAILURE',
  CUSTOM = 'CUSTOM',
}

export enum AlarmSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

export enum AlarmStatus {
  TRIGGERED = 'TRIGGERED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  RESOLVED = 'RESOLVED',
}

export enum NotificationChannel {
  IN_APP = 'IN_APP',
  EMAIL = 'EMAIL',
  SMS = 'SMS',
}

export enum NotificationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  READ = 'READ',
}

export interface AlarmConditions {
  checkTime?: string; // e.g., '03:00'
  lookbackHours?: number;
  noMovementMinutes?: number;
  thresholdCount?: number;
  timeWindowMinutes?: number;
  maxConsecutiveFailures?: number;
  customQuery?: string;
}
