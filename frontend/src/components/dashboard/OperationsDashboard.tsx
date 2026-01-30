import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';
import { LiveClock } from './LiveClock';
import { SiteCard } from './SiteCard';
import { CameraFeed } from './CameraFeed';
import { FullscreenButton } from '../layout/FullscreenButton';

interface CameraStatus {
  cameraId: string;
  name: string;
  direction: 'ENTRY' | 'EXIT' | 'INTERNAL' | null;
  lastDetection: {
    timestamp: string | null;
    vrm: string | null;
    imageUrl: string | null;
  };
  status: 'online' | 'offline' | 'warning';
}

interface SiteData {
  siteId: string;
  siteName: string;
  cameras: CameraStatus[];
  stats: {
    today: {
      entries: number;
      exits: number;
      violations: number;
    };
    hourlyActivity: { hour: number; count: number }[];
  };
  health: {
    status: 'healthy' | 'warning' | 'critical';
    lastSync: string | null;
  };
}

interface DashboardData {
  sites: SiteData[];
  summary: {
    totalActiveAlarms: number;
    reviewQueueCount: number;
    systemStatus: 'healthy' | 'warning' | 'critical';
  };
  generatedAt: string;
}

const POLL_INTERVAL = 10000; // 10 seconds

export function OperationsDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/operations/dashboard');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const result = await response.json();
      setData(result);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch and polling
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Get all cameras across all sites for the camera feed section
  const allCameras = data?.sites.flatMap((site) =>
    site.cameras.map((cam) => ({
      ...cam,
      siteName: site.siteName,
    }))
  ) || [];

  // Sort cameras by last detection (most recent first)
  const sortedCameras = [...allCameras].sort((a, b) => {
    const aTime = a.lastDetection.timestamp ? new Date(a.lastDetection.timestamp).getTime() : 0;
    const bTime = b.lastDetection.timestamp ? new Date(b.lastDetection.timestamp).getTime() : 0;
    return bTime - aTime;
  });

  const STATUS_ICONS = {
    healthy: <CheckCircle className="w-5 h-5 text-green-500" />,
    warning: <AlertCircle className="w-5 h-5 text-amber-500" />,
    critical: <AlertTriangle className="w-5 h-5 text-red-500" />,
  };

  const STATUS_LABELS = {
    healthy: 'All Systems Operational',
    warning: 'Some Issues Detected',
    critical: 'Critical Issues',
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 p-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Operations Dashboard
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Real-time site monitoring
          </p>
        </div>
        <div className="flex items-center gap-4">
          <LiveClock />
          <FullscreenButton />
        </div>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5" />
          <span>Error loading data: {error}</span>
          <button
            onClick={fetchData}
            className="ml-auto px-3 py-1 bg-red-100 dark:bg-red-900/30 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {data && (
        <>
          {/* Site Cards Grid */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Sites
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {data.sites.map((site) => (
                <SiteCard
                  key={site.siteId}
                  siteName={site.siteName}
                  status={site.health.status}
                  entries={site.stats.today.entries}
                  exits={site.stats.today.exits}
                  violations={site.stats.today.violations}
                  hourlyActivity={site.stats.hourlyActivity}
                  lastSync={site.health.lastSync}
                />
              ))}
              {data.sites.length === 0 && (
                <div className="col-span-full text-center py-12 text-gray-500 dark:text-gray-400">
                  No active sites configured
                </div>
              )}
            </div>
          </section>

          {/* Camera Feeds */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Camera Feeds - Last Detection
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {sortedCameras.slice(0, 12).map((camera) => (
                <CameraFeed
                  key={`${camera.siteName}-${camera.cameraId}`}
                  cameraName={`${camera.siteName} - ${camera.name}`}
                  vrm={camera.lastDetection.vrm}
                  timestamp={camera.lastDetection.timestamp}
                  imageUrl={camera.lastDetection.imageUrl}
                  status={camera.status}
                />
              ))}
              {sortedCameras.length === 0 && (
                <div className="col-span-full text-center py-12 text-gray-500 dark:text-gray-400">
                  No cameras configured
                </div>
              )}
            </div>
          </section>

          {/* Status Bar */}
          <footer className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 px-6 py-3 md:ml-16">
            <div className="max-w-screen-2xl mx-auto flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Alarms:
                  </span>
                  <span
                    className={`text-lg font-bold tabular-nums ${
                      data.summary.totalActiveAlarms > 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-green-600 dark:text-green-400'
                    }`}
                  >
                    {data.summary.totalActiveAlarms}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Review Queue:
                  </span>
                  <span
                    className={`text-lg font-bold tabular-nums ${
                      data.summary.reviewQueueCount > 0
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-green-600 dark:text-green-400'
                    }`}
                  >
                    {data.summary.reviewQueueCount}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {STATUS_ICONS[data.summary.systemStatus]}
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {STATUS_LABELS[data.summary.systemStatus]}
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                <span>
                  Updated {lastUpdate?.toLocaleTimeString('en-GB') || '---'}
                </span>
              </div>
            </div>
          </footer>

          {/* Bottom padding for fixed footer */}
          <div className="h-16" />
        </>
      )}
    </div>
  );
}
