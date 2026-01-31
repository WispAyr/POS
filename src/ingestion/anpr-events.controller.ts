import {
  Body,
  Controller,
  Post,
  Param,
  UseInterceptors,
  UploadedFile,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnprIngestionService } from './services/anpr-ingestion.service';
import { ImageService } from './services/image.service';
import { Movement } from '../domain/entities';

/**
 * DTO for UniFi Protect Listener ANPR events
 */
interface UnifiAnprEventDto {
  plate: string;
  timestamp: string;
  cameraId: string;
  cameraName: string;
  siteId: string;
  posCode: string; // POS site code (e.g., KMS01, WPS01)
  siteName: string;
  zone?: string;
  direction: 'entry' | 'exit' | 'unknown';
  confidence: number;
  vehicleType?: string;
  vehicleColor?: string;
  source: string;
}

/**
 * Controller for external ANPR event ingestion (UniFi Protect Listener)
 * Maps the UniFi format to the internal ingestion format
 */
@Controller('api/anpr')
export class AnprEventsController {
  private readonly logger = new Logger(AnprEventsController.name);

  constructor(
    private readonly anprService: AnprIngestionService,
    private readonly imageService: ImageService,
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
  ) {}

  @Post('events')
  async receiveAnprEvent(@Body() dto: UnifiAnprEventDto) {
    this.logger.log(
      `Received ANPR event: ${dto.plate} from ${dto.cameraName} (${dto.posCode})`,
    );

    // Map UniFi format to internal ingestion format
    const ingestDto = {
      source: dto.source || 'unifi-protect',
      siteId: dto.posCode, // Use POS site code
      vrm: dto.plate,
      timestamp: dto.timestamp,
      confidence: dto.confidence,
      cameraId: dto.cameraName, // Use camera name as ID for display
      direction: this.mapDirection(dto.direction),
      metadata: {
        originalSiteId: dto.siteId,
        siteName: dto.siteName,
        zone: dto.zone,
        vehicleType: dto.vehicleType,
        vehicleColor: dto.vehicleColor,
        unifiCameraId: dto.cameraId,
      },
    };

    const result = await this.anprService.ingest(ingestDto);

    return {
      success: true,
      id: result.movement.id,
      isNew: result.isNew,
      message: `Event ingested for ${dto.plate}`,
    };
  }

  @Post('events/:id/images')
  @UseInterceptors(FileInterceptor('image'))
  async uploadImage(
    @Param('id') id: string,
    @Body('type') type: 'plate' | 'overview',
    @UploadedFile() file: any, // Multer file
  ) {
    this.logger.log(`Received ${type} image for event ${id}`);

    // Find the movement
    const movement = await this.movementRepo.findOne({ where: { id } });
    if (!movement) {
      throw new NotFoundException(`Movement ${id} not found`);
    }

    // Save the image using ImageService
    const imageType = type === 'plate' ? 'plate' : 'overview';
    const filename = await this.imageService.saveFromBuffer(
      file.buffer,
      imageType,
    );

    // Update the movement's images array
    const images = movement.images || [];
    images.push({
      url: `/api/images/${filename}`,
      type: imageType,
    });
    movement.images = images;
    await this.movementRepo.save(movement);

    this.logger.log(`Saved ${type} image for movement ${id}: ${filename}`);

    return {
      success: true,
      message: `Image saved for event ${id}`,
      filename,
    };
  }

  /**
   * Receive context/overview event and correlate with existing movement
   * Overview cameras provide additional images for existing ANPR events
   */
  @Post('context')
  @UseInterceptors(FileInterceptor('image'))
  async receiveContextEvent(
    @Body() dto: {
      plate: string;
      timestamp: string;
      cameraId: string;
      cameraName: string;
      posCode: string;
      siteName: string;
      confidence?: number;
      vehicleType?: string;
      vehicleColor?: string;
    },
    @UploadedFile() file?: any,
  ) {
    this.logger.log(
      `Received context event: ${dto.plate} from ${dto.cameraName} (${dto.posCode})`,
    );

    const eventTime = new Date(dto.timestamp);
    const windowMs = 5 * 60 * 1000; // 5 minute correlation window

    // Find recent movement for same VRM at same site
    const movement = await this.movementRepo
      .createQueryBuilder('m')
      .where('m.vrm = :vrm', { vrm: dto.plate.toUpperCase().replace(/\s/g, '') })
      .andWhere('m.siteId = :siteId', { siteId: dto.posCode })
      .andWhere('m.timestamp >= :startTime', {
        startTime: new Date(eventTime.getTime() - windowMs),
      })
      .andWhere('m.timestamp <= :endTime', {
        endTime: new Date(eventTime.getTime() + windowMs),
      })
      .orderBy('ABS(EXTRACT(EPOCH FROM m.timestamp) - :eventEpoch)', 'ASC')
      .setParameter('eventEpoch', eventTime.getTime() / 1000)
      .getOne();

    if (!movement) {
      this.logger.debug(
        `No matching movement found for context event: ${dto.plate} at ${dto.posCode}`,
      );
      return {
        success: false,
        message: 'No matching movement found within correlation window',
        plate: dto.plate,
        site: dto.posCode,
      };
    }

    // If we have an image, save it
    if (file?.buffer) {
      const filename = await this.imageService.saveFromBuffer(
        file.buffer,
        'context',
      );

      // Add context image to movement
      const images = movement.images || [];
      images.push({
        url: `/api/images/${filename}`,
        type: 'context',
        camera: dto.cameraName,
      });
      movement.images = images;
      await this.movementRepo.save(movement);

      this.logger.log(
        `Added context image from ${dto.cameraName} to movement ${movement.id}`,
      );
    }

    // Update movement metadata with additional context
    const rawData = (movement.rawData as any) || {};
    if (!rawData.contextEvents) {
      rawData.contextEvents = [];
    }
    rawData.contextEvents.push({
      camera: dto.cameraName,
      timestamp: dto.timestamp,
      vehicleType: dto.vehicleType,
      vehicleColor: dto.vehicleColor,
      confidence: dto.confidence,
    });
    movement.rawData = rawData;
    await this.movementRepo.save(movement);

    return {
      success: true,
      message: `Context correlated with movement ${movement.id}`,
      movementId: movement.id,
      movementVrm: movement.vrm,
      timeDelta: Math.abs(eventTime.getTime() - movement.timestamp.getTime()) / 1000,
    };
  }

  private mapDirection(
    direction: 'entry' | 'exit' | 'unknown',
  ): 'ENTRY' | 'EXIT' | 'UNKNOWN' {
    switch (direction) {
      case 'entry':
        return 'ENTRY';
      case 'exit':
        return 'EXIT';
      default:
        return 'UNKNOWN';
    }
  }
}
