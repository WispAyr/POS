import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RuleEngineService } from './rule-engine.service';
import { AuditService } from '../../audit/audit.service';
import {
  Decision,
  DecisionOutcome,
  Payment,
  Permit,
  Site,
  Session,
} from '../../domain/entities';
import { SessionStatus } from '../../domain/entities';
import { createMockRepository } from '../../../test/unit/mocks/repository.mock';
import {
  createTestSession,
  createTestPermit,
  createTestPayment,
  createTestSite,
} from '../../../test/unit/fixtures/entities';

describe('RuleEngineService', () => {
  let service: RuleEngineService;
  let decisionRepo: Repository<Decision>;
  let paymentRepo: Repository<Payment>;
  let permitRepo: Repository<Permit>;
  let siteRepo: Repository<Site>;
  let auditService: AuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RuleEngineService,
        {
          provide: getRepositoryToken(Decision),
          useValue: createMockRepository<Decision>(),
        },
        {
          provide: getRepositoryToken(Payment),
          useValue: createMockRepository<Payment>(),
        },
        {
          provide: getRepositoryToken(Permit),
          useValue: createMockRepository<Permit>(),
        },
        {
          provide: getRepositoryToken(Site),
          useValue: createMockRepository<Site>(),
        },
        {
          provide: AuditService,
          useValue: {
            getAuditTrailByEntity: jest.fn().mockResolvedValue([]),
            logDecisionCreation: jest.fn().mockResolvedValue({ id: 'audit-1' }),
          },
        },
      ],
    }).compile();

    service = module.get<RuleEngineService>(RuleEngineService);
    decisionRepo = module.get(getRepositoryToken(Decision));
    paymentRepo = module.get(getRepositoryToken(Payment));
    permitRepo = module.get(getRepositoryToken(Permit));
    siteRepo = module.get(getRepositoryToken(Site));
    auditService = module.get<AuditService>(AuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('evaluateSession', () => {
    it('should return COMPLIANT when valid site-specific permit exists', async () => {
      // Arrange
      const session = createTestSession({
        vrm: 'AB12CDE',
        siteId: 'TEST01',
        startTime: new Date('2026-01-27T10:00:00Z'),
        endTime: new Date('2026-01-27T11:00:00Z'),
        durationMinutes: 60,
        status: SessionStatus.COMPLETED,
      });
      const permit = createTestPermit({
        vrm: 'AB12CDE',
        siteId: 'TEST01',
        active: true,
      });

      jest.spyOn(permitRepo, 'findOne').mockResolvedValue(permit);
      jest.spyOn(decisionRepo, 'create').mockReturnValue({
        id: 'decision-id',
        sessionId: session.id,
        outcome: DecisionOutcome.COMPLIANT,
        ruleApplied: 'VALID_PERMIT',
        rationale: 'Permit found: WHITELIST',
        status: 'NEW',
        isOperatorOverride: false,
        operatorId: null,
        params: null,
        createdAt: new Date(),
      } as Decision);
      jest.spyOn(decisionRepo, 'save').mockResolvedValue({
        id: 'decision-id',
        sessionId: session.id,
        outcome: DecisionOutcome.COMPLIANT,
        ruleApplied: 'VALID_PERMIT',
        rationale: 'Permit found: WHITELIST',
        status: 'NEW',
        isOperatorOverride: false,
        operatorId: null,
        params: null,
        createdAt: new Date(),
      } as Decision);

      // Act
      const decision = await service.evaluateSession(session);

      // Assert
      expect(decision.outcome).toBe(DecisionOutcome.COMPLIANT);
      expect(decision.ruleApplied).toBe('VALID_PERMIT');
      expect(permitRepo.findOne).toHaveBeenCalledWith({
        where: expect.arrayContaining([
          { vrm: 'AB12CDE', siteId: 'TEST01', active: true },
          { vrm: 'AB12CDE', siteId: null, active: true },
        ]),
      });
    });

    it('should return COMPLIANT when valid global permit exists', async () => {
      // Arrange
      const session = createTestSession({
        vrm: 'GLOBAL01',
        siteId: 'TEST01',
        startTime: new Date('2026-01-27T10:00:00Z'),
        endTime: new Date('2026-01-27T11:00:00Z'),
        durationMinutes: 60,
        status: SessionStatus.COMPLETED,
      });
      const permit = createTestPermit({
        vrm: 'GLOBAL01',
        siteId: null, // Global permit
        active: true,
      });

      jest.spyOn(permitRepo, 'findOne').mockResolvedValue(permit);
      jest.spyOn(decisionRepo, 'create').mockReturnValue({
        id: 'decision-id',
        outcome: DecisionOutcome.COMPLIANT,
        ruleApplied: 'VALID_PERMIT',
        rationale: 'Permit found: WHITELIST',
        status: 'NEW',
        isOperatorOverride: false,
        operatorId: null,
        params: null,
        createdAt: new Date(),
      } as Decision);
      jest.spyOn(decisionRepo, 'save').mockResolvedValue({
        id: 'decision-id',
        outcome: DecisionOutcome.COMPLIANT,
        ruleApplied: 'VALID_PERMIT',
        rationale: 'Permit found: WHITELIST',
        status: 'NEW',
        isOperatorOverride: false,
        operatorId: null,
        params: null,
        createdAt: new Date(),
      } as Decision);

      // Act
      const decision = await service.evaluateSession(session);

      // Assert
      expect(decision.outcome).toBe(DecisionOutcome.COMPLIANT);
      expect(decision.ruleApplied).toBe('VALID_PERMIT');
    });

    it('should return COMPLIANT when valid payment covers session with grace periods', async () => {
      // Arrange
      const entryTime = new Date('2026-01-27T10:00:00Z');
      const exitTime = new Date('2026-01-27T11:00:00Z'); // 1 hour session
      const session = createTestSession({
        vrm: 'PAID01',
        siteId: 'TEST01',
        startTime: entryTime,
        endTime: exitTime,
        durationMinutes: 60,
        status: SessionStatus.COMPLETED,
      });
      const site = createTestSite({
        id: 'TEST01',
        config: { gracePeriods: { entry: 10, exit: 10 } },
      });
      const payment = createTestPayment({
        vrm: 'PAID01',
        siteId: 'TEST01',
        startTime: new Date('2026-01-27T09:50:00Z'), // 10 min before entry (covers grace)
        expiryTime: new Date('2026-01-27T11:10:00Z'), // 10 min after exit (covers grace)
      });

      jest.spyOn(permitRepo, 'findOne').mockResolvedValue(null);
      jest.spyOn(siteRepo, 'findOne').mockResolvedValue(site);
      jest.spyOn(paymentRepo, 'find').mockResolvedValue([payment]);
      jest.spyOn(decisionRepo, 'create').mockReturnValue({
        id: 'decision-id',
        outcome: DecisionOutcome.COMPLIANT,
        ruleApplied: 'VALID_PAYMENT',
        rationale: expect.stringContaining('Payment'),
        status: 'NEW',
        isOperatorOverride: false,
        operatorId: null,
        params: null,
        createdAt: new Date(),
      } as Decision);
      jest.spyOn(decisionRepo, 'save').mockResolvedValue({
        id: 'decision-id',
        outcome: DecisionOutcome.COMPLIANT,
        ruleApplied: 'VALID_PAYMENT',
        rationale: expect.stringContaining('Payment'),
        status: 'NEW',
        isOperatorOverride: false,
        operatorId: null,
        params: null,
        createdAt: new Date(),
      } as Decision);

      // Act
      const decision = await service.evaluateSession(session);

      // Assert
      expect(decision.outcome).toBe(DecisionOutcome.COMPLIANT);
      expect(decision.ruleApplied).toBe('VALID_PAYMENT');
      expect(paymentRepo.find).toHaveBeenCalledWith({
        where: { vrm: 'PAID01', siteId: 'TEST01' },
      });
    });

    it('should return COMPLIANT when session is within grace period', async () => {
      // Arrange
      const entryTime = new Date('2026-01-27T10:00:00Z');
      const exitTime = new Date('2026-01-27T10:15:00Z'); // 15 minutes
      const session = createTestSession({
        vrm: 'GRACE01',
        siteId: 'TEST01',
        startTime: entryTime,
        endTime: exitTime,
        durationMinutes: 15, // Within grace (10 + 10 = 20 minutes)
        status: SessionStatus.COMPLETED,
      });
      const site = createTestSite({
        id: 'TEST01',
        config: { gracePeriods: { entry: 10, exit: 10 } },
      });

      jest.spyOn(permitRepo, 'findOne').mockResolvedValue(null);
      jest.spyOn(siteRepo, 'findOne').mockResolvedValue(site);
      jest.spyOn(paymentRepo, 'find').mockResolvedValue([]);
      jest.spyOn(decisionRepo, 'create').mockReturnValue({
        id: 'decision-id',
        outcome: DecisionOutcome.COMPLIANT,
        ruleApplied: 'WITHIN_GRACE',
        rationale: 'Duration 15 within grace',
        status: 'NEW',
        isOperatorOverride: false,
        operatorId: null,
        params: null,
        createdAt: new Date(),
      } as Decision);
      jest.spyOn(decisionRepo, 'save').mockResolvedValue({
        id: 'decision-id',
        outcome: DecisionOutcome.COMPLIANT,
        ruleApplied: 'WITHIN_GRACE',
        rationale: 'Duration 15 within grace',
        status: 'NEW',
        isOperatorOverride: false,
        operatorId: null,
        params: null,
        createdAt: new Date(),
      } as Decision);

      // Act
      const decision = await service.evaluateSession(session);

      // Assert
      expect(decision.outcome).toBe(DecisionOutcome.COMPLIANT);
      expect(decision.ruleApplied).toBe('WITHIN_GRACE');
    });

    it('should return ENFORCEMENT_CANDIDATE when no valid payment or permit and exceeds grace', async () => {
      // Arrange
      const entryTime = new Date('2026-01-27T10:00:00Z');
      const exitTime = new Date('2026-01-27T12:00:00Z'); // 2 hours
      const session = createTestSession({
        vrm: 'ENFORCE01',
        siteId: 'TEST01',
        startTime: entryTime,
        endTime: exitTime,
        durationMinutes: 120, // Exceeds grace period
        status: SessionStatus.COMPLETED,
      });
      const site = createTestSite({
        id: 'TEST01',
        config: { gracePeriods: { entry: 10, exit: 10 } },
      });

      jest.spyOn(permitRepo, 'findOne').mockResolvedValue(null);
      jest.spyOn(siteRepo, 'findOne').mockResolvedValue(site);
      jest.spyOn(paymentRepo, 'find').mockResolvedValue([]);
      jest.spyOn(decisionRepo, 'create').mockReturnValue({
        id: 'decision-id',
        outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE,
        ruleApplied: 'NO_VALID_PAYMENT',
        rationale: 'No valid permit or payment found for duration',
        status: 'NEW',
        isOperatorOverride: false,
        operatorId: null,
        params: null,
        createdAt: new Date(),
      } as Decision);
      jest.spyOn(decisionRepo, 'save').mockResolvedValue({
        id: 'decision-id',
        outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE,
        ruleApplied: 'NO_VALID_PAYMENT',
        rationale: 'No valid permit or payment found for duration',
        status: 'NEW',
        isOperatorOverride: false,
        operatorId: null,
        params: null,
        createdAt: new Date(),
      } as Decision);

      // Act
      const decision = await service.evaluateSession(session);

      // Assert
      expect(decision.outcome).toBe(DecisionOutcome.ENFORCEMENT_CANDIDATE);
      expect(decision.ruleApplied).toBe('NO_VALID_PAYMENT');
    });

    it('should return ENFORCEMENT_CANDIDATE when payment does not cover mandatory period', async () => {
      // Arrange
      const entryTime = new Date('2026-01-27T10:00:00Z');
      const exitTime = new Date('2026-01-27T12:00:00Z'); // 2 hour session
      const session = createTestSession({
        vrm: 'INVALID01',
        siteId: 'TEST01',
        startTime: entryTime,
        endTime: exitTime,
        durationMinutes: 120,
      });
      const site = createTestSite({
        id: 'TEST01',
        config: { gracePeriods: { entry: 10, exit: 10 } },
      });
      // Payment that starts too late (after mandatory period starts)
      const payment = createTestPayment({
        vrm: 'INVALID01',
        siteId: 'TEST01',
        startTime: new Date('2026-01-27T10:20:00Z'), // After entry grace (mandatory starts at 10:10)
        expiryTime: new Date('2026-01-27T12:00:00Z'),
      });

      jest.spyOn(permitRepo, 'findOne').mockResolvedValue(null);
      jest.spyOn(siteRepo, 'findOne').mockResolvedValue(site);
      jest.spyOn(paymentRepo, 'find').mockResolvedValue([payment]);
      jest.spyOn(decisionRepo, 'create').mockReturnValue({
        id: 'decision-id',
        outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE,
        ruleApplied: 'NO_VALID_PAYMENT',
        rationale: 'No valid permit or payment found for duration',
        status: 'NEW',
        isOperatorOverride: false,
        operatorId: null,
        params: null,
        createdAt: new Date(),
      } as Decision);
      jest.spyOn(decisionRepo, 'save').mockResolvedValue({
        id: 'decision-id',
        outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE,
        ruleApplied: 'NO_VALID_PAYMENT',
        rationale: 'No valid permit or payment found for duration',
        status: 'NEW',
        isOperatorOverride: false,
        operatorId: null,
        params: null,
        createdAt: new Date(),
      } as Decision);

      // Act
      const decision = await service.evaluateSession(session);

      // Assert
      expect(decision.outcome).toBe(DecisionOutcome.ENFORCEMENT_CANDIDATE);
    });

    it('should use default grace periods when site config is missing', async () => {
      // Arrange
      const entryTime = new Date('2026-01-27T10:00:00Z');
      const exitTime = new Date('2026-01-27T10:15:00Z'); // 15 minutes
      const session = createTestSession({
        vrm: 'DEFAULT01',
        siteId: 'TEST01',
        startTime: entryTime,
        endTime: exitTime,
        durationMinutes: 15,
        status: SessionStatus.COMPLETED,
      });
      const site = createTestSite({
        id: 'TEST01',
        config: {}, // No grace periods configured
      });

      jest.spyOn(permitRepo, 'findOne').mockResolvedValue(null);
      jest.spyOn(siteRepo, 'findOne').mockResolvedValue(site);
      jest.spyOn(paymentRepo, 'find').mockResolvedValue([]);
      jest.spyOn(decisionRepo, 'create').mockReturnValue({
        id: 'decision-id',
        outcome: DecisionOutcome.COMPLIANT,
        ruleApplied: 'WITHIN_GRACE',
        rationale: 'Duration 15 within grace',
        status: 'NEW',
        isOperatorOverride: false,
        operatorId: null,
        params: null,
        createdAt: new Date(),
      } as Decision);
      jest.spyOn(decisionRepo, 'save').mockResolvedValue({
        id: 'decision-id',
        outcome: DecisionOutcome.COMPLIANT,
        ruleApplied: 'WITHIN_GRACE',
        rationale: 'Duration 15 within grace',
        status: 'NEW',
        isOperatorOverride: false,
        operatorId: null,
        params: null,
        createdAt: new Date(),
      } as Decision);

      // Act
      const decision = await service.evaluateSession(session);

      // Assert
      expect(decision.outcome).toBe(DecisionOutcome.COMPLIANT);
      expect(decision.ruleApplied).toBe('WITHIN_GRACE');
    });

    it('should prioritize permit check over payment check', async () => {
      // Arrange
      const session = createTestSession({
        vrm: 'PRIORITY01',
        siteId: 'TEST01',
        startTime: new Date('2026-01-27T10:00:00Z'),
        endTime: new Date('2026-01-27T11:00:00Z'),
        durationMinutes: 60,
        status: SessionStatus.COMPLETED,
      });
      const permit = createTestPermit({
        vrm: 'PRIORITY01',
        siteId: 'TEST01',
        active: true,
      });
      const payment = createTestPayment({
        vrm: 'PRIORITY01',
        siteId: 'TEST01',
      });

      jest.spyOn(permitRepo, 'findOne').mockResolvedValue(permit);
      jest.spyOn(decisionRepo, 'create').mockReturnValue({
        id: 'decision-id',
        outcome: DecisionOutcome.COMPLIANT,
        ruleApplied: 'VALID_PERMIT',
        rationale: 'Permit found: WHITELIST',
        status: 'NEW',
        isOperatorOverride: false,
        operatorId: null,
        params: null,
        createdAt: new Date(),
      } as Decision);
      jest.spyOn(decisionRepo, 'save').mockResolvedValue({
        id: 'decision-id',
        outcome: DecisionOutcome.COMPLIANT,
        ruleApplied: 'VALID_PERMIT',
        rationale: 'Permit found: WHITELIST',
        status: 'NEW',
        isOperatorOverride: false,
        operatorId: null,
        params: null,
        createdAt: new Date(),
      } as Decision);

      // Act
      const decision = await service.evaluateSession(session);

      // Assert
      expect(decision.outcome).toBe(DecisionOutcome.COMPLIANT);
      expect(decision.ruleApplied).toBe('VALID_PERMIT');
      // Payment should not be checked if permit exists
      expect(paymentRepo.find).not.toHaveBeenCalled();
    });
  });
});
