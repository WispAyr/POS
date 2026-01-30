import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AlarmService } from '../src/alarm/services/alarm.service';
import {
  AlarmType,
  AlarmSeverity,
  NotificationChannel,
} from '../src/domain/entities/alarm.enums';

const defaultDefinitions = [
  {
    name: 'No Payment Data by 3am',
    description:
      'Alerts when no payment data has been received in the last 24 hours. Runs daily at 3am.',
    type: AlarmType.NO_PAYMENT_DATA,
    severity: AlarmSeverity.CRITICAL,
    conditions: {
      checkTime: '03:00',
      lookbackHours: 24,
    },
    cronSchedule: '0 3 * * *',
    enabled: true,
    notificationChannels: [NotificationChannel.IN_APP],
  },
  {
    name: 'ANPR Poller Failures',
    description:
      'Alerts when the ANPR poller has had multiple consecutive failures. Event-based trigger.',
    type: AlarmType.ANPR_POLLER_FAILURE,
    severity: AlarmSeverity.CRITICAL,
    conditions: {
      maxConsecutiveFailures: 3,
    },
    cronSchedule: null,
    enabled: true,
    notificationChannels: [NotificationChannel.IN_APP],
  },
  {
    name: 'High Enforcement Queue',
    description:
      'Alerts when there are more than 50 enforcement candidates in the last hour. Runs every 30 minutes.',
    type: AlarmType.HIGH_ENFORCEMENT_CANDIDATES,
    severity: AlarmSeverity.WARNING,
    conditions: {
      thresholdCount: 50,
      timeWindowMinutes: 60,
    },
    cronSchedule: '*/30 * * * *',
    enabled: true,
    notificationChannels: [NotificationChannel.IN_APP],
  },
  {
    name: 'Site Offline Alert',
    description:
      'Alerts when a site has not received any movements for 2 hours. Runs every 15 minutes.',
    type: AlarmType.SITE_OFFLINE,
    severity: AlarmSeverity.CRITICAL,
    conditions: {
      noMovementMinutes: 120,
    },
    cronSchedule: '*/15 * * * *',
    enabled: false, // Disabled by default - needs site configuration
    notificationChannels: [NotificationChannel.IN_APP],
  },
  {
    name: 'Payment Sync Failure',
    description:
      'Alerts when a payment provider sync has failed. Event-based trigger.',
    type: AlarmType.PAYMENT_SYNC_FAILURE,
    severity: AlarmSeverity.WARNING,
    conditions: {},
    cronSchedule: null,
    enabled: true,
    notificationChannels: [NotificationChannel.IN_APP],
  },
  {
    name: 'QR Whitelist Sync Failure',
    description:
      'Alerts when QR whitelist ingestion from Monday.com fails. Event-based trigger.',
    type: AlarmType.QR_WHITELIST_SYNC_FAILURE,
    severity: AlarmSeverity.WARNING,
    conditions: {},
    cronSchedule: null,
    enabled: true,
    notificationChannels: [NotificationChannel.IN_APP],
  },
];

async function seed() {
  console.log('Starting alarm definitions seed...');

  const app = await NestFactory.createApplicationContext(AppModule);
  const alarmService = app.get(AlarmService);

  try {
    const existingDefinitions = await alarmService.getAllDefinitions();
    console.log(`Found ${existingDefinitions.length} existing definitions`);

    for (const def of defaultDefinitions) {
      // Check if definition already exists by name
      const existing = existingDefinitions.find((d) => d.name === def.name);

      if (existing) {
        console.log(`Skipping existing definition: ${def.name}`);
        continue;
      }

      await alarmService.createDefinition({
        name: def.name,
        description: def.description,
        type: def.type,
        severity: def.severity,
        conditions: def.conditions,
        cronSchedule: def.cronSchedule ?? undefined,
        enabled: def.enabled,
        notificationChannels: def.notificationChannels,
      });

      console.log(`Created definition: ${def.name}`);
    }

    console.log('Alarm definitions seed completed successfully');
  } catch (error) {
    console.error('Failed to seed alarm definitions:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

seed();
