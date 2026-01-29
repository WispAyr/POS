import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { EnforcementService } from './services/enforcement.service';

@Controller('enforcement')
export class EnforcementController {
  constructor(private readonly enforcementService: EnforcementService) {}

  @Get('queue')
  async getQueue(
    @Query('status') status?: string,
    @Query('siteId') siteId?: string,
    @Query('siteIds') siteIds?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ) {
    const siteIdArray = siteIds
      ? siteIds.split(',').filter((s) => s.trim())
      : siteId
        ? [siteId]
        : undefined;

    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const offset = offsetStr ? parseInt(offsetStr, 10) : 0;

    const result = await this.enforcementService.getReviewQueue(
      siteIdArray,
      dateFrom,
      dateTo,
      limit,
      offset,
    );

    return {
      items: result.items,
      total: result.total,
      limit,
      offset,
    };
  }

  @Post('review/:id')
  async reviewDecision(
    @Param('id') id: string,
    @Body()
    body: { action: 'APPROVE' | 'DECLINE'; operatorId: string; notes?: string },
  ) {
    return this.enforcementService.reviewDecision(
      id,
      body.action,
      body.operatorId,
      body.notes,
    );
  }

  @Get('vehicle/:vrm/history')
  async getVehicleHistory(@Param('vrm') vrm: string) {
    return this.enforcementService.getVehicleHistory(vrm);
  }

  @Get('vehicle/:vrm/notes')
  async getVehicleNotes(@Param('vrm') vrm: string) {
    return this.enforcementService.getVehicleNotes(vrm);
  }

  @Post('vehicle/:vrm/notes')
  async addVehicleNote(
    @Param('vrm') vrm: string,
    @Body() body: { note: string; createdBy: string },
  ) {
    return this.enforcementService.addVehicleNote(
      vrm,
      body.note,
      body.createdBy,
    );
  }

  @Get('vehicle/:vrm/markers')
  async getVehicleMarkers(@Param('vrm') vrm: string) {
    return this.enforcementService.getVehicleMarkers(vrm);
  }

  @Post('vehicle/:vrm/markers')
  async addVehicleMarker(
    @Param('vrm') vrm: string,
    @Body() body: { markerType: string; description?: string },
  ) {
    return this.enforcementService.addVehicleMarker(
      vrm,
      body.markerType,
      body.description,
    );
  }

  @Get('approved')
  async getApprovedPCNs(
    @Query('siteId') siteId?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ) {
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const offset = offsetStr ? parseInt(offsetStr, 10) : 0;

    const result = await this.enforcementService.getApprovedPCNs(
      siteId,
      limit,
      offset,
    );

    return {
      items: result.items,
      total: result.total,
      limit,
      offset,
    };
  }

  @Post('export')
  async markAsExported(@Body() body: { decisionIds: string[] }) {
    return this.enforcementService.markPCNsAsExported(body.decisionIds);
  }

  @Get('parking-events')
  async getParkingEvents(
    @Query('siteIds') siteIds?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ) {
    const siteIdArray = siteIds
      ? siteIds.split(',').filter((s) => s.trim())
      : undefined;

    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    const offset = offsetStr ? parseInt(offsetStr, 10) : 0;

    const result = await this.enforcementService.getAllParkingEvents(
      siteIdArray,
      dateFrom,
      dateTo,
      limit,
      offset,
    );

    return {
      items: result.items,
      total: result.total,
      limit,
      offset,
    };
  }

  @Get('vehicle/:vrm/details')
  async getVehicleDetails(@Param('vrm') vrm: string) {
    return this.enforcementService.getVehicleDetails(vrm);
  }
}
