import { Sparkline } from './Sparkline';

interface SiteCardProps {
  siteName: string;
  status: 'healthy' | 'warning' | 'critical';
  entries: number;
  exits: number;
  violations: number;
  hourlyActivity: { hour: number; count: number }[];
  lastSync: string | null;
}

const STATUS_CONFIG = {
  healthy: {
    label: 'Online',
    dotClass: 'bg-green-500 shadow-green-500/50',
    borderClass: 'border-green-500/20',
    glowClass: 'shadow-green-500/10',
  },
  warning: {
    label: 'Warning',
    dotClass: 'bg-amber-500 shadow-amber-500/50',
    borderClass: 'border-amber-500/20',
    glowClass: 'shadow-amber-500/10',
  },
  critical: {
    label: 'Offline',
    dotClass: 'bg-red-500 shadow-red-500/50 animate-pulse',
    borderClass: 'border-red-500/20',
    glowClass: 'shadow-red-500/10',
  },
};

export function SiteCard({
  siteName,
  status,
  entries,
  exits,
  violations,
  hourlyActivity,
  lastSync,
}: SiteCardProps) {
  const config = STATUS_CONFIG[status];

  const formatLastSync = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const sparklineColor = status === 'critical' ? '#ef4444' : status === 'warning' ? '#f59e0b' : '#3b82f6';

  return (
    <div
      className={`
        bg-white dark:bg-slate-800 rounded-2xl p-6 border-2 ${config.borderClass}
        shadow-lg ${config.glowClass} transition-all duration-300 hover:scale-[1.02]
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">
          {siteName}
        </h3>
        <div className="flex items-center gap-2">
          <span
            className={`w-3 h-3 rounded-full ${config.dotClass} shadow-lg`}
          />
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {config.label}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400 tabular-nums">
            {entries}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-500 uppercase">
            Entries
          </div>
        </div>
        <div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">
            {exits}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-500 uppercase">
            Exits
          </div>
        </div>
        <div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums">
            {violations}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-500 uppercase">
            Violations
          </div>
        </div>
      </div>

      {/* Sparkline */}
      <div className="mb-3">
        <Sparkline data={hourlyActivity} color={sparklineColor} height={50} />
      </div>

      {/* Last Sync */}
      <div className="text-xs text-gray-400 dark:text-gray-500 text-right">
        Last sync: {formatLastSync(lastSync)}
      </div>
    </div>
  );
}
