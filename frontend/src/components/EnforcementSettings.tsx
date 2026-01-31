import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Shield,
  ShieldOff,
  Plus,
  X,
  Calendar,
  Clock,
  AlertTriangle,
  
  History,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

interface SiteStatus {
  siteId: string;
  siteName: string;
  enforcementEnabled: boolean;
  activeRule?: {
    id: string;
    ruleType: string;
    startDate: string;
    endDate: string | null;
    reason: string;
    createdBy: string;
    createdAt: string;
  };
  upcomingRules: number;
  historicalRules: number;
}

interface EnforcementRule {
  id: string;
  siteId: string;
  ruleType: string;
  startDate: string;
  endDate: string | null;
  reason: string;
  createdBy: string;
  active: boolean;
  createdAt: string;
}

interface AuditLog {
  id: string;
  action: string;
  actor: string;
  timestamp: string;
  details: any;
  siteId?: string;
}

export function EnforcementSettings() {
  const [sites, setSites] = useState<SiteStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [_selectedSite, _setSelectedSite] = useState<SiteStatus | null>(null);
  const [siteRules, setSiteRules] = useState<EnforcementRule[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [expandedSites, setExpandedSites] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled'>('all');

  // Create rule form state
  const [formSiteId, setFormSiteId] = useState('');
  const [formDateMode, setFormDateMode] = useState<'current' | 'range'>('current');
  const [formStartDate, setFormStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formEndDate, setFormEndDate] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formBackdate, setFormBackdate] = useState(false);
  const [formBackdateDate, setFormBackdateDate] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchSites();
    fetchAuditLogs();
  }, []);

  const fetchSites = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/enforcement-settings/sites');
      setSites(data);
    } catch (error) {
      console.error('Failed to fetch sites:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSiteRules = async (siteId: string) => {
    try {
      const { data } = await axios.get(`/api/enforcement-settings/sites/${siteId}/rules`);
      setSiteRules(data);
    } catch (error) {
      console.error('Failed to fetch site rules:', error);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const { data } = await axios.get('/api/enforcement-settings/audit?limit=50');
      setAuditLogs(data);
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    }
  };

  const toggleSiteExpand = async (siteId: string) => {
    const newExpanded = new Set(expandedSites);
    if (newExpanded.has(siteId)) {
      newExpanded.delete(siteId);
    } else {
      newExpanded.add(siteId);
      await fetchSiteRules(siteId);
    }
    setExpandedSites(newExpanded);
  };

  const openCreateModal = (site?: SiteStatus) => {
    if (site) {
      setFormSiteId(site.siteId);
    } else {
      setFormSiteId('');
    }
    setFormDateMode('current');
    setFormStartDate(new Date().toISOString().split('T')[0]);
    setFormEndDate('');
    setFormReason('');
    setFormBackdate(false);
    setFormBackdateDate('');
    setShowCreateModal(true);
  };

  const createRule = async () => {
    if (!formSiteId || !formReason || formReason.length < 10) {
      alert('Please select a site and provide a reason (minimum 10 characters)');
      return;
    }

    setCreating(true);
    try {
      let startDate = formStartDate;
      if (formDateMode === 'current' && formBackdate && formBackdateDate) {
        startDate = formBackdateDate;
      }

      await axios.post('/api/enforcement-settings/rules', {
        siteId: formSiteId,
        ruleType: 'DISABLE_ENFORCEMENT',
        startDate: new Date(startDate).toISOString(),
        endDate: formDateMode === 'range' && formEndDate ? new Date(formEndDate).toISOString() : null,
        reason: formReason,
        createdBy: 'Admin', // TODO: Get from auth context
      });

      setShowCreateModal(false);
      fetchSites();
      fetchAuditLogs();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to create rule');
    } finally {
      setCreating(false);
    }
  };

  const endRule = async (ruleId: string, siteName: string) => {
    const reason = prompt(`Reason for ending enforcement pause for ${siteName}:\n(minimum 10 characters)`);
    if (!reason || reason.length < 10) {
      alert('Reason must be at least 10 characters');
      return;
    }

    try {
      await axios.post(`/api/enforcement-settings/rules/${ruleId}/end`, {
        reason,
        endedBy: 'Admin',
      });
      fetchSites();
      fetchAuditLogs();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to end rule');
    }
  };

  const filteredSites = sites.filter((site) => {
    if (filter === 'enabled') return site.enforcementEnabled;
    if (filter === 'disabled') return !site.enforcementEnabled;
    return true;
  });

  const disabledCount = sites.filter((s) => !s.enforcementEnabled).length;
  const enabledCount = sites.filter((s) => s.enforcementEnabled).length;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <Shield className="w-7 h-7 text-blue-600" />
            PCN Engine Settings
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Manage enforcement rules per site. Disable PCN generation for specific sites or date ranges.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAuditLog(!showAuditLog)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
          >
            <History className="w-4 h-4" />
            Audit Log
          </button>
          <button
            onClick={() => openCreateModal()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Rule
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <button
          onClick={() => setFilter('all')}
          className={`p-4 rounded-xl border transition-all ${
            filter === 'all'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-200 dark:border-slate-800 hover:border-gray-300'
          }`}
        >
          <div className="text-3xl font-bold text-gray-900 dark:text-white">{sites.length}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Total Sites</div>
        </button>
        <button
          onClick={() => setFilter('enabled')}
          className={`p-4 rounded-xl border transition-all ${
            filter === 'enabled'
              ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
              : 'border-gray-200 dark:border-slate-800 hover:border-gray-300'
          }`}
        >
          <div className="text-3xl font-bold text-green-600 dark:text-green-400">{enabledCount}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Enforcement Enabled</div>
        </button>
        <button
          onClick={() => setFilter('disabled')}
          className={`p-4 rounded-xl border transition-all ${
            filter === 'disabled'
              ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
              : 'border-gray-200 dark:border-slate-800 hover:border-gray-300'
          }`}
        >
          <div className="text-3xl font-bold text-red-600 dark:text-red-400">{disabledCount}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Enforcement Paused</div>
        </button>
      </div>

      {/* Audit Log Panel */}
      {showAuditLog && (
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <History className="w-5 h-5" />
            Recent Changes
          </h3>
          {auditLogs.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No audit logs found</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg text-sm"
                >
                  <div
                    className={`w-2 h-2 rounded-full mt-2 ${
                      log.action === 'RULE_CREATED'
                        ? 'bg-blue-500'
                        : log.action === 'RULE_ENDED'
                          ? 'bg-green-500'
                          : 'bg-gray-500'
                    }`}
                  ></div>
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {log.action.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(log.timestamp)}
                      </span>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                      {log.details?.siteName || log.siteId} — {log.details?.reason}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">By: {log.actor}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sites List */}
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading sites...</div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-slate-800">
            {filteredSites.map((site) => (
              <div key={site.siteId} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                <div className="p-4 flex items-center gap-4">
                  <button
                    onClick={() => toggleSiteExpand(site.siteId)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {expandedSites.has(site.siteId) ? (
                      <ChevronDown className="w-5 h-5" />
                    ) : (
                      <ChevronRight className="w-5 h-5" />
                    )}
                  </button>

                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      site.enforcementEnabled
                        ? 'bg-green-100 dark:bg-green-900/30'
                        : 'bg-red-100 dark:bg-red-900/30'
                    }`}
                  >
                    {site.enforcementEnabled ? (
                      <Shield className="w-5 h-5 text-green-600 dark:text-green-400" />
                    ) : (
                      <ShieldOff className="w-5 h-5 text-red-600 dark:text-red-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-gray-900 dark:text-white truncate">
                        {site.siteName}
                      </h4>
                      <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                        {site.siteId}
                      </span>
                    </div>
                    {site.activeRule && (
                      <p className="text-sm text-red-600 dark:text-red-400 mt-1 truncate">
                        <AlertTriangle className="w-3 h-3 inline mr-1" />
                        Paused: {site.activeRule.reason}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {site.enforcementEnabled ? (
                      <button
                        onClick={() => openCreateModal(site)}
                        className="px-3 py-1.5 text-sm border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        Pause Enforcement
                      </button>
                    ) : (
                      <button
                        onClick={() => site.activeRule && endRule(site.activeRule.id, site.siteName)}
                        className="px-3 py-1.5 text-sm border border-green-300 dark:border-green-800 text-green-600 dark:text-green-400 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                      >
                        Resume Enforcement
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Site Rules */}
                {expandedSites.has(site.siteId) && (
                  <div className="px-4 pb-4 pl-16 space-y-3">
                    {site.activeRule && (
                      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium text-red-800 dark:text-red-300">
                              Currently Paused
                            </div>
                            <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                              {site.activeRule.reason}
                            </p>
                            <div className="text-xs text-red-600 dark:text-red-500 mt-2">
                              Since: {formatDate(site.activeRule.startDate)} • By:{' '}
                              {site.activeRule.createdBy}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {siteRules.filter((r) => r.id !== site.activeRule?.id).length > 0 && (
                      <div>
                        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Rule History
                        </h5>
                        <div className="space-y-2">
                          {siteRules
                            .filter((r) => r.id !== site.activeRule?.id)
                            .slice(0, 5)
                            .map((rule) => (
                              <div
                                key={rule.id}
                                className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 text-sm"
                              >
                                <div className="flex justify-between">
                                  <span className="text-gray-600 dark:text-gray-400">
                                    {rule.reason}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-xs ${
                                      rule.active
                                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                        : 'bg-gray-200 text-gray-600 dark:bg-slate-700 dark:text-gray-400'
                                    }`}
                                  >
                                    {rule.active ? 'Scheduled' : 'Ended'}
                                  </span>
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                  {formatDate(rule.startDate)} →{' '}
                                  {rule.endDate ? formatDate(rule.endDate) : 'Ongoing'}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Rule Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-lg w-full shadow-2xl">
            <div className="border-b border-gray-200 dark:border-slate-800 p-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <ShieldOff className="w-6 h-6 text-red-500" />
                  Pause Enforcement
                </h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Site Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Site
                </label>
                <select
                  value={formSiteId}
                  onChange={(e) => setFormSiteId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                >
                  <option value="">Select a site...</option>
                  {sites.map((site) => (
                    <option key={site.siteId} value={site.siteId}>
                      {site.siteName} ({site.siteId})
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Mode */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Duration
                </label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setFormDateMode('current')}
                    className={`flex-1 py-2 px-4 rounded-lg border transition-colors ${
                      formDateMode === 'current'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'border-gray-300 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Clock className="w-4 h-4 inline mr-2" />
                    Until Further Notice
                  </button>
                  <button
                    onClick={() => setFormDateMode('range')}
                    className={`flex-1 py-2 px-4 rounded-lg border transition-colors ${
                      formDateMode === 'range'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'border-gray-300 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Calendar className="w-4 h-4 inline mr-2" />
                    Date Range
                  </button>
                </div>
              </div>

              {/* Backdate Option (for current mode) */}
              {formDateMode === 'current' && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formBackdate}
                      onChange={(e) => setFormBackdate(e.target.checked)}
                      className="w-4 h-4 text-amber-600 rounded"
                    />
                    <span className="text-sm text-amber-800 dark:text-amber-300">
                      Backdate this rule (apply to past events)
                    </span>
                  </label>
                  {formBackdate && (
                    <input
                      type="date"
                      value={formBackdateDate}
                      onChange={(e) => setFormBackdateDate(e.target.value)}
                      className="mt-2 w-full px-4 py-2 border border-amber-300 dark:border-amber-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                    />
                  )}
                </div>
              )}

              {/* Date Range Fields */}
              {formDateMode === 'range' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={formStartDate}
                      onChange={(e) => setFormStartDate(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={formEndDate}
                      onChange={(e) => setFormEndDate(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder="Explain why enforcement is being paused (minimum 10 characters)..."
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white resize-none"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  This will be recorded in the audit log
                </p>
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-slate-800 p-4 flex justify-end gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createRule}
                disabled={creating || !formSiteId || !formReason || formReason.length < 10}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? 'Creating...' : 'Pause Enforcement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
