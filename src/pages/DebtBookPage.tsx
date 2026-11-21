import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  BookOpen,
  UserPlus,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  ShieldAlert,
  CheckCircle2,
  Phone,
  User as UserIcon,
  Wallet,
  CreditCard,
  PlusCircle,
  FileText,
  FileSpreadsheet,
  Download,
  ChevronDown,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  Business,
  DebtCustomer,
  DebtTransaction,
  DebtTransactionType,
  PaymentMethod,
  Shop,
  User,
} from '../types/pos';
import {
  calculateDebtBookSummary,
  CreateDebtCustomerInput,
  formatCurrency,
  validateDebtCustomerInput,
} from '../utils/posCalculations';
import { downloadDebtBookReportPdf } from '../utils/pdfGenerator';
import {
  downloadDebtCustomersCsv,
  downloadDebtTransactionsCsv,
  downloadCustomerStatementCsv,
} from '../utils/csvGenerator';

interface DebtBookPageProps {
  business: Business;
  shop: Shop;
  currentUser: User;
  shopDebtCustomers: DebtCustomer[];
  shopDebtTransactions: DebtTransaction[];
  onAddDebtCustomer: (
    input: CreateDebtCustomerInput,
    initialTransaction?: {
      type: DebtTransactionType;
      amount: number;
      notes?: string;
    }
  ) => DebtCustomer;
  onRecordDebtTransaction: (
    customerId: string,
    type: DebtTransactionType,
    amount: number,
    options?: {
      paymentMethod?: PaymentMethod;
      reference?: string;
      notes?: string;
    }
  ) => void;
}

type DebtBookTab = 'overview' | 'transactions' | 'add_customer';

interface DebtCustomerFormDraft {
  activeTab: DebtBookTab;
  fullName: string;
  phone: string;
  creditLimitEnabled: boolean;
  creditLimitInput: string;
  customerNotes: string;
  initialCreditInput: string;
  initialPaidInput: string;
}

export const DebtBookPage: React.FC<DebtBookPageProps> = ({
  business,
  shop,
  currentUser,
  shopDebtCustomers,
  shopDebtTransactions,
  onAddDebtCustomer,
  onRecordDebtTransaction,
}) => {
  const currencySymbol = business.currencySymbol;
  const draftKey = `smartmind_debt_book_draft_${shop.id}`;

  const savedDraft = useMemo<Partial<DebtCustomerFormDraft> | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw =
        window.sessionStorage.getItem(draftKey) ||
        window.localStorage.getItem(draftKey);
      return raw ? (JSON.parse(raw) as Partial<DebtCustomerFormDraft>) : null;
    } catch {
      return null;
    }
  }, [draftKey]);

  const [activeTab, setActiveTab] = useState<DebtBookTab>(
    () => savedDraft?.activeTab ?? 'overview'
  );
  const [customerSearch, setCustomerSearch] = useState('');
  const [txSearch, setTxSearch] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState<'all' | DebtTransactionType>(
    'all'
  );
  const [selectedCustomerIdFilter, setSelectedCustomerIdFilter] =
    useState<string>('all');

  // Report Export Menu State
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [statementMenuCustomerId, setStatementMenuCustomerId] = useState<
    string | null
  >(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const statementMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(event.target as Node)
      ) {
        setShowExportMenu(false);
      }
      if (
        statementMenuRef.current &&
        !statementMenuRef.current.contains(event.target as Node)
      ) {
        setStatementMenuCustomerId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, []);

  // Add New Customer Form State
  const [fullName, setFullName] = useState(() => savedDraft?.fullName ?? '');
  const [phone, setPhone] = useState(() => savedDraft?.phone ?? '');
  const [creditLimitEnabled, setCreditLimitEnabled] = useState(
    () => savedDraft?.creditLimitEnabled ?? false
  );
  const [creditLimitInput, setCreditLimitInput] = useState(
    () => savedDraft?.creditLimitInput ?? ''
  );
  const [customerNotes, setCustomerNotes] = useState(
    () => savedDraft?.customerNotes ?? ''
  );
  const [initialCreditInput, setInitialCreditInput] = useState(
    () => savedDraft?.initialCreditInput ?? ''
  );
  const [initialPaidInput, setInitialPaidInput] = useState(
    () => savedDraft?.initialPaidInput ?? ''
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [savedBannerMessage, setSavedBannerMessage] = useState<string | null>(
    null
  );
  const [newlyAddedCustomerId, setNewlyAddedCustomerId] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const payload: DebtCustomerFormDraft = {
        activeTab,
        fullName,
        phone,
        creditLimitEnabled,
        creditLimitInput,
        customerNotes,
        initialCreditInput,
        initialPaidInput,
      };
      const serialized = JSON.stringify(payload);
      window.sessionStorage.setItem(draftKey, serialized);
      window.localStorage.setItem(draftKey, serialized);
    } catch {
      // Ignore storage errors
    }
  }, [
    draftKey,
    activeTab,
    fullName,
    phone,
    creditLimitEnabled,
    creditLimitInput,
    customerNotes,
    initialCreditInput,
    initialPaidInput,
  ]);

  // Record Credit / Deposit Modal State
  const [txModalCustomer, setTxModalCustomer] = useState<DebtCustomer | null>(
    null
  );
  const [txModalType, setTxModalType] = useState<DebtTransactionType>('credit');
  const [txModalAmount, setTxModalAmount] = useState('');
  const [txModalPaymentMethod, setTxModalPaymentMethod] =
    useState<PaymentMethod>('cash');
  const [txModalReference, setTxModalReference] = useState('');
  const [txModalNotes, setTxModalNotes] = useState('');
  const [txModalError, setTxModalError] = useState<string | null>(null);

  const summary = useMemo(
    () =>
      calculateDebtBookSummary(
        shopDebtCustomers,
        shopDebtTransactions,
        shop.id,
        business.id
      ),
    [shopDebtCustomers, shopDebtTransactions, shop.id, business.id]
  );

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return shopDebtCustomers;
    return shopDebtCustomers.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        (c.notes ?? '').toLowerCase().includes(q)
    );
  }, [shopDebtCustomers, customerSearch]);

  const filteredTransactions = useMemo(() => {
    const q = txSearch.trim().toLowerCase();
    return shopDebtTransactions.filter((tx) => {
      if (txTypeFilter !== 'all' && tx.type !== txTypeFilter) return false;
      if (
        selectedCustomerIdFilter !== 'all' &&
        tx.customerId !== selectedCustomerIdFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        tx.customerName.toLowerCase().includes(q) ||
        tx.customerPhone.toLowerCase().includes(q) ||
        tx.reference.toLowerCase().includes(q) ||
        tx.notes.toLowerCase().includes(q) ||
        tx.recordedByName.toLowerCase().includes(q)
      );
    });
  }, [shopDebtTransactions, txSearch, txTypeFilter, selectedCustomerIdFilter]);

  const handleExportCustomersPdf = () => {
    downloadDebtBookReportPdf({
      business,
      shop,
      customers: filteredCustomers,
      transactions: shopDebtTransactions,
      reportType: 'customers',
      symbol: currencySymbol,
      generatedBy: currentUser.fullName,
      filterLabel: customerSearch.trim()
        ? `Search: "${customerSearch}"`
        : 'All Registered Debtors',
    });
  };

  const handleExportCustomersCsv = () => {
    downloadDebtCustomersCsv({
      customers: filteredCustomers,
      business,
      shop,
      symbol: currencySymbol,
    });
  };

  const handleExportTransactionsPdf = () => {
    const custName =
      selectedCustomerIdFilter !== 'all'
        ? shopDebtCustomers.find((c) => c.id === selectedCustomerIdFilter)
            ?.fullName
        : undefined;
    const filterParts = [
      txTypeFilter !== 'all' ? `Type: ${txTypeFilter.toUpperCase()}` : null,
      custName ? `Customer: ${custName}` : null,
      txSearch.trim() ? `Search: "${txSearch}"` : null,
    ].filter(Boolean);
    const filterLabel =
      filterParts.length > 0 ? filterParts.join(' • ') : 'All Transactions';

    downloadDebtBookReportPdf({
      business,
      shop,
      customers: shopDebtCustomers,
      transactions: filteredTransactions,
      reportType: 'transactions',
      symbol: currencySymbol,
      generatedBy: currentUser.fullName,
      filterLabel,
    });
  };

  const handleExportTransactionsCsv = () => {
    downloadDebtTransactionsCsv({
      transactions: filteredTransactions,
      business,
      shop,
      symbol: currencySymbol,
    });
  };

  const handleExportStatementPdf = (customer: DebtCustomer) => {
    downloadDebtBookReportPdf({
      business,
      shop,
      customers: [customer],
      transactions: shopDebtTransactions,
      reportType: 'statement',
      selectedCustomer: customer,
      symbol: currencySymbol,
      generatedBy: currentUser.fullName,
    });
  };

  const handleExportStatementCsv = (customer: DebtCustomer) => {
    downloadCustomerStatementCsv({
      customer,
      transactions: shopDebtTransactions,
      business,
      shop,
      symbol: currencySymbol,
    });
  };

  const handleSaveNewCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsedLimit = creditLimitEnabled ? parseFloat(creditLimitInput) : 0;
    const validation = validateDebtCustomerInput(
      {
        fullName,
        phone,
        creditLimitEnabled,
        creditLimitAmount: parsedLimit,
        notes: customerNotes,
      },
      shopDebtCustomers
    );

    if (!validation.valid) {
      setFormError(validation.error ?? 'Invalid customer details.');
      return;
    }

    const parsedInitialCredit = parseFloat(initialCreditInput);
    const parsedInitialPaid = parseFloat(initialPaidInput);

    const createdCustomer = onAddDebtCustomer({
      fullName,
      phone,
      creditLimitEnabled,
      creditLimitAmount: creditLimitEnabled ? parsedLimit : 0,
      notes: customerNotes,
    });

    if (!Number.isNaN(parsedInitialCredit) && parsedInitialCredit > 0) {
      onRecordDebtTransaction(
        createdCustomer.id,
        'credit',
        parsedInitialCredit,
        {
          notes: 'Opening credit balance recorded at customer registration',
        }
      );
    }

    if (!Number.isNaN(parsedInitialPaid) && parsedInitialPaid > 0) {
      onRecordDebtTransaction(
        createdCustomer.id,
        'deposit',
        parsedInitialPaid,
        {
          paymentMethod: 'cash',
          notes: 'Initial deposit recorded at customer registration',
        }
      );
    }

    setNewlyAddedCustomerId(createdCustomer.id);
    setSavedBannerMessage(
      `Customer "${createdCustomer.fullName}" (${createdCustomer.phone}) has been saved to the Debt Book${
        createdCustomer.creditLimitEnabled
          ? ` with a credit limit of ${formatCurrency(
              createdCustomer.creditLimitAmount,
              currencySymbol
            )}`
          : ''
      }.`
    );

    // Reset form inputs
    setFullName('');
    setPhone('');
    setCreditLimitEnabled(false);
    setCreditLimitInput('');
    setCustomerNotes('');
    setInitialCreditInput('');
    setInitialPaidInput('');
    setActiveTab('overview');
    if (typeof document !== 'undefined') {
      const mainEl = document.querySelector('main');
      if (mainEl) mainEl.scrollTop = 0;
    }
  };

  const openTransactionModal = (
    customer: DebtCustomer,
    type: DebtTransactionType
  ) => {
    setTxModalCustomer(customer);
    setTxModalType(type);
    setTxModalAmount('');
    setTxModalPaymentMethod('cash');
    setTxModalReference('');
    setTxModalNotes('');
    setTxModalError(null);
  };

  const handleConfirmModalTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!txModalCustomer) return;

    const amount = parseFloat(txModalAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      setTxModalError('Please enter a valid transaction amount greater than zero.');
      return;
    }

    // Check credit limit enforcement if recording new credit and customer has credit limit enabled
    if (
      txModalType === 'credit' &&
      txModalCustomer.creditLimitEnabled &&
      txModalCustomer.creditLimitAmount > 0
    ) {
      const projectedBalance = txModalCustomer.balanceRemaining + amount;
      if (projectedBalance > txModalCustomer.creditLimitAmount) {
        setTxModalError(
          `Credit limit exceeded! ${txModalCustomer.fullName}'s credit limit is ${formatCurrency(
            txModalCustomer.creditLimitAmount,
            currencySymbol
          )} and projected balance would be ${formatCurrency(
            projectedBalance,
            currencySymbol
          )}.`
        );
        return;
      }
    }

    onRecordDebtTransaction(txModalCustomer.id, txModalType, amount, {
      paymentMethod:
        txModalType === 'deposit' ? txModalPaymentMethod : undefined,
      reference: txModalReference,
      notes: txModalNotes,
    });

    setSavedBannerMessage(
      `${
        txModalType === 'credit' ? 'Credit entry' : 'Customer deposit'
      } of ${formatCurrency(amount, currencySymbol)} recorded for ${
        txModalCustomer.fullName
      }.`
    );
    setTxModalCustomer(null);
  };

  return (
    <div className="p-3.5 sm:p-5 lg:p-6 space-y-4 sm:space-y-6 max-w-[1600px] mx-auto">
      {/* Top Banner / Context Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-2xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
              Shop Debt Book Ledger
            </span>
            <span className="text-xs font-mono text-slate-500">
              {shop.name} ({shop.code})
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-display font-bold text-slate-900">
            Credit &amp; Deposit Overview &amp; Customer Debt Records
          </h2>
          <p className="text-xs sm:text-sm text-slate-600">
            Track customer credit purchases, part-payment deposits, remaining
            balances, and individual customer credit limits for {shop.name}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="relative" ref={exportMenuRef}>
            <button
              type="button"
              onClick={() => setShowExportMenu(!showExportMenu)}
              aria-label="Generate Report options"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer min-h-[40px]"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              <span>Generate Report</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-30 divide-y divide-slate-100">
                <div className="px-3.5 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Customer Debt Balances
                  </p>
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        handleExportCustomersPdf();
                        setShowExportMenu(false);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg text-left text-xs text-slate-700 hover:bg-slate-100 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <FileText className="w-4 h-4 text-rose-600 shrink-0" />
                      <div>
                        <span className="font-semibold text-slate-900 block">
                          Download PDF
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Balances, limits &amp; status
                        </span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleExportCustomersCsv();
                        setShowExportMenu(false);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg text-left text-xs text-slate-700 hover:bg-slate-100 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <span className="font-semibold text-slate-900 block">
                          Export CSV
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Excel / spreadsheet format
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="px-3.5 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Transactions Ledger
                  </p>
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        handleExportTransactionsPdf();
                        setShowExportMenu(false);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg text-left text-xs text-slate-700 hover:bg-slate-100 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <FileText className="w-4 h-4 text-rose-600 shrink-0" />
                      <div>
                        <span className="font-semibold text-slate-900 block">
                          Download PDF
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Credit &amp; deposit history
                        </span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleExportTransactionsCsv();
                        setShowExportMenu(false);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg text-left text-xs text-slate-700 hover:bg-slate-100 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <span className="font-semibold text-slate-900 block">
                          Export CSV
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Excel / spreadsheet format
                        </span>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setSavedBannerMessage(null);
              setFormError(null);
              setActiveTab('add_customer');
            }}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors cursor-pointer min-h-[40px]"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add New Customer</span>
          </button>
        </div>
      </div>

      {/* Confirmation Banner when a customer or transaction is saved */}
      {savedBannerMessage && (
        <div
          role="status"
          className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center justify-between gap-3 text-emerald-900"
        >
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{savedBannerMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSavedBannerMessage(null)}
            aria-label="Dismiss notification"
            className="p-1 rounded-lg text-emerald-700 hover:bg-emerald-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary KPI Cards: Total Credit, Amount Paid, Balance Remaining, Customers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Total Credit */}
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 sm:p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Credit
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <p
            data-testid="debt-summary-total-credit"
            className="text-xl sm:text-2xl font-display font-bold text-slate-900 font-mono tabular-nums mt-2"
          >
            {formatCurrency(summary.totalCredit, currencySymbol)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Across {summary.creditTransactionsCount} credit transaction
            {summary.creditTransactionsCount === 1 ? '' : 's'}
          </p>
        </div>

        {/* Card 2: Amount Paid (Deposits) */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Amount Paid (Deposits)
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <p
            data-testid="debt-summary-amount-paid"
            className="text-xl sm:text-2xl font-display font-bold text-emerald-700 font-mono tabular-nums mt-2"
          >
            {formatCurrency(summary.amountPaid, currencySymbol)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Across {summary.depositTransactionsCount} deposit transaction
            {summary.depositTransactionsCount === 1 ? '' : 's'}
          </p>
        </div>

        {/* Card 3: Balance Remaining */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Balance Remaining
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <p
            data-testid="debt-summary-balance-remaining"
            className="text-xl sm:text-2xl font-display font-bold text-rose-700 font-mono tabular-nums mt-2"
          >
            {formatCurrency(summary.balanceRemaining, currencySymbol)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {summary.customersWithActiveDebtCount} customer
            {summary.customersWithActiveDebtCount === 1 ? '' : 's'} with
            outstanding balance
          </p>
        </div>

        {/* Card 4: Registered Customers & Credit Limits */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Registered Customers
            </span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
              <UserIcon className="w-4 h-4" />
            </div>
          </div>
          <p
            data-testid="debt-summary-customer-count"
            className="text-xl sm:text-2xl font-display font-bold text-slate-900 font-mono tabular-nums mt-2"
          >
            {summary.customerCount}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {summary.customersWithCreditLimitCount} with active credit limit set
          </p>
        </div>
      </div>

      {/* Navigation Tabs within Debt Book */}
      <div
        role="tablist"
        aria-label="Debt Book Views"
        className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto scrollbar-none"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'overview'}
          onClick={() => setActiveTab('overview')}
          className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] ${
            activeTab === 'overview'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Overview &amp; Customers</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[11px] font-mono ${
              activeTab === 'overview'
                ? 'bg-slate-800 text-emerald-300'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {shopDebtCustomers.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'transactions'}
          onClick={() => setActiveTab('transactions')}
          className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] ${
            activeTab === 'transactions'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Transactions Ledger</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[11px] font-mono ${
              activeTab === 'transactions'
                ? 'bg-slate-800 text-emerald-300'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {shopDebtTransactions.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'add_customer'}
          onClick={() => {
            setFormError(null);
            setActiveTab('add_customer');
          }}
          className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[40px] ${
            activeTab === 'add_customer'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
          }`}
        >
          <UserPlus className="w-4 h-4" />
          <span>Add New Customer</span>
        </button>
      </div>

      {/* TAB 3: ADD NEW CUSTOMERS FORM */}
      {activeTab === 'add_customer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <div>
                <h3 className="text-base font-display font-bold text-slate-900">
                  Register New Customer in Debt Book
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Save customer full name, phone number, and optional credit
                  limit to track credit &amp; deposit records.
                </p>
              </div>
              <span className="text-xs font-mono px-2.5 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold shrink-0 whitespace-nowrap">
                {shop.code}
              </span>
            </div>

            <form onSubmit={handleSaveNewCustomer} className="p-5 space-y-5">
              {formError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs sm:text-sm text-rose-800 flex items-start gap-2.5"
                >
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="debt-customer-fullname"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Customer Full Name <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="debt-customer-fullname"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Chief Emeka Okafor"
                      className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-lg border border-slate-300 focus:border-emerald-600 focus:outline-none text-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="debt-customer-phone"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Phone Number <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="debt-customer-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. +234 803 778 9910"
                      className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-lg border border-slate-300 focus:border-emerald-600 focus:outline-none text-slate-900 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Set Customer Credit Limit Toggle Option */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/80 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label
                      htmlFor="debt-credit-limit-toggle"
                      className="text-sm font-semibold text-slate-900 flex items-center gap-2 cursor-pointer"
                    >
                      <SlidersHorizontal className="w-4 h-4 text-emerald-600" />
                      <span>Set Customer Credit Limit</span>
                    </label>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Toggle on to set a maximum credit balance allowed for this
                      customer.
                    </p>
                  </div>

                  <button
                    id="debt-credit-limit-toggle"
                    type="button"
                    role="switch"
                    aria-checked={creditLimitEnabled}
                    aria-label="Set Customer Credit Limit"
                    onClick={() => setCreditLimitEnabled((prev) => !prev)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      creditLimitEnabled ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                        creditLimitEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {creditLimitEnabled && (
                  <div className="pt-3 border-t border-slate-200/80 space-y-3">
                    <div>
                      <label
                        htmlFor="debt-credit-limit-amount"
                        className="block text-xs font-semibold text-slate-700 mb-1.5"
                      >
                        Credit Limit Amount ({currencySymbol}){' '}
                        <span className="text-rose-600">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-mono font-bold text-slate-500">
                          {currencySymbol}
                        </span>
                        <input
                          id="debt-credit-limit-amount"
                          type="number"
                          min="1"
                          step="any"
                          value={creditLimitInput}
                          onChange={(e) => setCreditLimitInput(e.target.value)}
                          placeholder="Enter credit limit amount (e.g. 200000)"
                          className="w-full pl-9 pr-3.5 py-2.5 text-sm font-mono rounded-lg border border-emerald-300 bg-white focus:border-emerald-600 focus:outline-none text-slate-900"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-medium text-slate-500">
                        Quick Limit Presets:
                      </span>
                      {[50000, 100000, 250000, 500000].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setCreditLimitInput(String(preset))}
                          className="px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-white border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 text-slate-700 transition-colors cursor-pointer"
                        >
                          {formatCurrency(preset, currencySymbol)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Optional Opening Credit / Deposit & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label
                    htmlFor="debt-initial-credit"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Opening Credit Amount ({currencySymbol}){' '}
                    <span className="text-slate-400 font-normal">
                      (Optional)
                    </span>
                  </label>
                  <input
                    id="debt-initial-credit"
                    type="number"
                    min="0"
                    step="any"
                    value={initialCreditInput}
                    onChange={(e) => setInitialCreditInput(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2 text-sm font-mono rounded-lg border border-slate-300 focus:border-emerald-600 focus:outline-none text-slate-900"
                  />
                </div>

                <div>
                  <label
                    htmlFor="debt-initial-paid"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Initial Deposit Paid ({currencySymbol}){' '}
                    <span className="text-slate-400 font-normal">
                      (Optional)
                    </span>
                  </label>
                  <input
                    id="debt-initial-paid"
                    type="number"
                    min="0"
                    step="any"
                    value={initialPaidInput}
                    onChange={(e) => setInitialPaidInput(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2 text-sm font-mono rounded-lg border border-slate-300 focus:border-emerald-600 focus:outline-none text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="debt-customer-notes"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Account Notes{' '}
                  <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  id="debt-customer-notes"
                  type="text"
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                  placeholder="e.g. Monthly corporate supply account or wholesale buyer"
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-600 focus:outline-none text-slate-900"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  className="px-4 py-2.5 rounded-lg text-xs sm:text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save Customer</span>
                </button>
              </div>
            </form>
          </div>

          {/* Right column preview: Existing Registered Customers in Debt Book */}
          <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <h4 className="text-sm font-display font-bold text-slate-900">
                Saved Customers in Debt Book ({shopDebtCustomers.length})
              </h4>
              <span className="text-xs text-slate-500">Live Directory</span>
            </div>
            <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
              {shopDebtCustomers.map((cust) => (
                <div
                  key={cust.id}
                  className="p-3.5 hover:bg-slate-50/80 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {cust.fullName}
                    </p>
                    <p className="text-xs font-mono text-slate-500 mt-0.5">
                      {cust.phone}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {cust.creditLimitEnabled ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                          Credit Limit:{' '}
                          {formatCurrency(
                            cust.creditLimitAmount,
                            currencySymbol
                          )}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600">
                          No Credit Limit Set
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-slate-500">Balance</p>
                    <p className="text-xs sm:text-sm font-mono font-bold text-rose-700 tabular-nums">
                      {formatCurrency(cust.balanceRemaining, currencySymbol)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: OVERVIEW (Shows Customer Debt Records + Credit & Deposit Transactions Overview) */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Section A: Customer Debt Records Table (Total Credit, Amount Paid, Balance Remaining, Credit Limit) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 sm:px-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-base font-display font-bold text-slate-900">
                  Customer Debt Records (Total Credit, Amount Paid &amp; Balance
                  Remaining)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Registered customers, credit limits, total credit issued,
                  deposits paid, and net balance remaining.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    aria-label="Search customers by name or phone"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search customer or phone..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm rounded-lg border border-slate-300 focus:border-emerald-600 focus:outline-none"
                  />
                </div>

                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                  <button
                    type="button"
                    onClick={handleExportCustomersPdf}
                    title="Download Customer Balances Report (PDF)"
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md text-slate-700 hover:text-slate-900 hover:bg-white transition-colors cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-rose-600" />
                    <span>PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportCustomersCsv}
                    title="Export Customer Balances to CSV"
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md text-slate-700 hover:text-slate-900 hover:bg-white transition-colors cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>CSV</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('add_customer')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Add Customer</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Customer &amp; Phone</th>
                    <th className="py-3 px-4">Credit Limit</th>
                    <th className="py-3 px-4 text-right">Total Credit</th>
                    <th className="py-3 px-4 text-right">Amount Paid</th>
                    <th className="py-3 px-4 text-right">Balance Remaining</th>
                    <th className="py-3 px-4 text-center">Account Status</th>
                    <th className="py-3 px-4 text-right">Quick Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs sm:text-sm">
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-8 px-4 text-center text-slate-500"
                      >
                        No matching customer records found in this shop&apos;s
                        Debt Book.
                      </td>
                    </tr>
                  ) : (
                    filteredCustomers.map((customer) => {
                      const isNewlyAdded = customer.id === newlyAddedCustomerId;
                      const isOverLimit =
                        customer.creditLimitEnabled &&
                        customer.creditLimitAmount > 0 &&
                        customer.balanceRemaining > customer.creditLimitAmount;
                      const isSettled = customer.balanceRemaining <= 0;

                      return (
                        <tr
                          key={customer.id}
                          className={`hover:bg-slate-50/90 transition-colors ${
                            isNewlyAdded ? 'bg-emerald-50/50' : ''
                          }`}
                        >
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-slate-900">
                                {customer.fullName}
                              </p>
                              {isNewlyAdded && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                                  New
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-mono text-slate-500 mt-0.5">
                              {customer.phone}
                            </p>
                            {customer.notes && (
                              <p className="text-[11px] text-slate-500 truncate max-w-xs mt-0.5">
                                {customer.notes}
                              </p>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            {customer.creditLimitEnabled ? (
                              <div>
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                                  {formatCurrency(
                                    customer.creditLimitAmount,
                                    currencySymbol
                                  )}
                                </span>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  Available:{' '}
                                  {formatCurrency(
                                    Math.max(
                                      0,
                                      customer.creditLimitAmount -
                                        customer.balanceRemaining
                                    ),
                                    currencySymbol
                                  )}
                                </p>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">
                                No Limit Set
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums">
                            {formatCurrency(
                              customer.totalCredit,
                              currencySymbol
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                            {formatCurrency(
                              customer.amountPaid,
                              currencySymbol
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono font-bold text-rose-700 tabular-nums">
                            {formatCurrency(
                              customer.balanceRemaining,
                              currencySymbol
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            {isSettled ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Settled
                              </span>
                            ) : isOverLimit ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                                Over Credit Limit
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                                Active Balance
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  openTransactionModal(customer, 'credit')
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
                              >
                                <PlusCircle className="w-3.5 h-3.5 text-amber-700" />
                                <span>Add Credit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  openTransactionModal(customer, 'deposit')
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
                              >
                                <CreditCard className="w-3.5 h-3.5 text-emerald-700" />
                                <span>Record Deposit</span>
                              </button>

                              <div className="relative inline-block text-left">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setStatementMenuCustomerId(
                                      statementMenuCustomerId === customer.id
                                        ? null
                                        : customer.id
                                    )
                                  }
                                  title="Customer Statement of Account"
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition-colors cursor-pointer"
                                >
                                  <FileText className="w-3.5 h-3.5 text-slate-600" />
                                  <span>Statement</span>
                                  <ChevronDown className="w-3 h-3 text-slate-400" />
                                </button>

                                {statementMenuCustomerId === customer.id && (
                                  <div
                                    ref={statementMenuRef}
                                    className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-30 text-left"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleExportStatementPdf(customer);
                                        setStatementMenuCustomerId(null);
                                      }}
                                      className="w-full px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                                    >
                                      <FileText className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                      <span>Statement (PDF)</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleExportStatementCsv(customer);
                                        setStatementMenuCustomerId(null);
                                      }}
                                      className="w-full px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                                    >
                                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                      <span>Statement (CSV)</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section B: Overview of All Credit and Deposit Transactions */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 sm:px-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <h3 className="text-base font-display font-bold text-slate-900">
                  Overview of All Credit &amp; Deposit Transactions
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chronological ledger of credit purchases and customer deposit
                  payments recorded in {shop.name}.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                  {(['all', 'credit', 'deposit'] as const).map((typeOpt) => (
                    <button
                      key={typeOpt}
                      type="button"
                      onClick={() => setTxTypeFilter(typeOpt)}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        txTypeFilter === typeOpt
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {typeOpt === 'all'
                        ? 'All Transactions'
                        : typeOpt === 'credit'
                        ? 'Credit Only'
                        : 'Deposits Only'}
                    </button>
                  ))}
                </div>

                <select
                  aria-label="Filter transactions by customer"
                  value={selectedCustomerIdFilter}
                  onChange={(e) => setSelectedCustomerIdFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-none"
                >
                  <option value="all">All Customers</option>
                  {shopDebtCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
                </select>

                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                  <button
                    type="button"
                    onClick={handleExportTransactionsPdf}
                    title="Download Transactions Ledger (PDF)"
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md text-slate-700 hover:text-slate-900 hover:bg-white transition-colors cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-rose-600" />
                    <span>PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportTransactionsCsv}
                    title="Export Transactions Ledger to CSV"
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md text-slate-700 hover:text-slate-900 hover:bg-white transition-colors cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>CSV</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[650px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Date &amp; Reference</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Transaction Type</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4">Description / Notes</th>
                    <th className="py-3 px-4">Recorded By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs sm:text-sm">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-8 px-4 text-center text-slate-500"
                      >
                        No credit or deposit transactions match the selected
                        filter.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((tx) => (
                      <tr
                        key={tx.id}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="py-3 px-4 whitespace-nowrap">
                          <p className="font-mono font-semibold text-slate-900 text-xs">
                            {tx.reference}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {tx.createdAt}
                          </p>
                        </td>

                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-900">
                            {tx.customerName}
                          </p>
                          <p className="text-xs font-mono text-slate-500">
                            {tx.customerPhone}
                          </p>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          {tx.type === 'credit' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200">
                              <ArrowUpRight className="w-3.5 h-3.5 text-amber-700" />
                              Credit Issued
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-700" />
                              Deposit Paid
                            </span>
                          )}
                        </td>

                        <td
                          className={`py-3 px-4 text-right font-mono font-bold tabular-nums whitespace-nowrap ${
                            tx.type === 'credit'
                              ? 'text-amber-800'
                              : 'text-emerald-700'
                          }`}
                        >
                          {tx.type === 'credit' ? '+' : '-'}
                          {formatCurrency(tx.amount, currencySymbol)}
                        </td>

                        <td className="py-3 px-4 text-slate-600 max-w-md">
                          <p className="truncate">{tx.notes}</p>
                        </td>

                        <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                          {tx.recordedByName}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DEDICATED CREDIT & DEPOSIT TRANSACTIONS LEDGER */}
      {activeTab === 'transactions' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 sm:px-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h3 className="text-base font-display font-bold text-slate-900">
                Complete Credit &amp; Deposit Transactions Ledger
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Search and filter all customer credit purchases and deposit
                repayments in {shop.name}.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  aria-label="Search transactions"
                  value={txSearch}
                  onChange={(e) => setTxSearch(e.target.value)}
                  placeholder="Search ref, customer, note..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm rounded-lg border border-slate-300 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                {(['all', 'credit', 'deposit'] as const).map((typeOpt) => (
                  <button
                    key={typeOpt}
                    type="button"
                    onClick={() => setTxTypeFilter(typeOpt)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                      txTypeFilter === typeOpt
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {typeOpt === 'all'
                      ? 'All'
                      : typeOpt === 'credit'
                      ? 'Credit'
                      : 'Deposit'}
                  </button>
                ))}
              </div>

              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                <button
                  type="button"
                  onClick={handleExportTransactionsPdf}
                  title="Download Transactions Ledger (PDF)"
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md text-slate-700 hover:text-slate-900 hover:bg-white transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-rose-600" />
                  <span>PDF</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportTransactionsCsv}
                  title="Export Transactions Ledger to CSV"
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md text-slate-700 hover:text-slate-900 hover:bg-white transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>CSV</span>
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[650px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Reference &amp; Date</th>
                  <th className="py-3 px-4">Customer Name &amp; Phone</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Notes</th>
                  <th className="py-3 px-4">Recorded By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs sm:text-sm">
                {filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/80">
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <p className="font-mono font-semibold text-slate-900 text-xs">
                        {tx.reference}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {tx.createdAt}
                      </p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-900">
                        {tx.customerName}
                      </p>
                      <p className="text-xs font-mono text-slate-500">
                        {tx.customerPhone}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {tx.type === 'credit' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200">
                          Credit
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          Deposit
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums">
                      {formatCurrency(tx.amount, currencySymbol)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">{tx.notes}</td>
                    <td className="py-3.5 px-4 text-xs text-slate-600">
                      {tx.recordedByName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL FOR RECORDING CREDIT OR DEPOSIT TRANSACTION */}
      {txModalCustomer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="debt-tx-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4"
        >
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden max-h-[92vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3
                  id="debt-tx-modal-title"
                  className="text-base font-display font-bold text-slate-900"
                >
                  {txModalType === 'credit'
                    ? 'Record New Credit Transaction'
                    : 'Record Customer Deposit Payment'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {txModalCustomer.fullName} ({txModalCustomer.phone})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTxModalCustomer(null)}
                aria-label="Close modal"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleConfirmModalTransaction}
              className="p-5 space-y-4"
            >
              {/* Current Customer Balance Summary */}
              <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-center">
                <div>
                  <p className="text-[11px] text-slate-500">Total Credit</p>
                  <p className="text-xs font-mono font-bold text-slate-900 mt-0.5">
                    {formatCurrency(
                      txModalCustomer.totalCredit,
                      currencySymbol
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500">Amount Paid</p>
                  <p className="text-xs font-mono font-bold text-emerald-700 mt-0.5">
                    {formatCurrency(txModalCustomer.amountPaid, currencySymbol)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500">Balance</p>
                  <p className="text-xs font-mono font-bold text-rose-700 mt-0.5">
                    {formatCurrency(
                      txModalCustomer.balanceRemaining,
                      currencySymbol
                    )}
                  </p>
                </div>
              </div>

              {txModalError && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800"
                >
                  {txModalError}
                </div>
              )}

              <div>
                <label
                  htmlFor="debt-tx-amount"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  {txModalType === 'credit'
                    ? `Credit Amount (${currencySymbol})`
                    : `Deposit Amount Paid (${currencySymbol})`}{' '}
                  <span className="text-rose-600">*</span>
                </label>
                <input
                  id="debt-tx-amount"
                  type="number"
                  min="1"
                  step="any"
                  value={txModalAmount}
                  onChange={(e) => setTxModalAmount(e.target.value)}
                  placeholder="Enter amount..."
                  className="w-full px-3.5 py-2 text-sm font-mono rounded-lg border border-slate-300 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {txModalType === 'deposit' && (
                <div>
                  <label
                    htmlFor="debt-tx-method"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Payment Method
                  </label>
                  <select
                    id="debt-tx-method"
                    value={txModalPaymentMethod}
                    onChange={(e) =>
                      setTxModalPaymentMethod(e.target.value as PaymentMethod)
                    }
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:border-emerald-600 focus:outline-none"
                  >
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="pos_card">POS Card</option>
                  </select>
                </div>
              )}

              <div>
                <label
                  htmlFor="debt-tx-notes"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Transaction Note / Description
                </label>
                <input
                  id="debt-tx-notes"
                  type="text"
                  value={txModalNotes}
                  onChange={(e) => setTxModalNotes(e.target.value)}
                  placeholder={
                    txModalType === 'credit'
                      ? 'e.g. Bulk provisions taken on credit'
                      : 'e.g. Part payment deposit received'
                  }
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setTxModalCustomer(null)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700"
                >
                  Save Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
