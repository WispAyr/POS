import { useState, useEffect } from 'react';
import { Package, GitBranch, Calendar, CheckCircle, XCircle, Clock, AlertCircle, Download, RefreshCw } from 'lucide-react';

const API_BASE = 'http://localhost:3001';

interface VersionInfo {
    backend?: string;
    frontend?: string;
    gitCommit?: string;
    gitBranch?: string;
    gitTag?: string;
    buildNumber?: string;
    buildId?: string;
    timestamp?: string;
}

interface BuildAudit {
    id: string;
    buildId: string;
    buildType: string;
    status: string;
    version: VersionInfo;
    dependencies?: Array<{ name: string; version: string; type: string }>;
    metadata?: any;
    actor: string;
    actorType?: string;
    ciWorkflow?: string;
    ciRunId?: string;
    artifacts?: string[];
    testResults?: {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
        coverage?: {
            lines: number;
            branches: number;
            functions: number;
            statements: number;
        };
    };
    timestamp: string;
    completedAt?: string;
    duration?: number;
    errorMessage?: string;
}

export function BuildAuditView() {
    const [version, setVersion] = useState<VersionInfo | null>(null);
    const [buildHistory, setBuildHistory] = useState<BuildAudit[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<{ buildType?: string; status?: string }>({});

    useEffect(() => {
        loadVersion();
        loadBuildHistory();
    }, [filter]);

    const loadVersion = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/build/version`);
            if (response.ok) {
                const data = await response.json();
                setVersion(data);
            }
        } catch (err) {
            console.error('Failed to load version:', err);
        }
    };

    const loadBuildHistory = async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (filter.buildType) params.append('buildType', filter.buildType);
            if (filter.status) params.append('status', filter.status);
            params.append('limit', '20');

            const response = await fetch(`${API_BASE}/api/build/history?${params}`);
            if (!response.ok) {
                throw new Error('Failed to fetch build history');
            }
            const data = await response.json();
            setBuildHistory(data);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch build history');
        } finally {
            setLoading(false);
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'SUCCESS':
                return <CheckCircle className="w-5 h-5 text-green-500" />;
            case 'FAILED':
                return <XCircle className="w-5 h-5 text-red-500" />;
            case 'CANCELLED':
                return <AlertCircle className="w-5 h-5 text-yellow-500" />;
            default:
                return <Clock className="w-5 h-5 text-blue-500" />;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'SUCCESS':
                return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
            case 'FAILED':
                return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
            case 'CANCELLED':
                return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
            default:
                return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
        }
    };

    const formatDuration = (ms?: number) => {
        if (!ms) return 'N/A';
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        return `${(ms / 60000).toFixed(1)}m`;
    };

    const formatTimestamp = (timestamp: string) => {
        const date = new Date(timestamp);
        return date.toLocaleString();
    };

    const formatCommit = (commit?: string) => {
        if (!commit) return 'N/A';
        return commit.substring(0, 7);
    };

    return (
        <div className="space-y-6">
            {/* Version Information */}
            {version && (
                <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-800 transition-colors">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <Package className="w-5 h-5" />
                            Current Version
                        </h3>
                        <button
                            onClick={loadVersion}
                            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Backend</p>
                            <p className="text-lg font-semibold text-gray-900 dark:text-white">{version.backend || 'N/A'}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Frontend</p>
                            <p className="text-lg font-semibold text-gray-900 dark:text-white">{version.frontend || 'N/A'}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Build ID</p>
                            <p className="text-sm font-mono text-gray-900 dark:text-white">{version.buildId || 'N/A'}</p>
                        </div>
                        {version.gitCommit && (
                            <div>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
                                    <GitBranch className="w-4 h-4" />
                                    Commit
                                </p>
                                <p className="text-sm font-mono text-gray-900 dark:text-white">{formatCommit(version.gitCommit)}</p>
                            </div>
                        )}
                        {version.gitBranch && (
                            <div>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Branch</p>
                                <p className="text-sm text-gray-900 dark:text-white">{version.gitBranch}</p>
                            </div>
                        )}
                        {version.gitTag && (
                            <div>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Tag</p>
                                <p className="text-sm text-gray-900 dark:text-white">{version.gitTag}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="bg-white dark:bg-slate-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-800 transition-colors">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Build Type
                        </label>
                        <select
                            value={filter.buildType || ''}
                            onChange={(e) => setFilter({ ...filter, buildType: e.target.value || undefined })}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                        >
                            <option value="">All Types</option>
                            <option value="LOCAL">Local</option>
                            <option value="CI">CI</option>
                            <option value="CD">CD</option>
                            <option value="DEPLOYMENT">Deployment</option>
                            <option value="TEST">Test</option>
                            <option value="LINT">Lint</option>
                        </select>
                    </div>
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Status
                        </label>
                        <select
                            value={filter.status || ''}
                            onChange={(e) => setFilter({ ...filter, status: e.target.value || undefined })}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                        >
                            <option value="">All Statuses</option>
                            <option value="SUCCESS">Success</option>
                            <option value="FAILED">Failed</option>
                            <option value="CANCELLED">Cancelled</option>
                            <option value="STARTED">Started</option>
                            <option value="IN_PROGRESS">In Progress</option>
                        </select>
                    </div>
                    <div className="flex items-end">
                        <button
                            onClick={loadBuildHistory}
                            disabled={loading}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    Loading...
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="w-4 h-4" />
                                    Refresh
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Build History */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 rounded-xl p-4 text-red-700 dark:text-red-400">
                    {error}
                </div>
            )}

            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 transition-colors">
                <div className="p-6 border-b border-gray-200 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Build History ({buildHistory.length})</h3>
                        <button
                            onClick={() => {
                                const data = JSON.stringify(buildHistory, null, 2);
                                const blob = new Blob([data], { type: 'application/json' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `build-history-${Date.now()}.json`;
                                a.click();
                            }}
                            className="flex items-center gap-2 px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                        >
                            <Download className="w-4 h-4" />
                            Export JSON
                        </button>
                    </div>
                </div>
                <div className="divide-y divide-gray-200 dark:divide-slate-800">
                    {buildHistory.map((build) => (
                        <div key={build.id} className="p-6 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    {getStatusIcon(build.status)}
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(build.status)}`}>
                                                {build.status}
                                            </span>
                                            <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                                {build.buildType}
                                            </span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                                {build.buildId}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                                            <span className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {formatTimestamp(build.timestamp)}
                                            </span>
                                            {build.duration && (
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {formatDuration(build.duration)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Version</p>
                                    <div className="text-sm text-gray-900 dark:text-white">
                                        <p>Backend: {build.version.backend || 'N/A'}</p>
                                        <p>Frontend: {build.version.frontend || 'N/A'}</p>
                                        {build.version.gitCommit && (
                                            <p className="font-mono text-xs">Commit: {formatCommit(build.version.gitCommit)}</p>
                                        )}
                                    </div>
                                </div>
                                {build.testResults && (
                                    <div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Test Results</p>
                                        <div className="text-sm text-gray-900 dark:text-white">
                                            <p>Passed: {build.testResults.passed} / {build.testResults.total}</p>
                                            {build.testResults.coverage && (
                                                <p>Coverage: {build.testResults.coverage.lines.toFixed(1)}%</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {build.errorMessage && (
                                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 rounded-lg">
                                    <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Error</p>
                                    <p className="text-xs text-red-600 dark:text-red-500">{build.errorMessage}</p>
                                </div>
                            )}

                            {build.artifacts && build.artifacts.length > 0 && (
                                <div className="mt-4">
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Artifacts</p>
                                    <div className="flex flex-wrap gap-2">
                                        {build.artifacts.map((artifact, idx) => (
                                            <span key={idx} className="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-800 rounded text-gray-700 dark:text-gray-300">
                                                {artifact}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {build.ciWorkflow && (
                                <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                                    CI: {build.ciWorkflow} (Run: {build.ciRunId})
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {!loading && buildHistory.length === 0 && !error && (
                <div className="bg-white dark:bg-slate-900 rounded-xl p-12 text-center border border-gray-200 dark:border-slate-800 transition-colors">
                    <Package className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">No build history found.</p>
                </div>
            )}
        </div>
    );
}
