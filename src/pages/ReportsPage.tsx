import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  CreditCard,
  Store,
  Package,
  Info,
  TrendingUp,
  Calendar,
  RotateCcw,
  Download,
  FileDown,
  FileSpreadsheet,
  Check,
  Loader2,
  ListFilter,
  User as UserIcon,
  ArrowUpDown,
  Award,
} from 'lucide-react';
import {
  Business,
  Product,
  SaleTransaction,
  Shop,
  User,
} from '../types/pos';
import {
  extractSaleDateYmd,
  filterAndSortSalesHistory,
  formatCurrency,
  getDateRangeBoundsForPreset,
  getShopDashboardMetrics,
  getShopSalesUsers,
  getTodayYmd,
  SalesDateRangePreset,
} from '../utils/posCalculations';
import {
  downloadSalesSummaryPdf,
  formatPaymentMethodLabel,
} from '../utils/pdfGenerator';
import { downloadSalesSummaryCsv } from '../utils/csvGenerator';

interface ReportsPageProps {
  business: Business;
  activeShop: Shop;
  authorizedShops: Shop[];
  currentUser: User;
  businessUsers?: User[];
  allProducts: Product[];
  allSales: SaleTransaction[];
  onSwitchActiveShop: (shopId: string) => void;
}

const REPORT_DATE_PRESETS: { id: SalesDateRangePreset; label: string }[] = [
  { id: 'all', label: 'All Dates' },
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this_week', label: 'Last 7 Days' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_30_days', label: 'Last 30 Days' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'custom', label: 'Custom Range' },
];

export const ReportsPage: React.FC<ReportsPageProps> = ({
  business,
  activeShop,
  authorizedShops,
  currentUser,
  businessUsers = [],
  allProducts,
  allSales,
  onSwitchActiveShop,
}) => {
  const draftStorageKey = `smartmind_reports_draft_${business.id}`;
  const [reportTab, setReportTab] = useState<
    'sales_summary' | 'payment_breakdown' | 'shop_performance' | 'inventory_summary'
  >(() => {
    if (typeof window === 'undefined') return 'sales_summary';
    try {
      const raw =
        window.sessionStorage.getItem(draftStorageKey) ||
        window.localStorage.getItem(draftStorageKey);
      return raw ? JSON.parse(raw).reportTab ?? 'sales_summary' : 'sales_summary';
    } catch {
      return 'sales_summary';
    }
  });

  // User & Date Range Filtering State for Sales Summaries
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [datePreset, setDatePreset] = useState<SalesDateRangePreset>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Table view toggle, PDF & CSV download state
  const [salesTableView, setSalesTableView] = useState<'product_summary' | 'itemized' | 'receipts'>('product_summary');
  const [productSortBy, setProductSortBy] = useState<'quantity' | 'amount' | 'name'>('quantity');
  const [productSortDir, setProductSortDir] = useState<'desc' | 'asc'>('desc');
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);
  const [isDownloadingCsv, setIsDownloadingCsv] = useState<boolean>(false);
  const [csvSuccess, setCsvSuccess] = useState<boolean>(false);

  const todayYmd = useMemo(() => getTodayYmd(), []);
  const yesterdayYmd = useMemo(
    () => getDateRangeBoundsForPreset('yesterday', todayYmd).startDate,
    [todayYmd]
  );

  React.useEffect(() => {
    const serialized = JSON.stringify({
      reportTab,
      selectedUserId,
      datePreset,
      startDate,
      endDate,
    });
    try {
      window.sessionStorage.setItem(draftStorageKey, serialized);
      window.localStorage.setItem(draftStorageKey, serialized);
    } catch {
      // Ignore storage errors
    }
  }, [draftStorageKey, reportTab, selectedUserId, datePreset, startDate, endDate]);

  const symbol = business.currencySymbol;

  const activeShopProducts = useMemo(
    () => allProducts.filter((p) => p.shopId === activeShop.id && p.businessId === business.id),
    [allProducts, activeShop.id, business.id]
  );

  const activeShopSales = useMemo(
    () => allSales.filter((s) => s.shopId === activeShop.id && s.businessId === business.id),
    [allSales, activeShop.id, business.id]
  );

  // Available users/staff in the active shop for filtering Sales Summary
  const shopUsers = useMemo(
    () =>
      getShopSalesUsers(
        activeShopSales,
        businessUsers,
        activeShop.id,
        business.id
      ),
    [activeShopSales, businessUsers, activeShop.id, business.id]
  );

  const selectedUserObj = useMemo(
    () =>
      selectedUserId === 'all'
        ? null
        : shopUsers.find((u) => u.id === selectedUserId) ?? null,
    [selectedUserId, shopUsers]
  );

  // Distinct dates on which sales occurred (for the selected user or all users) for quick single-day selection
  const availableSaleDatesForUser = useMemo(() => {
    const salesForUser =
      selectedUserId === 'all'
        ? activeShopSales
        : activeShopSales.filter(
            (s) =>
              s.cashierUserId === selectedUserId ||
              s.cashierName.toLowerCase() === selectedUserId.toLowerCase()
          );
    const dateSet = new Set<string>();
    salesForUser.forEach((s) => {
      const ymd = extractSaleDateYmd(s.createdAt);
      if (ymd) dateSet.add(ymd);
    });
    return Array.from(dateSet).sort((a, b) => b.localeCompare(a));
  }, [activeShopSales, selectedUserId]);

  // Filter sales based on selected User AND selected Date / Date Range
  const filteredSales = useMemo(() => {
    return filterAndSortSalesHistory(activeShopSales, {
      userId: selectedUserId,
      startDate,
      endDate,
      sortOrder: 'date_desc',
    });
  }, [activeShopSales, selectedUserId, startDate, endDate]);

  // Dynamic Sales Metrics based on filtered sales
  const salesMetrics = useMemo(() => {
    const count = filteredSales.length;
    const total = Math.round(filteredSales.reduce((sum, s) => sum + s.totalAmount, 0) * 100) / 100;
    const avg = count > 0 ? Math.round((total / count) * 100) / 100 : 0;
    const tax = Math.round(filteredSales.reduce((sum, s) => sum + s.taxAmount, 0) * 100) / 100;
    const discount = Math.round(filteredSales.reduce((sum, s) => sum + s.discountAmount, 0) * 100) / 100;
    const unitsSold = filteredSales.reduce(
      (sum, s) => sum + s.items.reduce((iSum, item) => iSum + item.quantity, 0),
      0
    );

    return { count, total, avg, tax, discount, unitsSold };
  }, [filteredSales]);

  // Payment Breakdown based on filtered sales
  const paymentTotals = useMemo(() => {
    const cash = filteredSales
      .filter((s) => s.paymentMethod === 'cash')
      .reduce((sum, s) => sum + s.totalAmount, 0);
    const bankTransfer = filteredSales
      .filter((s) => s.paymentMethod === 'bank_transfer')
      .reduce((sum, s) => sum + s.totalAmount, 0);
    const posCard = filteredSales
      .filter((s) => s.paymentMethod === 'pos_card')
      .reduce((sum, s) => sum + s.totalAmount, 0);

    const cashCount = filteredSales.filter((s) => s.paymentMethod === 'cash').length;
    const bankCount = filteredSales.filter((s) => s.paymentMethod === 'bank_transfer').length;
    const cardCount = filteredSales.filter((s) => s.paymentMethod === 'pos_card').length;

    return {
      cash,
      bankTransfer,
      posCard,
      cashCount,
      bankCount,
      cardCount,
    };
  }, [filteredSales]);

  const activeMetrics = getShopDashboardMetrics(
    activeShop,
    activeShopProducts,
    activeShopSales
  );

  const handleSelectPreset = (preset: SalesDateRangePreset) => {
    setDatePreset(preset);
    if (preset === 'custom') return;
    const bounds = getDateRangeBoundsForPreset(preset, todayYmd);
    setStartDate(bounds.startDate);
    setEndDate(bounds.endDate);
  };

  // Single-day selection handler: sets both startDate and endDate to the chosen day
  const handleSelectSingleDay = (dayYmd: string) => {
    if (!dayYmd) {
      handleSelectPreset('all');
      return;
    }
    setStartDate(dayYmd);
    setEndDate(dayYmd);
    if (dayYmd === todayYmd) {
      setDatePreset('today');
    } else if (dayYmd === yesterdayYmd) {
      setDatePreset('yesterday');
    } else {
      setDatePreset('custom');
    }
  };

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    setDatePreset(val || endDate ? 'custom' : 'all');
  };

  const handleEndDateChange = (val: string) => {
    setEndDate(val);
    setDatePreset(startDate || val ? 'custom' : 'all');
  };

  const handleClearDateFilter = () => {
    setSelectedUserId('all');
    setDatePreset('all');
    setStartDate('');
    setEndDate('');
  };

  const selectedSingleDayValue =
    startDate && endDate && startDate === endDate ? startDate : '';

  const activeRangeSummary = useMemo(() => {
    if (!startDate && !endDate) return 'All Recorded Dates';
    if (startDate && endDate) {
      if (startDate === endDate) {
        if (startDate === todayYmd) return `Today (${startDate})`;
        if (startDate === yesterdayYmd) return `Yesterday (${startDate})`;
        return `Day: ${startDate}`;
      }
      const from = startDate <= endDate ? startDate : endDate;
      const to = startDate <= endDate ? endDate : startDate;
      return `${from} to ${to}`;
    }
    if (startDate) return `From ${startDate} onwards`;
    return `Up to ${endDate}`;
  }, [startDate, endDate, todayYmd, yesterdayYmd]);

  const activeFilterSummaryLabel = useMemo(() => {
    if (selectedUserObj) {
      return `${activeRangeSummary} · User: ${selectedUserObj.fullName}`;
    }
    return activeRangeSummary;
  }, [activeRangeSummary, selectedUserObj]);

  // Compute itemized sales rows matching requested table specification:
  // # | Date & Time | Product Name | Unit of Measurement | Quantity | Amount | Payment Method | Staff
  const itemizedSalesRows = useMemo(() => {
    const productUnitMap = new Map<string, string>();
    allProducts.forEach((p) => {
      if (p.unit) productUnitMap.set(p.id, p.unit);
    });

    let counter = 1;
    return filteredSales.flatMap((sale) =>
      sale.items.map((item) => ({
        index: counter++,
        saleId: sale.id,
        receiptNumber: sale.receiptNumber,
        dateTime: sale.createdAt,
        productName: item.productName,
        unit: item.unit || productUnitMap.get(item.productId) || 'Unit',
        quantity: item.quantity,
        amount: item.lineTotal,
        paymentMethod: formatPaymentMethodLabel(sale.paymentMethod),
        staff: sale.cashierName,
        staffUserId: sale.cashierUserId,
      }))
    );
  }, [filteredSales, allProducts]);

  // Compute aggregated product sales summary (Best Selling Products):
  // Product Name | Unit of Measurement | Total Quantity Sold | Total Amount | Avg. Price | Receipts Count | % of Sales
  const aggregatedProductRows = useMemo(() => {
    const productUnitMap = new Map<string, string>();
    allProducts.forEach((p) => {
      if (p.unit) productUnitMap.set(p.id, p.unit);
    });

    const productMap = new Map<
      string,
      {
        productId: string;
        productName: string;
        unit: string;
        totalQuantity: number;
        totalAmount: number;
        receiptIds: Set<string>;
      }
    >();

    let overallRevenue = 0;

    filteredSales.forEach((sale) => {
      (sale.items || []).forEach((item) => {
        const key = item.productId || item.productName.trim().toLowerCase();
        const unit = item.unit || productUnitMap.get(item.productId) || 'Unit';
        const lineTotal = Number(item.lineTotal !== undefined ? item.lineTotal : item.unitPrice * item.quantity);
        const qty = Number(item.quantity ?? 0);

        overallRevenue += lineTotal;

        const existing = productMap.get(key);
        if (existing) {
          existing.totalQuantity += qty;
          existing.totalAmount += lineTotal;
          existing.receiptIds.add(sale.id);
          if (unit && existing.unit === 'Unit') {
            existing.unit = unit;
          }
        } else {
          productMap.set(key, {
            productId: item.productId,
            productName: item.productName,
            unit,
            totalQuantity: qty,
            totalAmount: lineTotal,
            receiptIds: new Set([sale.id]),
          });
        }
      });
    });

    const rows = Array.from(productMap.values()).map((p) => ({
      productId: p.productId,
      productName: p.productName,
      unit: p.unit,
      totalQuantity: p.totalQuantity,
      totalAmount: p.totalAmount,
      receiptCount: p.receiptIds.size,
      avgUnitPrice: p.totalQuantity > 0 ? p.totalAmount / p.totalQuantity : 0,
      percentageOfSales: overallRevenue > 0 ? (p.totalAmount / overallRevenue) * 100 : 0,
    }));

    rows.sort((a, b) => {
      if (productSortBy === 'quantity') {
        return productSortDir === 'desc'
          ? b.totalQuantity - a.totalQuantity
          : a.totalQuantity - b.totalQuantity;
      }
      if (productSortBy === 'amount') {
        return productSortDir === 'desc'
          ? b.totalAmount - a.totalAmount
          : a.totalAmount - b.totalAmount;
      }
      if (productSortBy === 'name') {
        return productSortDir === 'desc'
          ? b.productName.localeCompare(a.productName)
          : a.productName.localeCompare(b.productName);
      }
      return b.totalQuantity - a.totalQuantity;
    });

    return rows;
  }, [filteredSales, allProducts, productSortBy, productSortDir]);

  const toggleProductSort = (column: 'quantity' | 'amount' | 'name') => {
    if (productSortBy === column) {
      setProductSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setProductSortBy(column);
      setProductSortDir(column === 'name' ? 'asc' : 'desc');
    }
  };

  const handleDownloadPdf = async () => {
    if (filteredSales.length === 0 || isDownloadingPdf) return;
    setIsDownloadingPdf(true);
    try {
      await downloadSalesSummaryPdf({
        sales: filteredSales,
        business,
        shop: activeShop,
        dateRangeLabel: activeFilterSummaryLabel,
        symbol,
        products: allProducts,
        generatedBy: currentUser.fullName,
        reportType:
          salesTableView === 'product_summary'
            ? 'product_summary'
            : salesTableView === 'receipts'
            ? 'receipts'
            : 'itemized',
      });
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to generate sales summary PDF:', err);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleDownloadCsv = () => {
    if (filteredSales.length === 0 || isDownloadingCsv) return;
    setIsDownloadingCsv(true);
    try {
      downloadSalesSummaryCsv({
        sales: filteredSales,
        business,
        shop: activeShop,
        dateRangeLabel: activeFilterSummaryLabel,
        symbol,
        products: allProducts,
        reportType: salesTableView,
      });
      setCsvSuccess(true);
      setTimeout(() => setCsvSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to generate sales summary CSV:', err);
    } finally {
      setIsDownloadingCsv(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1440px] mx-auto">
      {/* Report Section Tabs & Scope Info */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-2.5">
            <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-slate-900">
                Shop Reporting Suite · Active Shop: {activeShop.name} (
                {activeShop.code})
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Official transaction summaries, product performance, and sales analytics isolated per shop ID.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md self-start lg:self-auto whitespace-nowrap">
            Business Analytics
          </span>
        </div>

        <div
          role="tablist"
          aria-label="Report sections"
          className="flex flex-wrap items-center gap-2"
        >
          <button
            type="button"
            role="tab"
            aria-selected={reportTab === 'sales_summary'}
            onClick={() => setReportTab('sales_summary')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
              reportTab === 'sales_summary'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Sales Summaries</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={reportTab === 'payment_breakdown'}
            onClick={() => setReportTab('payment_breakdown')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
              reportTab === 'payment_breakdown'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Payment Breakdown</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={reportTab === 'shop_performance'}
            onClick={() => setReportTab('shop_performance')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
              reportTab === 'shop_performance'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>Shop-Level Performance ({authorizedShops.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={reportTab === 'inventory_summary'}
            onClick={() => setReportTab('inventory_summary')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
              reportTab === 'inventory_summary'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Inventory Summaries</span>
          </button>
        </div>
      </div>

      {/* User & Date / Single-Day Filter Bar (Applies to Sales Summaries & Payment Breakdown) */}
      {(reportTab === 'sales_summary' || reportTab === 'payment_breakdown') && (
        <section
          aria-label="Sales Summary User and Date Range Selector"
          className="bg-white rounded-xl border border-slate-200 p-4 space-y-3.5 shadow-2xs"
        >
          {/* Row 1: Filter by User / Staff + Filter for a Particular Day */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100 text-xs">
            {/* User / Staff Filter Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor="report-user-filter"
                className="inline-flex items-center gap-1.5 text-slate-800 font-bold"
              >
                <UserIcon className="w-4 h-4 text-emerald-700" />
                <span>Filter by User / Staff:</span>
              </label>
              <select
                id="report-user-filter"
                aria-label="Filter sales summary by user"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 font-semibold text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-600 cursor-pointer"
              >
                <option value="all">
                  All Staff / Users ({shopUsers.length})
                </option>
                {shopUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                    {u.roleLabel ? ` (${u.roleLabel})` : ''}
                  </option>
                ))}
              </select>

              {/* Quick User Filter Pills */}
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedUserId('all')}
                  className={`px-2.5 py-1 rounded-full font-semibold transition-colors border cursor-pointer ${
                    selectedUserId === 'all'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  All Users
                </button>
                {shopUsers.map((u) => {
                  const isSelected = selectedUserId === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() =>
                        setSelectedUserId(isSelected ? 'all' : u.id)
                      }
                      className={`px-2.5 py-1 rounded-full font-semibold transition-colors border cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50 hover:border-emerald-200'
                      }`}
                    >
                      {u.fullName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filter for a Particular Day Picker */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-emerald-50/70 border border-emerald-200 rounded-lg px-2.5 py-1">
                <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                <label
                  htmlFor="report-single-day"
                  className="text-emerald-950 font-bold whitespace-nowrap"
                >
                  Particular Day:
                </label>
                <input
                  id="report-single-day"
                  type="date"
                  aria-label="Filter for a particular day"
                  value={selectedSingleDayValue}
                  onChange={(e) => handleSelectSingleDay(e.target.value)}
                  className="bg-transparent font-mono text-slate-900 font-bold focus:outline-none cursor-pointer"
                />
              </div>

              {/* Quick Recorded Sale Day Chips for the Selected User */}
              {availableSaleDatesForUser.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[11px] text-slate-500 font-medium">
                    Sales days:
                  </span>
                  {availableSaleDatesForUser.slice(0, 4).map((dayYmd) => {
                    const isDayActive = selectedSingleDayValue === dayYmd;
                    const dayTag =
                      dayYmd === todayYmd
                        ? 'Today'
                        : dayYmd === yesterdayYmd
                        ? 'Yesterday'
                        : dayYmd;
                    return (
                      <button
                        key={dayYmd}
                        type="button"
                        onClick={() =>
                          isDayActive
                            ? handleSelectPreset('all')
                            : handleSelectSingleDay(dayYmd)
                        }
                        className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold border transition-colors cursor-pointer ${
                          isDayActive
                            ? 'bg-emerald-700 text-white border-emerald-700'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-emerald-50 hover:border-emerald-200'
                        }`}
                        title={`Filter sales on ${dayYmd}`}
                      >
                        {dayTag} ({dayYmd})
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Period Presets + Custom Date Range From / To */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Quick Period Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 text-slate-800 font-bold mr-1">
                <Calendar className="w-4 h-4 text-emerald-700" />
                <span>Date / Period:</span>
              </span>
              {REPORT_DATE_PRESETS.map((preset) => {
                const isActive = datePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset.id)}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors border whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Custom Date Inputs */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
                <label htmlFor="report-start-date" className="text-slate-500 font-medium">
                  From:
                </label>
                <input
                  id="report-start-date"
                  type="date"
                  aria-label="Filter start date"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="bg-transparent font-mono text-slate-800 font-medium focus:outline-none cursor-pointer"
                />
              </div>

              <span className="text-slate-400">to</span>

              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
                <label htmlFor="report-end-date" className="text-slate-500 font-medium">
                  To:
                </label>
                <input
                  id="report-end-date"
                  type="date"
                  aria-label="Filter end date"
                  value={endDate}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  className="bg-transparent font-mono text-slate-800 font-medium focus:outline-none cursor-pointer"
                />
              </div>

              {(selectedUserId !== 'all' ||
                startDate ||
                endDate ||
                datePreset !== 'all') && (
                <button
                  type="button"
                  onClick={handleClearDateFilter}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Reset Filters</span>
                </button>
              )}
            </div>
          </div>

          {/* Row 3: Active User & Day Summary Banner */}
          <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-700">Selected User:</span>
              <span className="font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 inline-flex items-center gap-1">
                <UserIcon className="w-3 h-3 text-emerald-700" />
                <span>
                  {selectedUserObj
                    ? `${selectedUserObj.fullName}${
                        selectedUserObj.roleLabel
                          ? ` (${selectedUserObj.roleLabel})`
                          : ''
                      }`
                    : 'All Staff / Users'}
                </span>
              </span>
              <span className="text-slate-300">·</span>
              <span className="font-semibold text-slate-700">Active Period:</span>
              <span className="font-mono text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                {activeRangeSummary}
              </span>
            </div>
            <div className="font-mono tabular-nums">
              {selectedUserObj ? `${selectedUserObj.fullName}'s Sales: ` : 'Transactions in Range: '}
              <strong className="text-slate-900">
                {salesMetrics.count} receipt{salesMetrics.count === 1 ? '' : 's'} ({salesMetrics.unitsSold} unit{salesMetrics.unitsSold === 1 ? '' : 's'})
              </strong>{' '}
              — Total:{' '}
              <strong className="text-emerald-700">
                {formatCurrency(salesMetrics.total, symbol)}
              </strong>
            </div>
          </div>
        </section>
      )}

      {/* 1. SALES SUMMARIES */}
      {reportTab === 'sales_summary' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-slate-500">
                {selectedUserObj
                  ? `${selectedUserObj.fullName} — Gross Sales`
                  : `Gross Sales (${activeShop.code})`}
              </p>
              <p className="text-2xl font-display font-bold font-mono tabular-nums text-slate-900 mt-2">
                {formatCurrency(salesMetrics.total, symbol)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Across {salesMetrics.count} receipt{salesMetrics.count === 1 ? '' : 's'} ({activeRangeSummary})
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-slate-500">Average Basket Value</p>
              <p className="text-2xl font-display font-bold font-mono tabular-nums text-slate-900 mt-2">
                {formatCurrency(salesMetrics.avg, symbol)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {selectedUserObj
                  ? `Per checkout by ${selectedUserObj.fullName}`
                  : 'Per customer checkout'}
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-slate-500">Total Tax Collected</p>
              <p className="text-2xl font-display font-bold font-mono tabular-nums text-slate-900 mt-2">
                {formatCurrency(salesMetrics.tax, symbol)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Shop VAT rate: {activeShop.taxRatePercent}%
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-slate-500">Total Discounts Granted</p>
              <p className="text-2xl font-display font-bold font-mono tabular-nums text-emerald-700 mt-2">
                {formatCurrency(salesMetrics.discount, symbol)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Promotional &amp; cashier discounts
              </p>
            </div>
          </div>

          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/50">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-display font-bold text-slate-900">
                    Sales Summary — {activeShop.name}
                  </h2>
                  <span className="text-xs font-mono text-emerald-800 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {activeRangeSummary}
                  </span>
                  <span className="text-xs font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 inline-flex items-center gap-1">
                    <UserIcon className="w-3 h-3 text-emerald-700" />
                    <span>
                      {selectedUserObj
                        ? selectedUserObj.fullName
                        : 'All Staff / Users'}
                    </span>
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {salesTableView === 'product_summary'
                    ? `Showing ${aggregatedProductRows.length} unique product${aggregatedProductRows.length === 1 ? '' : 's'} (${salesMetrics.unitsSold} total units sold) across ${filteredSales.length} receipt${filteredSales.length === 1 ? '' : 's'}`
                    : salesTableView === 'itemized'
                    ? `Showing ${itemizedSalesRows.length} item line${itemizedSalesRows.length === 1 ? '' : 's'} (${salesMetrics.unitsSold} unit${salesMetrics.unitsSold === 1 ? '' : 's'}) across ${filteredSales.length} receipt${filteredSales.length === 1 ? '' : 's'}`
                    : `Showing ${filteredSales.length} receipt${filteredSales.length === 1 ? '' : 's'} (${salesMetrics.unitsSold} total units)`}
                  {selectedUserObj ? ` sold by ${selectedUserObj.fullName}` : ''}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* View switcher */}
                <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setSalesTableView('product_summary')}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                      salesTableView === 'product_summary'
                        ? 'bg-slate-900 text-white font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Best Selling Products</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSalesTableView('itemized')}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      salesTableView === 'itemized'
                        ? 'bg-slate-900 text-white font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Itemized Sales Log
                  </button>
                  <button
                    type="button"
                    onClick={() => setSalesTableView('receipts')}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      salesTableView === 'receipts'
                        ? 'bg-slate-900 text-white font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Receipts Overview
                  </button>
                </div>

                {/* CSV Download Button */}
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  disabled={filteredSales.length === 0 || isDownloadingCsv}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer border ${
                    csvSuccess
                      ? 'bg-blue-700 text-white border-blue-700'
                      : filteredSales.length === 0
                      ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 active:scale-95'
                  }`}
                  title="Download Sales Summary as CSV (Spreadsheet / Excel compatible)"
                >
                  {isDownloadingCsv ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
                      <span>Generating CSV...</span>
                    </>
                  ) : csvSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-white" />
                      <span>CSV Downloaded!</span>
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Download CSV</span>
                    </>
                  )}
                </button>

                {/* PDF Download Button */}
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={filteredSales.length === 0 || isDownloadingPdf}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer ${
                    downloadSuccess
                      ? 'bg-emerald-700 text-white border border-emerald-700'
                      : filteredSales.length === 0
                      ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
                  }`}
                  title="Download Sales Summary as PDF"
                >
                  {isDownloadingPdf ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Generating PDF...</span>
                    </>
                  ) : downloadSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>PDF Downloaded!</span>
                    </>
                  ) : (
                    <>
                      <FileDown className="w-3.5 h-3.5" />
                      <span>Download PDF</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {filteredSales.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-sm font-semibold text-slate-800">
                  No sales recorded{' '}
                  {selectedUserObj ? `by ${selectedUserObj.fullName} ` : ''}for{' '}
                  {activeRangeSummary}
                </p>
                <p className="text-xs text-slate-500">
                  Try selecting a different user, day, or date range preset above.
                </p>
                <button
                  type="button"
                  onClick={handleClearDateFilter}
                  className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset User &amp; Date Filters</span>
                </button>
              </div>
            ) : salesTableView === 'product_summary' ? (
              /* BEST SELLING PRODUCTS CONSOLIDATED TABLE */
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                      <th className="py-3 px-3 text-center w-12 font-bold text-slate-500">#</th>
                      <th className="py-3 px-4 font-semibold text-slate-900">
                        <button
                          type="button"
                          onClick={() => toggleProductSort('name')}
                          className="inline-flex items-center gap-1.5 hover:text-emerald-700 cursor-pointer group"
                        >
                          <span>Product Name</span>
                          <ArrowUpDown className={`w-3.5 h-3.5 transition-colors ${productSortBy === 'name' ? 'text-emerald-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                        </button>
                      </th>
                      <th className="py-3 px-4 font-semibold text-slate-700 text-center whitespace-nowrap">
                        Unit of Measurement
                      </th>
                      <th className="py-3 px-4 font-semibold text-slate-700 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => toggleProductSort('quantity')}
                          className="inline-flex items-center gap-1.5 hover:text-emerald-700 cursor-pointer group"
                        >
                          <span>Total Quantity Sold</span>
                          <ArrowUpDown className={`w-3.5 h-3.5 transition-colors ${productSortBy === 'quantity' ? 'text-emerald-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                        </button>
                      </th>
                      <th className="py-3 px-4 font-semibold text-slate-900 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => toggleProductSort('amount')}
                          className="inline-flex items-center gap-1.5 hover:text-emerald-700 cursor-pointer group ml-auto"
                        >
                          <span>Total Amount</span>
                          <ArrowUpDown className={`w-3.5 h-3.5 transition-colors ${productSortBy === 'amount' ? 'text-emerald-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                        </button>
                      </th>
                      <th className="py-3 px-4 font-semibold text-slate-700 text-right whitespace-nowrap">
                        Avg. Unit Price
                      </th>
                      <th className="py-3 px-4 font-semibold text-slate-700 text-center whitespace-nowrap">
                        Orders
                      </th>
                      <th className="py-3 px-4 font-semibold text-slate-700 text-right whitespace-nowrap">
                        % of Sales
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {aggregatedProductRows.map((row, idx) => (
                      <tr key={row.productId || row.productName} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 text-center">
                          {idx === 0 && productSortBy === 'quantity' && productSortDir === 'desc' ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-700 font-bold text-[11px] shadow-xs" title="#1 Top Selling Product">
                              🥇
                            </span>
                          ) : idx === 1 && productSortBy === 'quantity' && productSortDir === 'desc' ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold text-[11px]" title="#2 Top Seller">
                              🥈
                            </span>
                          ) : idx === 2 && productSortBy === 'quantity' && productSortDir === 'desc' ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-100 text-orange-800 font-bold text-[11px]" title="#3 Top Seller">
                              🥉
                            </span>
                          ) : (
                            <span className="font-mono font-medium text-slate-400">
                              {idx + 1}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-900 text-sm">{row.productName}</p>
                          <p className="text-[10px] text-slate-400">
                            Sold in {row.receiptCount} receipt{row.receiptCount === 1 ? '' : 's'}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            {row.unit}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-slate-900 text-sm">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {row.totalQuantity.toLocaleString()} {row.unit}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold tabular-nums text-right text-slate-900 whitespace-nowrap text-sm">
                          {formatCurrency(row.totalAmount, symbol)}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-600 whitespace-nowrap">
                          {formatCurrency(row.avgUnitPrice, symbol)}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-slate-600">
                          {row.receiptCount}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-mono text-slate-700 font-medium">
                              {row.percentageOfSales.toFixed(1)}%
                            </span>
                            <div className="w-12 h-1.5 rounded-full bg-slate-100 overflow-hidden shrink-0">
                              <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${Math.min(100, Math.max(4, row.percentageOfSales))}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50/90 font-bold border-t-2 border-slate-200 text-slate-900">
                      <td className="py-3 px-3 text-center font-mono text-xs">Total</td>
                      <td className="py-3 px-4">
                        <span className="text-slate-700 font-semibold text-xs">
                          {aggregatedProductRows.length} unique product{aggregatedProductRows.length === 1 ? '' : 's'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center text-slate-400 font-normal">—</td>
                      <td className="py-3 px-4 text-center font-mono text-xs text-slate-900">
                        <span className="px-2.5 py-1 rounded bg-slate-200 text-slate-900 font-bold">
                          {aggregatedProductRows.reduce((sum, r) => sum + r.totalQuantity, 0).toLocaleString()} units
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-right text-xs text-emerald-700">
                        {formatCurrency(salesMetrics.total, symbol)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-500 font-normal">
                        —
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-slate-600">
                        {filteredSales.length} receipts
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-700">
                        100.0%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : salesTableView === 'itemized' ? (
              /* EXACT TABLE HEAD AS SPECIFIED IN USER IMAGE WITH 'Unit of Measurement' */
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                      <th className="py-3 px-3 text-center w-12 font-bold text-slate-500">#</th>
                      <th className="py-3 px-4 font-semibold text-slate-700 whitespace-nowrap">Date &amp; Time</th>
                      <th className="py-3 px-4 font-semibold text-slate-900">Product Name</th>
                      <th className="py-3 px-4 font-semibold text-slate-700 text-center whitespace-nowrap">Unit of Measurement</th>
                      <th className="py-3 px-4 font-semibold text-slate-700 text-center whitespace-nowrap">Quantity</th>
                      <th className="py-3 px-4 font-semibold text-slate-900 text-right whitespace-nowrap">Amount</th>
                      <th className="py-3 px-4 font-semibold text-slate-700 whitespace-nowrap">Payment Method</th>
                      <th className="py-3 px-4 font-semibold text-slate-700 whitespace-nowrap">Staff</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {itemizedSalesRows.map((row) => (
                      <tr key={`${row.saleId}-${row.index}`} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 text-center font-mono font-medium text-slate-400">
                          {row.index}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {row.dateTime}
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-900">{row.productName}</p>
                          <p className="text-[10px] font-mono text-slate-400">{row.receiptNumber}</p>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            {row.unit}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                          {row.quantity.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold tabular-nums text-right text-slate-900 whitespace-nowrap">
                          {formatCurrency(row.amount, symbol)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                            row.paymentMethod === 'Cash'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : row.paymentMethod === 'Bank Transfer'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : row.paymentMethod === 'POS Card'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {row.paymentMethod}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-700 font-medium whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedUserId(
                                selectedUserId === row.staffUserId
                                  ? 'all'
                                  : row.staffUserId || row.staff
                              )
                            }
                            title={`Filter sales summary by ${row.staff}`}
                            className="inline-flex items-center gap-1 hover:text-emerald-700 cursor-pointer"
                          >
                            <UserIcon className="w-3 h-3 text-slate-400" />
                            <span>{row.staff}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50/90 font-bold border-t-2 border-slate-200 text-slate-900">
                      <td className="py-3 px-3 text-center font-mono text-xs">Total</td>
                      <td className="py-3 px-4" colSpan={2}>
                        <span className="text-slate-500 font-normal text-xs">
                          {itemizedSalesRows.length} item{itemizedSalesRows.length === 1 ? '' : 's'} across {filteredSales.length} receipt{filteredSales.length === 1 ? '' : 's'}
                          {selectedUserObj ? ` (${selectedUserObj.fullName})` : ''}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center text-slate-400 font-normal">—</td>
                      <td className="py-3 px-4 text-center font-mono text-xs text-slate-900">
                        {itemizedSalesRows.reduce((sum, r) => sum + r.quantity, 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono text-right text-xs text-emerald-700">
                        {formatCurrency(salesMetrics.total, symbol)}
                      </td>
                      <td className="py-3 px-4" colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              /* RECEIPTS SUMMARY VIEW */
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                      <th className="py-3 px-4 font-medium">Receipt #</th>
                      <th className="py-3 px-4 font-medium">Timestamp</th>
                      <th className="py-3 px-4 font-medium">Cashier</th>
                      <th className="py-3 px-4 font-medium text-center">Items</th>
                      <th className="py-3 px-4 font-medium">Payment</th>
                      <th className="py-3 px-4 font-medium text-right">Subtotal</th>
                      <th className="py-3 px-4 font-medium text-right">Tax</th>
                      <th className="py-3 px-4 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSales.map((sale) => (
                      <tr key={sale.id} className="hover:bg-slate-50/75 transition-colors">
                        <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                          {sale.receiptNumber}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                          {sale.createdAt}
                        </td>
                        <td className="py-3 px-4 text-slate-700">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedUserId(
                                selectedUserId === sale.cashierUserId
                                  ? 'all'
                                  : sale.cashierUserId
                              )
                            }
                            className="inline-flex items-center gap-1 hover:text-emerald-700 font-medium cursor-pointer"
                          >
                            <UserIcon className="w-3 h-3 text-slate-400" />
                            <span>{sale.cashierName}</span>
                          </button>
                        </td>
                        <td className="py-3 px-4 font-mono text-center text-slate-700">
                          {sale.items.length}
                        </td>
                        <td className="py-3 px-4 text-slate-700">
                          {formatPaymentMethodLabel(sale.paymentMethod)}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-right">
                          {formatCurrency(sale.subtotal, symbol)}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-right">
                          {formatCurrency(sale.taxAmount, symbol)}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums font-bold text-right text-slate-900">
                          {formatCurrency(sale.totalAmount, symbol)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* 2. PAYMENT BREAKDOWN */}
      {reportTab === 'payment_breakdown' && (
        <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-display font-bold text-slate-900">
                Payment Method Breakdown — {activeShop.name}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Settlement distribution by tender type for terminal {activeShop.terminalId}
              </p>
            </div>
            <span className="text-xs font-mono text-emerald-800 font-bold bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200 self-start sm:self-auto">
              Range: {activeRangeSummary}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                key: 'cash',
                label: 'Cash Drawer Settlements',
                amount: paymentTotals.cash,
                count: paymentTotals.cashCount,
              },
              {
                key: 'bank_transfer',
                label: 'Instant Bank Transfers',
                amount: paymentTotals.bankTransfer,
                count: paymentTotals.bankCount,
              },
              {
                key: 'pos_card',
                label: 'POS Card Terminal (STAN)',
                amount: paymentTotals.posCard,
                count: paymentTotals.cardCount,
              },
            ].map((item) => {
              const share =
                salesMetrics.total > 0
                  ? Math.round((item.amount / salesMetrics.total) * 100)
                  : 0;
              return (
                <div
                  key={item.key}
                  className="p-5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">
                      {item.label}
                    </span>
                    <span className="font-mono tabular-nums text-emerald-700 font-bold">
                      {share}%
                    </span>
                  </div>
                  <p className="text-xl font-display font-bold font-mono tabular-nums text-slate-900">
                    {formatCurrency(item.amount, symbol)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {item.count} transaction{item.count === 1 ? '' : 's'} in range
                  </p>
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-full"
                      style={{ width: `${Math.max(0, share)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. SHOP-LEVEL PERFORMANCE */}
      {reportTab === 'shop_performance' && (
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-display font-bold text-slate-900">
                Shop-Level Performance Comparison (Authorized Branches Only)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Signed in as {currentUser.fullName} ({currentUser.roleLabel}) — showing{' '}
                {authorizedShops.length} authorized shop
                {authorizedShops.length === 1 ? '' : 's'}.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500">
                  <th className="py-3 px-4 font-medium">Shop Branch</th>
                  <th className="py-3 px-4 font-medium">Category &amp; City</th>
                  <th className="py-3 px-4 font-medium text-right">Isolated SKUs</th>
                  <th className="py-3 px-4 font-medium text-right">Transactions</th>
                  <th className="py-3 px-4 font-medium text-right">Today&apos;s Sales</th>
                  <th className="py-3 px-4 font-medium text-right">Inventory Value</th>
                  <th className="py-3 px-4 font-medium text-right">Workspace</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {authorizedShops.map((s) => {
                  const sMetrics = getShopDashboardMetrics(
                    s,
                    allProducts,
                    allSales
                  );
                  const sProductsCount = allProducts.filter(
                    (p) => p.shopId === s.id
                  ).length;
                  const isCurrent = s.id === activeShop.id;

                  return (
                    <tr
                      key={s.id}
                      className={isCurrent ? 'bg-emerald-50/50' : ''}
                    >
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-slate-900">{s.name}</p>
                        <p className="font-mono text-slate-500">
                          {s.code} · ID: {s.id}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        {s.category} · {s.locationCity}
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-right">
                        {sProductsCount}
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-right">
                        {sMetrics.transactionCount}
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums font-bold text-slate-900 text-right">
                        {formatCurrency(sMetrics.todaysSalesTotal, symbol)}
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-slate-700 text-right">
                        {formatCurrency(sMetrics.inventoryRetailValue, symbol)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {isCurrent ? (
                          <span className="font-semibold text-emerald-700">
                            Active Shop
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onSwitchActiveShop(s.id)}
                            className="px-2.5 py-1 rounded bg-slate-900 text-white font-semibold cursor-pointer"
                          >
                            Switch Here
                          </button>
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

      {/* 4. INVENTORY SUMMARIES */}
      {reportTab === 'inventory_summary' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-slate-500">
                Active SKUs in {activeShop.code}
              </p>
              <p className="text-2xl font-display font-bold font-mono tabular-nums text-slate-900 mt-2">
                {activeShopProducts.length}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Isolated to {activeShop.name}
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-slate-500">Inventory Cost Valuation</p>
              <p className="text-2xl font-display font-bold font-mono tabular-nums text-slate-900 mt-2">
                {formatCurrency(activeMetrics.inventoryCostValue, symbol)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Based on unit cost × stock
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-slate-500">Inventory Retail Valuation</p>
              <p className="text-2xl font-display font-bold font-mono tabular-nums text-slate-900 mt-2">
                {formatCurrency(activeMetrics.inventoryRetailValue, symbol)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Based on selling price × stock
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Projected Gross Margin</span>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-display font-bold font-mono tabular-nums text-emerald-700 mt-2">
                {formatCurrency(
                  activeMetrics.inventoryRetailValue -
                    activeMetrics.inventoryCostValue,
                  symbol
                )}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Low-stock items: {activeMetrics.lowStockCount}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
