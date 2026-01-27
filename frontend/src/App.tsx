import { useState } from 'react';
import { DashboardStats } from './components/DashboardStats';
import { SitesList } from './components/SitesList';
import { EnforcementReview } from './components/EnforcementReview';
import { EventsView } from './components/EventsView';
import { SettingsView } from './components/SettingsView';
import { LayoutDashboard, Map as MapIcon, Users, Settings, ShieldAlert, Camera } from 'lucide-react';

function App() {
  const [currentView, setCurrentView] = useState('dashboard');

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 hidden md:block">
        <div className="p-6">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-lg">P</span>
            POS Admin
          </h1>
        </div>
        <nav className="mt-6 px-4 space-y-1">
          <button
            onClick={() => setCurrentView('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium ${currentView === 'dashboard' ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <LayoutDashboard className="w-5 h-5" />
            Dashboard
          </button>
          <button
            onClick={() => setCurrentView('sites')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium ${currentView === 'sites' ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <MapIcon className="w-5 h-5" />
            Sites
          </button>
          <button
            onClick={() => setCurrentView('enforcement')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium ${currentView === 'enforcement' ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <ShieldAlert className="w-5 h-5" />
            Review Queue
          </button>
          <button
            onClick={() => setCurrentView('events')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium ${currentView === 'events' ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Camera className="w-5 h-5" />
            Events
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-lg font-medium">
            <Users className="w-5 h-5" />
            Permits
          </button>
          <button
            onClick={() => setCurrentView('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium ${currentView === 'settings' ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Settings className="w-5 h-5" />
            Settings
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {currentView === 'dashboard' ? 'Dashboard' :
                currentView === 'sites' ? 'Sites Management' :
                  currentView === 'events' ? 'ANPR Events' :
                    currentView === 'settings' ? 'System Settings' : 'Enforcement Review'}
            </h2>
            <p className="text-gray-500 mt-1">Real-time parking operations overview</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              System Online
            </div>
          </div>
        </header>

        {currentView === 'dashboard' && <DashboardStats />}
        {currentView === 'sites' && <SitesList />}
        {currentView === 'enforcement' && <EnforcementReview />}
        {currentView === 'events' && <EventsView />}
        {currentView === 'settings' && <SettingsView />}
      </main>
    </div >
  );
}

export default App;
