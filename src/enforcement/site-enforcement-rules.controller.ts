import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import {
  SiteEnforcementRulesService,
  CreateRuleDto,
  UpdateRuleDto,
} from './services/site-enforcement-rules.service';
import { EnforcementRuleType } from '../domain/entities';

@Controller('api/enforcement-settings')
export class SiteEnforcementRulesController {
  constructor(private readonly rulesService: SiteEnforcementRulesService) {}

  /**
   * Get all sites with their current enforcement status
   */
  @Get('sites')
  async getAllSiteStatuses() {
    return this.rulesService.getAllSiteStatuses();
  }

  /**
   * Get all rules for a specific site
   */
  @Get('sites/:siteId/rules')
  async getRulesForSite(@Param('siteId') siteId: string) {
    return this.rulesService.getRulesForSite(siteId);
  }

  /**
   * Create a new enforcement rule
   */
  @Post('rules')
  async createRule(
    @Body()
    body: {
      siteId: string;
      ruleType: EnforcementRuleType;
      startDate: string;
      endDate?: string | null;
      reason: string;
      createdBy?: string;
    },
  ) {
    const dto: CreateRuleDto = {
      siteId: body.siteId,
      ruleType: body.ruleType || EnforcementRuleType.DISABLE_ENFORCEMENT,
      startDate: body.startDate,
      endDate: body.endDate,
      reason: body.reason,
      createdBy: body.createdBy || 'System',
    };
    return this.rulesService.createRule(dto);
  }

  /**
   * Update an existing rule
   */
  @Patch('rules/:id')
  async updateRule(
    @Param('id') id: string,
    @Body()
    body: {
      endDate?: string | null;
      active?: boolean;
      reason?: string;
      updatedBy?: string;
    },
  ) {
    const dto: UpdateRuleDto = {
      endDate: body.endDate,
      active: body.active,
      reason: body.reason,
    };
    return this.rulesService.updateRule(id, dto, body.updatedBy || 'System');
  }

  /**
   * End a rule immediately
   */
  @Post('rules/:id/end')
  async endRule(
    @Param('id') id: string,
    @Body() body: { reason: string; endedBy?: string },
  ) {
    return this.rulesService.endRule(id, body.reason, body.endedBy || 'System');
  }

  /**
   * Get audit history for enforcement rules
   */
  @Get('audit')
  async getAuditHistory(
    @Query('siteId') siteId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.rulesService.getAuditHistory(
      siteId,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  /**
   * Check if enforcement is disabled for a site at a specific time
   */
  @Get('check/:siteId')
  async checkEnforcement(
    @Param('siteId') siteId: string,
    @Query('timestamp') timestamp?: string,
  ) {
    const checkTime = timestamp ? new Date(timestamp) : new Date();
    const result = await this.rulesService.isEnforcementDisabled(
      siteId,
      checkTime,
    );
    return {
      siteId,
      timestamp: checkTime.toISOString(),
      enforcementDisabled: result.disabled,
      rule: result.rule
        ? {
            id: result.rule.id,
            ruleType: result.rule.ruleType,
            reason: result.rule.reason,
            startDate: result.rule.startDate.toISOString(),
            endDate: result.rule.endDate?.toISOString() || null,
          }
        : null,
    };
  }
}
