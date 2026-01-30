import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { AxiosError } from 'axios';

interface QueuedRequest {
  id: string;
  base64Image: string;
  model: string;
  resolve: (result: HailoAnalysisResult) => void;
  timestamp: number;
}

export interface HailoDetection {
  class: string;
  confidence: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface HailoAnalysisResult {
  success: boolean;
  model?: string;
  inferenceTimeMs?: number;
  detections?: HailoDetection[];
  summary?: {
    totalObjects: number;
    people: number;
    vehicles: number;
    faces: number;
    vehicleTypes?: string[];
  };
  error?: string;
}

export interface HailoStatus {
  online: boolean;
  devicePath?: string;
  model?: string;
  version?: string;
  error?: string;
}

@Injectable()
export class HailoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HailoService.name);
  private readonly hailoApiUrl: string;
  private isOnline = false;

  // Queue management
  private readonly queue: QueuedRequest[] = [];
  private isProcessing = false;
  private readonly maxQueueSize = 50;
  private readonly minDelayBetweenRequests = 500; // ms
  private readonly maxConcurrent = 2;
  private activeRequests = 0;
  private lastRequestTime = 0;
  private queueProcessor: NodeJS.Timeout | null = null;

  // Stats
  private stats = {
    queued: 0,
    processed: 0,
    dropped: 0,
    errors: 0,
  };

  constructor(private readonly httpService: HttpService) {
    this.hailoApiUrl = process.env.HAILO_API_URL || 'http://192.168.195.238:3000';
  }

  async onModuleInit() {
    // Check if Hailo is reachable on startup (non-blocking)
    try {
      const status = await this.getStatus();
      this.isOnline = status.online;
      if (status.online) {
        this.logger.log(`Hailo AI connected: ${status.model || 'ready'}`);
        this.startQueueProcessor();
      } else {
        this.logger.warn(`Hailo AI not reachable - AI features disabled: ${status.error}`);
      }
    } catch (error: any) {
      this.logger.warn(`Hailo AI init failed - AI features disabled: ${error.message}`);
      this.isOnline = false;
    }
  }

  onModuleDestroy() {
    if (this.queueProcessor) {
      clearInterval(this.queueProcessor);
    }
  }

  /**
   * Start the queue processor loop
   */
  private startQueueProcessor() {
    if (this.queueProcessor) return; // Already running
    this.queueProcessor = setInterval(() => this.processQueue(), 200);
    this.logger.debug('Queue processor started');
  }

  /**
   * Periodic health check - can re-enable Hailo if it comes back
   */
  async healthCheck(): Promise<boolean> {
    try {
      const status = await this.getStatus();
      const wasOffline = !this.isOnline;
      this.isOnline = status.online;
      
      if (wasOffline && status.online) {
        this.logger.log('Hailo AI reconnected - re-enabling AI features');
        this.startQueueProcessor();
      } else if (!wasOffline && !status.online) {
        this.logger.warn('Hailo AI disconnected - AI features paused');
      }
      
      return status.online;
    } catch {
      this.isOnline = false;
      return false;
    }
  }

  /**
   * Process queued requests with rate limiting
   */
  private async processQueue() {
    if (this.queue.length === 0) return;
    if (this.activeRequests >= this.maxConcurrent) return;
    
    const now = Date.now();
    if (now - this.lastRequestTime < this.minDelayBetweenRequests) return;

    const request = this.queue.shift();
    if (!request) return;

    // Check for stale requests (older than 30 seconds)
    if (now - request.timestamp > 30000) {
      request.resolve({ success: false, error: 'Request timed out in queue' });
      this.stats.dropped++;
      return;
    }

    this.activeRequests++;
    this.lastRequestTime = now;

    try {
      const result = await this.executeAnalysis(request.base64Image, request.model);
      request.resolve(result);
      this.stats.processed++;
    } catch (error: any) {
      request.resolve({ success: false, error: error.message });
      this.stats.errors++;
    } finally {
      this.activeRequests--;
    }
  }

  /**
   * Get queue statistics
   */
  getQueueStats() {
    return {
      queueLength: this.queue.length,
      activeRequests: this.activeRequests,
      ...this.stats,
    };
  }

  /**
   * Check Hailo device status
   */
  async getStatus(): Promise<HailoStatus> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.hailoApiUrl}/health`).pipe(
          timeout(5000),
          catchError((err: AxiosError) => {
            throw new Error(err.message);
          }),
        ),
      );
      
      this.isOnline = true;
      return {
        online: true,
        devicePath: response.data.hailo?.device,
        model: response.data.hailo?.model,
        version: response.data.hailo?.version,
      };
    } catch (error) {
      this.isOnline = false;
      return {
        online: false,
        error: error.message,
      };
    }
  }

  /**
   * Analyze an image from a local file path
   */
  async analyzeImage(
    imagePath: string,
    model: string = 'yolov8s',
  ): Promise<HailoAnalysisResult> {
    const fs = await import('fs');
    
    if (!fs.existsSync(imagePath)) {
      return { success: false, error: `Image not found: ${imagePath}` };
    }

    const imageBuffer = fs.readFileSync(imagePath);
    const base64 = imageBuffer.toString('base64');
    
    return this.analyzeBase64(base64, model);
  }

  /**
   * Analyze a base64-encoded image (queued)
   */
  async analyzeBase64(
    base64Image: string,
    model: string = 'yolov8s',
    priority: boolean = false,
  ): Promise<HailoAnalysisResult> {
    if (!this.isOnline) {
      // Try to reconnect
      const status = await this.getStatus();
      if (!status.online) {
        return { success: false, error: 'Hailo AI not available' };
      }
    }

    // Check queue capacity
    if (this.queue.length >= this.maxQueueSize) {
      this.stats.dropped++;
      return { success: false, error: 'Queue full - request dropped' };
    }

    // Clean the base64 data
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');

    // Queue the request
    return new Promise((resolve) => {
      const request: QueuedRequest = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        base64Image: cleanBase64,
        model,
        resolve,
        timestamp: Date.now(),
      };

      if (priority) {
        this.queue.unshift(request);
      } else {
        this.queue.push(request);
      }
      this.stats.queued++;
    });
  }

  /**
   * Execute the actual analysis (internal)
   */
  private async executeAnalysis(
    base64Image: string,
    model: string,
  ): Promise<HailoAnalysisResult> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.hailoApiUrl}/analyze/base64`,
          { image: base64Image, model },
          { timeout: 30000 },
        ).pipe(
          catchError((err: AxiosError) => {
            const data = err.response?.data as { error?: string } | undefined;
            throw new Error(data?.error || err.message);
          }),
        ),
      );

      const data = response.data;
      
      // Build summary
      const detections: HailoDetection[] = data.detections || [];
      const summary = this.buildSummary(detections);

      return {
        success: true,
        model: data.model || model,
        inferenceTimeMs: data.inferenceTimeMs,
        detections,
        summary,
      };
    } catch (error: any) {
      this.logger.error(`Hailo analysis failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Analyze a buffer directly (e.g., from camera snapshot)
   */
  async analyzeBuffer(
    buffer: Buffer,
    model: string = 'yolov8s',
  ): Promise<HailoAnalysisResult> {
    const base64 = buffer.toString('base64');
    return this.analyzeBase64(base64, model);
  }

  /**
   * Build a summary from detections
   */
  private buildSummary(detections: HailoDetection[]): HailoAnalysisResult['summary'] {
    const people = detections.filter((d) =>
      ['person', 'pedestrian', 'man', 'woman', 'child'].includes(d.class.toLowerCase()),
    ).length;

    const vehicleClasses = ['car', 'truck', 'bus', 'motorcycle', 'bicycle', 'van', 'vehicle'];
    const vehicles = detections.filter((d) =>
      vehicleClasses.includes(d.class.toLowerCase()),
    );

    const faces = detections.filter((d) =>
      d.class.toLowerCase() === 'face',
    ).length;

    const vehicleTypes = [...new Set(vehicles.map((v) => v.class))];

    return {
      totalObjects: detections.length,
      people,
      vehicles: vehicles.length,
      faces,
      vehicleTypes: vehicleTypes.length > 0 ? vehicleTypes : undefined,
    };
  }

  /**
   * List available models
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.hailoApiUrl}/halio/models`).pipe(
          timeout(5000),
        ),
      );
      return response.data.models || [];
    } catch {
      return [];
    }
  }

  /**
   * Check if Hailo is available
   */
  isAvailable(): boolean {
    return this.isOnline;
  }

  /**
   * Perform License Plate Recognition using Hailo LPR models
   * Uses tiny_yolov4_license_plates for detection + lprnet for OCR
   */
  async analyzePlate(buffer: Buffer): Promise<{
    success: boolean;
    text?: string;
    confidence?: number;
    platesDetected?: number;
    error?: string;
  }> {
    if (!this.isOnline) {
      const status = await this.getStatus();
      if (!status.online) {
        return { success: false, error: 'Hailo AI not available' };
      }
    }

    try {
      const base64 = buffer.toString('base64');
      
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.hailoApiUrl}/analyze/lpr`,
          { image: base64 },
          { timeout: 30000 },
        ).pipe(
          catchError((err: AxiosError) => {
            const data = err.response?.data as { error?: string } | undefined;
            throw new Error(data?.error || err.message);
          }),
        ),
      );

      const data = response.data;
      
      if (!data.success) {
        return { success: false, error: data.error || 'LPR failed' };
      }

      return {
        success: true,
        text: data.text || '',
        confidence: data.confidence || 0,
        platesDetected: data.plates_detected || 0,
      };
    } catch (error: any) {
      this.logger.error(`Hailo LPR failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}
