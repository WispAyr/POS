import { useEffect, useState } from 'react';
import axios from 'axios';
import { Check, X, AlertTriangle, Clock, MapPin, Car } from 'lucide-react';

interface Decision {
    id: string;
    vrm: string;
    siteId: string;
    reason: string;
    confidenceScore: number;
    timestamp: string;
    metadata?: {
        images?: { url: string; type: string }[];
    };
}

export function EnforcementReview() {
    const [queue, setQueue] = useState<Decision[]>([]);
    const [currentDecision, setCurrentDecision] = useState<Decision | null>(null);
    const [loading, setLoading] = useState(true);

    // Fetch queue
    const fetchQueue = async () => {
        try {
            const { data } = await axios.get('/api/enforcement/queue'); // Proxied to /enforcement/queue
            // Note: Backend might return array, we take first item or manage local queue
            setQueue(data);
            if (data.length > 0) {
                setCurrentDecision(data[0]);
            } else {
                setCurrentDecision(null);
            }
        } catch (error) {
            console.error('Failed to fetch review queue', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchQueue();
    }, []);

    const handleReview = async (action: 'APPROVE' | 'REJECT') => {
        if (!currentDecision) return;

        try {
            await axios.post(`/api/enforcement/review/${currentDecision.id}`, {
                action,
                notes: `Manual review: ${action}`,
            });

            // Remove current from queue locally and advance
            const nextQueue = queue.filter(d => d.id !== currentDecision.id);
            setQueue(nextQueue);
            setCurrentDecision(nextQueue.length > 0 ? nextQueue[0] : null);

        } catch (error) {
            console.error('Failed to submit review', error);
            alert('Failed to submit review');
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading queue...</div>;

    if (!currentDecision) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 min-h-[400px] transition-colors">
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-full mb-4">
                    <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white transition-colors">All Caught Up!</h3>
                <p className="text-gray-500 dark:text-gray-400 mt-2 transition-colors">No pending violations to review.</p>
                <button
                    onClick={fetchQueue}
                    className="mt-6 px-4 py-2 text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                >
                    Refresh Queue
                </button>
            </div>
        );
    }

    // Helper to find plate image
    const plateImage = currentDecision.metadata?.images?.find(img => img.type === 'plate')?.url;
    const contextImage = currentDecision.metadata?.images?.find(img => img.type === 'overview')?.url;

    return (
        <div className="max-w-2xl mx-auto">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl dark:shadow-2xl dark:shadow-black/50 border border-gray-200 dark:border-slate-800 overflow-hidden transition-colors">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex justify-between items-start transition-colors">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1 transition-colors">
                                <AlertTriangle className="w-4 h-4" />
                                Possible Violation
                            </span>
                            <span className="text-sm text-gray-500 dark:text-gray-500 font-mono">#{currentDecision.id.slice(0, 8)}</span>
                        </div>
                        <h2 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight transition-colors">{currentDecision.vrm}</h2>
                    </div>
                    <div className="text-right text-sm text-gray-500 dark:text-gray-400 space-y-1 transition-colors">
                        <div className="flex items-center justify-end gap-1">
                            <MapPin className="w-4 h-4" /> {currentDecision.siteId}
                        </div>
                        <div className="flex items-center justify-end gap-1">
                            <Clock className="w-4 h-4" /> {new Date(currentDecision.timestamp).toLocaleString()}
                        </div>
                    </div>
                </div>

                {/* Evidence Images */}
                <div className="grid grid-cols-2 gap-1 bg-gray-900 aspect-[2/1]">
                    <div className="relative group overflow-hidden">
                        {contextImage ? (
                            <img src={contextImage} alt="Context" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-500">No Context Image</div>
                        )}
                        <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">Overview</div>
                    </div>
                    <div className="relative group overflow-hidden">
                        {plateImage ? (
                            <img src={plateImage} alt="Plate" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-500 bg-gray-800">
                                <Car className="w-12 h-12 text-gray-600" />
                            </div>
                        )}
                        <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">ANPR Crop</div>
                    </div>
                </div>

                {/* Details */}
                <div className="p-6 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 transition-colors">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">Violation Details</h4>
                    <div className="flex gap-4">
                        <div className="flex-1 bg-white dark:bg-slate-900 p-4 rounded-lg border border-gray-200 dark:border-slate-800 transition-colors">
                            <span className="block text-xs text-gray-500 dark:text-gray-500 mb-1">Reason</span>
                            <span className="font-semibold text-gray-900 dark:text-white transition-colors">{currentDecision.reason}</span>
                        </div>
                        <div className="flex-1 bg-white dark:bg-slate-900 p-4 rounded-lg border border-gray-200 dark:border-slate-800 transition-colors">
                            <span className="block text-xs text-gray-500 dark:text-gray-500 mb-1">AI Confidence</span>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-blue-600 dark:bg-blue-500 rounded-full"
                                        style={{ width: `${currentDecision.confidenceScore * 100}%` }}
                                    />
                                </div>
                                <span className="font-bold text-gray-900 dark:text-white">{(currentDecision.confidenceScore * 100).toFixed(0)}%</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="p-6 flex gap-4 bg-white dark:bg-slate-900 transition-colors">
                    <button
                        onClick={() => handleReview('REJECT')}
                        className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-gray-200 dark:border-slate-800 text-gray-700 dark:text-gray-300 font-bold hover:bg-gray-50 dark:hover:bg-slate-800 hover:border-gray-300 dark:hover:border-slate-700 transition-all active:scale-95"
                    >
                        <X className="w-6 h-6" />
                        Reject False Positive
                    </button>
                    <button
                        onClick={() => handleReview('APPROVE')}
                        className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl bg-blue-600 dark:bg-blue-500 text-white font-bold hover:bg-blue-700 dark:hover:bg-blue-600 shadow-lg shadow-blue-200 dark:shadow-none transition-all active:scale-95"
                    >
                        <Check className="w-6 h-6" />
                        Approve Violation
                    </button>
                </div>
            </div>

            <div className="text-center mt-6 text-sm text-gray-400">
                {queue.length} items remaining in queue
            </div>
        </div>
    );
}
