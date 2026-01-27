/**
 * Example test file demonstrating how to use the test data generator
 * to create parking events and test payment, whitelist, and enforcement systems
 *
 * Copy this file and adapt for your actual tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { getTestDbConfig } from '../setup/test-db.config';
import {
  TestDataGenerator,
  TestDataCleanup,
  TestScenarios,
} from '../unit/generators';
import { Site, DecisionOutcome } from '../../src/domain/entities';

describe('Parking Events - Payment, Whitelist, and Enforcement Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let generator: TestDataGenerator;
  let cleanup: TestDataCleanup;
  let scenarios: TestScenarios;
  let testSite: Site;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule, TypeOrmModule.forRoot(getTestDbConfig())],
    }).compile();

    app = module.createNestApplication();
    await app.init();
    dataSource = module.get(DataSource);

    generator = new TestDataGenerator(dataSource);
    cleanup = new TestDataCleanup(dataSource);
    scenarios = new TestScenarios(generator, dataSource);

    // Create a test site for all tests
    testSite = await generator.createTestSite({
      id: 'TEST_SITE_001',
      name: 'Test Parking Site',
    });
  });

  afterAll(async () => {
    // Clean up all test data
    const cleanupResults = await cleanup.cleanupAllTestData();
    console.log('Test data cleanup:', cleanupResults);

    await app.close();
    await dataSource.destroy();
  });

  describe('Payment System Tests', () => {
    it('should create compliant session with valid payment', async () => {
      const scenario = await scenarios.compliantWithPayment(testSite.id);

      expect(scenario.payment).toBeDefined();
      expect(scenario.payment.vrm).toBe(scenario.vrm);
      expect(scenario.session.durationMinutes).toBeLessThanOrEqual(120); // Payment covers 2 hours
      expect(scenario.decision.outcome).toBe(DecisionOutcome.COMPLIANT);
      expect(scenario.decision.ruleApplied).toBe('VALID_PAYMENT');
    });

    it('should create enforcement candidate when payment expired', async () => {
      const scenario = await scenarios.paymentExpired(testSite.id);

      expect(scenario.payment).toBeDefined();
      expect(scenario.session.durationMinutes).toBeGreaterThan(30); // Session longer than payment
      expect(scenario.decision.outcome).toBe(
        DecisionOutcome.ENFORCEMENT_CANDIDATE,
      );
    });

    it('should handle multiple payments for same vehicle', async () => {
      const vrm = generator.generateTestVrm('MULTI_PAY');

      // Create first payment
      const payment1 = await generator.createPayment(testSite.id, vrm, {
        durationHours: 1,
        amount: 2.5,
      });

      // Create second payment (overlapping)
      const payment2 = await generator.createPayment(testSite.id, vrm, {
        startTime: new Date(payment1.startTime.getTime() + 30 * 60 * 1000), // 30 min after first
        durationHours: 2,
        amount: 5.0,
      });

      // Create session that should be covered by second payment
      const { session } = await generator.createParkingSession(
        testSite.id,
        vrm,
        {
          entryTime: payment1.startTime,
          exitTime: new Date(payment1.startTime.getTime() + 90 * 60 * 1000), // 90 minutes
          durationMinutes: 90,
        },
      );

      expect(payment1).toBeDefined();
      expect(payment2).toBeDefined();
      expect(session).toBeDefined();
    });
  });

  describe('Whitelist/Permit System Tests', () => {
    it('should create compliant session with site-specific permit', async () => {
      const scenario = await scenarios.compliantWithPermit(testSite.id);

      expect(scenario.permit).toBeDefined();
      expect(scenario.permit.siteId).toBe(testSite.id);
      expect(scenario.permit.active).toBe(true);
      expect(scenario.decision.outcome).toBe(DecisionOutcome.COMPLIANT);
      expect(scenario.decision.ruleApplied).toBe('VALID_PERMIT');
    });

    it('should create compliant session with global permit', async () => {
      const scenario = await scenarios.globalPermit(testSite.id);

      expect(scenario.permit).toBeDefined();
      expect(scenario.permit.siteId).toBeNull(); // Global permit
      expect(scenario.decision.outcome).toBe(DecisionOutcome.COMPLIANT);
    });

    it('should handle expired permit', async () => {
      const vrm = generator.generateTestVrm('EXP_PERMIT');

      // Create expired permit
      const permit = await generator.createPermit(testSite.id, vrm, {
        type: 'WHITELIST',
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        endDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Expired yesterday
        active: true,
      });

      // Create session
      const { session } = await generator.createParkingSession(
        testSite.id,
        vrm,
        {
          durationMinutes: 60,
        },
      );

      expect(permit.endDate).toBeDefined();
      expect(permit.endDate!.getTime()).toBeLessThan(Date.now());
      expect(session).toBeDefined();
    });

    it('should handle inactive permit', async () => {
      const vrm = generator.generateTestVrm('INACTIVE');

      // Create inactive permit
      const permit = await generator.createPermit(testSite.id, vrm, {
        type: 'WHITELIST',
        active: false, // Inactive
      });

      // Create session
      const { session } = await generator.createParkingSession(
        testSite.id,
        vrm,
        {
          durationMinutes: 120,
        },
      );

      expect(permit.active).toBe(false);
      expect(session).toBeDefined();
    });
  });

  describe('Enforcement System Tests', () => {
    it('should create enforcement candidate when no payment or permit', async () => {
      const scenario = await scenarios.enforcementCandidate(testSite.id);

      expect(scenario.decision.outcome).toBe(
        DecisionOutcome.ENFORCEMENT_CANDIDATE,
      );
      expect(scenario.decision.status).toBe('NEW');
      expect(scenario.decision.ruleApplied).toBe('NO_VALID_PAYMENT');
      expect(scenario.session.durationMinutes).toBeGreaterThan(20); // Exceeds grace period
    });

    it('should create compliant decision when within grace period', async () => {
      const scenario = await scenarios.withinGracePeriod(testSite.id);

      expect(scenario.decision.outcome).toBe(DecisionOutcome.COMPLIANT);
      expect(scenario.decision.ruleApplied).toBe('WITHIN_GRACE');
      expect(scenario.session.durationMinutes).toBeLessThanOrEqual(20); // Within grace
    });

    it('should handle multiple enforcement candidates', async () => {
      const scenarios = await generator.generateMultipleScenarios(
        testSite.id,
        5,
        {
          mixCompliantAndEnforcement: true,
          paymentRatio: 0.2, // 20% with payment
          permitRatio: 0.1, // 10% with permit
        },
      );

      expect(scenarios).toHaveLength(5);

      // Count enforcement candidates (those without payment or permit)
      const enforcementCount = scenarios.filter(
        (s) => !s.payment && !s.permit,
      ).length;

      expect(enforcementCount).toBeGreaterThan(0);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle multiple sessions for same vehicle', async () => {
      const scenario = await scenarios.multipleSessionsSameVehicle(
        testSite.id,
        3,
      );

      expect(scenario.sessions).toHaveLength(3);
      expect(scenario.sessions[0].session.vrm).toBe(scenario.vrm);
      expect(scenario.sessions[1].session.vrm).toBe(scenario.vrm);
      expect(scenario.sessions[2].session.vrm).toBe(scenario.vrm);
    });

    it('should generate full test suite', async () => {
      const suite = await scenarios.generateFullTestSuite(testSite.id);

      expect(suite.compliantWithPayment).toBeDefined();
      expect(suite.compliantWithPermit).toBeDefined();
      expect(suite.enforcementCandidate).toBeDefined();
      expect(suite.withinGracePeriod).toBeDefined();
      expect(suite.paymentExpired).toBeDefined();
      expect(suite.globalPermit).toBeDefined();
      expect(suite.multipleSessions).toBeDefined();
    });

    it('should test payment time window validation', async () => {
      const vrm = generator.generateTestVrm('TIME_WINDOW');

      // Create payment that starts after session entry
      const entryTime = new Date(Date.now() - 120 * 60 * 1000); // 2 hours ago
      const paymentStartTime = new Date(entryTime.getTime() + 30 * 60 * 1000); // 30 min after entry
      const payment = await generator.createPayment(testSite.id, vrm, {
        startTime: paymentStartTime,
        durationHours: 1,
      });

      // Create session that starts before payment
      const { session } = await generator.createParkingSession(
        testSite.id,
        vrm,
        {
          entryTime,
          exitTime: new Date(),
          durationMinutes: 120,
        },
      );

      // Payment should not cover the full session
      expect(payment.startTime.getTime()).toBeGreaterThan(entryTime.getTime());
      expect(session.durationMinutes).toBe(120);
    });
  });

  describe('Test Data Cleanup', () => {
    it('should count test data', async () => {
      // Generate some test data
      await scenarios.compliantWithPayment(testSite.id);
      await scenarios.enforcementCandidate(testSite.id);

      const counts = await cleanup.countTestData();

      expect(counts.movements).toBeGreaterThan(0);
      expect(counts.sessions).toBeGreaterThan(0);
      expect(counts.payments).toBeGreaterThan(0);
    });

    it('should cleanup test data by test run ID', async () => {
      const testRunId = generator.getTestRunId();

      // Generate data with this generator instance
      await scenarios.compliantWithPayment(testSite.id);

      // Cleanup by test run ID
      const results = await cleanup.cleanupTestRun(testRunId);

      expect(results.movements).toBeGreaterThan(0);
      expect(results.sessions).toBeGreaterThan(0);
    });
  });
});
