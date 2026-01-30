export interface CpuMetrics {
  usage: number; // Percentage 0-100
  cores: number;
  model: string;
  speed: number; // MHz
  loadAverage: number[]; // 1, 5, 15 minute averages
}

export interface MemoryMetrics {
  total: number; // bytes
  used: number; // bytes
  free: number; // bytes
  usagePercent: number; // 0-100
  swapTotal: number;
  swapUsed: number;
  swapFree: number;
}

export interface DiskMetrics {
  filesystem: string;
  mountPoint: string;
  total: number; // bytes
  used: number; // bytes
  free: number; // bytes
  usagePercent: number; // 0-100
}

export interface NetworkMetrics {
  interface: string;
  bytesReceived: number;
  bytesSent: number;
  packetsReceived: number;
  packetsSent: number;
  errorsReceived: number;
  errorsSent: number;
}

export interface ProcessMetrics {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  uptime: number; // seconds
}

export interface SystemMetrics {
  timestamp: Date;
  hostname: string;
  platform: string;
  release: string;
  arch: string;
  uptime: number; // seconds
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disks: DiskMetrics[];
  network: NetworkMetrics[];
  nodeProcess: ProcessMetrics;
}

export interface SystemHealthStatus {
  status: 'healthy' | 'warning' | 'critical';
  checks: HealthCheck[];
  lastChecked: Date;
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  value: number | string;
  threshold?: number | string;
  message?: string;
}

export interface SystemMonitorConfig {
  cpuWarningThreshold: number; // percentage
  cpuCriticalThreshold: number;
  memoryWarningThreshold: number; // percentage
  memoryCriticalThreshold: number;
  diskWarningThreshold: number; // percentage
  diskCriticalThreshold: number;
  loadWarningThreshold: number; // load average
  loadCriticalThreshold: number;
}

export const DEFAULT_MONITOR_CONFIG: SystemMonitorConfig = {
  cpuWarningThreshold: 70,
  cpuCriticalThreshold: 90,
  memoryWarningThreshold: 75,
  memoryCriticalThreshold: 90,
  diskWarningThreshold: 80,
  diskCriticalThreshold: 95,
  loadWarningThreshold: 5,
  loadCriticalThreshold: 10,
};
