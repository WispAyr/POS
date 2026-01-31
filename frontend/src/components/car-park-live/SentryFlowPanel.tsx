import { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  ShieldOff,
  ShieldAlert,
  RefreshCw,
  Bell,
  BellOff,
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Eye,
  Loader2,
} from 'lucide-react';

interface Rule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  triggerCount: number;
  lastTriggered?: string;
  escalation?: {
    enabled: boolean;
    levels: { threshold: number; actions: any[] }[];
  };
}

interface SentryFlowStatus {
  status: string;
  protect: { connected: boolean; host: string };
  hailo: { enabled: boolean; available: boolean };
  alarm: { mode: string; lastChanged: string };
  rules: { total: number; enabled: number };
  events: { logged: number };
}

interface Event {
  id: string;
  timestamp: string;
  event: {
    type: string;
    cameraName: string;
    score: number;
    metadata?: any;
  };
  rulesTriggered: string[];
  actionsExecuted: string[];
}

interface SentryFlowPanelProps {
  siteId: string;
}

export function SentryFlowPanel({ siteId }: SentryFlowPanelProps) {
  const [status, setStatus] = useState<SentryFlowStatus | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEvents, setShowEvents] = useState(false);
  const [togglingRule, setTogglingRule] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, rulesRes, eventsRes] = await Promise.all([
        fetch('/api/sentryflow/status'),
        fetch(`/api/sentryflow/rules/site/${siteId}`),
        fetch('/api/sentryflow/events?limit=20'),
      ]);

      if (!statusRes.ok || !rulesRes.ok) {
        throw new Error('Failed to fetch SentryFlow data');
      }

      setStatus(await statusRes.json());
      setRules(await rulesRes.json());
      if (eventsRes.ok) {
        setEvents(await eventsRes.json());
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to SentryFlow');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  const toggleRule = async (ruleId: string) => {
    setTogglingRule(ruleId);
    try {
      const response = await fetch(`/api/sentryflow/rules/${ruleId}/toggle`, {
        method: 'PATCH',
      });
      if (response.ok) {
        // Refresh rules
        const rulesRes = await fetch(`/api/sentryflow/rules/site/${siteId}`);
        if (rulesRes.ok) {
          setRules(await rulesRes.json());
        }
      }
    } catch (err) {
      console.error('Failed to toggle rule:', err);
    } finally {
      setTogglingRule(null);
    }
  };

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-6">
        <div className="flex items-center justify-center gap-2 text-gray-500">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading SentryFlow...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 p-6">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertTriangle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  const alarmArmed = status?.alarm?.mode === 'armed';

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Shield className="w-5 h-5" />
          SentryFlow Automation
        </h3>
        <button
          onClick={fetchData}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            {status?.protect?.connected ? (
              <CheckCircle className="w-4 h-4 text-green-500" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-500" />
            )}
            <span className="text-sm text-gray-500 dark:text-gray-400">UniFi Protect</span>
          </div>
          <div className="text-lg font-semibold text-gray-900 dark:text-white">
            {status?.protect?.connected ? 'Connected' : 'Disconnected'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            {status?.hailo?.available ? (
              <CheckCircle className="w-4 h-4 text-green-500" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
            )}
            <span className="text-sm text-gray-500 dark:text-gray-400">Hailo AI</span>
          </div>
          <div className="text-lg font-semibold text-gray-900 dark:text-white">
            {status?.hailo?.available ? 'Online' : 'Offline'}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-blue-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Active Rules</span>
          </div>
          <div className="text-lg font-semibold text-gray-900 dark:text-white">
            {rules.filter(r => r.enabled).length} / {rules.length}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            {alarmArmed ? (
              <ShieldAlert className="w-4 h-4 text-red-500" />
            ) : (
              <ShieldOff className="w-4 h-4 text-gray-400" />
            )}
            <span className="text-sm text-gray-500 dark:text-gray-400">Alarm Mode</span>
          </div>
          <div className={`text-lg font-semibold ${alarmArmed ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
            {alarmArmed ? 'Armed' : 'Disarmed'}
          </div>
        </div>
      </div>

      {/* Rules List */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800">
        <div className="p-4 border-b border-gray-200 dark:border-slate-700">
          <h4 className="font-medium text-gray-900 dark:text-white">Automation Rules</h4>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-slate-800">
          {rules.length === 0 ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              No rules configured for this site
            </div>
          ) : (
            rules.map((rule) => (
              <div key={rule.id} className="p-4 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {rule.name}
                    </span>
                    {rule.escalation?.enabled && (
                      <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs rounded-full">
                        Escalation
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {rule.description || 'No description'}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Activity className="w-3 h-3" />
                      {rule.triggerCount} triggers
                    </span>
                    {rule.lastTriggered && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Last: {formatTimestamp(rule.lastTriggered)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => toggleRule(rule.id)}
                  disabled={togglingRule === rule.id}
                  className={`p-2 rounded-lg transition-colors ${
                    rule.enabled
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                      : 'bg-gray-100 dark:bg-slate-800 text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {togglingRule === rule.id ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : rule.enabled ? (
                    <Bell className="w-5 h-5" />
                  ) : (
                    <BellOff className="w-5 h-5" />
                  )}
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Recent Events (Collapsible) */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800">
        <button
          onClick={() => setShowEvents(!showEvents)}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors rounded-xl"
        >
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-gray-500" />
            <h4 className="font-medium text-gray-900 dark:text-white">Recent Events</h4>
            <span className="px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 text-xs rounded-full">
              {events.length}
            </span>
          </div>
          {showEvents ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </button>
        
        {showEvents && (
          <div className="border-t border-gray-200 dark:border-slate-700 max-h-64 overflow-y-auto">
            {events.length === 0 ? (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                No recent events
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-800">
                {events.slice(0, 10).map((event) => (
                  <div key={event.id} className="p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {event.event.type}
                      </span>
                      <span className="text-gray-400 text-xs">
                        {formatTimestamp(event.timestamp)}
                      </span>
                    </div>
                    <div className="text-gray-500 dark:text-gray-400 text-xs mt-1">
                      {event.event.cameraName}
                      {event.event.metadata?.licensePlate && (
                        <span className="ml-2 font-mono bg-gray-100 dark:bg-slate-800 px-1 rounded">
                          {event.event.metadata.licensePlate}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
