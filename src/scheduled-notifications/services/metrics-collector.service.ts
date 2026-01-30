import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { Decision, DecisionOutcome } from '../../domain/entities/decision.entity';
import { Movement } from '../../domain/entities/movement.entity';
import { Alarm } from '../../domain/entities/alarm.entity';
import { PlateReview, ReviewStatus } from '../../domain/entities/plate-review.entity';
import { AlarmStatus } from '../../domain/entities/alarm.enums';

export interface MetricDefinition {
  key: string;
  name: string;
  description: string;
  category: string;
}

@Injectable()
export class MetricsCollectorService {
  private readonly logger = new Logger(MetricsCollectorService.name);

  constructor(
    @InjectRepository(Decision)
    private readonly decisionRepo: Repository<Decision>,
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
    @InjectRepository(Alarm)
    private readonly alarmRepo: Repository<Alarm>,
    @InjectRepository(PlateReview)
    private readonly plateReviewRepo: Repository<PlateReview>,
  ) {}

  getAvailableMetrics(): MetricDefinition[] {
    return [
      // PCN Metrics
      {
        key: 'pcn_approved_today',
        name: 'PCN Approved Today',
        description: 'Number of PCNs approved today',
        category: 'Enforcement',
      },
      {
        key: 'pcn_declined_today',
        name: 'PCN Declined Today',
        description: 'Number of PCNs declined today',
        category: 'Enforcement',
      },
      {
        key: 'pcn_pending_count',
        name: 'PCN Pending Count',
        description: 'Current number of pending PCNs awaiting review',
        category: 'Enforcement',
      },
      {
        key: 'pcn_exported_today',
        name: 'PCN Exported Today',
        description: 'Number of PCNs exported today',
        category: 'Enforcement',
      },
      {
        key: 'enforcement_candidates_today',
        name: 'Enforcement Candidates Today',
        description: 'Number of new enforcement candidates today',
        category: 'Enforcement',
      },
      // Plate Review Metrics
      {
        key: 'plate_review_pending',
        name: 'Plate Review Pending',
        description: 'Number of plates awaiting review',
        category: 'Plate Review',
      },
      {
        key: 'plate_review_completed_today',
        name: 'Plate Reviews Completed Today',
        description: 'Number of plate reviews completed today',
        category: 'Plate Review',
      },
      // Alarm Metrics
      {
        key: 'active_alarms',
        name: 'Active Alarms',
        description: 'Number of currently active alarms',
        category: 'System',
      },
      {
        key: 'critical_alarms',
        name: 'Critical Alarms',
        description: 'Number of critical active alarms',
        category: 'System',
      },
      // Movement Metrics
      {
        key: 'entries_today',
        name: 'Entries Today',
        description: 'Number of vehicle entries today',
        category: 'Movements',
      },
      {
        key: 'exits_today',
        name: 'Exits Today',
        description: 'Number of vehicle exits today',
        category: 'Movements',
      },
      {
        key: 'total_movements_today',
        name: 'Total Movements Today',
        description: 'Total vehicle movements today',
        category: 'Movements',
      },
      // Date Variables
      {
        key: 'current_date',
        name: 'Current Date',
        description: 'Current date in specified format',
        category: 'Date',
      },
      {
        key: 'current_time',
        name: 'Current Time',
        description: 'Current time in HH:mm format',
        category: 'Date',
      },
    ];
  }

  async collectMetric(metricKey: string, siteId?: string): Promise<number | string> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    try {
      switch (metricKey) {
        case 'pcn_approved_today':
          return this.countDecisionsByStatus('APPROVED', startOfDay, endOfDay, siteId);

        case 'pcn_declined_today':
          return this.countDecisionsByStatus('DECLINED', startOfDay, endOfDay, siteId);

        case 'pcn_pending_count':
          return this.countPendingDecisions(siteId);

        case 'pcn_exported_today':
          return this.countDecisionsByStatus('EXPORTED', startOfDay, endOfDay, siteId);

        case 'enforcement_candidates_today':
          return this.countEnforcementCandidates(startOfDay, endOfDay, siteId);

        case 'plate_review_pending':
          return this.countPendingPlateReviews(siteId);

        case 'plate_review_completed_today':
          return this.countCompletedPlateReviews(startOfDay, endOfDay, siteId);

        case 'active_alarms':
          return this.countActiveAlarms(siteId);

        case 'critical_alarms':
          return this.countCriticalAlarms(siteId);

        case 'entries_today':
          return this.countMovements('ENTRY', startOfDay, endOfDay, siteId);

        case 'exits_today':
          return this.countMovements('EXIT', startOfDay, endOfDay, siteId);

        case 'total_movements_today':
          return this.countTotalMovements(startOfDay, endOfDay, siteId);

        case 'current_date':
          return new Date().toLocaleDateString('en-GB');

        case 'current_time':
          return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

        default:
          this.logger.warn(`Unknown metric key: ${metricKey}`);
          return 0;
      }
    } catch (err: any) {
      this.logger.error(`Error collecting metric ${metricKey}: ${err.message}`, err.stack);
      return 0;
    }
  }

  async collectAllMetrics(siteId?: string): Promise<Record<string, number | string>> {
    const metrics: Record<string, number | string> = {};
    const definitions = this.getAvailableMetrics();

    for (const def of definitions) {
      metrics[def.key] = await this.collectMetric(def.key, siteId);
    }

    return metrics;
  }

  private async countDecisionsByStatus(
    status: string,
    startDate: Date,
    endDate: Date,
    siteId?: string,
  ): Promise<number> {
    const query = this.decisionRepo
      .createQueryBuilder('decision')
      .where('decision.status = :status', { status })
      .andWhere('decision.createdAt BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });

    if (siteId) {
      query.innerJoin('sessions', 'session', 'decision.sessionId = session.id')
           .andWhere('session.siteId = :siteId', { siteId });
    }

    return query.getCount();
  }

  private async countPendingDecisions(siteId?: string): Promise<number> {
    const query = this.decisionRepo
      .createQueryBuilder('decision')
      .where('decision.status IN (:...statuses)', {
        statuses: ['NEW', 'CANDIDATE'],
      })
      .andWhere('decision.outcome = :outcome', {
        outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE,
      });

    if (siteId) {
      query.innerJoin('sessions', 'session', 'decision.sessionId = session.id')
           .andWhere('session.siteId = :siteId', { siteId });
    }

    return query.getCount();
  }

  private async countEnforcementCandidates(
    startDate: Date,
    endDate: Date,
    siteId?: string,
  ): Promise<number> {
    const query = this.decisionRepo
      .createQueryBuilder('decision')
      .where('decision.outcome = :outcome', {
        outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE,
      })
      .andWhere('decision.createdAt BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });

    if (siteId) {
      query.innerJoin('sessions', 'session', 'decision.sessionId = session.id')
           .andWhere('session.siteId = :siteId', { siteId });
    }

    return query.getCount();
  }

  private async countPendingPlateReviews(siteId?: string): Promise<number> {
    const query = this.plateReviewRepo
      .createQueryBuilder('review')
      .where('review.reviewStatus = :status', {
        status: ReviewStatus.PENDING,
      });

    if (siteId) {
      query.andWhere('review.siteId = :siteId', { siteId });
    }

    return query.getCount();
  }

  private async countCompletedPlateReviews(
    startDate: Date,
    endDate: Date,
    siteId?: string,
  ): Promise<number> {
    const query = this.plateReviewRepo
      .createQueryBuilder('review')
      .where('review.reviewStatus IN (:...statuses)', {
        statuses: [ReviewStatus.APPROVED, ReviewStatus.CORRECTED, ReviewStatus.DISCARDED],
      })
      .andWhere('review.reviewedAt BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });

    if (siteId) {
      query.andWhere('review.siteId = :siteId', { siteId });
    }

    return query.getCount();
  }

  private async countActiveAlarms(siteId?: string): Promise<number> {
    const query = this.alarmRepo
      .createQueryBuilder('alarm')
      .where('alarm.status IN (:...statuses)', {
        statuses: [AlarmStatus.TRIGGERED, AlarmStatus.ACKNOWLEDGED],
      });

    if (siteId) {
      query.andWhere('(alarm.siteId = :siteId OR alarm.siteId IS NULL)', { siteId });
    }

    return query.getCount();
  }

  private async countCriticalAlarms(siteId?: string): Promise<number> {
    const query = this.alarmRepo
      .createQueryBuilder('alarm')
      .where('alarm.status IN (:...statuses)', {
        statuses: [AlarmStatus.TRIGGERED, AlarmStatus.ACKNOWLEDGED],
      })
      .andWhere('alarm.severity = :severity', { severity: 'CRITICAL' });

    if (siteId) {
      query.andWhere('(alarm.siteId = :siteId OR alarm.siteId IS NULL)', { siteId });
    }

    return query.getCount();
  }

  private async countMovements(
    direction: string,
    startDate: Date,
    endDate: Date,
    siteId?: string,
  ): Promise<number> {
    const query = this.movementRepo
      .createQueryBuilder('movement')
      .where('movement.direction = :direction', { direction })
      .andWhere('movement.timestamp BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });

    if (siteId) {
      query.andWhere('movement.siteId = :siteId', { siteId });
    }

    return query.getCount();
  }

  private async countTotalMovements(
    startDate: Date,
    endDate: Date,
    siteId?: string,
  ): Promise<number> {
    const query = this.movementRepo
      .createQueryBuilder('movement')
      .where('movement.timestamp BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      });

    if (siteId) {
      query.andWhere('movement.siteId = :siteId', { siteId });
    }

    return query.getCount();
  }
}
