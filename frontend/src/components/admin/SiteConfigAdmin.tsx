import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Camera,
  Plus,
  X,
  RefreshCw,
  Save,
  Trash2,
  Settings,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Move,
  Shield,
  CreditCard,
} from 'lucide-react';

interface Camera {
  id: string;
  name?: string;
  direction?: 'ENTRY' | 'EXIT' | 'INTERNAL';
  ipAddress?: string;
  streamUrl?: string;
}

interface SiteConfig {
  cameras?: Camera[];
  gracePeriods?: { entry: number; exit: number; overstay?: number };
  operatingModel?: string;
  enforcementType?: 'AUTO' | 'PAY_AND_DISPLAY' | 'PERMIT_ONLY' | 'MIXED';
}

interface Site {
  id: string;
  name: string;
  active: boolean;
  config: SiteConfig;
}

export function SiteConfigAdmin() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSite, setExpandedSite] = useState<string | null>(null);
  const [editingCamera, setEditingCamera] = useState<{ siteId: string; camera: Camera } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchSites();
  }, []);

  const fetchSites = async () => {
    try {
      setLoading(true);
      const { data } = await axios.get('/api/sites?active=true');
      setSites(data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch sites');
    } finally {
      setLoading(false);
    }
  };

  const updateSiteConfig = async (siteId: string, config: Partial<SiteConfig>) => {
    try {
      await axios.patch(`/api/sites/${siteId}/config`, config);
      await fetchSites();
    } catch (err) {
      setError('Failed to update site config');
    }
  };

  const syncFromMonday = async () => {
    try {
      setSyncing(true);
      await axios.post('/integration/monday/sync-sites');
      setSyncMessage('Sites synced from Monday.com');
      await fetchSites();
      setTimeout(() => setSyncMessage(null), 3000);
    } catch (err) {
      setSyncMessage('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleAddCamera = (site: Site) => {
    setEditingCamera({
      siteId: site.id,
      camera: { id: '', name: '', direction: 'ENTRY' },
    });
  };

  const handleEditCamera = (site: Site, camera: Camera) => {
    setEditingCamera({ siteId: site.id, camera: { ...camera } });
  };

  const handleDeleteCamera = async (site: Site, cameraId: string) => {
    const cameras = (site.config.cameras || []).filter((c) => c.id !== cameraId);
    await updateSiteConfig(site.id, { cameras });
  };

  const handleSaveCamera = async () => {
    if (!editingCamera) return;
    const site = sites.find((s) => s.id === editingCamera.siteId);
    if (!site) return;

    const cameras = [...(site.config.cameras || [])];
    const existingIndex = cameras.findIndex((c) => c.id === editingCamera.camera.id);

    if (existingIndex >= 0) {
      cameras[existingIndex] = editingCamera.camera;
    } else {
      cameras.push(editingCamera.camera);
    }

    await updateSiteConfig(site.id, { cameras });
    setEditingCamera(null);
  };

  const getDirectionIcon = (direction?: string) => {
    switch (direction) {
      case 'ENTRY':
        return <ArrowDownRight className="w-4 h-4 text-green-500" />;
      case 'EXIT':
        return <ArrowUpRight className="w-4 h-4 text-orange-500" />;
      case 'INTERNAL':
        return <Move className="w-4 h-4 text-blue-500" />;
      default:
        return <Camera className="w-4 h-4 text-gray-400" />;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Site Configuration</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage cameras and settings for {sites.length} active sites
          </p>
        </div>
        <button
          onClick={syncFromMonday}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          Sync from Monday
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}
      {syncMessage && (
        <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg">
          {syncMessage}
        </div>
      )}

      {/* Sites List */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-slate-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Site
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Cameras
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Grace Periods
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Enforcement Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Model
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
            {sites.map((site) => (
              <>
                <tr
                  key={site.id}
                  className="hover:bg-gray-50 dark:hover:bg-slate-800/50 cursor-pointer"
                  onClick={() => setExpandedSite(expandedSite === site.id ? null : site.id)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {expandedSite === site.id ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">{site.name}</div>
                        <div className="text-xs text-gray-500 font-mono">{site.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {(site.config.cameras || []).slice(0, 3).map((cam) => (
                        <span
                          key={cam.id}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-slate-800 rounded text-xs"
                        >
                          {getDirectionIcon(cam.direction)}
                          {cam.name || cam.id}
                        </span>
                      ))}
                      {(site.config.cameras || []).length > 3 && (
                        <span className="text-xs text-gray-500">
                          +{(site.config.cameras || []).length - 3} more
                        </span>
                      )}
                      {!(site.config.cameras || []).length && (
                        <span className="text-xs text-gray-400">No cameras</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    Entry: {site.config.gracePeriods?.entry || 10}min
                    <br />
                    Exit: {site.config.gracePeriods?.exit || 10}min
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                      site.config.enforcementType === 'PAY_AND_DISPLAY'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : site.config.enforcementType === 'PERMIT_ONLY'
                          ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400'
                          : site.config.enforcementType === 'MIXED'
                            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}>
                      {site.config.enforcementType === 'PAY_AND_DISPLAY' && <CreditCard className="w-3 h-3" />}
                      {site.config.enforcementType === 'PERMIT_ONLY' && <Shield className="w-3 h-3" />}
                      {site.config.enforcementType === 'MIXED' && <Settings className="w-3 h-3" />}
                      {(!site.config.enforcementType || site.config.enforcementType === 'AUTO') && <Settings className="w-3 h-3" />}
                      {site.config.enforcementType?.replace(/_/g, ' ') || 'Auto'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs">
                      {site.config.operatingModel || 'ANPR'}
                    </span>
                  </td>
                </tr>
                {expandedSite === site.id && (
                  <tr className="bg-gray-50 dark:bg-slate-800/30">
                    <td colSpan={5} className="px-6 py-4">
                      <div className="space-y-4">
                        {/* Cameras Section */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                              <Camera className="w-4 h-4" />
                              Cameras ({(site.config.cameras || []).length})
                            </h4>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddCamera(site);
                              }}
                              className="flex items-center gap-1 px-2 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                            >
                              <Plus className="w-4 h-4" />
                              Add Camera
                            </button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {(site.config.cameras || []).map((cam) => (
                              <div
                                key={cam.id}
                                className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700"
                              >
                                <div className="flex items-center gap-2">
                                  {getDirectionIcon(cam.direction)}
                                  <div>
                                    <div className="font-medium text-sm text-gray-900 dark:text-white">
                                      {cam.name || cam.id}
                                    </div>
                                    <div className="text-xs text-gray-500 font-mono">{cam.id}</div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditCamera(site, cam);
                                    }}
                                    className="p-1 text-gray-400 hover:text-blue-500"
                                  >
                                    <Settings className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteCamera(site, cam.id);
                                    }}
                                    className="p-1 text-gray-400 hover:text-red-500"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Enforcement Settings Section */}
                        <div className="border-t border-gray-200 dark:border-slate-700 pt-4 mt-4">
                          <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2 mb-3">
                            <Shield className="w-4 h-4" />
                            Enforcement Settings
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Enforcement Type */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Enforcement Type
                              </label>
                              <select
                                value={site.config.enforcementType || 'AUTO'}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  updateSiteConfig(site.id, { 
                                    enforcementType: e.target.value as SiteConfig['enforcementType']
                                  });
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                              >
                                <option value="AUTO">Auto (detect from payments)</option>
                                <option value="PAY_AND_DISPLAY">Pay & Display</option>
                                <option value="PERMIT_ONLY">Permit Only</option>
                                <option value="MIXED">Mixed (Pay + Permit)</option>
                              </select>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {site.config.enforcementType === 'PAY_AND_DISPLAY' 
                                  ? 'Violations show as "No Valid Payment"'
                                  : site.config.enforcementType === 'PERMIT_ONLY'
                                    ? 'Violations show as "Unauthorised Parking"'
                                    : site.config.enforcementType === 'MIXED'
                                      ? 'Check both payments and permits'
                                      : 'Auto-detect based on payment history'}
                              </p>
                            </div>

                            {/* Overstay Grace Period */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Overstay Grace (minutes)
                              </label>
                              <input
                                type="number"
                                min="0"
                                max="60"
                                value={site.config.gracePeriods?.overstay ?? 15}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  updateSiteConfig(site.id, { 
                                    gracePeriods: {
                                      ...site.config.gracePeriods,
                                      entry: site.config.gracePeriods?.entry ?? 10,
                                      exit: site.config.gracePeriods?.exit ?? 10,
                                      overstay: parseInt(e.target.value) || 15
                                    }
                                  });
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm"
                              />
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Allow this many minutes past payment expiry before flagging as overstay
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Camera Edit Modal */}
      {editingCamera && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {editingCamera.camera.id ? 'Edit Camera' : 'Add Camera'}
              </h3>
              <button
                onClick={() => setEditingCamera(null)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Camera ID
                </label>
                <input
                  type="text"
                  value={editingCamera.camera.id}
                  onChange={(e) =>
                    setEditingCamera({
                      ...editingCamera,
                      camera: { ...editingCamera.camera, id: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                  placeholder="Unique identifier"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={editingCamera.camera.name || ''}
                  onChange={(e) =>
                    setEditingCamera({
                      ...editingCamera,
                      camera: { ...editingCamera.camera, name: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                  placeholder="Friendly name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Direction
                </label>
                <select
                  value={editingCamera.camera.direction || ''}
                  onChange={(e) =>
                    setEditingCamera({
                      ...editingCamera,
                      camera: {
                        ...editingCamera.camera,
                        direction: e.target.value as Camera['direction'],
                      },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                >
                  <option value="">Not set</option>
                  <option value="ENTRY">Entry</option>
                  <option value="EXIT">Exit</option>
                  <option value="INTERNAL">Internal</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  IP Address
                </label>
                <input
                  type="text"
                  value={editingCamera.camera.ipAddress || ''}
                  onChange={(e) =>
                    setEditingCamera({
                      ...editingCamera,
                      camera: { ...editingCamera.camera, ipAddress: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                  placeholder="192.168.1.100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Stream URL
                </label>
                <input
                  type="text"
                  value={editingCamera.camera.streamUrl || ''}
                  onChange={(e) =>
                    setEditingCamera({
                      ...editingCamera,
                      camera: { ...editingCamera.camera, streamUrl: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                  placeholder="rtsp://..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setEditingCamera(null)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCamera}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Save className="w-4 h-4" />
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SiteConfigAdmin;
