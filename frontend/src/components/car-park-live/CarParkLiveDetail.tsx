import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  ArrowLeft,
  Camera,
  Volume2,
  Radio,
  Send,
  AlertTriangle,
  CheckCircle,
  Loader2,
  ChevronDown,
  DoorOpen,
  Video,
  Image as ImageIcon,
  Box,
} from 'lucide-react';
import { Go2RTCPlayer } from './Go2RTCPlayer';
import { CarPark3DView } from './CarPark3DView';

interface LiveOpsCamera {
  id: string;
  name: string;
  protectId: string;
}

interface CameraStream {
  id: string;
  name: string;
  protectId: string;
  rtsp?: string;
  webrtc?: string;
  hls?: string;
  mse?: string;
  go2rtc?: string;
}

interface LiveOpsAnnouncement {
  id: string;
  label: string;
  message: string;
  target: 'cameras' | 'horn' | 'all';
  volume: number;
}

interface LiveOpsConfig {
  enabled: boolean;
  cameras: LiveOpsCamera[];
  announcements: LiveOpsAnnouncement[];
  controls: {
    barrier?: {
      enabled: boolean;
      apiEndpoint?: string;
    };
  };
}

interface SiteData {
  id: string;
  name: string;
  liveOps: LiveOpsConfig | null;
}

interface CarParkLiveDetailProps {
  siteId: string;
  onBack: () => void;
}

const CAMERA_REFRESH_INTERVAL = 8000; // 8 seconds

export function CarParkLiveDetail({ siteId, onBack }: CarParkLiveDetailProps) {
  const [site, setSite] = useState<SiteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<'cameras' | '3d'>('cameras');

  // Camera state
  const [cameraTimestamps, setCameraTimestamps] = useState<Record<string, number>>({});
  const [cameraErrors, setCameraErrors] = useState<Record<string, boolean>>({});
  const [cameraStreams, setCameraStreams] = useState<CameraStream[]>([]);
  const [viewMode, setViewMode] = useState<'live' | 'snapshot'>('live');

  // Announcement state
  const [customMessage, setCustomMessage] = useState('');
  const [customTarget, setCustomTarget] = useState<'cameras' | 'horn' | 'all'>('cameras');
  const [customVolume, setCustomVolume] = useState(100);
  const [announcingId, setAnnouncingId] = useState<string | null>(null);
  const [announceResult, setAnnounceResult] = useState<{ success: boolean; message: string } | null>(null);

  // Barrier state
  const [barrierLoading, setBarrierLoading] = useState(false);

  // Fetch site data and streams
  const fetchSite = useCallback(async () => {
    try {
      const [siteResponse, streamsResponse] = await Promise.all([
        fetch(`/api/live-ops/sites/${siteId}`),
        fetch(`/api/live-ops/sites/${siteId}/streams`),
      ]);
      
      if (!siteResponse.ok) throw new Error(`HTTP ${siteResponse.status}`);
      const siteData = await siteResponse.json();
      setSite(siteData);
      
      if (streamsResponse.ok) {
        const streamsData = await streamsResponse.json();
        if (streamsData.success && streamsData.streams) {
          setCameraStreams(streamsData.streams);
        }
      }
      
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch site');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchSite();
  }, [fetchSite]);

  // Auto-refresh camera snapshots
  useEffect(() => {
    const interval = setInterval(() => {
      setCameraTimestamps((prev) => {
        const newTimestamps: Record<string, number> = {};
        site?.liveOps?.cameras?.forEach((cam) => {
          newTimestamps[cam.id] = Date.now();
        });
        return { ...prev, ...newTimestamps };
      });
    }, CAMERA_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [site]);

  // Initial camera timestamps
  useEffect(() => {
    if (site?.liveOps?.cameras) {
      const initialTimestamps: Record<string, number> = {};
      site.liveOps.cameras.forEach((cam) => {
        initialTimestamps[cam.id] = Date.now();
      });
      setCameraTimestamps(initialTimestamps);
    }
  }, [site]);

  // Trigger announcement
  const triggerAnnouncement = async (
    message: string,
    target: 'cameras' | 'horn' | 'all',
    volume: number,
    announcementId?: string
  ) => {
    setAnnouncingId(announcementId || 'custom');
    setAnnounceResult(null);

    try {
      const response = await fetch(`/api/live-ops/sites/${siteId}/announce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, target, volume }),
      });

      const result = await response.json();
      setAnnounceResult({
        success: result.success,
        message: result.success ? 'Announcement sent!' : 'Failed to send announcement',
      });
    } catch (err) {
      setAnnounceResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to send announcement',
      });
    } finally {
      setAnnouncingId(null);
      // Clear result after 3 seconds
      setTimeout(() => setAnnounceResult(null), 3000);
    }
  };

  // Trigger barrier control
  const triggerBarrier = async (action: 'open' | 'close') => {
    setBarrierLoading(true);
    try {
      const response = await fetch(`/api/live-ops/sites/${siteId}/barrier/${action}`, {
        method: 'POST',
      });
      const result = await response.json();
      setAnnounceResult({
        success: result.success,
        message: result.message,
      });
    } catch (err) {
      setAnnounceResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to control barrier',
      });
    } finally {
      setBarrierLoading(false);
      setTimeout(() => setAnnounceResult(null), 3000);
    }
  };

  // Handle camera image error
  const handleCameraError = (cameraId: string) => {
    setCameraErrors((prev) => ({ ...prev, [cameraId]: true }));
  };

  // Handle camera image load
  const handleCameraLoad = (cameraId: string) => {
    setCameraErrors((prev) => ({ ...prev, [cameraId]: false }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error || !site) {
    return (
      <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400">
        <p className="font-medium">Error loading site</p>
        <p className="text-sm mt-1">{error || 'Site not found'}</p>
        <button
          onClick={onBack}
          className="mt-3 px-4 py-2 bg-red-100 dark:bg-red-900/30 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
        >
          Go Back
        </button>
      </div>
    );
  }

  const liveOps = site.liveOps;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 rounded-lg bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{site.name}</h2>
          <p className="text-gray-500 dark:text-gray-400">Live Operations Dashboard</p>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-800 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('cameras')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'cameras'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Camera className="w-4 h-4" />
            Cameras
          </button>
          <button
            onClick={() => setActiveTab('3d')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === '3d'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Box className="w-4 h-4" />
            3D View
          </button>
        </div>
      </div>

      {/* Result Toast */}
      {announceResult && (
        <div
          className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-lg flex items-center gap-3 animate-in slide-in-from-top-2 ${
            announceResult.success
              ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
              : 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
          }`}
        >
          {announceResult.success ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertTriangle className="w-5 h-5" />
          )}
          <span className="font-medium">{announceResult.message}</span>
        </div>
      )}

      {/* 3D View Tab */}
      {activeTab === '3d' && <CarPark3DView />}

      {/* Cameras Tab */}
      {activeTab === 'cameras' && (
        <>
      {/* Camera Grid */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Camera Feeds
            {viewMode === 'snapshot' && (
              <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                (Auto-refresh every {CAMERA_REFRESH_INTERVAL / 1000}s)
              </span>
            )}
          </h3>
          
          {/* View mode toggle */}
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('live')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'live'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Video className="w-4 h-4" />
              Live
            </button>
            <button
              onClick={() => setViewMode('snapshot')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'snapshot'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              Snapshots
            </button>
          </div>
        </div>

        {liveOps?.cameras && liveOps.cameras.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {liveOps.cameras.map((camera) => {
              const stream = cameraStreams.find((s) => s.id === camera.id);
              const streamName = stream?.mse?.match(/src=([^&]+)/)?.[1];
              
              return (
                <div
                  key={camera.id}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden"
                >
                  {viewMode === 'live' && streamName ? (
                    <Go2RTCPlayer
                      streamName={streamName}
                      cameraName={camera.name}
                      snapshotUrl={`/api/live-ops/sites/${siteId}/cameras/${camera.id}/snapshot`}
                    />
                  ) : (
                    <div className="aspect-video bg-gray-900 relative">
                      {cameraErrors[camera.id] ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
                          <Camera className="w-12 h-12 mb-2 opacity-50" />
                          <span className="text-sm">Camera unavailable</span>
                        </div>
                      ) : (
                        <img
                          key={cameraTimestamps[camera.id]}
                          src={`/api/live-ops/sites/${siteId}/cameras/${camera.id}/snapshot?t=${cameraTimestamps[camera.id] || Date.now()}`}
                          alt={camera.name}
                          className="w-full h-full object-cover"
                          onError={() => handleCameraError(camera.id)}
                          onLoad={() => handleCameraLoad(camera.id)}
                        />
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                        <span className="text-white text-sm font-medium">{camera.name}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-800/50 rounded-xl">
            No cameras configured
          </div>
        )}
      </section>

      {/* Pre-canned Announcements */}
      <section>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Radio className="w-5 h-5" />
          Quick Announcements
        </h3>

        {liveOps?.announcements && liveOps.announcements.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {liveOps.announcements.map((announcement) => (
              <button
                key={announcement.id}
                onClick={() =>
                  triggerAnnouncement(
                    announcement.message,
                    announcement.target,
                    announcement.volume,
                    announcement.id
                  )
                }
                disabled={announcingId === announcement.id}
                className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {announcement.label}
                  </span>
                  {announcingId === announcement.id ? (
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-gray-400" />
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                  {announcement.message}
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                  <span className="capitalize">{announcement.target}</span>
                  <span>•</span>
                  <span>{announcement.volume}%</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-800/50 rounded-xl">
            No announcements configured
          </div>
        )}
      </section>

      {/* Custom Announcement */}
      <section>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Send className="w-5 h-5" />
          Custom Announcement
        </h3>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Message
              </label>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Enter your announcement message..."
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Target
                </label>
                <div className="relative">
                  <select
                    value={customTarget}
                    onChange={(e) => setCustomTarget(e.target.value as 'cameras' | 'horn' | 'all')}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none cursor-pointer"
                  >
                    <option value="cameras">Cameras Only</option>
                    <option value="horn">Horn Only</option>
                    <option value="all">All (Cameras + Horn)</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Volume: {customVolume}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={customVolume}
                  onChange={(e) => setCustomVolume(Number(e.target.value))}
                  className="w-full h-3 rounded-full appearance-none cursor-pointer bg-gray-200 dark:bg-slate-700 accent-blue-500"
                />
              </div>

              <div className="flex items-end">
                <button
                  onClick={() => triggerAnnouncement(customMessage, customTarget, customVolume)}
                  disabled={!customMessage.trim() || announcingId === 'custom'}
                  className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-slate-700 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {announcingId === 'custom' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Announce
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Site Controls (Barrier for Radisson) */}
      {liveOps?.controls?.barrier?.enabled && (
        <section>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <DoorOpen className="w-5 h-5" />
            Site Controls
          </h3>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-6">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <h4 className="font-medium text-gray-900 dark:text-white">Barrier Control</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Open or close the entry/exit barrier
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => triggerBarrier('open')}
                  disabled={barrierLoading}
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 dark:disabled:bg-slate-700 text-white font-medium rounded-lg transition-colors"
                >
                  Open
                </button>
                <button
                  onClick={() => triggerBarrier('close')}
                  disabled={barrierLoading}
                  className="px-6 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 dark:disabled:bg-slate-700 text-white font-medium rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
        </>
      )}
    </div>
  );
}
