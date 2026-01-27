import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { Payment } from '../domain/entities/payment.entity';
import { Site } from '../domain/entities/site.entity';
import { AuditService } from '../audit/audit.service';

export interface PaymentValidationResult {
  valid: boolean;
  payment?: Payment;
  reason?: string;
  expiresAt?: Date;
  remainingMinutes?: number;
}

export interface PaymentStatus {
  vrm: string;
  siteId: string;
  hasActivePayment: boolean;
  activePayments: Payment[];
  nextExpiry?: Date;
  totalPayments: number;
}

/**
 * Real-time payment tracking service for barrier control and access management
 */
@Injectable()
export class PaymentTrackingService {
  private readonly logger = new Logger(PaymentTrackingService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Site)
    private readonly siteRepo: Repository<Site>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Real-time payment validation for barrier control
   * Returns true if vehicle has valid payment at the current time
   */
  async validatePaymentForAccess(
    vrm: string,
    siteId: string,
    timestamp?: Date,
  ): Promise<PaymentValidationResult> {
    const normalizedVrm = vrm.toUpperCase().replace(/\s/g, '');
    const checkTime = timestamp || new Date();

    // Find active payments for this VRM at this site
    const activePayments = await this.paymentRepo.find({
      where: {
        vrm: normalizedVrm,
        siteId,
        startTime: LessThanOrEqual(checkTime),
        expiryTime: MoreThanOrEqual(checkTime),
      },
      order: { expiryTime: 'DESC' },
    });

    if (activePayments.length === 0) {
      // Audit log access denial
      await this.auditService.log({
        entityType: 'PAYMENT',
        entityId: 'access-check',
        action: 'ACCESS_DENIED_NO_PAYMENT',
        actor: 'BARRIER_SYSTEM',
        actorType: 'SYSTEM',
        details: {
          vrm: normalizedVrm,
          siteId,
          checkTime,
          reason: 'No active payment found',
        },
        siteId,
        vrm: normalizedVrm,
      });

      return {
        valid: false,
        reason: 'No active payment found for this vehicle',
      };
    }

    // Get the payment with the longest remaining time
    const bestPayment = activePayments[0];
    const remainingMs = bestPayment.expiryTime.getTime() - checkTime.getTime();
    const remainingMinutes = Math.floor(remainingMs / 60000);

    // Audit log access granted
    await this.auditService.log({
      entityType: 'PAYMENT',
      entityId: bestPayment.id,
      action: 'ACCESS_GRANTED',
      actor: 'BARRIER_SYSTEM',
      actorType: 'SYSTEM',
      details: {
        vrm: normalizedVrm,
        siteId,
        checkTime,
        paymentId: bestPayment.id,
        remainingMinutes,
        expiryTime: bestPayment.expiryTime,
      },
      relatedEntities: [
        {
          entityType: 'PAYMENT',
          entityId: bestPayment.id,
          relationship: 'VALIDATES',
        },
      ],
      siteId,
      vrm: normalizedVrm,
    });

    return {
      valid: true,
      payment: bestPayment,
      expiresAt: bestPayment.expiryTime,
      remainingMinutes,
    };
  }

  /**
   * Get payment status for a vehicle at a site
   */
  async getPaymentStatus(vrm: string, siteId: string): Promise<PaymentStatus> {
    const normalizedVrm = vrm.toUpperCase().replace(/\s/g, '');
    const now = new Date();

    // Get all payments for this VRM at this site
    const allPayments = await this.paymentRepo.find({
      where: {
        vrm: normalizedVrm,
        siteId,
      },
      order: { expiryTime: 'DESC' },
    });

    if (!allPayments || allPayments.length === 0) {
      return {
        vrm: normalizedVrm,
        siteId,
        hasActivePayment: false,
        activePayments: [],
        totalPayments: 0,
      };
    }

    // Filter active payments
    const activePayments = allPayments.filter(
      (p) => p.startTime <= now && p.expiryTime >= now,
    );

    // Get next expiry time
    const futurePayments = allPayments.filter((p) => p.expiryTime > now);
    const nextExpiry =
      futurePayments.length > 0
        ? futurePayments.sort(
            (a, b) => a.expiryTime.getTime() - b.expiryTime.getTime(),
          )[0].expiryTime
        : undefined;

    return {
      vrm: normalizedVrm,
      siteId,
      hasActivePayment: activePayments.length > 0,
      activePayments,
      nextExpiry,
      totalPayments: allPayments.length,
    };
  }

  /**
   * Check if payment will be valid at a future time
   */
  async validatePaymentForTime(
    vrm: string,
    siteId: string,
    checkTime: Date,
  ): Promise<PaymentValidationResult> {
    return this.validatePaymentForAccess(vrm, siteId, checkTime);
  }

  /**
   * Get all active payments for a site (for monitoring)
   */
  async getActivePaymentsForSite(siteId: string): Promise<Payment[]> {
    const now = new Date();
    return this.paymentRepo.find({
      where: {
        siteId,
        startTime: LessThanOrEqual(now),
        expiryTime: MoreThanOrEqual(now),
      },
      order: { expiryTime: 'ASC' },
    });
  }

  /**
   * Get payment statistics for a site
   */
  async getPaymentStatistics(
    siteId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalPayments: number;
    activePayments: number;
    expiredPayments: number;
    totalRevenue: number;
    averageAmount: number;
  }> {
    const now = new Date();
    const start = startDate || new Date(now.getTime() - 24 * 60 * 60 * 1000); // Default: last 24 hours
    const end = endDate || now;

    const allPayments = await this.paymentRepo.find({
      where: {
        siteId,
        ingestedAt: Between(start, end),
      },
    });

    const activePayments = allPayments.filter(
      (p) => p.startTime <= now && p.expiryTime >= now,
    );

    const expiredPayments = allPayments.filter((p) => p.expiryTime < now);

    const totalRevenue = allPayments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );
    const averageAmount =
      allPayments.length > 0 ? totalRevenue / allPayments.length : 0;

    return {
      totalPayments: allPayments.length,
      activePayments: activePayments.length,
      expiredPayments: expiredPayments.length,
      totalRevenue,
      averageAmount,
    };
  }

  /**
   * Find payments expiring soon (for notifications/alerts)
   */
  async getPaymentsExpiringSoon(
    siteId: string,
    minutes: number = 30,
  ): Promise<Payment[]> {
    const now = new Date();
    const expiryThreshold = new Date(now.getTime() + minutes * 60 * 1000);

    return this.paymentRepo.find({
      where: {
        siteId,
        startTime: LessThanOrEqual(now),
        expiryTime: Between(now, expiryThreshold),
      },
      order: { expiryTime: 'ASC' },
    });
  }

  /**
   * Check if site has payment machine integration enabled
   */
  async isPaymentMachineEnabled(siteId: string): Promise<boolean> {
    const site = await this.siteRepo.findOne({ where: { id: siteId } });
    if (!site) return false;

    // Check site config for payment machine integration
    return site.config?.paymentMachine?.enabled === true;
  }
}
