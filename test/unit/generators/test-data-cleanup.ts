import { DataSource, Repository } from 'typeorm';
import { Movement, Session, Payment, Permit, Decision, AuditLog, Site } from '../../../src/domain/entities';

/**
 * Utility to clean up test data from the database
 */
export class TestDataCleanup {
  private testPrefix = 'TEST_';

  constructor(private dataSource: DataSource) {}

  /**
   * Remove all test data from the database
   * Identifies test data by:
   * - VRM starting with TEST_
   * - rawData containing isTest: true
   * - params containing isTest: true (for decisions)
   * - Site IDs starting with TEST_
   */
  async cleanupAllTestData(): Promise<{
    movements: number;
    sessions: number;
    payments: number;
    permits: number;
    decisions: number;
    auditLogs: number;
    sites: number;
  }> {
    const results = {
      movements: 0,
      sessions: 0,
      payments: 0,
      permits: 0,
      decisions: 0,
      auditLogs: 0,
      sites: 0,
    };

    // Clean up in order to respect foreign key constraints
    // Decisions first (may reference sessions)
    results.decisions = await this.cleanupTestDecisions();

    // Then sessions (may reference movements)
    results.sessions = await this.cleanupTestSessions();

    // Then movements
    results.movements = await this.cleanupTestMovements();

    // Payments and permits (independent)
    results.payments = await this.cleanupTestPayments();
    results.permits = await this.cleanupTestPermits();

    // Audit logs
    results.auditLogs = await this.cleanupTestAuditLogs();

    // Sites last (may be referenced by other entities)
    results.sites = await this.cleanupTestSites();

    return results;
  }

  /**
   * Clean up test data for a specific test run ID
   */
  async cleanupTestRun(testRunId: string): Promise<{
    movements: number;
    sessions: number;
    payments: number;
    permits: number;
    decisions: number;
  }> {
    const results = {
      movements: 0,
      sessions: 0,
      payments: 0,
      permits: 0,
      decisions: 0,
    };

    const testMetadata = { testRunId };

    // Clean decisions
    const decisionRepo = this.dataSource.getRepository(Decision);
    const testDecisions = await decisionRepo
      .createQueryBuilder('decision')
      .where("decision.params->>'testRunId' = :testRunId", { testRunId })
      .getMany();
    results.decisions = testDecisions.length;
    await decisionRepo.remove(testDecisions);

    // Clean sessions (by VRM)
    const sessionRepo = this.dataSource.getRepository(Session);
    const testSessions = await sessionRepo
      .createQueryBuilder('session')
      .where('session.vrm LIKE :prefix', { prefix: `${this.testPrefix}%` })
      .getMany();
    results.sessions = testSessions.length;
    await sessionRepo.remove(testSessions);

    // Clean movements
    const movementRepo = this.dataSource.getRepository(Movement);
    const testMovements = await movementRepo
      .createQueryBuilder('movement')
      .where("movement.rawData->>'isTest' = :isTest", { isTest: 'true' })
      .andWhere("movement.rawData->>'testRunId' = :testRunId", { testRunId })
      .getMany();
    results.movements = testMovements.length;
    await movementRepo.remove(testMovements);

    // Clean payments
    const paymentRepo = this.dataSource.getRepository(Payment);
    const testPayments = await paymentRepo
      .createQueryBuilder('payment')
      .where("payment.rawData->>'isTest' = :isTest", { isTest: 'true' })
      .andWhere("payment.rawData->>'testRunId' = :testRunId", { testRunId })
      .getMany();
    results.payments = testPayments.length;
    await paymentRepo.remove(testPayments);

    // Clean permits
    const permitRepo = this.dataSource.getRepository(Permit);
    const testPermits = await permitRepo
      .createQueryBuilder('permit')
      .where('permit.vrm LIKE :prefix', { prefix: `${this.testPrefix}%` })
      .getMany();
    results.permits = testPermits.length;
    await permitRepo.remove(testPermits);

    return results;
  }

  /**
   * Clean up test movements
   */
  private async cleanupTestMovements(): Promise<number> {
    const repo = this.dataSource.getRepository(Movement);
    const testMovements = await repo
      .createQueryBuilder('movement')
      .where("movement.rawData->>'isTest' = :isTest", { isTest: 'true' })
      .orWhere('movement.vrm LIKE :prefix', { prefix: `${this.testPrefix}%` })
      .getMany();
    const count = testMovements.length;
    if (count > 0) {
      await repo.remove(testMovements);
    }
    return count;
  }

  /**
   * Clean up test sessions
   */
  private async cleanupTestSessions(): Promise<number> {
    const repo = this.dataSource.getRepository(Session);
    const testSessions = await repo
      .createQueryBuilder('session')
      .where('session.vrm LIKE :prefix', { prefix: `${this.testPrefix}%` })
      .getMany();
    const count = testSessions.length;
    if (count > 0) {
      await repo.remove(testSessions);
    }
    return count;
  }

  /**
   * Clean up test payments
   */
  private async cleanupTestPayments(): Promise<number> {
    const repo = this.dataSource.getRepository(Payment);
    const testPayments = await repo
      .createQueryBuilder('payment')
      .where("payment.rawData->>'isTest' = :isTest", { isTest: 'true' })
      .orWhere('payment.vrm LIKE :prefix', { prefix: `${this.testPrefix}%` })
      .getMany();
    const count = testPayments.length;
    if (count > 0) {
      await repo.remove(testPayments);
    }
    return count;
  }

  /**
   * Clean up test permits
   */
  private async cleanupTestPermits(): Promise<number> {
    const repo = this.dataSource.getRepository(Permit);
    const testPermits = await repo
      .createQueryBuilder('permit')
      .where('permit.vrm LIKE :prefix', { prefix: `${this.testPrefix}%` })
      .getMany();
    const count = testPermits.length;
    if (count > 0) {
      await repo.remove(testPermits);
    }
    return count;
  }

  /**
   * Clean up test decisions
   */
  private async cleanupTestDecisions(): Promise<number> {
    const repo = this.dataSource.getRepository(Decision);
    const testDecisions = await repo
      .createQueryBuilder('decision')
      .where("decision.params->>'isTest' = :isTest", { isTest: 'true' })
      .getMany();
    const count = testDecisions.length;
    if (count > 0) {
      await repo.remove(testDecisions);
    }
    return count;
  }

  /**
   * Clean up test audit logs
   */
  private async cleanupTestAuditLogs(): Promise<number> {
    const repo = this.dataSource.getRepository(AuditLog);
    // Clean audit logs that reference test entities
    const testAuditLogs = await repo
      .createQueryBuilder('audit')
      .where("audit.details->>'isTest' = :isTest", { isTest: 'true' })
      .orWhere("audit.entityId LIKE :prefix", { prefix: `${this.testPrefix}%` })
      .getMany();
    const count = testAuditLogs.length;
    if (count > 0) {
      await repo.remove(testAuditLogs);
    }
    return count;
  }

  /**
   * Clean up test sites
   */
  private async cleanupTestSites(): Promise<number> {
    const repo = this.dataSource.getRepository(Site);
    const testSites = await repo
      .createQueryBuilder('site')
      .where('site.id LIKE :prefix', { prefix: `${this.testPrefix}%` })
      .getMany();
    const count = testSites.length;
    if (count > 0) {
      await repo.remove(testSites);
    }
    return count;
  }

  /**
   * Count test data without removing it
   */
  async countTestData(): Promise<{
    movements: number;
    sessions: number;
    payments: number;
    permits: number;
    decisions: number;
    sites: number;
  }> {
    const movementRepo = this.dataSource.getRepository(Movement);
    const sessionRepo = this.dataSource.getRepository(Session);
    const paymentRepo = this.dataSource.getRepository(Payment);
    const permitRepo = this.dataSource.getRepository(Permit);
    const decisionRepo = this.dataSource.getRepository(Decision);
    const siteRepo = this.dataSource.getRepository(Site);

    const [movements, sessions, payments, permits, decisions, sites] = await Promise.all([
      movementRepo
        .createQueryBuilder('movement')
        .where("movement.rawData->>'isTest' = :isTest", { isTest: 'true' })
        .orWhere('movement.vrm LIKE :prefix', { prefix: `${this.testPrefix}%` })
        .getCount(),
      sessionRepo
        .createQueryBuilder('session')
        .where('session.vrm LIKE :prefix', { prefix: `${this.testPrefix}%` })
        .getCount(),
      paymentRepo
        .createQueryBuilder('payment')
        .where("payment.rawData->>'isTest' = :isTest", { isTest: 'true' })
        .orWhere('payment.vrm LIKE :prefix', { prefix: `${this.testPrefix}%` })
        .getCount(),
      permitRepo
        .createQueryBuilder('permit')
        .where('permit.vrm LIKE :prefix', { prefix: `${this.testPrefix}%` })
        .getCount(),
      decisionRepo
        .createQueryBuilder('decision')
        .where("decision.params->>'isTest' = :isTest", { isTest: 'true' })
        .getCount(),
      siteRepo
        .createQueryBuilder('site')
        .where('site.id LIKE :prefix', { prefix: `${this.testPrefix}%` })
        .getCount(),
    ]);

    return { movements, sessions, payments, permits, decisions, sites };
  }
}
