import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle,
  Clock,
  RefreshCw,
  ArrowRightLeft,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ImageWithLoader } from './ImageWithLoader';

interface Session {
  id: string;
  siteId: string;
  vrm: string;
  entryMovementId: string;
  exitMovementId: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: string;
}

interface Movement {
  id: string;
  vrm: string;
  direction: string;
  timestamp: string;
  cameraId: string;
  images?: { url: string; type: string }[];
}

export function FILOAnomalies() {
  const [anomalies, setAnomalies] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [minHours, setMinHours] = useState(24);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [movementDetails, setMovementDetails] = useState<{
    entry?: Movement;
    exit?: Movement;
  }>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchAnomalies = async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        `/api/movements/anomalies/first-in-last-out?minHours=${minHours}`,
      );
      setAnomalies(res.data.sessions || []);
    } catch (err) {
      console.error('Failed to fetch FILO anomalies:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnomalies();
  }, [minHours]);

  const fetchMovementDetails = async (session: Session) => {
    try {
      const [entryRes, exitRes] = await Promise.all([
        axios.get(`/api/movements/${session.entryMovementId}`),
        axios.get(`/api/movements/${session.exitMovementId}`),
      ]);
      setMovementDetails({
        entry: entryRes.data,
        exit: exitRes.data,
      });
    } catch (err) {
      console.error('Failed to fetch movement details:', err);
    }
  };

  const toggleExpand = (session: Session) => {
    if (expandedSession === session.id) {
      setExpandedSession(null);
      setMovementDetails({});
    } else {
      setExpandedSession(session.id);
      fetchMovementDetails(session);
    }
  };

  const handleFlipDirection = async (movementId: string) => {
    setProcessingId(movementId);
    try {
      await axios.patch(`/api/movements/${movementId}/flip-direction`, {
        reprocessSession: true,
      });
      // Refresh after flip
      await fetchAnomalies();
      if (expandedSession) {
        const session = anomalies.find((s) => s.id === expandedSession);
        if (session) await fetchMovementDetails(session);
      }
    } catch (err) {
      console.error('Failed to flip direction:', err);
      alert('Failed to flip direction');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDiscard = async (movementId: string) => {
    const reason = prompt('Reason for discarding (optional):');
    if (reason === null) return;

    setProcessingId(movementId);
    try {
      await axios.patch(`/api/movements/${movementId}/discard`, { reason });
      await fetchAnomalies();
    } catch (err) {
      console.error('Failed to discard:', err);
      alert('Failed to discard movement');
    } finally {
      setProcessingId(null);
    }
  };

  const formatDuration = (minutes: number) => {
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const mins = minutes % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const formatDateTime = (iso: string) => {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
            First-In-Last-Out Anomalies
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Sessions with unusually long durations that may indicate mismatched
            entry/exit events
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Threshold selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 dark:text-gray-400">
              Min hours:
            </label>
            <select
              value={minHours}
              onChange={(e) => setMinHours(Number(e.target.value))}
              className="px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm"
            >
              <option value={6}>6 hours</option>
              <option value={12}>12 hours</option>
              <option value={24}>24 hours</option>
              <option value={48}>48 hours</option>
              <option value={72}>72 hours (3 days)</option>
              <option value={168}>168 hours (1 week)</option>
            </select>
          </div>

          <button
            onClick={fetchAnomalies}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-800">
          <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
            {anomalies.length}
          </div>
          <div className="text-sm text-amber-700 dark:text-amber-300">
            Anomalies Found
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
          <div className="text-3xl font-bold text-gray-900 dark:text-white">
            {anomalies.length > 0
              ? formatDuration(
                  Math.max(...anomalies.map((a) => a.durationMinutes)),
                )
              : '-'}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Longest Duration
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
          <div className="text-3xl font-bold text-gray-900 dark:text-white">
            {new Set(anomalies.map((a) => a.siteId)).size}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Sites Affected
          </div>
        </div>
      </div>

      {/* Anomaly List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : anomalies.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-slate-800 rounded-xl">
          <AlertTriangle className="w-12 h-12 mx-auto text-green-500 mb-3" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            No Anomalies Found
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            No sessions exceed the {minHours} hour threshold
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {anomalies.map((session) => (
            <div
              key={session.id}
              className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden"
            >
              {/* Session Header */}
              <div
                className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
                onClick={() => toggleExpand(session)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className={`p-2 rounded-lg ${
                        session.durationMinutes > 10080
                          ? 'bg-red-100 dark:bg-red-900/30'
                          : session.durationMinutes > 2880
                            ? 'bg-amber-100 dark:bg-amber-900/30'
                            : 'bg-yellow-100 dark:bg-yellow-900/30'
                      }`}
                    >
                      <Clock
                        className={`w-5 h-5 ${
                          session.durationMinutes > 10080
                            ? 'text-red-600 dark:text-red-400'
                            : session.durationMinutes > 2880
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-yellow-600 dark:text-yellow-400'
                        }`}
                      />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold font-mono text-gray-900 dark:text-white">
                          {session.vrm}
                        </span>
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 rounded text-xs font-medium">
                          {session.siteId}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mt-1">
                        <span>{formatDateTime(session.startTime)}</span>
                        <span>→</span>
                        <span>{formatDateTime(session.endTime)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div
                        className={`text-xl font-bold ${
                          session.durationMinutes > 10080
                            ? 'text-red-600 dark:text-red-400'
                            : session.durationMinutes > 2880
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-yellow-600 dark:text-yellow-400'
                        }`}
                      >
                        {formatDuration(session.durationMinutes)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Duration
                      </div>
                    </div>

                    {expandedSession === session.id ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedSession === session.id && (
                <div className="border-t border-gray-200 dark:border-slate-800 p-4 bg-gray-50 dark:bg-slate-800/30">
                  <div className="grid grid-cols-2 gap-6">
                    {/* Entry Movement */}
                    <div className="space-y-3">
                      <h4 className="font-medium text-green-600 dark:text-green-400 flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        Entry Movement
                      </h4>
                      {movementDetails.entry ? (
                        <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-gray-200 dark:border-slate-700">
                          <div className="flex gap-3">
                            {movementDetails.entry.images?.[0] && (
                              <div className="w-24 h-16 rounded overflow-hidden bg-gray-200 dark:bg-slate-800">
                                <ImageWithLoader
                                  src={movementDetails.entry.images[0].url}
                                  alt="Entry"
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                            <div className="flex-1">
                              <div className="text-sm font-mono text-gray-900 dark:text-white">
                                {movementDetails.entry.vrm}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {formatDateTime(movementDetails.entry.timestamp)}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                Camera: {movementDetails.entry.cameraId}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() =>
                                handleFlipDirection(movementDetails.entry!.id)
                              }
                              disabled={
                                processingId === movementDetails.entry.id
                              }
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded hover:bg-amber-200 dark:hover:bg-amber-900/50 disabled:opacity-50"
                            >
                              <ArrowRightLeft className="w-3 h-3" />
                              Flip to Exit
                            </button>
                            <button
                              onClick={() =>
                                handleDiscard(movementDetails.entry!.id)
                              }
                              disabled={
                                processingId === movementDetails.entry.id
                              }
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50"
                            >
                              <Trash2 className="w-3 h-3" />
                              Discard
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          Loading...
                        </div>
                      )}
                    </div>

                    {/* Exit Movement */}
                    <div className="space-y-3">
                      <h4 className="font-medium text-red-600 dark:text-red-400 flex items-center gap-2">
                        <div className="w-2 h-2 bg-red-500 rounded-full" />
                        Exit Movement
                      </h4>
                      {movementDetails.exit ? (
                        <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-gray-200 dark:border-slate-700">
                          <div className="flex gap-3">
                            {movementDetails.exit.images?.[0] && (
                              <div className="w-24 h-16 rounded overflow-hidden bg-gray-200 dark:bg-slate-800">
                                <ImageWithLoader
                                  src={movementDetails.exit.images[0].url}
                                  alt="Exit"
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                            <div className="flex-1">
                              <div className="text-sm font-mono text-gray-900 dark:text-white">
                                {movementDetails.exit.vrm}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {formatDateTime(movementDetails.exit.timestamp)}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                Camera: {movementDetails.exit.cameraId}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() =>
                                handleFlipDirection(movementDetails.exit!.id)
                              }
                              disabled={processingId === movementDetails.exit.id}
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded hover:bg-amber-200 dark:hover:bg-amber-900/50 disabled:opacity-50"
                            >
                              <ArrowRightLeft className="w-3 h-3" />
                              Flip to Entry
                            </button>
                            <button
                              onClick={() =>
                                handleDiscard(movementDetails.exit!.id)
                              }
                              disabled={processingId === movementDetails.exit.id}
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50"
                            >
                              <Trash2 className="w-3 h-3" />
                              Discard
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          Loading...
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Explanation */}
                  <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      <strong>Why this matters:</strong> Sessions lasting{' '}
                      {formatDuration(session.durationMinutes)} are likely
                      caused by mismatched entry/exit events. Review the images
                      above and either flip the direction or discard the
                      incorrect movement.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
