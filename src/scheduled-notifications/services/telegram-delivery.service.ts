import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type MessengerPlatform = 'telegram' | 'whatsapp' | 'slack' | 'discord' | 'email' | 'sms';

export interface MessengerRecipient {
  id: string;
  platform: MessengerPlatform;
  type: 'user' | 'group' | 'channel';
  displayName: string;
  username?: string;
}

// Legacy interface for backwards compatibility
export interface TelegramRecipient {
  id: number;
  type: 'user' | 'group';
  username?: string;
  firstName?: string;
  title?: string;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: number | string;
  platform?: MessengerPlatform;
  error?: string;
}

export interface MessengerStatus {
  platform: MessengerPlatform;
  connected: boolean;
  healthy: boolean;
}

@Injectable()
export class TelegramDeliveryService {
  private readonly logger = new Logger(TelegramDeliveryService.name);
  private readonly telegramBotUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.telegramBotUrl = this.configService.get<string>(
      'TELEGRAM_BOT_URL',
      'http://localhost:3001',
    );
  }

  async sendMessage(chatId: string, message: string): Promise<SendMessageResult> {
    try {
      const response = await fetch(`${this.telegramBotUrl}/api/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId,
          message,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Failed to send message to ${chatId}: ${errorText}`);
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }

      const result = await response.json();
      this.logger.log(`Message sent to ${chatId}: messageId=${result.messageId}`);

      return {
        success: true,
        messageId: result.messageId,
      };
    } catch (err: any) {
      this.logger.error(`Error sending message to ${chatId}: ${err.message}`, err.stack);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  async getRecipients(): Promise<TelegramRecipient[]> {
    try {
      const response = await fetch(`${this.telegramBotUrl}/api/recipients`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Failed to get recipients: ${errorText}`);
        return [];
      }

      const recipients = await response.json();
      this.logger.debug(`Retrieved ${recipients.length} recipients from telegram-bot`);

      return recipients;
    } catch (err: any) {
      this.logger.error(`Error getting recipients: ${err.message}`, err.stack);
      return [];
    }
  }

  async getGroups(): Promise<TelegramRecipient[]> {
    try {
      const response = await fetch(`${this.telegramBotUrl}/api/groups`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Failed to get groups: ${errorText}`);
        return [];
      }

      const groups = await response.json();
      this.logger.debug(`Retrieved ${groups.length} groups from telegram-bot`);

      return groups;
    } catch (err: any) {
      this.logger.error(`Error getting groups: ${err.message}`, err.stack);
      return [];
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.telegramBotUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      return response.ok;
    } catch (err: any) {
      this.logger.warn(`Telegram bot health check failed: ${err.message}`);
      return false;
    }
  }

  // ============ Multi-Messenger Support ============

  /**
   * Get all messenger platform statuses
   */
  async getMessengerStatuses(): Promise<{
    healthy: boolean;
    platforms: MessengerStatus[];
  }> {
    try {
      const response = await fetch(`${this.telegramBotUrl}/api/messengers/status`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        return { healthy: false, platforms: [] };
      }

      return response.json();
    } catch (err: any) {
      this.logger.error(`Error getting messenger statuses: ${err.message}`);
      return { healthy: false, platforms: [] };
    }
  }

  /**
   * Get all recipients across all messenger platforms
   */
  async getAllMessengerRecipients(): Promise<MessengerRecipient[]> {
    try {
      const response = await fetch(`${this.telegramBotUrl}/api/messengers/recipients`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        return [];
      }

      return response.json();
    } catch (err: any) {
      this.logger.error(`Error getting messenger recipients: ${err.message}`);
      return [];
    }
  }

  /**
   * Send message via a specific messenger platform
   */
  async sendViaMessenger(
    platform: MessengerPlatform,
    chatId: string,
    message: string,
  ): Promise<SendMessageResult> {
    try {
      const response = await fetch(`${this.telegramBotUrl}/api/messengers/${platform}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          platform,
          error: `HTTP ${response.status}: ${errorText}`,
        };
      }

      const result = await response.json();
      return {
        success: result.success,
        messageId: result.messageId,
        platform,
        error: result.error,
      };
    } catch (err: any) {
      this.logger.error(`Error sending via ${platform}: ${err.message}`);
      return {
        success: false,
        platform,
        error: err.message,
      };
    }
  }

  /**
   * Send message to multiple recipients across platforms
   */
  async sendToMultiple(
    recipients: Array<{ platform: MessengerPlatform; chatId: string }>,
    message: string,
  ): Promise<{
    total: number;
    successful: number;
    failed: number;
    results: SendMessageResult[];
  }> {
    try {
      const response = await fetch(`${this.telegramBotUrl}/api/messengers/send-multi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients, message }),
      });

      if (!response.ok) {
        return {
          total: recipients.length,
          successful: 0,
          failed: recipients.length,
          results: [],
        };
      }

      return response.json();
    } catch (err: any) {
      this.logger.error(`Error sending to multiple recipients: ${err.message}`);
      return {
        total: recipients.length,
        successful: 0,
        failed: recipients.length,
        results: [],
      };
    }
  }
}
