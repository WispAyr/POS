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
   * Fetch snapshot from go2rtc (preferred - no auth needed, uses RTSP)
   * Falls back to UniFi Protect API if go2rtc stream not available
   */
  private async fetchProtectSnapshot(
    cameraId: string,
  ): Promise<CameraSnapshotResult> {
    const fs = await import('fs');
    
    // Try go2rtc first (no auth, much faster)
    const streamName = this.cameraStreamNames[cameraId];
    if (streamName) {
      try {
        const snapshotFile = `/tmp/snapshot-${cameraId}-${Date.now()}.jpg`;
        const go2rtcCmd = `curl -s "http://${this.go2rtcHost}/api/frame.jpeg?src=${streamName}" -o ${snapshotFile} --max-time 5`;
        
        await execAsync(go2rtcCmd);
        
        const stats = fs.statSync(snapshotFile);
        if (stats.size > 1000) {  // Valid image should be > 1KB
          const data = fs.readFileSync(snapshotFile);
          try { fs.unlinkSync(snapshotFile); } catch {}
          return {
            success: true,
            contentType: 'image/jpeg',
            data,
          };
        }
        try { fs.unlinkSync(snapshotFile); } catch {}
      } catch (error) {
        this.logger.warn(`go2rtc snapshot failed for ${streamName}, falling back to Protect API`);
      }
    }
    
    // Fallback to Protect API (with rate limit risk)
    try {
      const cookieFile = '/tmp/protect-cookies.txt';
      const snapshotFile = `/tmp/snapshot-${cameraId}-${Date.now()}.jpg`;

      // Authenticate
      const authCmd = `curl -sk -X POST "https://${this.nvrHost}/api/auth/login" ` +
        `-H "Content-Type: application/json" ` +
        `-d '{"username":"${this.nvrUsername}","password":"${this.nvrPassword}"}' ` +
        `-c ${cookieFile} -D /tmp/protect-headers.txt`;
      
      await execAsync(authCmd);

      // Extract CSRF token
      const headers = fs.readFileSync('/tmp/protect-headers.txt', 'utf8');
      const csrfMatch = headers.match(/x-csrf-token:\s*([^\r\n]+)/i);
      const csrf = csrfMatch ? csrfMatch[1].trim() : '';

      // Fetch snapshot
      const snapshotCmd = `curl -sk "https://${this.nvrHost}/proxy/protect/api/cameras/${cameraId}/snapshot?ts=${Date.now()}" ` +
        `-H "X-CSRF-Token: ${csrf}" ` +
        `-b ${cookieFile} ` +
        `-o ${snapshotFile}`;
      
      await execAsync(snapshotCmd);

      const data = fs.readFileSync(snapshotFile);
      try { fs.unlinkSync(snapshotFile); } catch {}

      return {
        success: true,
        contentType: 'image/jpeg',
        data,
      };
    } catch (error) {
      this.logger.error(`Snapshot fetch failed: ${error.message}`);
      return { success: false, contentType: '', error: error.message };
    }
  }

  // go2rtc configuration - provides WebRTC/HLS/MSE streaming from RTSP sources
  // go2rtc runs via pm2 on port 1984
  private readonly go2rtcHost = 'localhost:1984';
  
  // Map UniFi Protect camera IDs to go2rtc stream names
  // All Kyle Rise cameras are mapped - go2rtc handles RTSP from NVR
  private readonly cameraStreamNames: Record<string, string> = {
    // Kyle Rise Multi-Storey
    '692dd5480096ea03e4000423': 'kyle-rise-front',
    '692dd54800e1ea03e4000424': 'kyle-rise-rear',
    '692dd5480117ea03e4000426': 'kyle-rise-ramp',
    // Kyle Surface
    '692dd548013cea03e4000427': 'kyle-rise-ptz',      // G6 PTZ Surface
    '692dd548015eea03e4000428': 'kyle-surface-rear',  // Surface Rear Pod
    // Hikvision ANPR (Kyle Surface)
    '692ddc810008ea03e4003fa8': 'kyle-surface-anpr',
    // Greenford
    '6969180c004db703e4001742': 'greenford-overview',
    // Radisson Blu (remote site - via Starlink VPN, to be added)
  };

  /**
   * Get stream URLs for a camera (RTSP + go2rtc WebRTC/HLS)
   */
  async getCameraStreamUrl(cameraId: string): Promise<{
    rtsp: string;
    rtsps: string;
    webrtc?: string;
    hls?: string;
    mse?: string;
    go2rtc?: string;
  }> {
    const streamName = this.cameraStreamNames[cameraId];
    
    const result: {
      rtsp: string;
      rtsps: string;
      webrtc?: string;
      hls?: string;
      mse?: string;
      go2rtc?: string;
    } = {
      rtsp: `rtsp://${this.nvrHost}:7447/${cameraId}`,
      rtsps: `rtsps://${this.nvrHost}:7441/${cameraId}?enableSrtp`,
    };

    // If we have a go2rtc stream configured for this camera, add those URLs
    if (streamName) {
      result.webrtc = `http://${this.go2rtcHost}/api/webrtc?src=${streamName}`;
      result.hls = `http://${this.go2rtcHost}/api/stream.m3u8?src=${streamName}`;
      result.mse = `http://${this.go2rtcHost}/api/stream.mp4?src=${streamName}`;
      result.go2rtc = `http://${this.go2rtcHost}/stream.html?src=${streamName}`;
    }

    return result;
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
        enabled: site.config?.liveOps?.enabled ?? false,
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
