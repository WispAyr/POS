import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Map as MapIcon,
  Users,
  Settings,
  ShieldAlert,
  Camera,
  FileSearch,
  Package,
  CreditCard,
  FileDown,
  List,
  ScanEye,
  Bell,
  Plug,
  Upload,
  Search,
  Activity,
  PanelLeftClose,
  PanelLeft,
  Monitor,
  Send,
  Radio,
} from 'lucide-react';
import { SidebarGroup } from './SidebarGroup';

interface SidebarProps {
  currentView: string;
  onNavigate: (viewId: string) => void;
}

const NAV_GROUPS = [
  {
    title: 'Overview',
    key: 'overview',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', viewId: 'dashboard' },
      { icon: Monitor, label: 'Operations Dashboard', viewId: 'operations-dashboard' },
      { icon: Search, label: 'VRM Search', viewId: 'vrm-search' },
    ],
  },
  {
    title: 'Enforcement',
    key: 'enforcement',
    items: [
      { icon: ScanEye, label: 'Plate Review', viewId: 'plate-review' },
      { icon: ShieldAlert, label: 'Review Queue', viewId: 'enforcement' },
      { icon: FileDown, label: 'PCN Export', viewId: 'pcn-export' },
    ],
  },
  {
    title: 'Activity',
    key: 'activity',
    items: [
      { icon: Camera, label: 'Events', viewId: 'events' },
      { icon: List, label: 'Parking Events', viewId: 'parking-events' },
      { icon: Users, label: 'Permits', viewId: 'permits' },
    ],
  },
  {
    title: 'Monitoring',
    key: 'monitoring',
    items: [
      { icon: Radio, label: 'Car Park Live', viewId: 'car-park-live' },
      { icon: Bell, label: 'Alarms', viewId: 'alarms' },
      { icon: Send, label: 'Notifications', viewId: 'scheduled-notifications' },
      { icon: Activity, label: 'System Monitor', viewId: 'system-monitor' },
      { icon: MapIcon, label: 'Sites', viewId: 'sites' },
    ],
  },
  {
    title: 'Admin',
    key: 'admin',
    items: [
      { icon: CreditCard, label: 'Payment Tracking', viewId: 'payments' },
      { icon: Plug, label: 'Payment Providers', viewId: 'payment-providers' },
      { icon: Upload, label: 'Customer Export', viewId: 'customer-export' },
      { icon: FileSearch, label: 'Audit Trail', viewId: 'audit' },
      { icon: Package, label: 'Build History', viewId: 'build' },
      { icon: Settings, label: 'Settings', viewId: 'settings' },
    ],
  },
];

export function Sidebar({ currentView, onNavigate }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    }
    return false;
  });

  // Persist collapsed state
  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => !prev);
  };

  return (
    <aside
      className={`
        bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800
        hidden md:flex flex-col transition-all duration-300
        ${collapsed ? 'w-16' : 'w-64'}
      `}
    >
      {/* Header */}
      <div className={`p-4 flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && (
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-lg flex-shrink-0">
              P
            </span>
            <span className="truncate">POS Admin</span>
          </h1>
        )}
        {collapsed && (
          <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-lg">
            P
          </span>
        )}
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 overflow-y-auto py-4">
        {NAV_GROUPS.map((group) => (
          <SidebarGroup
            key={group.key}
            title={group.title}
            items={group.items}
            currentView={currentView}
            collapsed={collapsed}
            onNavigate={onNavigate}
            storageKey={group.key}
          />
        ))}
      </nav>

      {/* Collapse Toggle */}
      <div className="p-4 border-t border-gray-200 dark:border-slate-800">
        <button
          onClick={toggleCollapsed}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeft className="w-5 h-5" />
          ) : (
            <>
              <PanelLeftClose className="w-5 h-5" />
              <span className="text-sm">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

export { NAV_GROUPS };
