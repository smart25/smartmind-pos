import React, { useMemo, useState, useEffect } from 'react';
import {
  Search,
  ReceiptText,
  Calendar,
  RotateCcw,
  FileSpreadsheet,
  FileDown,
  Check,
  Loader2,
  User as UserIcon,
  CreditCard,
  X,
  FileText,
  Sparkles,
} from 'lucide-react';
import {
  Business,
  DebtCustomer,
  PaymentMethod,
  SaleTransaction,
  Shop,
  User,
} from '../types/pos';
import {
  buildSalesSummaryReportData,
  filterAndSortSalesHistory,
  formatCurrency,
  formatReportDateRangeDmy,
  getDateRangeBoundsForPreset,
  getShopSalesUsers,
  getTodayYmd,
  SalesDateRangePreset,
  SalesDateSortOrder,
} from '../utils/posCalculations';
import {
  downloadSalesSummaryPdf,
  formatPaymentMethodLabel,
} from '../utils/pdfGenerator';
import { downloadSalesHistoryExcel } from '../utils/csvGenerator';

interface SalesSummaryPageProps {
  business: Business;
  shop: Shop;
  shopSales: SaleTransaction[];
  businessUsers?: User[];
  shopDebtCustomers?: DebtCustomer[];
  currentUser: User;
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

export const SalesSummaryPage: React.FC<SalesSummaryPageProps> = ({
  business,
  shop,
  shopSales,
  businessUsers = [],
  shopDebtCustomers = [],
  currentUser,
}) => {
  const draftStorageKey = `smartmind_sales_summary_draft_${shop.id}`;

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

  // Filters State: staff, date, payment method, search
  const [searchQuery, setSearchQuery] = useState<string>(
    () => savedDraft?.searchQuery ?? ''
  );
  const [staffFilter, setStaffFilter] = useState<string>(
    () => savedDraft?.staffFilter ?? 'all'
  );
  const [paymentFilter, setPaymentFilter] = useState<'all' | PaymentMethod>(
    () => savedDraft?.paymentFilter ?? 'all'
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

  // Report Generation Modal State
  const [reportModalOpen, setReportModalOpen] = useState<boolean>(false);
  const [selectedFormat, setSelectedFormat] = useState<'pdf' | 'csv'>('pdf');
  const [isGeneratingReport, setIsGeneratingReport] = useState<boolean>(false);
  const [reportSuccess, setReportSuccess] = useState<boolean>(false);

  // Quick 1-click download states
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [pdfSuccess, setPdfSuccess] = useState<boolean>(false);
  const [isDownloadingCsv, setIsDownloadingCsv] = useState<boolean>(false);
  const [csvSuccess, setCsvSuccess] = useState<boolean>(false);

  useEffect(() => {
    try {
      const serialized = JSON.stringify({
        searchQuery,
        staffFilter,
        paymentFilter,
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
    staffFilter,
    paymentFilter,
    datePreset,
    startDate,
    endDate,
    sortOrder,
  ]);

  const symbol = business.currencySymbol;

  // Available staff in this shop
  const shopUsers = useMemo(
    () => getShopSalesUsers(shopSales, businessUsers, shop.id, business.id),
    [shopSales, businessUsers, shop.id, business.id]
  );

  const selectedStaffObj = useMemo(
    () =>
      staffFilter === 'all'
        ? null
        : shopUsers.find((u) => u.id === staffFilter) ?? null,
    [staffFilter, shopUsers]
  );

  // Filtered sales
  const filteredSales = useMemo(
    () =>
      filterAndSortSalesHistory(shopSales, {
        searchQuery,
        userId: staffFilter,
        paymentFilter,
        statusFilter: 'all',
        startDate,
        endDate,
        sortOrder,
      }),
    [
      shopSales,
      searchQuery,
      staffFilter,
      paymentFilter,
      startDate,
      endDate,
      sortOrder,
    ]
  );

  // Total outstanding credit in shop debt book (used when no specific credit sales in filtered subset)
  const shopOutstandingDebtTotal = useMemo(() => {
    if (staffFilter !== 'all' || (paymentFilter !== 'all' && paymentFilter !== 'credit')) {
      return 0;
    }
    return (
      Math.round(
        shopDebtCustomers
          .filter((c) => c.balanceRemaining > 0)
          .reduce((sum, c) => sum + c.balanceRemaining, 0) * 100
      ) / 100
    );
  }, [shopDebtCustomers, staffFilter, paymentFilter]);

  // Build non-itemized Sales Summary Report data matching the reference Sales Report sample
  const reportData = useMemo(
    () =>
      buildSalesSummaryReportData(filteredSales, {
        outstandingCreditFallback: shopOutstandingDebtTotal,
      }),
    [filteredSales, shopOutstandingDebtTotal]
  );

  // Formatted DD-MMM-YYYY - DD-MMM-YYYY date range label matching the sample PDF (e.g. "23-Oct-2026 - 23-Oct-2026")
  const reportDateRangeDmy = useMemo(
    () => formatReportDateRangeDmy(filteredSales, startDate, endDate, todayYmd),
    [filteredSales, startDate, endDate, todayYmd]
  );

  const handleSelectPreset = (preset: SalesDateRangePreset) => {
    setDatePreset(preset);
    if (preset === 'custom') return;
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

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    setDatePreset(val || endDate ? 'custom' : 'all');
  };

  const handleEndDateChange = (val: string) => {
    setEndDate(val);
    setDatePreset(startDate || val ? 'custom' : 'all');
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setStaffFilter('all');
    setPaymentFilter('all');
    setDatePreset('all');
    setStartDate('');
    setEndDate('');
    setSortOrder('date_desc');
  };

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    staffFilter !== 'all' ||
    paymentFilter !== 'all' ||
    Boolean(startDate) ||
    Boolean(endDate) ||
    datePreset !== 'all' ||
    sortOrder !== 'date_desc';

  const selectedSingleDayValue =
    startDate && endDate && startDate === endDate ? startDate : '';

  const activeRangeSummary = useMemo(() => {
    if (!startDate && !endDate) return reportDateRangeDmy;
    if (startDate && endDate) {
      if (startDate === endDate) {
        if (startDate === todayYmd) return `Today (${reportDateRangeDmy})`;
        if (startDate === yesterdayYmd) return `Yesterday (${reportDateRangeDmy})`;
        return reportDateRangeDmy;
      }
      return reportDateRangeDmy;
    }
    return reportDateRangeDmy;
  }, [startDate, endDate, todayYmd, yesterdayYmd, reportDateRangeDmy]);

  const activeFilterSummaryLabel = useMemo(() => {
    const parts = [reportDateRangeDmy];
    if (selectedStaffObj) {
      parts.push(`Staff: ${selectedStaffObj.fullName}`);
    }
    if (paymentFilter !== 'all') {
      parts.push(`Payment: ${formatPaymentMethodLabel(paymentFilter)}`);
    }
    return parts.join(' · ');
  }, [reportDateRangeDmy, selectedStaffObj, paymentFilter]);

  // Export handlers (Staff-aggregated Sales Summary without listing items)
  const handleDownloadCsv = () => {
    if (isDownloadingCsv) return;
    setIsDownloadingCsv(true);
    try {
      downloadSalesHistoryExcel({
        sales: filteredSales,
        business,
        shop,
        dateRangeLabel: reportDateRangeDmy,
        symbol,
        reportType: 'staff_summary',
        outstandingCreditFallback: shopOutstandingDebtTotal,
      });
      setCsvSuccess(true);
      setTimeout(() => setCsvSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to generate sales summary CSV:', err);
    } finally {
      setIsDownloadingCsv(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (isDownloadingPdf) return;
    setIsDownloadingPdf(true);
    try {
      await downloadSalesSummaryPdf({
        sales: filteredSales,
        business,
        shop,
        dateRangeLabel: reportDateRangeDmy,
        symbol,
        generatedBy: currentUser.fullName,
        reportType: 'staff_summary',
        outstandingCreditFallback: shopOutstandingDebtTotal,
        elementId: 'sales-summary-report-sheet',
      });
      setPdfSuccess(true);
      setTimeout(() => setPdfSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to generate sales summary PDF:', err);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleExecuteModalReport = async () => {
    if (isGeneratingReport) return;
    setIsGeneratingReport(true);
    try {
      if (selectedFormat === 'pdf') {
        await downloadSalesSummaryPdf({
          sales: filteredSales,
          business,
          shop,
          dateRangeLabel: reportDateRangeDmy,
          symbol,
          generatedBy: currentUser.fullName,
          reportType: 'staff_summary',
          outstandingCreditFallback: shopOutstandingDebtTotal,
          elementId: 'sales-summary-report-sheet',
        });
      } else {
        downloadSalesHistoryExcel({
          sales: filteredSales,
          business,
          shop,
          dateRangeLabel: reportDateRangeDmy,
          symbol,
          reportType: 'staff_summary',
          outstandingCreditFallback: shopOutstandingDebtTotal,
        });
      }
      setReportSuccess(true);
      setTimeout(() => {
        setReportSuccess(false);
        setReportModalOpen(false);
      }, 1000);
    } catch (err) {
      console.error('Failed to generate report:', err);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      {/* Top Banner & Generate Report CTA */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
              Sales Summary · Total Sales Report
            </span>
            <span className="text-xs font-mono text-slate-500">
              {shop.code} · {shop.name}
            </span>
          </div>
          <h1 className="text-lg sm:text-xl font-display font-bold text-slate-900">
            Total Sales Summary (No Itemized Lines)
          </h1>
          <p className="text-xs text-slate-500">
            Filter total sales by staff, date, and payment method, then generate your summary report in PDF or CSV format.
          </p>
        </div>

        {/* Action Buttons: Primary "Generate Report" modal + Quick 1-click PDF / CSV */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setReportSuccess(false);
              setReportModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white shadow-sm transition-all cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-emerald-100" />
            <span>Generate Report (PDF / CSV)</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isDownloadingPdf}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
              pdfSuccess
                ? 'bg-emerald-700 text-white border-emerald-700'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
            }`}
            title="Quick download Sales Report as PDF"
          >
            {isDownloadingPdf ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
            ) : pdfSuccess ? (
              <Check className="w-3.5 h-3.5 text-white" />
            ) : (
              <FileDown className="w-3.5 h-3.5 text-emerald-600" />
            )}
            <span>{pdfSuccess ? 'PDF Saved' : 'PDF'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={isDownloadingCsv}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
              csvSuccess
                ? 'bg-emerald-700 text-white border-emerald-700'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
            }`}
            title="Quick download Sales Report as CSV"
          >
            {isDownloadingCsv ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
            ) : csvSuccess ? (
              <Check className="w-3.5 h-3.5 text-white" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            )}
            <span>{csvSuccess ? 'CSV Saved' : 'CSV'}</span>
          </button>
        </div>
      </div>

      {/* Filter Bar: Staff, Payment Method, Date Presets, Single Day & Date Range */}
      <section
        aria-label="Sales Summary Filters"
        className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4 shadow-2xs"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          {/* 1. Staff Filter */}
          <div className="lg:col-span-4">
            <label
              htmlFor="summary-staff-filter"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Filter by Staff / Cashier
            </label>
            <div className="relative">
              <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                id="summary-staff-filter"
                value={staffFilter}
                onChange={(e) => setStaffFilter(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="all">All Staff Members ({shopUsers.length})</option>
                {shopUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                    {u.roleLabel ? ` (${u.roleLabel})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 2. Payment Method Filter */}
          <div className="lg:col-span-4">
            <label
              htmlFor="summary-payment-filter"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Filter by Payment Method
            </label>
            <div className="relative">
              <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                id="summary-payment-filter"
                value={paymentFilter}
                onChange={(e) =>
                  setPaymentFilter(e.target.value as 'all' | PaymentMethod)
                }
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="all">All Payment Methods</option>
                <option value="bank_transfer">Transfer (Bank Transfer)</option>
                <option value="pos_card">Pos (POS Card)</option>
                <option value="cash">Cash</option>
                <option value="credit">Credit (Debt Book)</option>
                <option value="split_payment">Split Payment</option>
              </select>
            </div>
          </div>

          {/* 3. Search Staff Name */}
          <div className="lg:col-span-4">
            <label
              htmlFor="summary-search"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Search Staff or Receipt
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="summary-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by staff name..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>
        </div>

        {/* Date Presets & Custom Date Pickers */}
        <div className="pt-3 border-t border-slate-100 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-emerald-700" />
              <span className="text-xs font-semibold text-slate-700">
                Filter by Date Period:
              </span>
              <span className="text-xs font-mono font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                {activeRangeSummary}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {DATE_PRESET_OPTIONS.map((preset) => {
                const isActive = datePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Single Day Picker & Custom Range Pickers */}
          <div className="flex flex-wrap items-end gap-2.5">
            <div>
              <label
                htmlFor="summary-single-day"
                className="block text-[11px] font-medium text-slate-500 mb-1"
              >
                Particular Day
              </label>
              <input
                id="summary-single-day"
                type="date"
                value={selectedSingleDayValue}
                onChange={(e) => handleSelectSingleDay(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label
                htmlFor="summary-start-date"
                className="block text-[11px] font-medium text-slate-500 mb-1"
              >
                From Date
              </label>
              <input
                id="summary-start-date"
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label
                htmlFor="summary-end-date"
                className="block text-[11px] font-medium text-slate-500 mb-1"
              >
                To Date
              </label>
              <input
                id="summary-end-date"
                type="date"
                value={endDate}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* SALES REPORT DOCUMENT SHEET (Matches Reference PDF 1:1 — No Items Listed) */}
      <section
        id="sales-summary-report-sheet"
        aria-label="Sales Summary Report Document"
        className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-10 space-y-8 text-slate-900"
      >
        {/* 1. Centered / Offset Report Header */}
        <div className="max-w-md mx-auto sm:ml-[32%] space-y-1 text-left">
          <h2 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight text-black uppercase">
            SALES REPORT
          </h2>
          <p className="text-sm font-bold text-black font-mono">
            {reportDateRangeDmy}
          </p>
          <p className="text-sm text-slate-800 leading-snug">
            {business.legalName || business.name}
            <span className="block text-xs text-slate-600 mt-0.5">
              {shop.name} ({shop.code})
            </span>
          </p>
        </div>

        {/* 2. Two-Column Summary Breakdown (Payment Method Breakdown on Left, Totals on Right) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
          {/* Left Column: Payment Method Breakdown */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-black">
              Payment Method Breakdown
            </h3>
            <div className="space-y-1.5 text-sm max-w-xs">
              <div className="grid grid-cols-2 items-center">
                <span className="text-slate-800">Transfer</span>
                <span className="font-mono font-medium text-slate-900">
                  {formatCurrency(reportData.transferTotal, symbol)}
                </span>
              </div>
              <div className="grid grid-cols-2 items-center">
                <span className="text-slate-800">Pos</span>
                <span className="font-mono font-medium text-slate-900">
                  {formatCurrency(reportData.posTotal, symbol)}
                </span>
              </div>
              <div className="grid grid-cols-2 items-center">
                <span className="text-slate-800">Cash</span>
                <span className="font-mono font-medium text-slate-900">
                  {formatCurrency(reportData.cashTotal, symbol)}
                </span>
              </div>
              {reportData.splitTotal > 0 && (
                <div className="grid grid-cols-2 items-center">
                  <span className="text-slate-800">Split</span>
                  <span className="font-mono font-medium text-slate-900">
                    {formatCurrency(reportData.splitTotal, symbol)}
                  </span>
                </div>
              )}
              {reportData.creditSalesTotal > 0 && (
                <div className="grid grid-cols-2 items-center">
                  <span className="text-slate-800">Credit</span>
                  <span className="font-mono font-medium text-slate-900">
                    {formatCurrency(reportData.creditSalesTotal, symbol)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Total Sales, VAT Collected, Outstanding Credit, Total Refunds */}
          <div className="space-y-1.5 text-sm md:pl-8">
            <div className="flex items-center justify-between font-bold text-black">
              <span>Total Sales</span>
              <span className="font-mono tabular-nums">
                {formatCurrency(reportData.totalSales, symbol)}
              </span>
            </div>
            <div className="flex items-center justify-between text-blue-800 font-medium">
              <span>VAT Collected</span>
              <span className="font-mono tabular-nums">
                {formatCurrency(reportData.vatCollected, symbol)}
              </span>
            </div>
            <div className="flex items-center justify-between text-red-600 font-medium">
              <span>Outstanding Credit</span>
              <span className="font-mono tabular-nums">
                {formatCurrency(reportData.outstandingCredit, symbol)}
              </span>
            </div>
            <div className="flex items-center justify-between text-amber-500 font-medium">
              <span>Total Refunds</span>
              <span className="font-mono tabular-nums">
                {formatCurrency(reportData.totalRefunds, symbol)}
              </span>
            </div>
          </div>
        </div>

        {/* 3. Main Summary Table (No Items Listed — Aggregated by Staff) */}
        <div className="overflow-x-auto pt-2">
          <table className="w-full text-left border-collapse text-xs sm:text-sm min-w-[720px]">
            <thead>
              <tr className="bg-[#9aa8b8] text-slate-900 font-bold">
                <th className="py-2.5 px-3 text-center w-12">#</th>
                <th className="py-2.5 px-3">Date &amp; Time</th>
                <th className="py-2.5 px-3">Product Name</th>
                <th className="py-2.5 px-3">Product Type</th>
                <th className="py-2.5 px-3 text-right">Quantity</th>
                <th className="py-2.5 px-3 text-right">Amount</th>
                <th className="py-2.5 px-3 text-center">Payment Method</th>
                <th className="py-2.5 px-3">Staff</th>
              </tr>
            </thead>
            <tbody>
              {reportData.staffRows.length === 0 ? (
                <tr className="bg-slate-50 text-slate-500">
                  <td colSpan={8} className="py-10 text-center text-xs">
                    No sales records found for the selected filter criteria ({activeFilterSummaryLabel}).
                  </td>
                </tr>
              ) : (
                reportData.staffRows.map((row, idx) => (
                  <tr
                    key={row.staffId}
                    onClick={() =>
                      setStaffFilter((prev) =>
                        prev === row.staffId ? 'all' : row.staffId
                      )
                    }
                    title="Click to filter by this staff member"
                    className={`cursor-pointer transition-colors ${
                      idx % 2 === 1 ? 'bg-[#f2f4f7]' : 'bg-white'
                    } hover:bg-emerald-50/60`}
                  >
                    <td className="py-3.5 px-3 text-center font-mono text-slate-800">
                      {row.index}
                    </td>
                    <td className="py-3.5 px-3 text-slate-700 font-mono">
                      {row.dateTime}
                    </td>
                    <td className="py-3.5 px-3 text-slate-700 font-mono">
                      {row.productName}
                    </td>
                    <td className="py-3.5 px-3 text-slate-700 font-mono">
                      {row.productType}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-900">
                      {row.quantity.toLocaleString('en-US')}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatCurrency(row.amount, symbol)}
                    </td>
                    <td className="py-3.5 px-3 text-center text-slate-800">
                      {row.paymentMethod}
                    </td>
                    <td className="py-3.5 px-3 font-medium text-slate-900">
                      {row.staffName}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {reportData.staffRows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold text-slate-900">
                  <td className="py-3 px-3 text-center">Total</td>
                  <td className="py-3 px-3 font-mono">--</td>
                  <td className="py-3 px-3 font-mono">--</td>
                  <td className="py-3 px-3 font-mono">--</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    {reportData.totalQuantity.toLocaleString('en-US')}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-800">
                    {formatCurrency(reportData.totalSales, symbol)}
                  </td>
                  <td className="py-3 px-3 text-center">
                    {reportData.totalReceiptsCount} receipt{reportData.totalReceiptsCount === 1 ? '' : 's'}
                  </td>
                  <td className="py-3 px-3">
                    {reportData.staffRows.length} staff
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* 4. Document Footer */}
        <div className="pt-8 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
          <span>Powered By SmartMind POS</span>
          <span>Page 1 of 1</span>
          <span>www.smartmindpos.ng</span>
        </div>
      </section>

      {/* GENERATE REPORT MODAL WITH EXPLICIT PDF / CSV SELECTION */}
      {reportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900">
                    Generate Sales Summary Report
                  </h3>
                  <p className="text-xs text-slate-500">
                    Total sales summary by staff and payment method without listing items
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                aria-label="Close modal"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs">
              {/* Summary of Report Scope */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                <p className="font-semibold text-slate-700">Report Parameters:</p>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                  <div>
                    <span className="text-slate-400">Shop:</span>{' '}
                    <strong className="text-slate-800">{shop.name}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Period:</span>{' '}
                    <strong className="text-slate-800 font-mono">{reportDateRangeDmy}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Staff Filter:</span>{' '}
                    <strong className="text-slate-800">
                      {selectedStaffObj ? selectedStaffObj.fullName : 'All Staff'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Payment:</span>{' '}
                    <strong className="text-slate-800">
                      {paymentFilter === 'all'
                        ? 'All Methods'
                        : formatPaymentMethodLabel(paymentFilter)}
                    </strong>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 flex items-center justify-between font-mono">
                  <span className="text-slate-600">
                    Staff Rows: <strong>{reportData.staffRows.length}</strong> ({reportData.totalQuantity} units)
                  </span>
                  <span className="text-emerald-700 font-bold text-sm">
                    Total Sales: {formatCurrency(reportData.totalSales, symbol)}
                  </span>
                </div>
              </div>

              {/* Format Selection (PDF vs CSV) */}
              <div>
                <label className="block font-semibold text-slate-800 mb-2">
                  Select File Format:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {/* PDF Option */}
                  <label
                    onClick={() => setSelectedFormat('pdf')}
                    className={`p-3.5 rounded-xl border-2 flex flex-col justify-between cursor-pointer transition-all ${
                      selectedFormat === 'pdf'
                        ? 'border-emerald-600 bg-emerald-50/50 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <FileDown
                        className={`w-5 h-5 ${
                          selectedFormat === 'pdf'
                            ? 'text-emerald-700'
                            : 'text-slate-500'
                        }`}
                      />
                      <input
                        type="radio"
                        name="report-file-format"
                        value="pdf"
                        checked={selectedFormat === 'pdf'}
                        onChange={() => setSelectedFormat('pdf')}
                        className="text-emerald-600 focus:ring-emerald-600"
                      />
                    </div>
                    <div className="mt-2.5">
                      <p className="font-bold text-slate-900 text-xs">
                        PDF Document (.pdf)
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                        Official Sales Report PDF with Payment Method Breakdown and Staff Totals
                      </p>
                    </div>
                  </label>

                  {/* CSV Option */}
                  <label
                    onClick={() => setSelectedFormat('csv')}
                    className={`p-3.5 rounded-xl border-2 flex flex-col justify-between cursor-pointer transition-all ${
                      selectedFormat === 'csv'
                        ? 'border-emerald-600 bg-emerald-50/50 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <FileSpreadsheet
                        className={`w-5 h-5 ${
                          selectedFormat === 'csv'
                            ? 'text-emerald-700'
                            : 'text-slate-500'
                        }`}
                      />
                      <input
                        type="radio"
                        name="report-file-format"
                        value="csv"
                        checked={selectedFormat === 'csv'}
                        onChange={() => setSelectedFormat('csv')}
                        className="text-emerald-600 focus:ring-emerald-600"
                      />
                    </div>
                    <div className="mt-2.5">
                      <p className="font-bold text-slate-900 text-xs">
                        CSV Spreadsheet (.csv)
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                        Excel-ready summary spreadsheet with Payment Breakdown and Staff Totals
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:px-5 border-t border-slate-100 flex items-center justify-end gap-2.5 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleExecuteModalReport}
                disabled={isGeneratingReport}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ${
                  reportSuccess
                    ? 'bg-emerald-700 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white'
                }`}
              >
                {isGeneratingReport ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Preparing {selectedFormat.toUpperCase()}...</span>
                  </>
                ) : reportSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>{selectedFormat.toUpperCase()} Downloaded!</span>
                  </>
                ) : (
                  <>
                    <FileDown className="w-4 h-4 text-white" />
                    <span>Download {selectedFormat.toUpperCase()} Report</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
