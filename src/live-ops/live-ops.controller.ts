import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Res,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { LiveOpsService } from './live-ops.service';
import { AnnounceRequestDto } from './live-ops.types';

@Controller('api/live-ops')
export class LiveOpsController {
  private readonly logger = new Logger(LiveOpsController.name);

  constructor(private readonly liveOpsService: LiveOpsService) {}

  /**
   * Get all sites with live ops enabled
   */
  @Get('sites')
  async getLiveOpsSites() {
    return this.liveOpsService.getLiveOpsSites();
  }

  /**
   * Get live ops config for a specific site
   */
  @Get('sites/:siteId')
  async getSiteLiveOps(@Param('siteId') siteId: string) {
    const site = await this.liveOpsService.getSiteWithLiveOps(siteId);
    return {
      id: site.id,
      name: site.name,
      liveOps: site.config?.liveOps || null,
    };
  }

  /**
   * Trigger an announcement at a site
   */
  @Post('sites/:siteId/announce')
  async triggerAnnouncement(
    @Param('siteId') siteId: string,
    @Body() dto: AnnounceRequestDto,
  ) {
    this.logger.log(`Announcement request for site ${siteId}: ${dto.message}`);
    return this.liveOpsService.triggerAnnouncement(siteId, dto);
  }

  /**
   * Get camera snapshot
   */
  @Get('sites/:siteId/cameras/:cameraId/snapshot')
  async getCameraSnapshot(
    @Param('siteId') siteId: string,
    @Param('cameraId') cameraId: string,
    @Res() res: Response,
  ) {
    const result = await this.liveOpsService.getCameraSnapshot(siteId, cameraId);

    if (!result.success || !result.data) {
      return res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        error: result.error || 'Failed to get snapshot',
      });
    }

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(result.data);
  }

  /**
   * Trigger barrier control (Radisson-specific, stub for now)
   */
  @Post('sites/:siteId/barrier/:action')
  async triggerBarrier(
    @Param('siteId') siteId: string,
    @Param('action') action: 'open' | 'close',
  ) {
    return this.liveOpsService.triggerBarrierControl(siteId, action);
  }

  /**
   * Update live ops config for a site
   */
  @Post('sites/:siteId/config')
  async updateConfig(
    @Param('siteId') siteId: string,
    @Body() config: any,
  ) {
    return this.liveOpsService.updateLiveOpsConfig(siteId, config);
  }
}
