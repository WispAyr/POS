import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { AnprIngestionService } from './anpr-ingestion.service';
import { IngestAnprDto, AnprImageDto } from '../dto/ingest-anpr.dto';
import { AnprSyncService } from './anpr-sync.service';

export interface ImportResult {
  totalFiles: number;
  validMovements: number;
  processed: number;
  success: number;
  errors: number;
  skipped: number;
  duration: number;
  errorDetails?: Array<{ file: string; error: string }>;
}

interface MovementData {
  file: string;
  timestamp: Date;
  data: any;
}

@Injectable()
export class AnprFolderImportService {
  private readonly logger = new Logger(AnprFolderImportService.name);
  private readonly imagesPath: string;
  private isImporting = false;

  // Camera name to site ID mapping
  private readonly sitePatterns: Record<string, string> = {
    yorkshireinbusiness: 'YIB01',
    semourmalthouselan: 'SMM01',
    southport: 'SPS01',
    greenford: 'GRN01',
    kickoff: 'KOD01',
    aspect: 'ASP01',
    kent_wharf: 'KWF01',
    kentwharf: 'KWF01',
    radisson: 'RDB01',
    kyle_rise_ayr: 'KCS01', // Kyle Surface (Hikvision ANPR)
    kyle: 'KCS01', // Default Kyle to Surface
    bridlington: 'BPD01',
    coastal: 'CPZ01',
    yibby: 'YIB01',
    bognor: 'BGH01',
    sydney: 'SYD01',
    san: 'SAN01',
    cambridge: 'CAM01',
    torpedoes: 'TPT01',
    victoria: 'VPE01',
    wembley: 'WML01',
    springfields: 'SPS01',
    kempston: 'KCS01',
    arcadia: 'ARC01',
    ribblesdale: 'RBF01',
    chatham: 'CHM01',
    surbiton: 'SRL01',
    west_point: 'WPS01',
    westpoint: 'WPS01',
    summer: 'SMM01',
    redbridge: 'RDB01',
  };

  constructor(
    private readonly anprIngestionService: AnprIngestionService,
    private readonly anprSyncService: AnprSyncService,
    private readonly configService: ConfigService,
  ) {
    this.imagesPath = path.join(process.cwd(), 'uploads', 'images');
    this.ensureImagesDirectory();
  }

  private ensureImagesDirectory(): void {
    if (!fs.existsSync(this.imagesPath)) {
      fs.mkdirSync(this.imagesPath, { recursive: true });
      this.logger.log(`Created images directory: ${this.imagesPath}`);
    }
  }

  isImportInProgress(): boolean {
    return this.isImporting;
  }

  async importFromFolder(
    folderPath?: string,
    options?: {
      deleteAfterImport?: boolean;
      limit?: number;
      batchSize?: number;
    },
  ): Promise<ImportResult> {
    if (this.isImporting) {
      throw new Error('Import already in progress');
    }

    this.isImporting = true;
    const startTime = Date.now();
    const errorDetails: Array<{ file: string; error: string }> = [];
    const batchSize = options?.batchSize || 500; // Process 500 files at a time

    try {
      // Use provided path or default from sync service
      const importPath = folderPath || this.anprSyncService.getLocalPath();
      const absolutePath = path.resolve(importPath);

      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Import folder does not exist: ${absolutePath}`);
      }

      const allFiles = fs
        .readdirSync(absolutePath)
        .filter((f) => f.endsWith('.json'));

      this.logger.log(
        `Found ${allFiles.length} JSON files to import from ${absolutePath}`,
      );

      if (allFiles.length === 0) {
        return {
          totalFiles: 0,
          validMovements: 0,
          processed: 0,
          success: 0,
          errors: 0,
          skipped: 0,
          duration: Date.now() - startTime,
        };
      }

      // Apply limit to file list before processing
      const files = options?.limit ? allFiles.slice(0, options.limit) : allFiles;
      const totalFilesToProcess = files.length;

      this.logger.log(
        `Processing ${totalFilesToProcess} files in batches of ${batchSize}`,
      );

      let processed = 0;
      let success = 0;
      let errors = 0;
      let validMovements = 0;
      let skipped = 0;

      // Process files in batches to avoid memory exhaustion
      for (let batchStart = 0; batchStart < totalFilesToProcess; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, totalFilesToProcess);
        const batchFiles = files.slice(batchStart, batchEnd);

        this.logger.log(
          `Processing batch ${Math.floor(batchStart / batchSize) + 1}: files ${batchStart + 1}-${batchEnd}`,
        );

        // Read and sort movements for this batch only
        const movements = this.readAndSortMovements(absolutePath, batchFiles);
        validMovements += movements.length;
        skipped += batchFiles.length - movements.length;

        // Process this batch
        for (const { file, data } of movements) {
          try {
            await this.processMovement(file, data);
            success++;

            // Delete file after successful import if requested
            if (options?.deleteAfterImport) {
              const filePath = path.join(absolutePath, file);
              fs.unlinkSync(filePath);
            }
          } catch (err) {
            errors++;
            const errorMessage = err instanceof Error ? err.message : String(err);
            if (errorDetails.length < 100) { // Limit error details to prevent memory issues
              errorDetails.push({ file, error: errorMessage });
            }
            this.logger.error(`Error processing ${file}: ${errorMessage}`);
          }

          processed++;
          if (processed % 100 === 0) {
            this.logger.log(
              `Progress: ${processed}/${totalFilesToProcess} (${success} success, ${errors} errors)`,
            );
          }
        }

        // Force garbage collection hint between batches
        if (global.gc) {
          global.gc();
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Import complete: ${success} success, ${errors} errors in ${duration}ms`,
      );

      return {
        totalFiles: allFiles.length,
        validMovements,
        processed,
        success,
        errors,
        skipped,
        duration,
        errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
      };
    } finally {
      this.isImporting = false;
    }
  }

  private readAndSortMovements(
    folderPath: string,
    files: string[],
  ): MovementData[] {
    // First pass: extract timestamps for sorting (minimal memory)
    const fileTimestamps: Array<{ file: string; timestamp: Date }> = [];

    for (const file of files) {
      try {
        const filePath = path.join(folderPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        // Quick parse to check validity and get timestamp
        const data = JSON.parse(content);

        // Skip invalid entries
        if (
          !data.plateNumber ||
          data.plateNumber === 'unknown' ||
          data.plateNumber === ''
        ) {
          continue;
        }

        const timestamp = data.timestamp
          ? new Date(data.timestamp)
          : new Date();

        fileTimestamps.push({ file, timestamp });
      } catch (err) {
        this.logger.warn(`Error reading ${file}: ${err}`);
      }
    }

    // Sort by timestamp ascending (oldest first)
    fileTimestamps.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Second pass: read full data only for sorted files
    const movements: MovementData[] = [];
    for (const { file, timestamp } of fileTimestamps) {
      try {
        const filePath = path.join(folderPath, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        movements.push({ file, timestamp, data });
      } catch (err) {
        this.logger.warn(`Error re-reading ${file}: ${err}`);
      }
    }

    return movements;
  }

  private async processMovement(file: string, data: any): Promise<void> {
    const dto = new IngestAnprDto();
    dto.cameraId = data.cameraId;
    dto.direction = data.direction;
    dto.timestamp = data.timestamp
      ? new Date(data.timestamp).toISOString()
      : new Date().toISOString();
    dto.plateNumber = data.plateNumber;
    dto.cameraType = data.cameraType;
    dto.confidence = data.confidence;
    dto.siteId = this.deriveSiteIdFromCameraName(data.cameraId);

    // Extract and save base64 images from rawData
    const images: AnprImageDto[] = [];
    const eventId = data.id;

    // Hikvision cameras: images in rawData.decodes[0]
    if (data.rawData?.decodes?.[0]) {
      await this.extractHikvisionImages(
        data.rawData.decodes[0],
        eventId,
        images,
      );
    }
    // Axis cameras: images in SOAP envelope
    else if (
      data.rawData?.['soapenv:Envelope']?.['soapenv:Body']?.CameraToInstation
        ?.ImageArray?.Image
    ) {
      await this.extractAxisImages(
        data.rawData['soapenv:Envelope']['soapenv:Body'].CameraToInstation
          .ImageArray.Image,
        eventId,
        images,
      );
    }
    dto.images = images;

    await this.anprIngestionService.ingest(dto);
  }

  private async extractHikvisionImages(
    decode: any,
    eventId: string,
    images: AnprImageDto[],
  ): Promise<void> {
    // Save plate image if exists
    if (decode.plate && decode.plate.length > 0) {
      try {
        const plateFilename = `${eventId}-plate.jpg`;
        const platePath = path.join(this.imagesPath, plateFilename);
        const plateBuffer = Buffer.from(decode.plate, 'base64');
        fs.writeFileSync(platePath, plateBuffer);
        images.push({
          url: `/api/images/${plateFilename}`,
          type: 'plate',
        });
      } catch (err) {
        // Ignore image save errors
      }
    }

    // Save overview image if exists
    if (decode.overview && decode.overview.length > 0) {
      try {
        const overviewFilename = `${eventId}-overview.jpg`;
        const overviewPath = path.join(this.imagesPath, overviewFilename);
        const overviewBuffer = Buffer.from(decode.overview, 'base64');
        fs.writeFileSync(overviewPath, overviewBuffer);
        images.push({
          url: `/api/images/${overviewFilename}`,
          type: 'overview',
        });
      } catch (err) {
        // Ignore image save errors
      }
    }
  }

  private async extractAxisImages(
    rawImages: any,
    eventId: string,
    images: AnprImageDto[],
  ): Promise<void> {
    const imageArray = Array.isArray(rawImages) ? rawImages : [rawImages];

    for (const img of imageArray) {
      try {
        if (img.ImageType === 'platePatch' && img.BinaryImage) {
          const plateFilename = `${eventId}-plate.jpg`;
          const platePath = path.join(this.imagesPath, plateFilename);
          const plateBuffer = Buffer.from(img.BinaryImage, 'base64');
          fs.writeFileSync(platePath, plateBuffer);
          images.push({
            url: `/api/images/${plateFilename}`,
            type: 'plate',
          });
        } else if (img.ImageType === 'overviewImage' && img.BinaryImage) {
          const overviewFilename = `${eventId}-overview.jpg`;
          const overviewPath = path.join(this.imagesPath, overviewFilename);
          const overviewBuffer = Buffer.from(img.BinaryImage, 'base64');
          fs.writeFileSync(overviewPath, overviewBuffer);
          images.push({
            url: `/api/images/${overviewFilename}`,
            type: 'overview',
          });
        }
      } catch (err) {
        // Ignore image save errors
      }
    }
  }

  private deriveSiteIdFromCameraName(cameraName: string): string {
    if (!cameraName) {
      return 'GRN01'; // Default fallback
    }

    const lowerCameraName = cameraName.toLowerCase().replace(/[_\s&-]/g, '');

    for (const [pattern, siteId] of Object.entries(this.sitePatterns)) {
      if (lowerCameraName.includes(pattern.replace(/[_\s&-]/g, ''))) {
        return siteId;
      }
    }

    this.logger.warn(
      `Could not map camera "${cameraName}" to a site, using GRN01 as fallback`,
    );
    return 'GRN01';
  }

  /**
   * Sync from remote server and then import all new files
   */
  async syncAndImport(options?: {
    deleteAfterImport?: boolean;
    deleteFromRemote?: boolean;
    limit?: number;
  }): Promise<{
    sync: Awaited<ReturnType<AnprSyncService['syncFromRemote']>>;
    import: ImportResult;
  }> {
    // First, sync from remote
    const syncResult = await this.anprSyncService.syncFromRemote({
      deleteAfterSync: options?.deleteFromRemote,
    });

    if (!syncResult.success) {
      return {
        sync: syncResult,
        import: {
          totalFiles: 0,
          validMovements: 0,
          processed: 0,
          success: 0,
          errors: 0,
          skipped: 0,
          duration: 0,
          errorDetails: [{ file: 'N/A', error: 'Sync failed, import skipped' }],
        },
      };
    }

    // Then import from the synced folder
    const importResult = await this.importFromFolder(undefined, {
      deleteAfterImport: options?.deleteAfterImport,
      limit: options?.limit,
    });

    return {
      sync: syncResult,
      import: importResult,
    };
  }
}
