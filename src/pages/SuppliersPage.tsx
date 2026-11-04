import React, { useState, useMemo, useEffect } from 'react';
import {
  Truck,
  Plus,
  Search,
  Phone,
  Mail,
  MapPin,
  Calendar,
  PackagePlus,
  CheckCircle2,
  AlertCircle,
  X,
  Trash2,
  History,
  Wallet,
  Package,
  Building2,
  FileDown,
  RotateCcw,
  Check,
  Loader2,
  ListFilter,
} from 'lucide-react';
import {
  Business,
  Product,
  Shop,
  Supplier,
  SupplierSupplyRecord,
  User,
} from '../types/pos';
import {
  CreateSupplierInput,
  SalesDateRangePreset,
  SupplyDraftItem,
  extractSaleDateYmd,
  filterProductsForSupplySearch,
  filterSupplierReportData,
  formatCurrency,
  getDateRangeBoundsForPreset,
  getSupplierReportProducts,
  getTodayYmd,
  validateSupplierInput,
} from '../utils/posCalculations';
import { downloadSuppliersReportPdf } from '../utils/pdfGenerator';

const SUPPLIER_DATE_PRESETS: { id: SalesDateRangePreset; label: string }[] = [
  { id: 'all', label: 'All Dates' },
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this_week', label: 'Last 7 Days' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_30_days', label: 'Last 30 Days' },
  { id: 'custom', label: 'Custom Range' },
];

interface SuppliersPageProps {
  business: Business;
  shop: Shop;
  currentUser: User;
  shopProducts: Product[];
  shopSuppliers: Supplier[];
  shopSupplierSupplies: SupplierSupplyRecord[];
  onAddSupplier: (input: CreateSupplierInput) => Supplier;
  onAddSupplierSupplies: (
    supplierId: string,
    items: SupplyDraftItem[],
    amountPaid: number,
    notes?: string
  ) => void;
  onRecordSupplierPayment: (supplierId: string, amount: number) => void;
}

interface SuppliersFormDraft {
  showAddSupplierModal: boolean;
  fullName: string;
  phone: string;
  email: string;
  address: string;
  activeSupplySupplierId: string | null;
  supplyDraftItems: SupplyDraftItem[];
  supplyAmountPaid: string;
  amountPaidManuallyEdited: boolean;
  supplyNotes: string;
}

export const SuppliersPage: React.FC<SuppliersPageProps> = ({
  business,
  shop,
  currentUser,
  shopProducts,
  shopSuppliers,
  shopSupplierSupplies,
  onAddSupplier,
  onAddSupplierSupplies,
  onRecordSupplierPayment,
}) => {
  const draftKey = `smartmind_suppliers_draft_${shop.id}`;
  const savedDraft = useMemo<Partial<SuppliersFormDraft> | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw =
        window.sessionStorage.getItem(draftKey) ||
        window.localStorage.getItem(draftKey);
      return raw ? (JSON.parse(raw) as Partial<SuppliersFormDraft>) : null;
    } catch {
      return null;
    }
  }, [draftKey]);

  const [supplierSearch, setSupplierSearch] = useState('');
  const [selectedSupplierFilter, setSelectedSupplierFilter] =
    useState<string>('all');
  const [selectedProductFilter, setSelectedProductFilter] =
    useState<string>('all');
  const [datePreset, setDatePreset] = useState<SalesDateRangePreset>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);

  const [bannerMessage, setBannerMessage] = useState<{
    type: 'success' | 'error';
    text: string;
    supplierId?: string;
  } | null>(null);

  // Add New Supplier Modal State
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(
    () => savedDraft?.showAddSupplierModal ?? false
  );
  const [fullName, setFullName] = useState(() => savedDraft?.fullName ?? '');
  const [phone, setPhone] = useState(() => savedDraft?.phone ?? '');
  const [email, setEmail] = useState(() => savedDraft?.email ?? '');
  const [address, setAddress] = useState(() => savedDraft?.address ?? '');
  const [formErrors, setFormErrors] = useState<string[]>([]);

  // Add Supplies Modal State
  const [activeSupplySupplierId, setActiveSupplySupplierId] = useState<
    string | null
  >(() => savedDraft?.activeSupplySupplierId ?? null);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [quickQuantity, setQuickQuantity] = useState<string>('1');
  const [quickCostPrice, setQuickCostPrice] = useState<string>('');
  const [supplyDraftItems, setSupplyDraftItems] = useState<SupplyDraftItem[]>(
    () => savedDraft?.supplyDraftItems ?? []
  );
  const [supplyAmountPaid, setSupplyAmountPaid] = useState<string>(
    () => savedDraft?.supplyAmountPaid ?? ''
  );
  const [amountPaidManuallyEdited, setAmountPaidManuallyEdited] = useState(
    () => savedDraft?.amountPaidManuallyEdited ?? false
  );
  const [supplyNotes, setSupplyNotes] = useState(
    () => savedDraft?.supplyNotes ?? ''
  );
  const [supplyErrors, setSupplyErrors] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const payload: SuppliersFormDraft = {
        showAddSupplierModal,
        fullName,
        phone,
        email,
        address,
        activeSupplySupplierId,
        supplyDraftItems,
        supplyAmountPaid,
        amountPaidManuallyEdited,
        supplyNotes,
      };
      const serialized = JSON.stringify(payload);
      window.sessionStorage.setItem(draftKey, serialized);
      window.localStorage.setItem(draftKey, serialized);
    } catch {
      // Ignore storage errors
    }
  }, [
    draftKey,
    showAddSupplierModal,
    fullName,
    phone,
    email,
    address,
    activeSupplySupplierId,
    supplyDraftItems,
    supplyAmountPaid,
    amountPaidManuallyEdited,
    supplyNotes,
  ]);

  // View Supplier History / Pay Balance Modal State
  const [inspectedSupplierId, setInspectedSupplierId] = useState<string | null>(
    null
  );
  const [balancePaymentInput, setBalancePaymentInput] = useState<string>('');

  const activeSupplySupplier = useMemo(
    () =>
      shopSuppliers.find((s) => s.id === activeSupplySupplierId) ?? null,
    [shopSuppliers, activeSupplySupplierId]
  );

  const inspectedSupplier = useMemo(
    () => shopSuppliers.find((s) => s.id === inspectedSupplierId) ?? null,
    [shopSuppliers, inspectedSupplierId]
  );

  const inspectedSupplierRecords = useMemo(() => {
    if (!inspectedSupplierId) return [];
    return shopSupplierSupplies.filter(
      (r) => r.supplierId === inspectedSupplierId
    );
  }, [shopSupplierSupplies, inspectedSupplierId]);

  const todayYmd = useMemo(() => getTodayYmd(), []);
  const yesterdayYmd = useMemo(
    () => getDateRangeBoundsForPreset('yesterday', todayYmd).startDate,
    [todayYmd]
  );

  // Products available for Supplier / Supply PDF filtering
  const reportProductOptions = useMemo(
    () => getSupplierReportProducts(shopProducts, shopSupplierSupplies),
    [shopProducts, shopSupplierSupplies]
  );

  // Distinct dates on which supplies were recorded (for quick single-day selection)
  const availableSupplyDates = useMemo(() => {
    const dateSet = new Set<string>();
    shopSupplierSupplies.forEach((rec) => {
      if (
        selectedSupplierFilter !== 'all' &&
        rec.supplierId !== selectedSupplierFilter
      ) {
        return;
      }
      const ymd = extractSaleDateYmd(rec.createdAt);
      if (ymd) dateSet.add(ymd);
    });
    return Array.from(dateSet).sort((a, b) => b.localeCompare(a));
  }, [shopSupplierSupplies, selectedSupplierFilter]);

  // Filtered Suppliers, Supply Records, Itemized Product Rows, and Summary KPIs
  const filteredReport = useMemo(
    () =>
      filterSupplierReportData(
        shopSuppliers,
        shopSupplierSupplies,
        {
          supplierId: selectedSupplierFilter,
          productId: selectedProductFilter,
          startDate,
          endDate,
          searchQuery: supplierSearch,
        },
        shopProducts
      ),
    [
      shopSuppliers,
      shopSupplierSupplies,
      selectedSupplierFilter,
      selectedProductFilter,
      startDate,
      endDate,
      supplierSearch,
      shopProducts,
    ]
  );

  const filteredSuppliers = filteredReport.suppliers;
  const filteredItemizedRows = filteredReport.itemizedRows;
  const summaryStats = filteredReport.summary;

  const isAnyFilterActive =
    selectedSupplierFilter !== 'all' ||
    selectedProductFilter !== 'all' ||
    Boolean(startDate || endDate) ||
    Boolean(supplierSearch.trim());

  const dateRangeLabel = useMemo(() => {
    if (!startDate && !endDate) return 'All Dates';
    if (startDate && endDate && startDate === endDate) {
      if (startDate === todayYmd) return `Today (${startDate})`;
      if (startDate === yesterdayYmd) return `Yesterday (${startDate})`;
      return startDate;
    }
    if (startDate && endDate) return `${startDate} to ${endDate}`;
    if (startDate) return `From ${startDate}`;
    return `Up to ${endDate}`;
  }, [startDate, endDate, todayYmd, yesterdayYmd]);

  const supplierFilterLabel = useMemo(() => {
    if (selectedSupplierFilter === 'all') return 'All Suppliers';
    const found = shopSuppliers.find((s) => s.id === selectedSupplierFilter);
    return found ? found.fullName : selectedSupplierFilter;
  }, [selectedSupplierFilter, shopSuppliers]);

  const productFilterLabel = useMemo(() => {
    if (selectedProductFilter === 'all') return 'All Products';
    const found = reportProductOptions.find(
      (p) => p.id === selectedProductFilter
    );
    return found ? `${found.name} (${found.sku})` : selectedProductFilter;
  }, [selectedProductFilter, reportProductOptions]);

  const handleSelectDatePreset = (preset: SalesDateRangePreset) => {
    setDatePreset(preset);
    if (preset === 'custom') return;
    const bounds = getDateRangeBoundsForPreset(preset, todayYmd);
    setStartDate(bounds.startDate);
    setEndDate(bounds.endDate);
  };

  const handleSelectSingleDay = (dayYmd: string) => {
    if (!dayYmd) {
      handleSelectDatePreset('all');
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

  const handleResetFilters = () => {
    setSelectedSupplierFilter('all');
    setSelectedProductFilter('all');
    setDatePreset('all');
    setStartDate('');
    setEndDate('');
    setSupplierSearch('');
  };

  const handleDownloadSupplierPdf = async () => {
    setIsDownloadingPdf(true);
    setDownloadSuccess(false);
    try {
      await downloadSuppliersReportPdf({
        suppliers: filteredSuppliers,
        itemizedRows: filteredItemizedRows,
        business,
        shop,
        dateRangeLabel,
        supplierFilterLabel,
        productFilterLabel,
        symbol: business.currencySymbol,
        generatedBy: currentUser.fullName,
      });
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleDownloadSingleSupplierPdf = async (supplier: Supplier) => {
    const singleReport = filterSupplierReportData(
      shopSuppliers,
      shopSupplierSupplies,
      {
        supplierId: supplier.id,
        productId: selectedProductFilter,
        startDate,
        endDate,
      },
      shopProducts
    );
    await downloadSuppliersReportPdf({
      suppliers: singleReport.suppliers,
      itemizedRows: singleReport.itemizedRows,
      business,
      shop,
      dateRangeLabel,
      supplierFilterLabel: supplier.fullName,
      productFilterLabel,
      symbol: business.currencySymbol,
      generatedBy: currentUser.fullName,
    });
  };

  // Matching products for the Add Supplies search bar
  const matchingProducts = useMemo(
    () => filterProductsForSupplySearch(shopProducts, productSearchQuery),
    [shopProducts, productSearchQuery]
  );

  const selectedProduct = useMemo(
    () => shopProducts.find((p) => p.id === selectedProductId) ?? null,
    [shopProducts, selectedProductId]
  );

  // Calculate effective items (combines already-added batch items + currently selected product in quick form if not yet added)
  const effectiveSupplyItems = useMemo<SupplyDraftItem[]>(() => {
    const list = [...supplyDraftItems];
    if (selectedProduct) {
      const qty = Math.max(0, Math.floor(Number(quickQuantity) || 0));
      const cost = Math.max(
        0,
        Math.round((Number(quickCostPrice) || 0) * 100) / 100
      );
      if (qty > 0) {
        const existingIndex = list.findIndex(
          (i) => i.productId === selectedProduct.id
        );
        if (existingIndex === -1) {
          list.push({
            productId: selectedProduct.id,
            productName: selectedProduct.name,
            sku: selectedProduct.sku,
            barcode: selectedProduct.barcode,
            unit: selectedProduct.unit || 'Unit',
            quantity: qty,
            costPrice: cost,
          });
        }
      }
    }
    return list;
  }, [supplyDraftItems, selectedProduct, quickQuantity, quickCostPrice]);

  const supplyBatchTotal = useMemo(() => {
    return (
      Math.round(
        effectiveSupplyItems.reduce(
          (sum, item) => sum + item.quantity * item.costPrice,
          0
        ) * 100
      ) / 100
    );
  }, [effectiveSupplyItems]);

  // Handlers for Add New Supplier
  const handleOpenAddSupplier = () => {
    setFullName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setFormErrors([]);
    setShowAddSupplierModal(true);
  };

  const handleSaveNewSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    const input: CreateSupplierInput = {
      fullName,
      phone,
      email,
      address,
    };
    const errors = validateSupplierInput(input, shopSuppliers);
    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }

    const created = onAddSupplier(input);
    setShowAddSupplierModal(false);
    setBannerMessage({
      type: 'success',
      text: `Supplier "${created.fullName}" has been added. Click "Add Supplies" to record products supplied.`,
      supplierId: created.id,
    });
  };

  // Handlers for Add Supplies
  const handleOpenAddSupplies = (supplier: Supplier) => {
    setActiveSupplySupplierId(supplier.id);
    setProductSearchQuery('');
    setSelectedProductId('');
    setQuickQuantity('1');
    setQuickCostPrice('');
    setSupplyDraftItems([]);
    setSupplyAmountPaid('');
    setAmountPaidManuallyEdited(false);
    setSupplyNotes('');
    setSupplyErrors([]);
  };

  const handleSelectProductForSupply = (product: Product) => {
    setSelectedProductId(product.id);
    setProductSearchQuery(product.name);
    setQuickQuantity('1');
    setQuickCostPrice(String(product.costPrice));
    setSupplyErrors([]);

    if (!amountPaidManuallyEdited) {
      const existingSum = supplyDraftItems
        .filter((i) => i.productId !== product.id)
        .reduce((s, i) => s + i.quantity * i.costPrice, 0);
      setSupplyAmountPaid(String(existingSum + product.costPrice));
    }
  };

  const handleAddCurrentProductToBatch = () => {
    if (!selectedProduct) {
      setSupplyErrors(['Please search and select a product first.']);
      return;
    }
    const qty = Math.floor(Number(quickQuantity) || 0);
    const cost = Math.round((Number(quickCostPrice) || 0) * 100) / 100;

    if (qty <= 0) {
      setSupplyErrors(['Quantity must be at least 1.']);
      return;
    }
    if (cost < 0) {
      setSupplyErrors(['Cost price cannot be negative.']);
      return;
    }

    const nextItems = (() => {
      const idx = supplyDraftItems.findIndex(
        (i) => i.productId === selectedProduct.id
      );
      if (idx >= 0) {
        return supplyDraftItems.map((item, i) =>
          i === idx
            ? {
                ...item,
                quantity: item.quantity + qty,
                costPrice: cost,
              }
            : item
        );
      }
      return [
        ...supplyDraftItems,
        {
          productId: selectedProduct.id,
          productName: selectedProduct.name,
          sku: selectedProduct.sku,
          barcode: selectedProduct.barcode,
          unit: selectedProduct.unit || 'Unit',
          quantity: qty,
          costPrice: cost,
        },
      ];
    })();

    setSupplyDraftItems(nextItems);
    setSelectedProductId('');
    setProductSearchQuery('');
    setQuickQuantity('1');
    setQuickCostPrice('');
    setSupplyErrors([]);

    if (!amountPaidManuallyEdited) {
      const nextTotal = nextItems.reduce(
        (sum, item) => sum + item.quantity * item.costPrice,
        0
      );
      setSupplyAmountPaid(String(Math.round(nextTotal * 100) / 100));
    }
  };

  const handleUpdateDraftItem = (
    productId: string,
    field: 'quantity' | 'costPrice',
    rawValue: string
  ) => {
    const numValue = Number(rawValue);
    const updated = supplyDraftItems.map((item) => {
      if (item.productId !== productId) return item;
      if (field === 'quantity') {
        return {
          ...item,
          quantity: Math.max(1, Math.floor(numValue || 0)),
        };
      }
      return {
        ...item,
        costPrice: Math.max(0, Math.round((numValue || 0) * 100) / 100),
      };
    });
    setSupplyDraftItems(updated);

    if (!amountPaidManuallyEdited) {
      const nextTotal = updated.reduce(
        (sum, item) => sum + item.quantity * item.costPrice,
        0
      );
      setSupplyAmountPaid(String(Math.round(nextTotal * 100) / 100));
    }
  };

  const handleRemoveDraftItem = (productId: string) => {
    const updated = supplyDraftItems.filter((i) => i.productId !== productId);
    setSupplyDraftItems(updated);
    if (!amountPaidManuallyEdited) {
      const nextTotal = updated.reduce(
        (sum, item) => sum + item.quantity * item.costPrice,
        0
      );
      setSupplyAmountPaid(String(Math.round(nextTotal * 100) / 100));
    }
  };

  const handleSaveSupplies = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSupplySupplier) return;

    if (effectiveSupplyItems.length === 0) {
      setSupplyErrors([
        'Please search for a product and enter quantity and cost price before saving.',
      ]);
      return;
    }

    const invalidItem = effectiveSupplyItems.find(
      (i) => i.quantity <= 0 || i.costPrice < 0
    );
    if (invalidItem) {
      setSupplyErrors([
        `Please enter a valid quantity and cost price for "${invalidItem.productName}".`,
      ]);
      return;
    }

    const paidAmount =
      supplyAmountPaid.trim() === ''
        ? supplyBatchTotal
        : Math.max(0, Math.min(supplyBatchTotal, Number(supplyAmountPaid) || 0));

    onAddSupplierSupplies(
      activeSupplySupplier.id,
      effectiveSupplyItems,
      paidAmount,
      supplyNotes
    );

    const totalUnits = effectiveSupplyItems.reduce(
      (s, i) => s + i.quantity,
      0
    );
    setActiveSupplySupplierId(null);
    setBannerMessage({
      type: 'success',
      text: `Recorded supply of ${effectiveSupplyItems.length} product(s) (${totalUnits} units) worth ${formatCurrency(
        supplyBatchTotal,
        business.currencySymbol
      )} from ${activeSupplySupplier.fullName}. Inventory stock & cost prices updated.`,
    });
  };

  const handleRecordBalancePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectedSupplier) return;
    const amt = Number(balancePaymentInput) || 0;
    if (amt <= 0) return;

    onRecordSupplierPayment(inspectedSupplier.id, amt);
    setBalancePaymentInput('');
    setBannerMessage({
      type: 'success',
      text: `Recorded supplier payment of ${formatCurrency(
        amt,
        business.currencySymbol
      )} to ${inspectedSupplier.fullName}.`,
    });
  };

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-display font-bold text-slate-900">
                Suppliers & Supply Management
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                <Building2 className="w-3 h-3 text-emerald-600" />
                {shop.name} ({shop.code})
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Register suppliers, record incoming product supplies with cost prices, and track amounts paid and remaining balances.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleDownloadSupplierPdf}
            disabled={isDownloadingPdf}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer"
          >
            {isDownloadingPdf ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating PDF...</span>
              </>
            ) : downloadSuccess ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>PDF Downloaded</span>
              </>
            ) : (
              <>
                <FileDown className="w-4 h-4 text-emerald-400" />
                <span>Download Supplier PDF</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleOpenAddSupplier}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Supplier</span>
          </button>
        </div>
      </div>

      {/* Status Banner */}
      {bannerMessage && (
        <div
          className={`rounded-xl border p-3.5 flex flex-wrap items-center justify-between gap-3 ${
            bannerMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium">
            {bannerMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{bannerMessage.text}</span>
          </div>
          <div className="flex items-center gap-2">
            {bannerMessage.supplierId && (
              <button
                type="button"
                onClick={() => {
                  const sup = shopSuppliers.find(
                    (s) => s.id === bannerMessage.supplierId
                  );
                  if (sup) handleOpenAddSupplies(sup);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                <PackagePlus className="w-3.5 h-3.5" />
                <span>Add Supplies Now</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setBannerMessage(null)}
              className="p-1 rounded-lg hover:bg-black/5 text-slate-500 cursor-pointer"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUPPLIER REPORT FILTER & PDF EXPORT PANEL
          Select Dates, Supplier Name, or Particular Product and Download PDF
         ===================================================================== */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
              <ListFilter className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-sm font-display font-bold text-slate-900">
                Filter & Download Supplier Details PDF
              </h3>
              <p className="text-xs text-slate-500">
                Select dates, a supplier&apos;s name, or a particular product to filter supplier records and download as PDF
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAnyFilterActive && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadSupplierPdf}
              disabled={isDownloadingPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              {isDownloadingPdf ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Preparing PDF...</span>
                </>
              ) : downloadSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Downloaded PDF</span>
                </>
              ) : (
                <>
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Download Filtered PDF</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Row 1: Supplier Name Selector + Particular Product Selector + Single Day Picker */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Filter by Supplier Name */}
          <div>
            <label
              htmlFor="pdf-filter-supplier"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Supplier Name
            </label>
            <select
              id="pdf-filter-supplier"
              value={selectedSupplierFilter}
              onChange={(e) => setSelectedSupplierFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option value="all">
                All Suppliers ({shopSuppliers.length})
              </option>
              {shopSuppliers.map((sup) => (
                <option key={sup.id} value={sup.id}>
                  {sup.fullName} ({sup.totalSupplies} suppl{sup.totalSupplies === 1 ? 'y' : 'ies'})
                </option>
              ))}
            </select>
          </div>

          {/* Filter by Particular Product */}
          <div>
            <label
              htmlFor="pdf-filter-product"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Particular Product
            </label>
            <select
              id="pdf-filter-product"
              value={selectedProductFilter}
              onChange={(e) => setSelectedProductFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option value="all">
                All Products ({reportProductOptions.length})
              </option>
              {reportProductOptions.map((prod) => (
                <option key={prod.id} value={prod.id}>
                  {prod.name} ({prod.sku})
                  {prod.supplyCount > 0
                    ? ` — ${prod.totalUnitsSupplied} ${prod.unit}s supplied`
                    : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Select Particular Day */}
          <div>
            <label
              htmlFor="pdf-filter-single-day"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Select Particular Day
            </label>
            <input
              id="pdf-filter-single-day"
              type="date"
              value={startDate && startDate === endDate ? startDate : ''}
              onChange={(e) => handleSelectSingleDay(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Row 2: Quick Date Presets & Date Range Inputs (From Date / To Date) */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3.5 pt-1">
          <div className="space-y-1.5">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Date Range Presets
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {SUPPLIER_DATE_PRESETS.map((preset) => {
                const active = datePreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectDatePreset(preset.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      active
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:w-auto">
            <div>
              <label
                htmlFor="pdf-filter-start-date"
                className="block text-[11px] font-semibold text-slate-500 mb-1"
              >
                From Date
              </label>
              <input
                id="pdf-filter-start-date"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setDatePreset('custom');
                }}
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label
                htmlFor="pdf-filter-end-date"
                className="block text-[11px] font-semibold text-slate-500 mb-1"
              >
                To Date
              </label>
              <input
                id="pdf-filter-end-date"
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setDatePreset('custom');
                }}
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Quick Supply Dates Row & Active Filter Summary */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-slate-600">
              Active PDF Scope:
            </span>
            <span>{supplierFilterLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{productFilterLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{dateRangeLabel}</span>
          </div>

          {availableSupplyDates.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400">
                Supply Dates:
              </span>
              {availableSupplyDates.slice(0, 5).map((d) => {
                const isSelectedDay = startDate === d && endDate === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleSelectSingleDay(isSelectedDay ? '' : d)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-medium transition-colors cursor-pointer ${
                      isSelectedDay
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <p className="text-xs font-medium text-slate-500">
            {isAnyFilterActive ? 'Matching Suppliers' : 'Registered Suppliers'}
          </p>
          <p className="text-xl sm:text-2xl font-display font-bold text-slate-900 mt-1">
            {summaryStats.totalSuppliers}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            {supplierFilterLabel}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Total Supplies</p>
          <p className="text-xl sm:text-2xl font-display font-bold text-indigo-700 mt-1">
            {summaryStats.totalSupplies}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            {summaryStats.totalUnitsSupplied.toLocaleString('en-US')} units supplied
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Total Amount</p>
          <p className="text-lg sm:text-xl font-display font-bold text-slate-900 mt-1 truncate">
            {formatCurrency(summaryStats.totalAmount, business.currencySymbol)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">{dateRangeLabel}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Amount Paid</p>
          <p className="text-lg sm:text-xl font-display font-bold text-emerald-700 mt-1 truncate">
            {formatCurrency(summaryStats.amountPaid, business.currencySymbol)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Settled with suppliers</p>
        </div>

        <div className="col-span-2 lg:col-span-1 bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Remaining Balance</p>
          <p className="text-lg sm:text-xl font-display font-bold text-amber-700 mt-1 truncate">
            {formatCurrency(summaryStats.balanceRemaining, business.currencySymbol)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Outstanding payable</p>
        </div>
      </div>

      {/* Suppliers Directory Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-display font-bold text-slate-900">
              Shop Suppliers Directory
            </h3>
            <p className="text-xs text-slate-500">
              Showing {filteredSuppliers.length} of {shopSuppliers.length} supplier
              {shopSuppliers.length === 1 ? '' : 's'} · {dateRangeLabel}
              {selectedProductFilter !== 'all' ? ` · ${productFilterLabel}` : ''}
            </p>
          </div>

          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
              placeholder="Search supplier or product..."
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Supplier Name</th>
                <th className="py-3 px-4 text-center">Total Supplies</th>
                <th className="py-3 px-4 text-right">Total Amount</th>
                <th className="py-3 px-4 text-right">Amount Paid</th>
                <th className="py-3 px-4 text-right">Remaining Balance</th>
                <th className="py-3 px-4">Date Added</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs sm:text-sm">
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 px-4 text-center">
                    <Truck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700">
                      No suppliers match the selected filters
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Try adjusting the date range, supplier name, or product filter, or click &ldquo;Add New Supplier&rdquo;.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((supplier) => (
                  <tr
                    key={supplier.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-900">
                        {supplier.fullName}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {supplier.phone}
                        </span>
                        {supplier.email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="w-3 h-3 text-slate-400" />
                            {supplier.email}
                          </span>
                        )}
                      </div>
                      {supplier.address && (
                        <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate max-w-xs">{supplier.address}</span>
                        </p>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                        {supplier.totalSupplies}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {formatCurrency(supplier.totalAmount, business.currencySymbol)}
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono font-semibold text-emerald-700 whitespace-nowrap">
                      {formatCurrency(supplier.amountPaid, business.currencySymbol)}
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono font-semibold whitespace-nowrap">
                      <span
                        className={
                          supplier.balanceRemaining > 0
                            ? 'text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md'
                            : 'text-slate-500'
                        }
                      >
                        {formatCurrency(supplier.balanceRemaining, business.currencySymbol)}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {supplier.createdAt}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenAddSupplies(supplier)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                        >
                          <PackagePlus className="w-3.5 h-3.5" />
                          <span>Add Supplies</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setInspectedSupplierId(supplier.id);
                            setBalancePaymentInput('');
                          }}
                          title="View supply records & settle balance"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
                        >
                          <History className="w-3.5 h-3.5" />
                          <span className="hidden xl:inline">Records</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Itemized Product Supplies Breakdown Table (Matches PDF Section 2) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm sm:text-base font-display font-bold text-slate-900">
              Itemized Product Supplies Breakdown
            </h3>
            <p className="text-xs text-slate-500">
              {filteredItemizedRows.length} supplied product line
              {filteredItemizedRows.length === 1 ? '' : 's'} ({summaryStats.totalUnitsSupplied.toLocaleString('en-US')} total units) included in PDF report
            </p>
          </div>
          <span className="text-xs text-slate-500">
            {supplierFilterLabel} · {productFilterLabel} · {dateRangeLabel}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Supply Date</th>
                <th className="py-3 px-4">Supplier Name</th>
                <th className="py-3 px-4">Product Supplied</th>
                <th className="py-3 px-4 text-center">Qty</th>
                <th className="py-3 px-4 text-right">Cost Price</th>
                <th className="py-3 px-4 text-right">Line Total</th>
                <th className="py-3 px-4">Recorded By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs sm:text-sm">
              {filteredItemizedRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 px-4 text-center text-slate-500 text-xs">
                    No product supply lines match the current date, supplier, or product filter.
                  </td>
                </tr>
              ) : (
                filteredItemizedRows.map((row, idx) => (
                  <tr
                    key={`${row.supplyId}-${row.productId}-${idx}`}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap font-mono">
                      {row.supplyDate}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {row.supplierName}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">
                        {row.productName}
                      </p>
                      <p className="text-[11px] text-slate-400 font-mono">
                        {row.sku} · {row.unit}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-semibold text-slate-800">
                      {row.quantity.toLocaleString('en-US')}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700 whitespace-nowrap">
                      {formatCurrency(row.costPrice, business.currencySymbol)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {formatCurrency(row.lineTotal, business.currencySymbol)}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {row.recordedByName}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =====================================================================
          MODAL 1: ADD NEW SUPPLIER (Full Name, Phone Number, Email, Address)
         ===================================================================== */}
      {showAddSupplierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-display font-bold text-slate-900">
                    Add New Supplier
                  </h3>
                  <p className="text-xs text-slate-500">
                    Enter supplier contact details and save to {shop.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddSupplierModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveNewSupplier} className="p-5 space-y-4">
              {formErrors.length > 0 && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-1">
                  {formErrors.map((err, i) => (
                    <p key={i} className="flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <span>{err}</span>
                    </p>
                  ))}
                </div>
              )}

              <div>
                <label
                  htmlFor="supplier-full-name"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="supplier-full-name"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Crown Flour & Grains Distributors Ltd"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="supplier-phone"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Phone Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="supplier-phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. +234 803 412 8890"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="supplier-email"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Email <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="supplier-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. orders@supplier.com"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="supplier-address"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Address <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  id="supplier-address"
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Enter supplier warehouse or office address..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddSupplierModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold shadow-xs cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save Supplier</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: ADD SUPPLIES (Pulls up Supplier Data + Product Search + Qty + Cost Price)
         ===================================================================== */}
      {activeSupplySupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-auto">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <PackagePlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-display font-bold">
                    Add Supplies — {activeSupplySupplier.fullName}
                  </h3>
                  <p className="text-xs text-slate-300">
                    Search products, enter quantity and cost price to record incoming supplies
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveSupplySupplierId(null)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSaveSupplies}
              className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5"
            >
              {/* Pulled Up Supplier Data Card */}
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-3 border-b border-slate-200">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                      Supplier Data
                    </span>
                    <h4 className="text-base font-display font-bold text-slate-900 mt-0.5">
                      {activeSupplySupplier.fullName}
                    </h4>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 mt-1">
                      <span className="inline-flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        {activeSupplySupplier.phone}
                      </span>
                      {activeSupplySupplier.email && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          {activeSupplySupplier.email}
                        </span>
                      )}
                      {activeSupplySupplier.address && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {activeSupplySupplier.address}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 shrink-0">
                    Date Added:{' '}
                    <span className="font-semibold text-slate-700">
                      {activeSupplySupplier.createdAt}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 text-xs">
                  <div>
                    <p className="text-slate-500">Previous Supplies</p>
                    <p className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                      {activeSupplySupplier.totalSupplies}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Total Amount</p>
                    <p className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                      {formatCurrency(activeSupplySupplier.totalAmount, business.currencySymbol)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Amount Paid</p>
                    <p className="font-mono font-bold text-emerald-700 text-sm mt-0.5">
                      {formatCurrency(activeSupplySupplier.amountPaid, business.currencySymbol)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Remaining Balance</p>
                    <p className="font-mono font-bold text-amber-700 text-sm mt-0.5">
                      {formatCurrency(
                        activeSupplySupplier.balanceRemaining,
                        business.currencySymbol
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {supplyErrors.length > 0 && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-1">
                  {supplyErrors.map((err, i) => (
                    <p key={i} className="flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <span>{err}</span>
                    </p>
                  ))}
                </div>
              )}

              {/* Product Search Bar + Quantity + Cost Price Entry */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-4 bg-white">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs sm:text-sm font-display font-bold text-slate-900 flex items-center gap-2">
                    <Package className="w-4 h-4 text-emerald-600" />
                    <span>Search Product, Add Quantity &amp; Cost Price</span>
                  </h4>
                  <span className="text-xs text-slate-500">
                    {shopProducts.length} products in {shop.code}
                  </span>
                </div>

                {/* Product Search Input */}
                <div>
                  <label
                    htmlFor="supply-product-search"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Search Product
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="supply-product-search"
                      type="text"
                      value={productSearchQuery}
                      onChange={(e) => {
                        setProductSearchQuery(e.target.value);
                        if (
                          selectedProduct &&
                          e.target.value !== selectedProduct.name
                        ) {
                          setSelectedProductId('');
                        }
                      }}
                      placeholder="Search product by name, SKU, or barcode..."
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>

                  {/* Matching Products Picker List */}
                  <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100 bg-slate-50/60">
                    {matchingProducts.length === 0 ? (
                      <p className="p-3 text-xs text-slate-500 text-center">
                        No matching products found for &ldquo;{productSearchQuery}&rdquo;
                      </p>
                    ) : (
                      matchingProducts.slice(0, 8).map((prod) => {
                        const isSelected = prod.id === selectedProductId;
                        return (
                          <button
                            key={prod.id}
                            type="button"
                            onClick={() => handleSelectProductForSupply(prod)}
                            className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-50 text-emerald-950 font-semibold'
                                : 'hover:bg-white text-slate-700'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {prod.name}
                              </p>
                              <p className="text-[11px] text-slate-500 font-mono">
                                SKU: {prod.sku} · Stock: {prod.stockQuantity}{' '}
                                {prod.unit}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-mono font-semibold text-slate-900">
                                Cost: {formatCurrency(prod.costPrice, business.currencySymbol)}
                              </p>
                              <span className="text-[11px] text-emerald-700 font-medium">
                                {isSelected ? 'Selected ✓' : 'Select'}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Quantity & Cost Price Inputs for Selected Product */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end pt-1">
                  <div className="sm:col-span-5">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Selected Product
                    </label>
                    <div className="px-3 py-2 rounded-lg bg-slate-100 border border-slate-200 text-xs sm:text-sm font-medium text-slate-800 truncate">
                      {selectedProduct
                        ? `${selectedProduct.name} (${selectedProduct.unit})`
                        : 'Select a product above'}
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label
                      htmlFor="supply-qty-input"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Quantity
                    </label>
                    <input
                      id="supply-qty-input"
                      type="number"
                      min={1}
                      value={quickQuantity}
                      onChange={(e) => {
                        setQuickQuantity(e.target.value);
                        if (!amountPaidManuallyEdited && selectedProduct) {
                          const qty = Math.max(0, Number(e.target.value) || 0);
                          const cost = Math.max(
                            0,
                            Number(quickCostPrice) || 0
                          );
                          const existingSum = supplyDraftItems
                            .filter((i) => i.productId !== selectedProduct.id)
                            .reduce((s, i) => s + i.quantity * i.costPrice, 0);
                          setSupplyAmountPaid(
                            String(
                              Math.round((existingSum + qty * cost) * 100) / 100
                            )
                          );
                        }
                      }}
                      placeholder="Qty"
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label
                      htmlFor="supply-cost-input"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Cost Price ({business.currencySymbol})
                    </label>
                    <input
                      id="supply-cost-input"
                      type="number"
                      min={0}
                      step="any"
                      value={quickCostPrice}
                      onChange={(e) => {
                        setQuickCostPrice(e.target.value);
                        if (!amountPaidManuallyEdited && selectedProduct) {
                          const qty = Math.max(0, Number(quickQuantity) || 0);
                          const cost = Math.max(0, Number(e.target.value) || 0);
                          const existingSum = supplyDraftItems
                            .filter((i) => i.productId !== selectedProduct.id)
                            .reduce((s, i) => s + i.quantity * i.costPrice, 0);
                          setSupplyAmountPaid(
                            String(
                              Math.round((existingSum + qty * cost) * 100) / 100
                            )
                          );
                        }
                      }}
                      placeholder="Cost Price"
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddCurrentProductToBatch}
                      className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Item</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Supply Items List Table */}
              {effectiveSupplyItems.length > 0 && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">
                      Products in this Supply ({effectiveSupplyItems.length})
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-900">
                      Total Supply Amount:{' '}
                      {formatCurrency(supplyBatchTotal, business.currencySymbol)}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs sm:text-sm">
                      <thead>
                        <tr className="bg-slate-50/60 border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                          <th className="py-2.5 px-3">Product</th>
                          <th className="py-2.5 px-3 text-center">Quantity</th>
                          <th className="py-2.5 px-3 text-right">Cost Price</th>
                          <th className="py-2.5 px-3 text-right">Line Total</th>
                          <th className="py-2.5 px-3 text-right">Remove</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {effectiveSupplyItems.map((item) => {
                          const isSavedInDraft = supplyDraftItems.some(
                            (d) => d.productId === item.productId
                          );
                          const lineTotal =
                            Math.round(item.quantity * item.costPrice * 100) /
                            100;
                          return (
                            <tr key={item.productId}>
                              <td className="py-2.5 px-3">
                                <p className="font-semibold text-slate-900">
                                  {item.productName}
                                </p>
                                <p className="text-[11px] text-slate-500 font-mono">
                                  {item.sku} · {item.unit}
                                </p>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {isSavedInDraft ? (
                                  <input
                                    type="number"
                                    min={1}
                                    value={item.quantity}
                                    onChange={(e) =>
                                      handleUpdateDraftItem(
                                        item.productId,
                                        'quantity',
                                        e.target.value
                                      )
                                    }
                                    className="w-20 px-2 py-1 text-center font-mono text-xs border border-slate-300 rounded-md"
                                  />
                                ) : (
                                  <span className="font-mono font-semibold">
                                    {item.quantity}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {isSavedInDraft ? (
                                  <input
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={item.costPrice}
                                    onChange={(e) =>
                                      handleUpdateDraftItem(
                                        item.productId,
                                        'costPrice',
                                        e.target.value
                                      )
                                    }
                                    className="w-28 px-2 py-1 text-right font-mono text-xs border border-slate-300 rounded-md"
                                  />
                                ) : (
                                  <span className="font-mono font-semibold">
                                    {formatCurrency(item.costPrice, business.currencySymbol)}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                                {formatCurrency(lineTotal, business.currencySymbol)}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isSavedInDraft) {
                                      handleRemoveDraftItem(item.productId);
                                    } else {
                                      setSelectedProductId('');
                                      setProductSearchQuery('');
                                    }
                                  }}
                                  className="p-1 rounded-md text-rose-600 hover:bg-rose-50 cursor-pointer"
                                  title="Remove item"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Payment & Notes for this Supply */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-xl bg-slate-50 border border-slate-200 p-4">
                <div>
                  <label
                    htmlFor="supply-amount-paid"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Amount Paid Now ({business.currencySymbol})
                  </label>
                  <input
                    id="supply-amount-paid"
                    type="number"
                    min={0}
                    max={supplyBatchTotal}
                    step="any"
                    value={supplyAmountPaid}
                    onChange={(e) => {
                      setAmountPaidManuallyEdited(true);
                      setSupplyAmountPaid(e.target.value);
                    }}
                    placeholder={String(supplyBatchTotal)}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Balance on this supply:{' '}
                    <span className="font-mono font-semibold text-amber-700">
                      {formatCurrency(
                        Math.max(
                          0,
                          supplyBatchTotal -
                            (supplyAmountPaid.trim() === ''
                              ? supplyBatchTotal
                              : Number(supplyAmountPaid) || 0)
                        ),
                        business.currencySymbol
                      )}
                    </span>
                  </p>
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="supply-notes"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Supply Reference / Delivery Note (Optional)
                  </label>
                  <input
                    id="supply-notes"
                    type="text"
                    value={supplyNotes}
                    onChange={(e) => setSupplyNotes(e.target.value)}
                    placeholder="e.g. Waybill #WB-4092 or batch delivery note..."
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveSupplySupplierId(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold shadow-xs cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save Supplies</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: SUPPLIER SUPPLY RECORDS & BALANCE SETTLEMENT
         ===================================================================== */}
      {inspectedSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden my-auto">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm sm:text-base font-display font-bold text-slate-900">
                  {inspectedSupplier.fullName} — Supply History
                </h3>
                <p className="text-xs text-slate-500">
                  {[
                    inspectedSupplier.phone,
                    inspectedSupplier.email,
                    inspectedSupplier.address,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadSingleSupplierPdf(inspectedSupplier)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Download PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspectedSupplierId(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto space-y-5">
              {/* Summary & Settle Balance */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500">Total Supplies</span>
                  <p className="text-base font-mono font-bold text-slate-900 mt-0.5">
                    {inspectedSupplier.totalSupplies}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Total Amount</span>
                  <p className="text-base font-mono font-bold text-slate-900 mt-0.5">
                    {formatCurrency(inspectedSupplier.totalAmount, business.currencySymbol)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Amount Paid</span>
                  <p className="text-base font-mono font-bold text-emerald-700 mt-0.5">
                    {formatCurrency(inspectedSupplier.amountPaid, business.currencySymbol)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Remaining Balance</span>
                  <p className="text-base font-mono font-bold text-amber-700 mt-0.5">
                    {formatCurrency(
                      inspectedSupplier.balanceRemaining,
                      business.currencySymbol
                    )}
                  </p>
                </div>
              </div>

              {inspectedSupplier.balanceRemaining > 0 && (
                <form
                  onSubmit={handleRecordBalancePayment}
                  className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 flex flex-col sm:flex-row sm:items-end gap-3"
                >
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-amber-900 mb-1">
                      Record Payment Towards Remaining Balance (
                      {formatCurrency(
                        inspectedSupplier.balanceRemaining,
                        business.currencySymbol
                      )}
                      )
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={inspectedSupplier.balanceRemaining}
                      step="any"
                      value={balancePaymentInput}
                      onChange={(e) => setBalancePaymentInput(e.target.value)}
                      placeholder="Enter amount paid to supplier..."
                      className="w-full px-3 py-2 text-xs sm:text-sm font-mono bg-white border border-amber-300 rounded-lg"
                    />
                  </div>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-semibold cursor-pointer shrink-0"
                  >
                    <Wallet className="w-4 h-4" />
                    <span>Record Payment</span>
                  </button>
                </form>
              )}

              {/* Supply Batch Records */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Recorded Supply Batches ({inspectedSupplierRecords.length})
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      const sup = inspectedSupplier;
                      setInspectedSupplierId(null);
                      handleOpenAddSupplies(sup);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                  >
                    <PackagePlus className="w-3.5 h-3.5" />
                    <span>Add More Supplies</span>
                  </button>
                </div>

                {inspectedSupplierRecords.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-xl">
                    No supply batches recorded for this supplier yet.
                  </p>
                ) : (
                  inspectedSupplierRecords.map((rec) => (
                    <div
                      key={rec.id}
                      className="rounded-xl border border-slate-200 p-3.5 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-slate-100 pb-2">
                        <div>
                          <span className="font-semibold text-slate-900">
                            {rec.createdAt}
                          </span>
                          <span className="text-slate-400 mx-1.5">·</span>
                          <span className="text-slate-500">
                            Recorded by {rec.recordedByName}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 font-mono">
                          <span className="text-slate-700">
                            Total:{' '}
                            <strong>
                              {formatCurrency(rec.totalAmount, business.currencySymbol)}
                            </strong>
                          </span>
                          <span className="text-emerald-700">
                            Paid: {formatCurrency(rec.amountPaid, business.currencySymbol)}
                          </span>
                          {rec.balanceRemaining > 0 && (
                            <span className="text-amber-700">
                              Bal:{' '}
                              {formatCurrency(rec.balanceRemaining, business.currencySymbol)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1">
                        {rec.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between text-xs text-slate-700"
                          >
                            <span>
                              {item.productName}{' '}
                              <span className="text-slate-400 font-mono">
                                ({item.sku})
                              </span>
                            </span>
                            <span className="font-mono">
                              {item.quantity} {item.unit} ×{' '}
                              {formatCurrency(item.costPrice, business.currencySymbol)} ={' '}
                              <strong className="text-slate-900">
                                {formatCurrency(item.lineTotal, business.currencySymbol)}
                              </strong>
                            </span>
                          </div>
                        ))}
                      </div>

                      {rec.notes && (
                        <p className="text-[11px] text-slate-500 italic">
                          Note: {rec.notes}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
