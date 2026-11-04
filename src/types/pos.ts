/**
 * SmartMind POS — Phase 1 & Phase 2 Domain Types & Architectural Contracts
 *
 * Every business, shop, user, and shop assignment has a unique ID.
 * Products, prices, inventory, stock adjustments, and sales records
 * are strictly isolated per shop (scoped by shopId and businessId)
 * and never shared across shops or businesses automatically.
 */

export type UserRole =
  | 'platform_admin'
  | 'business_owner'
  | 'shop_manager'
  | 'cashier';

export type PermissionKey =
  | 'manage_business_settings'
  | 'manage_shops'
  | 'manage_staff'
  | 'manage_products'
  | 'adjust_inventory'
  | 'process_sales'
  | 'apply_discounts'
  | 'process_refunds'
  | 'process_returns'
  | 'view_shop_reports'
  | 'view_business_reports'
  | 'manage_debt_book'
  | 'manage_invoices';

export type AccountStatus = 'active' | 'suspended';

export type BusinessStatus = 'active' | 'suspended';

export type ShopStatus = 'active' | 'inactive' | 'maintenance';

export interface ShopAssignment {
  id: string;
  userId: string;
  businessId: string;
  shopId: string;
  assignedAt: string;
  assignedByUserId: string;
  isActive: boolean;
}

export interface CustomRole {
  id: string;
  businessId: string;
  name: string;
  description: string;
  permissions: PermissionKey[];
  createdByUserId: string;
  createdByName?: string;
  createdAt: string;
  isBuiltIn?: boolean;
}

export type BusinessOwnerAuthState =
  | 'Auth UID Linked'
  | 'Auth Binding Required'
  | 'Password Setup Pending'
  | 'Password Setup Email Sent'
  | 'Password Established / Email Verification Pending'
  | 'Account Disabled';

export type BusinessOwnerPasswordSetupStatus =
  | 'pending'
  | 'email_sent'
  | 'password_established'
  | 'verified';

export interface BusinessOwnerAuthResolution {
  primaryState: BusinessOwnerAuthState;
  label: BusinessOwnerAuthState;
  description: string;
  isUidLinked: boolean;
  isEmailVerified: boolean;
  requiresRepair: boolean;
  canRepairAuth: boolean;
  canSendPasswordSetupEmail: boolean;
  canResendPasswordSetupEmail: boolean;
  canSendPasswordSetup: boolean;
  canResendPasswordSetup: boolean;
  isDisabled: boolean;
  badges: BusinessOwnerAuthState[];
}

export interface User {
  id: string;
  /**
   * For platform_admin, businessId is 'PLATFORM' (not a business owner).
   * For business_owner, shop_manager, cashier, or custom roles, businessId references their parent Business.
   */
  businessId: string;
  username: string;
  email: string;
  fullName: string;
  role: UserRole | string;
  roleLabel: string;
  customRoleId?: string;
  /**
   * For business_owner, all shops in their business are accessible.
   * For shop_manager and cashier, access is strictly restricted to assignedShopIds.
   * For platform_admin, POS shop transaction workspaces are not automatically inherited.
   */
  assignedShopIds: string[];
  permissions: PermissionKey[];
  status: AccountStatus;
  createdAt: string;
  lastLoginAt: string;
  password?: string;
  passwordUpdatedAt?: string;
  authUidLinked?: boolean;
  emailVerified?: boolean;
  authDisabled?: boolean;
  authAccountCreatedAt?: string;
  passwordSetupStatus?: BusinessOwnerPasswordSetupStatus;
  passwordSetupEmailSentAt?: string;
  repairedFromUserId?: string;
  repairedAt?: string;
}

export type BusinessType =
  | 'Supermarket & Grocery Chain'
  | 'Pharmacy & Healthcare Retail'
  | 'Department & General Retail'
  | 'Restaurant, Bakery & Hospitality'
  | 'Specialty & Convenience Stores';

export interface Business {
  id: string;
  name: string;
  legalName: string;
  businessType: BusinessType;
  registrationNumber: string;
  taxIdentificationNumber: string;
  ownerUserId: string;
  ownerName: string;
  ownerEmail: string;
  contactEmail: string;
  primaryPhone: string;
  headquartersAddress: string;
  currencyCode: string;
  currencySymbol: string;
  defaultTaxRatePercent: number;
  status: BusinessStatus;
  notes?: string;
  createdAt: string;
}

export type ShopCategory =
  | 'Supermarket'
  | 'Pharmacy'
  | 'Express Mart'
  | 'Restaurant & Bakery'
  | 'Retail Store';

export type ReceiptPrinterMode = 'thermal' | 'a4';

export interface PrinterDevice {
  id: string;
  name: string;
  driverName?: string;
  type: 'thermal' | 'laser_inkjet' | 'virtual_pdf';
  connection: 'usb' | 'network' | 'bluetooth' | 'system_spooler';
  status: 'ready' | 'offline' | 'busy';
  paperFormats: ('80mm' | '58mm' | 'a4')[];
  isDefault?: boolean;
  ipAddress?: string;
}

export interface ShopPrinterSettings {
  defaultPrinterId: string;
  receiptPrinterMode: ReceiptPrinterMode;
  allowReceiptReprint: boolean;
  thermalPaperWidth: '80mm' | '58mm';
  autoCutReceipt: boolean;
  openCashDrawerOnPrint: boolean;
  printStoreLogo: boolean;
  headerNote?: string;
  footerNote?: string;
}

export interface Shop {
  id: string;
  businessId: string;
  code: string;
  name: string;
  category: ShopCategory;
  locationCity: string;
  address: string;
  phone: string;
  description?: string;
  managerName: string;
  status: ShopStatus;
  terminalId: string;
  taxRatePercent: number;
  receiptHeaderNote: string;
  receiptFooterNote: string;
  createdAt: string;
  /** Prototype indicator of local unsynced records waiting in this shop's queue */
  pendingSyncCount: number;
  lastSyncedAt: string;
  printerSettings?: ShopPrinterSettings;
}

export interface ProductCategory {
  id: string;
  shopId: string;
  businessId: string;
  name: string;
  description: string;
}

export interface UnitOfMeasurement {
  id: string;
  shopId: string;
  businessId: string;
  name: string;
  abbreviation: string;
}

export interface Product {
  id: string;
  shopId: string;
  businessId: string;
  sku: string;
  barcode: string;
  name: string;
  categoryId: string;
  categoryName: string;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  stockQuantity: number;
  reorderLevel: number;
  taxExempt?: boolean;
  isActive: boolean;
  updatedAt: string;
}

export type StockAdjustmentType =
  | 'restock'
  | 'add_stock'
  | 'damage_spoilage'
  | 'return_in'
  | 'audit_correction'
  | 'sale_deduction';

export interface StockAdjustment {
  id: string;
  shopId: string;
  businessId: string;
  productId: string;
  productName: string;
  productSku: string;
  type: StockAdjustmentType;
  quantityDelta: number;
  previousQuantity: number;
  newQuantity: number;
  reason: string;
  performedByUserId: string;
  performedByName: string;
  createdAt: string;
  syncStatus: 'synced_demo' | 'pending_local_queue';
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export type PaymentMethod =
  | 'cash'
  | 'bank_transfer'
  | 'pos_card'
  | 'credit'
  | 'split_payment';

export type TransactionStatus =
  | 'completed'
  | 'completed_demo'
  | 'pending_sync'
  | 'refunded_demo'
  | 'voided_demo';

export interface SaleLineItem {
  id: string;
  productId: string;
  sku: string;
  barcode: string;
  productName: string;
  unit?: string;
  unitPrice: number;
  costPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface SaleTransaction {
  id: string;
  shopId: string;
  businessId: string;
  receiptNumber: string;
  terminalId: string;
  cashierUserId: string;
  cashierName: string;
  createdAt: string;
  items: SaleLineItem[];
  subtotal: number;
  discountAmount: number;
  taxRatePercent: number;
  taxAmount: number;
  totalAmount: number;
  amountTendered: number;
  changeDue: number;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  creditCustomerId?: string;
  creditCustomerName?: string;
  creditCustomerPhone?: string;
  status: TransactionStatus;
  syncStatus:
    | 'synced'
    | 'synced_demo'
    | 'pending_local_queue'
    | 'queued_offline_demo'
    | 'sync_error_demo'
    | 'requires_review';
  syncAckId?: string;
  conflictReason?: string;
  notes?: string;
}

export type ConnectivityState =
  | 'online'
  | 'offline'
  | 'pending_sync'
  | 'syncing'
  | 'sync_error'
  | 'requires_review';

export interface ConnectivitySnapshot {
  state: ConnectivityState;
  pendingTransactionsCount: number;
  syncedCount?: number;
  failedRetryableCount?: number;
  requiresReviewCount?: number;
  conflicts?: Array<{
    syncEntryId: string;
    entityId: string;
    entityType: string;
    shopId: string;
    conflictReason: string;
    createdAt: string;
  }>;
  lastSyncAttemptAt: string;
  lastSuccessfulSyncAt: string;
  errorMessage?: string;
  sqliteEngineStatus: 'prototype_memory_mode' | 'indexeddb_browser_adapter' | 'sqlite_desktop_adapter';
  cloudServiceStatus: 'not_connected_phase_1' | 'firebase_cloud_connected' | 'isolated_demo_mode';
}

export type DebtTransactionType = 'credit' | 'deposit';

export interface DebtCustomer {
  id: string;
  shopId: string;
  businessId: string;
  fullName: string;
  phone: string;
  creditLimitEnabled: boolean;
  creditLimitAmount: number;
  totalCredit: number;
  amountPaid: number;
  balanceRemaining: number;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export interface DebtTransaction {
  id: string;
  shopId: string;
  businessId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  type: DebtTransactionType;
  amount: number;
  paymentMethod?: PaymentMethod;
  reference: string;
  notes: string;
  recordedByUserId: string;
  recordedByName: string;
  createdAt: string;
}

export type InvoiceStatus =
  | 'paid'
  | 'unpaid'
  | 'partially_paid'
  | 'overdue'
  | 'draft'
  | 'cancelled';

export interface InvoicePaymentRecord {
  id: string;
  invoiceId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  notes?: string;
  recordedByUserId: string;
  recordedByName: string;
  recordedAt: string;
}

export interface InvoiceLineItem {
  id: string;
  productId: string;
  sku: string;
  barcode: string;
  productName: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface Invoice {
  id: string;
  shopId: string;
  businessId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;

  // Customer details
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerAddress?: string;
  companyName?: string;

  // Line items & totals
  items: InvoiceLineItem[];
  subtotal: number;
  discountAmount: number;
  taxRatePercent: number;
  taxAmount: number;
  totalAmount: number;

  // Payments & Balances
  amountPaid: number;
  balanceRemaining: number;
  payments?: InvoicePaymentRecord[];

  status: InvoiceStatus;
  notes?: string;
  paymentTerms?: string;

  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  shopId: string;
  businessId: string;
  fullName: string;
  phone: string;
  email: string;
  address: string;
  totalSupplies: number;
  totalAmount: number;
  amountPaid: number;
  balanceRemaining: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierSupplyItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  barcode: string;
  unit: string;
  quantity: number;
  costPrice: number;
  lineTotal: number;
}

export interface SupplierSupplyRecord {
  id: string;
  shopId: string;
  businessId: string;
  supplierId: string;
  supplierName: string;
  items: SupplierSupplyItem[];
  totalQuantity: number;
  totalAmount: number;
  amountPaid: number;
  balanceRemaining: number;
  notes?: string;
  recordedByUserId: string;
  recordedByName: string;
  createdAt: string;
}

export type AppView =
  | 'platform_admin'
  | 'dashboard'
  | 'pos'
  | 'inventory'
  | 'invoices'
  | 'sales'
  | 'sales_summary'
  | 'debt_book'
  | 'reports'
  | 'suppliers'
  | 'shops'
  | 'staff'
  | 'settings';

export type PlatformAdminSection =
  | 'overview'
  | 'businesses'
  | 'workspace'
  | 'shops'
  | 'sales'
  | 'inventory'
  | 'users'
  | 'subscriptions'
  | 'audit_logs'
  | 'settings';

export type BusinessWorkspaceTab =
  | 'overview'
  | 'sales'
  | 'inventory'
  | 'shops'
  | 'staff';

export type PlatformAdminAuditAction =
  | 'business_registered'
  | 'business_profile_updated'
  | 'business_suspended'
  | 'business_activated'
  | 'user_disabled'
  | 'user_enabled'
  | 'user_role_changed'
  | 'user_shops_reassigned'
  | 'user_profile_updated'
  | 'staff_invited'
  | 'inventory_adjusted'
  | 'sale_refunded'
  | 'sale_voided'
  | 'shop_created'
  | 'shop_updated'
  | 'shop_status_changed'
  | 'subscription_plan_updated'
  | 'owner_auth_repaired'
  | 'password_setup_email_sent';

export interface PlatformAdminAuditLog {
  id: string;
  businessId: string;
  businessName: string;
  shopId?: string;
  shopName?: string;
  adminUid: string;
  adminEmail: string;
  adminName: string;
  action: PlatformAdminAuditAction | string;
  targetEntityType: 'business' | 'shop' | 'user' | 'product' | 'sale' | 'subscription';
  targetEntityId: string;
  targetEntityName: string;
  previousState?: string | Record<string, any>;
  newState?: string | Record<string, any>;
  reason: string;
  createdAt: string;
}

export type SubscriptionTier = 'starter' | 'standard' | 'professional' | 'enterprise';
export type SubscriptionStatus = 'active' | 'trial' | 'grace_period' | 'expired' | 'suspended';

export interface BusinessSubscription {
  businessId: string;
  businessName: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  maxShops: number;
  maxUsers: number;
  monthlyFeeNaira: number;
  startDate: string;
  renewalDate: string;
  gracePeriodDays: number;
  notes?: string;
}

export type GlobalSalesDateRange =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'prev_month'
  | 'custom';



