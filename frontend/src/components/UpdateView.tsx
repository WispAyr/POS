import { useState, useEffect, useCallback } from 'react';
import {
  Download,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  GitBranch,
  GitCommit,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';

interface UpdateStatus {
  currentCommit: string;
  currentBranch: string;
  remoteCommit: string | null;
  updateAvailable: boolean;
  lastChecked: Date;
  lastUpdated: Date | null;
  updateInProgress: boolean;
}

interface ChangelogCommit {
  hash: string;
  message: string;
  date: string;
  author: string;
}

const API_BASE = 'http://localhost:3001';

export function UpdateView() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [changelog, setChangelog] = useState<ChangelogCommit[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updateResult, setUpdateResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const checkForUpdates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, changelogRes] = await Promise.all([
        fetch(`${API_BASE}/api/update/status`),
        fetch(`${API_BASE}/api/update/changelog`),
      ]);

      if (!statusRes.ok) throw new Error('Failed to check update status');

      const statusData = await statusRes.json();
      const changelogData = await changelogRes.json();

      setStatus(statusData);
      setChangelog(changelogData.commits || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check for updates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkForUpdates();
    // Check for updates every 5 minutes
    const interval = setInterval(checkForUpdates, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [checkForUpdates]);

  const triggerUpdate = async () => {
    if (updating) return;

    const confirmed = window.confirm(
      'This will pull the latest changes from GitHub, rebuild the application, and restart the server. The application will be temporarily unavailable. Continue?'
    );

    if (!confirmed) return;

    setUpdating(true);
    setError(null);
    setUpdateResult(null);

    try {
      const response = await fetch(`${API_BASE}/api/update/trigger`, {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        setUpdateResult({ success: true, message: data.message });
        // Show countdown before expected restart
        let countdown = 5;
        const countdownInterval = setInterval(() => {
          countdown--;
          if (countdown <= 0) {
            clearInterval(countdownInterval);
            // Try to reconnect
            setTimeout(() => {
              window.location.reload();
            }, 3000);
          }
          setUpdateResult({
            success: true,
            message: `${data.message} Reloading in ${countdown}...`,
          });
        }, 1000);
      } else {
        setUpdateResult({ success: false, message: data.message });
        setUpdating(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update request failed');
      setUpdating(false);
    }
  };

  const formatDate = (dateString: string | Date | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl p-6 text-white">
        <div className="flex items-center gap-3 mb-4">
          <Download className="w-6 h-6" />
          <h2 className="text-xl font-semibold">System Updates</h2>
        </div>
        <p className="text-indigo-100 text-sm">
          Keep your POS system up to date with the latest features and security
          fixes from GitHub.
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
          <div>
            <p className="font-medium text-red-800 dark:text-red-200">Error</p>
            <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
          </div>
        </div>
      )}

      {/* Update Result */}
      {updateResult && (
        <div
          className={`${
            updateResult.success
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          } border rounded-xl p-4 flex items-start gap-3`}
        >
          {updateResult.success ? (
            <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
          ) : (
            <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
          )}
          <div>
            <p
              className={`font-medium ${
                updateResult.success
                  ? 'text-green-800 dark:text-green-200'
                  : 'text-red-800 dark:text-red-200'
              }`}
            >
              {updateResult.success ? 'Update Successful' : 'Update Failed'}
            </p>
            <p
              className={`text-sm ${
                updateResult.success
                  ? 'text-green-600 dark:text-green-300'
                  : 'text-red-600 dark:text-red-300'
              }`}
            >
              {updateResult.message}
            </p>
          </div>
        </div>
      )}

      {/* Current Version Status */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
              <GitBranch className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Current Version
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Branch: {status?.currentBranch || 'Unknown'}
              </p>
            </div>
          </div>
          <button
            onClick={checkForUpdates}
            disabled={loading}
            className="px-4 py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Check for Updates
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
              <GitCommit className="w-4 h-4" />
              Local Commit
            </div>
            <code className="text-sm font-mono text-gray-900 dark:text-white">
              {status?.currentCommit?.substring(0, 12) || 'Unknown'}
            </code>
          </div>
          <div className="p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
              <Clock className="w-4 h-4" />
              Last Checked
            </div>
            <span className="text-sm text-gray-900 dark:text-white">
              {formatDate(status?.lastChecked ?? null)}
            </span>
          </div>
        </div>

        {/* Update Status */}
        <div className="mt-6 pt-6 border-t border-gray-100 dark:border-slate-800">
          {status?.updateAvailable ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                <div>
                  <p className="font-medium text-green-600 dark:text-green-400">
                    Update Available
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Remote: {status.remoteCommit?.substring(0, 12)}
                  </p>
                </div>
              </div>
              <button
                onClick={triggerUpdate}
                disabled={updating || status.updateInProgress}
                className="px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-sm"
              >
                {updating || status.updateInProgress ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    Update Now
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-gray-400 dark:text-gray-500" />
              <p className="text-gray-500 dark:text-gray-400">
                You're running the latest version
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Changelog */}
      {changelog.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 p-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <GitCommit className="w-5 h-5" />
            Pending Changes ({changelog.length} commits)
          </h3>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {changelog.map((commit, index) => (
              <div
                key={commit.hash}
                className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-slate-800/50 rounded-lg"
              >
                <div className="flex flex-col items-center">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full" />
                  {index < changelog.length - 1 && (
                    <div className="w-0.5 h-full bg-gray-200 dark:bg-slate-700 mt-1" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {commit.message}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <code className="font-mono">{commit.hash}</code>
                    <span>{commit.author}</span>
                    <span>
                      {new Date(commit.date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Update Instructions */}
      <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-6 border border-amber-100 dark:border-amber-900/20">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-2">
              Before Updating
            </h3>
            <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
              <li className="flex items-center gap-2">
                <ArrowRight className="w-3 h-3" />
                The application will restart after updating
              </li>
              <li className="flex items-center gap-2">
                <ArrowRight className="w-3 h-3" />
                Any unsaved work in the browser may be lost
              </li>
              <li className="flex items-center gap-2">
                <ArrowRight className="w-3 h-3" />
                Database migrations (if any) will be applied automatically
              </li>
              <li className="flex items-center gap-2">
                <ArrowRight className="w-3 h-3" />
                Ensure no critical operations are in progress
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Last Updated */}
      {status?.lastUpdated && (
        <div className="text-center text-sm text-gray-500 dark:text-gray-400">
          Last updated: {formatDate(status.lastUpdated)}
        </div>
      )}
    </div>
  );
}
