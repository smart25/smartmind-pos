/**
 * SmartMind POS — Phase 5: Local Database Schema & Entity Definitions
 *
 * Designed for local SQLite durability on Windows Desktop with an
 * IndexedDB development adapter for browser preview.
 *
 * Monetary amounts are represented in integer minor units (kobo for NGN)
 * to avoid floating-point rounding issues in database storage.
 */

export const CURRENT_SCHEMA_VERSION = 5;

// Monetary conversion helpers (1 Naira = 100 Kobo)
export const MINOR_UNIT_FACTOR = 100;

export function toMinorUnits(amount: number, factor = MINOR_UNIT_FACTOR): number {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return 0;
  return Math.round(amount * factor);
}

export function fromMinorUnits(units: number, factor = MINOR_UNIT_FACTOR): number {
  if (typeof units !== 'number' || Number.isNaN(units)) return 0;
  return Math.round(units) / factor;
}

// ============================================================================
// DATABASE ENTITY SCHEMAS (NORMALIZED)
// ============================================================================

export interface DbBusiness {
  id: string; // biz-XXXX-XXXX
  name: string;
  legal_name: string;
  business_type: string;
  registration_number: string;
  tax_identification_number: string;
  owner_user_id: string;
  owner_name: string;
  owner_email: string;
  contact_email: string;
  primary_phone: string;
  headquarters_address: string;
  currency_code: string;
  currency_symbol: string;
  default_tax_rate_percent: number;
  status: 'active' | 'suspended';
  notes?: string;
  created_at: string; // ISO 8601
  updated_at: string;
}

export interface DbShop {
  id: string; // shop-XXXX-XXXX
  business_id: string;
  code: string;
  name: string;
  category: string;
  location_city: string;
  address: string;
  phone: string;
  description?: string;
  manager_name: string;
  status: 'active' | 'inactive' | 'maintenance';
  terminal_id: string;
  tax_rate_percent: number;
  receipt_header_note: string;
  receipt_footer_note: string;
  printer_settings_json?: string;
  created_at: string;
  updated_at: string;
}

export interface DbUser {
  id: string; // usr-XXXX-XXXX
  business_id: string; // 'PLATFORM' or biz-XXXX
  username: string;
  email: string;
  full_name: string;
  role: string;
  role_label: string;
  custom_role_id?: string;
  permissions_json: string; // JSON array of PermissionKey
  status: 'active' | 'suspended';
  password_hash?: string; // local demo credential
  password_updated_at?: string;
  created_at: string;
  last_login_at: string;
}

export interface DbUserShopAssignment {
  id: string; // asgn-XXXX
  user_id: string;
  business_id: string;
  shop_id: string;
  assigned_at: string;
  assigned_by_user_id: string;
  is_active: number; // 1 or 0
}

export interface DbCategory {
  id: string; // cat-XXXX
  shop_id: string;
  business_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface DbProduct {
  id: string; // prod-XXXX
  shop_id: string;
  business_id: string;
  category_id: string;
  category_name: string;
  sku: string; // unique per shop
  barcode: string;
  name: string;
  unit: string;
  cost_price_kobo: number; // integer minor units
  selling_price_kobo: number; // integer minor units
  stock_quantity: number;
  reorder_level: number;
  has_expiry?: number; // 1 or 0
  expiry_date?: string | null;
  tax_exempt: number; // 1 or 0
  is_active: number; // 1 or 0
  created_at: string;
  updated_at: string;
}

export interface DbInventoryMovement {
  id: string; // adj-XXXX
  shop_id: string;
  business_id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  type:
    | 'restock'
    | 'add_stock'
    | 'damage_spoilage'
    | 'return_in'
    | 'audit_correction'
    | 'sale_deduction';
  quantity_delta: number;
  previous_quantity: number;
  new_quantity: number;
  reason: string;
  reference_id?: string; // sale_id or supply_id
  performed_by_user_id: string;
  performed_by_name: string;
  created_at: string;
}

export interface DbSale {
  id: string; // sale-XXXX
  shop_id: string;
  business_id: string;
  receipt_number: string;
  terminal_id: string;
  cashier_user_id: string;
  cashier_name: string;
  created_at: string;
  subtotal_kobo: number;
  discount_amount_kobo: number;
  tax_rate_percent: number;
  tax_amount_kobo: number;
  total_amount_kobo: number;
  amount_tendered_kobo: number;
  change_due_kobo: number;
  payment_method: string;
  payment_reference?: string;
  credit_customer_id?: string;
  credit_customer_name?: string;
  credit_customer_phone?: string;
  status: 'completed' | 'refunded' | 'voided';
  notes?: string;
  idempotency_key?: string; // prevents duplicate checkout submissions
  is_synced: number; // 0 = local only, 1 = synced
  synced_at?: string;
  sync_ack_id?: string;
  sync_conflict_reason?: string;
}

export interface DbSaleItem {
  id: string; // line-XXXX
  sale_id: string;
  shop_id: string;
  business_id: string;
  product_id: string;
  sku: string; // historical snapshot
  barcode: string;
  product_name: string; // historical snapshot
  unit: string;
  unit_price_kobo: number;
  cost_price_kobo: number;
  quantity: number;
  line_total_kobo: number;
}

export interface DbPayment {
  id: string; // pmt-XXXX
  shop_id: string;
  business_id: string;
  reference_type: 'sale' | 'invoice' | 'debt_settlement' | 'supplier_payment';
  reference_id: string;
  amount_kobo: number;
  payment_method: string;
  payment_reference?: string;
  notes?: string;
  recorded_by_user_id: string;
  recorded_by_name: string;
  created_at: string;
}

export interface DbAppSetting {
  key: string;
  value: string;
  scope: 'global' | 'business' | 'shop';
  scope_id?: string; // businessId or shopId
  updated_at: string;
}

export interface DbAuditEvent {
  id: string; // aud-XXXX
  business_id: string;
  shop_id?: string;
  user_id: string;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details_json?: string;
  ip_address?: string;
  created_at: string;
}

export type SyncQueueStatus =
  | 'pending'
  | 'processing'
  | 'synced'
  | 'failed'
  | 'requires_review'
  | 'quarantined';

export interface DbSyncQueueEntry {
  id: string; // sync-XXXX
  business_id: string;
  shop_id: string;
  entity_type:
    | 'sale'
    | 'product'
    | 'category'
    | 'inventory_movement'
    | 'customer'
    | 'invoice'
    | 'payment'
    | 'sale_return';
  entity_id: string;
  operation_type: 'create' | 'update' | 'delete' | 'adjust';
  payload_json: string; // sanitized data snapshot (NO passwords or tokens)
  created_at: string;
  retry_count: number;
  status: SyncQueueStatus;
  error_summary?: string;
  idempotency_key?: string;
  schema_version?: number;
  actor_user_id?: string;
  acknowledged_at?: string;
  cloud_ack_id?: string;
  conflict_reason?: string;
  quarantined_at?: string;
  quarantine_reason?: string;
}

export interface DbSchemaMigration {
  version: number;
  applied_at: string;
  description: string;
}
