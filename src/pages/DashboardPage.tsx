import React, { useState } from 'react';
import {
  ShoppingCart,
  Package,
  ReceiptText,
  AlertTriangle,
  ArrowUpRight,
  Clock,
  Banknote,
  CreditCard,
  TrendingUp,
  Info,
  Store,
  Users,
  Key,
  CheckCircle2,
} from 'lucide-react';
import {
  AppView,
  Business,
  Product,
  SaleTransaction,
  Shop,
  User,
} from '../types/pos';
import {
  canActorResetUserPassword,
  canUserAccessView,
  formatCurrency,
  getShopDashboardMetrics,
  getTodayYmd,
} from '../utils/posCalculations';
import { UserPasswordModal } from '../components/common/UserPasswordModal';

interface DashboardPageProps {
  business: Business;
  shop: Shop;
  currentUser?: User;
  businessUsers?: User[];
  businessShops?: Shop[];
  shopProducts: Product[];
  shopSales: SaleTransaction[];
  pendingSyncCount: number;
  dataMode?: 'live' | 'offline_live' | 'demo';
  onNavigate: (view: AppView) => void;
  onSelectTransaction: (sale: SaleTransaction) => void;
  onResetUserPassword?: (userId: string, newPassword: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  business,
  shop,
  currentUser,
  businessUsers = [],
  businessShops = [],
  shopProducts,
  shopSales,
  pendingSyncCount,
  dataMode = 'live',
  onNavigate,
  onSelectTransaction,
  onResetUserPassword,
}) => {
  const isDemo = dataMode === 'demo';
  const [passwordTargetUser, setPasswordTargetUser] = useState<User | null>(
    null
  );
  const [passwordFeedback, setPasswordFeedback] = useState<string | null>(null);

  const registeredUsersUnderOwner = React.useMemo(
    () =>
      businessUsers.filter(
        (u) => u.businessId === business.id && u.role !== 'platform_admin'
      ),
    [businessUsers, business.id]
  );
  const todayYmd = getTodayYmd();
  const metrics = getShopDashboardMetrics(shop, shopProducts, shopSales, todayYmd);
  const symbol = business.currencySymbol;

  const todaysShopSales = React.useMemo(
    () => shopSales.filter((s) => (s.createdAt || '').slice(0, 10) === todayYmd),
    [shopSales, todayYmd]
  );

  const lowStockProducts = shopProducts.filter(
    (p) => p.isActive && p.stockQuantity <= p.reorderLevel
  );

  // Compute sales activity breakdown by category within this shop
  const categoryBreakdownMap = new Map<
    string,
    { name: string; unitsSold: number; revenue: number }
  >();
  shopSales.forEach((sale) => {
    if (sale.status === 'voided_demo' || sale.status === 'refunded_demo') return;
    sale.items.forEach((line) => {
      const product = shopProducts.find((p) => p.id === line.productId);
      const catName = product?.categoryName ?? 'General Merchandise';
      const existing = categoryBreakdownMap.get(catName) ?? {
        name: catName,
        unitsSold: 0,
        revenue: 0,
      };
      existing.unitsSold += line.quantity;
      existing.revenue += line.lineTotal;
      categoryBreakdownMap.set(catName, existing);
    });
  });

  const categoryActivity = Array.from(categoryBreakdownMap.values()).sort(
    (a, b) => b.revenue - a.revenue
  );

  return (
    <div className="p-3.5 sm:p-5 lg:p-6 space-y-4 sm:space-y-6 max-w-[1440px] mx-auto">
      {/* Data Source Context Banner & Quick Shop Actions */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${
              isDemo
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}
          >
            <Info className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs text-slate-500">
              <span
                className={`font-semibold ${
                  isDemo ? 'text-amber-800' : 'text-emerald-800'
                }`}
              >
                {dataMode === 'live'
                  ? 'Live Cloud Repository'
                  : dataMode === 'offline_live'
                  ? 'Offline Cached Live Repository'
                  : 'Demo Notice'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="truncate">Scope: {shop.name}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{shop.code}</span>
            </div>
            <p className="text-xs text-slate-600 mt-1 line-clamp-2 sm:line-clamp-none">
              {isDemo ? (
                <>
                  All figures below represent isolated sample data for{' '}
                  <strong>{shop.name}</strong>.
                </>
              ) : (
                <>
                  Displaying verified live figures for{' '}
                  <strong>{shop.name}</strong> ({shopProducts.length} SKU
                  {shopProducts.length === 1 ? '' : 's'}, {todaysShopSales.length}{' '}
                  sale{todaysShopSales.length === 1 ? '' : 's'} today, {shopSales.length} total).
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0">
          {(!currentUser || canUserAccessView(currentUser, 'pos')) && (
            <button
              type="button"
              onClick={() => onNavigate('pos')}
              className="px-3.5 sm:px-4 py-2 min-h-[40px] sm:min-h-0 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 shadow-xs cursor-pointer whitespace-nowrap"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>Open Point of Sale</span>
            </button>
          )}
          {(!currentUser || canUserAccessView(currentUser, 'inventory')) && (
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="px-3 sm:px-3.5 py-2 min-h-[40px] sm:min-h-0 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Package className="w-3.5 h-3.5 text-slate-500" />
              <span>
                {shopProducts.length === 0
                  ? 'Add Your First Product'
                  : 'Manage Inventory'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* 6 Required Summary Cards */}
      <section
        aria-label="Shop Summary Metrics"
        className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-4"
      >
        {/* 1. Today's Sales */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="truncate">Today&apos;s Sales</span>
            <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
          </div>
          <p className="text-lg sm:text-xl font-display font-bold font-mono tabular-nums text-slate-900 mt-1.5 sm:mt-2 truncate">
            {formatCurrency(metrics.todaysSalesTotal, symbol)}
          </p>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-1 truncate">
            Tax: {shop.taxRatePercent}% · {shop.code}
          </p>
        </div>

        {/* 2. Number of Transactions */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Transactions</span>
            <ReceiptText className="w-4 h-4 text-slate-500" />
          </div>
          <p className="text-xl font-display font-bold font-mono tabular-nums text-slate-900 mt-2">
            {metrics.transactionCount}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Terminal {shop.terminalId}
          </p>
        </div>

        {/* 3. Cash Sales */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Cash Sales</span>
            <Banknote className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl font-display font-bold font-mono tabular-nums text-slate-900 mt-2">
            {formatCurrency(metrics.cashSalesTotal, symbol)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Drawer cash receipts
          </p>
        </div>

        {/* 4. Transfer & Other Payment Totals */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Transfer &amp; POS Card</span>
            <CreditCard className="w-4 h-4 text-slate-500" />
          </div>
          <p className="text-xl font-display font-bold font-mono tabular-nums text-slate-900 mt-2">
            {formatCurrency(metrics.transferAndOtherTotal, symbol)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Non-cash settlements
          </p>
        </div>

        {/* 5. Low-Stock Products */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Low-Stock Products</span>
            <AlertTriangle
              className={`w-4 h-4 ${
                metrics.lowStockCount > 0 ? 'text-amber-600' : 'text-slate-400'
              }`}
            />
          </div>
          <p className="text-xl font-display font-bold font-mono tabular-nums text-slate-900 mt-2">
            {metrics.lowStockCount}{' '}
            <span className="text-xs font-sans font-normal text-slate-500">
              of {shopProducts.length} SKUs
            </span>
          </p>
          <p className="text-xs text-amber-700 mt-1">
            {shopProducts.length === 0
              ? 'No products added yet'
              : metrics.lowStockCount > 0
              ? 'At or below reorder level'
              : 'All stock levels healthy'}
          </p>
        </div>

        {/* 6. Pending Synchronization Count */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Pending Sync Queue</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-xl font-display font-bold font-mono tabular-nums text-slate-900 mt-2">
            {pendingSyncCount}{' '}
            <span className="text-xs font-sans font-normal text-slate-500">
              waiting
            </span>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Last sync: {shop.lastSyncedAt}
          </p>
        </div>
      </section>

      {/* Main Two-Column Grid: Recent Transactions + Inventory Alerts & Sales Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Columns: Recent Transactions & Sales Activity */}
        <div className="lg:col-span-7 space-y-6">
          {/* Recent Transactions */}
          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-display font-bold text-slate-900">
                  {isDemo
                    ? "Today's Shop Transactions (Demo Data)"
                    : "Today's Shop Transactions"}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Receipts recorded today ({todayYmd}) at {shop.name}
                </p>
              </div>
              {(!currentUser || canUserAccessView(currentUser, 'sales')) && (
                <button
                  type="button"
                  onClick={() => onNavigate('sales')}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                >
                  <span>View Full History</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {todaysShopSales.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm font-medium text-slate-700">
                  {isDemo
                    ? `No demonstration transactions recorded for this shop today (${todayYmd}).`
                    : `No sales transactions recorded for this shop today (${todayYmd}).`}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigate('pos')}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    {isDemo ? 'Create Demo Sale in POS' : 'Open Point of Sale'}
                  </button>
                  {(!currentUser || canUserAccessView(currentUser, 'sales')) && (
                    <button
                      type="button"
                      onClick={() => onNavigate('sales')}
                      className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      View Past Sales History
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Desktop & Tablet Table (sm and up) */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[500px]">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/70 text-xs text-slate-500">
                        <th className="py-2.5 px-3 font-medium">Receipt #</th>
                        <th className="py-2.5 px-3 font-medium">Time</th>
                        <th className="py-2.5 px-3 font-medium">Cashier</th>
                        <th className="py-2.5 px-3 font-medium">Payment</th>
                        <th className="py-2.5 px-3 font-medium text-right">Total</th>
                        <th className="py-2.5 px-3 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {todaysShopSales.slice(0, 8).map((sale) => (
                        <tr
                          key={sale.id}
                          className="hover:bg-slate-50/80 transition-colors"
                        >
                          <td className="py-3 px-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                            {sale.receiptNumber}
                          </td>
                          <td className="py-3 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                            {sale.createdAt.includes(' ')
                              ? sale.createdAt.split(' ').slice(1).join(' ')
                              : sale.createdAt}
                          </td>
                          <td className="py-3 px-3 text-slate-700 whitespace-nowrap">
                            {sale.cashierName}
                          </td>
                          <td className="py-3 px-3 text-slate-600 capitalize whitespace-nowrap">
                            {sale.paymentMethod.replace('_', ' ')}
                          </td>
                          <td className="py-3 px-3 font-mono tabular-nums font-semibold text-slate-900 text-right whitespace-nowrap">
                            {formatCurrency(sale.totalAmount, symbol)}
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                onSelectTransaction(sale);
                                onNavigate('sales');
                              }}
                              className="text-emerald-700 hover:text-emerald-900 font-semibold cursor-pointer py-1 px-1.5 rounded"
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card List (< sm) */}
                <div className="sm:hidden divide-y divide-slate-100 text-xs">
                  {todaysShopSales.slice(0, 8).map((sale) => (
                    <div key={sale.id} className="p-3.5 space-y-2 hover:bg-slate-50/80 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-slate-900">{sale.receiptNumber}</span>
                        <span className="font-mono tabular-nums font-bold text-emerald-700 text-sm">
                          {formatCurrency(sale.totalAmount, symbol)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-500 text-[11px]">
                        <span>{sale.cashierName} · <span className="capitalize">{sale.paymentMethod.replace('_', ' ')}</span></span>
                        <span className="font-mono">
                          {sale.createdAt.includes(' ')
                            ? sale.createdAt.split(' ').slice(1).join(' ')
                            : sale.createdAt}
                        </span>
                      </div>
                      <div className="pt-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectTransaction(sale);
                            onNavigate('sales');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold min-h-[38px] flex items-center justify-center cursor-pointer"
                        >
                          Inspect Receipt
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Sales Activity Breakdown */}
          <section className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-display font-bold text-slate-900">
                  {isDemo
                    ? 'Sales Activity by Category (Demo Data)'
                    : 'Sales Activity by Category'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Category contribution for {shop.name}
                </p>
              </div>
              {(!currentUser || canUserAccessView(currentUser, 'reports')) && (
                <button
                  type="button"
                  onClick={() => onNavigate('reports')}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                >
                  <span>Open Reports</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {categoryActivity.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                No category sales activity recorded yet.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {categoryActivity.map((cat) => {
                  const pct =
                    metrics.todaysSalesTotal > 0
                      ? Math.min(
                          100,
                          Math.round((cat.revenue / metrics.todaysSalesTotal) * 100)
                        )
                      : 0;
                  return (
                    <div key={cat.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-800">
                          {cat.name}
                        </span>
                        <span className="font-mono tabular-nums text-slate-600">
                          {cat.unitsSold} units ·{' '}
                          <strong className="text-slate-900">
                            {formatCurrency(cat.revenue, symbol)}
                          </strong>
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 rounded-full"
                          style={{ width: `${Math.max(8, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right 5 Columns: Inventory Alerts & Shop Context */}
        <div className="lg:col-span-5 space-y-6">
          {/* Low-Stock Inventory Alerts */}
          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-display font-bold text-slate-900">
                  Low-Stock Inventory Alerts
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Products in {shop.code} at or below reorder threshold
                </p>
              </div>
              {(!currentUser || canUserAccessView(currentUser, 'inventory')) && (
                <button
                  type="button"
                  onClick={() => onNavigate('inventory')}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                >
                  Adjust Stock
                </button>
              )}
            </div>

            {lowStockProducts.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                All active products in {shop.name} are above their reorder levels.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {lowStockProducts.map((product) => (
                  <div
                    key={product.id}
                    className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/70"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        {product.name}
                      </p>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">
                        SKU: {product.sku} · {product.categoryName}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono tabular-nums font-bold text-amber-700">
                        {product.stockQuantity} {product.unit}s left
                      </p>
                      <p className="text-xs font-mono tabular-nums text-slate-400">
                        Reorder at ≤ {product.reorderLevel}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Shop Isolation & Valuation Card */}
          <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
              <Store className="w-4 h-4 text-emerald-700" />
              <span>Shop Catalogue &amp; Valuation Summary</span>
            </div>
            <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Shop Name &amp; Code</span>
                <span className="font-semibold text-slate-800">
                  {shop.name} ({shop.code})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Isolated Active SKUs</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {shopProducts.length} products
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Stock Retail Valuation</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {formatCurrency(metrics.inventoryRetailValue, symbol)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Stock Cost Valuation</span>
                <span className="font-mono tabular-nums text-slate-700">
                  {formatCurrency(metrics.inventoryCostValue, symbol)}
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Users Registered Under This Business Owner (Displayed on Business Dashboard) */}
      {registeredUsersUnderOwner.length > 0 && (
        <section
          aria-label="Users Registered Under Business Owner"
          className="bg-white rounded-xl border border-slate-200 overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-900 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-display font-bold text-slate-900">
                  Users Registered Under {business.name} ({registeredUsersUnderOwner.length})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  All staff and operator accounts registered under Business Owner <strong>{business.ownerName}</strong>
                </p>
              </div>
            </div>
            {(!currentUser || canUserAccessView(currentUser, 'staff')) && (
              <button
                type="button"
                onClick={() => onNavigate('staff')}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer self-start sm:self-auto"
              >
                <span>Manage Staff &amp; Permissions</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {passwordFeedback && (
            <div
              role="status"
              className="mx-5 mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3 text-xs text-emerald-900"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-medium">{passwordFeedback}</span>
              </div>
              <button
                type="button"
                onClick={() => setPasswordFeedback(null)}
                className="text-emerald-700 hover:text-emerald-950 font-semibold cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs min-w-[740px]">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-500">
                  <th className="py-2.5 px-4 font-medium">Full Name &amp; Email</th>
                  <th className="py-2.5 px-4 font-medium">Role</th>
                  <th className="py-2.5 px-4 font-medium">Assigned Shops</th>
                  <th className="py-2.5 px-4 font-medium">Password Status</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                  <th className="py-2.5 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {registeredUsersUnderOwner.map((u) => {
                  const assignedShopNames =
                    u.role === 'business_owner'
                      ? `All Business Shops (${businessShops.length || 1})`
                      : businessShops
                          .filter((s) => u.assignedShopIds.includes(s.id))
                          .map((s) => s.name)
                          .join(', ') || `${u.assignedShopIds.length} shop(s)`;
                  const canResetPwd =
                    Boolean(onResetUserPassword) &&
                    currentUser &&
                    canActorResetUserPassword(currentUser, u);
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-900">{u.fullName}</span>
                        <span className="font-mono text-slate-500 ml-2">({u.email})</span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded font-semibold text-[11px] ${
                            u.role === 'business_owner'
                              ? 'bg-emerald-100 text-emerald-900'
                              : u.role === 'shop_manager'
                              ? 'bg-blue-50 text-blue-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {u.role === 'business_owner'
                            ? 'Business Owner'
                            : u.role === 'shop_manager'
                            ? 'Shop Manager'
                            : 'Cashier'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{assignedShopNames}</td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {u.password ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                            <Key className="w-3 h-3 text-emerald-600" />
                            <span>Custom Set</span>
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] text-slate-500">
                            Default Password
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 font-semibold capitalize ${
                            u.status === 'active' ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              u.status === 'active' ? 'bg-emerald-600' : 'bg-red-600'
                            }`}
                          />
                          {u.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {canResetPwd ? (
                          <button
                            type="button"
                            onClick={() => setPasswordTargetUser(u)}
                            className="px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Key className="w-3 h-3" />
                            <span>
                              {currentUser?.id === u.id
                                ? 'Change Password'
                                : 'Reset Password'}
                            </span>
                          </button>
                        ) : (
                          <span className="text-slate-400 font-mono text-[11px]">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {passwordTargetUser && currentUser && onResetUserPassword && (
        <UserPasswordModal
          targetUser={passwordTargetUser}
          currentUser={currentUser}
          business={business}
          onClose={() => setPasswordTargetUser(null)}
          onSavePassword={(userId, newPwd) => {
            onResetUserPassword(userId, newPwd);
            setPasswordFeedback(
              `Updated password for "${passwordTargetUser.fullName}" (${passwordTargetUser.email}) under ${business.name}.`
            );
          }}
        />
      )}
    </div>
  );
};
