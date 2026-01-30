import { useState, useEffect, useCallback } from 'react';
import { Cpu, Activity, ThermometerSun, Users, Car, Loader2, WifiOff, ChevronDown, ChevronUp, X, Settings } from 'lucide-react';

interface HailoStatus {
  uptime: number;
  uptimeFormatted: string;
  stats: {
    inferenceCount: number;
    inferenceErrors: number;
    avgInferenceMs: number;
    lastInferenceAt: number | null;
  };
  activeJobs: Array<{
    id: string;
    duration: number;
    type: string;
  }>;
  recentDetections: {
    people: number;
    vehicles: number;
    other: number;
  };
  recentActivity: Array<{
    timestamp: number;
    type: string;
    jobId?: string;
    duration?: number;
    detections?: number;
  }>;
  system: {
    cpuCores: number;
    loadAverage: string[];
    memoryUsedMB: number;
    memoryTotalMB: number;
    memoryPercent: number;
    cpuTemp: string | null;
  };
  hailo: {
    available: boolean;
    device: string;
    model: string;
  };
  pipelines: number;
  activePipelines: number;
  ingests: number;
}

interface PosAiStatus {
  hailo: {
    online: boolean;
    queue: {
      queueLength: number;
      activeRequests: number;
      queued: number;
      processed: number;
      dropped: number;
      errors: number;
    };
  };
  protect: {
    cameras: number;
    smartDetectCameras: number;
  };
}

const HAILO_API_URL = 'http://192.168.195.238:3000';
const POS_API_URL = '/api/ai';

export function HailoDevBar() {
  const [isVisible, setIsVisible] = useState(() => {
    return localStorage.getItem('hailoDevBarVisible') === 'true';
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const [hailoStatus, setHailoStatus] = useState<HailoStatus | null>(null);
  const [posStatus, setPosStatus] = useState<PosAiStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      // Fetch from both Hailo Pi and local POS API
      const [hailoRes, posRes] = await Promise.allSettled([
        fetch(`${HAILO_API_URL}/status`, { 
          mode: 'cors',
          signal: AbortSignal.timeout(3000)
        }),
        fetch(`${POS_API_URL}/status`, { 
          signal: AbortSignal.timeout(3000)
        }),
      ]);

      if (hailoRes.status === 'fulfilled' && hailoRes.value.ok) {
        const data = await hailoRes.value.json();
        setHailoStatus(data);
        setError(null);
      } else {
        setError('Hailo offline');
      }

      if (posRes.status === 'fulfilled' && posRes.value.ok) {
        const data = await posRes.value.json();
        setPosStatus(data);
      }
    } catch (err) {
      setError('Connection failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000); // Poll every 2 seconds
    return () => clearInterval(interval);
  }, [isVisible, fetchStatus]);

  useEffect(() => {
    localStorage.setItem('hailoDevBarVisible', isVisible.toString());
  }, [isVisible]);

  // Toggle with keyboard shortcut (Ctrl+Shift+H)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'H') {
        e.preventDefault();
        setIsVisible(v => !v);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 z-50 p-2 bg-slate-800 text-white rounded-lg shadow-lg hover:bg-slate-700 transition-colors"
        title="Show Hailo Dev Bar (Ctrl+Shift+H)"
      >
        <Settings className="w-4 h-4" />
      </button>
    );
  }

  const isOnline = hailoStatus?.hailo?.available ?? false;
  const activeJobs = hailoStatus?.activeJobs?.length ?? 0;
  const queueLength = posStatus?.hailo?.queue?.queueLength ?? 0;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-slate-900 text-white shadow-lg">
      {/* Compact Bar */}
      <div className="flex items-center justify-between px-4 py-2 text-sm">
        <div className="flex items-center gap-4">
          {/* Status Indicator */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="font-medium">Hailo AI</span>
          </div>

          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          ) : error ? (
            <div className="flex items-center gap-1 text-red-400">
              <WifiOff className="w-4 h-4" />
              <span>{error}</span>
            </div>
          ) : (
            <>
              {/* Quick Stats */}
              <div className="hidden sm:flex items-center gap-4 text-slate-400">
                {/* CPU Temp */}
                {hailoStatus?.system?.cpuTemp && (
                  <div className="flex items-center gap-1" title="CPU Temperature">
                    <ThermometerSun className="w-4 h-4" />
                    <span>{hailoStatus.system.cpuTemp}°C</span>
                  </div>
                )}

                {/* Memory */}
                <div className="flex items-center gap-1" title="Memory Usage">
                  <Cpu className="w-4 h-4" />
                  <span>{hailoStatus?.system?.memoryPercent ?? 0}%</span>
                </div>

                {/* Active Jobs */}
                {activeJobs > 0 && (
                  <div className="flex items-center gap-1 text-yellow-400" title="Active Inference Jobs">
                    <Activity className="w-4 h-4 animate-pulse" />
                    <span>{activeJobs} active</span>
                  </div>
                )}

                {/* Queue */}
                {queueLength > 0 && (
                  <div className="flex items-center gap-1 text-blue-400" title="Queue Length">
                    <Loader2 className="w-4 h-4" />
                    <span>{queueLength} queued</span>
                  </div>
                )}

                {/* Recent Detections */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1" title="People detected (5 min)">
                    <Users className="w-4 h-4" />
                    <span>{hailoStatus?.recentDetections?.people ?? 0}</span>
                  </div>
                  <div className="flex items-center gap-1" title="Vehicles detected (5 min)">
                    <Car className="w-4 h-4" />
                    <span>{hailoStatus?.recentDetections?.vehicles ?? 0}</span>
                  </div>
                </div>

                {/* Inference Stats */}
                <div className="text-xs text-slate-500">
                  {hailoStatus?.stats?.inferenceCount ?? 0} inferences | 
                  avg {hailoStatus?.stats?.avgInferenceMs ?? 0}ms
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Uptime */}
          <span className="text-xs text-slate-500 hidden md:inline">
            up {hailoStatus?.uptimeFormatted ?? '...'}
          </span>
          
          {/* Expand/Collapse */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-slate-800 rounded transition-colors"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {/* Close */}
          <button
            onClick={() => setIsVisible(false)}
            className="p-1 hover:bg-slate-800 rounded transition-colors"
            title="Hide (Ctrl+Shift+H to toggle)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded Panel */}
      {isExpanded && hailoStatus && (
        <div className="border-t border-slate-700 px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          {/* System Stats */}
          <div className="space-y-2">
            <h4 className="font-medium text-slate-300">System</h4>
            <div className="grid grid-cols-2 gap-2 text-slate-400">
              <div>CPU Load: {hailoStatus.system.loadAverage[0]}</div>
              <div>Cores: {hailoStatus.system.cpuCores}</div>
              <div>Memory: {hailoStatus.system.memoryUsedMB}MB / {hailoStatus.system.memoryTotalMB}MB</div>
              <div>Temp: {hailoStatus.system.cpuTemp ?? 'N/A'}°C</div>
            </div>
          </div>

          {/* Inference Stats */}
          <div className="space-y-2">
            <h4 className="font-medium text-slate-300">Inference</h4>
            <div className="grid grid-cols-2 gap-2 text-slate-400">
              <div>Total: {hailoStatus.stats.inferenceCount}</div>
              <div>Errors: {hailoStatus.stats.inferenceErrors}</div>
              <div>Avg: {hailoStatus.stats.avgInferenceMs}ms</div>
              <div>Active: {activeJobs}</div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="space-y-2">
            <h4 className="font-medium text-slate-300">Recent Activity</h4>
            <div className="max-h-24 overflow-y-auto space-y-1 text-xs">
              {hailoStatus.recentActivity.slice(0, 5).map((activity, i) => (
                <div key={i} className="flex items-center gap-2 text-slate-400">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    activity.type === 'job_complete' ? 'bg-green-500' :
                    activity.type === 'job_start' ? 'bg-blue-500' :
                    activity.type === 'job_error' ? 'bg-red-500' : 'bg-slate-500'
                  }`} />
                  <span>{activity.type.replace('job_', '')}</span>
                  {activity.duration && <span>{activity.duration}ms</span>}
                  {activity.detections !== undefined && <span>({activity.detections} det)</span>}
                </div>
              ))}
              {hailoStatus.recentActivity.length === 0 && (
                <div className="text-slate-500">No recent activity</div>
              )}
            </div>
          </div>

          {/* POS Queue Stats */}
          {posStatus && (
            <div className="space-y-2 md:col-span-3 border-t border-slate-700 pt-3">
              <h4 className="font-medium text-slate-300">POS Integration</h4>
              <div className="flex flex-wrap gap-4 text-slate-400">
                <div>Queue: {posStatus.hailo.queue.queueLength}</div>
                <div>Processed: {posStatus.hailo.queue.processed}</div>
                <div>Dropped: {posStatus.hailo.queue.dropped}</div>
                <div>Cameras: {posStatus.protect.cameras} ({posStatus.protect.smartDetectCameras} smart)</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default HailoDevBar;
