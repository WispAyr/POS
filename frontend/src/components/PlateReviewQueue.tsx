import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  ChevronLeft,
  ChevronRight,
  Keyboard,
  ZoomIn,
} from 'lucide-react';
import { ThumbnailWithLoader } from './ImageWithLoader';
import { ImageZoomModal } from './ImageZoomModal';

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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [correctedVrm, setCorrectedVrm] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [suggestions, setSuggestions] = useState<CorrectionSuggestion[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Image zoom modal state
  const [zoomModalOpen, setZoomModalOpen] = useState(false);
  const [zoomImageIndex, setZoomImageIndex] = useState(0);

  // Filters
  const [siteFilter, setSiteFilter] = useState('');
  const [validationStatusFilter, setValidationStatusFilter] = useState('');
  const [reviewStatusFilter, setReviewStatusFilter] = useState('PENDING');
  const [showFilters, setShowFilters] = useState(false);

  const [total, setTotal] = useState(0);
  const [limit] = useState(50);
  const [offset, _setOffset] = useState(0);

  const correctionInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const currentReview = reviews[currentIndex] || null;

  // Load reviews with abort controller
  const loadReviews = useCallback(async () => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    try {
      const params: any = {
        limit,
        offset,
      };

      if (siteFilter) params.siteId = siteFilter;
      if (validationStatusFilter) params.validationStatus = validationStatusFilter;
      if (reviewStatusFilter) params.reviewStatus = reviewStatusFilter;

      const response = await axios.get('/plate-review/queue', {
        params,
        signal: abortControllerRef.current.signal,
      });
      setReviews(response.data.items);
      setTotal(response.data.total);
      setCurrentIndex(0);
    } catch (error) {
      if (!axios.isCancel(error)) {
        console.error('Failed to load reviews:', error);
      }
    } finally {
      setLoading(false);
    }
  }, [siteFilter, validationStatusFilter, reviewStatusFilter, offset, limit]);

  const loadStatistics = useCallback(async () => {
    try {
      const response = await axios.get('/plate-review/stats/summary', {
        params: siteFilter ? { siteId: siteFilter } : {},
      });
      setStatistics(response.data);
    } catch (error) {
      console.error('Failed to load statistics:', error);
    }
  }, [siteFilter]);

  const loadSuggestions = useCallback(async (reviewId: string) => {
    try {
      const response = await axios.get(`/plate-review/${reviewId}/suggestions`);
      setSuggestions(response.data);
    } catch (error) {
      console.error('Failed to load suggestions:', error);
      setSuggestions([]);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadReviews();
    loadStatistics();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadReviews, loadStatistics]);

  // Load suggestions when entering edit mode or changing review
  useEffect(() => {
    if (currentReview && isEditing) {
      loadSuggestions(currentReview.id);
    }
  }, [currentReview?.id, isEditing, loadSuggestions]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't handle shortcuts if we're typing in an input
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        if (e.key === 'Escape') {
          setIsEditing(false);
          setCorrectedVrm('');
          (document.activeElement as HTMLElement).blur();
        }
        if (e.key === 'Enter' && isEditing && correctedVrm.trim()) {
          handleCorrect();
        }
        return;
      }

      if (zoomModalOpen) return;

      switch (e.key.toLowerCase()) {
        case 'a':
          if (!isEditing && currentReview) {
            e.preventDefault();
            handleApprove();
          }
          break;
        case 'd':
          if (!isEditing && currentReview) {
            e.preventDefault();
            handleDiscard();
          }
          break;
        case 'c':
          if (!isEditing && currentReview) {
            e.preventDefault();
            setIsEditing(true);
            setTimeout(() => correctionInputRef.current?.focus(), 50);
          }
          break;
        case 'arrowleft':
          if (currentIndex > 0) {
            e.preventDefault();
            setCurrentIndex((i) => i - 1);
            setIsEditing(false);
            setCorrectedVrm('');
          }
          break;
        case 'arrowright':
          if (currentIndex < reviews.length - 1) {
            e.preventDefault();
            setCurrentIndex((i) => i + 1);
            setIsEditing(false);
            setCorrectedVrm('');
          }
          break;
        case 'escape':
          setIsEditing(false);
          setCorrectedVrm('');
          break;
        case '?':
          setShowShortcuts((s) => !s);
          break;
      }
    },
    [currentIndex, currentReview, isEditing, correctedVrm, reviews.length, zoomModalOpen],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleApprove = async () => {
    if (!currentReview) return;

    try {
      await axios.post(`/plate-review/${currentReview.id}/approve`, {
        userId: 'operator',
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

  const handleCorrect = async () => {
    if (!currentReview || !correctedVrm.trim()) {
      alert('Please enter a corrected VRM');
      return;
    }

    try {
      await axios.post(`/plate-review/${currentReview.id}/correct`, {
        userId: 'operator',
        correctedVrm: correctedVrm.trim(),
        notes: reviewNotes,
      });
      await loadReviews();
      await loadStatistics();
      setIsEditing(false);
      setCorrectedVrm('');
      setReviewNotes('');
      setSuggestions([]);
    } catch (error) {
      console.error('Failed to correct review:', error);
      alert('Failed to correct review');
    }
  };

  const handleDiscard = async () => {
    if (!currentReview) return;

    const reason = prompt('Please provide a reason for discarding this plate:');
    if (!reason) return;

    try {
      await axios.post(`/plate-review/${currentReview.id}/discard`, {
        userId: 'operator',
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
        userId: 'operator',
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
        userId: 'operator',
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

  // Get all images for the current review
  const getAllImages = () => {
    if (!currentReview?.images) return [];
    return currentReview.images.map((img, idx) => ({
      url: img.url,
      type: img.type,
      label: img.type === 'plate' ? `Plate ${idx + 1}` : img.type === 'overview' ? 'Overview' : img.type,
    }));
  };

  const openZoomModal = (index: number) => {
    setZoomImageIndex(index);
    setZoomModalOpen(true);
  };

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Plate Review Queue
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Review and correct suspicious or invalid license plates
            </p>
          </div>
          <button
            onClick={() => setShowShortcuts((s) => !s)}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            <Keyboard size={16} />
            Shortcuts
          </button>
        </div>
      </div>

      {/* Statistics */}
      {statistics && (
        <div className="grid grid-cols-5 gap-3 mb-4">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-yellow-600 dark:text-yellow-400">Pending</p>
                <p className="text-xl font-bold text-yellow-700 dark:text-yellow-300">
                  {statistics.totalPending}
                </p>
              </div>
              <Clock className="text-yellow-600 dark:text-yellow-400" size={20} />
            </div>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-green-600 dark:text-green-400">Approved</p>
                <p className="text-xl font-bold text-green-700 dark:text-green-300">
                  {statistics.totalApproved}
                </p>
              </div>
              <CheckCircle className="text-green-600 dark:text-green-400" size={20} />
            </div>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-600 dark:text-blue-400">Corrected</p>
                <p className="text-xl font-bold text-blue-700 dark:text-blue-300">
                  {statistics.totalCorrected}
                </p>
              </div>
              <Edit3 className="text-blue-600 dark:text-blue-400" size={20} />
            </div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-red-600 dark:text-red-400">Discarded</p>
                <p className="text-xl font-bold text-red-700 dark:text-red-300">
                  {statistics.totalDiscarded}
                </p>
              </div>
              <XCircle className="text-red-600 dark:text-red-400" size={20} />
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Total</p>
                <p className="text-xl font-bold text-gray-700 dark:text-gray-300">
                  {statistics.total}
                </p>
              </div>
              <AlertCircle className="text-gray-600 dark:text-gray-400" size={20} />
            </div>
          </div>
        </div>
      )}

      {/* Filters & Bulk Actions Bar */}
      <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                showFilters
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <Filter size={16} />
              Filters
            </button>

            {showFilters && (
              <>
                <select
                  value={reviewStatusFilter}
                  onChange={(e) => setReviewStatusFilter(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">All Status</option>
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="CORRECTED">Corrected</option>
                  <option value="DISCARDED">Discarded</option>
                </select>

                <select
                  value={validationStatusFilter}
                  onChange={(e) => setValidationStatusFilter(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">All Validation</option>
                  <option value="UK_SUSPICIOUS">UK Suspicious</option>
                  <option value="INTERNATIONAL_SUSPICIOUS">International Suspicious</option>
                  <option value="INVALID">Invalid</option>
                </select>

                <input
                  type="text"
                  placeholder="Site ID"
                  value={siteFilter}
                  onChange={(e) => setSiteFilter(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-32"
                />
              </>
            )}

            <button
              onClick={() => {
                loadReviews();
                loadStatistics();
              }}
              className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          {selectedReviews.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {selectedReviews.size} selected
              </span>
              <button
                onClick={handleBulkApprove}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm flex items-center gap-1"
              >
                <CheckCircle size={14} />
                Bulk Approve
              </button>
              <button
                onClick={handleBulkDiscard}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm flex items-center gap-1"
              >
                <XCircle size={14} />
                Bulk Discard
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Review Area */}
      <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
            <div className="w-8 h-8 border-4 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 p-8">
            <CheckCircle size={48} className="mb-4 text-green-500" />
            <p className="text-lg font-medium">No reviews found</p>
            <p className="text-sm">All plates have been reviewed or no matches for filters</p>
          </div>
        ) : currentReview ? (
          <div className="flex-1 flex">
            {/* Left: Large Image */}
            <div className="flex-1 p-4 flex flex-col bg-gray-900">
              {/* Main Image */}
              <div
                className="flex-1 relative rounded-lg overflow-hidden cursor-pointer group"
                onClick={() => openZoomModal(0)}
              >
                {currentReview.images?.[0] ? (
                  <>
                    <ThumbnailWithLoader
                      src={currentReview.images[0].url}
                      alt="Primary plate image"
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <ZoomIn className="text-white opacity-0 group-hover:opacity-100 transition-opacity" size={32} />
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-800 text-gray-500">
                    No image available
                  </div>
                )}
              </div>

              {/* Thumbnail Strip */}
              {currentReview.images && currentReview.images.length > 1 && (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {currentReview.images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => openZoomModal(idx)}
                      className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 border-transparent hover:border-blue-500 transition-colors"
                    >
                      <ThumbnailWithLoader
                        src={img.url}
                        alt={img.type}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Details Panel */}
            <div className="w-96 border-l border-gray-200 dark:border-gray-700 p-4 flex flex-col">
              {/* VRM Display */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <input
                    type="checkbox"
                    checked={selectedReviews.has(currentReview.id)}
                    onChange={() => toggleSelection(currentReview.id)}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400">Select for bulk action</span>
                </div>
                <div className="text-3xl font-mono font-bold text-gray-900 dark:text-white tracking-wider">
                  {currentReview.normalizedVrm || 'UNKNOWN'}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Original: {currentReview.originalVrm}
                </div>
              </div>

              {/* Details */}
              <div className="space-y-3 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Site</span>
                  <span className="text-gray-900 dark:text-white font-medium">{currentReview.siteId}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Time</span>
                  <span className="text-gray-900 dark:text-white">
                    {new Date(currentReview.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Confidence</span>
                  <span
                    className={`font-medium ${
                      currentReview.confidence >= 0.8
                        ? 'text-green-600 dark:text-green-400'
                        : currentReview.confidence >= 0.6
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {currentReview.confidence ? `${(currentReview.confidence * 100).toFixed(0)}%` : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between text-sm items-start">
                  <span className="text-gray-500 dark:text-gray-400">Status</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusBadgeColor(currentReview.validationStatus)}`}>
                    {formatReason(currentReview.validationStatus)}
                  </span>
                </div>
              </div>

              {/* Suspicion Reasons */}
              {currentReview.suspicionReasons?.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Suspicion Reasons</div>
                  <div className="space-y-1">
                    {currentReview.suspicionReasons.map((reason, idx) => (
                      <div
                        key={idx}
                        className="text-xs bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-2 py-1 rounded"
                      >
                        {formatReason(reason)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Correction Input */}
              <div className="mb-4">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                  {isEditing ? 'Corrected VRM' : 'Press C to correct'}
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      ref={correctionInputRef}
                      type="text"
                      value={correctedVrm}
                      onChange={(e) => setCorrectedVrm(e.target.value.toUpperCase())}
                      placeholder={currentReview.normalizedVrm}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-lg tracking-wider"
                      autoFocus
                    />
                    {suggestions.length > 0 && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg">
                        <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 mb-1">
                          <Lightbulb size={12} />
                          <span>Suggestions:</span>
                        </div>
                        <div className="space-y-1">
                          {suggestions.map((s, idx) => (
                            <button
                              key={idx}
                              onClick={() => setCorrectedVrm(s.suggestedVrm)}
                              className="block w-full text-left px-2 py-1 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded text-sm"
                            >
                              <span className="font-mono font-bold">{s.suggestedVrm}</span>
                              <span className="text-gray-500 dark:text-gray-400 ml-2 text-xs">
                                ({s.reason})
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setIsEditing(true);
                      setTimeout(() => correctionInputRef.current?.focus(), 50);
                    }}
                    className="w-full px-3 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 hover:border-blue-500 hover:text-blue-500 transition-colors text-sm"
                  >
                    Click or press C to enter correction
                  </button>
                )}
              </div>

              {/* Notes */}
              <div className="mb-4">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Notes (optional)</div>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Add notes..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm resize-none"
                  rows={2}
                />
              </div>

              {/* Action Buttons */}
              <div className="mt-auto space-y-2">
                {isEditing ? (
                  <div className="flex gap-2">
                    <button
                      onClick={handleCorrect}
                      disabled={!correctedVrm.trim()}
                      className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium flex items-center justify-center gap-2"
                    >
                      <Edit3 size={18} />
                      Save Correction
                      <span className="text-xs opacity-70">(Enter)</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsEditing(false);
                        setCorrectedVrm('');
                      }}
                      className="px-4 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={handleApprove}
                      className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium flex items-center justify-center gap-2"
                    >
                      <CheckCircle size={18} />
                      Approve
                      <span className="text-xs opacity-70">(A)</span>
                    </button>
                    <button
                      onClick={handleDiscard}
                      className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium flex items-center justify-center gap-2"
                    >
                      <XCircle size={18} />
                      Discard
                      <span className="text-xs opacity-70">(D)</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* Navigation Footer */}
        {reviews.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-900">
            <button
              onClick={() => {
                setCurrentIndex((i) => i - 1);
                setIsEditing(false);
                setCorrectedVrm('');
              }}
              disabled={currentIndex === 0}
              className="flex items-center gap-1 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <ChevronLeft size={18} />
              Previous
            </button>

            <div className="text-sm text-gray-600 dark:text-gray-400">
              Review <span className="font-bold text-gray-900 dark:text-white">{currentIndex + 1}</span> of{' '}
              <span className="font-bold text-gray-900 dark:text-white">{reviews.length}</span>
              {total > reviews.length && (
                <span className="text-gray-400 dark:text-gray-500"> ({total} total)</span>
              )}
            </div>

            <button
              onClick={() => {
                setCurrentIndex((i) => i + 1);
                setIsEditing(false);
                setCorrectedVrm('');
              }}
              disabled={currentIndex === reviews.length - 1}
              className="flex items-center gap-1 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Next
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Keyboard Shortcuts</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Approve plate</span>
                <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-900 dark:text-white font-mono">A</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Discard plate</span>
                <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-900 dark:text-white font-mono">D</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Start correction</span>
                <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-900 dark:text-white font-mono">C</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Save correction</span>
                <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-900 dark:text-white font-mono">Enter</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Cancel / Exit</span>
                <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-900 dark:text-white font-mono">Esc</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Previous review</span>
                <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-900 dark:text-white font-mono">&larr;</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Next review</span>
                <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-900 dark:text-white font-mono">&rarr;</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Toggle shortcuts</span>
                <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-900 dark:text-white font-mono">?</kbd>
              </div>
            </div>
            <button
              onClick={() => setShowShortcuts(false)}
              className="w-full mt-4 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Image Zoom Modal */}
      <ImageZoomModal
        images={getAllImages()}
        initialIndex={zoomImageIndex}
        isOpen={zoomModalOpen}
        onClose={() => setZoomModalOpen(false)}
      />
    </div>
  );
};

export default PlateReviewQueue;
