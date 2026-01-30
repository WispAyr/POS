import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  AlertTriangle,
  AlertCircle,
  Info,
  Clock,
  Settings,
  Volume2,
  Globe,
  Send,
} from 'lucide-react';

interface AlarmDefinition {
  id: string;
  name: string;
  description?: string;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  siteId?: string;
  conditions: {
    checkTime?: string;
    lookbackHours?: number;
    noMovementMinutes?: number;
    thresholdCount?: number;
    timeWindowMinutes?: number;
    maxConsecutiveFailures?: number;
  };
  cronSchedule?: string;
  enabled: boolean;
  notificationChannels: string[];
  actions?: AlarmAction[];
}

const ALARM_TYPES = [
  { value: 'NO_PAYMENT_DATA', label: 'No Payment Data' },
  { value: 'ANPR_POLLER_FAILURE', label: 'ANPR Poller Failure' },
  { value: 'HIGH_ENFORCEMENT_CANDIDATES', label: 'High Enforcement Queue' },
  { value: 'SITE_OFFLINE', label: 'Site Offline' },
  { value: 'PAYMENT_SYNC_FAILURE', label: 'Payment Sync Failure' },
  { value: 'CUSTOM', label: 'Custom' },
];

const SEVERITIES = [
  { value: 'INFO', label: 'Info', color: 'blue' },
  { value: 'WARNING', label: 'Warning', color: 'amber' },
  { value: 'CRITICAL', label: 'Critical', color: 'red' },
];

const CHANNELS = [
  { value: 'IN_APP', label: 'In-App' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'SMS', label: 'SMS' },
];

const ACTION_TYPES = [
  { value: 'TELEGRAM', label: 'Telegram Message', icon: Send },
  { value: 'WEBHOOK', label: 'Webhook Call', icon: Globe },
  { value: 'ANNOUNCEMENT', label: 'Speaker Announcement', icon: Volume2 },
];

interface AlarmAction {
  name: string;
  type: 'TELEGRAM' | 'WEBHOOK' | 'ANNOUNCEMENT';
  config: Record<string, any>;
  enabled: boolean;
  description?: string;
}

export function AlarmDefinitionForm() {
  const [definitions, setDefinitions] = useState<AlarmDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Partial<AlarmDefinition>>({
    type: 'NO_PAYMENT_DATA',
    severity: 'WARNING',
    enabled: true,
    notificationChannels: ['IN_APP'],
    conditions: {},
    actions: [],
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchDefinitions();
  }, []);

  const fetchDefinitions = async () => {
    try {
      const response = await axios.get('/api/alarms/definitions');
      setDefinitions(response.data);
    } catch (error) {
      console.error('Failed to fetch definitions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingId) {
        await axios.put(`/api/alarms/definitions/${editingId}`, formData);
      } else {
        await axios.post('/api/alarms/definitions', formData);
      }
      await fetchDefinitions();
      resetForm();
    } catch (error) {
      console.error('Failed to save definition:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (definition: AlarmDefinition) => {
    setFormData(definition);
    setEditingId(definition.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this alarm definition?')) {
      return;
    }

    try {
      await axios.delete(`/api/alarms/definitions/${id}`);
      await fetchDefinitions();
    } catch (error) {
      console.error('Failed to delete definition:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      type: 'NO_PAYMENT_DATA',
      severity: 'WARNING',
      enabled: true,
      notificationChannels: ['IN_APP'],
      conditions: {},
      actions: [],
    });
    setEditingId(null);
    setShowForm(false);
  };

  const addAction = (type: AlarmAction['type']) => {
    const defaultConfigs: Record<string, Record<string, any>> = {
      TELEGRAM: { messageTemplate: 'Alarm triggered: {{alarm.name}} - {{alarm.type}}' },
      WEBHOOK: { url: '', method: 'POST', headers: {} },
      ANNOUNCEMENT: { message: 'Attention: {{alarm.name}} alarm triggered', volume: 50 },
    };
    
    const newAction: AlarmAction = {
      name: `${type.toLowerCase()}_action_${(formData.actions?.length || 0) + 1}`,
      type,
      config: defaultConfigs[type] || {},
      enabled: true,
    };
    
    setFormData({
      ...formData,
      actions: [...(formData.actions || []), newAction],
    });
  };

  const updateAction = (index: number, updates: Partial<AlarmAction>) => {
    const actions = [...(formData.actions || [])];
    actions[index] = { ...actions[index], ...updates };
    setFormData({ ...formData, actions });
  };

  const updateActionConfig = (index: number, key: string, value: any) => {
    const actions = [...(formData.actions || [])];
    actions[index] = {
      ...actions[index],
      config: { ...actions[index].config, [key]: value },
    };
    setFormData({ ...formData, actions });
  };

  const removeAction = (index: number) => {
    setFormData({
      ...formData,
      actions: formData.actions?.filter((_, i) => i !== index),
    });
  };

  const toggleChannel = (channel: string) => {
    const current = formData.notificationChannels || [];
    if (current.includes(channel)) {
      setFormData({
        ...formData,
        notificationChannels: current.filter((c) => c !== channel),
      });
    } else {
      setFormData({
        ...formData,
        notificationChannels: [...current, channel],
      });
    }
  };

  const updateCondition = (key: string, value: any) => {
    setFormData({
      ...formData,
      conditions: {
        ...formData.conditions,
        [key]: value,
      },
    });
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'WARNING':
        return <AlertCircle className="w-4 h-4 text-amber-500" />;
      default:
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const renderConditionFields = () => {
    switch (formData.type) {
      case 'NO_PAYMENT_DATA':
        return (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Check Time (HH:MM)
              </label>
              <input
                type="text"
                value={formData.conditions?.checkTime || ''}
                onChange={(e) => updateCondition('checkTime', e.target.value)}
                placeholder="03:00"
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Lookback Hours
              </label>
              <input
                type="number"
                value={formData.conditions?.lookbackHours || 24}
                onChange={(e) =>
                  updateCondition('lookbackHours', parseInt(e.target.value))
                }
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
              />
            </div>
          </div>
        );

      case 'SITE_OFFLINE':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              No Movement Minutes
            </label>
            <input
              type="number"
              value={formData.conditions?.noMovementMinutes || 120}
              onChange={(e) =>
                updateCondition('noMovementMinutes', parseInt(e.target.value))
              }
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
            />
          </div>
        );

      case 'HIGH_ENFORCEMENT_CANDIDATES':
        return (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Threshold Count
              </label>
              <input
                type="number"
                value={formData.conditions?.thresholdCount || 50}
                onChange={(e) =>
                  updateCondition('thresholdCount', parseInt(e.target.value))
                }
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Time Window (minutes)
              </label>
              <input
                type="number"
                value={formData.conditions?.timeWindowMinutes || 60}
                onChange={(e) =>
                  updateCondition('timeWindowMinutes', parseInt(e.target.value))
                }
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
              />
            </div>
          </div>
        );

      case 'ANPR_POLLER_FAILURE':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Max Consecutive Failures
            </label>
            <input
              type="number"
              value={formData.conditions?.maxConsecutiveFailures || 3}
              onChange={(e) =>
                updateCondition(
                  'maxConsecutiveFailures',
                  parseInt(e.target.value)
                )
              }
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
            />
          </div>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Alarm Definitions
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Configure automated alarm triggers and conditions
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Definition
        </button>
      </div>

      {/* Definitions List */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 divide-y divide-gray-200 dark:divide-slate-800">
        {definitions.length === 0 ? (
          <div className="p-12 text-center">
            <Settings className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              No alarm definitions configured
            </p>
          </div>
        ) : (
          definitions.map((definition) => (
            <div
              key={definition.id}
              className="p-6 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div
                  className={`p-2 rounded-lg ${
                    definition.enabled
                      ? 'bg-green-100 dark:bg-green-900/30'
                      : 'bg-gray-100 dark:bg-gray-800'
                  }`}
                >
                  {getSeverityIcon(definition.severity)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      {definition.name}
                    </h4>
                    {!definition.enabled && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                        Disabled
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {definition.type.replace(/_/g, ' ')}
                    {definition.cronSchedule && (
                      <span className="ml-2">
                        <Clock className="w-3 h-3 inline mr-1" />
                        {definition.cronSchedule}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEdit(definition)}
                  className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(definition.id)}
                  className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {editingId ? 'Edit Alarm Definition' : 'New Alarm Definition'}
              </h3>
              <button
                onClick={resetForm}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                  placeholder="e.g., No Payment Data Alert"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={2}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                  placeholder="Describe when this alarm triggers..."
                />
              </div>

              {/* Type and Severity */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Type *
                  </label>
                  <select
                    value={formData.type || 'NO_PAYMENT_DATA'}
                    onChange={(e) =>
                      setFormData({ ...formData, type: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                  >
                    {ALARM_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Severity *
                  </label>
                  <select
                    value={formData.severity || 'WARNING'}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        severity: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                  >
                    {SEVERITIES.map((sev) => (
                      <option key={sev.value} value={sev.value}>
                        {sev.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Cron Schedule */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Cron Schedule (leave empty for event-based)
                </label>
                <input
                  type="text"
                  value={formData.cronSchedule || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, cronSchedule: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                  placeholder="e.g., 0 3 * * * (daily at 3am)"
                />
              </div>

              {/* Site ID */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Site ID (leave empty for system-wide)
                </label>
                <input
                  type="text"
                  value={formData.siteId || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, siteId: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white"
                  placeholder="Optional: specific site ID"
                />
              </div>

              {/* Conditions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Conditions
                </label>
                {renderConditionFields()}
              </div>

              {/* Notification Channels */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Notification Channels
                </label>
                <div className="flex gap-4">
                  {CHANNELS.map((channel) => (
                    <label
                      key={channel.value}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="checkbox"
                        checked={
                          formData.notificationChannels?.includes(
                            channel.value
                          ) || false
                        }
                        onChange={() => toggleChannel(channel.value)}
                        className="rounded border-gray-300 dark:border-slate-600 text-blue-600"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {channel.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Automated Actions
                  </label>
                  <div className="flex gap-1">
                    {ACTION_TYPES.map((actionType) => (
                      <button
                        key={actionType.value}
                        type="button"
                        onClick={() => addAction(actionType.value as AlarmAction['type'])}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                        title={`Add ${actionType.label}`}
                      >
                        <actionType.icon className="w-4 h-4" />
                      </button>
                    ))}
                  </div>
                </div>
                
                {formData.actions && formData.actions.length > 0 ? (
                  <div className="space-y-3">
                    {formData.actions.map((action, index) => (
                      <div
                        key={index}
                        className="p-3 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {action.type === 'TELEGRAM' && <Send className="w-4 h-4 text-blue-500" />}
                            {action.type === 'WEBHOOK' && <Globe className="w-4 h-4 text-green-500" />}
                            {action.type === 'ANNOUNCEMENT' && <Volume2 className="w-4 h-4 text-purple-500" />}
                            <input
                              type="text"
                              value={action.name}
                              onChange={(e) => updateAction(index, { name: e.target.value })}
                              className="text-sm font-medium bg-transparent border-0 p-0 text-gray-700 dark:text-gray-300 focus:ring-0"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={action.enabled}
                                onChange={(e) => updateAction(index, { enabled: e.target.checked })}
                                className="rounded border-gray-300 dark:border-slate-600 text-blue-600"
                              />
                              <span className="text-xs text-gray-500">On</span>
                            </label>
                            <button
                              type="button"
                              onClick={() => removeAction(index)}
                              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        
                        {/* Action-specific config */}
                        {action.type === 'TELEGRAM' && (
                          <input
                            type="text"
                            value={action.config.messageTemplate || ''}
                            onChange={(e) => updateActionConfig(index, 'messageTemplate', e.target.value)}
                            placeholder="Message template (use {{alarm.name}}, {{alarm.type}}, etc.)"
                            className="w-full text-sm px-2 py-1.5 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded"
                          />
                        )}
                        
                        {action.type === 'WEBHOOK' && (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={action.config.url || ''}
                              onChange={(e) => updateActionConfig(index, 'url', e.target.value)}
                              placeholder="Webhook URL"
                              className="w-full text-sm px-2 py-1.5 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded"
                            />
                            <select
                              value={action.config.method || 'POST'}
                              onChange={(e) => updateActionConfig(index, 'method', e.target.value)}
                              className="text-sm px-2 py-1.5 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded"
                            >
                              <option value="POST">POST</option>
                              <option value="PUT">PUT</option>
                              <option value="GET">GET</option>
                            </select>
                          </div>
                        )}
                        
                        {action.type === 'ANNOUNCEMENT' && (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={action.config.message || ''}
                              onChange={(e) => updateActionConfig(index, 'message', e.target.value)}
                              placeholder="Announcement message"
                              className="w-full text-sm px-2 py-1.5 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded"
                            />
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500">Volume:</span>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={action.config.volume || 50}
                                onChange={(e) => updateActionConfig(index, 'volume', parseInt(e.target.value))}
                                className="flex-1"
                              />
                              <span className="text-xs text-gray-500 w-8">{action.config.volume || 50}%</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                    No actions configured. Click an icon above to add.
                  </p>
                )}
              </div>

              {/* Enabled */}
              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.enabled ?? true}
                    onChange={(e) =>
                      setFormData({ ...formData, enabled: e.target.checked })
                    }
                    className="rounded border-gray-300 dark:border-slate-600 text-blue-600"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Enabled
                  </span>
                </label>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-slate-800">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
