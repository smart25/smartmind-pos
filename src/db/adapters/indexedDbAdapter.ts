/**
 * SmartMind POS — Phase 5: Browser IndexedDB Database Adapter
 *
 * Provides structured, offline-ready local storage in browser development mode.
 * Explicitly identifies itself as 'indexeddb-browser-dev' (not SQLite).
 * Includes automatic migration from legacy localStorage records so existing
 * user data is preserved without silent loss.
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
  SyncQueueStatus,
  toMinorUnits,
} from '../schema';
import { MemoryDatabaseAdapter } from './memoryAdapter';

const DEFAULT_DB_NAME = 'smartmind_pos_local_db';
const DB_VERSION = CURRENT_SCHEMA_VERSION;

export class IndexedDbDatabaseAdapter implements DatabaseAdapter {
  readonly adapterType = 'indexeddb-browser-dev' as const;
  readonly isPersistent = true;

  private readonly dbName: string;
  private db: IDBDatabase | null = null;
  private memoryFallback: MemoryDatabaseAdapter | null = null;

  constructor(databaseName: string = DEFAULT_DB_NAME) {
    this.dbName =
      typeof databaseName === 'string' && databaseName.trim().length > 0
        ? databaseName.trim()
        : DEFAULT_DB_NAME;
  }

  getDatabaseName(): string {
    return this.dbName;
  }

  async initialize(): Promise<void> {
    const idbFactory: IDBFactory | undefined =
      typeof window !== 'undefined' && window.indexedDB
        ? window.indexedDB
        : typeof indexedDB !== 'undefined'
        ? indexedDB
        : undefined;

    if (!idbFactory) {
      // Running in headless or non-browser test environment without IndexedDB
      this.memoryFallback = new MemoryDatabaseAdapter();
      await this.memoryFallback.initialize();
      return;
    }

    return new Promise((resolve, reject) => {
      const request = idbFactory.open(this.dbName, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        const stores = [
          { name: 'businesses', keyPath: 'id' },
          { name: 'shops', keyPath: 'id' },
          { name: 'users', keyPath: 'id' },
          { name: 'assignments', keyPath: 'id' },
          { name: 'categories', keyPath: 'id' },
          { name: 'products', keyPath: 'id' },
          { name: 'inventory_movements', keyPath: 'id' },
          { name: 'sales', keyPath: 'id' },
          { name: 'sale_items', keyPath: 'id' },
          { name: 'payments', keyPath: 'id' },
          { name: 'settings', keyPath: 'key' },
          { name: 'audit_events', keyPath: 'id' },
          { name: 'sync_queue', keyPath: 'id' },
        ];

        for (const s of stores) {
          if (!db.objectStoreNames.contains(s.name)) {
            db.createObjectStore(s.name, { keyPath: s.keyPath });
          }
        }
      };

      request.onsuccess = async () => {
        this.db = request.result;
        try {
          await this.migrateLegacyLocalStorageData();
        } catch {
          // Ignore non-fatal migration glitches
        }
        resolve();
      };

      request.onerror = () => {
        // Fall back to memory adapter if IndexedDB permission denied
        this.memoryFallback = new MemoryDatabaseAdapter();
        this.memoryFallback.initialize().then(resolve).catch(reject);
      };
    });
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    if (this.memoryFallback) {
      await this.memoryFallback.close();
      this.memoryFallback = null;
    }
  }

  async getSchemaVersion(): Promise<number> {
    return CURRENT_SCHEMA_VERSION;
  }

  /**
   * Migrate legacy data from localStorage (smartmind_pos_store_v2) on first run,
   * strictly excluding known demo seed records and pre-Firebase sequential test IDs.
   */
  private async migrateLegacyLocalStorageData(): Promise<void> {
    if (typeof window === 'undefined' || !this.db) return;
    try {
      const raw = window.localStorage.getItem('smartmind_pos_store_v2');
      if (!raw) return;

      const migrationFlag = window.localStorage.getItem('smartmind_pos_idb_migrated_v5');
      if (migrationFlag === '1') return;

      const parsed = JSON.parse(raw);
      if (!parsed) return;

      const isDemoOrPreFirebaseId = (bizId?: string, shopId?: string): boolean => {
        const b = bizId || '';
        const s = shopId || '';
        if (
          b === 'biz-platform-hq' ||
          b === 'biz-emerald-01' ||
          b === 'biz-horizon-02' ||
          b === 'biz-royal-03' ||
          b === 'biz-0003-u42w' ||
          /^biz-00\d\d-[a-z0-9]{4}$/i.test(b)
        ) {
          return true;
        }
        if (
          s === 'shop-vi-01' ||
          s === 'shop-ikj-02' ||
          s === 'shop-lek-03' ||
          s === 'shop-abj-01' ||
          s === 'shop-phc-01' ||
          s === 'shop-0005-9i6p' ||
          /^shop-00\d\d-[a-z0-9]{4}$/i.test(s)
        ) {
          return true;
        }
        return false;
      };

      // Migrate businesses (only verified live businesses)
      if (Array.isArray(parsed.businesses)) {
        for (const b of parsed.businesses) {
          if (isDemoOrPreFirebaseId(b?.id)) continue;
          const dbBiz: DbBusiness = {
            id: b.id,
            name: b.name,
            legal_name: b.legalName || b.name,
            business_type: b.businessType || 'General Retail',
            registration_number: b.registrationNumber || 'RC-000000',
            tax_identification_number: b.taxIdentificationNumber || 'TIN-000000',
            owner_user_id: b.ownerUserId || '',
            owner_name: b.ownerName || '',
            owner_email: b.ownerEmail || '',
            contact_email: b.contactEmail || b.ownerEmail || '',
            primary_phone: b.primaryPhone || '',
            headquarters_address: b.headquartersAddress || '',
            currency_code: b.currencyCode || 'NGN',
            currency_symbol: b.currencySymbol || '₦',
            default_tax_rate_percent: b.defaultTaxRatePercent ?? 7.5,
            status: b.status || 'active',
            notes: b.notes,
            created_at: b.createdAt || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          await this.saveBusiness(dbBiz);
        }
      }

      // Migrate shops (only verified live shops)
      if (Array.isArray(parsed.shops)) {
        for (const s of parsed.shops) {
          if (isDemoOrPreFirebaseId(s?.businessId, s?.id)) continue;
          const dbShop: DbShop = {
            id: s.id,
            business_id: s.businessId,
            code: s.code,
            name: s.name,
            category: s.category || 'Retail Store',
            location_city: s.locationCity || 'Lagos',
            address: s.address || '',
            phone: s.phone || '',
            description: s.description,
            manager_name: s.managerName || 'Manager',
            status: s.status || 'active',
            terminal_id: s.terminalId || 'TERM-01',
            tax_rate_percent: s.taxRatePercent ?? 7.5,
            receipt_header_note: s.receiptHeaderNote || '',
            receipt_footer_note: s.receiptFooterNote || '',
            printer_settings_json: s.printerSettings ? JSON.stringify(s.printerSettings) : undefined,
            created_at: s.createdAt || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          await this.saveShop(dbShop);
        }
      }

      // Migrate categories (only verified live categories)
      if (Array.isArray(parsed.categories)) {
        for (const c of parsed.categories) {
          if (isDemoOrPreFirebaseId(c?.businessId, c?.shopId)) continue;
          const dbCat: DbCategory = {
            id: c.id,
            shop_id: c.shopId,
            business_id: c.businessId,
            name: c.name,
            description: c.description || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          await this.saveCategory(dbCat);
        }
      }

      // Migrate products (only verified live products)
      if (Array.isArray(parsed.products)) {
        for (const p of parsed.products) {
          if (isDemoOrPreFirebaseId(p?.businessId, p?.shopId)) continue;
          const dbProd: DbProduct = {
            id: p.id,
            shop_id: p.shopId,
            business_id: p.businessId,
            category_id: p.categoryId,
            category_name: p.categoryName || 'General',
            sku: p.sku,
            barcode: p.barcode || p.sku,
            name: p.name,
            unit: p.unit || 'Pack',
            cost_price_kobo: toMinorUnits(p.costPrice || 0),
            selling_price_kobo: toMinorUnits(p.sellingPrice || 0),
            stock_quantity: p.stockQuantity ?? 0,
            reorder_level: p.reorderLevel ?? 5,
            tax_exempt: p.taxExempt ? 1 : 0,
            is_active: p.isActive !== false ? 1 : 0,
            created_at: p.updatedAt || new Date().toISOString(),
            updated_at: p.updatedAt || new Date().toISOString(),
          };
          await this.saveProduct(dbProd);
        }
      }

      window.localStorage.setItem('smartmind_pos_idb_migrated_v5', '1');
    } catch {
      // Non-fatal migration error
    }
  }

  private getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    if (!this.db) throw new Error('Database not initialized');
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  async runTransaction<T>(work: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    if (this.memoryFallback) {
      return this.memoryFallback.runTransaction(work);
    }

    // In IndexedDB, run transaction with staging objects to ensure atomic rollback
    const stagedProducts = new Map<string, DbProduct>();
    const stagedMovements: DbInventoryMovement[] = [];
    let stagedSale: DbSale | null = null;
    let stagedSaleItems: DbSaleItem[] = [];
    const stagedPayments: DbPayment[] = [];
    const stagedAudit: DbAuditEvent[] = [];
    const stagedSync: DbSyncQueueEntry[] = [];

    const txInterface: DatabaseTransaction = {
      getProduct: async (id: string) => {
        if (stagedProducts.has(id)) return stagedProducts.get(id)!;
        return this.getProduct(id);
      },
      getProductBySku: async (shopId: string, sku: string) => {
        for (const p of stagedProducts.values()) {
          if (p.shop_id === shopId && p.sku.toLowerCase() === sku.toLowerCase()) return p;
        }
        return this.getProductBySku(shopId, sku);
      },
      saveProduct: async (p: DbProduct) => {
        stagedProducts.set(p.id, p);
      },
      updateProductStock: async (productId: string, newStock: number, updatedAt: string) => {
        const prod = (stagedProducts.get(productId) ?? (await this.getProduct(productId)));
        if (!prod) throw new Error(`Product ${productId} not found for stock update`);
        if (newStock < 0) throw new Error(`Stock cannot be negative for ${prod.name}`);
        stagedProducts.set(productId, {
          ...prod,
          stock_quantity: newStock,
          updated_at: updatedAt,
        });
      },
      getSaleByIdempotencyKey: async (key: string) => {
        if (stagedSale && stagedSale.idempotency_key === key) return stagedSale;
        return this.getSaleByIdempotencyKey(key);
      },
      saveSale: async (sale: DbSale) => {
        stagedSale = sale;
      },
      saveSaleItems: async (items: DbSaleItem[]) => {
        stagedSaleItems = items;
      },
      saveInventoryMovement: async (m: DbInventoryMovement) => {
        stagedMovements.push(m);
      },
      savePayment: async (p: DbPayment) => {
        stagedPayments.push(p);
      },
      saveAuditEvent: async (a: DbAuditEvent) => {
        stagedAudit.push(a);
      },
      enqueueSync: async (e: DbSyncQueueEntry) => {
        stagedSync.push(e);
      },
    };

    // Execute work: if work throws, nothing is written to IndexedDB (clean rollback)
    const result = await work(txInterface);

    // Commit staged records
    if (!this.db) return result;

    const storeNames = [
      'products',
      'inventory_movements',
      'sales',
      'sale_items',
      'payments',
      'audit_events',
      'sync_queue',
    ];
    const idbTx = this.db.transaction(storeNames, 'readwrite');

    const productsStore = idbTx.objectStore('products');
    for (const p of stagedProducts.values()) {
      productsStore.put(p);
    }

    const movementsStore = idbTx.objectStore('inventory_movements');
    for (const m of stagedMovements) {
      movementsStore.put(m);
    }

    if (stagedSale) {
      idbTx.objectStore('sales').put(stagedSale);
    }

    const itemsStore = idbTx.objectStore('sale_items');
    for (const item of stagedSaleItems) {
      itemsStore.put(item);
    }

    const paymentsStore = idbTx.objectStore('payments');
    for (const p of stagedPayments) {
      paymentsStore.put(p);
    }

    const auditStore = idbTx.objectStore('audit_events');
    for (const a of stagedAudit) {
      auditStore.put(a);
    }

    const syncStore = idbTx.objectStore('sync_queue');
    for (const s of stagedSync) {
      syncStore.put(s);
    }

    await new Promise<void>((resolve, reject) => {
      idbTx.oncomplete = () => resolve();
      idbTx.onerror = () => reject(idbTx.error);
      idbTx.onabort = () => reject(new Error('IndexedDB transaction aborted'));
    });

    return result;
  }

  // Generic IDB operations
  private async getAllFromStore<T>(storeName: string): Promise<T[]> {
    if (this.memoryFallback) return [];
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName, 'readonly');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  }

  private async getFromStore<T>(storeName: string, key: IDBValidKey): Promise<T | null> {
    if (this.memoryFallback) return null;
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName, 'readonly');
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  private async putToStore(storeName: string, value: any): Promise<void> {
    if (this.memoryFallback) return;
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName, 'readwrite');
      const req = store.put(value);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private async deleteFromStore(storeName: string, key: IDBValidKey): Promise<void> {
    if (this.memoryFallback) return;
    return new Promise((resolve, reject) => {
      const store = this.getStore(storeName, 'readwrite');
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // Businesses
  async getAllBusinesses(): Promise<DbBusiness[]> {
    if (this.memoryFallback) return this.memoryFallback.getAllBusinesses();
    return this.getAllFromStore<DbBusiness>('businesses');
  }

  async getBusiness(id: string): Promise<DbBusiness | null> {
    if (this.memoryFallback) return this.memoryFallback.getBusiness(id);
    return this.getFromStore<DbBusiness>('businesses', id);
  }

  async saveBusiness(business: DbBusiness): Promise<void> {
    if (this.memoryFallback) return this.memoryFallback.saveBusiness(business);
    return this.putToStore('businesses', business);
  }

  // Shops
  async getShopsForBusiness(businessId: string): Promise<DbShop[]> {
    if (this.memoryFallback) return this.memoryFallback.getShopsForBusiness(businessId);
    const all = await this.getAllFromStore<DbShop>('shops');
    return all.filter((s) => s.business_id === businessId);
  }

  async getShop(id: string): Promise<DbShop | null> {
    if (this.memoryFallback) return this.memoryFallback.getShop(id);
    return this.getFromStore<DbShop>('shops', id);
  }

  async saveShop(shop: DbShop): Promise<void> {
    if (this.memoryFallback) return this.memoryFallback.saveShop(shop);
    return this.putToStore('shops', shop);
  }

  // Users & Assignments
  async getUsersForBusiness(businessId: string): Promise<DbUser[]> {
    if (this.memoryFallback) return this.memoryFallback.getUsersForBusiness(businessId);
    const all = await this.getAllFromStore<DbUser>('users');
    return all.filter(
      (u) => u.business_id === businessId || (businessId === 'PLATFORM' && u.role === 'platform_admin')
    );
  }

  async getUser(id: string): Promise<DbUser | null> {
    if (this.memoryFallback) return this.memoryFallback.getUser(id);
    return this.getFromStore<DbUser>('users', id);
  }

  async saveUser(user: DbUser): Promise<void> {
    if (this.memoryFallback) return this.memoryFallback.saveUser(user);
    return this.putToStore('users', user);
  }

  async getAssignmentsForUser(userId: string): Promise<DbUserShopAssignment[]> {
    if (this.memoryFallback) return this.memoryFallback.getAssignmentsForUser(userId);
    const all = await this.getAllFromStore<DbUserShopAssignment>('assignments');
    return all.filter((a) => a.user_id === userId && a.is_active === 1);
  }

  async saveAssignment(assignment: DbUserShopAssignment): Promise<void> {
    if (this.memoryFallback) return this.memoryFallback.saveAssignment(assignment);
    return this.putToStore('assignments', assignment);
  }

  // Categories
  async getCategoriesForShop(shopId: string): Promise<DbCategory[]> {
    if (this.memoryFallback) return this.memoryFallback.getCategoriesForShop(shopId);
    const all = await this.getAllFromStore<DbCategory>('categories');
    return all.filter((c) => c.shop_id === shopId);
  }

  async saveCategory(category: DbCategory): Promise<void> {
    if (this.memoryFallback) return this.memoryFallback.saveCategory(category);
    return this.putToStore('categories', category);
  }

  // Products
  async getProducts(filter: ProductQueryFilter): Promise<DbProduct[]> {
    if (this.memoryFallback) return this.memoryFallback.getProducts(filter);
    const all = await this.getAllFromStore<DbProduct>('products');
    return all.filter((p) => {
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
    if (this.memoryFallback) return this.memoryFallback.getProduct(id);
    return this.getFromStore<DbProduct>('products', id);
  }

  async getProductBySku(shopId: string, sku: string): Promise<DbProduct | null> {
    if (this.memoryFallback) return this.memoryFallback.getProductBySku(shopId, sku);
    const all = await this.getAllFromStore<DbProduct>('products');
    const clean = sku.trim().toLowerCase();
    return all.find((p) => p.shop_id === shopId && p.sku.trim().toLowerCase() === clean) ?? null;
  }

  async getProductByBarcode(shopId: string, barcode: string): Promise<DbProduct | null> {
    if (this.memoryFallback) return this.memoryFallback.getProductByBarcode(shopId, barcode);
    const all = await this.getAllFromStore<DbProduct>('products');
    const clean = barcode.trim().toLowerCase();
    return all.find((p) => p.shop_id === shopId && p.barcode.trim().toLowerCase() === clean) ?? null;
  }

  async saveProduct(product: DbProduct): Promise<void> {
    if (this.memoryFallback) return this.memoryFallback.saveProduct(product);
    const existing = await this.getProductBySku(product.shop_id, product.sku);
    if (existing && existing.id !== product.id) {
      throw new Error(`SKU "${product.sku}" is already in use by another product in this shop.`);
    }
    return this.putToStore('products', product);
  }

  async deleteProduct(id: string, shopId: string): Promise<void> {
    if (this.memoryFallback) return this.memoryFallback.deleteProduct(id, shopId);
    const p = await this.getProduct(id);
    if (p && p.shop_id === shopId) {
      await this.deleteFromStore('products', id);
    }
  }

  // Inventory Movements
  async getInventoryMovements(filter: InventoryMovementFilter): Promise<DbInventoryMovement[]> {
    if (this.memoryFallback) return this.memoryFallback.getInventoryMovements(filter);
    const all = await this.getAllFromStore<DbInventoryMovement>('inventory_movements');
    return all.filter((m) => {
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
    if (this.memoryFallback) return this.memoryFallback.saveInventoryMovement(movement);
    return this.putToStore('inventory_movements', movement);
  }

  // Sales
  async getSales(filter: SalesQueryFilter): Promise<DbSale[]> {
    if (this.memoryFallback) return this.memoryFallback.getSales(filter);
    const all = await this.getAllFromStore<DbSale>('sales');
    return all.filter((s) => {
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
    if (this.memoryFallback) return this.memoryFallback.getSale(id);
    return this.getFromStore<DbSale>('sales', id);
  }

  async getSaleByReceiptNumber(shopId: string, receiptNumber: string): Promise<DbSale | null> {
    if (this.memoryFallback) return this.memoryFallback.getSaleByReceiptNumber(shopId, receiptNumber);
    const all = await this.getAllFromStore<DbSale>('sales');
    const clean = receiptNumber.trim().toLowerCase();
    return all.find((s) => s.shop_id === shopId && s.receipt_number.trim().toLowerCase() === clean) ?? null;
  }

  async getSaleByIdempotencyKey(key: string): Promise<DbSale | null> {
    if (this.memoryFallback) return this.memoryFallback.getSaleByIdempotencyKey(key);
    const all = await this.getAllFromStore<DbSale>('sales');
    return all.find((s) => s.idempotency_key === key) ?? null;
  }

  async getSaleItems(saleId: string): Promise<DbSaleItem[]> {
    if (this.memoryFallback) return this.memoryFallback.getSaleItems(saleId);
    const all = await this.getAllFromStore<DbSaleItem>('sale_items');
    return all.filter((i) => i.sale_id === saleId);
  }

  async saveSale(sale: DbSale, items: DbSaleItem[]): Promise<void> {
    if (this.memoryFallback) return this.memoryFallback.saveSale(sale, items);
    await this.putToStore('sales', sale);
    for (const item of items) {
      await this.putToStore('sale_items', item);
    }
  }

  async updateSaleStatus(saleId: string, status: 'completed' | 'refunded' | 'voided'): Promise<void> {
    if (this.memoryFallback) return this.memoryFallback.updateSaleStatus(saleId, status);
    const s = await this.getSale(saleId);
    if (s) {
      s.status = status;
      await this.putToStore('sales', s);
    }
  }

  // Payments
  async getPaymentsForReference(referenceType: string, referenceId: string): Promise<DbPayment[]> {
    if (this.memoryFallback) return this.memoryFallback.getPaymentsForReference(referenceType, referenceId);
    const all = await this.getAllFromStore<DbPayment>('payments');
    return all.filter((p) => p.reference_type === referenceType && p.reference_id === referenceId);
  }

  async savePayment(payment: DbPayment): Promise<void> {
    if (this.memoryFallback) return this.memoryFallback.savePayment(payment);
    return this.putToStore('payments', payment);
  }

  // App Settings
  async getSetting(key: string): Promise<string | null> {
    if (this.memoryFallback) return this.memoryFallback.getSetting(key);
    const s = await this.getFromStore<DbAppSetting>('settings', key);
    return s ? s.value : null;
  }

  async setSetting(
    key: string,
    value: string,
    scope: 'global' | 'business' | 'shop' = 'global',
    scopeId?: string
  ): Promise<void> {
    if (this.memoryFallback) return this.memoryFallback.setSetting(key, value, scope, scopeId);
    const record: DbAppSetting = {
      key,
      value,
      scope,
      scope_id: scopeId,
      updated_at: new Date().toISOString(),
    };
    return this.putToStore('settings', record);
  }

  // Audit Events
  async getAuditEvents(businessId: string, shopId?: string, limit = 100): Promise<DbAuditEvent[]> {
    if (this.memoryFallback) return this.memoryFallback.getAuditEvents(businessId, shopId, limit);
    const all = await this.getAllFromStore<DbAuditEvent>('audit_events');
    return all
      .filter((a) => a.business_id === businessId && (!shopId || a.shop_id === shopId))
      .slice(-limit);
  }

  async saveAuditEvent(event: DbAuditEvent): Promise<void> {
    if (this.memoryFallback) return this.memoryFallback.saveAuditEvent(event);
    return this.putToStore('audit_events', event);
  }

  // Sync Queue
  async getPendingSyncQueue(shopId?: string): Promise<DbSyncQueueEntry[]> {
    if (this.memoryFallback) return this.memoryFallback.getPendingSyncQueue(shopId);
    const all = await this.getAllFromStore<DbSyncQueueEntry>('sync_queue');
    return all.filter((e) => {
      if (shopId && e.shop_id !== shopId) return false;
      return e.status === 'pending' || e.status === 'failed';
    });
  }

  async getAllSyncQueue(shopId?: string, businessId?: string): Promise<DbSyncQueueEntry[]> {
    if (this.memoryFallback) return this.memoryFallback.getAllSyncQueue(shopId, businessId);
    const all = await this.getAllFromStore<DbSyncQueueEntry>('sync_queue');
    return all.filter((e) => {
      if (shopId && e.shop_id !== shopId) return false;
      if (businessId && e.business_id !== businessId) return false;
      return true;
    });
  }

  async enqueueSync(entry: DbSyncQueueEntry): Promise<void> {
    if (this.memoryFallback) return this.memoryFallback.enqueueSync(entry);
    return this.putToStore('sync_queue', entry);
  }

  async updateSyncStatus(
    id: string,
    status: SyncQueueStatus,
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
    if (this.memoryFallback) return this.memoryFallback.updateSyncStatus(id, status, errorSummary, meta);
    const entry = await this.getFromStore<DbSyncQueueEntry>('sync_queue', id);
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
      await this.putToStore('sync_queue', entry);
    }
  }

  async purgeQuarantinedPreFirebaseSales(
    criteria: PurgeQuarantinedPreFirebaseSalesCriteria,
    storageOverride?: Storage
  ): Promise<PurgeQuarantinedPreFirebaseSalesResult> {
    if (this.memoryFallback) {
      return this.memoryFallback.purgeQuarantinedPreFirebaseSales(criteria, storageOverride);
    }
    if (!this.db) {
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
        details: ['IndexedDB database is not initialized.'],
      };
    }

    const targetQueueSet = new Set(criteria.targetQueueIds);
    const targetSaleSet = new Set(criteria.targetSaleIds);
    const targetAuditSet = new Set(criteria.targetAuditEventIds);

    const existingQueue = await this.getAllFromStore<DbSyncQueueEntry>('sync_queue');
    const existingSales = await this.getAllFromStore<DbSale>('sales');
    const existingAudits = await this.getAllFromStore<DbAuditEvent>('audit_events');

    const foundQueue = existingQueue.filter((e) => targetQueueSet.has(e.id));
    const foundSales = existingSales.filter((s) => targetSaleSet.has(s.id));
    const foundAudits = existingAudits.filter((a) => targetAuditSet.has(a.id));

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
          'All target pre-Firebase records were already removed from IndexedDB (idempotent verification).',
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

    // STEP 2: Atomic Deletion in Single IndexedDB Transaction
    const existingQueueIdsToDelete = foundQueue.map((q) => q.id);
    const existingSaleIdsToDelete = foundSales.map((s) => s.id);
    const existingAuditIdsToDelete = foundAudits.map((a) => a.id);

    const existingItems = await this.getAllFromStore<DbSaleItem>('sale_items');
    const itemIdsToDelete = existingItems
      .filter((item) => targetSaleSet.has(item.sale_id))
      .map((item) => item.id);

    const existingPayments = await this.getAllFromStore<DbPayment>('payments');
    const paymentIdsToDelete = existingPayments
      .filter(
        (pmt) =>
          pmt.reference_type === 'sale' && targetSaleSet.has(pmt.reference_id)
      )
      .map((pmt) => pmt.id);

    const db = this.db;
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(
          ['sync_queue', 'sales', 'sale_items', 'payments', 'audit_events'],
          'readwrite'
        );

        tx.onerror = () =>
          reject(tx.error || new Error('IndexedDB purge transaction encountered an error.'));
        tx.onabort = () =>
          reject(new Error('IndexedDB purge transaction was aborted.'));
        tx.oncomplete = () => resolve();

        const syncStore = tx.objectStore('sync_queue');
        for (const qId of existingQueueIdsToDelete) {
          syncStore.delete(qId);
        }

        const salesStore = tx.objectStore('sales');
        for (const sId of existingSaleIdsToDelete) {
          salesStore.delete(sId);
        }

        const itemsStore = tx.objectStore('sale_items');
        for (const iId of itemIdsToDelete) {
          itemsStore.delete(iId);
        }

        const paymentsStore = tx.objectStore('payments');
        for (const pId of paymentIdsToDelete) {
          paymentsStore.delete(pId);
        }

        const auditStore = tx.objectStore('audit_events');
        for (const aId of existingAuditIdsToDelete) {
          auditStore.delete(aId);
        }
      });
    } catch (txErr: any) {
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
          `IndexedDB deletion transaction failed and was rolled back: ${txErr?.message || String(txErr)}`,
        ],
      };
    }

    // STEP 3: LocalStorage Cleanup
    const lsOutcome = cleanLocalStorageResiduals(criteria, storageOverride);
    const finalSuccess = lsOutcome.status !== 'failed';

    return {
      success: finalSuccess,
      isIdempotent: false,
      purgedCounts: {
        syncQueue: existingQueueIdsToDelete.length,
        sales: existingSaleIdsToDelete.length,
        saleItems: itemIdsToDelete.length,
        payments: paymentIdsToDelete.length,
        auditEvents: existingAuditIdsToDelete.length,
        localStorageResiduals: lsOutcome.residualsRemoved,
      },
      details: [
        `Purged ${existingQueueIdsToDelete.length} quarantined sync_queue entries.`,
        `Purged ${existingSaleIdsToDelete.length} local DbSale records.`,
        `Purged ${itemIdsToDelete.length} linked sale line items.`,
        `Purged ${paymentIdsToDelete.length} linked payments.`,
        `Purged ${existingAuditIdsToDelete.length} quarantine audit events.`,
        ...lsOutcome.details,
        ...(lsOutcome.status === 'failed'
          ? [`WARNING: localStorage residual cleanup failed: ${lsOutcome.error}`]
          : []),
      ],
      localStorageStatus: lsOutcome.status,
      localStorageError: lsOutcome.error,
    };
  }
}

