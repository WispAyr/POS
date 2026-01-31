import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { EnforcementService } from './services/enforcement.service';
import { EnforcementReevaluationService } from '../engine/services/enforcement-reevaluation.service';

@Controller('enforcement')
export class EnforcementController {
  constructor(
    private readonly enforcementService: EnforcementService,
    private readonly reevaluationService: EnforcementReevaluationService,
  ) {}

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

  /**
   * Trigger manual re-evaluation of all enforcement candidates.
   * Only NEW and CANDIDATE statuses are affected - human-reviewed decisions are protected.
   */
  @Post('reevaluate')
  async triggerReevaluation() {
    return this.reevaluationService.triggerReevaluation();
  }

  /**
   * Re-evaluate a specific decision.
   * Only works for NEW and CANDIDATE statuses - human-reviewed decisions require manual intervention.
   */
  @Post('reevaluate/:id')
  async reevaluateDecision(@Param('id') id: string) {
    return this.reevaluationService.reevaluateDecision(id);
  }

  /**
   * Evaluate orphan sessions - completed sessions that never got a decision.
   * This fixes gaps where sessions completed but the rule engine didn't run.
   */
  @Post('evaluate-orphans')
  async evaluateOrphanSessions(@Query('limit') limitStr?: string) {
    const limit = limitStr ? parseInt(limitStr, 10) : 500;
    return this.enforcementService.evaluateOrphanSessions(limit);
  }
}
