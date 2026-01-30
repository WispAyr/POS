import { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  Activity,
  ShieldAlert,
  Car,
  Clock,
  RefreshCw,
  Plug,
  Upload,
  Bell,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { StatsCard } from './StatsCard';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface Stats {
  sessions: number;
  decisions: number;
  timestamp: string;
}

interface PaymentProvider {
  id: string;
  name: string;
  active: boolean;
  lastSyncStatus?: 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'NO_DATA';
  lastSyncAt?: string;
}

interface ExportStatus {
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  sitesProcessed: number;
  completedAt: string | null;
  scheduler: {
    enabled: boolean;
    nextRun: string | null;
  };
}

interface AlarmStats {
  triggered: number;
  acknowledged: number;
}

// Polling interval reduced from 5s to 30s for better performance on slow connections
const POLLING_INTERVAL = 30000;

export function DashboardStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [exportStatus, setExportStatus] = useState<ExportStatus | null>(null);
  const [alarmStats, setAlarmStats] = useState<AlarmStats | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStats = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    try {
      const [statsRes, providersRes, exportRes, alarmsRes] = await Promise.allSettled([
        axios.get('/api/stats'),
        axios.get('/api/payment-providers'),
        axios.get('/api/customer-export/status'),
        axios.get('/api/alarms/stats'),
      ]);

      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
      if (providersRes.status === 'fulfilled') setProviders(providersRes.value.data);
      if (exportRes.status === 'fulfilled') setExportStatus(exportRes.value.data);
      if (alarmsRes.status === 'fulfilled') setAlarmStats(alarmsRes.value.data);

      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch stats', error);
    } finally {
      if (showRefreshing) setIsRefreshing(false);
    }
  }, []);

  const handleManualRefresh = () => {
    fetchStats(true);
  };

  useEffect(() => {
    // Initial fetch
    fetchStats();

    // Start polling interval (30 seconds instead of 5)
    const startPolling = () => {
      intervalRef.current = setInterval(() => fetchStats(), POLLING_INTERVAL);
    };

    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    // Handle visibility change to pause polling when tab is not visible
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        // Fetch fresh data when tab becomes visible again
        fetchStats();
        startPolling();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchStats]);

  if (!stats) return <div>Loading stats...</div>;

  const chartData = [
    { name: 'Sessions', value: stats.sessions },
    { name: 'Violations', value: stats.decisions },
  ];

  const formatLastUpdated = () => {
    if (!lastUpdated) return '';
    const now = new Date();
    const diffMs = now.getTime() - lastUpdated.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    return lastUpdated.toLocaleTimeString();
  };

  return (
    <div className="space-y-6">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Dashboard Overview</h2>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Updated {formatLastUpdated()}
            </span>
          )}
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Active Sessions"
          value={stats.sessions}
          icon={Car}
          trend="+12%"
        />
        <StatsCard
          title="Pending Reviews"
          value={stats.decisions}
          icon={ShieldAlert}
          trend="+5%"
        />
        <StatsCard title="System Health" value="98.5%" icon={Activity} />
        <StatsCard title="Avg. Duration" value="45m" icon={Clock} />
      </div>

      {/* System Status Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Payment Providers Widget */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 transition-colors">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Plug className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Payment Providers</h3>
          </div>
          {providers.length > 0 ? (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Active</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {providers.filter((p) => p.active).length} / {providers.length}
                </span>
              </div>
              <div className="space-y-2">
                {providers.slice(0, 3).map((provider) => (
                  <div
                    key={provider.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-gray-700 dark:text-gray-300 truncate">
                      {provider.name}
                    </span>
                    {provider.lastSyncStatus === 'SUCCESS' ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : provider.lastSyncStatus === 'FAILED' ? (
                      <XCircle className="w-4 h-4 text-red-500" />
                    ) : (
                      <Clock className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                ))}
                {providers.length > 3 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    +{providers.length - 3} more
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No providers configured</p>
          )}
        </div>

        {/* Customer Export Widget */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 transition-colors">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Upload className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Customer Export</h3>
          </div>
          {exportStatus ? (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Last Export</span>
                <span className="flex items-center gap-1.5 font-medium">
                  {exportStatus.status === 'COMPLETED' ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : exportStatus.status === 'FAILED' ? (
                    <XCircle className="w-4 h-4 text-red-500" />
                  ) : (
                    <Clock className="w-4 h-4 text-blue-500" />
                  )}
                  <span className="text-gray-900 dark:text-white">{exportStatus.status}</span>
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Sites</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {exportStatus.sitesProcessed}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Scheduler</span>
                <span
                  className={`font-medium ${exportStatus.scheduler.enabled ? 'text-green-600 dark:text-green-400' : 'text-gray-500'}`}
                >
                  {exportStatus.scheduler.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No export data</p>
          )}
        </div>

        {/* Active Alarms Widget */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 transition-colors">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <Bell className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Active Alarms</h3>
          </div>
          {alarmStats ? (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Triggered</span>
                <span className="flex items-center gap-1.5">
                  {alarmStats.triggered > 0 && (
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  )}
                  <span
                    className={`font-medium ${alarmStats.triggered > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}
                  >
                    {alarmStats.triggered}
                  </span>
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Acknowledged</span>
                <span className="font-medium text-amber-600 dark:text-amber-400">
                  {alarmStats.acknowledged}
                </span>
              </div>
              {alarmStats.triggered === 0 && alarmStats.acknowledged === 0 && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle className="w-4 h-4" />
                  All systems normal
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No alarm data</p>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 h-80 transition-colors">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
          Activity Overview
        </h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e2e8f0"
              opacity={0.1}
            />
            <XAxis dataKey="name" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
              }}
              itemStyle={{ color: '#fff' }}
            />
            <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
