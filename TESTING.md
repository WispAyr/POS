# Testing Guide - Parking Operations System

## Overview

This document outlines a comprehensive testing strategy for the Parking Operations System, ensuring reliability, maintainability, and confidence in deployments. All tests should be automated and run as part of CI/CD pipelines.

## Testing Philosophy

### Testing Pyramid

```
        /\
       /  \      E2E Tests (10%)
      /____\     - Critical user flows
     /      \    - Full system integration
    /________\   Integration Tests (30%)
   /          \  - API endpoints
  /____________\ - Service interactions
 /              \
/________________\ Unit Tests (60%)
                  - Services
                  - Utilities
                  - Business logic
```

### Principles

1. **Test Early, Test Often** - Write tests alongside code
2. **Test Behavior, Not Implementation** - Focus on what, not how
3. **Isolation** - Tests should be independent and repeatable
4. **Fast Feedback** - Unit tests should run in seconds
5. **Coverage Goals** - Aim for 80%+ coverage on critical paths
6. **Maintainability** - Tests should be easy to read and update

---

## Test Types

### 1. Unit Tests

**Purpose:** Test individual functions, methods, and classes in isolation.

**Location:** `src/**/*.spec.ts` (alongside source files)

**Scope:**
- Service methods
- Utility functions
- Business logic
- Entity validation
- DTOs

**Tools:**
- Jest
- `@nestjs/testing`
- TypeORM test utilities

**Example Structure:**
```typescript
describe('RuleEngineService', () => {
  let service: RuleEngineService;
  let decisionRepo: Repository<Decision>;
  let paymentRepo: Repository<Payment>;
  // ... other repos

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RuleEngineService,
        {
          provide: getRepositoryToken(Decision),
          useValue: createMockRepository(),
        },
        // ... other mocks
      ],
    }).compile();

    service = module.get<RuleEngineService>(RuleEngineService);
    decisionRepo = module.get(getRepositoryToken(Decision));
  });

  describe('evaluateSession', () => {
    it('should return COMPLIANT when valid permit exists', async () => {
      // Arrange
      const session = createTestSession();
      const permit = createTestPermit({ vrm: session.vrm });
      
      jest.spyOn(permitRepo, 'findOne').mockResolvedValue(permit);

      // Act
      const decision = await service.evaluateSession(session);

      // Assert
      expect(decision.outcome).toBe(DecisionOutcome.COMPLIANT);
      expect(decision.ruleApplied).toBe('VALID_PERMIT');
    });
  });
});
```

### 2. Integration Tests

**Purpose:** Test interactions between components (services, repositories, controllers).

**Location:** `test/integration/**/*.spec.ts`

**Scope:**
- API endpoints
- Service-to-service interactions
- Database operations
- External integrations (mocked)

**Tools:**
- Jest
- Supertest
- Test database (PostgreSQL)
- `@nestjs/testing`

**Example Structure:**
```typescript
describe('IngestionController (Integration)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        AppModule,
        TypeOrmModule.forRoot({
          type: 'postgres',
          // Test database config
        }),
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
    dataSource = module.get(DataSource);
  });

  beforeEach(async () => {
    // Clean database
    await dataSource.synchronize(true);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /ingestion/anpr', () => {
    it('should create movement and session', async () => {
      // Test implementation
    });
  });
});
```

### 3. End-to-End (E2E) Tests

**Purpose:** Test complete user flows from API to database.

**Location:** `test/e2e/**/*.e2e-spec.ts`

**Scope:**
- Critical business flows
- Complete workflows
- Cross-module interactions

**Tools:**
- Jest
- Supertest
- Test database

**Example Structure:**
```typescript
describe('Parking Session Flow (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  it('should process complete parking session flow', async () => {
    // 1. Create site
    // 2. Ingest entry movement
    // 3. Verify session created
    // 4. Ingest payment
    // 5. Ingest exit movement
    // 6. Verify decision created
    // 7. Verify enforcement queue
  });
});
```

### 4. Frontend Tests

**Purpose:** Test React components and user interactions.

**Location:** `frontend/src/**/*.test.tsx` or `frontend/src/**/*.spec.tsx`

**Scope:**
- Component rendering
- User interactions
- API integration (mocked)
- State management

**Tools:**
- Vitest (or Jest)
- React Testing Library
- MSW (Mock Service Worker) for API mocking

**Example Structure:**
```typescript
import { render, screen, waitFor } from '@testing-library/react';
import { DashboardStats } from './DashboardStats';

describe('DashboardStats', () => {
  beforeEach(() => {
    // Setup MSW handlers
  });

  it('should display statistics', async () => {
    render(<DashboardStats />);
    
    await waitFor(() => {
      expect(screen.getByText(/sessions/i)).toBeInTheDocument();
    });
  });
});
```

---

## Test Organization

### Directory Structure

```
POS/
├── src/
│   ├── engine/
│   │   └── services/
│   │       ├── rule-engine.service.ts
│   │       └── rule-engine.service.spec.ts    # Unit tests
│   └── ...
├── test/
│   ├── unit/                                  # Unit test utilities
│   │   ├── fixtures/
│   │   ├── mocks/
│   │   └── helpers/
│   ├── integration/                           # Integration tests
│   │   ├── ingestion.integration.spec.ts
│   │   └── enforcement.integration.spec.ts
│   ├── e2e/                                   # E2E tests
│   │   ├── session-flow.e2e-spec.ts
│   │   └── enforcement-flow.e2e-spec.ts
│   └── setup/                                 # Test setup
│       ├── test-db.config.ts
│       └── test-helpers.ts
└── frontend/
    └── src/
        └── components/
            ├── DashboardStats.tsx
            └── DashboardStats.test.tsx
```

---

## Test Data Generation

### Test Data Generator

The system includes a comprehensive test data generator for creating parking events, payments, permits, and enforcement scenarios. All generated data is automatically flagged as test data for easy cleanup.

**Location:** `test/unit/generators/`

**Key Classes:**
- `TestDataGenerator` - Creates test parking events and data
- `TestDataCleanup` - Removes test data from database
- `TestScenarios` - Pre-defined test scenarios

**Usage Example:**

```typescript
import { TestDataGenerator, TestDataCleanup, TestScenarios } from '../unit/generators';

// In test setup
const generator = new TestDataGenerator(dataSource);
const cleanup = new TestDataCleanup(dataSource);
const scenarios = new TestScenarios(generator, dataSource);

// Generate test site
const testSite = await generator.createTestSite();

// Generate compliant scenario with payment
const scenario = await scenarios.compliantWithPayment(testSite.id);

// Cleanup after tests
await cleanup.cleanupAllTestData();
```

**Available Scenarios:**
- `compliantWithPayment()` - Valid payment scenario
- `compliantWithPermit()` - Valid permit scenario
- `enforcementCandidate()` - No payment/permit, exceeds grace
- `withinGracePeriod()` - Short stay within grace
- `paymentExpired()` - Payment expired before exit
- `globalPermit()` - Global permit (all sites)
- `multipleSessionsSameVehicle()` - Multiple sessions same day
- `generateFullTestSuite()` - All scenarios at once

**Test Data Flagging:**
- All VRMs prefixed with `TEST_`
- `rawData` contains `isTest: true` and `testRunId`
- `params` (for decisions) contains test metadata
- Easy identification and cleanup

See `test/examples/parking-events-test.example.ts` for complete examples.

## Test Utilities and Helpers

### Test Database Configuration

Create `test/setup/test-db.config.ts`:

```typescript
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const getTestDbConfig = (): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: process.env.TEST_DB_HOST || 'localhost',
  port: parseInt(process.env.TEST_DB_PORT || '5432'),
  username: process.env.TEST_DB_USERNAME || 'pos_test_user',
  password: process.env.TEST_DB_PASSWORD || 'pos_test_pass',
  database: process.env.TEST_DB_DATABASE || 'pos_test_db',
  autoLoadEntities: true,
  synchronize: true, // Only for tests
  dropSchema: true,  // Clean between tests
  logging: false,
});
```

### Test Fixtures

Create `test/unit/fixtures/entities.ts`:

```typescript
import { Site, Movement, Session, Payment, Permit, Decision } from '../../src/domain/entities';
import { SessionStatus, DecisionOutcome } from '../../src/domain/entities';

export const createTestSite = (overrides?: Partial<Site>): Site => ({
  id: 'TEST01',
  name: 'Test Site',
  config: {
    gracePeriods: { entry: 10, exit: 10 },
    cameras: [],
  },
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createTestMovement = (overrides?: Partial<Movement>): Movement => ({
  id: 'movement-uuid',
  siteId: 'TEST01',
  vrm: 'AB12CDE',
  timestamp: new Date(),
  cameraIds: 'CAM01',
  direction: 'ENTRY',
  images: [],
  rawData: {},
  ingestedAt: new Date(),
  ...overrides,
});

export const createTestSession = (overrides?: Partial<Session>): Session => ({
  id: 'session-uuid',
  siteId: 'TEST01',
  vrm: 'AB12CDE',
  entryMovementId: 'movement-uuid',
  exitMovementId: null,
  startTime: new Date(),
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
  startTime: new Date(),
  expiryTime: new Date(Date.now() + 3600000), // 1 hour
  source: 'APP',
  externalReference: null,
  rawData: {},
  ingestedAt: new Date(),
  ...overrides,
});

export const createTestPermit = (overrides?: Partial<Permit>): Permit => ({
  id: 'permit-uuid',
  siteId: 'TEST01',
  vrm: 'AB12CDE',
  type: 'WHITELIST',
  startDate: new Date(),
  endDate: null,
  active: true,
  createdAt: new Date(),
  ...overrides,
});

export const createTestDecision = (overrides?: Partial<Decision>): Decision => ({
  id: 'decision-uuid',
  sessionId: 'session-uuid',
  movementId: null,
  outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE,
  status: 'NEW',
  ruleApplied: 'NO_VALID_PAYMENT',
  rationale: 'Test rationale',
  isOperatorOverride: false,
  operatorId: null,
  params: new Date(),
  createdAt: new Date(),
  ...overrides,
});
```

### Mock Repositories

Create `test/unit/mocks/repository.mock.ts`:

```typescript
import { Repository } from 'typeorm';

export const createMockRepository = <T>(): Partial<Repository<T>> => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  count: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
    getManyAndCount: jest.fn(),
    getOne: jest.fn(),
  })),
});
```

### Test Helpers

Create `test/unit/helpers/test-helpers.ts`:

```typescript
import { TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

export const createTestApp = async (module: TestingModule): Promise<INestApplication> => {
  const app = module.createNestApplication();
  app.enableCors();
  await app.init();
  return app;
};

export const closeTestApp = async (app: INestApplication): Promise<void> => {
  await app.close();
};

export const makeRequest = (app: INestApplication) => request(app.getHttpServer());

export const wait = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));
```

---

## Example Test Implementations

### Unit Test: RuleEngineService

Create `src/engine/services/rule-engine.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RuleEngineService } from './rule-engine.service';
import { Decision, DecisionOutcome, Payment, Permit, Site, Session } from '../../domain/entities';
import { createMockRepository } from '../../../test/unit/mocks/repository.mock';
import { createTestSession, createTestPermit, createTestPayment, createTestSite } from '../../../test/unit/fixtures/entities';

describe('RuleEngineService', () => {
  let service: RuleEngineService;
  let decisionRepo: Repository<Decision>;
  let paymentRepo: Repository<Payment>;
  let permitRepo: Repository<Permit>;
  let siteRepo: Repository<Site>;

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
      ],
    }).compile();

    service = module.get<RuleEngineService>(RuleEngineService);
    decisionRepo = module.get(getRepositoryToken(Decision));
    paymentRepo = module.get(getRepositoryToken(Payment));
    permitRepo = module.get(getRepositoryToken(Permit));
    siteRepo = module.get(getRepositoryToken(Site));
  });

  describe('evaluateSession', () => {
    it('should return COMPLIANT when valid permit exists', async () => {
      // Arrange
      const session = createTestSession({ vrm: 'AB12CDE' });
      const permit = createTestPermit({ vrm: 'AB12CDE', siteId: session.siteId, active: true });
      
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
        params: new Date(),
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
        params: new Date(),
        createdAt: new Date(),
      } as Decision);

      // Act
      const decision = await service.evaluateSession(session);

      // Assert
      expect(decision.outcome).toBe(DecisionOutcome.COMPLIANT);
      expect(decision.ruleApplied).toBe('VALID_PERMIT');
      expect(permitRepo.findOne).toHaveBeenCalledWith({
        where: expect.arrayContaining([
          { vrm: 'AB12CDE', siteId: session.siteId, active: true },
          { vrm: 'AB12CDE', siteId: null, active: true },
        ]),
      });
    });

    it('should return COMPLIANT when valid payment exists', async () => {
      // Arrange
      const session = createTestSession({ 
        vrm: 'AB12CDE',
        startTime: new Date('2026-01-27T10:00:00Z'),
        endTime: new Date('2026-01-27T11:00:00Z'),
        durationMinutes: 60,
      });
      const payment = createTestPayment({
        vrm: 'AB12CDE',
        siteId: session.siteId,
        startTime: new Date('2026-01-27T09:00:00Z'),
        expiryTime: new Date('2026-01-27T12:00:00Z'),
      });

      jest.spyOn(permitRepo, 'findOne').mockResolvedValue(null);
      jest.spyOn(paymentRepo, 'findOne').mockResolvedValue(payment);
      jest.spyOn(decisionRepo, 'create').mockReturnValue({
        id: 'decision-id',
        outcome: DecisionOutcome.COMPLIANT,
        ruleApplied: 'VALID_PAYMENT',
        rationale: 'Payment found: payment-uuid',
        status: 'NEW',
        isOperatorOverride: false,
        operatorId: null,
        params: new Date(),
        createdAt: new Date(),
      } as Decision);
      jest.spyOn(decisionRepo, 'save').mockResolvedValue({
        id: 'decision-id',
        outcome: DecisionOutcome.COMPLIANT,
        ruleApplied: 'VALID_PAYMENT',
        rationale: 'Payment found: payment-uuid',
        status: 'NEW',
        isOperatorOverride: false,
        operatorId: null,
        params: new Date(),
        createdAt: new Date(),
      } as Decision);

      // Act
      const decision = await service.evaluateSession(session);

      // Assert
      expect(decision.outcome).toBe(DecisionOutcome.COMPLIANT);
      expect(decision.ruleApplied).toBe('VALID_PAYMENT');
    });

    it('should return COMPLIANT when within grace period', async () => {
      // Arrange
      const session = createTestSession({
        vrm: 'AB12CDE',
        durationMinutes: 15, // Within grace (10 + 10 = 20 minutes)
      });
      const site = createTestSite({
        id: session.siteId,
        config: { gracePeriods: { entry: 10, exit: 10 } },
      });

      jest.spyOn(permitRepo, 'findOne').mockResolvedValue(null);
      jest.spyOn(paymentRepo, 'findOne').mockResolvedValue(null);
      jest.spyOn(siteRepo, 'findOne').mockResolvedValue(site);
      jest.spyOn(decisionRepo, 'create').mockReturnValue({
        id: 'decision-id',
        outcome: DecisionOutcome.COMPLIANT,
        ruleApplied: 'WITHIN_GRACE',
        rationale: 'Duration 15 within grace',
        status: 'NEW',
        isOperatorOverride: false,
        operatorId: null,
        params: new Date(),
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
        params: new Date(),
        createdAt: new Date(),
      } as Decision);

      // Act
      const decision = await service.evaluateSession(session);

      // Assert
      expect(decision.outcome).toBe(DecisionOutcome.COMPLIANT);
      expect(decision.ruleApplied).toBe('WITHIN_GRACE');
    });

    it('should return ENFORCEMENT_CANDIDATE when no valid payment or permit', async () => {
      // Arrange
      const session = createTestSession({
        vrm: 'AB12CDE',
        durationMinutes: 120, // Exceeds grace period
      });
      const site = createTestSite({
        id: session.siteId,
        config: { gracePeriods: { entry: 10, exit: 10 } },
      });

      jest.spyOn(permitRepo, 'findOne').mockResolvedValue(null);
      jest.spyOn(paymentRepo, 'findOne').mockResolvedValue(null);
      jest.spyOn(siteRepo, 'findOne').mockResolvedValue(site);
      jest.spyOn(decisionRepo, 'create').mockReturnValue({
        id: 'decision-id',
        outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE,
        ruleApplied: 'NO_VALID_PAYMENT',
        rationale: 'No valid permit or payment found for duration',
        status: 'NEW',
        isOperatorOverride: false,
        operatorId: null,
        params: new Date(),
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
        params: new Date(),
        createdAt: new Date(),
      } as Decision);

      // Act
      const decision = await service.evaluateSession(session);

      // Assert
      expect(decision.outcome).toBe(DecisionOutcome.ENFORCEMENT_CANDIDATE);
      expect(decision.ruleApplied).toBe('NO_VALID_PAYMENT');
    });
  });
});
```

### Integration Test: ANPR Ingestion

Create `test/integration/anpr-ingestion.integration.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { getTestDbConfig } from '../setup/test-db.config';
import { Movement, Session, Site } from '../../src/domain/entities';
import { createTestSite } from '../unit/fixtures/entities';

describe('ANPR Ingestion (Integration)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        AppModule,
        TypeOrmModule.forRoot(getTestDbConfig()),
      ],
    }).compile();

    app = module.createNestApplication();
    app.enableCors();
    await app.init();
    dataSource = module.get(DataSource);
  });

  beforeEach(async () => {
    // Clean and setup test data
    await dataSource.synchronize(true);
    
    // Create test site
    const siteRepo = dataSource.getRepository(Site);
    await siteRepo.save(createTestSite());
  });

  afterAll(async () => {
    await app.close();
    await dataSource.destroy();
  });

  describe('POST /ingestion/anpr', () => {
    it('should create movement and session for entry', async () => {
      const payload = {
        siteId: 'TEST01',
        vrm: 'AB12CDE',
        timestamp: new Date().toISOString(),
        cameraId: 'CAM01',
        direction: 'TOWARDS',
        images: [
          { url: 'http://example.com/image.jpg', type: 'plate' },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/ingestion/anpr')
        .send(payload)
        .expect(201);

      expect(response.body.movement).toBeDefined();
      expect(response.body.movement.vrm).toBe('AB12CDE');
      expect(response.body.isNew).toBe(true);

      // Verify session was created
      const sessionRepo = dataSource.getRepository(Session);
      const sessions = await sessionRepo.find({ where: { vrm: 'AB12CDE' } });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].entryMovementId).toBe(response.body.movement.id);
    });

    it('should close session on exit movement', async () => {
      // Create entry movement first
      const entryPayload = {
        siteId: 'TEST01',
        vrm: 'AB12CDE',
        timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        cameraId: 'CAM01',
        direction: 'TOWARDS',
      };

      await request(app.getHttpServer())
        .post('/ingestion/anpr')
        .send(entryPayload);

      // Wait a bit for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Create exit movement
      const exitPayload = {
        siteId: 'TEST01',
        vrm: 'AB12CDE',
        timestamp: new Date().toISOString(),
        cameraId: 'CAM02',
        direction: 'AWAY',
      };

      await request(app.getHttpServer())
        .post('/ingestion/anpr')
        .send(exitPayload)
        .expect(201);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify session is completed
      const sessionRepo = dataSource.getRepository(Session);
      const sessions = await sessionRepo.find({ where: { vrm: 'AB12CDE' } });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].status).toBe('COMPLETED');
      expect(sessions[0].endTime).toBeDefined();
      expect(sessions[0].durationMinutes).toBeGreaterThan(0);
    });

    it('should handle duplicate movements', async () => {
      const payload = {
        siteId: 'TEST01',
        vrm: 'AB12CDE',
        timestamp: new Date().toISOString(),
        cameraId: 'CAM01',
        direction: 'TOWARDS',
      };

      const firstResponse = await request(app.getHttpServer())
        .post('/ingestion/anpr')
        .send(payload)
        .expect(201);

      const secondResponse = await request(app.getHttpServer())
        .post('/ingestion/anpr')
        .send(payload)
        .expect(201);

      expect(secondResponse.body.isNew).toBe(false);
      expect(secondResponse.body.movement.id).toBe(firstResponse.body.movement.id);
    });
  });
});
```

### E2E Test: Complete Parking Flow

Create `test/e2e/parking-flow.e2e-spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { getTestDbConfig } from '../setup/test-db.config';
import { Site, Movement, Session, Decision, Payment } from '../../src/domain/entities';
import { DecisionOutcome } from '../../src/domain/entities';
import { createTestSite } from '../unit/fixtures/entities';

describe('Complete Parking Flow (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        AppModule,
        TypeOrmModule.forRoot(getTestDbConfig()),
      ],
    }).compile();

    app = module.createNestApplication();
    app.enableCors();
    await app.init();
    dataSource = module.get(DataSource);
  });

  beforeEach(async () => {
    await dataSource.synchronize(true);
    
    const siteRepo = dataSource.getRepository(Site);
    await siteRepo.save(createTestSite());
  });

  afterAll(async () => {
    await app.close();
    await dataSource.destroy();
  });

  it('should process complete parking session with enforcement', async () => {
    const vrm = 'ENFORCE01';
    const siteId = 'TEST01';

    // 1. Vehicle enters
    const entryResponse = await request(app.getHttpServer())
      .post('/ingestion/anpr')
      .send({
        siteId,
        vrm,
        timestamp: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
        cameraId: 'CAM01',
        direction: 'TOWARDS',
      })
      .expect(201);

    await new Promise(resolve => setTimeout(resolve, 200));

    // 2. Verify session created
    const sessionRepo = dataSource.getRepository(Session);
    let sessions = await sessionRepo.find({ where: { vrm } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe('PROVISIONAL');

    // 3. Vehicle exits (no payment)
    await request(app.getHttpServer())
      .post('/ingestion/anpr')
      .send({
        siteId,
        vrm,
        timestamp: new Date().toISOString(),
        cameraId: 'CAM02',
        direction: 'AWAY',
      })
      .expect(201);

    await new Promise(resolve => setTimeout(resolve, 500));

    // 4. Verify session completed
    sessions = await sessionRepo.find({ where: { vrm } });
    expect(sessions[0].status).toBe('COMPLETED');
    expect(sessions[0].durationMinutes).toBeGreaterThan(100); // ~2 hours

    // 5. Verify decision created
    const decisionRepo = dataSource.getRepository(Decision);
    const decisions = await decisionRepo.find({ where: { sessionId: sessions[0].id } });
    expect(decisions).toHaveLength(1);
    expect(decisions[0].outcome).toBe(DecisionOutcome.ENFORCEMENT_CANDIDATE);
    expect(decisions[0].status).toBe('NEW');

    // 6. Verify in enforcement queue
    const queueResponse = await request(app.getHttpServer())
      .get('/enforcement/queue')
      .expect(200);

    expect(queueResponse.body).toHaveLength(1);
    expect(queueResponse.body[0].id).toBe(decisions[0].id);

    // 7. Operator reviews and approves
    await request(app.getHttpServer())
      .post(`/enforcement/review/${decisions[0].id}`)
      .send({
        action: 'APPROVE',
        operatorId: 'operator-123',
        notes: 'Valid enforcement case',
      })
      .expect(200);

    // 8. Verify decision updated
    const updatedDecision = await decisionRepo.findOne({ where: { id: decisions[0].id } });
    expect(updatedDecision?.status).toBe('APPROVED');
    expect(updatedDecision?.operatorId).toBe('operator-123');
    expect(updatedDecision?.isOperatorOverride).toBe(true);
  });

  it('should process compliant session with payment', async () => {
    const vrm = 'PAID01';
    const siteId = 'TEST01';

    // 1. Vehicle enters
    const entryTime = new Date(Date.now() - 3600000); // 1 hour ago
    await request(app.getHttpServer())
      .post('/ingestion/anpr')
      .send({
        siteId,
        vrm,
        timestamp: entryTime.toISOString(),
        cameraId: 'CAM01',
        direction: 'TOWARDS',
      })
      .expect(201);

    // 2. Payment made
    await request(app.getHttpServer())
      .post('/ingestion/payment')
      .send({
        siteId,
        vrm,
        amount: 5.0,
        startTime: entryTime.toISOString(),
        expiryTime: new Date(Date.now() + 3600000).toISOString(), // Valid for 2 hours
        source: 'APP',
      })
      .expect(201);

    // 3. Vehicle exits
    await request(app.getHttpServer())
      .post('/ingestion/anpr')
      .send({
        siteId,
        vrm,
        timestamp: new Date().toISOString(),
        cameraId: 'CAM02',
        direction: 'AWAY',
      })
      .expect(201);

    await new Promise(resolve => setTimeout(resolve, 500));

    // 4. Verify compliant decision
    const sessionRepo = dataSource.getRepository(Session);
    const sessions = await sessionRepo.find({ where: { vrm } });
    
    const decisionRepo = dataSource.getRepository(Decision);
    const decisions = await decisionRepo.find({ where: { sessionId: sessions[0].id } });
    
    expect(decisions).toHaveLength(1);
    expect(decisions[0].outcome).toBe(DecisionOutcome.COMPLIANT);
    expect(decisions[0].ruleApplied).toBe('VALID_PAYMENT');
  });
});
```

---

## Frontend Testing

### Component Test Example

Create `frontend/src/components/DashboardStats.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import { DashboardStats } from './DashboardStats';
import { rest } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
  rest.get('http://localhost:3000/api/stats', (req, res, ctx) => {
    return res(ctx.json({
      sessions: 150,
      decisions: 45,
      timestamp: new Date().toISOString(),
    }));
  }),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('DashboardStats', () => {
  it('should display statistics', async () => {
    render(<DashboardStats />);
    
    await waitFor(() => {
      expect(screen.getByText(/150/)).toBeInTheDocument();
      expect(screen.getByText(/45/)).toBeInTheDocument();
    });
  });

  it('should handle API errors gracefully', async () => {
    server.use(
      rest.get('http://localhost:3000/api/stats', (req, res, ctx) => {
        return res(ctx.status(500));
      }),
    );

    render(<DashboardStats />);
    
    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
  });
});
```

### Frontend Test Setup

Create `frontend/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
});
```

---

## Test Configuration

### Jest Configuration

Update `package.json`:

```json
{
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": {
      "^.+\\.(t|j)s$": "ts-jest"
    },
    "collectCoverageFrom": [
      "**/*.(t|j)s"
    ],
    "coverageDirectory": "../coverage",
    "testEnvironment": "node",
    "moduleNameMapper": {
      "^@/(.*)$": "<rootDir>/$1"
    },
    "setupFilesAfterEnv": ["<rootDir>/../test/setup/jest.setup.ts"]
  }
}
```

### E2E Jest Configuration

Update `test/jest-e2e.json`:

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "setupFilesAfterEnv": ["<rootDir>/setup/jest-e2e.setup.ts"],
  "testTimeout": 30000
}
```

---

## CI/CD Integration

### GitHub Actions Workflow

Create `.github/workflows/test.yml`:

```yaml
name: Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_USER: pos_test_user
          POSTGRES_PASSWORD: pos_test_pass
          POSTGRES_DB: pos_test_db
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test

      - name: Run integration tests
        run: npm run test:integration
        env:
          TEST_DB_HOST: localhost
          TEST_DB_PORT: 5432
          TEST_DB_USERNAME: pos_test_user
          TEST_DB_PASSWORD: pos_test_pass
          TEST_DB_DATABASE: pos_test_db

      - name: Run E2E tests
        run: npm run test:e2e
        env:
          TEST_DB_HOST: localhost
          TEST_DB_PORT: 5432
          TEST_DB_USERNAME: pos_test_user
          TEST_DB_PASSWORD: pos_test_pass
          TEST_DB_DATABASE: pos_test_db

      - name: Generate coverage report
        run: npm run test:cov

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

      - name: Run frontend tests
        run: |
          cd frontend
          npm ci
          npm run test
```

### NPM Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:integration": "jest --config ./test/jest-integration.json",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "test:all": "npm run test && npm run test:integration && npm run test:e2e"
  }
}
```

---

## Coverage Requirements

### Minimum Coverage Targets

- **Overall:** 80%
- **Services:** 90%
- **Controllers:** 85%
- **Utilities:** 95%
- **Entities:** 70% (getters/setters)

### Coverage Exclusions

Add to `jest.config.js`:

```javascript
module.exports = {
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    '!src/**/*.spec.ts',
    '!src/**/*.interface.ts',
    '!src/**/index.ts',
    '!src/main.ts',
  ],
};
```

---

## Best Practices

### 1. Test Naming

- Use descriptive test names: `it('should return COMPLIANT when valid permit exists')`
- Group related tests with `describe` blocks
- Use `describe` for the unit under test, `it` for behavior

### 2. Arrange-Act-Assert (AAA)

```typescript
it('should do something', () => {
  // Arrange
  const input = createTestInput();
  const expected = createExpectedOutput();

  // Act
  const result = service.doSomething(input);

  // Assert
  expect(result).toEqual(expected);
});
```

### 3. Test Isolation

- Each test should be independent
- Use `beforeEach` to set up fresh state
- Clean up after tests (database, files, etc.)

### 4. Mock External Dependencies

- Mock database repositories
- Mock HTTP clients
- Mock file system operations
- Mock external APIs

### 5. Test Edge Cases

- Null/undefined inputs
- Empty arrays/objects
- Boundary values
- Error conditions
- Time-based scenarios

### 6. Avoid Test Interdependence

- Don't rely on test execution order
- Don't share mutable state between tests
- Use factories/fixtures for test data

### 7. Keep Tests Fast

- Use mocks for slow operations
- Parallelize test execution
- Avoid unnecessary waits
- Use in-memory databases for tests

### 8. Test What Matters

- Focus on business logic
- Test public interfaces
- Don't test implementation details
- Test error handling

---

## Running Tests

### Local Development

```bash
# Run all tests
npm run test:all

# Run unit tests only
npm run test

# Run in watch mode
npm run test:watch

# Run with coverage
npm run test:cov

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e

# Run frontend tests
cd frontend && npm run test
```

### Pre-commit Hook

Install `husky` and `lint-staged`:

```bash
npm install --save-dev husky lint-staged
npx husky install
npx husky add .husky/pre-commit "npx lint-staged"
```

Add to `package.json`:

```json
{
  "lint-staged": {
    "*.ts": [
      "eslint --fix",
      "jest --findRelatedTests --passWithNoTests"
    ]
  }
}
```

---

## Test Maintenance

### Regular Tasks

1. **Review failing tests** - Fix or update as needed
2. **Update fixtures** - Keep test data current
3. **Refactor tests** - Improve readability
4. **Remove obsolete tests** - Clean up unused tests
5. **Update coverage** - Ensure targets are met

### When to Update Tests

- When requirements change
- When bugs are fixed (add regression test)
- When refactoring code
- When adding new features

---

## Troubleshooting

### Common Issues

1. **Database connection errors**
   - Ensure test database exists
   - Check connection credentials
   - Verify PostgreSQL is running

2. **Async timing issues**
   - Use `waitFor` for async operations
   - Increase test timeout if needed
   - Use proper async/await

3. **Mock not working**
   - Verify mock setup in `beforeEach`
   - Check mock return values
   - Ensure mocks are reset between tests

4. **Test isolation failures**
   - Clean database between tests
   - Reset mocks in `afterEach`
   - Avoid shared state

---

## Summary

This testing system provides:

- ✅ **Comprehensive coverage** - Unit, integration, and E2E tests
- ✅ **Automation** - CI/CD integration
- ✅ **Fast feedback** - Quick test execution
- ✅ **Maintainability** - Well-organized, reusable test utilities
- ✅ **Best practices** - Industry-standard patterns
- ✅ **Documentation** - Clear examples and guidelines

**Next Steps:**

1. Implement test utilities and fixtures
2. Write unit tests for all services
3. Add integration tests for API endpoints
4. Create E2E tests for critical flows
5. Set up CI/CD pipeline
6. Achieve 80%+ coverage
