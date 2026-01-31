import { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  Check,
  X,
  Clock,
  MapPin,
  SkipForward,
  FileText,
  History,
  Tag,
  ChevronLeft,
  ChevronRight,
  Filter,
  Calendar,
  Building2,
  ActivitySquare,
  AlertTriangle,
  CreditCard,
  ShieldCheck,
  ShieldX,
  Banknote,
} from 'lucide-react';
import { ImageWithLoader } from './ImageWithLoader';
import { AiReviewButton } from './AiReviewButton';

interface PaymentInfo {
  startTime: string;
  expiryTime: string;
  amount: number;
  source: string;
}

interface RecentActivity {
  type: 'session' | 'payment' | 'decision' | 'permit';
  timestamp: string;
  details: string;
}

interface Decision {
  id: string;
  vrm: string;
  siteId: string;
  reason: string;
  confidenceScore: number;
  timestamp: string;
  durationMinutes?: number;
  entryTime?: string;
  exitTime?: string;
  metadata?: {
    entryImages?: { url: string; type: string }[];
    exitImages?: { url: string; type: string }[];
  };
  verifications?: {
    permitChecked: boolean;
    permitFound: boolean;
    permitDetails?: string;
    paymentChecked: boolean;
    paymentFound: boolean;
    paymentsCount: number;
    paymentDetails?: string;
    siteEnforcementEnabled: boolean;
  };
  auditSummary?: {
    previousSessionsAtSite: number;
    previousDecisionsAtSite: {
      total: number;
      approved: number;
      declined: number;
      autoResolved: number;
    };
    paymentsAtSite: PaymentInfo[];
    recentActivity: RecentActivity[];
  };
}

interface VehicleHistory {
  totalEnforcements: number;
  totalApproved: number;
  totalRejected: number;
  recentEnforcements: {
    id: string;
    siteId: string;
    reason: string;
    status: string;
    timestamp: string;
  }[];
}

interface VehicleNote {
  id: string;
  vrm: string;
  note: string;
  createdBy: string;
  createdAt: string;
}

interface VehicleMarker {
  id: string;
  vrm: string;
  markerType: string;
  description: string;
  createdAt: string;
}

interface AuditLog {
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

export function EnforcementReview() {
  const [queue, setQueue] = useState<Decision[]>([]);
  const [currentDecision, setCurrentDecision] = useState<Decision | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [selectedSites, setSelectedSites] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [hasActiveFilters, setHasActiveFilters] = useState(false);

  // Vehicle data
  const [vehicleHistory, setVehicleHistory] = useState<VehicleHistory | null>(
    null,
  );
  const [vehicleNotes, setVehicleNotes] = useState<VehicleNote[]>([]);
  const [vehicleMarkers, setVehicleMarkers] = useState<VehicleMarker[]>([]);
  const [vehicleAudits, setVehicleAudits] = useState<AuditLog[]>([]);
  const [auditsLoading, setAuditsLoading] = useState(false);

  // Notes
  const [decisionNote, setDecisionNote] = useState('');
  // TODO: Uncomment when vehicle note/marker UI is implemented
  // const [newVehicleNote, setNewVehicleNote] = useState('');
  // const [newMarkerType, setNewMarkerType] = useState('');
  // const [newMarkerDesc, setNewMarkerDesc] = useState('');

  // AbortController refs for request cancellation
  const queueAbortRef = useRef<AbortController | null>(null);
  const vehicleAbortRef = useRef<AbortController | null>(null);
  const auditAbortRef = useRef<AbortController | null>(null);

  // Fetch sites
  const fetchSites = async () => {
    try {
      const { data } = await axios.get('/api/sites');
      setSites(data.map((site: any) => ({ id: site.id, name: site.name })));
    } catch (error) {
      console.error('Failed to fetch sites', error);
    }
  };

  // Fetch queue with AbortController
  const fetchQueue = useCallback(async () => {
    // Cancel any pending request
    if (queueAbortRef.current) {
      queueAbortRef.current.abort();
    }
    queueAbortRef.current = new AbortController();

    try {
      const params = new URLSearchParams({ status: 'NEW' });

      // Add site filters
      if (selectedSites.size > 0) {
        params.append('siteIds', Array.from(selectedSites).join(','));
      }

      // Add date filters
      if (dateFrom) {
        params.append('dateFrom', dateFrom);
      }
      if (dateTo) {
        params.append('dateTo', dateTo);
      }

      const { data } = await axios.get(
        `/enforcement/queue?${params.toString()}`,
        { signal: queueAbortRef.current.signal },
      );
      // Handle paginated response
      const items = data.items || data;
      setQueue(items);
      if (items.length > 0 && !currentDecision) {
        setCurrentDecision(items[0]);
      } else if (items.length === 0) {
        setCurrentDecision(null);
      }
    } catch (error) {
      if (!axios.isCancel(error)) {
        console.error('Failed to fetch review queue', error);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedSites, dateFrom, dateTo, currentDecision]);

  // Fetch vehicle data using combined endpoint with AbortController
  const fetchVehicleData = useCallback(async (vrm: string) => {
    // Cancel any pending request
    if (vehicleAbortRef.current) {
      vehicleAbortRef.current.abort();
    }
    vehicleAbortRef.current = new AbortController();

    try {
      // Use combined endpoint for single API call instead of 3 parallel calls
      const { data } = await axios.get(`/enforcement/vehicle/${vrm}/details`, {
        signal: vehicleAbortRef.current.signal,
      });
      setVehicleHistory(data.history);
      setVehicleNotes(data.notes || []);
      setVehicleMarkers(data.markers || []);
    } catch (error) {
      if (!axios.isCancel(error)) {
        console.error('Failed to fetch vehicle data', error);
        // Fallback to individual calls if combined endpoint fails
        try {
          const [historyRes, notesRes, markersRes] = await Promise.all([
            axios.get(`/enforcement/vehicle/${vrm}/history`).catch(() => ({ data: null })),
            axios.get(`/enforcement/vehicle/${vrm}/notes`).catch(() => ({ data: [] })),
            axios.get(`/enforcement/vehicle/${vrm}/markers`).catch(() => ({ data: [] })),
          ]);
          setVehicleHistory(historyRes.data);
          setVehicleNotes(notesRes.data);
          setVehicleMarkers(markersRes.data);
        } catch (fallbackError) {
          console.error('Fallback vehicle data fetch failed', fallbackError);
        }
      }
    }
  }, []);

  // Fetch audit trail for vehicle within PCN timespan at the site
  const fetchVehicleAudits = useCallback(async (vrm: string, siteId: string, entryTime?: string, exitTime?: string) => {
    // Cancel any pending request
    if (auditAbortRef.current) {
      auditAbortRef.current.abort();
    }
    auditAbortRef.current = new AbortController();

    setAuditsLoading(true);
    try {
      // Build query params - expand window by 1 hour before entry and 1 hour after exit
      const params = new URLSearchParams({ vrm, siteId });
      
      if (entryTime) {
        const startDate = new Date(new Date(entryTime).getTime() - 60 * 60 * 1000);
        params.append('startDate', startDate.toISOString());
      }
      if (exitTime) {
        const endDate = new Date(new Date(exitTime).getTime() + 60 * 60 * 1000);
        params.append('endDate', endDate.toISOString());
      }
      params.append('limit', '50');

      const { data } = await axios.get(`/api/audit/search?${params.toString()}`, {
        signal: auditAbortRef.current.signal,
      });
      setVehicleAudits(data.events || data || []);
    } catch (error) {
      if (!axios.isCancel(error)) {
        console.error('Failed to fetch audit trail', error);
        setVehicleAudits([]);
      }
    } finally {
      setAuditsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSites();
    fetchQueue();

    // Cleanup abort controllers on unmount
    return () => {
      if (queueAbortRef.current) {
        queueAbortRef.current.abort();
      }
      if (vehicleAbortRef.current) {
        vehicleAbortRef.current.abort();
      }
      if (auditAbortRef.current) {
        auditAbortRef.current.abort();
      }
    };
  }, [fetchQueue]);

  // Keyboard shortcuts for faster review
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      switch (e.key) {
        case 'a':
        case 'A':
          // Approve - handled below via direct call
          break;
        case 'r':
        case 'R':
          // Reject - handled below via direct call
          break;
        case 's':
        case 'S':
          // Skip - direct implementation
          if (currentDecision && queue.length > 0) {
            const currentIndex = queue.findIndex((d) => d.id === currentDecision.id);
            const nextDecision = queue[currentIndex + 1] || queue[0];
            setCurrentDecision(nextDecision);
          }
          break;
        case 'ArrowLeft':
        case 'j':
          // Previous - direct implementation
          if (currentDecision && queue.length > 0) {
            const currentIndex = queue.findIndex((d) => d.id === currentDecision.id);
            if (currentIndex > 0) {
              setCurrentDecision(queue[currentIndex - 1]);
            }
          }
          break;
        case 'ArrowRight':
        case 'k':
          // Next - direct implementation
          if (currentDecision && queue.length > 0) {
            const currentIndex = queue.findIndex((d) => d.id === currentDecision.id);
            if (currentIndex < queue.length - 1) {
              setCurrentDecision(queue[currentIndex + 1]);
            }
          }
          break;
        case 'd':
        case 'D':
          // Toggle details
          setShowDetails((prev) => !prev);
          break;
        case '?':
          // Show shortcuts help
          alert('Keyboard Shortcuts:\nA = Approve\nR = Reject\nS = Skip\n← / J = Previous\n→ / K = Next\nD = Toggle Details');
          break;
      }
    };
    
    // Handle A/R separately since they call async handleReview
    const handleApproveReject = async (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (!currentDecision) return;
      
      if (e.key === 'a' || e.key === 'A') {
        try {
          await axios.post(`/enforcement/review/${currentDecision.id}`, {
            action: 'APPROVE',
            notes: 'Keyboard shortcut: APPROVE',
            operatorId: 'operator-1',
          });
          const nextQueue = queue.filter((d) => d.id !== currentDecision.id);
          setQueue(nextQueue);
          const currentIndex = queue.findIndex((d) => d.id === currentDecision.id);
          setCurrentDecision(nextQueue[currentIndex] || nextQueue[0] || null);
        } catch (error) {
          console.error('Failed to approve', error);
        }
      } else if (e.key === 'r' || e.key === 'R') {
        try {
          await axios.post(`/enforcement/review/${currentDecision.id}`, {
            action: 'REJECT',
            notes: 'Keyboard shortcut: REJECT',
            operatorId: 'operator-1',
          });
          const nextQueue = queue.filter((d) => d.id !== currentDecision.id);
          setQueue(nextQueue);
          const currentIndex = queue.findIndex((d) => d.id === currentDecision.id);
          setCurrentDecision(nextQueue[currentIndex] || nextQueue[0] || null);
        } catch (error) {
          console.error('Failed to reject', error);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keydown', handleApproveReject);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keydown', handleApproveReject);
    };
  }, [currentDecision, queue]);

  useEffect(() => {
    const active = selectedSites.size > 0 || dateFrom !== '' || dateTo !== '';
    setHasActiveFilters(active);
  }, [selectedSites, dateFrom, dateTo]);

  useEffect(() => {
    if (currentDecision) {
      // Skip fetching for UNKNOWN or empty VRMs
      if (currentDecision.vrm && currentDecision.vrm !== 'UNKNOWN') {
        fetchVehicleData(currentDecision.vrm);
        // Fetch audits for this vehicle at this site within the PCN timespan
        fetchVehicleAudits(
          currentDecision.vrm,
          currentDecision.siteId,
          currentDecision.entryTime,
          currentDecision.exitTime
        );
      } else {
        // Reset vehicle data for unknown VRMs
        setVehicleHistory(null);
        setVehicleNotes([]);
        setVehicleMarkers([]);
        setVehicleAudits([]);
      }
      setDecisionNote('');
      setShowDetails(false);
    }
  }, [currentDecision?.id]);

  const selectDecision = (decision: Decision) => {
    setCurrentDecision(decision);
  };

  const navigateQueue = (direction: 'prev' | 'next') => {
    if (!currentDecision) return;
    const currentIndex = queue.findIndex((d) => d.id === currentDecision.id);
    if (direction === 'prev' && currentIndex > 0) {
      setCurrentDecision(queue[currentIndex - 1]);
    } else if (direction === 'next' && currentIndex < queue.length - 1) {
      setCurrentDecision(queue[currentIndex + 1]);
    }
  };

  const handleReview = async (action: 'APPROVE' | 'REJECT') => {
    if (!currentDecision) return;

    try {
      await axios.post(`/enforcement/review/${currentDecision.id}`, {
        action,
        notes: decisionNote || `Manual review: ${action}`,
        operatorId: 'operator-1',
      });

      const nextQueue = queue.filter((d) => d.id !== currentDecision.id);
      setQueue(nextQueue);
      const currentIndex = queue.findIndex((d) => d.id === currentDecision.id);
      const nextDecision = nextQueue[currentIndex] || nextQueue[0] || null;
      setCurrentDecision(nextDecision);
    } catch (error) {
      console.error('Failed to submit review', error);
      alert('Failed to submit review');
    }
  };

  const handleSkip = () => {
    if (!currentDecision) return;
    const currentIndex = queue.findIndex((d) => d.id === currentDecision.id);
    const nextDecision = queue[currentIndex + 1] || queue[0];
    setCurrentDecision(nextDecision);
  };

  // TODO: Implement UI for adding vehicle notes
  // const handleAddVehicleNote = async () => { ... }

  // TODO: Implement UI for adding markers
  // const handleAddMarker = async () => { ... }

  const toggleSite = (siteId: string) => {
    const newSelection = new Set(selectedSites);
    if (newSelection.has(siteId)) {
      newSelection.delete(siteId);
    } else {
      newSelection.add(siteId);
    }
    setSelectedSites(newSelection);
  };

  const selectAllSites = () => {
    if (selectedSites.size === sites.length) {
      setSelectedSites(new Set());
    } else {
      setSelectedSites(new Set(sites.map((s) => s.id)));
    }
  };

  const applyFilters = () => {
    setLoading(true);
    setShowFilters(false);
    fetchQueue();
  };

  const clearFilters = () => {
    setSelectedSites(new Set());
    setDateFrom('');
    setDateTo('');
    setLoading(true);
    setTimeout(() => {
      fetchQueue();
    }, 100);
  };

  if (loading)
    return (
      <div className="p-8 text-center text-gray-500">Loading queue...</div>
    );

  if (!currentDecision) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 min-h-[400px]">
        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-full mb-4">
          <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
          All Caught Up!
        </h3>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          No pending violations to review.
        </p>
        <button
          onClick={fetchQueue}
          className="mt-6 px-4 py-2 text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
        >
          Refresh Queue
        </button>
      </div>
    );
  }

  const entryPlateImage = currentDecision.metadata?.entryImages?.find(
    (img) => img.type === 'plate',
  )?.url;
  const entryOverviewImage = currentDecision.metadata?.entryImages?.find(
    (img) => img.type === 'overview',
  )?.url;
  const exitPlateImage = currentDecision.metadata?.exitImages?.find(
    (img) => img.type === 'plate',
  )?.url;
  const exitOverviewImage = currentDecision.metadata?.exitImages?.find(
    (img) => img.type === 'overview',
  )?.url;

  const formatDuration = (minutes?: number) => {
    if (!minutes) return 'Unknown';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const currentIndex = queue.findIndex((d) => d.id === currentDecision.id);

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)]">
      {/* Collapsible Sidebar */}
      {showSidebar && (
        <div className="w-72 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-800 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">
                  Queue
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {queue.length} pending
                </p>
              </div>
              <button
                onClick={() => setShowSidebar(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded"
              >
                <ChevronLeft className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                hasActiveFilters || showFilters
                  ? 'bg-blue-600 dark:bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
              {hasActiveFilters && (
                <span className="bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {selectedSites.size + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0)}
                </span>
              )}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {queue.map((decision) => (
              <button
                key={decision.id}
                onClick={() => selectDecision(decision)}
                className={`w-full p-3 text-left border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors ${
                  currentDecision?.id === decision.id
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-600'
                    : ''
                }`}
              >
                <div className="font-bold text-sm text-gray-900 dark:text-white mb-1">
                  {decision.vrm}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                      decision.reason === 'NO_VALID_PAYMENT'
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        : decision.reason === 'OVERSTAY'
                          ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                          : decision.reason === 'UNAUTHORISED_PARKING'
                            ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400'
                            : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                    }`}
                  >
                    {decision.reason.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  {decision.siteId} • {formatDuration(decision.durationMinutes)}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Filters Panel */}
        {showFilters && (
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-800 p-4 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filters
              </h3>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-sm text-red-600 dark:text-red-400 hover:underline"
                >
                  Clear All
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              {/* Site Filter */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Sites
                </label>
                <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 max-h-48 overflow-y-auto">
                  <button
                    onClick={selectAllSites}
                    className="w-full text-left text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline mb-2"
                  >
                    {selectedSites.size === sites.length
                      ? 'Deselect All'
                      : 'Select All'}
                  </button>
                  <div className="space-y-2">
                    {sites.map((site) => (
                      <label
                        key={site.id}
                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 p-2 rounded transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedSites.has(site.id)}
                          onChange={() => toggleSite(site.id)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-900 dark:text-white">
                          {site.name} ({site.id})
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                {selectedSites.size > 0 && (
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                    {selectedSites.size} site
                    {selectedSites.size !== 1 ? 's' : ''} selected
                  </div>
                )}
              </div>

              {/* Date Range Filter */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Date Range
                </label>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                      From
                    </label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                      To
                    </label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {(dateFrom || dateTo) && (
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {dateFrom &&
                        `From: ${new Date(dateFrom).toLocaleDateString()}`}
                      {dateFrom && dateTo && ' • '}
                      {dateTo && `To: ${new Date(dateTo).toLocaleDateString()}`}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowFilters(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={applyFilters}
                className="px-4 py-2 rounded-lg bg-blue-600 dark:bg-blue-500 text-white font-medium hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
              >
                Apply Filters
              </button>
            </div>
          </div>
        )}

        {/* Top Bar with VRM and Actions */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-800 p-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {!showSidebar && (
              <button
                onClick={() => setShowSidebar(true)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
              >
                <ChevronRight className="w-5 h-5 text-gray-500" />
              </button>
            )}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {currentDecision.vrm}
                </h2>
                {vehicleMarkers.length > 0 && (
                  <span className="bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    {vehicleMarkers.length}
                  </span>
                )}
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {currentIndex + 1} / {queue.length}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {currentDecision.siteId}
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {formatDuration(currentDecision.durationMinutes)}
                </div>
                <div>{currentDecision.reason}</div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateQueue('prev')}
              disabled={currentIndex === 0}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigateQueue('next')}
              disabled={currentIndex === queue.length - 1}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                showDetails
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'
                  : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300'
              }`}
            >
              {showDetails ? 'Hide Details' : 'Show Details'}
            </button>
            <AiReviewButton 
              context="enforcement" 
              entityId={currentDecision.id} 
              vrm={currentDecision.vrm}
              siteId={currentDecision.siteId}
            />
          </div>
        </div>

        {/* Images Grid */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-800 overflow-hidden mb-4">
          <div className="grid grid-cols-4 gap-1 bg-gray-900 p-1">
            <div className="relative group overflow-hidden aspect-video">
              <ImageWithLoader
                src={entryOverviewImage}
                alt="Entry Overview"
                className="w-full h-full object-cover cursor-pointer"
                onClick={() =>
                  entryOverviewImage &&
                  window.open(entryOverviewImage, '_blank')
                }
                showPlaceholderIcon={!entryOverviewImage}
              />
              <div className="absolute bottom-1 left-1 bg-green-600/90 text-white text-xs px-2 py-0.5 rounded font-semibold z-10">
                Entry Overview
              </div>
            </div>
            <div className="relative group overflow-hidden aspect-video">
              <ImageWithLoader
                src={entryPlateImage}
                alt="Entry Plate"
                className="w-full h-full object-cover cursor-pointer"
                onClick={() =>
                  entryPlateImage && window.open(entryPlateImage, '_blank')
                }
                showPlaceholderIcon={!entryPlateImage}
              />
              <div className="absolute bottom-1 left-1 bg-green-600/90 text-white text-xs px-2 py-0.5 rounded font-semibold z-10">
                Entry Plate
              </div>
            </div>
            <div className="relative group overflow-hidden aspect-video">
              <ImageWithLoader
                src={exitOverviewImage}
                alt="Exit Overview"
                className="w-full h-full object-cover cursor-pointer"
                onClick={() =>
                  exitOverviewImage && window.open(exitOverviewImage, '_blank')
                }
                showPlaceholderIcon={!exitOverviewImage}
              />
              <div className="absolute bottom-1 left-1 bg-red-600/90 text-white text-xs px-2 py-0.5 rounded font-semibold z-10">
                Exit Overview
              </div>
            </div>
            <div className="relative group overflow-hidden aspect-video">
              <ImageWithLoader
                src={exitPlateImage}
                alt="Exit Plate"
                className="w-full h-full object-cover cursor-pointer"
                onClick={() =>
                  exitPlateImage && window.open(exitPlateImage, '_blank')
                }
                showPlaceholderIcon={!exitPlateImage}
              />
              <div className="absolute bottom-1 left-1 bg-red-600/90 text-white text-xs px-2 py-0.5 rounded font-semibold z-10">
                Exit Plate
              </div>
            </div>
          </div>
        </div>

        {/* Details Panel (Collapsible) */}
        {showDetails && (
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-800 p-4 mb-4 overflow-y-auto flex-1">
            
            {/* VIOLATION JUSTIFICATION - Primary Focus */}
            <div className={`p-4 rounded-lg mb-4 border-2 ${
              currentDecision.reason === 'OVERSTAY' 
                ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700'
                : currentDecision.reason === 'UNAUTHORISED_PARKING'
                  ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-300 dark:border-violet-700'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
            }`}>
              <h5 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <AlertTriangle className={`w-5 h-5 ${
                  currentDecision.reason === 'OVERSTAY' 
                    ? 'text-orange-600' 
                    : currentDecision.reason === 'UNAUTHORISED_PARKING'
                      ? 'text-violet-600'
                      : 'text-red-600'
                }`} />
                PCN Justification
              </h5>
              
              {/* Reason Summary */}
              <div className="bg-white dark:bg-slate-800 p-3 rounded-lg mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-sm font-bold px-3 py-1 rounded ${
                    currentDecision.reason === 'OVERSTAY' 
                      ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300'
                      : currentDecision.reason === 'UNAUTHORISED_PARKING'
                        ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-300'
                        : 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300'
                  }`}>
                    {currentDecision.reason.replace(/_/g, ' ')}
                  </span>
                </div>
                
                {currentDecision.reason === 'OVERSTAY' && currentDecision.auditSummary?.paymentsAtSite?.length ? (
                  <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                    <p className="font-medium">
                      Vehicle had a valid payment but exceeded the paid duration.
                    </p>
                    {(() => {
                      const payment = currentDecision.auditSummary.paymentsAtSite[0];
                      const paidMins = Math.round((new Date(payment.expiryTime).getTime() - new Date(payment.startTime).getTime()) / 60000);
                      const parkedMins = currentDecision.durationMinutes || 0;
                      const overstayMins = parkedMins > paidMins ? parkedMins - paidMins : 0;
                      return (
                        <>
                          <p>• Paid for: <strong>{Math.floor(paidMins / 60)}h {paidMins % 60}m</strong> (£{payment.amount.toFixed(2)} via {payment.source})</p>
                          <p>• Actually parked: <strong>{Math.floor(parkedMins / 60)}h {parkedMins % 60}m</strong></p>
                          <p>• Overstayed by: <strong className="text-orange-700 dark:text-orange-400">{Math.floor(overstayMins / 60)}h {overstayMins % 60}m</strong></p>
                        </>
                      );
                    })()}
                  </div>
                ) : currentDecision.reason === 'NO_VALID_PAYMENT' ? (
                  <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                    <p className="font-medium">
                      No valid payment or permit found covering the parking session.
                    </p>
                    <p>• Parked for: <strong>{formatDuration(currentDecision.durationMinutes)}</strong></p>
                    <p>• Payments found: <strong className="text-red-700 dark:text-red-400">{currentDecision.verifications?.paymentsCount || 0}</strong></p>
                    <p>• Permit status: <strong className="text-red-700 dark:text-red-400">{currentDecision.verifications?.permitFound ? 'Found (but not valid)' : 'None'}</strong></p>
                  </div>
                ) : currentDecision.reason === 'UNAUTHORISED_PARKING' ? (
                  <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                    <p className="font-medium">
                      Vehicle parked without valid permit or authorisation.
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      This is a permit-only site with no public payment option.
                    </p>
                    <p>• Parked for: <strong>{formatDuration(currentDecision.durationMinutes)}</strong></p>
                    <p>• Permit status: <strong className="text-red-700 dark:text-red-400">{currentDecision.verifications?.permitFound ? 'Found (but not valid)' : 'No valid permit'}</strong></p>
                  </div>
                ) : (
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    <p>{currentDecision.verifications?.paymentDetails || 'Unknown violation reason'}</p>
                  </div>
                )}
              </div>
              
              {/* Verification Checklist */}
              {currentDecision.verifications && (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className={`flex items-center gap-1 p-2 rounded ${
                    currentDecision.verifications.permitFound 
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}>
                    {currentDecision.verifications.permitFound ? <ShieldCheck className="w-4 h-4" /> : <ShieldX className="w-4 h-4" />}
                    <span>{currentDecision.verifications.permitFound ? 'Permit Found' : 'No Permit'}</span>
                  </div>
                  <div className={`flex items-center gap-1 p-2 rounded ${
                    currentDecision.verifications.paymentFound 
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}>
                    {currentDecision.verifications.paymentFound ? <Banknote className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    <span>{currentDecision.verifications.paymentsCount} Payment{currentDecision.verifications.paymentsCount !== 1 ? 's' : ''}</span>
                  </div>
                  <div className={`flex items-center gap-1 p-2 rounded ${
                    currentDecision.verifications.siteEnforcementEnabled 
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                      : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
                  }`}>
                    <Check className="w-4 h-4" />
                    <span>{currentDecision.verifications.siteEnforcementEnabled ? 'Enforcement Active' : 'Enforcement Off'}</span>
                  </div>
                </div>
              )}
            </div>
            
            {/* Session Timeline */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="bg-gray-50 dark:bg-slate-800 p-3 rounded-lg">
                <span className="block text-xs text-gray-500 dark:text-gray-500 mb-1">Entry Time</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {currentDecision.entryTime ? new Date(currentDecision.entryTime).toLocaleString() : 'N/A'}
                </span>
              </div>
              <div className="bg-gray-50 dark:bg-slate-800 p-3 rounded-lg">
                <span className="block text-xs text-gray-500 dark:text-gray-500 mb-1">Exit Time</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {currentDecision.exitTime ? new Date(currentDecision.exitTime).toLocaleString() : 'N/A'}
                </span>
              </div>
              <div className="bg-gray-50 dark:bg-slate-800 p-3 rounded-lg">
                <span className="block text-xs text-gray-500 dark:text-gray-500 mb-1">Total Duration</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">
                  {formatDuration(currentDecision.durationMinutes)}
                </span>
              </div>
              <div className="bg-gray-50 dark:bg-slate-800 p-3 rounded-lg">
                <span className="block text-xs text-gray-500 dark:text-gray-500 mb-1">AI Confidence</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">
                  {(currentDecision.confidenceScore * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            
            {/* Payment Details (if any) */}
            {currentDecision.auditSummary?.paymentsAtSite && currentDecision.auditSummary.paymentsAtSite.length > 0 && (
              <div className="bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 p-4 rounded-lg mb-4">
                <h5 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2 text-sm">
                  <CreditCard className="w-4 h-4 text-cyan-600" />
                  Payment History at Site ({currentDecision.auditSummary.paymentsAtSite.length})
                </h5>
                <div className="space-y-2">
                  {currentDecision.auditSummary.paymentsAtSite.map((payment, idx) => {
                    const startTime = new Date(payment.startTime);
                    const expiryTime = new Date(payment.expiryTime);
                    const durationMins = Math.round((expiryTime.getTime() - startTime.getTime()) / 60000);
                    const sessionStart = currentDecision.entryTime ? new Date(currentDecision.entryTime) : null;
                    const sessionEnd = currentDecision.exitTime ? new Date(currentDecision.exitTime) : null;
                    
                    // Check if payment overlaps with session
                    const coversEntry = sessionStart && startTime <= sessionStart && expiryTime >= sessionStart;
                    const coversExit = sessionEnd && startTime <= sessionEnd && expiryTime >= sessionEnd;
                    const expiredDuring = sessionEnd && expiryTime < sessionEnd && expiryTime > (sessionStart || new Date(0));
                    
                    return (
                      <div key={idx} className={`bg-white dark:bg-slate-800 p-3 rounded-lg border-l-4 ${
                        coversEntry && coversExit ? 'border-green-500' :
                        expiredDuring ? 'border-orange-500' :
                        'border-gray-300'
                      }`}>
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <span className="font-bold text-lg text-gray-900 dark:text-white">£{payment.amount.toFixed(2)}</span>
                            <span className="ml-2 text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
                              {payment.source}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className={`text-xs font-semibold px-2 py-1 rounded ${
                              coversEntry && coversExit 
                                ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300'
                                : expiredDuring
                                  ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300'
                                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                            }`}>
                              {coversEntry && coversExit ? '✓ Covers Session' : expiredDuring ? '⚠ Expired During Stay' : 'Did Not Cover'}
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 dark:text-gray-400">
                          <div>
                            <span className="block text-gray-400 dark:text-gray-500">Started</span>
                            <span className="font-medium text-gray-800 dark:text-gray-200">{startTime.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="block text-gray-400 dark:text-gray-500">Expired</span>
                            <span className={`font-medium ${expiredDuring ? 'text-orange-700 dark:text-orange-400' : 'text-gray-800 dark:text-gray-200'}`}>
                              {expiryTime.toLocaleString()}
                            </span>
                          </div>
                          <div>
                            <span className="block text-gray-400 dark:text-gray-500">Duration Paid</span>
                            <span className="font-medium text-gray-800 dark:text-gray-200">{Math.floor(durationMins / 60)}h {durationMins % 60}m</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Vehicle Info Grid */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              {/* History */}
              <div className="bg-gray-50 dark:bg-slate-800 p-4 rounded-lg">
                <h5 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2 text-sm">
                  <History className="w-4 h-4" />
                  Enforcement History
                </h5>
                {vehicleHistory ? (
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Total PCNs:</span>
                      <span className="font-bold text-gray-900 dark:text-white">{vehicleHistory.totalEnforcements}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Approved:</span>
                      <span className="font-bold text-green-600 dark:text-green-400">{vehicleHistory.totalApproved}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Rejected:</span>
                      <span className="font-bold text-red-600 dark:text-red-400">{vehicleHistory.totalRejected}</span>
                    </div>
                    {currentDecision.auditSummary?.previousSessionsAtSite !== undefined && (
                      <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-slate-700">
                        <span className="text-gray-600 dark:text-gray-400">Visits to this site:</span>
                        <span className="font-bold text-gray-900 dark:text-white">{currentDecision.auditSummary.previousSessionsAtSite}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 dark:text-gray-400">No history available</div>
                )}
              </div>

              {/* Markers */}
              <div className="bg-gray-50 dark:bg-slate-800 p-4 rounded-lg">
                <h5 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2 text-sm">
                  <Tag className="w-4 h-4" />
                  Markers ({vehicleMarkers.length})
                </h5>
                {vehicleMarkers.length > 0 ? (
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {vehicleMarkers.map((marker) => (
                      <div key={marker.id} className="text-xs bg-yellow-100 dark:bg-yellow-900/20 p-2 rounded">
                        <div className="font-bold text-yellow-900 dark:text-yellow-400">{marker.markerType}</div>
                        {marker.description && <div className="text-yellow-700 dark:text-yellow-500 mt-1">{marker.description}</div>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 dark:text-gray-400">No markers on this vehicle</div>
                )}
              </div>

              {/* Notes */}
              <div className="bg-gray-50 dark:bg-slate-800 p-4 rounded-lg">
                <h5 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4" />
                  Notes ({vehicleNotes.length})
                </h5>
                {vehicleNotes.length > 0 ? (
                  <div className="space-y-1 max-h-24 overflow-y-auto text-xs text-gray-700 dark:text-gray-300">
                    {vehicleNotes.map((note) => (
                      <div key={note.id} className="bg-white dark:bg-slate-900 p-2 rounded">
                        <div>{note.note}</div>
                        <div className="text-gray-400 dark:text-gray-500 mt-1 text-[10px]">
                          {note.createdBy} • {new Date(note.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 dark:text-gray-400">No notes on this vehicle</div>
                )}
              </div>
            </div>

            {/* Audit Trail */}
            <div className="bg-gray-50 dark:bg-slate-800 p-4 rounded-lg">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2 text-sm">
                <ActivitySquare className="w-4 h-4" />
                Activity Timeline
                {auditsLoading ? (
                  <span className="text-gray-500 dark:text-gray-400 text-xs font-normal">(loading...)</span>
                ) : (
                  <span className="text-gray-500 dark:text-gray-400 text-xs font-normal">
                    ({vehicleAudits.length} events)
                  </span>
                )}
              </h5>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {auditsLoading ? (
                  <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">Loading...</div>
                ) : vehicleAudits.length === 0 ? (
                  <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
                    No audit events found for this PCN period.
                  </div>
                ) : (
                  vehicleAudits.map((audit) => {
                    // Format action name nicely
                    const actionLabels: Record<string, { label: string; icon: string }> = {
                      'MOVEMENT_INGESTED': { label: 'Vehicle Detected', icon: '📷' },
                      'SESSION_CREATED': { label: 'Parking Started', icon: '🚗' },
                      'SESSION_COMPLETED': { label: 'Parking Ended', icon: '🏁' },
                      'DECISION_CREATED': { label: 'PCN Decision Made', icon: '⚖️' },
                      'PAYMENT_INGESTED': { label: 'Payment Received', icon: '💳' },
                      'PERMIT_INGESTED': { label: 'Permit Detected', icon: '📋' },
                      'ENFORCEMENT_REVIEWED': { label: 'Operator Review', icon: '👤' },
                      'RECONCILIATION_TRIGGERED': { label: 'Payment Matched', icon: '🔄' },
                    };
                    const actionInfo = actionLabels[audit.action] || { label: audit.action.replace(/_/g, ' '), icon: '📌' };
                    
                    return (
                      <div
                        key={audit.id}
                        className={`bg-white dark:bg-slate-900 p-3 rounded-lg border-l-4 ${
                          audit.action === 'PAYMENT_INGESTED' || audit.action === 'RECONCILIATION_TRIGGERED' 
                            ? 'border-cyan-500' 
                            : audit.action === 'DECISION_CREATED' 
                              ? 'border-purple-500'
                              : audit.action.includes('SESSION') 
                                ? 'border-green-500'
                                : 'border-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{actionInfo.icon}</span>
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">
                              {actionInfo.label}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(audit.timestamp).toLocaleString()}
                          </span>
                        </div>
                        {/* Show relevant details based on action type */}
                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {audit.action === 'PAYMENT_INGESTED' && audit.details && (
                            <span>
                              £{audit.details.amount?.toFixed(2) || '?'} via {audit.details.source || 'unknown'} 
                              {audit.details.expiryTime && ` • Valid until ${new Date(audit.details.expiryTime).toLocaleTimeString()}`}
                            </span>
                          )}
                          {audit.action === 'MOVEMENT_INGESTED' && audit.details && (
                            <span>
                              {audit.details.direction || 'Unknown direction'} 
                              {audit.details.camera && ` • ${audit.details.camera}`}
                            </span>
                          )}
                          {audit.action === 'DECISION_CREATED' && audit.details && (
                            <span className={audit.details.outcome === 'ENFORCEMENT_CANDIDATE' ? 'text-red-600 dark:text-red-400' : ''}>
                              {audit.details.reason || audit.details.outcome}
                            </span>
                          )}
                          {audit.action === 'RECONCILIATION_TRIGGERED' && (
                            <span>Payment matched to session</span>
                          )}
                          {!['PAYMENT_INGESTED', 'MOVEMENT_INGESTED', 'DECISION_CREATED', 'RECONCILIATION_TRIGGERED'].includes(audit.action) && (
                            <span className="text-gray-400">
                              {audit.actor && `by ${audit.actor}`}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* Decision Actions - Fixed Bottom */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-800 p-4">
          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Decision Notes (Optional)
            </label>
            <textarea
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              placeholder="Add notes about this decision..."
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={2}
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleSkip}
              className="px-4 py-3 rounded-lg border-2 border-gray-300 dark:border-slate-700 text-gray-700 dark:text-gray-300 font-bold hover:bg-gray-50 dark:hover:bg-slate-800 transition-all flex items-center gap-2"
            >
              <SkipForward className="w-5 h-5" />
              Skip
            </button>
            <button
              onClick={() => handleReview('REJECT')}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-gray-200 dark:bg-slate-800 text-gray-700 dark:text-gray-300 font-bold hover:bg-gray-300 dark:hover:bg-slate-700 transition-all"
            >
              <X className="w-6 h-6" />
              Reject
            </button>
            <button
              onClick={() => handleReview('APPROVE')}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-blue-600 dark:bg-blue-500 text-white font-bold hover:bg-blue-700 dark:hover:bg-blue-600 shadow-lg transition-all"
            >
              <Check className="w-6 h-6" />
              Approve Violation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
