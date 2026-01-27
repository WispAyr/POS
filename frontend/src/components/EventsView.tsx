import { useState, useEffect, useCallback } from 'react';
import { EventCard } from './EventCard';
import { Search, Filter, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';

interface Site {
    id: string;
    name: string;
}

interface EventImage {
    url: string;
    type: 'plate' | 'overview';
}

interface EventData {
    id: string;
    vrm: string;
    siteId: string;
    timestamp: string;
    direction: string;
    cameraIds: string;
    images?: EventImage[];
}

interface EventsResponse {
    data: EventData[];
    meta: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

const API_BASE = 'http://localhost:3001';

export function EventsView() {
    const [events, setEvents] = useState<EventData[]>([]);
    const [sites, setSites] = useState<Site[]>([]);
    const [loading, setLoading] = useState(true);
    const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });

    // Filters
    const [siteFilter, setSiteFilter] = useState('');
    const [vrmSearch, setVrmSearch] = useState('');
    const [debouncedVrm, setDebouncedVrm] = useState('');

    // Debounce VRM search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedVrm(vrmSearch), 300);
        return () => clearTimeout(timer);
    }, [vrmSearch]);

    // Fetch sites for filter
    useEffect(() => {
        fetch(`${API_BASE}/api/sites`)
            .then(res => res.json())
            .then(data => {
                // Only include sites with camera configs (active sites)
                const activeSites = data.filter((s: Site & { config?: { cameras?: unknown[] } }) =>
                    s.config?.cameras && s.config.cameras.length > 0
                );
                setSites(activeSites);
            })
            .catch(console.error);
    }, []);

    // Fetch events
    const fetchEvents = useCallback(async (page = 1) => {
        setLoading(true);
        try {
            const hideUnknown = localStorage.getItem('hideUnknownPlates') === 'true';
            const params = new URLSearchParams({
                page: String(page),
                limit: '20',
            });
            if (siteFilter) params.set('siteId', siteFilter);
            if (debouncedVrm) params.set('vrm', debouncedVrm);
            if (hideUnknown) params.set('hideUnknown', 'true');

            const res = await fetch(`${API_BASE}/api/events?${params}`);
            const json: EventsResponse = await res.json();

            setEvents(json.data);
            setMeta(json.meta);
        } catch (err) {
            console.error('Failed to fetch events:', err);
        } finally {
            setLoading(false);
        }
    }, [siteFilter, debouncedVrm]);

    useEffect(() => {
        fetchEvents(1);
    }, [fetchEvents]);

    const goToPage = (page: number) => {
        if (page >= 1 && page <= meta.totalPages) {
            fetchEvents(page);
        }
    };

    return (
        <div className="space-y-6">
            {/* Filters Bar */}
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 p-4 transition-colors">
                <div className="flex flex-wrap gap-4 items-center">
                    {/* Site Filter */}
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-gray-400" />
                        <select
                            value={siteFilter}
                            onChange={(e) => setSiteFilter(e.target.value)}
                            className="px-3 py-2 border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-gray-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none min-w-[180px] transition-colors"
                        >
                            <option value="">All Sites</option>
                            {sites.map(site => (
                                <option key={site.id} value={site.id}>{site.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* VRM Search */}
                    <div className="flex items-center gap-2 flex-1 max-w-md">
                        <Search className="w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search VRM..."
                            value={vrmSearch}
                            onChange={(e) => setVrmSearch(e.target.value.toUpperCase())}
                            className="px-3 py-2 border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-gray-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none w-full font-mono transition-colors"
                        />
                    </div>

                    {/* Refresh */}
                    <button
                        onClick={() => fetchEvents(meta.page)}
                        className="p-2 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>

                    {/* Stats */}
                    <div className="ml-auto text-sm text-gray-500 dark:text-gray-400">
                        {meta.total.toLocaleString()} events
                    </div>
                </div>
            </div>

            {/* Events Grid */}
            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="bg-gray-100 dark:bg-slate-900 rounded-xl h-64 animate-pulse border border-gray-200 dark:border-slate-800" />
                    ))}
                </div>
            ) : events.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 p-12 text-center transition-colors">
                    <p className="text-gray-500 dark:text-gray-400">No events found</p>
                    {(siteFilter || debouncedVrm) && (
                        <button
                            onClick={() => { setSiteFilter(''); setVrmSearch(''); }}
                            className="mt-2 text-blue-600 dark:text-blue-400 hover:underline text-sm"
                        >
                            Clear filters
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {events.map(event => (
                        <EventCard key={event.id} {...event} />
                    ))}
                </div>
            )}

            {/* Pagination */}
            {meta.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <button
                        onClick={() => goToPage(meta.page - 1)}
                        disabled={meta.page <= 1}
                        className="p-2 rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>

                    <div className="flex items-center gap-1">
                        {[...Array(Math.min(5, meta.totalPages))].map((_, i) => {
                            let pageNum: number;
                            if (meta.totalPages <= 5) {
                                pageNum = i + 1;
                            } else if (meta.page <= 3) {
                                pageNum = i + 1;
                            } else if (meta.page >= meta.totalPages - 2) {
                                pageNum = meta.totalPages - 4 + i;
                            } else {
                                pageNum = meta.page - 2 + i;
                            }

                            return (
                                <button
                                    key={pageNum}
                                    onClick={() => goToPage(pageNum)}
                                    className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${pageNum === meta.page
                                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 dark:shadow-none'
                                        : 'bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                                        }`}
                                >
                                    {pageNum}
                                </button>
                            );
                        })}
                    </div>

                    <button
                        onClick={() => goToPage(meta.page + 1)}
                        disabled={meta.page >= meta.totalPages}
                        className="p-2 rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>
                </div>
            )}
        </div>
    );
}
