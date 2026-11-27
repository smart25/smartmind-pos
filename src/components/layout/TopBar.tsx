import React from 'react';
import {
  Menu,
  Store,
  UserCheck,
  Building2,
} from 'lucide-react';
import {
  AppView,
  Business,
  ConnectivitySnapshot,
  ConnectivityState,
  Shop,
  User,
} from '../../types/pos';
import { ConnectivityStatusControl } from './ConnectivityStatusControl';
import {
  getVisibleUsersForActor,
  hasPermission,
} from '../../utils/posCalculations';

interface TopBarProps {
  activeView: AppView;
  business: Business;
  activeShop: Shop;
  authorizedShops: Shop[];
  onSwitchShop: (shopId: string) => void;
  onOpenShopDirectory: () => void;
  currentUser: User;
  allUsers: User[];
  onSwitchDemoUser: (userId: string) => void;
  connectivity: ConnectivitySnapshot;
  onChangeConnectivityState: (state: ConnectivityState) => void;
  onOpenMobileSidebar: () => void;
  onTriggerSync?: () => void;
  isSwitchingShop?: boolean;
}

const VIEW_TITLES: Record<AppView, { title: string; subtitle: string }> = {
  platform_admin: {
    title: 'Platform Business Administration',
    subtitle: 'Registered businesses, primary owner assignments & platform governance',
  },
  dashboard: {
    title: 'Shop Dashboard',
    subtitle: 'Isolated daily performance, sales activity & inventory alerts',
  },
  pos: {
    title: 'Point of Sale Terminal',
    subtitle: 'Shop-isolated checkout counter & barcode billing workspace',
  },
  inventory: {
    title: 'Products & Inventory',
    subtitle: 'Shop catalogue, pricing, stock levels & adjustment ledger',
  },
  product_transfer: {
    title: 'Inter-Shop Product Transfer',
    subtitle: 'Transfer inventory between branches, track in-transit items & confirm stock receipt',
  },
  expiring_products: {
    title: 'Expiring Products',
    subtitle: 'Track expiring batches, upcoming expiries, and take immediate risk action',
  },
  generate_barcode: {
    title: 'Generate Barcode',
    subtitle: 'Create scannable barcodes for unlabelled items and print product sticker labels',
  },
  invoices: {
    title: 'Invoicing & Quotations',
    subtitle: 'Generate customer invoices, search products & track payment statuses',
  },
  sales: {
    title: 'Sales & Transaction History',
    subtitle: 'Shop receipts, cashier audit trail & payment verification',
  },
  sales_summary: {
    title: 'Sales Summary',
    subtitle: 'High-level sales totals, cashier performance & payment method breakdowns',
  },
  debt_book: {
    title: 'Customer Debt Book',
    subtitle: 'Overview of credit & deposit transactions, customer balances & credit limits',
  },
  reports: {
    title: 'Business & Shop Reports',
    subtitle: 'Sales summaries, payment breakdowns & inventory valuation',
  },
  suppliers: {
    title: 'Suppliers & Supply Ledger',
    subtitle: 'Manage suppliers, record product supplies, cost prices & supplier balances',
  },
  shops: {
    title: 'Shop Management',
    subtitle: 'Create, inspect, and manage independent shops within this business',
  },
  staff: {
    title: 'Staff & Permission Management',
    subtitle: 'Manage Shop Managers, Cashiers, shop assignments & least-privilege permissions',
  },
  payroll_employees: {
    title: 'Payroll — Employees',
    subtitle: 'Manage employee profiles, start dates, base salaries & bank details',
  },
  payroll_payments: {
    title: 'Payroll — Salary Payments',
    subtitle: 'Run monthly payroll periods, compute PAYE & commissions, and track salary disbursements',
  },
  settings: {
    title: 'System & Shop Settings',
    subtitle: 'Business profile, shop parameters, users, terminals & sync configuration',
  },
};

export const TopBar: React.FC<TopBarProps> = ({
  activeView,
  business,
  activeShop,
  authorizedShops,
  onSwitchShop,
  onOpenShopDirectory,
  currentUser,
  allUsers,
  onSwitchDemoUser,
  connectivity,
  onChangeConnectivityState,
  onOpenMobileSidebar,
  onTriggerSync,
  isSwitchingShop = false,
}) => {
  const viewMeta = VIEW_TITLES[activeView] ?? {
    title: 'Products & Inventory',
    subtitle: 'Shop catalogue, pricing, stock levels & adjustment ledger',
  };

  // Strict tenant and role authorization: only business owners or users with manage_staff permission can see/switch other users
  const visibleBusinessUsers = React.useMemo(
    () => getVisibleUsersForActor(currentUser, allUsers),
    [currentUser, allUsers]
  );

  // Strict role authorization: Only the business owner (or platform admin) can switch accounts.
  // Shop managers and cashiers cannot switch into other users' accounts.
  const canSwitchUser =
    (currentUser.role === 'business_owner' ||
      currentUser.role === 'platform_admin') &&
    visibleBusinessUsers.length > 1;

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between gap-4 shrink-0">
      {/* Left Zone: Mobile menu toggle + Page Title & Business breadcrumb */}
      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          aria-label="Open navigation menu"
          className="md:hidden p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 shrink-0 cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap">
            <span className="sm:hidden font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded text-[10px]">
              {activeShop.code}
            </span>
            <div className="hidden sm:flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="font-medium text-slate-700 truncate max-w-44">{business.name}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-slate-600">
                {activeShop.terminalId}
              </span>
            </div>
          </div>
          <h1 className="text-sm sm:text-base lg:text-lg font-display font-bold text-slate-900 whitespace-nowrap truncate">
            {viewMeta.title}
          </h1>
        </div>
      </div>

      {/* Right Zone: Shop Selector + Connectivity Status + Role Switcher / User Profile */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Authorized Shop Selector */}
        <div className="hidden md:flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
          <Store className="w-4 h-4 text-emerald-700 shrink-0" />
          <label htmlFor="topbar-shop-select" className="sr-only">
            Active Shop
          </label>
          <select
            id="topbar-shop-select"
            aria-label="Active Shop"
            value={activeShop.id}
            disabled={isSwitchingShop}
            onChange={(e) => onSwitchShop(e.target.value)}
            className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer pr-1 max-w-48 truncate disabled:opacity-50"
          >
            {authorizedShops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name} ({shop.code})
              </option>
            ))}
          </select>
          {isSwitchingShop && (
            <span className="text-[10px] text-amber-600 font-medium animate-pulse">Switching...</span>
          )}
          <button
            type="button"
            onClick={onOpenShopDirectory}
            className="text-xs font-medium text-emerald-700 hover:text-emerald-800 pl-2 border-l border-slate-200 whitespace-nowrap"
          >
            All Shops
          </button>
        </div>

        {/* Reusable Connectivity & Sync Status Component */}
        <ConnectivityStatusControl
          snapshot={connectivity}
          onChangeState={onChangeConnectivityState}
          onTriggerSync={onTriggerSync}
          shopName={activeShop.name}
        />

        {/* User Profile & Business User Switcher */}
        <div className="hidden sm:flex items-center gap-2 pl-2.5 border-l border-slate-200">
          <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-display font-bold text-xs shrink-0">
            {currentUser.fullName
              .split(' ')
              .map((part) => part[0])
              .slice(0, 2)
              .join('')}
          </div>
          <div className="text-left hidden xl:block">
            <div className="flex items-center gap-1">
              <UserCheck className="w-3 h-3 text-emerald-700 shrink-0" />
              {canSwitchUser ? (
                <>
                  <label htmlFor="topbar-role-select" className="sr-only">
                    Switch Business Operator
                  </label>
                  <select
                    id="topbar-role-select"
                    aria-label="Switch Business Operator"
                    value={currentUser.id}
                    onChange={(e) => onSwitchDemoUser(e.target.value)}
                    className="text-xs font-semibold text-slate-900 bg-transparent focus:outline-none cursor-pointer max-w-48 truncate"
                  >
                    {visibleBusinessUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.roleLabel})
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <span className="text-xs font-semibold text-slate-900 truncate max-w-48">
                  {currentUser.fullName}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 leading-tight truncate max-w-48">
              {currentUser.roleLabel}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};
