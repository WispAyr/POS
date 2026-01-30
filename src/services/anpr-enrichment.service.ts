import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Movement } from '../domain/entities';
import { HailoService, HailoAnalysisResult } from './hailo.service';
import { ProtectDetectionService } from './protect-detection.service';

export interface MovementAiMetadata {
  analyzedAt: Date;
  model: string;
  inferenceTimeMs?: number;
  summary: {
    people: number;
    vehicles: number;
    vehicleTypes?: string[];
    faces?: number;
  };
  detections?: any[];
  error?: string;
}

@Injectable()
export class AnprEnrichmentService implements OnModuleInit {
  private readonly logger = new Logger(AnprEnrichmentService.name);
  private isEnabled = true;
  
  // Camera ID to Protect camera ID mapping
  // Maps the ANPR system camera IDs to UniFi Protect camera IDs
  private readonly cameraMapping: Record<string, string> = {
    // Add mappings as cameras are configured
    // 'anpr-camera-1': '692dd5480117ea03e4000426',
  };

  constructor(
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
    private readonly hailoService: HailoService,
    private readonly protectService: ProtectDetectionService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    // Non-blocking check - service runs regardless of Hailo status
    try {
      if (!this.hailoService.isAvailable()) {
        this.logger.warn('Hailo AI not available at startup - ANPR enrichment will activate when Hailo connects');
        this.isEnabled = false;
      } else {
        this.logger.log('ANPR enrichment service ready');
        this.isEnabled = true;
      }
    } catch (error: any) {
      this.logger.warn(`ANPR enrichment init: ${error.message} - will retry on demand`);
      this.isEnabled = false;
    }
  }

  /**
   * Enrich a movement with AI analysis
   * Can be called manually or triggered by event
   * Returns null gracefully if Hailo unavailable
   */
  async enrichMovement(movementId: string): Promise<MovementAiMetadata | null> {
    // Check Hailo availability (may have reconnected)
    if (!this.hailoService.isAvailable()) {
      // Try a health check in case it came back
      await this.hailoService.healthCheck();
      if (!this.hailoService.isAvailable()) {
        this.logger.debug(`Skipping enrichment for ${movementId} - Hailo unavailable`);
        return null;
      }
      this.isEnabled = true;
    }

    try {
      const movement = await this.movementRepo.findOne({
        where: { id: movementId },
      });

      if (!movement) {
        this.logger.warn(`Movement not found: ${movementId}`);
        return null;
      }

      // Try to get an image to analyze
      let imageBuffer: Buffer | null = null;
      
      // Option 1: Use existing movement image
      if (movement.images?.length) {
        const overviewImage = movement.images.find((i) => i.type === 'overview');
        const plateImage = movement.images.find((i) => i.type === 'plate');
        const targetImage = overviewImage || plateImage;
        
        if (targetImage) {
          imageBuffer = await this.downloadImage(targetImage.url);
        }
      }

      // Option 2: Try to get live snapshot from camera
      if (!imageBuffer && movement.cameraIds) {
        const protectCameraId = this.cameraMapping[movement.cameraIds];
        if (protectCameraId) {
          imageBuffer = await this.protectService.getCameraSnapshot(protectCameraId);
        }
      }

      if (!imageBuffer) {
        this.logger.debug(`No image available for movement ${movementId}`);
        return null;
      }

      // Analyze with Hailo
      const analysis = await this.hailoService.analyzeBuffer(imageBuffer);
      
      if (!analysis.success) {
        this.logger.warn(`Analysis failed for ${movementId}: ${analysis.error}`);
        return null;
      }

      // Build metadata
      const metadata: MovementAiMetadata = {
        analyzedAt: new Date(),
        model: analysis.model || 'yolov8s',
        inferenceTimeMs: analysis.inferenceTimeMs,
        summary: {
          people: analysis.summary?.people || 0,
          vehicles: analysis.summary?.vehicles || 0,
          vehicleTypes: analysis.summary?.vehicleTypes,
          faces: analysis.summary?.faces,
        },
        detections: analysis.detections,
      };

      // Store in rawData (preserving existing data)
      movement.rawData = {
        ...movement.rawData,
        aiAnalysis: metadata,
      };

      await this.movementRepo.save(movement);
      
      this.logger.log(
        `Enriched movement ${movementId}: ${metadata.summary.vehicles} vehicles, ${metadata.summary.people} people`,
      );

      // Emit enrichment event
      this.eventEmitter.emit('movement.enriched', {
        movementId,
        metadata,
      });

      return metadata;
    } catch (error) {
      this.logger.error(`Enrichment failed for ${movementId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Bulk enrich recent movements (backfill)
   */
  async enrichRecentMovements(
    hours: number = 24,
    limit: number = 100,
  ): Promise<{ processed: number; enriched: number }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const movements = await this.movementRepo
      .createQueryBuilder('m')
      .where('m.timestamp > :since', { since })
      .andWhere("(m.rawData->>'aiAnalysis') IS NULL")
      .orderBy('m.timestamp', 'DESC')
      .limit(limit)
      .getMany();

    let enriched = 0;
    for (const movement of movements) {
      const result = await this.enrichMovement(movement.id);
      if (result) enriched++;
      
      // Small delay to avoid overwhelming Hailo
      await new Promise((r) => setTimeout(r, 500));
    }

    return { processed: movements.length, enriched };
  }

  /**
   * Download image from URL or local path
   */
  private async downloadImage(urlOrPath: string): Promise<Buffer | null> {
    try {
      // Local path
      if (urlOrPath.startsWith('/')) {
        const fs = await import('fs');
        const path = await import('path');
        const fullPath = urlOrPath.startsWith('/api/images/')
          ? path.join(process.cwd(), 'uploads', 'images', urlOrPath.replace('/api/images/', ''))
          : urlOrPath;
        
        if (fs.existsSync(fullPath)) {
          return fs.readFileSync(fullPath);
        }
      }

      // Remote URL
      if (urlOrPath.startsWith('http')) {
        const https = await import('https');
        const http = await import('http');
        
        // Rewrite localhost to public URL if needed
        const url = urlOrPath.replace(
          'http://localhost:3000',
          'http://anpr.parkwise.cloud',
        );
        
        return new Promise((resolve) => {
          const client = url.startsWith('https') ? https : http;
          const req = client.get(url, { timeout: 10000 }, (res) => {
            if (res.statusCode !== 200) {
              resolve(null);
              return;
            }
            const chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', () => resolve(null));
          });
          req.on('error', () => resolve(null));
          req.on('timeout', () => {
            req.destroy();
            resolve(null);
          });
        });
      }

      return null;
    } catch (error) {
      this.logger.debug(`Failed to download image: ${error.message}`);
      return null;
    }
  }

  /**
   * Enable/disable enrichment
   */
  setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    this.logger.log(`ANPR enrichment ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Update camera mapping
   */
  setCameraMapping(anprId: string, protectId: string) {
    this.cameraMapping[anprId] = protectId;
    this.logger.log(`Mapped ANPR camera ${anprId} → Protect ${protectId}`);
  }
}
