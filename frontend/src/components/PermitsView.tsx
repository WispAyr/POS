import { useState, useEffect } from 'react';
import { Search, Plus, Trash2, ShieldCheck, ShieldAlert, Calendar, MapPin, X, Loader2, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';

interface Permit {
    id: string;
    siteId: string | null;
    vrm: string;
    type: string;
    startDate: string;
    endDate: string | null;
    active: boolean;
}

interface Site {
    id: string;
    name: string;
}

const PermitTableHeader = () => (
    <thead>
        <tr className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800">
            <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">VRM</th>
            <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Site</th>
            <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
            <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Expires</th>
            <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
            <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Actions</th>
        </tr>
    </thead>
);

const PermitRow = ({ permit, onDelete, sites }: { permit: Permit; onDelete: (id: string) => void; sites: Site[] }) => (
    <tr className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
        <td className="px-6 py-4">
            <span className="font-mono font-bold text-gray-900 dark:text-white">{permit.vrm}</span>
        </td>
        <td className="px-6 py-4">
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <MapPin className="w-3 h-3 text-gray-400" />
                {permit.siteId ? sites.find(s => s.id === permit.siteId)?.name || 'Unknown' : 'Global (All Sites)'}
            </div>
        </td>
        <td className="px-6 py-4">
            <span className="px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded text-xs font-bold">
                {permit.type}
            </span>
        </td>
        <td className="px-6 py-4">
            <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
                <Calendar className="w-3 h-3 text-gray-400" />
                {permit.endDate ? new Date(permit.endDate).toLocaleDateString() : 'Indefinite'}
            </div>
        </td>
        <td className="px-6 py-4">
            {permit.active && (!permit.endDate || new Date(permit.endDate) > new Date()) ? (
                <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 text-xs font-bold">
                    <ShieldCheck className="w-3 h-3" /> Active
                </span>
            ) : (
                <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-bold">
                    <ShieldAlert className="w-3 h-3" /> Expired
                </span>
            )}
        </td>
        <td className="px-6 py-4 text-right">
            <button
                onClick={() => onDelete(permit.id)}
                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
            >
                <Trash2 className="w-4 h-4" />
            </button>
        </td>
    </tr>
);
const API_BASE = 'http://localhost:3001';

export function PermitsView() {
    const [permits, setPermits] = useState<Permit[]>([]);
    const [sites, setSites] = useState<Site[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

    const toggleCollapse = (siteId: string) => {
        setCollapsed(prev => ({ ...prev, [siteId]: !prev[siteId] }));
    };

    // Form state
    const [newPermit, setNewPermit] = useState({
        vrm: '',
        siteId: '',
        type: 'WHITELIST',
        endDate: '',
    });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [permitsRes, sitesRes] = await Promise.all([
                fetch(`${API_BASE}/api/permits`),
                fetch(`${API_BASE}/api/sites`)
            ]);
            setPermits(await permitsRes.json());
            setSites(await sitesRes.json());
        } catch (err) {
            console.error('Failed to fetch permits', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const res = await fetch(`${API_BASE}/api/permits`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vrm: newPermit.vrm,
                    siteId: newPermit.siteId || null,
                    type: newPermit.type,
                    endDate: newPermit.endDate || null,
                })
            });
            if (res.ok) {
                setShowAddModal(false);
                setNewPermit({ vrm: '', siteId: '', type: 'WHITELIST', endDate: '' });
                fetchData();
            }
        } catch (err) {
            console.error('Failed to add permit', err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this permit?')) return;
        try {
            await fetch(`${API_BASE}/api/permits/${id}`, { method: 'DELETE' });
            setPermits(prev => prev.filter(p => p.id !== id));
        } catch (err) {
            console.error('Failed to delete permit', err);
        }
    };

    const filteredPermits = permits.filter(p =>
        p.vrm.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6">
            {/* Action Bar */}
            <div className="flex flex-wrap gap-4 items-center justify-between">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search VRM..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value.toUpperCase())}
                        className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
                    />
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    Add New Permit
                </button>
            </div>

            {/* Permits Table */}
            <div className="space-y-8">
                {/* Global Permits (Error State if unexpected) */}
                {filteredPermits.filter(p => !p.siteId).length > 0 && (
                    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-red-200 dark:border-red-900/30 overflow-hidden ring-1 ring-red-100 dark:ring-red-900/20">
                        <div className="bg-red-50 dark:bg-red-900/10 px-6 py-3 border-b border-red-100 dark:border-red-900/20 flex items-center justify-between">
                            <h3 className="font-semibold text-red-900 dark:text-red-300 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" />
                                Unassigned / Global Permits
                            </h3>
                            <span className="text-xs font-medium px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full">
                                {filteredPermits.filter(p => !p.siteId).length} Issues
                            </span>
                        </div>
                        <div className="px-6 py-2 bg-red-50/50 dark:bg-red-900/5 border-b border-red-100 dark:border-red-900/20 text-xs text-red-600 dark:text-red-400">
                            These permits have no Site ID assigned. This may imply a configuration error in Monday.com (check Site ID column).
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <PermitTableHeader />
                                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                                    {filteredPermits.filter(p => !p.siteId).map(permit => (
                                        <PermitRow key={permit.id} permit={permit} onDelete={handleDelete} sites={sites} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Site Specific Permits */}
                {Object.values(filteredPermits.reduce((acc, permit) => {
                    if (permit.siteId) {
                        if (!acc[permit.siteId]) acc[permit.siteId] = [];
                        acc[permit.siteId].push(permit);
                    }
                    return acc;
                }, {} as Record<string, Permit[]>)).sort((a, b) => {
                    const siteA = sites.find(s => s.id === a[0].siteId)?.name || '';
                    const siteB = sites.find(s => s.id === b[0].siteId)?.name || '';
                    return siteA.localeCompare(siteB);
                }).map(sitePermits => {
                    const siteId = sitePermits[0].siteId!;
                    const siteName = sites.find(s => s.id === siteId)?.name || siteId;
                    const isCollapsed = collapsed[siteId];

                    return (
                        <div key={siteId} className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
                            <button
                                onClick={() => toggleCollapse(siteId)}
                                className="w-full bg-gray-50 dark:bg-slate-800/50 px-6 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                            >
                                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-gray-400" />
                                    {siteName}
                                </h3>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs bg-white dark:bg-slate-900 px-2 py-1 rounded border border-gray-200 dark:border-slate-700 text-gray-500">
                                        {sitePermits.length}
                                    </span>
                                    {isCollapsed ? <ChevronRight className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                                </div>
                            </button>

                            {!isCollapsed && (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <PermitTableHeader />
                                        <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                                            {sitePermits.map(permit => (
                                                <PermitRow key={permit.id} permit={permit} onDelete={handleDelete} sites={sites} />
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                })}

                {filteredPermits.length === 0 && !loading && (
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                        No permits found matching your search.
                    </div>
                )}
            </div>

            {/* Add Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)}></div>
                    <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 border border-gray-200 dark:border-slate-800">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Add New Permit</h3>
                            <button onClick={() => setShowAddModal(false)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleAdd} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">VRM</label>
                                <input
                                    required
                                    type="text"
                                    value={newPermit.vrm}
                                    onChange={e => setNewPermit(p => ({ ...p, vrm: e.target.value.toUpperCase() }))}
                                    className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none dark:text-white font-mono"
                                    placeholder="e.g. AB12 CDE"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Site Scope</label>
                                <select
                                    value={newPermit.siteId}
                                    onChange={e => setNewPermit(p => ({ ...p, siteId: e.target.value }))}
                                    className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                                >
                                    <option value="">Global (All Sites)</option>
                                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Permit Type</label>
                                    <select
                                        value={newPermit.type}
                                        onChange={e => setNewPermit(p => ({ ...p, type: e.target.value }))}
                                        className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                                    >
                                        <option value="WHITELIST">Whitelist</option>
                                        <option value="STAFF">Staff</option>
                                        <option value="RESIDENT">Resident</option>
                                        <option value="CONTRACTOR">Contractor</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Expiry Date</label>
                                    <input
                                        type="date"
                                        value={newPermit.endDate}
                                        onChange={e => setNewPermit(p => ({ ...p, endDate: e.target.value }))}
                                        className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                                    />
                                    <p className="text-[10px] text-gray-400 mt-1">Leave empty for indefinite</p>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isSaving}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-200 dark:shadow-none flex items-center justify-center gap-2"
                            >
                                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                                Create Permit
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
