import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Movement, Site } from '../../domain/entities';
import { IngestAnprDto } from '../dto/ingest-anpr.dto';
import { SessionService } from '../../engine/services/session.service';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class AnprIngestionService {
    private readonly logger = new Logger(AnprIngestionService.name);

    constructor(
        @InjectRepository(Movement)
        private readonly movementRepo: Repository<Movement>,
        @InjectRepository(Site)
        private readonly siteRepo: Repository<Site>,
        private readonly sessionService: SessionService,
        private readonly auditService: AuditService,
    ) { }

    async ingest(dto: IngestAnprDto): Promise<{ movement: Movement; isNew: boolean }> {
        const site = await this.siteRepo.findOne({ where: { id: dto.siteId } });
        if (!site) {
            throw new NotFoundException(`Site not found: ${dto.siteId}`);
        }

        let direction = 'UNKNOWN';
        const rawDirection = dto.direction?.toUpperCase() || '';

        // Priority 1: Site-specific camera configuration
        if (site.config?.cameras) {
            // Case-insensitive camera ID matching
            const cameraConfig = site.config.cameras.find(
                c => c.id?.toLowerCase() === dto.cameraId?.toLowerCase()
            );

            if (cameraConfig) {
                if (cameraConfig.towardsDirection && rawDirection === 'TOWARDS') {
                    direction = cameraConfig.towardsDirection.toUpperCase();
                } else if (cameraConfig.awayDirection && rawDirection === 'AWAY') {
                    direction = cameraConfig.awayDirection.toUpperCase();
                } else if (cameraConfig.direction) {
                    direction = cameraConfig.direction.toUpperCase();
                }
            }
        }

        // Priority 2: Fallback to simple global mapping
        if (direction === 'UNKNOWN' && rawDirection) {
            if (rawDirection === 'TOWARDS' || rawDirection === 'ENTRY' || rawDirection === 'IN') {
                direction = 'ENTRY';
            } else if (rawDirection === 'AWAY' || rawDirection === 'EXIT' || rawDirection === 'OUT') {
                direction = 'EXIT';
            } else {
                direction = rawDirection;
            }
        }

        const vrmRaw = dto.vrm || dto.plateNumber;
        if (!vrmRaw) {
            this.logger.warn(`Missing VRM/plateNumber in payload: ${JSON.stringify(dto)}`);
            throw new Error('VRM is required');
        }

        const vrm = vrmRaw.toUpperCase().replace(/\s/g, '');
        const timestamp = new Date(dto.timestamp);

        // Check for existing movement to avoid duplicates
        let existing = await this.movementRepo.findOne({
            where: {
                vrm,
                siteId: dto.siteId,
                timestamp
            }
        });

        if (existing) {
            // Check if we need to update images (if they point to localhost or are missing)
            const hasRemoteImages = existing.images?.some(img => img.url.includes('localhost:3000')) || !existing.images?.length;
            const hasLocalImagesInDto = dto.images?.some(img => img.url.startsWith('/api/images/'));

            if (hasRemoteImages && hasLocalImagesInDto) {
                this.logger.log(`Updating images for existing movement: ${existing.id} (${vrm})`);
                existing.images = dto.images || [];
                const saved = await this.movementRepo.save(existing);
                // Audit log duplicate detection
                await this.auditService.logMovementIngestion(saved, false, undefined);
                return { movement: saved, isNew: false };
            }

            // Audit log duplicate detection (no update needed)
            await this.auditService.logMovementIngestion(existing, false, undefined);
            return { movement: existing, isNew: false };
        }

        const movement = this.movementRepo.create({
            siteId: dto.siteId,
            vrm,
            timestamp,
            cameraIds: dto.cameraId,
            direction: direction,
            images: dto.images || [],
            rawData: {
                ...dto,
                source: dto.source || dto.cameraType,
            },
        });

        const saved = await this.movementRepo.save(movement);
        this.logger.log(`Ingested movement: ${saved.id} for VRM ${saved.vrm}`);

        // Audit log movement ingestion (isNew = true since we just created it)
        await this.auditService.logMovementIngestion(saved, true, undefined);

        // Trigger Session Processing
        await this.sessionService.processMovement(saved).catch(err => {
            this.logger.error(`Error processing session for movement ${saved.id}`, err.stack);
        });

        return { movement: saved, isNew: true };
    }
}
