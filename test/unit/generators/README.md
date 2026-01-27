# Test Data Generator

This module provides utilities for generating test parking events and cleaning up test data.

## Overview

The test data generator system allows you to:
- Generate realistic parking scenarios (entry/exit movements, sessions, payments, permits)
- Flag all test data for easy identification
- Clean up test data after tests complete
- Use pre-defined scenarios for common test cases

## Key Features

### 1. Automatic Test Data Flagging

All generated data is automatically flagged:
- **VRMs**: Prefixed with `TEST_` (e.g., `TEST_PAID_ABC123`)
- **Metadata**: `rawData` contains `isTest: true` and `testRunId`
- **Decisions**: `params` contains test metadata
- **Easy Cleanup**: All test data can be identified and removed

### 2. Test Run Tracking

Each generator instance has a unique `testRunId`:
```typescript
const generator = new TestDataGenerator(dataSource);
const testRunId = generator.getTestRunId(); // e.g., "test_1234567890_abc123"
```

This allows cleanup of specific test runs.

## Usage

### Basic Usage

```typescript
import { TestDataGenerator, TestDataCleanup } from './test/unit/generators';

// Setup
const generator = new TestDataGenerator(dataSource);
const cleanup = new TestDataCleanup(dataSource);

// Create test site
const site = await generator.createTestSite();

// Generate entry movement
const entry = await generator.createEntryMovement(site.id, 'TEST_ABC123');

// Generate exit movement
const exit = await generator.createExitMovement(site.id, 'TEST_ABC123');

// Create complete parking session
const { entry, exit, session } = await generator.createParkingSession(
  site.id,
  'TEST_ABC123',
  { durationMinutes: 60 }
);

// Create payment
const payment = await generator.createPayment(site.id, 'TEST_ABC123', {
  durationHours: 2,
  amount: 5.0,
});

// Create permit
const permit = await generator.createPermit(site.id, 'TEST_ABC123', {
  type: 'WHITELIST',
});

// Cleanup
await cleanup.cleanupAllTestData();
```

### Using Pre-defined Scenarios

```typescript
import { TestScenarios } from './test/unit/generators';

const scenarios = new TestScenarios(generator, dataSource);

// Compliant with payment
const scenario1 = await scenarios.compliantWithPayment(siteId);

// Enforcement candidate
const scenario2 = await scenarios.enforcementCandidate(siteId);

// Within grace period
const scenario3 = await scenarios.withinGracePeriod(siteId);

// Generate full test suite
const suite = await scenarios.generateFullTestSuite(siteId);
```

### Generating Multiple Scenarios

```typescript
// Generate 10 random scenarios
const scenarios = await generator.generateMultipleScenarios(siteId, 10, {
  mixCompliantAndEnforcement: true,
  paymentRatio: 0.5, // 50% with payment
  permitRatio: 0.3,  // 30% with permit
});
```

## Available Scenarios

### TestScenarios Class

1. **compliantWithPayment(siteId)**
   - Creates vehicle with valid payment covering session duration
   - Returns: vrm, entry, exit, session, payment, decision (COMPLIANT)

2. **compliantWithPermit(siteId)**
   - Creates vehicle with valid site-specific permit
   - Returns: vrm, entry, exit, session, permit, decision (COMPLIANT)

3. **enforcementCandidate(siteId)**
   - Creates vehicle with no payment/permit, exceeds grace period
   - Returns: vrm, entry, exit, session, decision (ENFORCEMENT_CANDIDATE)

4. **withinGracePeriod(siteId)**
   - Creates short parking session within grace period
   - Returns: vrm, entry, exit, session, decision (COMPLIANT)

5. **paymentExpired(siteId)**
   - Creates payment that expires before session ends
   - Returns: vrm, entry, exit, session, payment, decision (ENFORCEMENT_CANDIDATE)

6. **globalPermit(siteId)**
   - Creates vehicle with global permit (valid at all sites)
   - Returns: vrm, entry, exit, session, permit, decision (COMPLIANT)

7. **multipleSessionsSameVehicle(siteId, count)**
   - Creates multiple parking sessions for same vehicle
   - Returns: vrm, sessions array

8. **generateFullTestSuite(siteId)**
   - Generates all scenarios at once
   - Returns: object with all scenario results

## Test Data Cleanup

### Cleanup Methods

```typescript
const cleanup = new TestDataCleanup(dataSource);

// Clean all test data
const results = await cleanup.cleanupAllTestData();
// Returns: { movements, sessions, payments, permits, decisions, auditLogs, sites }

// Clean specific test run
const results = await cleanup.cleanupTestRun(testRunId);

// Count test data (without removing)
const counts = await cleanup.countTestData();
```

### Cleanup Identification

Test data is identified by:
- VRM starting with `TEST_`
- `rawData.isTest === true` (movements, payments)
- `params.isTest === true` (decisions)
- Site ID starting with `TEST_`

## Best Practices

### 1. Use in Test Setup/Teardown

```typescript
beforeAll(async () => {
  generator = new TestDataGenerator(dataSource);
  cleanup = new TestDataCleanup(dataSource);
  testSite = await generator.createTestSite();
});

afterAll(async () => {
  await cleanup.cleanupAllTestData();
});
```

### 2. Use Test Run IDs for Isolation

```typescript
// Each test gets its own generator instance
const generator = new TestDataGenerator(dataSource);
const testRunId = generator.getTestRunId();

// Generate test data
await scenarios.compliantWithPayment(siteId);

// Cleanup only this test's data
await cleanup.cleanupTestRun(testRunId);
```

### 3. Use Scenarios for Common Cases

Instead of manually creating movements, sessions, etc., use pre-defined scenarios:

```typescript
// Good
const scenario = await scenarios.compliantWithPayment(siteId);

// Less ideal (but still works)
const entry = await generator.createEntryMovement(...);
const payment = await generator.createPayment(...);
// etc.
```

### 4. Clean Up After Tests

Always clean up test data to avoid test pollution:

```typescript
afterEach(async () => {
  await cleanup.cleanupAllTestData();
});
```

## Example Test

See `test/examples/parking-events-test.example.ts` for a complete example test file demonstrating:
- Payment system tests
- Whitelist/permit system tests
- Enforcement system tests
- Complex scenarios
- Test data cleanup

## API Reference

### TestDataGenerator

- `getTestRunId()`: Get unique test run ID
- `generateTestVrm(prefix?)`: Generate test VRM
- `createTestSite(overrides?)`: Create test site
- `createEntryMovement(siteId, vrm, timestamp?, overrides?)`: Create entry movement
- `createExitMovement(siteId, vrm, timestamp?, overrides?)`: Create exit movement
- `createParkingSession(siteId, vrm, options?)`: Create complete session
- `createPayment(siteId, vrm, options?)`: Create payment
- `createPermit(siteId, vrm, options?)`: Create permit
- `createDecision(sessionId, outcome, options?)`: Create decision
- `generateParkingScenario(scenario)`: Generate complete scenario
- `generateMultipleScenarios(siteId, count, options?)`: Generate multiple scenarios

### TestDataCleanup

- `cleanupAllTestData()`: Remove all test data
- `cleanupTestRun(testRunId)`: Remove specific test run data
- `countTestData()`: Count test data without removing

### TestScenarios

- `compliantWithPayment(siteId)`: Compliant with payment scenario
- `compliantWithPermit(siteId)`: Compliant with permit scenario
- `enforcementCandidate(siteId)`: Enforcement candidate scenario
- `withinGracePeriod(siteId)`: Within grace period scenario
- `paymentExpired(siteId)`: Payment expired scenario
- `globalPermit(siteId)`: Global permit scenario
- `multipleSessionsSameVehicle(siteId, count)`: Multiple sessions scenario
- `generateFullTestSuite(siteId)`: All scenarios
