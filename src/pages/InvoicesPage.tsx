import React, { useState, useMemo, useEffect } from 'react';
import {
  FileText,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  FilePlus,
  Printer,
  Download,
  X,
  CreditCard,
  Package,
  ArrowRight,
  Sparkles,
  DollarSign,
  History,
} from 'lucide-react';
import {
  Business,
  DebtCustomer,
  Invoice,
  InvoiceLineItem,
  InvoicePaymentRecord,
  InvoiceStatus,
  PaymentMethod,
  Product,
  Shop,
  User,
} from '../types/pos';
import {
  BASE_CURRENCY_SYMBOL,
  CreateDebtCustomerInput,
  formatCurrency,
  validateDebtCustomerInput,
} from '../utils/posCalculations';
import { downloadInvoicePdf } from '../utils/pdfGenerator';

interface InvoicesPageProps {
  shop: Shop;
  business: Business;
  shopProducts: Product[];
  invoices: Invoice[];
  debtCustomers: DebtCustomer[];
  currentUser: User;
  onSaveInvoice: (invoice: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>) => Invoice;
  onRecordInvoicePayment: (
    invoiceId: string,
    amount: number,
    paymentMethod: PaymentMethod,
    paymentReference?: string,
    notes?: string
  ) => void;
  onAddDebtCustomer: (input: CreateDebtCustomerInput) => DebtCustomer;
}

interface InvoiceFormDraft {
  activeSubTab: 'overview' | 'create';
  selectedCustomerId: string;
  showInlineAddCustomer: boolean;
  custName: string;
  custPhone: string;
  custEmail: string;
  custCompany: string;
  custAddress: string;
  lineItems: InvoiceLineItem[];
  issueDate: string;
  dueDays: number;
  discountPercent: number;
  taxRatePercent: number;
  paymentTerms: string;
  notes: string;
}

export const InvoicesPage: React.FC<InvoicesPageProps> = ({
  shop,
  business,
  shopProducts,
  invoices,
  debtCustomers,
  currentUser,
  onSaveInvoice,
  onRecordInvoicePayment,
  onAddDebtCustomer,
}) => {
  const symbol = business.currencySymbol || BASE_CURRENCY_SYMBOL;
  const draftKey = `smartmind_invoices_draft_${shop.id}`;

  const savedDraft = useMemo<Partial<InvoiceFormDraft> | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw =
        window.sessionStorage.getItem(draftKey) ||
        window.localStorage.getItem(draftKey);
      return raw ? (JSON.parse(raw) as Partial<InvoiceFormDraft>) : null;
    } catch {
      return null;
    }
  }, [draftKey]);

  // Sub-navigation tab state ('overview' | 'create')
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'create'>(
    () => savedDraft?.activeSubTab ?? 'overview'
  );

  // Overview Filters State
  const [overviewSearchQuery, setOverviewSearchQuery] = useState<string>('');
  const [overviewStatusFilter, setOverviewStatusFilter] = useState<'all' | InvoiceStatus>('all');

  // Preview / Printable Invoice Modal State
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);

  // Record Payment Modal State
  const [paymentModalInvoice, setPaymentModalInvoice] = useState<Invoice | null>(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState<string>('');
  const [paymentMethodSelect, setPaymentMethodSelect] = useState<PaymentMethod>('bank_transfer');
  const [paymentReferenceInput, setPaymentReferenceInput] = useState<string>('');
  const [paymentNotesInput, setPaymentNotesInput] = useState<string>('');
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // ----------------------------------------------------
  // CREATE INVOICE FORM STATE
  // ----------------------------------------------------
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    () => savedDraft?.selectedCustomerId ?? 'none'
  );
  const [showInlineAddCustomer, setShowInlineAddCustomer] = useState<boolean>(
    () => savedDraft?.showInlineAddCustomer ?? false
  );

  // Customer Input Fields
  const [custName, setCustName] = useState<string>(() => savedDraft?.custName ?? '');
  const [custPhone, setCustPhone] = useState<string>(() => savedDraft?.custPhone ?? '');
  const [custEmail, setCustEmail] = useState<string>(() => savedDraft?.custEmail ?? '');
  const [custCompany, setCustCompany] = useState<string>(() => savedDraft?.custCompany ?? '');
  const [custAddress, setCustAddress] = useState<string>(() => savedDraft?.custAddress ?? '');
  const [custError, setCustError] = useState<string | null>(null);

  // Invoice Items & Financials State
  const [productSearchQuery, setProductSearchQuery] = useState<string>('');
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>(
    () => savedDraft?.lineItems ?? []
  );
  const [issueDate, setIssueDate] = useState<string>(
    () => savedDraft?.issueDate ?? new Date().toISOString().split('T')[0]
  );
  const [dueDays, setDueDays] = useState<number>(() => savedDraft?.dueDays ?? 7);
  const [discountPercent, setDiscountPercent] = useState<number>(
    () => savedDraft?.discountPercent ?? 0
  );
  const [taxRatePercent, setTaxRatePercent] = useState<number>(
    () =>
      savedDraft?.taxRatePercent ??
      (shop.taxRatePercent || business.defaultTaxRatePercent || 7.5)
  );
  const [paymentTerms, setPaymentTerms] = useState<string>(
    () =>
      savedDraft?.paymentTerms ??
      `Payment due within 7 days via ${business.name} bank transfer.`
  );
  const [notes, setNotes] = useState<string>(
    () =>
      savedDraft?.notes ??
      `Bank: Guaranty Trust Bank (GTBank) | Account: 0123456789 | Name: ${business.legalName || business.name}`
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const payload: InvoiceFormDraft = {
        activeSubTab,
        selectedCustomerId,
        showInlineAddCustomer,
        custName,
        custPhone,
        custEmail,
        custCompany,
        custAddress,
        lineItems,
        issueDate,
        dueDays,
        discountPercent,
        taxRatePercent,
        paymentTerms,
        notes,
      };
      const serialized = JSON.stringify(payload);
      window.sessionStorage.setItem(draftKey, serialized);
      window.localStorage.setItem(draftKey, serialized);
    } catch {
      // Ignore storage errors
    }
  }, [
    draftKey,
    activeSubTab,
    selectedCustomerId,
    showInlineAddCustomer,
    custName,
    custPhone,
    custEmail,
    custCompany,
    custAddress,
    lineItems,
    issueDate,
    dueDays,
    discountPercent,
    taxRatePercent,
    paymentTerms,
    notes,
  ]);

  // Shop-isolated debt customers
  const shopDebtCustomers = useMemo(() => {
    return debtCustomers.filter(
      (c) => c.shopId === shop.id && c.businessId === business.id
    );
  }, [debtCustomers, shop.id, business.id]);

  // Shop-isolated invoices
  const shopInvoices = useMemo(() => {
    return invoices.filter(
      (inv) => inv.shopId === shop.id && inv.businessId === business.id
    );
  }, [invoices, shop.id, business.id]);

  // Overview filtered invoices
  const filteredInvoices = useMemo(() => {
    const q = overviewSearchQuery.trim().toLowerCase();
    return shopInvoices.filter((inv) => {
      if (overviewStatusFilter !== 'all' && inv.status !== overviewStatusFilter) {
        return false;
      }
      if (!q) return true;
      const matchInvNum = inv.invoiceNumber.toLowerCase().includes(q);
      const matchName = inv.customerName.toLowerCase().includes(q);
      const matchPhone = inv.customerPhone.toLowerCase().includes(q);
      const matchCompany = (inv.companyName ?? '').toLowerCase().includes(q);
      const matchItem = inv.items.some((i) =>
        i.productName.toLowerCase().includes(q)
      );
      return matchInvNum || matchName || matchPhone || matchCompany || matchItem;
    });
  }, [shopInvoices, overviewStatusFilter, overviewSearchQuery]);

  // Overview KPI Summary
  const metrics = useMemo(() => {
    const totalAmount = shopInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    const totalCollected = shopInvoices.reduce(
      (sum, inv) => sum + (inv.amountPaid || 0),
      0
    );
    const totalOutstanding = shopInvoices.reduce(
      (sum, inv) => sum + (inv.balanceRemaining ?? inv.totalAmount),
      0
    );

    const paidCount = shopInvoices.filter((inv) => inv.status === 'paid').length;
    const partialCount = shopInvoices.filter(
      (inv) => inv.status === 'partially_paid'
    ).length;
    const unpaidCount = shopInvoices.filter((inv) => inv.status === 'unpaid').length;
    const overdueCount = shopInvoices.filter((inv) => inv.status === 'overdue').length;

    return {
      totalCount: shopInvoices.length,
      totalAmount,
      totalCollected,
      totalOutstanding,
      paidCount,
      partialCount,
      unpaidCount,
      overdueCount,
    };
  }, [shopInvoices]);

  // Product Search results for adding to invoice
  const matchingProducts = useMemo(() => {
    if (!productSearchQuery.trim()) return shopProducts;
    const q = productSearchQuery.toLowerCase().trim();
    return shopProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        p.categoryName.toLowerCase().includes(q)
    );
  }, [shopProducts, productSearchQuery]);

  // Line item financial calculations
  const invoiceCalculations = useMemo(() => {
    const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const discountAmount =
      Math.round(((subtotal * discountPercent) / 100) * 100) / 100;
    const taxableAmount = Math.max(0, subtotal - discountAmount);
    const taxAmount =
      Math.round(((taxableAmount * taxRatePercent) / 100) * 100) / 100;
    const totalAmount = Math.round((taxableAmount + taxAmount) * 100) / 100;

    return { subtotal, discountAmount, taxAmount, totalAmount };
  }, [lineItems, discountPercent, taxRatePercent]);

  // Handle customer dropdown selection
  const handleSelectCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setShowInlineAddCustomer(false);
    setCustError(null);

    if (customerId === 'none') {
      setCustName('');
      setCustPhone('');
      setCustEmail('');
      setCustCompany('');
      setCustAddress('');
      return;
    }

    const found = shopDebtCustomers.find((c) => c.id === customerId);
    if (found) {
      setCustName(found.fullName);
      setCustPhone(found.phone);
      setCustEmail('');
      setCustCompany(found.notes ?? '');
      setCustAddress('');
    }
  };

  // Handle inline creation of a new customer
  const handleCreateInlineCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateDebtCustomerInput(
      {
        fullName: custName,
        phone: custPhone,
        creditLimitEnabled: false,
        creditLimitAmount: 0,
      },
      shopDebtCustomers
    );
    if (!validation.valid) {
      setCustError(validation.error ?? 'Please enter valid customer details.');
      return;
    }

    const created = onAddDebtCustomer({
      fullName: custName.trim(),
      phone: custPhone.trim(),
      creditLimitEnabled: false,
      creditLimitAmount: 0,
      notes: custCompany.trim()
        ? `Company: ${custCompany.trim()}`
        : 'Registered from Invoicing workspace',
    });

    setSelectedCustomerId(created.id);
    setShowInlineAddCustomer(false);
    setCustError(null);
    setFormNotice(`Registered new customer "${created.fullName}" to Debt Book.`);
    setTimeout(() => setFormNotice(null), 4000);
  };

  // Add item to invoice line items
  const handleAddProductToInvoice = (product: Product) => {
    setLineItems((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        return prev.map((item) => {
          if (item.productId !== product.id) return item;
          const newQty = item.quantity + 1;
          return {
            ...item,
            quantity: newQty,
            lineTotal: Math.round(item.unitPrice * newQty * 100) / 100,
          };
        });
      }

      const newItem: InvoiceLineItem = {
        id: `inv-line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        productId: product.id,
        sku: product.sku,
        barcode: product.barcode,
        productName: product.name,
        unit: product.unit || 'Unit',
        unitPrice: product.sellingPrice,
        quantity: 1,
        lineTotal: product.sellingPrice,
      };
      return [...prev, newItem];
    });
    setFormError(null);
  };

  // Update item quantity
  const handleUpdateItemQuantity = (lineItemId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveLineItem(lineItemId);
      return;
    }
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.id !== lineItemId) return item;
        return {
          ...item,
          quantity: newQty,
          lineTotal: Math.round(item.unitPrice * newQty * 100) / 100,
        };
      })
    );
  };

  // Update item unit price
  const handleUpdateItemPrice = (lineItemId: string, newPrice: number) => {
    const price = Math.max(0, newPrice);
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.id !== lineItemId) return item;
        return {
          ...item,
          unitPrice: price,
          lineTotal: Math.round(price * item.quantity * 100) / 100,
        };
      })
    );
  };

  // Remove line item
  const handleRemoveLineItem = (lineItemId: string) => {
    setLineItems((prev) => prev.filter((item) => item.id !== lineItemId));
  };

  // Save/Generate Invoice
  const handleCreateInvoiceSubmit = (
    e: React.FormEvent,
    statusToSave: InvoiceStatus = 'unpaid'
  ) => {
    e.preventDefault();
    if (!custName.trim()) {
      setFormError('Please select an existing customer or enter customer name.');
      return;
    }
    if (!custPhone.trim()) {
      setFormError('Please enter a valid customer phone number.');
      return;
    }
    if (lineItems.length === 0) {
      setFormError('Please search and add at least one product to the invoice.');
      return;
    }

    setFormError(null);

    // Calculate due date ISO
    const issueDateObj = new Date(issueDate);
    const dueDateObj = new Date(issueDateObj);
    dueDateObj.setDate(dueDateObj.getDate() + dueDays);
    const dueDateStr = dueDateObj.toISOString().split('T')[0];

    const yearMonth = issueDate.replace(/-/g, '').slice(0, 8);
    const countSeq = String(shopInvoices.length + 1).padStart(3, '0');
    const invoiceNumber = `INV-${shop.code.split('-')[0]}-${yearMonth}-${countSeq}`;

    const createdInvoice = onSaveInvoice({
      shopId: shop.id,
      businessId: business.id,
      invoiceNumber,
      issueDate,
      dueDate: dueDateStr,
      customerId: selectedCustomerId !== 'none' ? selectedCustomerId : undefined,
      customerName: custName.trim(),
      customerPhone: custPhone.trim(),
      customerEmail: custEmail.trim() || undefined,
      customerAddress: custAddress.trim() || undefined,
      companyName: custCompany.trim() || undefined,
      items: [...lineItems],
      subtotal: invoiceCalculations.subtotal,
      discountAmount: invoiceCalculations.discountAmount,
      taxRatePercent,
      taxAmount: invoiceCalculations.taxAmount,
      totalAmount: invoiceCalculations.totalAmount,
      amountPaid: 0,
      balanceRemaining: invoiceCalculations.totalAmount,
      payments: [],
      status: statusToSave,
      notes: notes.trim() || undefined,
      paymentTerms: paymentTerms.trim() || undefined,
      createdByUserId: currentUser.id,
      createdByName: currentUser.fullName,
    });

    // Reset form
    setLineItems([]);
    setSelectedCustomerId('none');
    setCustName('');
    setCustPhone('');
    setCustEmail('');
    setCustCompany('');
    setCustAddress('');
    setDiscountPercent(0);

    setFormNotice(
      `Invoice ${createdInvoice.invoiceNumber} successfully created for ${createdInvoice.customerName} (${formatCurrency(createdInvoice.totalAmount, symbol)}).`
    );
    setTimeout(() => setFormNotice(null), 5000);

    // Auto open preview modal for immediate print/PDF
    setPreviewInvoice(createdInvoice);
    setActiveSubTab('overview');
  };

  // Open Payment Modal
  const handleOpenPaymentModal = (invoice: Invoice) => {
    setPaymentModalInvoice(invoice);
    const bal = invoice.balanceRemaining ?? invoice.totalAmount;
    setPaymentAmountInput(String(bal));
    setPaymentMethodSelect('bank_transfer');
    setPaymentReferenceInput('');
    setPaymentNotesInput('');
    setPaymentError(null);
  };

  // Submit Payment Record
  const handleRecordPaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalInvoice) return;

    const amt = parseFloat(paymentAmountInput);
    if (isNaN(amt) || amt <= 0) {
      setPaymentError('Please enter a valid payment amount greater than zero.');
      return;
    }

    const currentRemaining =
      paymentModalInvoice.balanceRemaining ?? paymentModalInvoice.totalAmount;

    if (amt > currentRemaining + 0.01) {
      setPaymentError(
        `Payment amount cannot exceed balance remaining (${formatCurrency(currentRemaining, symbol)}).`
      );
      return;
    }

    onRecordInvoicePayment(
      paymentModalInvoice.id,
      amt,
      paymentMethodSelect,
      paymentReferenceInput,
      paymentNotesInput
    );

    setFormNotice(
      `Payment of ${formatCurrency(amt, symbol)} via ${paymentMethodSelect.replace('_', ' ')} recorded for ${paymentModalInvoice.invoiceNumber}.`
    );
    setTimeout(() => setFormNotice(null), 5000);

    // Update active modal state if open
    if (previewInvoice && previewInvoice.id === paymentModalInvoice.id) {
      const newPaid = (previewInvoice.amountPaid || 0) + amt;
      const newBal = Math.max(0, previewInvoice.totalAmount - newPaid);
      let newStatus: InvoiceStatus = previewInvoice.status;
      if (newBal === 0) newStatus = 'paid';
      else if (newPaid > 0) newStatus = 'partially_paid';

      setPreviewInvoice({
        ...previewInvoice,
        amountPaid: newPaid,
        balanceRemaining: newBal,
        status: newStatus,
      });
    }

    setPaymentModalInvoice(null);
  };

  return (
    <div className="p-3 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* ------------------------------------------------------------------- */}
      {/* HEADER BAR & SUB-NAVIGATION */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-display font-bold text-slate-900 tracking-tight">
              Invoice Management &amp; Billing
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-mono text-xs font-semibold">
              {shop.code}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Issue commercial invoices, record partial payments/deposits, and track outstanding billing for {shop.name}.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab('overview')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 min-h-[38px] ${
              activeSubTab === 'overview'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Invoice Overview ({shopInvoices.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSubTab('create');
              if (formNotice) setFormNotice(null);
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 min-h-[38px] ${
              activeSubTab === 'create'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>+ Create New Invoice</span>
          </button>
        </div>
      </div>

      {/* Global Form Notification Banner */}
      {formNotice && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span className="font-semibold">{formNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setFormNotice(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold text-sm px-2 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* SUB-TAB 1: INVOICE OVERVIEW */}
      {/* ------------------------------------------------------------------- */}
      {activeSubTab === 'overview' && (
        <div className="space-y-4">
          {/* Overview Metrics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Total Invoiced */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Total Invoiced</span>
                <span className="p-1.5 rounded-lg bg-slate-100 text-slate-700">
                  <FileText className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="mt-2">
                <span className="text-lg sm:text-xl font-bold font-mono text-slate-900 tabular-nums">
                  {formatCurrency(metrics.totalAmount, symbol)}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {metrics.totalCount} invoices issued
              </p>
            </div>

            {/* Collected Payments */}
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-emerald-800">Total Collected</span>
                <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="mt-2">
                <span className="text-lg sm:text-xl font-bold font-mono text-emerald-800 tabular-nums">
                  {formatCurrency(metrics.totalCollected, symbol)}
                </span>
              </div>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                {metrics.paidCount} fully paid · {metrics.partialCount} partial
              </p>
            </div>

            {/* Outstanding Balance */}
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-amber-800">Outstanding Due</span>
                <span className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
                  <Clock className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="mt-2">
                <span className="text-lg sm:text-xl font-bold font-mono text-amber-800 tabular-nums">
                  {formatCurrency(metrics.totalOutstanding, symbol)}
                </span>
              </div>
              <p className="text-[11px] text-amber-700 mt-0.5">
                {metrics.unpaidCount + metrics.partialCount} pending payment
              </p>
            </div>

            {/* Overdue */}
            <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/40 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-rose-800">Overdue Invoices</span>
                <span className="p-1.5 rounded-lg bg-rose-100 text-rose-800">
                  <AlertCircle className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="mt-2">
                <span className="text-lg sm:text-xl font-bold font-mono text-rose-800 tabular-nums">
                  {formatCurrency(
                    shopInvoices
                      .filter((inv) => inv.status === 'overdue')
                      .reduce((s, i) => s + (i.balanceRemaining ?? i.totalAmount), 0),
                    symbol
                  )}
                </span>
              </div>
              <p className="text-[11px] text-rose-700 mt-0.5">
                {metrics.overdueCount} requiring collection
              </p>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-xs">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              {/* Search Bar */}
              <div className="sm:col-span-8 relative">
                <label htmlFor="overview-invoice-search" className="sr-only">
                  Search Invoices
                </label>
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="overview-invoice-search"
                  type="text"
                  value={overviewSearchQuery}
                  onChange={(e) => setOverviewSearchQuery(e.target.value)}
                  placeholder="Search by invoice #, customer name, phone, company, or product..."
                  className="w-full pl-9 pr-8 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
                {overviewSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setOverviewSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Status Filter */}
              <div className="sm:col-span-4">
                <label htmlFor="overview-status-select" className="sr-only">
                  Filter Status
                </label>
                <select
                  id="overview-status-select"
                  value={overviewStatusFilter}
                  onChange={(e) =>
                    setOverviewStatusFilter(e.target.value as 'all' | InvoiceStatus)
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="all">All Invoice Statuses ({shopInvoices.length})</option>
                  <option value="unpaid">Unpaid / Due Only</option>
                  <option value="partially_paid">Partially Paid / Deposits Only</option>
                  <option value="paid">Paid Invoices Only</option>
                  <option value="overdue">Overdue Invoices Only</option>
                  <option value="draft">Drafts Only</option>
                </select>
              </div>
            </div>

            {(overviewSearchQuery || overviewStatusFilter !== 'all') && (
              <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs text-slate-500">
                <span>
                  Showing {filteredInvoices.length} of {shopInvoices.length} invoices
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setOverviewSearchQuery('');
                    setOverviewStatusFilter('all');
                  }}
                  className="text-emerald-700 hover:text-emerald-800 font-semibold cursor-pointer underline"
                >
                  Reset Filters
                </button>
              </div>
            )}
          </div>

          {/* Invoices List / Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[860px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 text-xs text-slate-500">
                    <th className="py-3 px-4 font-medium">Invoice # &amp; Date</th>
                    <th className="py-3 px-4 font-medium">Customer &amp; Company</th>
                    <th className="py-3 px-4 font-medium">Due Date</th>
                    <th className="py-3 px-4 font-medium text-center">Items</th>
                    <th className="py-3 px-4 font-medium text-right">Total &amp; Balance</th>
                    <th className="py-3 px-4 font-medium text-center">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="font-semibold text-slate-700">No invoices match your search.</p>
                        <p className="text-xs text-slate-400 mt-1">
                          Click "+ Create New Invoice" above to issue your first invoice.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map((inv) => {
                      const isPaid = inv.status === 'paid';
                      const isPartial = inv.status === 'partially_paid';
                      const isUnpaid = inv.status === 'unpaid';
                      const isOverdue = inv.status === 'overdue';
                      const paidAmt = inv.amountPaid || 0;
                      const balRemaining =
                        inv.balanceRemaining ?? Math.max(0, inv.totalAmount - paidAmt);

                      return (
                        <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4">
                            <span className="font-mono font-bold text-slate-900 block">
                              {inv.invoiceNumber}
                            </span>
                            <span className="text-slate-400 text-[11px]">{inv.issueDate}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-semibold text-slate-900 block">
                              {inv.customerName}
                            </span>
                            <div className="text-slate-500 text-[11px]">
                              {inv.companyName ? (
                                <span className="text-slate-700 font-medium">{inv.companyName} · </span>
                              ) : null}
                              {inv.customerPhone}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600">
                            {inv.dueDate}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono text-[11px]">
                              {inv.items.length} {inv.items.length === 1 ? 'item' : 'items'}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono tabular-nums text-right">
                            <span className="font-bold text-slate-900 block">
                              {formatCurrency(inv.totalAmount, symbol)}
                            </span>
                            {paidAmt > 0 && balRemaining > 0 ? (
                              <span className="text-[10px] text-amber-700 block font-semibold">
                                Paid: {formatCurrency(paidAmt, symbol)} · Due: {formatCurrency(balRemaining, symbol)}
                              </span>
                            ) : balRemaining === 0 ? (
                              <span className="text-[10px] text-emerald-700 block font-medium">
                                Fully Paid
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 block">
                                Due: {formatCurrency(balRemaining, symbol)}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 ${
                                isPaid
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : isPartial
                                  ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                  : isUnpaid
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                  : isOverdue
                                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {isPaid && <CheckCircle2 className="w-3 h-3" />}
                              {isPartial && <Clock className="w-3 h-3 text-blue-600" />}
                              {isUnpaid && <Clock className="w-3 h-3" />}
                              {isOverdue && <AlertCircle className="w-3 h-3" />}
                              <span className="capitalize">{inv.status.replace('_', ' ')}</span>
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              {balRemaining > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenPaymentModal(inv)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                                  title="Record Payment / Deposit"
                                >
                                  <CreditCard className="w-3.5 h-3.5" />
                                  <span>Record Payment</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => downloadInvoicePdf(inv, business, shop, symbol)}
                                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-medium flex items-center gap-1 cursor-pointer transition-colors"
                                title="Download PDF Document"
                              >
                                <Download className="w-3.5 h-3.5 text-slate-700" />
                                <span>PDF</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setPreviewInvoice(inv)}
                                className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 font-medium flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>View / Print</span>
                              </button>
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
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* SUB-TAB 2: CREATE NEW INVOICE */}
      {/* ------------------------------------------------------------------- */}
      {activeSubTab === 'create' && (
        <div className="space-y-6">
          {formError && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2 shadow-2xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-semibold">{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column (8 cols): Customer Selection & Product Search */}
            <div className="lg:col-span-8 space-y-6">
              {/* SECTION 1: CUSTOMER SELECTION */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center">
                      1
                    </span>
                    <h2 className="text-sm font-bold text-slate-900">
                      Customer &amp; Billing Information
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowInlineAddCustomer((prev) => !prev);
                      setSelectedCustomerId('none');
                    }}
                    className="text-xs text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <span>{showInlineAddCustomer ? '← Select Existing' : '+ Register New Customer'}</span>
                  </button>
                </div>

                {!showInlineAddCustomer ? (
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="select-customer-dropdown" className="block text-xs font-semibold text-slate-700 mb-1">
                        Select Existing Customer from Customer Book ({shopDebtCustomers.length} registered)
                      </label>
                      <select
                        id="select-customer-dropdown"
                        value={selectedCustomerId}
                        onChange={(e) => handleSelectCustomer(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 font-medium focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      >
                        <option value="none">-- Pick Existing Customer or Enter Custom Name --</option>
                        {shopDebtCustomers.map((cust) => (
                          <option key={cust.id} value={cust.id}>
                            {cust.fullName} ({cust.phone}) {cust.balanceRemaining > 0 ? `— Owes ${formatCurrency(cust.balanceRemaining, symbol)}` : '— No Balance'}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label htmlFor="cust-name-input" className="block text-xs font-semibold text-slate-700 mb-1">
                          Customer Full Name *
                        </label>
                        <input
                          id="cust-name-input"
                          type="text"
                          required
                          value={custName}
                          onChange={(e) => setCustName(e.target.value)}
                          placeholder="e.g. Chief Emeka Okafor"
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        />
                      </div>

                      <div>
                        <label htmlFor="cust-phone-input" className="block text-xs font-semibold text-slate-700 mb-1">
                          Phone Number *
                        </label>
                        <input
                          id="cust-phone-input"
                          type="text"
                          required
                          value={custPhone}
                          onChange={(e) => setCustPhone(e.target.value)}
                          placeholder="e.g. +234 802 331 9902"
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        />
                      </div>

                      <div>
                        <label htmlFor="cust-company-input" className="block text-xs font-semibold text-slate-700 mb-1">
                          Company / Corporate Name
                        </label>
                        <input
                          id="cust-company-input"
                          type="text"
                          value={custCompany}
                          onChange={(e) => setCustCompany(e.target.value)}
                          placeholder="e.g. Eko Atlantic Villa Suites"
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        />
                      </div>

                      <div>
                        <label htmlFor="cust-email-input" className="block text-xs font-semibold text-slate-700 mb-1">
                          Email Address
                        </label>
                        <input
                          id="cust-email-input"
                          type="email"
                          value={custEmail}
                          onChange={(e) => setCustEmail(e.target.value)}
                          placeholder="e.g. info@ekoatlanticvillas.ng"
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  /* INLINE REGISTER NEW CUSTOMER FORM */
                  <form onSubmit={handleCreateInlineCustomer} className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-3">
                    <span className="text-xs font-bold text-emerald-900 block">Register &amp; Save New Customer to Debt Book</span>
                    {custError && (
                      <p className="text-xs text-rose-700 font-semibold">{custError}</p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="inline-cust-name" className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
                        <input
                          id="inline-cust-name"
                          type="text"
                          required
                          value={custName}
                          onChange={(e) => setCustName(e.target.value)}
                          placeholder="e.g. Alhaji Musa Danjuma"
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                        />
                      </div>
                      <div>
                        <label htmlFor="inline-cust-phone" className="block text-xs font-semibold text-slate-700 mb-1">Phone *</label>
                        <input
                          id="inline-cust-phone"
                          type="text"
                          required
                          value={custPhone}
                          onChange={(e) => setCustPhone(e.target.value)}
                          placeholder="e.g. +234 803 445 6789"
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                        />
                      </div>
                      <div>
                        <label htmlFor="inline-cust-company" className="block text-xs font-semibold text-slate-700 mb-1">Company / Organization</label>
                        <input
                          id="inline-cust-company"
                          type="text"
                          value={custCompany}
                          onChange={(e) => setCustCompany(e.target.value)}
                          placeholder="e.g. Musa Enterprises Ltd"
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                        />
                      </div>
                      <div>
                        <label htmlFor="inline-cust-email" className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                        <input
                          id="inline-cust-email"
                          type="email"
                          value={custEmail}
                          onChange={(e) => setCustEmail(e.target.value)}
                          placeholder="musa@musaenterprises.ng"
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowInlineAddCustomer(false)}
                        className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold"
                      >
                        Save Customer &amp; Continue
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* SECTION 2: PRODUCT SEARCH & LINE ITEMS */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center">
                      2
                    </span>
                    <h2 className="text-sm font-bold text-slate-900">
                      Search Products &amp; Add Line Items
                    </h2>
                  </div>
                  <span className="text-xs text-slate-500 font-mono">
                    {lineItems.length} items added
                  </span>
                </div>

                {/* Product Search Input Bar */}
                <div className="relative">
                  <label htmlFor="invoice-product-search-input" className="sr-only">
                    Search Products
                  </label>
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="invoice-product-search-input"
                    type="text"
                    value={productSearchQuery}
                    onChange={(e) => setProductSearchQuery(e.target.value)}
                    placeholder="Type product name, SKU, or barcode to add to invoice..."
                    className="w-full pl-9 pr-8 py-2.5 text-xs border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
                  />
                  {productSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setProductSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      ×
                    </button>
                  )}

                  {/* Matching Products Live Dropdown Picker */}
                  {productSearchQuery.trim().length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 max-h-56 overflow-y-auto divide-y divide-slate-100">
                      {matchingProducts.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-400">
                          No matching shop products found.
                        </div>
                      ) : (
                        matchingProducts.map((prod) => (
                          <button
                            key={prod.id}
                            type="button"
                            onClick={() => {
                              handleAddProductToInvoice(prod);
                              setProductSearchQuery('');
                            }}
                            className="w-full p-2.5 text-left hover:bg-emerald-50 flex items-center justify-between cursor-pointer transition-colors"
                          >
                            <div>
                              <span className="font-semibold text-slate-900 text-xs block">
                                {prod.name}
                              </span>
                              <span className="text-[11px] text-slate-400 font-mono">
                                SKU: {prod.sku} · Stock: {prod.stockQuantity} {prod.unit}s
                              </span>
                            </div>
                            <span className="font-mono font-bold text-xs text-emerald-700">
                              {formatCurrency(prod.sellingPrice, symbol)} +
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Added Line Items Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[560px]">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] text-slate-500 uppercase font-semibold">
                          <th className="py-2.5 px-3">Item &amp; SKU</th>
                          <th className="py-2.5 px-3 text-center">Qty</th>
                          <th className="py-2.5 px-3 text-right">Unit Price ({symbol})</th>
                          <th className="py-2.5 px-3 text-right">Subtotal ({symbol})</th>
                          <th className="py-2.5 px-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {lineItems.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-slate-400">
                              <Package className="w-6 h-6 mx-auto mb-1.5 text-slate-300" />
                              <p className="font-medium text-slate-600">No items added to invoice yet.</p>
                              <p className="text-[11px] text-slate-400">
                                Use the product search bar above to add products.
                              </p>
                            </td>
                          </tr>
                        ) : (
                          lineItems.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50/70">
                              <td className="py-2.5 px-3">
                                <span className="font-semibold text-slate-900 block">
                                  {item.productName}
                                </span>
                                <span className="text-slate-400 font-mono text-[11px]">
                                  {item.sku} ({item.unit})
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <div className="inline-flex items-center gap-1 border border-slate-200 rounded p-0.5 bg-slate-50">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateItemQuantity(item.id, item.quantity - 1)
                                    }
                                    className="w-5 h-5 rounded bg-white hover:bg-slate-200 flex items-center justify-center font-bold text-slate-700 cursor-pointer"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    min="1"
                                    value={item.quantity}
                                    onChange={(e) =>
                                      handleUpdateItemQuantity(
                                        item.id,
                                        parseInt(e.target.value, 10) || 1
                                      )
                                    }
                                    className="w-12 text-center font-mono font-semibold bg-transparent border-none focus:outline-hidden"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateItemQuantity(item.id, item.quantity + 1)
                                    }
                                    className="w-5 h-5 rounded bg-white hover:bg-slate-200 flex items-center justify-center font-bold text-slate-700 cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={item.unitPrice}
                                  onChange={(e) =>
                                    handleUpdateItemPrice(
                                      item.id,
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  className="w-24 px-2 py-1 text-right font-mono border border-slate-200 rounded focus:border-emerald-500"
                                />
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                                {formatCurrency(item.lineTotal, symbol)}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLineItem(item.id)}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                                  title="Remove item"
                                >
                                  ×
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column (4 cols): Terms, Financials & Actions */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center">
                    3
                  </span>
                  <h2 className="text-sm font-bold text-slate-900">
                    Invoice Terms &amp; Summary
                  </h2>
                </div>

                <div className="space-y-3 text-xs">
                  {/* Issue Date */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Invoice Issue Date
                    </label>
                    <input
                      type="date"
                      value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                    />
                  </div>

                  {/* Payment Terms / Due Days */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Payment Terms / Due Days
                    </label>
                    <select
                      value={dueDays}
                      onChange={(e) => setDueDays(parseInt(e.target.value, 10))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 font-medium"
                    >
                      <option value={0}>Due Immediately / On Receipt</option>
                      <option value={7}>Net 7 Days (Standard Commercial)</option>
                      <option value={14}>Net 14 Days</option>
                      <option value={30}>Net 30 Days (Corporate Account)</option>
                    </select>
                  </div>

                  {/* Discount % & Tax % */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Discount %
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={discountPercent}
                        onChange={(e) =>
                          setDiscountPercent(parseFloat(e.target.value) || 0)
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-right"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        VAT Tax %
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={taxRatePercent}
                        onChange={(e) =>
                          setTaxRatePercent(parseFloat(e.target.value) || 0)
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-right"
                      />
                    </div>
                  </div>

                  {/* Payment Instructions / Remittance Notes */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Bank Transfer Instructions
                    </label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>

                  {/* Financial Breakdown Card */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 font-mono">
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(invoiceCalculations.subtotal, symbol)}</span>
                    </div>

                    {discountPercent > 0 && (
                      <div className="flex justify-between text-emerald-700">
                        <span>Discount ({discountPercent}%):</span>
                        <span>−{formatCurrency(invoiceCalculations.discountAmount, symbol)}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-slate-600">
                      <span>VAT ({taxRatePercent}%):</span>
                      <span>{formatCurrency(invoiceCalculations.taxAmount, symbol)}</span>
                    </div>

                    <div className="flex justify-between items-baseline pt-2 border-t border-slate-200 text-sm font-bold text-slate-900">
                      <span>Invoice Total:</span>
                      <span className="text-base text-emerald-800">
                        {formatCurrency(invoiceCalculations.totalAmount, symbol)}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-2 pt-2">
                    <button
                      type="button"
                      onClick={(e) => handleCreateInvoiceSubmit(e, 'unpaid')}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold rounded-lg flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-colors"
                    >
                      <FilePlus className="w-4 h-4" />
                      <span>Issue &amp; Send Invoice ({formatCurrency(invoiceCalculations.totalAmount, symbol)})</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleCreateInvoiceSubmit(e, 'draft')}
                      className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs cursor-pointer transition-colors"
                    >
                      Save as Draft
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* RECORD PAYMENT MODAL */}
      {/* ------------------------------------------------------------------- */}
      {paymentModalInvoice && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Record Invoice Payment"
          className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-lg bg-emerald-100 text-emerald-800">
                  <CreditCard className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Record Payment / Deposit</h3>
                  <p className="text-xs text-slate-500 font-mono">
                    {paymentModalInvoice.invoiceNumber}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPaymentModalInvoice(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {paymentError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{paymentError}</span>
              </div>
            )}

            {/* Customer & Balance Breakdown */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between items-baseline">
                <span className="text-slate-500">Customer:</span>
                <span className="font-bold text-slate-900">
                  {paymentModalInvoice.customerName}
                </span>
              </div>
              <div className="flex justify-between items-baseline font-mono">
                <span className="text-slate-500">Invoice Total:</span>
                <span className="font-semibold text-slate-800">
                  {formatCurrency(paymentModalInvoice.totalAmount, symbol)}
                </span>
              </div>
              <div className="flex justify-between items-baseline font-mono text-emerald-700">
                <span>Amount Paid So Far:</span>
                <span className="font-semibold">
                  {formatCurrency(paymentModalInvoice.amountPaid || 0, symbol)}
                </span>
              </div>
              <div className="flex justify-between items-baseline font-mono pt-1.5 border-t border-slate-200 text-sm font-bold text-slate-900">
                <span>Balance Remaining:</span>
                <span className="text-rose-700">
                  {formatCurrency(
                    paymentModalInvoice.balanceRemaining ?? paymentModalInvoice.totalAmount,
                    symbol
                  )}
                </span>
              </div>
            </div>

            <form onSubmit={handleRecordPaymentSubmit} className="space-y-3.5">
              {/* Payment Amount */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label htmlFor="pmt-amount-input" className="block text-xs font-semibold text-slate-700">
                    Payment Amount ({symbol}) *
                  </label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setPaymentAmountInput(
                          String(
                            paymentModalInvoice.balanceRemaining ??
                              paymentModalInvoice.totalAmount
                          )
                        )
                      }
                      className="text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 cursor-pointer"
                    >
                      Pay Full (100%)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const bal =
                          paymentModalInvoice.balanceRemaining ??
                          paymentModalInvoice.totalAmount;
                        setPaymentAmountInput(String(Math.round((bal / 2) * 100) / 100));
                      }}
                      className="text-[10px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded border border-slate-200 cursor-pointer"
                    >
                      Pay 50% Deposit
                    </button>
                  </div>
                </div>
                <input
                  id="pmt-amount-input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={
                    paymentModalInvoice.balanceRemaining ??
                    paymentModalInvoice.totalAmount
                  }
                  required
                  value={paymentAmountInput}
                  onChange={(e) => setPaymentAmountInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-bold text-emerald-900"
                  placeholder="Enter payment amount"
                />
              </div>

              {/* Payment Method */}
              <div>
                <label htmlFor="pmt-method-select" className="block text-xs font-semibold text-slate-700 mb-1">
                  Payment Method *
                </label>
                <select
                  id="pmt-method-select"
                  value={paymentMethodSelect}
                  onChange={(e) => setPaymentMethodSelect(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 font-medium focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="bank_transfer">Bank Transfer (GTBank / Zenith / Access)</option>
                  <option value="cash">Cash Payment (Store Counter)</option>
                  <option value="pos_card">POS Card Terminal</option>
                  <option value="credit">Store Credit / Deposit Ledger</option>
                </select>
              </div>

              {/* Payment Reference */}
              <div>
                <label htmlFor="pmt-ref-input" className="block text-xs font-semibold text-slate-700 mb-1">
                  Payment Reference / Transaction ID (Optional)
                </label>
                <input
                  id="pmt-ref-input"
                  type="text"
                  value={paymentReferenceInput}
                  onChange={(e) => setPaymentReferenceInput(e.target.value)}
                  placeholder="e.g. TRF/GTB/012938472 or Receipt #881"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="pmt-notes-input" className="block text-xs font-semibold text-slate-700 mb-1">
                  Payment Notes (Optional)
                </label>
                <input
                  id="pmt-notes-input"
                  type="text"
                  value={paymentNotesInput}
                  onChange={(e) => setPaymentNotesInput(e.target.value)}
                  placeholder="e.g. Deposit for catering supplies"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPaymentModalInvoice(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm &amp; Record Payment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* PRINTABLE / FULL INVOICE PREVIEW MODAL */}
      {/* ------------------------------------------------------------------- */}
      {previewInvoice && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Invoice Preview"
          className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full p-6 sm:p-8 space-y-6 max-h-[92vh] overflow-y-auto shadow-2xl my-auto">
            {/* Action Bar (Top) */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 print:hidden">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-lg bg-emerald-100 text-emerald-800">
                  <FileText className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="text-base font-display font-bold text-slate-900">
                    Official Tax Invoice
                  </h2>
                  <p className="text-xs text-slate-500 font-mono">
                    {previewInvoice.invoiceNumber}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {(previewInvoice.balanceRemaining ?? previewInvoice.totalAmount) > 0 && (
                  <button
                    type="button"
                    onClick={() => handleOpenPaymentModal(previewInvoice)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Record Payment</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() =>
                    downloadInvoicePdf(
                      previewInvoice,
                      business,
                      shop,
                      symbol,
                      `invoice-document-${previewInvoice.id}`
                    )
                  }
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Invoice</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewInvoice(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* PRINTABLE INVOICE DOCUMENT BODY */}
            <div
              id={`invoice-document-${previewInvoice.id}`}
              className="space-y-6 text-xs text-slate-800 print:text-black bg-white p-2 rounded-xl"
            >
              {/* Header: Business Branding & Invoice Header */}
              <div className="flex justify-between items-start border-b border-slate-200 pb-5">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <img
                      src="/assets/aistudio/smartmind_pos_4bb52e16.png"
                      alt="Store Logo"
                      className="w-7 h-7 rounded object-contain shrink-0"
                    />
                    <span className="font-display font-bold text-base text-slate-900">
                      {business.legalName || business.name}
                    </span>
                  </div>
                  <p className="text-slate-600 font-medium">{shop.name} ({shop.code})</p>
                  <p className="text-slate-500">{shop.address}, {shop.locationCity}</p>
                  <p className="text-slate-500">Phone: {shop.phone} | TIN: {business.taxIdentificationNumber}</p>
                </div>

                <div className="text-right space-y-1">
                  <h1 className="text-xl font-display font-black text-slate-900 tracking-tight">INVOICE</h1>
                  <p className="font-mono font-bold text-slate-900">{previewInvoice.invoiceNumber}</p>
                  <div className="pt-1">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                        previewInvoice.status === 'paid'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : previewInvoice.status === 'partially_paid'
                          ? 'bg-blue-100 text-blue-800 border border-blue-300'
                          : previewInvoice.status === 'overdue'
                          ? 'bg-rose-100 text-rose-800 border border-rose-300'
                          : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}
                    >
                      {previewInvoice.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Dates & Customer Details */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Billed To:</span>
                  <p className="font-bold text-slate-900 text-sm">{previewInvoice.customerName}</p>
                  {previewInvoice.companyName && (
                    <p className="font-semibold text-slate-700">{previewInvoice.companyName}</p>
                  )}
                  <p className="text-slate-600">{previewInvoice.customerPhone}</p>
                  {previewInvoice.customerEmail && <p className="text-slate-600">{previewInvoice.customerEmail}</p>}
                  {previewInvoice.customerAddress && <p className="text-slate-600">{previewInvoice.customerAddress}</p>}
                </div>

                <div className="space-y-1 text-right font-mono">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Invoice Details:</span>
                  <p>Issue Date: <strong className="text-slate-900">{previewInvoice.issueDate}</strong></p>
                  <p>Due Date: <strong className="text-slate-900">{previewInvoice.dueDate}</strong></p>
                  <p>Issued By: <strong className="text-slate-900">{previewInvoice.createdByName}</strong></p>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-600">
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">Unit Price ({symbol})</th>
                      <th className="py-2.5 px-3 text-right">Amount ({symbol})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {previewInvoice.items.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2.5 px-3 font-sans">
                          <span className="font-semibold text-slate-900 block">{item.productName}</span>
                          <span className="text-[10px] text-slate-400 font-mono">SKU: {item.sku}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-700">
                          {item.quantity} {item.unit || 'Unit'}{item.quantity > 1 ? 's' : ''}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-700">
                          {formatCurrency(item.unitPrice, symbol)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                          {formatCurrency(item.lineTotal, symbol)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals & Payments Summary */}
              <div className="flex justify-end pt-2">
                <div className="w-72 space-y-1.5 font-mono">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(previewInvoice.subtotal, symbol)}</span>
                  </div>

                  {previewInvoice.discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Discount:</span>
                      <span>−{formatCurrency(previewInvoice.discountAmount, symbol)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-slate-600">
                    <span>VAT ({previewInvoice.taxRatePercent}%):</span>
                    <span>{formatCurrency(previewInvoice.taxAmount, symbol)}</span>
                  </div>

                  <div className="flex justify-between items-baseline pt-2 border-t border-slate-200 font-bold text-slate-900 text-sm">
                    <span>Invoice Total:</span>
                    <span>{formatCurrency(previewInvoice.totalAmount, symbol)}</span>
                  </div>

                  {(previewInvoice.amountPaid || 0) > 0 && (
                    <>
                      <div className="flex justify-between text-emerald-700 pt-1 font-semibold">
                        <span>Amount Paid:</span>
                        <span>−{formatCurrency(previewInvoice.amountPaid || 0, symbol)}</span>
                      </div>

                      <div className="flex justify-between items-baseline pt-1 border-t-2 border-slate-900 font-bold text-slate-900 text-sm">
                        <span>Balance Due:</span>
                        <span className={previewInvoice.balanceRemaining === 0 ? 'text-emerald-800' : 'text-rose-700'}>
                          {formatCurrency(
                            previewInvoice.balanceRemaining ??
                              Math.max(0, previewInvoice.totalAmount - (previewInvoice.amountPaid || 0)),
                            symbol
                          )}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Recorded Payment History Trail */}
              {previewInvoice.payments && previewInvoice.payments.length > 0 && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                  <span className="font-bold text-slate-900 block flex items-center gap-1">
                    <History className="w-3.5 h-3.5 text-slate-600" />
                    <span>Payment History Ledger:</span>
                  </span>
                  <div className="divide-y divide-slate-200/60 font-mono text-[11px]">
                    {previewInvoice.payments.map((pmt) => (
                      <div key={pmt.id} className="py-1.5 flex justify-between items-center">
                        <div>
                          <span className="font-semibold text-slate-900 block">
                            {formatCurrency(pmt.amount, symbol)} via {pmt.paymentMethod.replace('_', ' ').toUpperCase()}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {pmt.recordedAt} · Ref: {pmt.paymentReference || 'N/A'} · By: {pmt.recordedByName}
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          Received
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bank Transfer Instructions */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-[11px] space-y-1">
                <span className="font-bold text-slate-900 block uppercase">Remittance &amp; Payment Instructions:</span>
                <p className="text-slate-700">{previewInvoice.notes || 'Please pay via Bank Transfer to account details listed above.'}</p>
                <p className="text-slate-500 font-mono">Reference: Use {previewInvoice.invoiceNumber} as payment description.</p>
              </div>

              {/* Footer Note */}
              <div className="text-center text-[10px] text-slate-400 border-t border-slate-100 pt-3">
                <p>Thank you for doing business with {business.name}.</p>
                <p>Computer generated invoice · SmartMind POS System</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
