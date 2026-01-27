import { DataSource } from 'typeorm';
import { TestDataGenerator } from './test-data-generator';
import { Site, DecisionOutcome } from '../../../src/domain/entities';

/**
 * Pre-defined test scenarios for common parking situations
 */
export class TestScenarios {
  constructor(
    private generator: TestDataGenerator,
    private dataSource: DataSource,
  ) {}

  /**
   * Scenario 1: Compliant parking with valid payment
   */
  async compliantWithPayment(siteId: string): Promise<{
    vrm: string;
    entry: any;
    exit: any;
    session: any;
    payment: any;
    decision: any;
  }> {
    const vrm = this.generator.generateTestVrm('PAID');
    const site = await this.dataSource
      .getRepository(Site)
      .findOne({ where: { id: siteId } });
    if (!site) throw new Error(`Site ${siteId} not found`);

    // Create payment first (covers 2 hours)
    const payment = await this.generator.createPayment(siteId, vrm, {
      durationHours: 2,
      amount: 5.0,
      source: 'APP',
    });

    // Create parking session (1 hour duration)
    const { entry, exit, session } = await this.generator.createParkingSession(
      siteId,
      vrm,
      {
        durationMinutes: 60,
      },
    );

    // Decision should be COMPLIANT (created by rule engine, but we can create for testing)
    const decision = await this.generator.createDecision(
      session.id,
      DecisionOutcome.COMPLIANT,
      {
        ruleApplied: 'VALID_PAYMENT',
        rationale: 'Payment covers session duration',
      },
    );

    return { vrm, entry, exit, session, payment, decision };
  }

  /**
   * Scenario 2: Compliant parking with valid permit
   */
  async compliantWithPermit(siteId: string): Promise<{
    vrm: string;
    entry: any;
    exit: any;
    session: any;
    permit: any;
    decision: any;
  }> {
    const vrm = this.generator.generateTestVrm('PERMIT');
    const site = await this.dataSource
      .getRepository(Site)
      .findOne({ where: { id: siteId } });
    if (!site) throw new Error(`Site ${siteId} not found`);

    // Create permit
    const permit = await this.generator.createPermit(siteId, vrm, {
      type: 'WHITELIST',
      active: true,
    });

    // Create parking session
    const { entry, exit, session } = await this.generator.createParkingSession(
      siteId,
      vrm,
      {
        durationMinutes: 120,
      },
    );

    // Decision should be COMPLIANT
    const decision = await this.generator.createDecision(
      session.id,
      DecisionOutcome.COMPLIANT,
      {
        ruleApplied: 'VALID_PERMIT',
        rationale: 'Valid permit exists',
      },
    );

    return { vrm, entry, exit, session, permit, decision };
  }

  /**
   * Scenario 3: Enforcement candidate - no payment, exceeds grace period
   */
  async enforcementCandidate(siteId: string): Promise<{
    vrm: string;
    entry: any;
    exit: any;
    session: any;
    decision: any;
  }> {
    const vrm = this.generator.generateTestVrm('ENFORCE');
    const site = await this.dataSource
      .getRepository(Site)
      .findOne({ where: { id: siteId } });
    if (!site) throw new Error(`Site ${siteId} not found`);

    // Create parking session with long duration (exceeds grace period)
    const { entry, exit, session } = await this.generator.createParkingSession(
      siteId,
      vrm,
      {
        durationMinutes: 120, // 2 hours, exceeds grace period
      },
    );

    // Decision should be ENFORCEMENT_CANDIDATE
    const decision = await this.generator.createDecision(
      session.id,
      DecisionOutcome.ENFORCEMENT_CANDIDATE,
      {
        ruleApplied: 'NO_VALID_PAYMENT',
        rationale: 'No payment or permit, exceeds grace period',
        status: 'NEW',
      },
    );

    return { vrm, entry, exit, session, decision };
  }

  /**
   * Scenario 4: Within grace period (compliant)
   */
  async withinGracePeriod(siteId: string): Promise<{
    vrm: string;
    entry: any;
    exit: any;
    session: any;
    decision: any;
  }> {
    const vrm = this.generator.generateTestVrm('GRACE');
    const site = await this.dataSource
      .getRepository(Site)
      .findOne({ where: { id: siteId } });
    if (!site) throw new Error(`Site ${siteId} not found`);

    // Create short parking session (within grace period)
    const { entry, exit, session } = await this.generator.createParkingSession(
      siteId,
      vrm,
      {
        durationMinutes: 15, // Within grace (10 + 10 = 20 minutes)
      },
    );

    // Decision should be COMPLIANT
    const decision = await this.generator.createDecision(
      session.id,
      DecisionOutcome.COMPLIANT,
      {
        ruleApplied: 'WITHIN_GRACE',
        rationale: 'Duration within grace period',
      },
    );

    return { vrm, entry, exit, session, decision };
  }

  /**
   * Scenario 5: Payment expired before exit
   */
  async paymentExpired(siteId: string): Promise<{
    vrm: string;
    entry: any;
    exit: any;
    session: any;
    payment: any;
    decision: any;
  }> {
    const vrm = this.generator.generateTestVrm('EXPIRED');
    const site = await this.dataSource
      .getRepository(Site)
      .findOne({ where: { id: siteId } });
    if (!site) throw new Error(`Site ${siteId} not found`);

    // Create payment that expires before session ends
    const entryTime = new Date(Date.now() - 120 * 60 * 1000); // 2 hours ago
    const payment = await this.generator.createPayment(siteId, vrm, {
      startTime: entryTime,
      expiryTime: new Date(entryTime.getTime() + 30 * 60 * 1000), // Expires after 30 minutes
      amount: 2.5,
    });

    // Create parking session that extends beyond payment expiry
    const { entry, exit, session } = await this.generator.createParkingSession(
      siteId,
      vrm,
      {
        entryTime,
        exitTime: new Date(), // Now (2 hours later)
        durationMinutes: 120,
      },
    );

    // Decision should be ENFORCEMENT_CANDIDATE (payment expired)
    const decision = await this.generator.createDecision(
      session.id,
      DecisionOutcome.ENFORCEMENT_CANDIDATE,
      {
        ruleApplied: 'PAYMENT_EXPIRED',
        rationale: 'Payment expired before session end',
        status: 'NEW',
      },
    );

    return { vrm, entry, exit, session, payment, decision };
  }

  /**
   * Scenario 6: Global permit (valid at all sites)
   */
  async globalPermit(siteId: string): Promise<{
    vrm: string;
    entry: any;
    exit: any;
    session: any;
    permit: any;
    decision: any;
  }> {
    const vrm = this.generator.generateTestVrm('GLOBAL');
    const site = await this.dataSource
      .getRepository(Site)
      .findOne({ where: { id: siteId } });
    if (!site) throw new Error(`Site ${siteId} not found`);

    // Create global permit (siteId = null)
    const permit = await this.generator.createPermit(null, vrm, {
      type: 'STAFF',
      active: true,
    });

    // Create parking session
    const { entry, exit, session } = await this.generator.createParkingSession(
      siteId,
      vrm,
      {
        durationMinutes: 180,
      },
    );

    // Decision should be COMPLIANT
    const decision = await this.generator.createDecision(
      session.id,
      DecisionOutcome.COMPLIANT,
      {
        ruleApplied: 'VALID_PERMIT',
        rationale: 'Global permit valid at all sites',
      },
    );

    return { vrm, entry, exit, session, permit, decision };
  }

  /**
   * Scenario 7: Multiple sessions for same vehicle (same day)
   */
  async multipleSessionsSameVehicle(
    siteId: string,
    count: number = 3,
  ): Promise<{
    vrm: string;
    sessions: Array<{ entry: any; exit: any; session: any }>;
  }> {
    const vrm = this.generator.generateTestVrm('MULTI');
    const site = await this.dataSource
      .getRepository(Site)
      .findOne({ where: { id: siteId } });
    if (!site) throw new Error(`Site ${siteId} not found`);

    const sessions = [];
    const now = new Date();

    for (let i = 0; i < count; i++) {
      // Sessions spaced 2 hours apart
      const entryTime = new Date(
        now.getTime() - (count - i) * 2 * 60 * 60 * 1000,
      );
      const exitTime = new Date(entryTime.getTime() + 60 * 60 * 1000); // 1 hour duration

      const { entry, exit, session } =
        await this.generator.createParkingSession(siteId, vrm, {
          entryTime,
          exitTime,
          durationMinutes: 60,
        });

      sessions.push({ entry, exit, session });
    }

    return { vrm, sessions };
  }

  /**
   * Generate a full test suite with all scenarios
   */
  async generateFullTestSuite(siteId: string): Promise<{
    compliantWithPayment: any;
    compliantWithPermit: any;
    enforcementCandidate: any;
    withinGracePeriod: any;
    paymentExpired: any;
    globalPermit: any;
    multipleSessions: any;
  }> {
    const [
      compliantWithPayment,
      compliantWithPermit,
      enforcementCandidate,
      withinGracePeriod,
      paymentExpired,
      globalPermit,
      multipleSessions,
    ] = await Promise.all([
      this.compliantWithPayment(siteId),
      this.compliantWithPermit(siteId),
      this.enforcementCandidate(siteId),
      this.withinGracePeriod(siteId),
      this.paymentExpired(siteId),
      this.globalPermit(siteId),
      this.multipleSessionsSameVehicle(siteId, 3),
    ]);

    return {
      compliantWithPayment,
      compliantWithPermit,
      enforcementCandidate,
      withinGracePeriod,
      paymentExpired,
      globalPermit,
      multipleSessions,
    };
  }
}
