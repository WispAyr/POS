import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, In } from 'typeorm';
import { Site, Movement, Decision, Alarm } from '../domain/entities';
import { DecisionOutcome } from '../domain/entities';
import { AlarmStatus } from '../domain/entities/alarm.enums';
import {
  OperationsDashboardResponse,
  OperationsSiteData,
  CameraStatus,
  SiteStats,
} from './operations-dashboard.types';

@Injectable()
export class OperationsDashboardService {
  private readonly logger = new Logger(OperationsDashboardService.name);

  constructor(
    @InjectRepository(Site)
    private readonly siteRepo: Repository<Site>,
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
    @InjectRepository(Decision)
    private readonly decisionRepo: Repository<Decision>,
    @InjectRepository(Alarm)
    private readonly alarmRepo: Repository<Alarm>,
  ) {}

  async getDashboardData(): Promise<OperationsDashboardResponse> {
    const sites = await this.siteRepo.find({ where: { active: true } });
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Gather data for all sites in parallel
    const siteDataPromises = sites.map((site) =>
      this.getSiteData(site, todayStart),
    );
    const sitesData = await Promise.all(siteDataPromises);

    // Get summary data
    const [activeAlarms, reviewQueueCount] = await Promise.all([
      this.alarmRepo.count({
        where: {
          status: In([AlarmStatus.TRIGGERED, AlarmStatus.ACKNOWLEDGED]),
        },
      }),
      this.decisionRepo.count({
        where: {
          outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE,
          status: 'NEW',
        },
      }),
    ]);

    // Determine overall system status
    const systemStatus = this.calculateSystemStatus(sitesData, activeAlarms);

    return {
      sites: sitesData,
      summary: {
        totalActiveAlarms: activeAlarms,
        reviewQueueCount,
        systemStatus,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private async getSiteData(
    site: Site,
    todayStart: Date,
  ): Promise<OperationsSiteData> {
    const cameras = site.config?.cameras || [];

    // Get camera statuses with last detections
    const cameraStatuses = await Promise.all(
      cameras.map((cam) => this.getCameraStatus(site.id, cam)),
    );

    // Get today's stats
    const stats = await this.getSiteStats(site.id, todayStart);

    // Calculate site health
    const health = this.calculateSiteHealth(cameraStatuses, stats);

    return {
      siteId: site.id,
      siteName: site.name,
      cameras: cameraStatuses,
      stats,
      health,
    };
  }

  private async getCameraStatus(
    siteId: string,
    camera: { id: string; direction?: string; name?: string },
  ): Promise<CameraStatus> {
    // Get the most recent movement from this camera
    const lastMovement = await this.movementRepo.findOne({
      where: {
        siteId,
        cameraIds: camera.id,
      },
      order: { timestamp: 'DESC' },
    });

    // Calculate camera status based on last detection
    let status: 'online' | 'offline' | 'warning' = 'online';
    if (!lastMovement) {
      status = 'offline';
    } else {
      const hoursSinceDetection =
        (Date.now() - new Date(lastMovement.timestamp).getTime()) /
        (1000 * 60 * 60);
      if (hoursSinceDetection > 24) {
        status = 'offline';
      } else if (hoursSinceDetection > 6) {
        status = 'warning';
      }
    }

    return {
      cameraId: camera.id,
      name: camera.name || camera.id,
      direction: (camera.direction as 'ENTRY' | 'EXIT' | 'INTERNAL') || null,
      lastDetection: {
        timestamp: lastMovement?.timestamp?.toISOString() || null,
        vrm: lastMovement?.vrm || null,
        imageUrl: lastMovement?.images?.[0]?.url || null,
      },
      status,
    };
  }

  private async getSiteStats(
    siteId: string,
    todayStart: Date,
  ): Promise<SiteStats> {
    // Get today's movements
    const todayMovements = await this.movementRepo.find({
      where: {
        siteId,
        timestamp: MoreThanOrEqual(todayStart),
      },
      select: ['direction', 'timestamp'],
    });

    const entries = todayMovements.filter(
      (m) => m.direction === 'ENTRY',
    ).length;
    const exits = todayMovements.filter((m) => m.direction === 'EXIT').length;

    // Get today's violations (enforcement candidates)
    const violations = await this.decisionRepo.count({
      where: {
        outcome: DecisionOutcome.ENFORCEMENT_CANDIDATE,
        createdAt: MoreThanOrEqual(todayStart),
      },
    });

    // Calculate hourly activity
    const hourlyActivity: { hour: number; count: number }[] = [];
    const currentHour = new Date().getHours();

    for (let hour = 0; hour <= currentHour; hour++) {
      const count = todayMovements.filter((m) => {
        const movementHour = new Date(m.timestamp).getHours();
        return movementHour === hour;
      }).length;
      hourlyActivity.push({ hour, count });
    }

    return {
      today: { entries, exits, violations },
      hourlyActivity,
    };
  }

  private calculateSiteHealth(
    cameras: CameraStatus[],
    stats: SiteStats,
  ): { status: 'healthy' | 'warning' | 'critical'; lastSync: string | null } {
    const offlineCameras = cameras.filter((c) => c.status === 'offline').length;
    const warningCameras = cameras.filter((c) => c.status === 'warning').length;
    const totalCameras = cameras.length;

    // Find the most recent detection across all cameras
    const lastDetections = cameras
      .map((c) => c.lastDetection.timestamp)
      .filter((t): t is string => t !== null)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    const lastSync = lastDetections[0] || null;

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    if (totalCameras > 0) {
      if (offlineCameras === totalCameras) {
        status = 'critical';
      } else if (offlineCameras > 0 || warningCameras > totalCameras / 2) {
        status = 'warning';
      }
    }

    return { status, lastSync };
  }

  private calculateSystemStatus(
    sites: OperationsSiteData[],
    activeAlarms: number,
  ): 'healthy' | 'warning' | 'critical' {
    const criticalSites = sites.filter(
      (s) => s.health.status === 'critical',
    ).length;
    const warningSites = sites.filter(
      (s) => s.health.status === 'warning',
    ).length;

    if (criticalSites > 0 || activeAlarms > 5) {
      return 'critical';
    }
    if (warningSites > 0 || activeAlarms > 0) {
      return 'warning';
    }
    return 'healthy';
  }
}
