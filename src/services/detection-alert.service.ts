import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { EnrichedDetection } from './protect-detection.service';
import type { MovementAiMetadata } from './anpr-enrichment.service';

const execAsync = promisify(exec);

export interface AlertConfig {
  enabled: boolean;
  minConfidence: number;
  alertTypes: ('person' | 'vehicle' | 'animal')[];
  quietHoursStart?: number; // 0-23
  quietHoursEnd?: number;   // 0-23
  telegramChatId?: string;
  announceOnDetection?: boolean;
  announceCameras?: string[];
}

@Injectable()
export class DetectionAlertService {
  private readonly logger = new Logger(DetectionAlertService.name);
  
  private config: AlertConfig = {
    enabled: process.env.DETECTION_ALERTS_ENABLED === 'true',
    minConfidence: 0.7,
    alertTypes: ['person', 'vehicle'],
    quietHoursStart: 23, // 11 PM
    quietHoursEnd: 7,    // 7 AM
    telegramChatId: process.env.TELEGRAM_ALERT_CHAT_ID,
    announceOnDetection: false,
  };

  /**
   * Handle enriched detection events from Protect
   */
  @OnEvent('protect.detection.enriched')
  async handleEnrichedDetection(detection: EnrichedDetection): Promise<void> {
    if (!this.config.enabled) return;
    
    // Check quiet hours
    if (this.isQuietHours()) {
      this.logger.debug('Skipping alert during quiet hours');
      return;
    }

    // Check if this detection type should trigger alert
    if (!this.config.alertTypes.includes(detection.type as any)) {
      return;
    }

    // Check confidence threshold
    if (detection.score < this.config.minConfidence) {
      return;
    }

    // Build alert message
    const message = this.buildAlertMessage(detection);
    
    // Send to configured channels
    await this.sendAlert(message, detection);
  }

  /**
   * Handle movement enrichment events from ANPR
   */
  @OnEvent('movement.enriched')
  async handleMovementEnriched(event: {
    movementId: string;
    metadata: MovementAiMetadata;
  }) {
    // Log significant findings
    const { metadata } = event;
    
    if (metadata.summary.people > 0) {
      this.logger.log(
        `Movement ${event.movementId}: Detected ${metadata.summary.people} people in vehicle`,
      );
    }

    if (metadata.summary.vehicleTypes?.length) {
      this.logger.log(
        `Movement ${event.movementId}: Vehicle type(s): ${metadata.summary.vehicleTypes.join(', ')}`,
      );
    }

    // Could trigger alerts for specific conditions:
    // - Commercial vehicles in residential areas
    // - Multiple occupants
    // - Specific vehicle types
  }

  /**
   * Build alert message from detection
   */
  private buildAlertMessage(detection: EnrichedDetection): string {
    const time = detection.timestamp.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });

    let message = `🚨 *Detection Alert*\n`;
    message += `📍 ${detection.cameraName || 'Unknown camera'}\n`;
    message += `⏰ ${time}\n\n`;

    if (detection.description) {
      message += `📝 ${detection.description}\n`;
    } else {
      message += `Type: ${detection.type}\n`;
    }

    if (detection.aiAnalysis?.summary) {
      const s = detection.aiAnalysis.summary;
      if (s.people > 0) message += `👥 People: ${s.people}\n`;
      if (s.vehicles > 0) message += `🚗 Vehicles: ${s.vehicles}\n`;
      if (s.vehicleTypes?.length) {
        message += `Types: ${s.vehicleTypes.join(', ')}\n`;
      }
    }

    return message;
  }

  /**
   * Send alert to configured channels
   */
  private async sendAlert(message: string, detection: EnrichedDetection) {
    // Log alert
    this.logger.log(`Alert: ${detection.description || detection.type} at ${detection.cameraName}`);

    // Send via Telegram if configured
    if (this.config.telegramChatId) {
      await this.sendTelegramAlert(message, detection.thumbnail);
    }

    // Make announcement if configured
    if (this.config.announceOnDetection) {
      await this.makeAnnouncement(detection);
    }
  }

  /**
   * Send alert via Telegram
   */
  private async sendTelegramAlert(message: string, thumbnail?: Buffer) {
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = this.config.telegramChatId;
      
      if (!token || !chatId) return;

      if (thumbnail) {
        // Send with photo
        const fs = await import('fs');
        const tempFile = `/tmp/alert-${Date.now()}.jpg`;
        fs.writeFileSync(tempFile, thumbnail);
        
        const cmd = `curl -s -X POST "https://api.telegram.org/bot${token}/sendPhoto" ` +
          `-F "chat_id=${chatId}" ` +
          `-F "photo=@${tempFile}" ` +
          `-F "caption=${message.replace(/"/g, '\\"')}" ` +
          `-F "parse_mode=Markdown"`;
        
        await execAsync(cmd);
        try { fs.unlinkSync(tempFile); } catch {}
      } else {
        // Text only
        const cmd = `curl -s -X POST "https://api.telegram.org/bot${token}/sendMessage" ` +
          `-d "chat_id=${chatId}" ` +
          `-d "text=${encodeURIComponent(message)}" ` +
          `-d "parse_mode=Markdown"`;
        
        await execAsync(cmd);
      }
    } catch (error) {
      this.logger.error(`Failed to send Telegram alert: ${error.message}`);
    }
  }

  /**
   * Make audio announcement
   */
  private async makeAnnouncement(detection: EnrichedDetection) {
    try {
      const announceScript = '/Users/noc/clawd/scripts/horn-announce.sh';
      const message = detection.description || `${detection.type} detected`;
      
      const cmd = `"${announceScript}" "${message}" 30`;
      await execAsync(cmd);
    } catch (error) {
      this.logger.error(`Failed to make announcement: ${error.message}`);
    }
  }

  /**
   * Check if current time is in quiet hours
   */
  private isQuietHours(): boolean {
    const { quietHoursStart, quietHoursEnd } = this.config;
    if (quietHoursStart === undefined || quietHoursEnd === undefined) {
      return false;
    }

    const hour = new Date().getHours();
    
    if (quietHoursStart < quietHoursEnd) {
      // Same day (e.g., 9-17)
      return hour >= quietHoursStart && hour < quietHoursEnd;
    } else {
      // Crosses midnight (e.g., 23-7)
      return hour >= quietHoursStart || hour < quietHoursEnd;
    }
  }

  /**
   * Update alert configuration
   */
  updateConfig(config: Partial<AlertConfig>) {
    this.config = { ...this.config, ...config };
    this.logger.log(`Alert config updated: ${JSON.stringify(config)}`);
  }

  /**
   * Get current configuration
   */
  getConfig(): AlertConfig {
    return { ...this.config };
  }
}
