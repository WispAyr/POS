import { useState, useEffect } from 'react';
import { RefreshCw, Database, Cloud, CheckCircle, XCircle, Clock, Loader2, Server, HardDrive, Download, Upload, FolderSync } from 'lucide-react';

interface SyncStatus {
    isRunning: boolean;
    lastRun?: string;
    message?: string;
    error?: string;
    progress?: number;
}

interface AnprSyncConfig {
    enabled: boolean;
    remoteHost: string;
    remoteUser: string;
    remotePath: string;
    localPath: string;
    sshKeyPath?: string;
    password?: string;
    cronExpression?: string;
}

const API_BASE = '';

export function SettingsView() {
    const [anprSync, setAnprSync] = useState<SyncStatus>({ isRunning: false });
    const [mondaySync, setMondaySync] = useState<SyncStatus>({ isRunning: false });
    const [mondayPermitsSync, setMondayPermitsSync] = useState<SyncStatus>({ isRunning: false });
    const [cameraSync, setCameraSync] = useState<SyncStatus>({ isRunning: false });
    const [remoteSync, setRemoteSync] = useState<SyncStatus>({ isRunning: false });
    const [folderImport, setFolderImport] = useState<SyncStatus>({ isRunning: false });
    const [anprHours, setAnprHours] = useState(24);
    const [syncLogs, setSyncLogs] = useState<{ time: string; msg: string; type: 'info' | 'error' | 'success' }[]>([]);
    const [remoteSyncConfig, setRemoteSyncConfig] = useState<AnprSyncConfig | null>(null);
    const [localFileCount, setLocalFileCount] = useState<number>(0);
    const [systemStats, setSystemStats] = useState<{
        sessions: number;
        decisions: number;
        sites: number;
        events: number;
    } | null>(null);
    const [hideUnknownPlates, setHideUnknownPlates] = useState(() => {
        return localStorage.getItem('hideUnknownPlates') === 'true';
    });

    const addLog = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
        setSyncLogs(prev => [{ time: new Date().toLocaleTimeString(), msg, type }, ...prev].slice(0, 50));
    };

    // Fetch system stats on load
    useEffect(() => {
        const fetchStats = async () => {
            try {
                const [statsRes, sitesRes, eventsRes] = await Promise.all([
                    fetch(`${API_BASE}/api/stats`),
                    fetch(`${API_BASE}/api/sites`),
                    fetch(`${API_BASE}/api/events?limit=1`),
                ]);
                const stats = await statsRes.json();
                const sites = await sitesRes.json();
                const events = await eventsRes.json();

                setSystemStats({
                    sessions: stats.sessions,
                    decisions: stats.decisions,
                    sites: sites.length,
                    events: events.meta?.total || 0,
                });
            } catch (err) {
                console.error('Failed to fetch stats:', err);
            }
        };
        fetchStats();
    }, [anprSync.lastRun, mondaySync.lastRun, mondayPermitsSync.lastRun, cameraSync.lastRun, remoteSync.lastRun, folderImport.lastRun]);

    // Fetch ANPR remote sync config and file count
    useEffect(() => {
        const fetchSyncConfig = async () => {
            try {
                const [configRes, filesRes] = await Promise.all([
                    fetch(`${API_BASE}/ingestion/anpr/sync/config`),
                    fetch(`${API_BASE}/ingestion/anpr/sync/files`),
                ]);
                const config = await configRes.json();
                const files = await filesRes.json();
                setRemoteSyncConfig(config);
                setLocalFileCount(files.fileCount || 0);
            } catch (err) {
                console.error('Failed to fetch sync config:', err);
            }
        };
        fetchSyncConfig();
    }, [remoteSync.lastRun, folderImport.lastRun]);

    const runSync = async (
        _type: 'anpr' | 'monday' | 'cameras',
        setState: React.Dispatch<React.SetStateAction<SyncStatus>>,
        endpoint: string,
    ) => {
        setState({ isRunning: true, message: 'Starting sync...' });
        addLog(`Starting sync: ${endpoint}`, 'info');

        try {
            const startTime = Date.now();
            const response = await fetch(`${API_BASE}${endpoint}`, { method: 'POST' });
            const data = await response.json();
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);

            if (response.ok) {
                const countMsg = data.processed !== undefined
                    ? ` - ${data.new} new, ${data.updated} updated${data.errors ? `, ${data.errors} errors` : ''} (${data.processed} total)`
                    : data.count !== undefined ? ` - ${data.count} items processed` : '';

                const statusMsg = `Completed in ${duration}s${countMsg}`;
                setState({
                    isRunning: false,
                    lastRun: new Date().toLocaleTimeString(),
                    message: statusMsg,
                });
                addLog(statusMsg, 'success');
                return data;
            } else {
                const errorMsg = data.message || 'Sync failed';
                setState({
                    isRunning: false,
                    error: errorMsg,
                    lastRun: new Date().toLocaleTimeString(),
                });
                addLog(errorMsg, 'error');
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Network error';
            setState({
                isRunning: false,
                error: errorMsg,
                lastRun: new Date().toLocaleTimeString(),
            });
            addLog(errorMsg, 'error');
        }
    };

    const runBatchSync = async (hours: number) => {
        setAnprSync({ isRunning: true, message: 'Starting batch sync...' });
        addLog(`Initiating chunked sync for ${hours}h period...`, 'info');

        const BATCH_SIZE = 100;
        let offset = 0;
        let totalNew = 0;
        let totalUpdated = 0;
        let totalProcessed = 0;
        let hasMore = true;
        const maxBatches = 500; // Increased to support large 7-day syncs
        let batchCount = 0;

        try {
            while (hasMore && batchCount < maxBatches) {
                batchCount++;
                setAnprSync(prev => ({ ...prev, message: `Syncing batch ${batchCount} (offset ${offset})...` }));

                const data = await runSync('anpr', setAnprSync, `/ingestion/anpr/poll?hours=${hours}&limit=${BATCH_SIZE}&offset=${offset}`);

                if (!data || data.processed === 0) {
                    hasMore = false;
                    addLog(`Batch ${batchCount}: No more events found.`, 'info');
                } else {
                    totalNew += data.new || 0;
                    totalUpdated += data.updated || 0;
                    totalProcessed += data.processed || 0;
                    offset += BATCH_SIZE;

                    // If we found fewer items than the batch size, we're likely done
                    if (data.processed < BATCH_SIZE) {
                        hasMore = false;
                    }

                    addLog(`Batch ${batchCount} complete: ${data.new} new, ${data.updated} updated.`, 'success');
                }

                // Keep indicates isRunning true during loop
                setAnprSync(prev => ({ ...prev, isRunning: true }));
            }

            const finalMsg = `Chunked sync complete. Total: ${totalNew} new, ${totalUpdated} updated across ${batchCount} batches.`;
            setAnprSync({
                isRunning: false,
                lastRun: new Date().toLocaleTimeString(),
                message: finalMsg
            });
            addLog(finalMsg, 'success');

        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Batch sync encountered an error';
            setAnprSync({
                isRunning: false,
                error: errorMsg,
                lastRun: new Date().toLocaleTimeString(),
            });
            addLog(errorMsg, 'error');
        }
    };

    const toggleHideUnknown = (val: boolean) => {
        setHideUnknownPlates(val);
        localStorage.setItem('hideUnknownPlates', String(val));
        addLog(`Display preference: ${val ? 'Hiding' : 'Showing'} unknown plates`, 'info');
    };

    const SyncCard = ({
        title,
        description,
        icon: Icon,
        status,
        onSync
    }: {
        title: string;
        description: string;
        icon: typeof Database;
        status: SyncStatus;
        onSync: () => void;
    }) => (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 p-6">
            <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                        <Icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{description}</p>
                    </div>
                </div>
                <button
                    onClick={onSync}
                    disabled={status.isRunning}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                    {status.isRunning ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Syncing...
                        </>
                    ) : (
                        <>
                            <RefreshCw className="w-4 h-4" />
                            Sync Now
                        </>
                    )}
                </button>
            </div>

            {/* Status */}
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800">
                <div className="flex items-center gap-2 text-sm">
                    {status.isRunning ? (
                        <>
                            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                            <span className="text-blue-600 dark:text-blue-400">{status.message || 'Processing...'}</span>
                        </>
                    ) : status.error ? (
                        <>
                            <XCircle className="w-4 h-4 text-red-500" />
                            <span className="text-red-600 dark:text-red-400">{status.error}</span>
                        </>
                    ) : status.message ? (
                        <>
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="text-green-600 dark:text-green-400">{status.message}</span>
                        </>
                    ) : (
                        <>
                            <Clock className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                            <span className="text-gray-500 dark:text-gray-400">No sync run yet</span>
                        </>
                    )}
                    {status.lastRun && (
                        <span className="ml-auto text-gray-400 dark:text-gray-500">Last: {status.lastRun}</span>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* System Overview */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 text-white">
                <div className="flex items-center gap-3 mb-4">
                    <Server className="w-6 h-6" />
                    <h2 className="text-xl font-semibold">System Overview</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white/10 rounded-lg p-4">
                        <p className="text-2xl font-bold">{systemStats?.events.toLocaleString() || '–'}</p>
                        <p className="text-sm text-gray-300">Total Events</p>
                    </div>
                    <div className="bg-white/10 rounded-lg p-4">
                        <p className="text-2xl font-bold">{systemStats?.sessions.toLocaleString() || '–'}</p>
                        <p className="text-sm text-gray-300">Sessions</p>
                    </div>
                    <div className="bg-white/10 rounded-lg p-4">
                        <p className="text-2xl font-bold">{systemStats?.decisions.toLocaleString() || '–'}</p>
                        <p className="text-sm text-gray-300">Decisions</p>
                    </div>
                    <div className="bg-white/10 rounded-lg p-4">
                        <p className="text-2xl font-bold">{systemStats?.sites || '–'}</p>
                        <p className="text-sm text-gray-300">Active Sites</p>
                    </div>
                </div>
            </div>

            {/* Sync Controls */}
            <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <HardDrive className="w-5 h-5" />
                    Data Synchronization
                </h3>

                {/* ANPR Sync with Time Range */}
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 p-6">
                    <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                                <Database className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white">ANPR Detection Sync</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Poll for new ANPR detections from external cameras and download associated images</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <select
                                value={anprHours}
                                onChange={(e) => setAnprHours(Number(e.target.value))}
                                className="px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                            >
                                <option value={1}>Last 1 hour</option>
                                <option value={6}>Last 6 hours</option>
                                <option value={24}>Last 24 hours</option>
                                <option value={48}>Last 48 hours</option>
                                <option value={168}>Last 7 days</option>
                            </select>
                            <button
                                onClick={() => runBatchSync(anprHours)}
                                disabled={anprSync.isRunning}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                            >
                                {anprSync.isRunning ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Batching...
                                    </>
                                ) : (
                                    <>
                                        <RefreshCw className="w-4 h-4" />
                                        Sync Now
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Status */}
                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800">
                        <div className="flex items-center gap-2 text-sm">
                            {anprSync.isRunning ? (
                                <>
                                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                                    <span className="text-blue-600 dark:text-blue-400">{anprSync.message || 'Processing batches...'}</span>
                                </>
                            ) : anprSync.error ? (
                                <>
                                    <XCircle className="w-4 h-4 text-red-500" />
                                    <span className="text-red-600 dark:text-red-400">{anprSync.error}</span>
                                </>
                            ) : anprSync.message ? (
                                <>
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                    <span className="text-green-600 dark:text-green-400">{anprSync.message}</span>
                                </>
                            ) : (
                                <>
                                    <Clock className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                    <span className="text-gray-500 dark:text-gray-400">No sync run yet</span>
                                </>
                            )}
                            {anprSync.lastRun && (
                                <span className="ml-auto text-gray-400 dark:text-gray-500">Last: {anprSync.lastRun}</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* ANPR Remote Sync Section */}
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 p-6">
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
                                <FolderSync className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white">ANPR Remote Sync</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    Sync ANPR detection files from remote server via rsync over SSH
                                </p>
                            </div>
                        </div>
                        <div className={`px-2 py-1 rounded-full text-xs font-medium ${remoteSyncConfig?.enabled ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                            {remoteSyncConfig?.enabled ? 'Enabled' : 'Disabled'}
                        </div>
                    </div>

                    {/* Config Display */}
                    {remoteSyncConfig && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 text-sm">
                            <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                                <span className="text-gray-500 dark:text-gray-400">Remote Host:</span>
                                <span className="font-mono text-gray-900 dark:text-white">{remoteSyncConfig.remoteUser}@{remoteSyncConfig.remoteHost}</span>
                            </div>
                            <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                                <span className="text-gray-500 dark:text-gray-400">Remote Path:</span>
                                <span className="font-mono text-gray-900 dark:text-white text-xs truncate max-w-[200px]" title={remoteSyncConfig.remotePath}>{remoteSyncConfig.remotePath}</span>
                            </div>
                            <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                                <span className="text-gray-500 dark:text-gray-400">Local Path:</span>
                                <span className="font-mono text-gray-900 dark:text-white text-xs truncate max-w-[200px]" title={remoteSyncConfig.localPath}>{remoteSyncConfig.localPath}</span>
                            </div>
                            <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                                <span className="text-gray-500 dark:text-gray-400">Local Files:</span>
                                <span className="font-mono text-gray-900 dark:text-white">{localFileCount.toLocaleString()} files</span>
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-2 mb-4">
                        <button
                            onClick={async () => {
                                setRemoteSync({ isRunning: true, message: 'Syncing from remote server...' });
                                addLog('Starting remote sync (rsync over SSH)...', 'info');
                                try {
                                    const res = await fetch(`${API_BASE}/ingestion/anpr/sync`, { method: 'POST' });
                                    const data = await res.json();
                                    if (data.success) {
                                        setRemoteSync({ isRunning: false, lastRun: new Date().toLocaleTimeString(), message: `Synced ${data.filesTransferred} files (${(data.bytesTransferred / 1024 / 1024).toFixed(1)} MB)` });
                                        addLog(`Remote sync complete: ${data.filesTransferred} files transferred`, 'success');
                                    } else {
                                        setRemoteSync({ isRunning: false, lastRun: new Date().toLocaleTimeString(), error: data.error || 'Sync failed' });
                                        addLog(data.error || 'Remote sync failed', 'error');
                                    }
                                } catch (err) {
                                    const msg = err instanceof Error ? err.message : 'Network error';
                                    setRemoteSync({ isRunning: false, error: msg });
                                    addLog(msg, 'error');
                                }
                            }}
                            disabled={remoteSync.isRunning || !remoteSyncConfig?.enabled}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        >
                            {remoteSync.isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {remoteSync.isRunning ? 'Syncing...' : 'Sync from Remote'}
                        </button>

                        <button
                            onClick={async () => {
                                setFolderImport({ isRunning: true, message: 'Importing local files to database...' });
                                addLog('Starting folder import...', 'info');
                                try {
                                    const res = await fetch(`${API_BASE}/ingestion/anpr/import`, { method: 'POST' });
                                    const data = await res.json();
                                    setFolderImport({ isRunning: false, lastRun: new Date().toLocaleTimeString(), message: `Imported ${data.success} of ${data.processed} files` });
                                    addLog(`Import complete: ${data.success} imported, ${data.skipped} skipped, ${data.errors} errors`, data.errors > 0 ? 'error' : 'success');
                                } catch (err) {
                                    const msg = err instanceof Error ? err.message : 'Network error';
                                    setFolderImport({ isRunning: false, error: msg });
                                    addLog(msg, 'error');
                                }
                            }}
                            disabled={folderImport.isRunning || localFileCount === 0}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        >
                            {folderImport.isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            {folderImport.isRunning ? 'Importing...' : 'Import to Database'}
                        </button>

                        <button
                            onClick={async () => {
                                setRemoteSync({ isRunning: true, message: 'Running sync and import...' });
                                addLog('Starting combined sync + import...', 'info');
                                try {
                                    const res = await fetch(`${API_BASE}/ingestion/anpr/sync-and-import?deleteAfterImport=true`, { method: 'POST' });
                                    const data = await res.json();
                                    if (data.sync.success) {
                                        const importMsg = data.import ? `${data.import.success} imported` : 'import pending';
                                        setRemoteSync({ isRunning: false, lastRun: new Date().toLocaleTimeString(), message: `Synced ${data.sync.filesTransferred} files, ${importMsg}` });
                                        addLog(`Sync + import complete: ${data.sync.filesTransferred} synced, ${importMsg}`, 'success');
                                    } else {
                                        setRemoteSync({ isRunning: false, error: data.sync.error || 'Sync failed' });
                                        addLog(data.sync.error || 'Combined sync failed', 'error');
                                    }
                                } catch (err) {
                                    const msg = err instanceof Error ? err.message : 'Network error';
                                    setRemoteSync({ isRunning: false, error: msg });
                                    addLog(msg, 'error');
                                }
                            }}
                            disabled={remoteSync.isRunning || !remoteSyncConfig?.enabled}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        >
                            {remoteSync.isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            Sync & Import
                        </button>
                    </div>

                    {/* Status */}
                    <div className="pt-4 border-t border-gray-100 dark:border-slate-800">
                        <div className="flex items-center gap-2 text-sm">
                            {remoteSync.isRunning ? (
                                <>
                                    <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />
                                    <span className="text-purple-600 dark:text-purple-400">{remoteSync.message || 'Processing...'}</span>
                                </>
                            ) : remoteSync.error ? (
                                <>
                                    <XCircle className="w-4 h-4 text-red-500" />
                                    <span className="text-red-600 dark:text-red-400">{remoteSync.error}</span>
                                </>
                            ) : remoteSync.message ? (
                                <>
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                    <span className="text-green-600 dark:text-green-400">{remoteSync.message}</span>
                                </>
                            ) : !remoteSyncConfig?.enabled ? (
                                <>
                                    <Clock className="w-4 h-4 text-amber-500" />
                                    <span className="text-amber-600 dark:text-amber-400">Remote sync disabled. Configure in .env file.</span>
                                </>
                            ) : (
                                <>
                                    <Clock className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                    <span className="text-gray-500 dark:text-gray-400">Ready to sync</span>
                                </>
                            )}
                            {remoteSync.lastRun && (
                                <span className="ml-auto text-gray-400 dark:text-gray-500">Last: {remoteSync.lastRun}</span>
                            )}
                        </div>
                    </div>
                </div>

                <SyncCard
                    title="Monday.com Sites Sync"
                    description="Sync site configuration and data from Monday.com boards"
                    icon={Cloud}
                    status={mondaySync}
                    onSync={() => runSync('monday', setMondaySync, '/integration/monday/sync')}
                />

                <SyncCard
                    title="Monday.com Whitelist Sync"
                    description="Sync whitelisted VRMs and permits from Monday.com Whitelist Board"
                    icon={Database}
                    status={mondayPermitsSync}
                    onSync={() => runSync('monday', setMondayPermitsSync, '/integration/monday/permits/sync')}
                />

                <SyncCard
                    title="Camera Configuration Sync"
                    description="Sync camera direction mappings from Monday.com Camera Board"
                    icon={RefreshCw}
                    status={cameraSync}
                    onSync={() => runSync('cameras', setCameraSync, '/integration/monday/cameras/sync')}
                />

                {/* Display Settings */}
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                            <Server className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">Display Settings</h3>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-800">
                        <div>
                            <div className="font-medium text-gray-900 dark:text-white">Hide Unknown Plates</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">Do not show events where the license plate was not recognized</div>
                        </div>
                        <button
                            onClick={() => toggleHideUnknown(!hideUnknownPlates)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${hideUnknownPlates ? 'bg-blue-600' : 'bg-gray-200 dark:bg-slate-700'
                                }`}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${hideUnknownPlates ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                            />
                        </button>
                    </div>
                </div>

                <div className="pt-4 border-t border-gray-100 dark:border-slate-800 mt-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                        <Server className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        Infrastructure Setup
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button
                            onClick={() => runSync('cameras', setCameraSync, '/ingestion/anpr/discover')}
                            className="flex items-center gap-3 p-4 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl hover:border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all text-left"
                        >
                            <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                                <Database className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div>
                                <div className="font-semibold text-gray-900 dark:text-white">Discover Cameras</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Scan ANPR feed and push to Monday</div>
                            </div>
                        </button>
                        <button
                            onClick={() => runSync('cameras', setCameraSync, '/integration/monday/cameras/setup')}
                            className="flex items-center gap-3 p-4 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all text-left"
                        >
                            <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                                <Cloud className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                                <div className="font-semibold text-gray-900 dark:text-white">Setup Camera Board</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Initialize Monday.com board columns</div>
                            </div>
                        </button>
                    </div>
                </div>

                {/* Log Viewer */}
                {syncLogs.length > 0 && (
                    <div className="mt-6">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Sync Log</h3>
                            <button
                                onClick={() => setSyncLogs([])}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                Clear Logs
                            </button>
                        </div>
                        <div className="bg-slate-900 dark:bg-black rounded-lg p-4 font-mono text-xs h-48 overflow-y-auto space-y-1 shadow-inner">
                            {syncLogs.map((log, i) => (
                                <div key={i} className="flex gap-3">
                                    <span className="text-slate-500 dark:text-slate-600 shrink-0">[{log.time}]</span>
                                    <span className={
                                        log.type === 'error' ? 'text-red-400' :
                                            log.type === 'success' ? 'text-green-400' :
                                                'text-slate-300 dark:text-slate-400'
                                    }>
                                        {log.msg}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Danger Zone */}
            <div className="bg-red-50 dark:bg-red-900/10 rounded-xl p-6 border border-red-100 dark:border-red-900/20 transition-colors">
                <div className="flex items-center gap-3 mb-4">
                    <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                    <h2 className="text-xl font-semibold text-red-900 dark:text-red-400">Danger Zone</h2>
                </div>
                <p className="text-sm text-red-600 dark:text-red-400/80 mb-6 font-medium">
                    Purging will delete all movements, sessions, decisions, and local images.
                    This action is destructive and cannot be undone.
                </p>
                <button
                    onClick={() => {
                        if (confirm('Are you absolutely sure? This will delete all events and images!')) {
                            runSync('anpr', setAnprSync, '/api/reset');
                        }
                    }}
                    className="px-6 py-3 bg-red-600 dark:bg-red-700 text-white rounded-lg font-bold hover:bg-red-700 dark:hover:bg-red-800 transition-all shadow-sm flex items-center gap-2 active:scale-95"
                >
                    <Database className="w-5 h-5" />
                    Purge All Data & Images
                </button>
            </div>

            {/* System Info */}
            <div className="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-6 border border-gray-100 dark:border-slate-800 transition-colors">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">System Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-900 rounded-lg border border-gray-100 dark:border-slate-800">
                        <span className="text-gray-500 dark:text-gray-400">API Endpoint:</span>
                        <span className="font-mono text-gray-900 dark:text-white">{API_BASE}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-900 rounded-lg border border-gray-100 dark:border-slate-800">
                        <span className="text-gray-500 dark:text-gray-400">ANPR Polling:</span>
                        <span className="text-gray-900 dark:text-white">Every 5 minutes (automatic)</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-900 rounded-lg border border-gray-100 dark:border-slate-800">
                        <span className="text-gray-500 dark:text-gray-400">Image Storage:</span>
                        <span className="font-mono text-gray-900 dark:text-white">/uploads/images/</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-900 rounded-lg border border-gray-100 dark:border-slate-800">
                        <span className="text-gray-500 dark:text-gray-400">Camera Board ID:</span>
                        <span className="font-mono text-gray-900 dark:text-white">1952030503</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
