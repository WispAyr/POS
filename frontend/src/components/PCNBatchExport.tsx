import { useEffect, useState } from 'react';
import axios from 'axios';
import { Download, FileArchive, CheckSquare, Square, X, Car, Clock, MapPin, FileText, Eye } from 'lucide-react';

interface ApprovedPCN {
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

interface AuditLog {
    id: string;
    action: string;
    actor: string;
    timestamp: string;
    details: any;
}

export function PCNBatchExport() {
    const [pcns, setPcns] = useState<ApprovedPCN[]>([]);
    const [selectedPcns, setSelectedPcns] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [viewingPcn, setViewingPcn] = useState<ApprovedPCN | null>(null);
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
    const [loadingAudit, setLoadingAudit] = useState(false);

    useEffect(() => {
        fetchApprovedPCNs();
    }, []);

    useEffect(() => {
        if (viewingPcn) {
            fetchAuditLog(viewingPcn.id);
        }
    }, [viewingPcn?.id]);

    const fetchApprovedPCNs = async () => {
        try {
            const { data } = await axios.get('/enforcement/approved');
            setPcns(data);
        } catch (error) {
            console.error('Failed to fetch approved PCNs', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchAuditLog = async (decisionId: string) => {
        setLoadingAudit(true);
        try {
            const { data } = await axios.get(`/api/audit/decision/${decisionId}`);
            // Backend returns { decisionId, auditLogs } or array depending on endpoint
            const logs = data.auditLogs || (Array.isArray(data) ? data : []);
            setAuditLogs(logs);
        } catch (error) {
            console.error('Failed to fetch audit log', error);
            setAuditLogs([]);
        } finally {
            setLoadingAudit(false);
        }
    };

    const toggleSelection = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newSelection = new Set(selectedPcns);
        if (newSelection.has(id)) {
            newSelection.delete(id);
        } else {
            newSelection.add(id);
        }
        setSelectedPcns(newSelection);
    };

    const toggleSelectAll = () => {
        if (selectedPcns.size === pcns.length) {
            setSelectedPcns(new Set());
        } else {
            setSelectedPcns(new Set(pcns.map(p => p.id)));
        }
    };

    const handleExport = async () => {
        if (selectedPcns.size === 0) {
            alert('Please select at least one PCN to export');
            return;
        }

        setExporting(true);
        try {
            await axios.post('/enforcement/export', {
                decisionIds: Array.from(selectedPcns),
            });

            setPcns(pcns.filter(p => !selectedPcns.has(p.id)));
            setSelectedPcns(new Set());

            alert(`Successfully marked ${selectedPcns.size} PCN(s) as exported`);
        } catch (error) {
            console.error('Failed to export PCNs', error);
            alert('Failed to export PCNs');
        } finally {
            setExporting(false);
        }
    };

    const formatDuration = (minutes?: number) => {
        if (!minutes) return 'Unknown';
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hours > 0) {
            return `${hours}h ${mins}m`;
        }
        return `${mins}m`;
    };

    const getActionColor = (action: string) => {
        const colors: { [key: string]: string } = {
            'DECISION_CREATED': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
            'ENFORCEMENT_REVIEWED': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
            'DECISION_RECONCILED': 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
        };
        return colors[action] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Loading approved PCNs...</div>;
    }

    return (
        <>
            <div className="p-6">
                <div className="mb-6 flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Approved PCNs</h2>
                        <p className="text-gray-500 dark:text-gray-400 mt-1">
                            {pcns.length} PCN(s) ready for export • {selectedPcns.size} selected
                        </p>
                    </div>
                    <button
                        onClick={handleExport}
                        disabled={selectedPcns.size === 0 || exporting}
                        className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium shadow-lg transition-all disabled:cursor-not-allowed"
                    >
                        <Download className="w-5 h-5" />
                        {exporting ? 'Exporting...' : `Export ${selectedPcns.size || ''} PCN(s)`}
                    </button>
                </div>

                {pcns.length === 0 ? (
                    <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800">
                        <FileArchive className="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">No Approved PCNs</h3>
                        <p className="text-gray-500 dark:text-gray-400 mt-2">
                            All approved PCNs have been exported.
                        </p>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                                <tr>
                                    <th className="px-6 py-3 text-left">
                                        <button
                                            onClick={toggleSelectAll}
                                            className="flex items-center gap-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                                        >
                                            {selectedPcns.size === pcns.length ? (
                                                <CheckSquare className="w-5 h-5" />
                                            ) : (
                                                <Square className="w-5 h-5" />
                                            )}
                                        </button>
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        VRM
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Site
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Violation
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Duration
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Entry Time
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Exit Time
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                                {pcns.map((pcn) => (
                                    <tr
                                        key={pcn.id}
                                        className={`hover:bg-gray-50 dark:hover:bg-slate-800 ${
                                            selectedPcns.has(pcn.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                                        }`}
                                    >
                                        <td className="px-6 py-4">
                                            <button onClick={(e) => toggleSelection(pcn.id, e)}>
                                                {selectedPcns.has(pcn.id) ? (
                                                    <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                                ) : (
                                                    <Square className="w-5 h-5 text-gray-400" />
                                                )}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="font-bold text-gray-900 dark:text-white">{pcn.vrm}</span>
                                        </td>
                                        <td className="px-6 py-4 text-gray-700 dark:text-gray-300">{pcn.siteId}</td>
                                        <td className="px-6 py-4 text-gray-700 dark:text-gray-300">{pcn.reason}</td>
                                        <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                                            {formatDuration(pcn.durationMinutes)}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                                            {pcn.entryTime ? new Date(pcn.entryTime).toLocaleString() : 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                                            {pcn.exitTime ? new Date(pcn.exitTime).toLocaleString() : 'N/A'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => setViewingPcn(pcn)}
                                                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                                            >
                                                <Eye className="w-4 h-4" />
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* PCN Detail Modal */}
            {viewingPcn && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
                        {/* Modal Header */}
                        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 p-6 flex justify-between items-start z-10">
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{viewingPcn.vrm}</h3>
                                    <span className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 px-3 py-1 rounded-full text-sm font-bold">
                                        APPROVED
                                    </span>
                                    <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">#{viewingPcn.id.slice(0, 8)}</span>
                                </div>
                                <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                                    <div className="flex items-center gap-1">
                                        <MapPin className="w-4 h-4" />
                                        {viewingPcn.siteId}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Clock className="w-4 h-4" />
                                        {new Date(viewingPcn.timestamp).toLocaleString()}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setViewingPcn(null)}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            >
                                <X className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                            </button>
                        </div>

                        <div className="p-6">
                            {/* Evidence Images */}
                            <div className="mb-6">
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">Evidence Images</h4>
                                <div className="grid grid-cols-2 gap-3 bg-gray-900 rounded-xl overflow-hidden">
                                    {/* Entry Images */}
                                    <div className="relative group overflow-hidden aspect-video">
                                        {viewingPcn.metadata?.entryImages?.find(img => img.type === 'overview')?.url ? (
                                            <img
                                                src={viewingPcn.metadata.entryImages.find(img => img.type === 'overview')!.url}
                                                alt="Entry Overview"
                                                className="w-full h-full object-cover cursor-pointer"
                                                onClick={() => window.open(viewingPcn.metadata!.entryImages!.find(img => img.type === 'overview')!.url, '_blank')}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-500">No Entry Overview</div>
                                        )}
                                        <div className="absolute bottom-2 left-2 bg-green-600/80 text-white text-xs px-2 py-1 rounded font-semibold">Entry - Overview</div>
                                    </div>
                                    <div className="relative group overflow-hidden aspect-video">
                                        {viewingPcn.metadata?.entryImages?.find(img => img.type === 'plate')?.url ? (
                                            <img
                                                src={viewingPcn.metadata.entryImages.find(img => img.type === 'plate')!.url}
                                                alt="Entry Plate"
                                                className="w-full h-full object-cover cursor-pointer"
                                                onClick={() => window.open(viewingPcn.metadata!.entryImages!.find(img => img.type === 'plate')!.url, '_blank')}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-500 bg-gray-800">
                                                <Car className="w-12 h-12 text-gray-600" />
                                            </div>
                                        )}
                                        <div className="absolute bottom-2 left-2 bg-green-600/80 text-white text-xs px-2 py-1 rounded font-semibold">Entry - Plate</div>
                                    </div>
                                    {/* Exit Images */}
                                    <div className="relative group overflow-hidden aspect-video">
                                        {viewingPcn.metadata?.exitImages?.find(img => img.type === 'overview')?.url ? (
                                            <img
                                                src={viewingPcn.metadata.exitImages.find(img => img.type === 'overview')!.url}
                                                alt="Exit Overview"
                                                className="w-full h-full object-cover cursor-pointer"
                                                onClick={() => window.open(viewingPcn.metadata!.exitImages!.find(img => img.type === 'overview')!.url, '_blank')}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-500">No Exit Overview</div>
                                        )}
                                        <div className="absolute bottom-2 left-2 bg-red-600/80 text-white text-xs px-2 py-1 rounded font-semibold">Exit - Overview</div>
                                    </div>
                                    <div className="relative group overflow-hidden aspect-video">
                                        {viewingPcn.metadata?.exitImages?.find(img => img.type === 'plate')?.url ? (
                                            <img
                                                src={viewingPcn.metadata.exitImages.find(img => img.type === 'plate')!.url}
                                                alt="Exit Plate"
                                                className="w-full h-full object-cover cursor-pointer"
                                                onClick={() => window.open(viewingPcn.metadata!.exitImages!.find(img => img.type === 'plate')!.url, '_blank')}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-500 bg-gray-800">
                                                <Car className="w-12 h-12 text-gray-600" />
                                            </div>
                                        )}
                                        <div className="absolute bottom-2 left-2 bg-red-600/80 text-white text-xs px-2 py-1 rounded font-semibold">Exit - Plate</div>
                                    </div>
                                </div>
                            </div>

                            {/* Violation Details */}
                            <div className="mb-6">
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">Violation Details</h4>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="bg-gray-50 dark:bg-slate-800 p-4 rounded-lg">
                                        <span className="block text-xs text-gray-500 dark:text-gray-500 mb-1">Reason</span>
                                        <span className="font-semibold text-gray-900 dark:text-white">{viewingPcn.reason}</span>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-slate-800 p-4 rounded-lg">
                                        <span className="block text-xs text-gray-500 dark:text-gray-500 mb-1">AI Confidence</span>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-blue-600 dark:bg-blue-500 rounded-full"
                                                    style={{ width: `${viewingPcn.confidenceScore * 100}%` }}
                                                />
                                            </div>
                                            <span className="font-bold text-gray-900 dark:text-white">{(viewingPcn.confidenceScore * 100).toFixed(0)}%</span>
                                        </div>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-slate-800 p-4 rounded-lg">
                                        <span className="block text-xs text-gray-500 dark:text-gray-500 mb-1">Parking Duration</span>
                                        <span className="font-semibold text-gray-900 dark:text-white text-lg">{formatDuration(viewingPcn.durationMinutes)}</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 mt-4">
                                    <div className="bg-gray-50 dark:bg-slate-800 p-4 rounded-lg">
                                        <span className="block text-xs text-gray-500 dark:text-gray-500 mb-1">Entry Time</span>
                                        <span className="font-medium text-gray-900 dark:text-white">
                                            {viewingPcn.entryTime ? new Date(viewingPcn.entryTime).toLocaleString() : 'N/A'}
                                        </span>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-slate-800 p-4 rounded-lg">
                                        <span className="block text-xs text-gray-500 dark:text-gray-500 mb-1">Exit Time</span>
                                        <span className="font-medium text-gray-900 dark:text-white">
                                            {viewingPcn.exitTime ? new Date(viewingPcn.exitTime).toLocaleString() : 'N/A'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Audit Log */}
                            <div>
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3 flex items-center gap-2">
                                    <FileText className="w-4 h-4" />
                                    Audit Trail
                                </h4>
                                {loadingAudit ? (
                                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading audit trail...</div>
                                ) : auditLogs.length === 0 ? (
                                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">No audit logs found</div>
                                ) : (
                                    <div className="space-y-2">
                                        {auditLogs.map((log) => (
                                            <div key={log.id} className="bg-gray-50 dark:bg-slate-800 p-4 rounded-lg">
                                                <div className="flex items-start justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getActionColor(log.action)}`}>
                                                            {log.action}
                                                        </span>
                                                        <span className="text-sm text-gray-600 dark:text-gray-400">
                                                            by {log.actor}
                                                        </span>
                                                    </div>
                                                    <span className="text-xs text-gray-500 dark:text-gray-500">
                                                        {new Date(log.timestamp).toLocaleString()}
                                                    </span>
                                                </div>
                                                {log.details && Object.keys(log.details).length > 0 && (
                                                    <div className="mt-2 text-sm">
                                                        <pre className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono text-xs bg-white dark:bg-slate-900 p-2 rounded">
                                                            {JSON.stringify(log.details, null, 2)}
                                                        </pre>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
