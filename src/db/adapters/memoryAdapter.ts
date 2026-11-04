/**
 * SmartMind POS — Phase 5: In-Memory Database Adapter
 *
 * Implements full DatabaseAdapter interface with genuine atomic
 * transaction isolation and rollback for testing and headless verification.
 */

import {
  cleanLocalStorageResiduals,
  DatabaseAdapter,
  DatabaseTransaction,
  InventoryMovementFilter,
  ProductQueryFilter,
  PurgeQuarantinedPreFirebaseSalesCriteria,
  PurgeQuarantinedPreFirebaseSalesResult,
  SalesQueryFilter,
} from '../databaseAdapter';
import {
  CURRENT_SCHEMA_VERSION,
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
} from '../schema';

export class MemoryDatabaseAdapter implements DatabaseAdapter {
  readonly adapterType = 'in-memory-test' as const;
  readonly isPersistent = false;

  private schemaVersion = CURRENT_SCHEMA_VERSION;

  public businesses = new Map<string, DbBusiness>();
  public shops = new Map<string, DbShop>();
  public users = new Map<string, DbUser>();
  public assignments = new Map<string, DbUserShopAssignment>();
  public categories = new Map<string, DbCategory>();
  public products = new Map<string, DbProduct>();
  public inventoryMovements: DbInventoryMovement[] = [];
  public sales = new Map<string, DbSale>();
  public saleItems = new Map<string, DbSaleItem[]>();
  public payments: DbPayment[] = [];
  public settings = new Map<string, DbAppSetting>();
  public auditEvents: DbAuditEvent[] = [];
  public syncQueue: DbSyncQueueEntry[] = [];

  private isInitialized = false;

  async initialize(): Promise<void> {
    this.isInitialized = true;
  }

  async close(): Promise<void> {
    this.isInitialized = false;
  }

  async getSchemaVersion(): Promise<number> {
    return this.schemaVersion;
  }

  private txLock: Promise<void> = Promise.resolve();

  /**
   * Genuine atomic transaction implementation:
   * Serializes transactions with a mutex lock (matching SQLite's BEGIN IMMEDIATE),
   * takes a snapshot before execution, and rolls back all staged mutations on error.
   */
  async runTransaction<T>(work: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    const previousLock = this.txLock;
    let releaseLock: () => void;
    this.txLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    await previousLock;

    // Snapshot state
    const snapshotProducts = new Map(this.products);
    const snapshotMovements = [...this.inventoryMovements];
    const snapshotSales = new Map(this.sales);
    const snapshotSaleItems = new Map(this.saleItems);
    const snapshotPayments = [...this.payments];
    const snapshotAudit = [...this.auditEvents];
    const snapshotSync = [...this.syncQueue];

    // Local staging collections for the transaction
    const stagedProducts = new Map(this.products);
    const stagedMovements = [...this.inventoryMovements];
    const stagedSales = new Map(this.sales);
    const stagedSaleItems = new Map(this.saleItems);
    const stagedPayments = [...this.payments];
    const stagedAudit = [...this.auditEvents];
    const stagedSync = [...this.syncQueue];

    const tx: DatabaseTransaction = {
      getProduct: async (id: string) => stagedProducts.get(id) ?? null,
      getProductBySku: async (shopId: string, sku: string) => {
        for (const p of stagedProducts.values()) {
          if (p.shop_id === shopId && p.sku.toLowerCase() === sku.toLowerCase()) {
            return p;
          }
        }
        return null;
      },
      saveProduct: async (p: DbProduct) => {
        stagedProducts.set(p.id, { ...p });
      },
      updateProductStock: async (productId: string, newStock: number, updatedAt: string) => {
        const prod = stagedProducts.get(productId);
        if (!prod) {
          throw new Error(`Product not found for stock update: ${productId}`);
        }
        if (newStock < 0) {
          throw new Error(`Cannot set negative stock (${newStock}) for product ${prod.name}`);
        }
        stagedProducts.set(productId, {
          ...prod,
          stock_quantity: newStock,
          updated_at: updatedAt,
        });
      },
      getSaleByIdempotencyKey: async (key: string) => {
        for (const s of stagedSales.values()) {
          if (s.idempotency_key && s.idempotency_key === key) {
            return s;
          }
        }
        return null;
      },
      saveSale: async (s: DbSale) => {
        // Enforce idempotency key uniqueness
        if (s.idempotency_key) {
          for (const existing of stagedSales.values()) {
            if (existing.idempotency_key === s.idempotency_key && existing.id !== s.id) {
              throw new Error(`Unique constraint failed: Duplicate idempotency key ${s.idempotency_key}`);
            }
          }
        }
        stagedSales.set(s.id, { ...s });
      },
      saveSaleItems: async (items: DbSaleItem[]) => {
        if (items.length === 0) return;
        const saleId = items[0].sale_id;
        stagedSaleItems.set(saleId, [...items.map((i) => ({ ...i }))]);
      },
      saveInventoryMovement: async (m: DbInventoryMovement) => {
        stagedMovements.push({ ...m });
      },
      savePayment: async (pmt: DbPayment) => {
        stagedPayments.push({ ...pmt });
      },
      saveAuditEvent: async (a: DbAuditEvent) => {
        stagedAudit.push({ ...a });
      },
      enqueueSync: async (e: DbSyncQueueEntry) => {
        stagedSync.push({ ...e });
      },
    };

    try {
      const result = await work(tx);

      // COMMIT: apply staged changes to master state
      this.products = stagedProducts;
      this.inventoryMovements = stagedMovements;
      this.sales = stagedSales;
      this.saleItems = stagedSaleItems;
      this.payments = stagedPayments;
      this.auditEvents = stagedAudit;
      this.syncQueue = stagedSync;

      return result;
    } catch (err) {
      // ROLLBACK: restore snapshots
      this.products = snapshotProducts;
      this.inventoryMovements = snapshotMovements;
      this.sales = snapshotSales;
      this.saleItems = snapshotSaleItems;
      this.payments = snapshotPayments;
      this.auditEvents = snapshotAudit;
      this.syncQueue = snapshotSync;
      throw err;
    } finally {
      releaseLock!();
    }
  }

  // Businesses
  async getAllBusinesses(): Promise<DbBusiness[]> {
    return Array.from(this.businesses.values());
  }

  async getBusiness(id: string): Promise<DbBusiness | null> {
    return this.businesses.get(id) ?? null;
  }

  async saveBusiness(business: DbBusiness): Promise<void> {
    this.businesses.set(business.id, { ...business });
  }

  // Shops
  async getShopsForBusiness(businessId: string): Promise<DbShop[]> {
    return Array.from(this.shops.values()).filter((s) => s.business_id === businessId);
  }

  async getShop(id: string): Promise<DbShop | null> {
    return this.shops.get(id) ?? null;
  }

  async saveShop(shop: DbShop): Promise<void> {
    this.shops.set(shop.id, { ...shop });
  }

  // Users & Assignments
  async getUsersForBusiness(businessId: string): Promise<DbUser[]> {
    return Array.from(this.users.values()).filter(
      (u) => u.business_id === businessId || (businessId === 'PLATFORM' && u.role === 'platform_admin')
    );
  }

  async getUser(id: string): Promise<DbUser | null> {
    return this.users.get(id) ?? null;
  }

  async saveUser(user: DbUser): Promise<void> {
    this.users.set(user.id, { ...user });
  }

  async getAssignmentsForUser(userId: string): Promise<DbUserShopAssignment[]> {
    return Array.from(this.assignments.values()).filter(
      (a) => a.user_id === userId && a.is_active === 1
    );
  }

  async saveAssignment(assignment: DbUserShopAssignment): Promise<void> {
    this.assignments.set(assignment.id, { ...assignment });
  }

  // Categories
  async getCategoriesForShop(shopId: string): Promise<DbCategory[]> {
    return Array.from(this.categories.values()).filter((c) => c.shop_id === shopId);
  }

  async saveCategory(category: DbCategory): Promise<void> {
    this.categories.set(category.id, { ...category });
  }

  // Products
  async getProducts(filter: ProductQueryFilter): Promise<DbProduct[]> {
    return Array.from(this.products.values()).filter((p) => {
      if (p.shop_id !== filter.shopId || p.business_id !== filter.businessId) return false;
      if (filter.onlyActive && p.is_active !== 1) return false;
      if (filter.categoryId && filter.categoryId !== 'all' && p.category_id !== filter.categoryId) {
        return false;
      }
      if (filter.searchQuery && filter.searchQuery.trim()) {
        const q = filter.searchQuery.trim().toLowerCase();
        const matches =
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q) ||
          p.category_name.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }

  async getProduct(id: string): Promise<DbProduct | null> {
    return this.products.get(id) ?? null;
  }

  async getProductBySku(shopId: string, sku: string): Promise<DbProduct | null> {
    const cleanSku = sku.trim().toLowerCase();
    for (const p of this.products.values()) {
      if (p.shop_id === shopId && p.sku.trim().toLowerCase() === cleanSku) {
        return p;
      }
    }
    return null;
  }

  async getProductByBarcode(shopId: string, barcode: string): Promise<DbProduct | null> {
    const clean = barcode.trim().toLowerCase();
    for (const p of this.products.values()) {
      if (p.shop_id === shopId && p.barcode.trim().toLowerCase() === clean) {
        return p;
      }
    }
    return null;
  }

  async saveProduct(product: DbProduct): Promise<void> {
    // Check shop-scoped SKU uniqueness
    const existing = await this.getProductBySku(product.shop_id, product.sku);
    if (existing && existing.id !== product.id) {
      throw new Error(`SKU "${product.sku}" is already in use by another product in this shop.`);
    }
    this.products.set(product.id, { ...product });
  }

  async deleteProduct(id: string, shopId: string): Promise<void> {
    const p = this.products.get(id);
    if (p && p.shop_id === shopId) {
      this.products.delete(id);
    }
  }

  // Inventory Movements
  async getInventoryMovements(filter: InventoryMovementFilter): Promise<DbInventoryMovement[]> {
    return this.inventoryMovements.filter((m) => {
      if (m.shop_id !== filter.shopId || m.business_id !== filter.businessId) return false;
      if (filter.productId && m.product_id !== filter.productId) return false;
      if (filter.type && filter.type !== 'all' && m.type !== filter.type) return false;
      if (filter.searchQuery && filter.searchQuery.trim()) {
        const q = filter.searchQuery.trim().toLowerCase();
        const matches =
          m.product_name.toLowerCase().includes(q) ||
          m.product_sku.toLowerCase().includes(q) ||
          m.performed_by_name.toLowerCase().includes(q) ||
          m.reason.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }

  async saveInventoryMovement(movement: DbInventoryMovement): Promise<void> {
    this.inventoryMovements.push({ ...movement });
  }

  // Sales
  async getSales(filter: SalesQueryFilter): Promise<DbSale[]> {
    return Array.from(this.sales.values()).filter((s) => {
      if (s.shop_id !== filter.shopId || s.business_id !== filter.businessId) return false;
      if (filter.cashierUserId && filter.cashierUserId !== 'all' && s.cashier_user_id !== filter.cashierUserId) {
        return false;
      }
      if (filter.status && filter.status !== 'all' && s.status !== filter.status) return false;
      if (filter.searchQuery && filter.searchQuery.trim()) {
        const q = filter.searchQuery.trim().toLowerCase();
        const matches =
          s.receipt_number.toLowerCase().includes(q) ||
          s.cashier_name.toLowerCase().includes(q) ||
          (s.payment_reference && s.payment_reference.toLowerCase().includes(q)) ||
          (s.credit_customer_name && s.credit_customer_name.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }

  async getSale(id: string): Promise<DbSale | null> {
    return this.sales.get(id) ?? null;
  }

  async getSaleByReceiptNumber(shopId: string, receiptNumber: string): Promise<DbSale | null> {
    const clean = receiptNumber.trim().toLowerCase();
    for (const s of this.sales.values()) {
      if (s.shop_id === shopId && s.receipt_number.trim().toLowerCase() === clean) {
        return s;
      }
    }
    return null;
  }

  async getSaleByIdempotencyKey(key: string): Promise<DbSale | null> {
    for (const s of this.sales.values()) {
      if (s.idempotency_key === key) {
        return s;
      }
    }
    return null;
  }

  async getSaleItems(saleId: string): Promise<DbSaleItem[]> {
    return this.saleItems.get(saleId) ?? [];
  }

  async saveSale(sale: DbSale, items: DbSaleItem[]): Promise<void> {
    this.sales.set(sale.id, { ...sale });
    this.saleItems.set(sale.id, [...items.map((i) => ({ ...i }))]);
  }

  async updateSaleStatus(saleId: string, status: 'completed' | 'refunded' | 'voided'): Promise<void> {
    const s = this.sales.get(saleId);
    if (s) {
      this.sales.set(saleId, { ...s, status });
    }
  }

  // Payments
  async getPaymentsForReference(referenceType: string, referenceId: string): Promise<DbPayment[]> {
    return this.payments.filter(
      (p) => p.reference_type === referenceType && p.reference_id === referenceId
    );
  }

  async savePayment(payment: DbPayment): Promise<void> {
    this.payments.push({ ...payment });
  }

  // App Settings
  async getSetting(key: string): Promise<string | null> {
    const setting = this.settings.get(key);
    return setting ? setting.value : null;
  }

  async setSetting(
    key: string,
    value: string,
    scope: 'global' | 'business' | 'shop' = 'global',
    scopeId?: string
  ): Promise<void> {
    this.settings.set(key, {
      key,
      value,
      scope,
      scope_id: scopeId,
      updated_at: new Date().toISOString(),
    });
  }

  // Audit Events
  async getAuditEvents(businessId: string, shopId?: string, limit = 100): Promise<DbAuditEvent[]> {
    return this.auditEvents
      .filter((a) => a.business_id === businessId && (!shopId || a.shop_id === shopId))
      .slice(-limit);
  }

  async saveAuditEvent(event: DbAuditEvent): Promise<void> {
    this.auditEvents.push({ ...event });
  }

  // Sync Queue
  async getPendingSyncQueue(shopId?: string): Promise<DbSyncQueueEntry[]> {
    return this.syncQueue.filter((e) => {
      if (shopId && e.shop_id !== shopId) return false;
      return e.status === 'pending' || e.status === 'failed';
    });
  }

  async getAllSyncQueue(shopId?: string, businessId?: string): Promise<DbSyncQueueEntry[]> {
    return this.syncQueue.filter((e) => {
      if (shopId && e.shop_id !== shopId) return false;
      if (businessId && e.business_id !== businessId) return false;
      return true;
    });
  }

  async enqueueSync(entry: DbSyncQueueEntry): Promise<void> {
    this.syncQueue.push({ ...entry });
  }

  async updateSyncStatus(
    id: string,
    status: 'pending' | 'processing' | 'synced' | 'failed' | 'requires_review' | 'quarantined',
    errorSummary?: string,
    meta?: {
      errorSummary?: string;
      cloudAckId?: string;
      acknowledgedAt?: string;
      conflictReason?: string;
      quarantinedAt?: string;
      quarantineReason?: string;
    }
  ): Promise<void> {
    const entry = this.syncQueue.find((e) => e.id === id);
    if (entry) {
      entry.status = status;
      if (errorSummary !== undefined) entry.error_summary = errorSummary;
      if (meta?.errorSummary !== undefined) entry.error_summary = meta.errorSummary;
      if (meta?.cloudAckId !== undefined) entry.cloud_ack_id = meta.cloudAckId;
      if (meta?.acknowledgedAt !== undefined) entry.acknowledged_at = meta.acknowledgedAt;
      if (meta?.conflictReason !== undefined) entry.conflict_reason = meta.conflictReason;
      if (meta?.quarantinedAt !== undefined) entry.quarantined_at = meta.quarantinedAt;
      if (meta?.quarantineReason !== undefined) entry.quarantine_reason = meta.quarantineReason;
      if (status === 'failed') entry.retry_count += 1;
    }
  }

  async purgeQuarantinedPreFirebaseSales(
    criteria: PurgeQuarantinedPreFirebaseSalesCriteria,
    storageOverride?: Storage
  ): Promise<PurgeQuarantinedPreFirebaseSalesResult> {
    const previousLock = this.txLock;
    let releaseLock: () => void = () => {};
    this.txLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    await previousLock;

    try {
      const targetQueueSet = new Set(criteria.targetQueueIds);
      const targetSaleSet = new Set(criteria.targetSaleIds);
      const targetAuditSet = new Set(criteria.targetAuditEventIds);

      // STEP 1: Find all matching target records
      const foundQueue = this.syncQueue.filter((e) => targetQueueSet.has(e.id));
      const foundSales = Array.from(this.sales.values()).filter((s) => targetSaleSet.has(s.id));
      const foundAudits = this.auditEvents.filter((a) => targetAuditSet.has(a.id));

      const totalTargetCount =
        criteria.targetQueueIds.length +
        criteria.targetSaleIds.length +
        criteria.targetAuditEventIds.length;
      const totalFoundCount = foundQueue.length + foundSales.length + foundAudits.length;

      // 1A. All target records already removed (Idempotent case)
      if (totalFoundCount === 0) {
        const lsOutcome = cleanLocalStorageResiduals(criteria, storageOverride);
        const lsSuccess = lsOutcome.status !== 'failed';
        return {
          success: lsSuccess,
          isIdempotent: true,
          purgedCounts: {
            syncQueue: 0,
            sales: 0,
            saleItems: 0,
            payments: 0,
            auditEvents: 0,
            localStorageResiduals: lsOutcome.residualsRemoved,
          },
          details: [
            'All target pre-Firebase records were already removed from the database (idempotent verification).',
            ...lsOutcome.details,
          ],
          localStorageStatus: lsOutcome.status,
          localStorageError: lsOutcome.error,
        };
      }

      // 1B. Validate all found records for tenant / quarantine marker mismatches
      const mismatches: string[] = [];

      for (const entry of foundQueue) {
        if (entry.business_id !== criteria.expectedBusinessId) {
          mismatches.push(
            `Sync queue entry "${entry.id}" business_id "${entry.business_id}" does not match expected "${criteria.expectedBusinessId}".`
          );
        }
        if (entry.shop_id !== criteria.expectedShopId) {
          mismatches.push(
            `Sync queue entry "${entry.id}" shop_id "${entry.shop_id}" does not match expected "${criteria.expectedShopId}".`
          );
        }
        const hasExpectedReason =
          entry.quarantine_reason === criteria.expectedQuarantineReason ||
          entry.error_summary === criteria.expectedQuarantineReason ||
          entry.conflict_reason === criteria.expectedQuarantineReason;
        if (entry.status !== 'quarantined' || !hasExpectedReason) {
          mismatches.push(
            `Sync queue entry "${entry.id}" status/reason ("${entry.status}" / "${entry.quarantine_reason || entry.error_summary}") does not match expected quarantine marker.`
          );
        }
      }

      for (const sale of foundSales) {
        if (sale.business_id !== criteria.expectedBusinessId) {
          mismatches.push(
            `Sale "${sale.id}" business_id "${sale.business_id}" does not match expected "${criteria.expectedBusinessId}".`
          );
        }
        if (sale.shop_id !== criteria.expectedShopId) {
          mismatches.push(
            `Sale "${sale.id}" shop_id "${sale.shop_id}" does not match expected "${criteria.expectedShopId}".`
          );
        }
      }

      for (const audit of foundAudits) {
        if (audit.business_id !== criteria.expectedBusinessId) {
          mismatches.push(
            `Audit event "${audit.id}" business_id "${audit.business_id}" does not match expected "${criteria.expectedBusinessId}".`
          );
        }
      }

      // 1C. Check for missing target records
      const missingRecords: string[] = [];
      if (totalFoundCount < totalTargetCount) {
        const foundQueueIds = new Set(foundQueue.map((e) => e.id));
        const foundSaleIds = new Set(foundSales.map((s) => s.id));
        const foundAuditIds = new Set(foundAudits.map((a) => a.id));

        for (const qId of criteria.targetQueueIds) {
          if (!foundQueueIds.has(qId)) {
            missingRecords.push(`Missing expected sync_queue entry: "${qId}".`);
          }
        }
        for (const sId of criteria.targetSaleIds) {
          if (!foundSaleIds.has(sId)) {
            missingRecords.push(`Missing expected sale record: "${sId}".`);
          }
        }
        for (const aId of criteria.targetAuditEventIds) {
          if (!foundAuditIds.has(aId)) {
            missingRecords.push(`Missing expected audit_event record: "${aId}".`);
          }
        }
      }

      if (mismatches.length > 0 || missingRecords.length > 0) {
        return {
          success: false,
          isIdempotent: false,
          purgedCounts: {
            syncQueue: 0,
            sales: 0,
            saleItems: 0,
            payments: 0,
            auditEvents: 0,
            localStorageResiduals: 0,
          },
          details: [
            ...(mismatches.length > 0
              ? ['Purge aborted: Mismatched synthetic tenant identifiers or quarantine markers detected.']
              : []),
            ...(missingRecords.length > 0
              ? [
                  `Purge aborted: Incomplete target record set. Expected all ${totalTargetCount} target records but found only ${totalFoundCount}. All required records must be present, or all already removed.`,
                ]
              : []),
          ],
          mismatches: mismatches.length > 0 ? mismatches : undefined,
          missingRecords: missingRecords.length > 0 ? missingRecords : undefined,
        };
      }

      // STEP 2: Atomic Deletion Phase
      const snapshotSales = new Map(this.sales);
      const snapshotSaleItems = new Map(this.saleItems);
      const snapshotPayments = [...this.payments];
      const snapshotAudit = [...this.auditEvents];
      const snapshotSync = [...this.syncQueue];

      try {
        const initialQueueCount = this.syncQueue.length;
        this.syncQueue = this.syncQueue.filter((e) => !targetQueueSet.has(e.id));
        const purgedQueueCount = initialQueueCount - this.syncQueue.length;

        let purgedSalesCount = 0;
        for (const sid of criteria.targetSaleIds) {
          if (this.sales.delete(sid)) {
            purgedSalesCount += 1;
          }
        }

        let purgedItemsCount = 0;
        for (const sid of criteria.targetSaleIds) {
          const items = this.saleItems.get(sid);
          if (items) {
            purgedItemsCount += items.length;
            this.saleItems.delete(sid);
          }
        }
        for (const [key, items] of Array.from(this.saleItems.entries())) {
          if (targetSaleSet.has(key)) {
            purgedItemsCount += items.length;
            this.saleItems.delete(key);
          }
        }

        const initialPaymentsCount = this.payments.length;
        this.payments = this.payments.filter(
          (p) => !(p.reference_type === 'sale' && targetSaleSet.has(p.reference_id))
        );
        const purgedPaymentsCount = initialPaymentsCount - this.payments.length;

        const initialAuditCount = this.auditEvents.length;
        this.auditEvents = this.auditEvents.filter((a) => !targetAuditSet.has(a.id));
        const purgedAuditCount = initialAuditCount - this.auditEvents.length;

        // STEP 3: LocalStorage Cleanup
        const lsOutcome = cleanLocalStorageResiduals(criteria, storageOverride);
        const finalSuccess = lsOutcome.status !== 'failed';

        return {
          success: finalSuccess,
          isIdempotent: false,
          purgedCounts: {
            syncQueue: purgedQueueCount,
            sales: purgedSalesCount,
            saleItems: purgedItemsCount,
            payments: purgedPaymentsCount,
            auditEvents: purgedAuditCount,
            localStorageResiduals: lsOutcome.residualsRemoved,
          },
          details: [
            `Purged ${purgedQueueCount} quarantined sync_queue entries.`,
            `Purged ${purgedSalesCount} local DbSale records.`,
            `Purged ${purgedItemsCount} linked sale line items.`,
            `Purged ${purgedPaymentsCount} linked payments.`,
            `Purged ${purgedAuditCount} quarantine audit events.`,
            ...lsOutcome.details,
            ...(lsOutcome.status === 'failed'
              ? [`WARNING: localStorage residual cleanup failed: ${lsOutcome.error}`]
              : []),
          ],
          localStorageStatus: lsOutcome.status,
          localStorageError: lsOutcome.error,
        };
      } catch (err) {
        this.sales = snapshotSales;
        this.saleItems = snapshotSaleItems;
        this.payments = snapshotPayments;
        this.auditEvents = snapshotAudit;
        this.syncQueue = snapshotSync;
        throw err;
      }
    } finally {
      releaseLock();
    }
  }
}

