import { Camera, AlertTriangle } from 'lucide-react';

interface CameraFeedProps {
  cameraName: string;
  vrm: string | null;
  timestamp: string | null;
  imageUrl: string | null;
  status: 'online' | 'offline' | 'warning';
}

export function CameraFeed({
  cameraName,
  vrm,
  timestamp,
  imageUrl,
  status,
}: CameraFeedProps) {
  const formatTimeAgo = (ts: string | null) => {
    if (!ts) return 'No data';
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  const statusColors = {
    online: 'border-green-500/30',
    warning: 'border-amber-500/30',
    offline: 'border-red-500/30',
  };

  return (
    <div
      className={`
        bg-white dark:bg-slate-800 rounded-xl overflow-hidden border-2 ${statusColors[status]}
        shadow-md hover:shadow-lg transition-all duration-200
      `}
    >
      {/* Image Area */}
      <div className="relative aspect-video bg-gray-100 dark:bg-slate-900">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`Last detection from ${cameraName}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {status === 'offline' ? (
              <AlertTriangle className="w-8 h-8 text-red-400" />
            ) : (
              <Camera className="w-8 h-8 text-gray-400 dark:text-gray-600" />
            )}
          </div>
        )}

        {/* Camera Name Badge */}
        <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-sm rounded text-xs font-medium text-white">
          {cameraName}
        </div>

        {/* Status Indicator */}
        <div className="absolute top-2 right-2">
          <span
            className={`
              w-2.5 h-2.5 rounded-full inline-block
              ${status === 'online' ? 'bg-green-500' : status === 'warning' ? 'bg-amber-500' : 'bg-red-500'}
              ${status === 'offline' ? 'animate-pulse' : ''}
            `}
          />
        </div>
      </div>

      {/* Info Area */}
      <div className="p-3">
        <div className="text-lg font-mono font-bold text-gray-900 dark:text-white tracking-wider">
          {vrm || '---'}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {formatTimeAgo(timestamp)}
        </div>
      </div>
    </div>
  );
}
