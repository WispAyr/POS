import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { PaymentProviderService } from './payment-provider.service';
import {
  PaymentProviderType,
  EmailParserConfig,
} from '../../domain/entities/payment-provider.types';

interface MondayItem {
  id: string;
  name: string;
  column_values: Array<{
    id: string;
    text: string;
    value?: string;
  }>;
}

interface MondayBoardResponse {
  data: {
    boards: Array<{
      items_page: {
        items: MondayItem[];
      };
    }>;
  };
}

@Injectable()
export class PaymentProviderMondayService {
  private readonly logger = new Logger(PaymentProviderMondayService.name);
  private readonly mondayApiUrl = 'https://api.monday.com/v2';

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly providerService: PaymentProviderService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async syncProvidersFromMonday(): Promise<void> {
    const apiKey = this.configService.get<string>('MONDAY_API_KEY');
    const boardId = this.configService.get<string>('MONDAY_PAYMENT_PROVIDERS_BOARD_ID');

    if (!apiKey || !boardId) {
      this.logger.debug('Monday.com integration not configured, skipping sync');
      return;
    }

    this.logger.log('Starting Monday.com payment provider sync...');

    try {
      const items = await this.fetchBoardItems(apiKey, boardId);
      this.logger.log(`Found ${items.length} items in Monday.com board`);

      for (const item of items) {
        try {
          await this.syncProvider(item);
        } catch (err: any) {
          this.logger.error(
            `Failed to sync provider from Monday item ${item.id}: ${err.message}`,
          );
        }
      }

      this.logger.log('Monday.com payment provider sync completed');
    } catch (err: any) {
      this.logger.error(`Monday.com sync failed: ${err.message}`, err.stack);
    }
  }

  private async fetchBoardItems(
    apiKey: string,
    boardId: string,
  ): Promise<MondayItem[]> {
    const query = `
      query {
        boards(ids: [${boardId}]) {
          items_page(limit: 100) {
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

    const response = await firstValueFrom(
      this.httpService.post<MondayBoardResponse>(
        this.mondayApiUrl,
        { query },
        {
          headers: {
            Authorization: apiKey,
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    return response.data.data.boards[0]?.items_page?.items || [];
  }

  private async syncProvider(item: MondayItem): Promise<void> {
    // Extract column values
    const getColumnValue = (columnId: string): string => {
      const col = item.column_values.find((c) => c.id === columnId);
      return col?.text || '';
    };

    const getColumnDropdown = (columnId: string): string => {
      const col = item.column_values.find((c) => c.id === columnId);
      if (col?.value) {
        try {
          const parsed = JSON.parse(col.value);
          return parsed.label || parsed.text || col.text || '';
        } catch {
          return col.text || '';
        }
      }
      return col?.text || '';
    };

    // Map Monday.com columns to provider config
    // Column IDs should be configured or discovered from the board schema
    const providerName = item.name;
    const typeStr = getColumnDropdown('type') || getColumnDropdown('status5');
    const status = getColumnDropdown('status') || getColumnDropdown('status8');
    const imapHost = getColumnValue('imap_host') || getColumnValue('text');
    const imapPort = getColumnValue('imap_port') || getColumnValue('numbers');
    const mailbox = getColumnValue('mailbox') || getColumnValue('text0');
    const credentialsEnvKey = getColumnValue('credentials_env_key') || getColumnValue('text1');
    const fromFilter = getColumnValue('from_filter') || getColumnValue('text2');
    const subjectFilter = getColumnValue('subject_filter') || getColumnValue('text3');
    const attachmentType = getColumnDropdown('attachment_type') || getColumnDropdown('status3');
    const pollInterval = getColumnValue('poll_interval') || getColumnValue('numbers0');

    // Determine provider type
    let type: PaymentProviderType;
    switch (typeStr.toUpperCase()) {
      case 'EMAIL':
        type = PaymentProviderType.EMAIL;
        break;
      case 'API':
        type = PaymentProviderType.API;
        break;
      case 'WEBHOOK':
        type = PaymentProviderType.WEBHOOK;
        break;
      case 'FILE_DROP':
        type = PaymentProviderType.FILE_DROP;
        break;
      default:
        this.logger.warn(`Unknown provider type "${typeStr}" for ${providerName}, defaulting to EMAIL`);
        type = PaymentProviderType.EMAIL;
    }

    // Determine if active
    const isActive =
      status.toLowerCase() === 'active' ||
      status.toLowerCase() === 'enabled' ||
      status === '';

    // Build config based on type
    let config: EmailParserConfig | null = null;

    if (type === PaymentProviderType.EMAIL) {
      if (!imapHost || !credentialsEnvKey) {
        this.logger.warn(
          `Skipping provider ${providerName}: missing required EMAIL config`,
        );
        return;
      }

      config = {
        imapHost,
        imapPort: parseInt(imapPort) || 993,
        imapSecure: true,
        credentialsEnvKey,
        mailbox: mailbox || 'INBOX',
        fromFilter: fromFilter || undefined,
        subjectFilter: subjectFilter || undefined,
        attachmentType:
          attachmentType.toUpperCase() === 'EXCEL' ? 'EXCEL' : 'CSV',
        parserConfig: {
          skipRows: 0,
          delimiter: ',',
          columnMapping: {
            vrm: 'Registration',
            amount: 'Amount',
            startTime: 'Start Time',
            expiryTime: 'End Time',
            siteIdentifier: 'Car Park',
          },
          dateFormat: 'DD/MM/YYYY HH:mm',
        },
      };
    }

    if (!config) {
      this.logger.warn(`Skipping provider ${providerName}: unsupported type ${type}`);
      return;
    }

    // Check if provider already exists
    const existing = await this.providerService.findByMondayItemId(item.id);

    if (existing) {
      // Update existing provider
      await this.providerService.update(existing.id, {
        name: providerName,
        type,
        config,
        active: isActive,
        pollIntervalMinutes: parseInt(pollInterval) || 5,
      });
      this.logger.log(`Updated provider from Monday.com: ${providerName}`);
    } else {
      // Create new provider
      await this.providerService.create({
        name: providerName,
        type,
        config,
        active: isActive,
        mondayItemId: item.id,
        pollIntervalMinutes: parseInt(pollInterval) || 5,
      });
      this.logger.log(`Created provider from Monday.com: ${providerName}`);
    }
  }

  async triggerSync(): Promise<{ synced: number; errors: string[] }> {
    const apiKey = this.configService.get<string>('MONDAY_API_KEY');
    const boardId = this.configService.get<string>('MONDAY_PAYMENT_PROVIDERS_BOARD_ID');

    if (!apiKey || !boardId) {
      throw new Error('Monday.com integration not configured');
    }

    const items = await this.fetchBoardItems(apiKey, boardId);
    let synced = 0;
    const errors: string[] = [];

    for (const item of items) {
      try {
        await this.syncProvider(item);
        synced++;
      } catch (err: any) {
        errors.push(`${item.name}: ${err.message}`);
      }
    }

    return { synced, errors };
  }
}
