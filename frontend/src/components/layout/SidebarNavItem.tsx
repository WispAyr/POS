import type { LucideIcon } from 'lucide-react';

interface SidebarNavItemProps {
  icon: LucideIcon;
  label: string;
  viewId: string;
  currentView: string;
  collapsed: boolean;
  onClick: (viewId: string) => void;
}

export function SidebarNavItem({
  icon: Icon,
  label,
  viewId,
  currentView,
  collapsed,
  onClick,
}: SidebarNavItemProps) {
  const isActive = currentView === viewId;

  return (
    <button
      onClick={() => onClick(viewId)}
      title={collapsed ? label : undefined}
      className={`
        w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all duration-200
        ${collapsed ? 'justify-center' : ''}
        ${
          isActive
            ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'
        }
      `}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}
