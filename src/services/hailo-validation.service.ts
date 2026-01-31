import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Movement } from '../domain/entities';
import { HailoService } from './hailo.service';
import { PlateReviewService } from '../plate-review/services/plate-review.service';
import { AuditService } from '../audit/audit.service';
import { ValidationStatus } from '../domain/entities/plate-review.entity';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

export interface HailoValidationResult {
  validated: boolean;
  vehicleFound: boolean;
  vehicleCount: number;
  confidence: number;
  error?: string;
}

const MAX_IMAGE_WIDTH = 800;  // Good balance of quality vs size for vehicle detection
const MAX_IMAGE_SIZE_KB = 500; // Comfortable under 10MB limit

@Injectable()
export class HailoValidationService {
  private readonly logger = new Logger(HailoValidationService.name);
  private readonly minVehicleConfidence = 0.3; // Minimum confidence to consider a vehicle detected

  constructor(
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
    private readonly hailoService: HailoService,
    private readonly plateReviewService: PlateReviewService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Validate a movement by checking if Hailo can detect a vehicle in the image
   */
  async validateMovement(movement: Movement): Promise<HailoValidationResult> {
    // Skip if already validated
    if (movement.hailoValidated !== null) {
      return {
        validated: true,
        vehicleFound: movement.hailoValidated,
        vehicleCount: movement.hailoVehicleCount || 0,
        confidence: movement.hailoConfidence || 0,
      };
    }

    // Skip if no images
    if (!movement.images || movement.images.length === 0) {
      this.logger.debug(`Movement ${movement.id} has no images, skipping Hailo validation`);
      return {
        validated: false,
        vehicleFound: false,
        vehicleCount: 0,
        confidence: 0,
        error: 'No images available',
      };
    }

    // Check if Hailo is available
    if (!this.hailoService.isAvailable()) {
      this.logger.debug('Hailo not available, skipping validation');
      return {
        validated: false,
        vehicleFound: false,
        vehicleCount: 0,
        confidence: 0,
        error: 'Hailo not available',
      };
    }

    // Prefer overview image for vehicle detection
    const overviewImage = movement.images.find(img => img.type === 'overview');
    const imageToAnalyze = overviewImage || movement.images[0];

    if (!imageToAnalyze?.url) {
      return {
        validated: false,
        vehicleFound: false,
        vehicleCount: 0,
        confidence: 0,
        error: 'No valid image URL',
      };
    }

    try {
      // Load the image
      let imageBuffer = await this.loadImage(imageToAnalyze.url);
      if (!imageBuffer) {
        return {
          validated: false,
          vehicleFound: false,
          vehicleCount: 0,
          confidence: 0,
          error: 'Failed to load image',
        };
      }

      // Resize image to reduce payload size for Hailo
      imageBuffer = await this.resizeImage(imageBuffer);

      // Analyze with Hailo
      const result = await this.hailoService.analyzeBuffer(imageBuffer, 'yolov8s');

      if (!result.success) {
        this.logger.warn(`Hailo analysis failed for movement ${movement.id}: ${result.error}`);
        
        // Save the error result
        movement.hailoResult = {
          checkedAt: new Date(),
          error: result.error,
        };
        await this.movementRepo.save(movement);

        return {
          validated: false,
          vehicleFound: false,
          vehicleCount: 0,
          confidence: 0,
          error: result.error,
        };
      }

      // Extract vehicle detections
      const vehicleClasses = ['car', 'truck', 'bus', 'motorcycle', 'van', 'vehicle'];
      const vehicleDetections = (result.detections || []).filter(
        d => vehicleClasses.includes(d.class.toLowerCase()) && d.confidence >= this.minVehicleConfidence
      );

      const vehicleFound = vehicleDetections.length > 0;
      const vehicleCount = vehicleDetections.length;
      const maxConfidence = vehicleDetections.length > 0
        ? Math.max(...vehicleDetections.map(d => d.confidence))
        : 0;

      // Update movement with Hailo results
      movement.hailoValidated = vehicleFound;
      movement.hailoVehicleCount = vehicleCount;
      movement.hailoConfidence = maxConfidence;
      movement.hailoResult = {
        checkedAt: new Date(),
        inferenceTimeMs: result.inferenceTimeMs,
        detections: result.detections?.map(d => ({
          class: d.class,
          confidence: d.confidence,
        })),
      };

      await this.movementRepo.save(movement);

      this.logger.log(
        `Hailo validated movement ${movement.id}: ${vehicleFound ? `${vehicleCount} vehicle(s) found` : 'NO VEHICLE DETECTED'}`
      );

      // Audit log the validation
      await this.auditService.log({
        entityType: 'MOVEMENT',
        entityId: movement.id,
        action: 'HAILO_VALIDATED',
        vrm: movement.vrm,
        siteId: movement.siteId,
        details: {
          vehicleFound,
          vehicleCount,
          confidence: maxConfidence,
          inferenceTimeMs: result.inferenceTimeMs,
          detectedClasses: vehicleDetections.map(d => d.class),
        },
        actor: 'HAILO_AI',
        actorType: 'SYSTEM',
      });

      // If no vehicle found, flag for review
      if (!vehicleFound && !movement.requiresReview) {
        await this.flagForReview(movement, 'HAILO_NO_VEHICLE');
      }

      return {
        validated: true,
        vehicleFound,
        vehicleCount,
        confidence: maxConfidence,
      };
    } catch (error: any) {
      this.logger.error(`Hailo validation error for movement ${movement.id}: ${error.message}`);
      return {
        validated: false,
        vehicleFound: false,
        vehicleCount: 0,
        confidence: 0,
        error: error.message,
      };
    }
  }

  /**
   * Load image from URL or local path
   */
  private async loadImage(url: string): Promise<Buffer | null> {
    try {
      // Handle local API paths - fetch from local server
      if (url.startsWith('/api/images/')) {
        const localApiUrl = `http://localhost:3000${url}`;
        const response = await fetch(localApiUrl, { 
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          this.logger.warn(`Failed to fetch image from API: ${url} (${response.status})`);
          return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }

      // Handle remote URLs
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const response = await fetch(url, { 
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          this.logger.warn(`Failed to fetch image: ${url} (${response.status})`);
          return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }

      // Handle absolute local paths
      if (fs.existsSync(url)) {
        return fs.readFileSync(url);
      }

      this.logger.warn(`Unable to load image: ${url}`);
      return null;
    } catch (error: any) {
      this.logger.error(`Error loading image ${url}: ${error.message}`);
      return null;
    }
  }

  /**
   * Resize image to reduce payload size for Hailo API
   */
  private async resizeImage(buffer: Buffer): Promise<Buffer> {
    try {
      // Always resize to ensure we're under the limit
      let outputBuffer = await sharp(buffer)
        .resize(MAX_IMAGE_WIDTH, null, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 70 })
        .toBuffer();
      
      // If still too large, reduce quality further
      if (outputBuffer.length > MAX_IMAGE_SIZE_KB * 1024) {
        outputBuffer = await sharp(buffer)
          .resize(480, null, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 50 })
          .toBuffer();
      }

      // Log the final size for debugging
      this.logger.debug(`Resized image: ${(outputBuffer.length / 1024).toFixed(1)}KB`);

      return outputBuffer;
    } catch (error: any) {
      this.logger.warn(`Image resize failed, using original: ${error.message}`);
      return buffer;
    }
  }

  /**
   * Flag a movement for review due to Hailo validation failure
   */
  private async flagForReview(movement: Movement, reason: string): Promise<void> {
    movement.requiresReview = true;
    await this.movementRepo.save(movement);

    try {
      await this.plateReviewService.createReviewEntry({
        movement,
        validationStatus: ValidationStatus.INVALID,
        suspicionReasons: [reason],
        confidence: movement.hailoConfidence || 0,
      });

      this.logger.warn(`Movement ${movement.id} flagged for review: ${reason}`);
    } catch (error: any) {
      this.logger.error(`Failed to create review entry: ${error.message}`);
    }
  }

  /**
   * Batch validate unvalidated movements
   */
  async validatePendingMovements(limit: number = 50): Promise<{
    processed: number;
    vehiclesFound: number;
    noVehicle: number;
    errors: number;
  }> {
    const pending = await this.movementRepo.find({
      where: {
        hailoValidated: IsNull(),
        discarded: false,
      },
      order: { timestamp: 'DESC' },
      take: limit,
    });

    let vehiclesFound = 0;
    let noVehicle = 0;
    let errors = 0;

    for (const movement of pending) {
      const result = await this.validateMovement(movement);
      
      if (result.error) {
        errors++;
      } else if (result.vehicleFound) {
        vehiclesFound++;
      } else {
        noVehicle++;
      }

      // Small delay between requests to avoid overwhelming Hailo
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return {
      processed: pending.length,
      vehiclesFound,
      noVehicle,
      errors,
    };
  }
}
