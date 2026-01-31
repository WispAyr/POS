import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  Calendar,
  Filter,
  X,
  FileSearch,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Activity,
} from 'lucide-react';
import { ImageWithLoader } from './ImageWithLoader';

interface ParkingEvent {
  sessionId: string;
  vrm: string;
  siteId: string;
  entryTime: string;
  exitTime?: string;
  durationMinutes?: number;
  status:
    | 'PASSTHROUGH'
    | 'POTENTIAL_PCN'
    | 'APPROVED_PCN'
    | 'DECLINED_PCN'
    | 'EXPORTED_PCN'
    | 'ACTIVE';
  decisionId?: string;
  reason?: string;
  metadata?: {
    entryImages?: { url: string; type: string }[];
    exitImages?: { url: string; type: string }[];
    entryCamera?: string;
    exitCamera?: string;
    entrySource?: string;
    exitSource?: string;
    entryConfidence?: number;
    exitConfidence?: number;
    vehicleType?: string;
    vehicleColor?: string;
  };
}

interface Site {
  id: string;
  name: string;
}

interface AuditLog {
  id: string;
  action: string;
  performedBy: string;
  timestamp: string;
  metadata?: any;
  changes?: any;
}

export function ParkingEventsView() {
  const [events, setEvents] = useState<ParkingEvent[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSites, setSelectedSites] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState(() => {
    // Default to 7 days ago
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => {
    // Default to today
    return new Date().toISOString().split('T')[0];
  });
  const [showFilters, setShowFilters] = useState(false);
  const [viewingSession, setViewingSession] = useState<ParkingEvent | null>(
    null,
  );
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [showSiteBreakdown, setShowSiteBreakdown] = useState(false);
  const itemsPerPage = 50;

  // AbortController ref for request cancellation
  const eventsAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchSites();
    fetchEvents();

    // Cleanup on unmount
    return () => {
      if (eventsAbortRef.current) {
        eventsAbortRef.current.abort();
      }
    };
  }, []);

  const fetchSites = async () => {
    try {
      const { data } = await axios.get('/api/sites');
      setSites(data);
    } catch (error) {
      console.error('Failed to fetch sites:', error);
    }
  };

  const fetchEvents = useCallback(async () => {
    // Cancel any pending request
    if (eventsAbortRef.current) {
      eventsAbortRef.current.abort();
    }
    eventsAbortRef.current = new AbortController();

    setLoading(true);
    try {
      const params: any = {};
      if (selectedSites.size > 0) {
        params.siteIds = Array.from(selectedSites).join(',');
      }
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const { data } = await axios.get('/enforcement/parking-events', {
        params,
        signal: eventsAbortRef.current.signal,
      });
      // Handle paginated response
      const items = data.items || data;
      setEvents(items);
    } catch (error) {
      if (!axios.isCancel(error)) {
        console.error('Failed to fetch parking events:', error);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedSites, dateFrom, dateTo]);

  const fetchAuditLog = async (sessionId: string, decisionId?: string) => {
    try {
      const logs: AuditLog[] = [];

      // Fetch session audit
      const sessionResponse = await axios.get(
        `/api/audit/session/${sessionId}`,
      );
      const sessionLogs =
        sessionResponse.data.auditLogs ||
        (Array.isArray(sessionResponse.data) ? sessionResponse.data : []);
      logs.push(...sessionLogs);

      // Fetch decision audit if exists
      if (decisionId) {
        const decisionResponse = await axios.get(
          `/api/audit/decision/${decisionId}`,
        );
        const decisionLogs =
          decisionResponse.data.auditLogs ||
          (Array.isArray(decisionResponse.data) ? decisionResponse.data : []);
        logs.push(...decisionLogs);
      }

      // Sort by timestamp
      logs.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
      setAuditLogs(logs);
    } catch (error) {
      console.error('Failed to fetch audit log:', error);
      setAuditLogs([]);
    }
  };

  const handleSiteToggle = (siteId: string) => {
    const newSelected = new Set(selectedSites);
    if (newSelected.has(siteId)) {
      newSelected.delete(siteId);
    } else {
      newSelected.add(siteId);
    }
    setSelectedSites(newSelected);
  };

  const applyFilters = () => {
    fetchEvents();
    setShowFilters(false);
  };

  const clearFilters = () => {
    setSelectedSites(new Set());
    setDateFrom('');
    setDateTo('');
  };

  const getStatusBadge = (status: ParkingEvent['status']) => {
    const badges = {
      PASSTHROUGH: {
        label: 'Passthrough',
        class: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
      },
      ACTIVE: {
        label: 'Active',
        class:
          'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      },
      POTENTIAL_PCN: {
        label: 'Potential PCN',
        class:
          'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      },
      APPROVED_PCN: {
        label: 'Approved PCN',
        class: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      },
      DECLINED_PCN: {
        label: 'Declined',
        class:
          'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      },
      EXPORTED_PCN: {
        label: 'Exported',
        class:
          'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
      },
    };
    const badge = badges[status];
    return (
      <span
        className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${badge.class}`}
      >
        {badge.label}
      </span>
    );
  };

  const formatDateTime = (dateString?: string, isActive?: boolean) => {
    if (!dateString) {
      return isActive ? (
        <span className="text-blue-600 dark:text-blue-400 font-medium">
          In progress
        </span>
      ) : (
        'N/A'
      );
    }
    const date = new Date(dateString);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (
    minutes?: number,
    entryTime?: string,
    isActive?: boolean,
  ) => {
    if (isActive && entryTime) {
      // Calculate live duration for active sessions
      const now = new Date();
      const entry = new Date(entryTime);
      const liveDuration = Math.floor(
        (now.getTime() - entry.getTime()) / 60000,
      );
      if (liveDuration < 60)
        return (
          <span className="text-blue-600 dark:text-blue-400">
            {liveDuration}m
          </span>
        );
      const hours = Math.floor(liveDuration / 60);
      const mins = liveDuration % 60;
      return (
        <span className="text-blue-600 dark:text-blue-400">
          {hours}h {mins}m
        </span>
      );
    }
    if (!minutes) return 'N/A';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const openAuditModal = (event: ParkingEvent) => {
    setViewingSession(event);
    fetchAuditLog(event.sessionId, event.decisionId);
  };

  const closeAuditModal = () => {
    setViewingSession(null);
    setAuditLogs([]);
  };

  // Group events by site
  const eventsBySite = events.reduce(
    (acc, event) => {
      if (!acc[event.siteId]) acc[event.siteId] = [];
      acc[event.siteId].push(event);
      return acc;
    },
    {} as Record<string, ParkingEvent[]>,
  );

  // Calculate stats per site
  const siteStats = Object.entries(eventsBySite).map(([siteId, siteEvents]) => {
    const stats = {
      siteId,
      siteName: sites.find((s) => s.id === siteId)?.name || siteId,
      total: siteEvents.length,
      passthrough: siteEvents.filter((e) => e.status === 'PASSTHROUGH').length,
      active: siteEvents.filter((e) => e.status === 'ACTIVE').length,
      potential: siteEvents.filter((e) => e.status === 'POTENTIAL_PCN').length,
      approved: siteEvents.filter((e) => e.status === 'APPROVED_PCN').length,
      declined: siteEvents.filter((e) => e.status === 'DECLINED_PCN').length,
      exported: siteEvents.filter((e) => e.status === 'EXPORTED_PCN').length,
    };
    return stats;
  });

  const activeFilterCount =
    selectedSites.size + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  // Filter events by status
  const filteredEvents =
    statusFilter === 'ALL'
      ? events
      : events.filter((e) => e.status === statusFilter);

  // Pagination
  const totalPages = Math.ceil(filteredEvents.length / itemsPerPage);
  const paginatedEvents = filteredEvents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  // Calculate overall stats
  const stats = {
    total: events.length,
    passthrough: events.filter((e) => e.status === 'PASSTHROUGH').length,
    active: events.filter((e) => e.status === 'ACTIVE').length,
    potential: events.filter((e) => e.status === 'POTENTIAL_PCN').length,
    approved: events.filter((e) => e.status === 'APPROVED_PCN').length,
    declined: events.filter((e) => e.status === 'DECLINED_PCN').length,
    exported: events.filter((e) => e.status === 'EXPORTED_PCN').length,
  };

  return (
    <div className="space-y-4">
      {/* Compact Stats Bar */}
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Parking Events
            </h3>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {Object.keys(eventsBySite).length} sites
            </span>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-slate-800 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors text-sm"
          >
            <Filter className="w-4 h-4" />
            Filter
            {activeFilterCount > 0 && (
              <span className="ml-1 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-7 gap-3">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`p-3 rounded-lg border transition-all ${
              statusFilter === 'ALL'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.total}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              All Events
            </div>
          </button>
          <button
            onClick={() => setStatusFilter('PASSTHROUGH')}
            className={`p-3 rounded-lg border transition-all ${
              statusFilter === 'PASSTHROUGH'
                ? 'border-gray-500 bg-gray-50 dark:bg-gray-800/20'
                : 'border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">
              {stats.passthrough}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Passthrough
            </div>
          </button>
          <button
            onClick={() => setStatusFilter('ACTIVE')}
            className={`p-3 rounded-lg border transition-all ${
              statusFilter === 'ACTIVE'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {stats.active}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Active
            </div>
          </button>
          <button
            onClick={() => setStatusFilter('POTENTIAL_PCN')}
            className={`p-3 rounded-lg border transition-all ${
              statusFilter === 'POTENTIAL_PCN'
                ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
                : 'border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              {stats.potential}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Potential
            </div>
          </button>
          <button
            onClick={() => setStatusFilter('APPROVED_PCN')}
            className={`p-3 rounded-lg border transition-all ${
              statusFilter === 'APPROVED_PCN'
                ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                : 'border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {stats.approved}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Approved
            </div>
          </button>
          <button
            onClick={() => setStatusFilter('DECLINED_PCN')}
            className={`p-3 rounded-lg border transition-all ${
              statusFilter === 'DECLINED_PCN'
                ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                : 'border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {stats.declined}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Declined
            </div>
          </button>
          <button
            onClick={() => setStatusFilter('EXPORTED_PCN')}
            className={`p-3 rounded-lg border transition-all ${
              statusFilter === 'EXPORTED_PCN'
                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                : 'border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {stats.exported}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Exported
            </div>
          </button>
        </div>

        {/* Site Breakdown Toggle */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-800">
          <button
            onClick={() => setShowSiteBreakdown(!showSiteBreakdown)}
            className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <TrendingUp className="w-4 h-4" />
            {showSiteBreakdown ? 'Hide' : 'Show'} Site Breakdown (
            {siteStats.length} sites)
          </button>
        </div>

        {/* Site Breakdown */}
        {showSiteBreakdown && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {siteStats.map((site) => (
              <div
                key={site.siteId}
                className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 border border-gray-200 dark:border-slate-700"
              >
                <h5
                  className="font-semibold text-sm text-gray-900 dark:text-white mb-2 truncate"
                  title={site.siteName}
                >
                  {site.siteName}
                </h5>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">
                      Total:
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {site.total}
                    </span>
                  </div>
                  {site.active > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        Active:
                      </span>
                      <span className="text-blue-600 dark:text-blue-400">
                        {site.active}
                      </span>
                    </div>
                  )}
                  {site.potential > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        Potential:
                      </span>
                      <span className="text-yellow-600 dark:text-yellow-400">
                        {site.potential}
                      </span>
                    </div>
                  )}
                  {site.approved > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        Approved:
                      </span>
                      <span className="text-red-600 dark:text-red-400">
                        {site.approved}
                      </span>
                    </div>
                  )}
                  {site.declined > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        Declined:
                      </span>
                      <span className="text-green-600 dark:text-green-400">
                        {site.declined}
                      </span>
                    </div>
                  )}
                  {site.exported > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        Exported:
                      </span>
                      <span className="text-purple-600 dark:text-purple-400">
                        {site.exported}
                      </span>
                    </div>
                  )}
                  {site.passthrough > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        Passthrough:
                      </span>
                      <span className="text-gray-500 dark:text-gray-500">
                        {site.passthrough}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-semibold text-gray-900 dark:text-white">
              Filter Options
            </h4>
            <button
              onClick={() => setShowFilters(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Site Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Sites
            </label>
            <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
              {sites.map((site) => (
                <label
                  key={site.id}
                  className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-slate-800 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedSites.has(site.id)}
                    onChange={() => handleSiteToggle(site.id)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {site.name}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                From Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                />
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                To Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                />
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-slate-800">
            <button
              onClick={clearFilters}
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Clear All
            </button>
            <button
              onClick={applyFilters}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {/* Events Table */}
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  VRM
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Site
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Entry
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Exit
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Duration
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Reason
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                  >
                    Loading events...
                  </td>
                </tr>
              ) : paginatedEvents.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                  >
                    No events found
                  </td>
                </tr>
              ) : (
                paginatedEvents.map((event) => {
                  const isActive = event.status === 'ACTIVE';
                  return (
                    <tr
                      key={event.sessionId}
                      className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-white">
                        {event.vrm}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                        {sites.find((s) => s.id === event.siteId)?.name ||
                          event.siteId}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                        {formatDateTime(event.entryTime, false)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                        {formatDateTime(event.exitTime, isActive)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                        {formatDuration(
                          event.durationMinutes,
                          event.entryTime,
                          isActive,
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {getStatusBadge(event.status)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 max-w-xs truncate">
                        {event.reason || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <button
                          onClick={() => openAuditModal(event)}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                          title="View details"
                        >
                          <FileSearch className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && filteredEvents.length > 0 && (
          <div className="border-t border-gray-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
              {Math.min(currentPage * itemsPerPage, filteredEvents.length)} of{' '}
              {filteredEvents.length} events
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded border border-gray-200 dark:border-slate-800 hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[80px] text-center">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="p-1.5 rounded border border-gray-200 dark:border-slate-800 hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Enhanced Event Details Modal */}
      {viewingSession && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-7xl w-full max-h-[95vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Modal Header - Vehicle Plate Hero */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-900 p-6">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-6">
                  {/* Large Plate Display */}
                  <div className="bg-yellow-400 text-black px-6 py-3 rounded-lg shadow-lg">
                    <span className="font-mono text-3xl font-bold tracking-wider">
                      {viewingSession.vrm}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">
                      {sites.find((s) => s.id === viewingSession.siteId)?.name ||
                        viewingSession.siteId}
                    </h3>
                    <div className="flex items-center gap-3 mt-2">
                      {getStatusBadge(viewingSession.status)}
                      {viewingSession.metadata?.vehicleType && (
                        <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs capitalize">
                          {viewingSession.metadata.vehicleType}
                        </span>
                      )}
                      {viewingSession.metadata?.vehicleColor && (
                        <span className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs capitalize">
                          {viewingSession.metadata.vehicleColor}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={closeAuditModal}
                  className="text-slate-400 hover:text-white transition-colors p-2 hover:bg-slate-700 rounded-lg"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Quick Stats Bar */}
              <div className="grid grid-cols-4 border-b border-gray-200 dark:border-slate-800">
                <div className="p-4 border-r border-gray-200 dark:border-slate-800 text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Entry</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                    {viewingSession.entryTime
                      ? new Date(viewingSession.entryTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                      : '—'}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {viewingSession.entryTime
                      ? new Date(viewingSession.entryTime).toLocaleDateString('en-GB')
                      : ''}
                  </div>
                </div>
                <div className="p-4 border-r border-gray-200 dark:border-slate-800 text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Exit</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                    {viewingSession.exitTime
                      ? new Date(viewingSession.exitTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                      : viewingSession.status === 'ACTIVE' ? (
                          <span className="text-blue-500">In Progress</span>
                        ) : '—'}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {viewingSession.exitTime
                      ? new Date(viewingSession.exitTime).toLocaleDateString('en-GB')
                      : ''}
                  </div>
                </div>
                <div className="p-4 border-r border-gray-200 dark:border-slate-800 text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Duration</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                    {formatDuration(viewingSession.durationMinutes, viewingSession.entryTime, viewingSession.status === 'ACTIVE')}
                  </div>
                </div>
                <div className="p-4 text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Confidence</div>
                  <div className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                    {viewingSession.metadata?.entryConfidence
                      ? `${viewingSession.metadata.entryConfidence}%`
                      : '—'}
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Reason Banner (if exists) */}
                {viewingSession.reason && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900/40 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-amber-600 dark:text-amber-400">⚠</span>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-amber-800 dark:text-amber-300">Decision Reason</div>
                        <div className="text-amber-700 dark:text-amber-400 mt-1">{viewingSession.reason}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Images Section - Entry & Exit Side by Side */}
                <div className="grid grid-cols-2 gap-6">
                  {/* Entry Images */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                        Entry
                      </h4>
                      {viewingSession.metadata?.entryCamera && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded">
                          📷 {viewingSession.metadata.entryCamera}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {viewingSession.metadata?.entryImages?.map((img, idx) => (
                        <div key={`entry-${idx}`} className="space-y-1">
                          <div className="aspect-video rounded-lg overflow-hidden border-2 border-gray-200 dark:border-slate-700 hover:border-blue-500 transition-colors cursor-pointer shadow-sm">
                            <ImageWithLoader
                              src={img.url}
                              alt={`Entry ${img.type}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 text-center capitalize">
                            {img.type || `Image ${idx + 1}`}
                          </p>
                        </div>
                      )) || (
                        <div className="col-span-2 aspect-video rounded-lg border-2 border-dashed border-gray-300 dark:border-slate-700 flex items-center justify-center">
                          <span className="text-gray-400 dark:text-gray-500">No entry images</span>
                        </div>
                      )}
                    </div>
                    {viewingSession.metadata?.entrySource && (
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>Source:</span>
                        <span className="bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded capitalize">
                          {viewingSession.metadata.entrySource}
                        </span>
                        {viewingSession.metadata?.entryConfidence && (
                          <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded">
                            {viewingSession.metadata.entryConfidence}% conf
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Exit Images */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                        Exit
                      </h4>
                      {viewingSession.metadata?.exitCamera && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded">
                          📷 {viewingSession.metadata.exitCamera}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {viewingSession.metadata?.exitImages?.length ? (
                        viewingSession.metadata.exitImages.map((img, idx) => (
                          <div key={`exit-${idx}`} className="space-y-1">
                            <div className="aspect-video rounded-lg overflow-hidden border-2 border-gray-200 dark:border-slate-700 hover:border-blue-500 transition-colors cursor-pointer shadow-sm">
                              <ImageWithLoader
                                src={img.url}
                                alt={`Exit ${img.type}`}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 text-center capitalize">
                              {img.type || `Image ${idx + 1}`}
                            </p>
                          </div>
                        ))
                      ) : viewingSession.status === 'ACTIVE' ? (
                        <div className="col-span-2 aspect-video rounded-lg border-2 border-dashed border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                          <span className="text-blue-500 dark:text-blue-400">🚗 Vehicle still on site</span>
                        </div>
                      ) : (
                        <div className="col-span-2 aspect-video rounded-lg border-2 border-dashed border-gray-300 dark:border-slate-700 flex items-center justify-center">
                          <span className="text-gray-400 dark:text-gray-500">No exit images</span>
                        </div>
                      )}
                    </div>
                    {viewingSession.metadata?.exitSource && (
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>Source:</span>
                        <span className="bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded capitalize">
                          {viewingSession.metadata.exitSource}
                        </span>
                        {viewingSession.metadata?.exitConfidence && (
                          <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded">
                            {viewingSession.metadata.exitConfidence}% conf
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Technical Details */}
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-4">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm">Technical Details</h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Session ID</span>
                      <p className="font-mono text-xs text-gray-700 dark:text-gray-300 mt-1 truncate" title={viewingSession.sessionId}>
                        {viewingSession.sessionId}
                      </p>
                    </div>
                    {viewingSession.decisionId && (
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Decision ID</span>
                        <p className="font-mono text-xs text-gray-700 dark:text-gray-300 mt-1 truncate" title={viewingSession.decisionId}>
                          {viewingSession.decisionId}
                        </p>
                      </div>
                    )}
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Site Code</span>
                      <p className="font-mono text-xs text-gray-700 dark:text-gray-300 mt-1">
                        {viewingSession.siteId}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Audit Trail */}
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Audit Trail
                  </h4>
                  {auditLogs.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400 text-sm bg-gray-50 dark:bg-slate-800 rounded-lg p-4 text-center">
                      No audit logs recorded for this event
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {auditLogs.map((log, _idx) => (
                        <div
                          key={log.id}
                          className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg"
                        >
                          <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start gap-2">
                              <span className="font-medium text-gray-900 dark:text-white text-sm">
                                {log.action}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                {formatDateTime(log.timestamp)}
                              </span>
                            </div>
                            {log.performedBy && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                By: {log.performedBy}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-200 dark:border-slate-800 p-4 bg-gray-50 dark:bg-slate-800/50">
              <div className="flex justify-end gap-3">
                <button
                  onClick={closeAuditModal}
                  className="px-6 py-2 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
