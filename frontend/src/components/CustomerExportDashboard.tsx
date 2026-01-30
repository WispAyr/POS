import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  FileJson,
  Building2,
  Users,
  CreditCard,
  Play,
  Calendar,
  AlertCircle,
  FolderOpen,
} from 'lucide-react';

interface ExportStatus {
  id: string;
  siteId: string | null;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  sitesProcessed: number;
  totalWhitelistRecords: number;
  totalPaymentRecords: number;
  errors: { siteId: string; error: string }[] | null;
  completedAt: string | null;
  startedAt: string;
  scheduler: {
    enabled: boolean;
    cronSchedule: string;
    nextRun: string | null;
  };
}

interface ManifestSite {
  siteId: string;
  siteName: string;
  file: string;
  whitelistCount: number;
  activePaymentsCount: number;
  generatedAt: string;
}

interface Manifest {
  generatedAt: string;
  sites: ManifestSite[];
}

export function CustomerExportDashboard() {
  const [status, setStatus] = useState<ExportStatus | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [statusRes, manifestRes] = await Promise.allSettled([
        axios.get('/api/customer-export/status'),
        axios.get('/api/customer-export/manifest'),
      ]);

      if (statusRes.status === 'fulfilled') {
        setStatus(statusRes.value.data);
      }

      if (manifestRes.status === 'fulfilled') {
        setManifest(manifestRes.value.data);
      }
    } catch (err) {
      console.error('Failed to fetch export data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const triggerExport = async (siteId?: string) => {
    setExporting(true);
    setError(null);
    try {
      const url = siteId
        ? `/api/customer-export/generate/${siteId}`
        : '/api/customer-export/generate';
      await axios.post(url);
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const regenerateManifest = async () => {
    try {
      await axios.post('/api/customer-export/manifest/regenerate');
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to regenerate manifest');
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.round(diffMs / 60000);

    if (diffMins < 0) {
      return `${Math.abs(diffMins)} min ago`;
    } else if (diffMins < 60) {
      return `in ${diffMins} min`;
    } else {
      const diffHours = Math.round(diffMins / 60);
      return `in ${diffHours} hr`;
    }
  };

  const getStatusBadge = (exportStatus: string) => {
    switch (exportStatus) {
      case 'COMPLETED':
        return (
          <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle className="w-3 h-3" /> Completed
          </span>
        );
      case 'FAILED':
        return (
          <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            <XCircle className="w-3 h-3" /> Failed
          </span>
        );
      case 'PENDING':
        return (
          <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            <Clock className="w-3 h-3" /> Pending
          </span>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  const totalWhitelist = manifest?.sites.reduce((sum, s) => sum + s.whitelistCount, 0) || 0;
  const totalPayments = manifest?.sites.reduce((sum, s) => sum + s.activePaymentsCount, 0) || 0;

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
          <span className="text-red-800 dark:text-red-300">{error}</span>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Sites Exported</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {manifest?.sites.length || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
              <Users className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Whitelist Entries</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {totalWhitelist.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
              <CreditCard className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Active Payments</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {totalPayments.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-xl">
              <Calendar className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Next Export</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {status?.scheduler.enabled
                  ? formatRelativeTime(status.scheduler.nextRun)
                  : 'Disabled'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Export Controls */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm">
        <div className="p-6 border-b border-gray-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Export Controls
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Generate JSON data files for customer-facing interfaces
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => fetchData()}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
              <button
                onClick={() => triggerExport()}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {exporting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Export All Sites
              </button>
            </div>
          </div>
        </div>

        {/* Last Export Status */}
        {status && (
          <div className="p-6 bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Last Export</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {formatDate(status.completedAt || status.startedAt)}
                  </p>
                </div>
                {getStatusBadge(status.status)}
              </div>
              <div className="text-right text-sm text-gray-500 dark:text-gray-400">
                <p>{status.sitesProcessed} sites processed</p>
                <p>
                  {status.totalWhitelistRecords} whitelist, {status.totalPaymentRecords} payments
                </p>
              </div>
            </div>

            {status.errors && status.errors.length > 0 && (
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <p className="text-sm font-medium text-red-800 dark:text-red-400 mb-2">
                  Export Errors:
                </p>
                <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                  {status.errors.map((err, idx) => (
                    <li key={idx}>
                      {err.siteId}: {err.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Scheduler Info */}
        {status?.scheduler && (
          <div className="p-6 border-b border-gray-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-900 dark:text-white">
                  Scheduler:{' '}
                  <span
                    className={
                      status.scheduler.enabled
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-500'
                    }
                  >
                    {status.scheduler.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </p>
                {status.scheduler.enabled && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Cron: {status.scheduler.cronSchedule} &bull; Next run:{' '}
                    {formatDate(status.scheduler.nextRun)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Manifest / Site List */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileJson className="w-5 h-5 text-gray-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Exported Sites ({manifest?.sites.length || 0})
            </h3>
          </div>
          {manifest && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span>Generated: {formatDate(manifest.generatedAt)}</span>
              <button
                onClick={regenerateManifest}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded transition-colors"
                title="Regenerate manifest"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {!manifest || manifest.sites.length === 0 ? (
          <div className="p-12 text-center">
            <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">No exports yet</p>
            <button
              onClick={() => triggerExport()}
              disabled={exporting}
              className="mt-4 text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              Run first export
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Site
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    File
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Whitelist
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Payments
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Generated
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
                {manifest.sites.map((site) => (
                  <tr
                    key={site.siteId}
                    className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{site.siteName}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{site.siteId}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <code className="text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded">
                        {site.file}
                      </code>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className="text-gray-900 dark:text-white">{site.whitelistCount}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className="text-gray-900 dark:text-white">
                        {site.activePaymentsCount}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(site.generatedAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => triggerExport(site.siteId)}
                        disabled={exporting}
                        className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors disabled:opacity-50"
                        title="Re-export this site"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default CustomerExportDashboard;
