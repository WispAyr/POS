import { useState, useEffect } from 'react';
import { RefreshCw, Camera, Radio, ChevronRight, Wifi } from 'lucide-react';

interface LiveOpsSite {
  id: string;
  name: string;
  liveOps: {
    enabled: boolean;
    cameras: { id: string; name: string; protectId: string }[];
    announcements: { id: string; label: string }[];
    controls: Record<string, any>;
  } | null;
}

interface CarParkLiveProps {
  onSelectSite: (siteId: string) => void;
}

export function CarParkLive({ onSelectSite }: CarParkLiveProps) {
  const [sites, setSites] = useState<LiveOpsSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSites = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/live-ops/sites');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setSites(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sites');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSites();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400">
        <p className="font-medium">Error loading sites</p>
        <p className="text-sm mt-1">{error}</p>
        <button
          onClick={fetchSites}
          className="mt-3 px-4 py-2 bg-red-100 dark:bg-red-900/30 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (sites.length === 0) {
    return (
      <div className="text-center py-16">
        <Radio className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
        <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
          No Live Operations Sites
        </h3>
        <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
          No car parks have live operations enabled. Configure liveOps in site settings to enable
          camera feeds, announcements, and controls.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sites.map((site) => (
          <button
            key={site.id}
            onClick={() => onSelectSite(site.id)}
            className="group bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-6 text-left hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-lg transition-all"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                  <Camera className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-lg">
                    {site.name}
                  </h3>
                  <div className="flex items-center gap-1 text-green-600 dark:text-green-400 text-sm">
                    <Wifi className="w-3.5 h-3.5" />
                    <span>Live</span>
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3">
                <div className="text-gray-500 dark:text-gray-400 mb-1">Cameras</div>
                <div className="font-semibold text-gray-900 dark:text-white text-lg">
                  {site.liveOps?.cameras?.length || 0}
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3">
                <div className="text-gray-500 dark:text-gray-400 mb-1">Announcements</div>
                <div className="font-semibold text-gray-900 dark:text-white text-lg">
                  {site.liveOps?.announcements?.length || 0}
                </div>
              </div>
            </div>

            {site.liveOps?.controls?.barrier?.enabled && (
              <div className="mt-4 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                <div className="w-2 h-2 bg-amber-500 rounded-full" />
                Barrier Control Available
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
