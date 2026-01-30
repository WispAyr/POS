import { useState, useCallback } from 'react';
import axios from 'axios';
import {
  Search,
  Car,
  CreditCard,
  Shield,
  Clock,
  FileText,
  Tag,
  Camera,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface VrmSearchResult {
  vrm: string;
  normalizedVrm: string;
  summary: {
    hasActivePayment: boolean;
    hasActivePermit: boolean;
    hasOpenSession: boolean;
    totalPayments: number;
    totalPermits: number;
    totalSessions: number;
    totalMovements: number;
    notesCount: number;
    markersCount: number;
  };
  activePayments: {
    id: string;
    siteId: string;
    amount: number;
    startTime: string;
    expiryTime: string;
    source: string;
  }[];
  activePermits: {
    id: string;
    siteId: string | null;
    type: string;
    startDate: string;
    endDate: string | null;
  }[];
  recentSessions: {
    id: string;
    siteId: string;
    startTime: string;
    endTime: string | null;
    durationMinutes: number | null;
    status: string;
  }[];
  notes: {
    id: string;
    note: string;
    createdBy: string;
    createdAt: string;
  }[];
  markers: {
    id: string;
    markerType: string;
    description: string | null;
    createdAt: string;
  }[];
  recentMovements: {
    id: string;
    siteId: string;
    cameraIds: string;
    direction: string | null;
    timestamp: string;
  }[];
}

export function VrmSearch() {
  const [searchInput, setSearchInput] = useState('');
  const [result, setResult] = useState<VrmSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    payments: true,
    permits: true,
    sessions: false,
    movements: false,
    notes: false,
    markers: false,
  });

  const handleSearch = useCallback(async () => {
    if (!searchInput.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data } = await axios.get(`/api/search/vrm/${encodeURIComponent(searchInput.trim())}`);
      setResult(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [searchInput]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (minutes: number | null) => {
    if (minutes === null) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  return (
    <div className="space-y-6">
      {/* Search Box */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Vehicle Registration Search
        </h3>
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              placeholder="Enter VRM (e.g., AB12 CDE)"
              className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-mono"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !searchInput.trim()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {loading ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Search className="w-5 h-5" />
            )}
            Search
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
          <span className="text-red-800 dark:text-red-300">{error}</span>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <Car className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white font-mono">
                  {result.normalizedVrm}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Vehicle Registration
                </p>
              </div>
            </div>

            {/* Status Badges */}
            <div className="flex flex-wrap gap-3 mb-6">
              <StatusBadge
                active={result.summary.hasActivePayment}
                label="Active Payment"
                icon={CreditCard}
              />
              <StatusBadge
                active={result.summary.hasActivePermit}
                label="Active Permit"
                icon={Shield}
              />
              <StatusBadge
                active={result.summary.hasOpenSession}
                label="Open Session"
                icon={Clock}
              />
              {result.summary.markersCount > 0 && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-sm font-medium">
                  <Tag className="w-4 h-4" />
                  {result.summary.markersCount} Marker{result.summary.markersCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatBox label="Total Payments" value={result.summary.totalPayments} />
              <StatBox label="Total Permits" value={result.summary.totalPermits} />
              <StatBox label="Total Sessions" value={result.summary.totalSessions} />
              <StatBox label="Total Movements" value={result.summary.totalMovements} />
            </div>
          </div>

          {/* Active Payments */}
          <CollapsibleSection
            title="Active Payments"
            icon={CreditCard}
            count={result.activePayments.length}
            expanded={expandedSections.payments}
            onToggle={() => toggleSection('payments')}
            highlight={result.activePayments.length > 0}
          >
            {result.activePayments.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">No active payments</p>
            ) : (
              <div className="space-y-3">
                {result.activePayments.map((payment) => (
                  <div
                    key={payment.id}
                    className="p-4 bg-gray-50 dark:bg-slate-800 rounded-lg"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {payment.siteId}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {formatDate(payment.startTime)} - {formatDate(payment.expiryTime)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-green-600 dark:text-green-400">
                          £{payment.amount.toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-500">{payment.source}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          {/* Active Permits */}
          <CollapsibleSection
            title="Active Permits"
            icon={Shield}
            count={result.activePermits.length}
            expanded={expandedSections.permits}
            onToggle={() => toggleSection('permits')}
            highlight={result.activePermits.length > 0}
          >
            {result.activePermits.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">No active permits</p>
            ) : (
              <div className="space-y-3">
                {result.activePermits.map((permit) => (
                  <div
                    key={permit.id}
                    className="p-4 bg-gray-50 dark:bg-slate-800 rounded-lg flex justify-between items-center"
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {permit.type}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {permit.siteId || 'Global'}
                      </p>
                    </div>
                    <div className="text-right text-sm text-gray-500 dark:text-gray-400">
                      <p>From: {formatDate(permit.startDate)}</p>
                      <p>Until: {permit.endDate ? formatDate(permit.endDate) : 'Indefinite'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          {/* Recent Sessions */}
          <CollapsibleSection
            title="Recent Sessions"
            icon={Clock}
            count={result.recentSessions.length}
            expanded={expandedSections.sessions}
            onToggle={() => toggleSection('sessions')}
          >
            {result.recentSessions.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">No sessions found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 dark:text-gray-400">
                      <th className="pb-2">Site</th>
                      <th className="pb-2">Start</th>
                      <th className="pb-2">End</th>
                      <th className="pb-2">Duration</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-900 dark:text-white">
                    {result.recentSessions.map((session) => (
                      <tr key={session.id} className="border-t border-gray-100 dark:border-slate-700">
                        <td className="py-2">{session.siteId}</td>
                        <td className="py-2">{formatDate(session.startTime)}</td>
                        <td className="py-2">{session.endTime ? formatDate(session.endTime) : '-'}</td>
                        <td className="py-2">{formatDuration(session.durationMinutes)}</td>
                        <td className="py-2">
                          <span
                            className={`px-2 py-0.5 rounded text-xs ${
                              session.status === 'COMPLETED'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : session.status === 'PROVISIONAL'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                            }`}
                          >
                            {session.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CollapsibleSection>

          {/* Recent Movements */}
          <CollapsibleSection
            title="Recent Movements"
            icon={Camera}
            count={result.recentMovements.length}
            expanded={expandedSections.movements}
            onToggle={() => toggleSection('movements')}
          >
            {result.recentMovements.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">No movements found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 dark:text-gray-400">
                      <th className="pb-2">Time</th>
                      <th className="pb-2">Site</th>
                      <th className="pb-2">Camera</th>
                      <th className="pb-2">Direction</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-900 dark:text-white">
                    {result.recentMovements.map((movement) => (
                      <tr key={movement.id} className="border-t border-gray-100 dark:border-slate-700">
                        <td className="py-2">{formatDate(movement.timestamp)}</td>
                        <td className="py-2">{movement.siteId}</td>
                        <td className="py-2">{movement.cameraIds}</td>
                        <td className="py-2">
                          {movement.direction && (
                            <span
                              className={`px-2 py-0.5 rounded text-xs ${
                                movement.direction === 'ENTRY'
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                  : movement.direction === 'EXIT'
                                    ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                    : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {movement.direction}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CollapsibleSection>

          {/* Notes */}
          <CollapsibleSection
            title="Notes"
            icon={FileText}
            count={result.notes.length}
            expanded={expandedSections.notes}
            onToggle={() => toggleSection('notes')}
          >
            {result.notes.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">No notes</p>
            ) : (
              <div className="space-y-3">
                {result.notes.map((note) => (
                  <div
                    key={note.id}
                    className="p-4 bg-gray-50 dark:bg-slate-800 rounded-lg"
                  >
                    <p className="text-gray-900 dark:text-white">{note.note}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      By {note.createdBy} on {formatDate(note.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          {/* Markers */}
          <CollapsibleSection
            title="Markers"
            icon={Tag}
            count={result.markers.length}
            expanded={expandedSections.markers}
            onToggle={() => toggleSection('markers')}
            highlight={result.markers.length > 0}
          >
            {result.markers.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">No markers</p>
            ) : (
              <div className="space-y-3">
                {result.markers.map((marker) => (
                  <div
                    key={marker.id}
                    className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span className="font-medium text-amber-800 dark:text-amber-300">
                        {marker.markerType}
                      </span>
                    </div>
                    {marker.description && (
                      <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                        {marker.description}
                      </p>
                    )}
                    <p className="text-xs text-amber-600 dark:text-amber-500 mt-2">
                      Added {formatDate(marker.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  active,
  label,
  icon: Icon,
}: {
  active: boolean;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <span
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
        active
          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500'
      }`}
    >
      {active ? (
        <CheckCircle className="w-4 h-4" />
      ) : (
        <XCircle className="w-4 h-4" />
      )}
      {label}
    </span>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 text-center">
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

function CollapsibleSection({
  title,
  icon: Icon,
  count,
  expanded,
  onToggle,
  highlight,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-xl border overflow-hidden ${
        highlight
          ? 'border-green-200 dark:border-green-800'
          : 'border-gray-200 dark:border-slate-800'
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className={`w-5 h-5 ${highlight ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`} />
          <span className="font-medium text-gray-900 dark:text-white">{title}</span>
          <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 rounded-full">
            {count}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>
      {expanded && <div className="px-6 pb-4">{children}</div>}
    </div>
  );
}

export default VrmSearch;
