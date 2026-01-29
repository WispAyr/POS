import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  AlertCircle,
  CheckCircle,
  XCircle,
  Edit3,
  Lightbulb,
  Filter,
  RefreshCw,
  Clock,
} from 'lucide-react';

interface PlateReview {
  id: string;
  movementId: string;
  originalVrm: string;
  normalizedVrm: string;
  siteId: string;
  timestamp: string;
  confidence: number;
  suspicionReasons: string[];
  validationStatus: string;
  reviewStatus: string;
  correctedVrm?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  images: Array<{ url: string; type: string }>;
  metadata: any;
}

interface ReviewStatistics {
  totalPending: number;
  totalApproved: number;
  totalCorrected: number;
  totalDiscarded: number;
  total: number;
  byValidationStatus: {
    ukSuspicious: number;
    internationalSuspicious: number;
    invalid: number;
  };
}

interface CorrectionSuggestion {
  originalVrm: string;
  suggestedVrm: string;
  reason: string;
  confidence: number;
}

const PlateReviewQueue: React.FC = () => {
  const [reviews, setReviews] = useState<PlateReview[]>([]);
  const [statistics, setStatistics] = useState<ReviewStatistics | null>(null);
  const [selectedReviews, setSelectedReviews] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [editingReview, setEditingReview] = useState<string | null>(null);
  const [correctedVrm, setCorrectedVrm] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [suggestions, setSuggestions] = useState<CorrectionSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Filters
  const [siteFilter, setSiteFilter] = useState('');
  const [validationStatusFilter, setValidationStatusFilter] = useState('');
  const [reviewStatusFilter, setReviewStatusFilter] = useState('PENDING');

  const [total, setTotal] = useState(0);
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    loadReviews();
    loadStatistics();
  }, [siteFilter, validationStatusFilter, reviewStatusFilter, offset]);

  const loadReviews = async () => {
    setLoading(true);
    try {
      const params: any = {
        limit,
        offset,
      };

      if (siteFilter) params.siteId = siteFilter;
      if (validationStatusFilter) params.validationStatus = validationStatusFilter;
      if (reviewStatusFilter) params.reviewStatus = reviewStatusFilter;

      const response = await axios.get('/plate-review/queue', { params });
      setReviews(response.data.items);
      setTotal(response.data.total);
    } catch (error) {
      console.error('Failed to load reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStatistics = async () => {
    try {
      const response = await axios.get('/plate-review/stats/summary', {
        params: siteFilter ? { siteId: siteFilter } : {},
      });
      setStatistics(response.data);
    } catch (error) {
      console.error('Failed to load statistics:', error);
    }
  };

  const loadSuggestions = async (reviewId: string, _vrm: string) => {
    try {
      const response = await axios.get(`/plate-review/${reviewId}/suggestions`);
      setSuggestions(response.data);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    }
  };

  const handleApprove = async (reviewId: string) => {
    try {
      await axios.post(`/plate-review/${reviewId}/approve`, {
        userId: 'operator', // TODO: Get from auth context
        notes: reviewNotes,
      });
      await loadReviews();
      await loadStatistics();
      setReviewNotes('');
    } catch (error) {
      console.error('Failed to approve review:', error);
      alert('Failed to approve review');
    }
  };

  const handleCorrect = async (reviewId: string) => {
    if (!correctedVrm.trim()) {
      alert('Please enter a corrected VRM');
      return;
    }

    try {
      await axios.post(`/plate-review/${reviewId}/correct`, {
        userId: 'operator', // TODO: Get from auth context
        correctedVrm: correctedVrm.trim(),
        notes: reviewNotes,
      });
      await loadReviews();
      await loadStatistics();
      setEditingReview(null);
      setCorrectedVrm('');
      setReviewNotes('');
      setSuggestions([]);
      setShowSuggestions(false);
    } catch (error) {
      console.error('Failed to correct review:', error);
      alert('Failed to correct review');
    }
  };

  const handleDiscard = async (reviewId: string) => {
    const reason = prompt('Please provide a reason for discarding this plate:');
    if (!reason) return;

    try {
      await axios.post(`/plate-review/${reviewId}/discard`, {
        userId: 'operator', // TODO: Get from auth context
        reason,
      });
      await loadReviews();
      await loadStatistics();
    } catch (error) {
      console.error('Failed to discard review:', error);
      alert('Failed to discard review');
    }
  };

  const handleBulkApprove = async () => {
    if (selectedReviews.size === 0) {
      alert('Please select reviews to approve');
      return;
    }

    if (!confirm(`Approve ${selectedReviews.size} selected reviews?`)) return;

    try {
      await axios.post('/plate-review/bulk-approve', {
        userId: 'operator', // TODO: Get from auth context
        reviewIds: Array.from(selectedReviews),
      });
      setSelectedReviews(new Set());
      await loadReviews();
      await loadStatistics();
    } catch (error) {
      console.error('Failed to bulk approve:', error);
      alert('Failed to bulk approve reviews');
    }
  };

  const handleBulkDiscard = async () => {
    if (selectedReviews.size === 0) {
      alert('Please select reviews to discard');
      return;
    }

    const reason = prompt(
      `Please provide a reason for discarding ${selectedReviews.size} selected reviews:`,
    );
    if (!reason) return;

    try {
      await axios.post('/plate-review/bulk-discard', {
        userId: 'operator', // TODO: Get from auth context
        reviewIds: Array.from(selectedReviews),
        reason,
      });
      setSelectedReviews(new Set());
      await loadReviews();
      await loadStatistics();
    } catch (error) {
      console.error('Failed to bulk discard:', error);
      alert('Failed to bulk discard reviews');
    }
  };

  const toggleSelection = (reviewId: string) => {
    const newSelection = new Set(selectedReviews);
    if (newSelection.has(reviewId)) {
      newSelection.delete(reviewId);
    } else {
      newSelection.add(reviewId);
    }
    setSelectedReviews(newSelection);
  };

  const selectAll = () => {
    if (selectedReviews.size === reviews.length) {
      setSelectedReviews(new Set());
    } else {
      setSelectedReviews(new Set(reviews.map((r) => r.id)));
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'UK_VALID':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'INTERNATIONAL_VALID':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'UK_SUSPICIOUS':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'INTERNATIONAL_SUSPICIOUS':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'INVALID':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  const formatReason = (reason: string) => {
    return reason
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Plate Review Queue
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Review and correct suspicious or invalid license plates before processing
        </p>
      </div>

      {/* Statistics */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-600 dark:text-yellow-400">Pending</p>
                <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
                  {statistics.totalPending}
                </p>
              </div>
              <Clock className="text-yellow-600 dark:text-yellow-400" size={24} />
            </div>
          </div>

          <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 dark:text-green-400">Approved</p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                  {statistics.totalApproved}
                </p>
              </div>
              <CheckCircle className="text-green-600 dark:text-green-400" size={24} />
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 dark:text-blue-400">Corrected</p>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                  {statistics.totalCorrected}
                </p>
              </div>
              <Edit3 className="text-blue-600 dark:text-blue-400" size={24} />
            </div>
          </div>

          <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-600 dark:text-red-400">Discarded</p>
                <p className="text-2xl font-bold text-red-700 dark:text-red-300">
                  {statistics.totalDiscarded}
                </p>
              </div>
              <XCircle className="text-red-600 dark:text-red-400" size={24} />
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
                <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                  {statistics.total}
                </p>
              </div>
              <AlertCircle className="text-gray-600 dark:text-gray-400" size={24} />
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter size={20} className="text-gray-600 dark:text-gray-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filters:</span>
          </div>

          <select
            value={reviewStatusFilter}
            onChange={(e) => setReviewStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">All Review Status</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="CORRECTED">Corrected</option>
            <option value="DISCARDED">Discarded</option>
          </select>

          <select
            value={validationStatusFilter}
            onChange={(e) => setValidationStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">All Validation Status</option>
            <option value="UK_SUSPICIOUS">UK Suspicious</option>
            <option value="INTERNATIONAL_SUSPICIOUS">International Suspicious</option>
            <option value="INVALID">Invalid</option>
          </select>

          <input
            type="text"
            placeholder="Filter by Site ID"
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />

          <button
            onClick={loadReviews}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedReviews.size > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg mb-6 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <span className="text-blue-700 dark:text-blue-300 font-medium">
              {selectedReviews.size} review(s) selected
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleBulkApprove}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-2"
              >
                <CheckCircle size={16} />
                Bulk Approve
              </button>
              <button
                onClick={handleBulkDiscard}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2"
              >
                <XCircle size={16} />
                Bulk Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reviews List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedReviews.size === reviews.length && reviews.length > 0}
                    onChange={selectAll}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  VRM
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Site
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Confidence
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Validation
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Suspicion Reasons
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Images
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    Loading...
                  </td>
                </tr>
              ) : reviews.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No reviews found
                  </td>
                </tr>
              ) : (
                reviews.map((review) => (
                  <tr key={review.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedReviews.has(review.id)}
                        onChange={() => toggleSelection(review.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-4">
                      {editingReview === review.id ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={correctedVrm}
                            onChange={(e) => setCorrectedVrm(e.target.value.toUpperCase())}
                            placeholder={review.normalizedVrm}
                            className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
                          />
                          {showSuggestions && suggestions.length > 0 && (
                            <div className="text-xs space-y-1">
                              <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                                <Lightbulb size={12} />
                                <span>Suggestions:</span>
                              </div>
                              {suggestions.map((s, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => setCorrectedVrm(s.suggestedVrm)}
                                  className="block w-full text-left px-2 py-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                                >
                                  <span className="font-mono font-bold">{s.suggestedVrm}</span>
                                  <span className="text-gray-500 dark:text-gray-400 ml-2">
                                    ({s.reason})
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="font-mono font-bold text-gray-900 dark:text-white">
                          {review.normalizedVrm}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">
                      {review.siteId}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700 dark:text-gray-300">
                      {new Date(review.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      {review.confidence ? (
                        <span
                          className={`px-2 py-1 rounded ${
                            review.confidence >= 0.8
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : review.confidence >= 0.6
                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                          }`}
                        >
                          {(review.confidence * 100).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${getStatusBadgeColor(review.validationStatus)}`}>
                        {formatReason(review.validationStatus)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm">
                      <div className="space-y-1">
                        {review.suspicionReasons.map((reason, idx) => (
                          <div
                            key={idx}
                            className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded"
                          >
                            {formatReason(reason)}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        {review.images?.slice(0, 2).map((img, idx) => (
                          <img
                            key={idx}
                            src={img.url}
                            alt={img.type}
                            className="w-16 h-16 object-cover rounded border border-gray-300 dark:border-gray-600"
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {editingReview === review.id ? (
                        <div className="flex flex-col gap-2">
                          <input
                            type="text"
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                            placeholder="Notes (optional)"
                            className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleCorrect(review.id)}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingReview(null);
                                setCorrectedVrm('');
                                setReviewNotes('');
                                setSuggestions([]);
                                setShowSuggestions(false);
                              }}
                              className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => handleApprove(review.id)}
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm flex items-center gap-1 justify-center"
                          >
                            <CheckCircle size={14} />
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              setEditingReview(review.id);
                              setCorrectedVrm('');
                              loadSuggestions(review.id, review.normalizedVrm);
                            }}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm flex items-center gap-1 justify-center"
                          >
                            <Edit3 size={14} />
                            Correct
                          </button>
                          <button
                            onClick={() => handleDiscard(review.id)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm flex items-center gap-1 justify-center"
                          >
                            <XCircle size={14} />
                            Discard
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > limit && (
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="text-sm text-gray-700 dark:text-gray-300">
              Showing {offset + 1} to {Math.min(offset + limit, total)} of {total} results
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlateReviewQueue;
