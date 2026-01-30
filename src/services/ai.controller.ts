import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { HailoService, HailoAnalysisResult } from './hailo.service';
import { ProtectDetectionService, EnrichedDetection } from './protect-detection.service';
import { AnprEnrichmentService } from './anpr-enrichment.service';

@Controller('api/ai')
export class AiController {
  constructor(
    private readonly hailoService: HailoService,
    private readonly protectService: ProtectDetectionService,
    private readonly enrichmentService: AnprEnrichmentService,
  ) {}

  /**
   * Check Hailo AI status
   */
  @Get('status')
  async getStatus() {
    const hailo = await this.hailoService.getStatus();
    const cameras = this.protectService.getCameras();
    const queueStats = this.hailoService.getQueueStats();
    
    return {
      hailo: {
        ...hailo,
        queue: queueStats,
      },
      protect: {
        cameras: cameras.length,
        smartDetectCameras: cameras.filter((c) => c.isSmartDetectEnabled).length,
      },
      timestamp: new Date(),
    };
  }

  /**
   * List available AI models
   */
  @Get('models')
  async listModels() {
    const models = await this.hailoService.listModels();
    return { models };
  }

  /**
   * Analyze an image (base64)
   */
  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  async analyzeImage(
    @Body() body: { image: string; model?: string },
  ): Promise<HailoAnalysisResult> {
    return this.hailoService.analyzeBase64(body.image, body.model);
  }

  /**
   * Analyze a camera snapshot
   */
  @Post('analyze/camera/:cameraId')
  @HttpCode(HttpStatus.OK)
  async analyzeCamera(
    @Param('cameraId') cameraId: string,
    @Query('model') model?: string,
  ): Promise<HailoAnalysisResult> {
    const snapshot = await this.protectService.getCameraSnapshot(cameraId);
    
    if (!snapshot) {
      return { success: false, error: 'Failed to get camera snapshot' };
    }

    return this.hailoService.analyzeBuffer(snapshot, model);
  }

  /**
   * Get recent detections from Protect
   */
  @Get('detections')
  async getDetections(
    @Query('since') since?: string,
  ): Promise<{ detections: EnrichedDetection[] }> {
    const sinceMs = since ? parseInt(since, 10) : Date.now() - 3600000; // Default: last hour
    const detections = await this.protectService.getRecentDetections(sinceMs);
    
    // Enrich each detection
    const enriched: EnrichedDetection[] = [];
    for (const det of detections) {
      const e = await this.protectService.enrichDetection(det);
      enriched.push(e);
    }
    
    return { detections: enriched };
  }

  /**
   * Get camera list
   */
  @Get('cameras')
  async getCameras() {
    await this.protectService.refreshCameras();
    return { cameras: this.protectService.getCameras() };
  }

  /**
   * Manually analyze current view from a camera
   */
  @Get('analyze/camera/:cameraId/now')
  async analyzeCameraNow(
    @Param('cameraId') cameraId: string,
    @Query('model') model?: string,
  ): Promise<EnrichedDetection | { error: string }> {
    const result = await this.protectService.analyzeDetection(cameraId);
    
    if (!result) {
      return { error: 'Failed to analyze camera' };
    }

    return result;
  }

  /**
   * Start/stop detection polling
   */
  @Post('polling/:action')
  @HttpCode(HttpStatus.OK)
  async controlPolling(@Param('action') action: 'start' | 'stop') {
    if (action === 'start') {
      this.protectService.startPolling();
      return { status: 'started' };
    } else {
      this.protectService.stopPolling();
      return { status: 'stopped' };
    }
  }

  // ========== ANPR Enrichment Endpoints ==========

  /**
   * Enrich a specific movement with AI analysis
   */
  @Post('enrich/movement/:movementId')
  @HttpCode(HttpStatus.OK)
  async enrichMovement(@Param('movementId') movementId: string) {
    const result = await this.enrichmentService.enrichMovement(movementId);
    
    if (!result) {
      return { success: false, error: 'Enrichment failed or no image available' };
    }

    return { success: true, metadata: result };
  }

  /**
   * Backfill AI enrichment for recent movements
   */
  @Post('enrich/backfill')
  @HttpCode(HttpStatus.OK)
  async backfillEnrichment(
    @Query('hours') hours?: string,
    @Query('limit') limit?: string,
  ) {
    const h = hours ? parseInt(hours, 10) : 24;
    const l = limit ? parseInt(limit, 10) : 100;
    
    const result = await this.enrichmentService.enrichRecentMovements(h, l);
    
    return {
      success: true,
      ...result,
      message: `Enriched ${result.enriched}/${result.processed} movements`,
    };
  }

  /**
   * Enable/disable ANPR enrichment
   */
  @Post('enrich/:action')
  @HttpCode(HttpStatus.OK)
  async controlEnrichment(@Param('action') action: 'enable' | 'disable') {
    this.enrichmentService.setEnabled(action === 'enable');
    return { status: action === 'enable' ? 'enabled' : 'disabled' };
  }

  /**
   * Set camera mapping (ANPR camera ID → Protect camera ID)
   */
  @Post('cameras/mapping')
  @HttpCode(HttpStatus.OK)
  async setCameraMapping(
    @Body() body: { anprId: string; protectId: string },
  ) {
    this.enrichmentService.setCameraMapping(body.anprId, body.protectId);
    return { success: true, mapping: body };
  }

  /**
   * Analyze a plate image from URL to extract registration
   * Used by Plate Review for difficult-to-read plates
   */
  @Post('analyze-plate')
  @HttpCode(HttpStatus.OK)
  async analyzePlateImage(
    @Body() body: { imageUrl: string; context?: { originalVrm?: string; confidence?: number } },
  ) {
    try {
      // Fetch the image
      const response = await fetch(body.imageUrl);
      if (!response.ok) {
        return { success: false, error: 'Failed to fetch image' };
      }
      
      const buffer = Buffer.from(await response.arrayBuffer());
      
      // Send to Hailo for analysis
      const result = await this.hailoService.analyzeBuffer(buffer, 'yolov8s');
      
      if (!result.success) {
        return { success: false, error: result.error || 'Analysis failed' };
      }

      // Look for license plate detections
      const plateDetections = result.detections?.filter(
        (d) => d.label?.toLowerCase().includes('plate') || 
               d.label?.toLowerCase().includes('license') ||
               d.label?.toLowerCase().includes('car') ||
               d.label?.toLowerCase().includes('vehicle')
      ) || [];

      // If we have detections with text, return the best one
      if (result.detections && result.detections.length > 0) {
        // For now, return the raw detections - in future could add OCR
        return {
          success: true,
          suggestedVrm: body.context?.originalVrm || 'REVIEW_MANUALLY',
          detections: result.detections,
          confidence: result.detections[0]?.confidence || 0,
          message: `Detected ${result.detections.length} objects. Manual review recommended.`,
        };
      }

      return {
        success: false,
        error: 'No plate detected in image',
        suggestedVrm: null,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        suggestedVrm: null,
      };
    }
  }
}
