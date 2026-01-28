import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { SessionService } from './session.service';
import { RuleEngineService } from './rule-engine.service';
import { AuditService } from '../../audit/audit.service';
import { Session, Movement, SessionStatus } from '../../domain/entities';
import { createMockRepository } from '../../../test/unit/mocks/repository.mock';
import {
  createTestMovement,
  createTestSession,
  createTestDecision,
} from '../../../test/unit/fixtures/entities';

describe('SessionService', () => {
  let service: SessionService;
  let sessionRepo: Repository<Session>;
  let movementRepo: Repository<Movement>;
  let ruleEngine: RuleEngineService;
  let auditService: AuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        {
          provide: getRepositoryToken(Session),
          useValue: createMockRepository<Session>(),
        },
        {
          provide: getRepositoryToken(Movement),
          useValue: createMockRepository<Movement>(),
        },
        {
          provide: RuleEngineService,
          useValue: {
            evaluateSession: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: {
            getAuditTrailByEntity: jest.fn().mockResolvedValue([]),
            logSessionCreation: jest.fn().mockResolvedValue({ id: 'audit-1' }),
            logSessionCompletion: jest.fn().mockResolvedValue({ id: 'audit-2' }),
          },
        },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
    sessionRepo = module.get(getRepositoryToken(Session));
    movementRepo = module.get(getRepositoryToken(Movement));
    ruleEngine = module.get<RuleEngineService>(RuleEngineService);
    auditService = module.get<AuditService>(AuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processMovement', () => {
    it('should create new session for ENTRY movement', async () => {
      // Arrange
      const entryMovement = createTestMovement({
        direction: 'ENTRY',
        vrm: 'NEW01',
        siteId: 'TEST01',
        timestamp: new Date('2026-01-27T10:00:00Z'),
      });

      const savedSession = createTestSession({
        vrm: 'NEW01',
        siteId: 'TEST01',
        entryMovementId: entryMovement.id,
        startTime: entryMovement.timestamp,
        status: SessionStatus.PROVISIONAL,
      });

      jest.spyOn(sessionRepo, 'create').mockReturnValue(savedSession as any);
      jest.spyOn(sessionRepo, 'save').mockResolvedValue(savedSession);

      // Act
      await service.processMovement(entryMovement);

      // Assert
      expect(sessionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          siteId: 'TEST01',
          vrm: 'NEW01',
          entryMovementId: entryMovement.id,
          startTime: entryMovement.timestamp,
          status: SessionStatus.PROVISIONAL,
        }),
      );
      expect(sessionRepo.save).toHaveBeenCalled();
    });

    it('should close existing session for EXIT movement', async () => {
      // Arrange
      const entryTime = new Date('2026-01-27T10:00:00Z');
      const exitTime = new Date('2026-01-27T11:00:00Z');

      const openSession = createTestSession({
        vrm: 'CLOSE01',
        siteId: 'TEST01',
        startTime: entryTime,
        endTime: null,
        status: SessionStatus.PROVISIONAL,
      });

      const exitMovement = createTestMovement({
        direction: 'EXIT',
        vrm: 'CLOSE01',
        siteId: 'TEST01',
        timestamp: exitTime,
      });

      const closedSession = {
        ...openSession,
        exitMovementId: exitMovement.id,
        endTime: exitTime,
        durationMinutes: 60,
        status: SessionStatus.COMPLETED,
      };

      jest.spyOn(sessionRepo, 'findOne').mockResolvedValue(openSession);
      jest
        .spyOn(sessionRepo, 'save')
        .mockResolvedValue(closedSession as Session);
      jest
        .spyOn(ruleEngine, 'evaluateSession')
        .mockResolvedValue(createTestDecision());

      // Act
      await service.processMovement(exitMovement);

      // Assert
      expect(sessionRepo.findOne).toHaveBeenCalledWith({
        where: {
          siteId: 'TEST01',
          vrm: 'CLOSE01',
          endTime: IsNull(),
        },
        order: { startTime: 'DESC' },
      });
      expect(sessionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          exitMovementId: exitMovement.id,
          endTime: exitTime,
          durationMinutes: 60,
          status: SessionStatus.COMPLETED,
        }),
      );
      expect(ruleEngine.evaluateSession).toHaveBeenCalledWith(closedSession);
    });

    it('should calculate duration correctly', async () => {
      // Arrange
      const entryTime = new Date('2026-01-27T10:00:00Z');
      const exitTime = new Date('2026-01-27T10:45:00Z'); // 45 minutes

      const openSession = createTestSession({
        vrm: 'DURATION01',
        siteId: 'TEST01',
        startTime: entryTime,
        endTime: null,
      });

      const exitMovement = createTestMovement({
        direction: 'EXIT',
        vrm: 'DURATION01',
        siteId: 'TEST01',
        timestamp: exitTime,
      });

      jest.spyOn(sessionRepo, 'findOne').mockResolvedValue(openSession);
      jest.spyOn(sessionRepo, 'save').mockResolvedValue({
        ...openSession,
        endTime: exitTime,
        durationMinutes: 45,
      } as Session);
      jest
        .spyOn(ruleEngine, 'evaluateSession')
        .mockResolvedValue(createTestDecision());

      // Act
      await service.processMovement(exitMovement);

      // Assert
      expect(sessionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          durationMinutes: 45,
        }),
      );
    });

    it('should handle orphan exit (no matching entry)', async () => {
      // Arrange
      const exitMovement = createTestMovement({
        direction: 'EXIT',
        vrm: 'ORPHAN01',
        siteId: 'TEST01',
        timestamp: new Date('2026-01-27T11:00:00Z'),
      });

      jest.spyOn(sessionRepo, 'findOne').mockResolvedValue(null);

      // Act
      await service.processMovement(exitMovement);

      // Assert
      expect(sessionRepo.save).not.toHaveBeenCalled();
      expect(ruleEngine.evaluateSession).not.toHaveBeenCalled();
    });

    it('should ignore movements with unknown direction', async () => {
      // Arrange
      const movement = createTestMovement({
        direction: 'UNKNOWN',
        vrm: 'UNKNOWN01',
        siteId: 'TEST01',
      });

      // Act
      await service.processMovement(movement);

      // Assert
      expect(sessionRepo.create).not.toHaveBeenCalled();
      expect(sessionRepo.save).not.toHaveBeenCalled();
    });
  });
});
