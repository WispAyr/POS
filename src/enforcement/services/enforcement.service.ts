import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Decision, DecisionOutcome, AuditLog } from '../../domain/entities';

@Injectable()
export class EnforcementService {
    private readonly logger = new Logger(EnforcementService.name);

    constructor(
        @InjectRepository(Decision)
        private readonly decisionRepo: Repository<Decision>,
        @InjectRepository(AuditLog)
        private readonly auditRepo: Repository<AuditLog>,
    ) { }

    async getReviewQueue(siteId?: string): Promise<Decision[]> {
        // Return all ENFORCEMENT_CANDIDATEs that are not yet processed
        const query = this.decisionRepo.createQueryBuilder('d')
            .where('d.outcome = :outcome', { outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE })
            .andWhere('d.status = :status', { status: 'NEW' }); // Assuming 'NEW' or 'CANDIDATE' default

        if (siteId) {
            // Ideally Link to Session to filter by Site, or store SiteID on Decision
            // For now, assuming Global Queue or need Relation load
            // query.innerJoinAndSelect('d.session', 's', 's.siteId = :siteId', { siteId })
        }

        return query.getMany();
    }

    async reviewDecision(id: string, action: 'APPROVE' | 'DECLINE', operatorId: string, notes?: string): Promise<Decision> {
        const decision = await this.decisionRepo.findOne({ where: { id } });
        if (!decision) throw new NotFoundException('Decision not found');

        const previousStatus = decision.status;
        decision.status = action === 'APPROVE' ? 'APPROVED' : 'DECLINED';
        decision.operatorId = operatorId;
        decision.isOperatorOverride = true; // or just tracked via operatorId
        decision.rationale += ` | Review: ${notes || action}`;

        await this.decisionRepo.save(decision);

        // Audit Log
        const audit = this.auditRepo.create({
            entityType: 'DECISION',
            entityId: decision.id,
            action: `REVIEW_${action}`,
            actor: operatorId,
            details: { previousStatus, newStatus: decision.status, notes },
        });
        await this.auditRepo.save(audit);

        this.logger.log(`Decision ${id} reviewed: ${action} by ${operatorId}`);
        return decision;
    }
}
