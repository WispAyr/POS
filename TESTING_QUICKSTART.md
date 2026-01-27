# Testing Quick Start Guide

This is a quick reference for getting started with testing in the Parking Operations System.

## Prerequisites

1. **Test Database Setup**

```bash
# Create test database
createdb pos_test_db

# Or using psql
psql -U postgres -c "CREATE DATABASE pos_test_db;"
psql -U postgres -c "CREATE USER pos_test_user WITH PASSWORD 'pos_test_pass';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE pos_test_db TO pos_test_user;"
```

2. **Environment Variables** (optional - defaults provided)

Create `.env.test` or set environment variables:

```env
TEST_DB_HOST=localhost
TEST_DB_PORT=5432
TEST_DB_USERNAME=pos_test_user
TEST_DB_PASSWORD=pos_test_pass
TEST_DB_DATABASE=pos_test_db
```

## Running Tests

### Quick Commands

```bash
# Run all unit tests
npm run test

# Run tests in watch mode (for development)
npm run test:watch

# Run with coverage report
npm run test:cov

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e

# Run all tests (unit + integration + e2e)
npm run test:all
```

## Writing Your First Test

### 1. Unit Test Example

Create `src/engine/services/rule-engine.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RuleEngineService } from './rule-engine.service';
import { createMockRepository } from '../../../test/unit/mocks/repository.mock';
import { createTestSession, createTestPermit } from '../../../test/unit/fixtures/entities';
import { DecisionOutcome } from '../../domain/entities';

describe('RuleEngineService', () => {
  let service: RuleEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
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
  });

  it('should return COMPLIANT when permit exists', async () => {
    const session = createTestSession();
    // ... test implementation
  });
});
```

### 2. Integration Test Example

Create `test/integration/anpr-ingestion.integration.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getTestDbConfig } from '../setup/test-db.config';
import { AppModule } from '../../src/app.module';
import * as request from 'supertest';

describe('ANPR Ingestion (Integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule, TypeOrmModule.forRoot(getTestDbConfig())],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should create movement', async () => {
    const response = await request(app.getHttpServer())
      .post('/ingestion/anpr')
      .send({
        siteId: 'TEST01',
        vrm: 'AB12CDE',
        timestamp: new Date().toISOString(),
        cameraId: 'CAM01',
        direction: 'TOWARDS',
      })
      .expect(201);

    expect(response.body.movement).toBeDefined();
  });
});
```

## Test Data Generation

### Quick Start

```typescript
import { TestDataGenerator, TestDataCleanup, TestScenarios } from '../unit/generators';

// Setup
const generator = new TestDataGenerator(dataSource);
const cleanup = new TestDataCleanup(dataSource);
const scenarios = new TestScenarios(generator, dataSource);

// Create test site
const testSite = await generator.createTestSite();

// Generate scenario
const scenario = await scenarios.compliantWithPayment(testSite.id);

// Cleanup
await cleanup.cleanupAllTestData();
```

### Available Scenarios

- `compliantWithPayment()` - Vehicle with valid payment
- `compliantWithPermit()` - Vehicle with valid permit
- `enforcementCandidate()` - No payment/permit, enforcement needed
- `withinGracePeriod()` - Short stay, within grace
- `paymentExpired()` - Payment expired scenario
- `globalPermit()` - Global permit scenario
- `multipleSessionsSameVehicle()` - Multiple sessions same day

### Test Data Cleanup

All test data is automatically flagged and can be cleaned up:

```typescript
// Clean all test data
await cleanup.cleanupAllTestData();

// Clean specific test run
await cleanup.cleanupTestRun(testRunId);

// Count test data
const counts = await cleanup.countTestData();
```

See `test/examples/parking-events-test.example.ts` for complete examples.

## Test Utilities Available

### Fixtures

Located in `test/unit/fixtures/entities.ts`:

- `createTestSite()` - Creates a test Site entity
- `createTestMovement()` - Creates a test Movement entity
- `createTestSession()` - Creates a test Session entity
- `createTestPayment()` - Creates a test Payment entity
- `createTestPermit()` - Creates a test Permit entity
- `createTestDecision()` - Creates a test Decision entity

### Mocks

Located in `test/unit/mocks/repository.mock.ts`:

- `createMockRepository<T>()` - Creates a mocked TypeORM repository

### Helpers

Located in `test/unit/helpers/test-helpers.ts`:

- `createTestApp()` - Creates a test NestJS application
- `closeTestApp()` - Closes a test application
- `makeRequest()` - Creates a supertest request instance
- `wait()` - Waits for specified milliseconds
- `minutesAgo()` - Creates a date N minutes in the past
- `minutesFromNow()` - Creates a date N minutes in the future
- `normalizeVrm()` - Normalizes a VRM string

## Test Structure

```
test/
├── setup/                    # Test configuration
│   ├── test-db.config.ts    # Database config
│   └── jest.setup.ts         # Jest setup
├── unit/                     # Unit test utilities
│   ├── fixtures/            # Test data factories
│   ├── mocks/               # Mock implementations
│   └── helpers/             # Helper functions
├── integration/             # Integration tests
└── e2e/                      # E2E tests
```

## Common Patterns

### Testing Services with Dependencies

```typescript
const module = await Test.createTestingModule({
  providers: [
    YourService,
    {
      provide: getRepositoryToken(Entity),
      useValue: createMockRepository(),
    },
    {
      provide: AnotherService,
      useValue: {
        method: jest.fn(),
      },
    },
  ],
}).compile();
```

### Testing Controllers

```typescript
const module = await Test.createTestingModule({
  controllers: [YourController],
  providers: [YourService, /* ... */],
}).compile();

const app = module.createNestApplication();
await app.init();

const response = await request(app.getHttpServer())
  .get('/your-endpoint')
  .expect(200);
```

### Testing Async Operations

```typescript
it('should handle async operations', async () => {
  // Arrange
  const promise = service.asyncMethod();

  // Act & Assert
  await expect(promise).resolves.toEqual(expectedValue);
});
```

### Testing Error Cases

```typescript
it('should throw error when invalid input', async () => {
  await expect(service.method(invalidInput))
    .rejects
    .toThrow(NotFoundException);
});
```

## Coverage Goals

- **Overall:** 80%
- **Services:** 90%
- **Controllers:** 85%
- **Utilities:** 95%

View coverage report:

```bash
npm run test:cov
# Open coverage/lcov-report/index.html
```

## CI/CD

Tests run automatically on:
- Push to `main`, `develop`, or `master`
- Pull requests

See `.github/workflows/test.yml` for configuration.

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
pg_isready

# Test connection
psql -U pos_test_user -d pos_test_db -h localhost
```

### Test Timeout Issues

Increase timeout in test file:

```typescript
jest.setTimeout(30000); // 30 seconds
```

### Mock Not Working

Ensure mocks are reset in `beforeEach`:

```typescript
beforeEach(() => {
  jest.clearAllMocks();
});
```

## Next Steps

1. Read [TESTING.md](./TESTING.md) for comprehensive documentation
2. Write unit tests for existing services
3. Add integration tests for API endpoints
4. Create E2E tests for critical flows
5. Set up pre-commit hooks (optional)

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Testing Best Practices](./TESTING.md#best-practices)
