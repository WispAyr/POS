import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  Clock,
  Bell,
  RefreshCw,
  Filter,
  Eye,
  X,
} from 'lucide-react';

interface Alarm {
  id: string;
  definitionId: string;
  status: 'TRIGGERED' | 'ACKNOWLEDGED' | 'RESOLVED';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  siteId?: string;
  message: string;
  details?: any;
  triggeredAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  acknowledgeNotes?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolveNotes?: string;
  definition?: {
    name: string;
    type: string;
    description?: string;
  };
}

interface AlarmStats {
  total: number;
  triggered: number;
  acknowledged: number;
  resolved: number;
  bySeverity: { [key: string]: number };
  byType: { [key: string]: number };
}

const POLL_INTERVAL = 30000;

export function AlarmDashboard() {
  const [activeAlarms, setActiveAlarms] = useState<Alarm[]>([]);
  const [stats, setStats] = useState<AlarmStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAlarm, setSelectedAlarm] = useState<Alarm | null>(null);
  const [filter, setFilter] = useState<{
    severity?: string;
    status?: string;
  }>({});
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [alarmsRes, statsRes] = await Promise.all([
        axios.get('/api/alarms/active'),
        axios.get('/api/alarms/stats'),
      ]);
      setActiveAlarms(alarmsRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Failed to fetch alarms:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  const acknowledgeAlarm = async (id: string, notes?: string) => {
    setActionLoading(true);
    try {
      await axios.post(`/api/alarms/${id}/acknowledge`, {
        acknowledgedBy: 'operator', // TODO: Get from auth
        notes,
      });
      await fetchData();
      setSelectedAlarm(null);
    } catch (error) {
      console.error('Failed to acknowledge alarm:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const resolveAlarm = async (id: string, notes?: string) => {
    setActionLoading(true);
    try {
      await axios.post(`/api/alarms/${id}/resolve`, {
        resolvedBy: 'operator', // TODO: Get from auth
        notes,
      });
      await fetchData();
      setSelectedAlarm(null);
    } catch (error) {
      console.error('Failed to resolve alarm:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-red-500';
      case 'WARNING':
        return 'bg-amber-500';
      default:
        return 'bg-blue-500';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return <AlertTriangle className="w-5 h-5" />;
      case 'WARNING':
        return <AlertCircle className="w-5 h-5" />;
      default:
        return <Info className="w-5 h-5" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'TRIGGERED':
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            Triggered
          </span>
        );
      case 'ACKNOWLEDGED':
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
            Acknowledged
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            Resolved
          </span>
        );
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const filteredAlarms = activeAlarms.filter((alarm) => {
    if (filter.severity && alarm.severity !== filter.severity) return false;
    if (filter.status && alarm.status !== filter.status) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-xl">
              <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Triggered
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats?.triggered || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-xl">
              <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Acknowledged
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats?.acknowledged || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
              <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Resolved Today
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats?.resolved || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <Bell className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Total Active
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats?.total || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Filter:
          </span>
        </div>

        <select
          value={filter.severity || ''}
          onChange={(e) =>
            setFilter((prev) => ({
              ...prev,
              severity: e.target.value || undefined,
            }))
          }
          className="px-3 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-gray-900 dark:text-white"
        >
          <option value="">All Severities</option>
          <option value="CRITICAL">Critical</option>
          <option value="WARNING">Warning</option>
          <option value="INFO">Info</option>
        </select>

        <select
          value={filter.status || ''}
          onChange={(e) =>
            setFilter((prev) => ({
              ...prev,
              status: e.target.value || undefined,
            }))
          }
          className="px-3 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-gray-900 dark:text-white"
        >
          <option value="">All Statuses</option>
          <option value="TRIGGERED">Triggered</option>
          <option value="ACKNOWLEDGED">Acknowledged</option>
        </select>

        <button
          onClick={fetchData}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Alarms List */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-800">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Active Alarms ({filteredAlarms.length})
          </h3>
        </div>

        {filteredAlarms.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              No active alarms. All systems operational.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-slate-800">
            {filteredAlarms.map((alarm) => (
              <div
                key={alarm.id}
                className="p-6 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                onClick={() => setSelectedAlarm(alarm)}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`p-2 rounded-lg ${getSeverityColor(alarm.severity)} text-white`}
                  >
                    {getSeverityIcon(alarm.severity)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-medium text-gray-900 dark:text-white">
                        {alarm.definition?.name || 'System Alert'}
                      </h4>
                      {getStatusBadge(alarm.status)}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      {alarm.message}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-500">
                      <span>Triggered: {formatDate(alarm.triggeredAt)}</span>
                      {alarm.siteId && <span>Site: {alarm.siteId}</span>}
                    </div>
                  </div>

                  <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <Eye className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Alarm Detail Modal */}
      {selectedAlarm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${getSeverityColor(selectedAlarm.severity)} text-white`}
                >
                  {getSeverityIcon(selectedAlarm.severity)}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {selectedAlarm.definition?.name || 'System Alert'}
                  </h3>
                  {getStatusBadge(selectedAlarm.status)}
                </div>
              </div>
              <button
                onClick={() => setSelectedAlarm(null)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                  Message
                </h4>
                <p className="text-gray-900 dark:text-white">
                  {selectedAlarm.message}
                </p>
              </div>

              {selectedAlarm.definition?.description && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                    Description
                  </h4>
                  <p className="text-gray-600 dark:text-gray-400">
                    {selectedAlarm.definition.description}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Triggered At
                  </h4>
                  <p className="text-gray-900 dark:text-white">
                    {formatDate(selectedAlarm.triggeredAt)}
                  </p>
                </div>
                {selectedAlarm.siteId && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Site
                    </h4>
                    <p className="text-gray-900 dark:text-white">
                      {selectedAlarm.siteId}
                    </p>
                  </div>
                )}
              </div>

              {selectedAlarm.acknowledgedAt && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <h4 className="text-sm font-medium text-amber-800 dark:text-amber-400 mb-2">
                    Acknowledged
                  </h4>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    By {selectedAlarm.acknowledgedBy} at{' '}
                    {formatDate(selectedAlarm.acknowledgedAt)}
                  </p>
                  {selectedAlarm.acknowledgeNotes && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                      Notes: {selectedAlarm.acknowledgeNotes}
                    </p>
                  )}
                </div>
              )}

              {selectedAlarm.details && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                    Details
                  </h4>
                  <pre className="p-4 bg-gray-100 dark:bg-slate-800 rounded-lg text-sm overflow-x-auto">
                    {JSON.stringify(selectedAlarm.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-slate-800 flex gap-3">
              {selectedAlarm.status === 'TRIGGERED' && (
                <button
                  onClick={() => acknowledgeAlarm(selectedAlarm.id)}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
                >
                  {actionLoading ? 'Processing...' : 'Acknowledge'}
                </button>
              )}
              {selectedAlarm.status !== 'RESOLVED' && (
                <button
                  onClick={() => resolveAlarm(selectedAlarm.id)}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {actionLoading ? 'Processing...' : 'Resolve'}
                </button>
              )}
              <button
                onClick={() => setSelectedAlarm(null)}
                className="px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
