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
import { BuildAuditView } from './components/BuildAuditView';
import { PaymentTrackingView } from './components/PaymentTrackingView';
import PlateReviewQueue from './components/PlateReviewQueue';
import { LayoutDashboard, Map as MapIcon, Users, Settings, ShieldAlert, Camera, Sun, Moon, FileSearch, Package, CreditCard, FileDown, List, ScanEye } from 'lucide-react';

function App() {
  const [currentView, setCurrentView] = useState('dashboard');
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

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex transition-colors duration-200">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 hidden md:block transition-colors">
        <div className="p-6">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-lg">P</span>
            POS Admin
          </h1>
        </div>
        <nav className="mt-6 px-4 space-y-1">
          <button
            onClick={() => setCurrentView('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${currentView === 'dashboard' ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
          >
            <LayoutDashboard className="w-5 h-5" />
            Dashboard
          </button>
          <button
            onClick={() => setCurrentView('sites')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${currentView === 'sites' ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
          >
            <MapIcon className="w-5 h-5" />
            Sites
          </button>
          <button
            onClick={() => setCurrentView('plate-review')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${currentView === 'plate-review' ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
          >
            <ScanEye className="w-5 h-5" />
            Plate Review
          </button>
          <button
            onClick={() => setCurrentView('enforcement')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${currentView === 'enforcement' ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
          >
            <ShieldAlert className="w-5 h-5" />
            Review Queue
          </button>
          <button
            onClick={() => setCurrentView('pcn-export')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${currentView === 'pcn-export' ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
          >
            <FileDown className="w-5 h-5" />
            PCN Export
          </button>
          <button
            onClick={() => setCurrentView('events')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${currentView === 'events' ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
          >
            <Camera className="w-5 h-5" />
            Events
          </button>
          <button
            onClick={() => setCurrentView('parking-events')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${currentView === 'parking-events' ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
          >
            <List className="w-5 h-5" />
            Parking Events
          </button>
          <button
            onClick={() => setCurrentView('permits')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${currentView === 'permits' ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
          >
            <Users className="w-5 h-5" />
            Permits
          </button>
          <button
            onClick={() => setCurrentView('audit')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${currentView === 'audit' ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
          >
            <FileSearch className="w-5 h-5" />
            Audit Trail
          </button>
          <button
            onClick={() => setCurrentView('build')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${currentView === 'build' ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
          >
            <Package className="w-5 h-5" />
            Build History
          </button>
          <button
            onClick={() => setCurrentView('payments')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${currentView === 'payments' ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
          >
            <CreditCard className="w-5 h-5" />
            Payment Tracking
          </button>
          <button
            onClick={() => setCurrentView('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${currentView === 'settings' ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
          >
            <Settings className="w-5 h-5" />
            Settings
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white transition-colors">
              {currentView === 'dashboard' ? 'Dashboard' :
                currentView === 'sites' ? 'Sites Management' :
                  currentView === 'events' ? 'ANPR Events' :
                    currentView === 'parking-events' ? 'Parking Events Overview' :
                      currentView === 'permits' ? 'Permits & Whitelist' :
                        currentView === 'audit' ? 'Audit Trail' :
                          currentView === 'build' ? 'Build History & Version' :
                            currentView === 'payments' ? 'Payment Tracking' :
                              currentView === 'pcn-export' ? 'PCN Batch Export' :
                                currentView === 'plate-review' ? 'Plate Review Queue' :
                                  currentView === 'settings' ? 'System Settings' : 'Enforcement Review'}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mt-1 transition-colors">Real-time parking operations overview</p>
          </div>
          <div className="flex items-center gap-6">
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all shadow-sm"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 font-medium bg-white dark:bg-slate-900 px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm transition-colors">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              System Online
            </div>
          </div>
        </header>

        <div className="transition-all duration-300">
          {currentView === 'dashboard' && <DashboardStats />}
          {currentView === 'sites' && <SitesList />}
          {currentView === 'plate-review' && <PlateReviewQueue />}
          {currentView === 'enforcement' && <EnforcementReview />}
          {currentView === 'pcn-export' && <PCNBatchExport />}
          {currentView === 'events' && <EventsView />}
          {currentView === 'parking-events' && <ParkingEventsView />}
          {currentView === 'permits' && <PermitsView />}
          {currentView === 'audit' && <AuditView />}
          {currentView === 'build' && <BuildAuditView />}
          {currentView === 'payments' && <PaymentTrackingView />}
          {currentView === 'settings' && <SettingsView />}
        </div>
      </main>
    </div>
  );
}

export default App;
