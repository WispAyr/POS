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
        this.baseUrl = this.configService.get<string>('ANPR_POLLER_URL', 'http://anpr.parkwise.cloud/api/ingest/detections');
    }

    @Cron(CronExpression.EVERY_5_MINUTES)
    async pollEvents(hours?: number, limit?: number, offset?: number): Promise<{ processed: number; new: number; updated: number }> {
        if (this.isPolling) {
            this.logger.warn('Poll already in progress, skipping...');
            return { processed: 0, new: 0, updated: 0 };
        }
        this.isPolling = true;

        try {
            const pollHours = hours ?? 24;
            const pollLimit = limit ?? 100;
            const pollOffset = offset ?? 0;

            this.logger.log(`Polling ANPR events from ${this.baseUrl} (hours=${pollHours}, limit=${pollLimit}, offset=${pollOffset})...`);

            const response = await firstValueFrom(
                this.httpService.get(this.baseUrl, {
                    params: {
                        limit: pollLimit,
                        hours: pollHours,
                        offset: pollOffset
                    },
                    timeout: 60000, // 60s timeout for large payloads
                }),
            );

            const data = response.data;
            this.logger.log(`Fetched ${Array.isArray(data) ? data.length : (data.detections ? data.detections.length : 'unknown')} events from ANPR source`);

            const events = data.detections || data;

            if (Array.isArray(events)) {
                this.logger.log(`Processing ${events.length} events...`);
                let ingestedCount = 0;

                // Process in batches of 5 to avoid overloading
                const BATCH_SIZE = 5;
                for (let i = 0; i < events.length; i += BATCH_SIZE) {
                    const batch = events.slice(i, i + BATCH_SIZE);
                    await Promise.all(batch.map(async (event) => {
                        const dto = new IngestAnprDto();

                        // Map Site ID
                        if (event.site_id || event.siteId) {
                            dto.siteId = event.site_id || event.siteId;
                        } else if (event.cameraId && typeof event.cameraId === 'string') {
                            dto.siteId = await this.deriveSiteIdFromCamera(event.cameraId);
                        } else {
                            dto.siteId = 'UNKNOWN';
                        }

                        dto.cameraId = event.cameraId || event.camera_id || 'UNKNOWN';
                        dto.direction = event.direction;
                        dto.clusterId = event.cluster_id || event.clusterId;
                        dto.timestamp = event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString();
                        dto.plateNumber = event.plateNumber || event.plate_number || event.vrm;
                        dto.cameraType = event.cameraType || event.camera_type || event.source;
                        dto.confidence = event.confidence;

                        // Download images and store locally
                        dto.images = [];
                        if (event.images && typeof event.images === 'object') {
                            if (event.images.plate) {
                                const filename = await this.imageService.downloadAndStore(event.images.plate, 'plate');
                                if (filename) {
                                    dto.images.push({ url: `/api/images/${filename}`, type: 'plate' });
                                }
                            }
                            if (event.images.overview) {
                                const filename = await this.imageService.downloadAndStore(event.images.overview, 'overview');
                                if (filename) {
                                    dto.images.push({ url: `/api/images/${filename}`, type: 'overview' });
                                }
                            }
                        }

                        if (!dto.plateNumber) return;

                        try {
                            const result = await this.anprIngestionService.ingest(dto);
                            if (result.isNew) {
                                ingestedCount++;
                            }
                        } catch (err) {
                            this.logger.error(`Failed to ingest event for ${dto.plateNumber}`, err.trace);
                        }
                    }));
                }
                return {
                    processed: events.length,
                    new: ingestedCount,
                    updated: events.length - ingestedCount
                };
            } else {
                this.logger.warn('Unexpected response format: ' + JSON.stringify(data).slice(0, 100));
                return { processed: 0, new: 0, updated: 0 };
            }
        } catch (error) {
            this.logger.error('Error polling ANPR events: ' + error.message);
            return { processed: 0, new: 0, updated: 0 };
        } finally {
            this.isPolling = false;
        }
    }

    async discoverCameras(): Promise<{ cameraId: string; siteId: string }[]> {
        this.logger.log('Discovering cameras from ANPR feed...');

        try {
            const response = await firstValueFrom(
                this.httpService.get(this.baseUrl, {
                    params: {
                        limit: 100,
                        hours: 24,
                        offset: 0
                    },
                    timeout: 30000,
                }),
            );

            const data = response.data;
            const events = data.detections || data;

            if (!Array.isArray(events)) {
                this.logger.warn('No detections array found');
                return [];
            }

            const cameraMap = new Map<string, string>();

            for (const event of events) {
                const cameraId = event.cameraId || event.camera_id;
                if (cameraId && !cameraMap.has(cameraId)) {
                    const siteId = await this.deriveSiteIdFromCamera(cameraId);
                    cameraMap.set(cameraId, siteId);
                }
            }

            const cameras = Array.from(cameraMap.entries()).map(([cameraId, siteId]) => ({
                cameraId,
                siteId
            }));

            this.logger.log(`Discovered ${cameras.length} unique cameras`);
            return cameras;
        } catch (error) {
            this.logger.error('Error discovering cameras: ' + error.message);
            return [];
        }
    }

    private async deriveSiteIdFromCamera(cameraId: string): Promise<string> {
        // Find site where this camera is configured
        const sites = await this.siteRepo.find();
        for (const site of sites) {
            const cameraConfig = site.config?.cameras?.find(
                (c: any) => c.id?.toLowerCase() === cameraId.toLowerCase()
            );
            if (cameraConfig) {
                return site.id;
            }
        }

        // Fallback to patterns if not explicitly configured
        const patterns: { [key: string]: string } = {
            'greenford': 'GRN01',
            'kickoff': 'KOD01',
            'aspect': 'ASP01',
            'kent_wharf': 'KWF01',
            'radisson': 'RDB01',
            'kyle': 'KMS01',
            'bridlington': 'BPD01',
            'coastal': 'CPZ01',
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
