import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Bell,
  FileText,
  Users,
  Clock,
  History,
  Plus,
  RefreshCw,
  Send,
  MessageSquare,
  CheckCircle,
  XCircle,
  AlertCircle,
  Trash2,
  Edit,
  Play,
  Pause,
} from 'lucide-react';

// Types
interface NotificationTemplate {
  id: string;
  name: string;
  description: string | null;
  body: string;
  variables: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface NotificationRecipient {
  id: string;
  type: 'TELEGRAM_USER' | 'TELEGRAM_GROUP' | 'EMAIL';
  name: string;
  identifier: string;
  telegramUsername: string | null;
  enabled: boolean;
  createdAt: string;
}

interface ScheduledNotification {
  id: string;
  name: string;
  description: string | null;
  cronSchedule: string;
  templateId: string;
  template?: NotificationTemplate;
  recipientIds: string[];
  variableConfig: Record<string, VariableConfig>;
  siteId: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

interface VariableConfig {
  source: 'METRIC' | 'STATIC' | 'DATE_FORMAT';
  metricKey?: string;
  staticValue?: string;
  dateFormat?: string;
}

interface DeliveryLog {
  id: string;
  scheduledNotificationId: string;
  recipientId: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  renderedMessage: string | null;
  sentAt: string | null;
  error: Record<string, any> | null;
  createdAt: string;
}

interface MetricDefinition {
  key: string;
  name: string;
  description: string;
  category: string;
}

type TabId = 'notifications' | 'templates' | 'recipients' | 'actions' | 'history';

const TABS: { id: TabId; label: string; icon: typeof Bell }[] = [
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'templates', label: 'Templates', icon: FileText },
  { id: 'recipients', label: 'Recipients', icon: Users },
  { id: 'actions', label: 'Actions', icon: Clock },
  { id: 'history', label: 'History', icon: History },
];

const CRON_PRESETS = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Daily at 9am', value: '0 9 * * *' },
  { label: 'Weekdays at 1pm', value: '0 13 * * 1-5' },
  { label: 'Weekdays at 5pm', value: '0 17 * * 1-5' },
  { label: 'Weekly on Monday', value: '0 9 * * 1' },
  { label: 'Custom', value: 'custom' },
];

export function ScheduledNotificationDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('notifications');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data state
  const [notifications, setNotifications] = useState<ScheduledNotification[]>([]);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [recipients, setRecipients] = useState<NotificationRecipient[]>([]);
  const [metrics, setMetrics] = useState<MetricDefinition[]>([]);
  const [deliveryLogs, setDeliveryLogs] = useState<DeliveryLog[]>([]);
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null);

  // Modal state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showRecipientModal, setShowRecipientModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [editingNotification, setEditingNotification] = useState<ScheduledNotification | null>(null);

  // Fetch all data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [
        notificationsRes,
        templatesRes,
        recipientsRes,
        metricsRes,
        statusRes,
      ] = await Promise.all([
        axios.get('/api/scheduled-notifications'),
        axios.get('/api/scheduled-notifications/templates'),
        axios.get('/api/scheduled-notifications/recipients'),
        axios.get('/api/scheduled-notifications/metrics/available'),
        axios.get('/api/scheduled-notifications/scheduler/status'),
      ]);

      setNotifications(notificationsRes.data);
      setTemplates(templatesRes.data);
      setRecipients(recipientsRes.data);
      setMetrics(metricsRes.data);
      setSchedulerStatus(statusRes.data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setError('Failed to load notification data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sync Telegram recipients
  const syncTelegramRecipients = async () => {
    try {
      const res = await axios.post('/api/scheduled-notifications/recipients/sync-telegram');
      alert(`Synced: ${res.data.added} added, ${res.data.updated} updated`);
      fetchData();
    } catch (err) {
      console.error('Failed to sync:', err);
      alert('Failed to sync Telegram recipients');
    }
  };

  // Test notification
  const testNotification = async (id: string) => {
    try {
      const res = await axios.post(`/api/scheduled-notifications/${id}/test`);
      alert(res.data.message);
      fetchData();
    } catch (err) {
      console.error('Test failed:', err);
      alert('Failed to send test notification');
    }
  };

  // Toggle notification enabled
  const toggleNotification = async (id: string, enabled: boolean) => {
    try {
      await axios.put(`/api/scheduled-notifications/${id}`, { enabled });
      fetchData();
    } catch (err) {
      console.error('Toggle failed:', err);
    }
  };

  // Delete notification
  const deleteNotification = async (id: string) => {
    if (!confirm('Are you sure you want to delete this notification?')) return;
    try {
      await axios.delete(`/api/scheduled-notifications/${id}`);
      fetchData();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  // Delete template
  const deleteTemplate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
      await axios.delete(`/api/scheduled-notifications/templates/${id}`);
      fetchData();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  // Delete recipient
  const deleteRecipient = async (id: string) => {
    if (!confirm('Are you sure you want to delete this recipient?')) return;
    try {
      await axios.delete(`/api/scheduled-notifications/recipients/${id}`);
      fetchData();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  // Fetch delivery history for a notification
  const fetchDeliveryHistory = async (notificationId: string) => {
    try {
      const res = await axios.get(`/api/scheduled-notifications/${notificationId}/history`);
      setDeliveryLogs(res.data.logs);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
        <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
          <AlertCircle className="w-6 h-6" />
          <span>{error}</span>
        </div>
        <button
          onClick={fetchData}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatsCard
          icon={Bell}
          label="Active Notifications"
          value={notifications.filter((n) => n.enabled).length}
          total={notifications.length}
        />
        <StatsCard
          icon={FileText}
          label="Templates"
          value={templates.filter((t) => t.enabled).length}
          total={templates.length}
        />
        <StatsCard
          icon={Users}
          label="Recipients"
          value={recipients.filter((r) => r.enabled).length}
          total={recipients.length}
        />
        <StatsCard
          icon={MessageSquare}
          label="Telegram Status"
          value={schedulerStatus?.notifications?.length || 0}
          label2="scheduled"
        />
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
        <div className="border-b border-gray-200 dark:border-slate-800">
          <div className="flex overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'notifications' && (
            <NotificationsTab
              notifications={notifications}
              templates={templates}
              recipients={recipients}
              onTest={testNotification}
              onToggle={toggleNotification}
              onDelete={deleteNotification}
              onEdit={(n) => {
                setEditingNotification(n);
                setShowNotificationModal(true);
              }}
              onCreate={() => {
                setEditingNotification(null);
                setShowNotificationModal(true);
              }}
              onRefresh={fetchData}
            />
          )}

          {activeTab === 'templates' && (
            <TemplatesTab
              templates={templates}
              onDelete={deleteTemplate}
              onEdit={(t) => {
                setEditingTemplate(t);
                setShowTemplateModal(true);
              }}
              onCreate={() => {
                setEditingTemplate(null);
                setShowTemplateModal(true);
              }}
            />
          )}

          {activeTab === 'recipients' && (
            <RecipientsTab
              recipients={recipients}
              onDelete={deleteRecipient}
              onSync={syncTelegramRecipients}
              onCreate={() => setShowRecipientModal(true)}
            />
          )}

          {activeTab === 'actions' && (
            <ActionsTab />
          )}

          {activeTab === 'history' && (
            <HistoryTab
              notifications={notifications}
              recipients={recipients}
              onSelectNotification={fetchDeliveryHistory}
              logs={deliveryLogs}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      {showTemplateModal && (
        <TemplateModal
          template={editingTemplate}
          metrics={metrics}
          onClose={() => setShowTemplateModal(false)}
          onSave={() => {
            setShowTemplateModal(false);
            fetchData();
          }}
        />
      )}

      {showNotificationModal && (
        <NotificationModal
          notification={editingNotification}
          templates={templates}
          recipients={recipients}
          metrics={metrics}
          onClose={() => setShowNotificationModal(false)}
          onSave={() => {
            setShowNotificationModal(false);
            fetchData();
          }}
        />
      )}

      {showRecipientModal && (
        <RecipientModal
          onClose={() => setShowRecipientModal(false)}
          onSave={() => {
            setShowRecipientModal(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
}

// Stats Card Component
function StatsCard({
  icon: Icon,
  label,
  value,
  total,
  label2,
}: {
  icon: typeof Bell;
  label: string;
  value: number;
  total?: number;
  label2?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <Icon className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">
            {value}
            {total !== undefined && (
              <span className="text-sm font-normal text-gray-400"> / {total}</span>
            )}
            {label2 && (
              <span className="text-sm font-normal text-gray-400"> {label2}</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

// Notifications Tab
function NotificationsTab({
  notifications,
  templates,
  recipients,
  onTest,
  onToggle,
  onDelete,
  onEdit,
  onCreate,
  onRefresh,
}: {
  notifications: ScheduledNotification[];
  templates: NotificationTemplate[];
  recipients: NotificationRecipient[];
  onTest: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (n: ScheduledNotification) => void;
  onCreate: () => void;
  onRefresh: () => void;
}) {
  const getTemplate = (id: string) => templates.find((t) => t.id === id);
  const getRecipientNames = (ids: string[]) =>
    ids
      .map((id) => recipients.find((r) => r.id === id)?.name)
      .filter(Boolean)
      .join(', ');

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Scheduled Notifications
        </h3>
        <div className="flex gap-2">
          <button
            onClick={onRefresh}
            className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={onCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Add Notification
          </button>
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Bell className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No scheduled notifications yet</p>
          <button
            onClick={onCreate}
            className="mt-4 text-blue-600 hover:underline"
          >
            Create your first notification
          </button>
        </div>
      ) : (
        <div className="divide-y divide-gray-200 dark:divide-slate-800">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className="py-4 flex items-center justify-between"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      notification.enabled ? 'bg-green-500' : 'bg-gray-400'
                    }`}
                  />
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    {notification.name}
                  </h4>
                  <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-800 rounded text-gray-600 dark:text-gray-400">
                    {notification.cronSchedule}
                  </span>
                </div>
                <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Template: {getTemplate(notification.templateId)?.name || 'Unknown'}
                  {' • '}
                  Recipients: {getRecipientNames(notification.recipientIds) || 'None'}
                </div>
                {notification.nextRunAt && (
                  <div className="mt-1 text-xs text-gray-400">
                    Next run: {new Date(notification.nextRunAt).toLocaleString()}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onTest(notification.id)}
                  className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                  title="Send test"
                >
                  <Send className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onToggle(notification.id, !notification.enabled)}
                  className={`p-2 rounded-lg ${
                    notification.enabled
                      ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                      : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800'
                  }`}
                  title={notification.enabled ? 'Disable' : 'Enable'}
                >
                  {notification.enabled ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => onEdit(notification)}
                  className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
                  title="Edit"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDelete(notification.id)}
                  className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Templates Tab
function TemplatesTab({
  templates,
  onDelete,
  onEdit,
  onCreate,
}: {
  templates: NotificationTemplate[];
  onDelete: (id: string) => void;
  onEdit: (t: NotificationTemplate) => void;
  onCreate: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Message Templates
        </h3>
        <button
          onClick={onCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Add Template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No templates yet</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    {template.name}
                  </h4>
                  {template.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {template.description}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onEdit(template)}
                    className="p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDelete(template.id)}
                    className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <pre className="mt-3 p-3 bg-white dark:bg-slate-900 rounded border border-gray-200 dark:border-slate-700 text-sm overflow-x-auto">
                {template.body}
              </pre>
              {template.variables.length > 0 && (
                <div className="mt-2 flex gap-2 flex-wrap">
                  {template.variables.map((v) => (
                    <span
                      key={v}
                      className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded"
                    >
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Recipients Tab
function RecipientsTab({
  recipients,
  onDelete,
  onSync,
  onCreate,
}: {
  recipients: NotificationRecipient[];
  onDelete: (id: string) => void;
  onSync: () => void;
  onCreate: () => void;
}) {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'TELEGRAM_USER':
        return <Send className="w-4 h-4 text-blue-500" />;
      case 'TELEGRAM_GROUP':
        return <Users className="w-4 h-4 text-blue-500" />;
      case 'EMAIL':
        return <MessageSquare className="w-4 h-4 text-green-500" />;
      default:
        return <Bell className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Notification Recipients
        </h3>
        <div className="flex gap-2">
          <button
            onClick={onSync}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800"
          >
            <RefreshCw className="w-4 h-4" />
            Sync Telegram
          </button>
          <button
            onClick={onCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Add Recipient
          </button>
        </div>
      </div>

      {recipients.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No recipients yet</p>
          <button onClick={onSync} className="mt-4 text-blue-600 hover:underline">
            Sync from Telegram
          </button>
        </div>
      ) : (
        <div className="divide-y divide-gray-200 dark:divide-slate-800">
          {recipients.map((recipient) => (
            <div
              key={recipient.id}
              className="py-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                {getTypeIcon(recipient.type)}
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    {recipient.name}
                  </h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {recipient.type.replace('_', ' ')}
                    {recipient.telegramUsername && ` • @${recipient.telegramUsername}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    recipient.enabled
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                      : 'bg-gray-100 dark:bg-slate-800 text-gray-500'
                  }`}
                >
                  {recipient.enabled ? 'Active' : 'Disabled'}
                </span>
                <button
                  onClick={() => onDelete(recipient.id)}
                  className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Actions Tab (placeholder)
function ActionsTab() {
  return (
    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
      <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
      <p>Scheduled Actions (Monday.com integration)</p>
      <p className="text-sm mt-2">Coming soon</p>
    </div>
  );
}

// History Tab
function HistoryTab({
  notifications,
  recipients,
  onSelectNotification,
  logs,
}: {
  notifications: ScheduledNotification[];
  recipients: NotificationRecipient[];
  onSelectNotification: (id: string) => void;
  logs: DeliveryLog[];
}) {
  const [selectedNotification, setSelectedNotification] = useState<string>('');

  const handleSelect = (id: string) => {
    setSelectedNotification(id);
    onSelectNotification(id);
  };

  const getRecipientName = (id: string) =>
    recipients.find((r) => r.id === id)?.name || 'Unknown';

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SENT':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'FAILED':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Select Notification:
        </label>
        <select
          value={selectedNotification}
          onChange={(e) => handleSelect(e.target.value)}
          className="flex-1 max-w-md px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
        >
          <option value="">Choose a notification...</option>
          {notifications.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </div>

      {logs.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>
            {selectedNotification
              ? 'No delivery history yet'
              : 'Select a notification to view history'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-200 dark:divide-slate-800">
          {logs.map((log) => (
            <div key={log.id} className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getStatusIcon(log.status)}
                  <div>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {getRecipientName(log.recipientId)}
                    </span>
                    <span className="ml-2 text-sm text-gray-500">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    log.status === 'SENT'
                      ? 'bg-green-100 text-green-600'
                      : log.status === 'FAILED'
                      ? 'bg-red-100 text-red-600'
                      : 'bg-yellow-100 text-yellow-600'
                  }`}
                >
                  {log.status}
                </span>
              </div>
              {log.error && (
                <div className="mt-2 text-sm text-red-500">
                  Error: {JSON.stringify(log.error)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Template Modal
function TemplateModal({
  template,
  metrics,
  onClose,
  onSave,
}: {
  template: NotificationTemplate | null;
  metrics: MetricDefinition[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [body, setBody] = useState(template?.body || '');
  const [saving, setSaving] = useState(false);

  // Extract variables from body
  const extractVariables = (text: string): string[] => {
    const matches = text.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map((m) => m.replace(/[{}]/g, '')))];
  };

  const handleSave = async () => {
    if (!name || !body) return;
    setSaving(true);
    try {
      const variables = extractVariables(body);
      const data = { name, description, body, variables, enabled: true };

      if (template) {
        await axios.put(`/api/scheduled-notifications/templates/${template.id}`, data);
      } else {
        await axios.post('/api/scheduled-notifications/templates', data);
      }
      onSave();
    } catch (err) {
      console.error('Save failed:', err);
      alert('Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-slate-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {template ? 'Edit Template' : 'Create Template'}
          </h3>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
              placeholder="Daily PCN Summary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
              placeholder="Optional description"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Message Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-mono text-sm"
              placeholder="PCN Summary for {{current_date}}&#10;&#10;Approved: {{pcn_approved_today}}&#10;Declined: {{pcn_declined_today}}"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Available Metrics
            </label>
            <div className="flex flex-wrap gap-2">
              {metrics.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setBody((b) => b + `{{${m.key}}}`)}
                  className="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded text-gray-600 dark:text-gray-400"
                  title={m.description}
                >
                  {`{{${m.key}}}`}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="p-6 border-t border-gray-200 dark:border-slate-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name || !body}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Notification Modal
function NotificationModal({
  notification,
  templates,
  recipients,
  metrics,
  onClose,
  onSave,
}: {
  notification: ScheduledNotification | null;
  templates: NotificationTemplate[];
  recipients: NotificationRecipient[];
  metrics: MetricDefinition[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [name, setName] = useState(notification?.name || '');
  const [cronSchedule, setCronSchedule] = useState(notification?.cronSchedule || '0 9 * * *');
  const [cronPreset, setCronPreset] = useState('custom');
  const [templateId, setTemplateId] = useState(notification?.templateId || '');
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>(
    notification?.recipientIds || []
  );
  const [variableConfig, setVariableConfig] = useState<Record<string, VariableConfig>>(
    notification?.variableConfig || {}
  );
  const [saving, setSaving] = useState(false);

  const selectedTemplate = templates.find((t) => t.id === templateId);

  // Initialize variable config when template changes
  useEffect(() => {
    if (selectedTemplate) {
      const newConfig: Record<string, VariableConfig> = {};
      selectedTemplate.variables.forEach((v) => {
        newConfig[v] = variableConfig[v] || { source: 'METRIC', metricKey: v };
      });
      setVariableConfig(newConfig);
    }
  }, [templateId]);

  const handleSave = async () => {
    if (!name || !templateId || selectedRecipients.length === 0) return;
    setSaving(true);
    try {
      const data = {
        name,
        cronSchedule,
        templateId,
        recipientIds: selectedRecipients,
        variableConfig,
        enabled: true,
      };

      if (notification) {
        await axios.put(`/api/scheduled-notifications/${notification.id}`, data);
      } else {
        await axios.post('/api/scheduled-notifications', data);
      }
      onSave();
    } catch (err) {
      console.error('Save failed:', err);
      alert('Failed to save notification');
    } finally {
      setSaving(false);
    }
  };

  const handlePresetChange = (preset: string) => {
    setCronPreset(preset);
    if (preset !== 'custom') {
      setCronSchedule(preset);
    }
  };

  const toggleRecipient = (id: string) => {
    setSelectedRecipients((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-slate-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {notification ? 'Edit Notification' : 'Create Notification'}
          </h3>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
              placeholder="Daily PCN Summary to Karl"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Schedule
            </label>
            <div className="flex gap-2 mb-2">
              {CRON_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => handlePresetChange(preset.value)}
                  className={`px-3 py-1 text-sm rounded-lg ${
                    cronPreset === preset.value || cronSchedule === preset.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={cronSchedule}
              onChange={(e) => {
                setCronSchedule(e.target.value);
                setCronPreset('custom');
              }}
              className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-mono"
              placeholder="0 9 * * *"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Template
            </label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            >
              <option value="">Select a template...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Recipients
            </label>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {recipients.map((r) => (
                <label
                  key={r.id}
                  className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedRecipients.includes(r.id)}
                    onChange={() => toggleRecipient(r.id)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-gray-900 dark:text-white">{r.name}</span>
                  <span className="text-xs text-gray-500">
                    {r.type.replace('_', ' ')}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {selectedTemplate && selectedTemplate.variables.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Variable Configuration
              </label>
              <div className="space-y-2">
                {selectedTemplate.variables.map((v) => (
                  <div key={v} className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400 w-32">
                      {`{{${v}}}`}
                    </span>
                    <select
                      value={variableConfig[v]?.metricKey || v}
                      onChange={(e) =>
                        setVariableConfig((prev) => ({
                          ...prev,
                          [v]: { source: 'METRIC', metricKey: e.target.value },
                        }))
                      }
                      className="flex-1 px-3 py-1 text-sm border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                    >
                      {metrics.map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="p-6 border-t border-gray-200 dark:border-slate-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name || !templateId || selectedRecipients.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Notification'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Recipient Modal
function RecipientModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: () => void;
}) {
  const [type, setType] = useState<'TELEGRAM_USER' | 'TELEGRAM_GROUP' | 'EMAIL'>('TELEGRAM_USER');
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [telegramUsername, setTelegramUsername] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name || !identifier) return;
    setSaving(true);
    try {
      await axios.post('/api/scheduled-notifications/recipients', {
        type,
        name,
        identifier,
        telegramUsername: telegramUsername || undefined,
        enabled: true,
      });
      onSave();
    } catch (err) {
      console.error('Save failed:', err);
      alert('Failed to save recipient');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200 dark:border-slate-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Add Recipient
          </h3>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            >
              <option value="TELEGRAM_USER">Telegram User</option>
              <option value="TELEGRAM_GROUP">Telegram Group</option>
              <option value="EMAIL">Email</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
              placeholder="Karl"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {type === 'EMAIL' ? 'Email Address' : 'Telegram Chat ID'}
            </label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
              placeholder={type === 'EMAIL' ? 'karl@example.com' : '123456789'}
            />
          </div>
          {type.startsWith('TELEGRAM') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Telegram Username (optional)
              </label>
              <input
                type="text"
                value={telegramUsername}
                onChange={(e) => setTelegramUsername(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                placeholder="@username"
              />
            </div>
          )}
        </div>
        <div className="p-6 border-t border-gray-200 dark:border-slate-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name || !identifier}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Add Recipient'}
          </button>
        </div>
      </div>
    </div>
  );
}
