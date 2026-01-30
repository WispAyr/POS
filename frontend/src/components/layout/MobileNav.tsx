import { useState, useEffect, useCallback } from 'react';
import { Menu, X } from 'lucide-react';
import { NAV_GROUPS } from './Sidebar';
import { SidebarNavItem } from './SidebarNavItem';

interface MobileNavProps {
  currentView: string;
  onNavigate: (viewId: string) => void;
}

export function MobileNav({ currentView, onNavigate }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleNavigate = (viewId: string) => {
    onNavigate(viewId);
    closeDrawer();
  };

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeDrawer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeDrawer]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      {/* Hamburger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="md:hidden fixed top-4 left-4 z-40 p-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg touch-manipulation"
        style={{ minWidth: '44px', minHeight: '44px' }}
        aria-label="Open navigation menu"
      >
        <Menu className="w-6 h-6 text-gray-700 dark:text-gray-300" />
      </button>

      {/* Backdrop */}
      <div
        className={`
          md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300
          ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
        onClick={closeDrawer}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        className={`
          md:hidden fixed top-0 left-0 bottom-0 z-50 w-72 bg-white dark:bg-slate-900
          border-r border-gray-200 dark:border-slate-800 shadow-2xl
          transform transition-transform duration-300 ease-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="p-4 flex items-center justify-between border-b border-gray-200 dark:border-slate-800">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-lg">
              P
            </span>
            POS Admin
          </h1>
          <button
            onClick={closeDrawer}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors touch-manipulation"
            style={{ minWidth: '44px', minHeight: '44px' }}
            aria-label="Close navigation menu"
          >
            <X className="w-6 h-6 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.key} className="mb-4">
              <div className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wider">
                {group.title}
              </div>
              <div className="space-y-1 px-2">
                {group.items.map((item) => (
                  <SidebarNavItem
                    key={item.viewId}
                    icon={item.icon}
                    label={item.label}
                    viewId={item.viewId}
                    currentView={currentView}
                    collapsed={false}
                    onClick={handleNavigate}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
