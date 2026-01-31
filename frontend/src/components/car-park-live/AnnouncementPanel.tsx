import { useState } from 'react';
import {
  Volume2,
  ChevronDown,
  ChevronUp,
  Send,
  Loader2,
  AlertTriangle,
  Clock,
  Shield,
  Users,
  MessageSquare,
} from 'lucide-react';

interface Announcement {
  id: string;
  label: string;
  message: string;
  target: 'cameras' | 'horn' | 'all';
  volume: number;
  category?: string;
}

interface AnnouncementPanelProps {
  siteId: string;
  announcements: Announcement[];
  onAnnounce: (message: string, target: 'cameras' | 'horn' | 'all', volume: number, id?: string) => Promise<void>;
  announcingId: string | null;
  // Optional: contextual suggestions from SentryFlow
  activeAlerts?: {
    type: 'crowd' | 'loitering' | 'noise' | 'after-hours';
    level: number;
    message: string;
  }[];
}

// Categorize announcements
const CATEGORIES: Record<string, { icon: typeof Shield; label: string; color: string }> = {
  security: { icon: Shield, label: 'Security', color: 'text-red-500' },
  closing: { icon: Clock, label: 'Closing', color: 'text-amber-500' },
  crowd: { icon: Users, label: 'Crowd', color: 'text-blue-500' },
  general: { icon: MessageSquare, label: 'General', color: 'text-gray-500' },
};

function categorizeAnnouncement(announcement: Announcement): string {
  const label = announcement.label.toLowerCase();
  const message = announcement.message.toLowerCase();
  
  if (label.includes('cctv') || label.includes('security') || label.includes('antisocial') || message.includes('recorded')) {
    return 'security';
  }
  if (label.includes('closing') || label.includes('close') || message.includes('closing')) {
    return 'closing';
  }
  if (label.includes('crowd') || label.includes('capacity') || message.includes('crowded')) {
    return 'crowd';
  }
  return 'general';
}

export function AnnouncementPanel({
  siteId: _siteId,
  announcements,
  onAnnounce,
  announcingId,
  activeAlerts = [],
}: AnnouncementPanelProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  const [customTarget, setCustomTarget] = useState<'cameras' | 'horn' | 'all'>('cameras');
  const [customVolume, setCustomVolume] = useState(100);

  // Group announcements by category
  const grouped = announcements.reduce((acc, ann) => {
    const cat = categorizeAnnouncement(ann);
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(ann);
    return acc;
  }, {} as Record<string, Announcement[]>);

  // Get suggested announcements based on active alerts
  const getSuggestions = () => {
    const suggestions: Announcement[] = [];
    
    for (const alert of activeAlerts) {
      if (alert.type === 'crowd' && grouped.crowd) {
        suggestions.push(...grouped.crowd);
      }
      if (alert.type === 'after-hours' && grouped.security) {
        suggestions.push(...grouped.security.slice(0, 1));
      }
      if (alert.type === 'loitering' && grouped.security) {
        suggestions.push(...grouped.security);
      }
    }
    
    return [...new Set(suggestions)].slice(0, 3);
  };

  const suggestions = getSuggestions();

  const handleCustomAnnounce = async () => {
    if (!customMessage.trim()) return;
    await onAnnounce(customMessage, customTarget, customVolume);
    setCustomMessage('');
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Volume2 className="w-5 h-5" />
          Announcements
        </h3>
        <button
          onClick={() => setShowCustom(!showCustom)}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <Send className="w-4 h-4" />
          Custom
          {showCustom ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Contextual Suggestions (if any alerts active) */}
      {suggestions.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
              Suggested based on current activity
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((ann) => (
              <button
                key={`suggest-${ann.id}`}
                onClick={() => onAnnounce(ann.message, ann.target, ann.volume, ann.id)}
                disabled={announcingId === ann.id}
                className="px-4 py-2 bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {announcingId === ann.id ? (
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                ) : null}
                {ann.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Compact Quick Buttons - Grouped */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
        {Object.entries(CATEGORIES).map(([catKey, catInfo]) => {
          const items = grouped[catKey];
          if (!items || items.length === 0) return null;
          
          const Icon = catInfo.icon;
          
          return (
            <div key={catKey} className="border-b border-gray-100 dark:border-slate-800 last:border-b-0">
              <div className="px-4 py-2 bg-gray-50 dark:bg-slate-800/50 flex items-center gap-2">
                <Icon className={`w-4 h-4 ${catInfo.color}`} />
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  {catInfo.label}
                </span>
              </div>
              <div className="p-2 flex flex-wrap gap-2">
                {items.map((ann) => (
                  <button
                    key={ann.id}
                    onClick={() => onAnnounce(ann.message, ann.target, ann.volume, ann.id)}
                    disabled={announcingId === ann.id}
                    title={ann.message}
                    className="px-3 py-1.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {announcingId === ann.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Volume2 className="w-3 h-3 opacity-50" />
                    )}
                    {ann.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        
        {Object.keys(grouped).length === 0 && (
          <div className="p-6 text-center text-gray-500 dark:text-gray-400">
            No announcements configured
          </div>
        )}
      </div>

      {/* Collapsible Custom Announcement */}
      {showCustom && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
          <textarea
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            placeholder="Type your custom announcement..."
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <div className="flex items-center gap-3">
            <select
              value={customTarget}
              onChange={(e) => setCustomTarget(e.target.value as any)}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-gray-300"
            >
              <option value="cameras">Cameras</option>
              <option value="horn">Horn</option>
              <option value="all">All</option>
            </select>
            <div className="flex items-center gap-2 flex-1">
              <span className="text-xs text-gray-500">{customVolume}%</span>
              <input
                type="range"
                min="10"
                max="100"
                value={customVolume}
                onChange={(e) => setCustomVolume(Number(e.target.value))}
                className="flex-1 h-1.5 rounded-full appearance-none bg-gray-200 dark:bg-slate-700 accent-blue-500"
              />
            </div>
            <button
              onClick={handleCustomAnnounce}
              disabled={!customMessage.trim() || announcingId === 'custom'}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              {announcingId === 'custom' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Send
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
