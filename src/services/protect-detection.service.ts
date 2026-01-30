import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import { HailoService, HailoAnalysisResult } from './hailo.service';

const execAsync = promisify(exec);

export interface ProtectDetection {
  id: string;
  cameraId: string;
  cameraName?: string;
  type: 'person' | 'vehicle' | 'animal' | 'package' | 'motion';
  timestamp: Date;
  score: number;
  thumbnail?: Buffer;
  metadata?: Record<string, any>;
}

export interface EnrichedDetection extends ProtectDetection {
  aiAnalysis?: HailoAnalysisResult;
  description?: string;
}

export interface ProtectCamera {
  id: string;
  name: string;
  type: string;
  state: string;
  isSmartDetectEnabled: boolean;
}

@Injectable()
export class ProtectDetectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProtectDetectionService.name);
  
  // UniFi Protect config
  private readonly nvrHost = process.env.PROTECT_HOST || '10.10.10.2';
  private readonly nvrUsername = process.env.PROTECT_USERNAME || 'localconnectsystems';
  private readonly nvrPassword = process.env.PROTECT_PASSWORD || 'RBTeeyKM142!';
  
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly pollIntervalMs = 30000; // 30 seconds
  private lastEventTimestamp: number = Date.now();
  private isPolling = false;
  private cameras: Map<string, ProtectCamera> = new Map();
  
  // Throttling to prevent overwhelming Hailo
  private readonly maxEnrichmentsPerPoll = 5;
  private recentlyEnriched: Set<string> = new Set();
  private enrichmentCooldownMs = 60000; // 1 minute cooldown per camera

  constructor(
    private readonly hailoService: HailoService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    // Load camera list (non-blocking, graceful failure)
    try {
      await this.refreshCameras();
    } catch (error: any) {
      this.logger.warn(`Failed to load cameras on init: ${error.message}`);
      // Continue anyway - can retry later
    }
    
    // Start polling for detection events
    if (process.env.PROTECT_DETECTION_ENABLED !== 'false') {
      this.startPolling();
      this.logger.log('Protect detection polling started');
    }
  }

  onModuleDestroy() {
    this.stopPolling();
  }

  /**
   * Start polling for detection events
   */
  startPolling() {
    if (this.pollInterval) return;
    
    this.pollInterval = setInterval(() => this.poll(), this.pollIntervalMs);
    this.logger.log(`Detection polling started (every ${this.pollIntervalMs / 1000}s)`);
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      this.logger.log('Detection polling stopped');
    }
  }

  /**
   * Periodic Hailo health check (every 5 minutes)
   */
  private hailoCheckCounter = 0;
  private async maybeCheckHailoHealth() {
    this.hailoCheckCounter++;
    // Check every 10 polls (5 minutes at 30s intervals)
    if (this.hailoCheckCounter % 10 === 0) {
      try {
        await this.hailoService.healthCheck();
      } catch {
        // Ignore - health check handles its own logging
      }
    }
  }

  /**
   * Poll for new detection events
   */
  private async poll() {
    // Periodic Hailo connectivity check
    await this.maybeCheckHailoHealth();
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const events = await this.getRecentDetections();
      
      // Clean up old cooldowns
      const now = Date.now();
      for (const key of this.recentlyEnriched) {
        const [, timestamp] = key.split(':');
        if (now - parseInt(timestamp, 10) > this.enrichmentCooldownMs) {
          this.recentlyEnriched.delete(key);
        }
      }

      let enrichmentCount = 0;
      
      for (const event of events) {
        // Emit raw event
        this.eventEmitter.emit('protect.detection', event);
        
        // Throttle enrichments
        const cooldownKey = `${event.cameraId}:${Math.floor(now / this.enrichmentCooldownMs)}`;
        const shouldEnrich = 
          this.hailoService.isAvailable() && 
          event.thumbnail &&
          enrichmentCount < this.maxEnrichmentsPerPoll &&
          !this.recentlyEnriched.has(cooldownKey);

        if (shouldEnrich) {
          this.recentlyEnriched.add(cooldownKey);
          enrichmentCount++;
          
          // Queue enrichment (don't await to allow batching)
          this.enrichDetection(event).then((enriched) => {
            this.eventEmitter.emit('protect.detection.enriched', enriched);
          }).catch((err) => {
            this.logger.debug(`Enrichment failed: ${err.message}`);
          });
        }
      }

      if (events.length > 0) {
        this.logger.debug(`Processed ${events.length} detections, enriched ${enrichmentCount}`);
      }
    } catch (error: any) {
      this.logger.error(`Detection poll failed: ${error.message}`);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Refresh camera list from Protect
   */
  async refreshCameras(): Promise<ProtectCamera[]> {
    try {
      const auth = await this.authenticate();
      if (!auth) return [];

      const cmd = `curl -sk "https://${this.nvrHost}/proxy/protect/api/cameras" ` +
        `-H "X-CSRF-Token: ${auth.csrf}" ` +
        `-b ${auth.cookieFile}`;

      const { stdout } = await execAsync(cmd);
      const cameras = JSON.parse(stdout);

      this.cameras.clear();
      for (const cam of cameras) {
        this.cameras.set(cam.id, {
          id: cam.id,
          name: cam.name,
          type: cam.type,
          state: cam.state,
          isSmartDetectEnabled: cam.featureFlags?.hasSmartDetect || false,
        });
      }

      this.logger.debug(`Loaded ${this.cameras.size} cameras`);
      return Array.from(this.cameras.values());
    } catch (error) {
      this.logger.error(`Failed to load cameras: ${error.message}`);
      return [];
    }
  }

  /**
   * Get recent detection events from Protect
   */
  async getRecentDetections(
    sinceMs: number = this.lastEventTimestamp,
  ): Promise<ProtectDetection[]> {
    try {
      const auth = await this.authenticate();
      if (!auth) return [];

      // Fetch events since last poll
      const end = Date.now();
      const start = sinceMs;
      
      const cmd = `curl -sk "https://${this.nvrHost}/proxy/protect/api/events?start=${start}&end=${end}&types=smartDetectZone,smartDetectLine" ` +
        `-H "X-CSRF-Token: ${auth.csrf}" ` +
        `-b ${auth.cookieFile}`;

      const { stdout } = await execAsync(cmd);
      const events = JSON.parse(stdout);

      const detections: ProtectDetection[] = [];
      
      for (const event of events) {
        // Skip if we've already processed this event
        if (event.start <= this.lastEventTimestamp) continue;

        const detection: ProtectDetection = {
          id: event.id,
          cameraId: event.camera,
          cameraName: this.cameras.get(event.camera)?.name,
          type: this.mapEventType(event.smartDetectTypes?.[0] || event.type),
          timestamp: new Date(event.start),
          score: event.score || 0,
          metadata: {
            duration: event.end ? event.end - event.start : null,
            smartDetectTypes: event.smartDetectTypes,
            zones: event.smartDetectZones,
          },
        };

        // Try to get thumbnail
        try {
          const thumbnail = await this.getEventThumbnail(event.id, auth);
          if (thumbnail) {
            detection.thumbnail = thumbnail;
          }
        } catch {
          // Thumbnail optional
        }

        detections.push(detection);
      }

      // Update last timestamp
      if (detections.length > 0) {
        this.lastEventTimestamp = Math.max(
          ...detections.map((d) => d.timestamp.getTime()),
        );
      }

      return detections;
    } catch (error) {
      this.logger.error(`Failed to get detections: ${error.message}`);
      return [];
    }
  }

  /**
   * Get a specific camera's latest snapshot
   */
  async getCameraSnapshot(cameraId: string): Promise<Buffer | null> {
    try {
      const auth = await this.authenticate();
      if (!auth) return null;

      const snapshotFile = `/tmp/protect-snap-${cameraId}-${Date.now()}.jpg`;
      
      const cmd = `curl -sk "https://${this.nvrHost}/proxy/protect/api/cameras/${cameraId}/snapshot?ts=${Date.now()}" ` +
        `-H "X-CSRF-Token: ${auth.csrf}" ` +
        `-b ${auth.cookieFile} ` +
        `-o ${snapshotFile}`;

      await execAsync(cmd);

      const buffer = fs.readFileSync(snapshotFile);
      try { fs.unlinkSync(snapshotFile); } catch {}

      return buffer;
    } catch (error) {
      this.logger.error(`Failed to get snapshot: ${error.message}`);
      return null;
    }
  }

  /**
   * Get event thumbnail
   */
  private async getEventThumbnail(
    eventId: string,
    auth: { csrf: string; cookieFile: string },
  ): Promise<Buffer | null> {
    try {
      const thumbFile = `/tmp/protect-thumb-${eventId}.jpg`;
      
      const cmd = `curl -sk "https://${this.nvrHost}/proxy/protect/api/events/${eventId}/thumbnail" ` +
        `-H "X-CSRF-Token: ${auth.csrf}" ` +
        `-b ${auth.cookieFile} ` +
        `-o ${thumbFile}`;

      await execAsync(cmd);

      if (fs.existsSync(thumbFile)) {
        const buffer = fs.readFileSync(thumbFile);
        try { fs.unlinkSync(thumbFile); } catch {}
        return buffer;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Enrich a detection with Hailo AI analysis
   * Gracefully returns unenriched detection if Hailo unavailable
   */
  async enrichDetection(detection: ProtectDetection): Promise<EnrichedDetection> {
    const enriched: EnrichedDetection = { ...detection };

    if (!detection.thumbnail) {
      return enriched;
    }

    // Skip if Hailo not available
    if (!this.hailoService.isAvailable()) {
      return enriched;
    }

    try {
      // Analyze with Hailo
      const analysis = await this.hailoService.analyzeBuffer(detection.thumbnail);
      enriched.aiAnalysis = analysis;

      // Generate human-readable description
      if (analysis.success && analysis.summary) {
        enriched.description = this.generateDescription(detection, analysis);
      }
    } catch (error: any) {
      // Log but don't fail - return unenriched detection
      this.logger.debug(`Enrichment failed (graceful): ${error.message}`);
    }

    return enriched;
  }

  /**
   * Generate human-readable description from analysis
   */
  private generateDescription(
    detection: ProtectDetection,
    analysis: HailoAnalysisResult,
  ): string {
    const parts: string[] = [];
    const summary = analysis.summary!;

    if (summary.people > 0) {
      parts.push(`${summary.people} ${summary.people === 1 ? 'person' : 'people'}`);
    }

    if (summary.vehicles > 0) {
      if (summary.vehicleTypes?.length) {
        parts.push(summary.vehicleTypes.join(', '));
      } else {
        parts.push(`${summary.vehicles} vehicle${summary.vehicles > 1 ? 's' : ''}`);
      }
    }

    if (parts.length === 0) {
      parts.push('motion detected');
    }

    const location = detection.cameraName || 'camera';
    return `${parts.join(', ')} at ${location}`;
  }

  /**
   * Authenticate with Protect NVR
   */
  private async authenticate(): Promise<{ csrf: string; cookieFile: string } | null> {
    try {
      const cookieFile = '/tmp/protect-cookies.txt';
      const headerFile = '/tmp/protect-headers.txt';

      const authCmd = `curl -sk -X POST "https://${this.nvrHost}/api/auth/login" ` +
        `-H "Content-Type: application/json" ` +
        `-d '{"username":"${this.nvrUsername}","password":"${this.nvrPassword}"}' ` +
        `-c ${cookieFile} -D ${headerFile}`;

      await execAsync(authCmd);

      const headers = fs.readFileSync(headerFile, 'utf8');
      const csrfMatch = headers.match(/x-csrf-token:\s*([^\r\n]+)/i);
      const csrf = csrfMatch ? csrfMatch[1].trim() : '';

      return { csrf, cookieFile };
    } catch (error) {
      this.logger.error(`Protect auth failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Map Protect event types to our types
   */
  private mapEventType(type: string): ProtectDetection['type'] {
    switch (type?.toLowerCase()) {
      case 'person':
        return 'person';
      case 'vehicle':
      case 'car':
        return 'vehicle';
      case 'animal':
        return 'animal';
      case 'package':
        return 'package';
      default:
        return 'motion';
    }
  }

  /**
   * Manually trigger analysis on a detection
   */
  async analyzeDetection(cameraId: string): Promise<EnrichedDetection | null> {
    const snapshot = await this.getCameraSnapshot(cameraId);
    if (!snapshot) return null;

    const detection: ProtectDetection = {
      id: `manual-${Date.now()}`,
      cameraId,
      cameraName: this.cameras.get(cameraId)?.name,
      type: 'motion',
      timestamp: new Date(),
      score: 1,
      thumbnail: snapshot,
    };

    return this.enrichDetection(detection);
  }

  /**
   * Get list of cameras
   */
  getCameras(): ProtectCamera[] {
    return Array.from(this.cameras.values());
  }
}
