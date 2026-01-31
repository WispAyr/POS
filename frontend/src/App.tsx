import { useState, useEffect } from 'react';
import { DashboardStats } from './components/DashboardStats';
import { SitesList } from './components/SitesList';
import { EnforcementReview } from './components/EnforcementReview';
import { PCNBatchExport } from './components/PCNBatchExport';
import { EventsView } from './components/EventsView';
import { ParkingEventsView } from './components/ParkingEventsView';
import { SettingsView } from './components/SettingsView';
import { PermitsView } from './components/PermitsView';
import { AuditView } from './components/AuditView';
import { AuditStream } from './components/AuditStream';
import { BuildAuditView } from './components/BuildAuditView';
import { PaymentTrackingView } from './components/PaymentTrackingView';
import PlateReviewQueue from './components/PlateReviewQueue';
import { AlarmDashboard } from './components/AlarmDashboard';
import { AlarmNotificationBell } from './components/AlarmNotificationBell';
import { PaymentProviderConfig } from './components/PaymentProviderConfig';
import { CustomerExportDashboard } from './components/CustomerExportDashboard';
import { VrmSearch } from './components/VrmSearch';
import { SystemMonitorView } from './components/SystemMonitorView';
import { OperationsDashboard } from './components/dashboard';
import { ScheduledNotificationDashboard } from './components/notifications/ScheduledNotificationDashboard';
import { CarParkLiveView } from './components/car-park-live';
import { Sidebar, MobileNav, FullscreenButton } from './components/layout';
import { HailoDevBar } from './components/HailoDevBar';
import { FILOAnomalies } from './components/FILOAnomalies';
import { EnforcementSettings } from './components/EnforcementSettings';
import { SiteConfigAdmin } from './components/admin/SiteConfigAdmin';
import { Sun, Moon, Search } from 'lucide-react';

// View titles for the header
const VIEW_TITLES: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Real-time parking operations overview' },
  'operations-dashboard': { title: 'Operations Dashboard', subtitle: 'Real-time site monitoring' },
  'car-park-live': { title: 'Car Park Live', subtitle: 'Live camera feeds, announcements, and controls' },
  'vrm-search': { title: 'VRM Search', subtitle: 'Search vehicle registration history' },
  sites: { title: 'Sites Management', subtitle: 'Configure and manage parking sites' },
  'plate-review': { title: 'Plate Review Queue', subtitle: 'Review plates requiring verification' },
  enforcement: { title: 'Enforcement Review', subtitle: 'Review and process PCN candidates' },
  'filo-anomalies': { title: 'FILO Anomalies', subtitle: 'First-In-Last-Out session anomalies' },
  'enforcement-settings': { title: 'PCN Engine Settings', subtitle: 'Manage per-site enforcement rules' },
  'pcn-export': { title: 'PCN Batch Export', subtitle: 'Export approved PCNs for processing' },
  events: { title: 'ANPR Events', subtitle: 'View all vehicle detection events' },
  'parking-events': { title: 'Parking Events Overview', subtitle: 'Complete parking session history' },
  permits: { title: 'Permits & Whitelist', subtitle: 'Manage permitted vehicles' },
  alarms: { title: 'Alarm Centre', subtitle: 'Monitor and manage system alarms' },
  'scheduled-notifications': { title: 'Scheduled Notifications', subtitle: 'Configure automated notifications and actions' },
  'system-monitor': { title: 'System Monitor', subtitle: 'System health and performance metrics' },
  payments: { title: 'Payment Tracking', subtitle: 'Track and reconcile payments' },
  'payment-providers': { title: 'Payment Providers', subtitle: 'Configure payment integrations' },
  'customer-export': { title: 'Customer Export', subtitle: 'Export customer data for reporting' },
  audit: { title: 'Audit Trail', subtitle: 'System activity and change history' },
  build: { title: 'Build History & Version', subtitle: 'Deployment and version information' },
  settings: { title: 'System Settings', subtitle: 'Configure system preferences' },
  'site-config': { title: 'Site Configuration', subtitle: 'Manage site cameras and settings' },
};

interface NavigationContext {
  vrm?: string;
  entityId?: string;
  entityType?: string;
}

function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [navContext, setNavContext] = useState<NavigationContext | null>(null);
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') || 'light';
    }
    return 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Listen for navigation events from notification bell
  useEffect(() => {
    const handleNavigate = (event: CustomEvent) => {
      setCurrentView(event.detail);
    };
    window.addEventListener('navigate', handleNavigate as EventListener);
    return () => window.removeEventListener('navigate', handleNavigate as EventListener);
  }, []);

  // Global keyboard shortcut: Cmd/Ctrl+K for VRM Search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCurrentView('vrm-search');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleNavigate = (viewId: string, context?: NavigationContext) => {
    setCurrentView(viewId);
    setNavContext(context || null);
  };

  const viewInfo = VIEW_TITLES[currentView] || { title: 'Dashboard', subtitle: '' };

  // Operations Dashboard is a full-screen view without the standard layout
  if (currentView === 'operations-dashboard') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-950 transition-colors duration-200">
        <MobileNav currentView={currentView} onNavigate={handleNavigate} />
        <div className="flex">
          <Sidebar currentView={currentView} onNavigate={handleNavigate} />
          <main className="flex-1 overflow-y-auto">
            <OperationsDashboard />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex transition-colors duration-200">
      {/* Developer Status Bar */}
      <HailoDevBar />
      
      {/* Mobile Navigation */}
      <MobileNav currentView={currentView} onNavigate={handleNavigate} />

      {/* Desktop Sidebar */}
      <Sidebar currentView={currentView} onNavigate={handleNavigate} />

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto md:ml-0">
        {/* Mobile top padding for hamburger menu */}
        <div className="h-12 md:hidden" />

        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white transition-colors">
              {viewInfo.title}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mt-1 transition-colors">
              {viewInfo.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setCurrentView('vrm-search')}
              className="flex items-center gap-3 px-4 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all shadow-sm"
            >
              <Search className="w-4 h-4" />
              <span className="text-sm hidden sm:inline">Search VRM</span>
              <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 dark:bg-slate-800 rounded border border-gray-200 dark:border-slate-700">
                <span className="text-xs">⌘</span>K
              </kbd>
            </button>
            <AlarmNotificationBell />
            <FullscreenButton />
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all shadow-sm"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? (
                <Moon className="w-5 h-5" />
              ) : (
                <Sun className="w-5 h-5" />
              )}
            </button>
            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 font-medium bg-white dark:bg-slate-900 px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm transition-colors">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              System Online
            </div>
          </div>
        </header>

        <div className="transition-all duration-300">
          {currentView === 'dashboard' && <DashboardStats />}
          {currentView === 'vrm-search' && <VrmSearch initialVrm={navContext?.vrm} />}
          {currentView === 'sites' && <SitesList />}
          {currentView === 'plate-review' && <PlateReviewQueue />}
          {currentView === 'enforcement' && <EnforcementReview />}
          {currentView === 'filo-anomalies' && <FILOAnomalies />}
          {currentView === 'enforcement-settings' && <EnforcementSettings />}
          {currentView === 'pcn-export' && <PCNBatchExport />}
          {currentView === 'events' && <EventsView />}
          {currentView === 'parking-events' && <ParkingEventsView />}
          {currentView === 'permits' && <PermitsView />}
          {currentView === 'audit' && <AuditView />}
          {currentView === 'audit-stream' && <AuditStream onNavigate={handleNavigate} />}
          {currentView === 'build' && <BuildAuditView />}
          {currentView === 'payments' && <PaymentTrackingView />}
          {currentView === 'alarms' && <AlarmDashboard />}
          {currentView === 'scheduled-notifications' && <ScheduledNotificationDashboard />}
          {currentView === 'payment-providers' && <PaymentProviderConfig />}
          {currentView === 'customer-export' && <CustomerExportDashboard />}
          {currentView === 'system-monitor' && <SystemMonitorView />}
          {currentView === 'car-park-live' && <CarParkLiveView />}
          {currentView === 'settings' && <SettingsView />}
          {currentView === 'site-config' && <SiteConfigAdmin />}
        </div>
      </main>
    </div>
  );
}

export default App;
