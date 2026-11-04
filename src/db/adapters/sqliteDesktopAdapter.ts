/**
 * SmartMind POS — Phase 5: SQLite Desktop Database Adapter
 *
 * Designed to communicate with the SQLite engine running inside the privileged
 * Electron main process via contextBridge IPC (window.smartmindDesktopApi.sqlite).
 *
 * Implements parameterized queries, atomic transactions, and shop/business tenant isolation.
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

export interface ElectronSqliteBridge {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<{ changes: number; lastInsertRowid?: number | bigint }>;
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
  getSchemaVersion(): Promise<number>;
  backupDatabase(destinationPath?: string): Promise<{ success: boolean; filePath: string }>;
}

declare global {
  interface Window {
    smartmindDesktopApi?: {
      isElectron: boolean;
      sqlite: ElectronSqliteBridge;
    };
  }
}

export class SqliteDesktopDatabaseAdapter implements DatabaseAdapter {
  readonly adapterType = 'sqlite-electron-desktop' as const;
  readonly isPersistent = true;

  private get bridge(): ElectronSqliteBridge {
    if (typeof window === 'undefined' || !window.smartmindDesktopApi?.sqlite) {
      throw new Error(
        'SQLite Desktop Bridge is only available inside the SmartMind POS Electron desktop runtime. ' +
        'In browser development, use IndexedDbDatabaseAdapter instead.'
      );
    }
    return window.smartmindDesktopApi.sqlite;
  }

  async initialize(): Promise<void> {
    if (typeof window !== 'undefined' && window.smartmindDesktopApi?.sqlite) {
      // Validate schema version
      await this.getSchemaVersion();
    }
  }

  async close(): Promise<void> {
    // Desktop main process manages SQLite connection lifecycle
  }

  async getSchemaVersion(): Promise<number> {
    return this.bridge.getSchemaVersion();
  }

  async runTransaction<T>(work: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    const bridge = this.bridge;
    await bridge.beginTransaction();

    const tx: DatabaseTransaction = {
      getProduct: async (id: string) => {
        const rows = await bridge.query<DbProduct>('SELECT * FROM products WHERE id = ? LIMIT 1', [id]);
        return rows[0] ?? null;
      },
      getProductBySku: async (shopId: string, sku: string) => {
        const rows = await bridge.query<DbProduct>(
          'SELECT * FROM products WHERE shop_id = ? AND LOWER(sku) = LOWER(?) LIMIT 1',
          [shopId, sku.trim()]
        );
        return rows[0] ?? null;
      },
      saveProduct: async (p: DbProduct) => {
        await bridge.execute(
          `INSERT INTO products (id, shop_id, business_id, category_id, category_name, sku, barcode, name, unit, cost_price_kobo, selling_price_kobo, stock_quantity, reorder_level, tax_exempt, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             category_id = excluded.category_id,
             category_name = excluded.category_name,
             sku = excluded.sku,
             barcode = excluded.barcode,
             name = excluded.name,
             unit = excluded.unit,
             cost_price_kobo = excluded.cost_price_kobo,
             selling_price_kobo = excluded.selling_price_kobo,
             stock_quantity = excluded.stock_quantity,
             reorder_level = excluded.reorder_level,
             tax_exempt = excluded.tax_exempt,
             is_active = excluded.is_active,
             updated_at = excluded.updated_at`,
          [
            p.id,
            p.shop_id,
            p.business_id,
            p.category_id,
            p.category_name,
            p.sku,
            p.barcode,
            p.name,
            p.unit,
            p.cost_price_kobo,
            p.selling_price_kobo,
            p.stock_quantity,
            p.reorder_level,
            p.tax_exempt,
            p.is_active,
            p.created_at,
            p.updated_at,
          ]
        );
      },
      updateProductStock: async (productId: string, newStock: number, updatedAt: string) => {
        if (newStock < 0) throw new Error(`Stock quantity cannot be negative (${newStock})`);
        const res = await bridge.execute(
          'UPDATE products SET stock_quantity = ?, updated_at = ? WHERE id = ?',
          [newStock, updatedAt, productId]
        );
        if (res.changes === 0) throw new Error(`Product ${productId} not found for stock update`);
      },
      getSaleByIdempotencyKey: async (key: string) => {
        const rows = await bridge.query<DbSale>(
          'SELECT * FROM sales WHERE idempotency_key = ? LIMIT 1',
          [key]
        );
        return rows[0] ?? null;
      },
      saveSale: async (s: DbSale) => {
        await bridge.execute(
          `INSERT INTO sales (id, shop_id, business_id, receipt_number, terminal_id, cashier_user_id, cashier_name, created_at, subtotal_kobo, discount_amount_kobo, tax_rate_percent, tax_amount_kobo, total_amount_kobo, amount_tendered_kobo, change_due_kobo, payment_method, payment_reference, credit_customer_id, credit_customer_name, credit_customer_phone, status, notes, idempotency_key, is_synced, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            s.id,
            s.shop_id,
            s.business_id,
            s.receipt_number,
            s.terminal_id,
            s.cashier_user_id,
            s.cashier_name,
            s.created_at,
            s.subtotal_kobo,
            s.discount_amount_kobo,
            s.tax_rate_percent,
            s.tax_amount_kobo,
            s.total_amount_kobo,
            s.amount_tendered_kobo,
            s.change_due_kobo,
            s.payment_method,
            s.payment_reference ?? null,
            s.credit_customer_id ?? null,
            s.credit_customer_name ?? null,
            s.credit_customer_phone ?? null,
            s.status,
            s.notes ?? null,
            s.idempotency_key ?? null,
            s.is_synced,
            s.synced_at ?? null,
          ]
        );
      },
      saveSaleItems: async (items: DbSaleItem[]) => {
        for (const item of items) {
          await bridge.execute(
            `INSERT INTO sale_items (id, sale_id, shop_id, business_id, product_id, sku, barcode, product_name, unit, unit_price_kobo, cost_price_kobo, quantity, line_total_kobo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              item.id,
              item.sale_id,
              item.shop_id,
              item.business_id,
              item.product_id,
              item.sku,
              item.barcode,
              item.product_name,
              item.unit,
              item.unit_price_kobo,
              item.cost_price_kobo,
              item.quantity,
              item.line_total_kobo,
            ]
          );
        }
      },
      saveInventoryMovement: async (m: DbInventoryMovement) => {
        await bridge.execute(
          `INSERT INTO inventory_movements (id, shop_id, business_id, product_id, product_name, product_sku, type, quantity_delta, previous_quantity, new_quantity, reason, reference_id, performed_by_user_id, performed_by_name, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            m.id,
            m.shop_id,
            m.business_id,
            m.product_id,
            m.product_name,
            m.product_sku,
            m.type,
            m.quantity_delta,
            m.previous_quantity,
            m.new_quantity,
            m.reason,
            m.reference_id ?? null,
            m.performed_by_user_id,
            m.performed_by_name,
            m.created_at,
          ]
        );
      },
      savePayment: async (p: DbPayment) => {
        await bridge.execute(
          `INSERT INTO payments (id, shop_id, business_id, reference_type, reference_id, amount_kobo, payment_method, payment_reference, notes, recorded_by_user_id, recorded_by_name, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            p.id,
            p.shop_id,
            p.business_id,
            p.reference_type,
            p.reference_id,
            p.amount_kobo,
            p.payment_method,
            p.payment_reference ?? null,
            p.notes ?? null,
            p.recorded_by_user_id,
            p.recorded_by_name,
            p.created_at,
          ]
        );
      },
      saveAuditEvent: async (a: DbAuditEvent) => {
        await bridge.execute(
          `INSERT INTO audit_events (id, business_id, shop_id, user_id, user_name, action, entity_type, entity_id, details_json, ip_address, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            a.id,
            a.business_id,
            a.shop_id ?? null,
            a.user_id,
            a.user_name,
            a.action,
            a.entity_type,
            a.entity_id,
            a.details_json ?? null,
            a.ip_address ?? null,
            a.created_at,
          ]
        );
      },
      enqueueSync: async (e: DbSyncQueueEntry) => {
        await bridge.execute(
          `INSERT INTO sync_queue (id, business_id, shop_id, entity_type, entity_id, operation_type, payload_json, created_at, retry_count, status, error_summary)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            e.id,
            e.business_id,
            e.shop_id,
            e.entity_type,
            e.entity_id,
            e.operation_type,
            e.payload_json,
            e.created_at,
            e.retry_count,
            e.status,
            e.error_summary ?? null,
          ]
        );
      },
    };

    try {
      const result = await work(tx);
      await bridge.commitTransaction();
      return result;
    } catch (err) {
      await bridge.rollbackTransaction();
      throw err;
    }
  }

  // Businesses
  async getAllBusinesses(): Promise<DbBusiness[]> {
    return this.bridge.query<DbBusiness>('SELECT * FROM businesses ORDER BY created_at ASC');
  }

  async getBusiness(id: string): Promise<DbBusiness | null> {
    const rows = await this.bridge.query<DbBusiness>('SELECT * FROM businesses WHERE id = ? LIMIT 1', [id]);
    return rows[0] ?? null;
  }

  async saveBusiness(b: DbBusiness): Promise<void> {
    await this.bridge.execute(
      `INSERT INTO businesses (id, name, legal_name, business_type, registration_number, tax_identification_number, owner_user_id, owner_name, owner_email, contact_email, primary_phone, headquarters_address, currency_code, currency_symbol, default_tax_rate_percent, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         legal_name = excluded.legal_name,
         business_type = excluded.business_type,
         currency_code = excluded.currency_code,
         currency_symbol = excluded.currency_symbol,
         status = excluded.status,
         updated_at = excluded.updated_at`,
      [
        b.id,
        b.name,
        b.legal_name,
        b.business_type,
        b.registration_number,
        b.tax_identification_number,
        b.owner_user_id,
        b.owner_name,
        b.owner_email,
        b.contact_email,
        b.primary_phone,
        b.headquarters_address,
        b.currency_code,
        b.currency_symbol,
        b.default_tax_rate_percent,
        b.status,
        b.notes ?? null,
        b.created_at,
        b.updated_at,
      ]
    );
  }

  // Shops
  async getShopsForBusiness(businessId: string): Promise<DbShop[]> {
    return this.bridge.query<DbShop>('SELECT * FROM shops WHERE business_id = ? ORDER BY code ASC', [businessId]);
  }

  async getShop(id: string): Promise<DbShop | null> {
    const rows = await this.bridge.query<DbShop>('SELECT * FROM shops WHERE id = ? LIMIT 1', [id]);
    return rows[0] ?? null;
  }

  async saveShop(s: DbShop): Promise<void> {
    await this.bridge.execute(
      `INSERT INTO shops (id, business_id, code, name, category, location_city, address, phone, description, manager_name, status, terminal_id, tax_rate_percent, receipt_header_note, receipt_footer_note, printer_settings_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         phone = excluded.phone,
         tax_rate_percent = excluded.tax_rate_percent,
         receipt_header_note = excluded.receipt_header_note,
         receipt_footer_note = excluded.receipt_footer_note,
         printer_settings_json = excluded.printer_settings_json,
         updated_at = excluded.updated_at`,
      [
        s.id,
        s.business_id,
        s.code,
        s.name,
        s.category,
        s.location_city,
        s.address,
        s.phone,
        s.description ?? null,
        s.manager_name,
        s.status,
        s.terminal_id,
        s.tax_rate_percent,
        s.receipt_header_note,
        s.receipt_footer_note,
        s.printer_settings_json ?? null,
        s.created_at,
        s.updated_at,
      ]
    );
  }

  // Users & Assignments
  async getUsersForBusiness(businessId: string): Promise<DbUser[]> {
    if (businessId === 'PLATFORM') {
      return this.bridge.query<DbUser>('SELECT * FROM users ORDER BY full_name ASC');
    }
    return this.bridge.query<DbUser>('SELECT * FROM users WHERE business_id = ? ORDER BY full_name ASC', [businessId]);
  }

  async getUser(id: string): Promise<DbUser | null> {
    const rows = await this.bridge.query<DbUser>('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
    return rows[0] ?? null;
  }

  async saveUser(u: DbUser): Promise<void> {
    await this.bridge.execute(
      `INSERT INTO users (id, business_id, username, email, full_name, role, role_label, custom_role_id, permissions_json, status, password_hash, password_updated_at, created_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         full_name = excluded.full_name,
         email = excluded.email,
         role = excluded.role,
         role_label = excluded.role_label,
         permissions_json = excluded.permissions_json,
         status = excluded.status,
         password_hash = excluded.password_hash,
         password_updated_at = excluded.password_updated_at`,
      [
        u.id,
        u.business_id,
        u.username,
        u.email,
        u.full_name,
        u.role,
        u.role_label,
        u.custom_role_id ?? null,
        u.permissions_json,
        u.status,
        u.password_hash ?? null,
        u.password_updated_at ?? null,
        u.created_at,
        u.last_login_at,
      ]
    );
  }

  async getAssignmentsForUser(userId: string): Promise<DbUserShopAssignment[]> {
    return this.bridge.query<DbUserShopAssignment>(
      'SELECT * FROM user_shop_assignments WHERE user_id = ? AND is_active = 1',
      [userId]
    );
  }

  async saveAssignment(a: DbUserShopAssignment): Promise<void> {
    await this.bridge.execute(
      `INSERT INTO user_shop_assignments (id, user_id, business_id, shop_id, assigned_at, assigned_by_user_id, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET is_active = excluded.is_active`,
      [a.id, a.user_id, a.business_id, a.shop_id, a.assigned_at, a.assigned_by_user_id, a.is_active]
    );
  }

  // Categories
  async getCategoriesForShop(shopId: string): Promise<DbCategory[]> {
    return this.bridge.query<DbCategory>('SELECT * FROM categories WHERE shop_id = ? ORDER BY name ASC', [shopId]);
  }

  async saveCategory(c: DbCategory): Promise<void> {
    await this.bridge.execute(
      `INSERT INTO categories (id, shop_id, business_id, name, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, updated_at = excluded.updated_at`,
      [c.id, c.shop_id, c.business_id, c.name, c.description, c.created_at, c.updated_at]
    );
  }

  // Products
  async getProducts(filter: ProductQueryFilter): Promise<DbProduct[]> {
    let sql = 'SELECT * FROM products WHERE shop_id = ? AND business_id = ?';
    const params: any[] = [filter.shopId, filter.businessId];

    if (filter.onlyActive) {
      sql += ' AND is_active = 1';
    }
    if (filter.categoryId && filter.categoryId !== 'all') {
      sql += ' AND category_id = ?';
      params.push(filter.categoryId);
    }
    if (filter.searchQuery && filter.searchQuery.trim()) {
      const q = `%${filter.searchQuery.trim().toLowerCase()}%`;
      sql += ' AND (LOWER(name) LIKE ? OR LOWER(sku) LIKE ? OR LOWER(barcode) LIKE ?)';
      params.push(q, q, q);
    }
    sql += ' ORDER BY name ASC';
    return this.bridge.query<DbProduct>(sql, params);
  }

  async getProduct(id: string): Promise<DbProduct | null> {
    const rows = await this.bridge.query<DbProduct>('SELECT * FROM products WHERE id = ? LIMIT 1', [id]);
    return rows[0] ?? null;
  }

  async getProductBySku(shopId: string, sku: string): Promise<DbProduct | null> {
    const rows = await this.bridge.query<DbProduct>(
      'SELECT * FROM products WHERE shop_id = ? AND LOWER(sku) = LOWER(?) LIMIT 1',
      [shopId, sku.trim()]
    );
    return rows[0] ?? null;
  }

  async getProductByBarcode(shopId: string, barcode: string): Promise<DbProduct | null> {
    const rows = await this.bridge.query<DbProduct>(
      'SELECT * FROM products WHERE shop_id = ? AND LOWER(barcode) = LOWER(?) LIMIT 1',
      [shopId, barcode.trim()]
    );
    return rows[0] ?? null;
  }

  async saveProduct(p: DbProduct): Promise<void> {
    await this.bridge.execute(
      `INSERT INTO products (id, shop_id, business_id, category_id, category_name, sku, barcode, name, unit, cost_price_kobo, selling_price_kobo, stock_quantity, reorder_level, tax_exempt, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         sku = excluded.sku,
         barcode = excluded.barcode,
         category_id = excluded.category_id,
         category_name = excluded.category_name,
         unit = excluded.unit,
         cost_price_kobo = excluded.cost_price_kobo,
         selling_price_kobo = excluded.selling_price_kobo,
         stock_quantity = excluded.stock_quantity,
         reorder_level = excluded.reorder_level,
         tax_exempt = excluded.tax_exempt,
         is_active = excluded.is_active,
         updated_at = excluded.updated_at`,
      [
        p.id,
        p.shop_id,
        p.business_id,
        p.category_id,
        p.category_name,
        p.sku,
        p.barcode,
        p.name,
        p.unit,
        p.cost_price_kobo,
        p.selling_price_kobo,
        p.stock_quantity,
        p.reorder_level,
        p.tax_exempt,
        p.is_active,
        p.created_at,
        p.updated_at,
      ]
    );
  }

  async deleteProduct(id: string, shopId: string): Promise<void> {
    await this.bridge.execute('DELETE FROM products WHERE id = ? AND shop_id = ?', [id, shopId]);
  }

  // Inventory Movements
  async getInventoryMovements(filter: InventoryMovementFilter): Promise<DbInventoryMovement[]> {
    let sql = 'SELECT * FROM inventory_movements WHERE shop_id = ? AND business_id = ?';
    const params: any[] = [filter.shopId, filter.businessId];

    if (filter.productId) {
      sql += ' AND product_id = ?';
      params.push(filter.productId);
    }
    if (filter.type && filter.type !== 'all') {
      sql += ' AND type = ?';
      params.push(filter.type);
    }
    if (filter.searchQuery && filter.searchQuery.trim()) {
      const q = `%${filter.searchQuery.trim().toLowerCase()}%`;
      sql += ' AND (LOWER(product_name) LIKE ? OR LOWER(product_sku) LIKE ? OR LOWER(reason) LIKE ?)';
      params.push(q, q, q);
    }
    sql += ' ORDER BY created_at DESC';
    return this.bridge.query<DbInventoryMovement>(sql, params);
  }

  async saveInventoryMovement(m: DbInventoryMovement): Promise<void> {
    await this.bridge.execute(
      `INSERT INTO inventory_movements (id, shop_id, business_id, product_id, product_name, product_sku, type, quantity_delta, previous_quantity, new_quantity, reason, reference_id, performed_by_user_id, performed_by_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        m.id,
        m.shop_id,
        m.business_id,
        m.product_id,
        m.product_name,
        m.product_sku,
        m.type,
        m.quantity_delta,
        m.previous_quantity,
        m.new_quantity,
        m.reason,
        m.reference_id ?? null,
        m.performed_by_user_id,
        m.performed_by_name,
        m.created_at,
      ]
    );
  }

  // Sales
  async getSales(filter: SalesQueryFilter): Promise<DbSale[]> {
    let sql = 'SELECT * FROM sales WHERE shop_id = ? AND business_id = ?';
    const params: any[] = [filter.shopId, filter.businessId];

    if (filter.cashierUserId && filter.cashierUserId !== 'all') {
      sql += ' AND cashier_user_id = ?';
      params.push(filter.cashierUserId);
    }
    if (filter.status && filter.status !== 'all') {
      sql += ' AND status = ?';
      params.push(filter.status);
    }
    if (filter.searchQuery && filter.searchQuery.trim()) {
      const q = `%${filter.searchQuery.trim().toLowerCase()}%`;
      sql += ' AND (LOWER(receipt_number) LIKE ? OR LOWER(cashier_name) LIKE ?)';
      params.push(q, q);
    }
    sql += ' ORDER BY created_at DESC';
    return this.bridge.query<DbSale>(sql, params);
  }

  async getSale(id: string): Promise<DbSale | null> {
    const rows = await this.bridge.query<DbSale>('SELECT * FROM sales WHERE id = ? LIMIT 1', [id]);
    return rows[0] ?? null;
  }

  async getSaleByReceiptNumber(shopId: string, receiptNumber: string): Promise<DbSale | null> {
    const rows = await this.bridge.query<DbSale>(
      'SELECT * FROM sales WHERE shop_id = ? AND receipt_number = ? LIMIT 1',
      [shopId, receiptNumber.trim()]
    );
    return rows[0] ?? null;
  }

  async getSaleByIdempotencyKey(key: string): Promise<DbSale | null> {
    const rows = await this.bridge.query<DbSale>('SELECT * FROM sales WHERE idempotency_key = ? LIMIT 1', [key]);
    return rows[0] ?? null;
  }

  async getSaleItems(saleId: string): Promise<DbSaleItem[]> {
    return this.bridge.query<DbSaleItem>('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id ASC', [saleId]);
  }

  async saveSale(sale: DbSale, items: DbSaleItem[]): Promise<void> {
    await this.runTransaction(async (tx) => {
      await tx.saveSale(sale);
      await tx.saveSaleItems(items);
    });
  }

  async updateSaleStatus(saleId: string, status: 'completed' | 'refunded' | 'voided'): Promise<void> {
    await this.bridge.execute('UPDATE sales SET status = ? WHERE id = ?', [status, saleId]);
  }

  // Payments
  async getPaymentsForReference(referenceType: string, referenceId: string): Promise<DbPayment[]> {
    return this.bridge.query<DbPayment>(
      'SELECT * FROM payments WHERE reference_type = ? AND reference_id = ? ORDER BY created_at ASC',
      [referenceType, referenceId]
    );
  }

  async savePayment(payment: DbPayment): Promise<void> {
    await this.bridge.execute(
      `INSERT INTO payments (id, shop_id, business_id, reference_type, reference_id, amount_kobo, payment_method, payment_reference, notes, recorded_by_user_id, recorded_by_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payment.id,
        payment.shop_id,
        payment.business_id,
        payment.reference_type,
        payment.reference_id,
        payment.amount_kobo,
        payment.payment_method,
        payment.payment_reference ?? null,
        payment.notes ?? null,
        payment.recorded_by_user_id,
        payment.recorded_by_name,
        payment.created_at,
      ]
    );
  }

  // App Settings
  async getSetting(key: string): Promise<string | null> {
    const rows = await this.bridge.query<DbAppSetting>('SELECT value FROM app_settings WHERE key = ? LIMIT 1', [key]);
    return rows[0]?.value ?? null;
  }

  async setSetting(
    key: string,
    value: string,
    scope: 'global' | 'business' | 'shop' = 'global',
    scopeId?: string
  ): Promise<void> {
    await this.bridge.execute(
      `INSERT INTO app_settings (key, value, scope, scope_id, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, scope = excluded.scope, scope_id = excluded.scope_id, updated_at = excluded.updated_at`,
      [key, value, scope, scopeId ?? null]
    );
  }

  // Audit Events
  async getAuditEvents(businessId: string, shopId?: string, limit = 100): Promise<DbAuditEvent[]> {
    let sql = 'SELECT * FROM audit_events WHERE business_id = ?';
    const params: any[] = [businessId];
    if (shopId) {
      sql += ' AND shop_id = ?';
      params.push(shopId);
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    return this.bridge.query<DbAuditEvent>(sql, params);
  }

  async saveAuditEvent(event: DbAuditEvent): Promise<void> {
    await this.bridge.execute(
      `INSERT INTO audit_events (id, business_id, shop_id, user_id, user_name, action, entity_type, entity_id, details_json, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        event.business_id,
        event.shop_id ?? null,
        event.user_id,
        event.user_name,
        event.action,
        event.entity_type,
        event.entity_id,
        event.details_json ?? null,
        event.ip_address ?? null,
        event.created_at,
      ]
    );
  }

  // Sync Queue
  async getPendingSyncQueue(shopId?: string): Promise<DbSyncQueueEntry[]> {
    let sql = "SELECT * FROM sync_queue WHERE status IN ('pending', 'failed')";
    const params: any[] = [];
    if (shopId) {
      sql += ' AND shop_id = ?';
      params.push(shopId);
    }
    sql += ' ORDER BY created_at ASC';
    return this.bridge.query<DbSyncQueueEntry>(sql, params);
  }

  async getAllSyncQueue(shopId?: string, businessId?: string): Promise<DbSyncQueueEntry[]> {
    let sql = 'SELECT * FROM sync_queue WHERE 1=1';
    const params: any[] = [];
    if (shopId) {
      sql += ' AND shop_id = ?';
      params.push(shopId);
    }
    if (businessId) {
      sql += ' AND business_id = ?';
      params.push(businessId);
    }
    sql += ' ORDER BY created_at ASC';
    return this.bridge.query<DbSyncQueueEntry>(sql, params);
  }

  async enqueueSync(entry: DbSyncQueueEntry): Promise<void> {
    await this.bridge.execute(
      `INSERT INTO sync_queue (id, business_id, shop_id, entity_type, entity_id, operation_type, payload_json, created_at, retry_count, status, error_summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.business_id,
        entry.shop_id,
        entry.entity_type,
        entry.entity_id,
        entry.operation_type,
        entry.payload_json,
        entry.created_at,
        entry.retry_count,
        entry.status,
        entry.error_summary ?? null,
      ]
    );
  }

  async updateSyncStatus(
    id: string,
    status: 'pending' | 'processing' | 'synced' | 'failed' | 'requires_review' | 'quarantined',
    errorSummary?: string
  ): Promise<void> {
    let sql = 'UPDATE sync_queue SET status = ?';
    const params: any[] = [status];
    if (errorSummary) {
      sql += ', error_summary = ?';
      params.push(errorSummary);
    }
    if (status === 'failed') {
      sql += ', retry_count = retry_count + 1';
    }
    sql += ' WHERE id = ?';
    params.push(id);
    await this.bridge.execute(sql, params);
  }

  async purgeQuarantinedPreFirebaseSales(
    criteria: PurgeQuarantinedPreFirebaseSalesCriteria,
    storageOverride?: Storage
  ): Promise<PurgeQuarantinedPreFirebaseSalesResult> {
    const queuePlaceholders = criteria.targetQueueIds.map(() => '?').join(',');
    const salePlaceholders = criteria.targetSaleIds.map(() => '?').join(',');
    const auditPlaceholders = criteria.targetAuditEventIds.map(() => '?').join(',');

    // STEP 1: Query existing target records
    const existingQueue =
      criteria.targetQueueIds.length > 0
        ? await this.bridge.query<DbSyncQueueEntry>(
            `SELECT * FROM sync_queue WHERE id IN (${queuePlaceholders})`,
            [...criteria.targetQueueIds]
          )
        : [];

    const existingSales =
      criteria.targetSaleIds.length > 0
        ? await this.bridge.query<DbSale>(
            `SELECT * FROM sales WHERE id IN (${salePlaceholders})`,
            [...criteria.targetSaleIds]
          )
        : [];

    const existingAudits =
      criteria.targetAuditEventIds.length > 0
        ? await this.bridge.query<DbAuditEvent>(
            `SELECT * FROM audit_events WHERE id IN (${auditPlaceholders})`,
            [...criteria.targetAuditEventIds]
          )
        : [];

    const totalTargetCount =
      criteria.targetQueueIds.length +
      criteria.targetSaleIds.length +
      criteria.targetAuditEventIds.length;
    const totalFoundCount =
      existingQueue.length + existingSales.length + existingAudits.length;

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
          'All target pre-Firebase records were already removed from SQLite database (idempotent verification).',
          ...lsOutcome.details,
        ],
        localStorageStatus: lsOutcome.status,
        localStorageError: lsOutcome.error,
      };
    }

    // 1B. Validate all found records for tenant / quarantine marker mismatches
    const mismatches: string[] = [];

    for (const entry of existingQueue) {
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

    for (const sale of existingSales) {
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

    for (const audit of existingAudits) {
      if (audit.business_id !== criteria.expectedBusinessId) {
        mismatches.push(
          `Audit event "${audit.id}" business_id "${audit.business_id}" does not match expected "${criteria.expectedBusinessId}".`
        );
      }
    }

    // 1C. Check for missing target records
    const missingRecords: string[] = [];
    if (totalFoundCount < totalTargetCount) {
      const foundQueueIds = new Set(existingQueue.map((e) => e.id));
      const foundSaleIds = new Set(existingSales.map((s) => s.id));
      const foundAuditIds = new Set(existingAudits.map((a) => a.id));

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

    // STEP 2: Atomic Deletion Transaction
    await this.bridge.beginTransaction();
    try {
      let purgedQueueCount = 0;
      let purgedSalesCount = 0;
      let purgedItemsCount = 0;
      let purgedPaymentsCount = 0;
      let purgedAuditCount = 0;

      if (criteria.targetQueueIds.length > 0) {
        const res = await this.bridge.execute(
          `DELETE FROM sync_queue WHERE id IN (${queuePlaceholders})`,
          [...criteria.targetQueueIds]
        );
        purgedQueueCount = res.changes;
      }

      if (criteria.targetSaleIds.length > 0) {
        const itemRes = await this.bridge.execute(
          `DELETE FROM sale_items WHERE sale_id IN (${salePlaceholders})`,
          [...criteria.targetSaleIds]
        );
        purgedItemsCount = itemRes.changes;

        const pmtRes = await this.bridge.execute(
          `DELETE FROM payments WHERE reference_type = 'sale' AND reference_id IN (${salePlaceholders})`,
          [...criteria.targetSaleIds]
        );
        purgedPaymentsCount = pmtRes.changes;

        const saleRes = await this.bridge.execute(
          `DELETE FROM sales WHERE id IN (${salePlaceholders})`,
          [...criteria.targetSaleIds]
        );
        purgedSalesCount = saleRes.changes;
      }

      if (criteria.targetAuditEventIds.length > 0) {
        const auditRes = await this.bridge.execute(
          `DELETE FROM audit_events WHERE id IN (${auditPlaceholders})`,
          [...criteria.targetAuditEventIds]
        );
        purgedAuditCount = auditRes.changes;
      }

      await this.bridge.commitTransaction();

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
      await this.bridge.rollbackTransaction();
      throw err;
    }
  }
}

