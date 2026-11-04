/**
 * SmartMind POS — Phase 5: Database Adapter Interface
 *
 * Defines the contract for all local persistent storage implementations.
 * Keeps React UI code completely independent of whether the engine is
 * IndexedDB (browser preview/dev) or SQLite (Windows desktop runtime).
 */

import {
  DbAppSetting,
  DbAuditEvent,
  DbBusiness,
  DbCategory,
  DbInventoryMovement,
  DbPayment,
  DbProduct,
  DbSale,
  DbSaleItem,
  DbShop,
  DbSyncQueueEntry,
  DbUser,
  DbUserShopAssignment,
  SyncQueueStatus,
} from './schema';

export interface SyncStatusUpdateMeta {
  errorSummary?: string;
  cloudAckId?: string;
  acknowledgedAt?: string;
  conflictReason?: string;
  quarantinedAt?: string;
  quarantineReason?: string;
}

export interface DatabaseTransaction {
  // Products
  getProduct(id: string): Promise<DbProduct | null>;
  getProductBySku(shopId: string, sku: string): Promise<DbProduct | null>;
  saveProduct(product: DbProduct): Promise<void>;
  updateProductStock(productId: string, newStock: number, updatedAt: string): Promise<void>;

  // Sales & Line Items
  getSaleByIdempotencyKey(key: string): Promise<DbSale | null>;
  saveSale(sale: DbSale): Promise<void>;
  saveSaleItems(items: DbSaleItem[]): Promise<void>;

  // Inventory Movements
  saveInventoryMovement(movement: DbInventoryMovement): Promise<void>;

  // Payments
  savePayment(payment: DbPayment): Promise<void>;

  // Audit Events
  saveAuditEvent(event: DbAuditEvent): Promise<void>;

  // Sync Queue
  enqueueSync(entry: DbSyncQueueEntry): Promise<void>;
}

export interface ProductQueryFilter {
  shopId: string;
  businessId: string;
  categoryId?: string;
  onlyActive?: boolean;
  searchQuery?: string;
}

export interface InventoryMovementFilter {
  shopId: string;
  businessId: string;
  productId?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  searchQuery?: string;
}

export interface SalesQueryFilter {
  shopId: string;
  businessId: string;
  cashierUserId?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  searchQuery?: string;
}

export interface DatabaseAdapter {
  readonly adapterType: 'indexeddb-browser-dev' | 'sqlite-electron-desktop' | 'in-memory-test';
  readonly isPersistent: boolean;

  initialize(): Promise<void>;
  close(): Promise<void>;
  getSchemaVersion(): Promise<number>;

  // Transaction support
  runTransaction<T>(work: (tx: DatabaseTransaction) => Promise<T>): Promise<T>;

  // Businesses
  getAllBusinesses(): Promise<DbBusiness[]>;
  getBusiness(id: string): Promise<DbBusiness | null>;
  saveBusiness(business: DbBusiness): Promise<void>;

  // Shops
  getShopsForBusiness(businessId: string): Promise<DbShop[]>;
  getShop(id: string): Promise<DbShop | null>;
  saveShop(shop: DbShop): Promise<void>;

  // Users & Assignments
  getUsersForBusiness(businessId: string): Promise<DbUser[]>;
  getUser(id: string): Promise<DbUser | null>;
  saveUser(user: DbUser): Promise<void>;
  getAssignmentsForUser(userId: string): Promise<DbUserShopAssignment[]>;
  saveAssignment(assignment: DbUserShopAssignment): Promise<void>;

  // Categories
  getCategoriesForShop(shopId: string): Promise<DbCategory[]>;
  saveCategory(category: DbCategory): Promise<void>;

  // Products
  getProducts(filter: ProductQueryFilter): Promise<DbProduct[]>;
  getProduct(id: string): Promise<DbProduct | null>;
  getProductBySku(shopId: string, sku: string): Promise<DbProduct | null>;
  getProductByBarcode(shopId: string, barcode: string): Promise<DbProduct | null>;
  saveProduct(product: DbProduct): Promise<void>;
  deleteProduct(id: string, shopId: string): Promise<void>;

  // Inventory Movements
  getInventoryMovements(filter: InventoryMovementFilter): Promise<DbInventoryMovement[]>;
  saveInventoryMovement(movement: DbInventoryMovement): Promise<void>;

  // Sales & Line Items
  getSales(filter: SalesQueryFilter): Promise<DbSale[]>;
  getSale(id: string): Promise<DbSale | null>;
  getSaleByReceiptNumber(shopId: string, receiptNumber: string): Promise<DbSale | null>;
  getSaleByIdempotencyKey(key: string): Promise<DbSale | null>;
  getSaleItems(saleId: string): Promise<DbSaleItem[]>;
  saveSale(sale: DbSale, items: DbSaleItem[]): Promise<void>;
  updateSaleStatus(saleId: string, status: 'completed' | 'refunded' | 'voided'): Promise<void>;

  // Payments
  getPaymentsForReference(referenceType: string, referenceId: string): Promise<DbPayment[]>;
  savePayment(payment: DbPayment): Promise<void>;

  // App Settings
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string, scope?: 'global' | 'business' | 'shop', scopeId?: string): Promise<void>;

  // Audit Events
  getAuditEvents(businessId: string, shopId?: string, limit?: number): Promise<DbAuditEvent[]>;
  saveAuditEvent(event: DbAuditEvent): Promise<void>;

  // Sync Queue
  getPendingSyncQueue(shopId?: string): Promise<DbSyncQueueEntry[]>;
  getAllSyncQueue?(shopId?: string, businessId?: string): Promise<DbSyncQueueEntry[]>;
  enqueueSync(entry: DbSyncQueueEntry): Promise<void>;
  updateSyncStatus(
    id: string,
    status: SyncQueueStatus,
    errorSummary?: string,
    meta?: SyncStatusUpdateMeta
  ): Promise<void>;

  // Platform Admin Quarantined Pre-Firebase Demo Data Purge
  purgeQuarantinedPreFirebaseSales?(
    criteria: PurgeQuarantinedPreFirebaseSalesCriteria,
    storageOverride?: Storage
  ): Promise<PurgeQuarantinedPreFirebaseSalesResult>;
}

export interface PurgeQuarantinedPreFirebaseSalesCriteria {
  expectedBusinessId: string;
  expectedShopId: string;
  expectedQuarantineReason: string;
  targetQueueIds: readonly string[];
  targetSaleIds: readonly string[];
  targetAuditEventIds: readonly string[];
}

export interface PurgeQuarantinedPreFirebaseSalesResult {
  success: boolean;
  isIdempotent?: boolean;
  purgedCounts: {
    syncQueue: number;
    sales: number;
    saleItems: number;
    payments: number;
    auditEvents: number;
    localStorageResiduals: number;
  };
  details: string[];
  mismatches?: string[];
  missingRecords?: string[];
  localStorageStatus?: 'cleaned' | 'failed' | 'not_applicable' | 'no_residuals_found';
  localStorageError?: string;
}

export interface LocalStorageCleanupOutcome {
  residualsRemoved: number;
  status: 'cleaned' | 'failed' | 'not_applicable' | 'no_residuals_found';
  error?: string;
  details: string[];
}

/**
 * Hardened residual cleanup for smartmind_pos_store_v2 in localStorage:
 * - Checks sales, saleItems, payments, syncQueue, auditEvents, invoices, debtTransactions.
 * - Preserves all unrelated data; deletes only approved target IDs.
 * - Never swallows JSON parsing or storage write errors.
 * - Does not delete the entire key.
 */
export function cleanLocalStorageResiduals(
  criteria: PurgeQuarantinedPreFirebaseSalesCriteria,
  storage?: Storage
): LocalStorageCleanupOutcome {
  const targetSaleSet = new Set(criteria.targetSaleIds);
  const targetQueueSet = new Set(criteria.targetQueueIds);
  const targetAuditSet = new Set(criteria.targetAuditEventIds);

  const targetStorage =
    storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!targetStorage) {
    return {
      residualsRemoved: 0,
      status: 'not_applicable',
      details: ['localStorage is not available in current environment.'],
    };
  }

  let raw: string | null = null;
  try {
    raw = targetStorage.getItem('smartmind_pos_store_v2');
  } catch (err: any) {
    return {
      residualsRemoved: 0,
      status: 'failed',
      error: `Failed to read smartmind_pos_store_v2 from localStorage: ${err?.message || String(err)}`,
      details: ['Could not access localStorage to read legacy store.'],
    };
  }

  if (!raw) {
    return {
      residualsRemoved: 0,
      status: 'no_residuals_found',
      details: ['No smartmind_pos_store_v2 key found in localStorage.'],
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (parseErr: any) {
    return {
      residualsRemoved: 0,
      status: 'failed',
      error: `JSON parse error in smartmind_pos_store_v2: ${parseErr?.message || String(parseErr)}`,
      details: ['smartmind_pos_store_v2 contains invalid JSON and could not be parsed.'],
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      residualsRemoved: 0,
      status: 'no_residuals_found',
      details: ['smartmind_pos_store_v2 does not contain an object payload.'],
    };
  }

  let residualsRemoved = 0;

  // 1. Sales
  if (Array.isArray(parsed.sales)) {
    const before = parsed.sales.length;
    parsed.sales = parsed.sales.filter((s: any) => !targetSaleSet.has(s?.id));
    residualsRemoved += before - parsed.sales.length;
  }

  // 2. Sale Items
  if (Array.isArray(parsed.saleItems)) {
    const before = parsed.saleItems.length;
    parsed.saleItems = parsed.saleItems.filter(
      (item: any) => !targetSaleSet.has(item?.saleId || item?.sale_id)
    );
    residualsRemoved += before - parsed.saleItems.length;
  }
  if (Array.isArray(parsed.sale_items)) {
    const before = parsed.sale_items.length;
    parsed.sale_items = parsed.sale_items.filter(
      (item: any) => !targetSaleSet.has(item?.saleId || item?.sale_id)
    );
    residualsRemoved += before - parsed.sale_items.length;
  }

  // 3. Payments (must explicitly have referenceType/reference_type === 'sale' AND referenceId matching a target sale)
  if (Array.isArray(parsed.payments)) {
    const before = parsed.payments.length;
    parsed.payments = parsed.payments.filter((p: any) => {
      const refType = p?.referenceType || p?.reference_type;
      const refId = p?.referenceId || p?.reference_id;
      const isTargetSalePayment =
        refType === 'sale' && Boolean(refId && targetSaleSet.has(refId));
      return !isTargetSalePayment;
    });
    residualsRemoved += before - parsed.payments.length;
  }

  // 4. Sync Queue (matches approved queue ID or explicit sale entity with target sale ID)
  if (Array.isArray(parsed.syncQueue)) {
    const before = parsed.syncQueue.length;
    parsed.syncQueue = parsed.syncQueue.filter((q: any) => {
      const matchesExplicitQueueId = Boolean(q?.id && targetQueueSet.has(q.id));
      const entityType = q?.entityType || q?.entity_type;
      const entityId = q?.entityId || q?.entity_id;
      const matchesExplicitSaleEntity =
        entityType === 'sale' && Boolean(entityId && targetSaleSet.has(entityId));
      return !(matchesExplicitQueueId || matchesExplicitSaleEntity);
    });
    residualsRemoved += before - parsed.syncQueue.length;
  }
  if (Array.isArray(parsed.sync_queue)) {
    const before = parsed.sync_queue.length;
    parsed.sync_queue = parsed.sync_queue.filter((q: any) => {
      const matchesExplicitQueueId = Boolean(q?.id && targetQueueSet.has(q.id));
      const entityType = q?.entityType || q?.entity_type;
      const entityId = q?.entityId || q?.entity_id;
      const matchesExplicitSaleEntity =
        entityType === 'sale' && Boolean(entityId && targetSaleSet.has(entityId));
      return !(matchesExplicitQueueId || matchesExplicitSaleEntity);
    });
    residualsRemoved += before - parsed.sync_queue.length;
  }

  // 5. Audit Events (matches approved audit ID or explicit sale entity with target sale ID)
  if (Array.isArray(parsed.auditEvents)) {
    const before = parsed.auditEvents.length;
    parsed.auditEvents = parsed.auditEvents.filter((a: any) => {
      const matchesExplicitAuditId = Boolean(a?.id && targetAuditSet.has(a.id));
      const entityType = a?.entityType || a?.entity_type;
      const entityId = a?.entityId || a?.entity_id;
      const matchesExplicitSaleEntity =
        entityType === 'sale' && Boolean(entityId && targetSaleSet.has(entityId));
      return !(matchesExplicitAuditId || matchesExplicitSaleEntity);
    });
    residualsRemoved += before - parsed.auditEvents.length;
  }
  if (Array.isArray(parsed.audit_events)) {
    const before = parsed.audit_events.length;
    parsed.audit_events = parsed.audit_events.filter((a: any) => {
      const matchesExplicitAuditId = Boolean(a?.id && targetAuditSet.has(a.id));
      const entityType = a?.entityType || a?.entity_type;
      const entityId = a?.entityId || a?.entity_id;
      const matchesExplicitSaleEntity =
        entityType === 'sale' && Boolean(entityId && targetSaleSet.has(entityId));
      return !(matchesExplicitAuditId || matchesExplicitSaleEntity);
    });
    residualsRemoved += before - parsed.audit_events.length;
  }

  // 6. Invoices (remove ONLY when an explicit saleId/sale_id matches a target sale; never match on invoice's own id)
  if (Array.isArray(parsed.invoices)) {
    const before = parsed.invoices.length;
    parsed.invoices = parsed.invoices.filter((inv: any) => {
      const linkedSaleId = inv?.saleId || inv?.sale_id;
      return !(linkedSaleId && targetSaleSet.has(linkedSaleId));
    });
    residualsRemoved += before - parsed.invoices.length;
  }

  // 7. Debt Transactions (remove ONLY when explicitly linked to target sale via saleId or referenceType 'sale')
  if (Array.isArray(parsed.debtTransactions)) {
    const before = parsed.debtTransactions.length;
    parsed.debtTransactions = parsed.debtTransactions.filter((dt: any) => {
      const saleId = dt?.saleId || dt?.sale_id;
      if (saleId && targetSaleSet.has(saleId)) {
        return false;
      }
      const refType = dt?.referenceType || dt?.reference_type;
      const refId = dt?.referenceId || dt?.reference_id;
      if (refType === 'sale' && refId && targetSaleSet.has(refId)) {
        return false;
      }
      return true;
    });
    residualsRemoved += before - parsed.debtTransactions.length;
  }
  if (Array.isArray(parsed.debt_transactions)) {
    const before = parsed.debt_transactions.length;
    parsed.debt_transactions = parsed.debt_transactions.filter((dt: any) => {
      const saleId = dt?.saleId || dt?.sale_id;
      if (saleId && targetSaleSet.has(saleId)) {
        return false;
      }
      const refType = dt?.referenceType || dt?.reference_type;
      const refId = dt?.referenceId || dt?.reference_id;
      if (refType === 'sale' && refId && targetSaleSet.has(refId)) {
        return false;
      }
      return true;
    });
    residualsRemoved += before - parsed.debt_transactions.length;
  }

  if (residualsRemoved > 0) {
    try {
      targetStorage.setItem('smartmind_pos_store_v2', JSON.stringify(parsed));
    } catch (writeErr: any) {
      return {
        residualsRemoved: 0,
        status: 'failed',
        error: `Failed to write updated smartmind_pos_store_v2 to localStorage: ${writeErr?.message || String(writeErr)}`,
        details: [
          `Identified ${residualsRemoved} residual copies, but failed to write changes to localStorage.`,
        ],
      };
    }
  }

  return {
    residualsRemoved,
    status: residualsRemoved > 0 ? 'cleaned' : 'no_residuals_found',
    details: [
      residualsRemoved > 0
        ? `Purged ${residualsRemoved} residual copies from localStorage (smartmind_pos_store_v2).`
        : 'No residual target copies found in localStorage (smartmind_pos_store_v2).',
    ],
  };
}

