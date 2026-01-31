import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, IsNull, Or, In } from 'typeorm';
import {
  SiteEnforcementRule,
  EnforcementRuleType,
  Site,
  Decision,
  Session,
  DecisionOutcome,
} from '../../domain/entities';
import { AuditService } from '../../audit/audit.service';

export interface CreateRuleDto {
  siteId: string;
  ruleType: EnforcementRuleType;
  startDate: string; // ISO date string
  endDate?: string | null; // NULL = currently/indefinite
  reason: string;
  createdBy: string;
}

export interface UpdateRuleDto {
  endDate?: string | null;
  active?: boolean;
  reason?: string;
}

export interface SiteEnforcementStatus {
  siteId: string;
  siteName: string;
  enforcementEnabled: boolean;
  activeRule?: {
    id: string;
    ruleType: EnforcementRuleType;
    startDate: string;
    endDate: string | null;
    reason: string;
    createdBy: string;
    createdAt: string;
  };
  upcomingRules: number;
  historicalRules: number;
}

@Injectable()
export class SiteEnforcementRulesService {
  private readonly logger = new Logger(SiteEnforcementRulesService.name);

  constructor(
    @InjectRepository(SiteEnforcementRule)
    private readonly ruleRepo: Repository<SiteEnforcementRule>,
    @InjectRepository(Site)
    private readonly siteRepo: Repository<Site>,
    @InjectRepository(Decision)
    private readonly decisionRepo: Repository<Decision>,
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Check if enforcement is disabled for a site at a given time
   */
  async isEnforcementDisabled(siteId: string, timestamp: Date): Promise<{ disabled: boolean; rule?: SiteEnforcementRule }> {
    const rule = await this.ruleRepo
      .createQueryBuilder('r')
      .where('r.site_id = :siteId', { siteId })
      .andWhere('r.active = true')
      .andWhere('r.start_date <= :timestamp', { timestamp })
      .andWhere('(r.end_date IS NULL OR r.end_date >= :timestamp)', { timestamp })
      .orderBy('r.created_at', 'DESC')
      .getOne();

    if (rule) {
      return { disabled: true, rule };
    }
    return { disabled: false };
  }

  /**
   * Get all sites with their enforcement status
   */
  async getAllSiteStatuses(): Promise<SiteEnforcementStatus[]> {
    const sites = await this.siteRepo.find({ where: { active: true }, order: { name: 'ASC' } });
    const now = new Date();

    const statuses: SiteEnforcementStatus[] = [];

    for (const site of sites) {
      // Get active rule (if any)
      const activeRule = await this.ruleRepo
        .createQueryBuilder('r')
        .where('r.site_id = :siteId', { siteId: site.id })
        .andWhere('r.active = true')
        .andWhere('r.start_date <= :now', { now })
        .andWhere('(r.end_date IS NULL OR r.end_date >= :now)', { now })
        .orderBy('r.created_at', 'DESC')
        .getOne();

      // Count upcoming rules
      const upcomingRules = await this.ruleRepo.count({
        where: {
          siteId: site.id,
          active: true,
          startDate: MoreThanOrEqual(now),
        },
      });

      // Count historical rules
      const historicalRules = await this.ruleRepo.count({
        where: {
          siteId: site.id,
          active: false,
        },
      });

      statuses.push({
        siteId: site.id,
        siteName: site.name,
        enforcementEnabled: !activeRule,
        activeRule: activeRule
          ? {
              id: activeRule.id,
              ruleType: activeRule.ruleType,
              startDate: activeRule.startDate.toISOString(),
              endDate: activeRule.endDate?.toISOString() || null,
              reason: activeRule.reason,
              createdBy: activeRule.createdBy,
              createdAt: activeRule.createdAt.toISOString(),
            }
          : undefined,
        upcomingRules,
        historicalRules,
      });
    }

    return statuses;
  }

  /**
   * Get all rules for a specific site
   */
  async getRulesForSite(siteId: string): Promise<SiteEnforcementRule[]> {
    return this.ruleRepo.find({
      where: { siteId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Create a new enforcement rule
   */
  async createRule(dto: CreateRuleDto): Promise<SiteEnforcementRule> {
    // Validate site exists
    const site = await this.siteRepo.findOne({ where: { id: dto.siteId } });
    if (!site) {
      throw new NotFoundException(`Site ${dto.siteId} not found`);
    }

    // Validate reason is provided
    if (!dto.reason || dto.reason.trim().length < 10) {
      throw new BadRequestException('Reason must be at least 10 characters');
    }

    const startDate = new Date(dto.startDate);
    const endDate = dto.endDate ? new Date(dto.endDate) : null;

    // Validate dates
    if (endDate && endDate <= startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    const rule = this.ruleRepo.create({
      siteId: dto.siteId,
      ruleType: dto.ruleType,
      startDate,
      endDate,
      reason: dto.reason.trim(),
      createdBy: dto.createdBy,
      active: true,
    });

    const saved = await this.ruleRepo.save(rule);

    // Audit log
    await this.auditService.log({
      entityType: 'SITE_ENFORCEMENT_RULE',
      entityId: saved.id,
      action: 'RULE_CREATED',
      actor: dto.createdBy,
      siteId: dto.siteId,
      details: {
        siteName: site.name,
        ruleType: dto.ruleType,
        startDate: startDate.toISOString(),
        endDate: endDate?.toISOString() || 'indefinite',
        reason: dto.reason,
      },
    });

    this.logger.log(
      `Created enforcement rule for site ${site.name}: ${dto.ruleType} from ${startDate.toISOString()} to ${endDate?.toISOString() || 'indefinite'}. Reason: ${dto.reason}`,
    );

    // Retroactively update unreviewed potential PCNs
    const retroactiveResult = await this.applyRuleRetroactively(saved, site.name, dto.createdBy);
    if (retroactiveResult.updated > 0) {
      this.logger.log(
        `Retroactively updated ${retroactiveResult.updated} potential PCNs for site ${site.name}`,
      );
    }

    return saved;
  }

  /**
   * Update an existing rule (mainly to end it or deactivate)
   */
  async updateRule(id: string, dto: UpdateRuleDto, updatedBy: string): Promise<SiteEnforcementRule> {
    const rule = await this.ruleRepo.findOne({ where: { id }, relations: ['site'] });
    if (!rule) {
      throw new NotFoundException(`Rule ${id} not found`);
    }

    const changes: any = {};

    if (dto.endDate !== undefined) {
      changes.previousEndDate = rule.endDate?.toISOString() || 'indefinite';
      rule.endDate = dto.endDate ? new Date(dto.endDate) : null;
      changes.newEndDate = rule.endDate?.toISOString() || 'indefinite';
    }

    if (dto.active !== undefined) {
      changes.previousActive = rule.active;
      rule.active = dto.active;
      changes.newActive = dto.active;
    }

    if (dto.reason) {
      changes.additionalReason = dto.reason;
    }

    const saved = await this.ruleRepo.save(rule);

    // Audit log
    await this.auditService.log({
      entityType: 'SITE_ENFORCEMENT_RULE',
      entityId: saved.id,
      action: 'RULE_UPDATED',
      actor: updatedBy,
      siteId: rule.siteId,
      details: {
        siteName: rule.site?.name,
        changes,
        reason: dto.reason || 'No reason provided for update',
      },
    });

    this.logger.log(`Updated enforcement rule ${id}: ${JSON.stringify(changes)}`);

    return saved;
  }

  /**
   * End a rule immediately (set end date to now)
   */
  async endRule(id: string, reason: string, endedBy: string): Promise<SiteEnforcementRule> {
    if (!reason || reason.trim().length < 10) {
      throw new BadRequestException('Reason must be at least 10 characters');
    }

    const rule = await this.ruleRepo.findOne({ where: { id }, relations: ['site'] });
    if (!rule) {
      throw new NotFoundException(`Rule ${id} not found`);
    }

    rule.endDate = new Date();
    const saved = await this.ruleRepo.save(rule);

    // Audit log
    await this.auditService.log({
      entityType: 'SITE_ENFORCEMENT_RULE',
      entityId: saved.id,
      action: 'RULE_ENDED',
      actor: endedBy,
      siteId: rule.siteId,
      details: {
        siteName: rule.site?.name,
        endedAt: rule.endDate.toISOString(),
        reason: reason.trim(),
        originalStartDate: rule.startDate.toISOString(),
      },
    });

    this.logger.log(`Ended enforcement rule ${id} for site ${rule.site?.name}. Reason: ${reason}`);

    return saved;
  }

  /**
   * Get audit history for all enforcement rules
   */
  async getAuditHistory(siteId?: string, limit = 50): Promise<any[]> {
    return this.auditService.searchAuditLogs({
      entityType: 'SITE_ENFORCEMENT_RULE',
      siteId,
      limit,
    });
  }

  /**
   * Apply rule retroactively to existing unreviewed potential PCNs
   * Only affects decisions with status 'NEW' (not human-reviewed)
   * Uses bulk update for efficiency
   */
  private async applyRuleRetroactively(
    rule: SiteEnforcementRule,
    siteName: string,
    actor: string,
  ): Promise<{ updated: number; decisions: string[] }> {
    // Use a single efficient query to find and count affected decisions
    // Join decisions with sessions to filter by site and date
    const countResult = await this.decisionRepo
      .createQueryBuilder('d')
      .innerJoin(Session, 's', 'd.sessionId = s.id')
      .where('s.siteId = :siteId', { siteId: rule.siteId })
      .andWhere('s.startTime >= :startDate', { startDate: rule.startDate })
      .andWhere(rule.endDate ? 's.startTime <= :endDate' : '1=1', { endDate: rule.endDate })
      .andWhere('d.outcome = :outcome', { outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE })
      .andWhere('d.status = :status', { status: 'NEW' })
      .getCount();

    if (countResult === 0) {
      return { updated: 0, decisions: [] };
    }

    this.logger.log(`Retroactively updating ${countResult} decisions for site ${siteName}...`);

    // First get the decision IDs to update
    const decisionsToUpdate = await this.decisionRepo
      .createQueryBuilder('d')
      .select('d.id')
      .innerJoin(Session, 's', 'd.sessionId = s.id')
      .where('s.siteId = :siteId', { siteId: rule.siteId })
      .andWhere('s.startTime >= :startDate', { startDate: rule.startDate })
      .andWhere(rule.endDate ? 's.startTime <= :endDate' : '1=1', { endDate: rule.endDate })
      .andWhere('d.outcome = :outcome', { outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE })
      .andWhere('d.status = :status', { status: 'NEW' })
      .getMany();

    const decisionIds = decisionsToUpdate.map((d) => d.id);

    if (decisionIds.length === 0) {
      return { updated: 0, decisions: [] };
    }

    // Bulk update using the IDs
    const updateResult = await this.decisionRepo
      .createQueryBuilder()
      .update()
      .set({
        outcome: DecisionOutcome.COMPLIANT,
        ruleApplied: 'ENFORCEMENT_DISABLED_RETROACTIVE',
        rationale: `Enforcement disabled retroactively: ${rule.reason}`,
        status: 'AUTO_RESOLVED',
      })
      .whereInIds(decisionIds)
      .execute();

    const updatedCount = updateResult.affected || 0;

    // Log summary audit (single audit entry for bulk operation)
    await this.auditService.log({
      entityType: 'SITE_ENFORCEMENT_RULE',
      entityId: rule.id,
      action: 'RETROACTIVE_UPDATE_APPLIED',
      actor,
      siteId: rule.siteId,
      details: {
        siteName,
        decisionsUpdated: updatedCount,
        reason: rule.reason,
        dateRange: {
          from: rule.startDate.toISOString(),
          to: rule.endDate?.toISOString() || 'ongoing',
        },
      },
    });

    return { updated: updatedCount, decisions: [] };
  }
}
