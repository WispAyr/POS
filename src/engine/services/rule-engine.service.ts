import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import {
  Session,
  Decision,
  DecisionOutcome,
  Payment,
  Permit,
  Site,
  SiteEnforcementRule,
} from '../../domain/entities';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class RuleEngineService {
  private readonly logger = new Logger(RuleEngineService.name);

  constructor(
    @InjectRepository(Decision)
    private readonly decisionRepo: Repository<Decision>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Permit)
    private readonly permitRepo: Repository<Permit>,
    @InjectRepository(Site)
    private readonly siteRepo: Repository<Site>,
    @InjectRepository(SiteEnforcementRule)
    private readonly enforcementRuleRepo: Repository<SiteEnforcementRule>,
    private readonly auditService: AuditService,
  ) {}

  async evaluateSession(session: Session): Promise<Decision> {
    this.logger.log(`Evaluating rules for session ${session.id}`);

    // Check if enforcement is disabled for this site
    const enforcementRule = await this.checkEnforcementDisabled(
      session.siteId,
      session.startTime,
    );
    if (enforcementRule) {
      this.logger.log(
        `Enforcement disabled for site ${session.siteId}: ${enforcementRule.reason}`,
      );
      return this.recordDecision(
        session,
        DecisionOutcome.COMPLIANT,
        'ENFORCEMENT_DISABLED',
        `Enforcement disabled: ${enforcementRule.reason}`,
      );
    }

    // Check Whitelist/Permit
    const permit = await this.permitRepo.findOne({
      where: [
        { vrm: session.vrm, siteId: session.siteId, active: true },
        { vrm: session.vrm, siteId: null as any, active: true }, // Global permit
      ],
    });

    if (permit) {
      return this.recordDecision(
        session,
        DecisionOutcome.COMPLIANT,
        'VALID_PERMIT',
        `Permit found: ${permit.type}`,
      );
    }

    // Check Payments
    const site = await this.siteRepo.findOne({ where: { id: session.siteId } });
    const graceConfig = site?.config?.gracePeriods || { entry: 10, exit: 10 };
    const entryGraceMs = (graceConfig.entry || 10) * 60000;
    const exitGraceMs = (graceConfig.exit || 10) * 60000;

    // If session is not completed (no endTime), check grace period only
    if (!session.endTime) {
      // For provisional sessions, we can't evaluate payment yet
      // Check if duration (if calculated) is within grace
      const duration = session.durationMinutes || 0;
      if (duration <= (graceConfig.entry || 10) + (graceConfig.exit || 10)) {
        return this.recordDecision(
          session,
          DecisionOutcome.COMPLIANT,
          'WITHIN_GRACE',
          `Duration ${duration} within grace`,
        );
      }
      // Can't determine enforcement without end time
      return this.recordDecision(
        session,
        DecisionOutcome.REQUIRES_REVIEW,
        'INCOMPLETE_SESSION',
        'Session not completed, cannot evaluate',
      );
    }

    // The period during which the vehicle MUST have a valid payment
    const mandatoryStart = new Date(session.startTime.getTime() + entryGraceMs);
    const mandatoryEnd = new Date(session.endTime.getTime() - exitGraceMs);

    // Find payments for this VRM and Site
    const payments = await this.paymentRepo.find({
      where: { vrm: session.vrm, siteId: session.siteId },
    });

    // Check if any single payment covers the mandatory period
    const validPayment = payments.find((p) => {
      const pStart = new Date(p.startTime).getTime();
      const pExpiry = new Date(p.expiryTime).getTime();
      return (
        pStart <= mandatoryStart.getTime() && pExpiry >= mandatoryEnd.getTime()
      );
    });

    if (validPayment) {
      return this.recordDecision(
        session,
        DecisionOutcome.COMPLIANT,
        'VALID_PAYMENT',
        `Payment ${validPayment.id} covers the session (with grace)`,
      );
    }

    // Check Grace Period (Short Stay)
    const duration = session.durationMinutes || 0;
    if (duration <= (graceConfig.entry || 10) + (graceConfig.exit || 10)) {
      return this.recordDecision(
        session,
        DecisionOutcome.COMPLIANT,
        'WITHIN_GRACE',
        `Duration ${duration} within grace`,
      );
    }

    // Check for OVERSTAY - payment existed but expired before exit
    // Overstay consideration period from site config (default 15 minutes)
    const overstayGraceMinutes = graceConfig.overstay ?? 15;
    
    const overstayPayment = payments.find((p) => {
      const pStart = new Date(p.startTime).getTime();
      const pExpiry = new Date(p.expiryTime).getTime();
      // Payment started before/during mandatory period but expired before exit
      return (
        pStart <= mandatoryEnd.getTime() &&  // Started during the stay
        pExpiry < mandatoryEnd.getTime() &&   // But expired before they left
        pExpiry > mandatoryStart.getTime()    // And was valid for at least part of the stay
      );
    });

    if (overstayPayment) {
      const overstayMinutes = Math.round(
        (mandatoryEnd.getTime() - new Date(overstayPayment.expiryTime).getTime()) / 60000
      );
      
      // Only flag as overstay if exceeds the consideration period
      if (overstayMinutes > overstayGraceMinutes) {
        return this.recordDecision(
          session,
          DecisionOutcome.ENFORCEMENT_CANDIDATE,
          'OVERSTAY',
          `Payment expired ${overstayMinutes} mins before exit (threshold: ${overstayGraceMinutes} mins)`,
          {
            paymentId: overstayPayment.id,
            paymentExpiry: overstayPayment.expiryTime,
            overstayMinutes,
            overstayThreshold: overstayGraceMinutes,
            paymentSource: overstayPayment.source,
          },
        );
      }
      
      // Overstay within consideration period - compliant
      return this.recordDecision(
        session,
        DecisionOutcome.COMPLIANT,
        'OVERSTAY_WITHIN_GRACE',
        `Payment expired ${overstayMinutes} mins before exit (within ${overstayGraceMinutes} min threshold)`,
      );
    }

    // Default: No valid coverage found
    // Determine the appropriate violation type based on site configuration
    const siteEnforcementType = site?.config?.enforcementType || 'AUTO';
    
    // For AUTO mode, check if this site has any payment records (indicating it's a pay site)
    let hasPaymentSystem = false;
    if (siteEnforcementType === 'AUTO') {
      const anyPaymentAtSite = await this.paymentRepo.findOne({
        where: { siteId: session.siteId },
        select: ['id'],
      });
      hasPaymentSystem = !!anyPaymentAtSite;
    } else {
      hasPaymentSystem = siteEnforcementType === 'PAY_AND_DISPLAY' || siteEnforcementType === 'MIXED';
    }
    
    if (hasPaymentSystem) {
      // Site has payment systems - it's a "no valid payment" violation
      return this.recordDecision(
        session,
        DecisionOutcome.ENFORCEMENT_CANDIDATE,
        'NO_VALID_PAYMENT',
        'No valid permit or payment found for duration',
        {
          siteType: 'PAY_AND_DISPLAY',
          paymentsChecked: payments.length,
        },
      );
    } else {
      // Site is permit-only - it's an "unauthorised parking" violation
      return this.recordDecision(
        session,
        DecisionOutcome.ENFORCEMENT_CANDIDATE,
        'UNAUTHORISED_PARKING',
        'Vehicle parked without valid permit or authorisation',
        {
          siteType: 'PERMIT_ONLY',
        },
      );
    }
  }

  private async recordDecision(
    session: Session,
    outcome: DecisionOutcome,
    rule: string,
    rationale: string,
    params?: Record<string, any>,
  ): Promise<Decision> {
    // Check for existing decision for this session to prevent duplicates
    const existingDecision = await this.decisionRepo.findOne({
      where: { sessionId: session.id },
    });

    if (existingDecision) {
      // Update existing decision if it hasn't been human-reviewed
      if (['NEW', 'CANDIDATE'].includes(existingDecision.status)) {
        existingDecision.outcome = outcome;
        existingDecision.ruleApplied = rule;
        existingDecision.rationale = rationale;
        if (params) {
          existingDecision.params = params;
        }
        return this.decisionRepo.save(existingDecision);
      }
      // Return existing decision if already reviewed (don't overwrite)
      return existingDecision;
    }

    const decision = this.decisionRepo.create({
      sessionId: session.id,
      outcome,
      ruleApplied: rule,
      rationale,
      params: params || null,
    });
    const savedDecision = await this.decisionRepo.save(decision);

    // Get session completed audit log to link as parent
    const sessionAudits = await this.auditService.getAuditTrailByEntity(
      'SESSION',
      session.id,
    );
    const sessionCompletedAuditId = sessionAudits.find(
      (a) => a.action === 'SESSION_COMPLETED',
    )?.id;

    // Audit log decision creation
    await this.auditService.logDecisionCreation(
      savedDecision,
      session,
      sessionCompletedAuditId,
    );

    return savedDecision;
  }

  /**
   * Check if enforcement is disabled for a site at a given time
   */
  private async checkEnforcementDisabled(
    siteId: string,
    timestamp: Date,
  ): Promise<SiteEnforcementRule | null> {
    const rule = await this.enforcementRuleRepo
      .createQueryBuilder('r')
      .where('r.site_id = :siteId', { siteId })
      .andWhere('r.active = true')
      .andWhere('r.start_date <= :timestamp', { timestamp })
      .andWhere('(r.end_date IS NULL OR r.end_date >= :timestamp)', { timestamp })
      .orderBy('r.created_at', 'DESC')
      .getOne();

    return rule || null;
  }
}
