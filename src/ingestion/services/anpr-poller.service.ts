import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { firstValueFrom } from 'rxjs';
import { AnprIngestionService } from './anpr-ingestion.service';
import { ImageService } from './image.service';
import { IngestAnprDto } from '../dto/ingest-anpr.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Site } from '../../domain/entities';

@Injectable()
export class AnprPollerService {
  private readonly logger = new Logger(AnprPollerService.name);
  private readonly baseUrl: string;
  private isPolling = false;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly anprIngestionService: AnprIngestionService,
    private readonly imageService: ImageService,
    @InjectRepository(Site)
    private readonly siteRepo: Repository<Site>,
  ) {
    this.baseUrl = this.configService.get<string>(
      'ANPR_POLLER_URL',
      'http://anpr.parkwise.cloud/api/ingest/detections',
    );
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async pollEvents(
    hours?: number,
    limit?: number,
    offset?: number,
  ): Promise<{
    processed: number;
    new: number;
    updated: number;
    errors: number;
  }> {
    if (this.isPolling) {
      this.logger.warn('Poll already in progress, skipping...');
      return { processed: 0, new: 0, updated: 0, errors: 0 };
    }
    this.isPolling = true;

    try {
      const pollHours = hours ?? 24;
      const pollLimit = limit ?? 50;
      let currentOffset = offset ?? 0;

      let totalProcessed = 0;
      let totalNew = 0;
      let totalUpdated = 0;
      let totalErrors = 0;
      let batchNumber = 0;

      // Cache sites once for all batches
      const allSites = await this.siteRepo.find();
      if (allSites.length === 0) {
        this.logger.error(
          'CRITICAL: No sites found in database! ANPR sync will fail to map any events. Please sync sites from Monday.com first.',
        );
        return { processed: 0, new: 0, updated: 0, errors: 0 };
      }
      this.logger.debug(`Cached ${allSites.length} sites for mapping`);

      // Paginate through all available records
      while (true) {
        batchNumber++;
        this.logger.log(
          `Polling ANPR events from ${this.baseUrl} (hours=${pollHours}, limit=${pollLimit}, offset=${currentOffset}, batch=${batchNumber})...`,
        );

        const response = await firstValueFrom(
          this.httpService.get(this.baseUrl, {
            params: {
              limit: pollLimit,
              hours: pollHours,
              offset: currentOffset,
            },
            timeout: 120000,
            headers: {
              'Accept-Encoding': 'identity',
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          }),
        ).catch((err) => {
          this.logger.error(
            `External API call failed: ${err.message}`,
            err.stack,
          );
          throw err;
        });

        const data = response.data;
        const events = data.detections || data;

        if (!Array.isArray(events) || events.length === 0) {
          if (batchNumber === 1) {
            this.logger.log('No events found from ANPR source');
          }
          break;
        }

        this.logger.log(
          `Fetched ${events.length} events from ANPR source (batch ${batchNumber}, offset ${currentOffset})`,
        );

        const batchResult = await this.processEventsBatch(events, allSites);
        totalProcessed += batchResult.processed;
        totalNew += batchResult.new;
        totalUpdated += batchResult.updated;
        totalErrors += batchResult.errors;

        // If we got fewer events than the limit, we've reached the end
        if (events.length < pollLimit) {
          break;
        }

        currentOffset += pollLimit;

        // Safety limit to prevent infinite loops
        if (batchNumber >= 100) {
          this.logger.warn('Reached maximum batch limit (100), stopping pagination');
          break;
        }
      }

      this.logger.log(
        `Poll complete: ${totalNew} new, ${totalUpdated} updated, ${totalErrors} errors across ${batchNumber} batches.`,
      );
      return {
        processed: totalProcessed,
        new: totalNew,
        updated: totalUpdated,
        errors: totalErrors,
      };
    } catch (error) {
      this.logger.error(`Error during ANPR poll: ${error.message}`);
      return { processed: 0, new: 0, updated: 0, errors: 0 };
    } finally {
      this.isPolling = false;
    }
  }

  private async processEventsBatch(
    events: any[],
    allSites: Site[],
  ): Promise<{ processed: number; new: number; updated: number; errors: number }> {
    let ingestedNew = 0;
    let ingestedUpdated = 0;
    let errorCount = 0;

    const BATCH_SIZE = 5;
    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      const batch = events.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (event) => {
          const dto = new IngestAnprDto();
          const cameraId = event.cameraId || event.camera_id || 'UNKNOWN';

          if (event.site_id || event.siteId) {
            dto.siteId = event.site_id || event.siteId;
          } else if (cameraId !== 'UNKNOWN') {
            dto.siteId = await this.deriveSiteIdFromCamera(cameraId, allSites);
          } else {
            dto.siteId = 'UNKNOWN';
          }

          if (dto.siteId === 'UNKNOWN') {
            this.logger.warn(
              `Could not map camera ${cameraId} to any site. Skipping event.`,
            );
            errorCount++;
            return;
          }

          dto.cameraId = cameraId;
          dto.direction = event.direction;
          dto.clusterId = event.cluster_id || event.clusterId;
          dto.timestamp = event.timestamp
            ? new Date(event.timestamp).toISOString()
            : new Date().toISOString();
          dto.plateNumber =
            event.plateNumber || event.plate_number || event.vrm;
          dto.cameraType =
            event.cameraType || event.camera_type || event.source;
          dto.confidence = event.confidence;

          dto.images = [];
          if (event.images && typeof event.images === 'object') {
            if (event.images.plate) {
              const filename = await this.imageService
                .downloadAndStore(event.images.plate, 'plate')
                .catch(() => null);
              if (filename)
                dto.images.push({
                  url: `/api/images/${filename}`,
                  type: 'plate',
                });
            }
            if (event.images.overview) {
              const filename = await this.imageService
                .downloadAndStore(event.images.overview, 'overview')
                .catch(() => null);
              if (filename)
                dto.images.push({
                  url: `/api/images/${filename}`,
                  type: 'overview',
                });
            }
          }

          if (!dto.plateNumber) {
            this.logger.warn(
              `Skipping event with missing VRM: ${JSON.stringify(event).slice(0, 100)}`,
            );
            errorCount++;
            return;
          }

          try {
            const result = await this.anprIngestionService.ingest(dto);
            if (result.isNew) ingestedNew++;
            else ingestedUpdated++;
          } catch (err) {
            errorCount++;
            this.logger.error(
              `Failed to ingest event for ${dto.plateNumber} at site ${dto.siteId}: ${err.message}`,
            );
          }
        }),
      );
    }

    return {
      processed: events.length,
      new: ingestedNew,
      updated: ingestedUpdated,
      errors: errorCount,
    };
  }

  async discoverCameras(): Promise<{ cameraId: string; siteId: string }[]> {
    this.logger.log('Discovering cameras from ANPR feed...');

    try {
      const response = await firstValueFrom(
        this.httpService.get(this.baseUrl, {
          params: {
            limit: 10,
            hours: 24,
            offset: 0,
          },
          timeout: 120000,
          headers: {
            'Accept-Encoding': 'identity',
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }),
      );

      const data = response.data;
      const events = data.detections || data;

      if (!Array.isArray(events)) {
        this.logger.warn('No detections array found');
        return [];
      }

      const cameraMap = new Map<string, string>();
      const allSites = await this.siteRepo.find();

      for (const event of events) {
        const cameraId = event.cameraId || event.camera_id;
        if (cameraId && !cameraMap.has(cameraId)) {
          const siteId = await this.deriveSiteIdFromCamera(cameraId, allSites);
          cameraMap.set(cameraId, siteId);
        }
      }

      const cameras = Array.from(cameraMap.entries()).map(
        ([cameraId, siteId]) => ({
          cameraId,
          siteId,
        }),
      );

      this.logger.log(`Discovered ${cameras.length} unique cameras`);
      return cameras;
    } catch (error) {
      this.logger.error('Error discovering cameras: ' + error.message);
      return [];
    }
  }

  private async deriveSiteIdFromCamera(
    cameraId: string,
    cachedSites?: Site[],
  ): Promise<string> {
    // Find site where this camera is configured
    const sites = cachedSites || (await this.siteRepo.find());
    for (const site of sites) {
      const cameraConfig = site.config?.cameras?.find(
        (c: any) => c.id?.toLowerCase() === cameraId.toLowerCase(),
      );
      if (cameraConfig) {
        return site.id;
      }
    }

    // Fallback to patterns if not explicitly configured
    const patterns: { [key: string]: string } = {
      greenford: 'GRN01',
      kickoff: 'KOD01',
      aspect: 'ASP01',
      kent_wharf: 'KWF01',
      radisson: 'RDB01',
      kyle: 'KMS01',
      bridlington: 'BPD01',
      coastal: 'CPZ01',
    };

    const lowerCameraId = cameraId.toLowerCase();
    for (const [pattern, siteId] of Object.entries(patterns)) {
      if (lowerCameraId.includes(pattern)) {
        return siteId;
      }
    }

    return 'UNKNOWN';
  }
}
