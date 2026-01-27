import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { EnforcementService } from './services/enforcement.service';

@Controller('enforcement')
export class EnforcementController {
  constructor(private readonly enforcementService: EnforcementService) {}

  @Get('queue')
  async getQueue(@Query('siteId') siteId?: string) {
    return this.enforcementService.getReviewQueue(siteId);
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
}
