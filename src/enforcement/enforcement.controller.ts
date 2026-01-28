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
  ) {
    const siteIdArray = siteIds
      ? siteIds.split(',').filter((s) => s.trim())
      : siteId
        ? [siteId]
        : undefined;

    return this.enforcementService.getReviewQueue(
      siteIdArray,
      dateFrom,
      dateTo,
    );
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
  async getApprovedPCNs(@Query('siteId') siteId?: string) {
    return this.enforcementService.getApprovedPCNs(siteId);
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
  ) {
    const siteIdArray = siteIds
      ? siteIds.split(',').filter((s) => s.trim())
      : undefined;

    return this.enforcementService.getAllParkingEvents(
      siteIdArray,
      dateFrom,
      dateTo,
    );
  }
}
