import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Check,
  X,
  AlertTriangle,
  Clock,
  MapPin,
  Car,
  SkipForward,
  FileText,
  History,
  Tag,
  ChevronLeft,
  ChevronRight,
  Filter,
  Calendar,
  Building2,
} from 'lucide-react';

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

  // Notes
  const [decisionNote, setDecisionNote] = useState('');
  const [newVehicleNote, setNewVehicleNote] = useState('');
  const [newMarkerType, setNewMarkerType] = useState('');
  const [newMarkerDesc, setNewMarkerDesc] = useState('');

  // Fetch sites
  const fetchSites = async () => {
    try {
      const { data } = await axios.get('/api/sites');
      setSites(data.map((site: any) => ({ id: site.id, name: site.name })));
    } catch (error) {
      console.error('Failed to fetch sites', error);
    }
  };

  // Fetch queue
  const fetchQueue = async () => {
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
      );
      setQueue(data);
      if (data.length > 0 && !currentDecision) {
        setCurrentDecision(data[0]);
      } else if (data.length === 0) {
        setCurrentDecision(null);
      }
    } catch (error) {
      console.error('Failed to fetch review queue', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch vehicle data
  const fetchVehicleData = async (vrm: string) => {
    try {
      const [historyRes, notesRes, markersRes] = await Promise.all([
        axios
          .get(`/enforcement/vehicle/${vrm}/history`)
          .catch(() => ({ data: null })),
        axios
          .get(`/enforcement/vehicle/${vrm}/notes`)
          .catch(() => ({ data: [] })),
        axios
          .get(`/enforcement/vehicle/${vrm}/markers`)
          .catch(() => ({ data: [] })),
      ]);
      setVehicleHistory(historyRes.data);
      setVehicleNotes(notesRes.data);
      setVehicleMarkers(markersRes.data);
    } catch (error) {
      console.error('Failed to fetch vehicle data', error);
    }
  };

  useEffect(() => {
    fetchSites();
    fetchQueue();
  }, []);

  useEffect(() => {
    const active = selectedSites.size > 0 || dateFrom !== '' || dateTo !== '';
    setHasActiveFilters(active);
  }, [selectedSites, dateFrom, dateTo]);

  useEffect(() => {
    if (currentDecision) {
      fetchVehicleData(currentDecision.vrm);
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

  const handleAddVehicleNote = async () => {
    if (!currentDecision || !newVehicleNote.trim()) return;
    try {
      await axios.post(`/enforcement/vehicle/${currentDecision.vrm}/notes`, {
        note: newVehicleNote,
        createdBy: 'operator-1',
      });
      setNewVehicleNote('');
      fetchVehicleData(currentDecision.vrm);
    } catch (error) {
      console.error('Failed to add note', error);
    }
  };

  const handleAddMarker = async () => {
    if (!currentDecision || !newMarkerType.trim()) return;
    try {
      await axios.post(`/enforcement/vehicle/${currentDecision.vrm}/markers`, {
        markerType: newMarkerType,
        description: newMarkerDesc,
      });
      setNewMarkerType('');
      setNewMarkerDesc('');
      fetchVehicleData(currentDecision.vrm);
    } catch (error) {
      console.error('Failed to add marker', error);
    }
  };

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
          </div>
        </div>

        {/* Images Grid */}
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-800 overflow-hidden mb-4">
          <div className="grid grid-cols-4 gap-1 bg-gray-900 p-1">
            <div className="relative group overflow-hidden aspect-video">
              {entryOverviewImage ? (
                <img
                  src={entryOverviewImage}
                  alt="Entry Overview"
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => window.open(entryOverviewImage, '_blank')}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500">
                  No Image
                </div>
              )}
              <div className="absolute bottom-1 left-1 bg-green-600/90 text-white text-xs px-2 py-0.5 rounded font-semibold">
                Entry Overview
              </div>
            </div>
            <div className="relative group overflow-hidden aspect-video">
              {entryPlateImage ? (
                <img
                  src={entryPlateImage}
                  alt="Entry Plate"
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => window.open(entryPlateImage, '_blank')}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 bg-gray-800">
                  <Car className="w-8 h-8 text-gray-600" />
                </div>
              )}
              <div className="absolute bottom-1 left-1 bg-green-600/90 text-white text-xs px-2 py-0.5 rounded font-semibold">
                Entry Plate
              </div>
            </div>
            <div className="relative group overflow-hidden aspect-video">
              {exitOverviewImage ? (
                <img
                  src={exitOverviewImage}
                  alt="Exit Overview"
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => window.open(exitOverviewImage, '_blank')}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500">
                  No Image
                </div>
              )}
              <div className="absolute bottom-1 left-1 bg-red-600/90 text-white text-xs px-2 py-0.5 rounded font-semibold">
                Exit Overview
              </div>
            </div>
            <div className="relative group overflow-hidden aspect-video">
              {exitPlateImage ? (
                <img
                  src={exitPlateImage}
                  alt="Exit Plate"
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => window.open(exitPlateImage, '_blank')}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 bg-gray-800">
                  <Car className="w-8 h-8 text-gray-600" />
                </div>
              )}
              <div className="absolute bottom-1 left-1 bg-red-600/90 text-white text-xs px-2 py-0.5 rounded font-semibold">
                Exit Plate
              </div>
            </div>
          </div>
        </div>

        {/* Details Panel (Collapsible) */}
        {showDetails && (
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-gray-200 dark:border-slate-800 p-4 mb-4 overflow-y-auto flex-1">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-50 dark:bg-slate-800 p-3 rounded-lg">
                <span className="block text-xs text-gray-500 dark:text-gray-500 mb-1">
                  Entry Time
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {currentDecision.entryTime
                    ? new Date(currentDecision.entryTime).toLocaleString()
                    : 'N/A'}
                </span>
              </div>
              <div className="bg-gray-50 dark:bg-slate-800 p-3 rounded-lg">
                <span className="block text-xs text-gray-500 dark:text-gray-500 mb-1">
                  Exit Time
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {currentDecision.exitTime
                    ? new Date(currentDecision.exitTime).toLocaleString()
                    : 'N/A'}
                </span>
              </div>
              <div className="bg-gray-50 dark:bg-slate-800 p-3 rounded-lg">
                <span className="block text-xs text-gray-500 dark:text-gray-500 mb-1">
                  AI Confidence
                </span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">
                  {(currentDecision.confidenceScore * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Tabbed Content */}
            <div className="grid grid-cols-3 gap-4">
              {/* History */}
              <div className="bg-gray-50 dark:bg-slate-800 p-4 rounded-lg">
                <h5 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2 text-sm">
                  <History className="w-4 h-4" />
                  History
                </h5>
                {vehicleHistory && (
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        Total:
                      </span>
                      <span className="font-bold text-gray-900 dark:text-white">
                        {vehicleHistory.totalEnforcements}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        Approved:
                      </span>
                      <span className="font-bold text-green-600 dark:text-green-400">
                        {vehicleHistory.totalApproved}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        Rejected:
                      </span>
                      <span className="font-bold text-red-600 dark:text-red-400">
                        {vehicleHistory.totalRejected}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Markers */}
              <div className="bg-gray-50 dark:bg-slate-800 p-4 rounded-lg">
                <h5 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2 text-sm">
                  <Tag className="w-4 h-4" />
                  Markers ({vehicleMarkers.length})
                </h5>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {vehicleMarkers.map((marker) => (
                    <div
                      key={marker.id}
                      className="text-xs bg-yellow-100 dark:bg-yellow-900/20 p-2 rounded"
                    >
                      <div className="font-bold text-yellow-900 dark:text-yellow-400">
                        {marker.markerType}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="bg-gray-50 dark:bg-slate-800 p-4 rounded-lg">
                <h5 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4" />
                  Notes ({vehicleNotes.length})
                </h5>
                <div className="space-y-1 max-h-24 overflow-y-auto text-xs text-gray-700 dark:text-gray-300">
                  {vehicleNotes.map((note) => (
                    <div
                      key={note.id}
                      className="bg-white dark:bg-slate-900 p-2 rounded"
                    >
                      {note.note}
                    </div>
                  ))}
                </div>
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
