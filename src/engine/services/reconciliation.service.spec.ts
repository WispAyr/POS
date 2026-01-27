import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReconciliationService } from './reconciliation.service';
import { RuleEngineService } from './rule-engine.service';
import { Session, Decision, DecisionOutcome } from '../../domain/entities';
import { SessionStatus } from '../../domain/entities';
import { createMockRepository } from '../../../test/unit/mocks/repository.mock';
import {
  createTestSession,
  createTestDecision,
} from '../../../test/unit/fixtures/entities';

describe('ReconciliationService', () => {
  let service: ReconciliationService;
  let sessionRepo: Repository<Session>;
  let decisionRepo: Repository<Decision>;
  let ruleEngine: RuleEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconciliationService,
        {
          provide: getRepositoryToken(Session),
          useValue: createMockRepository<Session>(),
        },
        {
          provide: getRepositoryToken(Decision),
          useValue: createMockRepository<Decision>(),
        },
        {
          provide: RuleEngineService,
          useValue: {
            evaluateSession: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ReconciliationService>(ReconciliationService);
    sessionRepo = module.get(getRepositoryToken(Session));
    decisionRepo = module.get(getRepositoryToken(Decision));
    ruleEngine = module.get<RuleEngineService>(RuleEngineService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('reconcilePayment', () => {
    it('should re-evaluate overlapping sessions when payment arrives', async () => {
      // Arrange
      const vrm = 'RECONCILE01';
      const siteId = 'TEST01';
      const paymentStart = new Date('2026-01-27T10:00:00Z');
      const paymentExpiry = new Date('2026-01-27T12:00:00Z');

      const session1 = createTestSession({
        vrm,
        siteId,
        startTime: new Date('2026-01-27T09:30:00Z'),
        endTime: new Date('2026-01-27T10:30:00Z'),
        durationMinutes: 60,
        status: SessionStatus.COMPLETED,
      });

      const session2 = createTestSession({
        vrm,
        siteId,
        startTime: new Date('2026-01-27T11:00:00Z'),
        endTime: new Date('2026-01-27T12:30:00Z'),
        durationMinutes: 90,
        status: SessionStatus.COMPLETED,
      });

      const existingDecision = createTestDecision({
        sessionId: session1.id,
        outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE,
        status: 'NEW',
      });

      const newDecision = createTestDecision({
        sessionId: session1.id,
        outcome: DecisionOutcome.COMPLIANT,
        ruleApplied: 'VALID_PAYMENT',
      });

      jest.spyOn(sessionRepo, 'find').mockResolvedValue([session1, session2]);
      jest.spyOn(decisionRepo, 'findOne').mockResolvedValue(existingDecision);
      jest.spyOn(ruleEngine, 'evaluateSession').mockResolvedValue(newDecision);
      jest.spyOn(decisionRepo, 'save').mockResolvedValue({
        ...existingDecision,
        outcome: DecisionOutcome.COMPLIANT,
      } as Decision);

      // Act
      const result = await service.reconcilePayment(
        vrm,
        siteId,
        paymentStart,
        paymentExpiry,
      );

      // Assert
      expect(result.sessionsReevaluated).toBe(2);
      expect(ruleEngine.evaluateSession).toHaveBeenCalledTimes(2);
      expect(ruleEngine.evaluateSession).toHaveBeenCalledWith(session1);
      expect(ruleEngine.evaluateSession).toHaveBeenCalledWith(session2);
    });

    it('should update decision when outcome changes', async () => {
      // Arrange
      const vrm = 'UPDATE01';
      const siteId = 'TEST01';
      const paymentStart = new Date('2026-01-27T10:00:00Z');
      const paymentExpiry = new Date('2026-01-27T12:00:00Z');

      const session = createTestSession({
        vrm,
        siteId,
        startTime: new Date('2026-01-27T10:00:00Z'),
        endTime: new Date('2026-01-27T11:00:00Z'),
        status: SessionStatus.COMPLETED,
      });

      const existingDecision = createTestDecision({
        sessionId: session.id,
        outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE,
        status: 'NEW',
      });

      const newDecision = createTestDecision({
        sessionId: session.id,
        outcome: DecisionOutcome.COMPLIANT,
        ruleApplied: 'VALID_PAYMENT',
      });

      jest.spyOn(sessionRepo, 'find').mockResolvedValue([session]);
      jest.spyOn(decisionRepo, 'findOne').mockResolvedValue(existingDecision);
      jest.spyOn(ruleEngine, 'evaluateSession').mockResolvedValue(newDecision);
      jest.spyOn(decisionRepo, 'save').mockResolvedValue({
        ...existingDecision,
        outcome: DecisionOutcome.COMPLIANT,
      } as Decision);

      // Act
      const result = await service.reconcilePayment(
        vrm,
        siteId,
        paymentStart,
        paymentExpiry,
      );

      // Assert
      expect(result.decisionsUpdated).toBe(1);
      expect(decisionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: DecisionOutcome.COMPLIANT,
          rationale: expect.stringContaining('RECONCILED'),
        }),
      );
    });

    it('should not update decision if already processed', async () => {
      // Arrange
      const vrm = 'PROCESSED01';
      const siteId = 'TEST01';
      const paymentStart = new Date('2026-01-27T10:00:00Z');
      const paymentExpiry = new Date('2026-01-27T12:00:00Z');

      const session = createTestSession({
        vrm,
        siteId,
        startTime: new Date('2026-01-27T10:00:00Z'),
        endTime: new Date('2026-01-27T11:00:00Z'),
        status: SessionStatus.COMPLETED,
      });

      const existingDecision = createTestDecision({
        sessionId: session.id,
        outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE,
        status: 'APPROVED', // Already processed
      });

      const newDecision = createTestDecision({
        sessionId: session.id,
        outcome: DecisionOutcome.COMPLIANT,
      });

      jest.spyOn(sessionRepo, 'find').mockResolvedValue([session]);
      jest.spyOn(decisionRepo, 'findOne').mockResolvedValue(existingDecision);
      jest.spyOn(ruleEngine, 'evaluateSession').mockResolvedValue(newDecision);

      // Act
      const result = await service.reconcilePayment(
        vrm,
        siteId,
        paymentStart,
        paymentExpiry,
      );

      // Assert
      expect(result.decisionsUpdated).toBe(0);
      expect(decisionRepo.save).not.toHaveBeenCalled();
    });

    it('should only re-evaluate completed sessions', async () => {
      // Arrange
      const vrm = 'MIXED01';
      const siteId = 'TEST01';
      const paymentStart = new Date('2026-01-27T10:00:00Z');
      const paymentExpiry = new Date('2026-01-27T12:00:00Z');

      const completedSession = createTestSession({
        vrm,
        siteId,
        startTime: new Date('2026-01-27T10:00:00Z'),
        endTime: new Date('2026-01-27T11:00:00Z'),
        status: SessionStatus.COMPLETED,
      });

      const provisionalSession = createTestSession({
        vrm,
        siteId,
        startTime: new Date('2026-01-27T11:30:00Z'),
        endTime: null, // Not completed
        status: SessionStatus.PROVISIONAL,
      });

      jest
        .spyOn(sessionRepo, 'find')
        .mockResolvedValue([completedSession, provisionalSession]);
      jest.spyOn(decisionRepo, 'findOne').mockResolvedValue(null);
      jest
        .spyOn(ruleEngine, 'evaluateSession')
        .mockResolvedValue(createTestDecision());

      // Act
      const result = await service.reconcilePayment(
        vrm,
        siteId,
        paymentStart,
        paymentExpiry,
      );

      // Assert
      expect(result.sessionsReevaluated).toBe(1); // Only completed session
      expect(ruleEngine.evaluateSession).toHaveBeenCalledTimes(1);
      expect(ruleEngine.evaluateSession).toHaveBeenCalledWith(completedSession);
    });
  });

  describe('reconcilePermit', () => {
    it('should re-evaluate sessions when permit is added', async () => {
      // Arrange
      const vrm = 'PERMIT01';
      const siteId = 'TEST01';

      const session = createTestSession({
        vrm,
        siteId,
        startTime: new Date('2026-01-27T10:00:00Z'),
        endTime: new Date('2026-01-27T11:00:00Z'),
        status: SessionStatus.COMPLETED,
      });

      const existingDecision = createTestDecision({
        sessionId: session.id,
        outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE,
        status: 'NEW',
      });

      const newDecision = createTestDecision({
        sessionId: session.id,
        outcome: DecisionOutcome.COMPLIANT,
        ruleApplied: 'VALID_PERMIT',
      });

      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([session]),
      };

      jest
        .spyOn(sessionRepo, 'createQueryBuilder')
        .mockReturnValue(queryBuilder as any);
      jest.spyOn(decisionRepo, 'findOne').mockResolvedValue(existingDecision);
      jest.spyOn(ruleEngine, 'evaluateSession').mockResolvedValue(newDecision);
      jest.spyOn(decisionRepo, 'save').mockResolvedValue({
        ...existingDecision,
        outcome: DecisionOutcome.COMPLIANT,
      } as Decision);

      // Act
      const result = await service.reconcilePermit(vrm, siteId, true);

      // Assert
      expect(result.sessionsReevaluated).toBe(1);
      expect(result.decisionsUpdated).toBe(1);
      expect(ruleEngine.evaluateSession).toHaveBeenCalledWith(session);
    });

    it('should not re-evaluate when permit is inactive', async () => {
      // Act
      const result = await service.reconcilePermit('VRM01', 'SITE01', false);

      // Assert
      expect(result.sessionsReevaluated).toBe(0);
      expect(result.decisionsUpdated).toBe(0);
    });
  });
});
