import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { SystemMonitorService } from './services/system-monitor.service';
import {
  SystemMetrics,
  SystemHealthStatus,
  SystemMonitorConfig,
} from './system-monitor.types';

@Controller('api/system-monitor')
export class SystemMonitorController {
  constructor(private readonly monitorService: SystemMonitorService) {}

  /**
   * Get comprehensive system metrics
   */
  @Get('metrics')
  async getMetrics(): Promise<SystemMetrics> {
    return this.monitorService.getMetrics();
  }

  /**
   * Get system health status
   */
  @Get('health')
  async getHealth(): Promise<SystemHealthStatus> {
    return this.monitorService.getHealthStatus();
  }

  /**
   * Get CPU metrics only
   */
  @Get('cpu')
  async getCpuMetrics() {
    return this.monitorService.getCpuMetrics();
  }

  /**
   * Get memory metrics only
   */
  @Get('memory')
  async getMemoryMetrics() {
    return this.monitorService.getMemoryMetrics();
  }

  /**
   * Get disk metrics only
   */
  @Get('disks')
  async getDiskMetrics() {
    return this.monitorService.getDiskMetrics();
  }

  /**
   * Get network metrics only
   */
  @Get('network')
  async getNetworkMetrics() {
    return this.monitorService.getNetworkMetrics();
  }

  /**
   * Get Node.js process metrics
   */
  @Get('process')
  async getProcessMetrics() {
    return this.monitorService.getProcessMetrics();
  }

  /**
   * Get current monitoring configuration
   */
  @Get('config')
  getConfig(): SystemMonitorConfig {
    return this.monitorService.getConfig();
  }

  /**
   * Update monitoring configuration (thresholds)
   */
  @Put('config')
  updateConfig(
    @Body() config: Partial<SystemMonitorConfig>,
  ): SystemMonitorConfig {
    this.monitorService.updateConfig(config);
    return this.monitorService.getConfig();
  }
}
