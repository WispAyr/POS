import { Controller, Get, Param, Query, Sse, MessageEvent } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { Observable, interval, map, startWith, switchMap } from 'rxjs';

@Controller('api/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * Get latest audit events (for polling/dashboard)
   */
  @Get('latest')
  async getLatestEvents(
    @Query('limit') limit?: string,
    @Query('since') since?: string,
    @Query('siteId') siteId?: string,
  ) {
    return this.auditService.getLatestEvents({
      limit: limit ? parseInt(limit, 10) : 50,
      since: since ? new Date(since) : undefined,
      siteId,
    });
  }

  /**
   * Server-Sent Events stream for live audit updates
   */
  @Sse('stream')
  streamEvents(
    @Query('siteId') siteId?: string,
  ): Observable<MessageEvent> {
    // Poll every 2 seconds for new events
    return interval(2000).pipe(
      startWith(0),
      switchMap(async () => {
        const events = await this.auditService.getLatestEvents({
          limit: 20,
          since: new Date(Date.now() - 5000), // Last 5 seconds
          siteId,
        });
        return events;
      }),
      map((events) => ({
        data: JSON.stringify(events),
      })),
    );
  }

  @Get('vrm/:vrm')
  async getAuditTrailByVrm(
    @Param('vrm') vrm: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('action') action?: string,
    @Query('actor') actor?: string,
  ) {
    return this.auditService.getAuditTrailByVrm(vrm, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      actionFilter: action ? [action] : undefined,
      actorFilter: actor,
    });
  }

  @Get('entity/:entityType/:entityId')
  async getAuditTrailByEntity(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.auditService.getAuditTrailByEntity(entityType, entityId);
  }

  @Get('decision/:decisionId')
  async getAuditTrailByDecision(@Param('decisionId') decisionId: string) {
    const auditLogs = await this.auditService.getAuditTrailByEntity(
      'DECISION',
      decisionId,
    );
    return {
      decisionId,
      auditLogs,
    };
  }

  @Get('enforcement/:decisionId')
  async getEnforcementCaseHistory(@Param('decisionId') decisionId: string) {
    return this.auditService.getEnforcementCaseHistory(decisionId);
  }

  @Get('timeline/:vrm')
  async getTimeline(
    @Param('vrm') vrm: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.auditService.getTimeline(
      vrm,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('search')
  async searchAuditLogs(
    @Query('vrm') vrm?: string,
    @Query('siteId') siteId?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('actor') actor?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.auditService.searchAuditLogs({
      vrm,
      siteId,
      entityType,
      entityId,
      action,
      actor,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }
}
