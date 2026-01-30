import { Injectable, Logger } from '@nestjs/common';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  SystemMetrics,
  CpuMetrics,
  MemoryMetrics,
  DiskMetrics,
  NetworkMetrics,
  ProcessMetrics,
  SystemHealthStatus,
  HealthCheck,
  SystemMonitorConfig,
  DEFAULT_MONITOR_CONFIG,
} from '../system-monitor.types';

const execAsync = promisify(exec);

@Injectable()
export class SystemMonitorService {
  private readonly logger = new Logger(SystemMonitorService.name);
  private lastCpuInfo: { idle: number; total: number } | null = null;
  private config: SystemMonitorConfig = DEFAULT_MONITOR_CONFIG;

  /**
   * Get comprehensive system metrics
   */
  async getMetrics(): Promise<SystemMetrics> {
    const [cpu, memory, disks, network, nodeProcess] = await Promise.all([
      this.getCpuMetrics(),
      this.getMemoryMetrics(),
      this.getDiskMetrics(),
      this.getNetworkMetrics(),
      this.getProcessMetrics(),
    ]);

    return {
      timestamp: new Date(),
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      uptime: os.uptime(),
      cpu,
      memory,
      disks,
      network,
      nodeProcess,
    };
  }

  /**
   * Get CPU metrics
   */
  async getCpuMetrics(): Promise<CpuMetrics> {
    const cpus = os.cpus();
    const loadAverage = os.loadavg();

    // Calculate CPU usage
    let idle = 0;
    let total = 0;

    for (const cpu of cpus) {
      idle += cpu.times.idle;
      total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
    }

    let usage = 0;
    if (this.lastCpuInfo) {
      const idleDiff = idle - this.lastCpuInfo.idle;
      const totalDiff = total - this.lastCpuInfo.total;
      usage = totalDiff > 0 ? Math.round((1 - idleDiff / totalDiff) * 100) : 0;
    }

    this.lastCpuInfo = { idle, total };

    return {
      usage,
      cores: cpus.length,
      model: cpus[0]?.model || 'Unknown',
      speed: cpus[0]?.speed || 0,
      loadAverage,
    };
  }

  /**
   * Get memory metrics
   */
  async getMemoryMetrics(): Promise<MemoryMetrics> {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;

    // Get swap info (macOS/Linux)
    let swapTotal = 0;
    let swapUsed = 0;
    let swapFree = 0;

    try {
      if (os.platform() === 'darwin') {
        const { stdout } = await execAsync('sysctl vm.swapusage');
        const match = stdout.match(/total = ([\d.]+)M\s+used = ([\d.]+)M\s+free = ([\d.]+)M/);
        if (match) {
          swapTotal = parseFloat(match[1]) * 1024 * 1024;
          swapUsed = parseFloat(match[2]) * 1024 * 1024;
          swapFree = parseFloat(match[3]) * 1024 * 1024;
        }
      } else if (os.platform() === 'linux') {
        const { stdout } = await execAsync('free -b | grep Swap');
        const parts = stdout.trim().split(/\s+/);
        if (parts.length >= 4) {
          swapTotal = parseInt(parts[1], 10);
          swapUsed = parseInt(parts[2], 10);
          swapFree = parseInt(parts[3], 10);
        }
      }
    } catch {
      // Swap info not available
    }

    return {
      total,
      used,
      free,
      usagePercent: Math.round((used / total) * 100),
      swapTotal,
      swapUsed,
      swapFree,
    };
  }

  /**
   * Get disk metrics
   */
  async getDiskMetrics(): Promise<DiskMetrics[]> {
    const disks: DiskMetrics[] = [];

    try {
      if (os.platform() === 'darwin' || os.platform() === 'linux') {
        const { stdout } = await execAsync('df -k');
        const lines = stdout.trim().split('\n').slice(1);

        for (const line of lines) {
          const parts = line.split(/\s+/);
          if (parts.length >= 6) {
            const filesystem = parts[0];
            // Skip pseudo filesystems
            if (
              filesystem.startsWith('/dev/') ||
              filesystem.startsWith('/System/Volumes')
            ) {
              const total = parseInt(parts[1], 10) * 1024;
              const used = parseInt(parts[2], 10) * 1024;
              const free = parseInt(parts[3], 10) * 1024;
              const mountPoint = parts[parts.length - 1];

              // Only include main mounts
              if (
                mountPoint === '/' ||
                mountPoint.startsWith('/Users') ||
                mountPoint.startsWith('/home') ||
                mountPoint.startsWith('/data')
              ) {
                disks.push({
                  filesystem,
                  mountPoint,
                  total,
                  used,
                  free,
                  usagePercent: total > 0 ? Math.round((used / total) * 100) : 0,
                });
              }
            }
          }
        }
      }
    } catch (err) {
      this.logger.warn('Failed to get disk metrics', err);
    }

    // Ensure at least root disk is included
    if (disks.length === 0) {
      disks.push({
        filesystem: 'unknown',
        mountPoint: '/',
        total: 0,
        used: 0,
        free: 0,
        usagePercent: 0,
      });
    }

    return disks;
  }

  /**
   * Get network metrics
   */
  async getNetworkMetrics(): Promise<NetworkMetrics[]> {
    const networkInterfaces = os.networkInterfaces();
    const metrics: NetworkMetrics[] = [];

    try {
      if (os.platform() === 'darwin') {
        const { stdout } = await execAsync('netstat -ibn');
        const lines = stdout.trim().split('\n').slice(1);

        for (const line of lines) {
          const parts = line.split(/\s+/);
          if (parts.length >= 10) {
            const iface = parts[0];
            // Only include main interfaces
            if (
              iface.startsWith('en') ||
              iface.startsWith('zt') ||
              iface === 'lo0'
            ) {
              const existing = metrics.find((m) => m.interface === iface);
              if (!existing) {
                metrics.push({
                  interface: iface,
                  bytesReceived: parseInt(parts[6], 10) || 0,
                  bytesSent: parseInt(parts[9], 10) || 0,
                  packetsReceived: parseInt(parts[4], 10) || 0,
                  packetsSent: parseInt(parts[7], 10) || 0,
                  errorsReceived: parseInt(parts[5], 10) || 0,
                  errorsSent: parseInt(parts[8], 10) || 0,
                });
              }
            }
          }
        }
      } else if (os.platform() === 'linux') {
        const { stdout } = await execAsync('cat /proc/net/dev');
        const lines = stdout.trim().split('\n').slice(2);

        for (const line of lines) {
          const parts = line.split(/[:\s]+/).filter(Boolean);
          if (parts.length >= 10) {
            const iface = parts[0];
            if (
              iface.startsWith('eth') ||
              iface.startsWith('en') ||
              iface.startsWith('zt') ||
              iface === 'lo'
            ) {
              metrics.push({
                interface: iface,
                bytesReceived: parseInt(parts[1], 10) || 0,
                packetsReceived: parseInt(parts[2], 10) || 0,
                errorsReceived: parseInt(parts[3], 10) || 0,
                bytesSent: parseInt(parts[9], 10) || 0,
                packetsSent: parseInt(parts[10], 10) || 0,
                errorsSent: parseInt(parts[11], 10) || 0,
              });
            }
          }
        }
      }
    } catch (err) {
      this.logger.warn('Failed to get network metrics', err);
    }

    return metrics;
  }

  /**
   * Get Node.js process metrics
   */
  async getProcessMetrics(): Promise<ProcessMetrics> {
    const memUsage = process.memoryUsage();

    return {
      pid: process.pid,
      name: 'POS Server',
      cpu: 0, // Would need sampling to calculate accurately
      memory: memUsage.heapUsed,
      uptime: process.uptime(),
    };
  }

  /**
   * Get overall system health status
   */
  async getHealthStatus(): Promise<SystemHealthStatus> {
    const metrics = await this.getMetrics();
    const checks: HealthCheck[] = [];

    // CPU check
    const cpuCheck = this.checkThreshold(
      'CPU Usage',
      metrics.cpu.usage,
      this.config.cpuWarningThreshold,
      this.config.cpuCriticalThreshold,
      '%',
    );
    checks.push(cpuCheck);

    // Memory check
    const memoryCheck = this.checkThreshold(
      'Memory Usage',
      metrics.memory.usagePercent,
      this.config.memoryWarningThreshold,
      this.config.memoryCriticalThreshold,
      '%',
    );
    checks.push(memoryCheck);

    // Disk checks
    for (const disk of metrics.disks) {
      const diskCheck = this.checkThreshold(
        `Disk (${disk.mountPoint})`,
        disk.usagePercent,
        this.config.diskWarningThreshold,
        this.config.diskCriticalThreshold,
        '%',
      );
      checks.push(diskCheck);
    }

    // Load average check (1 min)
    const loadCheck = this.checkThreshold(
      'Load Average (1m)',
      metrics.cpu.loadAverage[0],
      this.config.loadWarningThreshold,
      this.config.loadCriticalThreshold,
    );
    checks.push(loadCheck);

    // Determine overall status
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (checks.some((c) => c.status === 'fail')) {
      status = 'critical';
    } else if (checks.some((c) => c.status === 'warn')) {
      status = 'warning';
    }

    return {
      status,
      checks,
      lastChecked: new Date(),
    };
  }

  /**
   * Check a value against warning and critical thresholds
   */
  private checkThreshold(
    name: string,
    value: number,
    warningThreshold: number,
    criticalThreshold: number,
    unit: string = '',
  ): HealthCheck {
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    let message = `${value}${unit} - OK`;

    if (value >= criticalThreshold) {
      status = 'fail';
      message = `${value}${unit} exceeds critical threshold (${criticalThreshold}${unit})`;
    } else if (value >= warningThreshold) {
      status = 'warn';
      message = `${value}${unit} exceeds warning threshold (${warningThreshold}${unit})`;
    }

    return {
      name,
      status,
      value: `${value}${unit}`,
      threshold: `warn: ${warningThreshold}${unit}, crit: ${criticalThreshold}${unit}`,
      message,
    };
  }

  /**
   * Format bytes to human-readable string
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Format uptime to human-readable string
   */
  formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);

    return parts.length > 0 ? parts.join(' ') : '< 1m';
  }

  /**
   * Update monitoring configuration
   */
  updateConfig(config: Partial<SystemMonitorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): SystemMonitorConfig {
    return { ...this.config };
  }
}
