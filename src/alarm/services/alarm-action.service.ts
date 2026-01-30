import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { Alarm } from '../../domain/entities';
import {
  ActionType,
  AlarmActionDto,
  TelegramActionConfig,
  WebhookActionConfig,
  AnnouncementActionConfig,
} from '../dto/alarm-action.dto';

const execAsync = promisify(exec);

export interface ActionResult {
  actionName: string;
  actionType: ActionType;
  success: boolean;
  message?: string;
  error?: string;
  executedAt: Date;
  durationMs?: number;
}

@Injectable()
export class AlarmActionService {
  private readonly logger = new Logger(AlarmActionService.name);
  
  // Telegram config from env
  private readonly telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  private readonly defaultTelegramChatId = process.env.TELEGRAM_ALERT_CHAT_ID;
  
  // Announcement script path
  private readonly announceScript = '/Users/noc/clawd/scripts/horn-announce.sh';

  constructor(private readonly httpService: HttpService) {}

  /**
   * Execute all actions for an alarm
   */
  async executeActions(
    alarm: Alarm,
    actions: AlarmActionDto[],
    context?: Record<string, any>,
  ): Promise<ActionResult[]> {
    const results: ActionResult[] = [];

    for (const action of actions) {
      if (action.enabled === false) continue;

      const start = Date.now();
      let result: ActionResult;

      try {
        switch (action.type) {
          case ActionType.TELEGRAM:
            result = await this.executeTelegram(alarm, action, context);
            break;
          case ActionType.WEBHOOK:
            result = await this.executeWebhook(alarm, action, context);
            break;
          case ActionType.ANNOUNCEMENT:
            result = await this.executeAnnouncement(alarm, action, context);
            break;
          default:
            result = {
              actionName: action.name,
              actionType: action.type,
              success: false,
              error: `Unknown action type: ${action.type}`,
              executedAt: new Date(),
            };
        }
      } catch (error: any) {
        result = {
          actionName: action.name,
          actionType: action.type,
          success: false,
          error: error.message,
          executedAt: new Date(),
        };
      }

      result.durationMs = Date.now() - start;
      results.push(result);

      this.logger.log(
        `Action ${action.name} (${action.type}): ${result.success ? 'success' : 'failed'}`,
      );
    }

    return results;
  }

  /**
   * Execute Telegram action
   */
  private async executeTelegram(
    alarm: Alarm,
    action: AlarmActionDto,
    context?: Record<string, any>,
  ): Promise<ActionResult> {
    const config = action.config as TelegramActionConfig;
    const chatId = config.chatId || this.defaultTelegramChatId;

    if (!this.telegramBotToken) {
      return {
        actionName: action.name,
        actionType: ActionType.TELEGRAM,
        success: false,
        error: 'TELEGRAM_BOT_TOKEN not configured',
        executedAt: new Date(),
      };
    }

    if (!chatId) {
      return {
        actionName: action.name,
        actionType: ActionType.TELEGRAM,
        success: false,
        error: 'No chat ID specified',
        executedAt: new Date(),
      };
    }

    // Build message
    let message = config.message || this.buildDefaultTelegramMessage(alarm);
    message = this.interpolateTemplate(message, { alarm, ...context });

    try {
      const url = `https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`;
      
      const response = await firstValueFrom(
        this.httpService.post(url, {
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
        }).pipe(
          timeout(10000),
          catchError((err) => {
            throw new Error(err.message);
          }),
        ),
      );

      return {
        actionName: action.name,
        actionType: ActionType.TELEGRAM,
        success: true,
        message: `Sent to chat ${chatId}`,
        executedAt: new Date(),
      };
    } catch (error: any) {
      return {
        actionName: action.name,
        actionType: ActionType.TELEGRAM,
        success: false,
        error: error.message,
        executedAt: new Date(),
      };
    }
  }

  /**
   * Execute webhook action
   */
  private async executeWebhook(
    alarm: Alarm,
    action: AlarmActionDto,
    context?: Record<string, any>,
  ): Promise<ActionResult> {
    const config = action.config as WebhookActionConfig;

    try {
      const body = config.body
        ? JSON.parse(this.interpolateTemplate(config.body, { alarm, ...context }))
        : { alarm: { id: alarm.id, message: alarm.message, severity: alarm.severity } };

      const response = await firstValueFrom(
        this.httpService.request({
          method: config.method || 'POST',
          url: config.url,
          headers: config.headers,
          data: config.method !== 'GET' ? body : undefined,
          params: config.method === 'GET' ? body : undefined,
          timeout: config.timeout || 30000,
        }).pipe(
          catchError((err) => {
            throw new Error(err.response?.data?.message || err.message);
          }),
        ),
      );

      return {
        actionName: action.name,
        actionType: ActionType.WEBHOOK,
        success: true,
        message: `HTTP ${response.status}`,
        executedAt: new Date(),
      };
    } catch (error: any) {
      return {
        actionName: action.name,
        actionType: ActionType.WEBHOOK,
        success: false,
        error: error.message,
        executedAt: new Date(),
      };
    }
  }

  /**
   * Execute announcement action (AI Horn / TTS)
   */
  private async executeAnnouncement(
    alarm: Alarm,
    action: AlarmActionDto,
    context?: Record<string, any>,
  ): Promise<ActionResult> {
    const config = action.config as AnnouncementActionConfig;

    let message = config.message || `Alert: ${alarm.message}`;
    message = this.interpolateTemplate(message, { alarm, ...context });
    
    const volume = config.volume ?? 50;
    const target = config.target || 'horn';

    try {
      // Use the horn-announce script
      const escapedMessage = message.replace(/"/g, '\\"');
      const cmd = `"${this.announceScript}" "${escapedMessage}" ${volume}`;
      
      const { stdout, stderr } = await execAsync(cmd, { timeout: 30000 });

      return {
        actionName: action.name,
        actionType: ActionType.ANNOUNCEMENT,
        success: true,
        message: `Announced at volume ${volume}`,
        executedAt: new Date(),
      };
    } catch (error: any) {
      return {
        actionName: action.name,
        actionType: ActionType.ANNOUNCEMENT,
        success: false,
        error: error.message,
        executedAt: new Date(),
      };
    }
  }

  /**
   * Build default Telegram message for alarm
   */
  private buildDefaultTelegramMessage(alarm: Alarm): string {
    const icon = alarm.severity === 'CRITICAL' ? '🚨' : 
                 alarm.severity === 'WARNING' ? '⚠️' : 'ℹ️';
    
    return `${icon} *Alarm: ${alarm.severity}*\n\n${alarm.message}\n\n_Triggered at ${new Date().toLocaleString()}_`;
  }

  /**
   * Interpolate template variables
   * Supports: {{alarm.message}}, {{alarm.severity}}, {{site.name}}, etc.
   */
  private interpolateTemplate(
    template: string,
    context: Record<string, any>,
  ): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const keys = path.trim().split('.');
      let value: any = context;
      
      for (const key of keys) {
        if (value == null) return match;
        value = value[key];
      }
      
      return value != null ? String(value) : match;
    });
  }

  /**
   * Test an action without a real alarm
   */
  async testAction(action: AlarmActionDto): Promise<ActionResult> {
    const mockAlarm = {
      id: 'test-alarm',
      message: 'This is a test alarm',
      severity: 'INFO',
      siteId: null,
      triggeredAt: new Date(),
    } as Alarm;

    const results = await this.executeActions(mockAlarm, [action], {
      site: { name: 'Test Site' },
      isTest: true,
    });

    return results[0];
  }
}
