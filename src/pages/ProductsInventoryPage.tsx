import React, { useState, useMemo } from 'react';
import {
  Plus,
  Minus,
  Search,
  Edit3,
  ArrowUpDown,
  FolderKanban,
  History,
  Package,
  AlertCircle,
  CheckCircle2,
  Scale,
  X,
  SlidersHorizontal,
  Tag,
  Sparkles,
  Truck,
  PlusCircle,
  AlertTriangle,
  RotateCcw,
  ShieldAlert,
  User as UserIcon,
  Filter,
  ReceiptText,
  Download,
  Upload,
  FileText,
  Check,
  FileSpreadsheet,
  Trash2,
  Calendar,
  Layers,
  Scan,
  Barcode,
} from 'lucide-react';
import { BarcodeCaptureModal } from '../components/inventory/BarcodeCaptureModal';
import {
  downloadInventoryCsvTemplate,
  InventoryCsvParseResult,
  parseInventoryCsvString,
} from '../utils/inventoryCsvHelper';
import {
  Business,
  Product,
  ProductCategory,
  SaleTransaction,
  Shop,
  StockAdjustment,
  StockAdjustmentType,
  UnitOfMeasurement,
  User,
} from '../types/pos';
import {
  calculateReceiptReturnResult,
  filterShopProducts,
  filterStockAdjustments,
  findMatchingReceipts,
  findReceiptByNumber,
  formatAdjustmentTypeLabel,
  formatCurrency,
  hasPermission,
  ProductFormInput,
  validateCategoryInput,
  validateProductInput,
  validateUnitInput,
} from '../utils/posCalculations';

export type ProductSubTab =
  | 'catalogue'
  | 'settings'
  | 'adjustments'
  | 'categories'
  | 'units';

interface ProductsInventoryPageProps {
  business: Business;
  shop: Shop;
  currentUser?: User;
  allUsers?: User[];
  shopCategories: ProductCategory[];
  shopUnits: UnitOfMeasurement[];
  shopProducts: Product[];
  shopSales?: SaleTransaction[];
  shopAdjustments: StockAdjustment[];
  onSaveProduct: (input: ProductFormInput, editingProductId?: string) => void;
  onDeleteProduct?: (productId: string) => void;
  onRecordStockAdjustment: (
    productId: string,
    type: StockAdjustmentType,
    quantity: number,
    reason: string
  ) => void;
  onProcessReceiptReturn?: (
    saleId: string,
    updatedQuantitiesByLineId: Record<string, number>,
    reason: string
  ) => void;
  onAddCategory: (name: string, description: string) => ProductCategory;
  onAddUnit: (name: string, abbreviation: string) => UnitOfMeasurement;
  onDeduplicateProducts?: (shopId: string) => Promise<{ mergedCount: number; removedCount: number }>;
}

export const ProductsInventoryPage: React.FC<ProductsInventoryPageProps> = ({
  business,
  shop,
  currentUser,
  allUsers,
  shopCategories,
  shopUnits,
  shopProducts,
  shopSales = [],
  shopAdjustments,
  onSaveProduct,
  onDeleteProduct,
  onRecordStockAdjustment,
  onProcessReceiptReturn,
  onAddCategory,
  onAddUnit,
  onDeduplicateProducts,
}) => {
  const draftStorageKey = `smartmind_inv_draft_${shop.id}`;
  const savedDraft = React.useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('reset') === '1') {
        window.sessionStorage.removeItem(draftStorageKey);
        window.localStorage.removeItem(draftStorageKey);
        return null;
      }
      const raw =
        window.sessionStorage.getItem(draftStorageKey) ||
        window.localStorage.getItem(draftStorageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [draftStorageKey]);

  const [activeSubTab, setActiveSubTab] = useState<ProductSubTab>(() => {
    if (
      savedDraft?.activeSubTab === 'categories' ||
      savedDraft?.activeSubTab === 'units'
    ) {
      return 'settings';
    }
    return savedDraft?.activeSubTab ?? 'catalogue';
  });

  const [settingsSection, setSettingsSection] = useState<'categories' | 'units'>(
    () => {
      if (savedDraft?.settingsSection) return savedDraft.settingsSection;
      if (savedDraft?.activeSubTab === 'units') return 'units';
      return 'categories';
    }
  );

  const [settingsSearchQuery, setSettingsSearchQuery] = useState<string>('');
  const [settingsSuccessNotice, setSettingsSuccessNotice] = useState<string | null>(
    null
  );

  const [searchQuery, setSearchQuery] = useState<string>(
    savedDraft?.searchQuery ?? ''
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    savedDraft?.selectedCategoryId ?? 'all'
  );

  // Add/Edit Product Modal State
  const [productModalOpen, setProductModalOpen] = useState<boolean>(
    savedDraft?.productModalOpen ?? false
  );
  const [editingProduct, setEditingProduct] = useState<Product | null>(() =>
    savedDraft?.editingProductId
      ? shopProducts.find((p) => p.id === savedDraft.editingProductId) ?? null
      : null
  );
  const [formState, setFormState] = useState<ProductFormInput>(
    savedDraft?.formState ?? {
      name: '',
      sku: `${shop.code.split('-')[0]}-NEW-101`,
      barcode: '',
      categoryId: shopCategories[0]?.id ?? '',
      unit: shopUnits[0]?.name ?? 'Pack',
      costPrice: 0,
      sellingPrice: 0,
      stockQuantity: 10,
      reorderLevel: 5,
      hasExpiry: false,
      expiryDate: '',
    }
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);

  // Barcode Toggle & Capture Modal State
  const [hasBarcodeToggle, setHasBarcodeToggle] = useState<boolean>(false);
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState<boolean>(false);

  // Inline Create Category inside Add/Edit Product Modal
  const [showInlineCategoryForm, setShowInlineCategoryForm] = useState<boolean>(
    savedDraft?.showInlineCategoryForm ?? false
  );
  const [inlineCatName, setInlineCatName] = useState<string>(
    savedDraft?.inlineCatName ?? ''
  );
  const [inlineCatDesc, setInlineCatDesc] = useState<string>(
    savedDraft?.inlineCatDesc ?? ''
  );
  const [inlineCatError, setInlineCatError] = useState<string | null>(null);

  // Inline Create Unit of Measurement inside Add/Edit Product Modal
  const [showInlineUnitForm, setShowInlineUnitForm] = useState<boolean>(
    savedDraft?.showInlineUnitForm ?? false
  );
  const [inlineUnitName, setInlineUnitName] = useState<string>(
    savedDraft?.inlineUnitName ?? ''
  );
  const [inlineUnitAbbr, setInlineUnitAbbr] = useState<string>(
    savedDraft?.inlineUnitAbbr ?? ''
  );
  const [inlineUnitError, setInlineUnitError] = useState<string | null>(null);

  // Stock Adjustment Filter & View State
  const [adjTypeFilter, setAdjTypeFilter] = useState<
    'all' | 'restock' | 'add_stock' | 'damage_spoilage' | 'return_in' | 'audit_correction'
  >('all');
  const [adjSearchQuery, setAdjSearchQuery] = useState<string>('');
  const [adjUserFilter, setAdjUserFilter] = useState<string>('all');
  const [adjProductFilter, setAdjProductFilter] = useState<string>('all');

  // Stock Adjustment Modal State
  const [stockAdjModalOpen, setStockAdjModalOpen] = useState<boolean>(false);
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [selectedProductForAdjId, setSelectedProductForAdjId] = useState<string>(
    shopProducts[0]?.id ?? ''
  );
  const [modalProductSearchQuery, setModalProductSearchQuery] = useState<string>('');
  const [adjType, setAdjType] = useState<StockAdjustmentType>('restock');
  const [adjQty, setAdjQty] = useState<string>('10');
  const [adjReason, setAdjReason] = useState<string>(
    'Supplier delivery — GRN Waybill'
  );
  const [stockAdjNotice, setStockAdjNotice] = useState<string | null>(null);

  // Receipt-Based Return State (Input Receipt Number -> Automatically Calls Up Editable Items)
  const [returnReceiptQuery, setReturnReceiptQuery] = useState<string>('');
  const [selectedReturnReceiptId, setSelectedReturnReceiptId] = useState<
    string | null
  >(null);
  const [returnEditedQuantities, setReturnEditedQuantities] = useState<
    Record<string, number>
  >({});
  const [returnReasonInput, setReturnReasonInput] = useState<string>(
    'Customer return with receipt — returned to active stock'
  );
  const [returnError, setReturnError] = useState<string | null>(null);

  // Dedicated Tab Category Form State
  const [newCatName, setNewCatName] = useState<string>(
    savedDraft?.newCatName ?? ''
  );
  const [newCatDesc, setNewCatDesc] = useState<string>(
    savedDraft?.newCatDesc ?? ''
  );
  const [tabCatError, setTabCatError] = useState<string | null>(null);

  // Dedicated Tab Unit Form State
  const [newUnitName, setNewUnitName] = useState<string>(
    savedDraft?.newUnitName ?? ''
  );
  const [newUnitAbbr, setNewUnitAbbr] = useState<string>(
    savedDraft?.newUnitAbbr ?? ''
  );

  // Bulk CSV Upload State
  const [bulkCsvModalOpen, setBulkCsvModalOpen] = useState<boolean>(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvParseResult, setCsvParseResult] = useState<InventoryCsvParseResult | null>(null);
  const [csvImportError, setCsvImportError] = useState<string | null>(null);
  const [isImportingCsv, setIsImportingCsv] = useState<boolean>(false);
  const [updateExistingSkus, setUpdateExistingSkus] = useState<boolean>(true);
  const [importSuccessSummary, setImportSuccessSummary] = useState<{
    importedCount: number;
    createdCategoriesCount: number;
    createdUnitsCount: number;
    totalInitialStockAdded: number;
    skippedCount: number;
  } | null>(null);

  // Delete Product Confirmation Modal State
  const [deleteConfirmModalOpen, setDeleteConfirmModalOpen] = useState<boolean>(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Deduplicate / Merge Duplicate Products State
  const [deduplicateModalOpen, setDeduplicateModalOpen] = useState<boolean>(false);
  const [isDeduplicating, setIsDeduplicating] = useState<boolean>(false);
  const [deduplicateSuccessMessage, setDeduplicateSuccessMessage] = useState<string | null>(null);

  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, Product[]>();
    shopProducts.forEach((p) => {
      const barcodeKey = p.barcode?.trim().toLowerCase();
      const skuKey = p.sku?.trim().toLowerCase();
      const nameKey = p.name?.trim().toLowerCase();

      const key = barcodeKey && barcodeKey !== 'none'
        ? `bc:${barcodeKey}`
        : skuKey
        ? `sku:${skuKey}`
        : `name:${nameKey}`;

      const list = groups.get(key) || [];
      list.push(p);
      groups.set(key, list);
    });

    const duplicates: Array<{
      key: string;
      name: string;
      barcode: string;
      sku: string;
      primaryProduct: Product;
      duplicateProducts: Product[];
      combinedStock: number;
    }> = [];

    groups.forEach((items, key) => {
      if (items.length > 1) {
        const sorted = [...items].sort((a, b) => {
          const tA = new Date(a.createdAt || 0).getTime();
          const tB = new Date(b.createdAt || 0).getTime();
          return tA - tB;
        });
        const primaryProduct = sorted[0];
        const duplicateProducts = sorted.slice(1);
        const combinedStock = items.reduce((sum, it) => sum + (it.stockQuantity || 0), 0);
        duplicates.push({
          key,
          name: primaryProduct.name,
          barcode: primaryProduct.barcode,
          sku: primaryProduct.sku,
          primaryProduct,
          duplicateProducts,
          combinedStock,
        });
      }
    });

    return duplicates;
  }, [shopProducts]);

  const handleExecuteDeduplication = async () => {
    if (!onDeduplicateProducts || duplicateGroups.length === 0) return;
    setIsDeduplicating(true);
    try {
      const result = await onDeduplicateProducts(shop.id);
      setDeduplicateSuccessMessage(
        `Merged ${result.mergedCount} product groups! Combined stock quantities and deleted ${result.removedCount} duplicate records.`
      );
      setDeduplicateModalOpen(false);
    } catch (err: any) {
      alert(err.message || 'Failed to merge duplicate products.');
    } finally {
      setIsDeduplicating(false);
    }
  };

  const openDeleteConfirmationModal = (product: Product) => {
    setProductToDelete(product);
    setDeleteConfirmModalOpen(true);
  };

  const handleConfirmDeleteProduct = () => {
    if (!productToDelete) return;
    setIsDeleting(true);
    try {
      if (onDeleteProduct) {
        onDeleteProduct(productToDelete.id);
      }
    } finally {
      setIsDeleting(false);
      setDeleteConfirmModalOpen(false);
      setProductToDelete(null);
    }
  };

  const handleFileSelected = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setCsvImportError('Please select a valid .csv file.');
      return;
    }
    setCsvFile(file);
    setCsvImportError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseInventoryCsvString(
        text,
        shopProducts,
        shopCategories,
        shopUnits
      );
      setCsvParseResult(parsed);
    };
    reader.onerror = () => {
      setCsvImportError('Failed to read the uploaded CSV file.');
    };
    reader.readAsText(file);
  };

  const handleExecuteBulkCsvImport = () => {
    if (!csvParseResult || csvParseResult.validItems.length === 0) {
      setCsvImportError('No valid product rows to import.');
      return;
    }

    setIsImportingCsv(true);
    setCsvImportError(null);

    try {
      // 1. Map existing and auto-create new categories
      const categoryMap = new Map<string, string>();
      shopCategories.forEach((c) =>
        categoryMap.set(c.name.trim().toLowerCase(), c.id)
      );

      let createdCatsCount = 0;
      csvParseResult.newCategoriesToCreate.forEach((catName) => {
        const key = catName.trim().toLowerCase();
        if (!categoryMap.has(key)) {
          const createdCat = onAddCategory(
            catName.trim(),
            'Auto-created via Bulk CSV Inventory Entry'
          );
          categoryMap.set(key, createdCat.id);
          createdCatsCount++;
        }
      });

      // 2. Map existing and auto-create new units
      const existingUnitSet = new Set(
        shopUnits.map((u) => u.name.trim().toLowerCase())
      );
      let createdUnitsCount = 0;
      csvParseResult.newUnitsToCreate.forEach((unitName) => {
        const key = unitName.trim().toLowerCase();
        if (!existingUnitSet.has(key)) {
          const abbr = key.slice(0, 4);
          onAddUnit(unitName.trim(), abbr);
          createdUnitsCount++;
        }
      });

      // 3. Import valid items
      let importedCount = 0;
      let totalStockAdded = 0;

      csvParseResult.validItems.forEach((item) => {
        const catId =
          categoryMap.get(item.categoryName.trim().toLowerCase()) ||
          shopCategories[0]?.id ||
          'cat-general';

        const productPayload: ProductFormInput = {
          name: item.name,
          sku: item.sku,
          barcode: item.barcode,
          categoryId: catId,
          unit: item.unit,
          costPrice: item.costPrice,
          sellingPrice: item.sellingPrice,
          stockQuantity: item.stockQuantity,
          reorderLevel: item.reorderLevel,
        };

        if (item.isExisting && item.existingProductId && updateExistingSkus) {
          onSaveProduct(productPayload, item.existingProductId);
          importedCount++;
        } else if (!item.isExisting) {
          onSaveProduct(productPayload);
          importedCount++;
          if (item.stockQuantity > 0) {
            totalStockAdded += item.stockQuantity;
          }
        }
      });

      setImportSuccessSummary({
        importedCount,
        createdCategoriesCount: createdCatsCount,
        createdUnitsCount: createdUnitsCount,
        totalInitialStockAdded: totalStockAdded,
        skippedCount: csvParseResult.errors.length,
      });

      // Clear draft file selection
      setCsvFile(null);
      setCsvParseResult(null);
    } catch (err: any) {
      setCsvImportError(
        err.message || 'An unexpected error occurred during CSV import.'
      );
    } finally {
      setIsImportingCsv(false);
    }
  };
  const [tabUnitError, setTabUnitError] = useState<string | null>(null);

  React.useEffect(() => {
    const serialized = JSON.stringify({
      activeSubTab,
      settingsSection,
      searchQuery,
      selectedCategoryId,
      productModalOpen,
      editingProductId: editingProduct?.id ?? null,
      formState,
      showInlineCategoryForm,
      inlineCatName,
      inlineCatDesc,
      showInlineUnitForm,
      inlineUnitName,
      inlineUnitAbbr,
      newCatName,
      newCatDesc,
      newUnitName,
      newUnitAbbr,
    });
    try {
      window.sessionStorage.setItem(draftStorageKey, serialized);
    } catch {
      // Ignore storage quota errors
    }
    try {
      window.localStorage.setItem(draftStorageKey, serialized);
    } catch {
      // Ignore storage quota errors
    }
  }, [
    draftStorageKey,
    activeSubTab,
    settingsSection,
    searchQuery,
    selectedCategoryId,
    productModalOpen,
    editingProduct,
    formState,
    showInlineCategoryForm,
    inlineCatName,
    inlineCatDesc,
    showInlineUnitForm,
    inlineUnitName,
    inlineUnitAbbr,
    newCatName,
    newCatDesc,
    newUnitName,
    newUnitAbbr,
  ]);

  const symbol = business.currencySymbol;

  const filteredProducts = filterShopProducts(
    shopProducts,
    shop.id,
    business.id,
    {
      searchQuery,
      categoryId: selectedCategoryId,
    }
  );

  const resetInlineBuilders = () => {
    setShowInlineCategoryForm(false);
    setInlineCatName('');
    setInlineCatDesc('');
    setInlineCatError(null);

    setShowInlineUnitForm(false);
    setInlineUnitName('');
    setInlineUnitAbbr('');
    setInlineUnitError(null);
    setInlineNotice(null);
  };

  const openAddProductModal = () => {
    setEditingProduct(null);
    setHasBarcodeToggle(false);
    const nextNum = 100 + shopProducts.length + 1;
    setFormState({
      name: '',
      sku: `${shop.code.split('-')[0]}-ITM-${nextNum}`,
      barcode: '',
      categoryId: shopCategories[0]?.id ?? '',
      unit: shopUnits[0]?.name ?? 'Pack',
      costPrice: 1500,
      sellingPrice: 2200,
      stockQuantity: 20,
      reorderLevel: 8,
      hasExpiry: false,
      expiryDate: '',
    });
    setFormError(null);
    resetInlineBuilders();
    setProductModalOpen(true);
  };

  const openEditProductModal = (product: Product) => {
    setEditingProduct(product);
    const hasExistingBarcode = Boolean(
      product.barcode &&
      product.barcode.trim() !== '' &&
      product.barcode.toLowerCase() !== 'none'
    );
    setHasBarcodeToggle(hasExistingBarcode);
    setFormState({
      name: product.name,
      sku: product.sku,
      barcode: product.barcode || '',
      categoryId: product.categoryId,
      unit: product.unit,
      costPrice: product.costPrice,
      sellingPrice: product.sellingPrice,
      stockQuantity: product.stockQuantity,
      reorderLevel: product.reorderLevel,
      hasExpiry: Boolean(product.hasExpiry),
      expiryDate: product.expiryDate || '',
    });
    setFormError(null);
    resetInlineBuilders();
    setProductModalOpen(true);
  };

  const handleSaveInlineCategory = () => {
    const check = validateCategoryInput(inlineCatName, shopCategories);
    if (!check.valid) {
      setInlineCatError(check.error ?? 'Invalid category name.');
      return;
    }
    const created = onAddCategory(inlineCatName.trim(), inlineCatDesc.trim());
    setFormState((prev) => ({ ...prev, categoryId: created.id }));
    setShowInlineCategoryForm(false);
    setInlineCatName('');
    setInlineCatDesc('');
    setInlineCatError(null);
    setInlineNotice(`Created and selected category "${created.name}".`);
  };

  const handleSaveInlineUnit = () => {
    const check = validateUnitInput(inlineUnitName, shopUnits);
    if (!check.valid) {
      setInlineUnitError(check.error ?? 'Invalid unit of measurement.');
      return;
    }
    const created = onAddUnit(
      inlineUnitName.trim(),
      inlineUnitAbbr.trim() || inlineUnitName.trim().toLowerCase().slice(0, 4)
    );
    setFormState((prev) => ({ ...prev, unit: created.name }));
    setShowInlineUnitForm(false);
    setInlineUnitName('');
    setInlineUnitAbbr('');
    setInlineUnitError(null);
    setInlineNotice(`Created and selected unit of measurement "${created.name}".`);
  };

  const existingProductWithBarcode = useMemo(() => {
    const rawBc = formState.barcode?.trim();
    if (!rawBc) return undefined;
    return shopProducts.find(
      (p) =>
        p.id !== editingProduct?.id &&
        p.barcode &&
        p.barcode.trim().toLowerCase() === rawBc.toLowerCase()
    );
  }, [formState.barcode, shopProducts, editingProduct]);

  const handleProductFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveBarcode =
      hasBarcodeToggle && formState.barcode.trim()
        ? formState.barcode.trim()
        : formState.sku.trim();

    const payload: ProductFormInput = {
      ...formState,
      barcode: effectiveBarcode,
    };

    const validation = validateProductInput(
      payload,
      shopProducts,
      editingProduct?.id
    );
    if (!validation.valid) {
      setFormError(validation.error ?? 'Please check product fields.');
      return;
    }
    onSaveProduct(payload, editingProduct?.id);
    setProductModalOpen(false);
  };

  const openStockAdjustmentModal = (
    type: StockAdjustmentType = 'restock',
    product?: Product | null
  ) => {
    const effectiveType =
      type === 'return_in' && currentUser && !hasPermission(currentUser, 'process_returns')
        ? 'restock'
        : type;
    const targetProduct =
      product ??
      (shopProducts.find((p) => p.id === selectedProductForAdjId) ||
        shopProducts[0] ||
        null);
    setAdjustingProduct(targetProduct);
    if (targetProduct) {
      setSelectedProductForAdjId(targetProduct.id);
    }
    setAdjType(effectiveType);
    setAdjQty('10');
    setModalProductSearchQuery('');
    if (effectiveType === 'restock') {
      setAdjReason('Supplier delivery — GRN Waybill');
    } else if (type === 'add_stock') {
      setAdjReason('Storeroom recount surplus / found inventory');
    } else if (type === 'damage_spoilage') {
      setAdjReason('Damaged packaging / spoiled items written off');
    } else if (type === 'return_in') {
      setAdjReason('Customer return with receipt — returned to active stock');
    } else {
      setAdjReason('Routine inventory count reconciliation');
    }
    setStockAdjModalOpen(true);
  };

  const handleStockAdjustmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveProduct =
      adjustingProduct ||
      shopProducts.find((p) => p.id === selectedProductForAdjId);
    if (!effectiveProduct) return;
    const parsedQty = parseInt(adjQty, 10);
    if (Number.isNaN(parsedQty) || parsedQty <= 0) return;

    onRecordStockAdjustment(
      effectiveProduct.id,
      adjType,
      parsedQty,
      adjReason.trim() || 'Manual stock adjustment'
    );
    setStockAdjModalOpen(false);
    setAdjustingProduct(null);
    if (
      adjTypeFilter !== 'all' &&
      adjTypeFilter !== adjType &&
      (adjType === 'restock' ||
        adjType === 'add_stock' ||
        adjType === 'damage_spoilage' ||
        adjType === 'return_in' ||
        adjType === 'audit_correction')
    ) {
      setAdjTypeFilter(adjType);
    }

    const typeLabels: Record<StockAdjustmentType, string> = {
      restock: 'Restock (+)',
      add_stock: 'Add Stock (+)',
      damage_spoilage: 'Damage & Spoilage (-)',
      return_in: 'Return (+)',
      audit_correction: 'Audit correction (±)',
      sale_deduction: 'Sale deduction',
    };
    setStockAdjNotice(
      `Recorded ${typeLabels[adjType]} for ${effectiveProduct.name} (${parsedQty} ${effectiveProduct.unit}s). Listed under All Adjustments and ${formatAdjustmentTypeLabel(adjType)}.`
    );
  };

  // =========================================================================
  // RECEIPT-BASED RETURN HANDLERS (AUTOMATIC RECEIPT LOOKUP & ITEM REDUCTION)
  // =========================================================================
  const activeReturnReceipt = useMemo(() => {
    if (selectedReturnReceiptId) {
      const byId = shopSales.find((s) => s.id === selectedReturnReceiptId);
      if (byId) return byId;
    }
    return findReceiptByNumber(shopSales, returnReceiptQuery);
  }, [shopSales, selectedReturnReceiptId, returnReceiptQuery]);

  const matchingReturnReceipts = useMemo(
    () => findMatchingReceipts(shopSales, returnReceiptQuery),
    [shopSales, returnReceiptQuery]
  );

  const selectReceiptForReturn = (sale: SaleTransaction) => {
    setReturnReceiptQuery(sale.receiptNumber);
    setSelectedReturnReceiptId(sale.id);
    const initialMap: Record<string, number> = {};
    sale.items.forEach((line) => {
      initialMap[line.id] = line.quantity;
    });
    setReturnEditedQuantities(initialMap);
    setReturnError(null);
  };

  const handleReturnReceiptInputChange = (value: string) => {
    setReturnReceiptQuery(value);
    setReturnError(null);
    const matched = findReceiptByNumber(shopSales, value);
    if (matched) {
      setSelectedReturnReceiptId(matched.id);
      const initialMap: Record<string, number> = {};
      matched.items.forEach((line) => {
        initialMap[line.id] = line.quantity;
      });
      setReturnEditedQuantities(initialMap);
    } else {
      setSelectedReturnReceiptId(null);
      setReturnEditedQuantities({});
    }
  };

  const handleUpdateReturnLineQty = (
    lineId: string,
    nextQty: number,
    maxOriginalQty: number
  ) => {
    const clamped = Math.max(0, Math.min(maxOriginalQty, Math.floor(nextQty)));
    setReturnEditedQuantities((prev) => ({
      ...prev,
      [lineId]: clamped,
    }));
    setReturnError(null);
  };

  const returnCalculation = useMemo(() => {
    if (!activeReturnReceipt) return null;
    return calculateReceiptReturnResult(
      activeReturnReceipt,
      returnEditedQuantities
    );
  }, [activeReturnReceipt, returnEditedQuantities]);

  const handleConfirmReceiptReturn = (
    e: React.FormEvent,
    closeModalOnSuccess: boolean
  ) => {
    e.preventDefault();
    if (!activeReturnReceipt || !returnCalculation) {
      setReturnError('Please enter a valid receipt number first.');
      return;
    }
    if (returnCalculation.totalReturnedUnits <= 0) {
      setReturnError(
        'Please reduce the quantity of at least one item on the receipt to process a return.'
      );
      return;
    }

    if (onProcessReceiptReturn) {
      onProcessReceiptReturn(
        activeReturnReceipt.id,
        returnEditedQuantities,
        returnReasonInput.trim() || 'Customer receipt return'
      );
    } else {
      returnCalculation.returnedItems.forEach((retItem) => {
        onRecordStockAdjustment(
          retItem.productId,
          'return_in',
          retItem.returnedQuantity,
          `Receipt #${activeReturnReceipt.receiptNumber} Return: Reduced qty from ${retItem.originalQuantity} to ${retItem.remainingQuantity} — ${returnReasonInput.trim()}`
        );
      });
    }

    setStockAdjNotice(
      `Processed return on Receipt #${activeReturnReceipt.receiptNumber}: Reduced ${returnCalculation.returnedItems.length} item(s), returned +${returnCalculation.totalReturnedUnits} unit(s) to ${shop.code} stock, and listed under All Adjustments & Return.`
    );

    if (adjTypeFilter !== 'all' && adjTypeFilter !== 'return_in') {
      setAdjTypeFilter('return_in');
    }

    // Sync edited quantities to reflect the newly reduced receipt state
    const nextMap: Record<string, number> = {};
    returnCalculation.updatedSale.items.forEach((line) => {
      nextMap[line.id] = line.quantity;
    });
    setReturnEditedQuantities(nextMap);
    setReturnError(null);

    if (closeModalOnSuccess) {
      setStockAdjModalOpen(false);
    }
  };

  const renderReceiptReturnPanel = (isInsideModal: boolean) => {
    if (currentUser && !hasPermission(currentUser, 'process_returns')) {
      return (
        <div className="p-6 text-center space-y-3 bg-slate-50 border border-slate-200 rounded-xl my-2">
          <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-slate-900">Return Access Restricted</h4>
          <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
            Cashiers are not authorized to process receipt or product returns. Please contact a Shop Manager or Business Owner to process returns.
          </p>
        </div>
      );
    }

    return (
      <form
        onSubmit={(e) => handleConfirmReceiptReturn(e, isInsideModal)}
        className="space-y-4 text-xs"
      >
        {/* Step 1: Receipt Number Lookup Input */}
        <div className="p-3.5 rounded-xl bg-purple-50/70 border border-purple-200 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <label
              htmlFor={
                isInsideModal
                  ? 'modal-return-receipt-input'
                  : 'inline-return-receipt-input'
              }
              className="font-display font-bold text-slate-900 flex items-center gap-1.5 text-xs sm:text-sm"
            >
              <ReceiptText className="w-4 h-4 text-purple-700 shrink-0" />
              <span>Input Receipt Number to Call Up Items</span>
            </label>
            <span className="text-[11px] text-purple-800 font-semibold">
              {shopSales.length} Receipt{shopSales.length === 1 ? '' : 's'} in{' '}
              {shop.code}
            </span>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-purple-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id={
                isInsideModal
                  ? 'modal-return-receipt-input'
                  : 'inline-return-receipt-input'
              }
              type="text"
              value={returnReceiptQuery}
              onChange={(e) => handleReturnReceiptInputChange(e.target.value)}
              placeholder={`Enter receipt number (e.g. ${
                shopSales[0]?.receiptNumber || 'VI-2026-0901'
              })...`}
              className="w-full pl-9 pr-8 py-2.5 bg-white border border-purple-300 rounded-lg font-mono font-bold text-slate-900 text-xs focus:outline-hidden focus:ring-2 focus:ring-purple-500/25 focus:border-purple-600"
            />
            {returnReceiptQuery && (
              <button
                type="button"
                onClick={() => {
                  setReturnReceiptQuery('');
                  setSelectedReturnReceiptId(null);
                  setReturnEditedQuantities({});
                  setReturnError(null);
                }}
                aria-label="Clear receipt number"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 font-bold text-sm cursor-pointer"
              >
                ×
              </button>
            )}
          </div>

          {/* Quick-Select Shop Receipts Strip */}
          {shopSales.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-800">
                Recent Receipts:
              </span>
              {matchingReturnReceipts.slice(0, 6).map((sale) => {
                const isSelected = activeReturnReceipt?.id === sale.id;
                return (
                  <button
                    key={sale.id}
                    type="button"
                    onClick={() => selectReceiptForReturn(sale)}
                    className={`px-2 py-1 rounded-md font-mono text-[11px] font-semibold transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-purple-700 text-white shadow-2xs'
                        : 'bg-white border border-purple-200 text-purple-900 hover:bg-purple-100'
                    }`}
                  >
                    {sale.receiptNumber} ({sale.items.length} item
                    {sale.items.length === 1 ? '' : 's'})
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Step 2: Automatically Called-Up Receipt Items (Editable to Reduce & Return) */}
        {!activeReturnReceipt ? (
          <div className="p-6 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-center space-y-1.5">
            <ReceiptText className="w-7 h-7 text-slate-400 mx-auto" />
            <p className="font-semibold text-slate-700 text-xs">
              {returnReceiptQuery.trim()
                ? `No receipt matching "${returnReceiptQuery.trim()}" found in ${shop.code}.`
                : 'Enter a receipt number above or click a recent receipt to call up its items.'}
            </p>
            <p className="text-[11px] text-slate-500">
              Once a receipt is called up, its items will appear here so you can reduce the quantity of any item being returned.
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {/* Receipt Metadata Banner */}
            <div className="p-3 rounded-xl bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-sm text-purple-300">
                    {activeReturnReceipt.receiptNumber}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-purple-500/20 border border-purple-400/30 text-purple-200 text-[10px] font-semibold">
                    {activeReturnReceipt.items.length} Line Item
                    {activeReturnReceipt.items.length === 1 ? '' : 's'} Called Up
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Date: {activeReturnReceipt.createdAt} · Cashier:{' '}
                  {activeReturnReceipt.cashierName} · Payment:{' '}
                  <span className="capitalize">
                    {activeReturnReceipt.paymentMethod.replace('_', ' ')}
                  </span>
                </p>
              </div>
              <div className="text-right font-mono">
                <span className="text-[10px] text-slate-400 block uppercase">
                  Receipt Total
                </span>
                <strong className="text-sm text-white">
                  {formatCurrency(activeReturnReceipt.totalAmount, symbol)}
                </strong>
              </div>
            </div>

            {/* Editable Items Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="font-bold text-slate-800">
                  Editable Receipt Items (Reduce Qty to Return Item)
                </span>
                <span className="text-[11px] text-purple-700 font-semibold">
                  Use − or edit quantity to reduce returned items
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {activeReturnReceipt.items.map((line) => {
                  const currentQty =
                    returnEditedQuantities[line.id] !== undefined
                      ? returnEditedQuantities[line.id]
                      : line.quantity;
                  const returnedQty = Math.max(0, line.quantity - currentQty);
                  const returnedVal = returnedQty * line.unitPrice;
                  const newLineTotal = currentQty * line.unitPrice;

                  return (
                    <div
                      key={line.id}
                      className={`p-3 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        returnedQty > 0 ? 'bg-purple-50/60' : 'hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900">
                            {line.productName}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500">
                            ({line.sku})
                          </span>
                          {returnedQty > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 font-bold text-[10px]">
                              Returning {returnedQty} unit
                              {returnedQty === 1 ? '' : 's'} (+{returnedQty} to Stock)
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex flex-wrap items-center gap-2">
                          <span>
                            Unit Price: {formatCurrency(line.unitPrice, symbol)}
                          </span>
                          <span>·</span>
                          <span>Original Qty: {line.quantity}</span>
                          <span>·</span>
                          <span className="font-semibold text-slate-800">
                            New Line Total: {formatCurrency(newLineTotal, symbol)}
                          </span>
                          {returnedQty > 0 && (
                            <span className="text-purple-700 font-bold">
                              (−{formatCurrency(returnedVal, symbol)} Refund)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Editable Quantity Controls */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex flex-col items-end mr-1">
                          <span className="text-[10px] uppercase font-bold text-slate-400">
                            Receipt Qty
                          </span>
                        </div>
                        <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white p-0.5">
                          <button
                            type="button"
                            disabled={currentQty <= 0}
                            onClick={() =>
                              handleUpdateReturnLineQty(
                                line.id,
                                currentQty - 1,
                                line.quantity
                              )
                            }
                            aria-label={`Reduce quantity of ${line.productName}`}
                            className="p-1.5 rounded-md text-slate-700 hover:bg-purple-100 hover:text-purple-900 disabled:opacity-40 cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={line.quantity}
                            aria-label={`Editable quantity for ${line.productName}`}
                            value={currentQty}
                            onChange={(e) =>
                              handleUpdateReturnLineQty(
                                line.id,
                                parseInt(e.target.value, 10) || 0,
                                line.quantity
                              )
                            }
                            className="w-12 text-center font-mono font-bold text-xs text-slate-900 focus:outline-hidden"
                          />
                          <button
                            type="button"
                            disabled={currentQty >= line.quantity}
                            onClick={() =>
                              handleUpdateReturnLineQty(
                                line.id,
                                currentQty + 1,
                                line.quantity
                              )
                            }
                            aria-label={`Increase quantity of ${line.productName}`}
                            className="p-1.5 rounded-md text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {currentQty > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateReturnLineQty(line.id, 0, line.quantity)
                            }
                            className="px-2 py-1.5 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-800 font-semibold text-[11px] cursor-pointer"
                          >
                            Return All
                          </button>
                        )}
                        {returnedQty > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateReturnLineQty(
                                line.id,
                                line.quantity,
                                line.quantity
                              )
                            }
                            className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 font-semibold text-[11px] cursor-pointer"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Live Return Summary Strip */}
            {returnCalculation && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Units Returning to Stock
                  </span>
                  <strong className="text-sm font-mono font-bold text-purple-700">
                    +{returnCalculation.totalReturnedUnits} unit(s)
                  </strong>
                </div>
                <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Amount Reduced (Refund)
                  </span>
                  <strong className="text-sm font-mono font-bold text-rose-700">
                    −{formatCurrency(returnCalculation.totalRefundAmount, symbol)}
                  </strong>
                </div>
                <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Updated Receipt Total
                  </span>
                  <strong className="text-sm font-mono font-bold text-emerald-700">
                    {formatCurrency(returnCalculation.newTotalAmount, symbol)}
                  </strong>
                </div>
              </div>
            )}

            {/* Return Reason Input */}
            <div className="space-y-1.5">
              <label className="block font-semibold text-slate-700">
                Return Reason / Audit Note
              </label>
              <input
                type="text"
                required
                value={returnReasonInput}
                onChange={(e) => setReturnReasonInput(e.target.value)}
                placeholder="e.g. Customer return with receipt"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              />
            </div>

            {returnError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{returnError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              {isInsideModal && (
                <button
                  type="button"
                  onClick={() => {
                    setStockAdjModalOpen(false);
                    setAdjustingProduct(null);
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={!returnCalculation || returnCalculation.totalReturnedUnits <= 0}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>
                  Confirm Return &amp; Update Receipt (
                  +{returnCalculation?.totalReturnedUnits ?? 0} Units)
                </span>
              </button>
            </div>
          </div>
        )}
      </form>
    );
  };

  // Stock Adjustments strictly isolated on their own — never mixed with sales!
  const operationalAdjustments = useMemo(() => {
    return shopAdjustments.filter((a) => a.type !== 'sale_deduction');
  }, [shopAdjustments]);

  const restockCount = useMemo(
    () => operationalAdjustments.filter((a) => a.type === 'restock').length,
    [operationalAdjustments]
  );
  const addStockCount = useMemo(
    () => operationalAdjustments.filter((a) => a.type === 'add_stock').length,
    [operationalAdjustments]
  );
  const damageCount = useMemo(
    () => operationalAdjustments.filter((a) => a.type === 'damage_spoilage').length,
    [operationalAdjustments]
  );
  const returnCount = useMemo(
    () => operationalAdjustments.filter((a) => a.type === 'return_in').length,
    [operationalAdjustments]
  );
  const auditCount = useMemo(
    () => operationalAdjustments.filter((a) => a.type === 'audit_correction').length,
    [operationalAdjustments]
  );

  const totalUnitsRestocked = useMemo(
    () =>
      operationalAdjustments
        .filter((a) => a.type === 'restock')
        .reduce((sum, a) => sum + Math.max(0, a.quantityDelta), 0),
    [operationalAdjustments]
  );
  const totalUnitsAdded = useMemo(
    () =>
      operationalAdjustments
        .filter((a) => a.type === 'add_stock')
        .reduce((sum, a) => sum + Math.max(0, a.quantityDelta), 0),
    [operationalAdjustments]
  );
  const totalUnitsDamaged = useMemo(
    () =>
      operationalAdjustments
        .filter((a) => a.type === 'damage_spoilage')
        .reduce((sum, a) => sum + Math.abs(a.quantityDelta), 0),
    [operationalAdjustments]
  );
  const totalUnitsReturned = useMemo(
    () =>
      operationalAdjustments
        .filter((a) => a.type === 'return_in')
        .reduce((sum, a) => sum + Math.max(0, a.quantityDelta), 0),
    [operationalAdjustments]
  );

  const uniqueOperators = useMemo(() => {
    const map = new Map<string, string>();
    operationalAdjustments.forEach((a) => {
      map.set(a.performedByUserId, a.performedByName);
    });
    if (currentUser) {
      map.set(currentUser.id, currentUser.fullName);
    }
    if (allUsers) {
      allUsers.forEach((u) => {
        if (u.businessId === business.id) {
          map.set(u.id, u.fullName);
        }
      });
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [operationalAdjustments, currentUser, allUsers, business.id]);

  const filteredAdjustments = useMemo(() => {
    return filterStockAdjustments(operationalAdjustments, {
      type: adjTypeFilter,
      searchQuery: adjSearchQuery,
      userId: adjUserFilter,
      productId: adjProductFilter,
    });
  }, [
    operationalAdjustments,
    adjTypeFilter,
    adjSearchQuery,
    adjUserFilter,
    adjProductFilter,
  ]);

  const matchingModalProducts = useMemo(() => {
    if (!modalProductSearchQuery.trim()) {
      return shopProducts;
    }
    const q = modalProductSearchQuery.toLowerCase().trim();
    return shopProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        p.categoryName.toLowerCase().includes(q)
    );
  }, [shopProducts, modalProductSearchQuery]);

  const handleCreateCategoryInTab = (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateCategoryInput(newCatName, shopCategories);
    if (!check.valid) {
      setTabCatError(check.error ?? 'Invalid category name.');
      return;
    }
    const created = onAddCategory(newCatName.trim(), newCatDesc.trim());
    setNewCatName('');
    setNewCatDesc('');
    setTabCatError(null);
    setSettingsSuccessNotice(
      `Category "${created.name}" created successfully for ${shop.code}! It is now available when adding or editing products.`
    );
  };

  const handleCreateUnitInTab = (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateUnitInput(newUnitName, shopUnits);
    if (!check.valid) {
      setTabUnitError(check.error ?? 'Invalid unit name.');
      return;
    }
    const abbr =
      newUnitAbbr.trim() || newUnitName.trim().toLowerCase().slice(0, 4);
    const created = onAddUnit(newUnitName.trim(), abbr);
    setNewUnitName('');
    setNewUnitAbbr('');
    setTabUnitError(null);
    setSettingsSuccessNotice(
      `Unit "${created.name}" (${created.abbreviation}) created successfully for ${shop.code}! It is now available when adding or editing products.`
    );
  };

  const filteredCategories = React.useMemo(() => {
    if (!settingsSearchQuery.trim()) return shopCategories;
    const q = settingsSearchQuery.toLowerCase();
    return shopCategories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
    );
  }, [shopCategories, settingsSearchQuery]);

  const filteredUnits = React.useMemo(() => {
    if (!settingsSearchQuery.trim()) return shopUnits;
    const q = settingsSearchQuery.toLowerCase();
    return shopUnits.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.abbreviation.toLowerCase().includes(q)
    );
  }, [shopUnits, settingsSearchQuery]);

  // Ensure current formState.unit is always represented in unit options
  const unitOptions = React.useMemo(() => {
    const names = new Set(shopUnits.map((u) => u.name));
    const list = [...shopUnits];
    if (formState.unit && !names.has(formState.unit)) {
      list.push({
        id: 'custom-current-unit',
        shopId: shop.id,
        businessId: business.id,
        name: formState.unit,
        abbreviation: formState.unit.toLowerCase().slice(0, 4),
      });
    }
    return list;
  }, [shopUnits, formState.unit, shop.id, business.id]);

  return (
    <div className="p-3.5 sm:p-5 lg:p-6 space-y-4 sm:space-y-6 max-w-[1440px] mx-auto">
      {/* Header & Sub-Navigation */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveSubTab('catalogue')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer shrink-0 min-h-[38px] ${
              activeSubTab === 'catalogue'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Catalogue ({shopProducts.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('adjustments')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer shrink-0 min-h-[38px] ${
              activeSubTab === 'adjustments'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>Stock Adjustments ({operationalAdjustments.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSubTab('settings');
              if (settingsSuccessNotice) setSettingsSuccessNotice(null);
            }}
            className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer shrink-0 min-h-[38px] ${
              activeSubTab === 'settings' ||
              activeSubTab === 'categories' ||
              activeSubTab === 'units'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>
              Product Settings ({shopCategories.length} Categories · {shopUnits.length} Units)
            </span>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 shrink-0">
          <span className="text-xs font-mono text-slate-500 hidden xl:inline mr-1">
            Scope: <strong className="text-slate-800">{shop.code}</strong>
          </span>
          {duplicateGroups.length > 0 && onDeduplicateProducts && (
            <button
              type="button"
              onClick={() => setDeduplicateModalOpen(true)}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap min-h-[40px] shadow-xs animate-pulse"
              title="Merge duplicate products and combine their stock quantities"
            >
              <Layers className="w-4 h-4" />
              <span>Merge Duplicates ({duplicateGroups.length})</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => downloadInventoryCsvTemplate()}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap min-h-[40px]"
            title="Download standard CSV inventory template file with sample rows"
          >
            <Download className="w-4 h-4 text-emerald-700" />
            <span className="hidden sm:inline">Download CSV Template</span>
            <span className="sm:hidden">CSV Template</span>
          </button>
          <button
            type="button"
            onClick={() => setBulkCsvModalOpen(true)}
            className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-900 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap min-h-[40px]"
            title="Upload filled CSV file to populate inventory items"
          >
            <Upload className="w-4 h-4 text-purple-700" />
            <span>Bulk Import CSV</span>
          </button>
          <button
            type="button"
            onClick={openAddProductModal}
            className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap min-h-[40px] shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add Product ({shop.code})</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: PRODUCT CATALOGUE */}
      {activeSubTab === 'catalogue' && (
        <>
          {deduplicateSuccessMessage && (
            <div className="mb-4 p-4 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-950 shadow-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="text-xs font-bold text-emerald-900">{deduplicateSuccessMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setDeduplicateSuccessMessage(null)}
                className="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {duplicateGroups.length > 0 && onDeduplicateProducts && (
            <div className="mb-4 p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-950 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-200/80 flex items-center justify-center shrink-0 text-amber-800">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-amber-950">
                    Duplicate Products Detected ({duplicateGroups.length} items affected)
                  </h4>
                  <p className="text-xs text-amber-800 mt-0.5">
                    We found multiple records with identical barcodes or SKUs in <strong>{shop.name}</strong>. You can merge them into single products and combine their stock quantities automatically.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeduplicateModalOpen(true)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs shrink-0 cursor-pointer transition shadow-xs flex items-center gap-2"
              >
                <Layers className="w-4 h-4" />
                <span>Review &amp; Merge Duplicates ({duplicateGroups.length})</span>
              </button>
            </div>
          )}

          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <label htmlFor="inv-search-input" className="sr-only">
                Search products
              </label>
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="inv-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by product name, SKU, or barcode..."
                className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-600"
              />
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="inv-cat-select" className="text-xs text-slate-500">
                Category:
              </label>
              <select
                id="inv-cat-select"
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 font-medium"
              >
                <option value="all">All Categories ({shopProducts.length})</option>
                {shopCategories.map((cat, idx) => (
                  <option key={`${cat.id}-${idx}`} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Mobile Card List View (< sm) */}
          <div className="sm:hidden divide-y divide-slate-100">
            {filteredProducts.map((product, idx) => {
              const isLow = product.stockQuantity <= product.reorderLevel;
              return (
                <div key={`${product.id}-${idx}`} className="p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 text-sm truncate">
                        {product.name}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-slate-500 font-mono mt-0.5 flex-wrap">
                        <span className="font-semibold text-slate-700">{product.sku}</span>
                        {product.barcode && <span>· {product.barcode}</span>}
                        {product.hasExpiry && product.expiryDate && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            <Calendar className="w-2.5 h-2.5 text-amber-600" />
                            Exp: {product.expiryDate}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 shrink-0">
                      {product.categoryName}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-lg text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Cost</span>
                      <span className="font-mono tabular-nums text-slate-600">
                        {formatCurrency(product.costPrice, symbol)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Price</span>
                      <span className="font-mono tabular-nums font-bold text-emerald-700">
                        {formatCurrency(product.sellingPrice, symbol)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">In Stock</span>
                      <span className={`font-mono tabular-nums font-bold ${isLow ? 'text-amber-700' : 'text-slate-900'}`}>
                        {product.stockQuantity} {product.unit}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => openEditProductModal(product)}
                      aria-label={`Edit ${product.name}`}
                      className="flex-1 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openStockAdjustmentModal('restock', product)}
                      aria-label={`Adjust stock for ${product.name}`}
                      className="flex-1 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-800 border border-emerald-200 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]"
                    >
                      <ArrowUpDown className="w-3.5 h-3.5" />
                      <span>Adjust Stock</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openDeleteConfirmationModal(product)}
                      aria-label={`Delete ${product.name}`}
                      title={`Delete ${product.name}`}
                      className="p-2 rounded-lg bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 border border-rose-200 font-semibold text-xs flex items-center justify-center gap-1 cursor-pointer min-h-[40px] shrink-0 min-w-[40px]"
                    >
                      <Trash2 className="w-4 h-4 text-rose-600" />
                      <span className="sr-only">Delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop & Tablet Table View (>= sm) */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-xs text-slate-500">
                  <th className="py-3 px-4 font-medium">SKU &amp; Barcode</th>
                  <th className="py-3 px-4 font-medium">Product Name</th>
                  <th className="py-3 px-4 font-medium">Category</th>
                  <th className="py-3 px-4 font-medium text-right">Cost Price</th>
                  <th className="py-3 px-4 font-medium text-right">Selling Price</th>
                  <th className="py-3 px-4 font-medium text-right">Stock Qty</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredProducts.map((product, idx) => {
                  const isLow = product.stockQuantity <= product.reorderLevel;
                  return (
                    <tr
                      key={`${product.id}-${idx}`}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono">
                        <span className="font-semibold text-slate-900">
                          {product.sku}
                        </span>
                        <div className="text-slate-400">{product.barcode}</div>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">
                          {product.name}
                        </p>
                        <div className="flex items-center gap-2 text-slate-500 flex-wrap">
                          <span>Unit: {product.unit}</span>
                          {product.hasExpiry && product.expiryDate && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              <Calendar className="w-2.5 h-2.5 text-amber-600" />
                              Exp: {product.expiryDate}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {product.categoryName}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-600">
                        {formatCurrency(product.costPrice, symbol)}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums font-semibold text-right text-slate-900">
                        {formatCurrency(product.sellingPrice, symbol)}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-right">
                        <span
                          className={`font-bold ${
                            isLow ? 'text-amber-700' : 'text-slate-900'
                          }`}
                        >
                          {product.stockQuantity}
                        </span>
                        <div className="text-slate-400">
                          Reorder ≤ {product.reorderLevel}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditProductModal(product)}
                            aria-label={`Edit ${product.name}`}
                            className="px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-100 text-slate-700 font-medium inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openStockAdjustmentModal('restock', product)}
                            aria-label={`Adjust stock for ${product.name}`}
                            className="px-2.5 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-medium inline-flex items-center gap-1 cursor-pointer"
                          >
                            <ArrowUpDown className="w-3 h-3" />
                            <span>Adjust Stock</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openDeleteConfirmationModal(product)}
                            aria-label={`Delete ${product.name}`}
                            title={`Delete ${product.name}`}
                            className="p-1.5 rounded bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 border border-rose-200 font-medium inline-flex items-center justify-center gap-1 cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            <span className="sr-only">Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        </>
      )}

      {/* SUB-TAB 2: PRODUCT SETTINGS (Categories & Units of Measurement) */}
      {(activeSubTab === 'settings' ||
        activeSubTab === 'categories' ||
        activeSubTab === 'units') && (
        <div className="space-y-4">
          {/* Product Settings Hub Header Card */}
          <section
            aria-label="Product Master Data Settings"
            className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                  <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-display font-bold text-slate-900">
                    Product Settings &amp; Master Data — {shop.name}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configure Units of Measurement and Categories for this shop ({shop.code}). All added entries are automatically available in the Add Product form and POS catalogue.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={openAddProductModal}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap min-h-[40px] shrink-0 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Product using these Settings</span>
              </button>
            </div>

            {/* Product Settings Segmented Sub-Tabs */}
            <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="inline-flex rounded-lg bg-slate-100 p-1 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setSettingsSection('categories')}
                  className={`px-3.5 py-2 rounded-md text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer min-h-[38px] ${
                    settingsSection === 'categories'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FolderKanban className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Categories ({shopCategories.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsSection('units')}
                  className={`px-3.5 py-2 rounded-md text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer min-h-[38px] ${
                    settingsSection === 'units'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Scale className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Units of Measurement ({shopUnits.length})</span>
                </button>
              </div>

              <div className="text-xs text-slate-500 flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>
                  {settingsSection === 'categories'
                    ? `${shopCategories.length} categories active in ${shop.code}`
                    : `${shopUnits.length} measurement units active in ${shop.code}`}
                </span>
              </div>
            </div>
          </section>

          {/* Success Feedback Notice Banner */}
          {settingsSuccessNotice && (
            <div
              role="status"
              className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between gap-3 shadow-xs"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-medium">{settingsSuccessNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setSettingsSuccessNotice(null)}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800 underline cursor-pointer shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* SECTION A: CATEGORIES */}
          {settingsSection === 'categories' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Category List */}
              <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-display font-bold text-slate-900">
                      Categories in {shop.name} ({shop.code})
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      All categories below appear in the category dropdown when adding new products.
                    </p>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={settingsSearchQuery}
                      onChange={(e) => setSettingsSearchQuery(e.target.value)}
                      placeholder="Filter categories..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {filteredCategories.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      <FolderKanban className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-semibold text-slate-700">No categories found</p>
                      <p className="mt-1">
                        {settingsSearchQuery
                          ? `No categories match "${settingsSearchQuery}". Try clearing search.`
                          : 'Use the form on the right to create your first category for this shop.'}
                      </p>
                    </div>
                  ) : (
                    filteredCategories.map((cat, idx) => {
                      const count = shopProducts.filter(
                        (p) => p.categoryId === cat.id
                      ).length;
                      return (
                        <div
                          key={`${cat.id}-${idx}`}
                          className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                              <Tag className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-semibold text-slate-900 truncate">
                                  {cat.name}
                                </h4>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                  {cat.id}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                                {cat.description || 'No description provided'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                            <span className="text-xs font-mono tabular-nums font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
                              {count} {count === 1 ? 'product' : 'products'}
                            </span>
                            <span className="text-[11px] text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              Active in Form
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Add Category Form Card */}
              <form
                onSubmit={handleCreateCategoryInTab}
                className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 space-y-4 lg:sticky lg:top-4"
              >
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-display font-bold text-slate-900">
                    Add New Category
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Scope: <strong className="text-slate-800">{shop.code}</strong> ({shop.name})
                  </p>
                </div>

                {tabCatError && (
                  <div
                    role="alert"
                    className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2"
                  >
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span>{tabCatError}</span>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="new-cat-name"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Category Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="new-cat-name"
                    type="text"
                    value={newCatName}
                    onChange={(e) => {
                      setNewCatName(e.target.value);
                      if (tabCatError) setTabCatError(null);
                    }}
                    placeholder="e.g. Frozen Foods &amp; Chilled"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-600"
                  />
                </div>

                {/* Quick Suggestion Chips */}
                <div>
                  <p className="text-[11px] font-medium text-slate-500 mb-1.5 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    <span>Suggested retail categories:</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'Beverages & Drinks',
                      'Bakery & Pastries',
                      'Toiletries & Hygiene',
                      'Packaged Foods',
                      'Dairy & Cold Foods',
                      'Household Supplies',
                      'Confectionery & Snacks',
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setNewCatName(preset);
                          if (tabCatError) setTabCatError(null);
                        }}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-600 border border-slate-200 cursor-pointer transition-colors"
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="new-cat-desc"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Description <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <textarea
                    id="new-cat-desc"
                    rows={3}
                    value={newCatDesc}
                    onChange={(e) => setNewCatDesc(e.target.value)}
                    placeholder="Brief description of items grouped under this category..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Category to {shop.code}</span>
                </button>
              </form>
            </div>
          )}

          {/* SECTION B: UNITS OF MEASUREMENT */}
          {settingsSection === 'units' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Units List */}
              <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-display font-bold text-slate-900">
                      Units of Measurement in {shop.name} ({shop.code})
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Standard packaging and quantity units available when adding products in this shop.
                    </p>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={settingsSearchQuery}
                      onChange={(e) => setSettingsSearchQuery(e.target.value)}
                      placeholder="Filter units..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {filteredUnits.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      <Scale className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-semibold text-slate-700">No units of measurement found</p>
                      <p className="mt-1">
                        {settingsSearchQuery
                          ? `No units match "${settingsSearchQuery}". Try clearing search.`
                          : 'Use the form on the right to create standard units of measurement for this shop.'}
                      </p>
                    </div>
                  ) : (
                    filteredUnits.map((u, idx) => {
                      const count = shopProducts.filter(
                        (p) => p.unit.toLowerCase() === u.name.toLowerCase()
                      ).length;
                      return (
                        <div
                          key={`${u.id}-${idx}`}
                          className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
                              <Scale className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-semibold text-slate-900 truncate">
                                  {u.name}
                                </h4>
                                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  {u.abbreviation}
                                </span>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                  {u.id}
                                </span>
                              </div>
                              <p className="text-xs font-mono text-slate-500 mt-0.5">
                                Unit label: {u.name} ({u.abbreviation})
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                            <span className="text-xs font-mono tabular-nums font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
                              {count} {count === 1 ? 'product' : 'products'}
                            </span>
                            <span className="text-[11px] text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              Active in Form
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Add Unit Form Card */}
              <form
                onSubmit={handleCreateUnitInTab}
                className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 space-y-4 lg:sticky lg:top-4"
              >
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-display font-bold text-slate-900">
                    Add Unit of Measurement
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Scope: <strong className="text-slate-800">{shop.code}</strong> ({shop.name})
                  </p>
                </div>

                {tabUnitError && (
                  <div
                    role="alert"
                    className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2"
                  >
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span>{tabUnitError}</span>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="new-unit-name"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Unit Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="new-unit-name"
                    type="text"
                    value={newUnitName}
                    onChange={(e) => {
                      setNewUnitName(e.target.value);
                      if (tabUnitError) setTabUnitError(null);
                    }}
                    placeholder="e.g. Carton, Sachet, Dozen, Litre"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="new-unit-abbr"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Short Abbreviation <span className="text-slate-400 font-normal">(Auto-generated if blank)</span>
                  </label>
                  <input
                    id="new-unit-abbr"
                    type="text"
                    value={newUnitAbbr}
                    onChange={(e) => setNewUnitAbbr(e.target.value)}
                    placeholder="e.g. ctn, sct, doz, L, kg"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-600"
                  />
                </div>

                {/* Common Retail Unit Presets */}
                <div>
                  <p className="text-[11px] font-medium text-slate-500 mb-1.5 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    <span>Common retail units:</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { name: 'Carton', abbr: 'ctn' },
                      { name: 'Sachet', abbr: 'sct' },
                      { name: 'Dozen', abbr: 'doz' },
                      { name: 'Kilogram', abbr: 'kg' },
                      { name: 'Litre', abbr: 'L' },
                      { name: 'Bottle', abbr: 'btl' },
                      { name: 'Bundle', abbr: 'bnd' },
                      { name: 'Roll', abbr: 'rl' },
                      { name: 'Piece', abbr: 'pc' },
                      { name: 'Pack', abbr: 'pk' },
                    ].map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => {
                          setNewUnitName(preset.name);
                          setNewUnitAbbr(preset.abbr);
                          if (tabUnitError) setTabUnitError(null);
                        }}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-600 border border-slate-200 cursor-pointer transition-colors"
                      >
                        + {preset.name} ({preset.abbr})
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Unit to {shop.code}</span>
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 4: DEDICATED STOCK ADJUSTMENTS (Strictly decoupled from Sales) */}
      {activeSubTab === 'adjustments' && (
        <div className="space-y-4">
          {/* Top Banner & Quick Action Header */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-display font-bold text-slate-900">
                    Stock Adjustments Ledger — {shop.name}
                  </h2>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Non-Sales Ledger
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                  Dedicated operational inventory control. Restocks, direct additions, damage write-offs, and returns are tracked strictly independently from checkout sales.
                </p>
              </div>

              {/* 4 Dedicated Quick Actions */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openStockAdjustmentModal('restock')}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Truck className="w-4 h-4" />
                  <span>+ Restock</span>
                </button>
                <button
                  type="button"
                  onClick={() => openStockAdjustmentModal('add_stock')}
                  className="px-3 py-2 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>+ Add Stock</span>
                </button>
                <button
                  type="button"
                  onClick={() => openStockAdjustmentModal('damage_spoilage')}
                  className="px-3 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>− Damage</span>
                </button>
                {(!currentUser || hasPermission(currentUser, 'process_returns')) && (
                  <button
                    type="button"
                    onClick={() => openStockAdjustmentModal('return_in')}
                    className="px-3 py-2 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>+ Return</span>
                  </button>
                )}
              </div>
            </div>

            {/* Success notification banner */}
            {stockAdjNotice && (
              <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{stockAdjNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setStockAdjNotice(null)}
                  className="text-emerald-700 hover:text-emerald-900 text-xs font-bold px-1"
                >
                  ×
                </button>
              </div>
            )}
          </div>

          {/* 4 Dedicated Type KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Restock KPI */}
            <button
              type="button"
              onClick={() => setAdjTypeFilter(adjTypeFilter === 'restock' ? 'all' : 'restock')}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                adjTypeFilter === 'restock'
                  ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20 shadow-xs'
                  : 'bg-white border-slate-200 hover:border-emerald-200 hover:bg-emerald-50/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Restock</span>
                <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                  <Truck className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-xl font-bold font-mono text-emerald-700 tabular-nums">
                  +{totalUnitsRestocked}
                </span>
                <span className="text-xs text-slate-500">units</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {restockCount} supplier {restockCount === 1 ? 'batch' : 'batches'}
              </p>
            </button>

            {/* Add Stock KPI */}
            <button
              type="button"
              onClick={() => setAdjTypeFilter(adjTypeFilter === 'add_stock' ? 'all' : 'add_stock')}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                adjTypeFilter === 'add_stock'
                  ? 'bg-sky-50 border-sky-300 ring-2 ring-sky-500/20 shadow-xs'
                  : 'bg-white border-slate-200 hover:border-sky-200 hover:bg-sky-50/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Add Stock</span>
                <span className="p-1.5 rounded-lg bg-sky-100 text-sky-800">
                  <PlusCircle className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-xl font-bold font-mono text-sky-700 tabular-nums">
                  +{totalUnitsAdded}
                </span>
                <span className="text-xs text-slate-500">units</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {addStockCount} recount {addStockCount === 1 ? 'entry' : 'entries'}
              </p>
            </button>

            {/* Damage KPI */}
            <button
              type="button"
              onClick={() => setAdjTypeFilter(adjTypeFilter === 'damage_spoilage' ? 'all' : 'damage_spoilage')}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                adjTypeFilter === 'damage_spoilage'
                  ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-500/20 shadow-xs'
                  : 'bg-white border-slate-200 hover:border-rose-200 hover:bg-rose-50/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Damage &amp; Spoilage</span>
                <span className="p-1.5 rounded-lg bg-rose-100 text-rose-800">
                  <AlertTriangle className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-xl font-bold font-mono text-rose-700 tabular-nums">
                  −{totalUnitsDamaged}
                </span>
                <span className="text-xs text-slate-500">units</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {damageCount} written-off {damageCount === 1 ? 'incident' : 'incidents'}
              </p>
            </button>

            {/* Return KPI */}
            <button
              type="button"
              onClick={() => setAdjTypeFilter(adjTypeFilter === 'return_in' ? 'all' : 'return_in')}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                adjTypeFilter === 'return_in'
                  ? 'bg-purple-50 border-purple-300 ring-2 ring-purple-500/20 shadow-xs'
                  : 'bg-white border-slate-200 hover:border-purple-200 hover:bg-purple-50/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Returns</span>
                <span className="p-1.5 rounded-lg bg-purple-100 text-purple-800">
                  <RotateCcw className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-xl font-bold font-mono text-purple-700 tabular-nums">
                  +{totalUnitsReturned}
                </span>
                <span className="text-xs text-slate-500">units</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {returnCount} returned {returnCount === 1 ? 'item' : 'items'}
              </p>
            </button>
          </div>

          {/* Filter Bar: Section Tabs & Search by Product or User */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            {/* Dedicated Type Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              <button
                type="button"
                onClick={() => setAdjTypeFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                  adjTypeFilter === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                All Adjustments ({operationalAdjustments.length})
              </button>
              <button
                type="button"
                onClick={() => setAdjTypeFilter('restock')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                  adjTypeFilter === 'restock'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200/60'
                }`}
              >
                <Truck className="w-3 h-3" />
                <span>Restock ({restockCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setAdjTypeFilter('add_stock')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                  adjTypeFilter === 'add_stock'
                    ? 'bg-sky-700 text-white shadow-xs'
                    : 'bg-sky-50 text-sky-800 hover:bg-sky-100 border border-sky-200/60'
                }`}
              >
                <PlusCircle className="w-3 h-3" />
                <span>Add Stock ({addStockCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setAdjTypeFilter('damage_spoilage')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                  adjTypeFilter === 'damage_spoilage'
                    ? 'bg-rose-700 text-white shadow-xs'
                    : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200/60'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                <span>Damage &amp; Spoilage ({damageCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setAdjTypeFilter('return_in')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                  adjTypeFilter === 'return_in'
                    ? 'bg-purple-700 text-white shadow-xs'
                    : 'bg-purple-50 text-purple-800 hover:bg-purple-100 border border-purple-200/60'
                }`}
              >
                <RotateCcw className="w-3 h-3" />
                <span>Returns ({returnCount})</span>
              </button>
              {auditCount > 0 && (
                <button
                  type="button"
                  onClick={() => setAdjTypeFilter('audit_correction')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                    adjTypeFilter === 'audit_correction'
                      ? 'bg-amber-700 text-white shadow-xs'
                      : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/60'
                  }`}
                >
                  <ArrowUpDown className="w-3 h-3" />
                  <span>Audit ({auditCount})</span>
                </button>
              )}
            </div>

            {/* When Returns Tab is Clicked: Show Receipt Number Lookup & Editable Receipt Items Panel */}
            {adjTypeFilter === 'return_in' && (
              <div className="pt-2 border-t border-slate-100">
                {renderReceiptReturnPanel(false)}
              </div>
            )}

            {/* Search Filter by Product or User + Dropdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-1 border-t border-slate-100">
              {/* Search by Product or User Input */}
              <div className="sm:col-span-6 relative">
                <label htmlFor="adj-search-filter" className="sr-only">
                  Search by product or user
                </label>
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="adj-search-filter"
                  type="text"
                  value={adjSearchQuery}
                  onChange={(e) => setAdjSearchQuery(e.target.value)}
                  placeholder="Search by product name, SKU, or user..."
                  className="w-full pl-9 pr-8 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
                {adjSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setAdjSearchQuery('')}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Filter by Operator / User */}
              <div className="sm:col-span-3">
                <label htmlFor="adj-user-select" className="sr-only">
                  Filter by Operator / User
                </label>
                <div className="relative">
                  <UserIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    id="adj-user-select"
                    value={adjUserFilter}
                    onChange={(e) => setAdjUserFilter(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="all">All Users / Operators</option>
                    {uniqueOperators.map((op) => (
                      <option key={op.id} value={op.id}>
                        {op.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Filter by Specific Product */}
              <div className="sm:col-span-3">
                <label htmlFor="adj-product-select" className="sr-only">
                  Filter by Product
                </label>
                <div className="relative">
                  <Package className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    id="adj-product-select"
                    value={adjProductFilter}
                    onChange={(e) => setAdjProductFilter(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-700 truncate focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="all">All Shop Products</option>
                    {shopProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Active filters indicator & reset */}
            {(adjTypeFilter !== 'all' || adjSearchQuery !== '' || adjUserFilter !== 'all' || adjProductFilter !== 'all') && (
              <div className="flex items-center justify-between pt-1 text-xs text-slate-500">
                <span>
                  Showing {filteredAdjustments.length} of {operationalAdjustments.length} operational adjustments
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAdjTypeFilter('all');
                    setAdjSearchQuery('');
                    setAdjUserFilter('all');
                    setAdjProductFilter('all');
                  }}
                  className="text-emerald-700 hover:text-emerald-800 font-semibold cursor-pointer underline"
                >
                  Reset All Filters
                </button>
              </div>
            )}
          </div>

          {/* Section Header indicating active ledger view (All Adjustments vs Restock / Add Stock / Damage & Spoilage / Return) */}
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-display font-bold text-slate-900">
                {adjTypeFilter === 'all'
                  ? 'All Adjustments (Restock, Add Stock, Damage & Spoilage, Return)'
                  : `${formatAdjustmentTypeLabel(adjTypeFilter)} Items Ledger`}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-slate-100 text-slate-700">
                {filteredAdjustments.length}{' '}
                {filteredAdjustments.length === 1 ? 'record' : 'records'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-slate-400 font-medium">Listed by type:</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                Restock: {restockCount}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200 font-semibold">
                Add Stock: {addStockCount}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 font-semibold">
                Damage &amp; Spoilage: {damageCount}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-800 border border-purple-200 font-semibold">
                Return: {returnCount}
              </span>
            </div>
          </div>

          {/* Adjustments List: Mobile Card View (< sm) */}
          <div className="block sm:hidden space-y-3">
            {filteredAdjustments.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
                <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">No stock adjustments match your filter.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Try searching a different product or user name.</p>
              </div>
            ) : (
              filteredAdjustments.map((adj, idx) => {
                const isRestock = adj.type === 'restock';
                const isAdd = adj.type === 'add_stock';
                const isDamage = adj.type === 'damage_spoilage';
                const isReturn = adj.type === 'return_in';

                return (
                  <div
                    key={`${adj.id}-${idx}`}
                    className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-2.5 shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-mono text-xs font-bold text-slate-900">
                          {adj.productSku}
                        </div>
                        <div className="text-xs font-semibold text-slate-800">
                          {adj.productName}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setAdjTypeFilter(
                            adjTypeFilter === adj.type ? 'all' : (adj.type as any)
                          )
                        }
                        title={`Filter by ${formatAdjustmentTypeLabel(adj.type)}`}
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 cursor-pointer ${
                          isRestock
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : isAdd
                            ? 'bg-sky-50 text-sky-800 border border-sky-200'
                            : isDamage
                            ? 'bg-rose-50 text-rose-800 border border-rose-200'
                            : isReturn
                            ? 'bg-purple-50 text-purple-800 border border-purple-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {isRestock && <Truck className="w-3 h-3" />}
                        {isAdd && <PlusCircle className="w-3 h-3" />}
                        {isDamage && <AlertTriangle className="w-3 h-3" />}
                        {isReturn && <RotateCcw className="w-3 h-3" />}
                        <span>{formatAdjustmentTypeLabel(adj.type)}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2 rounded-lg text-center font-mono text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Previous</span>
                        <span className="font-semibold text-slate-600">{adj.previousQuantity}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Delta</span>
                        <span
                          className={`font-bold ${
                            adj.quantityDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {adj.quantityDelta >= 0 ? `+${adj.quantityDelta}` : adj.quantityDelta}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">New Stock</span>
                        <span className="font-bold text-slate-900">{adj.newQuantity}</span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
                      <div className="flex items-center gap-1 truncate max-w-[200px]">
                        <UserIcon className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="font-medium text-slate-700">{adj.performedByName}</span>
                      </div>
                      <span className="font-mono text-slate-400">{adj.createdAt.split(' ')[0]}</span>
                    </div>
                    <p className="text-[11px] text-slate-600 bg-slate-50/70 p-1.5 rounded italic">
                      "{adj.reason}"
                    </p>
                  </div>
                );
              })
            )}
          </div>

          {/* Adjustments Table: Desktop & Tablet View (>= sm) */}
          <div className="hidden sm:block bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[760px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 text-xs text-slate-500">
                    <th className="py-3 px-4 font-medium">Date &amp; Time</th>
                    <th className="py-3 px-4 font-medium">SKU / Product</th>
                    <th className="py-3 px-4 font-medium">Adjustment Category</th>
                    <th className="py-3 px-4 font-medium text-right">Previous</th>
                    <th className="py-3 px-4 font-medium text-right">Delta</th>
                    <th className="py-3 px-4 font-medium text-right">New Stock</th>
                    <th className="py-3 px-4 font-medium">Operator / User</th>
                    <th className="py-3 px-4 font-medium">Audit Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredAdjustments.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="font-semibold text-slate-700">No stock adjustments match your search criteria.</p>
                        <p className="text-xs text-slate-400 mt-1">Try clearing the product or user search filter.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredAdjustments.map((adj, idx) => {
                      const isRestock = adj.type === 'restock';
                      const isAdd = adj.type === 'add_stock';
                      const isDamage = adj.type === 'damage_spoilage';
                      const isReturn = adj.type === 'return_in';

                      return (
                        <tr key={`${adj.id}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                            {adj.createdAt}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-mono font-semibold text-slate-900 block">
                              {adj.productSku}
                            </span>
                            <span className="text-slate-700">{adj.productName}</span>
                          </td>
                          <td className="py-3 px-4">
                            <button
                              type="button"
                              onClick={() =>
                                setAdjTypeFilter(
                                  adjTypeFilter === adj.type ? 'all' : (adj.type as any)
                                )
                              }
                              title={`Listed under ${formatAdjustmentTypeLabel(adj.type)} — click to filter`}
                              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5 cursor-pointer transition-opacity hover:opacity-85 ${
                                isRestock
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : isAdd
                                  ? 'bg-sky-50 text-sky-800 border border-sky-200'
                                  : isDamage
                                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                  : isReturn
                                  ? 'bg-purple-50 text-purple-800 border border-purple-200'
                                  : 'bg-amber-50 text-amber-800 border border-amber-200'
                              }`}
                            >
                              {isRestock && <Truck className="w-3 h-3" />}
                              {isAdd && <PlusCircle className="w-3 h-3" />}
                              {isDamage && <AlertTriangle className="w-3 h-3" />}
                              {isReturn && <RotateCcw className="w-3 h-3" />}
                              <span>{formatAdjustmentTypeLabel(adj.type)}</span>
                            </button>
                          </td>
                          <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-600">
                            {adj.previousQuantity}
                          </td>
                          <td
                            className={`py-3 px-4 font-mono tabular-nums font-bold text-right ${
                              adj.quantityDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {adj.quantityDelta >= 0 ? `+${adj.quantityDelta}` : adj.quantityDelta}
                          </td>
                          <td className="py-3 px-4 font-mono tabular-nums font-bold text-right text-slate-900">
                            {adj.newQuantity}
                          </td>
                          <td className="py-3 px-4 text-slate-700">
                            <div className="flex items-center gap-1.5">
                              <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="font-semibold text-slate-900">{adj.performedByName}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-600 max-w-xs truncate" title={adj.reason}>
                            {adj.reason}
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

      {/* ADD / EDIT PRODUCT MODAL (With Inline Category & Unit of Measurement Creation) */}
      {productModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={editingProduct ? 'Edit Product' : 'Add Product'}
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-xl border border-slate-200 max-w-xl w-full p-4 sm:p-6 space-y-4 my-auto max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-display font-bold text-slate-900">
                  {editingProduct
                    ? `Edit Product (${editingProduct.sku})`
                    : `Add New Product to ${shop.name}`}
                </h3>
                <p className="text-xs text-slate-500">
                  Scoped strictly to Shop ID: {shop.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                aria-label="Close product modal"
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {inlineNotice && (
              <div
                role="status"
                className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{inlineNotice}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setInlineNotice(null)}
                  className="text-xs underline text-emerald-700"
                >
                  Dismiss
                </button>
              </div>
            )}

            <form onSubmit={handleProductFormSubmit} className="space-y-3.5 text-xs">
              <div>
                <label
                  htmlFor="prod-name-input"
                  className="block font-semibold text-slate-700 mb-1"
                >
                  Product Name
                </label>
                <input
                  id="prod-name-input"
                  type="text"
                  value={formState.name}
                  onChange={(e) => {
                    setFormState({ ...formState, name: e.target.value });
                    if (formError) setFormError(null);
                  }}
                  placeholder="e.g. Dano Full Cream Milk Powder 800g"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                <div>
                  <label
                    htmlFor="prod-sku-input"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Shop SKU Code
                  </label>
                  <input
                    id="prod-sku-input"
                    type="text"
                    value={formState.sku}
                    onChange={(e) =>
                      setFormState({ ...formState, sku: e.target.value })
                    }
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Unique shop SKU for inventory identification
                  </p>
                </div>

                {/* BARCODE TOGGLE & CAPTURE SECTION */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Barcode className="w-4 h-4 text-emerald-700 shrink-0" />
                      <div>
                        <span className="font-semibold text-slate-800 text-xs block">
                          Manufacturer Barcode
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          {hasBarcodeToggle ? 'Item has scannable barcode' : 'Item has no barcode'}
                        </span>
                      </div>
                    </div>

                    {/* Toggle Switch */}
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={hasBarcodeToggle}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setHasBarcodeToggle(checked);
                          if (checked) {
                            setBarcodeScannerOpen(true);
                          } else {
                            setFormState((prev) => ({ ...prev, barcode: '' }));
                          }
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>

                  {hasBarcodeToggle ? (
                    <div className="space-y-1.5 pt-1.5 border-t border-slate-200">
                      <div className="flex gap-1.5">
                        <input
                          id="prod-barcode-input"
                          type="text"
                          value={formState.barcode}
                          onChange={(e) =>
                            setFormState({ ...formState, barcode: e.target.value })
                          }
                          placeholder="Scan or enter barcode"
                          className="flex-1 min-w-0 px-2.5 py-1.5 font-mono border border-slate-300 rounded-lg text-xs bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => setBarcodeScannerOpen(true)}
                          className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg text-xs flex items-center gap-1 shrink-0 cursor-pointer shadow-xs transition-colors"
                          title="Open scanner popup"
                        >
                          <Scan className="w-3.5 h-3.5" />
                          <span>Scan</span>
                        </button>
                      </div>

                      {existingProductWithBarcode && (
                        <p className="text-[10px] text-amber-700 flex items-center gap-1 font-medium">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          Already used by: &ldquo;{existingProductWithBarcode.name}&rdquo;
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-500 italic pt-1">
                      Toggle ON if the item packaging has a barcode to scan.
                    </p>
                  )}
                </div>
              </div>

              {/* Category & Unit of Measurement Row with Inline Creation Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                {/* CATEGORY FIELD + INLINE CREATE */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="prod-cat-input"
                      className="font-semibold text-slate-700"
                    >
                      Category
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowInlineCategoryForm((prev) => !prev);
                        setInlineCatError(null);
                      }}
                      className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>
                        {showInlineCategoryForm ? 'Cancel' : 'New Category'}
                      </span>
                    </button>
                  </div>

                  <select
                    id="prod-cat-input"
                    value={formState.categoryId}
                    onChange={(e) =>
                      setFormState({ ...formState, categoryId: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-emerald-600"
                  >
                    {shopCategories.length === 0 ? (
                      <option value="" disabled>
                        No categories found — please create one
                      </option>
                    ) : (
                      shopCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))
                    )}
                  </select>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>{shopCategories.length} categories available for {shop.code}</span>
                    <span className="text-emerald-700 font-medium">All added categories listed</span>
                  </div>

                  {showInlineCategoryForm && (
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                      <p className="font-semibold text-slate-800">
                        Create New Category ({shop.code})
                      </p>
                      {inlineCatError && (
                        <p className="text-red-700 text-xs">{inlineCatError}</p>
                      )}
                      <div>
                        <label
                          htmlFor="inline-cat-name"
                          className="block text-slate-600 mb-0.5"
                        >
                          Category Name
                        </label>
                        <input
                          id="inline-cat-name"
                          type="text"
                          value={inlineCatName}
                          onChange={(e) => {
                            setInlineCatName(e.target.value);
                            if (inlineCatError) setInlineCatError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveInlineCategory();
                            }
                          }}
                          placeholder="e.g. Frozen & Chilled"
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="inline-cat-desc"
                          className="block text-slate-600 mb-0.5"
                        >
                          Description (Optional)
                        </label>
                        <input
                          id="inline-cat-desc"
                          type="text"
                          value={inlineCatDesc}
                          onChange={(e) => setInlineCatDesc(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveInlineCategory();
                            }
                          }}
                          placeholder="Short description..."
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setShowInlineCategoryForm(false);
                            setInlineCatError(null);
                          }}
                          className="px-2.5 py-1 rounded border border-slate-200 bg-white text-slate-600 font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveInlineCategory}
                          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                        >
                          Save Category
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* UNIT OF MEASUREMENT FIELD + INLINE CREATE */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="prod-unit-input"
                      className="font-semibold text-slate-700"
                    >
                      Unit of Measurement
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowInlineUnitForm((prev) => !prev);
                        setInlineUnitError(null);
                      }}
                      className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{showInlineUnitForm ? 'Cancel' : 'New Unit'}</span>
                    </button>
                  </div>

                  <select
                    id="prod-unit-input"
                    value={formState.unit}
                    onChange={(e) =>
                      setFormState({ ...formState, unit: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:border-emerald-600"
                  >
                    {unitOptions.length === 0 ? (
                      <option value="" disabled>
                        No units found — please create one
                      </option>
                    ) : (
                      unitOptions.map((u) => (
                        <option key={u.id} value={u.name}>
                          {u.name} ({u.abbreviation})
                        </option>
                      ))
                    )}
                  </select>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>{shopUnits.length} units available for {shop.code}</span>
                    <span className="text-emerald-700 font-medium">All added units listed</span>
                  </div>

                  {showInlineUnitForm && (
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                      <p className="font-semibold text-slate-800">
                        Create Unit of Measurement ({shop.code})
                      </p>
                      {inlineUnitError && (
                        <p className="text-red-700 text-xs">{inlineUnitError}</p>
                      )}
                      <div>
                        <label
                          htmlFor="inline-unit-name"
                          className="block text-slate-600 mb-0.5"
                        >
                          Unit Name
                        </label>
                        <input
                          id="inline-unit-name"
                          type="text"
                          value={inlineUnitName}
                          onChange={(e) => {
                            setInlineUnitName(e.target.value);
                            if (inlineUnitError) setInlineUnitError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveInlineUnit();
                            }
                          }}
                          placeholder="e.g. Carton, Sachet, Dozen"
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="inline-unit-abbr"
                          className="block text-slate-600 mb-0.5"
                        >
                          Abbreviation (Optional)
                        </label>
                        <input
                          id="inline-unit-abbr"
                          type="text"
                          value={inlineUnitAbbr}
                          onChange={(e) => setInlineUnitAbbr(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSaveInlineUnit();
                            }
                          }}
                          placeholder="e.g. ctn, sct, doz"
                          className="w-full px-2.5 py-1.5 font-mono bg-white border border-slate-300 rounded-md"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setShowInlineUnitForm(false);
                            setInlineUnitError(null);
                          }}
                          className="px-2.5 py-1 rounded border border-slate-200 bg-white text-slate-600 font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveInlineUnit}
                          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                        >
                          Save Unit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="prod-cost-input"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Cost Price ({symbol})
                  </label>
                  <input
                    id="prod-cost-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formState.costPrice}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        costPrice: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="prod-sell-input"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Selling Price ({symbol})
                  </label>
                  <input
                    id="prod-sell-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formState.sellingPrice}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        sellingPrice: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="prod-stock-input"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Stock Quantity
                  </label>
                  <input
                    id="prod-stock-input"
                    type="number"
                    min="0"
                    value={formState.stockQuantity}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        stockQuantity: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="w-full px-3 py-2 font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="prod-reorder-input"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Low-Stock Reorder Level
                  </label>
                  <input
                    id="prod-reorder-input"
                    type="number"
                    min="0"
                    value={formState.reorderLevel}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        reorderLevel: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="w-full px-3 py-2 font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Expiration Tracking Toggle & Expiry Date Input */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <label
                        htmlFor="prod-expiry-toggle"
                        className="text-xs font-bold text-slate-900 cursor-pointer"
                      >
                        Track Product Expiration Date
                      </label>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          formState.hasExpiry
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {formState.hasExpiry ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Enable this toggle for perishable products or items with a manufacturer expiry date.
                    </p>
                  </div>

                  {/* Toggle Switch Button */}
                  <button
                    id="prod-expiry-toggle"
                    type="button"
                    role="switch"
                    aria-checked={Boolean(formState.hasExpiry)}
                    onClick={() => {
                      setFormState((prev) => ({
                        ...prev,
                        hasExpiry: !prev.hasExpiry,
                        expiryDate: !prev.hasExpiry ? prev.expiryDate || '' : prev.expiryDate,
                      }));
                      if (formError) setFormError(null);
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 ${
                      formState.hasExpiry ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                  >
                    <span className="sr-only">Toggle product expiration date</span>
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        formState.hasExpiry ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Conditional Expiry Date Picker when Toggle is ON */}
                {formState.hasExpiry && (
                  <div className="pt-2 border-t border-slate-200/80 animate-in fade-in duration-150">
                    <label
                      htmlFor="prod-expiry-date-input"
                      className="block font-semibold text-slate-700 mb-1"
                    >
                      Expiration Date <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="prod-expiry-date-input"
                        type="date"
                        value={formState.expiryDate || ''}
                        onChange={(e) => {
                          setFormState((prev) => ({
                            ...prev,
                            expiryDate: e.target.value,
                          }));
                          if (formError) setFormError(null);
                        }}
                        className="w-full pl-9 pr-3 py-2 font-mono text-xs border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Sets the expiry date for this product batch.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setProductModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                >
                  {editingProduct ? 'Save Product Changes' : 'Create Shop Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barcode Capture Scanner Modal */}
      {barcodeScannerOpen && (
        <BarcodeCaptureModal
          isOpen={barcodeScannerOpen}
          onClose={() => setBarcodeScannerOpen(false)}
          onBarcodeCaptured={(code) => {
            setHasBarcodeToggle(true);
            setFormState((prev) => ({ ...prev, barcode: code }));
            if (formError) setFormError(null);
          }}
          currentBarcode={formState.barcode}
          productName={formState.name}
        />
      )}

      {/* DEDICATED STOCK ADJUSTMENT MODAL (Restock, Add Stock, Damage, Return) */}
      {stockAdjModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Record Stock Adjustment"
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-3 sm:p-4"
        >
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-4 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto shadow-xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-display font-bold text-slate-900">
                  Record Stock Adjustment
                </h3>
                <p className="text-xs text-slate-500">
                  Operational inventory record for <span className="font-semibold text-slate-700">{shop.name} ({shop.code})</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStockAdjModalOpen(false);
                  setAdjustingProduct(null);
                }}
                aria-label="Close stock adjustment modal"
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Adjustment Type Switcher Tabs */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Adjustment Type
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setAdjType('restock');
                    setAdjReason('Supplier delivery — GRN Waybill');
                  }}
                  className={`py-2 px-2 rounded-md font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    adjType === 'restock'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <Truck className="w-3.5 h-3.5 shrink-0" />
                  <span>Restock</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdjType('add_stock');
                    setAdjReason('Storeroom recount surplus / found inventory');
                  }}
                  className={`py-2 px-2 rounded-md font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    adjType === 'add_stock'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <PlusCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Add Stock</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdjType('damage_spoilage');
                    setAdjReason('Damaged packaging / spoiled items written off');
                  }}
                  className={`py-2 px-2 rounded-md font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    adjType === 'damage_spoilage'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Damage</span>
                </button>
                {(!currentUser || hasPermission(currentUser, 'process_returns')) && (
                  <button
                    type="button"
                    onClick={() => {
                      setAdjType('return_in');
                      setAdjReason('Customer return with receipt — returned to active stock');
                    }}
                    className={`py-2 px-2 rounded-md font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      adjType === 'return_in'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                  >
                    <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                    <span>Return</span>
                  </button>
                )}
              </div>
            </div>

            {adjType === 'return_in' ? (
              renderReceiptReturnPanel(true)
            ) : (
              <form onSubmit={handleStockAdjustmentSubmit} className="space-y-3.5 text-xs">
                {/* Searchable Product Picker */}
                <div className="space-y-1.5">
                <label
                  htmlFor="modal-adj-product-search"
                  className="block font-semibold text-slate-700"
                >
                  Search &amp; Select Product to Adjust <span className="text-slate-400 font-normal">({shopProducts.length} items in shop)</span>
                </label>
                
                {/* Search Bar Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    id="modal-adj-product-search"
                    type="text"
                    value={modalProductSearchQuery}
                    onChange={(e) => setModalProductSearchQuery(e.target.value)}
                    placeholder="Type product name, SKU, or barcode to search instantly..."
                    className="w-full pl-9 pr-8 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                  {modalProductSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setModalProductSearchQuery('')}
                      aria-label="Clear search"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Live Search Results List when user types */}
                {modalProductSearchQuery.trim() !== '' ? (
                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white shadow-2xs">
                    {matchingModalProducts.length === 0 ? (
                      <div className="p-3 text-center text-slate-500 text-xs">
                        No products match "<strong className="text-slate-700">{modalProductSearchQuery}</strong>". Try searching another keyword or SKU.
                      </div>
                    ) : (
                      matchingModalProducts.map((p) => {
                        const isSelected = (adjustingProduct?.id ?? selectedProductForAdjId) === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setSelectedProductForAdjId(p.id);
                              setAdjustingProduct(p);
                            }}
                            className={`w-full p-2.5 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-50/90 border-l-4 border-emerald-600 font-semibold'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="truncate">
                              <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5 truncate">
                                <span className="truncate">{p.name}</span>
                                {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono truncate">
                                SKU: {p.sku} · {p.categoryName}
                              </div>
                            </div>
                            <div className="text-right shrink-0 font-mono text-xs">
                              <span className="text-[10px] text-slate-400 block uppercase">In Stock</span>
                              <strong className="text-slate-900 font-bold">
                                {p.stockQuantity} {p.unit}s
                              </strong>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                ) : (
                  /* Standard Select Dropdown fallback */
                  <select
                    id="modal-adj-product-select"
                    value={selectedProductForAdjId}
                    onChange={(e) => {
                      const newId = e.target.value;
                      setSelectedProductForAdjId(newId);
                      const prod = shopProducts.find((p) => p.id === newId) ?? null;
                      setAdjustingProduct(prod);
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-medium text-slate-800 text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    {shopProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — SKU: {p.sku} (Current: {p.stockQuantity} {p.unit}s)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Current Product Info & Stock State */}
              {(() => {
                const currentProd =
                  adjustingProduct ||
                  shopProducts.find((p) => p.id === selectedProductForAdjId) ||
                  shopProducts[0];

                if (!currentProd) return null;

                const parsed = parseInt(adjQty, 10) || 0;
                const isDeduction = adjType === 'damage_spoilage';
                const deltaNum = isDeduction ? -parsed : parsed;
                const projectedStock = currentProd.stockQuantity + deltaNum;

                return (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>Product Category:</span>
                      <strong className="text-slate-800">{currentProd.categoryName}</strong>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/80 text-center">
                      <div className="p-1.5 bg-white rounded border border-slate-200">
                        <span className="text-[10px] text-slate-400 block uppercase">Current Stock</span>
                        <strong className="text-xs font-mono tabular-nums text-slate-900">
                          {currentProd.stockQuantity} {currentProd.unit}s
                        </strong>
                      </div>
                      <div className="p-1.5 bg-white rounded border border-slate-200">
                        <span className="text-[10px] text-slate-400 block uppercase">Adjustment</span>
                        <strong
                          className={`text-xs font-mono tabular-nums font-bold ${
                            deltaNum >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {deltaNum >= 0 ? `+${deltaNum}` : deltaNum} {currentProd.unit}s
                        </strong>
                      </div>
                      <div className="p-1.5 bg-white rounded border border-slate-200">
                        <span className="text-[10px] text-slate-400 block uppercase">New Balance</span>
                        <strong
                          className={`text-xs font-mono tabular-nums font-bold ${
                            projectedStock < 0 ? 'text-rose-700' : 'text-slate-900'
                          }`}
                        >
                          {projectedStock} {currentProd.unit}s
                        </strong>
                      </div>
                    </div>
                    {isDeduction && projectedStock < 0 && (
                      <p className="text-[11px] text-rose-700 font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Warning: Deducting {parsed} units will result in negative stock ({projectedStock}).
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Quantity Input */}
              <div>
                <label
                  htmlFor="adj-qty-input"
                  className="block font-semibold text-slate-700 mb-1"
                >
                  Quantity Units ({adjType === 'damage_spoilage' ? 'to write off −' : 'to add +'})
                </label>
                <div className="relative">
                  <input
                    id="adj-qty-input"
                    type="number"
                    min="1"
                    required
                    value={adjQty}
                    onChange={(e) => setAdjQty(e.target.value)}
                    placeholder="e.g. 10"
                    className="w-full px-3 py-2 font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                    units
                  </span>
                </div>
              </div>

              {/* Reason / Audit Note + Presets */}
              <div className="space-y-1.5">
                <label
                  htmlFor="adj-reason-input"
                  className="block font-semibold text-slate-700"
                >
                  Reason / Audit Note <span className="text-rose-500">*</span>
                </label>
                <input
                  id="adj-reason-input"
                  type="text"
                  required
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="e.g. Waybill GRN-4892 from Dangote Mills"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />

                {/* Quick Presets tailored to adjustment type */}
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                    Quick Preset Reasons:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {(adjType === 'restock'
                      ? [
                          'Supplier delivery (GRN Waybill)',
                          'Direct farm bulk purchase',
                          'Emergency restock transfer',
                          'Distributor container offload',
                        ]
                      : adjType === 'add_stock'
                      ? [
                          'Storeroom recount surplus',
                          'Found unopened carton',
                          'Physical inventory audit adjustment',
                          'Shelf packaging repack surplus',
                        ]
                      : adjType === 'damage_spoilage'
                      ? [
                          'Damaged packaging / torn bag',
                          'Expired shelf-life write-off',
                          'Rats / pest infestation loss',
                          'Liquid spillage / transport breakage',
                        ]
                      : [
                          'Customer return with receipt',
                          'Wrong item returned by buyer',
                          'Returned unopened merchandise',
                          'Supplier over-shipment return',
                        ]
                    ).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setAdjReason(preset)}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer transition-colors"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Performed by Attribution */}
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-[11px] text-slate-600">
                <div className="flex items-center gap-1.5">
                  <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Authorized Operator:</span>
                  <strong className="text-slate-800">
                    {currentUser?.fullName || 'Operator'}
                  </strong>
                </div>
                <span className="capitalize text-slate-500 font-mono text-[10px]">
                  {currentUser?.role?.replace('_', ' ') || 'owner'}
                </span>
              </div>

                {/* Modal Buttons */}
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setStockAdjModalOpen(false);
                      setAdjustingProduct(null);
                    }}
                    className="px-4 py-2 rounded-lg border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={`px-4 py-2 rounded-lg text-white font-semibold cursor-pointer shadow-xs transition-colors ${
                      adjType === 'restock'
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : adjType === 'add_stock'
                        ? 'bg-sky-600 hover:bg-sky-700'
                        : 'bg-rose-600 hover:bg-rose-700'
                    }`}
                  >
                    Record {adjType === 'damage_spoilage' ? 'Damage Write-Off' : adjType === 'restock' ? 'Restock' : 'Stock Addition'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* BULK CSV IMPORT MODAL */}
      {bulkCsvModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-csv-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-3xl w-full overflow-hidden shadow-xl my-4 sm:my-8 max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-5 sm:px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <div>
                  <h2 id="bulk-csv-modal-title" className="text-base font-display font-bold">
                    Bulk Inventory CSV Import · {shop.code}
                  </h2>
                  <p className="text-[11px] text-slate-300">
                    Upload a filled CSV file to auto-populate inventory items in {shop.name}.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBulkCsvModalOpen(false);
                  setCsvFile(null);
                  setCsvParseResult(null);
                  setCsvImportError(null);
                }}
                aria-label="Close bulk CSV modal"
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 text-xs overflow-y-auto">
              {/* Template Banner Notice */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-slate-700">
                <div className="flex items-start gap-2.5">
                  <FileText className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-slate-900">
                      Need the pre-formatted CSV template file?
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Download the template with standard column headers (Product Name, Barcode, Category, Unit, Selling Price, Cost Price, Stock Qty). SKUs are automatically generated by the system on upload.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => downloadInventoryCsvTemplate()}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-semibold rounded-lg shrink-0 inline-flex items-center gap-1.5 cursor-pointer text-xs"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Download CSV Format</span>
                </button>
              </div>

              {csvImportError && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 text-red-800"
                >
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{csvImportError}</span>
                </div>
              )}

              {/* Step 1: Upload Dropzone */}
              <div className="space-y-2">
                <label className="block font-semibold text-slate-900">
                  Select Filled Inventory CSV File *
                </label>
                <div
                  className={`p-6 border-2 border-dashed rounded-xl text-center transition-colors ${
                    csvFile
                      ? 'bg-emerald-50/50 border-emerald-500 text-emerald-950'
                      : 'bg-slate-50 border-slate-300 hover:border-emerald-500 text-slate-600'
                  }`}
                >
                  <input
                    type="file"
                    accept=".csv"
                    id="csv-file-input"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileSelected(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />
                  <label
                    htmlFor="csv-file-input"
                    className="cursor-pointer flex flex-col items-center gap-2"
                  >
                    <Upload className="w-8 h-8 text-emerald-600" />
                    {csvFile ? (
                      <div>
                        <p className="font-bold text-slate-900 text-sm">
                          {csvFile.name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {(csvFile.size / 1024).toFixed(1)} KB · Click to change file
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="font-semibold text-slate-900 text-xs">
                          Click to browse or drag and drop your completed .CSV file here
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Supports .csv format exported from Excel, Google Sheets, or Apple Numbers
                        </p>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              {/* Step 2: Parsed CSV Summary & Product Preview */}
              {csvParseResult && (
                <div className="space-y-3.5 pt-2 border-t border-slate-200">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-center">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase block">
                        Total Rows
                      </span>
                      <strong className="text-base text-slate-900 font-mono">
                        {csvParseResult.totalRows}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
                      <span className="text-[10px] text-emerald-800 font-semibold uppercase block">
                        Valid Products
                      </span>
                      <strong className="text-base text-emerald-900 font-mono">
                        {csvParseResult.validItems.length}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-purple-50 border border-purple-200 text-center">
                      <span className="text-[10px] text-purple-800 font-semibold uppercase block">
                        New Categories
                      </span>
                      <strong className="text-base text-purple-900 font-mono">
                        {csvParseResult.newCategoriesToCreate.length}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-center">
                      <span className="text-[10px] text-amber-800 font-semibold uppercase block">
                        Skipped Rows
                      </span>
                      <strong className="text-base text-amber-900 font-mono">
                        {csvParseResult.errors.length}
                      </strong>
                    </div>
                  </div>

                  {/* Import Options */}
                  <label className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between gap-3 cursor-pointer select-none">
                    <div>
                      <p className="font-semibold text-slate-900">
                        Update existing products if SKU already exists
                      </p>
                      <p className="text-[11px] text-slate-500">
                        When checked, matching SKUs will update selling price and stock in {shop.code}. When unchecked, duplicates are skipped.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={updateExistingSkus}
                      onChange={(e) => setUpdateExistingSkus(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-600 cursor-pointer"
                    />
                  </label>

                  {/* Parsed Items Preview Table */}
                  {csvParseResult.validItems.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="font-display font-bold text-slate-900 flex items-center justify-between">
                        <span>Parsed Products Preview ({csvParseResult.validItems.length})</span>
                        <span className="text-[11px] text-slate-500 font-normal">
                          Showing first 10 items
                        </span>
                      </p>
                      <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-48 overflow-y-auto">
                        <table className="w-full text-left border-collapse text-xs min-w-[600px]">
                          <thead>
                            <tr className="bg-slate-100 border-b border-slate-200 text-slate-600">
                              <th className="py-2 px-3 font-semibold">Row #</th>
                              <th className="py-2 px-3 font-semibold">Product Name</th>
                              <th className="py-2 px-3 font-semibold">SKU</th>
                              <th className="py-2 px-3 font-semibold">Category</th>
                              <th className="py-2 px-3 font-semibold">Unit</th>
                              <th className="py-2 px-3 font-semibold text-right">Selling Price</th>
                              <th className="py-2 px-3 font-semibold text-right">Stock Qty</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {csvParseResult.validItems.slice(0, 10).map((item) => (
                              <tr key={item.rowNumber} className="hover:bg-slate-50">
                                <td className="py-2 px-3 font-mono text-slate-500">
                                  #{item.rowNumber}
                                </td>
                                <td className="py-2 px-3 font-semibold text-slate-900">
                                  {item.name}
                                </td>
                                <td className="py-2 px-3 font-mono text-slate-600">
                                  {item.sku}
                                </td>
                                <td className="py-2 px-3 text-slate-700">
                                  {item.categoryName}
                                </td>
                                <td className="py-2 px-3 text-slate-600">
                                  {item.unit}
                                </td>
                                <td className="py-2 px-3 font-mono font-semibold text-right text-slate-900">
                                  {formatCurrency(item.sellingPrice, symbol)}
                                </td>
                                <td className="py-2 px-3 font-mono font-bold text-right text-emerald-800">
                                  {item.stockQuantity}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Skipped Rows Accordion / Summary */}
                  {csvParseResult.errors.length > 0 && (
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-1.5">
                      <p className="font-semibold text-amber-900 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                        <span>Skipped / Invalid Rows ({csvParseResult.errors.length})</span>
                      </p>
                      <ul className="space-y-1 text-[11px] text-amber-900 font-mono max-h-28 overflow-y-auto pl-2">
                        {csvParseResult.errors.map((err, i) => (
                          <li key={i}>
                            Row #{err.rowNumber} ({err.productName}): {err.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setBulkCsvModalOpen(false);
                    setCsvFile(null);
                    setCsvParseResult(null);
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!csvParseResult || csvParseResult.validItems.length === 0 || isImportingCsv}
                  onClick={handleExecuteBulkCsvImport}
                  className="px-4 py-2 rounded-lg bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white font-semibold flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  <Upload className="w-4 h-4" />
                  <span>
                    {isImportingCsv
                      ? 'Importing Items...'
                      : `Confirm & Import ${
                          csvParseResult?.validItems.length ?? 0
                        } Product(s)`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT SUCCESS SUMMARY MODAL */}
      {importSuccessSummary && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-success-title"
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-3 sm:p-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full overflow-hidden shadow-xl p-5 sm:p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6 stroke-[3]" />
            </div>

            <div>
              <h3 id="import-success-title" className="text-lg font-display font-bold text-slate-900">
                Bulk Inventory CSV Import Complete!
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                Products have been populated into <strong>{shop.name} ({shop.code})</strong>.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono text-left pt-1">
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <span className="text-[10px] text-emerald-800 uppercase font-sans font-bold block">
                  Products Imported
                </span>
                <strong className="text-lg text-emerald-950">
                  +{importSuccessSummary.importedCount}
                </strong>
              </div>
              <div className="p-3 rounded-lg bg-purple-50 border border-purple-200">
                <span className="text-[10px] text-purple-800 uppercase font-sans font-bold block">
                  Initial Stock Units
                </span>
                <strong className="text-lg text-purple-950">
                  +{importSuccessSummary.totalInitialStockAdded}
                </strong>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-600 uppercase font-sans font-bold block">
                  New Categories
                </span>
                <strong className="text-base text-slate-900">
                  +{importSuccessSummary.createdCategoriesCount}
                </strong>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-600 uppercase font-sans font-bold block">
                  Skipped Rows
                </span>
                <strong className="text-base text-slate-900">
                  {importSuccessSummary.skippedCount}
                </strong>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setImportSuccessSummary(null);
                setBulkCsvModalOpen(false);
              }}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs cursor-pointer transition-colors shadow-xs"
            >
              Done &amp; View Inventory Catalogue
            </button>
          </div>
        </div>
      )}

      {/* Delete Product Confirmation Modal */}
      {deleteConfirmModalOpen && productToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-product-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="delete-product-title" className="text-base font-display font-bold text-slate-900">
                    Delete Product
                  </h3>
                  <p className="text-xs text-slate-500">
                    Scope: <strong className="text-slate-700">{shop.name}</strong> ({shop.code})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmModalOpen(false);
                  setProductToDelete(null);
                }}
                className="w-8 h-8 rounded-lg hover:bg-slate-200/70 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200/80 text-rose-900 text-xs flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-rose-950 text-xs">
                    Are you sure you want to delete this product?
                  </p>
                  <p className="text-[11px] text-rose-800 mt-0.5 leading-relaxed">
                    This will permanently remove the item from your active inventory catalogue. Historical sales records will remain preserved for bookkeeping.
                  </p>
                </div>
              </div>

              {/* Product Details Card */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 space-y-2 text-xs">
                <div className="flex justify-between items-start">
                  <span className="text-slate-500 font-medium">Product Name:</span>
                  <span className="font-bold text-slate-900 text-right">{productToDelete.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">SKU:</span>
                  <span className="font-mono font-semibold text-slate-800">{productToDelete.sku}</span>
                </div>
                {productToDelete.barcode && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Barcode:</span>
                    <span className="font-mono text-slate-700">{productToDelete.barcode}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Category:</span>
                  <span className="text-slate-800 font-medium">{productToDelete.categoryName}</span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-200/80 pt-2 mt-2">
                  <span className="text-slate-500 font-medium">Current Stock:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {productToDelete.stockQuantity} {productToDelete.unit}s
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setDeleteConfirmModalOpen(false);
                  setProductToDelete(null);
                }}
                className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-xs cursor-pointer transition-colors disabled:opacity-50 min-h-[38px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDeleteProduct}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors disabled:opacity-50 min-h-[38px]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Deleting...' : 'Yes, Delete Product'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deduplicate Products Confirmation Modal */}
      {deduplicateModalOpen && duplicateGroups.length > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="deduplicate-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-amber-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="deduplicate-modal-title" className="text-base font-display font-bold text-slate-900">
                    Merge Duplicate Products
                  </h3>
                  <p className="text-xs text-slate-500">
                    Scope: <strong className="text-slate-700">{shop.name}</strong> ({shop.code}) · {duplicateGroups.length} items to merge
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isDeduplicating}
                onClick={() => setDeduplicateModalOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-200/70 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-950 text-xs">
                    How merging works:
                  </p>
                  <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                    For each duplicated product below, the system will keep the primary record, <strong>sum all stock quantities together</strong> into that single record, and permanently delete the redundant duplicate records from Cloud Firestore.
                  </p>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <span className="font-bold text-slate-700 uppercase text-[10px] tracking-wider block">
                  Duplicates Found ({duplicateGroups.length} Groups)
                </span>
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                  {duplicateGroups.map((grp) => {
                    const totalRecords = 1 + grp.duplicateProducts.length;
                    const individualStocks = [
                      grp.primaryProduct.stockQuantity,
                      ...grp.duplicateProducts.map((d) => d.stockQuantity),
                    ];
                    return (
                      <div key={grp.key} className="p-3 bg-white flex items-center justify-between gap-3">
                        <div>
                          <p className="font-bold text-slate-900">{grp.name}</p>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 font-mono">
                            <span>SKU: {grp.sku}</span>
                            {grp.barcode && grp.barcode !== grp.sku && (
                              <span>· Barcode: {grp.barcode}</span>
                            )}
                          </div>
                          <p className="text-[10px] text-amber-800 mt-1">
                            {totalRecords} records ({individualStocks.join(' + ')} {grp.primaryProduct.unit}s)
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[10px] uppercase font-bold text-emerald-800 block">
                            Merged Stock
                          </span>
                          <span className="font-mono font-bold text-emerald-950 text-sm">
                            {grp.combinedStock} {grp.primaryProduct.unit}s
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isDeduplicating}
                onClick={() => setDeduplicateModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-xs cursor-pointer transition-colors disabled:opacity-50 min-h-[38px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeduplicating}
                onClick={handleExecuteDeduplication}
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold text-xs flex items-center gap-2 cursor-pointer shadow-xs transition-colors disabled:opacity-50 min-h-[38px]"
              >
                <Layers className="w-4 h-4" />
                <span>{isDeduplicating ? 'Merging & Cleaning...' : `Merge & Clean Up (${duplicateGroups.length} Items)`}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
