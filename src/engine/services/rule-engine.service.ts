import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Session, Decision, DecisionOutcome, Payment, Permit, Site } from '../../domain/entities';

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
    ) { }

    async evaluateSession(session: Session): Promise<Decision> {
        this.logger.log(`Evaluating rules for session ${session.id}`);

        // Check Whitelist/Permit
        const permit = await this.permitRepo.findOne({
            where: [
                { vrm: session.vrm, siteId: session.siteId, active: true },
                { vrm: session.vrm, siteId: null as any, active: true } // Global permit
            ]
        });

        if (permit) {
            return this.recordDecision(session, DecisionOutcome.COMPLIANT, 'VALID_PERMIT', `Permit found: ${permit.type}`);
        }

        // Check Payments
        const site = await this.siteRepo.findOne({ where: { id: session.siteId } });
        const graceConfig = site?.config?.gracePeriods || { entry: 10, exit: 10 };
        const entryGraceMs = (graceConfig.entry || 10) * 60000;
        const exitGraceMs = (graceConfig.exit || 10) * 60000;

        // The period during which the vehicle MUST have a valid payment
        const mandatoryStart = new Date(session.startTime.getTime() + entryGraceMs);
        const mandatoryEnd = new Date(session.endTime.getTime() - exitGraceMs);

        // Find payments for this VRM and Site
        const payments = await this.paymentRepo.find({
            where: { vrm: session.vrm, siteId: session.siteId }
        });

        // Check if any single payment covers the mandatory period
        const validPayment = payments.find(p => {
            const pStart = new Date(p.startTime).getTime();
            const pExpiry = new Date(p.expiryTime).getTime();
            return pStart <= mandatoryStart.getTime() && pExpiry >= mandatoryEnd.getTime();
        });

        if (validPayment) {
            return this.recordDecision(session, DecisionOutcome.COMPLIANT, 'VALID_PAYMENT', `Payment ${validPayment.id} covers the session (with grace)`);
        }

        // Check Grace Period (Short Stay)
        const duration = session.durationMinutes || 0;
        if (duration <= (graceConfig.entry || 10) + (graceConfig.exit || 10)) {
            return this.recordDecision(session, DecisionOutcome.COMPLIANT, 'WITHIN_GRACE', `Duration ${duration} within grace`);
        }

        // Default: Enforcement
        return this.recordDecision(session, DecisionOutcome.ENFORCEMENT_CANDIDATE, 'NO_VALID_PAYMENT', 'No valid permit or payment found for duration');
    }

    private async recordDecision(session: Session, outcome: DecisionOutcome, rule: string, rationale: string): Promise<Decision> {
        const decision = this.decisionRepo.create({
            sessionId: session.id,
            outcome,
            ruleApplied: rule,
            rationale,
        });
        return this.decisionRepo.save(decision);
    }
}
