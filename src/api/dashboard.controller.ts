import { Controller, Get, Post, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Site, Session, Decision, Movement } from '../domain/entities';
import { ImageService } from '../ingestion/services/image.service';

@Controller('api')
export class DashboardController {
  constructor(
    @InjectRepository(Site)
    private readonly siteRepo: Repository<Site>,
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Decision)
    private readonly decisionRepo: Repository<Decision>,
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
    private readonly imageService: ImageService,
  ) {}

  @Get('sites')
  async getSites() {
    return this.siteRepo.find();
  }

  @Get('sites/with-events')
  async getSitesWithEvents() {
    // Get distinct site IDs that have movements
    const sitesWithMovements = await this.movementRepo
      .createQueryBuilder('movement')
      .select('DISTINCT movement.siteId', 'siteId')
      .getRawMany();

    const siteIds = sitesWithMovements.map((s) => s.siteId);

    if (siteIds.length === 0) {
      return [];
    }

    // Get full site details for those IDs
    const sites = await this.siteRepo
      .createQueryBuilder('site')
      .where('site.id IN (:...siteIds)', { siteIds })
      .orderBy('site.name', 'ASC')
      .getMany();

    return sites;
  }

  @Get('stats')
  async getStats(@Query('siteId') siteId?: string) {
    const sessionCount = await this.sessionRepo.count({
      where: siteId ? { siteId } : {},
    });
    const decisionCount = await this.decisionRepo.count({
      where: siteId ? { sessionId: siteId } : {}, // Simplification
    });

    return {
      sessions: sessionCount,
      decisions: decisionCount,
      timestamp: new Date(),
    };
  }

  @Get('debug/movements')
  async getDebugMovements() {
    return this.movementRepo.find({
      take: 20,
      order: { timestamp: 'DESC' },
    });
  }

  @Get('events')
  async getEvents(
    @Query('siteId') siteId?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('vrm') vrm?: string,
    @Query('hideUnknown') hideUnknown?: string,
    @Query('showDiscarded') showDiscarded?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;
    const shouldHideUnknown = hideUnknown === 'true';
    const shouldShowDiscarded = showDiscarded === 'true';

    // Build query with filters
    const queryBuilder = this.movementRepo
      .createQueryBuilder('movement')
      .select([
        'movement.id',
        'movement.siteId',
        'movement.vrm',
        'movement.timestamp',
        'movement.cameraIds',
        'movement.direction',
        'movement.images',
        'movement.ingestedAt',
        'movement.discarded',
        'movement.hailoValidated',
        'movement.hailoVehicleCount',
        'movement.hailoConfidence',
        'movement.hailoResult',
      ])
      .orderBy('movement.timestamp', 'DESC');

    if (siteId) {
      queryBuilder.andWhere('movement.siteId = :siteId', { siteId });
    }

    if (vrm) {
      queryBuilder.andWhere('movement.vrm ILIKE :vrm', { vrm: `%${vrm}%` });
    }

    if (shouldHideUnknown) {
      queryBuilder.andWhere('movement.vrm != :unknown', { unknown: 'UNKNOWN' });
    }

    // By default, hide discarded movements unless explicitly requested
    if (!shouldShowDiscarded) {
      queryBuilder.andWhere('(movement.discarded = false OR movement.discarded IS NULL)');
    }

    const [data, total] = await queryBuilder
      .skip(skip)
      .take(limitNum)
      .getManyAndCount();

    return {
      data,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  @Post('reset')
  async resetSystem() {
    // Clear database records
    await this.decisionRepo.clear();
    await this.sessionRepo.clear();
    await this.movementRepo.clear();

    // Clear local images
    const deletedImages = await this.imageService.clearAllImages();

    return {
      message: 'System data and images cleared successfully',
      deletedImages,
    };
  }
}
