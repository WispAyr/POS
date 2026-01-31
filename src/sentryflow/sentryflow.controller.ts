import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { SentryflowService } from './sentryflow.service';

@Controller('api/sentryflow')
export class SentryflowController {
  constructor(private readonly sentryflowService: SentryflowService) {}

  /**
   * Get SentryFlow status
   */
  @Get('status')
  async getStatus() {
    return this.sentryflowService.getStatus();
  }

  /**
   * Get all rules
   */
  @Get('rules')
  async getRules() {
    return this.sentryflowService.getRules();
  }

  /**
   * Get rules for a specific site (by camera IDs)
   */
  @Get('rules/site/:siteId')
  async getRulesForSite(@Param('siteId') siteId: string) {
    // Map site IDs to camera protect IDs
    const siteCamera: Record<string, string[]> = {
      'kyle-rise': [
        '692dd5480096ea03e4000423', // Ground Floor Front
        '692dd54800e1ea03e4000424', // Ground Floor Rear
        '692dd5480117ea03e4000426', // Ground Floor & Ramp
      ],
      'KCS01': [
        '692dd548013cea03e4000427', // G6 PTZ Surface
        '692dd548015eea03e4000428', // Surface Rear Pod
      ],
      'RDB01': [], // Radisson - cameras TBD
    };

    const cameraIds = siteCamera[siteId] || [];
    return this.sentryflowService.getRulesForSite(cameraIds);
  }

  /**
   * Get a single rule
   */
  @Get('rules/:id')
  async getRule(@Param('id') id: string) {
    return this.sentryflowService.getRule(id);
  }

  /**
   * Create a new rule
   */
  @Post('rules')
  async createRule(@Body() rule: any) {
    return this.sentryflowService.createRule(rule);
  }

  /**
   * Update a rule
   */
  @Put('rules/:id')
  async updateRule(@Param('id') id: string, @Body() rule: any) {
    return this.sentryflowService.updateRule(id, rule);
  }

  /**
   * Delete a rule
   */
  @Delete('rules/:id')
  async deleteRule(@Param('id') id: string) {
    return this.sentryflowService.deleteRule(id);
  }

  /**
   * Toggle rule enabled/disabled
   */
  @Patch('rules/:id/toggle')
  async toggleRule(@Param('id') id: string) {
    return this.sentryflowService.toggleRule(id);
  }

  /**
   * Get event log
   */
  @Get('events')
  async getEvents(@Query('limit') limit?: string) {
    return this.sentryflowService.getEvents(limit ? parseInt(limit) : 50);
  }

  /**
   * Get escalation state for a rule
   */
  @Get('rules/:id/escalation')
  async getEscalationState(@Param('id') id: string) {
    return this.sentryflowService.getEscalationState(id);
  }

  /**
   * Reset escalation for a rule
   */
  @Post('rules/:id/escalation/reset')
  async resetEscalation(@Param('id') id: string) {
    return this.sentryflowService.resetEscalation(id);
  }

  /**
   * Get alarm status
   */
  @Get('alarm/status')
  async getAlarmStatus() {
    return this.sentryflowService.getAlarmStatus();
  }

  /**
   * Set alarm mode
   */
  @Post('alarm/mode')
  async setAlarmMode(@Body() body: { mode: 'armed' | 'disarmed'; pin?: string }) {
    return this.sentryflowService.setAlarmMode(body.mode, body.pin);
  }
}
