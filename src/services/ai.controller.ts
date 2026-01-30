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
   * Supports 'hailo' (LPR model) and 'claude' (vision LLM) providers
   */
  @Post('analyze-plate')
  @HttpCode(HttpStatus.OK)
  async analyzePlateImage(
    @Body() body: { 
      imageUrl: string; 
      provider?: 'hailo' | 'claude';
      context?: { originalVrm?: string; confidence?: number };
    },
  ) {
    const provider = body.provider || 'hailo';
    
    try {
      // Fetch the image
      const response = await fetch(body.imageUrl);
      if (!response.ok) {
        return { success: false, error: 'Failed to fetch image' };
      }
      
      const buffer = Buffer.from(await response.arrayBuffer());
      
      if (provider === 'claude') {
        return this.analyzeWithClaude(buffer, body.context);
      } else {
        return this.analyzeWithHailoLPR(buffer, body.context);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        suggestedVrm: null,
      };
    }
  }

  /**
   * Analyze plate using Hailo LPR models
   */
  private async analyzeWithHailoLPR(
    buffer: Buffer,
    context?: { originalVrm?: string; confidence?: number },
  ) {
    try {
      // Use the dedicated LPR endpoint which handles detection + OCR
      const lprResult = await this.hailoService.analyzePlate(buffer);
      
      if (!lprResult.success) {
        return {
          success: false,
          error: lprResult.error || 'Hailo LPR failed',
          suggestedVrm: context?.originalVrm || 'REVIEW_MANUALLY',
          provider: 'hailo',
        };
      }

      const cleanVrm = (lprResult.text || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');

      return {
        success: true,
        suggestedVrm: cleanVrm || context?.originalVrm || 'UNREADABLE',
        confidence: lprResult.confidence || 0,
        platesDetected: lprResult.platesDetected || 0,
        provider: 'hailo',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Hailo LPR failed',
        suggestedVrm: null,
        provider: 'hailo',
      };
    }
  }

  /**
   * Analyze plate using Claude Vision
   */
  private async analyzeWithClaude(
    buffer: Buffer,
    context?: { originalVrm?: string; confidence?: number },
  ) {
    try {
      const base64Image = buffer.toString('base64');
      const mimeType = 'image/jpeg';
      
      // Call Claude API for vision analysis
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return {
          success: false,
          error: 'Claude API key not configured',
          suggestedVrm: null,
        };
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 100,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mimeType,
                    data: base64Image,
                  },
                },
                {
                  type: 'text',
                  text: `Read the vehicle registration plate in this image. Return ONLY the registration number in uppercase with no spaces or punctuation. If you cannot read it clearly, respond with your best guess followed by a ? character. The original OCR read: ${context?.originalVrm || 'unknown'}`,
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Claude API error: ${response.status}`,
          suggestedVrm: null,
        };
      }

      const result = await response.json();
      const text = result.content?.[0]?.text?.trim() || '';
      
      // Clean up the response
      const cleanVrm = text.replace(/[^A-Z0-9?]/gi, '').toUpperCase();
      
      return {
        success: true,
        suggestedVrm: cleanVrm || 'UNREADABLE',
        confidence: cleanVrm.includes('?') ? 0.5 : 0.9,
        provider: 'claude',
        rawResponse: text,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Claude analysis failed',
        suggestedVrm: null,
      };
    }
  }
}
