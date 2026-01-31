import { useState, useEffect } from 'react';
import axios from 'axios';
import { Bot, Loader2, X, AlertTriangle, CheckCircle, Info, Clock, Sparkles } from 'lucide-react';

interface AiReviewButtonProps {
  context: 'system' | 'enforcement' | 'vrm';
  entityId?: string;
  vrm?: string;
  siteId?: string;
  variant?: 'button' | 'icon';
  className?: string;
}

interface ReviewRequest {
  id: string;
  context: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requestedAt: string;
  response?: {
    summary: string;
    details?: string;
    recommendations?: string;
    severity?: string;
    completedAt: string;
  };
  error?: string;
}

export function AiReviewButton({
  context,
  entityId,
  vrm,
  siteId,
  variant = 'button',
  className = '',
}: AiReviewButtonProps) {
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reviewRequest, setReviewRequest] = useState<ReviewRequest | null>(null);
  const [reviewData, setReviewData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);

  // Check if AI review is enabled
  useEffect(() => {
    const checkEnabled = async () => {
      try {
        const { data } = await axios.get('/api/ai-review/enabled');
        setIsEnabled(data.enabled);
      } catch {
        setIsEnabled(false);
      }
    };
    checkEnabled();
  }, []);

  // Poll for review status updates
  useEffect(() => {
    if (!reviewRequest || !isOpen) return;
    if (reviewRequest.status === 'completed' || reviewRequest.status === 'failed') return;

    const pollInterval = setInterval(async () => {
      try {
        const { data } = await axios.get(`/api/ai-review-queue/status/${reviewRequest.id}`);
        setReviewRequest(data);
        
        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error('Poll failed', err);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [reviewRequest?.id, reviewRequest?.status, isOpen]);

  const fetchReviewData = async () => {
    try {
      let endpoint = '';
      const params: Record<string, string> = {};
      
      switch (context) {
        case 'system':
          endpoint = '/api/ai-review/system';
          if (siteId) params.siteId = siteId;
          break;
        case 'enforcement':
          if (!entityId) throw new Error('Entity ID required');
          endpoint = `/api/ai-review/enforcement/${entityId}`;
          break;
        case 'vrm':
          if (!vrm) throw new Error('VRM required');
          endpoint = `/api/ai-review/vrm/${vrm}`;
          if (siteId) params.siteId = siteId;
          break;
      }
      
      const { data } = await axios.get(endpoint, { params });
      setReviewData(data);
    } catch (err: any) {
      console.error('Failed to fetch review data', err);
    }
  };

  const requestReview = async () => {
    setLoading(true);
    setError(null);
    setReviewRequest(null);
    
    try {
      // Fetch the data first
      await fetchReviewData();
      
      // Queue the review request
      const { data } = await axios.post('/api/ai-review-queue/request', {
        context,
        entityId,
        vrm,
        siteId,
        requestedBy: 'operator',
      });
      
      // Set the pending request
      setReviewRequest({
        id: data.requestId,
        context,
        status: 'pending',
        requestedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to request review');
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    setIsOpen(true);
    setShowJson(false);
    requestReview();
  };

  // Don't render if AI review is disabled
  if (isEnabled === false) return null;
  if (isEnabled === null) return null;

  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'CRITICAL': return 'text-red-600 bg-red-100 dark:bg-red-900/30';
      case 'ALERT': return 'text-orange-600 bg-orange-100 dark:bg-orange-900/30';
      case 'WARNING': return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30';
      default: return 'text-blue-600 bg-blue-100 dark:bg-blue-900/30';
    }
  };

  return (
    <>
      {variant === 'button' ? (
        <button
          onClick={handleClick}
          className={`flex items-center gap-2 px-3 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors text-sm font-medium ${className}`}
          title="AI Review"
        >
          <Bot className="w-4 h-4" />
          AI Review
        </button>
      ) : (
        <button
          onClick={handleClick}
          className={`p-2 text-violet-600 hover:bg-violet-100 dark:hover:bg-violet-900/30 rounded-lg transition-colors ${className}`}
          title="AI Review"
        >
          <Bot className="w-5 h-5" />
        </button>
      )}

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-100 dark:bg-violet-900/20 rounded-lg">
                  <Bot className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">
                    AI Review
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {context === 'system' && 'System Analysis'}
                    {context === 'enforcement' && `Case: ${entityId?.substring(0, 8)}...`}
                    {context === 'vrm' && `Vehicle: ${vrm}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {error ? (
                <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              ) : reviewRequest?.status === 'completed' && reviewRequest.response ? (
                <div className="space-y-4">
                  {/* Success Banner */}
                  <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg">
                    <CheckCircle className="w-5 h-5 flex-shrink-0" />
                    <span className="font-medium">Analysis Complete</span>
                  </div>

                  {/* Severity Badge */}
                  {reviewRequest.response.severity && (
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${getSeverityColor(reviewRequest.response.severity)}`}>
                      <Sparkles className="w-4 h-4" />
                      {reviewRequest.response.severity}
                    </div>
                  )}

                  {/* Summary */}
                  <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Summary</h4>
                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                      {reviewRequest.response.summary}
                    </p>
                  </div>

                  {/* Details */}
                  {reviewRequest.response.details && (
                    <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-lg">
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Details</h4>
                      <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap text-sm">
                        {reviewRequest.response.details}
                      </p>
                    </div>
                  )}

                  {/* Recommendations */}
                  {reviewRequest.response.recommendations && (
                    <div className="p-4 bg-violet-50 dark:bg-violet-900/20 rounded-lg border border-violet-200 dark:border-violet-800">
                      <h4 className="font-semibold text-violet-900 dark:text-violet-300 mb-2 flex items-center gap-2">
                        <Info className="w-4 h-4" />
                        Recommendations
                      </h4>
                      <p className="text-violet-800 dark:text-violet-300 whitespace-pre-wrap text-sm">
                        {reviewRequest.response.recommendations}
                      </p>
                    </div>
                  )}
                </div>
              ) : reviewRequest?.status === 'failed' ? (
                <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <span>{reviewRequest.error || 'Review failed'}</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Status */}
                  <div className="flex items-center justify-center gap-3 p-6 bg-violet-50 dark:bg-violet-900/20 rounded-lg">
                    {loading || reviewRequest?.status === 'pending' ? (
                      <>
                        <Clock className="w-6 h-6 text-violet-600 animate-pulse" />
                        <div className="text-center">
                          <div className="font-medium text-violet-900 dark:text-violet-300">
                            Waiting for Skynet...
                          </div>
                          <div className="text-sm text-violet-600 dark:text-violet-400">
                            AI assistant will analyze and respond
                          </div>
                        </div>
                      </>
                    ) : reviewRequest?.status === 'processing' ? (
                      <>
                        <Loader2 className="w-6 h-6 text-violet-600 animate-spin" />
                        <div className="text-center">
                          <div className="font-medium text-violet-900 dark:text-violet-300">
                            Skynet is analyzing...
                          </div>
                          <div className="text-sm text-violet-600 dark:text-violet-400">
                            Review in progress
                          </div>
                        </div>
                      </>
                    ) : (
                      <Loader2 className="w-6 h-6 text-violet-600 animate-spin" />
                    )}
                  </div>

                  {/* Show JSON toggle */}
                  {reviewData && (
                    <div>
                      <button
                        onClick={() => setShowJson(!showJson)}
                        className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                      >
                        {showJson ? 'Hide' : 'Show'} raw data
                      </button>
                      {showJson && (
                        <pre className="mt-2 p-3 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-xs max-h-64">
                          {JSON.stringify(reviewData, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-slate-800 flex justify-between items-center">
              <div className="text-xs text-gray-400">
                {reviewRequest?.id && `Request: ${reviewRequest.id.substring(0, 16)}...`}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Close
                </button>
                {reviewRequest?.status !== 'pending' && reviewRequest?.status !== 'processing' && (
                  <button
                    onClick={requestReview}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50"
                  >
                    <Bot className="w-4 h-4" />
                    New Review
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default AiReviewButton;
