import { useState, useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import { SidebarNavItem } from './SidebarNavItem';

interface NavItem {
  icon: LucideIcon;
  label: string;
  viewId: string;
}

interface SidebarGroupProps {
  title: string;
  items: NavItem[];
  currentView: string;
  collapsed: boolean;
  onNavigate: (viewId: string) => void;
  storageKey: string;
}

export function SidebarGroup({
  title,
  items,
  currentView,
  collapsed,
  onNavigate,
  storageKey,
}: SidebarGroupProps) {
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`sidebar-group-${storageKey}`);
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  // Persist expansion state
  useEffect(() => {
    localStorage.setItem(`sidebar-group-${storageKey}`, String(isExpanded));
  }, [isExpanded, storageKey]);

  // Auto-expand if current view is in this group
  useEffect(() => {
    const hasActiveItem = items.some((item) => item.viewId === currentView);
    if (hasActiveItem && !isExpanded) {
      setIsExpanded(true);
    }
  }, [currentView, items, isExpanded]);

  const toggleExpanded = () => {
    setIsExpanded((prev) => !prev);
  };

  // In collapsed mode, show items directly on hover
  if (collapsed) {
    return (
      <div className="relative group/sidebar-group">
        {items.map((item) => (
          <SidebarNavItem
            key={item.viewId}
            icon={item.icon}
            label={item.label}
            viewId={item.viewId}
            currentView={currentView}
            collapsed={collapsed}
            onClick={onNavigate}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="mb-2">
      <button
        onClick={toggleExpanded}
        className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
      >
        <span>{title}</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-200 ${
            isExpanded ? '' : '-rotate-90'
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${
          isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="space-y-1 px-2">
          {items.map((item) => (
            <SidebarNavItem
              key={item.viewId}
              icon={item.icon}
              label={item.label}
              viewId={item.viewId}
              currentView={currentView}
              collapsed={collapsed}
              onClick={onNavigate}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
