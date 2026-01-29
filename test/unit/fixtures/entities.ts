import {
  Site,
  Movement,
  Session,
  Payment,
  Permit,
  Decision,
  PermitType,
  PermitSource,
} from '../../../src/domain/entities';
import { SessionStatus, DecisionOutcome } from '../../../src/domain/entities';

export const createTestSite = (overrides?: Partial<Site>): Site => ({
  id: 'TEST01',
  name: 'Test Site',
  config: {
    operatingModel: 'ANPR',
    gracePeriods: { entry: 10, exit: 10, overstay: 0 },
    cameras: [
      {
        id: 'CAM01',
        direction: 'ENTRY',
        towardsDirection: 'ENTRY',
        awayDirection: 'EXIT',
        name: 'Entry Camera',
      },
    ],
    realTime: false,
  },
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createTestMovement = (
  overrides?: Partial<Movement>,
): Movement => ({
  id: 'movement-uuid',
  siteId: 'TEST01',
  vrm: 'AB12CDE',
  timestamp: new Date(),
  cameraIds: 'CAM01',
  direction: 'ENTRY',
  images: [
    {
      url: 'http://example.com/image.jpg',
      type: 'plate',
    },
  ],
  rawData: {
    cameraType: 'hikvision',
    confidence: 0.95,
  },
  requiresReview: false,
  ingestedAt: new Date(),
  ...overrides,
});

export const createTestSession = (overrides?: Partial<Session>): Session => ({
  id: 'session-uuid',
  siteId: 'TEST01',
  vrm: 'AB12CDE',
  entryMovementId: 'movement-entry-uuid',
  exitMovementId: null,
  startTime: new Date(Date.now() - 3600000), // 1 hour ago
  endTime: null,
  durationMinutes: null,
  status: SessionStatus.PROVISIONAL,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createTestPayment = (overrides?: Partial<Payment>): Payment => ({
  id: 'payment-uuid',
  siteId: 'TEST01',
  vrm: 'AB12CDE',
  amount: 5.0,
  startTime: new Date(Date.now() - 3600000), // 1 hour ago
  expiryTime: new Date(Date.now() + 3600000), // 1 hour from now
  source: 'APP',
  externalReference: 'PAY-12345',
  rawData: {
    transactionId: 'TXN-123',
  },
  providerId: null,
  ingestionLogId: null,
  ingestedAt: new Date(),
  ...overrides,
});

export const createTestPermit = (overrides?: Partial<Permit>): Permit => ({
  id: 'permit-uuid',
  siteId: 'TEST01',
  vrm: 'AB12CDE',
  type: PermitType.WHITELIST,
  startDate: new Date(Date.now() - 86400000), // Yesterday
  endDate: null, // Indefinite
  active: true,
  mondayItemId: null,
  source: PermitSource.MANUAL,
  metadata: null,
  createdAt: new Date(),
  ...overrides,
});

export const createTestDecision = (
  overrides?: Partial<Decision>,
): Decision => ({
  id: 'decision-uuid',
  sessionId: 'session-uuid',
  movementId: null,
  outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE,
  status: 'NEW',
  ruleApplied: 'NO_VALID_PAYMENT',
  rationale: 'No valid permit or payment found for duration',
  isOperatorOverride: false,
  operatorId: null,
  params: new Date(),
  createdAt: new Date(),
  ...overrides,
});
