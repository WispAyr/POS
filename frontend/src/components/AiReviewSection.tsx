import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Bot,
  Loader2,
  RefreshCw,
  Clock,
  AlertTriangle,
  Sparkles,
  MessageSquare,
  Zap,
  ChevronDown,
  ChevronUp,
  Eye,
  Shield,
  Activity,
  FileSearch,
  Lightbulb,
  Play,
} from 'lucide-react';

interface ReviewRequest {
  id: string;
  context: 'system' | 'enforcement' | 'vrm' | 'filo';
  entityId?: string;
  vrm?: string;
  siteId?: string;
  minHours?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requestedAt: string;
  requestedBy: string;
  response?: {
    summary: string;
    details?: string;
    recommendations?: string;
    severity?: string;
    completedAt: string;
  };
  error?: string;
}

interface AiObservation {
  id: string;
  type: string;
  timestamp: string;
  details: {
    summary: string;
    details?: string;
    recommendations?: string;
    severity?: string;
  };
}

interface SystemStats {
  pendingEnforcement: number;
  activeSessions: number;
  totalActiveSites: number;
}

const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  INFO: { bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-800' },
  WARNING: { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800' },
  CRITICAL: { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-600 dark:text-red-400', border: 'border-red-200 dark:border-red-800' },
  SUCCESS: { bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-600 dark:text-green-400', border: 'border-green-200 dark:border-green-800' },
};

export function AiReviewSection() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  
  const [pendingReviews, setPendingReviews] = useState<ReviewRequest[]>([]);
  const [recentReviews, setRecentReviews] = useState<ReviewRequest[]>([]);
  const [observations, setObservations] = useState<AiObservation[]>([]);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  
  const [requestingReview, setRequestingReview] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/ai-review/enabled');
      setEnabled(data.enabled);
    } catch (err) {
      console.error('Failed to fetch AI review status', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReviewData = useCallback(async () => {
    if (!enabled) return;
    
    try {
      setRefreshing(true);
      const [pendingRes, recentRes, systemRes] = await Promise.all([
        axios.get('/api/ai-review-queue/pending').catch(() => ({ data: [] })),
        axios.get('/api/ai-review-queue/recent?limit=5').catch(() => ({ data: [] })),
        axios.get('/api/ai-review/system?includeAuditTrail=false').catch(() => ({ data: null })),
      ]);
      
      setPendingReviews(pendingRes.data || []);
      setRecentReviews(recentRes.data || []);
      
      if (systemRes.data) {
        setSystemStats({
          pendingEnforcement: systemRes.data.stats?.pendingEnforcement || 0,
          activeSessions: systemRes.data.stats?.activeSessions || 0,
          totalActiveSites: systemRes.data.stats?.totalActiveSites || 0,
        });
        setObservations(systemRes.data.previousAiObservations || []);
      }
    } catch (err) {
      console.error('Failed to fetch AI review data', err);
    } finally {
      setRefreshing(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (enabled) {
      fetchReviewData();
      const interval = setInterval(fetchReviewData, 30000); // Refresh every 30s
      return () => clearInterval(interval);
    }
  }, [enabled, fetchReviewData]);

  const toggleEnabled = async () => {
    try {
      setLoading(true);
      const { data } = await axios.post('/api/ai-review/enabled', {
        enabled: !enabled,
      });
      setEnabled(data.enabled);
      if (data.enabled) {
        fetchReviewData();
      }
    } catch (err) {
      console.error('Failed to toggle AI review', err);
    } finally {
      setLoading(false);
    }
  };

  const requestReview = async (context: 'system' | 'enforcement' | 'vrm' | 'filo', entityId?: string, vrm?: string) => {
    const key = `${context}-${entityId || vrm || 'all'}`;
    setRequestingReview(key);
    try {
      await axios.post('/api/ai-review-queue/request', {
        context,
        entityId,
        vrm,
        requestedBy: 'operator',
      });
      // Refresh the pending list
      fetchReviewData();
    } catch (err) {
      console.error('Failed to request AI review', err);
    } finally {
      setRequestingReview(null);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const getSeverityStyle = (severity?: string) => {
    return SEVERITY_COLORS[severity || 'INFO'] || SEVERITY_COLORS.INFO;
  };

  // Don't render if loading initial state
  if (loading) {
    return (
      <div className="flex items-center justify-center p-4 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-800">
        <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
        <span className="ml-2 text-gray-500 dark:text-gray-400">Loading AI Review...</span>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
      {/* Header */}
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-100 dark:bg-violet-900/20 rounded-lg">
            <Bot className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              AI Review Centre
              {pendingReviews.length > 0 && (
                <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
                  {pendingReviews.length} pending
                </span>
              )}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Skynet AI-powered analysis and recommendations
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Enable toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleEnabled();
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              enabled ? 'bg-violet-600' : 'bg-gray-200 dark:bg-slate-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && enabled && (
        <div className="border-t border-gray-100 dark:border-slate-800">
          {/* Quick Actions */}
          <div className="p-4 bg-gray-50 dark:bg-slate-800/30 border-b border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <Zap className="w-4 h-4 text-violet-500" />
                Request AI Review
              </h4>
              <button
                onClick={fetchReviewData}
                disabled={refreshing}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                onClick={() => requestReview('system')}
                disabled={requestingReview === 'system-all'}
                className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-violet-300 dark:hover:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all disabled:opacity-50"
              >
                {requestingReview === 'system-all' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Activity className="w-4 h-4 text-violet-500" />
                )}
                System Health
              </button>
              <button
                onClick={() => requestReview('enforcement')}
                disabled={requestingReview === 'enforcement-all'}
                className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-violet-300 dark:hover:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all disabled:opacity-50"
              >
                {requestingReview === 'enforcement-all' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Shield className="w-4 h-4 text-amber-500" />
                )}
                Enforcement
              </button>
              <button
                onClick={() => requestReview('filo')}
                disabled={requestingReview === 'filo-all'}
                className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-violet-300 dark:hover:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all disabled:opacity-50"
              >
                {requestingReview === 'filo-all' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                )}
                FILO Anomalies
              </button>
              <button
                onClick={() => {
                  const vrm = prompt('Enter VRM to review:');
                  if (vrm) requestReview('vrm', undefined, vrm.toUpperCase().replace(/\s/g, ''));
                }}
                disabled={requestingReview?.startsWith('vrm-')}
                className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-violet-300 dark:hover:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all disabled:opacity-50"
              >
                <FileSearch className="w-4 h-4 text-blue-500" />
                VRM History
              </button>
            </div>
          </div>

          {/* Pending Reviews */}
          {pendingReviews.length > 0 && (
            <div className="p-4 border-b border-gray-100 dark:border-slate-800">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                Pending Reviews
              </h4>
              <div className="space-y-2">
                {pendingReviews.map((review) => (
                  <div
                    key={review.id}
                    className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-900/30"
                  >
                    <div className="flex items-center gap-3">
                      {review.status === 'processing' ? (
                        <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                      ) : (
                        <Clock className="w-4 h-4 text-amber-500" />
                      )}
                      <div>
                        <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                          {review.context} Review
                        </span>
                        {review.vrm && (
                          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                            VRM: {review.vrm}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatTime(review.requestedAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Completed Reviews */}
          {recentReviews.length > 0 && (
            <div className="p-4 border-b border-gray-100 dark:border-slate-800">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-green-500" />
                Recent AI Reviews
              </h4>
              <div className="space-y-3">
                {recentReviews.map((review) => {
                  const severity = review.response?.severity || 'INFO';
                  const style = getSeverityStyle(severity);
                  return (
                    <div
                      key={review.id}
                      className={`p-4 rounded-lg border ${style.bg} ${style.border}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${style.text} bg-white/50 dark:bg-black/20`}>
                            {severity}
                          </span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                            {review.context} Review
                          </span>
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {review.response?.completedAt && formatTime(review.response.completedAt)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                        {review.response?.summary}
                      </p>
                      {review.response?.recommendations && (
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-700">
                          <div className="flex items-start gap-2">
                            <Lightbulb className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {review.response.recommendations}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* AI Observations */}
          {observations.length > 0 && (
            <div className="p-4 border-b border-gray-100 dark:border-slate-800">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <Eye className="w-4 h-4 text-blue-500" />
                Recent AI Observations (24h)
              </h4>
              <div className="space-y-2">
                {observations.slice(0, 5).map((obs) => {
                  const severity = obs.details?.severity || 'INFO';
                  const style = getSeverityStyle(severity);
                  return (
                    <div
                      key={obs.id}
                      className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-slate-800/50 rounded-lg"
                    >
                      <div className={`p-1 rounded ${style.bg}`}>
                        <Sparkles className={`w-3 h-3 ${style.text}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                            {obs.type.replace('AI_', '')}
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {formatTime(obs.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
                          {obs.details?.summary || 'No summary'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recommendations / Interventions */}
          <div className="p-4">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              Suggested Interventions
            </h4>
            <div className="space-y-2">
              {/* Dynamic recommendations based on system stats */}
              {systemStats?.pendingEnforcement && systemStats.pendingEnforcement > 10 && (
                <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-900/30">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        Review Enforcement Queue
                      </span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {systemStats.pendingEnforcement} items pending review
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => requestReview('enforcement')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 transition-colors"
                  >
                    <Play className="w-3 h-3" />
                    Analyze
                  </button>
                </div>
              )}
              
              {/* Static recommendations */}
              <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-900/30">
                <div className="flex items-center gap-3">
                  <Activity className="w-4 h-4 text-blue-500" />
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      System Health Check
                    </span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Full system analysis with recommendations
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => requestReview('system')}
                  disabled={requestingReview === 'system-all'}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                  {requestingReview === 'system-all' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                  Run
                </button>
              </div>

              {/* No recent reviews hint */}
              {recentReviews.length === 0 && observations.length === 0 && (
                <div className="text-center py-6 text-gray-500 dark:text-gray-400">
                  <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No recent AI reviews</p>
                  <p className="text-xs mt-1">Request a review to get started</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Collapsed state when disabled */}
      {expanded && !enabled && (
        <div className="p-6 text-center border-t border-gray-100 dark:border-slate-800">
          <Bot className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            AI Review is disabled. Enable it to access Skynet analysis and recommendations.
          </p>
        </div>
      )}
    </div>
  );
}

export default AiReviewSection;
