import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Barcode,
  Camera,
  Scan,
  Plus,
  Minus,
  Trash2,
  Banknote,
  CreditCard,
  Building,
  CheckCircle2,
  AlertCircle,
  LayoutGrid,
  List,
  ShoppingCart,
  X,
  UserPlus,
  Clock,
  Users,
  BookOpen,
  ChevronDown,
  ChevronUp,
  UserCheck,
  Check,
  ShieldAlert,
  Phone,
  User as UserIcon,
  Wallet,
  ArrowLeft,
  Printer,
  Lock,
  RotateCcw,
  ReceiptText,
  Wine,
  Send,
  FileText,
} from 'lucide-react';
import {
  Business,
  CartItem,
  DebtCustomer,
  DebtTransactionType,
  PaymentMethod,
  Product,
  ProductCategory,
  SaleTransaction,
  Shop,
  User,
} from '../types/pos';
import {
  calculateCartTotals,
  calculateReceiptReturnResult,
  closePosCustomerTab,
  createPosCustomerTab,
  CreateDebtCustomerInput,
  filterShopDebtCustomers,
  filterShopProducts,
  findMatchingReceipts,
  findProductByBarcodeOrSku,
  findReceiptByNumber,
  formatCurrency,
  getPosDraftStorageKey,
  hasPermission,
  getReservedStockAcrossTabs,
  getShopPrinterSettings,
  getTodayYmd,
  PosCustomerTab,
  analyzeTabDispatchStatus,
  validateDebtCustomerInput,
  validatePosCreditSale,
} from '../utils/posCalculations';
import {
  resolveEffectivePrinter,
  printSaleReceipt,
  printInterimTabBill,
} from '../utils/receiptPrinter';
import {
  BarcodeCaptureModal,
  playPosBeep,
} from '../components/inventory/BarcodeCaptureModal';

interface PosPageProps {
  business: Business;
  shop: Shop;
  currentUser: User;
  shopCategories: ProductCategory[];
  shopProducts: Product[];
  shopSales?: SaleTransaction[];
  shopDebtCustomers: DebtCustomer[];
  onCompleteDemoSale: (
    cart: CartItem[],
    paymentMethod: PaymentMethod,
    discountAmount: number,
    taxAmount: number,
    totalAmount: number,
    amountTendered: number,
    paymentReference?: string,
    creditCustomer?: DebtCustomer
  ) => SaleTransaction;
  onProcessReceiptReturn?: (
    saleId: string,
    updatedQuantitiesByLineId: Record<string, number>,
    reason: string
  ) => void;
  onAddDebtCustomer: (input: CreateDebtCustomerInput) => DebtCustomer;
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
  onOpenDebtBook?: () => void;
  onDispatchTabItems?: (
    tabId: string,
    items: Array<{ product: Product; quantity: number }>,
    tableName: string
  ) => void;
  onVoidTabItems?: (
    tabId: string,
    items: Array<{ product: Product; quantity: number }>,
    tableName: string,
    reason: string
  ) => void;
}

interface PersistedPosDraft {
  date?: string;
  userId?: string;
  shopId?: string;
  searchQuery?: string;
  selectedCategoryId?: string;
  viewMode?: 'grid' | 'list';
  tabs?: PosCustomerTab[];
  activeTabId?: string;
  // Legacy single-tab fields for backward compatibility
  cart?: CartItem[];
  discountInput?: string;
  discountMode?: 'percent' | 'fixed';
  activePaymentModal?: PaymentMethod | null;
  amountTenderedInput?: string;
  paymentReference?: string;
}

export const PosPage: React.FC<PosPageProps> = ({
  business,
  shop,
  currentUser,
  shopCategories,
  shopProducts,
  shopSales = [],
  shopDebtCustomers,
  onCompleteDemoSale,
  onProcessReceiptReturn,
  onAddDebtCustomer,
  onRecordDebtTransaction,
  onOpenDebtBook,
  onDispatchTabItems,
  onVoidTabItems,
}) => {
  const draftStorageKey = getPosDraftStorageKey(currentUser.id, shop.id);
  const todayYmd = getTodayYmd();

  const initialDraftState = React.useMemo(() => {
    const defaultTab = createPosCustomerTab([]);
    if (typeof window === 'undefined') {
      return {
        searchQuery: '',
        selectedCategoryId: 'all',
        viewMode: 'grid' as const,
        tabs: [defaultTab],
        activeTabId: defaultTab.id,
        activePaymentModal: null as PaymentMethod | null,
      };
    }

    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('reset') === '1') {
        window.sessionStorage.removeItem(draftStorageKey);
        window.localStorage.removeItem(draftStorageKey);
        return {
          searchQuery: '',
          selectedCategoryId: 'all',
          viewMode: 'grid' as const,
          tabs: [defaultTab],
          activeTabId: defaultTab.id,
          activePaymentModal: null as PaymentMethod | null,
        };
      }

      const raw =
        window.sessionStorage.getItem(draftStorageKey) ||
        window.localStorage.getItem(draftStorageKey);
      if (!raw) {
        return {
          searchQuery: '',
          selectedCategoryId: 'all',
          viewMode: 'grid' as const,
          tabs: [defaultTab],
          activeTabId: defaultTab.id,
          activePaymentModal: null as PaymentMethod | null,
        };
      }

      const parsed: PersistedPosDraft = JSON.parse(raw);

      // INDEPENDENT USER & NEW DAY REVERT CHECK:
      // If the draft belongs to a different day or a different user, discard it and revert to Customer #1
      if (
        parsed.date &&
        (parsed.date !== todayYmd || (parsed.userId && parsed.userId !== currentUser.id))
      ) {
        window.sessionStorage.removeItem(draftStorageKey);
        window.localStorage.removeItem(draftStorageKey);
        return {
          searchQuery: '',
          selectedCategoryId: 'all',
          viewMode: 'grid' as const,
          tabs: [defaultTab],
          activeTabId: defaultTab.id,
          activePaymentModal: null as PaymentMethod | null,
        };
      }

      if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
        const validActiveId = parsed.tabs.some(
          (t) => t.id === parsed.activeTabId
        )
          ? (parsed.activeTabId as string)
          : parsed.tabs[0].id;
        return {
          searchQuery: parsed.searchQuery ?? '',
          selectedCategoryId: parsed.selectedCategoryId ?? 'all',
          viewMode: parsed.viewMode ?? ('grid' as const),
          tabs: parsed.tabs,
          activeTabId: validActiveId,
          activePaymentModal: parsed.activePaymentModal ?? null,
        };
      }

      // Migrate legacy single-cart draft if present
      const migratedTab: PosCustomerTab = {
        ...defaultTab,
        cart: Array.isArray(parsed.cart) ? parsed.cart : [],
        discountInput: parsed.discountInput ?? '0',
        discountMode: parsed.discountMode ?? 'percent',
        status: parsed.activePaymentModal ? 'awaiting_payment' : 'billing',
        pendingPaymentMethod: parsed.activePaymentModal ?? null,
        amountTenderedInput: parsed.amountTenderedInput ?? '',
        paymentReference: parsed.paymentReference ?? '',
      };

      return {
        searchQuery: parsed.searchQuery ?? '',
        selectedCategoryId: parsed.selectedCategoryId ?? 'all',
        viewMode: parsed.viewMode ?? ('grid' as const),
        tabs: [migratedTab],
        activeTabId: migratedTab.id,
        activePaymentModal: parsed.activePaymentModal ?? null,
      };
    } catch {
      return {
        searchQuery: '',
        selectedCategoryId: 'all',
        viewMode: 'grid' as const,
        tabs: [defaultTab],
        activeTabId: defaultTab.id,
        activePaymentModal: null as PaymentMethod | null,
      };
    }
  }, [draftStorageKey, currentUser.id, todayYmd]);

  const [searchQuery, setSearchQuery] = useState<string>(
    initialDraftState.searchQuery
  );
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeFeedback, setBarcodeFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    initialDraftState.selectedCategoryId
  );
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(
    initialDraftState.viewMode
  );

  // Multi-Tab Customer Sessions State
  const [tabs, setTabs] = useState<PosCustomerTab[]>(initialDraftState.tabs);
  const [activeTabId, setActiveTabId] = useState<string>(
    initialDraftState.activeTabId
  );

  // Checkout Modal State (for currently active tab)
  const [activePaymentModal, setActivePaymentModal] =
    useState<PaymentMethod | null>(initialDraftState.activePaymentModal);
  const [completedReceipt, setCompletedReceipt] =
    useState<SaleTransaction | null>(null);
  const [isPrintingReceipt, setIsPrintingReceipt] = useState<boolean>(false);
  const [receiptPrintFeedback, setReceiptPrintFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Bar & Table Tab Management State
  const isTableTabsEnabled = Boolean(
    shop.enableTableTabs !== undefined
      ? shop.enableTableTabs
      : shop.category === 'Bar & Lounge'
  );
  const [tableModalOpen, setTableModalOpen] = useState<boolean>(false);
  const [tableForm, setTableForm] = useState<{
    tableIdentifier: string;
    serverName: string;
    guestCount: string;
    customerNote: string;
  }>({
    tableIdentifier: '',
    serverName: '',
    guestCount: '',
    customerNote: '',
  });

  const [voidModal, setVoidModal] = useState<{
    open: boolean;
    item: CartItem | null;
    voidQuantity: number;
    reason: string;
  }>({
    open: false,
    item: null,
    voidQuantity: 1,
    reason: 'Customer cancelled / unopened drink returned',
  });

  const [isPrintingInterimBill, setIsPrintingInterimBill] =
    useState<boolean>(false);
  const [tabFeedback, setTabFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handlePrintCompletedReceipt = async (
    receiptToPrint?: SaleTransaction | null
  ) => {
    const target = receiptToPrint || completedReceipt;
    if (!target) return;
    setIsPrintingReceipt(true);
    setReceiptPrintFeedback(null);
    try {
      const result = await printSaleReceipt({
        sale: target,
        shop,
        business,
      });
      if (result.success) {
        setReceiptPrintFeedback({
          type: 'success',
          message: `Receipt printed silently to ${result.printerName}.`,
        });
      } else {
        setReceiptPrintFeedback({
          type: 'error',
          message:
            result.failureReason || `Could not print to ${result.printerName}.`,
        });
      }
    } catch (error) {
      setReceiptPrintFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Print job failed.',
      });
    } finally {
      setIsPrintingReceipt(false);
    }
  };
  const [mobileActivePanel, setMobileActivePanel] = useState<
    'catalogue' | 'cart'
  >('catalogue');

  // POS Return Tab State (Input Receipt Number -> Call Up Editable Receipt Items)
  const [posReturnModalOpen, setPosReturnModalOpen] = useState<boolean>(false);
  const [posReturnReceiptQuery, setPosReturnReceiptQuery] =
    useState<string>('');
  const [posSelectedReturnReceiptId, setPosSelectedReturnReceiptId] = useState<
    string | null
  >(null);
  const [posReturnEditedQuantities, setPosReturnEditedQuantities] = useState<
    Record<string, number>
  >({});
  const [posReturnReason, setPosReturnReason] = useState<string>(
    'Customer return with receipt at POS counter'
  );
  const [posReturnBanner, setPosReturnBanner] = useState<string | null>(null);

  // Camera Barcode Scanner Modal State
  const [cameraScannerOpen, setCameraScannerOpen] = useState<boolean>(false);

  // Hardware Barcode Scanner Gun Buffer & Timestamps
  const scannerBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  // Guarantee activeTab always resolves to a valid tab
  const activeTab =
    tabs.find((t) => t.id === activeTabId) ??
    tabs[0] ??
    createPosCustomerTab([]);

  const cart = activeTab.cart;
  const discountInput = activeTab.discountInput;
  const discountMode = activeTab.discountMode;
  const amountTenderedInput = activeTab.amountTenderedInput;
  const paymentReference = activeTab.paymentReference;

  // Helper to update a specific tab (defaults to activeTab)
  const updateTab = (
    updater: (tab: PosCustomerTab) => PosCustomerTab,
    targetTabId: string = activeTab.id
  ) => {
    setTabs((prevTabs) =>
      prevTabs.map((t) => (t.id === targetTabId ? updater(t) : t))
    );
  };

  React.useEffect(() => {
    const serialized = JSON.stringify({
      date: todayYmd,
      userId: currentUser.id,
      shopId: shop.id,
      searchQuery,
      selectedCategoryId,
      viewMode,
      tabs,
      activeTabId: activeTab.id,
      activePaymentModal,
    });
    try {
      window.sessionStorage.setItem(draftStorageKey, serialized);
    } catch {
      // Ignore storage errors
    }
    try {
      window.localStorage.setItem(draftStorageKey, serialized);
    } catch {
      // Ignore storage errors
    }
  }, [
    draftStorageKey,
    todayYmd,
    currentUser.id,
    shop.id,
    searchQuery,
    selectedCategoryId,
    viewMode,
    tabs,
    activeTab.id,
    activePaymentModal,
  ]);

  const symbol = business.currencySymbol;

  const filteredProducts = filterShopProducts(
    shopProducts,
    shop.id,
    business.id,
    {
      searchQuery,
      categoryId: selectedCategoryId,
      onlyActive: true,
    }
  );

  const reservedInOtherTabs = React.useMemo(
    () => getReservedStockAcrossTabs(tabs, activeTab.id),
    [tabs, activeTab.id]
  );

  const dispatchAnalysis = React.useMemo(
    () => analyzeTabDispatchStatus(cart),
    [cart]
  );

  const numericDiscount = Math.max(0, parseFloat(discountInput) || 0);
  const totals = calculateCartTotals(
    cart,
    numericDiscount,
    discountMode,
    shop.taxRatePercent
  );

  // Credit Sale & Debt Book State
  const [showCreditSection, setShowCreditSection] = useState(false);
  const [customerSearchFilter, setCustomerSearchFilter] = useState('');
  const [creditSaleFeedback, setCreditSaleFeedback] = useState<string | null>(
    null
  );

  // Add New Customer Modal Form State (mirrors Debt Book registration form)
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [newCustFullName, setNewCustFullName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustCreditLimitEnabled, setNewCustCreditLimitEnabled] =
    useState(false);
  const [newCustCreditLimitAmount, setNewCustCreditLimitAmount] = useState('');
  const [newCustInitialCredit, setNewCustInitialCredit] = useState('');
  const [newCustInitialPaid, setNewCustInitialPaid] = useState('');
  const [newCustNotes, setNewCustNotes] = useState('');
  const [newCustFormError, setNewCustFormError] = useState<string | null>(null);

  // Shop Debt Book Customers (strictly scoped to this shop and business)
  const activeShopDebtCustomers = React.useMemo(() => {
    return filterShopDebtCustomers(shopDebtCustomers, shop.id, business.id);
  }, [shopDebtCustomers, shop.id, business.id]);

  // Selected Debt Book customer for current active POS tab
  // If no customer is explicitly set on tab, default to the first customer in the debt book if any exist
  const selectedCreditCustomer = React.useMemo(() => {
    if (activeTab.selectedCreditCustomerId) {
      const match = activeShopDebtCustomers.find(
        (c) => c.id === activeTab.selectedCreditCustomerId
      );
      if (match) return match;
    }
    return activeShopDebtCustomers.length > 0 ? activeShopDebtCustomers[0] : null;
  }, [activeShopDebtCustomers, activeTab.selectedCreditCustomerId]);

  const searchedDebtCustomers = React.useMemo(() => {
    const q = customerSearchFilter.trim().toLowerCase();
    if (!q) return activeShopDebtCustomers;
    return activeShopDebtCustomers.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        (c.notes ?? '').toLowerCase().includes(q)
    );
  }, [activeShopDebtCustomers, customerSearchFilter]);

  const handleToggleCreditSection = () => {
    setShowCreditSection((prev) => {
      const next = !prev;
      if (
        next &&
        !activeTab.selectedCreditCustomerId &&
        activeShopDebtCustomers.length > 0
      ) {
        updateTab((t) => ({
          ...t,
          selectedCreditCustomerId: activeShopDebtCustomers[0].id,
        }));
      }
      return next;
    });
  };

  const handleSelectCreditCustomer = (customerId: string) => {
    updateTab((t) => ({
      ...t,
      selectedCreditCustomerId: customerId,
    }));
  };

  const handleOpenAddCustomerModal = () => {
    setNewCustFullName('');
    setNewCustPhone('');
    setNewCustCreditLimitEnabled(false);
    setNewCustCreditLimitAmount('');
    setNewCustInitialCredit('');
    setNewCustInitialPaid('');
    setNewCustNotes('');
    setNewCustFormError(null);
    setShowAddCustomerModal(true);
  };

  const handleSaveNewCustomerFromPos = (e: React.FormEvent) => {
    e.preventDefault();
    setNewCustFormError(null);

    const parsedLimit = newCustCreditLimitEnabled
      ? parseFloat(newCustCreditLimitAmount)
      : 0;

    const validation = validateDebtCustomerInput(
      {
        fullName: newCustFullName,
        phone: newCustPhone,
        creditLimitEnabled: newCustCreditLimitEnabled,
        creditLimitAmount: parsedLimit,
        notes: newCustNotes,
      },
      activeShopDebtCustomers
    );

    if (!validation.valid) {
      setNewCustFormError(validation.error ?? 'Invalid customer details.');
      return;
    }

    const createdCustomer = onAddDebtCustomer({
      fullName: newCustFullName,
      phone: newCustPhone,
      creditLimitEnabled: newCustCreditLimitEnabled,
      creditLimitAmount: newCustCreditLimitEnabled ? parsedLimit : 0,
      notes: newCustNotes,
    });

    const parsedOpeningCredit = parseFloat(newCustInitialCredit);
    const parsedOpeningPaid = parseFloat(newCustInitialPaid);

    if (!Number.isNaN(parsedOpeningCredit) && parsedOpeningCredit > 0) {
      onRecordDebtTransaction(
        createdCustomer.id,
        'credit',
        parsedOpeningCredit,
        {
          notes: 'Opening credit recorded during POS customer registration',
        }
      );
    }

    if (!Number.isNaN(parsedOpeningPaid) && parsedOpeningPaid > 0) {
      onRecordDebtTransaction(
        createdCustomer.id,
        'deposit',
        parsedOpeningPaid,
        {
          paymentMethod: 'cash',
          notes: 'Initial deposit recorded during POS customer registration',
        }
      );
    }

    // Automatically select the new customer in the current POS customer tab
    updateTab((t) => ({
      ...t,
      selectedCreditCustomerId: createdCustomer.id,
    }));

    setShowAddCustomerModal(false);
    setShowCreditSection(true);
    setCreditSaleFeedback(
      `Customer "${createdCustomer.fullName}" saved to Debt Book and selected for credit checkout!`
    );
    setTimeout(() => setCreditSaleFeedback(null), 5000);
  };

  const handleConfirmCreditSale = () => {
    if (cart.length === 0) return;
    if (!selectedCreditCustomer) {
      setCreditSaleFeedback(
        'Please select a customer from the Debt Book or click "Add New Customer" to register one.'
      );
      return;
    }

    const validation = validatePosCreditSale(
      selectedCreditCustomer,
      totals.totalAmount,
      symbol
    );

    if (!validation.valid) {
      setCreditSaleFeedback(validation.error ?? 'Cannot complete credit sale.');
      return;
    }

    const newReceipt = onCompleteDemoSale(
      cart,
      'credit',
      totals.discountAmount,
      totals.taxAmount,
      totals.totalAmount,
      0,
      `CREDIT-${Date.now().toString().slice(-6)}`,
      selectedCreditCustomer
    );

    setCompletedReceipt(newReceipt);
    setReceiptPrintFeedback(null);
    const printerSettings = getShopPrinterSettings(shop);
    if (printerSettings.autoPrintOnSale) {
      void handlePrintCompletedReceipt(newReceipt);
    }
    setCreditSaleFeedback(null);
    setShowCreditSection(false);

    if (tabs.length > 1) {
      const nextState = closePosCustomerTab(tabs, activeTab.id, activeTab.id);
      setTabs(nextState.tabs);
      setActiveTabId(nextState.activeTabId);
    } else {
      updateTab((t) => ({
        ...t,
        customerNote: '',
        cart: [],
        discountInput: '0',
        status: 'billing',
        pendingPaymentMethod: null,
        amountTenderedInput: '',
        paymentReference: '',
        selectedCreditCustomerId: null,
      }));
    }
  };

  // Open a new customer tab (+) and switch to it immediately
  const handleOpenNewTab = () => {
    const newTab = createPosCustomerTab(tabs);
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setActivePaymentModal(null);
    setBarcodeFeedback(null);
  };

  const handleOpenNewTableModal = () => {
    setTableForm({
      tableIdentifier: `Table ${tabs.length + 1}`,
      serverName: currentUser.fullName || currentUser.username || '',
      guestCount: '2',
      customerNote: '',
    });
    setTableModalOpen(true);
  };

  const handleCreateTableTab = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const ident =
      tableForm.tableIdentifier.trim() || `Table ${tabs.length + 1}`;
    const gCount = parseInt(tableForm.guestCount, 10) || undefined;
    const newTab = createPosCustomerTab(tabs, {
      isTableTab: true,
      tableIdentifier: ident,
      serverName:
        tableForm.serverName.trim() ||
        currentUser.fullName ||
        currentUser.username,
      guestCount: gCount,
      customLabel: ident,
    });
    if (tableForm.customerNote.trim()) {
      newTab.customerNote = tableForm.customerNote.trim();
    }
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setActivePaymentModal(null);
    setBarcodeFeedback(null);
    setTableModalOpen(false);
    setTabFeedback({
      type: 'success',
      message: `Opened new tab for ${ident}. Drinks and food can now be added.`,
    });
  };

  const handleDispatchActiveTab = () => {
    const undispatchedItems = cart
      .map((item) => {
        const alreadyDispatched = item.dispatchedQuantity || 0;
        const unDispatched = Math.max(0, item.quantity - alreadyDispatched);
        return {
          product: item.product,
          quantity: unDispatched,
        };
      })
      .filter((entry) => entry.quantity > 0);

    if (undispatchedItems.length === 0) return;

    const tableLabel = activeTab.tableIdentifier || activeTab.label;

    onDispatchTabItems?.(activeTab.id, undispatchedItems, tableLabel);

    const totalDispatchedCount = undispatchedItems.reduce(
      (acc, i) => acc + i.quantity,
      0
    );

    updateTab((t) => ({
      ...t,
      lastDispatchedAt: new Date().toISOString(),
      cart: t.cart.map((item) => ({
        ...item,
        dispatchedQuantity: item.quantity,
      })),
    }));

    setTabFeedback({
      type: 'success',
      message: `Dispatched ${totalDispatchedCount} item(s) to ${tableLabel}. Stock deducted from inventory.`,
    });
  };

  const handleOpenVoidModal = (item: CartItem) => {
    const dispatched = item.dispatchedQuantity || 0;
    if (dispatched <= 0) return;
    setVoidModal({
      open: true,
      item,
      voidQuantity: 1,
      reason: 'Customer cancelled / unopened drink returned',
    });
  };

  const handleConfirmVoidItem = () => {
    if (!voidModal.item) return;
    const item = voidModal.item;
    const maxVoidable = item.dispatchedQuantity || item.quantity;
    const voidQty = Math.min(Math.max(1, voidModal.voidQuantity), maxVoidable);
    const tableLabel = activeTab.tableIdentifier || activeTab.label;

    onVoidTabItems?.(
      activeTab.id,
      [{ product: item.product, quantity: voidQty }],
      tableLabel,
      voidModal.reason
    );

    updateTab((t) => {
      const updatedCart = t.cart
        .map((cItem) => {
          if (cItem.product.id !== item.product.id) return cItem;
          const newQty = cItem.quantity - voidQty;
          const newDispatched = Math.max(
            0,
            (cItem.dispatchedQuantity || 0) - voidQty
          );
          return {
            ...cItem,
            quantity: newQty,
            dispatchedQuantity: newDispatched,
          };
        })
        .filter((cItem) => cItem.quantity > 0);

      return {
        ...t,
        cart: updatedCart,
      };
    });

    setTabFeedback({
      type: 'success',
      message: `Voided ${voidQty}x ${item.product.name} from ${tableLabel}. Stock restored to inventory.`,
    });
    setVoidModal({ open: false, item: null, voidQuantity: 1, reason: '' });
  };

  const handlePrintInterimBill = async () => {
    if (cart.length === 0) return;
    setIsPrintingInterimBill(true);
    try {
      const result = await printInterimTabBill({
        tab: activeTab,
        shop,
        business,
        currentUser,
      });
      if (result.success) {
        updateTab((t) => ({
          ...t,
          interimBillPrintedAt: new Date().toISOString(),
        }));
        setTabFeedback({
          type: 'success',
          message: `Interim Bill printed for ${
            activeTab.tableIdentifier || activeTab.label
          }. Present this to the customer for verification.`,
        });
      } else {
        setTabFeedback({
          type: 'error',
          message: result.failureReason || 'Failed to print interim bill.',
        });
      }
    } catch (err) {
      setTabFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Printing failed.',
      });
    } finally {
      setIsPrintingInterimBill(false);
    }
  };

  // Switch between open customer tabs
  const handleSelectTab = (tabId: string) => {
    if (tabId === activeTab.id) return;
    setActiveTabId(tabId);
    setActivePaymentModal(null);
    setBarcodeFeedback(null);
  };

  // Close a customer tab
  const handleCloseTab = (tabId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const tabToClose = tabs.find((t) => t.id === tabId);
    if (tabToClose) {
      const hasDispatched = tabToClose.cart.some(
        (i) => (i.dispatchedQuantity || 0) > 0
      );
      if (hasDispatched) {
        alert(
          `Cannot close "${
            tabToClose.tableIdentifier || tabToClose.label
          }" because items have already been dispatched and deducted from inventory. Please finalize payment or void items to return stock before closing.`
        );
        return;
      }
    }
    const nextState = closePosCustomerTab(tabs, tabId, activeTab.id);
    setTabs(nextState.tabs);
    setActiveTabId(nextState.activeTabId);
    if (tabId === activeTab.id) {
      setActivePaymentModal(null);
    }
  };

  // Put current customer tab on hold ("Awaiting Payment") and switch to another tab or open a new tab
  const handleHoldAndAttendNextCustomer = (
    methodToHold?: PaymentMethod | null
  ) => {
    const effectiveMethod: PaymentMethod =
      methodToHold ??
      activePaymentModal ??
      activeTab.pendingPaymentMethod ??
      'bank_transfer';

    const defaultRef =
      effectiveMethod === 'cash'
        ? ''
        : paymentReference ||
          `REF-${effectiveMethod.toUpperCase().slice(0, 3)}-${Math.floor(
            100000 + Math.random() * 900000
          )}`;

    const defaultTendered =
      amountTenderedInput || totals.totalAmount.toFixed(2);

    // Find another tab that is currently in 'billing' state, or create a new tab
    const existingOtherBillingTab = tabs.find(
      (t) => t.id !== activeTab.id && t.status === 'billing'
    );

    if (existingOtherBillingTab) {
      updateTab((t) => ({
        ...t,
        status: 'awaiting_payment',
        pendingPaymentMethod: effectiveMethod,
        amountTenderedInput: defaultTendered,
        paymentReference: defaultRef,
      }));
      setActiveTabId(existingOtherBillingTab.id);
    } else {
      const nextTab = createPosCustomerTab(tabs);
      setTabs((prev) => [
        ...prev.map((t) =>
          t.id === activeTab.id
            ? {
                ...t,
                status: 'awaiting_payment' as const,
                pendingPaymentMethod: effectiveMethod,
                amountTenderedInput: defaultTendered,
                paymentReference: defaultRef,
              }
            : t
        ),
        nextTab,
      ]);
      setActiveTabId(nextTab.id);
    }

    setActivePaymentModal(null);
    setBarcodeFeedback(null);
  };

  const handleAddToCart = (product: Product) => {
    const heldElsewhere = reservedInOtherTabs[product.id] || 0;
    const maxAvailableForThisTab = Math.max(
      0,
      product.stockQuantity - heldElsewhere
    );
    if (maxAvailableForThisTab <= 0) return;

    updateTab((t) => {
      const existingIndex = t.cart.findIndex(
        (i) => i.product.id === product.id
      );
      if (existingIndex > -1) {
        const currentQty = t.cart[existingIndex].quantity;
        if (currentQty >= maxAvailableForThisTab) {
          return t;
        }
        const updatedCart = [...t.cart];
        updatedCart[existingIndex] = {
          ...updatedCart[existingIndex],
          quantity: currentQty + 1,
        };
        return { ...t, cart: updatedCart };
      }
      return {
        ...t,
        cart: [...t.cart, { product, quantity: 1 }],
      };
    });
  };

  const handleUpdateQuantity = (productId: string, nextQty: number) => {
    const currentItem = cart.find((i) => i.product.id === productId);
    const dispatched = currentItem?.dispatchedQuantity || 0;

    // If attempting to reduce already dispatched/served items, require formal Void flow
    if (currentItem && dispatched > 0 && nextQty < dispatched) {
      handleOpenVoidModal(currentItem);
      return;
    }

    const heldElsewhere = reservedInOtherTabs[productId] || 0;
    updateTab((t) => {
      if (nextQty <= 0) {
        const filteredCart = t.cart.filter(
          (item) => item.product.id !== productId
        );
        return {
          ...t,
          cart: filteredCart,
          status: filteredCart.length === 0 ? 'billing' : t.status,
          pendingPaymentMethod:
            filteredCart.length === 0 ? null : t.pendingPaymentMethod,
        };
      }
      return {
        ...t,
        cart: t.cart.map((item) => {
          if (item.product.id !== productId) return item;
          const maxForTab = Math.max(
            1,
            item.product.stockQuantity - heldElsewhere
          );
          const clamped = Math.min(nextQty, maxForTab);
          return { ...item, quantity: clamped };
        }),
      };
    });
  };

  const processScannedBarcode = (rawCode: string) => {
    const cleanCode = rawCode.trim();
    if (!cleanCode) return;

    const matched = findProductByBarcodeOrSku(
      shopProducts,
      shop.id,
      business.id,
      cleanCode
    );

    if (!matched) {
      playPosBeep('error');
      setBarcodeFeedback({
        type: 'error',
        message: `No product matching barcode or SKU "${cleanCode}" found in ${shop.code}. Please ensure the item is active in Inventory.`,
      });
      return;
    }

    const heldElsewhere = reservedInOtherTabs[matched.id] || 0;
    const availableStock = matched.stockQuantity - heldElsewhere;

    if (availableStock <= 0) {
      playPosBeep('error');
      setBarcodeFeedback({
        type: 'error',
        message: `"${matched.name}" has no remaining available stock (${heldElsewhere} held in another open tab).`,
      });
      return;
    }

    handleAddToCart(matched);
    playPosBeep('success');
    setBarcodeFeedback({
      type: 'success',
      message: `Scanned & Added 1x ${matched.name} (${matched.sku}) to ${activeTab.label}.`,
    });
    setBarcodeInput('');
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    processScannedBarcode(barcodeInput);
  };

  // Global hardware barcode scanner gun listener (USB / Bluetooth HID keyboard emulation)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // If payment modal or dialog is open, do not intercept
      if (
        activePaymentModal ||
        showAddCustomerModal ||
        posReturnModalOpen ||
        cameraScannerOpen ||
        completedReceipt
      ) {
        return;
      }

      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      // If user is focused in the dedicated barcode input, form onSubmit handles Enter
      if (target?.id === 'pos-barcode-input') {
        return;
      }

      // Handle Enter keypress from scanner gun
      if (e.key === 'Enter') {
        // If cursor was in product search box and scanner pressed Enter
        if (target?.id === 'pos-product-search') {
          const query = searchQuery.trim();
          if (query.length >= 3) {
            const matched = findProductByBarcodeOrSku(
              shopProducts,
              shop.id,
              business.id,
              query
            );
            if (matched) {
              e.preventDefault();
              e.stopPropagation();
              setSearchQuery('');
              processScannedBarcode(query);
              return;
            }
          }
        }

        // Buffer accumulated from scanner gun while cursor was outside text fields
        const buffer = scannerBufferRef.current.trim();
        scannerBufferRef.current = '';
        if (buffer.length >= 3) {
          e.preventDefault();
          e.stopPropagation();
          processScannedBarcode(buffer);
          return;
        }
      }

      // If inside an input (like search, customer name, notes) and not an Enter key, allow normal typing
      if (isInput) {
        return;
      }

      // Reset buffer if delay between keystrokes exceeds 140ms (typical human typing cadence)
      const now = Date.now();
      if (now - lastKeyTimeRef.current > 140) {
        scannerBufferRef.current = '';
      }
      lastKeyTimeRef.current = now;

      // Accumulate single printable characters
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        scannerBufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, [
    activePaymentModal,
    showAddCustomerModal,
    posReturnModalOpen,
    cameraScannerOpen,
    completedReceipt,
    searchQuery,
    shopProducts,
    shop.id,
    business.id,
    activeTab.label,
    reservedInOtherTabs,
  ]);

  const openPaymentConfirmation = (method: PaymentMethod) => {
    if (cart.length === 0) return;
    const nextTendered =
      activeTab.pendingPaymentMethod === method && activeTab.amountTenderedInput
        ? activeTab.amountTenderedInput
        : totals.totalAmount.toFixed(2);
    const nextRef =
      method === 'cash'
        ? ''
        : activeTab.pendingPaymentMethod === method &&
          activeTab.paymentReference
        ? activeTab.paymentReference
        : `REF-${method.toUpperCase().slice(0, 3)}-${Math.floor(
            100000 + Math.random() * 900000
          )}`;

    updateTab((t) => ({
      ...t,
      status: 'awaiting_payment',
      pendingPaymentMethod: method,
      amountTenderedInput: nextTendered,
      paymentReference: nextRef,
    }));
    setActivePaymentModal(method);
  };

  const handleConfirmDemoSale = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePaymentModal || cart.length === 0) return;

    const tendered = Math.max(
      totals.totalAmount,
      parseFloat(amountTenderedInput) || totals.totalAmount
    );

    const newReceipt = onCompleteDemoSale(
      cart,
      activePaymentModal,
      totals.discountAmount,
      totals.taxAmount,
      totals.totalAmount,
      tendered,
      paymentReference
    );

    setCompletedReceipt(newReceipt);
    setReceiptPrintFeedback(null);
    const printerSettings = getShopPrinterSettings(shop);
    if (printerSettings.autoPrintOnSale) {
      void handlePrintCompletedReceipt(newReceipt);
    }
    setActivePaymentModal(null);

    if (tabs.length > 1) {
      // Remove completed tab and switch to the remaining customer tab automatically
      const nextState = closePosCustomerTab(tabs, activeTab.id, activeTab.id);
      setTabs(nextState.tabs);
      setActiveTabId(nextState.activeTabId);
    } else {
      // Reset the single open tab for the next customer
      updateTab((t) => ({
        ...t,
        customerNote: '',
        cart: [],
        discountInput: '0',
        status: 'billing',
        pendingPaymentMethod: null,
        amountTenderedInput: '',
        paymentReference: '',
      }));
    }
  };

  const renderPosReturnModal = () => {
    if (!hasPermission(currentUser, 'process_returns')) {
      return (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="POS Receipt Return Access Restricted"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Return Access Restricted</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Cashiers are not authorized to process receipt or product returns. Please contact a Shop Manager or Business Owner.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPosReturnModalOpen(false)}
              className="w-full py-2 px-4 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      );
    }

    const activePosReturnSale = posSelectedReturnReceiptId
      ? shopSales.find((s) => s.id === posSelectedReturnReceiptId) ||
        findReceiptByNumber(shopSales, posReturnReceiptQuery)
      : findReceiptByNumber(shopSales, posReturnReceiptQuery);
    const matchingPosReceipts = findMatchingReceipts(
      shopSales,
      posReturnReceiptQuery
    );
    const posReturnCalc = activePosReturnSale
      ? calculateReceiptReturnResult(
          activePosReturnSale,
          posReturnEditedQuantities
        )
      : null;

    const selectPosReceipt = (sale: SaleTransaction) => {
      setPosReturnReceiptQuery(sale.receiptNumber);
      setPosSelectedReturnReceiptId(sale.id);
      const initMap: Record<string, number> = {};
      sale.items.forEach((l) => {
        initMap[l.id] = l.quantity;
      });
      setPosReturnEditedQuantities(initMap);
      setPosReturnBanner(null);
    };

    const handlePosReturnReceiptInputChange = (val: string) => {
      setPosReturnReceiptQuery(val);
      setPosReturnBanner(null);
      const found = findReceiptByNumber(shopSales, val);
      if (found) {
        setPosSelectedReturnReceiptId(found.id);
        const initMap: Record<string, number> = {};
        found.items.forEach((l) => {
          initMap[l.id] = l.quantity;
        });
        setPosReturnEditedQuantities(initMap);
      } else {
        setPosSelectedReturnReceiptId(null);
        setPosReturnEditedQuantities({});
      }
    };

    const handleUpdatePosReturnLineQty = (
      lineId: string,
      qty: number,
      max: number
    ) => {
      const clamped = Math.max(0, Math.min(qty, max));
      setPosReturnEditedQuantities((prev) => ({
        ...prev,
        [lineId]: clamped,
      }));
    };

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="POS Receipt Return"
        className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
      >
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-xs">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-purple-50/70">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-purple-600 text-white shadow-xs">
                <RotateCcw className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-display font-bold text-purple-950">
                  Return by Receipt — {shop.name}
                </h3>
                <p className="text-[11px] text-purple-800">
                  Input receipt number to automatically call up items and reduce returned quantities
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPosReturnModalOpen(false)}
              aria-label="Close return modal"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 overflow-y-auto space-y-4 flex-1">
            {posReturnBanner && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{posReturnBanner}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="pos-return-receipt-input"
                className="block font-semibold text-slate-700"
              >
                1. Search or Input Sale Receipt Number
              </label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  id="pos-return-receipt-input"
                  type="text"
                  value={posReturnReceiptQuery}
                  onChange={(e) =>
                    handlePosReturnReceiptInputChange(e.target.value)
                  }
                  placeholder="e.g. REC-20261021-0001"
                  className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 font-mono text-xs focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                />
              </div>

              {matchingPosReceipts.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {matchingPosReceipts.slice(0, 5).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectPosReceipt(s)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono cursor-pointer ${
                        activePosReturnSale?.id === s.id
                          ? 'bg-purple-600 text-white border-purple-600 font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-purple-50'
                      }`}
                    >
                      {s.receiptNumber} ({formatCurrency(s.totalAmount, symbol)})
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!activePosReturnSale ? (
              <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl space-y-1">
                <p className="font-semibold text-slate-600">No Receipt Selected</p>
                <p className="text-[11px]">Enter a valid receipt number above to pull up sale line items.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-purple-50/50 border border-purple-100 rounded-xl flex items-center justify-between text-slate-700">
                  <div>
                    <span className="font-mono font-bold text-purple-900">
                      {activePosReturnSale.receiptNumber}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      Cashier: {activePosReturnSale.cashierName} · Date: {activePosReturnSale.createdAt}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-slate-900">
                      {formatCurrency(activePosReturnSale.totalAmount, symbol)}
                    </span>
                    <span className="block text-[11px] text-slate-500 uppercase">
                      {activePosReturnSale.paymentMethod}
                    </span>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                        <th className="py-2 px-3">Item Name</th>
                        <th className="py-2 px-3 text-right">Sold Qty</th>
                        <th className="py-2 px-3 text-center">Return Qty</th>
                        <th className="py-2 px-3 text-right">Refund Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activePosReturnSale.items.map((line) => {
                        const currentQty =
                          posReturnEditedQuantities[line.id] !== undefined
                            ? posReturnEditedQuantities[line.id]
                            : line.quantity;
                        const retQty = line.quantity - currentQty;
                        const lineRefund = retQty * line.unitPrice;

                        return (
                          <tr key={line.id} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3">
                              <p className="font-medium text-slate-900">{line.productName}</p>
                              <p className="font-mono text-[10px] text-slate-400">{line.sku}</p>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                              {line.quantity}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdatePosReturnLineQty(
                                      line.id,
                                      currentQty - 1,
                                      line.quantity
                                    )
                                  }
                                  className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold"
                                >
                                  −
                                </button>
                                <span className="w-8 text-center font-mono font-bold">
                                  {currentQty}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdatePosReturnLineQty(
                                      line.id,
                                      currentQty + 1,
                                      line.quantity
                                    )
                                  }
                                  className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-purple-700">
                              {formatCurrency(lineRefund, symbol)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-1">
                  <label htmlFor="pos-return-reason" className="block font-semibold text-slate-700">
                    Return Reason / Audit Note
                  </label>
                  <input
                    id="pos-return-reason"
                    type="text"
                    value={posReturnReason}
                    onChange={(e) => setPosReturnReason(e.target.value)}
                    placeholder="Reason for return..."
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            {posReturnCalc ? (
              <div className="text-xs space-y-0.5">
                <div>
                  <span className="text-slate-500">Returning Units: </span>
                  <strong className="text-purple-700">+{posReturnCalc.totalReturnedUnits} unit(s)</strong>
                </div>
                <div>
                  <span className="text-slate-500">Total Refund: </span>
                  <strong className="text-rose-700">{formatCurrency(posReturnCalc.totalRefundAmount, symbol)}</strong>
                </div>
              </div>
            ) : (
              <div />
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPosReturnModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 font-semibold text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
              <button
                type="button"
                disabled={!posReturnCalc || posReturnCalc.totalReturnedUnits <= 0}
                onClick={() => {
                  if (!activePosReturnSale || !posReturnCalc) return;
                  if (onProcessReceiptReturn) {
                    onProcessReceiptReturn(
                      activePosReturnSale.id,
                      posReturnEditedQuantities,
                      posReturnReason
                    );
                  }
                  const nextMap: Record<string, number> = {};
                  posReturnCalc.updatedSale.items.forEach((l) => {
                    nextMap[l.id] = l.quantity;
                  });
                  setPosReturnEditedQuantities(nextMap);
                  setPosReturnBanner(
                    `Processed return on Receipt #${activePosReturnSale.receiptNumber}: Returned +${posReturnCalc.totalReturnedUnits} unit(s) to inventory and reduced receipt by ${formatCurrency(posReturnCalc.totalRefundAmount, symbol)}.`
                  );
                }}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Confirm Return (+{posReturnCalc?.totalReturnedUnits ?? 0} Units)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTableTabModal = () => {
    const quickTablePresets = [
      'Table 1',
      'Table 2',
      'Table 3',
      'Table 4',
      'Table 5',
      'Table 6',
      'VIP 1',
      'VIP 2',
      'Bar Counter',
      'Poolside',
    ];

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="table-tab-modal-title"
        className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      >
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                <Wine className="w-5 h-5" />
              </div>
              <div>
                <h3 id="table-tab-modal-title" className="text-base font-bold text-white">
                  Open New Table Tab
                </h3>
                <p className="text-xs text-indigo-200 mt-0.5">
                  Track table orders, serve drinks, &amp; bill when done
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTableModalOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleCreateTableTab} className="p-5 space-y-4">
            {/* Quick table presets */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Quick Select Table / Section:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {quickTablePresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() =>
                      setTableForm((prev) => ({
                        ...prev,
                        tableIdentifier: preset,
                      }))
                    }
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                      tableForm.tableIdentifier === preset
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-indigo-50 hover:text-indigo-900'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Table Identifier */}
            <div>
              <label
                htmlFor="table-ident-input"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Table Name / Number <span className="text-rose-500">*</span>
              </label>
              <input
                id="table-ident-input"
                type="text"
                required
                value={tableForm.tableIdentifier}
                onChange={(e) =>
                  setTableForm((prev) => ({
                    ...prev,
                    tableIdentifier: e.target.value,
                  }))
                }
                placeholder="e.g. Table 4, VIP 2, Balcony 1"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Waiter / Server Name & Guest Count */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="server-name-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Server / Waiter
                </label>
                <input
                  id="server-name-input"
                  type="text"
                  value={tableForm.serverName}
                  onChange={(e) =>
                    setTableForm((prev) => ({
                      ...prev,
                      serverName: e.target.value,
                    }))
                  }
                  placeholder="Staff name"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label
                  htmlFor="guest-count-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Guest Count
                </label>
                <input
                  id="guest-count-input"
                  type="number"
                  min="1"
                  max="100"
                  value={tableForm.guestCount}
                  onChange={(e) =>
                    setTableForm((prev) => ({
                      ...prev,
                      guestCount: e.target.value,
                    }))
                  }
                  placeholder="e.g. 4"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Optional Customer Tag / Note */}
            <div>
              <label
                htmlFor="table-note-input"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Special Note / Guest Identifier (Optional)
              </label>
              <input
                id="table-note-input"
                type="text"
                value={tableForm.customerNote}
                onChange={(e) =>
                  setTableForm((prev) => ({
                    ...prev,
                    customerNote: e.target.value,
                  }))
                }
                placeholder="e.g. Celebrating birthday, Regular customer"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setTableModalOpen(false)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Wine className="w-3.5 h-3.5" />
                <span>Open Table Tab</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderVoidItemModal = () => {
    if (!voidModal.open || !voidModal.item) return null;
    const item = voidModal.item;
    const dispatched = item.dispatchedQuantity || 0;

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="void-modal-title"
        className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      >
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="p-5 bg-gradient-to-r from-rose-900 via-rose-950 to-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-400/30 flex items-center justify-center text-rose-300">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 id="void-modal-title" className="text-base font-bold text-white">
                  Void Dispatched Item
                </h3>
                <p className="text-xs text-rose-200 mt-0.5">
                  Restores returned drink/item back to inventory
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                setVoidModal({
                  open: false,
                  item: null,
                  voidQuantity: 1,
                  reason: '',
                })
              }
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-900">
                    {item.product.name}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {formatCurrency(item.product.sellingPrice, symbol)} each
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900">
                    {dispatched} Dispatched
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="void-qty-input"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Quantity to Void &amp; Return to Inventory:
              </label>
              <input
                id="void-qty-input"
                type="number"
                min="1"
                max={dispatched}
                value={voidModal.voidQuantity}
                onChange={(e) =>
                  setVoidModal((prev) => ({
                    ...prev,
                    voidQuantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                  }))
                }
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Max voidable: {dispatched} unit(s)
              </p>
            </div>

            <div>
              <label
                htmlFor="void-reason-select"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Reason for Void / Return:
              </label>
              <select
                id="void-reason-select"
                value={voidModal.reason}
                onChange={(e) =>
                  setVoidModal((prev) => ({
                    ...prev,
                    reason: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="Customer cancelled before bottle opened">
                  Customer cancelled before bottle opened
                </option>
                <option value="Defective or warm drink replaced">
                  Defective or warm drink replaced
                </option>
                <option value="Order entry mistake by staff">
                  Order entry mistake by staff
                </option>
                <option value="Customer changed drink preference">
                  Customer changed drink preference
                </option>
              </select>
            </div>

            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
              <span className="font-bold">⚠️ Inventory Guarantee:</span> Confirmed voided items are automatically restored to {shop.name}&apos;s available shelf inventory.
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() =>
                  setVoidModal({
                    open: false,
                    item: null,
                    voidQuantity: 1,
                    reason: '',
                  })
                }
                className="px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmVoidItem}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Confirm Void &amp; Return Stock</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const awaitingPaymentCount = tabs.filter(
    (t) => t.status === 'awaiting_payment' && t.cart.length > 0
  ).length;

  return (
    <div className="p-3 sm:p-4 lg:p-6 max-w-[1440px] mx-auto space-y-3 sm:space-y-4 pb-24 lg:pb-6">
      {/* Multi-Customer POS Session Tabs Bar */}
      <section
        aria-label="Customer Sale Tabs"
        className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2.5"
      >
        {/* Top Row: Session Summary & Always-Visible + New Tab / Hold Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
            <Users className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            <span className="font-semibold text-slate-900 whitespace-nowrap">
              Customer Checkout Tabs
            </span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="font-mono tabular-nums font-medium text-slate-700 whitespace-nowrap">
              {tabs.length} open
            </span>
            {awaitingPaymentCount > 0 && (
              <>
                <span aria-hidden="true" className="text-slate-300">
                  ·
                </span>
                <span className="text-amber-800 font-semibold whitespace-nowrap">
                  {awaitingPaymentCount} awaiting payment
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => handleHoldAndAttendNextCustomer()}
                className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <UserPlus className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span>Hold &amp; Next Customer</span>
              </button>
            )}

            {hasPermission(currentUser, 'process_returns') && (
              <button
                type="button"
                onClick={() => {
                  setPosReturnBanner(null);
                  setPosReturnModalOpen(true);
                }}
                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>Return</span>
              </button>
            )}

            {isTableTabsEnabled && (
              <button
                type="button"
                onClick={handleOpenNewTableModal}
                aria-label="Open new table tab"
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-2xs"
              >
                <Wine className="w-3.5 h-3.5 shrink-0" />
                <span>+ New Table Tab</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleOpenNewTab}
              aria-label="Open new customer tab"
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>{isTableTabsEnabled ? 'Quick Tab' : 'New Customer Tab'}</span>
            </button>
          </div>
        </div>

        {/* Bottom Row: Interactive Customer Tabs Strip + Inline (+) Button */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
          <div
            role="tablist"
            aria-label="Active customer checkout tabs"
            className="flex items-center gap-2"
          >
            {tabs.map((tab) => {
              const isSelected = tab.id === activeTab.id;
              const tabDiscount = Math.max(
                0,
                parseFloat(tab.discountInput) || 0
              );
              const tabTotals = calculateCartTotals(
                tab.cart,
                tabDiscount,
                tab.discountMode,
                shop.taxRatePercent
              );
              const isAwaitingPayment =
                tab.status === 'awaiting_payment' && tab.cart.length > 0;

              return (
                <div
                  key={tab.id}
                  className={`group flex items-center rounded-lg border transition-colors shrink-0 ${
                    isSelected
                      ? isAwaitingPayment
                        ? 'bg-amber-950 text-white border-amber-800'
                        : 'bg-slate-900 text-white border-slate-900'
                      : isAwaitingPayment
                      ? 'bg-amber-50/90 text-amber-950 border-amber-300 hover:bg-amber-100/80'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => handleSelectTab(tab.id)}
                    className="px-3 py-2 text-left flex items-center gap-2.5 cursor-pointer whitespace-nowrap"
                  >
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        {tab.isTableTab || tab.tableIdentifier ? (
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isSelected
                                ? 'bg-indigo-500/30 text-indigo-200 border border-indigo-400/30'
                                : 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                            }`}
                          >
                            <Wine className="w-2.5 h-2.5" />
                            {tab.tableIdentifier || tab.label}
                          </span>
                        ) : (
                          <span className="text-xs font-display font-bold">
                            {tab.label}
                          </span>
                        )}
                        {tab.serverName && (
                          <span
                            className={`text-[10px] ${
                              isSelected ? 'text-indigo-200' : 'text-slate-500'
                            }`}
                          >
                            · Waiter: {tab.serverName}
                          </span>
                        )}
                        {tab.customerNote.trim() && (
                          <span
                            className={`text-xs truncate max-w-[110px] ${
                              isSelected ? 'text-slate-300' : 'text-slate-500'
                            }`}
                          >
                            · {tab.customerNote.trim()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums mt-0.5">
                        {tab.cart.length === 0 ? (
                          <span
                            className={
                              isSelected ? 'text-slate-300' : 'text-slate-400'
                            }
                          >
                            Empty Bill
                          </span>
                        ) : (
                          <>
                            <span
                              className={
                                isSelected
                                  ? 'text-emerald-300 font-semibold'
                                  : 'text-slate-700 font-semibold'
                              }
                            >
                              {formatCurrency(tabTotals.totalAmount, symbol)}
                            </span>
                            <span
                              className={
                                isSelected ? 'text-slate-400' : 'text-slate-400'
                              }
                            >
                              ·
                            </span>
                            <span
                              className={
                                isSelected ? 'text-slate-300' : 'text-slate-500'
                              }
                            >
                              {tabTotals.itemCount}{' '}
                              {tabTotals.itemCount === 1 ? 'item' : 'items'}
                            </span>
                          </>
                        )}
                        {isAwaitingPayment && (
                          <>
                            <span
                              className={
                                isSelected ? 'text-amber-300' : 'text-amber-700'
                              }
                            >
                              ·
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 font-sans font-semibold ${
                                isSelected ? 'text-amber-300' : 'text-amber-800'
                              }`}
                            >
                              <Clock className="w-3 h-3" />
                              Awaiting Payment
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>

                  {tabs.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => handleCloseTab(tab.id, e)}
                      aria-label={`Close ${tab.label}`}
                      title={`Close ${tab.label}`}
                      className={`mr-2 p-1 rounded-md transition-colors cursor-pointer ${
                        isSelected
                          ? 'text-slate-400 hover:text-white hover:bg-slate-800'
                          : 'text-slate-400 hover:text-red-600 hover:bg-slate-200/70'
                      }`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quick + Icon Button directly adjacent to open tabs */}
          <button
            type="button"
            onClick={handleOpenNewTab}
            title="Open additional customer tab (+)"
            aria-label="Add another customer tab"
            className="px-3 py-2 rounded-lg border border-dashed border-emerald-600 bg-emerald-50/60 hover:bg-emerald-100/80 text-emerald-800 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0 self-stretch"
          >
            <Plus className="w-4 h-4 text-emerald-700" />
            <span>Add Tab</span>
          </button>
        </div>
      </section>

      {/* Mobile & Tablet Mode Switcher (Visible on < lg) */}
      <div className="lg:hidden flex items-center bg-slate-200/90 p-1 rounded-xl gap-1 shadow-2xs">
        <button
          type="button"
          onClick={() => setMobileActivePanel('catalogue')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[44px] ${
            mobileActivePanel === 'catalogue'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <LayoutGrid className="w-4 h-4 text-emerald-700" />
          <span>Catalogue ({filteredProducts.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileActivePanel('cart')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[44px] ${
            mobileActivePanel === 'cart'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          <span>
            {activeTab.label} ({totals.itemCount}) · {formatCurrency(totals.totalAmount, symbol)}
          </span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Columns: Catalogue Search, Barcode Input, Category Filters & Product Grid */}
        <div
          className={`lg:col-span-7 xl:col-span-8 space-y-4 ${
            mobileActivePanel === 'catalogue' ? 'block' : 'hidden lg:block'
          }`}
        >
          {/* Search & Barcode Scanner Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Product Search */}
              <div className="md:col-span-6 relative">
                <label htmlFor="pos-product-search" className="sr-only">
                  Search shop products
                </label>
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="pos-product-search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search ${shop.code} products by name, SKU, or category...`}
                  className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-600"
                />
              </div>

              {/* Dedicated Barcode Input Area */}
              <form
                onSubmit={handleBarcodeSubmit}
                className="md:col-span-6 flex items-center gap-2"
              >
                <div className="relative flex-1">
                  <label htmlFor="pos-barcode-input" className="sr-only">
                    Scan or enter barcode
                  </label>
                  <Barcode className="w-4 h-4 text-emerald-700 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="pos-barcode-input"
                    type="text"
                    value={barcodeInput}
                    onChange={(e) => {
                      setBarcodeInput(e.target.value);
                      if (barcodeFeedback) setBarcodeFeedback(null);
                    }}
                    placeholder={`Scan Barcode / SKU into ${activeTab.label}`}
                    className="w-full pl-10 pr-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-600"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Scan Add
                </button>
                <button
                  type="button"
                  onClick={() => setCameraScannerOpen(true)}
                  title="Open Camera Scanner (Mobile / Laptop Webcam)"
                  aria-label="Open Camera Barcode Scanner"
                  className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Camera</span>
                </button>
              </form>
            </div>

            {/* Quick Barcode Trigger Strip & Feedback */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
              <div className="flex flex-wrap items-center gap-1.5 text-slate-500">
                <span>Quick Barcodes ({shop.code}):</span>
                {shopProducts.slice(0, 3).map((prod) => (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => {
                      processScannedBarcode(prod.barcode);
                    }}
                    className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 transition-colors cursor-pointer"
                  >
                    {prod.barcode}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  aria-label="Grid view"
                  className={`p-1.5 rounded-md ${
                    viewMode === 'grid'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  aria-label="List view"
                  className={`p-1.5 rounded-md ${
                    viewMode === 'list'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {barcodeFeedback && (
              <div
                className={`px-3 py-2 rounded-lg text-xs flex items-center justify-between ${
                  barcodeFeedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                <span>{barcodeFeedback.message}</span>
                <button
                  type="button"
                  onClick={() => setBarcodeFeedback(null)}
                  aria-label="Dismiss barcode message"
                  className="text-xs underline ml-2"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Category Filter Tabs */}
            <div
              role="tablist"
              aria-label="Product category filters"
              className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={selectedCategoryId === 'all'}
                onClick={() => setSelectedCategoryId('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedCategoryId === 'all'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                All Categories ({shopProducts.length})
              </button>
              {shopCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedCategoryId === cat.id}
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    selectedCategoryId === cat.id
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Product Catalogue Grid / Table */}
          {filteredProducts.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
              <p className="text-sm font-semibold text-slate-800">
                No matching products in {shop.name}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Products are strictly isolated to {shop.code}. Try clearing the search filter or switching category.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategoryId('all');
                }}
                className="mt-4 px-3.5 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg"
              >
                Reset Filters
              </button>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {filteredProducts.map((product) => {
                const inCartQty =
                  cart.find((c) => c.product.id === product.id)?.quantity ?? 0;
                const heldInOtherTabsQty = reservedInOtherTabs[product.id] ?? 0;
                const remainingForTab = Math.max(
                  0,
                  product.stockQuantity - heldInOtherTabsQty
                );
                const isLowStock = product.stockQuantity <= product.reorderLevel;

                return (
                  <div
                    key={product.id}
                    className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col justify-between hover:border-emerald-600/60 transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                        <span className="font-mono whitespace-nowrap">
                          {product.sku}
                        </span>
                        <span
                          className={`font-mono tabular-nums font-medium whitespace-nowrap ${
                            isLowStock ? 'text-amber-700' : 'text-slate-600'
                          }`}
                        >
                          Stock: {product.stockQuantity} {product.unit}s
                        </span>
                      </div>

                      <h3 className="text-sm font-display font-bold text-slate-900 mt-1.5 line-clamp-2">
                        {product.name}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        {product.categoryName} · Barcode: {product.barcode}
                        {heldInOtherTabsQty > 0 && (
                          <span className="text-amber-700 font-medium">
                            {' '}
                            · {heldInOtherTabsQty} held in other tab
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-base font-display font-bold font-mono tabular-nums text-slate-900">
                          {formatCurrency(product.sellingPrice, symbol)}
                        </p>
                        {product.taxExempt && (
                          <span className="text-xs text-emerald-700">
                            Tax Exempt
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={
                          remainingForTab <= 0 || inCartQty >= remainingForTab
                        }
                        onClick={() => handleAddToCart(product)}
                        aria-label={`Add ${product.name} to cart`}
                        className="px-3.5 py-2 min-h-[44px] rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                    <th className="py-2.5 px-4 font-medium">SKU / Barcode</th>
                    <th className="py-2.5 px-4 font-medium">Product Name</th>
                    <th className="py-2.5 px-4 font-medium text-right">Stock</th>
                    <th className="py-2.5 px-4 font-medium text-right">Price</th>
                    <th className="py-2.5 px-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredProducts.map((product) => {
                    const heldInOtherTabsQty =
                      reservedInOtherTabs[product.id] ?? 0;
                    const remainingForTab = Math.max(
                      0,
                      product.stockQuantity - heldInOtherTabsQty
                    );
                    const inCartQty =
                      cart.find((c) => c.product.id === product.id)?.quantity ??
                      0;
                    return (
                      <tr key={product.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 font-mono text-slate-600">
                          {product.sku}
                          <div className="text-slate-400">{product.barcode}</div>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {product.name}
                          <div className="font-normal text-slate-500">
                            {product.categoryName}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-700">
                          {product.stockQuantity} {product.unit}s
                          {heldInOtherTabsQty > 0 && (
                            <div className="text-amber-700">
                              {heldInOtherTabsQty} held in other tab
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums font-bold text-slate-900 text-right">
                          {formatCurrency(product.sellingPrice, symbol)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            disabled={
                              remainingForTab <= 0 ||
                              inCartQty >= remainingForTab
                            }
                            onClick={() => handleAddToCart(product)}
                            aria-label={`Add ${product.name} to cart`}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold cursor-pointer"
                          >
                            + Add
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right 5 Columns: Shopping Cart Panel, Totals & Payment Actions */}
        <aside
          aria-label="Shopping Cart and Checkout Panel"
          className={`lg:col-span-5 xl:col-span-4 bg-white rounded-xl border border-slate-200 overflow-hidden ${
            mobileActivePanel === 'cart' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'
          }`}
        >
          {/* Cart Header */}
          <div className="p-4 border-b border-slate-100 space-y-2.5 bg-slate-900 text-white">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileActivePanel('catalogue')}
                  aria-label="Back to Products Catalogue"
                  className="lg:hidden p-2 rounded-md bg-slate-800 hover:bg-slate-700 text-white shrink-0 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <ArrowLeft className="w-4 h-4 text-emerald-400" />
                </button>
                <ShoppingCart className="w-4 h-4 text-emerald-400 shrink-0 hidden lg:block" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-display font-bold truncate">
                      {activeTab.label} ({shop.code})
                    </h2>
                    {activeTab.status === 'awaiting_payment' &&
                      cart.length > 0 && (
                        <span className="text-[11px] font-medium text-amber-300 whitespace-nowrap">
                          · Awaiting Payment
                        </span>
                      )}
                  </div>
                  <p className="text-xs text-slate-400 truncate">
                    Cashier: {currentUser.fullName} · {totals.itemCount} items
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleOpenNewTab}
                  title="Open another customer tab (+)"
                  className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap min-h-[36px]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Tab</span>
                </button>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const hasDispatched = cart.some(
                        (i) => (i.dispatchedQuantity || 0) > 0
                      );
                      if (hasDispatched) {
                        alert(
                          'Cannot clear cart with already dispatched items. Please void individual dispatched items to safely return stock to inventory.'
                        );
                        return;
                      }
                      updateTab((t) => ({
                        ...t,
                        cart: [],
                        status: 'billing',
                        pendingPaymentMethod: null,
                      }));
                    }}
                    className="text-xs text-slate-300 hover:text-white underline cursor-pointer whitespace-nowrap"
                  >
                    Clear Cart
                  </button>
                )}
              </div>
            </div>

            {/* Tab Feedback Banner */}
            {tabFeedback && (
              <div
                className={`mt-2 p-2.5 rounded-lg text-xs flex items-center justify-between gap-2 ${
                  tabFeedback.type === 'success'
                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-500/20 border border-rose-500/40 text-rose-200'
                }`}
              >
                <span>{tabFeedback.message}</span>
                <button
                  type="button"
                  onClick={() => setTabFeedback(null)}
                  className="text-slate-300 hover:text-white font-bold"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Table Details Badge Banner if Table Tab */}
            {(activeTab.isTableTab || activeTab.tableIdentifier) && (
              <div className="mt-2.5 p-2 rounded-lg bg-indigo-950/60 border border-indigo-700/50 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <Wine className="w-3.5 h-3.5 text-indigo-400" />
                    {activeTab.tableIdentifier || activeTab.label}
                  </span>
                  {activeTab.serverName && (
                    <span className="text-indigo-200 text-[11px]">
                      · Server:{' '}
                      <span className="font-semibold text-white">
                        {activeTab.serverName}
                      </span>
                    </span>
                  )}
                  {activeTab.guestCount && (
                    <span className="text-indigo-200 text-[11px]">
                      · {activeTab.guestCount} Guests
                    </span>
                  )}
                </div>
                {activeTab.lastDispatchedAt && (
                  <span className="text-[10px] text-indigo-300">
                    Last dispatch:{' '}
                    {new Date(activeTab.lastDispatchedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </div>
            )}

            {/* Optional Customer Name / Note Input for this Tab */}
            <div className="flex items-center gap-2 pt-1">
              <label htmlFor="pos-customer-note" className="sr-only">
                Customer Name or Note for {activeTab.label}
              </label>
              <input
                id="pos-customer-note"
                type="text"
                value={activeTab.customerNote}
                onChange={(e) =>
                  updateTab((t) => ({ ...t, customerNote: e.target.value }))
                }
                placeholder={`Optional customer tag for ${activeTab.label} (e.g. Mrs. Ade, Blue Shirt)...`}
                className="w-full px-2.5 py-1.5 text-xs bg-slate-800/90 border border-slate-700 rounded-md text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-400"
              />
            </div>
          </div>

          {/* Dispatch to Table Banner (Option 1: Immediate Stock Deduction) */}
          {isTableTabsEnabled && dispatchAnalysis.hasUndispatchedItems && (
            <div className="px-4 py-2.5 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-indigo-200 flex items-center justify-between gap-2">
              <div className="text-xs text-indigo-950">
                <div className="flex items-center gap-1.5 font-bold">
                  <Wine className="w-4 h-4 text-indigo-700 shrink-0" />
                  <span>
                    {dispatchAnalysis.pendingDispatchCount} undispatched item(s)
                  </span>
                </div>
                <p className="text-[11px] text-indigo-700 mt-0.5">
                  Send to table now to deduct physical stock from bar shelf/fridge.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDispatchActiveTab}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Dispatch to Table</span>
              </button>
            </div>
          )}

          {/* Resume Pending Payment Banner when Tab is Awaiting Payment */}
          {activeTab.status === 'awaiting_payment' && cart.length > 0 && (
            <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-2">
              <div className="text-xs text-amber-950">
                <span className="font-semibold">Payment in progress:</span>{' '}
                <span className="uppercase font-mono">
                  {(activeTab.pendingPaymentMethod || 'bank_transfer').replace(
                    '_',
                    ' '
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    openPaymentConfirmation(
                      activeTab.pendingPaymentMethod || 'bank_transfer'
                    )
                  }
                  className="px-2.5 py-1 rounded-md bg-amber-900 hover:bg-amber-800 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  Complete Payment
                </button>
              </div>
            </div>
          )}

          {/* Cart Items List */}
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm font-semibold text-slate-700">
                  {activeTab.label} Cart is Empty
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Click any product card on the left or scan a barcode to bill {activeTab.label}.
                </p>
              </div>
            ) : (
              cart.map((item) => {
                const lineTotal = item.product.sellingPrice * item.quantity;
                const dispatched = item.dispatchedQuantity || 0;
                const pending = Math.max(0, item.quantity - dispatched);

                return (
                  <div
                    key={item.product.id}
                    className="p-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        {item.product.name}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                        <span>
                          {formatCurrency(item.product.sellingPrice, symbol)} ×{' '}
                          {item.quantity} {item.product.unit}
                        </span>
                        {isTableTabsEnabled && dispatched > 0 && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-sans font-bold bg-emerald-100 text-emerald-800">
                            ✓ {dispatched} Dispatched
                          </span>
                        )}
                        {isTableTabsEnabled && pending > 0 && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-sans font-semibold bg-amber-100 text-amber-800">
                            ⏳ {pending} Pending
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quantity & Void Controls */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateQuantity(
                            item.product.id,
                            item.quantity - 1
                          )
                        }
                        aria-label={`Decrease quantity of ${item.product.name}`}
                        className="w-7 h-7 rounded-md border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-700 cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-7 text-center text-xs font-mono tabular-nums font-bold text-slate-900">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateQuantity(
                            item.product.id,
                            item.quantity + 1
                          )
                        }
                        aria-label={`Increase quantity of ${item.product.name}`}
                        className="w-7 h-7 rounded-md border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-700 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>

                      {dispatched > 0 ? (
                        <button
                          type="button"
                          onClick={() => handleOpenVoidModal(item)}
                          title={`Void dispatched ${item.product.name} & return stock`}
                          className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold border border-rose-200 cursor-pointer"
                        >
                          Void
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(item.product.id, 0)}
                          aria-label={`Remove ${item.product.name} from cart`}
                          className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="w-24 text-right font-mono tabular-nums text-xs font-bold text-slate-900 shrink-0">
                      {formatCurrency(lineTotal, symbol)}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Discount, Subtotal, Tax & Total Area */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
            {/* Discount Controls */}
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="pos-discount-input"
                className="text-xs font-medium text-slate-600"
              >
                Discount:
              </label>
              <div className="flex items-center gap-1.5">
                <div className="flex rounded-md border border-slate-200 bg-white p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      updateTab((t) => ({ ...t, discountMode: 'percent' }))
                    }
                    className={`px-2 py-0.5 rounded font-medium ${
                      discountMode === 'percent'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600'
                    }`}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateTab((t) => ({ ...t, discountMode: 'fixed' }))
                    }
                    className={`px-2 py-0.5 rounded font-medium ${
                      discountMode === 'fixed'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600'
                    }`}
                  >
                    {symbol}
                  </button>
                </div>
                <input
                  id="pos-discount-input"
                  type="number"
                  min="0"
                  value={discountInput}
                  onChange={(e) =>
                    updateTab((t) => ({ ...t, discountInput: e.target.value }))
                  }
                  className="w-24 px-2.5 py-1 text-right text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-md text-slate-900"
                />
              </div>
            </div>

            {/* Calculation Breakdown */}
            <div className="space-y-1.5 pt-2 border-t border-slate-200/80 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Subtotal ({totals.itemCount} items)</span>
                <span className="font-mono tabular-nums font-medium text-slate-900">
                  {formatCurrency(totals.subtotal, symbol)}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Discount</span>
                <span className="font-mono tabular-nums text-emerald-700">
                  −{formatCurrency(totals.discountAmount, symbol)}
                </span>
              </div>
              {totals.taxAmount > 0 && shop.taxRatePercent > 0 && shop.printVatOnReceipt !== false && (
                <div className="flex items-center justify-between text-slate-600">
                  <span>VAT / Tax ({shop.taxRatePercent}%)</span>
                  <span className="font-mono tabular-nums text-slate-800">
                    {formatCurrency(totals.taxAmount, symbol)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-base font-display font-bold text-slate-900">
                <span>Total Payable</span>
                <span className="font-mono tabular-nums text-lg text-emerald-700">
                  {formatCurrency(totals.totalAmount, symbol)}
                </span>
              </div>
            </div>

            {/* Interim Bill (Pre-Check Slip) for Customer Table Verification */}
            {isTableTabsEnabled && dispatchAnalysis.canPrintInterimBill && (
              <div className="pt-2">
                <button
                  type="button"
                  disabled={cart.length === 0 || isPrintingInterimBill}
                  onClick={handlePrintInterimBill}
                  className="w-full py-2 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                >
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span>
                    {isPrintingInterimBill
                      ? 'Printing Interim Bill...'
                      : 'Print Interim Bill (Pre-Check Slip)'}
                  </span>
                </button>
                {activeTab.interimBillPrintedAt && (
                  <p className="text-[10px] text-center text-slate-500 mt-1">
                    Interim bill printed at{' '}
                    {new Date(activeTab.interimBillPrintedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                )}
              </div>
            )}

            {/* Payment Action Buttons */}
            <div className="pt-2 space-y-2">
              <p className="text-xs font-semibold text-slate-700">
                Select Payment Method:
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={cart.length === 0}
                  onClick={() => openPaymentConfirmation('cash')}
                  className="py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <Banknote className="w-4 h-4" />
                  <span>Cash</span>
                </button>
                <button
                  type="button"
                  disabled={cart.length === 0}
                  onClick={() => openPaymentConfirmation('bank_transfer')}
                  className="py-2.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <Building className="w-4 h-4" />
                  <span>Transfer</span>
                </button>
                <button
                  type="button"
                  disabled={cart.length === 0}
                  onClick={() => openPaymentConfirmation('pos_card')}
                  className="py-2.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>POS Card</span>
                </button>
              </div>

              {/* Sell on Credit Option Underneath Cash, Transfer, POS Card */}
              <div className="pt-1.5 space-y-2">
                <button
                  type="button"
                  disabled={cart.length === 0}
                  onClick={handleToggleCreditSection}
                  className={`w-full py-2.5 px-3 rounded-lg border text-xs font-semibold flex items-center justify-between gap-2 transition-all cursor-pointer ${
                    showCreditSection
                      ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-sm'
                      : 'bg-amber-50/90 hover:bg-amber-100 border-amber-300 text-amber-950'
                  } disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed`}
                >
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 shrink-0 text-amber-900" />
                    <span className="font-bold tracking-tight">
                      click here to sell on credit
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="px-2 py-0.5 rounded-full bg-amber-200/90 text-amber-950 font-medium font-mono">
                      {activeShopDebtCustomers.length} in Debt Book
                    </span>
                    {showCreditSection ? (
                      <ChevronUp className="w-4 h-4 text-amber-950" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-amber-950" />
                    )}
                  </div>
                </button>

                {/* Feedback banner if customer was added or credit feedback */}
                {creditSaleFeedback && (
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span className="flex-1">{creditSaleFeedback}</span>
                    <button
                      type="button"
                      onClick={() => setCreditSaleFeedback(null)}
                      className="text-emerald-700 hover:text-emerald-950 text-xs ml-1"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Expanded Credit Sale & Customer Details Panel */}
                {showCreditSection && (
                  <div className="p-3 rounded-xl bg-gradient-to-b from-amber-50/70 to-orange-50/40 border border-amber-200 space-y-3">
                    <div className="flex items-center justify-between gap-2 border-b border-amber-200/80 pb-2">
                      <div className="flex items-center gap-1.5">
                        <BookOpen className="w-4 h-4 text-amber-800" />
                        <span className="text-xs font-bold text-slate-900">
                          Debt Book Credit Details
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleOpenAddCustomerModal}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold transition-colors cursor-pointer shadow-2xs"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Add New Customer</span>
                      </button>
                    </div>

                    {activeShopDebtCustomers.length === 0 ? (
                      <div className="text-center py-4 px-2 space-y-2">
                        <UserIcon className="w-8 h-8 text-amber-600/60 mx-auto" />
                        <p className="text-xs text-slate-800 font-semibold">
                          No customers in this shop's Debt Book yet.
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Click &quot;Add New Customer&quot; below to register their name, phone, and optional credit limit.
                        </p>
                        <button
                          type="button"
                          onClick={handleOpenAddCustomerModal}
                          className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer shadow-xs"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Add New Customer</span>
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Customer Switcher / Search */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <label
                              htmlFor="pos-credit-customer-select"
                              className="font-semibold text-slate-700 flex items-center gap-1"
                            >
                              <span>Customer Account:</span>
                              <span className="text-slate-400 font-normal">
                                ({activeShopDebtCustomers.length} registered)
                              </span>
                            </label>
                            {onOpenDebtBook && (
                              <button
                                type="button"
                                onClick={onOpenDebtBook}
                                className="text-amber-800 hover:underline text-[11px] font-medium"
                              >
                                View Debt Book ↗
                              </button>
                            )}
                          </div>
                          <select
                            id="pos-credit-customer-select"
                            value={selectedCreditCustomer?.id ?? ''}
                            onChange={(e) =>
                              handleSelectCreditCustomer(e.target.value)
                            }
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-amber-300 rounded-lg text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-amber-500"
                          >
                            {activeShopDebtCustomers.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.fullName} ({c.phone}) — Balance:{' '}
                                {formatCurrency(c.balanceRemaining, symbol)}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Customer Details of Anyone Added inside Debt Book */}
                        {selectedCreditCustomer && (
                          <div className="p-3 bg-white rounded-lg border border-amber-200/90 shadow-2xs space-y-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                                  <h4 className="text-xs font-bold text-slate-900">
                                    {selectedCreditCustomer.fullName}
                                  </h4>
                                </div>
                                <div className="flex items-center gap-1 text-[11px] text-slate-600 mt-0.5">
                                  <Phone className="w-3 h-3 text-slate-400" />
                                  <span>{selectedCreditCustomer.phone}</span>
                                </div>
                              </div>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold font-mono ${
                                  selectedCreditCustomer.balanceRemaining > 0
                                    ? 'bg-amber-100 text-amber-900'
                                    : 'bg-emerald-100 text-emerald-900'
                                }`}
                              >
                                {selectedCreditCustomer.balanceRemaining > 0
                                  ? 'Active Debtor'
                                  : 'No Debt'}
                              </span>
                            </div>

                            {/* Financial Details: Total Credit, Amount Paid, Balance Remaining */}
                            <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-100 text-center">
                              <div className="p-1.5 rounded bg-slate-50 border border-slate-100">
                                <span className="block text-[10px] text-slate-500">
                                  Total Credit
                                </span>
                                <span className="text-xs font-bold font-mono text-slate-800 tabular-nums">
                                  {formatCurrency(
                                    selectedCreditCustomer.totalCredit,
                                    symbol
                                  )}
                                </span>
                              </div>
                              <div className="p-1.5 rounded bg-slate-50 border border-slate-100">
                                <span className="block text-[10px] text-slate-500">
                                  Amount Paid
                                </span>
                                <span className="text-xs font-bold font-mono text-emerald-700 tabular-nums">
                                  {formatCurrency(
                                    selectedCreditCustomer.amountPaid,
                                    symbol
                                  )}
                                </span>
                              </div>
                              <div className="p-1.5 rounded bg-amber-50 border border-amber-200">
                                <span className="block text-[10px] text-amber-900 font-semibold">
                                  Balance Due
                                </span>
                                <span className="text-xs font-bold font-mono text-amber-950 tabular-nums">
                                  {formatCurrency(
                                    selectedCreditCustomer.balanceRemaining,
                                    symbol
                                  )}
                                </span>
                              </div>
                            </div>

                            {/* Credit Limit & Projection */}
                            <div className="pt-1.5 border-t border-slate-100 text-[11px] space-y-1 text-slate-700">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500">Credit Limit:</span>
                                {selectedCreditCustomer.creditLimitEnabled &&
                                selectedCreditCustomer.creditLimitAmount > 0 ? (
                                  <span className="font-mono font-semibold text-slate-900">
                                    {formatCurrency(
                                      selectedCreditCustomer.creditLimitAmount,
                                      symbol
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-emerald-700 font-medium">
                                    No Limit (Open Credit)
                                  </span>
                                )}
                              </div>

                              {selectedCreditCustomer.creditLimitEnabled &&
                                selectedCreditCustomer.creditLimitAmount > 0 && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-slate-500">
                                      Available Credit Margin:
                                    </span>
                                    <span className="font-mono font-semibold text-emerald-700">
                                      {formatCurrency(
                                        Math.max(
                                          0,
                                          selectedCreditCustomer.creditLimitAmount -
                                            selectedCreditCustomer.balanceRemaining
                                        ),
                                        symbol
                                      )}
                                    </span>
                                  </div>
                                )}

                              <div className="flex items-center justify-between pt-1 border-t border-dashed border-slate-200 font-semibold text-slate-900">
                                <span>Projected Balance After Sale:</span>
                                <span className="font-mono text-amber-900 tabular-nums">
                                  {formatCurrency(
                                    selectedCreditCustomer.balanceRemaining +
                                      totals.totalAmount,
                                    symbol
                                  )}
                                </span>
                              </div>

                              {/* Credit Limit Exceeded Warning */}
                              {selectedCreditCustomer.creditLimitEnabled &&
                                selectedCreditCustomer.creditLimitAmount > 0 &&
                                selectedCreditCustomer.balanceRemaining +
                                  totals.totalAmount >
                                  selectedCreditCustomer.creditLimitAmount && (
                                  <div className="p-2 rounded bg-rose-50 border border-rose-200 text-rose-800 text-[11px] flex items-start gap-1.5 mt-1.5">
                                    <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                                    <span>
                                      <strong>Limit Warning:</strong> This bill exceeds customer&apos;s credit limit by{' '}
                                      {formatCurrency(
                                        selectedCreditCustomer.balanceRemaining +
                                          totals.totalAmount -
                                          selectedCreditCustomer.creditLimitAmount,
                                        symbol
                                      )}.
                                    </span>
                                  </div>
                                )}

                              {selectedCreditCustomer.notes && (
                                <p className="text-[10px] text-slate-500 italic pt-1">
                                  Note: {selectedCreditCustomer.notes}
                                </p>
                              )}
                            </div>

                            {/* Button to Complete Sale on Credit */}
                            <button
                              type="button"
                              disabled={cart.length === 0}
                              onClick={handleConfirmCreditSale}
                              className="w-full py-2.5 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                            >
                              <Check className="w-4 h-4" />
                              <span>
                                Complete Sale on Credit (
                                {formatCurrency(totals.totalAmount, symbol)})
                              </span>
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-500 text-center pt-1">
                Customer delaying payment? Click <strong>+ New Customer Tab</strong> above to attend to the next person in line.
              </p>
            </div>
          </div>
        </aside>
      </div>

      {/* Floating Mobile Checkout Bar when on catalogue view with items in cart */}
      {cart.length > 0 && mobileActivePanel === 'catalogue' && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900 border-t border-slate-800 text-white p-3 lg:hidden shadow-2xl flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                {totals.itemCount} {totals.itemCount === 1 ? 'item' : 'items'}
              </span>
              <span className="text-xs text-slate-300 truncate">
                {activeTab.label}
              </span>
            </div>
            <p className="text-base font-bold font-mono tabular-nums text-white truncate">
              {formatCurrency(totals.totalAmount, symbol)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMobileActivePanel('cart')}
            className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-lg transition-colors cursor-pointer shrink-0 min-h-[44px]"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>View Cart &amp; Pay</span>
          </button>
        </div>
      )}

      {/* Payment Confirmation Modal */}
      {activePaymentModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Complete Payment"
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-3 sm:p-4"
        >
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-4 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-display font-bold text-slate-900">
                  Confirm Sale — {activeTab.label} ({shop.code})
                </h3>
                <p className="text-xs text-slate-500 capitalize">
                  Payment Method: {activePaymentModal.replace('_', ' ')}
                  {activeTab.customerNote.trim()
                    ? ` · ${activeTab.customerNote.trim()}`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActivePaymentModal(null)}
                aria-label="Close payment modal"
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                <strong>Waiting on Customer Payment?</strong> You can click{' '}
                <strong>Hold &amp; Attend Next Customer (+)</strong> below to keep{' '}
                {activeTab.label}&apos;s bill on hold while serving the next person.
              </span>
            </div>

            <form onSubmit={handleConfirmDemoSale} className="space-y-4">
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  Total Amount Due
                </span>
                <span className="text-lg font-display font-bold font-mono tabular-nums text-emerald-700">
                  {formatCurrency(totals.totalAmount, symbol)}
                </span>
              </div>

              {activePaymentModal === 'cash' ? (
                <div>
                  <label
                    htmlFor="tendered-amount"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Cash Amount Tendered ({symbol})
                  </label>
                  <input
                    id="tendered-amount"
                    type="number"
                    step="0.01"
                    min={totals.totalAmount}
                    value={amountTenderedInput}
                    onChange={(e) =>
                      updateTab((t) => ({
                        ...t,
                        amountTenderedInput: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                  <p className="text-xs font-mono tabular-nums text-slate-600 mt-1.5">
                    Change Due:{' '}
                    <strong>
                      {formatCurrency(
                        Math.max(
                          0,
                          (parseFloat(amountTenderedInput) || 0) -
                            totals.totalAmount
                        ),
                        symbol
                      )}
                    </strong>
                  </p>
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="payment-ref-input"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Reference / STAN Number
                  </label>
                  <input
                    id="payment-ref-input"
                    type="text"
                    value={paymentReference}
                    onChange={(e) =>
                      updateTab((t) => ({
                        ...t,
                        paymentReference: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() =>
                    handleHoldAndAttendNextCustomer(activePaymentModal)
                  }
                  className="px-3 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-300 text-xs font-semibold text-amber-900 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-800" />
                  <span>Hold &amp; Attend Next Customer</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActivePaymentModal(null)}
                    className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    Record Sale
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Debt Customer Modal from POS */}
      {showAddCustomerModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add New Debt Customer"
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-amber-100 text-amber-800">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-display font-bold text-slate-900">
                    Add New Customer to Debt Book
                  </h3>
                  <p className="text-xs text-slate-500">
                    Shop: {shop.name} ({shop.code})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddCustomerModal(false)}
                aria-label="Close add customer modal"
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {newCustFormError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{newCustFormError}</span>
              </div>
            )}

            <form onSubmit={handleSaveNewCustomerFromPos} className="space-y-4">
              <div>
                <label
                  htmlFor="new-cust-fullname"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Customer Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="new-cust-fullname"
                  type="text"
                  required
                  placeholder="e.g. Chief Emeka Adeleke"
                  value={newCustFullName}
                  onChange={(e) => setNewCustFullName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label
                  htmlFor="new-cust-phone"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Phone Number <span className="text-rose-500">*</span>
                </label>
                <input
                  id="new-cust-phone"
                  type="tel"
                  required
                  placeholder="e.g. 0803 123 4567"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                />
              </div>

              {/* Set Customer Credit Limit Toggle Option */}
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-slate-800 block">
                      Set Customer Credit Limit
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Cap the maximum credit balance this customer can owe
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newCustCreditLimitEnabled}
                      onChange={(e) =>
                        setNewCustCreditLimitEnabled(e.target.checked)
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                  </label>
                </div>

                {newCustCreditLimitEnabled && (
                  <div className="pt-2 border-t border-slate-200/80">
                    <label
                      htmlFor="new-cust-credit-limit"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Credit Limit Amount ({symbol}) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="new-cust-credit-limit"
                      type="number"
                      min="1"
                      step="0.01"
                      placeholder="e.g. 50000"
                      value={newCustCreditLimitAmount}
                      onChange={(e) =>
                        setNewCustCreditLimitAmount(e.target.value)
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-900 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                )}
              </div>

              {/* Optional Opening Credit / Deposit */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="new-cust-opening-credit"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Opening Credit ({symbol}, Optional)
                  </label>
                  <input
                    id="new-cust-opening-credit"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={newCustInitialCredit}
                    onChange={(e) => setNewCustInitialCredit(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg text-slate-900 font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-cust-opening-deposit"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Initial Deposit ({symbol}, Optional)
                  </label>
                  <input
                    id="new-cust-opening-deposit"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={newCustInitialPaid}
                    onChange={(e) => setNewCustInitialPaid(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg text-slate-900 font-mono tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="new-cust-notes"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Notes / Address (Optional)
                </label>
                <textarea
                  id="new-cust-notes"
                  rows={2}
                  placeholder="e.g. Frequent customer, settlement on weekends"
                  value={newCustNotes}
                  onChange={(e) => setNewCustNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Check className="w-4 h-4" />
                  <span>Save to Debt Book &amp; Select</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Completed Receipt Modal */}
      {completedReceipt && (() => {
        const effectivePrinter = resolveEffectivePrinter(shop);
        const printerSettings = getShopPrinterSettings(shop);
        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Receipt Preview"
            className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-3 sm:p-4"
          >
            <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-4 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 text-emerald-700">
                  <CheckCircle2 className="w-5 h-5" />
                  <h3 className="text-base font-display font-bold text-slate-900">
                    Receipt Generated ({printerSettings.receiptPrinterMode.toUpperCase()})
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-semibold">
                  {printerSettings.receiptPrinterMode === 'thermal'
                    ? `Thermal ${printerSettings.thermalPaperWidth}`
                    : 'A4 Sheet'}
                </span>
              </div>

              <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-emerald-900">
                  <Printer className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span className="truncate">
                    Default:{' '}
                    <strong>{effectivePrinter.printerName}</strong>
                  </span>
                </div>
                {!printerSettings.allowReceiptReprint && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded shrink-0">
                    <Lock className="w-2.5 h-2.5" />
                    <span>No Reprint</span>
                  </span>
                )}
              </div>

              {receiptPrintFeedback && (
                <div
                  className={`px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${
                    receiptPrintFeedback.type === 'success'
                      ? 'bg-emerald-100 border border-emerald-300 text-emerald-900'
                      : 'bg-rose-100 border border-rose-300 text-rose-900'
                  }`}
                >
                  {receiptPrintFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
                  )}
                  <span>{receiptPrintFeedback.message}</span>
                </div>
              )}

              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs space-y-2">
                <div className="text-center border-b border-slate-200 pb-2">
                  <p className="font-bold text-slate-900">{shop.name}</p>
                  <p className="text-slate-500">{shop.address}</p>
                  <p className="text-slate-500 font-sans text-[11px] mt-0.5">
                    Official Sales Receipt
                  </p>
                </div>
                <div className="flex justify-between">
                  <span>Receipt #:</span>
                  <span className="font-bold">
                    {completedReceipt.receiptNumber}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Cashier:</span>
                  <span>{completedReceipt.cashierName}</span>
                </div>
                <div className="flex justify-between">
                  <span>Payment:</span>
                  <span className="uppercase font-bold text-amber-700">
                    {completedReceipt.paymentMethod === 'credit'
                      ? 'CREDIT (DEBT BOOK)'
                      : completedReceipt.paymentMethod.replace('_', ' ')}
                  </span>
                </div>
                {completedReceipt.creditCustomerName && (
                  <div className="flex justify-between bg-amber-50 p-1.5 rounded border border-amber-200 text-amber-900 font-sans">
                    <span>Customer:</span>
                    <span className="font-bold">
                      {completedReceipt.creditCustomerName}
                      {completedReceipt.creditCustomerPhone
                        ? ` (${completedReceipt.creditCustomerPhone})`
                        : ''}
                    </span>
                  </div>
                )}
                <div className="border-t border-slate-200 pt-2 space-y-1">
                  {completedReceipt.items.map((line) => (
                    <div key={line.id} className="flex justify-between">
                      <span className="truncate pr-2">
                        {line.quantity}x {line.productName}
                      </span>
                      <span className="tabular-nums">
                        {formatCurrency(line.lineTotal, symbol)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-slate-200 pt-2 flex justify-between font-bold text-sm text-slate-900">
                  <span>TOTAL:</span>
                  <span className="tabular-nums">
                    {formatCurrency(completedReceipt.totalAmount, symbol)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={isPrintingReceipt}
                  onClick={() => handlePrintCompletedReceipt()}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer
                    className={`w-3.5 h-3.5 ${
                      isPrintingReceipt ? 'animate-spin text-emerald-600' : ''
                    }`}
                  />
                  <span>
                    {isPrintingReceipt ? 'Printing...' : 'Print Receipt'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCompletedReceipt(null);
                    setReceiptPrintFeedback(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                >
                  Done &amp; Continue
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* POS Return Modal */}
      {posReturnModalOpen && renderPosReturnModal()}

      {/* Table Tab Opening Modal */}
      {tableModalOpen && renderTableTabModal()}

      {/* Void Dispatched Item Modal */}
      {voidModal.open && renderVoidItemModal()}

      {/* POS Barcode Camera & Hardware Scanner Modal */}
      {cameraScannerOpen && (
        <BarcodeCaptureModal
          isOpen={cameraScannerOpen}
          onClose={() => setCameraScannerOpen(false)}
          onBarcodeCaptured={(code) => {
            processScannedBarcode(code);
          }}
          initialTab="camera"
          continuous={true}
          title={`POS Barcode Scanner (${activeTab.label})`}
          subtitle="Point camera at product barcode or connect scanner gun to add items directly to cart"
        />
      )}

    </div>
  );
};

