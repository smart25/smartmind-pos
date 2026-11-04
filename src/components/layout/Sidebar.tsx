import React, { useState } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  FileText,
  ReceiptText,
  BookOpen,
  BarChart3,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Store,
  Users,
  ArrowLeftRight,
  LogOut,
  X,
  Truck,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
} from 'lucide-react';
import { AppView, Shop, User } from '../../types/pos';
import { canUserAccessView } from '../../utils/posCalculations';

interface SidebarProps {
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeShop: Shop;
  currentUser: User;
  onReturnToShopSelection: () => void;
  onSignOut: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavSubItemConfig {
  id: AppView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isVisible: (user: User) => boolean;
}

interface NavItemConfig {
  id: AppView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isVisible: (user: User) => boolean;
  subItems?: NavSubItemConfig[];
}

const NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'dashboard',
    label: 'Shop Dashboard',
    icon: LayoutDashboard,
    isVisible: (u) => canUserAccessView(u, 'dashboard'),
  },
  {
    id: 'pos',
    label: 'Point of Sale',
    icon: ShoppingCart,
    isVisible: (u) => canUserAccessView(u, 'pos'),
  },
  {
    id: 'inventory',
    label: 'Products & Inventory',
    icon: Package,
    isVisible: (u) => canUserAccessView(u, 'inventory'),
  },
  {
    id: 'invoices',
    label: 'Invoices',
    icon: FileText,
    isVisible: (u) => canUserAccessView(u, 'invoices'),
  },
  {
    id: 'sales',
    label: 'Sales History',
    icon: ReceiptText,
    isVisible: (u) =>
      canUserAccessView(u, 'sales') || canUserAccessView(u, 'sales_summary'),
    subItems: [
      {
        id: 'sales',
        label: 'All Transactions',
        icon: ReceiptText,
        isVisible: (u) => canUserAccessView(u, 'sales'),
      },
      {
        id: 'sales_summary',
        label: 'Sales Summary',
        icon: FileSpreadsheet,
        isVisible: (u) => canUserAccessView(u, 'sales_summary'),
      },
    ],
  },
  {
    id: 'debt_book',
    label: 'Debt Book',
    icon: BookOpen,
    isVisible: (u) => canUserAccessView(u, 'debt_book'),
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: BarChart3,
    isVisible: (u) => canUserAccessView(u, 'reports'),
  },
  {
    id: 'suppliers',
    label: 'Suppliers',
    icon: Truck,
    isVisible: (u) => canUserAccessView(u, 'suppliers'),
  },
  {
    id: 'shops',
    label: 'Shop Management',
    icon: Store,
    isVisible: (u) => canUserAccessView(u, 'shops'),
  },
  {
    id: 'staff',
    label: 'Staff & Permissions',
    icon: Users,
    isVisible: (u) => canUserAccessView(u, 'staff'),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    isVisible: (u) => canUserAccessView(u, 'settings'),
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onSelectView,
  collapsed,
  onToggleCollapse,
  activeShop,
  currentUser,
  onReturnToShopSelection,
  onSignOut,
  mobileOpen,
  onCloseMobile,
}) => {
  const visibleNavItems = NAV_ITEMS.filter((item) =>
    item.isVisible(currentUser)
  );

  const [openSubMenus, setOpenSubMenus] = useState<Record<string, boolean>>({
    sales: true,
  });

  const toggleSubMenu = (menuId: string) => {
    setOpenSubMenus((prev) => ({
      ...prev,
      [menuId]: prev[menuId] !== undefined ? !prev[menuId] : false,
    }));
  };

  const renderNavContent = (isMobileDrawer: boolean) => {
    const isCompact = !isMobileDrawer && collapsed;

    return (
      <div className="flex flex-col h-full bg-slate-900 text-slate-200 select-none">
        {/* Brand Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/smartmind-logo.png"
              alt="SmartMind POS Logo"
              className="w-9 h-9 rounded-lg object-contain shrink-0"
            />
            {!isCompact && (
              <div className="min-w-0">
                <p className="font-display font-bold text-sm text-white tracking-tight truncate">
                  SmartMind POS
                </p>
                <p className="text-xs text-slate-400 truncate">
                  Desktop Edition Â· Phase 2
                </p>
              </div>
            )}
          </div>

          {isMobileDrawer ? (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close navigation menu"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={isCompact ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isCompact ? 'Expand sidebar' : 'Collapse sidebar'}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            >
              {isCompact ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
          )}
        </div>

        {/* Active Shop Context Box */}
        <div className="px-3 py-3 border-b border-slate-800/80 shrink-0">
          {isCompact ? (
            <button
              type="button"
              onClick={() => {
                onReturnToShopSelection();
                if (isMobileDrawer) onCloseMobile();
              }}
              aria-label={`Switch shop from ${activeShop.name}`}
              title={`${activeShop.name} (${activeShop.code}) â€” Click to switch shop`}
              className="w-full flex items-center justify-center p-2 rounded-lg bg-slate-800/90 hover:bg-slate-800 text-emerald-400 transition-colors"
            >
              <Store className="w-4 h-4" />
            </button>
          ) : (
            <div className="p-2.5 rounded-lg bg-slate-800/70 border border-slate-700/70">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono text-emerald-400 font-semibold">
                  {activeShop.code}
                </span>
                <span className="text-xs text-slate-400 truncate">
                  {activeShop.category}
                </span>
              </div>
              <p className="text-xs font-semibold text-white mt-1 truncate">
                {activeShop.name}
              </p>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                {activeShop.locationCity}
              </p>
              <button
                type="button"
                onClick={() => {
                  onReturnToShopSelection();
                  if (isMobileDrawer) onCloseMobile();
                }}
                className="mt-2.5 w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-900/90 hover:bg-slate-950 text-xs font-medium text-slate-200 border border-slate-700/80 transition-colors whitespace-nowrap"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Switch Shop Workspace</span>
              </button>
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <nav
          aria-label="Primary POS navigation"
          className="flex-1 px-3 py-3 space-y-1 overflow-y-auto"
        >
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const visibleSubItems =
              item.subItems?.filter((sub) => sub.isVisible(currentUser)) ?? [];
            const hasSubItems = visibleSubItems.length > 0;
            const isItemOrSubActive =
              activeView === item.id ||
              visibleSubItems.some((sub) => sub.id === activeView);
            const isSubMenuOpen =
              openSubMenus[item.id] ?? isItemOrSubActive;

            if (isCompact) {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectView(item.id);
                    if (isMobileDrawer) onCloseMobile();
                  }}
                  aria-current={isItemOrSubActive ? 'page' : undefined}
                  title={
                    hasSubItems
                      ? `${item.label} (${visibleSubItems.map((s) => s.label).join(' Â· ')})`
                      : item.label
                  }
                  className={`w-full flex items-center justify-center px-2 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    isItemOrSubActive
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                </button>
              );
            }

            if (!hasSubItems) {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectView(item.id);
                    if (isMobileDrawer) onCloseMobile();
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            }

            return (
              <div key={item.id} className="space-y-1">
                <div
                  className={`w-full flex items-center justify-between rounded-lg text-sm font-medium transition-colors ${
                    isItemOrSubActive
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectView(item.id);
                      setOpenSubMenus((prev) => ({ ...prev, [item.id]: true }));
                      if (isMobileDrawer) onCloseMobile();
                    }}
                    className="flex-1 flex items-center gap-3 px-3 py-2.5 text-left truncate cursor-pointer"
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isItemOrSubActive ? 'text-emerald-400' : 'text-slate-400'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSubMenu(item.id);
                    }}
                    aria-label={
                      isSubMenuOpen
                        ? `Collapse ${item.label} menu`
                        : `Expand ${item.label} menu`
                    }
                    className="p-1.5 mr-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors cursor-pointer"
                  >
                    {isSubMenuOpen ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {isSubMenuOpen && (
                  <div className="ml-4 pl-3.5 border-l border-slate-800 space-y-1 py-0.5">
                    {visibleSubItems.map((sub) => {
                      const SubIcon = sub.icon;
                      const isSubActive = activeView === sub.id;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => {
                            onSelectView(sub.id);
                            if (isMobileDrawer) onCloseMobile();
                          }}
                          aria-current={isSubActive ? 'page' : undefined}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                            isSubActive
                              ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                              : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                          }`}
                        >
                          <SubIcon
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isSubActive ? 'text-white' : 'text-slate-400'
                            }`}
                          />
                          <span className="truncate">{sub.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer / User & Demo Architecture Info */}
        <div className="p-3 border-t border-slate-800 shrink-0 space-y-2">
          {!isCompact && (
            <div className="px-2 py-1.5 text-xs text-slate-400">
              <p className="font-medium text-slate-200 truncate">
                {currentUser.fullName}
              </p>
              <p className="text-slate-400 truncate mt-0.5">
                {currentUser.roleLabel}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign Out of Demo Session"
            title={isCompact ? 'Sign Out (Demo)' : undefined}
            className={`w-full flex items-center ${
              isCompact ? 'justify-center px-2' : 'gap-2.5 px-3'
            } py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors whitespace-nowrap`}
          >
            <LogOut className="w-4 h-4 text-slate-400 shrink-0" />
            {!isCompact && <span>Sign Out (Demo)</span>}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop & Tablet Sidebar (Compact rail or expanded) */}
      <aside
        className={`hidden md:block shrink-0 transition-all duration-150 border-r border-slate-800 ${
          collapsed ? 'w-18' : 'w-64'
        }`}
      >
        {renderNavContent(false)}
      </aside>

      {/* Mobile Overlay Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex animate-in fade-in duration-200">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] h-full z-10 shadow-2xl">
            {renderNavContent(true)}
          </aside>
        </div>
      )}
    </>
  );
};

