import {
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Movement } from '../domain/entities';

interface VehicleCluster {
  vrm: string;
  firstSeen: Date;
  lastSeen: Date;
  eventCount: number;
  direction: 'ENTRY' | 'EXIT' | 'MIXED' | 'UNKNOWN';
  events: {
    id: string;
    timestamp: Date;
    direction: string;
    cameraIds: string;
    images: any[];
  }[];
}

@Controller('api/live-ops/sites/:siteId/vehicles')
export class VehicleActivityController {
  constructor(
    @InjectRepository(Movement)
    private readonly movementRepo: Repository<Movement>,
  ) {}

  /**
   * Get recent vehicle activity for a site, clustered by VRM
   */
  @Get()
  async getVehicleActivity(
    @Param('siteId') siteId: string,
    @Query('hours') hoursStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const hours = hoursStr ? parseInt(hoursStr, 10) : 4; // Default 4 hours
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    // Get recent movements for this site
    const movements = await this.movementRepo.find({
      where: {
        siteId,
        timestamp: MoreThan(since),
        discarded: false,
      },
      order: { timestamp: 'DESC' },
      take: limit * 3, // Get more to account for clustering
    });

    // Cluster by VRM
    const clusters = new Map<string, VehicleCluster>();
    
    for (const movement of movements) {
      const vrm = movement.vrm.toUpperCase();
      
      if (!clusters.has(vrm)) {
        clusters.set(vrm, {
          vrm,
          firstSeen: movement.timestamp,
          lastSeen: movement.timestamp,
          eventCount: 0,
          direction: movement.direction as any || 'UNKNOWN',
          events: [],
        });
      }
      
      const cluster = clusters.get(vrm)!;
      cluster.eventCount++;
      
      if (movement.timestamp < cluster.firstSeen) {
        cluster.firstSeen = movement.timestamp;
      }
      if (movement.timestamp > cluster.lastSeen) {
        cluster.lastSeen = movement.timestamp;
      }
      
      // Determine mixed direction
      if (cluster.direction !== 'UNKNOWN' && 
          cluster.direction !== 'MIXED' && 
          movement.direction && 
          cluster.direction !== movement.direction) {
        cluster.direction = 'MIXED';
      }
      
      cluster.events.push({
        id: movement.id,
        timestamp: movement.timestamp,
        direction: movement.direction || 'UNKNOWN',
        cameraIds: movement.cameraIds,
        images: movement.images || [],
      });
    }

    // Sort clusters by last seen (most recent first)
    const sortedClusters = Array.from(clusters.values())
      .sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())
      .slice(0, limit);

    // Sort events within each cluster by timestamp (newest first)
    for (const cluster of sortedClusters) {
      cluster.events.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    }

    return {
      siteId,
      since,
      clusterCount: sortedClusters.length,
      totalEvents: movements.length,
      clusters: sortedClusters,
    };
  }

  /**
   * Get activity for a specific vehicle
   */
  @Get(':vrm')
  async getVehicleHistory(
    @Param('siteId') siteId: string,
    @Param('vrm') vrm: string,
    @Query('days') daysStr?: string,
  ) {
    const days = daysStr ? parseInt(daysStr, 10) : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const movements = await this.movementRepo.find({
      where: {
        siteId,
        vrm: vrm.toUpperCase(),
        timestamp: MoreThan(since),
      },
      order: { timestamp: 'DESC' },
    });

    // Group by day
    const byDay = new Map<string, Movement[]>();
    for (const m of movements) {
      const day = m.timestamp.toISOString().split('T')[0];
      if (!byDay.has(day)) {
        byDay.set(day, []);
      }
      byDay.get(day)!.push(m);
    }

    return {
      vrm: vrm.toUpperCase(),
      siteId,
      totalEvents: movements.length,
      days: Array.from(byDay.entries()).map(([date, events]) => ({
        date,
        events: events.map(e => ({
          id: e.id,
          timestamp: e.timestamp,
          direction: e.direction,
          cameraIds: e.cameraIds,
          images: e.images || [],
          discarded: e.discarded,
        })),
      })),
    };
  }
}
