import { DataSource, Repository } from 'typeorm';
import {
  Site,
  Movement,
  Session,
  Payment,
  Permit,
  Decision,
  AuditLog,
} from '../../../src/domain/entities';
import {
  SessionStatus,
  DecisionOutcome,
  PermitType,
} from '../../../src/domain/entities';

/**
 * Test data generator for parking events
 * All generated data is flagged with test metadata for easy cleanup
 */
export class TestDataGenerator {
  private testPrefix = 'TEST_';
  private testMetadata = {
    isTest: true,
    testRunId: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    generatedAt: new Date().toISOString(),
  };

  constructor(private dataSource: DataSource) {}

  /**
   * Get the test run ID for this generator instance
   */
  getTestRunId(): string {
    return this.testMetadata.testRunId;
  }

  /**
   * Generate a test VRM (Vehicle Registration Mark)
   */
  generateTestVrm(prefix: string = 'TEST'): string {
    return `${this.testPrefix}${prefix}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  }

  /**
   * Create a test site
   */
  async createTestSite(overrides?: Partial<Site>): Promise<Site> {
    const repo = this.dataSource.getRepository(Site);
    const site = repo.create({
      id: `TEST_${Date.now()}`,
      name: 'Test Site',
      config: {
        operatingModel: 'ANPR',
        gracePeriods: { entry: 10, exit: 10, overstay: 0 },
        cameras: [
          {
            id: 'TEST_CAM_ENTRY',
            direction: 'ENTRY',
            towardsDirection: 'ENTRY',
            awayDirection: 'EXIT',
            name: 'Test Entry Camera',
          },
          {
            id: 'TEST_CAM_EXIT',
            direction: 'EXIT',
            towardsDirection: 'EXIT',
            awayDirection: 'ENTRY',
            name: 'Test Exit Camera',
          },
        ],
        realTime: false,
      },
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });
    return repo.save(site);
  }

  /**
   * Create an entry movement
   */
  async createEntryMovement(
    siteId: string,
    vrm: string,
    timestamp?: Date,
    overrides?: Partial<Movement>,
  ): Promise<Movement> {
    const repo = this.dataSource.getRepository(Movement);
    const movement = repo.create({
      siteId,
      vrm,
      timestamp: timestamp || new Date(),
      cameraIds: 'TEST_CAM_ENTRY',
      direction: 'ENTRY',
      images: [
        {
          url: `http://test.example.com/images/${vrm}-entry.jpg`,
          type: 'plate',
          timestamp: timestamp || new Date(),
        },
      ],
      rawData: {
        ...this.testMetadata,
        cameraType: 'test',
        confidence: 0.95,
        source: 'TEST_GENERATOR',
      },
      ingestedAt: new Date(),
      ...overrides,
    });
    return repo.save(movement);
  }

  /**
   * Create an exit movement
   */
  async createExitMovement(
    siteId: string,
    vrm: string,
    timestamp?: Date,
    overrides?: Partial<Movement>,
  ): Promise<Movement> {
    const repo = this.dataSource.getRepository(Movement);
    const movement = repo.create({
      siteId,
      vrm,
      timestamp: timestamp || new Date(),
      cameraIds: 'TEST_CAM_EXIT',
      direction: 'EXIT',
      images: [
        {
          url: `http://test.example.com/images/${vrm}-exit.jpg`,
          type: 'plate',
          timestamp: timestamp || new Date(),
        },
      ],
      rawData: {
        ...this.testMetadata,
        cameraType: 'test',
        confidence: 0.95,
        source: 'TEST_GENERATOR',
      },
      ingestedAt: new Date(),
      ...overrides,
    });
    return repo.save(movement);
  }

  /**
   * Create a complete parking session (entry + exit)
   */
  async createParkingSession(
    siteId: string,
    vrm: string,
    options: {
      entryTime?: Date;
      exitTime?: Date;
      durationMinutes?: number;
    } = {},
  ): Promise<{ entry: Movement; exit: Movement; session: Session }> {
    const entryTime =
      options.entryTime ||
      new Date(Date.now() - (options.durationMinutes || 60) * 60 * 1000);
    const exitTime = options.exitTime || new Date();

    const entry = await this.createEntryMovement(siteId, vrm, entryTime);
    const exit = await this.createExitMovement(siteId, vrm, exitTime);

    const sessionRepo = this.dataSource.getRepository(Session);
    const durationMinutes =
      options.durationMinutes ||
      Math.floor((exitTime.getTime() - entryTime.getTime()) / 60000);

    const session = sessionRepo.create({
      siteId,
      vrm,
      entryMovementId: entry.id,
      exitMovementId: exit.id,
      startTime: entryTime,
      endTime: exitTime,
      durationMinutes,
      status: SessionStatus.COMPLETED,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const savedSession = await sessionRepo.save(session);

    return { entry, exit, session: savedSession };
  }

  /**
   * Create a payment record
   */
  async createPayment(
    siteId: string,
    vrm: string,
    options: {
      amount?: number;
      startTime?: Date;
      expiryTime?: Date;
      durationHours?: number;
      source?: string;
    } = {},
  ): Promise<Payment> {
    const repo = this.dataSource.getRepository(Payment);
    const startTime = options.startTime || new Date(Date.now() - 3600000); // 1 hour ago
    const durationHours = options.durationHours || 2;
    const expiryTime =
      options.expiryTime ||
      new Date(startTime.getTime() + durationHours * 3600000);

    const payment = repo.create({
      siteId,
      vrm,
      amount: options.amount || 5.0,
      startTime,
      expiryTime,
      source: options.source || 'TEST',
      externalReference: `TEST_PAY_${Date.now()}`,
      rawData: {
        ...this.testMetadata,
        testPayment: true,
      },
      ingestedAt: new Date(),
    });
    return repo.save(payment);
  }

  /**
   * Create a permit/whitelist record
   */
  async createPermit(
    siteId: string | null,
    vrm: string,
    options: {
      type?: PermitType;
      startDate?: Date;
      endDate?: Date | null;
      active?: boolean;
    } = {},
  ): Promise<Permit> {
    const repo = this.dataSource.getRepository(Permit);
    const permit = repo.create({
      siteId,
      vrm,
      type: options.type || PermitType.WHITELIST,
      startDate: options.startDate || new Date(Date.now() - 86400000), // Yesterday
      endDate: options.endDate === undefined ? null : options.endDate,
      active: options.active !== undefined ? options.active : true,
      createdAt: new Date(),
    });
    return repo.save(permit);
  }

  /**
   * Create a decision record
   */
  async createDecision(
    sessionId: string,
    outcome: DecisionOutcome,
    options: {
      ruleApplied?: string;
      rationale?: string;
      status?: string;
      movementId?: string;
    } = {},
  ): Promise<Decision> {
    const repo = this.dataSource.getRepository(Decision);
    const decision = repo.create({
      sessionId,
      movementId: options.movementId || null,
      outcome,
      status: options.status || 'NEW',
      ruleApplied: options.ruleApplied || 'TEST_RULE',
      rationale: options.rationale || 'Test decision',
      isOperatorOverride: false,
      operatorId: null,
      params: {
        ...this.testMetadata,
        testDecision: true,
      },
      createdAt: new Date(),
    });
    return repo.save(decision);
  }

  /**
   * Generate a complete parking scenario
   */
  async generateParkingScenario(scenario: {
    siteId: string;
    vrm?: string;
    hasPayment?: boolean;
    hasPermit?: boolean;
    permitType?: PermitType;
    durationMinutes?: number;
    paymentCoversDuration?: boolean;
    gracePeriodExceeded?: boolean;
  }): Promise<{
    site: Site;
    vrm: string;
    entry: Movement;
    exit: Movement;
    session: Session;
    payment?: Payment;
    permit?: Permit;
    decision?: Decision;
  }> {
    const vrm = scenario.vrm || this.generateTestVrm('SCENARIO');
    const site = await this.dataSource
      .getRepository(Site)
      .findOne({ where: { id: scenario.siteId } });
    if (!site) {
      throw new Error(`Site ${scenario.siteId} not found`);
    }

    // Calculate times
    const durationMinutes = scenario.durationMinutes || 60;
    const entryTime = new Date(Date.now() - durationMinutes * 60 * 1000);
    const exitTime = new Date();

    // Create permit if needed
    let permit: Permit | undefined;
    if (scenario.hasPermit) {
      permit = await this.createPermit(scenario.siteId, vrm, {
        type: scenario.permitType || PermitType.WHITELIST,
      });
    }

    // Create payment if needed
    let payment: Payment | undefined;
    if (scenario.hasPayment) {
      const paymentStartTime = entryTime;
      const paymentDurationHours = scenario.paymentCoversDuration
        ? Math.ceil(durationMinutes / 60) + 1 // Cover duration + buffer
        : Math.floor(durationMinutes / 60) - 1; // Less than duration (invalid)
      const paymentExpiryTime = new Date(
        paymentStartTime.getTime() + paymentDurationHours * 3600000,
      );

      payment = await this.createPayment(scenario.siteId, vrm, {
        startTime: paymentStartTime,
        expiryTime: paymentExpiryTime,
      });
    }

    // Create parking session
    const { entry, exit, session } = await this.createParkingSession(
      scenario.siteId,
      vrm,
      {
        entryTime,
        exitTime,
        durationMinutes,
      },
    );

    // Decision will be created by rule engine, but we can create one for testing
    let decision: Decision | undefined;
    if (
      scenario.gracePeriodExceeded &&
      !scenario.hasPayment &&
      !scenario.hasPermit
    ) {
      decision = await this.createDecision(
        session.id,
        DecisionOutcome.ENFORCEMENT_CANDIDATE,
        {
          ruleApplied: 'NO_VALID_PAYMENT',
          rationale:
            'Test scenario: No payment or permit, exceeds grace period',
        },
      );
    } else if (scenario.hasPermit || scenario.hasPayment) {
      decision = await this.createDecision(
        session.id,
        DecisionOutcome.COMPLIANT,
        {
          ruleApplied: scenario.hasPermit ? 'VALID_PERMIT' : 'VALID_PAYMENT',
          rationale: `Test scenario: ${scenario.hasPermit ? 'Permit' : 'Payment'} exists`,
        },
      );
    }

    return {
      site,
      vrm,
      entry,
      exit,
      session,
      payment,
      permit,
      decision,
    };
  }

  /**
   * Generate multiple parking scenarios for testing
   */
  async generateMultipleScenarios(
    siteId: string,
    count: number,
    options: {
      mixCompliantAndEnforcement?: boolean;
      paymentRatio?: number; // 0-1, ratio of scenarios with payment
      permitRatio?: number; // 0-1, ratio of scenarios with permit
    } = {},
  ): Promise<
    Array<{
      vrm: string;
      entry: Movement;
      exit: Movement;
      session: Session;
      payment?: Payment;
      permit?: Permit;
    }>
  > {
    const scenarios = [];
    const paymentRatio = options.paymentRatio || 0.5;
    const permitRatio = options.permitRatio || 0.3;

    for (let i = 0; i < count; i++) {
      const hasPayment = Math.random() < paymentRatio;
      const hasPermit = Math.random() < permitRatio;
      const durationMinutes = options.mixCompliantAndEnforcement
        ? hasPayment || hasPermit
          ? 30
          : 120 // Short if compliant, long if enforcement
        : 60;

      const scenario = await this.generateParkingScenario({
        siteId,
        hasPayment,
        hasPermit,
        durationMinutes,
        paymentCoversDuration: hasPayment,
      });

      scenarios.push({
        vrm: scenario.vrm,
        entry: scenario.entry,
        exit: scenario.exit,
        session: scenario.session,
        payment: scenario.payment,
        permit: scenario.permit,
      });
    }

    return scenarios;
  }
}
