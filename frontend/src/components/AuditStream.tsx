import { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  Activity,
  Car,
  CreditCard,
  Shield,
  Camera,
  AlertTriangle,
  CheckCircle,
  
  Clock,
  RefreshCw,
  Pause,
  Play,
  Filter,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { AiReviewButton } from './AiReviewButton';

interface AuditEvent {
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
}

interface AuditStreamProps {
  siteId?: string;
  maxEvents?: number;
  pollInterval?: number;
  fullscreen?: boolean;
  onNavigate?: (viewId: string, context?: { vrm?: string; entityId?: string; entityType?: string }) => void;
}

const ACTION_CONFIG: Record<string, { label: string; icon: typeof Activity; color: string; bgColor: string }> = {
  'MOVEMENT_INGESTED': { 
    label: 'Vehicle Detected', 
    icon: Camera, 
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30'
  },
  'SESSION_CREATED': { 
    label: 'Session Started', 
    icon: Car, 
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30'
  },
  'SESSION_COMPLETED': { 
    label: 'Session Ended', 
    icon: CheckCircle, 
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30'
  },
  'PAYMENT_INGESTED': { 
    label: 'Payment Received', 
    icon: CreditCard, 
    color: 'text-cyan-600 dark:text-cyan-400',
    bgColor: 'bg-cyan-100 dark:bg-cyan-900/30'
  },
  'PERMIT_INGESTED': { 
    label: 'Permit Added', 
    icon: Shield, 
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30'
  },
  'DECISION_CREATED': { 
    label: 'PCN Decision', 
    icon: AlertTriangle, 
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30'
  },
  'ENFORCEMENT_REVIEWED': { 
    label: 'Operator Review', 
    icon: CheckCircle, 
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30'
  },
  'RECONCILIATION_TRIGGERED': { 
    label: 'Payment Matched', 
    icon: RefreshCw, 
    color: 'text-teal-600 dark:text-teal-400',
    bgColor: 'bg-teal-100 dark:bg-teal-900/30'
  },
};

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] || {
    label: action.replace(/_/g, ' '),
    icon: Activity,
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-800'
  };
}

function formatTime(timestamp: string) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-GB', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
}

function formatTimeAgo(timestamp: string) {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = Math.floor((now - then) / 1000);
  
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function AuditStream({ 
  siteId, 
  maxEvents = 100, 
  pollInterval = 2000,
  fullscreen = false,
  onNavigate 
}: AuditStreamProps) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(fullscreen);
  const [selectedSite, setSelectedSite] = useState<string>(siteId || '');
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [stats, setStats] = useState({ total: 0, lastMinute: 0 });
  const lastTimestampRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch sites for filter
  useEffect(() => {
    axios.get('/api/sites?active=true').then(({ data }) => {
      setSites(data.map((s: any) => ({ id: s.id, name: s.name })));
    }).catch(() => {});
  }, []);

  // Initial load
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const params = new URLSearchParams({ limit: maxEvents.toString() });
        if (selectedSite) params.append('siteId', selectedSite);
        
        const { data } = await axios.get(`/api/audit/latest?${params}`);
        setEvents(data.events || []);
        lastTimestampRef.current = data.latestTimestamp;
        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch audit events', err);
        setLoading(false);
      }
    };
    fetchInitial();
  }, [selectedSite, maxEvents]);

  // Polling for new events
  useEffect(() => {
    if (paused) return;

    const pollEvents = async () => {
      try {
        const params = new URLSearchParams({ limit: '50' });
        if (selectedSite) params.append('siteId', selectedSite);
        if (lastTimestampRef.current) {
          params.append('since', lastTimestampRef.current);
        }

        const { data } = await axios.get(`/api/audit/latest?${params}`);
        
        if (data.events && data.events.length > 0) {
          setEvents(prev => {
            const newEvents = [...data.events, ...prev];
            // Deduplicate by ID and limit
            const seen = new Set<string>();
            return newEvents.filter(e => {
              if (seen.has(e.id)) return false;
              seen.add(e.id);
              return true;
            }).slice(0, maxEvents);
          });
          lastTimestampRef.current = data.latestTimestamp;
        }
      } catch (err) {
        console.error('Poll failed', err);
      }
    };

    const interval = setInterval(pollEvents, pollInterval);
    return () => clearInterval(interval);
  }, [paused, selectedSite, pollInterval, maxEvents]);

  // Update stats
  useEffect(() => {
    const oneMinuteAgo = Date.now() - 60000;
    const lastMinute = events.filter(e => new Date(e.timestamp).getTime() > oneMinuteAgo).length;
    setStats({ total: events.length, lastMinute });
  }, [events]);

  // Auto-scroll to top available via containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Handle clicking on an event to navigate to the relevant view
  const handleEventClick = useCallback((event: AuditEvent) => {
    if (!onNavigate) return;
    
    // Determine where to navigate based on entity type and action
    switch (event.action) {
      case 'DECISION_CREATED':
      case 'ENFORCEMENT_REVIEWED':
        // Go to enforcement review (ideally with the specific decision)
        onNavigate('enforcement', { entityId: event.entityId, entityType: 'DECISION' });
        break;
      
      case 'SESSION_CREATED':
      case 'SESSION_COMPLETED':
        // Go to parking events with VRM filter
        onNavigate('parking-events', { vrm: event.vrm, entityId: event.entityId, entityType: 'SESSION' });
        break;
      
      case 'MOVEMENT_INGESTED':
        // Go to events view
        onNavigate('events', { vrm: event.vrm, entityId: event.entityId, entityType: 'MOVEMENT' });
        break;
      
      case 'PAYMENT_INGESTED':
        // Go to payment tracking
        onNavigate('payments', { vrm: event.vrm, entityId: event.entityId, entityType: 'PAYMENT' });
        break;
      
      case 'PERMIT_INGESTED':
        // Go to permits view
        onNavigate('permits', { vrm: event.vrm, entityId: event.entityId, entityType: 'PERMIT' });
        break;
      
      case 'RECONCILIATION_TRIGGERED':
        // Go to parking events (session-related)
        onNavigate('parking-events', { vrm: event.vrm });
        break;
      
      default:
        // For VRM-based events, go to VRM search
        if (event.vrm) {
          onNavigate('vrm-search', { vrm: event.vrm });
        }
        break;
    }
  }, [onNavigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-gray-900' : ''}`}>
      {/* Header */}
      <div className={`flex items-center justify-between p-4 border-b ${
        isFullscreen 
          ? 'bg-gray-800 border-gray-700' 
          : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800'
      }`}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Activity className={`w-5 h-5 ${paused ? 'text-gray-400' : 'text-green-500 animate-pulse'}`} />
            <h2 className={`text-lg font-bold ${isFullscreen ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
              Live Audit Stream
            </h2>
          </div>
          
          {/* Stats */}
          <div className={`flex items-center gap-3 text-sm ${isFullscreen ? 'text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {stats.lastMinute}/min
            </span>
            <span>{stats.total} events</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Site Filter */}
          <div className="relative">
            <select
              value={selectedSite}
              onChange={(e) => {
                setSelectedSite(e.target.value);
                setEvents([]);
                lastTimestampRef.current = null;
                setLoading(true);
              }}
              className={`pl-8 pr-4 py-2 rounded-lg text-sm border ${
                isFullscreen 
                  ? 'bg-gray-700 border-gray-600 text-white'
                  : 'bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white'
              }`}
            >
              <option value="">All Sites</option>
              {sites.map(site => (
                <option key={site.id} value={site.id}>{site.name}</option>
              ))}
            </select>
            <Filter className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>

          {/* AI Review */}
          <AiReviewButton 
            context="system" 
            siteId={selectedSite || undefined}
          />

          {/* Pause/Play */}
          <button
            onClick={() => setPaused(!paused)}
            className={`p-2 rounded-lg transition-colors ${
              paused 
                ? 'bg-green-600 text-white hover:bg-green-700' 
                : 'bg-yellow-600 text-white hover:bg-yellow-700'
            }`}
            title={paused ? 'Resume' : 'Pause'}
          >
            {paused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className={`p-2 rounded-lg transition-colors ${
              isFullscreen
                ? 'bg-gray-700 text-white hover:bg-gray-600'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Events Timeline */}
      <div 
        ref={containerRef}
        className={`flex-1 overflow-y-auto ${
          isFullscreen ? 'bg-gray-900' : 'bg-gray-50 dark:bg-slate-950'
        }`}
        style={{ maxHeight: isFullscreen ? 'calc(100vh - 80px)' : '600px' }}
      >
        {events.length === 0 ? (
          <div className={`flex flex-col items-center justify-center h-64 ${
            isFullscreen ? 'text-gray-400' : 'text-gray-500 dark:text-gray-400'
          }`}>
            <Activity className="w-12 h-12 mb-4 opacity-50" />
            <p>No events yet. Waiting for activity...</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-slate-800">
            {events.map((event, index) => {
              const config = getActionConfig(event.action);
              const Icon = config.icon;
              const isNew = index < 3 && !paused;
              
              return (
                <div
                  key={event.id}
                  onClick={() => handleEventClick(event)}
                  className={`flex items-start gap-4 p-4 transition-all duration-500 cursor-pointer ${
                    isNew ? 'animate-pulse bg-blue-50 dark:bg-blue-900/20' : ''
                  } ${isFullscreen ? 'hover:bg-gray-800' : 'hover:bg-gray-100 dark:hover:bg-slate-800'}`}
                >
                  {/* Icon */}
                  <div className={`flex-shrink-0 p-2 rounded-lg ${config.bgColor}`}>
                    <Icon className={`w-5 h-5 ${config.color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`font-semibold ${isFullscreen ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
                        {config.label}
                      </span>
                      {event.vrm && (
                        <span className="px-2 py-0.5 bg-gray-200 dark:bg-slate-700 rounded text-sm font-mono font-bold text-gray-800 dark:text-gray-200">
                          {event.vrm}
                        </span>
                      )}
                      {event.siteId && (
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          isFullscreen ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400'
                        }`}>
                          {event.siteId}
                        </span>
                      )}
                    </div>
                    
                    {/* Event Details */}
                    <div className={`text-sm ${isFullscreen ? 'text-gray-400' : 'text-gray-600 dark:text-gray-400'}`}>
                      {event.action === 'MOVEMENT_INGESTED' && event.details && (
                        <span>
                          {event.details.direction || 'Movement'} 
                          {event.details.camera && ` via ${event.details.camera}`}
                        </span>
                      )}
                      {event.action === 'PAYMENT_INGESTED' && event.details && (
                        <span>
                          £{event.details.amount?.toFixed(2) || '?'} via {event.details.source || 'unknown'}
                          {event.details.expiryTime && ` • Valid until ${new Date(event.details.expiryTime).toLocaleTimeString()}`}
                        </span>
                      )}
                      {event.action === 'SESSION_CREATED' && (
                        <span>Parking session started</span>
                      )}
                      {event.action === 'SESSION_COMPLETED' && event.details && (
                        <span>
                          Duration: {event.details.durationMinutes ? `${Math.floor(event.details.durationMinutes / 60)}h ${event.details.durationMinutes % 60}m` : 'unknown'}
                        </span>
                      )}
                      {event.action === 'DECISION_CREATED' && event.details && (
                        <span className={event.details.outcome === 'ENFORCEMENT_CANDIDATE' ? 'text-red-500' : ''}>
                          {event.details.reason || event.details.outcome}
                        </span>
                      )}
                      {event.action === 'ENFORCEMENT_REVIEWED' && event.details && (
                        <span>
                          {event.details.action} by {event.actor}
                        </span>
                      )}
                      {event.action === 'RECONCILIATION_TRIGGERED' && (
                        <span>Payment matched to parking session</span>
                      )}
                      {!['MOVEMENT_INGESTED', 'PAYMENT_INGESTED', 'SESSION_CREATED', 'SESSION_COMPLETED', 'DECISION_CREATED', 'ENFORCEMENT_REVIEWED', 'RECONCILIATION_TRIGGERED'].includes(event.action) && (
                        <span>{event.entityType}: {event.entityId.substring(0, 8)}...</span>
                      )}
                    </div>
                  </div>

                  {/* Timestamp */}
                  <div className={`flex-shrink-0 text-right ${isFullscreen ? 'text-gray-500' : 'text-gray-400 dark:text-gray-500'}`}>
                    <div className="text-sm font-medium">{formatTime(event.timestamp)}</div>
                    <div className="text-xs">{formatTimeAgo(event.timestamp)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Paused Indicator */}
      {paused && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-yellow-500 text-black rounded-full font-bold text-sm shadow-lg flex items-center gap-2">
          <Pause className="w-4 h-4" />
          Stream Paused
        </div>
      )}
    </div>
  );
}

export default AuditStream;
