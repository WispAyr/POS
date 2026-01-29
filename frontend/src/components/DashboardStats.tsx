import { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { Activity, ShieldAlert, Car, Clock, RefreshCw } from 'lucide-react';
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

// Polling interval reduced from 5s to 30s for better performance on slow connections
const POLLING_INTERVAL = 30000;

export function DashboardStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStats = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    try {
      const { data } = await axios.get('/api/stats');
      setStats(data);
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
