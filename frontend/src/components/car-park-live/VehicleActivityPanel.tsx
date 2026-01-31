import { useState, useEffect, useCallback } from 'react';
import {
  Car,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  AlertCircle,
} from 'lucide-react';

interface VehicleEvent {
  id: string;
  timestamp: string;
  direction: string;
  cameraIds: string;
  images: { url: string; type: string }[];
}

interface VehicleCluster {
  vrm: string;
  firstSeen: string;
  lastSeen: string;
  eventCount: number;
  direction: 'ENTRY' | 'EXIT' | 'MIXED' | 'UNKNOWN';
  events: VehicleEvent[];
}

interface VehicleActivityPanelProps {
  siteId: string;
}

export function VehicleActivityPanel({ siteId }: VehicleActivityPanelProps) {
  const [clusters, setClusters] = useState<VehicleCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedVrm, setExpandedVrm] = useState<string | null>(null);
  const [hours, setHours] = useState(4);

  const fetchActivity = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/live-ops/sites/${siteId}/vehicles?hours=${hours}&limit=30`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setClusters(data.clusters || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, [siteId, hours]);

  useEffect(() => {
    fetchActivity();
    const interval = setInterval(fetchActivity, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchActivity]);

  const formatTime = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleTimeString('en-GB', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const formatTimeAgo = (ts: string) => {
    const now = new Date();
    const date = new Date(ts);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const getDirectionIcon = (direction: string) => {
    switch (direction) {
      case 'ENTRY':
        return <ArrowRight className="w-4 h-4 text-green-500" />;
      case 'EXIT':
        return <ArrowLeft className="w-4 h-4 text-red-500" />;
      case 'MIXED':
        return <RefreshCw className="w-4 h-4 text-blue-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getDirectionBadge = (direction: string) => {
    switch (direction) {
      case 'ENTRY':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
      case 'EXIT':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
      case 'MIXED':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
      default:
        return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400';
    }
  };

  if (loading && clusters.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-6">
        <div className="flex items-center justify-center gap-2 text-gray-500">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading vehicle activity...</span>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Car className="w-5 h-5" />
          Vehicle Activity
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={hours}
            onChange={(e) => setHours(parseInt(e.target.value))}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300"
          >
            <option value={1}>Last hour</option>
            <option value={4}>Last 4 hours</option>
            <option value={12}>Last 12 hours</option>
            <option value={24}>Last 24 hours</option>
          </select>
          <button
            onClick={fetchActivity}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 p-4 text-red-600 dark:text-red-400">
          {error}
        </div>
      ) : clusters.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-8 text-center text-gray-500">
          <Car className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No vehicle activity in the last {hours} hour{hours > 1 ? 's' : ''}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {clusters.map((cluster) => (
            <div
              key={cluster.vrm}
              className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden"
            >
              {/* Cluster Header */}
              <button
                onClick={() => setExpandedVrm(expandedVrm === cluster.vrm ? null : cluster.vrm)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    {getDirectionIcon(cluster.direction)}
                    <span className="font-mono font-bold text-lg text-gray-900 dark:text-white">
                      {cluster.vrm}
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getDirectionBadge(cluster.direction)}`}>
                    {cluster.direction}
                  </span>
                  {cluster.eventCount > 1 && (
                    <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-xs font-medium">
                      {cluster.eventCount} sightings
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {formatTimeAgo(cluster.lastSeen)}
                  </span>
                  {expandedVrm === cluster.vrm ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </button>

              {/* Expanded Timeline */}
              {expandedVrm === cluster.vrm && (
                <div className="border-t border-gray-200 dark:border-slate-700 p-4">
                  <div className="space-y-4">
                    {cluster.events.map((event, idx) => (
                      <div key={event.id} className="flex gap-4">
                        {/* Timeline dot */}
                        <div className="flex flex-col items-center">
                          <div className={`w-3 h-3 rounded-full ${
                            event.direction === 'ENTRY' ? 'bg-green-500' :
                            event.direction === 'EXIT' ? 'bg-red-500' : 'bg-gray-400'
                          }`} />
                          {idx < cluster.events.length - 1 && (
                            <div className="w-0.5 flex-1 bg-gray-200 dark:bg-slate-700 my-1" />
                          )}
                        </div>
                        
                        {/* Event content */}
                        <div className="flex-1 pb-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {getDirectionIcon(event.direction)}
                              <span className="font-medium text-gray-900 dark:text-white">
                                {event.direction || 'DETECTED'}
                              </span>
                            </div>
                            <span className="text-sm text-gray-500">
                              {formatTime(event.timestamp)}
                            </span>
                          </div>
                          
                          {/* Images */}
                          {event.images && event.images.length > 0 ? (
                            <div className="flex gap-2 mt-2">
                              {event.images.slice(0, 3).map((img, imgIdx) => (
                                <div
                                  key={imgIdx}
                                  className="w-24 h-16 rounded-lg overflow-hidden bg-gray-100 dark:bg-slate-800"
                                >
                                  <img
                                    src={img.url}
                                    alt={`${cluster.vrm} - ${img.type}`}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-sm text-gray-400 mt-2">
                              <ImageIcon className="w-4 h-4" />
                              <span>No images available</span>
                            </div>
                          )}
                          
                          <div className="text-xs text-gray-400 mt-2">
                            Camera: {event.cameraIds}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
