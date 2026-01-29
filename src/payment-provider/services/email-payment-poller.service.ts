import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import {
  PaymentProvider,
  PaymentIngestionLog,
} from '../../domain/entities';
import {
  PaymentProviderType,
  EmailParserConfig,
  IngestionStatus,
  AttachmentInfo,
  SyncStatus,
} from '../../domain/entities/payment-provider.types';
import { PaymentProviderService } from './payment-provider.service';
import { PaymentProviderIngestionService } from './payment-provider-ingestion.service';
import { EmailPaymentParserService } from './email-payment-parser.service';

export interface FetchedEmail {
  messageId: string;
  subject: string;
  from: string;
  date: Date;
  body: string;
  attachments: Array<{
    filename: string;
    contentType: string;
    content: Buffer;
    size: number;
  }>;
}

@Injectable()
export class EmailPaymentPollerService implements OnModuleDestroy {
  private readonly logger = new Logger(EmailPaymentPollerService.name);
  private pollingInProgress = false;
  private activeConnections: Map<string, Imap> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly providerService: PaymentProviderService,
    private readonly ingestionService: PaymentProviderIngestionService,
    private readonly parserService: EmailPaymentParserService,
  ) {}

  onModuleDestroy() {
    // Close all active connections
    for (const [providerId, connection] of this.activeConnections) {
      try {
        connection.end();
        this.logger.log(`Closed IMAP connection for provider ${providerId}`);
      } catch {
        // Ignore errors during shutdown
      }
    }
    this.activeConnections.clear();
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async pollAllProviders(): Promise<void> {
    if (this.pollingInProgress) {
      this.logger.warn('Polling already in progress, skipping...');
      return;
    }

    this.pollingInProgress = true;
    this.logger.log('Starting email polling for all providers...');

    try {
      const providers = await this.providerService.findActiveProviders();
      const emailProviders = providers.filter(
        (p) => p.type === PaymentProviderType.EMAIL,
      );

      this.logger.log(`Found ${emailProviders.length} active email providers`);

      for (const provider of emailProviders) {
        try {
          await this.pollProvider(provider);
        } catch (err: any) {
          this.logger.error(
            `Failed to poll provider ${provider.name}: ${err.message}`,
            err.stack,
          );
        }
      }
    } finally {
      this.pollingInProgress = false;
      this.logger.log('Email polling completed');
    }
  }

  async pollProvider(provider: PaymentProvider): Promise<void> {
    this.logger.log(`Polling provider: ${provider.name}`);
    const config = provider.config as EmailParserConfig;

    try {
      const emails = await this.fetchEmails(provider.id, config);
      this.logger.log(`Fetched ${emails.length} emails for ${provider.name}`);

      let processedCount = 0;
      let errorCount = 0;

      for (const email of emails) {
        try {
          await this.processEmail(provider, email, config);
          processedCount++;
        } catch (err: any) {
          this.logger.error(
            `Failed to process email ${email.messageId}: ${err.message}`,
          );
          errorCount++;
        }
      }

      // Update provider sync status
      await this.providerService.updateSyncStatus(
        provider.id,
        errorCount === 0 ? SyncStatus.SUCCESS : processedCount > 0 ? SyncStatus.PARTIAL : SyncStatus.FAILED,
        {
          emailsProcessed: processedCount,
          errors: errorCount > 0 ? [`${errorCount} emails failed`] : undefined,
        },
      );
    } catch (err: any) {
      this.logger.error(
        `Failed to poll provider ${provider.name}: ${err.message}`,
        err.stack,
      );
      await this.providerService.updateSyncStatus(provider.id, SyncStatus.FAILED, {
        errors: [err.message],
      });
    }
  }

  async fetchEmails(
    providerId: string,
    config: EmailParserConfig,
  ): Promise<FetchedEmail[]> {
    return new Promise((resolve, reject) => {
      const emails: FetchedEmail[] = [];

      // Get credentials from environment variables
      const user = this.configService.get<string>(`${config.credentialsEnvKey}_USER`);
      const password = this.configService.get<string>(`${config.credentialsEnvKey}_PASS`);

      if (!user || !password) {
        reject(
          new Error(
            `Missing credentials for env key: ${config.credentialsEnvKey}`,
          ),
        );
        return;
      }

      const imap = new Imap({
        user,
        password,
        host: config.imapHost,
        port: config.imapPort,
        tls: config.imapSecure,
        tlsOptions: { rejectUnauthorized: false },
      });

      this.activeConnections.set(providerId, imap);

      imap.once('ready', () => {
        imap.openBox(config.mailbox || 'INBOX', false, (err, box) => {
          if (err) {
            imap.end();
            reject(err);
            return;
          }

          // Build search criteria
          const searchCriteria: any[] = ['UNSEEN'];

          if (config.fromFilter) {
            searchCriteria.push(['FROM', config.fromFilter]);
          }

          imap.search(searchCriteria, (searchErr, results) => {
            if (searchErr) {
              imap.end();
              reject(searchErr);
              return;
            }

            if (results.length === 0) {
              this.logger.log('No new emails found');
              imap.end();
              resolve([]);
              return;
            }

            this.logger.log(`Found ${results.length} unread emails`);

            const fetch = imap.fetch(results, { bodies: '', markSeen: true });
            let remaining = results.length;

            fetch.on('message', (msg) => {
              let buffer = '';

              msg.on('body', (stream) => {
                stream.on('data', (chunk) => {
                  buffer += chunk.toString('utf8');
                });
              });

              msg.once('end', async () => {
                try {
                  const parsed = await simpleParser(buffer);

                  // Check subject filter
                  if (
                    config.subjectFilter &&
                    !parsed.subject?.includes(config.subjectFilter)
                  ) {
                    remaining--;
                    if (remaining === 0) {
                      imap.end();
                      resolve(emails);
                    }
                    return;
                  }

                  const email: FetchedEmail = {
                    messageId: parsed.messageId || `${Date.now()}-${Math.random()}`,
                    subject: parsed.subject || '',
                    from: parsed.from?.text || '',
                    date: parsed.date || new Date(),
                    body: parsed.text || '',
                    attachments: (parsed.attachments || []).map((att) => ({
                      filename: att.filename || 'unknown',
                      contentType: att.contentType,
                      content: att.content,
                      size: att.size,
                    })),
                  };

                  emails.push(email);
                } catch (parseErr: any) {
                  this.logger.error(`Failed to parse email: ${parseErr.message}`);
                }

                remaining--;
                if (remaining === 0) {
                  imap.end();
                  resolve(emails);
                }
              });
            });

            fetch.once('error', (fetchErr) => {
              imap.end();
              reject(fetchErr);
            });

            fetch.once('end', () => {
              // Handled in message.once('end')
            });
          });
        });
      });

      imap.once('error', (err) => {
        this.activeConnections.delete(providerId);
        reject(err);
      });

      imap.once('end', () => {
        this.activeConnections.delete(providerId);
      });

      imap.connect();
    });
  }

  async processEmail(
    provider: PaymentProvider,
    email: FetchedEmail,
    config: EmailParserConfig,
  ): Promise<PaymentIngestionLog> {
    // Check for duplicate
    const isDuplicate = await this.providerService.checkEmailDuplicate(
      email.messageId,
    );
    if (isDuplicate) {
      this.logger.log(`Skipping duplicate email: ${email.messageId}`);
      throw new Error('Duplicate email');
    }

    // Create ingestion log
    const attachmentInfos: AttachmentInfo[] = email.attachments.map((att) => ({
      filename: att.filename,
      contentType: att.contentType,
      size: att.size,
    }));

    const log = await this.providerService.createIngestionLog({
      providerId: provider.id,
      source: 'EMAIL',
      emailMessageId: email.messageId,
      emailSubject: email.subject,
      emailFrom: email.from,
      emailDate: email.date,
      rawEmailBody: email.body,
      attachments: attachmentInfos,
      status: IngestionStatus.PROCESSING,
    });

    try {
      // Find matching attachment
      const attachment = email.attachments.find((att) => {
        const ext = att.filename.toLowerCase().split('.').pop();
        if (config.attachmentType === 'CSV') {
          return ext === 'csv';
        } else if (config.attachmentType === 'EXCEL') {
          return ext === 'xlsx' || ext === 'xls';
        }
        return false;
      });

      if (!attachment) {
        throw new Error(
          `No matching ${config.attachmentType} attachment found`,
        );
      }

      // Parse the attachment
      const parseResult = await this.parserService.parseAttachment(
        attachment.content,
        attachment.filename,
        config,
      );

      // Update log with parsed data
      await this.providerService.updateIngestionLog(log.id, {
        parsedData: parseResult.records,
        recordsFound: parseResult.totalRows,
        errors: parseResult.errors,
      });

      // Ingest the payments
      const ingestionResult = await this.ingestionService.ingestParsedRecords(
        provider,
        log.id,
        parseResult.records,
      );

      // Update log with final status
      const finalLog = await this.providerService.updateIngestionLog(log.id, {
        status:
          ingestionResult.failed > 0
            ? IngestionStatus.PARTIAL
            : IngestionStatus.COMPLETED,
        recordsIngested: ingestionResult.ingested,
        recordsSkipped: ingestionResult.skipped,
        recordsFailed: ingestionResult.failed,
        errors: [
          ...(parseResult.errors || []),
          ...(ingestionResult.errors || []),
        ],
        processedAt: new Date(),
      });

      this.logger.log(
        `Processed email ${email.messageId}: ${ingestionResult.ingested} ingested, ${ingestionResult.skipped} skipped, ${ingestionResult.failed} failed`,
      );

      return finalLog;
    } catch (err: any) {
      await this.providerService.updateIngestionLog(log.id, {
        status: IngestionStatus.FAILED,
        errors: [{ message: err.message, timestamp: new Date() }],
        processedAt: new Date(),
      });
      throw err;
    }
  }

  async testConnection(providerId: string): Promise<{ success: boolean; message: string }> {
    const provider = await this.providerService.findById(providerId);

    if (provider.type !== PaymentProviderType.EMAIL) {
      return { success: false, message: 'Provider is not an email type' };
    }

    const config = provider.config as EmailParserConfig;

    return new Promise((resolve) => {
      const user = this.configService.get<string>(`${config.credentialsEnvKey}_USER`);
      const password = this.configService.get<string>(`${config.credentialsEnvKey}_PASS`);

      if (!user || !password) {
        resolve({
          success: false,
          message: `Missing credentials for env key: ${config.credentialsEnvKey}`,
        });
        return;
      }

      const imap = new Imap({
        user,
        password,
        host: config.imapHost,
        port: config.imapPort,
        tls: config.imapSecure,
        tlsOptions: { rejectUnauthorized: false },
      });

      const timeout = setTimeout(() => {
        imap.end();
        resolve({ success: false, message: 'Connection timeout' });
      }, 10000);

      imap.once('ready', () => {
        clearTimeout(timeout);
        imap.openBox(config.mailbox || 'INBOX', true, (err, box) => {
          imap.end();
          if (err) {
            resolve({ success: false, message: `Failed to open mailbox: ${err.message}` });
          } else {
            resolve({
              success: true,
              message: `Connected successfully. Mailbox has ${box.messages.total} messages.`,
            });
          }
        });
      });

      imap.once('error', (err) => {
        clearTimeout(timeout);
        resolve({ success: false, message: `Connection failed: ${err.message}` });
      });

      imap.connect();
    });
  }

  async triggerManualSync(providerId: string): Promise<void> {
    const provider = await this.providerService.findById(providerId);

    if (provider.type !== PaymentProviderType.EMAIL) {
      throw new Error('Provider is not an email type');
    }

    await this.pollProvider(provider);
  }
}
