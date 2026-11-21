import React, { useState, useMemo } from 'react';
import {
  CalendarClock,
  Search,
  AlertCircle,
  Calendar,
  AlertTriangle,
  Clock,
  ArrowUpDown,
  Edit3,
  RotateCcw,
  Download,
  Filter,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Package,
  X,
} from 'lucide-react';
import {
  Business,
  Product,
  ProductCategory,
  Shop,
  StockAdjustmentType,
  User,
} from '../types/pos';
import {
  formatCurrency,
  getTodayYmd,
  formatReportDateRangeDmy,
} from '../utils/posCalculations';

export type ExpiryFilterCategory =
  | 'all'
  | 'expired'
  | 'in_7_days'
  | 'in_8_14_days'
  | 'in_30_days'
  | 'at_risk';

interface ExpiringProductsPageProps {
  currentUser: User;
  activeShop: Shop;
  business: Business;
  products: Product[];
  categories?: ProductCategory[];
  onSaveProduct?: (input: any, editingProductId?: string) => void;
  onRecordStockAdjustment?: (
    productId: string,
    type: StockAdjustmentType,
    quantityDelta: number,
    reason: string
  ) => void;
  onNavigateToInventory?: () => void;
}

/**
 * Calculates calendar days difference between an expiry date (YYYY-MM-DD) and today.
 * Negative number = expired in the past.
 * 0 = expires today.
 * Positive number = days until expiration.
 */
export function getDaysUntilExpiry(expiryDateStr: string, todayYmd: string): number {
  if (!expiryDateStr) return 9999;
  const expParts = expiryDateStr.split('-').map(Number);
  const todayParts = todayYmd.split('-').map(Number);
  if (expParts.length < 3 || todayParts.length < 3) return 9999;

  const expUtc = Date.UTC(expParts[0], expParts[1] - 1, expParts[2]);
  const todayUtc = Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2]);
  return Math.round((expUtc - todayUtc) / (1000 * 60 * 60 * 24));
}

/**
 * Formats YYYY-MM-DD into "3rd Feb, 2026" matching reference software.
 */
export function formatExpiryDisplayDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        const suffix = (d: number) => {
          if (d > 3 && d < 21) return 'th';
          switch (d % 10) {
            case 1:
              return 'st';
            case 2:
              return 'nd';
            case 3:
              return 'rd';
            default:
              return 'th';
          }
        };
        const monthNames = [
          'Jan',
          'Feb',
          'Mar',
          'Apr',
          'May',
          'Jun',
          'Jul',
          'Aug',
          'Sep',
          'Oct',
          'Nov',
          'Dec',
        ];
        return `${day}${suffix(day)} ${monthNames[month]}, ${year}`;
      }
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

/**
 * Returns dynamic greeting based on current hour (Good Morning, Good Afternoon, Good Evening)
 */
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

/**
 * Formats current date like "Mon, 16th November 2026"
 */
function getFormattedCurrentDate(): string {
  const now = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const day = now.getDate();
  const suffix = (d: number) => {
    if (d > 3 && d < 21) return 'th';
    switch (d % 10) {
      case 1:
        return 'st';
      case 2:
        return 'nd';
      case 3:
        return 'rd';
      default:
        return 'th';
    }
  };
  return `${days[now.getDay()]}, ${day}${suffix(day)} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

export const ExpiringProductsPage: React.FC<ExpiringProductsPageProps> = ({
  currentUser,
  activeShop,
  business,
  products,
  categories = [],
  onSaveProduct,
  onRecordStockAdjustment,
  onNavigateToInventory,
}) => {
  const symbol = business.currencySymbol || '₦';
  const todayYmd = useMemo(() => getTodayYmd(), []);

  // Filter States
  const [activeCategoryFilter, setActiveCategoryFilter] =
    useState<ExpiryFilterCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Quick Adjustment Modal State
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [adjustQuantity, setAdjustQuantity] = useState(1);
  const [adjustType, setAdjustType] = useState<StockAdjustmentType>('damage_spoilage');
  const [adjustReason, setAdjustReason] = useState('Product reached expiration date');
  const [actionSuccessNotice, setActionSuccessNotice] = useState<string | null>(null);

  // Edit Expiry Modal State
  const [editingExpiryProduct, setEditingExpiryProduct] = useState<Product | null>(null);
  const [newExpiryDate, setNewExpiryDate] = useState('');

  // 1. All products that have expiry tracking enabled (or have an expiryDate)
  const expiringProducts = useMemo(() => {
    return products.filter((p) => p.hasExpiry && Boolean(p.expiryDate));
  }, [products]);

  // 2. Classify each product with days until expiry and risk metrics
  const classifiedProducts = useMemo(() => {
    return expiringProducts.map((p) => {
      const days = getDaysUntilExpiry(p.expiryDate || '', todayYmd);
      const isExpired = days <= 0;
      const isIn7Days = days >= 1 && days <= 7;
      const isIn8To14Days = days >= 8 && days <= 14;
      const isIn30Days = days >= 15 && days <= 30;
      const isSafe = days > 30;
      const isAtRisk = days <= 14; // expired or expiring in <= 14 days

      const valueAtRisk = (p.costPrice || 0) * (p.stockQuantity || 0);

      let statusBadge = {
        label: 'Expired',
        badgeBg: 'bg-rose-50 text-rose-800 border-rose-200',
        relativeText: days === 0 ? 'Expires Today' : `Expired ${Math.abs(days)}d ago`,
        isExpired: true,
      };

      if (isIn7Days) {
        statusBadge = {
          label: 'Expiring in 7 Days',
          badgeBg: 'bg-amber-50 text-amber-900 border-amber-200',
          relativeText: days === 1 ? 'Expires Tomorrow' : `In ${days} days`,
          isExpired: false,
        };
      } else if (isIn8To14Days) {
        statusBadge = {
          label: 'Expiring in 8-14 Days',
          badgeBg: 'bg-emerald-50 text-emerald-900 border-emerald-200',
          relativeText: `In ${days} days`,
          isExpired: false,
        };
      } else if (isIn30Days) {
        statusBadge = {
          label: 'Expiring in 30 Days',
          badgeBg: 'bg-sky-50 text-sky-900 border-sky-200',
          relativeText: `In ${days} days`,
          isExpired: false,
        };
      } else if (isSafe) {
        statusBadge = {
          label: 'Good (> 30d)',
          badgeBg: 'bg-slate-100 text-slate-700 border-slate-200',
          relativeText: `In ${days} days`,
          isExpired: false,
        };
      }

      return {
        ...p,
        daysUntilExpiry: days,
        isExpired,
        isIn7Days,
        isIn8To14Days,
        isIn30Days,
        isSafe,
        isAtRisk,
        valueAtRisk,
        statusBadge,
      };
    });
  }, [expiringProducts, todayYmd]);

  // 3. Aggregate Summary Cards Metrics
  const summaryMetrics = useMemo(() => {
    let expiredCount = 0;
    let in7DaysCount = 0;
    let in8To14DaysCount = 0;
    let in30DaysCount = 0;
    let totalValueAtRisk = 0;

    classifiedProducts.forEach((p) => {
      if (p.isExpired) expiredCount++;
      if (p.isIn7Days) in7DaysCount++;
      if (p.isIn8To14Days) in8To14DaysCount++;
      if (p.isIn30Days) in30DaysCount++;
      if (p.isAtRisk) {
        totalValueAtRisk += p.valueAtRisk;
      }
    });

    return {
      expiredCount,
      in7DaysCount,
      in8To14DaysCount,
      in30DaysCount,
      totalValueAtRisk,
      totalTracked: classifiedProducts.length,
    };
  }, [classifiedProducts]);

  // 4. Filter products based on search, category, and active card click
  const filteredProducts = useMemo(() => {
    return classifiedProducts.filter((p) => {
      // Category filter
      if (selectedCategoryId !== 'all' && p.categoryId !== selectedCategoryId) {
        return false;
      }

      // Card / Bucket Filter
      if (activeCategoryFilter === 'expired' && !p.isExpired) return false;
      if (activeCategoryFilter === 'in_7_days' && !p.isIn7Days) return false;
      if (activeCategoryFilter === 'in_8_14_days' && !p.isIn8To14Days) return false;
      if (activeCategoryFilter === 'in_30_days' && !p.isIn30Days) return false;
      if (activeCategoryFilter === 'at_risk' && !p.isAtRisk) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = p.name.toLowerCase().includes(q);
        const matchSku = p.sku.toLowerCase().includes(q);
        const matchBarcode = p.barcode?.toLowerCase().includes(q);
        const matchCat = p.categoryName?.toLowerCase().includes(q);
        if (!matchName && !matchSku && !matchBarcode && !matchCat) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  }, [classifiedProducts, activeCategoryFilter, selectedCategoryId, searchQuery]);

  // 5. Pagination
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(start, start + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  const handleSelectFilterCard = (filter: ExpiryFilterCategory) => {
    setActiveCategoryFilter((prev) => (prev === filter ? 'all' : filter));
    setCurrentPage(1);
  };

  const handleExportCsv = () => {
    if (filteredProducts.length === 0) return;
    const headers = [
      'Product Name',
      'SKU',
      'Barcode',
      'Category',
      'Stock',
      'Unit',
      'Expiry Date',
      'Days Remaining',
      'Status',
      'Cost Price',
      'Selling Price',
      'Value at Risk',
    ];

    const rows = filteredProducts.map((p) => [
      `"${p.name.replace(/"/g, '""')}"`,
      p.sku,
      p.barcode || '',
      `"${p.categoryName || 'General'}"`,
      p.stockQuantity,
      p.unit,
      p.expiryDate || '',
      p.daysUntilExpiry,
      p.statusBadge.label,
      p.costPrice.toFixed(2),
      p.sellingPrice.toFixed(2),
      p.valueAtRisk.toFixed(2),
    ]);

    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Expiring_Products_${activeShop.code}_${todayYmd}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExecuteStockAdjustment = () => {
    if (!adjustingProduct || !onRecordStockAdjustment) return;
    if (adjustQuantity <= 0) return;

    onRecordStockAdjustment(
      adjustingProduct.id,
      adjustType,
      -Math.abs(adjustQuantity), // reduce stock
      adjustReason || 'Expired stock adjustment'
    );

    setActionSuccessNotice(
      `Successfully adjusted ${adjustQuantity} ${adjustingProduct.unit} of ${adjustingProduct.name}.`
    );
    setAdjustingProduct(null);
    setTimeout(() => setActionSuccessNotice(null), 4000);
  };

  const handleSaveUpdatedExpiryDate = () => {
    if (!editingExpiryProduct || !onSaveProduct) return;
    if (!newExpiryDate) return;

    onSaveProduct(
      {
        name: editingExpiryProduct.name,
        sku: editingExpiryProduct.sku,
        barcode: editingExpiryProduct.barcode,
        categoryId: editingExpiryProduct.categoryId,
        unit: editingExpiryProduct.unit,
        costPrice: editingExpiryProduct.costPrice,
        sellingPrice: editingExpiryProduct.sellingPrice,
        stockQuantity: editingExpiryProduct.stockQuantity,
        reorderLevel: editingExpiryProduct.reorderLevel,
        hasExpiry: true,
        expiryDate: newExpiryDate,
      },
      editingExpiryProduct.id
    );

    setActionSuccessNotice(
      `Updated expiration date for ${editingExpiryProduct.name} to ${newExpiryDate}.`
    );
    setEditingExpiryProduct(null);
    setTimeout(() => setActionSuccessNotice(null), 4000);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header & Dynamic Greeting */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
              Expiring Products
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              {activeShop.name} ({activeShop.code})
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {getGreeting()} — {getFormattedCurrentDate()}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {filteredProducts.length > 0 && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 shadow-2xs transition-all cursor-pointer"
              title="Export Expiring Products CSV"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export CSV</span>
            </button>
          )}

          {onNavigateToInventory && (
            <button
              type="button"
              onClick={onNavigateToInventory}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-all cursor-pointer"
            >
              <Package className="w-3.5 h-3.5" />
              <span>Products Catalogue</span>
            </button>
          )}
        </div>
      </div>

      {actionSuccessNotice && (
        <div
          role="status"
          className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800 flex items-center justify-between gap-2 shadow-2xs animate-in fade-in"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccessNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccessNotice(null)}
            className="text-emerald-700 hover:text-emerald-900 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 2. Top Summary Metrics Cards (The "Click Columns" from reference software) */}
      <section aria-label="Expiration Summary Cards">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {/* CARD 1: EXPIRED */}
          <button
            type="button"
            onClick={() => handleSelectFilterCard('expired')}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
              activeCategoryFilter === 'expired'
                ? 'bg-rose-100/80 border-rose-400 ring-2 ring-rose-500 shadow-sm'
                : 'bg-rose-50/70 hover:bg-rose-100/60 border-rose-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-800">
                EXPIRED
              </span>
              <AlertCircle className="w-4 h-4 text-rose-500" />
            </div>
            <div className="mt-2.5">
              <span className="text-3xl font-extrabold font-mono text-rose-800">
                {summaryMetrics.expiredCount}
              </span>
              <p className="text-[10px] text-rose-700 mt-0.5">
                {activeCategoryFilter === 'expired' ? 'Filtering active' : 'Click to view'}
              </p>
            </div>
          </button>

          {/* CARD 2: EXPIRING IN 7 DAYS */}
          <button
            type="button"
            onClick={() => handleSelectFilterCard('in_7_days')}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
              activeCategoryFilter === 'in_7_days'
                ? 'bg-amber-100/90 border-amber-400 ring-2 ring-amber-500 shadow-sm'
                : 'bg-amber-50/70 hover:bg-amber-100/60 border-amber-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-900">
                EXPIRING IN 7 DAYS
              </span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div className="mt-2.5">
              <span className="text-3xl font-extrabold font-mono text-amber-900">
                {summaryMetrics.in7DaysCount}
              </span>
              <p className="text-[10px] text-amber-800 mt-0.5">
                {activeCategoryFilter === 'in_7_days' ? 'Filtering active' : 'Click to view'}
              </p>
            </div>
          </button>

          {/* CARD 3: EXPIRING IN 8-14 DAYS */}
          <button
            type="button"
            onClick={() => handleSelectFilterCard('in_8_14_days')}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
              activeCategoryFilter === 'in_8_14_days'
                ? 'bg-emerald-100/90 border-emerald-400 ring-2 ring-emerald-500 shadow-sm'
                : 'bg-emerald-50/70 hover:bg-emerald-100/60 border-emerald-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-900">
                EXPIRING IN 8-14 DAYS
              </span>
              <Calendar className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-2.5">
              <span className="text-3xl font-extrabold font-mono text-emerald-900">
                {summaryMetrics.in8To14DaysCount}
              </span>
              <p className="text-[10px] text-emerald-800 mt-0.5">
                {activeCategoryFilter === 'in_8_14_days' ? 'Filtering active' : 'Click to view'}
              </p>
            </div>
          </button>

          {/* CARD 4: EXPIRING IN 30 DAYS */}
          <button
            type="button"
            onClick={() => handleSelectFilterCard('in_30_days')}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
              activeCategoryFilter === 'in_30_days'
                ? 'bg-sky-100/90 border-sky-400 ring-2 ring-sky-500 shadow-sm'
                : 'bg-sky-50/70 hover:bg-sky-100/60 border-sky-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-sky-900">
                EXPIRING IN 30 DAYS
              </span>
              <CalendarClock className="w-4 h-4 text-sky-600" />
            </div>
            <div className="mt-2.5">
              <span className="text-3xl font-extrabold font-mono text-sky-900">
                {summaryMetrics.in30DaysCount}
              </span>
              <p className="text-[10px] text-sky-800 mt-0.5">
                {activeCategoryFilter === 'in_30_days' ? 'Filtering active' : 'Click to view'}
              </p>
            </div>
          </button>

          {/* CARD 5: VALUE AT RISK (<=14D & Expired) */}
          <button
            type="button"
            onClick={() => handleSelectFilterCard('at_risk')}
            className={`col-span-2 md:col-span-4 lg:col-span-1 p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
              activeCategoryFilter === 'at_risk'
                ? 'bg-slate-200/90 border-slate-400 ring-2 ring-slate-600 shadow-sm'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-800">
                VALUE AT RISK (≤14D)
              </span>
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="mt-2.5">
              <span className="text-xl font-bold font-mono text-slate-900 tabular-nums">
                {formatCurrency(summaryMetrics.totalValueAtRisk, symbol)}
              </span>
              <p className="text-[10px] text-slate-600 mt-0.5">
                {activeCategoryFilter === 'at_risk' ? 'Filtering at-risk' : 'Cost value at risk'}
              </p>
            </div>
          </button>
        </div>
      </section>

      {/* 3. Search Bar & Filter Controls Bar */}
      <section
        aria-label="Expiring Products Filter Bar"
        className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3"
      >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search name, barcode, or SKU..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
            />
          </div>

          {/* Category Dropdown Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={selectedCategoryId}
              onChange={(e) => {
                setSelectedCategoryId(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-600"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Active Filter Pill & Reset */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">
              {filteredProducts.length} of {summaryMetrics.totalTracked} products
            </span>
            {(activeCategoryFilter !== 'all' ||
              searchQuery ||
              selectedCategoryId !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setActiveCategoryFilter('all');
                  setSearchQuery('');
                  setSelectedCategoryId('all');
                  setCurrentPage(1);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Quick Pills */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-100">
          <span className="text-[11px] font-semibold text-slate-500 mr-1">Quick View:</span>
          <button
            type="button"
            onClick={() => handleSelectFilterCard('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeCategoryFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            All With Expiry ({summaryMetrics.totalTracked})
          </button>
          <button
            type="button"
            onClick={() => handleSelectFilterCard('expired')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeCategoryFilter === 'expired'
                ? 'bg-rose-700 text-white'
                : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
            }`}
          >
            Expired ({summaryMetrics.expiredCount})
          </button>
          <button
            type="button"
            onClick={() => handleSelectFilterCard('in_7_days')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeCategoryFilter === 'in_7_days'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
            }`}
          >
            ≤ 7 Days ({summaryMetrics.in7DaysCount})
          </button>
          <button
            type="button"
            onClick={() => handleSelectFilterCard('in_8_14_days')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeCategoryFilter === 'in_8_14_days'
                ? 'bg-emerald-700 text-white'
                : 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
            }`}
          >
            8-14 Days ({summaryMetrics.in8To14DaysCount})
          </button>
          <button
            type="button"
            onClick={() => handleSelectFilterCard('in_30_days')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeCategoryFilter === 'in_30_days'
                ? 'bg-sky-700 text-white'
                : 'bg-sky-50 text-sky-900 hover:bg-sky-100'
            }`}
          >
            15-30 Days ({summaryMetrics.in30DaysCount})
          </button>
        </div>
      </section>

      {/* 4. Products Table (1:1 with reference software) */}
      <section
        aria-label="Expiring Products Table"
        className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm min-w-[840px]">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider">
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-center">Stock</th>
                <th className="py-3 px-4">Expiry Date</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Cost Price</th>
                <th className="py-3 px-4 text-right">Value at Risk</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <div className="max-w-sm mx-auto space-y-2">
                      <CalendarClock className="w-8 h-8 text-slate-300 mx-auto" />
                      <p className="text-sm font-semibold text-slate-700">
                        {summaryMetrics.totalTracked === 0
                          ? 'No products with expiration dates found'
                          : 'No products match the selected expiration filter'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {summaryMetrics.totalTracked === 0
                          ? "Toggle on 'Track Product Expiration Date' when adding or editing products in the Products Catalogue to view them here."
                          : 'Try selecting a different filter card above or clearing your search filter.'}
                      </p>
                      {activeCategoryFilter !== 'all' && (
                        <button
                          type="button"
                          onClick={() => setActiveCategoryFilter('all')}
                          className="mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 cursor-pointer"
                        >
                          View All With Expiry ({summaryMetrics.totalTracked})
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedProducts.map((p, idx) => (
                  <tr
                    key={p.id}
                    className={`transition-colors hover:bg-slate-50/80 ${
                      idx % 2 === 1 ? 'bg-slate-50/30' : 'bg-white'
                    }`}
                  >
                    {/* Product Name & Barcode/SKU */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 leading-snug">
                        {p.name}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                        {p.barcode ? p.barcode : p.sku}
                        {p.barcode && p.sku !== p.barcode && (
                          <span className="text-slate-400"> · {p.sku}</span>
                        )}
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3.5 px-4">
                      <span className="text-xs font-medium uppercase tracking-wider text-slate-600">
                        {p.categoryName || '—'}
                      </span>
                    </td>

                    {/* Stock */}
                    <td className="py-3.5 px-4 text-center font-mono tabular-nums font-semibold text-slate-800">
                      {p.stockQuantity}{' '}
                      <span className="text-[11px] font-normal text-slate-500">
                        {p.unit}
                      </span>
                    </td>

                    {/* Expiry Date */}
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900">
                        {formatExpiryDisplayDate(p.expiryDate)}
                      </div>
                      <div
                        className={`text-[11px] font-semibold ${
                          p.isExpired
                            ? 'text-rose-700'
                            : p.isIn7Days
                            ? 'text-amber-700'
                            : p.isIn8To14Days
                            ? 'text-emerald-700'
                            : 'text-slate-500'
                        }`}
                      >
                        {p.statusBadge.relativeText}
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold border ${p.statusBadge.badgeBg}`}
                      >
                        {p.statusBadge.label}
                      </span>
                    </td>

                    {/* Cost Price */}
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {p.costPrice > 0 ? formatCurrency(p.costPrice, symbol) : '—'}
                    </td>

                    {/* Value at Risk */}
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold">
                      {p.valueAtRisk > 0 ? (
                        <span
                          className={
                            p.isAtRisk
                              ? 'text-rose-700 font-extrabold'
                              : 'text-slate-800'
                          }
                        >
                          {formatCurrency(p.valueAtRisk, symbol)}
                        </span>
                      ) : (
                        <span className="text-slate-400">₦0</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setAdjustingProduct(p);
                            setAdjustQuantity(Math.min(p.stockQuantity, 1));
                            setAdjustType('damage_spoilage');
                            setAdjustReason(
                              p.isExpired
                                ? 'Expired stock write-off'
                                : 'Stock adjustment'
                            );
                          }}
                          className="px-2 py-1 rounded-lg text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 transition-colors cursor-pointer"
                          title="Adjust or write-off expired stock"
                        >
                          Adjust
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingExpiryProduct(p);
                            setNewExpiryDate(p.expiryDate || '');
                          }}
                          className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Edit expiration date"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 5. Pagination Footer (Matching "Page 1 of 3", Next button in sample software) */}
        {filteredProducts.length > 0 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between gap-4 text-xs">
            <span className="text-slate-500 font-medium">
              Showing {(currentPage - 1) * itemsPerPage + 1}–
              {Math.min(currentPage * itemsPerPage, filteredProducts.length)} of{' '}
              {filteredProducts.length} items
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>

              <span className="font-semibold text-slate-800 px-2">
                Page {currentPage} of {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 6. Quick Write-Off / Stock Adjustment Modal */}
      {adjustingProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Adjust Expired / Damaged Stock
                </h3>
                <p className="text-xs text-slate-500">{adjustingProduct.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setAdjustingProduct(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Current Stock:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {adjustingProduct.stockQuantity} {adjustingProduct.unit}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Expiry Date:</span>
                  <span className="font-mono text-slate-700">
                    {formatExpiryDisplayDate(adjustingProduct.expiryDate)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Adjustment Type
                </label>
                <select
                  value={adjustType}
                  onChange={(e) => setAdjustType(e.target.value as StockAdjustmentType)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white text-slate-900"
                >
                  <option value="damage_spoilage">Damage / Spoilage (Expired)</option>
                  <option value="audit_correction">Audit Correction</option>
                  <option value="restock">Restock</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Quantity to Deduct ({adjustingProduct.unit})
                </label>
                <input
                  type="number"
                  min="1"
                  max={adjustingProduct.stockQuantity}
                  value={adjustQuantity}
                  onChange={(e) =>
                    setAdjustQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Reason for Adjustment
                </label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Expired batch disposed"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAdjustingProduct(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteStockAdjustment}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer"
                >
                  Confirm Stock Write-off
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. Quick Update Expiry Date Modal */}
      {editingExpiryProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Update Expiration Date
                </h3>
                <p className="text-xs text-slate-500">{editingExpiryProduct.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingExpiryProduct(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  New Expiration Date
                </label>
                <input
                  type="date"
                  value={newExpiryDate}
                  onChange={(e) => setNewExpiryDate(e.target.value)}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingExpiryProduct(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveUpdatedExpiryDate}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                >
                  Save Expiration Date
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
