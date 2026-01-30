import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Network,
  Activity,
  Server,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Clock,
  Settings,
} from 'lucide-react';

interface CpuMetrics {
  usage: number;
  cores: number;
  model: string;
  speed: number;
  loadAverage: number[];
}

interface MemoryMetrics {
  total: number;
  used: number;
  free: number;
  usagePercent: number;
  swapTotal: number;
  swapUsed: number;
  swapFree: number;
}

interface DiskMetrics {
  filesystem: string;
  mountPoint: string;
  total: number;
  used: number;
  free: number;
  usagePercent: number;
}

interface NetworkMetrics {
  interface: string;
  bytesReceived: number;
  bytesSent: number;
  packetsReceived: number;
  packetsSent: number;
  errorsReceived: number;
  errorsSent: number;
}

interface ProcessMetrics {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  uptime: number;
}

interface SystemMetrics {
  timestamp: string;
  hostname: string;
  platform: string;
  release: string;
  arch: string;
  uptime: number;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disks: DiskMetrics[];
  network: NetworkMetrics[];
  nodeProcess: ProcessMetrics;
}

interface HealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  value: string;
  threshold?: string;
  message?: string;
}

interface SystemHealthStatus {
  status: 'healthy' | 'warning' | 'critical';
  checks: HealthCheck[];
  lastChecked: string;
}

interface MonitorConfig {
  cpuWarningThreshold: number;
  cpuCriticalThreshold: number;
  memoryWarningThreshold: number;
  memoryCriticalThreshold: number;
  diskWarningThreshold: number;
  diskCriticalThreshold: number;
  loadWarningThreshold: number;
  loadCriticalThreshold: number;
}

const POLL_INTERVAL = 10000; // 10 seconds

export function SystemMonitorView() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [health, setHealth] = useState<SystemHealthStatus | null>(null);
  const [config, setConfig] = useState<MonitorConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [editingConfig, setEditingConfig] = useState<MonitorConfig | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [metricsRes, healthRes, configRes] = await Promise.all([
        axios.get('/api/system-monitor/metrics'),
        axios.get('/api/system-monitor/health'),
        axios.get('/api/system-monitor/config'),
      ]);
      setMetrics(metricsRes.data);
      setHealth(healthRes.data);
      setConfig(configRes.data);
    } catch (error) {
      console.error('Failed to fetch system metrics:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  const updateConfig = async () => {
    if (!editingConfig) return;
    try {
      const res = await axios.put('/api/system-monitor/config', editingConfig);
      setConfig(res.data);
      setShowConfig(false);
      setEditingConfig(null);
    } catch (error) {
      console.error('Failed to update config:', error);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);

    return parts.length > 0 ? parts.join(' ') : '< 1m';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'pass':
        return 'text-green-600 dark:text-green-400';
      case 'warning':
      case 'warn':
        return 'text-amber-600 dark:text-amber-400';
      case 'critical':
      case 'fail':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'pass':
        return 'bg-green-100 dark:bg-green-900/30';
      case 'warning':
      case 'warn':
        return 'bg-amber-100 dark:bg-amber-900/30';
      case 'critical':
      case 'fail':
        return 'bg-red-100 dark:bg-red-900/30';
      default:
        return 'bg-gray-100 dark:bg-gray-900/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'pass':
        return <CheckCircle className="w-5 h-5" />;
      case 'warning':
      case 'warn':
        return <AlertCircle className="w-5 h-5" />;
      case 'critical':
      case 'fail':
        return <AlertTriangle className="w-5 h-5" />;
      default:
        return <Activity className="w-5 h-5" />;
    }
  };

  const getUsageColor = (percent: number, warningThreshold: number = 70, criticalThreshold: number = 90) => {
    if (percent >= criticalThreshold) return 'bg-red-500';
    if (percent >= warningThreshold) return 'bg-amber-500';
    return 'bg-green-500';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            System Monitor
          </h2>
          {health && (
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${getStatusBg(health.status)} ${getStatusColor(health.status)}`}
            >
              {getStatusIcon(health.status)}
              <span className="font-medium capitalize">{health.status}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setEditingConfig(config);
              setShowConfig(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors"
          >
            <Settings className="w-4 h-4" />
            Thresholds
          </button>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* System Info */}
      {metrics && (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Server className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white">
              System Information
            </h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Hostname</p>
              <p className="font-medium text-gray-900 dark:text-white">{metrics.hostname}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Platform</p>
              <p className="font-medium text-gray-900 dark:text-white">{metrics.platform}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Architecture</p>
              <p className="font-medium text-gray-900 dark:text-white">{metrics.arch}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Release</p>
              <p className="font-medium text-gray-900 dark:text-white truncate">{metrics.release}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">System Uptime</p>
              <p className="font-medium text-gray-900 dark:text-white">{formatUptime(metrics.uptime)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Process Uptime</p>
              <p className="font-medium text-gray-900 dark:text-white">{formatUptime(metrics.nodeProcess.uptime)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Health Checks */}
      {health && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Health Checks
              </h3>
            </div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Last checked: {new Date(health.lastChecked).toLocaleTimeString()}
            </span>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-slate-800">
            {health.checks.map((check, index) => (
              <div key={index} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg ${getStatusBg(check.status)} ${getStatusColor(check.status)}`}>
                    {getStatusIcon(check.status)}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{check.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{check.message}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-mono font-medium ${getStatusColor(check.status)}`}>
                    {check.value}
                  </p>
                  {check.threshold && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {check.threshold}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* CPU */}
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Cpu className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h3 className="font-semibold text-gray-900 dark:text-white">CPU</h3>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Usage</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{metrics.cpu.usage}%</span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getUsageColor(metrics.cpu.usage, config?.cpuWarningThreshold, config?.cpuCriticalThreshold)} transition-all duration-300`}
                    style={{ width: `${metrics.cpu.usage}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Cores</p>
                  <p className="font-medium text-gray-900 dark:text-white">{metrics.cpu.cores}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Speed</p>
                  <p className="font-medium text-gray-900 dark:text-white">{metrics.cpu.speed} MHz</p>
                </div>
                <div className="col-span-2">
                  <p className="text-gray-500 dark:text-gray-400">Load Average</p>
                  <p className="font-medium text-gray-900 dark:text-white font-mono">
                    {metrics.cpu.loadAverage.map(l => l.toFixed(2)).join(' / ')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Memory */}
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <MemoryStick className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <h3 className="font-semibold text-gray-900 dark:text-white">Memory</h3>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Usage</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{metrics.memory.usagePercent}%</span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getUsageColor(metrics.memory.usagePercent, config?.memoryWarningThreshold, config?.memoryCriticalThreshold)} transition-all duration-300`}
                    style={{ width: `${metrics.memory.usagePercent}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Total</p>
                  <p className="font-medium text-gray-900 dark:text-white">{formatBytes(metrics.memory.total)}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Used</p>
                  <p className="font-medium text-gray-900 dark:text-white">{formatBytes(metrics.memory.used)}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Free</p>
                  <p className="font-medium text-gray-900 dark:text-white">{formatBytes(metrics.memory.free)}</p>
                </div>
              </div>
              {metrics.memory.swapTotal > 0 && (
                <div className="pt-3 border-t border-gray-200 dark:border-slate-700">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Swap</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {formatBytes(metrics.memory.swapUsed)} / {formatBytes(metrics.memory.swapTotal)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Disks */}
      {metrics && metrics.disks.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <HardDrive className="w-5 h-5 text-green-600 dark:text-green-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Disks</h3>
          </div>
          <div className="space-y-4">
            {metrics.disks.map((disk, index) => (
              <div key={index}>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {disk.mountPoint} <span className="text-xs text-gray-400">({disk.filesystem})</span>
                  </span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {formatBytes(disk.used)} / {formatBytes(disk.total)} ({disk.usagePercent}%)
                  </span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getUsageColor(disk.usagePercent, config?.diskWarningThreshold, config?.diskCriticalThreshold)} transition-all duration-300`}
                    style={{ width: `${disk.usagePercent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Network */}
      {metrics && metrics.network.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Network className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Network Interfaces</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400">
                  <th className="pb-3 font-medium">Interface</th>
                  <th className="pb-3 font-medium">Received</th>
                  <th className="pb-3 font-medium">Sent</th>
                  <th className="pb-3 font-medium">Packets RX</th>
                  <th className="pb-3 font-medium">Packets TX</th>
                  <th className="pb-3 font-medium">Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                {metrics.network.map((iface, index) => (
                  <tr key={index} className="text-gray-900 dark:text-white">
                    <td className="py-3 font-medium">{iface.interface}</td>
                    <td className="py-3 font-mono">{formatBytes(iface.bytesReceived)}</td>
                    <td className="py-3 font-mono">{formatBytes(iface.bytesSent)}</td>
                    <td className="py-3 font-mono">{iface.packetsReceived.toLocaleString()}</td>
                    <td className="py-3 font-mono">{iface.packetsSent.toLocaleString()}</td>
                    <td className="py-3 font-mono">
                      {iface.errorsReceived + iface.errorsSent > 0 ? (
                        <span className="text-red-600 dark:text-red-400">
                          {iface.errorsReceived + iface.errorsSent}
                        </span>
                      ) : (
                        <span className="text-green-600 dark:text-green-400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Process Info */}
      {metrics && (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Node.js Process</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500 dark:text-gray-400">Name</p>
              <p className="font-medium text-gray-900 dark:text-white">{metrics.nodeProcess.name}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">PID</p>
              <p className="font-medium text-gray-900 dark:text-white font-mono">{metrics.nodeProcess.pid}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Memory (Heap)</p>
              <p className="font-medium text-gray-900 dark:text-white">{formatBytes(metrics.nodeProcess.memory)}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Uptime</p>
              <p className="font-medium text-gray-900 dark:text-white">{formatUptime(metrics.nodeProcess.uptime)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Config Modal */}
      {showConfig && editingConfig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-lg w-full">
            <div className="p-6 border-b border-gray-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Alert Thresholds
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Configure warning and critical thresholds for system metrics
              </p>
            </div>

            <div className="p-6 space-y-6">
              {/* CPU Thresholds */}
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-3">CPU Usage (%)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Warning</label>
                    <input
                      type="number"
                      value={editingConfig.cpuWarningThreshold}
                      onChange={(e) => setEditingConfig({ ...editingConfig, cpuWarningThreshold: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Critical</label>
                    <input
                      type="number"
                      value={editingConfig.cpuCriticalThreshold}
                      onChange={(e) => setEditingConfig({ ...editingConfig, cpuCriticalThreshold: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Memory Thresholds */}
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-3">Memory Usage (%)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Warning</label>
                    <input
                      type="number"
                      value={editingConfig.memoryWarningThreshold}
                      onChange={(e) => setEditingConfig({ ...editingConfig, memoryWarningThreshold: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Critical</label>
                    <input
                      type="number"
                      value={editingConfig.memoryCriticalThreshold}
                      onChange={(e) => setEditingConfig({ ...editingConfig, memoryCriticalThreshold: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Disk Thresholds */}
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-3">Disk Usage (%)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Warning</label>
                    <input
                      type="number"
                      value={editingConfig.diskWarningThreshold}
                      onChange={(e) => setEditingConfig({ ...editingConfig, diskWarningThreshold: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Critical</label>
                    <input
                      type="number"
                      value={editingConfig.diskCriticalThreshold}
                      onChange={(e) => setEditingConfig({ ...editingConfig, diskCriticalThreshold: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Load Average Thresholds */}
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-3">Load Average</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Warning</label>
                    <input
                      type="number"
                      step="0.5"
                      value={editingConfig.loadWarningThreshold}
                      onChange={(e) => setEditingConfig({ ...editingConfig, loadWarningThreshold: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Critical</label>
                    <input
                      type="number"
                      step="0.5"
                      value={editingConfig.loadCriticalThreshold}
                      onChange={(e) => setEditingConfig({ ...editingConfig, loadCriticalThreshold: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-slate-800 flex gap-3">
              <button
                onClick={updateConfig}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save Changes
              </button>
              <button
                onClick={() => {
                  setShowConfig(false);
                  setEditingConfig(null);
                }}
                className="px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
