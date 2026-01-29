import { useState } from 'react';
import { Search, Clock, User, FileText, Download, Eye } from 'lucide-react';

const API_BASE = '';

interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actor: string;
  actorType?: string;
  timestamp: string;
  details: any;
  vrm?: string;
  siteId?: string;
  relatedEntities?: Array<{
    entityType: string;
    entityId: string;
    relationship: string;
  }>;
}

interface TimelineEvent {
  timestamp: string;
  type: string;
  description: string;
  auditLog: AuditLog;
}

export function AuditView() {
  const [searchType, setSearchType] = useState<
    'vrm' | 'entity' | 'decision' | 'enforcement'
  >('vrm');
  const [searchValue, setSearchValue] = useState('');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [enforcementHistory, setEnforcementHistory] = useState<any>(null);

  const actionColors: { [key: string]: string } = {
    MOVEMENT_INGESTED:
      'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    SESSION_CREATED:
      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    SESSION_COMPLETED:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    DECISION_CREATED:
      'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    ENFORCEMENT_REVIEWED:
      'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    PAYMENT_INGESTED:
      'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
    PERMIT_INGESTED:
      'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
    RECONCILIATION_TRIGGERED:
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    DECISION_RECONCILED:
      'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
  };

  const getActionColor = (action: string) => {
    return (
      actionColors[action] ||
      'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
    );
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const searchAudit = async () => {
    if (!searchValue.trim()) {
      setError('Please enter a search value');
      return;
    }

    setLoading(true);
    setError(null);
    setSelectedLog(null);
    setEnforcementHistory(null);

    try {
      let url = '';
      if (searchType === 'vrm') {
        url = `${API_BASE}/api/audit/vrm/${encodeURIComponent(searchValue.toUpperCase().replace(/\s/g, ''))}`;
      } else if (searchType === 'entity') {
        const [entityType, entityId] = searchValue.split(':');
        url = `${API_BASE}/api/audit/entity/${entityType}/${entityId}`;
      } else if (searchType === 'decision') {
        url = `${API_BASE}/api/audit/decision/${searchValue}`;
      } else if (searchType === 'enforcement') {
        url = `${API_BASE}/api/audit/enforcement/${searchValue}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch audit logs');
      }

      const data = await response.json();

      if (searchType === 'enforcement') {
        setEnforcementHistory(data);
        setAuditLogs(data.auditTrail || []);
        setTimeline(data.timeline || []);
      } else if (searchType === 'vrm' && data.timeline) {
        setTimeline(data.timeline || []);
        setAuditLogs(data.events || []);
      } else {
        setAuditLogs(Array.isArray(data) ? data : [data]);
        setTimeline([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch audit logs');
      setAuditLogs([]);
      setTimeline([]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchAudit();
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Section */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-800 transition-colors">
        <div className="flex items-center gap-4 mb-4">
          <Search className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Audit Trail Search
          </h3>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Search Type
            </label>
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as any)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            >
              <option value="vrm">VRM (Vehicle Registration)</option>
              <option value="entity">Entity (Type:ID)</option>
              <option value="decision">Decision ID</option>
              <option value="enforcement">Enforcement Case</option>
            </select>
          </div>

          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {searchType === 'vrm'
                ? 'VRM'
                : searchType === 'entity'
                  ? 'Entity (e.g., SESSION:abc123)'
                  : searchType === 'decision'
                    ? 'Decision ID'
                    : 'Decision ID'}
            </label>
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={
                searchType === 'vrm'
                  ? 'Enter VRM (e.g., ABC123)'
                  : searchType === 'entity'
                    ? 'SESSION:abc123'
                    : 'Enter ID'
              }
              className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={searchAudit}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Searching...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Search
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 rounded-lg text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Enforcement Case History */}
      {enforcementHistory && (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-800 transition-colors">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Enforcement Case History
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Decision ID
              </p>
              <p className="text-sm font-mono text-gray-900 dark:text-white">
                {enforcementHistory.decisionId}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Outcome
              </p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {enforcementHistory.decision?.outcome}
              </p>
            </div>
            {enforcementHistory.entryMovement && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Entry Time
                </p>
                <p className="text-sm text-gray-900 dark:text-white">
                  {formatTimestamp(enforcementHistory.entryMovement.timestamp)}
                </p>
              </div>
            )}
            {enforcementHistory.exitMovement && (
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Exit Time
                </p>
                <p className="text-sm text-gray-900 dark:text-white">
                  {formatTimestamp(enforcementHistory.exitMovement.timestamp)}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Timeline View */}
      {timeline.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-800 transition-colors">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Timeline
          </h3>
          <div className="space-y-4">
            {timeline.map((event, index) => (
              <div key={index} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-3 h-3 rounded-full bg-blue-600"></div>
                  {index < timeline.length - 1 && (
                    <div className="w-0.5 h-full bg-gray-300 dark:bg-slate-700 mt-2"></div>
                  )}
                </div>
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${getActionColor(event.type)}`}
                    >
                      {event.type}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatTimestamp(event.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {event.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit Logs List */}
      {auditLogs.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 transition-colors">
          <div className="p-6 border-b border-gray-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Audit Logs ({auditLogs.length})
              </h3>
              <button
                onClick={() => {
                  const data = JSON.stringify(auditLogs, null, 2);
                  const blob = new Blob([data], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `audit-${searchValue}-${Date.now()}.json`;
                  a.click();
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Export JSON
              </button>
            </div>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-slate-800">
            {auditLogs.map((log) => (
              <div
                key={log.id}
                className="p-6 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                onClick={() => setSelectedLog(log)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${getActionColor(log.action)}`}
                      >
                        {log.action}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {log.entityType}:{log.entityId.substring(0, 8)}...
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {formatTimestamp(log.timestamp)}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        {log.actor} ({log.actorType || 'SYSTEM'})
                      </span>
                      {log.vrm && (
                        <span className="font-mono text-blue-600 dark:text-blue-400">
                          {log.vrm}
                        </span>
                      )}
                    </div>
                  </div>
                  <Eye className="w-5 h-5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Log Detail Modal */}
      {selectedLog && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Audit Log Details
                </h3>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Action
                </p>
                <p className="text-sm text-gray-900 dark:text-white">
                  {selectedLog.action}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Entity
                </p>
                <p className="text-sm text-gray-900 dark:text-white">
                  {selectedLog.entityType}: {selectedLog.entityId}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Actor
                </p>
                <p className="text-sm text-gray-900 dark:text-white">
                  {selectedLog.actor} ({selectedLog.actorType || 'SYSTEM'})
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Timestamp
                </p>
                <p className="text-sm text-gray-900 dark:text-white">
                  {formatTimestamp(selectedLog.timestamp)}
                </p>
              </div>
              {selectedLog.details && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Details
                  </p>
                  <pre className="text-xs bg-gray-50 dark:bg-slate-800 p-3 rounded-lg overflow-x-auto text-gray-900 dark:text-white">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}
              {selectedLog.relatedEntities &&
                selectedLog.relatedEntities.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Related Entities
                    </p>
                    <div className="space-y-1">
                      {selectedLog.relatedEntities.map((rel, idx) => (
                        <div
                          key={idx}
                          className="text-xs text-gray-600 dark:text-gray-400"
                        >
                          {rel.entityType}: {rel.entityId} ({rel.relationship})
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {!loading && auditLogs.length === 0 && !error && searchValue && (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-12 text-center border border-gray-200 dark:border-slate-800 transition-colors">
          <FileText className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            No audit logs found. Try a different search.
          </p>
        </div>
      )}
    </div>
  );
}
