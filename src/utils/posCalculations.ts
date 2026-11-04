import {
  AppView,
  Business,
  BusinessOwnerAuthState,
  BusinessType,
  CartItem,
  CustomRole,
  DebtCustomer,
  DebtTransaction,
  DebtTransactionType,
  PaymentMethod,
  PermissionKey,
  PrinterDevice,
  Product,
  ProductCategory,
  ReceiptPrinterMode,
  SaleTransaction,
  Shop,
  ShopCategory,
  ShopPrinterSettings,
  StockAdjustment,
  StockAdjustmentType,
  Supplier,
  SupplierSupplyItem,
  SupplierSupplyRecord,
  UnitOfMeasurement,
  User,
  UserRole,
} from '../types/pos';

export interface CartCalculationResult {
  itemCount: number;
  uniqueLines: number;
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
}

/**
 * Least-privilege default permission sets for each role.
 * Cashiers never receive user management, shop management, or business-wide profit reporting permissions.
 * Platform Administrators manage platform-wide business registrations and do not automatically inherit shop POS operations.
 */
export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
  platform_admin: [],
  business_owner: [
    'manage_business_settings',
    'manage_shops',
    'manage_staff',
    'manage_products',
    'adjust_inventory',
    'process_sales',
    'apply_discounts',
    'process_refunds',
    'process_returns',
    'view_shop_reports',
    'view_business_reports',
    'manage_debt_book',
    'manage_invoices',
  ],
  shop_manager: [
    'manage_products',
    'adjust_inventory',
    'process_sales',
    'apply_discounts',
    'process_refunds',
    'process_returns',
    'view_shop_reports',
    'manage_debt_book',
    'manage_invoices',
  ],
  cashier: ['process_sales', 'manage_invoices'],
};

export const PERMISSION_CATALOGUE: {
  key: PermissionKey;
  label: string;
  description: string;
  scope: 'business' | 'shop';
}[] = [
  {
    key: 'manage_business_settings',
    label: 'Manage Business Settings',
    description: 'Edit business profile, tax defaults, and organization preferences',
    scope: 'business',
  },
  {
    key: 'manage_shops',
    label: 'Manage Shops',
    description: 'Create, edit, activate, or deactivate shops within the business',
    scope: 'business',
  },
  {
    key: 'manage_staff',
    label: 'Manage Staff & Permissions',
    description: 'Create staff accounts, assign shops, and configure permissions',
    scope: 'business',
  },
  {
    key: 'view_business_reports',
    label: 'View Business-Wide Reports',
    description: 'Access consolidated multi-shop performance and profit summaries',
    scope: 'business',
  },
  {
    key: 'manage_products',
    label: 'Manage Products',
    description: 'Create and edit shop products, categories, prices, and units',
    scope: 'shop',
  },
  {
    key: 'adjust_inventory',
    label: 'Adjust Inventory',
    description: 'Record restocks, spoilage write-offs, and stock audit corrections',
    scope: 'shop',
  },
  {
    key: 'process_sales',
    label: 'Process Sales (POS)',
    description: 'Operate the Point of Sale terminal and record customer checkouts',
    scope: 'shop',
  },
  {
    key: 'apply_discounts',
    label: 'Apply Discounts',
    description: 'Apply percentage or fixed-amount discounts on POS carts',
    scope: 'shop',
  },
  {
    key: 'process_refunds',
    label: 'Process Refunds & Voids',
    description: 'Authorize sale refunds and transaction voids in shop history',
    scope: 'shop',
  },
  {
    key: 'process_returns',
    label: 'Process Sales & Stock Returns',
    description: 'Authorize receipt returns, product restock returns, and inventory quantity reversals',
    scope: 'shop',
  },
  {
    key: 'view_shop_reports',
    label: 'View Shop Reports',
    description: 'View single-shop sales summaries and payment breakdowns',
    scope: 'shop',
  },
  {
    key: 'manage_debt_book',
    label: 'Manage Debt Book',
    description: 'View customer credit ledgers, register debt accounts, and record settlements',
    scope: 'shop',
  },
  {
    key: 'manage_invoices',
    label: 'Manage Invoices & Billing',
    description: 'Create pro-forma and commercial invoices, record payments, and download receipts',
    scope: 'shop',
  },
];

export function getRoleLabel(role: UserRole | string): string {
  switch (role) {
    case 'platform_admin':
      return 'Platform Administrator';
    case 'business_owner':
      return 'Business Owner';
    case 'shop_manager':
      return 'Shop Manager';
    case 'cashier':
      return 'Cashier';
    default:
      return role;
  }
}

/**
 * Checks whether a user holds a specific permission.
 * Business owners hold all business & shop permissions for their own business.
 */
export function hasPermission(user: User, permission: PermissionKey): boolean {
  if (user.status !== 'active') return false;
  if (user.role === 'platform_admin') return false;
  if (user.role === 'business_owner') return true;
  return user.permissions.includes(permission);
}

/**
 * Verifies whether a user has permission to access a specific workspace view.
 * Platform admins only access the platform administration console.
 * Business owners hold all permissions for their own business.
 * For staff (managers & cashiers), access is strictly restricted to the exact permissions granted to them.
 */
export function canUserAccessView(user: User, view: AppView): boolean {
  if (user.status !== 'active') return false;
  if (view === 'platform_admin') return user.role === 'platform_admin';
  if (user.role === 'platform_admin') return false;
  if (user.role === 'business_owner') return true;

  switch (view) {
    case 'pos':
      return hasPermission(user, 'process_sales');

    case 'inventory':
      return (
        hasPermission(user, 'manage_products') ||
        hasPermission(user, 'adjust_inventory')
      );

    case 'sales':
    case 'sales_summary':
      return (
        hasPermission(user, 'process_refunds') ||
        hasPermission(user, 'view_shop_reports') ||
        hasPermission(user, 'view_business_reports')
      );

    case 'debt_book':
      return (
        hasPermission(user, 'manage_debt_book') ||
        hasPermission(user, 'view_shop_reports')
      );

    case 'invoices':
      return (
        hasPermission(user, 'manage_invoices') ||
        hasPermission(user, 'process_sales') ||
        hasPermission(user, 'manage_products')
      );

    case 'reports':
      return (
        hasPermission(user, 'view_shop_reports') ||
        hasPermission(user, 'view_business_reports')
      );

    case 'suppliers':
      return (
        hasPermission(user, 'manage_products') ||
        hasPermission(user, 'adjust_inventory') ||
        hasPermission(user, 'view_shop_reports') ||
        hasPermission(user, 'view_business_reports')
      );

    case 'shops':
      return hasPermission(user, 'manage_shops');

    case 'staff':
      return hasPermission(user, 'manage_staff');

    case 'settings':
      return hasPermission(user, 'manage_business_settings');

    case 'dashboard':
      return (
        hasPermission(user, 'view_shop_reports') ||
        hasPermission(user, 'view_business_reports') ||
        hasPermission(user, 'manage_shops')
      );

    default:
      return false;
  }
}

/**
 * Returns the primary default workspace view for a user based strictly on their granted permissions.
 * E.g., for a cashier with only 'process_sales' permission, automatically routes to 'pos'.
 */
export function getDefaultViewForUser(user: User): AppView {
  if (user.role === 'platform_admin') return 'platform_admin';
  if (canUserAccessView(user, 'dashboard')) return 'dashboard';
  if (canUserAccessView(user, 'pos')) return 'pos';
  if (canUserAccessView(user, 'inventory')) return 'inventory';
  if (canUserAccessView(user, 'sales')) return 'sales';
  if (canUserAccessView(user, 'debt_book')) return 'debt_book';
  if (canUserAccessView(user, 'reports')) return 'reports';
  if (canUserAccessView(user, 'suppliers')) return 'suppliers';
  if (canUserAccessView(user, 'shops')) return 'shops';
  if (canUserAccessView(user, 'staff')) return 'staff';
  if (canUserAccessView(user, 'settings')) return 'settings';
  return 'pos';
}

/**
 * Verifies whether a user is allowed to access a given Business.
 * Platform Administrators can inspect all businesses in the platform directory.
 * Non-admin users can only ever access their single assigned businessId (and only when not suspended).
 */
export function canUserAccessBusiness(user: User, business: Business): boolean {
  if (user.status !== 'active') return false;
  if (user.role === 'platform_admin') return true;
  if (business.status === 'suspended') return false;
  return user.businessId === business.id && business.ownerUserId !== '';
}

/**
 * Verifies whether a user is authorized to enter/operate a given shop workspace.
 * - Platform Administrators are NOT business owners and do not automatically inherit access to shop POS transactions.
 * - Business Owners can access all shops belonging to their own businessId.
 * - Shop Managers and Cashiers can only access shops explicitly listed in assignedShopIds that belong to their businessId.
 */
export function canUserAccessShop(
  user: User,
  shop: Shop,
  parentBusiness?: Business
): boolean {
  if (user.status !== 'active') return false;
  if (user.role === 'platform_admin') return false;
  if (parentBusiness && parentBusiness.status === 'suspended') return false;
  if (user.businessId !== shop.businessId) return false;
  if (user.role === 'business_owner') return true;
  return user.assignedShopIds.includes(shop.id);
}

/**
 * Returns only the shops that a user is authorized to access within their business.
 */
export function getAuthorizedShopsForUser(
  user: User,
  allShops: Shop[],
  allBusinesses?: Business[]
): Shop[] {
  return allShops.filter((shop) => {
    const parentBiz = allBusinesses?.find((b) => b.id === shop.businessId);
    return canUserAccessShop(user, shop, parentBiz);
  });
}

/**
 * Returns ONLY the registered Business Owners (`role === 'business_owner'`)
 * to be listed on the Platform Admin page directory.
 * Shop Managers and Cashiers are never listed on the Platform Admin page;
 * instead, they are visible when the Business Owner accesses their own business page/dashboard.
 */
export function getAdminPageBusinessOwners(allUsers: User[]): User[] {
  return allUsers.filter((u) => u.role === 'business_owner');
}

/**
 * Enforces strict tenant and role authorization for user visibility:
 * - On the Platform Admin page (`platform_admin`), only Business Owners (plus the current admin session) are exposed—never Shop Managers or Cashiers.
 * - The Business Owner (`role === 'business_owner'`) can view and switch into all user accounts in their business.
 * - The Business Owner account is NEVER visible to any other users (shop managers, cashiers, supervisors).
 * - Shop Managers and Cashiers cannot switch into other users' accounts.
 * - Staff without 'manage_staff' permission only see their own user account (`[actor]`).
 * - Staff with 'manage_staff' permission can only see peer staff within the business, strictly excluding the Business Owner.
 */
export function getVisibleUsersForActor(
  actor: User,
  allUsers: User[]
): User[] {
  if (actor.role === 'platform_admin') {
    return allUsers.filter(
      (u) => u.role === 'business_owner' || u.id === actor.id
    );
  }
  if (!actor.businessId || actor.businessId === 'PLATFORM') {
    return [actor];
  }

  // The Business Owner has full access to view and switch all accounts in their business
  if (actor.role === 'business_owner') {
    return allUsers.filter(
      (u) => u.businessId === actor.businessId && u.role !== 'platform_admin'
    );
  }

  // For any other users (shop managers, cashiers, supervisors):
  // The business owner account must NEVER be visible to any other users.
  if (!hasPermission(actor, 'manage_staff')) {
    return [actor];
  }

  // Authorized staff with 'manage_staff' permission can only see peer staff in their business,
  // strictly excluding the Business Owner.
  return allUsers.filter(
    (u) =>
      u.businessId === actor.businessId &&
      u.role !== 'platform_admin' &&
      u.role !== 'business_owner'
  );
}

export const DEFAULT_DEMO_PASSWORD = 'smartmind-demo';

/**
 * Determines whether an actor is authorized to reset or change the password of a target user:
 * - A Business Owner can change their own password AND reset/change the password of every user registered under their own business (`businessId`).
 * - Any user can change their own password (`actor.id === targetUser.id`).
 * - A staff member with `manage_staff` permission can reset passwords for non-owner staff within their own business.
 * - Cross-business password changes are strictly prohibited.
 */
export function canActorResetUserPassword(
  actor: User,
  targetUser: User
): boolean {
  if (actor.id === targetUser.id) {
    return true;
  }
  if (targetUser.role === 'platform_admin') {
    return false;
  }
  if (
    !actor.businessId ||
    actor.businessId === 'PLATFORM' ||
    actor.businessId !== targetUser.businessId
  ) {
    return false;
  }
  if (actor.role === 'business_owner') {
    return true;
  }
  if (
    hasPermission(actor, 'manage_staff') &&
    targetUser.role !== 'business_owner'
  ) {
    return true;
  }
  return false;
}

/**
 * Validates new password and confirmation password inputs when resetting or changing a user password.
 */
export function validatePasswordChangeInput(
  newPassword: string,
  confirmPassword: string
): { valid: boolean; error?: string } {
  const trimmedNew = newPassword.trim();
  const trimmedConfirm = confirmPassword.trim();
  if (!trimmedNew) {
    return { valid: false, error: 'Please enter a new password.' };
  }
  if (trimmedNew.length < 4) {
    return {
      valid: false,
      error: 'New password must be at least 4 characters long.',
    };
  }
  if (trimmedNew !== trimmedConfirm) {
    return {
      valid: false,
      error: 'New password and confirmation password do not match.',
    };
  }
  return { valid: true };
}

/**
 * Applies a password reset/change to a User record and records the timestamp.
 */
export function applyUserPasswordReset(
  user: User,
  newPassword: string,
  timestampIso: string
): User {
  return {
    ...user,
    password: newPassword.trim(),
    passwordUpdatedAt: timestampIso,
  };
}

/**
 * Enforces strict tenant isolation for shop visibility:
 * - Super Admin (`platform_admin`) can inspect all registered shops across the platform.
 * - A Business Owner only sees shops registered under their own business (`businessId`).
 * - Staff members (`shop_manager`, `cashier`) only see shops assigned to them within their own business.
 */
export function getVisibleShopsForActor(
  actor: User,
  allShops: Shop[],
  allBusinesses?: Business[]
): Shop[] {
  if (actor.role === 'platform_admin') {
    return allShops;
  }
  if (actor.role === 'business_owner') {
    return allShops.filter((s) => s.businessId === actor.businessId);
  }
  return getAuthorizedShopsForUser(actor, allShops, allBusinesses);
}

/**
 * Generates a unique, stable Business ID (never using the business name as the database ID
 * and never matching the quarantined legacy pre-Firebase `biz-00XX-xxxx` pattern).
 */
export function generateUniqueBusinessId(existingBusinesses: Business[]): string {
  const existingIds = new Set(existingBusinesses.map((b) => b.id));
  let seq = existingBusinesses.length + 1;
  let candidate = `biz-live-${String(seq).padStart(4, '0')}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  while (existingIds.has(candidate)) {
    seq += 1;
    candidate = `biz-live-${String(seq).padStart(4, '0')}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
  }
  return candidate;
}

/**
 * Generates a unique, stable Shop ID associated with a business
 * (never matching the quarantined legacy pre-Firebase `shop-00XX-xxxx` pattern).
 */
export function generateUniqueShopId(existingShops: Shop[]): string {
  const existingIds = new Set(existingShops.map((s) => s.id));
  let seq = existingShops.length + 1;
  let candidate = `shop-live-${String(seq).padStart(4, '0')}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  while (existingIds.has(candidate)) {
    seq += 1;
    candidate = `shop-live-${String(seq).padStart(4, '0')}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
  }
  return candidate;
}

/**
 * Generates a unique, stable local/demo User ID (`usr-000X-xxxx`).
 * Note: Synthetic client user IDs must never be passed as Firebase Authentication UIDs.
 */
export function generateUniqueUserId(existingUsers: User[]): string {
  const existingIds = new Set(existingUsers.map((u) => u.id));
  let seq = existingUsers.length + 1;
  let candidate = `usr-${String(seq).padStart(4, '0')}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  while (existingIds.has(candidate)) {
    seq += 1;
    candidate = `usr-${String(seq).padStart(4, '0')}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
  }
  return candidate;
}

/**
 * Returns true if the given ID matches the synthetic client-generated user ID pattern
 * (`usr-000X-xxxx`) produced by `generateUniqueUserId`. Synthetic IDs must never be
 * passed to Cloud Functions as Firebase Authentication UIDs.
 */
export function isSyntheticClientUserId(uid?: string | null): boolean {
  if (!uid || typeof uid !== 'string') return false;
  const clean = uid.trim();
  return (
    /^usr-\d{4}-[a-z0-9]{4}$/i.test(clean) ||
    /^usr-live-owner-/i.test(clean)
  );
}

export function isSyntheticOwnerUserId(uid?: string | null): boolean {
  if (!uid || typeof uid !== 'string') return true;
  const clean = uid.trim();
  if (!clean) return true;
  return (
    /^usr-\d{4}-[a-z0-9]{4}$/i.test(clean) ||
    /^usr-live-owner-/i.test(clean) ||
    /^usr-owner-\d+/i.test(clean) ||
    /^usr-staff-/i.test(clean) ||
    /^pending-owner-/i.test(clean) ||
    /^synthetic-owner-/i.test(clean)
  );
}

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

export function resolveBusinessOwnerAuthState(
  owner: Pick<
    User,
    | 'id'
    | 'status'
    | 'authUidLinked'
    | 'emailVerified'
    | 'authDisabled'
    | 'passwordSetupStatus'
    | 'passwordSetupEmailSentAt'
  >,
  business?: Pick<Business, 'status' | 'ownerUserId'> | null
): BusinessOwnerAuthResolution {
  const isDisabled =
    owner.status === 'suspended' ||
    owner.authDisabled === true ||
    business?.status === 'suspended';

  const syntheticUid = isSyntheticOwnerUserId(owner.id);
  const mismatchedBusinessOwnerId = Boolean(
    business?.ownerUserId &&
      (isSyntheticOwnerUserId(business.ownerUserId) ||
        business.ownerUserId !== owner.id)
  );
  const requiresRepair =
    owner.authUidLinked === false || syntheticUid || mismatchedBusinessOwnerId;
  const isUidLinked = !requiresRepair;
  const isEmailVerified = owner.emailVerified === true;

  if (isDisabled) {
    return {
      primaryState: 'Account Disabled',
      label: 'Account Disabled',
      description: 'Business Owner account or parent business is currently suspended/disabled.',
      isUidLinked,
      isEmailVerified,
      requiresRepair,
      canRepairAuth: false,
      canSendPasswordSetupEmail: false,
      canResendPasswordSetupEmail: false,
      canSendPasswordSetup: false,
      canResendPasswordSetup: false,
      isDisabled: true,
      badges: ['Account Disabled'],
    };
  }

  if (requiresRepair) {
    return {
      primaryState: 'Auth Binding Required',
      label: 'Auth Binding Required',
      description: 'Owner record uses a synthetic placeholder ID or mismatched UID. Run Repair Owner Authentication to bind a real Firebase Authentication UID.',
      isUidLinked: false,
      isEmailVerified,
      requiresRepair: true,
      canRepairAuth: true,
      canSendPasswordSetupEmail: false,
      canResendPasswordSetupEmail: false,
      canSendPasswordSetup: false,
      canResendPasswordSetup: false,
      isDisabled: false,
      badges: ['Auth Binding Required'],
    };
  }

  // Never infer password completion or email verification from passwordSetupStatus,
  // passwordSetupEmailSentAt, or password reset completion alone.
  if (
    owner.passwordSetupStatus === 'password_established' &&
    !isEmailVerified
  ) {
    return {
      primaryState: 'Password Established / Email Verification Pending',
      label: 'Password Established / Email Verification Pending',
      description:
        'Business Owner has signed in with their established password, but Firebase Authentication emailVerified is still false. Email verification is required before live workspace access.',
      isUidLinked: true,
      isEmailVerified: false,
      requiresRepair: false,
      canRepairAuth: false,
      canSendPasswordSetupEmail: false,
      canResendPasswordSetupEmail: true,
      canSendPasswordSetup: false,
      canResendPasswordSetup: true,
      isDisabled: false,
      badges: [
        'Auth UID Linked',
        'Password Established / Email Verification Pending',
      ],
    };
  }

  const emailAlreadySent =
    owner.passwordSetupStatus === 'email_sent' ||
    (owner.passwordSetupStatus !== 'pending' &&
      Boolean(owner.passwordSetupEmailSentAt));

  if (emailAlreadySent && !isEmailVerified) {
    return {
      primaryState: 'Password Setup Email Sent',
      label: 'Password Setup Email Sent',
      description: 'Real Firebase Auth UID is linked and a password setup email has been dispatched. Awaiting owner sign-in and email verification.',
      isUidLinked: true,
      isEmailVerified: false,
      requiresRepair: false,
      canRepairAuth: false,
      canSendPasswordSetupEmail: false,
      canResendPasswordSetupEmail: true,
      canSendPasswordSetup: false,
      canResendPasswordSetup: true,
      isDisabled: false,
      badges: ['Auth UID Linked', 'Password Setup Email Sent'],
    };
  }

  if (isEmailVerified) {
    return {
      primaryState: 'Auth UID Linked',
      label: 'Auth UID Linked',
      description: 'Real Firebase Authentication UID is linked and verified.',
      isUidLinked: true,
      isEmailVerified: true,
      requiresRepair: false,
      canRepairAuth: false,
      canSendPasswordSetupEmail: false,
      canResendPasswordSetupEmail: true,
      canSendPasswordSetup: false,
      canResendPasswordSetup: true,
      isDisabled: false,
      badges: ['Auth UID Linked'],
    };
  }

  return {
    primaryState: 'Password Setup Pending',
    label: 'Password Setup Pending',
    description: 'Real Firebase Authentication UID is linked. Send a password setup email so the Business Owner can establish their password.',
    isUidLinked: true,
    isEmailVerified: false,
    requiresRepair: false,
    canRepairAuth: false,
    canSendPasswordSetupEmail: true,
    canResendPasswordSetupEmail: false,
    canSendPasswordSetup: true,
    canResendPasswordSetup: false,
    isDisabled: false,
    badges: ['Auth UID Linked', 'Password Setup Pending'],
  };
}

let globalIdSeq = 0;
export function getUniqueTimestampSuffix(): string {
  globalIdSeq = (globalIdSeq + 1) % 100000;
  const rand = Math.random().toString(36).slice(2, 7);
  return `${Date.now()}-${globalIdSeq}-${rand}`;
}

export function generateUniqueProductId(
  existingProducts: { id: string }[],
  shopId = 'shop-0001'
): string {
  const existingIds = new Set(existingProducts.map((p) => p.id));
  let candidate = `prod-${shopId}-${getUniqueTimestampSuffix()}`;
  while (existingIds.has(candidate)) {
    candidate = `prod-${shopId}-${getUniqueTimestampSuffix()}`;
  }
  return candidate;
}

export function generateUniqueCategoryId(
  existingCategories: { id: string }[],
  shopId = 'shop-0001'
): string {
  const existingIds = new Set(existingCategories.map((c) => c.id));
  let candidate = `cat-${shopId}-${getUniqueTimestampSuffix()}`;
  while (existingIds.has(candidate)) {
    candidate = `cat-${shopId}-${getUniqueTimestampSuffix()}`;
  }
  return candidate;
}

export function generateUniqueUnitId(
  existingUnits: { id: string }[],
  shopId = 'shop-0001'
): string {
  const existingIds = new Set(existingUnits.map((u) => u.id));
  let candidate = `unit-${shopId}-${getUniqueTimestampSuffix()}`;
  while (existingIds.has(candidate)) {
    candidate = `unit-${shopId}-${getUniqueTimestampSuffix()}`;
  }
  return candidate;
}

export function generateUniqueSupplierId(
  existingSuppliers: { id: string }[],
  shopId = 'shop-0001'
): string {
  const existingIds = new Set(existingSuppliers.map((s) => s.id));
  let candidate = `sup-${shopId}-${getUniqueTimestampSuffix()}`;
  while (existingIds.has(candidate)) {
    candidate = `sup-${shopId}-${getUniqueTimestampSuffix()}`;
  }
  return candidate;
}

export function generateUniqueInvoiceId(
  existingInvoices: { id: string }[],
  shopId = 'shop-0001'
): string {
  const existingIds = new Set(existingInvoices.map((i) => i.id));
  let candidate = `inv-${shopId}-${getUniqueTimestampSuffix()}`;
  while (existingIds.has(candidate)) {
    candidate = `inv-${shopId}-${getUniqueTimestampSuffix()}`;
  }
  return candidate;
}

export function generateUniqueDebtCustomerId(
  existingCustomers: { id: string }[],
  shopId = 'shop-0001'
): string {
  const existingIds = new Set(existingCustomers.map((c) => c.id));
  let candidate = `debt-cust-${shopId}-${getUniqueTimestampSuffix()}`;
  while (existingIds.has(candidate)) {
    candidate = `debt-cust-${shopId}-${getUniqueTimestampSuffix()}`;
  }
  return candidate;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export interface CreateBusinessInput {
  name: string;
  businessType: BusinessType;
  contactEmail: string;
  primaryPhone: string;
  headquartersAddress: string;
  ownerName: string;
  ownerEmail: string;
  ownerUid?: string;
  sendPasswordSetupEmail?: boolean;
  initialShopName?: string;
  initialShopCategory?: string;
  initialShopCity?: string;
  initialShopAddress?: string;
  notes?: string;
  legalName?: string;
  registrationNumber?: string;
  taxIdentificationNumber?: string;
  currencyCode?: string;
  currencySymbol?: string;
  defaultTaxRatePercent?: number;
  status?: 'active' | 'suspended';
}

/**
 * Validates business creation or editing by Platform Administrator.
 * Enforces required fields, valid email formats, unique business names,
 * and ensures each business has one primary owner not already assigned to another business.
 */
export function validateBusinessRegistrationInput(
  input: CreateBusinessInput,
  existingBusinesses: Business[],
  existingUsers: User[],
  editingBusinessId?: string
): { valid: boolean; error?: string } {
  const name = input.name.trim();
  const contactEmail = input.contactEmail.trim().toLowerCase();
  const phone = input.primaryPhone.trim();
  const address = input.headquartersAddress.trim();
  const ownerName = input.ownerName.trim();
  const ownerEmail = input.ownerEmail.trim().toLowerCase();

  if (!name || name.length < 2) {
    return { valid: false, error: 'Business name is required (at least 2 characters).' };
  }
  if (!input.businessType) {
    return { valid: false, error: 'Business type is required.' };
  }
  if (!contactEmail || !isValidEmail(contactEmail)) {
    return { valid: false, error: 'A valid business contact email address is required.' };
  }
  if (!phone || phone.length < 6) {
    return { valid: false, error: 'A valid business phone number is required.' };
  }
  if (!address || address.length < 4) {
    return { valid: false, error: 'Business address is required.' };
  }
  if (!ownerName || ownerName.length < 2) {
    return { valid: false, error: "Primary owner's full name is required." };
  }
  if (!ownerEmail || !isValidEmail(ownerEmail)) {
    return { valid: false, error: "A valid primary owner's email address is required." };
  }
  if (
    ownerEmail === 'smartnwokolo@gmail.com' ||
    ownerEmail === 'smart@smartmindconcept.com'
  ) {
    return {
      valid: false,
      error:
        'Platform Administrator email must remain separate from tenant Business Owner accounts.',
    };
  }

  const duplicateName = existingBusinesses.find(
    (b) =>
      b.id !== editingBusinessId &&
      b.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (duplicateName) {
    return {
      valid: false,
      error: `A business named "${name}" is already registered (ID: ${duplicateName.id}).`,
    };
  }

  // Prevent assigning a primary owner email that already owns or belongs to another business
  const conflictingBusinessOwner = existingBusinesses.find(
    (b) =>
      b.id !== editingBusinessId &&
      b.ownerEmail.trim().toLowerCase() === ownerEmail
  );
  if (conflictingBusinessOwner) {
    return {
      valid: false,
      error: `Owner email "${ownerEmail}" is already assigned as primary owner of "${conflictingBusinessOwner.name}".`,
    };
  }

  const conflictingUser = existingUsers.find(
    (u) =>
      u.email.trim().toLowerCase() === ownerEmail &&
      u.businessId !== editingBusinessId
  );
  if (conflictingUser) {
    return {
      valid: false,
      error: `Email "${ownerEmail}" is already registered to an account in another business or role.`,
    };
  }

  return { valid: true };
}

export interface CreateShopInput {
  name: string;
  address: string;
  phone: string;
  description?: string;
  category?: ShopCategory;
  locationCity?: string;
}

/**
 * Validates shop creation or update within a single business.
 */
export function validateShopRegistrationInput(
  input: CreateShopInput,
  businessShops: Shop[],
  editingShopId?: string
): { valid: boolean; error?: string } {
  const name = input.name.trim();
  const address = input.address.trim();
  const phone = input.phone.trim();

  if (!name || name.length < 2) {
    return { valid: false, error: 'Shop name is required.' };
  }
  if (!address || address.length < 4) {
    return { valid: false, error: 'Shop location or address is required.' };
  }
  if (!phone || phone.length < 6) {
    return { valid: false, error: 'Shop contact phone is required.' };
  }

  const duplicateShop = businessShops.find(
    (s) =>
      s.id !== editingShopId &&
      s.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (duplicateShop) {
    return {
      valid: false,
      error: `A shop named "${name}" already exists in this business (ID: ${duplicateShop.id}).`,
    };
  }

  return { valid: true };
}

export interface CreateStaffInput {
  fullName: string;
  email: string;
  role: UserRole | string;
  roleLabel?: string;
  customRoleId?: string;
  assignedShopIds: string[];
  permissions: PermissionKey[];
}

export const OWNER_ONLY_STAFF_PERMISSIONS = new Set<string>([
  'manage_business_settings',
  'manage_shops',
  'manage_staff',
  'view_business_reports',
]);

export const MANAGER_ONLY_STAFF_PERMISSIONS = new Set<string>([
  'manage_products',
  'manage_catalogue',
  'manage_inventory',
  'manage_categories',
  'adjust_inventory',
  'adjust_stock',
  'process_refunds',
  'process_returns',
  'void_sale',
  'view_shop_reports',
]);

export const ALLOWED_CASHIER_STAFF_PERMISSIONS = new Set<string>([
  'process_sales',
  'process_sale',
  'pos_checkout',
  'manage_invoices',
  'manage_debt_book',
  'manage_customers',
  'manage_customers_debt',
  'apply_discounts',
  'apply_discount',
]);

export const ALLOWED_SHOP_MANAGER_STAFF_PERMISSIONS = new Set<string>([
  ...ALLOWED_CASHIER_STAFF_PERMISSIONS,
  ...MANAGER_ONLY_STAFF_PERMISSIONS,
]);

export function isPermissionAllowedForStaffRole(
  role: UserRole | string,
  permission: PermissionKey | string
): boolean {
  if (typeof permission !== 'string') return false;
  if (OWNER_ONLY_STAFF_PERMISSIONS.has(permission)) return false;
  if (role === 'cashier') {
    return ALLOWED_CASHIER_STAFF_PERMISSIONS.has(permission);
  }
  if (role === 'shop_manager') {
    return ALLOWED_SHOP_MANAGER_STAFF_PERMISSIONS.has(permission);
  }
  return false;
}

/**
 * Validates creating or updating a staff member within a business.
 * Enforces single-business scoping for assigned shops, prevents duplicate emails,
 * and enforces strict role-specific permission boundaries for shop_manager and cashier.
 */
export function validateStaffRegistrationInput(
  input: CreateStaffInput,
  businessId: string,
  allUsers: User[],
  businessShops: Shop[],
  editingUserId?: string
): { valid: boolean; error?: string } {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();

  if (!fullName || fullName.length < 2) {
    return { valid: false, error: 'Staff full name is required.' };
  }
  if (!email || !isValidEmail(email)) {
    return { valid: false, error: 'A valid staff email address is required.' };
  }
  if (email === 'smartnwokolo@gmail.com') {
    return {
      valid: false,
      error: 'Platform Administrator identity (smartnwokolo@gmail.com) cannot be registered as tenant staff.',
    };
  }
  if (!input.role) {
    return {
      valid: false,
      error: 'Staff role is required.',
    };
  }
  if (input.role === 'platform_admin') {
    return {
      valid: false,
      error: 'Platform Administrator accounts cannot be created inside business staff directories.',
    };
  }
  if (input.role !== 'shop_manager' && input.role !== 'cashier') {
    return {
      valid: false,
      error: 'Staff role must be either "shop_manager" or "cashier".',
    };
  }

  if (!Array.isArray(input.assignedShopIds) || input.assignedShopIds.length === 0) {
    return {
      valid: false,
      error: 'At least one shop must be assigned to the staff member.',
    };
  }

  if (!Array.isArray(input.permissions) || input.permissions.length === 0) {
    return {
      valid: false,
      error: 'At least one valid permission must be assigned to the staff member.',
    };
  }

  for (const perm of input.permissions) {
    if (typeof perm !== 'string') {
      return {
        valid: false,
        error: 'Each permission identifier must be a valid string.',
      };
    }
    if (OWNER_ONLY_STAFF_PERMISSIONS.has(perm)) {
      return {
        valid: false,
        error: `Staff accounts cannot be granted owner-only permission "${perm}".`,
      };
    }
    if (!ALLOWED_SHOP_MANAGER_STAFF_PERMISSIONS.has(perm)) {
      return {
        valid: false,
        error: `Unknown or unsupported staff permission "${perm}".`,
      };
    }
    if (input.role === 'cashier' && !ALLOWED_CASHIER_STAFF_PERMISSIONS.has(perm)) {
      return {
        valid: false,
        error: `Cashier accounts cannot be granted elevated manager or inventory permission "${perm}".`,
      };
    }
  }

  const duplicateEmail = allUsers.find(
    (u) =>
      u.id !== editingUserId &&
      u.email.trim().toLowerCase() === email
  );
  if (duplicateEmail) {
    return {
      valid: false,
      error: `Email "${email}" is already assigned to another user (${duplicateEmail.fullName}).`,
    };
  }

  // Ensure every assigned shop belongs to this businessId
  const validShopIds = new Set(
    businessShops.filter((s) => s.businessId === businessId).map((s) => s.id)
  );
  for (const shopId of input.assignedShopIds) {
    if (!validShopIds.has(shopId)) {
      return {
        valid: false,
        error: `Shop ID "${shopId}" does not belong to business "${businessId}". Cross-business shop assignment is prohibited.`,
      };
    }
  }

  return { valid: true };
}

// ============================================================================
// CUSTOM STAFF ROLE MANAGEMENT CALCULATIONS & VALIDATION
// ============================================================================

export interface CreateCustomRoleInput {
  businessId: string;
  name: string;
  description: string;
  permissions: PermissionKey[];
}

export function validateCustomRoleInput(
  input: CreateCustomRoleInput,
  existingRoles: CustomRole[],
  editingRoleId?: string
): { valid: boolean; error?: string } {
  const name = input.name.trim();
  const description = input.description.trim();

  if (!name || name.length < 2) {
    return { valid: false, error: 'Role name is required (at least 2 characters).' };
  }
  if (!description || description.length < 3) {
    return { valid: false, error: 'Role description is required.' };
  }
  if (!input.permissions || input.permissions.length === 0) {
    return { valid: false, error: 'At least 1 permission must be assigned to this role.' };
  }

  const duplicate = existingRoles.find(
    (r) =>
      r.id !== editingRoleId &&
      (r.businessId === input.businessId || r.businessId === 'PLATFORM') &&
      r.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (duplicate) {
    return {
      valid: false,
      error: `A role named "${name}" already exists for this business or platform settings.`,
    };
  }

  return { valid: true };
}

export function generateUniqueRoleId(existingRoles: CustomRole[]): string {
  const existingIds = new Set(existingRoles.map((r) => r.id));
  let seq = existingRoles.length + 1;
  let candidate = `role-${String(seq).padStart(3, '0')}-${Math.random().toString(36).slice(2, 6)}`;
  while (existingIds.has(candidate)) {
    seq += 1;
    candidate = `role-${String(seq).padStart(3, '0')}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return candidate;
}

/**
 * Enforces strict shop isolation for products:
 * Only returns products belonging to the active shopId and businessId,
 * filtered by search query and categoryId.
 */
export function filterShopProducts(
  products: Product[],
  shopId: string,
  businessId: string,
  options?: {
    searchQuery?: string;
    categoryId?: string;
    onlyActive?: boolean;
  }
): Product[] {
  const query = (options?.searchQuery ?? '').trim().toLowerCase();
  const categoryId = options?.categoryId ?? 'all';
  const onlyActive = options?.onlyActive ?? false;

  return products.filter((p) => {
    if (p.shopId !== shopId || p.businessId !== businessId) return false;
    if (onlyActive && !p.isActive) return false;
    if (categoryId !== 'all' && p.categoryId !== categoryId) return false;
    if (!query) return true;

    return (
      p.name.toLowerCase().includes(query) ||
      p.sku.toLowerCase().includes(query) ||
      p.barcode.toLowerCase().includes(query) ||
      p.categoryName.toLowerCase().includes(query)
    );
  });
}

/**
 * Finds an active product by exact barcode or SKU within a specific shop.
 */
export function findProductByBarcodeOrSku(
  products: Product[],
  shopId: string,
  businessId: string,
  code: string
): Product | undefined {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return undefined;

  return products.find(
    (p) =>
      p.shopId === shopId &&
      p.businessId === businessId &&
      p.isActive &&
      (p.barcode.toLowerCase() === normalized || p.sku.toLowerCase() === normalized)
  );
}

/**
 * Calculates cart subtotal, discount, tax, and total with 2-decimal precision.
 */
export function calculateCartTotals(
  items: CartItem[],
  discountInput: number,
  discountMode: 'percent' | 'fixed',
  taxRatePercent: number
): CartCalculationResult {
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const uniqueLines = items.length;
  const rawSubtotal = items.reduce(
    (sum, item) => sum + item.product.sellingPrice * item.quantity,
    0
  );
  const subtotal = Math.round(rawSubtotal * 100) / 100;

  let rawDiscount = 0;
  if (discountInput > 0 && subtotal > 0) {
    if (discountMode === 'percent') {
      const clampedPercent = Math.min(Math.max(discountInput, 0), 100);
      rawDiscount = (subtotal * clampedPercent) / 100;
    } else {
      rawDiscount = Math.min(Math.max(discountInput, 0), subtotal);
    }
  }
  const discountAmount = Math.round(rawDiscount * 100) / 100;
  const netSubtotal = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);

  // Calculate taxable portion (excluding tax-exempt products proportionally)
  const taxableRaw = items.reduce((sum, item) => {
    if (item.product.taxExempt) return sum;
    return sum + item.product.sellingPrice * item.quantity;
  }, 0);

  const discountRatio = subtotal > 0 ? netSubtotal / subtotal : 0;
  const taxableAmount = Math.round(taxableRaw * discountRatio * 100) / 100;
  const safeTaxRate = Math.max(0, taxRatePercent);
  const taxAmount = Math.round(((taxableAmount * safeTaxRate) / 100) * 100) / 100;
  const totalAmount = Math.round((netSubtotal + taxAmount) * 100) / 100;

  return {
    itemCount,
    uniqueLines,
    subtotal,
    discountAmount,
    taxableAmount,
    taxAmount,
    totalAmount,
  };
}

/**
 * Validates demo login credentials.
 */
export function validateLoginInput(
  identifier: string,
  password: string
): { valid: boolean; error?: string } {
  const trimmedIdentifier = identifier.trim();
  if (!trimmedIdentifier) {
    return { valid: false, error: 'Please enter your username or email address.' };
  }
  if (trimmedIdentifier.length < 3) {
    return { valid: false, error: 'Username or email must be at least 3 characters.' };
  }
  if (!password || password.trim().length === 0) {
    return { valid: false, error: 'Please enter your demo password to continue.' };
  }
  if (password.trim().length < 4) {
    return { valid: false, error: 'Password must be at least 4 characters long.' };
  }
  return { valid: true };
}

export interface ProductFormInput {
  name: string;
  sku: string;
  barcode: string;
  categoryId: string;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  stockQuantity: number;
  reorderLevel: number;
}

/**
 * Validates product creation or edit input within a specific shop.
 */
export function validateProductInput(
  input: ProductFormInput,
  existingShopProducts: Product[],
  editingProductId?: string
): { valid: boolean; error?: string } {
  if (!input.name.trim()) {
    return { valid: false, error: 'Product name is required.' };
  }
  if (!input.sku.trim()) {
    return { valid: false, error: 'SKU code is required.' };
  }
  if (!input.barcode.trim()) {
    return { valid: false, error: 'Barcode is required.' };
  }
  if (!input.categoryId.trim()) {
    return { valid: false, error: 'Please select a product category.' };
  }
  if (Number.isNaN(input.costPrice) || input.costPrice < 0) {
    return { valid: false, error: 'Cost price must be zero or a positive amount.' };
  }
  if (Number.isNaN(input.sellingPrice) || input.sellingPrice <= 0) {
    return { valid: false, error: 'Selling price must be greater than zero.' };
  }
  if (Number.isNaN(input.stockQuantity) || input.stockQuantity < 0) {
    return { valid: false, error: 'Stock quantity cannot be negative.' };
  }
  if (Number.isNaN(input.reorderLevel) || input.reorderLevel < 0) {
    return { valid: false, error: 'Reorder alert level cannot be negative.' };
  }

  const duplicateSku = existingShopProducts.find(
    (p) =>
      p.id !== editingProductId &&
      p.sku.trim().toLowerCase() === input.sku.trim().toLowerCase()
  );
  if (duplicateSku) {
    return {
      valid: false,
      error: `SKU "${input.sku.trim()}" is already assigned to "${duplicateSku.name}" in this shop.`,
    };
  }

  const duplicateBarcode = existingShopProducts.find(
    (p) =>
      p.id !== editingProductId &&
      p.barcode.trim().toLowerCase() === input.barcode.trim().toLowerCase()
  );
  if (duplicateBarcode) {
    return {
      valid: false,
      error: `Barcode "${input.barcode.trim()}" is already used by "${duplicateBarcode.name}" in this shop.`,
    };
  }

  return { valid: true };
}

/**
 * Validates creation of a new product category within a specific shop.
 */
export function validateCategoryInput(
  name: string,
  existingShopCategories: ProductCategory[]
): { valid: boolean; error?: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, error: 'Category name is required.' };
  }
  const duplicate = existingShopCategories.find(
    (c) => c.name.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (duplicate) {
    return {
      valid: false,
      error: `Category "${trimmed}" already exists in this shop.`,
    };
  }
  return { valid: true };
}

/**
 * Validates creation of a new unit of measurement within a specific shop.
 */
export function validateUnitInput(
  name: string,
  existingShopUnits: UnitOfMeasurement[]
): { valid: boolean; error?: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, error: 'Unit of measurement name is required.' };
  }
  const duplicate = existingShopUnits.find(
    (u) => u.name.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (duplicate) {
    return {
      valid: false,
      error: `Unit "${trimmed}" already exists in this shop.`,
    };
  }
  return { valid: true };
}

/**
 * Computes updated product stock and creates a StockAdjustment record.
 */
export function applyStockAdjustment(
  product: Product,
  type: StockAdjustmentType,
  quantityInput: number,
  reason: string,
  user: User,
  timestampIso: string
): { updatedProduct: Product; adjustment: StockAdjustment } {
  const absQty = Math.abs(Math.round(quantityInput));
  let delta = absQty;

  if (type === 'sale_deduction' || type === 'damage_spoilage') {
    delta = -absQty;
  } else if (type === 'audit_correction') {
    delta = Math.round(quantityInput);
  } else {
    delta = absQty;
  }

  const previousQuantity = product.stockQuantity;
  const newQuantity = Math.max(0, previousQuantity + delta);
  const actualDelta = newQuantity - previousQuantity;

  const updatedProduct: Product = {
    ...product,
    stockQuantity: newQuantity,
    updatedAt: timestampIso,
  };

  const adjustment: StockAdjustment = {
    id: `adj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    shopId: product.shopId,
    businessId: product.businessId,
    productId: product.id,
    productName: product.name,
    productSku: product.sku,
    type,
    quantityDelta: actualDelta,
    previousQuantity,
    newQuantity,
    reason: reason.trim() || 'Manual stock adjustment (Demo)',
    performedByUserId: user.id,
    performedByName: user.fullName,
    createdAt: timestampIso,
    syncStatus: 'pending_local_queue',
  };

  return { updatedProduct, adjustment };
}

/**
 * Formats a StockAdjustmentType code into its human-readable section label:
 * Restock, Add Stock, Damage & Spoilage, or Return.
 */
export function formatAdjustmentTypeLabel(type: StockAdjustmentType): string {
  switch (type) {
    case 'restock':
      return 'Restock';
    case 'add_stock':
      return 'Add Stock';
    case 'damage_spoilage':
      return 'Damage & Spoilage';
    case 'return_in':
      return 'Return';
    case 'audit_correction':
      return 'Audit Correction';
    case 'sale_deduction':
      return 'Sale Deduction';
    default:
      return type;
  }
}

export interface StockAdjustmentFilters {
  searchQuery?: string;
  type?: 'all' | 'restock' | 'add_stock' | 'damage_spoilage' | 'return_in' | 'audit_correction';
  userId?: string;
  productId?: string;
}

/**
 * Filters operational stock adjustments:
 * - Excludes sales deductions (so adjustments are strictly on their own and not mixed with sales)
 * - Supports searching by products (name, SKU), users (operator name, user ID), reason, or category label
 * - Supports filtering by adjustment type (all, restock, add_stock, damage_spoilage, return_in)
 */
export function filterStockAdjustments(
  adjustments: StockAdjustment[],
  filters: StockAdjustmentFilters = {}
): StockAdjustment[] {
  return adjustments
    .filter((adj) => adj.type !== 'sale_deduction')
    .filter((adj) => {
      // Adjustment type filter (restock, add_stock, damage_spoilage, return_in)
      if (filters.type && filters.type !== 'all' && adj.type !== filters.type) {
        return false;
      }
      // User / Operator filter
      if (filters.userId && filters.userId !== 'all' && adj.performedByUserId !== filters.userId) {
        return false;
      }
      // Product filter
      if (filters.productId && filters.productId !== 'all' && adj.productId !== filters.productId) {
        return false;
      }
      // Product, User, Reason, or Category search query
      if (filters.searchQuery && filters.searchQuery.trim()) {
        const q = filters.searchQuery.trim().toLowerCase();
        const typeLabel = formatAdjustmentTypeLabel(adj.type).toLowerCase();
        const matchesProduct =
          adj.productName.toLowerCase().includes(q) ||
          adj.productSku.toLowerCase().includes(q);
        const matchesUser =
          adj.performedByName.toLowerCase().includes(q) ||
          adj.performedByUserId.toLowerCase().includes(q);
        const matchesReason = adj.reason.toLowerCase().includes(q);
        const matchesType = typeLabel.includes(q) || adj.type.toLowerCase().includes(q);
        if (!matchesProduct && !matchesUser && !matchesReason && !matchesType) {
          return false;
        }
      }
      return true;
    });
}

export interface ShopDashboardSummary {
  todaysSalesTotal: number;
  transactionCount: number;
  cashSalesTotal: number;
  transferAndOtherTotal: number;
  lowStockCount: number;
  outOfStockCount: number;
  pendingSyncCount: number;
  inventoryRetailValue: number;
  inventoryCostValue: number;
}

/**
 * Computes isolated dashboard metrics for a single shop.
 */
export function getShopDashboardMetrics(
  shop: Shop,
  products: Product[],
  sales: SaleTransaction[]
): ShopDashboardSummary {
  const shopProducts = products.filter(
    (p) => p.shopId === shop.id && p.businessId === shop.businessId
  );
  const shopSales = sales.filter(
    (s) =>
      s.shopId === shop.id &&
      s.businessId === shop.businessId &&
      s.status !== 'voided_demo' &&
      s.status !== 'refunded_demo'
  );

  const todaysSalesTotal =
    Math.round(shopSales.reduce((sum, s) => sum + s.totalAmount, 0) * 100) / 100;
  const transactionCount = shopSales.length;

  const cashSalesTotal =
    Math.round(
      shopSales
        .filter((s) => s.paymentMethod === 'cash')
        .reduce((sum, s) => sum + s.totalAmount, 0) * 100
    ) / 100;

  const transferAndOtherTotal =
    Math.round((todaysSalesTotal - cashSalesTotal) * 100) / 100;

  const lowStockCount = shopProducts.filter(
    (p) => p.isActive && p.stockQuantity <= p.reorderLevel
  ).length;

  const outOfStockCount = shopProducts.filter(
    (p) => p.isActive && p.stockQuantity === 0
  ).length;

  const unsyncedSalesCount = sales.filter(
    (s) =>
      s.shopId === shop.id &&
      s.businessId === shop.businessId &&
      s.syncStatus !== 'synced_demo'
  ).length;

  const pendingSyncCount = Math.max(shop.pendingSyncCount, unsyncedSalesCount);

  const inventoryRetailValue =
    Math.round(
      shopProducts.reduce((sum, p) => sum + p.sellingPrice * p.stockQuantity, 0) * 100
    ) / 100;

  const inventoryCostValue =
    Math.round(
      shopProducts.reduce((sum, p) => sum + p.costPrice * p.stockQuantity, 0) * 100
    ) / 100;

  return {
    todaysSalesTotal,
    transactionCount,
    cashSalesTotal,
    transferAndOtherTotal,
    lowStockCount,
    outOfStockCount,
    pendingSyncCount,
    inventoryRetailValue,
    inventoryCostValue,
  };
}

export const BASE_CURRENCY_CODE = 'NGN';
export const BASE_CURRENCY_SYMBOL = '₦';

export interface CurrencyOption {
  code: string;
  symbol: string;
  name: string;
  countryOrRegion: string;
  isBaseCurrency?: boolean;
}

export const SUPPORTED_CURRENCIES: CurrencyOption[] = [
  {
    code: 'NGN',
    symbol: '₦',
    name: 'Nigerian Naira',
    countryOrRegion: 'Nigeria',
    isBaseCurrency: true,
  },
  {
    code: 'USD',
    symbol: '$',
    name: 'US Dollar',
    countryOrRegion: 'United States',
  },
  {
    code: 'GBP',
    symbol: '£',
    name: 'British Pound Sterling',
    countryOrRegion: 'United Kingdom',
  },
  {
    code: 'EUR',
    symbol: '€',
    name: 'Euro',
    countryOrRegion: 'Eurozone',
  },
  {
    code: 'GHS',
    symbol: 'GH₵',
    name: 'Ghanaian Cedi',
    countryOrRegion: 'Ghana',
  },
  {
    code: 'KES',
    symbol: 'KSh',
    name: 'Kenyan Shilling',
    countryOrRegion: 'Kenya',
  },
  {
    code: 'ZAR',
    symbol: 'R',
    name: 'South African Rand',
    countryOrRegion: 'South Africa',
  },
  {
    code: 'XOF',
    symbol: 'CFA ',
    name: 'West African CFA Franc',
    countryOrRegion: 'WAEMU',
  },
  {
    code: 'CAD',
    symbol: 'CA$',
    name: 'Canadian Dollar',
    countryOrRegion: 'Canada',
  },
];

/**
 * Resolves a currency option by ISO code, defaulting to the Base Currency (Nigerian Naira — NGN / ₦).
 */
export function getCurrencyOptionByCode(code?: string): CurrencyOption {
  if (!code) return SUPPORTED_CURRENCIES[0];
  const normalized = code.trim().toUpperCase();
  return (
    SUPPORTED_CURRENCIES.find((c) => c.code === normalized) ??
    SUPPORTED_CURRENCIES[0]
  );
}

/**
 * Formats currency values consistently with tabular alignment.
 * Base currency defaults to Nigerian Naira (₦).
 */
export function formatCurrency(
  amount: number,
  symbol = BASE_CURRENCY_SYMBOL
): string {
  return `${symbol}${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export type SalesDateSortOrder =
  | 'date_desc'
  | 'date_asc'
  | 'amount_desc'
  | 'amount_asc';

export type SalesDateRangePreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'last_30_days'
  | 'last_month'
  | 'custom';

/**
 * Extracts the YYYY-MM-DD date string from a sale createdAt timestamp
 * (e.g. "2026-10-21 09:38 AM" or "2026-10-21T09:38:00Z" -> "2026-10-21").
 */
export function extractSaleDateYmd(createdAt: string): string {
  const trimmed = createdAt.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

/**
 * Parses a sale createdAt string ("YYYY-MM-DD HH:MM AM/PM" or ISO) into epoch milliseconds
 * for accurate chronological sorting.
 */
export function parseSaleTimestampMs(createdAt: string): number {
  const trimmed = createdAt.trim();
  const amPmMatch = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i
  );
  if (amPmMatch) {
    const year = parseInt(amPmMatch[1], 10);
    const month = parseInt(amPmMatch[2], 10) - 1;
    const day = parseInt(amPmMatch[3], 10);
    let hours = parseInt(amPmMatch[4], 10);
    const minutes = parseInt(amPmMatch[5], 10);
    const meridiem = amPmMatch[6].toUpperCase();

    if (meridiem === 'PM' && hours < 12) {
      hours += 12;
    } else if (meridiem === 'AM' && hours === 12) {
      hours = 0;
    }
    return Date.UTC(year, month, day, hours, minutes, 0);
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    return parsed;
  }

  const ymd = extractSaleDateYmd(trimmed);
  return ymd ? Date.parse(`${ymd}T00:00:00Z`) : 0;
}

function formatUtcYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Computes inclusive [startDate, endDate] (YYYY-MM-DD) bounds for a Sales History date preset.
 */
export function getDateRangeBoundsForPreset(
  preset: SalesDateRangePreset,
  referenceDateYmd?: string
): { startDate: string; endDate: string } {
  if (preset === 'all' || preset === 'custom') {
    return { startDate: '', endDate: '' };
  }

  const effectiveRefYmd = referenceDateYmd || getTodayYmd();
  const parts = effectiveRefYmd.split('-').map((n) => parseInt(n, 10));
  const refYear = parts[0] || new Date().getFullYear();
  const refMonthIndex = (parts[1] || new Date().getMonth() + 1) - 1;
  const refDay = parts[2] || new Date().getDate();
  const refDate = new Date(Date.UTC(refYear, refMonthIndex, refDay));

  if (preset === 'today') {
    const todayStr = formatUtcYmd(refDate);
    return { startDate: todayStr, endDate: todayStr };
  }

  if (preset === 'yesterday') {
    const yesterday = new Date(refDate.getTime() - 1 * 24 * 60 * 60 * 1000);
    const yesterdayStr = formatUtcYmd(yesterday);
    return { startDate: yesterdayStr, endDate: yesterdayStr };
  }

  if (preset === 'this_week') {
    const weekStart = new Date(refDate.getTime() - 6 * 24 * 60 * 60 * 1000);
    return {
      startDate: formatUtcYmd(weekStart),
      endDate: formatUtcYmd(refDate),
    };
  }

  if (preset === 'last_30_days') {
    const thirtyDaysAgo = new Date(
      refDate.getTime() - 29 * 24 * 60 * 60 * 1000
    );
    return {
      startDate: formatUtcYmd(thirtyDaysAgo),
      endDate: formatUtcYmd(refDate),
    };
  }

  if (preset === 'this_month') {
    const monthStart = new Date(Date.UTC(refYear, refMonthIndex, 1));
    const monthEnd = new Date(Date.UTC(refYear, refMonthIndex + 1, 0));
    return {
      startDate: formatUtcYmd(monthStart),
      endDate: formatUtcYmd(monthEnd),
    };
  }

  if (preset === 'last_month') {
    const prevMonthStart = new Date(Date.UTC(refYear, refMonthIndex - 1, 1));
    const prevMonthEnd = new Date(Date.UTC(refYear, refMonthIndex, 0));
    return {
      startDate: formatUtcYmd(prevMonthStart),
      endDate: formatUtcYmd(prevMonthEnd),
    };
  }

  return { startDate: '', endDate: '' };
}

export interface SalesHistoryFilterOptions {
  searchQuery?: string;
  paymentFilter?: 'all' | SaleTransaction['paymentMethod'];
  paymentMethod?: 'all' | SaleTransaction['paymentMethod'];
  statusFilter?: 'all' | SaleTransaction['status'];
  userId?: string;
  startDate?: string;
  endDate?: string;
  sortOrder?: SalesDateSortOrder;
}

export interface SalesUserOption {
  id: string;
  fullName: string;
  roleLabel?: string;
}

/**
 * Returns a deduplicated list of users/staff who are assigned to the shop or have recorded sales in the shop.
 */
export function getShopSalesUsers(
  shopSales: SaleTransaction[],
  users: User[] = [],
  shopId?: string,
  businessId?: string
): SalesUserOption[] {
  const map = new Map<string, SalesUserOption>();

  users.forEach((u) => {
    if (u.role === 'platform_admin') return;
    if (businessId && u.businessId !== businessId) return;
    const isOwner = u.role === 'business_owner';
    const isAssigned = !shopId || isOwner || u.assignedShopIds.includes(shopId);
    if (isAssigned) {
      map.set(u.id, {
        id: u.id,
        fullName: u.fullName,
        roleLabel:
          u.role === 'business_owner'
            ? 'Business Owner'
            : u.role === 'shop_manager'
            ? 'Shop Manager'
            : 'Cashier',
      });
    }
  });

  shopSales.forEach((sale) => {
    if (sale.cashierUserId && !map.has(sale.cashierUserId)) {
      map.set(sale.cashierUserId, {
        id: sale.cashierUserId,
        fullName: sale.cashierName,
      });
    }
  });

  return Array.from(map.values());
}

/**
 * Filters shop sales by user/cashier (userId), inclusive date range (startDate..endDate),
 * payment method, status, and search query, then sorts by date or amount.
 */
export function filterAndSortSalesHistory(
  sales: SaleTransaction[],
  options: SalesHistoryFilterOptions = {}
): SaleTransaction[] {
  const {
    searchQuery = '',
    paymentFilter: directPaymentFilter,
    paymentMethod,
    statusFilter = 'all',
    userId = 'all',
    startDate = '',
    endDate = '',
    sortOrder = 'date_desc',
  } = options;
  const paymentFilter = directPaymentFilter ?? paymentMethod ?? 'all';

  const trimmedStart = startDate.trim();
  const trimmedEnd = endDate.trim();
  const hasBothBounds = Boolean(trimmedStart && trimmedEnd);
  const effectiveStart =
    hasBothBounds && trimmedStart > trimmedEnd ? trimmedEnd : trimmedStart;
  const effectiveEnd =
    hasBothBounds && trimmedStart > trimmedEnd ? trimmedStart : trimmedEnd;

  const q = searchQuery.trim().toLowerCase();
  const trimmedUserId = userId.trim();

  const filtered = sales.filter((sale) => {
    if (
      trimmedUserId &&
      trimmedUserId !== 'all' &&
      sale.cashierUserId !== trimmedUserId &&
      sale.cashierName.toLowerCase() !== trimmedUserId.toLowerCase()
    ) {
      return false;
    }
    if (paymentFilter !== 'all' && sale.paymentMethod !== paymentFilter) {
      return false;
    }
    if (statusFilter !== 'all' && sale.status !== statusFilter) {
      return false;
    }

    const saleYmd = extractSaleDateYmd(sale.createdAt);
    if (effectiveStart && (!saleYmd || saleYmd < effectiveStart)) {
      return false;
    }
    if (effectiveEnd && (!saleYmd || saleYmd > effectiveEnd)) {
      return false;
    }

    if (!q) return true;

    const matchesReceipt = sale.receiptNumber.toLowerCase().includes(q);
    const matchesCashier = sale.cashierName.toLowerCase().includes(q);
    const matchesDate = sale.createdAt.toLowerCase().includes(q);
    const matchesItem = sale.items.some(
      (item) =>
        item.productName.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q)
    );
    return matchesReceipt || matchesCashier || matchesDate || matchesItem;
  });

  return [...filtered].sort((a, b) => {
    if (sortOrder === 'amount_desc') {
      return b.totalAmount - a.totalAmount;
    }
    if (sortOrder === 'amount_asc') {
      return a.totalAmount - b.totalAmount;
    }
    const timeA = parseSaleTimestampMs(a.createdAt);
    const timeB = parseSaleTimestampMs(b.createdAt);
    if (timeA !== timeB) {
      return sortOrder === 'date_asc' ? timeA - timeB : timeB - timeA;
    }
    return sortOrder === 'date_asc'
      ? a.receiptNumber.localeCompare(b.receiptNumber)
      : b.receiptNumber.localeCompare(a.receiptNumber);
  });
}

const REPORT_MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Formats a YYYY-MM-DD date string into DD-MMM-YYYY (e.g., "2026-10-23" -> "23-Oct-2026")
 * matching the Sales Report header specification.
 */
export function formatYmdToReportDmy(ymd: string): string {
  const trimmed = ymd.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return trimmed || 'N/A';
  const year = match[1];
  const monthIdx = parseInt(match[2], 10) - 1;
  const day = match[3];
  const monthLabel = REPORT_MONTH_NAMES[monthIdx] || match[2];
  return `${day}-${monthLabel}-${year}`;
}

/**
 * Formats the report date range in "DD-MMM-YYYY - DD-MMM-YYYY" format (e.g. "23-Oct-2026 - 23-Oct-2026").
 */
export function formatReportDateRangeDmy(
  sales: SaleTransaction[],
  startDate?: string,
  endDate?: string,
  fallbackYmd?: string
): string {
  const s = (startDate || '').trim();
  const e = (endDate || '').trim();
  const today = fallbackYmd || getTodayYmd();

  if (s && e) {
    const from = s <= e ? s : e;
    const to = s <= e ? e : s;
    return `${formatYmdToReportDmy(from)} - ${formatYmdToReportDmy(to)}`;
  }
  if (s) {
    return `${formatYmdToReportDmy(s)} - ${formatYmdToReportDmy(today)}`;
  }
  if (e) {
    return `${formatYmdToReportDmy(e)} - ${formatYmdToReportDmy(e)}`;
  }

  const dates = sales
    .map((sale) => extractSaleDateYmd(sale.createdAt))
    .filter(Boolean)
    .sort();

  if (dates.length > 0) {
    return `${formatYmdToReportDmy(dates[0])} - ${formatYmdToReportDmy(
      dates[dates.length - 1]
    )}`;
  }

  const dmy = formatYmdToReportDmy(today);
  return `${dmy} - ${dmy}`;
}

/**
 * Maps payment method code to concise report label ("Transfer", "Pos", "Cash", "Credit", "Split").
 */
export function formatShortPaymentMethodLabel(pm: string): string {
  switch (pm) {
    case 'bank_transfer':
      return 'Transfer';
    case 'pos_card':
      return 'Pos';
    case 'cash':
      return 'Cash';
    case 'credit':
      return 'Credit';
    case 'split_payment':
      return 'Split';
    default:
      return pm.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export interface SalesSummaryStaffRow {
  index: number;
  dateTime: string;
  productName: string;
  productType: string;
  quantity: number;
  amount: number;
  paymentMethod: string;
  staffId: string;
  staffName: string;
  receiptCount: number;
}

export interface SalesSummaryReportData {
  transferTotal: number;
  posTotal: number;
  cashTotal: number;
  creditSalesTotal: number;
  splitTotal: number;
  totalSales: number;
  vatCollected: number;
  outstandingCredit: number;
  totalRefunds: number;
  totalQuantity: number;
  totalReceiptsCount: number;
  staffRows: SalesSummaryStaffRow[];
}

/**
 * Builds the non-itemized Sales Summary Report data matching the reference Sales Report sample:
 * - Payment Method Breakdown (Transfer, Pos, Cash, etc.)
 * - Summary Totals (Total Sales, VAT Collected, Outstanding Credit, Total Refunds)
 * - Staff-aggregated rows where Date & Time, Product Name, and Product Type are "--"
 *   and Quantity, Amount, Payment Methods, and Staff are summarized per staff member.
 */
export function buildSalesSummaryReportData(
  sales: SaleTransaction[],
  options?: { outstandingCreditFallback?: number }
): SalesSummaryReportData {
  const activeSales = sales.filter(
    (s) => s.status !== 'voided_demo' && s.status !== 'refunded_demo'
  );
  const refundedSales = sales.filter((s) => s.status === 'refunded_demo');

  const round2 = (n: number) => Math.round(n * 100) / 100;

  const transferTotal = round2(
    activeSales
      .filter((s) => s.paymentMethod === 'bank_transfer')
      .reduce((sum, s) => sum + s.totalAmount, 0)
  );
  const posTotal = round2(
    activeSales
      .filter((s) => s.paymentMethod === 'pos_card')
      .reduce((sum, s) => sum + s.totalAmount, 0)
  );
  const cashTotal = round2(
    activeSales
      .filter((s) => s.paymentMethod === 'cash')
      .reduce((sum, s) => sum + s.totalAmount, 0)
  );
  const creditSalesTotal = round2(
    activeSales
      .filter((s) => s.paymentMethod === 'credit')
      .reduce((sum, s) => sum + s.totalAmount, 0)
  );
  const splitTotal = round2(
    activeSales
      .filter((s) => s.paymentMethod === 'split_payment')
      .reduce((sum, s) => sum + s.totalAmount, 0)
  );

  const totalSales = round2(
    activeSales.reduce((sum, s) => sum + s.totalAmount, 0)
  );
  const vatCollected = round2(
    activeSales.reduce((sum, s) => sum + (s.taxAmount || 0), 0)
  );
  const totalRefunds = round2(
    refundedSales.reduce((sum, s) => sum + s.totalAmount, 0)
  );

  const outstandingCredit =
    creditSalesTotal > 0
      ? creditSalesTotal
      : round2(options?.outstandingCreditFallback ?? 0);

  // Aggregate by staff member without listing individual items
  const staffMap = new Map<
    string,
    {
      staffId: string;
      staffName: string;
      quantity: number;
      amount: number;
      methods: string[];
      receiptCount: number;
    }
  >();

  activeSales.forEach((sale) => {
    const key = sale.cashierUserId || sale.cashierName || 'staff';
    const saleQty = sale.items.reduce((sum, it) => sum + it.quantity, 0);
    const shortPm = formatShortPaymentMethodLabel(sale.paymentMethod);

    const existing = staffMap.get(key);
    if (existing) {
      existing.quantity += saleQty;
      existing.amount = round2(existing.amount + sale.totalAmount);
      existing.receiptCount += 1;
      if (!existing.methods.includes(shortPm)) {
        existing.methods.push(shortPm);
      }
    } else {
      staffMap.set(key, {
        staffId: sale.cashierUserId || key,
        staffName: sale.cashierName || 'Staff',
        quantity: saleQty,
        amount: round2(sale.totalAmount),
        methods: [shortPm],
        receiptCount: 1,
      });
    }
  });

  const staffRows: SalesSummaryStaffRow[] = Array.from(staffMap.values()).map(
    (entry, idx) => ({
      index: idx + 1,
      dateTime: '--',
      productName: '--',
      productType: '--',
      quantity: entry.quantity,
      amount: entry.amount,
      paymentMethod: entry.methods.join(', '),
      staffId: entry.staffId,
      staffName: entry.staffName,
      receiptCount: entry.receiptCount,
    })
  );

  const totalQuantity = staffRows.reduce((sum, r) => sum + r.quantity, 0);

  return {
    transferTotal,
    posTotal,
    cashTotal,
    creditSalesTotal,
    splitTotal,
    totalSales,
    vatCollected,
    outstandingCredit,
    totalRefunds,
    totalQuantity,
    totalReceiptsCount: activeSales.length,
    staffRows,
  };
}

export interface PosCustomerTab {
  id: string;
  tabNumber: number;
  label: string;
  customerNote: string;
  cart: CartItem[];
  discountInput: string;
  discountMode: 'percent' | 'fixed';
  status: 'billing' | 'awaiting_payment';
  pendingPaymentMethod: PaymentMethod | null;
  amountTenderedInput: string;
  paymentReference: string;
  selectedCreditCustomerId?: string | null;
  createdAt: string;
}

/**
 * Creates a new isolated POS customer tab with sequential numbering so a cashier
 * can attend to multiple customers concurrently while another customer is making payment.
 */
export function createPosCustomerTab(
  existingTabs: PosCustomerTab[],
  customLabel?: string
): PosCustomerTab {
  const maxNumber = existingTabs.reduce(
    (max, tab) => Math.max(max, tab.tabNumber || 0),
    0
  );
  const nextNumber = maxNumber + 1;
  const label =
    customLabel && customLabel.trim()
      ? customLabel.trim()
      : `Customer #${nextNumber}`;

  const now = new Date();
  const hours = now.getHours();
  const mins = String(now.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hr12 = hours % 12 || 12;

  return {
    id: `pos-tab-${nextNumber}-${Math.random().toString(36).slice(2, 7)}`,
    tabNumber: nextNumber,
    label,
    customerNote: '',
    cart: [],
    discountInput: '0',
    discountMode: 'percent',
    status: 'billing',
    pendingPaymentMethod: null,
    amountTenderedInput: '',
    paymentReference: '',
    selectedCreditCustomerId: null,
    createdAt: `${hr12}:${mins} ${ampm}`,
  };
}

/**
 * Closes a POS customer tab and resolves the next active tab ID.
 * Always guarantees at least one clean customer tab remains open.
 */
export function closePosCustomerTab(
  tabs: PosCustomerTab[],
  tabIdToClose: string,
  activeTabId: string
): { tabs: PosCustomerTab[]; activeTabId: string } {
  const closeIndex = tabs.findIndex((t) => t.id === tabIdToClose);
  if (closeIndex === -1) {
    return {
      tabs,
      activeTabId: tabs.some((t) => t.id === activeTabId)
        ? activeTabId
        : tabs[0]?.id ?? '',
    };
  }

  const remaining = tabs.filter((t) => t.id !== tabIdToClose);
  if (remaining.length === 0) {
    const freshTab = createPosCustomerTab([]);
    return {
      tabs: [freshTab],
      activeTabId: freshTab.id,
    };
  }

  if (activeTabId !== tabIdToClose) {
    return {
      tabs: remaining,
      activeTabId,
    };
  }

  const fallbackIndex = Math.min(closeIndex, remaining.length - 1);
  return {
    tabs: remaining,
    activeTabId: remaining[fallbackIndex].id,
  };
}

/**
 * Calculates how many units of each product are currently held in other open POS tabs
 * (excluding the specified tabId if provided).
 */
export function getReservedStockAcrossTabs(
  tabs: PosCustomerTab[],
  excludeTabId?: string
): Record<string, number> {
  const reserved: Record<string, number> = {};
  for (const tab of tabs) {
    if (excludeTabId && tab.id === excludeTabId) continue;
    for (const item of tab.cart) {
      reserved[item.product.id] =
        (reserved[item.product.id] || 0) + item.quantity;
    }
  }
  return reserved;
}

export interface CreateDebtCustomerInput {
  fullName: string;
  phone: string;
  creditLimitEnabled: boolean;
  creditLimitAmount: number;
  notes?: string;
}

/**
 * Validates customer registration for the shop Debt Book.
 * Requires customer full name, phone number, and if the credit limit toggle is enabled,
 * a positive credit limit amount.
 */
export function validateDebtCustomerInput(
  input: CreateDebtCustomerInput,
  existingShopCustomers: DebtCustomer[],
  editingCustomerId?: string
): { valid: boolean; error?: string } {
  const fullName = input.fullName.trim();
  const phone = input.phone.trim();

  if (!fullName || fullName.length < 2) {
    return {
      valid: false,
      error: 'Customer full name is required (at least 2 characters).',
    };
  }

  if (!phone || phone.length < 6) {
    return {
      valid: false,
      error: 'A valid customer phone number is required.',
    };
  }

  if (input.creditLimitEnabled) {
    if (
      typeof input.creditLimitAmount !== 'number' ||
      Number.isNaN(input.creditLimitAmount) ||
      input.creditLimitAmount <= 0
    ) {
      return {
        valid: false,
        error:
          'Please enter a valid credit limit amount greater than zero when credit limit is enabled.',
      };
    }
  }

  const normalizedPhone = phone.replace(/\s+/g, '').toLowerCase();
  const duplicatePhone = existingShopCustomers.find(
    (c) =>
      c.id !== editingCustomerId &&
      c.phone.replace(/\s+/g, '').toLowerCase() === normalizedPhone
  );
  if (duplicatePhone) {
    return {
      valid: false,
      error: `Phone number "${phone}" is already registered to "${duplicatePhone.fullName}" in this shop's Debt Book.`,
    };
  }

  return { valid: true };
}

/**
 * Filters Debt Book customers strictly scoped to the active shopId and businessId,
 * with optional search by customer name, phone, or notes.
 */
export function filterShopDebtCustomers(
  customers: DebtCustomer[],
  shopId: string,
  businessId: string,
  searchQuery = ''
): DebtCustomer[] {
  const q = searchQuery.trim().toLowerCase();
  return customers.filter((c) => {
    if (c.shopId !== shopId || c.businessId !== businessId) return false;
    if (!q) return true;
    return (
      c.fullName.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      (c.notes ?? '').toLowerCase().includes(q)
    );
  });
}

/**
 * Validates a POS credit sale against the selected Debt Book customer and their credit limit.
 */
export function validatePosCreditSale(
  customer: DebtCustomer | null | undefined,
  cartTotalAmount: number,
  currencySymbol = BASE_CURRENCY_SYMBOL
): {
  valid: boolean;
  error?: string;
  projectedBalance: number;
  remainingCreditLimit?: number;
} {
  if (!customer) {
    return {
      valid: false,
      error:
        'Please select a customer from the Debt Book or add a new customer to sell on credit.',
      projectedBalance: 0,
    };
  }

  const cleanTotal = Math.round(cartTotalAmount * 100) / 100;
  const projectedBalance =
    Math.round((customer.balanceRemaining + cleanTotal) * 100) / 100;

  const remainingCreditLimit =
    customer.creditLimitEnabled && customer.creditLimitAmount > 0
      ? Math.max(
          0,
          Math.round((customer.creditLimitAmount - customer.balanceRemaining) * 100) /
            100
        )
      : undefined;

  if (cleanTotal <= 0) {
    return {
      valid: false,
      error: 'Add at least one item to the cart before completing a credit sale.',
      projectedBalance,
      remainingCreditLimit,
    };
  }

  if (
    customer.creditLimitEnabled &&
    customer.creditLimitAmount > 0 &&
    projectedBalance > customer.creditLimitAmount
  ) {
    return {
      valid: false,
      error: `Credit limit exceeded for ${customer.fullName}! Credit limit is ${formatCurrency(
        customer.creditLimitAmount,
        currencySymbol
      )} and projected balance would be ${formatCurrency(
        projectedBalance,
        currencySymbol
      )}.`,
      projectedBalance,
      remainingCreditLimit,
    };
  }

  return {
    valid: true,
    projectedBalance,
    remainingCreditLimit,
  };
}

export interface DebtBookSummaryMetrics {
  totalCredit: number;
  amountPaid: number;
  balanceRemaining: number;
  customerCount: number;
  customersWithActiveDebtCount: number;
  customersWithCreditLimitCount: number;
  creditTransactionsCount: number;
  depositTransactionsCount: number;
}

/**
 * Computes shop-isolated Debt Book summary metrics across registered customers and credit/deposit transactions.
 */
export function calculateDebtBookSummary(
  customers: DebtCustomer[],
  transactions: DebtTransaction[],
  shopId: string,
  businessId: string
): DebtBookSummaryMetrics {
  const shopCustomers = customers.filter(
    (c) => c.shopId === shopId && c.businessId === businessId
  );
  const shopTransactions = transactions.filter(
    (t) => t.shopId === shopId && t.businessId === businessId
  );

  const totalCredit =
    Math.round(
      shopCustomers.reduce((sum, c) => sum + c.totalCredit, 0) * 100
    ) / 100;
  const amountPaid =
    Math.round(
      shopCustomers.reduce((sum, c) => sum + c.amountPaid, 0) * 100
    ) / 100;
  const balanceRemaining =
    Math.round(
      shopCustomers.reduce((sum, c) => sum + c.balanceRemaining, 0) * 100
    ) / 100;

  const customersWithActiveDebtCount = shopCustomers.filter(
    (c) => c.balanceRemaining > 0
  ).length;
  const customersWithCreditLimitCount = shopCustomers.filter(
    (c) => c.creditLimitEnabled && c.creditLimitAmount > 0
  ).length;

  const creditTransactionsCount = shopTransactions.filter(
    (t) => t.type === 'credit'
  ).length;
  const depositTransactionsCount = shopTransactions.filter(
    (t) => t.type === 'deposit'
  ).length;

  return {
    totalCredit,
    amountPaid,
    balanceRemaining,
    customerCount: shopCustomers.length,
    customersWithActiveDebtCount,
    customersWithCreditLimitCount,
    creditTransactionsCount,
    depositTransactionsCount,
  };
}

/**
 * Applies a credit or deposit transaction to a DebtCustomer record, computing updated
 * Total Credit, Amount Paid, Balance Remaining, and checking credit limit status.
 */
export function applyDebtTransaction(
  customer: DebtCustomer,
  type: DebtTransactionType,
  amountInput: number,
  options: {
    paymentMethod?: PaymentMethod;
    reference?: string;
    notes?: string;
    user: User;
    timestampIso: string;
  }
): {
  updatedCustomer: DebtCustomer;
  transaction: DebtTransaction;
  exceedsCreditLimit: boolean;
} {
  const cleanAmount = Math.max(0, Math.round(amountInput * 100) / 100);
  const nextTotalCredit =
    type === 'credit'
      ? Math.round((customer.totalCredit + cleanAmount) * 100) / 100
      : customer.totalCredit;
  const nextAmountPaid =
    type === 'deposit'
      ? Math.round((customer.amountPaid + cleanAmount) * 100) / 100
      : customer.amountPaid;
  const nextBalanceRemaining =
    Math.round((nextTotalCredit - nextAmountPaid) * 100) / 100;

  const exceedsCreditLimit =
    type === 'credit' &&
    customer.creditLimitEnabled &&
    customer.creditLimitAmount > 0 &&
    nextBalanceRemaining > customer.creditLimitAmount;

  const updatedCustomer: DebtCustomer = {
    ...customer,
    totalCredit: nextTotalCredit,
    amountPaid: nextAmountPaid,
    balanceRemaining: nextBalanceRemaining,
    updatedAt: options.timestampIso,
  };

  const prefix = type === 'credit' ? 'CRD' : 'DEP';
  const defaultRef = `${prefix}-${Date.now().toString().slice(-6)}`;

  const transaction: DebtTransaction = {
    id: `debt-tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    shopId: customer.shopId,
    businessId: customer.businessId,
    customerId: customer.id,
    customerName: customer.fullName,
    customerPhone: customer.phone,
    type,
    amount: cleanAmount,
    paymentMethod: options.paymentMethod,
    reference: options.reference?.trim() || defaultRef,
    notes:
      options.notes?.trim() ||
      (type === 'credit'
        ? 'Credit sale / goods taken on credit'
        : 'Customer deposit / debt repayment'),
    recordedByUserId: options.user.id,
    recordedByName: options.user.fullName,
    createdAt: options.timestampIso,
  };

  return {
    updatedCustomer,
    transaction,
    exceedsCreditLimit,
  };
}

/**
 * Computes today's YYYY-MM-DD date string in local time for POS session draft tracking.
 */
export function getTodayYmd(overrideDate?: Date): string {
  const d = overrideDate ?? new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns the storage key for a specific user and shop POS draft session.
 */
export function getPosDraftStorageKey(userId: string, shopId: string): string {
  return `smartmind_pos_draft_${userId}_${shopId}`;
}

/**
 * Formats a Date object as "YYYY-MM-DD hh:mm AM/PM" using the current local time.
 */
export function formatPosTimestamp(dateOverride?: Date): string {
  const d = dateOverride ?? new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  let hours = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const hrStr = String(hours).padStart(2, '0');
  return `${year}-${month}-${day} ${hrStr}:${mins} ${ampm}`;
}

export const DEFAULT_DETECTED_PRINTERS: PrinterDevice[] = [
  {
    id: 'prn-epson-tm88',
    name: 'EPSON TM-T88VI Thermal Receipt Printer',
    driverName: 'Epson Advanced Printer Driver 6 (APD6)',
    type: 'thermal',
    connection: 'usb',
    status: 'ready',
    paperFormats: ['80mm', '58mm'],
    isDefault: true,
  },
  {
    id: 'prn-pos80-usb',
    name: 'POS-80C Thermal Series (USB / Virtual COM)',
    driverName: 'Generic / Text Only POS Driver',
    type: 'thermal',
    connection: 'usb',
    status: 'ready',
    paperFormats: ['80mm'],
  },
  {
    id: 'prn-star-tsp143',
    name: 'Star Micronics TSP143III (Network LAN)',
    driverName: 'Star TSP100 futurePRNT Driver',
    type: 'thermal',
    connection: 'network',
    status: 'ready',
    paperFormats: ['80mm'],
    ipAddress: '192.168.1.180',
  },
  {
    id: 'prn-hp-laserjet',
    name: 'HP LaserJet Pro MFP M428fdw (Office A4)',
    driverName: 'HP PCL-6 Print Driver v4',
    type: 'laser_inkjet',
    connection: 'network',
    status: 'ready',
    paperFormats: ['a4'],
    ipAddress: '192.168.1.104',
  },
  {
    id: 'prn-canon-pixma',
    name: 'Canon PIXMA G3010 Color Series',
    driverName: 'Canon Inkjet Print Driver',
    type: 'laser_inkjet',
    connection: 'usb',
    status: 'ready',
    paperFormats: ['a4'],
  },
  {
    id: 'prn-ms-pdf',
    name: 'Microsoft Print to PDF (System Virtual)',
    driverName: 'Microsoft Print to PDF Spooler',
    type: 'virtual_pdf',
    connection: 'system_spooler',
    status: 'ready',
    paperFormats: ['a4', '80mm'],
  },
];

export const DEFAULT_SHOP_PRINTER_SETTINGS: ShopPrinterSettings = {
  defaultPrinterId: 'prn-epson-tm88',
  receiptPrinterMode: 'thermal',
  allowReceiptReprint: true,
  thermalPaperWidth: '80mm',
  autoCutReceipt: true,
  openCashDrawerOnPrint: true,
  printStoreLogo: true,
};

export function getShopPrinterSettings(
  shop?: Shop | null
): ShopPrinterSettings {
  if (!shop?.printerSettings) {
    return { ...DEFAULT_SHOP_PRINTER_SETTINGS };
  }
  return {
    ...DEFAULT_SHOP_PRINTER_SETTINGS,
    ...shop.printerSettings,
  };
}

export interface ReceiptReturnItemSummary {
  lineId: string;
  productId: string;
  productName: string;
  sku: string;
  unitPrice: number;
  originalQuantity: number;
  remainingQuantity: number;
  returnedQuantity: number;
  returnedValue: number;
}

export interface ReceiptReturnCalculation {
  updatedSale: SaleTransaction;
  returnedItems: ReceiptReturnItemSummary[];
  totalReturnedUnits: number;
  totalRefundAmount: number;
  newTotalAmount: number;
}

/**
 * Automatically finds a receipt in the shop's sales by receipt number.
 * Matches exact receipt numbers immediately, or unique suffix/partial matches (e.g., "0901" -> "VI-2026-0901").
 */
export function findReceiptByNumber(
  shopSales: SaleTransaction[],
  receiptNumberInput: string
): SaleTransaction | null {
  const q = receiptNumberInput.trim().toLowerCase();
  if (!q) return null;

  // 1. Exact match (case-insensitive)
  const exact = shopSales.find(
    (s) => s.receiptNumber.trim().toLowerCase() === q
  );
  if (exact) return exact;

  // 2. Normalized alphanumeric match (ignoring hyphens/spaces)
  const cleanQ = q.replace(/[^a-z0-9]/g, '');
  if (cleanQ.length >= 3) {
    const exactNormalized = shopSales.find(
      (s) => s.receiptNumber.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanQ
    );
    if (exactNormalized) return exactNormalized;

    // 3. Unique suffix match (e.g. typing "0901" or "901" when receipts end in "-0901")
    const suffixMatches = shopSales.filter((s) =>
      s.receiptNumber.toLowerCase().endsWith(q)
    );
    if (suffixMatches.length === 1) {
      return suffixMatches[0];
    }

    // 4. Unique substring match if at least 4 chars
    if (q.length >= 4) {
      const partialMatches = shopSales.filter((s) =>
        s.receiptNumber.toLowerCase().includes(q)
      );
      if (partialMatches.length === 1) {
        return partialMatches[0];
      }
    }
  }

  return null;
}

/**
 * Returns matching receipts for autocomplete suggestions while typing a receipt number.
 */
export function findMatchingReceipts(
  shopSales: SaleTransaction[],
  receiptNumberInput: string
): SaleTransaction[] {
  const q = receiptNumberInput.trim().toLowerCase();
  if (!q) return shopSales.slice(0, 8);
  return shopSales.filter(
    (s) =>
      s.receiptNumber.toLowerCase().includes(q) ||
      s.cashierName.toLowerCase().includes(q)
  );
}

/**
 * Calculates the updated receipt and returned item deltas when a user edits/reduces item quantities on a receipt.
 */
export function calculateReceiptReturnResult(
  sale: SaleTransaction,
  updatedQuantitiesByLineId: Record<string, number>
): ReceiptReturnCalculation {
  const returnedItems: ReceiptReturnItemSummary[] = [];
  let newSubtotal = 0;

  const updatedLines = sale.items.map((item) => {
    const rawNewQty = updatedQuantitiesByLineId[item.id];
    const remainingQuantity =
      rawNewQty !== undefined
        ? Math.max(0, Math.min(item.quantity, Math.floor(Number(rawNewQty) || 0)))
        : item.quantity;
    const returnedQuantity = Math.max(0, item.quantity - remainingQuantity);
    const returnedValue =
      Math.round(returnedQuantity * item.unitPrice * 100) / 100;
    const newLineTotal =
      Math.round(remainingQuantity * item.unitPrice * 100) / 100;

    newSubtotal = Math.round((newSubtotal + newLineTotal) * 100) / 100;

    if (returnedQuantity > 0) {
      returnedItems.push({
        lineId: item.id,
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        unitPrice: item.unitPrice,
        originalQuantity: item.quantity,
        remainingQuantity,
        returnedQuantity,
        returnedValue,
      });
    }

    return {
      ...item,
      quantity: remainingQuantity,
      lineTotal: newLineTotal,
    };
  });

  const totalReturnedUnits = returnedItems.reduce(
    (sum, r) => sum + r.returnedQuantity,
    0
  );

  const hasRemainingItems = updatedLines.some((l) => l.quantity > 0);
  const finalItems = hasRemainingItems
    ? updatedLines.filter((l) => l.quantity > 0)
    : updatedLines;

  let newDiscountAmount = 0;
  let newTaxAmount = 0;
  let newTotalAmount = 0;

  if (newSubtotal > 0) {
    const ratio = sale.subtotal > 0 ? newSubtotal / sale.subtotal : 1;
    newDiscountAmount =
      Math.round(Math.min(newSubtotal, sale.discountAmount * ratio) * 100) / 100;
    const netSubtotal = Math.max(
      0,
      Math.round((newSubtotal - newDiscountAmount) * 100) / 100
    );
    newTaxAmount =
      Math.round(((netSubtotal * sale.taxRatePercent) / 100) * 100) / 100;
    newTotalAmount = Math.round((netSubtotal + newTaxAmount) * 100) / 100;
  }

  const totalRefundAmount = Math.max(
    0,
    Math.round((sale.totalAmount - newTotalAmount) * 100) / 100
  );

  const updatedSale: SaleTransaction = {
    ...sale,
    items: finalItems,
    subtotal: newSubtotal,
    discountAmount: newDiscountAmount,
    taxAmount: newTaxAmount,
    totalAmount: newTotalAmount,
    status: hasRemainingItems ? sale.status : 'refunded_demo',
  };

  return {
    updatedSale,
    returnedItems,
    totalReturnedUnits,
    totalRefundAmount,
    newTotalAmount,
  };
}

// ============================================================================
// SUPPLIERS & SUPPLY RECORD CALCULATIONS
// ============================================================================

export interface CreateSupplierInput {
  fullName: string;
  phone: string;
  email: string;
  address: string;
}

export interface SupplyDraftItem {
  productId: string;
  productName: string;
  sku: string;
  barcode: string;
  unit: string;
  quantity: number;
  costPrice: number;
}

export function validateSupplierInput(
  input: CreateSupplierInput,
  existingSuppliers: Supplier[] = []
): string[] {
  const errors: string[] = [];
  const fullName = input.fullName.trim();
  const phone = input.phone.trim();
  const email = input.email.trim();

  if (!fullName) {
    errors.push('Supplier full name is required.');
  }
  if (!phone) {
    errors.push('Supplier phone number is required.');
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Please enter a valid email address.');
  }

  const duplicate = existingSuppliers.some(
    (s) =>
      s.fullName.trim().toLowerCase() === fullName.toLowerCase() &&
      s.phone.trim() === phone
  );
  if (duplicate) {
    errors.push('A supplier with this name and phone number already exists in this shop.');
  }

  return errors;
}

export function filterProductsForSupplySearch(
  products: Product[],
  query: string
): Product[] {
  const q = query.trim().toLowerCase();
  if (!q) return products;
  return products.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.barcode.toLowerCase().includes(q) ||
      p.categoryName.toLowerCase().includes(q)
  );
}

export function applySupplierSupply(
  supplier: Supplier,
  draftItems: SupplyDraftItem[],
  amountPaidInput: number,
  options: {
    notes?: string;
    user: User;
    timestampIso: string;
  }
): {
  updatedSupplier: Supplier;
  supplyRecord: SupplierSupplyRecord;
} {
  const validItems: SupplierSupplyItem[] = draftItems
    .filter((item) => item.quantity > 0 && item.costPrice >= 0)
    .map((item, idx) => {
      const qty = Math.max(1, Math.floor(Number(item.quantity) || 0));
      const cost = Math.max(0, Math.round((Number(item.costPrice) || 0) * 100) / 100);
      const lineTotal = Math.round(qty * cost * 100) / 100;
      return {
        id: `sup-item-${Date.now()}-${idx}`,
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        barcode: item.barcode,
        unit: item.unit || 'Unit',
        quantity: qty,
        costPrice: cost,
        lineTotal,
      };
    });

  const totalQuantity = validItems.reduce((sum, i) => sum + i.quantity, 0);
  const supplyTotalAmount =
    Math.round(validItems.reduce((sum, i) => sum + i.lineTotal, 0) * 100) / 100;
  const clampedPaid = Math.max(
    0,
    Math.min(supplyTotalAmount, Math.round((Number(amountPaidInput) || 0) * 100) / 100)
  );
  const supplyBalanceRemaining = Math.max(
    0,
    Math.round((supplyTotalAmount - clampedPaid) * 100) / 100
  );

  const nextTotalSupplies = supplier.totalSupplies + 1;
  const nextTotalAmount =
    Math.round((supplier.totalAmount + supplyTotalAmount) * 100) / 100;
  const nextAmountPaid =
    Math.round((supplier.amountPaid + clampedPaid) * 100) / 100;
  const nextBalanceRemaining = Math.max(
    0,
    Math.round((nextTotalAmount - nextAmountPaid) * 100) / 100
  );

  const updatedSupplier: Supplier = {
    ...supplier,
    totalSupplies: nextTotalSupplies,
    totalAmount: nextTotalAmount,
    amountPaid: nextAmountPaid,
    balanceRemaining: nextBalanceRemaining,
    updatedAt: options.timestampIso,
  };

  const supplyRecord: SupplierSupplyRecord = {
    id: `supply-${supplier.shopId}-${Date.now()}`,
    shopId: supplier.shopId,
    businessId: supplier.businessId,
    supplierId: supplier.id,
    supplierName: supplier.fullName,
    items: validItems,
    totalQuantity,
    totalAmount: supplyTotalAmount,
    amountPaid: clampedPaid,
    balanceRemaining: supplyBalanceRemaining,
    notes: options.notes?.trim() || undefined,
    recordedByUserId: options.user.id,
    recordedByName: options.user.fullName,
    createdAt: options.timestampIso,
  };

  return {
    updatedSupplier,
    supplyRecord,
  };
}

export function applySupplierBalancePayment(
  supplier: Supplier,
  paymentAmount: number,
  timestampIso: string
): Supplier {
  const validPayment = Math.max(
    0,
    Math.min(
      supplier.balanceRemaining,
      Math.round((Number(paymentAmount) || 0) * 100) / 100
    )
  );
  const nextPaid = Math.round((supplier.amountPaid + validPayment) * 100) / 100;
  const nextBalance = Math.max(
    0,
    Math.round((supplier.totalAmount - nextPaid) * 100) / 100
  );

  return {
    ...supplier,
    amountPaid: nextPaid,
    balanceRemaining: nextBalance,
    updatedAt: timestampIso,
  };
}

export interface SupplierReportProductOption {
  id: string;
  name: string;
  sku: string;
  unit: string;
  supplyCount: number;
  totalUnitsSupplied: number;
}

export interface SupplierReportFilterOptions {
  supplierId?: string;
  productId?: string;
  startDate?: string;
  endDate?: string;
  searchQuery?: string;
}

export interface SupplierItemizedSupplyRow {
  supplyId: string;
  supplyDate: string;
  supplierId: string;
  supplierName: string;
  supplierPhone: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  quantity: number;
  costPrice: number;
  lineTotal: number;
  batchTotalAmount: number;
  batchAmountPaid: number;
  batchBalanceRemaining: number;
  recordedByName: string;
  notes?: string;
}

export interface FilteredSupplierReportResult {
  suppliers: Supplier[];
  supplyRecords: SupplierSupplyRecord[];
  itemizedRows: SupplierItemizedSupplyRow[];
  summary: {
    totalSuppliers: number;
    totalSupplies: number;
    totalUnitsSupplied: number;
    totalAmount: number;
    amountPaid: number;
    balanceRemaining: number;
  };
}

export function getSupplierReportProducts(
  shopProducts: Product[],
  supplyRecords: SupplierSupplyRecord[]
): SupplierReportProductOption[] {
  const map = new Map<string, SupplierReportProductOption>();

  shopProducts.forEach((p) => {
    map.set(p.id, {
      id: p.id,
      name: p.name,
      sku: p.sku,
      unit: p.unit || 'Unit',
      supplyCount: 0,
      totalUnitsSupplied: 0,
    });
  });

  supplyRecords.forEach((rec) => {
    rec.items.forEach((item) => {
      // Match by productId or SKU
      let existing = map.get(item.productId);
      if (!existing) {
        for (const opt of map.values()) {
          if (
            (item.sku && opt.sku.toLowerCase() === item.sku.toLowerCase()) ||
            opt.name.toLowerCase() === item.productName.toLowerCase()
          ) {
            existing = opt;
            break;
          }
        }
      }
      if (existing) {
        existing.supplyCount += 1;
        existing.totalUnitsSupplied += item.quantity;
      } else {
        map.set(item.productId, {
          id: item.productId,
          name: item.productName,
          sku: item.sku,
          unit: item.unit || 'Unit',
          supplyCount: 1,
          totalUnitsSupplied: item.quantity,
        });
      }
    });
  });

  return Array.from(map.values()).sort((a, b) => {
    if (b.supplyCount !== a.supplyCount) {
      return b.supplyCount - a.supplyCount;
    }
    return a.name.localeCompare(b.name);
  });
}

export function filterSupplierReportData(
  suppliers: Supplier[],
  supplyRecords: SupplierSupplyRecord[],
  options: SupplierReportFilterOptions = {},
  shopProducts: Product[] = []
): FilteredSupplierReportResult {
  const supplierFilter = (options.supplierId ?? 'all').trim();
  const productFilter = (options.productId ?? 'all').trim();
  const startDate = (options.startDate ?? '').trim();
  const endDate = (options.endDate ?? '').trim();
  const searchQuery = (options.searchQuery ?? '').trim().toLowerCase();

  const hasSupplierFilter = Boolean(
    supplierFilter && supplierFilter.toLowerCase() !== 'all'
  );
  const hasProductFilter = Boolean(
    productFilter && productFilter.toLowerCase() !== 'all'
  );
  const hasDateFilter = Boolean(startDate || endDate);

  // Resolve target product details when productFilter is active
  const matchedShopProduct = hasProductFilter
    ? shopProducts.find(
        (p) =>
          p.id === productFilter ||
          p.sku.toLowerCase() === productFilter.toLowerCase() ||
          p.name.toLowerCase() === productFilter.toLowerCase()
      )
    : undefined;

  const matchesProductItem = (item: SupplierSupplyItem): boolean => {
    if (!hasProductFilter) return true;
    const pfLower = productFilter.toLowerCase();
    if (
      item.productId === productFilter ||
      item.sku.toLowerCase() === pfLower ||
      item.productName.toLowerCase() === pfLower ||
      item.productName.toLowerCase().includes(pfLower)
    ) {
      return true;
    }
    if (matchedShopProduct) {
      return (
        item.productId === matchedShopProduct.id ||
        item.sku.toLowerCase() === matchedShopProduct.sku.toLowerCase() ||
        item.productName.toLowerCase() === matchedShopProduct.name.toLowerCase()
      );
    }
    return false;
  };

  const matchesDateRange = (dateStr: string): boolean => {
    if (!hasDateFilter) return true;
    const ymd = extractSaleDateYmd(dateStr);
    if (!ymd) return false;
    if (startDate && ymd < startDate) return false;
    if (endDate && ymd > endDate) return false;
    return true;
  };

  const matchesSupplierRef = (
    supId: string,
    supName: string
  ): boolean => {
    if (!hasSupplierFilter) return true;
    const sfLower = supplierFilter.toLowerCase();
    return (
      supId === supplierFilter ||
      supName.trim().toLowerCase() === sfLower ||
      supName.trim().toLowerCase().includes(sfLower)
    );
  };

  const supplierById = new Map<string, Supplier>();
  suppliers.forEach((s) => supplierById.set(s.id, s));

  // 1. Filter supply records by supplier, date range, product, and search query
  const matchingSupplyRecords = supplyRecords.filter((rec) => {
    if (!matchesSupplierRef(rec.supplierId, rec.supplierName)) {
      return false;
    }
    if (!matchesDateRange(rec.createdAt)) {
      return false;
    }
    if (hasProductFilter && !rec.items.some(matchesProductItem)) {
      return false;
    }
    if (searchQuery) {
      const sup = supplierById.get(rec.supplierId);
      const supplierMatchesSearch =
        rec.supplierName.toLowerCase().includes(searchQuery) ||
        (sup &&
          (sup.phone.toLowerCase().includes(searchQuery) ||
            sup.email.toLowerCase().includes(searchQuery) ||
            sup.address.toLowerCase().includes(searchQuery)));
      const itemMatchesSearch = rec.items.some(
        (i) =>
          i.productName.toLowerCase().includes(searchQuery) ||
          i.sku.toLowerCase().includes(searchQuery)
      );
      if (!supplierMatchesSearch && !itemMatchesSearch) {
        return false;
      }
    }
    return true;
  });

  // Sort supply records newest first
  const sortedSupplyRecords = [...matchingSupplyRecords].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  // 2. Build itemized rows from matching supply records
  const itemizedRows: SupplierItemizedSupplyRow[] = [];
  sortedSupplyRecords.forEach((rec) => {
    const sup = supplierById.get(rec.supplierId);
    rec.items.forEach((item) => {
      if (!matchesProductItem(item)) return;
      if (searchQuery) {
        const supMatch =
          rec.supplierName.toLowerCase().includes(searchQuery) ||
          (sup &&
            (sup.phone.toLowerCase().includes(searchQuery) ||
              sup.email.toLowerCase().includes(searchQuery) ||
              sup.address.toLowerCase().includes(searchQuery)));
        const itemMatch =
          item.productName.toLowerCase().includes(searchQuery) ||
          item.sku.toLowerCase().includes(searchQuery);
        if (!supMatch && !itemMatch) return;
      }

      itemizedRows.push({
        supplyId: rec.id,
        supplyDate: rec.createdAt,
        supplierId: rec.supplierId,
        supplierName: rec.supplierName,
        supplierPhone: sup?.phone ?? '',
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        unit: item.unit || 'Unit',
        quantity: item.quantity,
        costPrice: item.costPrice,
        lineTotal: item.lineTotal,
        batchTotalAmount: rec.totalAmount,
        batchAmountPaid: rec.amountPaid,
        batchBalanceRemaining: rec.balanceRemaining,
        recordedByName: rec.recordedByName,
        notes: rec.notes,
      });
    });
  });

  // 3. Filter and compute Supplier directory rows
  const filteredSuppliers: Supplier[] = [];

  suppliers.forEach((sup) => {
    if (!matchesSupplierRef(sup.id, sup.fullName)) {
      return;
    }

    const supRecords = sortedSupplyRecords.filter(
      (r) => r.supplierId === sup.id
    );

    if (searchQuery) {
      const supTextMatch =
        sup.fullName.toLowerCase().includes(searchQuery) ||
        sup.phone.toLowerCase().includes(searchQuery) ||
        sup.email.toLowerCase().includes(searchQuery) ||
        sup.address.toLowerCase().includes(searchQuery);
      if (!supTextMatch && supRecords.length === 0) {
        return;
      }
    }

    if (!hasDateFilter && !hasProductFilter) {
      filteredSuppliers.push(sup);
      return;
    }

    // When Product filter is active, only include suppliers who supplied that product in the period
    if (hasProductFilter) {
      if (supRecords.length === 0) return;

      let prodTotalAmount = 0;
      let prodAmountPaid = 0;

      supRecords.forEach((rec) => {
        const matchingItemsSum = rec.items
          .filter(matchesProductItem)
          .reduce((sum, item) => sum + item.lineTotal, 0);
        prodTotalAmount += matchingItemsSum;
        if (rec.totalAmount > 0) {
          prodAmountPaid +=
            (matchingItemsSum / rec.totalAmount) * rec.amountPaid;
        }
      });

      const roundedTotal = Math.round(prodTotalAmount * 100) / 100;
      const roundedPaid = Math.min(
        roundedTotal,
        Math.round(prodAmountPaid * 100) / 100
      );
      const roundedBalance = Math.max(
        0,
        Math.round((roundedTotal - roundedPaid) * 100) / 100
      );

      filteredSuppliers.push({
        ...sup,
        totalSupplies: supRecords.length,
        totalAmount: roundedTotal,
        amountPaid: roundedPaid,
        balanceRemaining: roundedBalance,
      });
      return;
    }

    // When only Date filter is active (no Product filter)
    if (supRecords.length > 0) {
      const periodTotalAmount =
        Math.round(
          supRecords.reduce((s, r) => s + r.totalAmount, 0) * 100
        ) / 100;
      const periodAmountPaid =
        Math.round(
          supRecords.reduce((s, r) => s + r.amountPaid, 0) * 100
        ) / 100;
      const periodBalance = Math.max(
        0,
        Math.round((periodTotalAmount - periodAmountPaid) * 100) / 100
      );

      filteredSuppliers.push({
        ...sup,
        totalSupplies: supRecords.length,
        totalAmount: periodTotalAmount,
        amountPaid: periodAmountPaid,
        balanceRemaining: periodBalance,
      });
      return;
    }

    // Also include supplier if they were added within the selected date range (even if 0 supplies yet)
    if (matchesDateRange(sup.createdAt)) {
      const hasAnyHistoricalRecords = supplyRecords.some(
        (r) => r.supplierId === sup.id
      );
      filteredSuppliers.push(
        hasAnyHistoricalRecords
          ? {
              ...sup,
              totalSupplies: 0,
              totalAmount: 0,
              amountPaid: 0,
              balanceRemaining: 0,
            }
          : sup
      );
    }
  });

  const summary = filteredSuppliers.reduce(
    (acc, sup) => {
      acc.totalSuppliers += 1;
      acc.totalSupplies += sup.totalSupplies;
      acc.totalAmount =
        Math.round((acc.totalAmount + sup.totalAmount) * 100) / 100;
      acc.amountPaid =
        Math.round((acc.amountPaid + sup.amountPaid) * 100) / 100;
      acc.balanceRemaining =
        Math.round((acc.balanceRemaining + sup.balanceRemaining) * 100) / 100;
      return acc;
    },
    {
      totalSuppliers: 0,
      totalSupplies: 0,
      totalUnitsSupplied: itemizedRows.reduce((s, r) => s + r.quantity, 0),
      totalAmount: 0,
      amountPaid: 0,
      balanceRemaining: 0,
    }
  );

  return {
    suppliers: filteredSuppliers,
    supplyRecords: sortedSupplyRecords,
    itemizedRows,
    summary,
  };
}



