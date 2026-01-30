import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Mail,
  Globe,
  Webhook,
  FolderInput,
  Plus,
  Settings,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  Link,
  Unlink,
  Play,
  TestTube,
  ChevronDown,
  ChevronUp,
  X,
  Save,
  FileText,
} from 'lucide-react';

interface PaymentProvider {
  id: string;
  name: string;
  type: 'EMAIL' | 'API' | 'WEBHOOK' | 'FILE_DROP';
  config: any;
  active: boolean;
  mondayItemId?: string;
  lastSyncAt?: string;
  lastSyncStatus?: 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'NO_DATA';
  lastSyncDetails?: {
    emailsProcessed?: number;
    recordsFound?: number;
    recordsIngested?: number;
    errors?: string[];
    duration?: number;
  };
  pollIntervalMinutes: number;
  createdAt: string;
  updatedAt: string;
}

interface ProviderSite {
  id: string;
  providerId: string;
  siteId: string;
  siteMapping: any;
  active: boolean;
  site?: {
    id: string;
    name: string;
  };
}

interface IngestionLog {
  id: string;
  providerId: string;
  source: string;
  emailMessageId?: string;
  emailSubject?: string;
  emailFrom?: string;
  emailDate?: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PARTIAL';
  recordsFound: number;
  recordsIngested: number;
  recordsSkipped: number;
  recordsFailed: number;
  errors?: any[];
  processedAt?: string;
  createdAt: string;
}

interface Site {
  id: string;
  name: string;
  active: boolean;
}

const PROVIDER_TYPE_ICONS = {
  EMAIL: Mail,
  API: Globe,
  WEBHOOK: Webhook,
  FILE_DROP: FolderInput,
};

const PROVIDER_TYPE_LABELS = {
  EMAIL: 'Email Ingestion',
  API: 'API Integration',
  WEBHOOK: 'Webhook Receiver',
  FILE_DROP: 'File Drop',
};

export function PaymentProviderConfig() {
  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider | null>(null);
  const [providerSites, setProviderSites] = useState<ProviderSite[]>([]);
  const [ingestionLogs, setIngestionLogs] = useState<IngestionLog[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const fetchProviders = useCallback(async () => {
    try {
      const [providersRes, sitesRes] = await Promise.all([
        axios.get('/api/payment-providers'),
        axios.get('/api/sites'),
      ]);
      setProviders(providersRes.data);
      setSites(sitesRes.data);
    } catch (error) {
      console.error('Failed to fetch providers:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const fetchProviderDetails = async (providerId: string) => {
    try {
      const [sitesRes, logsRes] = await Promise.all([
        axios.get(`/api/payment-providers/${providerId}/sites`),
        axios.get(`/api/payment-providers/${providerId}/ingestion-logs?limit=20`),
      ]);
      setProviderSites(sitesRes.data);
      setIngestionLogs(logsRes.data);
    } catch (error) {
      console.error('Failed to fetch provider details:', error);
    }
  };

  const selectProvider = async (provider: PaymentProvider) => {
    setSelectedProvider(provider);
    setTestResult(null);
    await fetchProviderDetails(provider.id);
  };

  const triggerSync = async (providerId: string) => {
    setActionLoading(`sync-${providerId}`);
    try {
      await axios.post(`/api/payment-providers/${providerId}/sync`);
      await fetchProviders();
      if (selectedProvider?.id === providerId) {
        await fetchProviderDetails(providerId);
      }
    } catch (error) {
      console.error('Failed to trigger sync:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const testConnection = async (providerId: string) => {
    setActionLoading(`test-${providerId}`);
    setTestResult(null);
    try {
      const response = await axios.post(`/api/payment-providers/${providerId}/test-connection`);
      setTestResult({ success: true, message: response.data.message || 'Connection successful' });
    } catch (error: any) {
      setTestResult({
        success: false,
        message: error.response?.data?.message || 'Connection failed',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const toggleProviderActive = async (provider: PaymentProvider) => {
    setActionLoading(`toggle-${provider.id}`);
    try {
      await axios.patch(`/api/payment-providers/${provider.id}`, {
        active: !provider.active,
      });
      await fetchProviders();
    } catch (error) {
      console.error('Failed to toggle provider:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const deleteProvider = async (providerId: string) => {
    if (!confirm('Are you sure you want to delete this provider? This action cannot be undone.')) {
      return;
    }
    setActionLoading(`delete-${providerId}`);
    try {
      await axios.delete(`/api/payment-providers/${providerId}`);
      if (selectedProvider?.id === providerId) {
        setSelectedProvider(null);
      }
      await fetchProviders();
    } catch (error) {
      console.error('Failed to delete provider:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const assignSite = async (providerId: string, siteId: string) => {
    setActionLoading(`assign-${siteId}`);
    try {
      await axios.post(`/api/payment-providers/${providerId}/sites`, { siteId });
      await fetchProviderDetails(providerId);
    } catch (error) {
      console.error('Failed to assign site:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const removeSiteAssignment = async (providerId: string, siteId: string) => {
    setActionLoading(`unassign-${siteId}`);
    try {
      await axios.delete(`/api/payment-providers/${providerId}/sites/${siteId}`);
      await fetchProviderDetails(providerId);
    } catch (error) {
      console.error('Failed to remove site assignment:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const getTypeIcon = (type: PaymentProvider['type']) => {
    const Icon = PROVIDER_TYPE_ICONS[type] || Globe;
    return <Icon className="w-5 h-5" />;
  };

  const getSyncStatusBadge = (status?: string) => {
    switch (status) {
      case 'SUCCESS':
        return (
          <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle className="w-3 h-3" /> Success
          </span>
        );
      case 'FAILED':
        return (
          <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            <XCircle className="w-3 h-3" /> Failed
          </span>
        );
      case 'PARTIAL':
        return (
          <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
            <AlertCircle className="w-3 h-3" /> Partial
          </span>
        );
      case 'NO_DATA':
        return (
          <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400">
            <Clock className="w-3 h-3" /> No Data
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            Never synced
          </span>
        );
    }
  };

  const getIngestionStatusBadge = (status: IngestionLog['status']) => {
    const styles = {
      COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      PARTIAL: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
      PENDING: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
      PROCESSING: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status]}`}>
        {status}
      </span>
    );
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const unassignedSites = sites.filter(
    (site) => !providerSites.some((ps) => ps.siteId === site.id)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Payment Providers
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Configure payment data ingestion sources
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Provider
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Provider List */}
        <div className="lg:col-span-1 space-y-4">
          {providers.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-8 text-center">
              <Mail className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">No providers configured</p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="mt-4 text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Add your first provider
              </button>
            </div>
          ) : (
            providers.map((provider) => (
              <div
                key={provider.id}
                onClick={() => selectProvider(provider)}
                className={`bg-white dark:bg-slate-900 rounded-xl border p-4 cursor-pointer transition-all ${
                  selectedProvider?.id === provider.id
                    ? 'border-blue-500 ring-2 ring-blue-500/20'
                    : 'border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded-lg ${
                      provider.active
                        ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                    }`}
                  >
                    {getTypeIcon(provider.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-gray-900 dark:text-white truncate">
                        {provider.name}
                      </h4>
                      {!provider.active && (
                        <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 rounded">
                          Disabled
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {PROVIDER_TYPE_LABELS[provider.type]}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      {getSyncStatusBadge(provider.lastSyncStatus)}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Provider Details */}
        <div className="lg:col-span-2">
          {selectedProvider ? (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
              {/* Provider Header */}
              <div className="p-6 border-b border-gray-200 dark:border-slate-800">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className={`p-3 rounded-xl ${
                        selectedProvider.active
                          ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-gray-100 text-gray-400 dark:bg-gray-800'
                      }`}
                    >
                      {getTypeIcon(selectedProvider.type)}
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                        {selectedProvider.name}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {PROVIDER_TYPE_LABELS[selectedProvider.type]} &bull; Poll every{' '}
                        {selectedProvider.pollIntervalMinutes} min
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowEditForm(true)}
                      className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                      title="Edit provider"
                    >
                      <Settings className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => deleteProvider(selectedProvider.id)}
                      disabled={actionLoading === `delete-${selectedProvider.id}`}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      title="Delete provider"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={() => toggleProviderActive(selectedProvider)}
                    disabled={actionLoading === `toggle-${selectedProvider.id}`}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                      selectedProvider.active
                        ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                  >
                    {selectedProvider.active ? (
                      <>
                        <XCircle className="w-4 h-4" /> Disable
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" /> Enable
                      </>
                    )}
                  </button>

                  {selectedProvider.type === 'EMAIL' && (
                    <button
                      onClick={() => testConnection(selectedProvider.id)}
                      disabled={actionLoading === `test-${selectedProvider.id}`}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50 transition-colors"
                    >
                      {actionLoading === `test-${selectedProvider.id}` ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <TestTube className="w-4 h-4" />
                      )}
                      Test Connection
                    </button>
                  )}

                  <button
                    onClick={() => triggerSync(selectedProvider.id)}
                    disabled={actionLoading === `sync-${selectedProvider.id}` || !selectedProvider.active}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {actionLoading === `sync-${selectedProvider.id}` ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    Sync Now
                  </button>
                </div>

                {/* Test Result */}
                {testResult && (
                  <div
                    className={`mt-4 p-3 rounded-lg ${
                      testResult.success
                        ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                        : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {testResult.success ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <XCircle className="w-4 h-4" />
                      )}
                      {testResult.message}
                    </div>
                  </div>
                )}
              </div>

              {/* Last Sync Info */}
              {selectedProvider.lastSyncAt && (
                <div className="px-6 py-4 bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Last Sync</p>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {formatDate(selectedProvider.lastSyncAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      {getSyncStatusBadge(selectedProvider.lastSyncStatus)}
                      {selectedProvider.lastSyncDetails && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {selectedProvider.lastSyncDetails.recordsIngested || 0} records ingested
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Collapsible Sections */}
              <div className="divide-y divide-gray-200 dark:divide-slate-800">
                {/* Configuration Section */}
                <div>
                  <button
                    onClick={() => toggleSection('config')}
                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <span className="font-medium text-gray-900 dark:text-white">Configuration</span>
                    {expandedSections.config ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                  {expandedSections.config && (
                    <div className="px-6 pb-4">
                      <pre className="p-4 bg-gray-100 dark:bg-slate-800 rounded-lg text-sm overflow-x-auto text-gray-800 dark:text-gray-200">
                        {JSON.stringify(selectedProvider.config, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Assigned Sites Section */}
                <div>
                  <button
                    onClick={() => toggleSection('sites')}
                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <span className="font-medium text-gray-900 dark:text-white">
                      Assigned Sites ({providerSites.length})
                    </span>
                    {expandedSections.sites ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                  {expandedSections.sites && (
                    <div className="px-6 pb-4 space-y-3">
                      {/* Assigned sites */}
                      {providerSites.length > 0 ? (
                        <div className="space-y-2">
                          {providerSites.map((ps) => (
                            <div
                              key={ps.id}
                              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-lg"
                            >
                              <div className="flex items-center gap-2">
                                <Link className="w-4 h-4 text-green-500" />
                                <span className="text-gray-900 dark:text-white">
                                  {ps.site?.name || ps.siteId}
                                </span>
                              </div>
                              <button
                                onClick={() => removeSiteAssignment(selectedProvider.id, ps.siteId)}
                                disabled={actionLoading === `unassign-${ps.siteId}`}
                                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                title="Remove assignment"
                              >
                                {actionLoading === `unassign-${ps.siteId}` ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Unlink className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          No sites assigned to this provider
                        </p>
                      )}

                      {/* Add site dropdown */}
                      {unassignedSites.length > 0 && (
                        <div className="pt-2">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Add Site
                          </label>
                          <div className="flex gap-2">
                            <select
                              id="add-site-select"
                              className="flex-1 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-gray-900 dark:text-white"
                              defaultValue=""
                            >
                              <option value="" disabled>
                                Select a site...
                              </option>
                              {unassignedSites.map((site) => (
                                <option key={site.id} value={site.id}>
                                  {site.name}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => {
                                const select = document.getElementById(
                                  'add-site-select'
                                ) as HTMLSelectElement;
                                if (select.value) {
                                  assignSite(selectedProvider.id, select.value);
                                  select.value = '';
                                }
                              }}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Ingestion Logs Section */}
                <div>
                  <button
                    onClick={() => toggleSection('logs')}
                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <span className="font-medium text-gray-900 dark:text-white">
                      Recent Ingestion Logs
                    </span>
                    {expandedSections.logs ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                  {expandedSections.logs && (
                    <div className="px-6 pb-4">
                      {ingestionLogs.length > 0 ? (
                        <div className="space-y-2">
                          {ingestionLogs.map((log) => (
                            <div
                              key={log.id}
                              className="p-3 bg-gray-50 dark:bg-slate-800 rounded-lg"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <FileText className="w-4 h-4 text-gray-400" />
                                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    {log.emailSubject || log.source}
                                  </span>
                                </div>
                                {getIngestionStatusBadge(log.status)}
                              </div>
                              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                                <span>{formatDate(log.createdAt)}</span>
                                <span>
                                  {log.recordsIngested}/{log.recordsFound} records
                                </span>
                                {log.recordsFailed > 0 && (
                                  <span className="text-red-500">
                                    {log.recordsFailed} failed
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          No ingestion logs yet
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-12 text-center">
              <Settings className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">
                Select a provider to view details
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Form Modal */}
      {(showCreateForm || showEditForm) && (
        <ProviderFormModal
          provider={showEditForm ? selectedProvider : null}
          onClose={() => {
            setShowCreateForm(false);
            setShowEditForm(false);
          }}
          onSave={async () => {
            setShowCreateForm(false);
            setShowEditForm(false);
            await fetchProviders();
          }}
        />
      )}
    </div>
  );
}

interface ProviderFormModalProps {
  provider: PaymentProvider | null;
  onClose: () => void;
  onSave: () => void;
}

function ProviderFormModal({ provider, onClose, onSave }: ProviderFormModalProps) {
  const isEdit = !!provider;
  const [formData, setFormData] = useState({
    name: provider?.name || '',
    type: provider?.type || 'EMAIL',
    active: provider?.active ?? true,
    pollIntervalMinutes: provider?.pollIntervalMinutes || 5,
    config: provider?.config || getDefaultConfig('EMAIL'),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function getDefaultConfig(type: string) {
    switch (type) {
      case 'EMAIL':
        return {
          imapHost: '',
          imapPort: 993,
          imapSecure: true,
          credentialsEnvKey: '',
          mailbox: 'INBOX',
          fromFilter: '',
          subjectFilter: '',
          attachmentType: 'CSV',
          parserConfig: {
            skipRows: 1,
            delimiter: ',',
            columnMapping: {
              vrm: '',
              amount: '',
              startTime: '',
              expiryTime: '',
              siteIdentifier: '',
            },
            dateFormat: 'DD/MM/YYYY HH:mm',
          },
        };
      case 'API':
        return {
          baseUrl: '',
          credentialsEnvKey: '',
          authType: 'BEARER',
          endpoints: { payments: '/payments' },
        };
      case 'WEBHOOK':
        return {
          webhookSecret: '',
          validateSignature: true,
          payloadMapping: {
            vrm: 'vrm',
            amount: 'amount',
            startTime: 'startTime',
            expiryTime: 'expiryTime',
          },
        };
      case 'FILE_DROP':
        return {
          watchPath: '',
          filePattern: '*.csv',
          processedPath: '',
          parserConfig: {
            skipRows: 1,
            delimiter: ',',
            columnMapping: {
              vrm: '',
              amount: '',
              startTime: '',
              expiryTime: '',
            },
          },
        };
      default:
        return {};
    }
  }

  const handleTypeChange = (newType: 'EMAIL' | 'API' | 'WEBHOOK' | 'FILE_DROP') => {
    setFormData((prev) => ({
      ...prev,
      type: newType,
      config: getDefaultConfig(newType),
    }));
  };

  const updateConfig = (path: string, value: any) => {
    setFormData((prev) => {
      const newConfig = { ...prev.config };
      const keys = path.split('.');
      let current: any = newConfig;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
      return { ...prev, config: newConfig };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (isEdit && provider) {
        await axios.patch(`/api/payment-providers/${provider.id}`, formData);
      } else {
        await axios.post('/api/payment-providers', formData);
      }
      onSave();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save provider');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEdit ? 'Edit Provider' : 'Add Payment Provider'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400 rounded-lg">
              {error}
            </div>
          )}

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Provider Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white"
                placeholder="e.g., RingGo, JustPark"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Type
              </label>
              <select
                value={formData.type}
                onChange={(e) => handleTypeChange(e.target.value as 'EMAIL' | 'API' | 'WEBHOOK' | 'FILE_DROP')}
                disabled={isEdit}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white disabled:opacity-50"
              >
                <option value="EMAIL">Email Ingestion</option>
                <option value="API">API Integration</option>
                <option value="WEBHOOK">Webhook Receiver</option>
                <option value="FILE_DROP">File Drop</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Poll Interval (minutes)
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={formData.pollIntervalMinutes}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    pollIntervalMinutes: parseInt(e.target.value) || 5,
                  }))
                }
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white"
              />
            </div>
            <div className="flex items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.active}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, active: e.target.checked }))
                  }
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Active
                </span>
              </label>
            </div>
          </div>

          {/* Type-specific config */}
          {formData.type === 'EMAIL' && (
            <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-slate-800">
              <h4 className="font-medium text-gray-900 dark:text-white">Email Configuration</h4>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    IMAP Host
                  </label>
                  <input
                    type="text"
                    value={formData.config.imapHost || ''}
                    onChange={(e) => updateConfig('imapHost', e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white"
                    placeholder="mail.example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    IMAP Port
                  </label>
                  <input
                    type="number"
                    value={formData.config.imapPort || 993}
                    onChange={(e) => updateConfig('imapPort', parseInt(e.target.value))}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Credentials Env Key
                  </label>
                  <input
                    type="text"
                    value={formData.config.credentialsEnvKey || ''}
                    onChange={(e) => updateConfig('credentialsEnvKey', e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white"
                    placeholder="PARKWISE_EMAIL"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Env var prefix (e.g., PARKWISE_EMAIL for _USER and _PASS)
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Mailbox
                  </label>
                  <input
                    type="text"
                    value={formData.config.mailbox || 'INBOX'}
                    onChange={(e) => updateConfig('mailbox', e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    From Filter
                  </label>
                  <input
                    type="text"
                    value={formData.config.fromFilter || ''}
                    onChange={(e) => updateConfig('fromFilter', e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white"
                    placeholder="payments@provider.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Attachment Type
                  </label>
                  <select
                    value={formData.config.attachmentType || 'CSV'}
                    onChange={(e) => updateConfig('attachmentType', e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white"
                  >
                    <option value="CSV">CSV</option>
                    <option value="EXCEL">Excel</option>
                  </select>
                </div>
              </div>

              <h5 className="font-medium text-gray-800 dark:text-gray-200 text-sm mt-4">
                Column Mapping
              </h5>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                    VRM Column
                  </label>
                  <input
                    type="text"
                    value={formData.config.parserConfig?.columnMapping?.vrm || ''}
                    onChange={(e) => updateConfig('parserConfig.columnMapping.vrm', e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white text-sm"
                    placeholder="Registration"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Amount Column
                  </label>
                  <input
                    type="text"
                    value={formData.config.parserConfig?.columnMapping?.amount || ''}
                    onChange={(e) => updateConfig('parserConfig.columnMapping.amount', e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white text-sm"
                    placeholder="Amount"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Start Time Column
                  </label>
                  <input
                    type="text"
                    value={formData.config.parserConfig?.columnMapping?.startTime || ''}
                    onChange={(e) => updateConfig('parserConfig.columnMapping.startTime', e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white text-sm"
                    placeholder="Start Time"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Expiry Time Column
                  </label>
                  <input
                    type="text"
                    value={formData.config.parserConfig?.columnMapping?.expiryTime || ''}
                    onChange={(e) => updateConfig('parserConfig.columnMapping.expiryTime', e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white text-sm"
                    placeholder="End Time"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Site Identifier Column
                  </label>
                  <input
                    type="text"
                    value={formData.config.parserConfig?.columnMapping?.siteIdentifier || ''}
                    onChange={(e) =>
                      updateConfig('parserConfig.columnMapping.siteIdentifier', e.target.value)
                    }
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white text-sm"
                    placeholder="Car Park"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Date Format
                  </label>
                  <input
                    type="text"
                    value={formData.config.parserConfig?.dateFormat || ''}
                    onChange={(e) => updateConfig('parserConfig.dateFormat', e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white text-sm"
                    placeholder="DD/MM/YYYY HH:mm"
                  />
                </div>
              </div>
            </div>
          )}

          {/* API Config */}
          {formData.type === 'API' && (
            <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-slate-800">
              <h4 className="font-medium text-gray-900 dark:text-white">API Configuration</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Base URL
                  </label>
                  <input
                    type="text"
                    value={formData.config.baseUrl || ''}
                    onChange={(e) => updateConfig('baseUrl', e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white"
                    placeholder="https://api.provider.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Auth Type
                  </label>
                  <select
                    value={formData.config.authType || 'BEARER'}
                    onChange={(e) => updateConfig('authType', e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white"
                  >
                    <option value="BEARER">Bearer Token</option>
                    <option value="BASIC">Basic Auth</option>
                    <option value="API_KEY">API Key</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Credentials Env Key
                </label>
                <input
                  type="text"
                  value={formData.config.credentialsEnvKey || ''}
                  onChange={(e) => updateConfig('credentialsEnvKey', e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white"
                  placeholder="PROVIDER_API"
                />
              </div>
            </div>
          )}

          {/* Webhook Config */}
          {formData.type === 'WEBHOOK' && (
            <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-slate-800">
              <h4 className="font-medium text-gray-900 dark:text-white">Webhook Configuration</h4>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Webhook Secret (optional)
                </label>
                <input
                  type="text"
                  value={formData.config.webhookSecret || ''}
                  onChange={(e) => updateConfig('webhookSecret', e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white"
                  placeholder="Shared secret for signature validation"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.config.validateSignature ?? true}
                  onChange={(e) => updateConfig('validateSignature', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Validate webhook signatures
                </span>
              </label>
            </div>
          )}

          {/* File Drop Config */}
          {formData.type === 'FILE_DROP' && (
            <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-slate-800">
              <h4 className="font-medium text-gray-900 dark:text-white">File Drop Configuration</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Watch Path
                  </label>
                  <input
                    type="text"
                    value={formData.config.watchPath || ''}
                    onChange={(e) => updateConfig('watchPath', e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white"
                    placeholder="/data/incoming"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    File Pattern
                  </label>
                  <input
                    type="text"
                    value={formData.config.filePattern || '*.csv'}
                    onChange={(e) => updateConfig('filePattern', e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white"
                    placeholder="*.csv"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Processed Files Path
                </label>
                <input
                  type="text"
                  value={formData.config.processedPath || ''}
                  onChange={(e) => updateConfig('processedPath', e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white"
                  placeholder="/data/processed"
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-slate-800">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isEdit ? 'Update Provider' : 'Create Provider'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PaymentProviderConfig;
