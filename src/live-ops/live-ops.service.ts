import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Site } from '../domain/entities';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as https from 'https';
import {
  LiveOpsConfig,
  AnnounceRequestDto,
  AnnouncementResult,
  CameraSnapshotResult,
} from './live-ops.types';

const execAsync = promisify(exec);

@Injectable()
export class LiveOpsService {
  private readonly logger = new Logger(LiveOpsService.name);
  
  // UniFi Protect configuration
  private readonly nvrHost = '10.10.10.2';
  private readonly nvrUsername = 'localconnectsystems';
  private readonly nvrPassword = 'RBTeeyKM142!';
  private readonly announceScript = '/Users/noc/clawd/scripts/announce.sh';

  constructor(
    @InjectRepository(Site)
    private readonly siteRepo: Repository<Site>,
  ) {}

  /**
   * Get all sites with live ops enabled
   */
  async getLiveOpsSites(): Promise<Site[]> {
    const sites = await this.siteRepo.find();
    return sites.filter((site) => site.config?.liveOps?.enabled === true);
  }

  /**
   * Get a specific site with live ops config
   */
  async getSiteWithLiveOps(siteId: string): Promise<Site> {
    const site = await this.siteRepo.findOne({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException(`Site ${siteId} not found`);
    }
    return site;
  }

  /**
   * Get live ops config for a site
   */
  async getLiveOpsConfig(siteId: string): Promise<LiveOpsConfig | null> {
    const site = await this.getSiteWithLiveOps(siteId);
    return site.config?.liveOps || null;
  }

  /**
   * Trigger an announcement at a site
   */
  async triggerAnnouncement(
    siteId: string,
    dto: AnnounceRequestDto,
  ): Promise<AnnouncementResult> {
    const site = await this.getSiteWithLiveOps(siteId);
    const liveOps = site.config?.liveOps;

    if (!liveOps?.enabled) {
      throw new NotFoundException(`Live ops not enabled for site ${siteId}`);
    }

    const target = dto.target || 'cameras';
    const volume = dto.volume ?? (target === 'horn' ? 30 : 100);

    this.logger.log(
      `Triggering announcement at ${site.name}: "${dto.message}" (${target} @ ${volume}%)`,
    );

    try {
      // Execute the announce script
      const escapedMessage = dto.message.replace(/"/g, '\\"');
      const command = `"${this.announceScript}" "${escapedMessage}" ${target} ${volume}`;
      
      const { stdout, stderr } = await execAsync(command);
      this.logger.debug(`Announce script output: ${stdout}`);
      if (stderr) {
        this.logger.warn(`Announce script stderr: ${stderr}`);
      }

      return {
        success: true,
        message: dto.message,
        target,
        volume,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Failed to trigger announcement: ${error.message}`);
      return {
        success: false,
        message: dto.message,
        target,
        volume,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Get camera snapshot from UniFi Protect
   */
  async getCameraSnapshot(
    siteId: string,
    cameraId: string,
  ): Promise<CameraSnapshotResult> {
    const site = await this.getSiteWithLiveOps(siteId);
    const liveOps = site.config?.liveOps;

    if (!liveOps?.enabled) {
      return { success: false, contentType: '', error: 'Live ops not enabled' };
    }

    const camera = liveOps.cameras?.find(
      (c) => c.id === cameraId || c.protectId === cameraId,
    );

    if (!camera) {
      return { success: false, contentType: '', error: 'Camera not found' };
    }

    try {
      // Get snapshot from UniFi Protect
      const snapshot = await this.fetchProtectSnapshot(camera.protectId);
      return snapshot;
    } catch (error) {
      this.logger.error(`Failed to get snapshot: ${error.message}`);
      return { success: false, contentType: '', error: error.message };
    }
  }

  /**
   * Fetch snapshot from UniFi Protect NVR
   */
  private async fetchProtectSnapshot(
    cameraId: string,
  ): Promise<CameraSnapshotResult> {
    return new Promise((resolve) => {
      // First, we need to authenticate
      const authOptions = {
        hostname: this.nvrHost,
        port: 443,
        path: '/api/auth/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        rejectUnauthorized: false,
      };

      const authReq = https.request(authOptions, (authRes) => {
        let cookies = authRes.headers['set-cookie'] || [];
        const csrfToken = authRes.headers['x-csrf-token'] as string;

        // Now fetch the snapshot
        const snapshotOptions = {
          hostname: this.nvrHost,
          port: 443,
          path: `/proxy/protect/api/cameras/${cameraId}/snapshot?ts=${Date.now()}`,
          method: 'GET',
          headers: {
            Cookie: cookies.map((c) => c.split(';')[0]).join('; '),
            'X-CSRF-Token': csrfToken || '',
          },
          rejectUnauthorized: false,
        };

        const snapshotReq = https.request(snapshotOptions, (snapshotRes) => {
          const chunks: Buffer[] = [];
          snapshotRes.on('data', (chunk) => chunks.push(chunk));
          snapshotRes.on('end', () => {
            const data = Buffer.concat(chunks);
            resolve({
              success: true,
              contentType: snapshotRes.headers['content-type'] || 'image/jpeg',
              data,
            });
          });
        });

        snapshotReq.on('error', (error) => {
          resolve({ success: false, contentType: '', error: error.message });
        });

        snapshotReq.end();
      });

      authReq.on('error', (error) => {
        resolve({ success: false, contentType: '', error: error.message });
      });

      authReq.write(
        JSON.stringify({
          username: this.nvrUsername,
          password: this.nvrPassword,
        }),
      );
      authReq.end();
    });
  }

  /**
   * Update live ops config for a site
   */
  async updateLiveOpsConfig(
    siteId: string,
    liveOps: Partial<LiveOpsConfig>,
  ): Promise<Site> {
    const site = await this.getSiteWithLiveOps(siteId);

    site.config = {
      ...site.config,
      liveOps: {
        ...site.config?.liveOps,
        ...liveOps,
      },
    };

    return this.siteRepo.save(site);
  }

  /**
   * Trigger barrier control (stub for now)
   */
  async triggerBarrierControl(
    siteId: string,
    action: 'open' | 'close',
  ): Promise<{ success: boolean; message: string }> {
    const site = await this.getSiteWithLiveOps(siteId);
    const liveOps = site.config?.liveOps;

    if (!liveOps?.controls?.barrier?.enabled) {
      return { success: false, message: 'Barrier control not enabled for this site' };
    }

    // Stub implementation - would call actual barrier API
    this.logger.log(`Barrier ${action} triggered at ${site.name} (stub)`);

    return {
      success: true,
      message: `Barrier ${action} command sent (stub implementation)`,
    };
  }
}
