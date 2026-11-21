import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  ReceiptText,
  Calendar,
  Eye,
  X,
  Clock,
  CheckCircle2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Printer,
  Lock,
  FileText,
  User as UserIcon,
  FileSpreadsheet,
  FileDown,
  Check,
  Loader2,
  Download,
} from 'lucide-react';
import {
  Business,
  PaymentMethod,
  Product,
  SaleTransaction,
  Shop,
  TransactionStatus,
  User,
} from '../types/pos';
import {
  extractSaleDateYmd,
  filterAndSortSalesHistory,
  formatCurrency,
  getDateRangeBoundsForPreset,
  getShopPrinterSettings,
  getShopSalesUsers,
  getTodayYmd,
  SalesDateRangePreset,
  SalesDateSortOrder,
} from '../utils/posCalculations';
import {
  resolveEffectivePrinter,
  printSaleReceipt,
} from '../utils/receiptPrinter';
import { downloadSalesSummaryPdf } from '../utils/pdfGenerator';
import { downloadSalesHistoryExcel } from '../utils/csvGenerator';

interface SalesHistoryPageProps {
  business: Business;
  shop: Shop;
  shopSales: SaleTransaction[];
  businessUsers?: User[];
  shopProducts?: Product[];
  currentUser?: User;
  initialSelectedSale?: SaleTransaction | null;
  onClearInitialSelectedSale?: () => void;
}

const DATE_PRESET_OPTIONS: {
  id: SalesDateRangePreset;
  label: string;
}[] = [
  { id: 'all', label: 'All Dates' },
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this_week', label: 'Last 7 Days' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_30_days', label: 'Last 30 Days' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'custom', label: 'Custom Range' },
];

export const SalesHistoryPage: React.FC<SalesHistoryPageProps> = ({
  business,
  shop,
  shopSales,
  businessUsers = [],
  shopProducts = [],
  currentUser,
  initialSelectedSale,
  onClearInitialSelectedSale,
}) => {
  const draftStorageKey = `smartmind_sales_history_draft_${shop.id}`;

  const savedDraft = useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('reset') === '1') {
        window.sessionStorage.removeItem(draftStorageKey);
        window.localStorage.removeItem(draftStorageKey);
        return null;
      }
      const raw =
        window.sessionStorage.getItem(draftStorageKey) ??
        window.localStorage.getItem(draftStorageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [draftStorageKey]);

  const todayYmd = useMemo(() => getTodayYmd(), []);
  const yesterdayYmd = useMemo(
    () => getDateRangeBoundsForPreset('yesterday', todayYmd).startDate,
    [todayYmd]
  );

  const [searchQuery, setSearchQuery] = useState<string>(
    () => savedDraft?.searchQuery ?? ''
  );
  const [userFilter, setUserFilter] = useState<string>(
    () => savedDraft?.userFilter ?? 'all'
  );
  const [paymentFilter, setPaymentFilter] = useState<'all' | PaymentMethod>(
    () => savedDraft?.paymentFilter ?? 'all'
  );
  const [statusFilter, setStatusFilter] = useState<'all' | TransactionStatus>(
    () => savedDraft?.statusFilter ?? 'all'
  );
  const [datePreset, setDatePreset] = useState<SalesDateRangePreset>(
    () => savedDraft?.datePreset ?? 'all'
  );
  const [startDate, setStartDate] = useState<string>(() => {
    if (savedDraft?.datePreset === 'today') return getTodayYmd();
    if (savedDraft?.datePreset === 'yesterday') {
      return getDateRangeBoundsForPreset('yesterday', getTodayYmd()).startDate;
    }
    return savedDraft?.startDate ?? '';
  });
  const [endDate, setEndDate] = useState<string>(() => {
    if (savedDraft?.datePreset === 'today') return getTodayYmd();
    if (savedDraft?.datePreset === 'yesterday') {
      return getDateRangeBoundsForPreset('yesterday', getTodayYmd()).endDate;
    }
    return savedDraft?.endDate ?? '';
  });
  const [sortOrder, setSortOrder] = useState<SalesDateSortOrder>(
    () => savedDraft?.sortOrder ?? 'date_desc'
  );

  useEffect(() => {
    try {
      const serialized = JSON.stringify({
        searchQuery,
        userFilter,
        paymentFilter,
        statusFilter,
        datePreset,
        startDate,
        endDate,
        sortOrder,
      });
      window.sessionStorage.setItem(draftStorageKey, serialized);
      window.localStorage.setItem(draftStorageKey, serialized);
    } catch {
      // Ignore storage errors
    }
  }, [
    draftStorageKey,
    searchQuery,
    userFilter,
    paymentFilter,
    statusFilter,
    datePreset,
    startDate,
    endDate,
    sortOrder,
  ]);

  const symbol = business.currencySymbol;
  const printerSettings = useMemo(() => getShopPrinterSettings(shop), [shop]);
  const activeDefaultPrinter = useMemo(
    () => resolveEffectivePrinter(shop),
    [shop]
  );
  const [reprintModalSale, setReprintModalSale] =
    useState<SaleTransaction | null>(null);
  const [reprintDispatched, setReprintDispatched] = useState<boolean>(false);
  const [isReprinting, setIsReprinting] = useState<boolean>(false);

  const shopUsers = useMemo(
    () => getShopSalesUsers(shopSales, businessUsers, shop.id, business.id),
    [shopSales, businessUsers, shop.id, business.id]
  );

  const selectedUserObj = useMemo(
    () =>
      userFilter === 'all'
        ? null
        : shopUsers.find((u) => u.id === userFilter) ?? null,
    [userFilter, shopUsers]
  );

  const filteredSales = useMemo(
    () =>
      filterAndSortSalesHistory(shopSales, {
        searchQuery,
        userId: userFilter,
        paymentFilter,
        statusFilter,
        startDate,
        endDate,
        sortOrder,
      }),
    [
      shopSales,
      searchQuery,
      userFilter,
      paymentFilter,
      statusFilter,
      startDate,
      endDate,
      sortOrder,
    ]
  );

  const [selectedSale, setSelectedSale] = useState<SaleTransaction | null>(
    () => initialSelectedSale ?? filteredSales[0] ?? shopSales[0] ?? null
  );

  // Keep selectedSale synchronized when initialSelectedSale is passed or filtered list changes
  useEffect(() => {
    if (initialSelectedSale) {
      setSelectedSale(initialSelectedSale);
      return;
    }
    if (
      selectedSale &&
      filteredSales.some((sale) => sale.id === selectedSale.id)
    ) {
      return;
    }
    setSelectedSale(filteredSales[0] ?? null);
  }, [initialSelectedSale, filteredSales, selectedSale]);

  const filteredTotal = useMemo(
    () =>
      Math.round(
        filteredSales.reduce((sum, s) => sum + s.totalAmount, 0) * 100
      ) / 100,
    [filteredSales]
  );

  const handleSelectPreset = (preset: SalesDateRangePreset) => {
    setDatePreset(preset);
    if (preset === 'custom') {
      return;
    }
    const bounds = getDateRangeBoundsForPreset(preset, todayYmd);
    setStartDate(bounds.startDate);
    setEndDate(bounds.endDate);
  };

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

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
    setDatePreset(value || endDate ? 'custom' : 'all');
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
    setDatePreset(startDate || value ? 'custom' : 'all');
  };

  const handleToggleDateColumnSort = () => {
    setSortOrder((prev) => (prev === 'date_desc' ? 'date_asc' : 'date_desc'));
  };

  const handleToggleAmountColumnSort = () => {
    setSortOrder((prev) =>
      prev === 'amount_desc' ? 'amount_asc' : 'amount_desc'
    );
  };

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    userFilter !== 'all' ||
    paymentFilter !== 'all' ||
    statusFilter !== 'all' ||
    Boolean(startDate) ||
    Boolean(endDate) ||
    datePreset !== 'all' ||
    sortOrder !== 'date_desc';

  const handleResetFilters = () => {
    setSearchQuery('');
    setUserFilter('all');
    setPaymentFilter('all');
    setStatusFilter('all');
    setDatePreset('all');
    setStartDate('');
    setEndDate('');
    setSortOrder('date_desc');
  };

  const selectedSingleDayValue =
    startDate && endDate && startDate === endDate ? startDate : '';

  const activeRangeSummary = useMemo(() => {
    if (!startDate && !endDate) {
      return 'All recorded dates';
    }
    if (startDate && endDate) {
      if (startDate === endDate) {
        if (startDate === todayYmd) {
          return `Today (${todayYmd})`;
        }
        if (startDate === yesterdayYmd) {
          return `Yesterday (${yesterdayYmd})`;
        }
        return `Single date: ${startDate}`;
      }
      const from = startDate <= endDate ? startDate : endDate;
      const to = startDate <= endDate ? endDate : startDate;
      return `${from} to ${to}`;
    }
    if (startDate) {
      return `From ${startDate} onwards`;
    }
    return `Up to ${endDate}`;
  }, [startDate, endDate, todayYmd, yesterdayYmd]);

  const [reportType, setReportType] = useState<'itemized' | 'receipts'>('itemized');
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [pdfSuccess, setPdfSuccess] = useState<boolean>(false);
  const [isDownloadingExcel, setIsDownloadingExcel] = useState<boolean>(false);
  const [excelSuccess, setExcelSuccess] = useState<boolean>(false);

  const activeFilterSummaryLabel = useMemo(() => {
    if (selectedUserObj) {
      return `${activeRangeSummary} · User: ${selectedUserObj.fullName}`;
    }
    return activeRangeSummary;
  }, [activeRangeSummary, selectedUserObj]);

  const handleDownloadExcel = (overrideType?: 'itemized' | 'receipts') => {
    if (filteredSales.length === 0 || isDownloadingExcel) return;
    setIsDownloadingExcel(true);
    const chosenType = overrideType || reportType;
    try {
      downloadSalesHistoryExcel({
        sales: filteredSales,
        business,
        shop,
        dateRangeLabel: activeFilterSummaryLabel,
        symbol,
        products: shopProducts,
        reportType: chosenType,
      });
      setExcelSuccess(true);
      setTimeout(() => setExcelSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to generate sales history Excel:', err);
    } finally {
      setIsDownloadingExcel(false);
    }
  };

  const handleDownloadPdf = async (overrideType?: 'itemized' | 'receipts') => {
    if (filteredSales.length === 0 || isDownloadingPdf) return;
    setIsDownloadingPdf(true);
    const chosenType = overrideType || reportType;
    try {
      await downloadSalesSummaryPdf({
        sales: filteredSales,
        business,
        shop,
        dateRangeLabel: activeFilterSummaryLabel,
        symbol,
        products: shopProducts,
        generatedBy: currentUser?.fullName,
        reportType: chosenType,
      });
      setPdfSuccess(true);
      setTimeout(() => setPdfSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to generate sales history PDF:', err);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <div className="p-3.5 sm:p-5 lg:p-6 space-y-4 sm:space-y-6 max-w-[1440px] mx-auto">
      {/* Filter & Date Range Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 space-y-3.5">
        {/* Top Row: Search + User Filter + Payment + Status + Sort Order */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <label htmlFor="sales-search-input" className="sr-only">
              Search receipts, cashier, or product
            </label>
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="sales-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${shop.code} receipts by number, cashier, date, or item...`}
              className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-600"
            />
          </div>

          {/* User, Sort, Payment & Status Controls */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            {/* User / Cashier Filter Selector */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
              <UserIcon className="w-3.5 h-3.5 text-emerald-700" />
              <label htmlFor="sales-user-filter" className="text-slate-500">
                User:
              </label>
              <select
                id="sales-user-filter"
                aria-label="Filter by user or cashier"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="bg-transparent text-slate-800 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="all">All Users ({shopUsers.length})</option>
                {shopUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Order Selector */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-emerald-700" />
              <label htmlFor="sales-sort-order" className="text-slate-500">
                Sort by:
              </label>
              <select
                id="sales-sort-order"
                aria-label="Sort sales transactions"
                value={sortOrder}
                onChange={(e) =>
                  setSortOrder(e.target.value as SalesDateSortOrder)
                }
                className="bg-transparent text-slate-800 font-semibold focus:outline-none"
              >
                <option value="date_desc">Date: Newest First</option>
                <option value="date_asc">Date: Oldest First</option>
                <option value="amount_desc">Amount: Highest First</option>
                <option value="amount_asc">Amount: Lowest First</option>
              </select>
            </div>

            <select
              aria-label="Filter by payment method"
              value={paymentFilter}
              onChange={(e) =>
                setPaymentFilter(e.target.value as 'all' | PaymentMethod)
              }
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 font-medium"
            >
              <option value="all">All Payment Methods</option>
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="pos_card">POS Card</option>
            </select>

            <select
              aria-label="Filter by transaction status"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'all' | TransactionStatus)
              }
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 font-medium"
            >
              <option value="all">All Statuses</option>
              <option value="completed_demo">Completed</option>
              <option value="pending_sync">Pending Sync</option>
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Second Row: Date Range Presets (Weeks / Months) + Particular Day + Custom Start/End Date Pickers */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Quick Period Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-slate-500 font-medium mr-1">
              <Calendar className="w-3.5 h-3.5 text-emerald-700" />
              <span>Date Range:</span>
            </span>
            {DATE_PRESET_OPTIONS.map((preset) => {
              const isActive = datePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset.id)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors border whitespace-nowrap ${
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

          {/* Particular Day & Custom Date Range From / To Inputs */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-emerald-50/70 border border-emerald-200 rounded-lg px-2.5 py-1">
              <label
                htmlFor="sales-single-day"
                className="text-emerald-950 font-semibold"
              >
                Day:
              </label>
              <input
                id="sales-single-day"
                type="date"
                aria-label="Filter for a particular day"
                value={selectedSingleDayValue}
                onChange={(e) => handleSelectSingleDay(e.target.value)}
                className="bg-transparent font-mono text-slate-900 font-bold focus:outline-none cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
              <label
                htmlFor="sales-start-date"
                className="text-slate-500 font-medium"
              >
                From:
              </label>
              <input
                id="sales-start-date"
                type="date"
                aria-label="Start date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="bg-transparent font-mono text-slate-800 font-medium focus:outline-none"
              />
            </div>

            <span className="text-slate-400">to</span>

            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
              <label
                htmlFor="sales-end-date"
                className="text-slate-500 font-medium"
              >
                To:
              </label>
              <input
                id="sales-end-date"
                type="date"
                aria-label="End date"
                value={endDate}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="bg-transparent font-mono text-slate-800 font-medium focus:outline-none"
              />
            </div>

            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => handleSelectPreset('all')}
                aria-label="Clear date range"
                className="text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-100 font-medium whitespace-nowrap"
              >
                Clear Dates
              </button>
            )}
          </div>
        </div>

        {/* Third Row: Active Range & Totals Summary */}
        <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              Showing <strong>{filteredSales.length}</strong> of{' '}
              <strong>{shopSales.length}</strong> receipt
              {shopSales.length === 1 ? '' : 's'} for{' '}
              <strong className="text-slate-800">{shop.name}</strong>
            </span>
            <span className="text-slate-300">·</span>
            <span>
              User:{' '}
              <strong className="text-slate-800">
                {selectedUserObj ? selectedUserObj.fullName : 'All Users'}
              </strong>
            </span>
            <span className="text-slate-300">·</span>
            <span className="font-mono text-slate-700">
              Range: <strong>{activeRangeSummary}</strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono tabular-nums mr-1">
              Period Total:{' '}
              <strong className="text-slate-900">
                {formatCurrency(filteredTotal, symbol)}
              </strong>
            </span>

            {/* Quick Export in Summary Bar */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleDownloadExcel()}
                disabled={filteredSales.length === 0 || isDownloadingExcel}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border shadow-2xs ${
                  excelSuccess
                    ? 'bg-emerald-700 text-white border-emerald-700'
                    : filteredSales.length === 0
                    ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 active:scale-95 cursor-pointer'
                }`}
                title="Download report in Excel format (.csv)"
              >
                {isDownloadingExcel ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
                    <span>Preparing...</span>
                  </>
                ) : excelSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-white" />
                    <span>Excel Saved!</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Excel</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleDownloadPdf()}
                disabled={filteredSales.length === 0 || isDownloadingPdf}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border shadow-2xs ${
                  pdfSuccess
                    ? 'bg-emerald-700 text-white border-emerald-700'
                    : filteredSales.length === 0
                    ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 active:scale-95 cursor-pointer'
                }`}
                title="Download report in PDF format"
              >
                {isDownloadingPdf ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                    <span>Preparing...</span>
                  </>
                ) : pdfSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-white" />
                    <span>PDF Saved!</span>
                  </>
                ) : (
                  <>
                    <FileDown className="w-3.5 h-3.5 text-white" />
                    <span>PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Split: Transaction Table + Transaction Detail View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left 8 Columns: Transaction Table */}
        <section
          aria-label="Shop Transactions Table"
          className="lg:col-span-8 bg-white rounded-xl border border-slate-200 overflow-hidden"
        >
          {/* Table Header Bar with Format Switcher & Download Actions */}
          <div className="p-3 sm:px-4 sm:py-2.5 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <ReceiptText className="w-4 h-4 text-emerald-700 shrink-0" />
              <h2 className="text-xs sm:text-sm font-display font-bold text-slate-900">
                Sales Transactions
              </h2>
              <span className="text-[11px] font-mono font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                {filteredSales.length} {filteredSales.length === 1 ? 'sale' : 'sales'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Report Format Selector */}
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setReportType('itemized')}
                  className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                    reportType === 'itemized'
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Download report itemized by product lines"
                >
                  Itemized
                </button>
                <button
                  type="button"
                  onClick={() => setReportType('receipts')}
                  className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                    reportType === 'receipts'
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Download report summarized by receipt totals"
                >
                  Receipts
                </button>
              </div>

              {/* Download Excel Button */}
              <button
                type="button"
                onClick={() => handleDownloadExcel()}
                disabled={filteredSales.length === 0 || isDownloadingExcel}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs border ${
                  excelSuccess
                    ? 'bg-emerald-700 text-white border-emerald-700'
                    : filteredSales.length === 0
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 active:scale-95 cursor-pointer'
                }`}
                title="Download report in Excel format (.csv / spreadsheet)"
              >
                {isDownloadingExcel ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
                    <span>Preparing...</span>
                  </>
                ) : excelSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-white" />
                    <span>Excel Saved!</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Download Excel</span>
                  </>
                )}
              </button>

              {/* Download PDF Button */}
              <button
                type="button"
                onClick={() => handleDownloadPdf()}
                disabled={filteredSales.length === 0 || isDownloadingPdf}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs border ${
                  pdfSuccess
                    ? 'bg-emerald-700 text-white border-emerald-700'
                    : filteredSales.length === 0
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 active:scale-95 cursor-pointer'
                }`}
                title="Download report in PDF format"
              >
                {isDownloadingPdf ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                    <span>Preparing...</span>
                  </>
                ) : pdfSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-white" />
                    <span>PDF Saved!</span>
                  </>
                ) : (
                  <>
                    <FileDown className="w-3.5 h-3.5 text-white" />
                    <span>Download PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>
          {filteredSales.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-800">
                No transactions found for the selected date range or filters
              </p>
              <p className="text-xs text-slate-500">
                Active range: <span className="font-mono">{activeRangeSummary}</span>. Try expanding the date range or resetting your filters.
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Show All Dates &amp; Receipts</span>
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Mobile Card List View (< sm) */}
              <div className="sm:hidden divide-y divide-slate-100">
                {filteredSales.map((sale) => {
                  const isSelected = selectedSale?.id === sale.id;
                  const saleDateOnly = extractSaleDateYmd(sale.createdAt);
                  return (
                    <div
                      key={sale.id}
                      className={`p-3.5 space-y-2.5 transition-colors ${
                        isSelected ? 'bg-emerald-50/60' : 'hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-mono font-bold text-slate-900 text-sm">
                            {sale.receiptNumber}
                          </p>
                          <p className="text-xs text-slate-500 font-mono mt-0.5">
                            {saleDateOnly || sale.createdAt} · {sale.cashierName}
                          </p>
                        </div>
                        <span className="font-mono font-bold text-slate-900 text-sm">
                          {formatCurrency(sale.totalAmount, symbol)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 capitalize">
                          {sale.paymentMethod.replace('_', ' ')}
                        </span>
                        {sale.status === 'completed' ||
                        sale.status === 'completed_demo' ||
                        sale.syncStatus === 'synced' ||
                        sale.syncStatus === 'synced_demo' ? (
                          <span className="text-emerald-700 font-medium inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Completed</span>
                          </span>
                        ) : (
                          <span className="text-amber-700 font-medium inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Pending Sync</span>
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSale(sale);
                          if (onClearInitialSelectedSale) {
                            onClearInitialSelectedSale();
                          }
                        }}
                        aria-label={`View receipt ${sale.receiptNumber}`}
                        className="w-full py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-800 border border-emerald-200 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect Receipt</span>
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Desktop & Tablet Table View (>= sm) */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[620px]">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80 text-xs text-slate-500">
                      <th className="py-3 px-2.5 font-medium whitespace-nowrap">
                        Receipt #
                      </th>
                      <th className="py-3 px-2.5 font-medium whitespace-nowrap">
                        <button
                          type="button"
                          onClick={handleToggleDateColumnSort}
                          className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:text-emerald-700"
                          title="Sort by transaction date and time"
                        >
                          <span>Date &amp; Time</span>
                          {sortOrder === 'date_desc' ? (
                            <ArrowDown className="w-3.5 h-3.5 text-emerald-700" />
                          ) : sortOrder === 'date_asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 text-emerald-700" />
                          ) : (
                            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                          )}
                        </button>
                      </th>
                      <th className="py-3 px-2.5 font-medium whitespace-nowrap">
                        Cashier
                      </th>
                      <th className="py-3 px-2.5 font-medium whitespace-nowrap">
                        Payment
                      </th>
                      <th className="py-3 px-2.5 font-medium whitespace-nowrap">
                        Status
                      </th>
                      <th className="py-3 px-2.5 font-medium text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={handleToggleAmountColumnSort}
                          className="inline-flex items-center justify-end gap-1 font-semibold text-slate-700 hover:text-emerald-700 ml-auto"
                          title="Sort by receipt total amount"
                        >
                          <span>Total</span>
                          {sortOrder === 'amount_desc' ? (
                            <ArrowDown className="w-3.5 h-3.5 text-emerald-700" />
                          ) : sortOrder === 'amount_asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 text-emerald-700" />
                          ) : (
                            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                          )}
                        </button>
                      </th>
                      <th className="py-3 px-2.5 font-medium text-right whitespace-nowrap">
                        Detail
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredSales.map((sale) => {
                      const isSelected = selectedSale?.id === sale.id;
                      const saleDateOnly = extractSaleDateYmd(sale.createdAt);
                      return (
                        <tr
                          key={sale.id}
                          onClick={() => {
                            setSelectedSale(sale);
                            if (onClearInitialSelectedSale) {
                              onClearInitialSelectedSale();
                            }
                          }}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-emerald-50/60'
                              : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td className="py-3.5 px-2.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {sale.receiptNumber}
                          </td>
                          <td className="py-3.5 px-2.5 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                            <span className="text-slate-900 font-medium">
                              {saleDateOnly || sale.createdAt}
                            </span>
                            {saleDateOnly &&
                              sale.createdAt.length > saleDateOnly.length && (
                                <span className="block text-[11px] text-slate-400">
                                  {sale.createdAt
                                    .slice(saleDateOnly.length)
                                    .trim()}
                                </span>
                              )}
                          </td>
                          <td className="py-3.5 px-2.5 text-slate-700 whitespace-nowrap">
                            {sale.cashierName}
                          </td>
                          <td className="py-3.5 px-2.5 capitalize text-slate-700 whitespace-nowrap">
                            {sale.paymentMethod.replace('_', ' ')}
                          </td>
                          <td className="py-3.5 px-2.5 whitespace-nowrap">
                            {sale.status === 'completed' ||
                            sale.status === 'completed_demo' ||
                            sale.syncStatus === 'synced' ||
                            sale.syncStatus === 'synced_demo' ? (
                              <span className="text-emerald-700 font-medium inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Completed</span>
                              </span>
                            ) : (
                              <span className="text-amber-700 font-medium inline-flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                <span>Pending Sync</span>
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-2.5 font-mono tabular-nums font-bold text-slate-900 text-right whitespace-nowrap">
                            {formatCurrency(sale.totalAmount, symbol)}
                          </td>
                          <td className="py-3.5 px-2.5 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedSale(sale);
                              }}
                              aria-label={`View receipt ${sale.receiptNumber}`}
                              className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-semibold"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        {/* Right 4 Columns: Transaction Detail View */}
        <aside
          aria-label="Transaction Detail View"
          className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5"
        >
          {!selectedSale ? (
            <div className="py-12 text-center">
              <ReceiptText className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-700 mt-3">
                Select a Transaction Row
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Click any receipt in the table to inspect line items, payment reference, and synchronization state.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                <div>
                  <span className="text-xs font-mono text-emerald-700 font-semibold">
                    Receipt Detail · {shop.code}
                  </span>
                  <h2 className="text-base font-display font-bold font-mono text-slate-900 mt-0.5">
                    {selectedSale.receiptNumber}
                  </h2>
                  <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                    {selectedSale.createdAt} · Terminal {selectedSale.terminalId}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSale(null)}
                  aria-label="Close transaction detail"
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                <div>
                  <span className="text-slate-500">Cashier Operator</span>
                  <p className="font-semibold text-slate-900 mt-0.5">
                    {selectedSale.cashierName}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Payment Method</span>
                  <p className="font-semibold text-slate-900 capitalize mt-0.5">
                    {selectedSale.paymentMethod.replace('_', ' ')}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Sync Queue Status</span>
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {selectedSale.status === 'completed' ||
                    selectedSale.syncStatus === 'synced' ||
                    selectedSale.syncStatus === 'synced_demo'
                      ? 'Cloud Synced (Verified)'
                      : 'Queued Locally (Pending Sync)'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Reference</span>
                  <p className="font-mono text-slate-800 mt-0.5">
                    {selectedSale.paymentReference || 'Cash Drawer'}
                  </p>
                </div>
              </div>

              {/* Line Items Table */}
              <div>
                <h3 className="text-xs font-semibold text-slate-700 mb-2">
                  Receipt Line Items ({selectedSale.items.length})
                </h3>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                        <th className="py-2 px-3 font-medium">Item</th>
                        <th className="py-2 px-3 font-medium text-right">Qty</th>
                        <th className="py-2 px-3 font-medium text-right">Unit</th>
                        <th className="py-2 px-3 font-medium text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedSale.items.map((item) => (
                        <tr key={item.id}>
                          <td className="py-2.5 px-3">
                            <p className="font-medium text-slate-900">
                              {item.productName}
                            </p>
                            <p className="font-mono text-slate-400">
                              {item.sku}
                            </p>
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-right">
                            {item.quantity}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-right text-slate-600">
                            {formatCurrency(item.unitPrice, symbol)}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums font-semibold text-right text-slate-900">
                            {formatCurrency(item.lineTotal, symbol)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="pt-3 border-t border-slate-200 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(selectedSale.subtotal, symbol)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Discount</span>
                  <span className="font-mono tabular-nums text-emerald-700">
                    −{formatCurrency(selectedSale.discountAmount, symbol)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>VAT / Tax ({selectedSale.taxRatePercent}%)</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(selectedSale.taxAmount, symbol)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-100 text-sm font-display font-bold text-slate-900">
                  <span>Receipt Total</span>
                  <span className="font-mono tabular-nums text-emerald-700">
                    {formatCurrency(selectedSale.totalAmount, symbol)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500 pt-1">
                  <span>Amount Tendered</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(selectedSale.amountTendered, symbol)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Change Given</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(selectedSale.changeDue, symbol)}
                  </span>
                </div>
              </div>

              {/* Receipt Reprint Control (Enforces Shop Printer Settings Policy) */}
              <div className="pt-3 border-t border-slate-200 space-y-2">
                {printerSettings.allowReceiptReprint ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setReprintDispatched(false);
                        setReprintModalSale(selectedSale);
                      }}
                      className="w-full py-2.5 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      <Printer className="w-4 h-4" />
                      <span>
                        Reprint Receipt ({printerSettings.receiptPrinterMode.toUpperCase()} Mode)
                      </span>
                    </button>
                    <p className="text-[11px] text-slate-500 text-center">
                      Default: <span className="font-semibold text-slate-700">{activeDefaultPrinter.printerName}</span> · Prints with Duplicate watermark
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs space-y-1.5">
                    <button
                      type="button"
                      disabled
                      className="w-full py-2 px-3 rounded-lg bg-slate-200 text-slate-500 font-semibold flex items-center justify-center gap-1.5 cursor-not-allowed"
                    >
                      <Lock className="w-3.5 h-3.5 text-amber-700" />
                      <span>Receipt Reprint Disabled</span>
                    </button>
                    <p className="text-[11px] text-amber-900/90 leading-relaxed text-center">
                      Reprinting is disabled in <strong>Settings &rarr; Printer Settings</strong> to prevent duplicate receipt fraud.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Duplicate Receipt Reprint Modal */}
      {reprintModalSale && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Reprint Duplicate Receipt"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden text-xs">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-slate-900 text-white">
                  <Printer className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-display font-bold text-slate-900">
                    Reprint Receipt · {reprintModalSale.receiptNumber}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Default Printer: {activeDefaultPrinter.printerName} ({printerSettings.receiptPrinterMode.toUpperCase()} Mode)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReprintModalSale(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto bg-slate-100 flex-1 flex justify-center">
              {printerSettings.receiptPrinterMode === 'thermal' ? (
                <div
                  className={`bg-white border border-slate-300 shadow-md p-4 font-mono text-[11px] space-y-2.5 ${
                    printerSettings.thermalPaperWidth === '58mm'
                      ? 'w-64'
                      : 'w-80'
                  }`}
                >
                  <div className="text-center border-b border-dashed border-slate-300 pb-2">
                    <p className="font-bold text-xs text-slate-900">
                      {shop.name}
                    </p>
                    <p className="text-slate-500">{shop.address}</p>
                    <div className="mt-1.5 py-1 px-2 bg-amber-100 border border-amber-300 text-amber-950 font-bold text-[10px]">
                      *** DUPLICATE / REPRINT RECEIPT ***
                    </div>
                  </div>

                  <div className="space-y-0.5 text-[10px] border-b border-dashed border-slate-300 pb-2">
                    <div className="flex justify-between">
                      <span>Receipt #:</span>
                      <span className="font-bold">
                        {reprintModalSale.receiptNumber}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Original Date:</span>
                      <span>{reprintModalSale.createdAt}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cashier:</span>
                      <span>{reprintModalSale.cashierName}</span>
                    </div>
                  </div>

                  <div className="space-y-1 border-b border-dashed border-slate-300 pb-2">
                    {reprintModalSale.items.map((item) => (
                      <div key={item.id} className="flex justify-between">
                        <span className="truncate pr-2">
                          {item.quantity}x {item.productName}
                        </span>
                        <span>{formatCurrency(item.lineTotal, symbol)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between font-bold text-xs pt-1">
                    <span>TOTAL:</span>
                    <span>
                      {formatCurrency(reprintModalSale.totalAmount, symbol)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-slate-300 shadow-md p-6 w-full space-y-4">
                  <div className="flex items-start justify-between border-b border-slate-200 pb-3">
                    <div>
                      <h4 className="font-display font-bold text-sm text-slate-900">
                        {business.name} — {shop.name}
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {shop.address} · Tel: {shop.phone}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="px-2 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-900 font-mono text-[10px] font-bold">
                        *** DUPLICATE / REPRINT A4 ***
                      </span>
                      <p className="font-mono font-bold text-xs text-slate-900 mt-1">
                        {reprintModalSale.receiptNumber}
                      </p>
                    </div>
                  </div>

                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-1.5">Item</th>
                        <th className="py-1.5 text-right">Qty</th>
                        <th className="py-1.5 text-right">Unit</th>
                        <th className="py-1.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reprintModalSale.items.map((item) => (
                        <tr key={item.id}>
                          <td className="py-2 font-medium">{item.productName}</td>
                          <td className="py-2 text-right font-mono">
                            {item.quantity}
                          </td>
                          <td className="py-2 text-right font-mono">
                            {formatCurrency(item.unitPrice, symbol)}
                          </td>
                          <td className="py-2 text-right font-mono font-semibold">
                            {formatCurrency(item.lineTotal, symbol)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="border-t border-slate-200 pt-3 flex justify-between items-end">
                    <span className="text-[10px] text-slate-500">
                      Original Date: {reprintModalSale.createdAt}
                    </span>
                    <div className="text-right">
                      <span className="text-slate-500 text-[11px]">Total:</span>
                      <p className="font-mono font-bold text-sm text-emerald-700">
                        {formatCurrency(reprintModalSale.totalAmount, symbol)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {reprintDispatched && (
              <div className="px-5 py-2.5 bg-emerald-50 border-t border-emerald-200 text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Duplicate receipt printed silently to{' '}
                  <strong>{activeDefaultPrinter.printerName}</strong>.
                </span>
              </div>
            )}

            <div className="px-5 py-3.5 border-t border-slate-200 bg-white flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setReprintModalSale(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 font-semibold text-slate-700 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                disabled={isReprinting}
                onClick={async () => {
                  if (!reprintModalSale) return;
                  setIsReprinting(true);
                  try {
                    const result = await printSaleReceipt({
                      sale: reprintModalSale,
                      shop,
                      business,
                      isDuplicate: true,
                    });
                    if (result.success) {
                      setReprintDispatched(true);
                    }
                  } finally {
                    setIsReprinting(false);
                  }
                }}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Printer
                  className={`w-3.5 h-3.5 ${isReprinting ? 'animate-spin' : ''}`}
                />
                <span>
                  {isReprinting ? 'Printing...' : 'Print Duplicate Receipt'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
