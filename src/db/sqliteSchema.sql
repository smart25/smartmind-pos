-- SmartMind POS — Phase 5: SQLite Database Schema DDL
-- Target Engine: SQLite 3 (Windows Desktop Runtime via Electron main process)
-- All monetary columns store integer minor units (kobo for NGN) to ensure decimal safety.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- ============================================================================
-- SCHEMA MIGRATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL,
    description TEXT NOT NULL
);

-- ============================================================================
-- BUSINESSES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS businesses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    legal_name TEXT NOT NULL,
    business_type TEXT NOT NULL,
    registration_number TEXT NOT NULL,
    tax_identification_number TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    primary_phone TEXT NOT NULL,
    headquarters_address TEXT NOT NULL,
    currency_code TEXT NOT NULL DEFAULT 'NGN',
    currency_symbol TEXT NOT NULL DEFAULT '₦',
    default_tax_rate_percent REAL NOT NULL DEFAULT 7.5,
    status TEXT NOT NULL CHECK(status IN ('active', 'suspended')),
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_businesses_status ON businesses(status);

-- ============================================================================
-- SHOPS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS shops (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    location_city TEXT NOT NULL,
    address TEXT NOT NULL,
    phone TEXT NOT NULL,
    description TEXT,
    manager_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('active', 'inactive', 'maintenance')),
    terminal_id TEXT NOT NULL,
    tax_rate_percent REAL NOT NULL DEFAULT 7.5,
    receipt_header_note TEXT NOT NULL DEFAULT '',
    receipt_footer_note TEXT NOT NULL DEFAULT '',
    printer_settings_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_shops_business_id ON shops(business_id);
CREATE INDEX IF NOT EXISTS idx_shops_code ON shops(code);

-- ============================================================================
-- USERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL,
    role_label TEXT NOT NULL,
    custom_role_id TEXT,
    permissions_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL CHECK(status IN ('active', 'suspended')),
    password_hash TEXT,
    password_updated_at TEXT,
    created_at TEXT NOT NULL,
    last_login_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_business_id ON users(business_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================================
-- USER SHOP ASSIGNMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_shop_assignments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    business_id TEXT NOT NULL,
    shop_id TEXT NOT NULL,
    assigned_at TEXT NOT NULL,
    assigned_by_user_id TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
    UNIQUE (user_id, shop_id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_user_id ON user_shop_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_shop_id ON user_shop_assignments(shop_id);

-- ============================================================================
-- CATEGORIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    business_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE RESTRICT,
    UNIQUE (shop_id, name)
);

CREATE INDEX IF NOT EXISTS idx_categories_shop_id ON categories(shop_id);

-- ============================================================================
-- PRODUCTS TABLE
-- SKU is unique per shop. The same SKU may exist in separate shops.
-- ============================================================================
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    business_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    category_name TEXT NOT NULL,
    sku TEXT NOT NULL,
    barcode TEXT NOT NULL,
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'Pack',
    cost_price_kobo INTEGER NOT NULL DEFAULT 0 CHECK(cost_price_kobo >= 0),
    selling_price_kobo INTEGER NOT NULL CHECK(selling_price_kobo > 0),
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK(stock_quantity >= 0),
    reorder_level INTEGER NOT NULL DEFAULT 5 CHECK(reorder_level >= 0),
    tax_exempt INTEGER NOT NULL DEFAULT 0 CHECK(tax_exempt IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE RESTRICT,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
    UNIQUE (shop_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_products_shop_id ON products(shop_id);
CREATE INDEX IF NOT EXISTS idx_products_shop_sku ON products(shop_id, sku);
CREATE INDEX IF NOT EXISTS idx_products_shop_barcode ON products(shop_id, barcode);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

-- ============================================================================
-- INVENTORY MOVEMENTS (AUDIT TRAIL FOR ALL STOCK CHANGES)
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_movements (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    business_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    product_sku TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('restock', 'add_stock', 'damage_spoilage', 'return_in', 'audit_correction', 'sale_deduction')),
    quantity_delta INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    reason TEXT NOT NULL,
    reference_id TEXT,
    performed_by_user_id TEXT NOT NULL,
    performed_by_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE RESTRICT,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_movements_shop_id ON inventory_movements(shop_id);
CREATE INDEX IF NOT EXISTS idx_movements_product_id ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_movements_type ON inventory_movements(type);
CREATE INDEX IF NOT EXISTS idx_movements_created_at ON inventory_movements(created_at);

-- ============================================================================
-- SALES TABLE (IMMUTABLE HISTORICAL RECORDS)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    business_id TEXT NOT NULL,
    receipt_number TEXT NOT NULL,
    terminal_id TEXT NOT NULL,
    cashier_user_id TEXT NOT NULL,
    cashier_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    subtotal_kobo INTEGER NOT NULL,
    discount_amount_kobo INTEGER NOT NULL DEFAULT 0,
    tax_rate_percent REAL NOT NULL DEFAULT 7.5,
    tax_amount_kobo INTEGER NOT NULL DEFAULT 0,
    total_amount_kobo INTEGER NOT NULL,
    amount_tendered_kobo INTEGER NOT NULL,
    change_due_kobo INTEGER NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL,
    payment_reference TEXT,
    credit_customer_id TEXT,
    credit_customer_name TEXT,
    credit_customer_phone TEXT,
    status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed', 'refunded', 'voided')),
    notes TEXT,
    idempotency_key TEXT UNIQUE,
    is_synced INTEGER NOT NULL DEFAULT 0 CHECK(is_synced IN (0, 1)),
    synced_at TEXT,
    FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sales_shop_id ON sales(shop_id);
CREATE INDEX IF NOT EXISTS idx_sales_receipt ON sales(receipt_number);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_idempotency ON sales(idempotency_key);

-- ============================================================================
-- SALE ITEMS (IMMUTABLE PRICE AND PRODUCT SNAPSHOT)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sale_items (
    id TEXT PRIMARY KEY,
    sale_id TEXT NOT NULL,
    shop_id TEXT NOT NULL,
    business_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    sku TEXT NOT NULL,
    barcode TEXT NOT NULL,
    product_name TEXT NOT NULL,
    unit TEXT NOT NULL,
    unit_price_kobo INTEGER NOT NULL,
    cost_price_kobo INTEGER NOT NULL DEFAULT 0,
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    line_total_kobo INTEGER NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);

-- ============================================================================
-- PAYMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    business_id TEXT NOT NULL,
    reference_type TEXT NOT NULL CHECK(reference_type IN ('sale', 'invoice', 'debt_settlement', 'supplier_payment')),
    reference_id TEXT NOT NULL,
    amount_kobo INTEGER NOT NULL CHECK(amount_kobo >= 0),
    payment_method TEXT NOT NULL,
    payment_reference TEXT,
    notes TEXT,
    recorded_by_user_id TEXT NOT NULL,
    recorded_by_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_payments_shop_id ON payments(shop_id);
CREATE INDEX IF NOT EXISTS idx_payments_ref ON payments(reference_type, reference_id);

-- ============================================================================
-- APPLICATION SETTINGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    scope TEXT NOT NULL CHECK(scope IN ('global', 'business', 'shop')),
    scope_id TEXT,
    updated_at TEXT NOT NULL
);

-- ============================================================================
-- AUDIT EVENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL,
    shop_id TEXT,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    details_json TEXT,
    ip_address TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_business ON audit_events(business_id);
CREATE INDEX IF NOT EXISTS idx_audit_shop ON audit_events(shop_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at);

-- ============================================================================
-- SYNC QUEUE (PREPARATION FOR FUTURE OFFLINE-TO-CLOUD SYNC)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL,
    shop_id TEXT NOT NULL,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('sale', 'product', 'category', 'inventory_movement', 'customer', 'invoice', 'payment')),
    entity_id TEXT NOT NULL,
    operation_type TEXT NOT NULL CHECK(operation_type IN ('create', 'update', 'delete', 'adjust')),
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'synced', 'failed')),
    error_summary TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_shop ON sync_queue(shop_id, status);

-- Record Initial Migration
INSERT OR IGNORE INTO schema_migrations (version, applied_at, description)
VALUES (1, datetime('now'), 'Initial normalized SQLite schema for SmartMind POS Phase 5');
