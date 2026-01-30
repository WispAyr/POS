import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import {
  Payment,
  Permit,
  Session,
  Movement,
  VehicleNote,
  VehicleMarker,
} from '../domain/entities';

export interface VrmSearchResult {
  vrm: string;
  normalizedVrm: string;
  summary: {
    hasActivePayment: boolean;
    hasActivePermit: boolean;
    hasOpenSession: boolean;
    totalPayments: number;
    totalPermits: number;
    totalSessions: number;
    totalMovements: number;
    notesCount: number;
    markersCount: number;
  };
  activePayments: {
    id: string;
    siteId: string;
    amount: number;
    startTime: Date;
    expiryTime: Date;
    source: string;
  }[];
  activePermits: {
    id: string;
    siteId: string | null;
    type: string;
    startDate: Date;
    endDate: Date | null;
  }[];
  recentSessions: {
    id: string;
    siteId: string;
    startTime: Date;
    endTime: Date | null;
    durationMinutes: number | null;
    status: string;
  }[];
  notes: {
    id: string;
    note: string;
    createdBy: string;
    createdAt: Date;
  }[];
  markers: {
    id: string;
    markerType: string;
    description: string | null;
    createdAt: Date;
  }[];
  recentMovements: {
    id: string;
    siteId: string;
    cameraIds: string;
    direction: string | null;
    timestamp: Date;
  }[];
}

@Injectable()
export class VrmSearchService {
  private readonly logger = new Logger(VrmSearchService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Permit)
    private readonly permitRepo: Repository<Permit>,
    @InjectRepository(Session)
    private readonly sessionRepo: Repository<Session>,
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
    @InjectRepository(VehicleNote)
    private readonly noteRepo: Repository<VehicleNote>,
    @InjectRepository(VehicleMarker)
    private readonly markerRepo: Repository<VehicleMarker>,
  ) {}

  private normalizeVrm(vrm: string): string {
    return vrm.toUpperCase().replace(/\s+/g, '');
  }

  async search(vrm: string): Promise<VrmSearchResult> {
    const normalizedVrm = this.normalizeVrm(vrm);
    const now = new Date();

    this.logger.log(`VRM search for: ${normalizedVrm}`);

    // Fetch all data in parallel
    const [
      payments,
      permits,
      sessions,
      movements,
      notes,
      markers,
    ] = await Promise.all([
      this.paymentRepo.find({
        where: { vrm: normalizedVrm },
        order: { expiryTime: 'DESC' },
        take: 50,
      }),
      this.permitRepo.find({
        where: { vrm: normalizedVrm },
        order: { createdAt: 'DESC' },
      }),
      this.sessionRepo.find({
        where: { vrm: normalizedVrm },
        order: { startTime: 'DESC' },
        take: 20,
      }),
      this.movementRepo.find({
        where: { vrm: normalizedVrm },
        order: { timestamp: 'DESC' },
        take: 30,
      }),
      this.noteRepo.find({
        where: { vrm: normalizedVrm },
        order: { createdAt: 'DESC' },
      }),
      this.markerRepo.find({
        where: { vrm: normalizedVrm },
        order: { createdAt: 'DESC' },
      }),
    ]);

    // Filter active items
    const activePayments = payments.filter((p) => p.expiryTime > now);
    const activePermits = permits.filter(
      (p) => p.active && (!p.endDate || p.endDate > now) && p.startDate <= now,
    );
    const openSessions = sessions.filter((s) => !s.endTime);

    return {
      vrm,
      normalizedVrm,
      summary: {
        hasActivePayment: activePayments.length > 0,
        hasActivePermit: activePermits.length > 0,
        hasOpenSession: openSessions.length > 0,
        totalPayments: payments.length,
        totalPermits: permits.length,
        totalSessions: sessions.length,
        totalMovements: movements.length,
        notesCount: notes.length,
        markersCount: markers.length,
      },
      activePayments: activePayments.map((p) => ({
        id: p.id,
        siteId: p.siteId,
        amount: Number(p.amount),
        startTime: p.startTime,
        expiryTime: p.expiryTime,
        source: p.source,
      })),
      activePermits: activePermits.map((p) => ({
        id: p.id,
        siteId: p.siteId,
        type: p.type,
        startDate: p.startDate,
        endDate: p.endDate,
      })),
      recentSessions: sessions.slice(0, 10).map((s) => ({
        id: s.id,
        siteId: s.siteId,
        startTime: s.startTime,
        endTime: s.endTime,
        durationMinutes: s.durationMinutes,
        status: s.status,
      })),
      notes: notes.map((n) => ({
        id: n.id,
        note: n.note,
        createdBy: n.createdBy,
        createdAt: n.createdAt,
      })),
      markers: markers.map((m) => ({
        id: m.id,
        markerType: m.markerType,
        description: m.description,
        createdAt: m.createdAt,
      })),
      recentMovements: movements.slice(0, 10).map((m) => ({
        id: m.id,
        siteId: m.siteId,
        cameraIds: m.cameraIds,
        direction: m.direction,
        timestamp: m.timestamp,
      })),
    };
  }

  async quickCheck(vrm: string): Promise<{
    vrm: string;
    hasActivePayment: boolean;
    hasActivePermit: boolean;
    hasOpenSession: boolean;
    hasMarkers: boolean;
  }> {
    const normalizedVrm = this.normalizeVrm(vrm);
    const now = new Date();

    const [paymentCount, permitCount, sessionCount, markerCount] =
      await Promise.all([
        this.paymentRepo.count({
          where: { vrm: normalizedVrm, expiryTime: MoreThan(now) },
        }),
        this.permitRepo
          .createQueryBuilder('p')
          .where('p.vrm = :vrm', { vrm: normalizedVrm })
          .andWhere('p.active = true')
          .andWhere('p.startDate <= :now', { now })
          .andWhere('(p.endDate IS NULL OR p.endDate > :now)', { now })
          .getCount(),
        this.sessionRepo
          .createQueryBuilder('s')
          .where('s.vrm = :vrm', { vrm: normalizedVrm })
          .andWhere('s.endTime IS NULL')
          .getCount(),
        this.markerRepo.count({ where: { vrm: normalizedVrm } }),
      ]);

    return {
      vrm: normalizedVrm,
      hasActivePayment: paymentCount > 0,
      hasActivePermit: permitCount > 0,
      hasOpenSession: sessionCount > 0,
      hasMarkers: markerCount > 0,
    };
  }
}
