import { useState, useEffect } from 'react';
import { CreditCard, CheckCircle, XCircle, DollarSign, Search, RefreshCw, AlertCircle, Filter } from 'lucide-react';

const API_BASE = 'http://localhost:3000';

interface Payment {
    id: string;
    vrm: string;
    siteId: string;
    amount: number;
    startTime: string;
    expiryTime: string;
    source: string;
    externalReference?: string;
}

interface PaymentStatus {
    vrm: string;
    siteId: string;
    hasActivePayment: boolean;
    activePayments: Payment[];
    nextExpiry?: string;
    totalPayments: number;
}

interface PaymentStatistics {
    totalPayments: number;
    activePayments: number;
    expiredPayments: number;
    totalRevenue: number;
    averageAmount: number;
}

interface ValidationResult {
    valid: boolean;
    payment?: Payment;
    reason?: string;
    expiresAt?: string;
    remainingMinutes?: number;
}

export function PaymentTrackingView() {
    const [selectedSite, setSelectedSite] = useState<string>('');
    const [sites, setSites] = useState<Array<{ id: string; name: string }>>([]);
    const [searchVrm, setSearchVrm] = useState('');
    const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
    const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
    const [activePayments, setActivePayments] = useState<Payment[]>([]);
    const [statistics, setStatistics] = useState<PaymentStatistics | null>(null);
    const [expiringPayments, setExpiringPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<'status' | 'active' | 'statistics' | 'validate'>('status');

    useEffect(() => {
        loadSites();
    }, []);

    useEffect(() => {
        if (selectedSite) {
            loadActivePayments();
            loadStatistics();
            loadExpiringPayments();
        }
    }, [selectedSite]);

    const loadSites = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/sites`);
            if (response.ok) {
                const data = await response.json();
                setSites(data);
                if (data.length > 0 && !selectedSite) {
                    setSelectedSite(data[0].id);
                }
            }
        } catch (err) {
            console.error('Failed to load sites:', err);
        }
    };

    const loadActivePayments = async () => {
        if (!selectedSite) return;
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE}/api/payment/active/${selectedSite}`);
            if (response.ok) {
                const data = await response.json();
                setActivePayments(data);
            }
        } catch (err) {
            console.error('Failed to load active payments:', err);
        } finally {
            setLoading(false);
        }
    };

    const loadStatistics = async () => {
        if (!selectedSite) return;
        try {
            const response = await fetch(`${API_BASE}/api/payment/statistics/${selectedSite}`);
            if (response.ok) {
                const data = await response.json();
                setStatistics(data);
            }
        } catch (err) {
            console.error('Failed to load statistics:', err);
        }
    };

    const loadExpiringPayments = async () => {
        if (!selectedSite) return;
        try {
            const response = await fetch(`${API_BASE}/api/payment/expiring/${selectedSite}?minutes=30`);
            if (response.ok) {
                const data = await response.json();
                setExpiringPayments(data);
            }
        } catch (err) {
            console.error('Failed to load expiring payments:', err);
        }
    };

    const searchPaymentStatus = async () => {
        if (!searchVrm.trim() || !selectedSite) {
            setError('Please enter a VRM and select a site');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE}/api/payment/status/${selectedSite}/${encodeURIComponent(searchVrm.toUpperCase().replace(/\s/g, ''))}`);
            if (!response.ok) {
                throw new Error('Failed to fetch payment status');
            }
            const data = await response.json();
            setPaymentStatus(data);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch payment status');
            setPaymentStatus(null);
        } finally {
            setLoading(false);
        }
    };

    const validatePayment = async () => {
        if (!searchVrm.trim() || !selectedSite) {
            setError('Please enter a VRM and select a site');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE}/api/payment/validate/${selectedSite}/${encodeURIComponent(searchVrm.toUpperCase().replace(/\s/g, ''))}`);
            if (!response.ok) {
                throw new Error('Failed to validate payment');
            }
            const data = await response.json();
            setValidationResult(data);
        } catch (err: any) {
            setError(err.message || 'Failed to validate payment');
            setValidationResult(null);
        } finally {
            setLoading(false);
        }
    };

    const formatTimestamp = (timestamp: string) => {
        return new Date(timestamp).toLocaleString();
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
    };

    const getTimeRemaining = (expiryTime: string) => {
        const expiry = new Date(expiryTime);
        const now = new Date();
        const diff = expiry.getTime() - now.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        
        if (minutes < 0) return 'Expired';
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        return `${minutes}m`;
    };

    return (
        <div className="space-y-6">
            {/* Site Selector */}
            <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-800 transition-colors">
                <div className="flex items-center gap-4 mb-4">
                    <Filter className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Site Selection</h3>
                </div>
                <select
                    value={selectedSite}
                    onChange={(e) => setSelectedSite(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                >
                    <option value="">Select a site...</option>
                    {sites.map((site) => (
                        <option key={site.id} value={site.id}>
                            {site.name}
                        </option>
                    ))}
                </select>
            </div>

            {/* View Tabs */}
            <div className="bg-white dark:bg-slate-900 rounded-xl p-2 shadow-sm border border-gray-200 dark:border-slate-800 transition-colors">
                <div className="flex gap-2">
                    <button
                        onClick={() => setView('status')}
                        className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                            view === 'status' ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                        }`}
                    >
                        Payment Status
                    </button>
                    <button
                        onClick={() => setView('validate')}
                        className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                            view === 'validate' ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                        }`}
                    >
                        Validate Access
                    </button>
                    <button
                        onClick={() => setView('active')}
                        className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                            view === 'active' ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                        }`}
                    >
                        Active Payments
                    </button>
                    <button
                        onClick={() => setView('statistics')}
                        className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                            view === 'statistics' ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                        }`}
                    >
                        Statistics
                    </button>
                </div>
            </div>

            {/* Payment Status View */}
            {view === 'status' && (
                <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-800 transition-colors">
                    <div className="flex items-center gap-4 mb-4">
                        <Search className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Payment Status Lookup</h3>
                    </div>
                    <div className="flex gap-4 mb-4">
                        <input
                            type="text"
                            value={searchVrm}
                            onChange={(e) => setSearchVrm(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && searchPaymentStatus()}
                            placeholder="Enter VRM (e.g., ABC123)"
                            className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                        />
                        <button
                            onClick={searchPaymentStatus}
                            disabled={loading || !selectedSite}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    Searching...
                                </>
                            ) : (
                                <>
                                    <Search className="w-4 h-4" />
                                    Search
                                </>
                            )}
                        </button>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 rounded-lg text-red-700 dark:text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {paymentStatus && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-lg">
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">VRM</p>
                                    <p className="text-lg font-semibold font-mono text-gray-900 dark:text-white">{paymentStatus.vrm}</p>
                                </div>
                                <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-lg">
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Status</p>
                                    <div className="flex items-center gap-2">
                                        {paymentStatus.hasActivePayment ? (
                                            <>
                                                <CheckCircle className="w-5 h-5 text-green-500" />
                                                <span className="text-lg font-semibold text-green-600 dark:text-green-400">Active</span>
                                            </>
                                        ) : (
                                            <>
                                                <XCircle className="w-5 h-5 text-red-500" />
                                                <span className="text-lg font-semibold text-red-600 dark:text-red-400">No Payment</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-lg">
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Payments</p>
                                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{paymentStatus.totalPayments}</p>
                                </div>
                            </div>

                            {paymentStatus.activePayments.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Active Payments</h4>
                                    <div className="space-y-2">
                                        {paymentStatus.activePayments.map((payment) => (
                                            <div key={payment.id} className="p-4 border border-gray-200 dark:border-slate-700 rounded-lg">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <CreditCard className="w-4 h-4 text-gray-400" />
                                                        <span className="font-mono text-sm text-gray-900 dark:text-white">{payment.vrm}</span>
                                                    </div>
                                                    <span className="text-lg font-semibold text-gray-900 dark:text-white">{formatCurrency(payment.amount)}</span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400">
                                                    <div>
                                                        <span className="font-medium">Start:</span> {formatTimestamp(payment.startTime)}
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">Expires:</span> {formatTimestamp(payment.expiryTime)}
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">Source:</span> {payment.source}
                                                    </div>
                                                    <div>
                                                        <span className="font-medium">Remaining:</span> {getTimeRemaining(payment.expiryTime)}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Validate Access View */}
            {view === 'validate' && (
                <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-800 transition-colors">
                    <div className="flex items-center gap-4 mb-4">
                        <CheckCircle className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Real-Time Payment Validation</h3>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        Check if a vehicle has valid payment for barrier control (real-time validation)
                    </p>
                    <div className="flex gap-4 mb-4">
                        <input
                            type="text"
                            value={searchVrm}
                            onChange={(e) => setSearchVrm(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && validatePayment()}
                            placeholder="Enter VRM (e.g., ABC123)"
                            className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                        />
                        <button
                            onClick={validatePayment}
                            disabled={loading || !selectedSite}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    Validating...
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-4 h-4" />
                                    Validate
                                </>
                            )}
                        </button>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 rounded-lg text-red-700 dark:text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {validationResult && (
                        <div className={`p-6 rounded-lg border-2 ${
                            validationResult.valid
                                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-900/30'
                                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/30'
                        }`}>
                            <div className="flex items-center gap-3 mb-4">
                                {validationResult.valid ? (
                                    <>
                                        <CheckCircle className="w-8 h-8 text-green-500" />
                                        <div>
                                            <h4 className="text-lg font-semibold text-green-700 dark:text-green-400">Access Granted</h4>
                                            <p className="text-sm text-green-600 dark:text-green-500">Vehicle has valid payment</p>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="w-8 h-8 text-red-500" />
                                        <div>
                                            <h4 className="text-lg font-semibold text-red-700 dark:text-red-400">Access Denied</h4>
                                            <p className="text-sm text-red-600 dark:text-red-500">{validationResult.reason}</p>
                                        </div>
                                    </>
                                )}
                            </div>

                            {validationResult.valid && validationResult.payment && (
                                <div className="space-y-2 text-sm">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <span className="font-medium text-gray-700 dark:text-gray-300">Amount:</span>
                                            <span className="ml-2 text-gray-900 dark:text-white">{formatCurrency(validationResult.payment.amount)}</span>
                                        </div>
                                        <div>
                                            <span className="font-medium text-gray-700 dark:text-gray-300">Source:</span>
                                            <span className="ml-2 text-gray-900 dark:text-white">{validationResult.payment.source}</span>
                                        </div>
                                        <div>
                                            <span className="font-medium text-gray-700 dark:text-gray-300">Expires:</span>
                                            <span className="ml-2 text-gray-900 dark:text-white">{formatTimestamp(validationResult.expiresAt!)}</span>
                                        </div>
                                        <div>
                                            <span className="font-medium text-gray-700 dark:text-gray-300">Remaining:</span>
                                            <span className="ml-2 text-gray-900 dark:text-white">{validationResult.remainingMinutes} minutes</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Active Payments View */}
            {view === 'active' && selectedSite && (
                <div className="space-y-4">
                    <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-800 transition-colors">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <CreditCard className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Active Payments</h3>
                            </div>
                            <button
                                onClick={loadActivePayments}
                                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </div>
                        {loading ? (
                            <div className="text-center py-8">
                                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                            </div>
                        ) : activePayments.length > 0 ? (
                            <div className="space-y-2">
                                {activePayments.map((payment) => (
                                    <div key={payment.id} className="p-4 border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">{payment.vrm}</span>
                                                <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded">
                                                    {payment.source}
                                                </span>
                                            </div>
                                            <span className="text-lg font-semibold text-gray-900 dark:text-white">{formatCurrency(payment.amount)}</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400">
                                            <div>
                                                <span className="font-medium">Expires:</span> {formatTimestamp(payment.expiryTime)}
                                            </div>
                                            <div>
                                                <span className="font-medium">Remaining:</span> {getTimeRemaining(payment.expiryTime)}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                No active payments found
                            </div>
                        )}
                    </div>

                    {expiringPayments.length > 0 && (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-6 shadow-sm border border-yellow-200 dark:border-yellow-900/30 transition-colors">
                            <div className="flex items-center gap-2 mb-4">
                                <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                                <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-300">Expiring Soon (Next 30 Minutes)</h3>
                            </div>
                            <div className="space-y-2">
                                {expiringPayments.map((payment) => (
                                    <div key={payment.id} className="p-3 bg-white dark:bg-slate-800 rounded-lg">
                                        <div className="flex items-center justify-between">
                                            <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">{payment.vrm}</span>
                                            <span className="text-sm text-gray-600 dark:text-gray-400">Expires in {getTimeRemaining(payment.expiryTime)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Statistics View */}
            {view === 'statistics' && selectedSite && statistics && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-800 transition-colors">
                        <div className="flex items-center gap-3 mb-2">
                            <CreditCard className="w-5 h-5 text-blue-500" />
                            <p className="text-sm text-gray-500 dark:text-gray-400">Total Payments</p>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{statistics.totalPayments}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-800 transition-colors">
                        <div className="flex items-center gap-3 mb-2">
                            <CheckCircle className="w-5 h-5 text-green-500" />
                            <p className="text-sm text-gray-500 dark:text-gray-400">Active</p>
                        </div>
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">{statistics.activePayments}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-800 transition-colors">
                        <div className="flex items-center gap-3 mb-2">
                            <XCircle className="w-5 h-5 text-red-500" />
                            <p className="text-sm text-gray-500 dark:text-gray-400">Expired</p>
                        </div>
                        <p className="text-2xl font-bold text-red-600 dark:text-red-400">{statistics.expiredPayments}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-800 transition-colors">
                        <div className="flex items-center gap-3 mb-2">
                            <DollarSign className="w-5 h-5 text-green-500" />
                            <p className="text-sm text-gray-500 dark:text-gray-400">Total Revenue</p>
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(statistics.totalRevenue)}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Avg: {formatCurrency(statistics.averageAmount)}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
