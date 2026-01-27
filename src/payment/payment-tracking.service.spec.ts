import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentTrackingService } from './payment-tracking.service';
import { Payment } from '../domain/entities/payment.entity';
import { Site } from '../domain/entities/site.entity';
import { AuditService } from '../audit/audit.service';

describe('PaymentTrackingService', () => {
    let service: PaymentTrackingService;
    let paymentRepo: jest.Mocked<Repository<Payment>>;
    let siteRepo: jest.Mocked<Repository<Site>>;
    let auditService: jest.Mocked<AuditService>;

    const mockPaymentRepo = {
        find: jest.fn(),
        findOne: jest.fn(),
    };

    const mockSiteRepo = {
        findOne: jest.fn(),
    };

    const mockAuditService = {
        log: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PaymentTrackingService,
                {
                    provide: getRepositoryToken(Payment),
                    useValue: mockPaymentRepo,
                },
                {
                    provide: getRepositoryToken(Site),
                    useValue: mockSiteRepo,
                },
                {
                    provide: AuditService,
                    useValue: mockAuditService,
                },
            ],
        }).compile();

        service = module.get<PaymentTrackingService>(PaymentTrackingService);
        paymentRepo = module.get(getRepositoryToken(Payment));
        siteRepo = module.get(getRepositoryToken(Site));
        auditService = module.get(AuditService);

        // Reset mocks
        jest.clearAllMocks();
    });

    describe('validatePaymentForAccess', () => {
        it('should return valid=true when active payment exists', async () => {
            const vrm = 'ABC123';
            const siteId = 'site-1';
            const now = new Date('2026-01-27T12:00:00Z');
            const payment: Payment = {
                id: 'payment-1',
                siteId,
                vrm,
                amount: 5.0,
                startTime: new Date('2026-01-27T10:00:00Z'),
                expiryTime: new Date('2026-01-27T14:00:00Z'),
                source: 'KIOSK',
                externalReference: 'TXN-123',
                rawData: {},
                ingestedAt: new Date(),
            } as Payment;

            mockPaymentRepo.find.mockResolvedValue([payment]);
            mockAuditService.log.mockResolvedValue({} as any);

            const result = await service.validatePaymentForAccess(vrm, siteId, now);

            expect(result.valid).toBe(true);
            expect(result.payment).toEqual(payment);
            expect(result.expiresAt).toEqual(payment.expiryTime);
            expect(result.remainingMinutes).toBe(120); // 2 hours remaining
            expect(mockAuditService.log).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'ACCESS_GRANTED',
                    entityType: 'PAYMENT',
                    vrm,
                    siteId,
                })
            );
        });

        it('should return valid=false when no active payment exists', async () => {
            const vrm = 'ABC123';
            const siteId = 'site-1';
            const now = new Date('2026-01-27T12:00:00Z');

            mockPaymentRepo.find.mockResolvedValue([]);
            mockAuditService.log.mockResolvedValue({} as any);

            const result = await service.validatePaymentForAccess(vrm, siteId, now);

            expect(result.valid).toBe(false);
            expect(result.reason).toBe('No active payment found for this vehicle');
            expect(result.payment).toBeUndefined();
            expect(mockAuditService.log).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'ACCESS_DENIED_NO_PAYMENT',
                    entityType: 'PAYMENT',
                    vrm,
                    siteId,
                })
            );
        });

        it('should normalize VRM (uppercase, remove spaces)', async () => {
            const vrm = 'abc 123';
            const siteId = 'site-1';
            const now = new Date('2026-01-27T12:00:00Z');
            const payment: Payment = {
                id: 'payment-1',
                siteId,
                vrm: 'ABC123',
                amount: 5.0,
                startTime: new Date('2026-01-27T10:00:00Z'),
                expiryTime: new Date('2026-01-27T14:00:00Z'),
                source: 'KIOSK',
                rawData: {},
                ingestedAt: new Date(),
            } as Payment;

            mockPaymentRepo.find.mockResolvedValue([payment]);
            mockAuditService.log.mockResolvedValue({} as any);

            const result = await service.validatePaymentForAccess(vrm, siteId, now);

            expect(result.valid).toBe(true);
            expect(mockPaymentRepo.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        vrm: 'ABC123',
                    }),
                })
            );
        });

        it('should return payment with longest expiry when multiple active payments exist', async () => {
            const vrm = 'ABC123';
            const siteId = 'site-1';
            const now = new Date('2026-01-27T12:00:00Z');
            const payment1: Payment = {
                id: 'payment-1',
                siteId,
                vrm,
                amount: 5.0,
                startTime: new Date('2026-01-27T10:00:00Z'),
                expiryTime: new Date('2026-01-27T13:00:00Z'), // Expires in 1 hour
                source: 'KIOSK',
                rawData: {},
                ingestedAt: new Date(),
            } as Payment;
            const payment2: Payment = {
                id: 'payment-2',
                siteId,
                vrm,
                amount: 10.0,
                startTime: new Date('2026-01-27T11:00:00Z'),
                expiryTime: new Date('2026-01-27T15:00:00Z'), // Expires in 3 hours (longer)
                source: 'APP',
                rawData: {},
                ingestedAt: new Date(),
            } as Payment;

            mockPaymentRepo.find.mockResolvedValue([payment2, payment1]); // Sorted by expiry DESC
            mockAuditService.log.mockResolvedValue({} as any);

            const result = await service.validatePaymentForAccess(vrm, siteId, now);

            expect(result.valid).toBe(true);
            expect(result.payment).toEqual(payment2); // Should return the one with longest expiry
            expect(result.remainingMinutes).toBe(180); // 3 hours
        });

        it('should handle future timestamp validation', async () => {
            const vrm = 'ABC123';
            const siteId = 'site-1';
            const now = new Date('2026-01-27T12:00:00Z');
            const futureTime = new Date('2026-01-27T13:00:00Z');
            const payment: Payment = {
                id: 'payment-1',
                siteId,
                vrm,
                amount: 5.0,
                startTime: new Date('2026-01-27T10:00:00Z'),
                expiryTime: new Date('2026-01-27T14:00:00Z'),
                source: 'KIOSK',
                rawData: {},
                ingestedAt: new Date(),
            } as Payment;

            mockPaymentRepo.find.mockResolvedValue([payment]);
            mockAuditService.log.mockResolvedValue({} as any);

            const result = await service.validatePaymentForTime(vrm, siteId, futureTime);

            expect(result.valid).toBe(true);
            expect(mockPaymentRepo.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        expiryTime: expect.anything(),
                    }),
                })
            );
        });
    });

    describe('getPaymentStatus', () => {
        it('should return payment status with active payments', async () => {
            const vrm = 'ABC123';
            const siteId = 'site-1';
            // Use a fixed time that's between the active payment times
            const now = new Date('2026-01-27T12:00:00Z');
            const activePayment: Payment = {
                id: 'payment-1',
                siteId,
                vrm,
                amount: 5.0,
                startTime: new Date('2026-01-27T10:00:00Z'),
                expiryTime: new Date('2026-01-27T14:00:00Z'),
                source: 'KIOSK',
                rawData: {},
                ingestedAt: new Date(),
            } as Payment;
            const expiredPayment: Payment = {
                id: 'payment-2',
                siteId,
                vrm,
                amount: 3.0,
                startTime: new Date('2026-01-27T08:00:00Z'),
                expiryTime: new Date('2026-01-27T10:00:00Z'),
                source: 'APP',
                rawData: {},
                ingestedAt: new Date(),
            } as Payment;

            // Mock Date.now to return our fixed time
            const originalDateNow = Date.now;
            Date.now = jest.fn(() => now.getTime());

            mockPaymentRepo.find.mockResolvedValue([activePayment, expiredPayment]);

            const result = await service.getPaymentStatus(vrm, siteId);

            expect(result.vrm).toBe('ABC123');
            expect(result.siteId).toBe(siteId);
            expect(result.hasActivePayment).toBe(true);
            expect(result.activePayments).toHaveLength(1);
            expect(result.activePayments[0]).toEqual(activePayment);
            expect(result.totalPayments).toBe(2);
            expect(result.nextExpiry).toEqual(activePayment.expiryTime);

            // Restore Date.now
            Date.now = originalDateNow;
        });

        it('should return hasActivePayment=false when no active payments', async () => {
            const vrm = 'ABC123';
            const siteId = 'site-1';
            const expiredPayment: Payment = {
                id: 'payment-1',
                siteId,
                vrm,
                amount: 5.0,
                startTime: new Date('2026-01-27T08:00:00Z'),
                expiryTime: new Date('2026-01-27T10:00:00Z'),
                source: 'KIOSK',
                rawData: {},
                ingestedAt: new Date(),
            } as Payment;

            mockPaymentRepo.find.mockResolvedValue([expiredPayment]);

            const result = await service.getPaymentStatus(vrm, siteId);

            expect(result.hasActivePayment).toBe(false);
            expect(result.activePayments).toHaveLength(0);
            expect(result.totalPayments).toBe(1);
        });
    });

    describe('getActivePaymentsForSite', () => {
        it('should return all active payments for a site', async () => {
            const siteId = 'site-1';
            const now = new Date('2026-01-27T12:00:00Z');
            const activePayments: Payment[] = [
                {
                    id: 'payment-1',
                    siteId,
                    vrm: 'ABC123',
                    amount: 5.0,
                    startTime: new Date('2026-01-27T10:00:00Z'),
                    expiryTime: new Date('2026-01-27T14:00:00Z'),
                    source: 'KIOSK',
                    rawData: {},
                    ingestedAt: new Date(),
                } as Payment,
                {
                    id: 'payment-2',
                    siteId,
                    vrm: 'DEF456',
                    amount: 3.0,
                    startTime: new Date('2026-01-27T11:00:00Z'),
                    expiryTime: new Date('2026-01-27T13:00:00Z'),
                    source: 'APP',
                    rawData: {},
                    ingestedAt: new Date(),
                } as Payment,
            ];

            mockPaymentRepo.find.mockResolvedValue(activePayments);

            const result = await service.getActivePaymentsForSite(siteId);

            expect(result).toEqual(activePayments);
            expect(mockPaymentRepo.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        siteId,
                    }),
                })
            );
        });
    });

    describe('getPaymentStatistics', () => {
        it('should calculate payment statistics correctly', async () => {
            const siteId = 'site-1';
            const now = new Date('2026-01-27T12:00:00Z');
            const startDate = new Date('2026-01-27T00:00:00Z');
            const endDate = new Date('2026-01-27T23:59:59Z');

            const payments: Payment[] = [
                {
                    id: 'payment-1',
                    siteId,
                    vrm: 'ABC123',
                    amount: 5.0,
                    startTime: new Date('2026-01-27T10:00:00Z'),
                    expiryTime: new Date('2026-01-27T14:00:00Z'),
                    source: 'KIOSK',
                    rawData: {},
                    ingestedAt: new Date('2026-01-27T10:00:01Z'),
                } as Payment,
                {
                    id: 'payment-2',
                    siteId,
                    vrm: 'DEF456',
                    amount: 3.0,
                    startTime: new Date('2026-01-27T08:00:00Z'),
                    expiryTime: new Date('2026-01-27T10:00:00Z'), // Expired
                    source: 'APP',
                    rawData: {},
                    ingestedAt: new Date('2026-01-27T08:00:01Z'),
                } as Payment,
                {
                    id: 'payment-3',
                    siteId,
                    vrm: 'GHI789',
                    amount: 7.0,
                    startTime: new Date('2026-01-27T11:00:00Z'),
                    expiryTime: new Date('2026-01-27T15:00:00Z'),
                    source: 'KIOSK',
                    rawData: {},
                    ingestedAt: new Date('2026-01-27T11:00:01Z'),
                } as Payment,
            ];

            // Mock Date.now to return our fixed time
            const originalDateNow = Date.now;
            Date.now = jest.fn(() => now.getTime());

            mockPaymentRepo.find.mockResolvedValue(payments);

            const result = await service.getPaymentStatistics(siteId, startDate, endDate);

            expect(result.totalPayments).toBe(3);
            expect(result.activePayments).toBe(2); // payment-1 and payment-3
            expect(result.expiredPayments).toBe(1); // payment-2
            expect(result.totalRevenue).toBe(15.0); // 5 + 3 + 7
            expect(result.averageAmount).toBe(5.0); // 15 / 3

            // Restore Date.now
            Date.now = originalDateNow;
        });

        it('should handle empty payments list', async () => {
            const siteId = 'site-1';
            const startDate = new Date('2026-01-27T00:00:00Z');
            const endDate = new Date('2026-01-27T23:59:59Z');

            mockPaymentRepo.find.mockResolvedValue([]);

            const result = await service.getPaymentStatistics(siteId, startDate, endDate);

            expect(result.totalPayments).toBe(0);
            expect(result.activePayments).toBe(0);
            expect(result.expiredPayments).toBe(0);
            expect(result.totalRevenue).toBe(0);
            expect(result.averageAmount).toBe(0);
        });
    });

    describe('getPaymentsExpiringSoon', () => {
        it('should return payments expiring within specified minutes', async () => {
            const siteId = 'site-1';
            const now = new Date('2026-01-27T12:00:00Z');
            const minutes = 30;

            const expiringPayment: Payment = {
                id: 'payment-1',
                siteId,
                vrm: 'ABC123',
                amount: 5.0,
                startTime: new Date('2026-01-27T10:00:00Z'),
                expiryTime: new Date('2026-01-27T12:15:00Z'), // Expires in 15 minutes
                source: 'KIOSK',
                rawData: {},
                ingestedAt: new Date(),
            } as Payment;

            mockPaymentRepo.find.mockResolvedValue([expiringPayment]);

            const result = await service.getPaymentsExpiringSoon(siteId, minutes);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual(expiringPayment);
            expect(mockPaymentRepo.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        siteId,
                    }),
                })
            );
        });
    });

    describe('isPaymentMachineEnabled', () => {
        it('should return true when payment machine is enabled in site config', async () => {
            const siteId = 'site-1';
            const site: Site = {
                id: siteId,
                name: 'Test Site',
                config: {
                    paymentMachine: {
                        enabled: true,
                    },
                },
                active: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            } as Site;

            mockSiteRepo.findOne.mockResolvedValue(site);

            const result = await service.isPaymentMachineEnabled(siteId);

            expect(result).toBe(true);
        });

        it('should return false when payment machine is not enabled', async () => {
            const siteId = 'site-1';
            const site: Site = {
                id: siteId,
                name: 'Test Site',
                config: {},
                active: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            } as Site;

            mockSiteRepo.findOne.mockResolvedValue(site);

            const result = await service.isPaymentMachineEnabled(siteId);

            expect(result).toBe(false);
        });

        it('should return false when site not found', async () => {
            const siteId = 'site-1';

            mockSiteRepo.findOne.mockResolvedValue(null);

            const result = await service.isPaymentMachineEnabled(siteId);

            expect(result).toBe(false);
        });
    });
});
