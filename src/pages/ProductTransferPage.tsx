import React, { useState, useMemo } from 'react';
import {
  ArrowLeftRight,
  Package,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  Minus,
  Trash2,
  Search,
  Store,
  Calendar,
  UserCheck,
  AlertTriangle,
  FileText,
  Printer,
  X,
  Filter,
  Check,
  Truck,
  RotateCcw,
} from 'lucide-react';
import {
  Product,
  ProductTransfer,
  ProductTransferItem,
  ProductTransferStatus,
  Shop,
  User,
  ProductCategory,
} from '../types/pos';

interface ProductTransferPageProps {
  currentUser: User;
  activeShop: Shop;
  allShops: Shop[];
  products: Product[];
  transfers: ProductTransfer[];
  categories?: ProductCategory[];
  dataMode?: 'live' | 'demo' | 'offline_live';
  onInitiateTransfer: (
    transfer: Omit<ProductTransfer, 'id' | 'transferNumber' | 'createdAt' | 'updatedAt'>
  ) => Promise<ProductTransfer>;
  onConfirmTransfer: (
    transferId: string,
    confirmedItems?: { productId: string; receivedQuantity: number }[]
  ) => Promise<void>;
  onRejectTransfer?: (transferId: string, reason: string) => Promise<void>;
  onCancelTransfer?: (transferId: string) => Promise<void>;
}

type TransferTab = 'new' | 'pending' | 'completed';

export const ProductTransferPage: React.FC<ProductTransferPageProps> = ({
  currentUser,
  activeShop,
  allShops,
  products,
  transfers,
  dataMode = 'live',
  onInitiateTransfer,
  onConfirmTransfer,
  onRejectTransfer,
  onCancelTransfer,
}) => {
  const [activeTab, setActiveTab] = useState<TransferTab>('new');

  // New Transfer State
  const [selectedDestinationShopId, setSelectedDestinationShopId] = useState<string>('');
  const [transferCart, setTransferCart] = useState<ProductTransferItem[]>([]);
  const [productSearch, setProductSearch] = useState<string>('');
  const [transferNotes, setTransferNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Pending Transfer Filter State
  const [pendingSubFilter, setPendingSubFilter] = useState<'incoming' | 'outgoing'>('incoming');
  const [confirmingTransferId, setConfirmingTransferId] = useState<string | null>(null);
  const [confirmedQuantities, setConfirmedQuantities] = useState<Record<string, number>>({});
  const [rejectingTransferId, setRejectingTransferId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');

  // Completed Transfer Filter & Modal State
  const [completedSearch, setCompletedSearch] = useState<string>('');
  const [completedDirectionFilter, setCompletedDirectionFilter] = useState<'all' | 'incoming' | 'outgoing'>('all');
  const [viewingSlipTransfer, setViewingSlipTransfer] = useState<ProductTransfer | null>(null);

  // Filter available destination shops: must be same business, but not the active shop
  const otherShopsInBusiness = useMemo(() => {
    return allShops.filter(
      (s) => s.businessId === activeShop.businessId && s.id !== activeShop.id
    );
  }, [allShops, activeShop]);

  // Current shop's available products for transfer
  const currentShopProducts = useMemo(() => {
    return products.filter(
      (p) => p.shopId === activeShop.id && p.businessId === activeShop.businessId && p.isActive !== false
    );
  }, [products, activeShop]);

  // Filtered products for quick-add in New Transfer
  const searchedProducts = useMemo(() => {
    if (!productSearch.trim()) return [];
    const query = productSearch.toLowerCase().trim();
    return currentShopProducts
      .filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.sku.toLowerCase().includes(query) ||
          (p.barcode && p.barcode.toLowerCase().includes(query))
      )
      .slice(0, 10);
  }, [currentShopProducts, productSearch]);

  // Pending transfers involving active shop
  const pendingIncomingTransfers = useMemo(() => {
    return transfers.filter(
      (t) => t.businessId === activeShop.businessId && t.destinationShopId === activeShop.id && t.status === 'pending'
    );
  }, [transfers, activeShop]);

  const pendingOutgoingTransfers = useMemo(() => {
    return transfers.filter(
      (t) => t.businessId === activeShop.businessId && t.sourceShopId === activeShop.id && t.status === 'pending'
    );
  }, [transfers, activeShop]);

  // Completed transfers involving active shop
  const completedTransfers = useMemo(() => {
    return transfers.filter(
      (t) =>
        t.businessId === activeShop.businessId &&
        (t.sourceShopId === activeShop.id || t.destinationShopId === activeShop.id) &&
        (t.status === 'completed' || t.status === 'rejected' || t.status === 'cancelled')
    );
  }, [transfers, activeShop]);

  // Filtered completed transfers for table
  const filteredCompletedTransfers = useMemo(() => {
    return completedTransfers.filter((t) => {
      // Direction
      if (completedDirectionFilter === 'incoming' && t.destinationShopId !== activeShop.id) return false;
      if (completedDirectionFilter === 'outgoing' && t.sourceShopId !== activeShop.id) return false;

      // Search
      if (completedSearch.trim()) {
        const q = completedSearch.toLowerCase().trim();
        const matchesRef = t.transferNumber.toLowerCase().includes(q);
        const matchesSource = t.sourceShopName.toLowerCase().includes(q);
        const matchesDest = t.destinationShopName.toLowerCase().includes(q);
        const matchesItem = t.items.some(
          (i) => i.productName.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)
        );
        return matchesRef || matchesSource || matchesDest || matchesItem;
      }
      return true;
    });
  }, [completedTransfers, completedDirectionFilter, completedSearch, activeShop]);

  // Handlers for New Transfer Cart
  const handleAddToCart = (product: Product) => {
    const existing = transferCart.find((i) => i.productId === product.id);
    if (existing) {
      if (existing.quantity >= product.stockQuantity) {
        setFeedbackMessage({
          type: 'error',
          text: `Cannot transfer more than available stock (${product.stockQuantity} units) for ${product.name}.`,
        });
        return;
      }
      setTransferCart((prev) =>
        prev.map((i) =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      );
    } else {
      if (product.stockQuantity <= 0) {
        setFeedbackMessage({
          type: 'error',
          text: `Product ${product.name} is currently out of stock.`,
        });
        return;
      }
      setTransferCart((prev) => [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          barcode: product.barcode,
          unit: product.unit || 'Unit',
          quantity: 1,
          costPrice: product.costPrice,
          sellingPrice: product.sellingPrice,
          categoryId: product.categoryId,
          categoryName: product.categoryName,
        },
      ]);
    }
    setProductSearch('');
    setFeedbackMessage(null);
  };

  const handleUpdateQuantity = (productId: string, newQty: number) => {
    const product = currentShopProducts.find((p) => p.id === productId);
    const availableStock = product?.stockQuantity ?? 999999;
    if (newQty > availableStock) {
      setFeedbackMessage({
        type: 'error',
        text: `Cannot transfer more than available stock (${availableStock} units).`,
      });
      return;
    }
    if (newQty <= 0) {
      handleRemoveFromCart(productId);
      return;
    }
    setTransferCart((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, quantity: newQty } : i))
    );
    setFeedbackMessage(null);
  };

  const handleRemoveFromCart = (productId: string) => {
    setTransferCart((prev) => prev.filter((i) => i.productId !== productId));
  };

  // Submit New Transfer
  const handleSubmitTransfer = async () => {
    if (!selectedDestinationShopId) {
      setFeedbackMessage({ type: 'error', text: 'Please select a destination shop.' });
      return;
    }
    if (transferCart.length === 0) {
      setFeedbackMessage({ type: 'error', text: 'Please add at least one product to transfer.' });
      return;
    }

    const destinationShop = otherShopsInBusiness.find((s) => s.id === selectedDestinationShopId);
    if (!destinationShop) {
      setFeedbackMessage({ type: 'error', text: 'Selected destination shop not found.' });
      return;
    }

    setIsSubmitting(true);
    setFeedbackMessage(null);

    try {
      const totalUnits = transferCart.reduce((sum, item) => sum + item.quantity, 0);
      const newTransfer = await onInitiateTransfer({
        businessId: activeShop.businessId,
        sourceShopId: activeShop.id,
        sourceShopName: activeShop.name,
        sourceShopCode: activeShop.code,
        destinationShopId: destinationShop.id,
        destinationShopName: destinationShop.name,
        destinationShopCode: destinationShop.code,
        items: transferCart,
        totalItems: transferCart.length,
        totalQuantity: totalUnits,
        status: 'pending',
        ...(transferNotes.trim() ? { notes: transferNotes.trim() } : {}),
        initiatedByUserId: currentUser.id,
        initiatedByUserName: currentUser.fullName,
        initiatedAt: new Date().toISOString(),
      });

      setTransferCart([]);
      setSelectedDestinationShopId('');
      setTransferNotes('');
      setFeedbackMessage({
        type: 'success',
        text: `Transfer ${newTransfer.transferNumber} dispatched to ${destinationShop.name}! Items deducted from stock and awaiting destination confirmation.`,
      });
      setActiveTab('pending');
      setPendingSubFilter('outgoing');
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err?.message || 'Failed to initiate product transfer. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open confirmation modal for incoming transfer
  const handleOpenConfirmModal = (transfer: ProductTransfer) => {
    setConfirmingTransferId(transfer.id);
    const initialQuantities: Record<string, number> = {};
    for (const item of transfer.items) {
      initialQuantities[item.productId] = item.quantity;
    }
    setConfirmedQuantities(initialQuantities);
  };

  // Execute Confirmation & Acceptance
  const handleExecuteConfirmation = async (transferId: string) => {
    setIsSubmitting(true);
    try {
      const itemsPayload = Object.entries(confirmedQuantities).map(([productId, receivedQuantity]) => ({
        productId,
        receivedQuantity,
      }));
      await onConfirmTransfer(transferId, itemsPayload);
      setConfirmingTransferId(null);
      setFeedbackMessage({
        type: 'success',
        text: `Transfer confirmed! The transferred items have immediately been added to your shop's stock.`,
      });
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err?.message || 'Failed to confirm transfer. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Execute Rejection
  const handleExecuteRejection = async () => {
    if (!rejectingTransferId) return;
    if (!rejectionReason.trim()) {
      alert('Please specify a reason for rejecting the transfer.');
      return;
    }
    setIsSubmitting(true);
    try {
      if (onRejectTransfer) {
        await onRejectTransfer(rejectingTransferId, rejectionReason.trim());
      }
      setRejectingTransferId(null);
      setRejectionReason('');
      setFeedbackMessage({
        type: 'success',
        text: 'Transfer rejected. Stock has been restored to the originating shop.',
      });
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err?.message || 'Failed to reject transfer.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cancel Outgoing Transfer
  const handleCancelOutgoing = async (transferId: string) => {
    if (!window.confirm('Are you sure you want to cancel this transfer? Transferred items will be restored to your shop stock immediately.')) {
      return;
    }
    setIsSubmitting(true);
    try {
      if (onCancelTransfer) {
        await onCancelTransfer(transferId);
      }
      setFeedbackMessage({
        type: 'success',
        text: 'Transfer cancelled. Stock has been restored to your shop catalog.',
      });
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err?.message || 'Failed to cancel transfer.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalTransferUnits = useMemo(() => {
    return transferCart.reduce((sum, item) => sum + item.quantity, 0);
  }, [transferCart]);

  return (
    <div className="min-h-full bg-slate-900 text-slate-100 p-4 md:p-6 space-y-6">
      {/* Page Title & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <span>{activeShop.name}</span>
            <span>/</span>
            <span>Products & Inventory</span>
            <span>/</span>
            <span className="text-emerald-400 font-medium">Product Transfer</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <ArrowLeftRight className="w-6 h-6 text-emerald-400" />
            Inter-Shop Product Transfer
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Safely transfer products, track transit, and confirm stock intake across branches within {activeShop.name}.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('new')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === 'new'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Transfer</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer relative ${
              activeTab === 'pending'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pending Transfers</span>
            {pendingIncomingTransfers.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-slate-950 font-bold text-[10px] rounded-full">
                {pendingIncomingTransfers.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('completed')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === 'completed'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Completed Transfer</span>
            {completedTransfers.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-slate-800 text-slate-300 font-medium text-[10px] rounded-full border border-slate-700">
                {completedTransfers.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedbackMessage && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between gap-3 text-xs font-medium border ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-800/80 text-emerald-300'
              : 'bg-rose-950/70 border-rose-800/80 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: NEW TRANSFER                                                       */}
      {/* ========================================================================= */}
      {activeTab === 'new' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Product Selection & Quantities (approx 7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Package className="w-4 h-4 text-emerald-400" />
                    1. Select Products & Transfer Quantities
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Select items from <span className="text-emerald-400 font-semibold">{activeShop.name}</span> inventory to transfer out.
                  </p>
                </div>
                <span className="text-[11px] px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-slate-300">
                  {currentShopProducts.length} Active SKUs
                </span>
              </div>

              {/* Product Search Input */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search product by name, SKU, or barcode to add..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                />

                {/* Search Autocomplete Dropdown */}
                {searchedProducts.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden divide-y divide-slate-800 max-h-60 overflow-y-auto">
                    {searchedProducts.map((p) => {
                      const isOutOfStock = p.stockQuantity <= 0;
                      return (
                        <div
                          key={p.id}
                          className="p-3 flex items-center justify-between hover:bg-slate-800/80 transition"
                        >
                          <div>
                            <p className="text-xs font-semibold text-white">{p.name}</p>
                            <p className="text-[11px] text-slate-400">
                              SKU: <span className="text-slate-300 font-mono">{p.sku}</span> · Stock:{' '}
                              <span className={isOutOfStock ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                                {p.stockQuantity} {p.unit}
                              </span>
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={isOutOfStock}
                            onClick={() => handleAddToCart(p)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                              isOutOfStock
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                            }`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Transfer Items Table */}
              <div className="border border-slate-800 rounded-lg overflow-hidden">
                <div className="bg-slate-900/80 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span>Selected Products ({transferCart.length})</span>
                  <span>Total Units: {totalTransferUnits}</span>
                </div>

                {transferCart.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <Package className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="text-xs text-slate-400 font-medium">
                      No products added to this transfer yet.
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Use the search bar above to select products from {activeShop.name}.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/60 max-h-96 overflow-y-auto">
                    {transferCart.map((item) => {
                      const shopProd = currentShopProducts.find((p) => p.id === item.productId);
                      const availableStock = shopProd?.stockQuantity ?? 0;
                      return (
                        <div
                          key={item.productId}
                          className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950 hover:bg-slate-900/40 transition"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate">{item.productName}</p>
                            <p className="text-[11px] text-slate-400">
                              SKU: <span className="text-slate-300 font-mono">{item.sku}</span> · Current In-Stock:{' '}
                              <span className="text-emerald-400 font-bold">{availableStock}</span> {item.unit}
                            </p>
                          </div>

                          {/* Stepper & Remove */}
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
                              <button
                                type="button"
                                onClick={() => handleUpdateQuantity(item.productId, item.quantity - 1)}
                                className="px-2.5 py-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <input
                                type="number"
                                min={1}
                                max={availableStock}
                                value={item.quantity}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  handleUpdateQuantity(item.productId, isNaN(val) ? 1 : val);
                                }}
                                className="w-14 text-center bg-transparent text-xs font-bold text-white focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdateQuantity(item.productId, item.quantity + 1)}
                                disabled={item.quantity >= availableStock}
                                className={`px-2.5 py-1.5 transition ${
                                  item.quantity >= availableStock
                                    ? 'text-slate-600 cursor-not-allowed'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                }`}
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveFromCart(item.productId)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition"
                              title="Remove item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Optional Notes */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Transfer Notes & Reference (Optional)
                </label>
                <input
                  type="text"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  placeholder="e.g. Regular branch stock replenishment, requested by supervisor..."
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
            </div>
          </div>

          {/* Right Column: Destination Shop Selection ("Terminal Field") (approx 5 cols) */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Store className="w-4 h-4 text-emerald-400" />
                  2. Select Destination Shop
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Choose which shop terminal within <span className="text-slate-200 font-semibold">{activeShop.name}</span>'s business will receive these items.
                </p>
              </div>

              {/* Source Shop Context Box */}
              <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Originating Shop</span>
                  <p className="text-xs font-bold text-white mt-0.5">{activeShop.name} ({activeShop.code})</p>
                  <p className="text-[11px] text-slate-400">{activeShop.locationCity}</p>
                </div>
                <span className="px-2 py-1 bg-emerald-950 text-emerald-400 text-[10px] font-bold rounded border border-emerald-800/80">
                  SOURCE
                </span>
              </div>

              {/* Destination Shops Radio Cards */}
              <div className="space-y-2.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Available Destination Branches:
                </label>

                {otherShopsInBusiness.length === 0 ? (
                  <div className="p-4 bg-amber-950/40 border border-amber-800/60 rounded-lg text-xs text-amber-300 space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      Only 1 Shop Registered
                    </p>
                    <p className="text-[11px] text-amber-400/90 leading-relaxed">
                      You need at least 2 shops in this business to perform inter-shop transfers. Go to Shop Management to register an additional branch.
                    </p>
                  </div>
                ) : (
                  otherShopsInBusiness.map((shop) => {
                    const isSelected = selectedDestinationShopId === shop.id;
                    return (
                      <div
                        key={shop.id}
                        onClick={() => setSelectedDestinationShopId(shop.id)}
                        className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-emerald-950/50 border-emerald-500 shadow-sm'
                            : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                              isSelected
                                ? 'border-emerald-500 bg-emerald-500 text-slate-950'
                                : 'border-slate-600 bg-slate-800'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-bold text-white">{shop.name}</p>
                              <span className="text-[10px] px-1.5 py-0.2 bg-slate-800 text-slate-300 font-mono rounded border border-slate-700">
                                {shop.code}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {shop.locationCity} · {shop.address || 'Standard Location'}
                            </p>
                          </div>
                        </div>

                        <span className="text-[11px] text-slate-400 font-medium shrink-0">
                          {shop.status === 'active' ? (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              Ready
                            </span>
                          ) : (
                            <span className="text-slate-500">{shop.status}</span>
                          )}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Transfer Summary & Dispatch Button */}
              <div className="border-t border-slate-800 pt-4 space-y-3">
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Distinct Products:</span>
                    <span className="font-semibold text-white">{transferCart.length} SKUs</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Total Transfer Quantity:</span>
                    <span className="font-semibold text-emerald-400">{totalTransferUnits} units</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Authorized Operator:</span>
                    <span className="text-slate-200">{currentUser.fullName}</span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={
                    isSubmitting ||
                    transferCart.length === 0 ||
                    !selectedDestinationShopId ||
                    otherShopsInBusiness.length === 0
                  }
                  onClick={handleSubmitTransfer}
                  className={`w-full py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition shadow-md cursor-pointer ${
                    isSubmitting ||
                    transferCart.length === 0 ||
                    !selectedDestinationShopId ||
                    otherShopsInBusiness.length === 0
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  <Truck className="w-4 h-4" />
                  <span>
                    {isSubmitting ? 'Dispatching Transfer...' : 'Initiate Inter-Shop Transfer'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: PENDING TRANSFERS                                                  */}
      {/* ========================================================================= */}
      {activeTab === 'pending' && (
        <div className="space-y-5">
          {/* Sub-Tabs: Incoming vs Outgoing */}
          <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
            <button
              type="button"
              onClick={() => setPendingSubFilter('incoming')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                pendingSubFilter === 'incoming'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <span>Incoming to {activeShop.name}</span>
              {pendingIncomingTransfers.length > 0 && (
                <span className="px-1.5 py-0.2 bg-amber-500 text-slate-950 font-bold text-[10px] rounded-full">
                  {pendingIncomingTransfers.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setPendingSubFilter('outgoing')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                pendingSubFilter === 'outgoing'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <span>Outgoing from {activeShop.name}</span>
              {pendingOutgoingTransfers.length > 0 && (
                <span className="px-1.5 py-0.2 bg-slate-800 text-slate-300 font-bold text-[10px] rounded-full border border-slate-700">
                  {pendingOutgoingTransfers.length}
                </span>
              )}
            </button>
          </div>

          {/* INCOMING PENDING TRANSFERS */}
          {pendingSubFilter === 'incoming' && (
            <div className="space-y-4">
              {pendingIncomingTransfers.length === 0 ? (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-12 text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-slate-600 mx-auto" />
                  <p className="text-sm font-semibold text-white">No Pending Incoming Transfers</p>
                  <p className="text-xs text-slate-400">
                    No shipments are currently awaiting intake confirmation at {activeShop.name}.
                  </p>
                </div>
              ) : (
                pendingIncomingTransfers.map((transfer) => (
                  <div
                    key={transfer.id}
                    className="bg-slate-950 border border-amber-900/60 rounded-xl p-5 space-y-4 shadow-sm"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="text-xs font-mono font-bold text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800/80">
                            {transfer.transferNumber}
                          </span>
                          <span className="text-xs font-bold text-white">
                            Incoming from: <span className="text-emerald-400">{transfer.sourceShopName}</span>
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Dispatched by {transfer.initiatedByUserName} on{' '}
                          {new Date(transfer.initiatedAt).toLocaleString('en-NG', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenConfirmModal(transfer)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Review & Accept into Stock</span>
                        </button>
                        {onRejectTransfer && (
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingTransferId(transfer.id);
                              setRejectionReason('');
                            }}
                            className="px-3 py-2 bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 text-xs font-semibold rounded-lg border border-slate-800 hover:border-rose-800 transition cursor-pointer"
                          >
                            <span>Reject</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Transferred Items Summary */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                            <th className="py-2 px-3">Item Details</th>
                            <th className="py-2 px-3">SKU</th>
                            <th className="py-2 px-3 text-right">Dispatched Quantity</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {transfer.items.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-900/50">
                              <td className="py-2 px-3 font-semibold text-white">{item.productName}</td>
                              <td className="py-2 px-3 font-mono text-slate-300">{item.sku}</td>
                              <td className="py-2 px-3 text-right font-bold text-emerald-400">
                                {item.quantity} {item.unit}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {transfer.notes && (
                      <p className="text-[11px] text-slate-400 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                        <span className="font-semibold text-slate-300">Note:</span> {transfer.notes}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* OUTGOING PENDING TRANSFERS */}
          {pendingSubFilter === 'outgoing' && (
            <div className="space-y-4">
              {pendingOutgoingTransfers.length === 0 ? (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-12 text-center space-y-2">
                  <Truck className="w-10 h-10 text-slate-600 mx-auto" />
                  <p className="text-sm font-semibold text-white">No Outgoing Shipments in Transit</p>
                  <p className="text-xs text-slate-400">
                    No active outgoing transfers from {activeShop.name} are currently awaiting confirmation.
                  </p>
                </div>
              ) : (
                pendingOutgoingTransfers.map((transfer) => (
                  <div
                    key={transfer.id}
                    className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="text-xs font-mono font-bold text-sky-400 bg-sky-950/80 px-2 py-0.5 rounded border border-sky-800/80">
                            {transfer.transferNumber}
                          </span>
                          <span className="text-xs font-bold text-white">
                            In Transit to: <span className="text-emerald-400">{transfer.destinationShopName}</span>
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Dispatched by {transfer.initiatedByUserName} on{' '}
                          {new Date(transfer.initiatedAt).toLocaleString('en-NG', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="px-2.5 py-1 bg-amber-950 text-amber-300 border border-amber-800/80 text-[11px] font-bold rounded-lg flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 animate-pulse" />
                          <span>Awaiting Receipt by {transfer.destinationShopName}</span>
                        </span>

                        {onCancelTransfer && (
                          <button
                            type="button"
                            onClick={() => handleCancelOutgoing(transfer.id)}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 text-xs font-semibold rounded-lg border border-slate-800 hover:border-rose-800 transition cursor-pointer"
                          >
                            <span>Cancel Transfer</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Item list */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                            <th className="py-2 px-3">Item Details</th>
                            <th className="py-2 px-3">SKU</th>
                            <th className="py-2 px-3 text-right">Quantity In Transit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {transfer.items.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-900/50">
                              <td className="py-2 px-3 font-semibold text-white">{item.productName}</td>
                              <td className="py-2 px-3 font-mono text-slate-300">{item.sku}</td>
                              <td className="py-2 px-3 text-right font-bold text-white">
                                {item.quantity} {item.unit}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: COMPLETED TRANSFERS (TRANSFER HISTORIES)                           */}
      {/* ========================================================================= */}
      {activeTab === 'completed' && (
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Inter-Shop Transfer Histories
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Archived records of all completed, accepted, and resolved transfers for {activeShop.name}.
              </p>
            </div>

            {/* Filter and Search Controls */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={completedSearch}
                  onChange={(e) => setCompletedSearch(e.target.value)}
                  placeholder="Search transfer #, product, or shop..."
                  className="pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setCompletedDirectionFilter('all')}
                  className={`px-3 py-1 rounded-md transition font-medium ${
                    completedDirectionFilter === 'all'
                      ? 'bg-slate-800 text-white font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setCompletedDirectionFilter('incoming')}
                  className={`px-3 py-1 rounded-md transition font-medium ${
                    completedDirectionFilter === 'incoming'
                      ? 'bg-slate-800 text-white font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Incoming
                </button>
                <button
                  type="button"
                  onClick={() => setCompletedDirectionFilter('outgoing')}
                  className={`px-3 py-1 rounded-md transition font-medium ${
                    completedDirectionFilter === 'outgoing'
                      ? 'bg-slate-800 text-white font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Outgoing
                </button>
              </div>
            </div>
          </div>

          {/* Transfers Table */}
          {filteredCompletedTransfers.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <FileText className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs font-semibold text-white">No Transfer Records Found</p>
              <p className="text-[11px] text-slate-500">
                Completed inter-shop product transfers will automatically appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-900/50">
                    <th className="py-3 px-4">Transfer #</th>
                    <th className="py-3 px-4">Direction</th>
                    <th className="py-3 px-4">Partner Branch</th>
                    <th className="py-3 px-4">Items Transferred</th>
                    <th className="py-3 px-4">Resolved By & Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredCompletedTransfers.map((t) => {
                    const isIncoming = t.destinationShopId === activeShop.id;
                    return (
                      <tr key={t.id} className="hover:bg-slate-900/40 transition">
                        <td className="py-3 px-4 font-mono font-bold text-white">{t.transferNumber}</td>
                        <td className="py-3 px-4">
                          {isIncoming ? (
                            <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-800 rounded font-semibold text-[10px]">
                              INCOMING
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-sky-950 text-sky-300 border border-sky-800 rounded font-semibold text-[10px]">
                              OUTGOING
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-200">
                          {isIncoming ? t.sourceShopName : t.destinationShopName}
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-white font-semibold">{t.totalQuantity} units</span>{' '}
                          <span className="text-slate-400">({t.totalItems} SKUs)</span>
                        </td>
                        <td className="py-3 px-4 text-[11px] text-slate-400">
                          {t.confirmedByUserName ? (
                            <div>
                              <p className="text-slate-200 font-medium">{t.confirmedByUserName}</p>
                              <p className="text-slate-500">
                                {t.confirmedAt &&
                                  new Date(t.confirmedAt).toLocaleDateString('en-NG', {
                                    dateStyle: 'medium',
                                  })}
                              </p>
                            </div>
                          ) : (
                            <span>{t.initiatedByUserName}</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {t.status === 'completed' && (
                            <span className="px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded text-[10px] font-bold">
                              COMPLETED
                            </span>
                          )}
                          {t.status === 'rejected' && (
                            <span className="px-2 py-0.5 bg-rose-950 text-rose-400 border border-rose-800 rounded text-[10px] font-bold">
                              REJECTED
                            </span>
                          )}
                          {t.status === 'cancelled' && (
                            <span className="px-2 py-0.5 bg-slate-800 text-slate-400 border border-slate-700 rounded text-[10px] font-bold">
                              CANCELLED
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => setViewingSlipTransfer(t)}
                            className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                          >
                            View Slip
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
      )}

      {/* ========================================================================= */}
      {/* MODAL: REVIEW & CONFIRM INCOMING TRANSFER                                 */}
      {/* ========================================================================= */}
      {confirmingTransferId && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  Confirm & Accept Stock Transfer
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Confirm physical item counts before accepting them into <span className="text-white font-semibold">{activeShop.name}</span>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmingTransferId(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Item confirmation form */}
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {transfers
                .find((t) => t.id === confirmingTransferId)
                ?.items.map((item) => (
                  <div
                    key={item.productId}
                    className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between gap-4"
                  >
                    <div>
                      <p className="text-xs font-bold text-white">{item.productName}</p>
                      <p className="text-[11px] text-slate-400">
                        SKU: <span className="font-mono text-slate-300">{item.sku}</span> · Sent: {item.quantity} {item.unit}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-[11px] font-semibold text-slate-400">Received Qty:</label>
                      <input
                        type="number"
                        min={0}
                        max={item.quantity}
                        value={confirmedQuantities[item.productId] ?? item.quantity}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setConfirmedQuantities((prev) => ({
                            ...prev,
                            [item.productId]: isNaN(val) ? 0 : val,
                          }));
                        }}
                        className="w-16 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-bold text-white text-center focus:outline-none focus:border-emerald-500"
                      />
                      <span className="text-xs text-slate-400 font-medium">{item.unit}</span>
                    </div>
                  </div>
                ))}
            </div>

            <div className="p-3.5 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-xs text-emerald-300">
              <p className="font-bold">Immediate Stock Reflection:</p>
              <p className="text-[11px] text-emerald-400/90 mt-0.5">
                Upon accepting, these quantities will automatically be added to {activeShop.name}'s active product catalogue and immediately available for sales.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setConfirmingTransferId(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleExecuteConfirmation(confirmingTransferId)}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-md"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSubmitting ? 'Updating Stock...' : 'Confirm & Accept into Stock'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: REJECT TRANSFER REASON                                             */}
      {/* ========================================================================= */}
      {rejectingTransferId && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <XCircle className="w-5 h-5 text-rose-400" />
                Reject Inter-Shop Transfer
              </h3>
              <button
                type="button"
                onClick={() => setRejectingTransferId(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Please enter the reason for rejecting this transfer shipment. The items will be returned to the originating shop.
            </p>

            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Broken packages in transit, wrong items delivered, unauthorized dispatch..."
              className="w-full p-3 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectingTransferId(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting || !rejectionReason.trim()}
                onClick={handleExecuteRejection}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Rejecting...' : 'Reject Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: VIEW TRANSFER SLIP / VOUCHER                                      */}
      {/* ========================================================================= */}
      {viewingSlipTransfer && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-6 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                  SmartMind POS Official Voucher
                </span>
                <h3 className="text-lg font-extrabold text-white">Inter-Shop Stock Transfer Slip</h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingSlipTransfer(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Slip Area */}
            <div className="bg-white text-slate-900 p-5 rounded-xl space-y-4 font-mono text-xs">
              <div className="text-center border-b border-slate-300 pb-3">
                <p className="font-extrabold text-sm uppercase">SmartMind POS Stock Transfer</p>
                <p className="text-[11px] text-slate-600">Reference: {viewingSlipTransfer.transferNumber}</p>
                <p className="text-[10px] text-slate-500">
                  Status: {viewingSlipTransfer.status.toUpperCase()}
                </p>
              </div>

              {/* Source & Destination Details */}
              <div className="grid grid-cols-2 gap-3 text-[11px] border-b border-slate-300 pb-3">
                <div>
                  <p className="font-bold text-slate-500 uppercase text-[9px]">Originating Shop</p>
                  <p className="font-bold">{viewingSlipTransfer.sourceShopName}</p>
                  <p className="text-slate-600">Dispatched: {viewingSlipTransfer.initiatedByUserName}</p>
                  <p className="text-[10px] text-slate-500">
                    {new Date(viewingSlipTransfer.initiatedAt).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="font-bold text-slate-500 uppercase text-[9px]">Destination Shop</p>
                  <p className="font-bold">{viewingSlipTransfer.destinationShopName}</p>
                  <p className="text-slate-600">Received: {viewingSlipTransfer.confirmedByUserName || 'Pending Confirmation'}</p>
                  <p className="text-[10px] text-slate-500">
                    {viewingSlipTransfer.confirmedAt
                      ? new Date(viewingSlipTransfer.confirmedAt).toLocaleDateString()
                      : 'Pending'}
                  </p>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-1 border-b border-slate-300 pb-3">
                <div className="flex justify-between font-bold text-[10px] text-slate-500 border-b border-slate-200 pb-1">
                  <span>ITEM / SKU</span>
                  <span>QTY</span>
                </div>
                {viewingSlipTransfer.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between py-1 text-[11px]">
                    <div>
                      <p className="font-bold">{it.productName}</p>
                      <p className="text-[9px] text-slate-500">{it.sku}</p>
                    </div>
                    <div className="font-bold text-right">
                      {it.quantity} {it.unit}
                    </div>
                  </div>
                ))}
              </div>

              {/* Total Units */}
              <div className="flex justify-between font-bold text-xs pt-1">
                <span>TOTAL UNITS TRANSFERRED:</span>
                <span>{viewingSlipTransfer.totalQuantity} Units</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between border-t border-slate-800 pt-3">
              <span className="text-[11px] text-slate-400">
                Created: {new Date(viewingSlipTransfer.createdAt).toLocaleString()}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Slip</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingSlipTransfer(null)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
