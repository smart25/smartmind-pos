/**
 * SmartMind POS â€” Phase 6: Production Cloud Functions (2nd Gen / Node.js 22)
 *
 * Project ID: gen-lang-client-0985802946
 * Named Firestore Database ID: ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4
 *
 * CRITICAL SECURITY INVARIANTS ENFORCED BY THIS MODULE:
 * 1. Explicit Named Database Binding: Always connects to `ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4`
 *    via `getFirestore(app, NAMED_FIRESTORE_DATABASE_ID)` â€” never assumes `(default)`.
 * 2. Trusted Server-Side Identity & Role Verification: Never trusts client-provided roles or claims.
 *    Always loads `/users/{request.auth.uid}` from the named Firestore database.
 * 3. Strict Platform Administrator Separation: Platform Admin can provision businesses and primary owners
 *    and manage tenant status, but is strictly forbidden from assigning themselves as a `business_owner`
 *    or reading/writing shop operational data (sales, products, inventory, payments, customers, invoices).
 * 4. Safe Primary Owner Resolution: Resolves `ownerEmail` via Firebase Admin Auth (`getUserByEmail`) when
 *    available and cross-checks any client-supplied `ownerUid` against both Firebase Auth and `/users`
 *    to prevent UID spoofing, cross-tenant account hijacking, and privilege escalation.
 * 5. Atomic Multi-Document Provisioning & Idempotency: Uses `db.runTransaction()` and
 *    `/platform_provisioning_keys/{idempotencyKey}` so retries never create duplicate businesses or
 *    partial/orphaned records.
 * 6. Hard Quarantine Enforcement: Permanently blocks the four pre-Firebase test sales
 *    (`sync-sale-1792837064449-h1dw`, `sync-sale-1792840077667-3knj`, `sync-sale-1792840085221-qjdb`,
 *    `sync-sale-1792840089845-kc84`), tenant `biz-0003-u42w` / `shop-0005-9i6p`, and all demo records.
 * 7. Concurrency-Safe Stock Conflict Preservation: Validates line-item arithmetic, sale totals, and
 *    current shop stock inside `db.runTransaction()`. On insufficient stock, records a
 *    `conflict_requires_review` operation and returns `status: 'requires_review'` without erasing the
 *    completed offline sale.
 */

export const PRODUCTION_FIREBASE_PROJECT_ID = 'gen-lang-client-0985802946';
export const EXPECTED_FIREBASE_PROJECT_ID = PRODUCTION_FIREBASE_PROJECT_ID;
export const STAGING_FIREBASE_PROJECT_ID = 'smartmind-pos-staging';
export const PRODUCTION_NAMED_FIRESTORE_DATABASE_ID =
  'ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4';
export const STAGING_FIRESTORE_DATABASE_ID = '(default)' as const;

export const NAMED_FIRESTORE_DATABASE_ID =
  (typeof process !== 'undefined' &&
    process.env &&
    process.env.FIRESTORE_DATABASE_ID) ||
  PRODUCTION_NAMED_FIRESTORE_DATABASE_ID;

export const STAGING_FUNCTIONS_REGION = 'africa-south1' as const;
export const PRODUCTION_FUNCTIONS_REGION = 'us-central1' as const;

export interface EnvironmentResolution {
  projectId: string;
  databaseId: string;
  functionsRegion: 'africa-south1' | 'us-central1';
  environment: 'production' | 'staging';
  isStaging: boolean;
  isProduction: boolean;
}

/**
 * Pure function that maps an explicit project identity to its designated Cloud Functions region.
 * Does not read environment variables, does not initialize Firebase Admin, and has no side effects.
 * Fails closed if project identity is missing, blank, or unknown.
 */
export function resolveRegionForProject(
  projectId: string | null | undefined
): 'africa-south1' | 'us-central1' {
  if (!projectId || !projectId.trim()) {
    throw new Error(
      'MISSING_PROJECT_CONFIGURATION: Cloud Functions deployment project identity could not be resolved from trusted runtime or deployment environment metadata. Explicit project identity is required.'
    );
  }

  const cleanProjectId = projectId.trim();

  if (cleanProjectId === STAGING_FIREBASE_PROJECT_ID) {
    return STAGING_FUNCTIONS_REGION;
  }

  if (cleanProjectId === PRODUCTION_FIREBASE_PROJECT_ID) {
    return PRODUCTION_FUNCTIONS_REGION;
  }

  throw new Error(
    `UNKNOWN_PROJECT_CONFIGURATION: Project ID "${cleanProjectId}" is neither recognized staging ("${STAGING_FIREBASE_PROJECT_ID}") nor production ("${PRODUCTION_FIREBASE_PROJECT_ID}"). Deployment or execution against unknown projects is strictly prohibited.`
  );
}

/**
 * Pure function that maps an explicit project identity to its designated Firestore database ID.
 * Does not read environment variables, does not initialize Firebase Admin, and has no side effects.
 * Fails closed if project identity is missing, blank, unknown, or violates cross-environment isolation.
 */
export function resolveDatabaseIdForProject(
  projectId: string | null | undefined,
  explicitDatabaseId?: string | null
): string {
  if (!projectId || !projectId.trim()) {
    throw new Error(
      'MISSING_PROJECT_CONFIGURATION: Cloud Functions deployment project identity could not be resolved from trusted runtime or deployment environment metadata. Explicit project identity is required.'
    );
  }

  const cleanProjectId = projectId.trim();
  const cleanExplicitDb = explicitDatabaseId?.trim();

  if (cleanProjectId === STAGING_FIREBASE_PROJECT_ID) {
    if (cleanExplicitDb === PRODUCTION_NAMED_FIRESTORE_DATABASE_ID) {
      throw new Error(
        `CROSS_ENVIRONMENT_VIOLATION: Staging project "${cleanProjectId}" is strictly forbidden from connecting to production database "${PRODUCTION_NAMED_FIRESTORE_DATABASE_ID}". Staging must use "${STAGING_FIRESTORE_DATABASE_ID}".`
      );
    }
    if (cleanExplicitDb && cleanExplicitDb !== STAGING_FIRESTORE_DATABASE_ID) {
      throw new Error(
        `CROSS_ENVIRONMENT_VIOLATION: Staging project "${cleanProjectId}" is strictly forbidden from connecting to database "${cleanExplicitDb}". Staging must use "${STAGING_FIRESTORE_DATABASE_ID}".`
      );
    }
    return STAGING_FIRESTORE_DATABASE_ID;
  }

  if (cleanProjectId === PRODUCTION_FIREBASE_PROJECT_ID) {
    if (
      cleanExplicitDb &&
      cleanExplicitDb !== PRODUCTION_NAMED_FIRESTORE_DATABASE_ID
    ) {
      throw new Error(
        `CROSS_ENVIRONMENT_VIOLATION: Production project "${cleanProjectId}" is strictly forbidden from connecting to database "${cleanExplicitDb}". Production must connect exclusively to named database "${PRODUCTION_NAMED_FIRESTORE_DATABASE_ID}".`
      );
    }
    return PRODUCTION_NAMED_FIRESTORE_DATABASE_ID;
  }

  throw new Error(
    `UNKNOWN_PROJECT_CONFIGURATION: Project ID "${cleanProjectId}" is neither recognized staging ("${STAGING_FIREBASE_PROJECT_ID}") nor production ("${PRODUCTION_FIREBASE_PROJECT_ID}"). Deployment or execution against unknown projects is strictly prohibited.`
  );
}

/**
 * Resolves Cloud Functions deployment region based strictly on trusted
 * Google Cloud / Firebase deployment environment metadata.
 * Fails closed if project identity is missing or unauthorized.
 */
export function resolveDeploymentRegion(
  customEnv?: Record<string, string | undefined>
): 'africa-south1' | 'us-central1' {
  const envObj =
    customEnv || (typeof process !== 'undefined' && process.env ? process.env : {});

  let parsedFirebaseConfig: { projectId?: string } = {};
  if (envObj.FIREBASE_CONFIG) {
    try {
      parsedFirebaseConfig = JSON.parse(envObj.FIREBASE_CONFIG);
    } catch {
      // Ignore JSON parse error
    }
  }

  const trustedProjectId =
    envObj.GCLOUD_PROJECT ||
    envObj.FIREBASE_PROJECT ||
    envObj.GOOGLE_CLOUD_PROJECT ||
    parsedFirebaseConfig.projectId ||
    envObj.PROJECT_ID;

  return resolveRegionForProject(trustedProjectId);
}

/**
 * Resolves Cloud Functions deployment Firestore database ID based strictly on trusted
 * Google Cloud / Firebase deployment environment metadata.
 * Fails closed if project identity is missing, unauthorized, or violates cross-environment isolation.
 */
export function resolveDeploymentDatabaseId(
  customEnv?: Record<string, string | undefined>
): string {
  const envObj =
    customEnv || (typeof process !== 'undefined' && process.env ? process.env : {});

  let parsedFirebaseConfig: { projectId?: string } = {};
  if (envObj.FIREBASE_CONFIG) {
    try {
      parsedFirebaseConfig = JSON.parse(envObj.FIREBASE_CONFIG);
    } catch {
      // Ignore JSON parse error
    }
  }

  const trustedProjectId =
    envObj.GCLOUD_PROJECT ||
    envObj.FIREBASE_PROJECT ||
    envObj.GOOGLE_CLOUD_PROJECT ||
    parsedFirebaseConfig.projectId ||
    envObj.PROJECT_ID;

  return resolveDatabaseIdForProject(
    trustedProjectId,
    envObj.FIRESTORE_DATABASE_ID
  );
}


export function resolveCurrentEnvironment(
  customEnv?: Record<string, string | undefined>
): EnvironmentResolution {
  const envObj =
    customEnv ||
    (typeof process !== 'undefined' && process.env ? process.env : {});

  let parsedFirebaseConfig: { projectId?: string } = {};
  if (envObj.FIREBASE_CONFIG) {
    try {
      parsedFirebaseConfig = JSON.parse(envObj.FIREBASE_CONFIG);
    } catch {
      // Ignore JSON parse error
    }
  }

  const isCloudFunctionRuntime = Boolean(
    envObj.FUNCTION_TARGET ||
      (envObj.K_SERVICE && !envObj.K_SERVICE.startsWith('ais-dev')) ||
      envObj.FIREBASE_CONFIG
  );

  // Trusted runtime configuration injected by Google Cloud / Firebase Functions runtime
  const trustedRuntimeProjectId =
    envObj.GCLOUD_PROJECT ||
    envObj.FIREBASE_PROJECT ||
    envObj.GOOGLE_CLOUD_PROJECT ||
    parsedFirebaseConfig.projectId ||
    envObj.PROJECT_ID;

  // In Cloud Functions runtime, NEVER allow client-side or Vite environment variables
  // (such as VITE_FIREBASE_PROJECT_ID) to determine backend project identity.
  let detectedProjectId: string;
  if (isCloudFunctionRuntime) {
    if (!trustedRuntimeProjectId) {
      throw new Error(
        'MISSING_PROJECT_CONFIGURATION: Cloud Functions runtime project identity could not be resolved from trusted runtime configuration.'
      );
    }
    detectedProjectId = trustedRuntimeProjectId;
  } else {
    // For local test execution or non-Cloud-Function server environments:
    detectedProjectId = trustedRuntimeProjectId || EXPECTED_FIREBASE_PROJECT_ID;
  }

  const isStaging = detectedProjectId === STAGING_FIREBASE_PROJECT_ID;
  const isProduction = detectedProjectId === PRODUCTION_FIREBASE_PROJECT_ID;

  // Missing or unknown project configuration fails explicitly
  if (!isStaging && !isProduction) {
    throw new Error(
      `UNKNOWN_PROJECT_CONFIGURATION: Project ID "${detectedProjectId}" is neither recognized staging ("${STAGING_FIREBASE_PROJECT_ID}") nor production ("${PRODUCTION_FIREBASE_PROJECT_ID}").`
    );
  }

  // Database resolution strictly driven by server runtime configuration (never Vite client env vars)
  const explicitDbId = envObj.FIRESTORE_DATABASE_ID;

  // HARD CROSS-ENVIRONMENT SAFETY GUARDS:
  // 1. Staging project is strictly forbidden from connecting to production database.
  if (isStaging && explicitDbId === PRODUCTION_NAMED_FIRESTORE_DATABASE_ID) {
    throw new Error(
      `CROSS_ENVIRONMENT_VIOLATION: Staging project "${detectedProjectId}" is strictly forbidden from connecting to production database "${PRODUCTION_NAMED_FIRESTORE_DATABASE_ID}". Staging must use "(default)" or a dedicated staging database.`
    );
  }

  // 2. Production project is strictly forbidden from accidentally connecting to staging or unauthorized databases.
  if (
    isProduction &&
    explicitDbId &&
    explicitDbId !== PRODUCTION_NAMED_FIRESTORE_DATABASE_ID
  ) {
    throw new Error(
      `CROSS_ENVIRONMENT_VIOLATION: Production project "${detectedProjectId}" is strictly forbidden from connecting to database "${explicitDbId}". Production must connect exclusively to named database "${PRODUCTION_NAMED_FIRESTORE_DATABASE_ID}".`
    );
  }

  let databaseId: string;
  if (explicitDbId) {
    databaseId = explicitDbId;
  } else if (isStaging) {
    databaseId = '(default)';
  } else {
    databaseId = PRODUCTION_NAMED_FIRESTORE_DATABASE_ID;
  }

  const functionsRegion = isStaging
    ? STAGING_FUNCTIONS_REGION
    : PRODUCTION_FUNCTIONS_REGION;

  return {
    projectId: detectedProjectId,
    databaseId,
    functionsRegion,
    environment: isProduction ? 'production' : 'staging',
    isStaging,
    isProduction,
  };
}

export const BOOTSTRAP_PLATFORM_ADMIN_EMAIL = 'smartnwokolo@gmail.com';
export const STAGING_PLATFORM_ADMIN_EMAIL = 'smart@smartmindconcept.com';
export const AUTHORIZED_PLATFORM_ADMIN_EMAILS = new Set<string>([
  BOOTSTRAP_PLATFORM_ADMIN_EMAIL,
  STAGING_PLATFORM_ADMIN_EMAIL,
]);
export function isAuthorizedPlatformAdminEmail(
  email?: string | null
): boolean {
  if (!email || typeof email !== 'string') return false;
  return AUTHORIZED_PLATFORM_ADMIN_EMAILS.has(email.trim().toLowerCase());
}
export const PLATFORM_ADMIN_BUSINESS_SENTINEL = 'PLATFORM';
export const VALID_PLATFORM_ADMIN_SENTINELS = new Set<string>([
  'PLATFORM',
  '__PLATFORM_ADMIN__',
  'platform_admin',
  'biz-platform-live',
]);
export const PRE_FIREBASE_TEST_BUSINESS_ID = 'biz-0003-u42w';
export const PRE_FIREBASE_TEST_SHOP_ID = 'shop-0005-9i6p';
export const PRE_FIREBASE_QUARANTINE_REASON =
  'pre_firebase_test_transaction_missing_live_tenant';

export const QUARANTINED_PRE_FIREBASE_SYNC_IDS = new Set<string>([
  'sync-sale-1792837064449-h1dw',
  'sync-sale-1792840077667-3knj',
  'sync-sale-1792840085221-qjdb',
  'sync-sale-1792840089845-kc84',
]);

export const QUARANTINED_PRE_FIREBASE_SALE_IDS = new Set<string>([
  'sale-1792837064449-h1dw',
  'sale-1792840077667-3knj',
  'sale-1792840085221-qjdb',
  'sale-1792840089845-kc84',
]);

export const KNOWN_DEMO_BUSINESS_IDS = new Set<string>([
  'biz-platform-hq',
  'biz-emerald-01',
  'biz-zenith-02',
  'biz-horizon-02',
  'biz-royal-03',
]);

export const KNOWN_DEMO_SHOP_IDS = new Set<string>([
  'shop-vi-01',
  'shop-ikj-02',
  'shop-ikeja-02',
  'shop-lek-03',
  'shop-lekki-03',
  'shop-abj-01',
  'shop-abuja-01',
  'shop-phc-01',
]);

export const KNOWN_DEMO_USER_IDS = new Set<string>([
  'usr-platform-admin',
  'usr-owner-01',
  'usr-mgr-vi',
  'usr-cashier-vi',
  'usr-mgr-ikj',
  'usr-cashier-ikj',
  'usr-mgr-lek',
  'usr-owner-02',
  'usr-owner-03',
]);

export const DEFAULT_BUSINESS_OWNER_PERMISSIONS = [
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
] as const;

export const DEFAULT_SHOP_MANAGER_PERMISSIONS = [
  'manage_products',
  'adjust_inventory',
  'process_sales',
  'apply_discounts',
  'process_refunds',
  'process_returns',
  'view_shop_reports',
  'manage_debt_book',
  'manage_invoices',
] as const;

export const DEFAULT_CASHIER_PERMISSIONS = [
  'process_sales',
  'manage_invoices',
] as const;

export const OWNER_ONLY_PERMISSION_KEYS = new Set<string>([
  'manage_business_settings',
  'manage_shops',
  'manage_staff',
  'view_business_reports',
]);

export const MANAGER_ONLY_PERMISSION_KEYS = new Set<string>([
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

export const ALLOWED_CASHIER_PERMISSION_KEYS = new Set<string>([
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

export const ALLOWED_SHOP_MANAGER_PERMISSION_KEYS = new Set<string>([
  ...ALLOWED_CASHIER_PERMISSION_KEYS,
  ...MANAGER_ONLY_PERMISSION_KEYS,
]);

export const ALLOWED_STAFF_PERMISSION_KEYS = ALLOWED_SHOP_MANAGER_PERMISSION_KEYS;

export const ALL_SUPPORTED_PERMISSION_KEYS = new Set<string>([
  ...OWNER_ONLY_PERMISSION_KEYS,
  ...ALLOWED_SHOP_MANAGER_PERMISSION_KEYS,
]);

/**
 * Validates and deduplicates requested permissions for a staff role (`shop_manager` or `cashier`).
 * - Rejects non-array `requestedPermissions` when provided.
 * - Rejects unknown/unsupported permission identifiers.
 * - Rejects owner-only permissions (`manage_business_settings`, `manage_shops`, `manage_staff`, `view_business_reports`) for all staff.
 * - Rejects manager/inventory/refund/report permissions (`manage_products`, `adjust_inventory`, `process_refunds`, `process_returns`, `void_sale`, `view_shop_reports`, etc.) for `cashier`.
 */
export function validateRoleSpecificStaffPermissions(
  role: unknown,
  requestedPermissions?: unknown
): string[] {
  if (role !== 'shop_manager' && role !== 'cashier') {
    throw new Error(
      'PERMISSION_DENIED: Staff provisioning can only assign role "shop_manager" or "cashier" (never "business_owner" or "platform_admin").'
    );
  }

  if (requestedPermissions === undefined) {
    return role === 'shop_manager'
      ? [...DEFAULT_SHOP_MANAGER_PERMISSIONS]
      : [...DEFAULT_CASHIER_PERMISSIONS];
  }

  if (
    !Array.isArray(requestedPermissions) ||
    requestedPermissions.length === 0 ||
    requestedPermissions.length > 30
  ) {
    throw new Error(
      'INVALID_ARGUMENT: permissions must be a non-empty array of between 1 and 30 valid permission keys.'
    );
  }

  const validated: string[] = [];
  for (const rawPerm of requestedPermissions) {
    if (typeof rawPerm !== 'string' || rawPerm.trim().length === 0) {
      throw new Error(
        'INVALID_ARGUMENT: Every permission key must be a non-empty string.'
      );
    }
    const perm = rawPerm.trim();
    if (OWNER_ONLY_PERMISSION_KEYS.has(perm)) {
      throw new Error(
        `PERMISSION_DENIED: Staff accounts with role "${role}" cannot be granted owner-only permission "${perm}".`
      );
    }
    if (!ALL_SUPPORTED_PERMISSION_KEYS.has(perm)) {
      throw new Error(
        `INVALID_ARGUMENT: Unrecognized or unsupported staff permission key "${perm}".`
      );
    }
    if (role === 'cashier' && !ALLOWED_CASHIER_PERMISSION_KEYS.has(perm)) {
      throw new Error(
        `PERMISSION_DENIED: Cashier accounts cannot be granted manager, inventory-administration, refund, or shop-report permission "${perm}".`
      );
    }
    if (
      role === 'shop_manager' &&
      !ALLOWED_SHOP_MANAGER_PERMISSION_KEYS.has(perm)
    ) {
      throw new Error(
        `PERMISSION_DENIED: Shop Manager accounts cannot be granted permission "${perm}".`
      );
    }
    if (!validated.includes(perm)) {
      validated.push(perm);
    }
  }

  return validated;
}

export function callerHasPermission(
  callerProfile: Record<string, any>,
  allowedKeys: string[]
): boolean {
  if (callerProfile.role === 'business_owner') {
    return true;
  }
  const perms = Array.isArray(callerProfile.permissions)
    ? callerProfile.permissions
    : [];
  return perms.some((p: string) => allowedKeys.includes(p));
}

// ============================================================================
// TYPES & CONTRACTS
// ============================================================================

export interface CallableAuthContext {
  uid: string;
  token: {
    email?: string;
    email_verified?: boolean;
    role?: string;
    platform_admin?: boolean;
    [key: string]: any;
  };
}

export interface ProvisionBusinessRequest {
  idempotencyKey: string;
  businessId?: string;
  name: string;
  legalName?: string;
  businessType: string;
  registrationNumber?: string;
  taxIdentificationNumber?: string;
  contactEmail: string;
  primaryPhone: string;
  headquartersAddress: string;
  ownerUid?: string;
  ownerName: string;
  ownerEmail: string;
  currencyCode?: string;
  currencySymbol?: string;
  defaultTaxRatePercent?: number;
  notes?: string;
  initialShopId?: string;
  initialShopCode?: string;
  initialShopName?: string;
  initialShopCategory?: string;
  initialShopCity?: string;
  initialShopAddress?: string;
  initialShopPhone?: string;
}

export interface ProvisionBusinessResponse {
  status: 'provisioned' | 'idempotent_replay';
  isIdempotentReplay: boolean;
  authAccountCreated?: boolean;
  databaseId: string;
  business: Record<string, any>;
  primaryOwner: Record<string, any>;
  firstShop: Record<string, any>;
}

export interface SyncPosSaleItemPayload {
  id: string;
  sale_id: string;
  shop_id: string;
  business_id: string;
  product_id: string;
  sku: string;
  barcode?: string;
  product_name: string;
  unit?: string;
  unit_price_kobo: number;
  cost_price_kobo?: number;
  quantity: number;
  line_total_kobo: number;
}

export interface SyncPosSalePayload {
  id: string;
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
  status: 'completed' | 'refunded' | 'voided';
  idempotency_key?: string;
}

export interface SyncOperationPayload {
  operationId: string;
  idempotencyKey: string;
  schemaVersion: number;
  businessId: string;
  shopId: string;
  entityType:
    | 'sale'
    | 'product'
    | 'category'
    | 'inventory_movement'
    | 'customer'
    | 'invoice'
    | 'payment';
  entityId: string;
  operationType: 'create' | 'update' | 'delete' | 'adjust' | 'return';
  status?: string;
  /** Any client-supplied role claim is ignored by the server */
  clientClaimedRole?: string;
  /**
 * Required for Platform Admin operational synchronization.
 * Validated against the server-side active support session.
 */
supportSessionId?: string;
  payload: {
    sale?: SyncPosSalePayload;
    items?: SyncPosSaleItemPayload[];
    payment?: Record<string, any>;
    product?: Record<string, any>;
    category?: Record<string, any>;
    movement?: Record<string, any>;
    [key: string]: unknown;
  };
}

export interface SyncOperationResponse {
  outcome: 'acknowledged' | 'conflict_requires_review' | 'rejected_unauthorized';
  status: 'synced' | 'requires_review' | 'failed';
  databaseId: string;
  ackId?: string;
  syncedAt?: string;
  isDuplicateReplay?: boolean;
  conflictReason?: string;
  errorMessage?: string;
}

export interface InviteAuthorizedStaffRequest {
  idempotencyKey: string;
  businessId: string;
  staffUid?: string;
  fullName: string;
  email: string;
  role: 'shop_manager' | 'cashier';
  roleLabel?: string;
  assignedShopIds: string[];
  permissions?: string[];
  supportSessionId?: string;
}

export interface SetTenantStatusRequest {
  businessId: string;
  status: 'active' | 'suspended';
  reason?: string;
}

export interface RepairBusinessOwnerAuthRequest {
  idempotencyKey: string;
  businessId: string;
  expectedOwnerEmail: string;
  expectedOwnerName?: string;
}

export interface RepairBusinessOwnerAuthResponse {
  status: 'repaired' | 'already_bound' | 'idempotent_replay';
  isIdempotentReplay: boolean;
  authAccountCreated: boolean;
  databaseId: string;
  businessId: string;
  previousOwnerUserId: string;
  canonicalOwnerUid: string;
  removedSyntheticOwnerUserId?: string;
  business: Record<string, any>;
  primaryOwner: Record<string, any>;
}
export interface StartPlatformAdminSupportSessionRequest {
  businessId: string;
  shopId: string;
}

export interface EndPlatformAdminSupportSessionRequest {
  supportSessionId: string;
}

export interface PlatformAdminSupportSessionResponse {
  status: 'active' | 'ended';
  supportSessionId: string;
  adminUid: string;
  businessId: string;
  shopId: string;
  createdAt: string;
  expiresAt?: string;
  endedAt?: string;
}

// ============================================================================
// TRANSACTIONAL DOCUMENT STORE & AUTH DIRECTORY ABSTRACTIONS
// ============================================================================

export interface ServerTransactionContext {
  getDoc(path: string): Promise<Record<string, any> | null>;
  queryDocsByField(
    collectionPath: string,
    field: string,
    value: string
  ): Promise<Array<Record<string, any>>>;
  setDoc(path: string, data: Record<string, any>): void;
  deleteDoc?(path: string): void;
}

export interface ServerDatabaseDriver {
  readonly databaseId: string;
  runTransaction<T>(
    updateFunction: (tx: ServerTransactionContext) => Promise<T>
  ): Promise<T>;
}

export interface ServerAuthUserRecord {
  uid: string;
  email: string;
  emailVerified?: boolean;
  disabled?: boolean;
  displayName?: string;
}

export interface ServerAuthDirectory {
  getUserByEmail(email: string): Promise<ServerAuthUserRecord | null>;
  getUserByUid(uid: string): Promise<ServerAuthUserRecord | null>;
  createUser?(params: {
    email: string;
    displayName: string;
    password?: string;
    emailVerified?: boolean;
    disabled?: boolean;
  }): Promise<ServerAuthUserRecord>;
  updateUser?(
    uid: string,
    params: {
      password?: string;
      emailVerified?: boolean;
      displayName?: string;
      disabled?: boolean;
    }
  ): Promise<ServerAuthUserRecord>;
  setCustomUserClaims?(
    uid: string,
    customUserClaims: Record<string, any> | null
  ): Promise<void>;
}

// ============================================================================
// VALIDATION & QUARANTINE HELPERS
// ============================================================================

const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const SAFE_EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PRE_FIREBASE_BIZ_REGEX = /^biz-00\d\d-[a-z0-9]{4}$/i;
const PRE_FIREBASE_SHOP_REGEX = /^shop-00\d\d-[a-z0-9]{4}$/i;
const SYNTHETIC_OWNER_ID_REGEX =
  /^(usr-live-owner-|usr-owner-\d+|usr-staff-|pending-owner-|synthetic-owner-|usr-\d{4}-[a-z0-9]{4}$)/i;

export function isValidEntityId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID_REGEX.test(value);
}

export function isSyntheticServerOwnerId(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  const clean = value.trim();
  if (!clean) return true;
  return SYNTHETIC_OWNER_ID_REGEX.test(clean);
}

export function isValidEmailAddress(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 3 &&
    value.length <= 254 &&
    SAFE_EMAIL_REGEX.test(value)
  );
}

export function isQuarantinedOrDemoOperation(params: {
  operationId?: string;
  entityId?: string;
  businessId?: string;
  shopId?: string;
  status?: string;
}): { blocked: boolean; reason?: string } {
  const opId = params.operationId || '';
  const entityId = params.entityId || '';
  const bizId = params.businessId || '';
  const shopId = params.shopId || '';

  if (params.status === 'quarantined') {
    return {
      blocked: true,
      reason: `QUARANTINE_ENFORCED: Operation "${opId}" is marked quarantined and excluded from production sync.`,
    };
  }

  if (
    QUARANTINED_PRE_FIREBASE_SYNC_IDS.has(opId) ||
    QUARANTINED_PRE_FIREBASE_SALE_IDS.has(entityId) ||
    bizId === PRE_FIREBASE_TEST_BUSINESS_ID ||
    shopId === PRE_FIREBASE_TEST_SHOP_ID ||
    PRE_FIREBASE_BIZ_REGEX.test(bizId) ||
    PRE_FIREBASE_SHOP_REGEX.test(shopId)
  ) {
    return {
      blocked: true,
      reason: `QUARANTINE_ENFORCED: Refusing to synchronize pre-Firebase test record (${opId || entityId} under ${bizId}/${shopId}). Reason: ${PRE_FIREBASE_QUARANTINE_REASON}.`,
    };
  }

  if (KNOWN_DEMO_BUSINESS_IDS.has(bizId) || KNOWN_DEMO_SHOP_IDS.has(shopId)) {
    return {
      blocked: true,
      reason: `DEMO_ISOLATION_ENFORCED: Refusing to synchronize demo-mode record (${opId || entityId} under ${bizId}/${shopId}) to production Firestore.`,
    };
  }

  return { blocked: false };
}

function assertVerifiedAuthContext(
  auth: CallableAuthContext | null | undefined
): CallableAuthContext {
  if (!auth || !isValidEntityId(auth.uid)) {
    throw new Error('UNAUTHENTICATED: A valid Firebase Authentication session is required.');
  }
  if (auth.token?.email_verified !== true) {
    throw new Error(
      'PERMISSION_DENIED: Verified email address (email_verified == true) is required.'
    );
  }
  return auth;
}

async function assertCallerIsActivePlatformAdmin(
  tx: ServerTransactionContext,
  auth: CallableAuthContext
): Promise<Record<string, any>> {
  const hasAdminClaim =
    auth.token?.role === 'platform_admin' ||
    auth.token?.platform_admin === true;

  const callerProfile = await tx.getDoc(`users/${auth.uid}`);
  const callerEmail = (auth.token?.email || '').trim().toLowerCase();

  if (!hasAdminClaim && (!callerEmail || !isAuthorizedPlatformAdminEmail(callerEmail))) {
    throw new Error(
      `PERMISSION_DENIED: User "${callerEmail || auth.uid}" is not authorized as the Platform Administrator.`
    );
  }

  if (!callerProfile) {
    throw new Error(
      `PERMISSION_DENIED: Platform Administrator profile at /users/${auth.uid} has not been initialized. Verified credentials alone do not grant administrator privileges without an active administrator profile.`
    );
  }

  if (callerProfile.status !== 'active') {
    throw new Error('PERMISSION_DENIED: Caller user profile is suspended.');
  }

  if (callerProfile.role !== 'platform_admin') {
    throw new Error(
      `PERMISSION_DENIED: Role "${callerProfile.role}" is not authorized to perform Platform Administrator operations.`
    );
  }

  const profileEmail = String(callerProfile.email || '')
    .trim()
    .toLowerCase();
  if (
    callerProfile.id !== auth.uid ||
    (!hasAdminClaim && (profileEmail !== callerEmail || !isAuthorizedPlatformAdminEmail(profileEmail)))
  ) {
    throw new Error(
      'PERMISSION_DENIED: Caller profile identity does not match the verified Platform Administrator account.'
    );
  }

  return callerProfile;
}

// ============================================================================
// PLATFORM ADMIN SUPPORT SESSION LIFECYCLE
// ============================================================================

const PLATFORM_SUPPORT_SESSION_DURATION_MS = 30 * 60 * 1000;

export async function executeStartPlatformAdminSupportSession(
  dbDriver: ServerDatabaseDriver,
  auth: CallableAuthContext | null | undefined,
  input: StartPlatformAdminSupportSessionRequest
): Promise<PlatformAdminSupportSessionResponse> {
  const expectedDatabaseId = resolveCurrentEnvironment().databaseId;

  if (dbDriver.databaseId !== expectedDatabaseId) {
    throw new Error(
      `DATABASE_CONFIG_MISMATCH: Expected "${expectedDatabaseId}", received "${dbDriver.databaseId}".`
    );
  }

  const verifiedAuth = assertVerifiedAuthContext(auth);

  if (
    !input ||
    !isValidEntityId(input.businessId) ||
    !isValidEntityId(input.shopId) ||
    input.businessId === 'PLATFORM'
  ) {
    throw new Error(
      'INVALID_ARGUMENT: A valid tenant businessId and shopId are required.'
    );
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(
    now.getTime() + PLATFORM_SUPPORT_SESSION_DURATION_MS
  ).toISOString();

  const supportSessionId =
    `support-${verifiedAuth.uid}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

  return dbDriver.runTransaction(async (tx) => {
    const callerAdmin = await assertCallerIsActivePlatformAdmin(
      tx,
      verifiedAuth
    );

    const businessPath = `businesses/${input.businessId}`;
    const shopPath =
      `businesses/${input.businessId}/shops/${input.shopId}`;
    const sessionPath =
      `platform_support_sessions/${verifiedAuth.uid}`;

    const business = await tx.getDoc(businessPath);
    if (!business || business.status !== 'active') {
      throw new Error(
        'NOT_FOUND: The requested business does not exist or is not active.'
      );
    }

    const shop = await tx.getDoc(shopPath);
    if (
      !shop ||
      shop.businessId !== input.businessId ||
      shop.status !== 'active'
    ) {
      throw new Error(
        'NOT_FOUND: The requested shop does not exist, is not active, or does not belong to this business.'
      );
    }

    const existingSession = await tx.getDoc(sessionPath);

    if (
      existingSession?.status === 'active' &&
      typeof existingSession.expiresAt === 'string' &&
      Date.parse(existingSession.expiresAt) > now.getTime()
    ) {
      throw new Error(
        'SUPPORT_SESSION_ALREADY_ACTIVE: End the existing support session before opening another business or shop.'
      );
    }

    const adminName = String(
      callerAdmin.fullName || 'Platform Administrator'
    ).slice(0, 120);

    const sessionRecord: Record<string, any> = {
      id: supportSessionId,
      sessionId: supportSessionId,
      adminUid: verifiedAuth.uid,
      adminEmail: String(verifiedAuth.token.email || '').trim().toLowerCase(),
      adminName,
      businessId: input.businessId,
      shopId: input.shopId,
      status: 'active',
      createdAt: nowIso,
      lastActivityAt: nowIso,
      expiresAt,
      schemaVersion: 1,
    };

    const auditEventId = `support-start-${supportSessionId}`;
    const auditEvent: Record<string, any> = {
      id: auditEventId,
      businessId: input.businessId,
      shopId: input.shopId,
      userId: verifiedAuth.uid,
      userName: adminName,
      action: 'platform_admin_support_started',
      entityType: 'shop',
      entityId: input.shopId,
      detailsJson: JSON.stringify({
        supportSessionId,
        adminUid: verifiedAuth.uid,
        adminEmail: sessionRecord.adminEmail,
        businessId: input.businessId,
        shopId: input.shopId,
        expiresAt,
      }),
      createdAt: nowIso,
    };

    const platformAudit: Record<string, any> = {
      id: auditEventId,
      actorUid: verifiedAuth.uid,
      actorEmail: sessionRecord.adminEmail,
      action: 'support_session_started',
      businessId: input.businessId,
      shopId: input.shopId,
      supportSessionId,
      createdAt: nowIso,
      detailsJson: JSON.stringify({
        businessName: business.name || '',
        shopName: shop.name || '',
      }),
    };

    tx.setDoc(sessionPath, sessionRecord);
    tx.setDoc(
      `businesses/${input.businessId}/audit_events/${auditEventId}`,
      auditEvent
    );
    tx.setDoc(`platform_audit_logs/${auditEventId}`, platformAudit);

    return {
      status: 'active',
      supportSessionId,
      adminUid: verifiedAuth.uid,
      businessId: input.businessId,
      shopId: input.shopId,
      createdAt: nowIso,
      expiresAt,
    };
  });
}

export async function executeEndPlatformAdminSupportSession(
  dbDriver: ServerDatabaseDriver,
  auth: CallableAuthContext | null | undefined,
  input: EndPlatformAdminSupportSessionRequest
): Promise<PlatformAdminSupportSessionResponse> {
  const expectedDatabaseId = resolveCurrentEnvironment().databaseId;

  if (dbDriver.databaseId !== expectedDatabaseId) {
    throw new Error(
      `DATABASE_CONFIG_MISMATCH: Expected "${expectedDatabaseId}", received "${dbDriver.databaseId}".`
    );
  }

  const verifiedAuth = assertVerifiedAuthContext(auth);

  if (!input || !isValidEntityId(input.supportSessionId)) {
    throw new Error(
      'INVALID_ARGUMENT: A valid supportSessionId is required.'
    );
  }

  const nowIso = new Date().toISOString();

  return dbDriver.runTransaction(async (tx) => {
    const callerAdmin = await assertCallerIsActivePlatformAdmin(
      tx,
      verifiedAuth
    );

    const sessionPath =
      `platform_support_sessions/${verifiedAuth.uid}`;

    const session = await tx.getDoc(sessionPath);

    if (
      !session ||
      session.adminUid !== verifiedAuth.uid ||
      session.sessionId !== input.supportSessionId
    ) {
      throw new Error(
        'NOT_FOUND: The requested support session does not belong to this administrator.'
      );
    }

    if (session.status !== 'active') {
      throw new Error(
        'FAILED_PRECONDITION: This support session is not active.'
      );
    }

    const businessId = String(session.businessId || '');
    const shopId = String(session.shopId || '');

    if (!isValidEntityId(businessId) || !isValidEntityId(shopId)) {
      throw new Error(
        'FAILED_PRECONDITION: The stored support session has an invalid business or shop scope.'
      );
    }

    const adminName = String(
      callerAdmin.fullName || 'Platform Administrator'
    ).slice(0, 120);

    const endedSession: Record<string, any> = {
      ...session,
      status: 'ended',
      endedAt: nowIso,
      endedByUid: verifiedAuth.uid,
      updatedAt: nowIso,
    };

    const auditEventId =
      `support-end-${input.supportSessionId}`;

    const auditEvent: Record<string, any> = {
      id: auditEventId,
      businessId,
      shopId,
      userId: verifiedAuth.uid,
      userName: adminName,
      action: 'platform_admin_support_ended',
      entityType: 'shop',
      entityId: shopId,
      detailsJson: JSON.stringify({
        supportSessionId: input.supportSessionId,
        adminUid: verifiedAuth.uid,
        businessId,
        shopId,
      }),
      createdAt: nowIso,
    };

    const platformAudit: Record<string, any> = {
      id: auditEventId,
      actorUid: verifiedAuth.uid,
      actorEmail: String(verifiedAuth.token.email || '').toLowerCase(),
      action: 'support_session_ended',
      businessId,
      shopId,
      supportSessionId: input.supportSessionId,
      createdAt: nowIso,
    };

    tx.setDoc(sessionPath, endedSession);
    tx.setDoc(
      `businesses/${businessId}/audit_events/${auditEventId}`,
      auditEvent
    );
    tx.setDoc(`platform_audit_logs/${auditEventId}`, platformAudit);

    return {
      status: 'ended',
      supportSessionId: input.supportSessionId,
      adminUid: verifiedAuth.uid,
      businessId,
      shopId,
      createdAt: String(session.createdAt || ''),
      endedAt: nowIso,
    };
  });
}


/**
 * Read-only recovery of an existing Platform Admin support session.
 * Never creates, renews, or modifies a session.
 */
export async function executeGetPlatformAdminSupportSession(
  dbDriver: ServerDatabaseDriver,
  auth: CallableAuthContext | null | undefined
): Promise<PlatformAdminSupportSessionResponse | null> {
  const expectedDatabaseId = resolveCurrentEnvironment().databaseId;

  if (dbDriver.databaseId !== expectedDatabaseId) {
    throw new Error(
      `DATABASE_CONFIG_MISMATCH: Expected "${expectedDatabaseId}", received "${dbDriver.databaseId}".`
    );
  }

  const verifiedAuth = assertVerifiedAuthContext(auth);

  return dbDriver.runTransaction(async (tx) => {
    await assertCallerIsActivePlatformAdmin(tx, verifiedAuth);

    const session = await tx.getDoc(
      `platform_support_sessions/${verifiedAuth.uid}`
    );

    if (!session) {
      return null;
    }

    // Fail closed for ended, malformed, or mismatched sessions.
    if (
      session.status !== 'active' ||
      session.adminUid !== verifiedAuth.uid ||
      typeof session.sessionId !== 'string' ||
      !isValidEntityId(session.sessionId)
    ) {
      return null;
    }

    const businessId = String(session.businessId || '');
    const shopId = String(session.shopId || '');
    const expiresAtMs =
      typeof session.expiresAt === 'string'
        ? Date.parse(session.expiresAt)
        : NaN;

    if (
      !isValidEntityId(businessId) ||
      businessId === PLATFORM_ADMIN_BUSINESS_SENTINEL ||
      !isValidEntityId(shopId) ||
      !Number.isFinite(expiresAtMs) ||
      expiresAtMs <= Date.now()
    ) {
      return null;
    }

    const business = await tx.getDoc(`businesses/${businessId}`);
    if (!business || business.status !== 'active') {
      return null;
    }

    const shop = await tx.getDoc(
      `businesses/${businessId}/shops/${shopId}`
    );

    if (
      !shop ||
      shop.status !== 'active' ||
      shop.businessId !== businessId
    ) {
      return null;
    }

    return {
      status: 'active',
      supportSessionId: session.sessionId,
      adminUid: verifiedAuth.uid,
      businessId,
      shopId,
      createdAt: String(session.createdAt || ''),
      expiresAt: String(session.expiresAt),
    };
  });
}

// ============================================================================
// 1. PRIVILEGED BUSINESS, FIRST SHOP & PRIMARY OWNER PROVISIONING
// ============================================================================

export async function executeProvisionBusinessAndPrimaryOwner(
  dbDriver: ServerDatabaseDriver,
  authDirectory: ServerAuthDirectory | null,
  auth: CallableAuthContext | null | undefined,
  input: ProvisionBusinessRequest
): Promise<ProvisionBusinessResponse> {
  const expectedDatabaseId = resolveCurrentEnvironment().databaseId;
  if (dbDriver.databaseId !== expectedDatabaseId) {
    throw new Error(
      `DATABASE_CONFIG_MISMATCH: Expected Firestore database "${expectedDatabaseId}", but driver is bound to "${dbDriver.databaseId}".`
    );
  }

  const verifiedAuth = assertVerifiedAuthContext(auth);

  if (!input || !isValidEntityId(input.idempotencyKey)) {
    throw new Error(
      'INVALID_ARGUMENT: A valid idempotencyKey (1-128 alphanumeric/hyphen characters) is required.'
    );
  }

  const cleanBusinessName = (input.name || '').trim();
  const cleanBusinessType = (input.businessType || '').trim();
  const cleanOwnerName = (input.ownerName || '').trim();
  const cleanOwnerEmail = (input.ownerEmail || '').trim().toLowerCase();
  const cleanContactEmail = (input.contactEmail || cleanOwnerEmail).trim().toLowerCase();
  const cleanPhone = (input.primaryPhone || '').trim();
  const cleanAddress = (input.headquartersAddress || '').trim();

  if (cleanBusinessName.length < 2 || cleanBusinessName.length > 140) {
    throw new Error('INVALID_ARGUMENT: Business name must be between 2 and 140 characters.');
  }
  if (cleanOwnerName.length < 2 || cleanOwnerName.length > 120) {
    throw new Error('INVALID_ARGUMENT: Primary owner name must be between 2 and 120 characters.');
  }
  if (!isValidEmailAddress(cleanOwnerEmail)) {
    throw new Error('INVALID_ARGUMENT: A valid primary owner email address is required.');
  }
  if (!isValidEmailAddress(cleanContactEmail)) {
    throw new Error('INVALID_ARGUMENT: A valid business contact email address is required.');
  }
  if (cleanPhone.length < 3 || cleanPhone.length > 40) {
    throw new Error('INVALID_ARGUMENT: A valid primary phone number is required.');
  }
  if (cleanAddress.length < 3 || cleanAddress.length > 250) {
    throw new Error('INVALID_ARGUMENT: A valid headquarters address is required.');
  }

  // Validate optional client-supplied ownerUid before touching Firebase Auth
  const clientSuppliedOwnerUid = input.ownerUid?.trim() || undefined;
  if (clientSuppliedOwnerUid && !isValidEntityId(clientSuppliedOwnerUid)) {
    throw new Error('INVALID_ARGUMENT: Provided ownerUid has an invalid format.');
  }
  if (clientSuppliedOwnerUid && isSyntheticServerOwnerId(clientSuppliedOwnerUid)) {
    throw new Error(
      `INVALID_ARGUMENT: Synthetic owner UID "${clientSuppliedOwnerUid}" is forbidden in live provisioning. A real Firebase Authentication UID is required.`
    );
  }

  const candidateBusinessId =
    input.businessId && isValidEntityId(input.businessId)
      ? input.businessId
      : undefined;
  if (
    candidateBusinessId &&
    (KNOWN_DEMO_BUSINESS_IDS.has(candidateBusinessId) ||
      VALID_PLATFORM_ADMIN_SENTINELS.has(candidateBusinessId) ||
      candidateBusinessId === PRE_FIREBASE_TEST_BUSINESS_ID ||
      PRE_FIREBASE_BIZ_REGEX.test(candidateBusinessId))
  ) {
    throw new Error(
      `INVALID_ARGUMENT: Business ID "${candidateBusinessId}" is reserved or quarantined.`
    );
  }

  // Step 1: Pre-flight authorization, role separation, and idempotency verification
  // MUST execute BEFORE creating or mutating any Firebase Authentication account.
  const preflightReplay = await dbDriver.runTransaction(
    async (tx): Promise<ProvisionBusinessResponse | null> => {
      const callerAdmin = await assertCallerIsActivePlatformAdmin(tx, verifiedAuth);
      const callerEmail = (
        callerAdmin.email ||
        verifiedAuth.token?.email ||
        ''
      )
        .trim()
        .toLowerCase();

      if (
        cleanOwnerEmail === callerEmail ||
        isAuthorizedPlatformAdminEmail(cleanOwnerEmail) ||
        clientSuppliedOwnerUid === verifiedAuth.uid
      ) {
        throw new Error(
          'PERMISSION_DENIED: Platform Administrator must remain separate from tenant ownership and cannot be provisioned as a Business Owner.'
        );
      }

      const idempotencyDocPath = `platform_provisioning_keys/${input.idempotencyKey}`;
      const existingIdempotencyDoc = await tx.getDoc(idempotencyDocPath);
      if (existingIdempotencyDoc) {
        const existingBiz = await tx.getDoc(
          `businesses/${existingIdempotencyDoc.businessId}`
        );
        const existingOwner = await tx.getDoc(
          `users/${existingIdempotencyDoc.ownerUserId}`
        );
        const existingShop = await tx.getDoc(
          `businesses/${existingIdempotencyDoc.businessId}/shops/${existingIdempotencyDoc.firstShopId}`
        );
        if (
          existingBiz &&
          existingOwner &&
          existingShop &&
          !isSyntheticServerOwnerId(existingOwner.id)
        ) {
          return {
            status: 'idempotent_replay',
            isIdempotentReplay: true,
            authAccountCreated: false,
            databaseId: dbDriver.databaseId,
            business: existingBiz,
            primaryOwner: existingOwner,
            firstShop: existingShop,
          };
        }
      }

      const existingProfilesByEmail = await tx.queryDocsByField(
        'users',
        'email',
        cleanOwnerEmail
      );
      if (existingProfilesByEmail.length > 0) {
        const existingProfile = existingProfilesByEmail[0];
        if (existingProfile.role === 'platform_admin') {
          throw new Error(
            'PERMISSION_DENIED: Cannot assign a Platform Administrator account as a tenant Business Owner.'
          );
        }
        throw new Error(
          `ALREADY_EXISTS: Email "${cleanOwnerEmail}" is already bound to an active user profile in business "${existingProfile.businessId}".`
        );
      }

      if (candidateBusinessId) {
        const existingBizDoc = await tx.getDoc(`businesses/${candidateBusinessId}`);
        if (existingBizDoc) {
          throw new Error(
            `ALREADY_EXISTS: Business "${candidateBusinessId}" already exists.`
          );
        }
      }

      return null;
    }
  );

  if (preflightReplay) {
    return preflightReplay;
  }

  // Step 2: Resolve or create real Firebase Authentication account for the Business Owner.
  // Never collects or stores passwords. Reuses existing UID on retry after partial failure.
  let authResolvedOwnerUid: string | null = null;
  let authAccountCreated = false;
  let authEmailVerified = false;
  let authDisabled = false;

  if (authDirectory) {
    const byEmail = await authDirectory.getUserByEmail(cleanOwnerEmail);
    if (byEmail) {
      if (clientSuppliedOwnerUid && clientSuppliedOwnerUid !== byEmail.uid) {
        throw new Error(
          `PERMISSION_DENIED: Client-supplied ownerUid "${clientSuppliedOwnerUid}" does not match the authenticated Firebase user UID for "${cleanOwnerEmail}".`
        );
      }
      authResolvedOwnerUid = byEmail.uid;
      authEmailVerified = Boolean(byEmail.emailVerified);
      authDisabled = Boolean(byEmail.disabled);
    } else if (clientSuppliedOwnerUid) {
      const byUid = await authDirectory.getUserByUid(clientSuppliedOwnerUid);
      if (byUid && byUid.email.trim().toLowerCase() !== cleanOwnerEmail) {
        throw new Error(
          `PERMISSION_DENIED: Client-supplied ownerUid "${clientSuppliedOwnerUid}" belongs to a different email address in Firebase Auth.`
        );
      }
      if (byUid) {
        authResolvedOwnerUid = byUid.uid;
        authEmailVerified = Boolean(byUid.emailVerified);
        authDisabled = Boolean(byUid.disabled);
      } else {
        authResolvedOwnerUid = clientSuppliedOwnerUid;
      }
    } else if (typeof authDirectory.createUser === 'function') {
      const createdAuthUser = await authDirectory.createUser({
        email: cleanOwnerEmail,
        displayName: cleanOwnerName,
        emailVerified: false,
        disabled: false,
      });
      authResolvedOwnerUid = createdAuthUser.uid;
      authAccountCreated = true;
      authEmailVerified = Boolean(createdAuthUser.emailVerified ?? false);
      authDisabled = Boolean(createdAuthUser.disabled ?? false);
    }
  } else if (clientSuppliedOwnerUid) {
    authResolvedOwnerUid = clientSuppliedOwnerUid;
  }

  const finalOwnerUid = (
    authResolvedOwnerUid ||
    clientSuppliedOwnerUid ||
    ''
  ).trim();

  if (
    !finalOwnerUid ||
    !isValidEntityId(finalOwnerUid) ||
    isSyntheticServerOwnerId(finalOwnerUid)
  ) {
    throw new Error(
      `AUTH_UID_REQUIRED: Unable to resolve or create a real Firebase Authentication UID for Business Owner "${cleanOwnerEmail}". Synthetic owner IDs (usr-live-owner-*) are strictly forbidden in live mode.`
    );
  }

  // Step 3: Commit business, first shop, primary owner profile (under real Firebase UID),
  // idempotency ledger, and audit event atomically in Firestore.
  return await dbDriver.runTransaction(async (tx) => {
    const callerAdmin = await assertCallerIsActivePlatformAdmin(tx, verifiedAuth);
    const callerEmail = (
      callerAdmin.email ||
      verifiedAuth.token?.email ||
      ''
    )
      .trim()
      .toLowerCase();

    if (
      cleanOwnerEmail === callerEmail ||
      isAuthorizedPlatformAdminEmail(cleanOwnerEmail) ||
      clientSuppliedOwnerUid === verifiedAuth.uid ||
      finalOwnerUid === verifiedAuth.uid
    ) {
      throw new Error(
        'PERMISSION_DENIED: Platform Administrator must remain separate from tenant ownership and cannot be provisioned as a Business Owner.'
      );
    }

    const idempotencyDocPath = `platform_provisioning_keys/${input.idempotencyKey}`;
    const existingIdempotencyDoc = await tx.getDoc(idempotencyDocPath);
    if (existingIdempotencyDoc) {
      const existingBiz = await tx.getDoc(
        `businesses/${existingIdempotencyDoc.businessId}`
      );
      const existingOwner = await tx.getDoc(
        `users/${existingIdempotencyDoc.ownerUserId}`
      );
      const existingShop = await tx.getDoc(
        `businesses/${existingIdempotencyDoc.businessId}/shops/${existingIdempotencyDoc.firstShopId}`
      );
      if (
        existingBiz &&
        existingOwner &&
        existingShop &&
        !isSyntheticServerOwnerId(existingOwner.id)
      ) {
        return {
          status: 'idempotent_replay',
          isIdempotentReplay: true,
          authAccountCreated: false,
          databaseId: dbDriver.databaseId,
          business: existingBiz,
          primaryOwner: existingOwner,
          firstShop: existingShop,
        };
      }
    }

    const existingProfilesByEmail = await tx.queryDocsByField(
      'users',
      'email',
      cleanOwnerEmail
    );
    if (existingProfilesByEmail.length > 0) {
      const existingProfile = existingProfilesByEmail[0];
      if (existingProfile.role === 'platform_admin') {
        throw new Error(
          'PERMISSION_DENIED: Cannot assign a Platform Administrator account as a tenant Business Owner.'
        );
      }
      throw new Error(
        `ALREADY_EXISTS: Email "${cleanOwnerEmail}" is already bound to an active user profile in business "${existingProfile.businessId}".`
      );
    }

    const existingOwnerDocById = await tx.getDoc(`users/${finalOwnerUid}`);
    if (existingOwnerDocById) {
      const existingDocEmail = String(existingOwnerDocById.email || '')
        .trim()
        .toLowerCase();
      if (existingDocEmail !== cleanOwnerEmail) {
        throw new Error(
          `PERMISSION_DENIED: Target owner UID "${finalOwnerUid}" is already bound to a different user account.`
        );
      }
      if (existingOwnerDocById.role === 'platform_admin') {
        throw new Error(
          'PERMISSION_DENIED: Target UID belongs to a Platform Administrator.'
        );
      }
      throw new Error(
        `ALREADY_EXISTS: Target owner UID "${finalOwnerUid}" is already assigned to business "${existingOwnerDocById.businessId}".`
      );
    }

    const businessId =
      candidateBusinessId ||
      `biz-live-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const existingBizDoc = await tx.getDoc(`businesses/${businessId}`);
    if (existingBizDoc) {
      throw new Error(`ALREADY_EXISTS: Business "${businessId}" already exists.`);
    }

    const prefix =
      cleanBusinessName
        .split(/\s+/)
        .map((w) => w[0] || '')
        .join('')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 3) || 'SHP';

    const firstShopId =
      input.initialShopId && isValidEntityId(input.initialShopId)
        ? input.initialShopId
        : `shop-live-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const firstShopCode = (input.initialShopCode || `${prefix}-01`)
      .trim()
      .toUpperCase()
      .slice(0, 30);
    const firstShopName = (
      input.initialShopName || `${cleanBusinessName} â€” Main Branch`
    )
      .trim()
      .slice(0, 140);
    const firstShopCategory = (input.initialShopCategory || 'Supermarket')
      .trim()
      .slice(0, 80);
    const firstShopCity = (input.initialShopCity || 'Lagos').trim().slice(0, 80);
    const firstShopAddress = (input.initialShopAddress || cleanAddress)
      .trim()
      .slice(0, 240);
    const firstShopPhone = (input.initialShopPhone || cleanPhone)
      .trim()
      .slice(0, 40);

    const nowIso = new Date().toISOString();
    const taxRate =
      typeof input.defaultTaxRatePercent === 'number' &&
      input.defaultTaxRatePercent >= 0 &&
      input.defaultTaxRatePercent <= 100
        ? input.defaultTaxRatePercent
        : 7.5;

    const businessDoc: Record<string, any> = {
      id: businessId,
      name: cleanBusinessName,
      legalName: (input.legalName || `${cleanBusinessName} Ltd`).trim().slice(0, 180),
      businessType: cleanBusinessType.slice(0, 100),
      registrationNumber: (
        input.registrationNumber || `RC-${Date.now().toString().slice(-7)}`
      )
        .trim()
        .slice(0, 60),
      taxIdentificationNumber: (
        input.taxIdentificationNumber || `TIN-${Date.now().toString().slice(-8)}`
      )
        .trim()
        .slice(0, 60),
      ownerUserId: finalOwnerUid,
      ownerName: cleanOwnerName,
      ownerEmail: cleanOwnerEmail,
      contactEmail: cleanContactEmail,
      primaryPhone: cleanPhone,
      headquartersAddress: cleanAddress,
      currencyCode: (input.currencyCode || 'NGN').trim().slice(0, 3),
      currencySymbol: (input.currencySymbol || 'â‚¦').trim().slice(0, 5),
      defaultTaxRatePercent: taxRate,
      status: 'active',
      ...(input.notes ? { notes: input.notes.trim().slice(0, 500) } : {}),
      schemaVersion: 6,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const firstShopDoc: Record<string, any> = {
      id: firstShopId,
      businessId,
      code: firstShopCode,
      name: firstShopName,
      category: firstShopCategory,
      locationCity: firstShopCity,
      address: firstShopAddress,
      phone: firstShopPhone,
      managerName: cleanOwnerName,
      status: 'active',
      terminalId: `TERM-${firstShopCode.replace(/[^A-Z0-9]/g, '')}`,
      taxRatePercent: taxRate,
      receiptHeaderNote: `${firstShopName} â€” Official Receipt`,
      receiptFooterNote: 'Thank you for your patronage',
      schemaVersion: 6,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const primaryOwnerDoc: Record<string, any> = {
      id: finalOwnerUid,
      businessId,
      username: cleanOwnerEmail.split('@')[0].slice(0, 80) || finalOwnerUid,
      email: cleanOwnerEmail,
      fullName: cleanOwnerName,
      role: 'business_owner',
      roleLabel: `Business Owner (${cleanBusinessName})`.slice(0, 100),
      assignedShopIds: [firstShopId],
      permissions: [...DEFAULT_BUSINESS_OWNER_PERMISSIONS],
      status: 'active',
      authUidLinked: true,
      emailVerified: authEmailVerified,
      authDisabled: authDisabled,
      authAccountCreatedAt: nowIso,
      passwordSetupStatus: authEmailVerified ? 'verified' : 'pending',
      schemaVersion: 6,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const idempotencyRecord: Record<string, any> = {
      id: input.idempotencyKey,
      businessId,
      ownerUserId: finalOwnerUid,
      ownerEmail: cleanOwnerEmail,
      firstShopId,
      provisionedByUid: verifiedAuth.uid,
      schemaVersion: 6,
      createdAt: nowIso,
    };

    const auditEventId = `aud-prov-${input.idempotencyKey}`;
    const auditEventDoc: Record<string, any> = {
      id: auditEventId,
      businessId,
      shopId: firstShopId,
      userId: verifiedAuth.uid,
      userName: String(callerAdmin.fullName || 'Platform Administrator').slice(0, 120),
      action: 'business_and_primary_owner_provisioned',
      entityType: 'business',
      entityId: businessId,
      detailsJson: JSON.stringify({
        businessId,
        businessName: cleanBusinessName,
        ownerUserId: finalOwnerUid,
        authAccountCreated,
        firstShopId,
        idempotencyKey: input.idempotencyKey,
      }),
      createdAt: nowIso,
    };

    tx.setDoc(`businesses/${businessId}`, businessDoc);
    tx.setDoc(`businesses/${businessId}/shops/${firstShopId}`, firstShopDoc);
    tx.setDoc(`users/${finalOwnerUid}`, primaryOwnerDoc);
    tx.setDoc(idempotencyDocPath, idempotencyRecord);
    tx.setDoc(`businesses/${businessId}/audit_events/${auditEventId}`, auditEventDoc);

    return {
      status: 'provisioned',
      isIdempotentReplay: false,
      authAccountCreated,
      databaseId: dbDriver.databaseId,
      business: businessDoc,
      primaryOwner: primaryOwnerDoc,
      firstShop: firstShopDoc,
    };
  });
}

// ============================================================================
// 1B. PRIVILEGED BUSINESS OWNER AUTHENTICATION REPAIR & REBINDING
// ============================================================================

export async function executeRepairBusinessOwnerAuth(
  dbDriver: ServerDatabaseDriver,
  authDirectory: ServerAuthDirectory | null,
  auth: CallableAuthContext | null | undefined,
  input: RepairBusinessOwnerAuthRequest
): Promise<RepairBusinessOwnerAuthResponse> {
  const expectedDatabaseId = resolveCurrentEnvironment().databaseId;
  if (dbDriver.databaseId !== expectedDatabaseId) {
    throw new Error(
      `DATABASE_CONFIG_MISMATCH: Expected Firestore database "${expectedDatabaseId}", but driver is bound to "${dbDriver.databaseId}".`
    );
  }

  const verifiedAuth = assertVerifiedAuthContext(auth);

  if (!input || !isValidEntityId(input.idempotencyKey)) {
    throw new Error(
      'INVALID_ARGUMENT: A valid idempotencyKey (1-128 alphanumeric/hyphen characters) is required.'
    );
  }

  const cleanBusinessId =
    typeof input.businessId === 'string' ? input.businessId.trim() : '';
  if (
    !cleanBusinessId ||
    !isValidEntityId(cleanBusinessId) ||
    VALID_PLATFORM_ADMIN_SENTINELS.has(cleanBusinessId) ||
    KNOWN_DEMO_BUSINESS_IDS.has(cleanBusinessId) ||
    cleanBusinessId === PRE_FIREBASE_TEST_BUSINESS_ID ||
    PRE_FIREBASE_BIZ_REGEX.test(cleanBusinessId)
  ) {
    throw new Error(
      `INVALID_ARGUMENT: Business ID "${cleanBusinessId}" is invalid, reserved, or quarantined.`
    );
  }

  const cleanExpectedEmail = (input.expectedOwnerEmail || '').trim().toLowerCase();
  if (!isValidEmailAddress(cleanExpectedEmail)) {
    throw new Error(
      'INVALID_ARGUMENT: A valid expectedOwnerEmail address is required.'
    );
  }

  if (isAuthorizedPlatformAdminEmail(cleanExpectedEmail)) {
    throw new Error(
      'PERMISSION_DENIED: Platform Administrator email must remain separate from tenant ownership and cannot be bound as a Business Owner.'
    );
  }

  if (!authDirectory) {
    throw new Error(
      'FIREBASE_ADMIN_UNAVAILABLE: ServerAuthDirectory is required to resolve or create a real Firebase Authentication account.'
    );
  }

  // Step 1: Pre-flight verification of caller authority, idempotency ledger, and business identity match
  const preflight = await dbDriver.runTransaction(
    async (
      tx
    ): Promise<{
      replay?: RepairBusinessOwnerAuthResponse;
      businessDoc?: Record<string, any>;
      existingOwnerDoc?: Record<string, any> | null;
    }> => {
      const callerAdmin = await assertCallerIsActivePlatformAdmin(tx, verifiedAuth);
      const callerEmail = (
        callerAdmin.email ||
        verifiedAuth.token?.email ||
        ''
      )
        .trim()
        .toLowerCase();

      if (cleanExpectedEmail === callerEmail) {
        throw new Error(
          'PERMISSION_DENIED: Platform Administrator cannot repair or bind themselves as a Business Owner.'
        );
      }

      const idempotencyPath = `platform_owner_repair_keys/${input.idempotencyKey}`;
      const existingKeyDoc = await tx.getDoc(idempotencyPath);
      if (existingKeyDoc) {
        if (
          existingKeyDoc.businessId !== cleanBusinessId ||
          String(existingKeyDoc.ownerEmail || '').trim().toLowerCase() !==
            cleanExpectedEmail
        ) {
          throw new Error(
            `INVALID_ARGUMENT: Idempotency key "${input.idempotencyKey}" was already used for a different business or owner email.`
          );
        }
        const currentBiz = await tx.getDoc(`businesses/${cleanBusinessId}`);
        const currentOwner = await tx.getDoc(
          `users/${existingKeyDoc.canonicalOwnerUid}`
        );
        if (
          currentBiz &&
          currentOwner &&
          currentBiz.ownerUserId === existingKeyDoc.canonicalOwnerUid &&
          !isSyntheticServerOwnerId(currentOwner.id)
        ) {
          return {
            replay: {
              status: 'idempotent_replay',
              isIdempotentReplay: true,
              authAccountCreated: Boolean(existingKeyDoc.authAccountCreated),
              databaseId: dbDriver.databaseId,
              businessId: cleanBusinessId,
              previousOwnerUserId: String(
                existingKeyDoc.previousOwnerUserId || currentOwner.id
              ),
              canonicalOwnerUid: String(existingKeyDoc.canonicalOwnerUid),
              removedSyntheticOwnerUserId:
                existingKeyDoc.removedSyntheticOwnerUserId || undefined,
              business: currentBiz,
              primaryOwner: currentOwner,
            },
          };
        }
      }

      const businessDoc = await tx.getDoc(`businesses/${cleanBusinessId}`);
      if (!businessDoc) {
        throw new Error(
          `NOT_FOUND: Business "${cleanBusinessId}" does not exist in Firestore.`
        );
      }

      const storedOwnerEmail = String(businessDoc.ownerEmail || '')
        .trim()
        .toLowerCase();
      if (storedOwnerEmail !== cleanExpectedEmail) {
        throw new Error(
          `PERMISSION_DENIED: Owner email mismatch for business "${cleanBusinessId}". Stored owner email is "${storedOwnerEmail}", but repair requested "${cleanExpectedEmail}". Refusing to reassign business owner.`
        );
      }

      const profilesByEmail = await tx.queryDocsByField(
        'users',
        'email',
        cleanExpectedEmail
      );
      for (const prof of profilesByEmail) {
        if (prof.role === 'platform_admin') {
          throw new Error(
            'PERMISSION_DENIED: Email belongs to a Platform Administrator.'
          );
        }
        if (prof.businessId !== cleanBusinessId) {
          throw new Error(
            `PERMISSION_DENIED: Email "${cleanExpectedEmail}" is already bound to a different business ("${prof.businessId}").`
          );
        }
      }

      const prevOwnerId = String(businessDoc.ownerUserId || '').trim();
      const existingOwnerDoc = prevOwnerId
        ? await tx.getDoc(`users/${prevOwnerId}`)
        : null;

      return { businessDoc, existingOwnerDoc };
    }
  );

  if (preflight.replay) {
    return preflight.replay;
  }

  const preflightBiz = preflight.businessDoc!;
  const resolvedOwnerName = (
    input.expectedOwnerName ||
    preflight.existingOwnerDoc?.fullName ||
    preflightBiz.ownerName ||
    'Business Owner'
  )
    .trim()
    .slice(0, 120);

  // Step 2: Resolve or create the Firebase Authentication user for cleanExpectedEmail
  let canonicalOwnerUid = '';
  let authAccountCreated = false;
  let authEmailVerified = false;
  let authDisabled = false;

  const existingAuthUser = await authDirectory.getUserByEmail(cleanExpectedEmail);
  if (existingAuthUser) {
    canonicalOwnerUid = existingAuthUser.uid;
    authAccountCreated = false;
    authEmailVerified = Boolean(existingAuthUser.emailVerified);
    authDisabled = Boolean(existingAuthUser.disabled);
  } else if (typeof authDirectory.createUser === 'function') {
    const createdAuthUser = await authDirectory.createUser({
      email: cleanExpectedEmail,
      displayName: resolvedOwnerName,
      emailVerified: false,
      disabled: false,
    });
    canonicalOwnerUid = createdAuthUser.uid;
    authAccountCreated = true;
    authEmailVerified = Boolean(createdAuthUser.emailVerified ?? false);
    authDisabled = Boolean(createdAuthUser.disabled ?? false);
  }

  if (
    !canonicalOwnerUid ||
    !isValidEntityId(canonicalOwnerUid) ||
    isSyntheticServerOwnerId(canonicalOwnerUid)
  ) {
    throw new Error(
      `AUTH_UID_REQUIRED: Could not resolve or create a valid Firebase Authentication UID for "${cleanExpectedEmail}".`
    );
  }

  if (canonicalOwnerUid === verifiedAuth.uid) {
    throw new Error(
      'PERMISSION_DENIED: Platform Administrator UID cannot be bound as a tenant Business Owner.'
    );
  }

  // Step 3: Atomically rebind /users/{canonicalOwnerUid} and /businesses/{cleanBusinessId}.ownerUserId,
  // and remove the old synthetic owner profile ONLY after verifying it belongs to the same business.
  return await dbDriver.runTransaction(async (tx) => {
    const callerAdmin = await assertCallerIsActivePlatformAdmin(tx, verifiedAuth);

    const idempotencyPath = `platform_owner_repair_keys/${input.idempotencyKey}`;
    const existingKeyDoc = await tx.getDoc(idempotencyPath);
    if (existingKeyDoc) {
      const currentBiz = await tx.getDoc(`businesses/${cleanBusinessId}`);
      const currentOwner = await tx.getDoc(
        `users/${existingKeyDoc.canonicalOwnerUid}`
      );
      if (
        currentBiz &&
        currentOwner &&
        currentBiz.ownerUserId === existingKeyDoc.canonicalOwnerUid &&
        !isSyntheticServerOwnerId(currentOwner.id)
      ) {
        return {
          status: 'idempotent_replay',
          isIdempotentReplay: true,
          authAccountCreated: Boolean(existingKeyDoc.authAccountCreated),
          databaseId: dbDriver.databaseId,
          businessId: cleanBusinessId,
          previousOwnerUserId: String(
            existingKeyDoc.previousOwnerUserId || currentOwner.id
          ),
          canonicalOwnerUid: String(existingKeyDoc.canonicalOwnerUid),
          removedSyntheticOwnerUserId:
            existingKeyDoc.removedSyntheticOwnerUserId || undefined,
          business: currentBiz,
          primaryOwner: currentOwner,
        };
      }
    }

    const businessDoc = await tx.getDoc(`businesses/${cleanBusinessId}`);
    if (!businessDoc) {
      throw new Error(
        `NOT_FOUND: Business "${cleanBusinessId}" does not exist in Firestore.`
      );
    }

    const storedOwnerEmail = String(businessDoc.ownerEmail || '')
      .trim()
      .toLowerCase();
    if (storedOwnerEmail !== cleanExpectedEmail) {
      throw new Error(
        `PERMISSION_DENIED: Owner email mismatch for business "${cleanBusinessId}". Stored owner email is "${storedOwnerEmail}", but repair requested "${cleanExpectedEmail}".`
      );
    }

    const previousOwnerUserId = String(businessDoc.ownerUserId || '').trim();
    const existingPreviousOwnerDoc = previousOwnerUserId
      ? await tx.getDoc(`users/${previousOwnerUserId}`)
      : null;

    if (existingPreviousOwnerDoc) {
      if (existingPreviousOwnerDoc.businessId !== cleanBusinessId) {
        throw new Error(
          `PERMISSION_DENIED: Existing owner profile "${previousOwnerUserId}" belongs to a different business ("${existingPreviousOwnerDoc.businessId}").`
        );
      }
      const prevEmail = String(existingPreviousOwnerDoc.email || '')
        .trim()
        .toLowerCase();
      if (prevEmail && prevEmail !== cleanExpectedEmail) {
        throw new Error(
          `PERMISSION_DENIED: Existing owner profile "${previousOwnerUserId}" has email "${prevEmail}", which does not match "${cleanExpectedEmail}".`
        );
      }
      if (existingPreviousOwnerDoc.role !== 'business_owner') {
        throw new Error(
          `PERMISSION_DENIED: Existing profile "${previousOwnerUserId}" has role "${existingPreviousOwnerDoc.role}" rather than "business_owner".`
        );
      }
    } else if (
      previousOwnerUserId &&
      previousOwnerUserId !== canonicalOwnerUid &&
      !isSyntheticServerOwnerId(previousOwnerUserId)
    ) {
      throw new Error(
        `PERMISSION_DENIED: Business "${cleanBusinessId}" is already bound to a different non-synthetic owner UID ("${previousOwnerUserId}"). Refusing to overwrite without matching profile verification.`
      );
    }

    const existingTargetDoc = await tx.getDoc(`users/${canonicalOwnerUid}`);
    if (existingTargetDoc) {
      const targetEmail = String(existingTargetDoc.email || '')
        .trim()
        .toLowerCase();
      if (targetEmail !== cleanExpectedEmail) {
        throw new Error(
          `PERMISSION_DENIED: Target UID "${canonicalOwnerUid}" belongs to a different email address ("${targetEmail}").`
        );
      }
      if (existingTargetDoc.businessId !== cleanBusinessId) {
        throw new Error(
          `PERMISSION_DENIED: Target UID "${canonicalOwnerUid}" is already assigned to another business ("${existingTargetDoc.businessId}").`
        );
      }
      if (existingTargetDoc.role !== 'business_owner') {
        throw new Error(
          `PERMISSION_DENIED: Target UID "${canonicalOwnerUid}" has role "${existingTargetDoc.role}" and cannot be overwritten as business_owner.`
        );
      }
    }

    const profilesByEmail = await tx.queryDocsByField(
      'users',
      'email',
      cleanExpectedEmail
    );
    for (const prof of profilesByEmail) {
      if (prof.businessId !== cleanBusinessId || prof.role !== 'business_owner') {
        throw new Error(
          `PERMISSION_DENIED: Email "${cleanExpectedEmail}" conflicts with an existing profile in business "${prof.businessId}" (role "${prof.role}").`
        );
      }
    }

    const sourceOwnerDoc =
      existingTargetDoc ||
      existingPreviousOwnerDoc ||
      profilesByEmail.find((p) => p.businessId === cleanBusinessId) ||
      null;

    const nowIso = new Date().toISOString();
    const preservedShopIds = Array.isArray(sourceOwnerDoc?.assignedShopIds)
      ? [...sourceOwnerDoc.assignedShopIds]
      : [];
    const preservedPermissions =
      Array.isArray(sourceOwnerDoc?.permissions) &&
      sourceOwnerDoc.permissions.length > 0
        ? [...sourceOwnerDoc.permissions]
        : [...DEFAULT_BUSINESS_OWNER_PERMISSIONS];
    const preservedStatus =
      sourceOwnerDoc?.status === 'suspended' ? 'suspended' : 'active';
    const preservedCreatedAt = String(
      sourceOwnerDoc?.createdAt || businessDoc.createdAt || nowIso
    ).slice(0, 50);

    const wasAlreadyBound =
      previousOwnerUserId === canonicalOwnerUid &&
      Boolean(existingTargetDoc) &&
      !isSyntheticServerOwnerId(previousOwnerUserId);

    const canonicalOwnerDoc: Record<string, any> = {
      id: canonicalOwnerUid,
      businessId: cleanBusinessId,
      username:
        String(
          sourceOwnerDoc?.username ||
            cleanExpectedEmail.split('@')[0] ||
            canonicalOwnerUid
        ).slice(0, 80),
      email: cleanExpectedEmail,
      fullName: resolvedOwnerName,
      role: 'business_owner',
      roleLabel: String(
        sourceOwnerDoc?.roleLabel || `Business Owner (${businessDoc.name})`
      ).slice(0, 100),
      assignedShopIds: preservedShopIds,
      permissions: preservedPermissions,
      status: preservedStatus,
      authUidLinked: true,
      emailVerified: authEmailVerified,
      authDisabled: authDisabled,
      authAccountCreatedAt: String(
        sourceOwnerDoc?.authAccountCreatedAt || nowIso
      ).slice(0, 50),
      passwordSetupStatus: authEmailVerified
        ? 'verified'
        : sourceOwnerDoc?.passwordSetupStatus || 'pending',
      ...(sourceOwnerDoc?.passwordSetupEmailSentAt
        ? { passwordSetupEmailSentAt: sourceOwnerDoc.passwordSetupEmailSentAt }
        : {}),
      ...(previousOwnerUserId && previousOwnerUserId !== canonicalOwnerUid
        ? {
            repairedFromUserId: previousOwnerUserId,
            repairedAt: nowIso,
          }
        : {}),
      schemaVersion: Number(sourceOwnerDoc?.schemaVersion || 6),
      createdAt: preservedCreatedAt,
      updatedAt: nowIso,
    };

    const updatedBusinessDoc: Record<string, any> = {
      ...businessDoc,
      ownerUserId: canonicalOwnerUid,
      ownerName: resolvedOwnerName,
      ownerEmail: cleanExpectedEmail,
      updatedAt: nowIso,
    };

    let removedSyntheticOwnerUserId: string | undefined;
    const syntheticIdsToRemove = new Set<string>();
    if (
      previousOwnerUserId &&
      previousOwnerUserId !== canonicalOwnerUid &&
      isSyntheticServerOwnerId(previousOwnerUserId) &&
      (!existingPreviousOwnerDoc ||
        (existingPreviousOwnerDoc.businessId === cleanBusinessId &&
          String(existingPreviousOwnerDoc.email || '')
            .trim()
            .toLowerCase() === cleanExpectedEmail &&
          existingPreviousOwnerDoc.role === 'business_owner'))
    ) {
      syntheticIdsToRemove.add(previousOwnerUserId);
      removedSyntheticOwnerUserId = previousOwnerUserId;
    }

    for (const prof of profilesByEmail) {
      const profId = String(prof.id || '').trim();
      if (
        profId &&
        profId !== canonicalOwnerUid &&
        isSyntheticServerOwnerId(profId) &&
        prof.businessId === cleanBusinessId &&
        prof.role === 'business_owner'
      ) {
        syntheticIdsToRemove.add(profId);
        if (!removedSyntheticOwnerUserId) {
          removedSyntheticOwnerUserId = profId;
        }
      }
    }

    tx.setDoc(`users/${canonicalOwnerUid}`, canonicalOwnerDoc);
    tx.setDoc(`businesses/${cleanBusinessId}`, updatedBusinessDoc);

    if (typeof tx.deleteDoc === 'function') {
      for (const synId of syntheticIdsToRemove) {
        tx.deleteDoc(`users/${synId}`);
      }
    }

    const idempotencyRecord: Record<string, any> = {
      id: input.idempotencyKey,
      businessId: cleanBusinessId,
      ownerEmail: cleanExpectedEmail,
      previousOwnerUserId: previousOwnerUserId || canonicalOwnerUid,
      canonicalOwnerUid,
      authAccountCreated,
      ...(removedSyntheticOwnerUserId
        ? { removedSyntheticOwnerUserId }
        : {}),
      repairedByUid: verifiedAuth.uid,
      schemaVersion: 6,
      createdAt: nowIso,
    };
    tx.setDoc(idempotencyPath, idempotencyRecord);

    const auditEventId = `aud-owner-repair-${input.idempotencyKey}`;
    tx.setDoc(`businesses/${cleanBusinessId}/audit_events/${auditEventId}`, {
      id: auditEventId,
      businessId: cleanBusinessId,
      userId: verifiedAuth.uid,
      userName: String(callerAdmin.fullName || 'Platform Administrator').slice(
        0,
        120
      ),
      action: 'business_owner_auth_repaired',
      entityType: 'user',
      entityId: canonicalOwnerUid,
      detailsJson: JSON.stringify({
        businessId: cleanBusinessId,
        ownerEmail: cleanExpectedEmail,
        previousOwnerUserId,
        canonicalOwnerUid,
        removedSyntheticOwnerUserId: removedSyntheticOwnerUserId || null,
        authAccountCreated,
        idempotencyKey: input.idempotencyKey,
      }),
      createdAt: nowIso,
    });

    return {
      status: wasAlreadyBound ? 'already_bound' : 'repaired',
      isIdempotentReplay: false,
      authAccountCreated,
      databaseId: dbDriver.databaseId,
      businessId: cleanBusinessId,
      previousOwnerUserId: previousOwnerUserId || canonicalOwnerUid,
      canonicalOwnerUid,
      removedSyntheticOwnerUserId,
      business: updatedBusinessDoc,
      primaryOwner: canonicalOwnerDoc,
    };
  });
}

// ============================================================================
// 2. PRIVILEGED POS TRANSACTION SYNCHRONIZATION (syncPosOperation)
// ============================================================================

export async function executeSyncPosOperation(
  dbDriver: ServerDatabaseDriver,
  auth: CallableAuthContext | null | undefined,
  req: SyncOperationPayload
): Promise<SyncOperationResponse> {
  const expectedDatabaseId = resolveCurrentEnvironment().databaseId;
  if (dbDriver.databaseId !== expectedDatabaseId) {
    throw new Error(
      `DATABASE_CONFIG_MISMATCH: Expected Firestore database "${expectedDatabaseId}", but driver is bound to "${dbDriver.databaseId}".`
    );
  }

  const verifiedAuth = assertVerifiedAuthContext(auth);

  if (
    !req ||
    !isValidEntityId(req.operationId) ||
    !isValidEntityId(req.idempotencyKey) ||
    !isValidEntityId(req.businessId) ||
    !isValidEntityId(req.shopId) ||
    !isValidEntityId(req.entityId)
  ) {
    return {
      outcome: 'rejected_unauthorized',
      status: 'failed',
      databaseId: dbDriver.databaseId,
      errorMessage:
        'INVALID_ARGUMENT: operationId, idempotencyKey, businessId, shopId, and entityId must be valid identifiers.',
    };
  }

  // STEP 0: Hard Quarantine & Demo Guard â€” never allow quarantined or pre-Firebase test sales into Firestore
  const quarantineCheck = isQuarantinedOrDemoOperation({
    operationId: req.operationId,
    entityId: req.entityId,
    businessId: req.businessId,
    shopId: req.shopId,
    status: req.status,
  });
  if (quarantineCheck.blocked) {
    return {
      outcome: 'rejected_unauthorized',
      status: 'failed',
      databaseId: dbDriver.databaseId,
      errorMessage: quarantineCheck.reason,
    };
  }

  return await dbDriver.runTransaction(async (tx) => {
    // STEP 1: Verify caller identity, role, business membership, and shop assignment from trusted Firestore records.
    // Client-supplied role claims (`req.clientClaimedRole`) are completely ignored.
    const callerProfile = await tx.getDoc(`users/${verifiedAuth.uid}`);
    if (!callerProfile) {
      return {
        outcome: 'rejected_unauthorized',
        status: 'failed',
        databaseId: dbDriver.databaseId,
        errorMessage: 'UNAUTHORIZED: Authenticated user profile does not exist in Firestore.',
      };
    }

    if (callerProfile.status !== 'active') {
      return {
        outcome: 'rejected_unauthorized',
        status: 'failed',
        databaseId: dbDriver.databaseId,
        errorMessage: 'FORBIDDEN: Authenticated user account is suspended.',
      };
    }

    // PLATFORM ADMIN SUPPORT SESSION AUTHORIZATION
const isPlatformAdmin = callerProfile.role === 'platform_admin';

let platformSupportSession: Record<string, any> | null = null;

if (isPlatformAdmin) {
  try {
    await assertCallerIsActivePlatformAdmin(tx, verifiedAuth);
  } catch {
    return {
      outcome: 'rejected_unauthorized',
      status: 'failed',
      databaseId: dbDriver.databaseId,
      errorMessage:
        'FORBIDDEN_ROLE_BOUNDARY: Platform Administrator identity is not authorized or active.',
    };
  }

  if (
    typeof req.supportSessionId !== 'string' ||
    !isValidEntityId(req.supportSessionId)
  ) {
    return {
      outcome: 'rejected_unauthorized',
      status: 'failed',
      databaseId: dbDriver.databaseId,
      errorMessage:
        'FORBIDDEN_SUPPORT_SESSION_REQUIRED: An active Platform Admin support session is required.',
    };
  }

  platformSupportSession = await tx.getDoc(
    `platform_support_sessions/${verifiedAuth.uid}`
  );

  if (
    !platformSupportSession ||
    platformSupportSession.adminUid !== verifiedAuth.uid ||
    platformSupportSession.sessionId !== req.supportSessionId ||
    platformSupportSession.status !== 'active' ||
    typeof platformSupportSession.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(platformSupportSession.expiresAt)) ||
    Date.parse(platformSupportSession.expiresAt) <= Date.now() ||
    platformSupportSession.businessId !== req.businessId ||
    platformSupportSession.shopId !== req.shopId
  ) {
    return {
      outcome: 'rejected_unauthorized',
      status: 'failed',
      databaseId: dbDriver.databaseId,
      errorMessage:
        'FORBIDDEN_INVALID_SUPPORT_SESSION: Support session is expired, ended, or outside its authorized business and shop.',
    };
  }

  const supportedSupportOperations =
    (req.entityType === 'sale' &&
      (req.operationType === 'create' || req.operationType === 'return')) ||
    (req.entityType === 'product' &&
      (req.operationType === 'create' || req.operationType === 'update')) ||
    (req.entityType === 'inventory_movement' &&
      (req.operationType === 'create' || req.operationType === 'adjust'));

  if (!supportedSupportOperations) {
    return {
      outcome: 'rejected_unauthorized',
      status: 'failed',
      databaseId: dbDriver.databaseId,
      errorMessage:
        'FORBIDDEN_SUPPORT_OPERATION: This operation is outside the authorized Platform Admin support scope.',
    };
  }
} else if (req.supportSessionId !== undefined) {
  return {
    outcome: 'rejected_unauthorized',
    status: 'failed',
    databaseId: dbDriver.databaseId,
    errorMessage:
      'FORBIDDEN_SUPPORT_SESSION: Non-administrator accounts cannot submit Platform Admin support sessions.',
  };
}

    if (
  !isPlatformAdmin &&
  callerProfile.businessId !== req.businessId
) {
      return {
        outcome: 'rejected_unauthorized',
        status: 'failed',
        databaseId: dbDriver.databaseId,
        errorMessage: `FORBIDDEN_CROSS_BUSINESS: User belongs to "${callerProfile.businessId}" and cannot synchronize data for business "${req.businessId}".`,
      };
    }

    const businessDoc = await tx.getDoc(`businesses/${req.businessId}`);
    if (!businessDoc || businessDoc.status !== 'active') {
      return {
        outcome: 'rejected_unauthorized',
        status: 'failed',
        databaseId: dbDriver.databaseId,
        errorMessage: `FORBIDDEN_TENANT_INACTIVE: Business "${req.businessId}" does not exist or is suspended.`,
      };
    }

    const shopDoc = await tx.getDoc(
      `businesses/${req.businessId}/shops/${req.shopId}`
    );
    if (!shopDoc || shopDoc.businessId !== req.businessId) {
      return {
        outcome: 'rejected_unauthorized',
        status: 'failed',
        databaseId: dbDriver.databaseId,
        errorMessage: `FORBIDDEN_SHOP_MISMATCH: Shop "${req.shopId}" does not exist under business "${req.businessId}".`,
      };
    }

    const assignedShops = Array.isArray(callerProfile.assignedShopIds)
      ? callerProfile.assignedShopIds
      : [];
    if (
  !isPlatformAdmin &&
  callerProfile.role !== 'business_owner' &&
  !assignedShops.includes(req.shopId)
) {
      return {
        outcome: 'rejected_unauthorized',
        status: 'failed',
        databaseId: dbDriver.databaseId,
        errorMessage: `FORBIDDEN_UNASSIGNED_SHOP: User (${callerProfile.role}) is not assigned to shop "${req.shopId}".`,
      };
    }

    if (
  !isPlatformAdmin &&
  req.entityType !== 'sale' &&
  callerProfile.role === 'cashier'
) {
      return {
        outcome: 'rejected_unauthorized',
        status: 'failed',
        databaseId: dbDriver.databaseId,
        errorMessage:
          'FORBIDDEN_INSUFFICIENT_ROLE: Cashiers are only authorized to synchronize POS sales.',
      };
    }

    // STEP 2: Idempotency check â€” prevent duplicate sale creation or double stock deduction
    const syncOpPath = `businesses/${req.businessId}/shops/${req.shopId}/sync_operations/${req.idempotencyKey}`;
    const existingSyncOp = await tx.getDoc(syncOpPath);
    if (existingSyncOp) {
      if (existingSyncOp.outcome === 'acknowledged') {
        return {
          outcome: 'acknowledged',
          status: 'synced',
          databaseId: dbDriver.databaseId,
          ackId: existingSyncOp.ackId || `ack-${req.idempotencyKey}`,
          syncedAt: existingSyncOp.processedAt,
          isDuplicateReplay: true,
        };
      }
      return {
        outcome: existingSyncOp.outcome,
        status:
          existingSyncOp.outcome === 'conflict_requires_review'
            ? 'requires_review'
            : 'failed',
        databaseId: dbDriver.databaseId,
        conflictReason: existingSyncOp.conflictReason,
        isDuplicateReplay: true,
      };
    }

    const nowIso = new Date().toISOString();

    // STEP 3: Sale Creation with Granular Permission, Identity, Arithmetic Validation & Atomic Stock Deduction
      if (req.entityType === 'sale' && req.operationType === 'create') {

	  const sale = req.payload?.sale;
      const items = Array.isArray(req.payload?.items) ? req.payload.items : [];
      const payment = req.payload?.payment;

      if (!sale || items.length === 0) {
        return {
          outcome: 'conflict_requires_review',
          status: 'requires_review',
          databaseId: dbDriver.databaseId,
          conflictReason: 'Malformed sale sync payload: missing sale header or line items.',
        };
      }

      // SECURITY: Validate sale identity and tenant scope.
      if (
        sale.id !== req.entityId ||
        sale.business_id !== req.businessId ||
        sale.shop_id !== req.shopId
      ) {
        return {
          outcome: 'rejected_unauthorized',
          status: 'failed',
          databaseId: dbDriver.databaseId,
          errorMessage:
            'FORBIDDEN_PAYLOAD_SCOPE_MISMATCH: Sale identity, business, or shop does not match the sync request.',
        };
      }

      // SECURITY: Only completed sales may be created through POS synchronization.
      if (sale.status !== 'completed') {
        return {
          outcome: 'rejected_unauthorized',
          status: 'failed',
          databaseId: dbDriver.databaseId,
          errorMessage:
            'FORBIDDEN_INVALID_INITIAL_SALE_STATUS: Only completed sales can be synchronized as new sales.',
        };
      }

      let saleOperatorProfile = callerProfile;

      // Platform Admin Support Mode:
      // Verify the original cashier from the server-side user profile.
      // Never grant the Platform Admin the cashier's permissions.
      if (isPlatformAdmin) {
        if (
          typeof sale.cashier_user_id !== 'string' ||
          !isValidEntityId(sale.cashier_user_id) ||
          sale.cashier_user_id === verifiedAuth.uid
        ) {
          return {
            outcome: 'rejected_unauthorized',
            status: 'failed',
            databaseId: dbDriver.databaseId,
            errorMessage:
              'FORBIDDEN_SUPPORT_CASHIER_IDENTITY: Support-synchronized sale must identify a valid original business operator.',
          };
        }

        const originalCashierProfile = await tx.getDoc(
          `users/${sale.cashier_user_id}`
        );

        if (
          !originalCashierProfile ||
          originalCashierProfile.status !== 'active' ||
          originalCashierProfile.businessId !== req.businessId ||
          !['cashier', 'shop_manager', 'business_owner'].includes(
            originalCashierProfile.role
          )
        ) {
          return {
            outcome: 'rejected_unauthorized',
            status: 'failed',
            databaseId: dbDriver.databaseId,
            errorMessage:
              'FORBIDDEN_SUPPORT_CASHIER_PROFILE: Original sale operator is missing, inactive, or outside the authorized business.',
          };
        }

        if (
          originalCashierProfile.role !== 'business_owner' &&
          (!Array.isArray(originalCashierProfile.assignedShopIds) ||
            !originalCashierProfile.assignedShopIds.includes(req.shopId))
        ) {
          return {
            outcome: 'rejected_unauthorized',
            status: 'failed',
            databaseId: dbDriver.databaseId,
            errorMessage:
              'FORBIDDEN_SUPPORT_CASHIER_SHOP: Original sale operator is not assigned to this shop.',
          };
        }

        saleOperatorProfile = originalCashierProfile;
      } else if (
        callerProfile.role !== 'business_owner' &&
        sale.cashier_user_id !== verifiedAuth.uid
      ) {
        return {
          outcome: 'rejected_unauthorized',
          status: 'failed',
          databaseId: dbDriver.databaseId,
          errorMessage:
            'FORBIDDEN_CASHIER_IDENTITY_MISMATCH: Operator cannot synchronize a sale attributed to a different cashierUserId.',
        };
      }

      // Require the actual sale operator to have sales permission.
      if (
        !callerHasPermission(saleOperatorProfile, [
          'process_sales',
          'process_sale',
          'pos_checkout',
        ])
      ) {
        return {
          outcome: 'rejected_unauthorized',
          status: 'failed',
          databaseId: dbDriver.databaseId,
          errorMessage:
            'FORBIDDEN_MISSING_PERMISSION: Original sale operator does not have permission (process_sales) to synchronize POS sales.',
        };
      }

      // Require the actual sale operator to have discount permission.
      if (
        Number(sale.discount_amount_kobo || 0) > 0 &&
        !callerHasPermission(saleOperatorProfile, [
          'apply_discounts',
          'apply_discount',
        ])
      ) {
        return {
          outcome: 'rejected_unauthorized',
          status: 'failed',
          databaseId: dbDriver.databaseId,
          errorMessage:
            'FORBIDDEN_MISSING_PERMISSION: Original sale operator does not have permission (apply_discounts) to apply sale discounts.',
        };
      }


      // Check if sale document already exists under entityId (secondary idempotency guard)
      const saleDocPath = `businesses/${req.businessId}/shops/${req.shopId}/sales/${sale.id}`;
      const existingSaleDoc = await tx.getDoc(saleDocPath);
      if (existingSaleDoc) {
        const ackId = existingSaleDoc.syncAckId || `ack-${req.idempotencyKey}`;
        return {
          outcome: 'acknowledged',
          status: 'synced',
          databaseId: dbDriver.databaseId,
          ackId,
          syncedAt: existingSaleDoc.syncedAt || nowIso,
          isDuplicateReplay: true,
        };
      }

      // Validate line item quantities and monetary totals
      let computedSubtotalKobo = 0;
      for (const line of items) {
        if (
          !line ||
          !isValidEntityId(line.product_id) ||
          !Number.isInteger(line.quantity) ||
          line.quantity <= 0 ||
          !Number.isInteger(line.unit_price_kobo) ||
          line.unit_price_kobo < 0 ||
          !Number.isInteger(line.line_total_kobo) ||
          line.line_total_kobo !== line.unit_price_kobo * line.quantity
        ) {
          const reason = `Invalid line item math or quantity for product "${line?.product_name || line?.product_id}".`;
          return recordSyncConflictInTransaction(
            tx,
            dbDriver.databaseId,
            req,
            verifiedAuth.uid,
            String(callerProfile.fullName || 'Operator'),
            reason,
            nowIso
          );
        }
        computedSubtotalKobo += line.line_total_kobo;
      }

      const expectedTotalKobo =
        computedSubtotalKobo -
        Number(sale.discount_amount_kobo || 0) +
        Number(sale.tax_amount_kobo || 0);

      if (
        sale.subtotal_kobo !== computedSubtotalKobo ||
        sale.total_amount_kobo !== expectedTotalKobo ||
        sale.total_amount_kobo < 0 ||
        sale.discount_amount_kobo < 0 ||
        sale.tax_amount_kobo < 0
      ) {
        const reason = `Sale monetary total mismatch: expected subtotal=${computedSubtotalKobo}, total=${expectedTotalKobo}, received subtotal=${sale.subtotal_kobo}, total=${sale.total_amount_kobo}.`;
        return recordSyncConflictInTransaction(
          tx,
          dbDriver.databaseId,
          req,
          verifiedAuth.uid,
          String(callerProfile.fullName || 'Operator'),
          reason,
          nowIso
        );
      }

      // SEC-02: Enforce tender and change due arithmetic
      const isValidTenderChange =
        sale.payment_method === 'credit' ||
        (Number.isInteger(sale.amount_tendered_kobo) &&
          Number.isInteger(sale.change_due_kobo) &&
          sale.amount_tendered_kobo >= sale.total_amount_kobo &&
          sale.change_due_kobo ===
            sale.amount_tendered_kobo - sale.total_amount_kobo);

      if (!isValidTenderChange) {
        const reason = `Sale tender/change arithmetic mismatch: total=${sale.total_amount_kobo}, tendered=${sale.amount_tendered_kobo}, changeDue=${sale.change_due_kobo}.`;
        return recordSyncConflictInTransaction(
          tx,
          dbDriver.databaseId,
          req,
          verifiedAuth.uid,
          String(callerProfile.fullName || 'Operator'),
          reason,
          nowIso
        );
      }

      // Validate current cloud stock for every line item BEFORE deducting anything
      const productDocsToUpdate: Array<{
        path: string;
        doc: Record<string, any>;
        line: SyncPosSaleItemPayload;
        previousQty: number;
        newQty: number;
      }> = [];

      for (const line of items) {
        const productPath = `businesses/${req.businessId}/shops/${req.shopId}/products/${line.product_id}`;
        const productDoc = await tx.getDoc(productPath);

        if (!productDoc || productDoc.shopId !== req.shopId || productDoc.businessId !== req.businessId) {
          const reason = `Product "${line.product_name}" (${line.sku}) not found in shop "${req.shopId}" cloud catalogue.`;
          return recordSyncConflictInTransaction(
            tx,
            dbDriver.databaseId,
            req,
            verifiedAuth.uid,
            String(callerProfile.fullName || 'Operator'),
            reason,
            nowIso
          );
        }

        const currentStock = Number(productDoc.stockQuantity ?? 0);
        if (currentStock < line.quantity) {
          const reason = `Stock conflict for "${productDoc.name}" (${productDoc.sku}): cloud stock is ${currentStock}, offline sale requested ${line.quantity}. Completed local sale preserved for manager review.`;
          return recordSyncConflictInTransaction(
            tx,
            dbDriver.databaseId,
            req,
            verifiedAuth.uid,
            String(callerProfile.fullName || 'Operator'),
            reason,
            nowIso
          );
        }

        productDocsToUpdate.push({
          path: productPath,
          doc: productDoc,
          line,
          previousQty: currentStock,
          newQty: currentStock - line.quantity,
        });
      }

      // All stock checks passed â€” atomically deduct stock, record inventory movements, sale, payment, sync op, and audit event
      for (const itemUpdate of productDocsToUpdate) {
        tx.setDoc(itemUpdate.path, {
          ...itemUpdate.doc,
          stockQuantity: itemUpdate.newQty,
          updatedAt: nowIso,
        });

        const movementId = `mov-${sale.id}-${itemUpdate.line.product_id}`;
        tx.setDoc(
          `businesses/${req.businessId}/shops/${req.shopId}/inventory_movements/${movementId}`,
          {
            id: movementId,
            shopId: req.shopId,
            businessId: req.businessId,
            productId: itemUpdate.line.product_id,
            productName: itemUpdate.line.product_name,
            productSku: itemUpdate.line.sku,
            type: 'sale_deduction',
            quantityDelta: -itemUpdate.line.quantity,
            previousQuantity: itemUpdate.previousQty,
            newQuantity: itemUpdate.newQty,
            reason: `Cloud Synced Sale ${sale.receipt_number}`,
            referenceId: sale.id,
            performedByUserId: verifiedAuth.uid,
            performedByName: String(callerProfile.fullName || sale.cashier_name),
            schemaVersion: 6,
            createdAt: nowIso,
          }
        );
      }

      const ackId = `ack-${req.idempotencyKey}-${Date.now()}`;
      const firestoreSaleDoc: Record<string, any> = {
        id: sale.id,
        shopId: req.shopId,
        businessId: req.businessId,
        receiptNumber: sale.receipt_number,
        terminalId: sale.terminal_id,
        cashierUserId: sale.cashier_user_id,
        cashierName: sale.cashier_name,
        subtotalKobo: sale.subtotal_kobo,
        discountAmountKobo: sale.discount_amount_kobo,
        taxRatePercent: sale.tax_rate_percent,
        taxAmountKobo: sale.tax_amount_kobo,
        totalAmountKobo: sale.total_amount_kobo,
        amountTenderedKobo: sale.amount_tendered_kobo,
        changeDueKobo: sale.change_due_kobo,
        paymentMethod: sale.payment_method,
        status: 'completed',
        idempotencyKey: req.idempotencyKey,
        syncAckId: ackId,
        schemaVersion: 6,
        createdAt: sale.created_at,
        syncedAt: nowIso,
      };
      tx.setDoc(saleDocPath, firestoreSaleDoc);

      for (let i = 0; i < items.length; i += 1) {
        const line = items[i];
        const lineId = isValidEntityId(line.id)
          ? line.id
          : `line-${sale.id}-${i + 1}`;
        tx.setDoc(`${saleDocPath}/items/${lineId}`, {
          id: lineId,
          saleId: sale.id,
          shopId: req.shopId,
          businessId: req.businessId,
          productId: line.product_id,
          sku: line.sku,
          barcode: line.barcode || line.sku,
          productName: line.product_name,
          unit: line.unit || 'Unit',
          unitPriceKobo: line.unit_price_kobo,
          costPriceKobo: line.cost_price_kobo,
          quantity: line.quantity,
          lineTotalKobo: line.line_total_kobo,
          schemaVersion: 6,
          createdAt: sale.created_at || nowIso,
        });
      }

      const paymentId =
        payment && isValidEntityId(payment.id) ? payment.id : `pay-${sale.id}`;
      tx.setDoc(
        `businesses/${req.businessId}/shops/${req.shopId}/payments/${paymentId}`,
        {
          id: paymentId,
          shopId: req.shopId,
          businessId: req.businessId,
          referenceType: 'sale',
          referenceId: sale.id,
          amountKobo: sale.total_amount_kobo,
          paymentMethod: sale.payment_method,
          recordedByUserId: verifiedAuth.uid,
          recordedByName: String(callerProfile.fullName || sale.cashier_name),
          schemaVersion: 6,
          createdAt: nowIso,
        }
      );

      tx.setDoc(syncOpPath, {
        id: req.idempotencyKey,
        businessId: req.businessId,
        shopId: req.shopId,
        entityType: 'sale',
        entityId: sale.id,
        operationType: 'create',
        actorUserId: verifiedAuth.uid,
        outcome: 'acknowledged',
        ackId,
        schemaVersion: req.schemaVersion || 6,
        processedAt: nowIso,
      });

      const auditId = `aud-sync-${req.idempotencyKey}`;
      tx.setDoc(`businesses/${req.businessId}/audit_events/${auditId}`, {
        id: auditId,
        businessId: req.businessId,
        shopId: req.shopId,
        userId: verifiedAuth.uid,
        userName: String(callerProfile.fullName || sale.cashier_name).slice(0, 120),
        action: 'cloud_sale_synced',
        entityType: 'sale',
        entityId: sale.id,
        detailsJson: JSON.stringify({
          receiptNumber: sale.receipt_number,
          totalAmountKobo: sale.total_amount_kobo,
          idempotencyKey: req.idempotencyKey,
          ackId,
        }),
        createdAt: nowIso,
      });

      return {
        outcome: 'acknowledged',
        status: 'synced',
        databaseId: dbDriver.databaseId,
        ackId,
        syncedAt: nowIso,
        isDuplicateReplay: false,
      };
    }

    // STEP 3B: Server-Authoritative Receipt Return & Stock Restoration
    if (req.entityType === 'sale' && req.operationType === 'return') {
      const saleId = req.entityId;
      const saleDocPath = `businesses/${req.businessId}/shops/${req.shopId}/sales/${saleId}`;
      const existingSale = await tx.getDoc(saleDocPath);

      if (!existingSale) {
        return {
          outcome: 'conflict_requires_review',
          status: 'requires_review',
          databaseId: dbDriver.databaseId,
          conflictReason: `Sale document "${saleId}" not found for return.`,
        };
      }

      if (
        !isPlatformAdmin &&
        !callerHasPermission(callerProfile, ['process_returns']) &&
        !['shop_manager', 'business_owner'].includes(callerProfile.role)
      ) {
        return {
          outcome: 'rejected_unauthorized',
          status: 'failed',
          databaseId: dbDriver.databaseId,
          errorMessage: 'FORBIDDEN: User lacks permission to process receipt returns.',
        };
      }

      const returnPayload = (req.payload as any)?.saleReturn || req.payload;
      const returnedItems = Array.isArray(returnPayload?.returnedItems) ? returnPayload.returnedItems : [];
      const updatedSale = returnPayload?.updatedSale;
      const reason = String(returnPayload?.reason || 'Customer receipt return').slice(0, 200);

      if (!updatedSale || returnedItems.length === 0) {
        return {
          outcome: 'conflict_requires_review',
          status: 'requires_review',
          databaseId: dbDriver.databaseId,
          conflictReason: 'Malformed receipt return payload: missing updatedSale or returnedItems.',
        };
      }

      // Restore product stock and record inventory movement for each returned item
      for (const retItem of returnedItems) {
        const prodId = retItem.productId || retItem.product_id;
        const returnQty = Math.floor(Number(retItem.returnedQuantity || 0));
        if (!prodId || returnQty <= 0) continue;

        const prodPath = `businesses/${req.businessId}/shops/${req.shopId}/products/${prodId}`;
        const prodDoc = await tx.getDoc(prodPath);
        if (prodDoc) {
          const prevStock = Number(prodDoc.stockQuantity || 0);
          const newStock = prevStock + returnQty;
          tx.setDoc(prodPath, {
            ...prodDoc,
            stockQuantity: newStock,
            updatedAt: nowIso,
          });

          const movId = `mov-ret-${req.idempotencyKey}-${prodId}`;
          tx.setDoc(`businesses/${req.businessId}/shops/${req.shopId}/inventory_movements/${movId}`, {
            id: movId,
            shopId: req.shopId,
            businessId: req.businessId,
            productId: prodId,
            productName: String(retItem.productName || prodDoc.name || 'Returned Item').slice(0, 160),
            productSku: String(retItem.sku || prodDoc.sku || '').slice(0, 80),
            type: 'return_in',
            quantityDelta: returnQty,
            previousQuantity: prevStock,
            newQuantity: newStock,
            reason: `Receipt #${existingSale.receiptNumber} Return: ${reason}`,
            referenceId: saleId,
            performedByUserId: verifiedAuth.uid,
            performedByName: String(callerProfile.fullName || 'Operator').slice(0, 120),
            schemaVersion: 6,
            createdAt: nowIso,
          });
        }
      }

      // Update the sale document in Cloud Firestore with reduced totals and line items
      const newSubtotalKobo = Math.round(Number(updatedSale.subtotal || 0) * 100);
      const newDiscountKobo = Math.round(Number(updatedSale.discountAmount || 0) * 100);
      const newTaxKobo = Math.round(Number(updatedSale.taxAmount || 0) * 100);
      const newTotalKobo = Math.round(Number(updatedSale.totalAmount || 0) * 100);
      const isFullRefund = newTotalKobo <= 0 || (Array.isArray(updatedSale.items) && updatedSale.items.every((it: any) => it.quantity === 0));

      const updatedSaleDoc = {
        ...existingSale,
        subtotalKobo: newSubtotalKobo,
        discountAmountKobo: newDiscountKobo,
        taxAmountKobo: newTaxKobo,
        totalAmountKobo: newTotalKobo,
        status: isFullRefund ? 'refunded' : 'completed',
        notes: `${existingSale.notes ? existingSale.notes + ' | ' : ''}Return: ${reason}`.slice(0, 500),
        items: updatedSale.items,
        updatedAt: nowIso,
      };
      tx.setDoc(saleDocPath, updatedSaleDoc);

      // Record audit event
      const auditId = `aud-return-${req.idempotencyKey}`;
      tx.setDoc(`businesses/${req.businessId}/audit_events/${auditId}`, {
        id: auditId,
        businessId: req.businessId,
        shopId: req.shopId,
        userId: verifiedAuth.uid,
        userName: String(callerProfile.fullName || 'Operator').slice(0, 120),
        action: 'receipt_return_processed',
        entityType: 'sale',
        entityId: saleId,
        detailsJson: JSON.stringify({
          receiptNumber: existingSale.receiptNumber,
          returnedItemsCount: returnedItems.length,
          previousTotalKobo: existingSale.totalAmountKobo,
          newTotalKobo,
          reason,
        }),
        createdAt: nowIso,
      });

      const ackId = `ack-${req.idempotencyKey}-${Date.now()}`;
      tx.setDoc(syncOpPath, {
        id: req.idempotencyKey,
        businessId: req.businessId,
        shopId: req.shopId,
        entityType: req.entityType,
        entityId: req.entityId,
        operationType: req.operationType,
        actorUserId: verifiedAuth.uid,
        processedAt: nowIso,
        outcome: 'acknowledged',
        ackId,
        schemaVersion: 6,
      });

      return {
        outcome: 'acknowledged',
        status: 'synced',
        databaseId: dbDriver.databaseId,
        ackId,
        syncedAt: nowIso,
        isDuplicateReplay: false,
      };
    }

    // STEP 4: Authorized Shop Catalogue Product Synchronization (SEC-06 & SEC-10)
    if (
      req.entityType === 'product' &&
      (req.operationType === 'create' || req.operationType === 'update')
    ) {
      if (
        !callerHasPermission(callerProfile, [
          'manage_products',
          'manage_catalogue',
          'manage_inventory',
        ])
      ) {
        return {
          outcome: 'rejected_unauthorized',
          status: 'failed',
          databaseId: dbDriver.databaseId,
          errorMessage:
            'FORBIDDEN_MISSING_PERMISSION: Caller does not have permission (manage_products) to synchronize shop catalogue products.',
        };
      }

      const prod = req.payload?.product;
      if (
        !prod ||
        typeof prod !== 'object' ||
        (prod.id && prod.id !== req.entityId) ||
        (prod.business_id && prod.business_id !== req.businessId) ||
        (prod.businessId && prod.businessId !== req.businessId) ||
        (prod.shop_id && prod.shop_id !== req.shopId) ||
        (prod.shopId && prod.shopId !== req.shopId)
      ) {
        return {
          outcome: 'rejected_unauthorized',
          status: 'failed',
          databaseId: dbDriver.databaseId,
          errorMessage:
            'UNSUPPORTED_SYNC_OPERATION: Product synchronization requires a valid product payload matching the target businessId, shopId, and entityId.',
        };
      }

      const productPath = `businesses/${req.businessId}/shops/${req.shopId}/products/${req.entityId}`;
      const existingProduct = await tx.getDoc(productPath);
      tx.setDoc(productPath, {
        ...(existingProduct || {}),
        ...prod,
        id: req.entityId,
        businessId: req.businessId,
        shopId: req.shopId,
        updatedAt: nowIso,
      });

      const ackId = `ack-${req.idempotencyKey}-${Date.now()}`;
      tx.setDoc(syncOpPath, {
        id: req.idempotencyKey,
        businessId: req.businessId,
        shopId: req.shopId,
        entityType: 'product',
        entityId: req.entityId,
        operationType: req.operationType,
        actorUserId: verifiedAuth.uid,
        outcome: 'acknowledged',
        ackId,
        schemaVersion: req.schemaVersion || 6,
        processedAt: nowIso,
      });

      return {
        outcome: 'acknowledged',
        status: 'synced',
        databaseId: dbDriver.databaseId,
        ackId,
        syncedAt: nowIso,
        isDuplicateReplay: false,
      };
    }

    // STEP 5: Authorized Inventory Movement Synchronization (SEC-06 & SEC-10)
    if (
      req.entityType === 'inventory_movement' &&
      (req.operationType === 'create' || req.operationType === 'adjust')
    ) {
      if (
        !callerHasPermission(callerProfile, [
          'adjust_inventory',
          'adjust_stock',
        ])
      ) {
        return {
          outcome: 'rejected_unauthorized',
          status: 'failed',
          databaseId: dbDriver.databaseId,
          errorMessage:
            'FORBIDDEN_MISSING_PERMISSION: Caller does not have permission (adjust_inventory) to synchronize stock adjustments.',
        };
      }

      const mov = req.payload?.movement;
      if (
        !mov ||
        typeof mov !== 'object' ||
        (mov.id && mov.id !== req.entityId) ||
        (mov.business_id && mov.business_id !== req.businessId) ||
        (mov.businessId && mov.businessId !== req.businessId) ||
        (mov.shop_id && mov.shop_id !== req.shopId) ||
        (mov.shopId && mov.shopId !== req.shopId)
      ) {
        return {
          outcome: 'rejected_unauthorized',
          status: 'failed',
          databaseId: dbDriver.databaseId,
          errorMessage:
            'UNSUPPORTED_SYNC_OPERATION: Inventory movement synchronization requires a valid movement payload matching the target businessId, shopId, and entityId.',
        };
      }

      const movPath = `businesses/${req.businessId}/shops/${req.shopId}/inventory_movements/${req.entityId}`;
      tx.setDoc(movPath, {
        ...mov,
        id: req.entityId,
        businessId: req.businessId,
        shopId: req.shopId,
        performedByUserId: verifiedAuth.uid,
        createdAt: mov.createdAt || mov.created_at || nowIso,
      });

      const ackId = `ack-${req.idempotencyKey}-${Date.now()}`;
      tx.setDoc(syncOpPath, {
        id: req.idempotencyKey,
        businessId: req.businessId,
        shopId: req.shopId,
        entityType: 'inventory_movement',
        entityId: req.entityId,
        operationType: req.operationType,
        actorUserId: verifiedAuth.uid,
        outcome: 'acknowledged',
        ackId,
        schemaVersion: req.schemaVersion || 6,
        processedAt: nowIso,
      });

      return {
        outcome: 'acknowledged',
        status: 'synced',
        databaseId: dbDriver.databaseId,
        ackId,
        syncedAt: nowIso,
        isDuplicateReplay: false,
      };
    }

    // SEC-10: Explicitly reject unsupported or unapplied sync operations instead of returning a misleading 'acknowledged' receipt
    return {
      outcome: 'rejected_unauthorized',
      status: 'failed',
      databaseId: dbDriver.databaseId,
      errorMessage: `UNSUPPORTED_SYNC_OPERATION: Operation "${req.entityType}:${req.operationType}" is not supported by syncPosOperation or is missing required verified entity payload.`,
    };
  });
}

function recordSyncConflictInTransaction(
  tx: ServerTransactionContext,
  databaseId: string,
  req: SyncOperationPayload,
  actorUserId: string,
  actorUserName: string,
  conflictReason: string,
  nowIso: string
): SyncOperationResponse {
  const syncOpPath = `businesses/${req.businessId}/shops/${req.shopId}/sync_operations/${req.idempotencyKey}`;
  tx.setDoc(syncOpPath, {
    id: req.idempotencyKey,
    businessId: req.businessId,
    shopId: req.shopId,
    entityType: req.entityType,
    entityId: req.entityId,
    operationType: req.operationType,
    actorUserId,
    outcome: 'conflict_requires_review',
    conflictReason: conflictReason.slice(0, 400),
    schemaVersion: req.schemaVersion || 6,
    processedAt: nowIso,
  });

  const auditId = `aud-conflict-${req.idempotencyKey}`;
  tx.setDoc(`businesses/${req.businessId}/audit_events/${auditId}`, {
    id: auditId,
    businessId: req.businessId,
    shopId: req.shopId,
    userId: actorUserId,
    userName: actorUserName.slice(0, 120),
    action: 'cloud_sync_stock_conflict',
    entityType: req.entityType,
    entityId: req.entityId,
    detailsJson: JSON.stringify({
      idempotencyKey: req.idempotencyKey,
      conflictReason,
    }),
    createdAt: nowIso,
  });

  return {
    outcome: 'conflict_requires_review',
    status: 'requires_review',
    databaseId,
    conflictReason,
    isDuplicateReplay: false,
  };
}

// ============================================================================
// 3. AUTHORIZED STAFF INVITATION & TENANT STATUS FUNCTIONS
// ============================================================================

export async function executeInviteAuthorizedStaff(
  dbDriver: ServerDatabaseDriver,
  auth: CallableAuthContext | null | undefined,
  input: InviteAuthorizedStaffRequest,
  authDirectory?: ServerAuthDirectory
): Promise<{
  status: 'created';
  isIdempotentReplay?: boolean;
  staffUser: Record<string, any>;
}> {
  const expectedDatabaseId = resolveCurrentEnvironment().databaseId;
  if (dbDriver.databaseId !== expectedDatabaseId) {
    throw new Error(
      `DATABASE_CONFIG_MISMATCH: Expected Firestore database "${expectedDatabaseId}", but driver is bound to "${dbDriver.databaseId}".`
    );
  }

  const verifiedAuth = assertVerifiedAuthContext(auth);

  if (!input || typeof input !== 'object' || !isValidEntityId(input.idempotencyKey)) {
    throw new Error(
      'INVALID_ARGUMENT: A valid idempotencyKey is required for staff invitation.'
    );
  }

  if (
    typeof input.businessId !== 'string' ||
    !isValidEntityId(input.businessId) ||
    KNOWN_DEMO_BUSINESS_IDS.has(input.businessId) ||
    VALID_PLATFORM_ADMIN_SENTINELS.has(input.businessId) ||
    input.businessId === PRE_FIREBASE_TEST_BUSINESS_ID ||
    PRE_FIREBASE_BIZ_REGEX.test(input.businessId)
  ) {
    throw new Error(
      `INVALID_ARGUMENT: Business ID "${String(input.businessId ?? '')}" is invalid, reserved, or quarantined.`
    );
  }

  if (
    typeof input.role !== 'string' ||
    ((input.role as string) !== 'shop_manager' && (input.role as string) !== 'cashier')
  ) {
    throw new Error(
      'PERMISSION_DENIED: Staff provisioning can only assign role "shop_manager" or "cashier" (never "business_owner" or "platform_admin").'
    );
  }

  if (typeof input.fullName !== 'string') {
    throw new Error(
      'INVALID_ARGUMENT: Staff fullName must be between 2 and 120 characters.'
    );
  }
  const cleanFullName = input.fullName.trim();
  if (cleanFullName.length < 2 || cleanFullName.length > 120) {
    throw new Error(
      'INVALID_ARGUMENT: Staff fullName must be between 2 and 120 characters.'
    );
  }

  if (typeof input.email !== 'string') {
    throw new Error('INVALID_ARGUMENT: A valid staff email address is required.');
  }
  const cleanEmail = input.email.trim().toLowerCase();
  if (!isValidEmailAddress(cleanEmail)) {
    throw new Error('INVALID_ARGUMENT: A valid staff email address is required.');
  }
  if (isAuthorizedPlatformAdminEmail(cleanEmail)) {
    throw new Error(
      `PERMISSION_DENIED: Platform Administrator identity (${cleanEmail}) cannot be invited as tenant staff.`
    );
  }

  if (
    !Array.isArray(input.assignedShopIds) ||
    input.assignedShopIds.length === 0 ||
    input.assignedShopIds.length > 50
  ) {
    throw new Error(
      'INVALID_ARGUMENT: assignedShopIds must be a non-empty array of between 1 and 50 shop IDs.'
    );
  }
  for (const shopId of input.assignedShopIds) {
    if (
      typeof shopId !== 'string' ||
      !isValidEntityId(shopId) ||
      KNOWN_DEMO_SHOP_IDS.has(shopId) ||
      shopId === PRE_FIREBASE_TEST_SHOP_ID ||
      PRE_FIREBASE_SHOP_REGEX.test(shopId)
    ) {
      throw new Error(
        `INVALID_ARGUMENT: Shop ID "${String(shopId)}" is invalid, reserved, or quarantined.`
      );
    }
  }
  const dedupedAssignedShopIds = Array.from(new Set(input.assignedShopIds));

  // Enforce strict role-specific permission allowlist at runtime
  const validatedPermissions = validateRoleSpecificStaffPermissions(
    input.role,
    input.permissions
  );

  if (input.staffUid !== undefined) {
    if (typeof input.staffUid !== 'string' || !isValidEntityId(input.staffUid)) {
      throw new Error('INVALID_ARGUMENT: Provided staffUid has an invalid format.');
    }
    if (KNOWN_DEMO_USER_IDS.has(input.staffUid)) {
      throw new Error(
        `INVALID_ARGUMENT: Provided staffUid "${input.staffUid}" is a reserved demo identifier.`
      );
    }
    if (input.staffUid === verifiedAuth.uid) {
      throw new Error(
        'PERMISSION_DENIED: Caller cannot overwrite their own user profile via staff invitation.'
      );
    }
  }

  // Optional Firebase Auth directory cross-check when available to prevent UID/email hijacking
  let authUserForEmail: { uid: string; email: string; emailVerified?: boolean } | null = null;
  if (authDirectory) {
    if (input.staffUid !== undefined) {
      const authByUid = await authDirectory.getUserByUid(input.staffUid);
      if (authByUid && authByUid.email.trim().toLowerCase() !== cleanEmail) {
        throw new Error(
          `PERMISSION_DENIED: Provided staffUid "${input.staffUid}" belongs to a different Firebase Authentication account and cannot be overwritten.`
        );
      }
    }
    authUserForEmail = await authDirectory.getUserByEmail(cleanEmail);
    if (
      authUserForEmail &&
      input.staffUid !== undefined &&
      authUserForEmail.uid !== input.staffUid
    ) {
      throw new Error(
        `PERMISSION_DENIED: Staff email "${cleanEmail}" is registered in Firebase Authentication with UID "${authUserForEmail.uid}", which does not match provided staffUid "${input.staffUid}".`
      );
    }
  }

  return await dbDriver.runTransaction(async (tx) => {
    const caller = await tx.getDoc(`users/${verifiedAuth.uid}`);
    if (!caller || caller.status !== 'active') {
      throw new Error('PERMISSION_DENIED: Active caller profile required.');
    }

    const isAuthorizedOwner =
  caller.role === 'business_owner' && caller.businessId === input.businessId;
const isAuthorizedAdmin = caller.role === 'platform_admin';

let platformSupportSession: Record<string, any> | null = null;

if (isAuthorizedAdmin) {
  await assertCallerIsActivePlatformAdmin(tx, verifiedAuth);

  if (
    typeof input.supportSessionId !== 'string' ||
    !isValidEntityId(input.supportSessionId)
  ) {
    throw new Error(
      'PERMISSION_DENIED: Platform Admin staff invitations require an active support session.'
    );
  }

  platformSupportSession = await tx.getDoc(
    `platform_support_sessions/${verifiedAuth.uid}`
  );

  if (
    !platformSupportSession ||
    platformSupportSession.adminUid !== verifiedAuth.uid ||
    platformSupportSession.sessionId !== input.supportSessionId ||
    platformSupportSession.status !== 'active' ||
    typeof platformSupportSession.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(platformSupportSession.expiresAt)) ||
    Date.parse(platformSupportSession.expiresAt) <= Date.now() ||
    platformSupportSession.businessId !== input.businessId ||
    !isValidEntityId(platformSupportSession.shopId)
  ) {
    throw new Error(
      'PERMISSION_DENIED: The support session is invalid, expired, or does not authorize this business.'
    );
  }

  if (
    !Array.isArray(input.assignedShopIds) ||
    input.assignedShopIds.length !== 1 ||
    input.assignedShopIds[0] !== platformSupportSession.shopId
  ) {
    throw new Error(
      'PERMISSION_DENIED: Platform Admin staff invitations must be restricted to the active support shop.'
    );
  }
}

if (!isAuthorizedOwner && !isAuthorizedAdmin) {
  throw new Error(
    'PERMISSION_DENIED: Only the Business Owner of this business or a Platform Administrator can provision staff.'
  );
}

    if (!isAuthorizedOwner && !isAuthorizedAdmin) {
      throw new Error(
        'PERMISSION_DENIED: Only the Business Owner of this business or a Platform Administrator can provision staff.'
      );
    }

    const businessDoc = await tx.getDoc(`businesses/${input.businessId}`);
    if (!businessDoc || businessDoc.status !== 'active') {
      throw new Error(
        `PERMISSION_DENIED: Business "${input.businessId}" does not exist or is suspended.`
      );
    }

    // Check idempotency ledger first so legitimate retries return the original record
    // while rejecting any attempt to reuse an idempotencyKey with different parameters.
    const staffKeyPath = `businesses/${input.businessId}/staff_provisioning_keys/${input.idempotencyKey}`;
    const existingStaffKey = await tx.getDoc(staffKeyPath);
    if (existingStaffKey) {
      const sameBusiness = existingStaffKey.businessId === input.businessId;
      const sameEmail =
        String(existingStaffKey.staffEmail || '').trim().toLowerCase() === cleanEmail;
      const sameRole = existingStaffKey.role === input.role;
      const sameUid =
        input.staffUid === undefined || existingStaffKey.staffUid === input.staffUid;

      if (!sameBusiness || !sameEmail || !sameRole || !sameUid) {
        throw new Error(
          `ALREADY_EXISTS: Idempotency key "${input.idempotencyKey}" was already used for a different staff provisioning request and cannot be reused with modified parameters.`
        );
      }

      const existingStaffUser = await tx.getDoc(
        `users/${existingStaffKey.staffUid}`
      );
      if (existingStaffUser) {
        return {
          status: 'created',
          isIdempotentReplay: true,
          staffUser: existingStaffUser,
        };
      }
      throw new Error(
        `ALREADY_EXISTS: Idempotency key "${input.idempotencyKey}" has already been consumed.`
      );
    }

    for (const shopId of dedupedAssignedShopIds) {
      const shopDoc = await tx.getDoc(
        `businesses/${input.businessId}/shops/${shopId}`
      );
      if (!shopDoc || shopDoc.businessId !== input.businessId) {
        throw new Error(
          `PERMISSION_DENIED: Shop "${shopId}" does not belong to business "${input.businessId}".`
        );
      }
    }

    const resolvedAuthUid =
      authUserForEmail && isValidEntityId(authUserForEmail.uid)
        ? authUserForEmail.uid
        : undefined;

    const staffUid =
      input.staffUid && isValidEntityId(input.staffUid)
        ? input.staffUid
        : resolvedAuthUid ||
          `usr-staff-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    if (staffUid === verifiedAuth.uid || KNOWN_DEMO_USER_IDS.has(staffUid)) {
      throw new Error(
        'PERMISSION_DENIED: Caller cannot overwrite their own or a reserved user profile via staff invitation.'
      );
    }

    // SEC-09: Prevent overwriting any existing user profile by UID
    const existingUserById = await tx.getDoc(`users/${staffUid}`);
    if (existingUserById) {
      if (existingUserById.businessId !== input.businessId) {
        throw new Error(
          `PERMISSION_DENIED: Target UID "${staffUid}" belongs to another tenant and cannot be overwritten.`
        );
      }
      if (
        existingUserById.role === 'platform_admin' ||
        existingUserById.role === 'business_owner'
      ) {
        throw new Error(
          `PERMISSION_DENIED: Target UID "${staffUid}" belongs to a privileged account (${existingUserById.role}) and cannot be overwritten.`
        );
      }
      throw new Error(
        `ALREADY_EXISTS: Staff user profile "${staffUid}" already exists in business "${input.businessId}" and cannot be overwritten.`
      );
    }

    // SEC-09: Prevent duplicate email or cross-tenant account hijacking by email
    const existingUsersByEmail = await tx.queryDocsByField(
      'users',
      'email',
      cleanEmail
    );
    if (existingUsersByEmail.length > 0) {
      const existingByEmail = existingUsersByEmail[0];
      if (existingByEmail.role === 'platform_admin') {
        throw new Error(
          'PERMISSION_DENIED: Cannot invite a Platform Administrator account as tenant staff.'
        );
      }
      throw new Error(
        `ALREADY_EXISTS: Email "${cleanEmail}" is already registered to user "${existingByEmail.id}" in business "${existingByEmail.businessId}".`
      );
    }

    const nowIso = new Date().toISOString();

    const cleanRoleLabel =
      typeof input.roleLabel === 'string' && input.roleLabel.trim().length > 0
        ? input.roleLabel.trim().slice(0, 100)
        : input.role === 'shop_manager'
        ? 'Shop Manager'
        : 'Cashier';

    const staffDoc: Record<string, any> = {
      id: staffUid,
      businessId: input.businessId,
      username: cleanEmail.split('@')[0].slice(0, 80) || staffUid,
      email: cleanEmail,
      fullName: cleanFullName,
      role: input.role,
      roleLabel: cleanRoleLabel,
      assignedShopIds: dedupedAssignedShopIds,
      permissions: validatedPermissions,
      status: 'active',
      schemaVersion: 6,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    tx.setDoc(`users/${staffUid}`, staffDoc);
    tx.setDoc(staffKeyPath, {
      id: input.idempotencyKey,
      businessId: input.businessId,
      staffUid,
      staffEmail: cleanEmail,
      role: input.role,
      invitedByUid: verifiedAuth.uid,
      schemaVersion: 6,
      createdAt: nowIso,
    });

    const auditId = `aud-staff-${input.idempotencyKey}`;
    tx.setDoc(`businesses/${input.businessId}/audit_events/${auditId}`, {
      id: auditId,
      businessId: input.businessId,
      shopId: dedupedAssignedShopIds[0],
      userId: verifiedAuth.uid,
      userName: String(caller.fullName || 'Business Owner').slice(0, 120),
      action: 'staff_invited',
      entityType: 'user',
      entityId: staffUid,
      detailsJson: JSON.stringify({
        staffUid,
        email: cleanEmail,
        role: input.role,
        assignedShopIds: dedupedAssignedShopIds,
        permissions: validatedPermissions,
        idempotencyKey: input.idempotencyKey,
      }),
      createdAt: nowIso,
    });

	if (isAuthorizedAdmin && platformSupportSession) {
  tx.setDoc(`platform_audit_logs/${auditId}`, {
    id: auditId,
    actorUid: verifiedAuth.uid,
    actorEmail: String(verifiedAuth.token.email || '').trim().toLowerCase(),
    action: 'support_staff_invited',
    businessId: input.businessId,
    shopId: platformSupportSession.shopId,
    supportSessionId: platformSupportSession.sessionId,
    targetStaffUid: staffUid,
    targetStaffEmail: cleanEmail,
    targetStaffRole: input.role,
    assignedShopIds: dedupedAssignedShopIds,
    idempotencyKey: input.idempotencyKey,
    createdAt: nowIso,
  });
}

    return { status: 'created', isIdempotentReplay: false, staffUser: staffDoc };
  });
}

export async function executeSetTenantStatus(
  dbDriver: ServerDatabaseDriver,
  auth: CallableAuthContext | null | undefined,
  input: SetTenantStatusRequest
): Promise<{
  businessId: string;
  status: 'active' | 'suspended';
  updatedAt: string;
  auditEventId: string;
  subscriptionEventId: string;
}> {
  const expectedDatabaseId = resolveCurrentEnvironment().databaseId;
  if (dbDriver.databaseId !== expectedDatabaseId) {
    throw new Error(
      `DATABASE_CONFIG_MISMATCH: Expected Firestore database "${expectedDatabaseId}", but driver is bound to "${dbDriver.databaseId}".`
    );
  }

  const verifiedAuth = assertVerifiedAuthContext(auth);

  if (
    !input ||
    typeof input !== 'object' ||
    typeof input.businessId !== 'string' ||
    !isValidEntityId(input.businessId) ||
    VALID_PLATFORM_ADMIN_SENTINELS.has(input.businessId) ||
    KNOWN_DEMO_BUSINESS_IDS.has(input.businessId) ||
    input.businessId === PRE_FIREBASE_TEST_BUSINESS_ID ||
    PRE_FIREBASE_BIZ_REGEX.test(input.businessId)
  ) {
    throw new Error(
      `INVALID_ARGUMENT: Business ID "${String((input as any)?.businessId ?? '')}" is invalid, reserved, or quarantined.`
    );
  }

  const requestedStatus: unknown = (input as { status?: unknown }).status;
  if (
    typeof requestedStatus !== 'string' ||
    (requestedStatus !== 'active' && requestedStatus !== 'suspended')
  ) {
    throw new Error(
      `INVALID_ARGUMENT: Tenant status must be "active" or "suspended", received "${String(requestedStatus)}".`
    );
  }
  const validatedStatus: 'active' | 'suspended' = requestedStatus;

  if (input.reason !== undefined && typeof input.reason !== 'string') {
    throw new Error('INVALID_ARGUMENT: Optional reason must be a string.');
  }
  const cleanReason =
    input.reason !== undefined ? input.reason.trim().slice(0, 400) : '';

  return await dbDriver.runTransaction(async (tx) => {
    const callerAdmin = await assertCallerIsActivePlatformAdmin(tx, verifiedAuth);
    const bizPath = `businesses/${input.businessId}`;
    const existingBiz = await tx.getDoc(bizPath);
    if (!existingBiz) {
      throw new Error(`NOT_FOUND: Business "${input.businessId}" does not exist.`);
    }

    const nowIso = new Date().toISOString();
    const previousStatus = String(existingBiz.status || 'active');
    const eventSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const subscriptionEventId = `sub-evt-${input.businessId}-${eventSuffix}`;
    const auditEventId = `aud-status-${input.businessId}-${eventSuffix}`;

    tx.setDoc(bizPath, {
      ...existingBiz,
      status: validatedStatus,
      updatedAt: nowIso,
    });

    tx.setDoc(
      `businesses/${input.businessId}/subscription_events/${subscriptionEventId}`,
      {
        id: subscriptionEventId,
        businessId: input.businessId,
        previousStatus,
        newStatus: validatedStatus,
        reason: cleanReason || `Tenant status changed to ${validatedStatus}`,
        performedByUid: verifiedAuth.uid,
        performedByEmail: String(callerAdmin.email || BOOTSTRAP_PLATFORM_ADMIN_EMAIL),
        schemaVersion: 6,
        createdAt: nowIso,
      }
    );

    tx.setDoc(`businesses/${input.businessId}/audit_events/${auditEventId}`, {
      id: auditIdFromEvent(auditEventId),
      businessId: input.businessId,
      userId: verifiedAuth.uid,
      userName: String(callerAdmin.fullName || 'Platform Administrator').slice(0, 120),
      action: 'tenant_status_updated',
      entityType: 'business',
      entityId: input.businessId,
      detailsJson: JSON.stringify({
        businessId: input.businessId,
        previousStatus,
        newStatus: validatedStatus,
        reason: cleanReason || undefined,
        subscriptionEventId,
      }),
      createdAt: nowIso,
    });

    return {
      businessId: input.businessId,
      status: validatedStatus,
      updatedAt: nowIso,
      auditEventId,
      subscriptionEventId,
    };
  });
}

function auditIdFromEvent(auditEventId: string): string {
  return auditEventId;
}

// ============================================================================
// 4. FIREBASE ADMIN SDK & CLOUD FUNCTIONS v2 RUNTIME BINDING
// ============================================================================

function loadServerModule(moduleName: string): any {
  if (typeof require === 'function') {
    return require(moduleName);
  }
  const dynamicRequire = new Function(
    'mod',
    'return typeof require !== "undefined" ? require(mod) : null'
  ) as (mod: string) => any;
  const mod = dynamicRequire(moduleName);
  if (!mod) {
    throw new Error(`MODULE_NOT_FOUND: ${moduleName}`);
  }
  return mod;
}

// Module-scope singleton instances to guarantee the [DEFAULT] Firebase Admin App
// is initialized BEFORE firebase-functions onCall intercepts requests for Auth token validation.
let serverAdminApp: any = null;
let serverAdminFirestore: any = null;
let serverAdminAuth: any = null;

export function getOrInitServerAdmin(): {
  app: any;
  firestore: any;
  auth: any;
} | null {
  if (serverAdminApp && serverAdminFirestore && serverAdminAuth) {
    return {
      app: serverAdminApp,
      firestore: serverAdminFirestore,
      auth: serverAdminAuth,
    };
  }

  const isTestRunner = Boolean(
    typeof process !== 'undefined' &&
      ((process.env &&
        (process.env.NODE_TEST_CONTEXT || process.env.NODE_ENV === 'test')) ||
        (Array.isArray(process.execArgv) &&
          process.execArgv.includes('--test')))
  );

  // In test execution environments, strictly return null so no live connections or SDK initializations occur
  if (isTestRunner) {
    return null;
  }

  const isCloudFunctionRuntime = Boolean(
    typeof process !== 'undefined' &&
      process.env &&
      (process.env.FUNCTION_TARGET ||
        process.env.FIREBASE_CONFIG ||
        process.env.K_REVISION ||
        process.env.K_CONFIGURATION ||
        process.env.FUNCTION_SIGNATURE_TYPE ||
        process.env.GCLOUD_PROJECT ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.FIREBASE_PROJECT ||
        (process.env.K_SERVICE && !process.env.K_SERVICE.startsWith('ais-dev')))
  );

  // In non-Cloud-Function offline environments, strictly return null
  if (!isCloudFunctionRuntime) {
    return null;
  }

  try {
    const adminAppModule = loadServerModule('firebase-admin/app');
    const adminFirestoreModule = loadServerModule('firebase-admin/firestore');
    const adminAuthModule = loadServerModule('firebase-admin/auth');

    const envResolution = resolveCurrentEnvironment();

    serverAdminApp =
      adminAppModule.getApps().length > 0
        ? adminAppModule.getApp()
        : adminAppModule.initializeApp({
            projectId: envResolution.projectId,
          });

    // Explicitly pass resolved databaseId (named database in production, '(default)' in staging)
    serverAdminFirestore = adminFirestoreModule.getFirestore(
      serverAdminApp,
      envResolution.databaseId
    );
    serverAdminAuth = adminAuthModule.getAuth(serverAdminApp);

    return {
      app: serverAdminApp,
      firestore: serverAdminFirestore,
      auth: serverAdminAuth,
    };
  } catch (err: any) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const isModuleMissing =
      errMsg.includes('MODULE_NOT_FOUND') ||
      errMsg.includes('Cannot find module') ||
      errMsg.includes('require is not defined');

    if (isCloudFunctionRuntime && !isModuleMissing) {
      console.error(
        '[CRITICAL FIREBASE ADMIN INITIALIZATION ERROR in Cloud Function Runtime]:',
        err instanceof Error ? err.stack || err.message : String(err)
      );
      throw err;
    }
    // Graceful fallback for unit-test environments executing in memory without firebase-admin
    return null;
  }
}

function createFirebaseAdminDrivers(): {
  dbDriver: ServerDatabaseDriver;
  authDirectory: ServerAuthDirectory;
} {
  const admin = getOrInitServerAdmin();
  if (!admin) {
    throw new Error(
      'FIREBASE_ADMIN_UNAVAILABLE: Firebase Admin SDK could not be initialized in this runtime environment.'
    );
  }

  const { firestore, auth: adminAuth } = admin;
  const envResolution = resolveCurrentEnvironment();

  const dbDriver: ServerDatabaseDriver = {
    databaseId: envResolution.databaseId,
    async runTransaction<T>(
      updateFunction: (tx: ServerTransactionContext) => Promise<T>
    ): Promise<T> {
      return await firestore.runTransaction(async (nativeTx: any) => {
        const stagedWrites: Array<{ path: string; data: Record<string, any> }> = [];
        const stagedDeletes = new Set<string>();
        const txContext: ServerTransactionContext = {
          async getDoc(path: string) {
            const ref = firestore.doc(path);
            const snap = await nativeTx.get(ref);
            return snap.exists ? (snap.data() as Record<string, any>) : null;
          },
          async queryDocsByField(
            collectionPath: string,
            field: string,
            value: string
          ) {
            const q = firestore
              .collection(collectionPath)
              .where(field, '==', value)
              .limit(5);
            const snap = await nativeTx.get(q);
            return snap.docs.map((d: any) => d.data() as Record<string, any>);
          },
          setDoc(path: string, data: Record<string, any>) {
            stagedDeletes.delete(path);
            stagedWrites.push({ path, data });
          },
          deleteDoc(path: string) {
            stagedDeletes.add(path);
          },
        };

        const result = await updateFunction(txContext);
        for (const w of stagedWrites) {
          if (!stagedDeletes.has(w.path)) {
            nativeTx.set(firestore.doc(w.path), w.data, { merge: false });
          }
        }
        for (const delPath of stagedDeletes) {
          nativeTx.delete(firestore.doc(delPath));
        }
        return result;
      });
    },
  };

  const authDirectory: ServerAuthDirectory = {
    async getUserByEmail(email: string) {
      try {
        const userRecord = await adminAuth.getUserByEmail(email);
        return {
          uid: userRecord.uid,
          email: userRecord.email || email,
          emailVerified: userRecord.emailVerified,
          disabled: userRecord.disabled,
          displayName: userRecord.displayName,
        };
      } catch (err: any) {
        if (err?.code === 'auth/user-not-found') {
          return null;
        }
        throw err;
      }
    },
    async getUserByUid(uid: string) {
      try {
        const userRecord = await adminAuth.getUser(uid);
        return {
          uid: userRecord.uid,
          email: userRecord.email || '',
          emailVerified: userRecord.emailVerified,
          disabled: userRecord.disabled,
          displayName: userRecord.displayName,
        };
      } catch (err: any) {
        if (err?.code === 'auth/user-not-found') {
          return null;
        }
        throw err;
      }
    },
    async createUser(params: {
      email: string;
      displayName: string;
      password?: string;
      emailVerified?: boolean;
      disabled?: boolean;
    }) {
      const cleanEmail = params.email.trim().toLowerCase();
      const cleanName = params.displayName.trim();
      try {
        const created = await adminAuth.createUser({
          email: cleanEmail,
          displayName: cleanName,
          ...(params.password?.trim() ? { password: params.password.trim() } : {}),
          emailVerified: params.emailVerified ?? false,
          disabled: params.disabled ?? false,
        });
        return {
          uid: created.uid,
          email: (created.email || cleanEmail).trim().toLowerCase(),
          emailVerified: Boolean(created.emailVerified),
          disabled: Boolean(created.disabled),
          displayName: created.displayName || cleanName,
        };
      } catch (err: any) {
        if (err?.code === 'auth/email-already-exists') {
          const existing = await adminAuth.getUserByEmail(cleanEmail);
          return {
            uid: existing.uid,
            email: (existing.email || cleanEmail).trim().toLowerCase(),
            emailVerified: Boolean(existing.emailVerified),
            disabled: Boolean(existing.disabled),
            displayName: existing.displayName || cleanName,
          };
        }
        throw err;
      }
    },
    async updateUser(
      uid: string,
      params: {
        password?: string;
        emailVerified?: boolean;
        displayName?: string;
        disabled?: boolean;
      }
    ) {
      const cleanPassword = params.password?.trim();
      const updated = await adminAuth.updateUser(uid, {
        ...(cleanPassword ? { password: cleanPassword } : {}),
        ...(params.emailVerified !== undefined ? { emailVerified: params.emailVerified } : {}),
        ...(params.displayName ? { displayName: params.displayName } : {}),
        ...(params.disabled !== undefined ? { disabled: params.disabled } : {}),
      });
      return {
        uid: updated.uid,
        email: updated.email || '',
        emailVerified: Boolean(updated.emailVerified),
        disabled: Boolean(updated.disabled),
        displayName: updated.displayName || '',
      };
    },
    async setCustomUserClaims(
      uid: string,
      customUserClaims: Record<string, any> | null
    ) {
      await adminAuth.setCustomUserClaims(uid, customUserClaims);
    },
  };

  return { dbDriver, authDirectory };
}

export function wrapCallable<Req, Res>(
  handler: (
    drivers: { dbDriver: ServerDatabaseDriver; authDirectory: ServerAuthDirectory },
    auth: CallableAuthContext | undefined,
    data: Req
  ) => Promise<Res>,
  region?: 'africa-south1' | 'us-central1'
) {
  try {
    // Initialize the [DEFAULT] Firebase Admin app before firebase-functions/v2/https
    // onCall middleware intercepts incoming requests to validate Bearer ID tokens.
    getOrInitServerAdmin();
    const httpsV2 = loadServerModule('firebase-functions/v2/https');
    return httpsV2.onCall(
      {
        region: region || resolveDeploymentRegion(),
        cors: true,
        enforceAppCheck: false,
      },
      async (request: { auth?: CallableAuthContext; data: Req }) => {
        try {
          const drivers = createFirebaseAdminDrivers();
          return await handler(drivers, request.auth, request.data);
        } catch (err: any) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.startsWith('UNAUTHENTICATED:')) {
            throw new httpsV2.HttpsError('unauthenticated', msg);
          }
          if (msg.startsWith('PERMISSION_DENIED:') || msg.startsWith('FORBIDDEN')) {
            throw new httpsV2.HttpsError('permission-denied', msg);
          }
          if (msg.startsWith('ALREADY_EXISTS:')) {
            throw new httpsV2.HttpsError('already-exists', msg);
          }
          if (msg.startsWith('NOT_FOUND:')) {
            throw new httpsV2.HttpsError('not-found', msg);
          }
          if (
            msg.startsWith('INVALID_ARGUMENT:') ||
            msg.startsWith('AUTH_UID_REQUIRED:')
          ) {
            throw new httpsV2.HttpsError('invalid-argument', msg);
          }
          throw new httpsV2.HttpsError('internal', msg);
        }
      }
    );
  } catch {
    // Fallback wrapper when imported in pure unit-test environments without firebase-functions installed
    return async (request: { auth?: CallableAuthContext; data: Req }) => {
      const drivers = createFirebaseAdminDrivers();
      return await handler(drivers, request.auth, request.data);
    };
  }
}

export const CLOUD_FUNCTIONS_MANIFEST = {
  runtime: 'nodejs22',
  stagingRegion: STAGING_FUNCTIONS_REGION,
  productionRegion: PRODUCTION_FUNCTIONS_REGION,
  projectId: EXPECTED_FIREBASE_PROJECT_ID,
  firestoreDatabaseId: NAMED_FIRESTORE_DATABASE_ID,
  stagingProjectId: STAGING_FIREBASE_PROJECT_ID,
  requiresBlazePlan: true,
  endpoints: [
    'provisionBusinessAndPrimaryOwner',
    'repairBusinessOwnerAuth',
    'syncPosOperation',
    'syncShopOperation',
    'inviteAuthorizedStaff',
    'setTenantStatus',
    'resetUserPassword',
  ],
} as const;

export interface ResetUserPasswordRequest {
  idempotencyKey?: string;
  targetUserId: string;
  targetEmail: string;
  newPassword: string;
}

export async function executeResetUserPassword(
  dbDriver: ServerDatabaseDriver,
  authDirectory: ServerAuthDirectory | null,
  auth: CallableAuthContext | null | undefined,
  input: ResetUserPasswordRequest
): Promise<{ success: boolean; message: string; targetUserId: string }> {
  const verifiedAuth = assertVerifiedAuthContext(auth);
  const cleanEmail = (input.targetEmail || '').trim().toLowerCase();
  const cleanPassword = (input.newPassword || '').trim();

  if (!isValidEmailAddress(cleanEmail)) {
    throw new Error('INVALID_ARGUMENT: A valid targetEmail is required.');
  }
  if (!cleanPassword || cleanPassword.length < 6) {
    throw new Error('INVALID_ARGUMENT: New password must be at least 6 characters long.');
  }

  if (!authDirectory || typeof authDirectory.updateUser !== 'function') {
    throw new Error(
      'FIREBASE_ADMIN_UNAVAILABLE: Authentication service is required to update passwords.'
    );
  }

  return await dbDriver.runTransaction(async (tx) => {
    const caller = await tx.getDoc(`users/${verifiedAuth.uid}`);
    if (!caller || caller.status !== 'active') {
      throw new Error('PERMISSION_DENIED: Active caller profile required.');
    }

    const isPlatformAdmin = caller.role === 'platform_admin';
    const targetProfiles = await tx.queryDocsByField('users', 'email', cleanEmail);
    const targetProfile =
      targetProfiles.find((u) => u.id === input.targetUserId) || targetProfiles[0];

    if (!targetProfile) {
      throw new Error(
        `NOT_FOUND: User with email "${cleanEmail}" was not found in the database.`
      );
    }

    const isOwnerOfSameBusiness =
      caller.role === 'business_owner' &&
      caller.businessId === targetProfile.businessId;
    const isSelf =
      caller.id === targetProfile.id || verifiedAuth.uid === targetProfile.id;

    if (!isPlatformAdmin && !isOwnerOfSameBusiness && !isSelf) {
      throw new Error(
        "PERMISSION_DENIED: You do not have permission to reset this user's password."
      );
    }

    // Resolve or update auth user
    let authUser = await authDirectory.getUserByEmail(cleanEmail);
    if (!authUser && targetProfile.id) {
      authUser = await authDirectory.getUserByUid(targetProfile.id);
    }

    if (authUser && typeof authDirectory.updateUser === 'function') {
      await authDirectory.updateUser(authUser.uid, {
        password: cleanPassword,
        emailVerified: true,
      });
    } else if (typeof authDirectory.createUser === 'function') {
      authUser = await authDirectory.createUser({
        email: cleanEmail,
        displayName: targetProfile.fullName || cleanEmail.split('@')[0],
        password: cleanPassword,
        emailVerified: true,
        disabled: false,
      });
    }

    // Update user profile in Firestore
    await tx.setDoc(
      `users/${targetProfile.id}`,
      {
        ...targetProfile,
        passwordSetupStatus: 'verified',
        emailVerified: true,
        updatedAt: new Date().toISOString(),
      }
    );

    return {
      success: true,
      message: `Password updated successfully in Firebase Authentication for ${cleanEmail}.`,
      targetUserId: targetProfile.id,
    };
  });
}

// ============================================================================
// PLATFORM ADMIN CUSTOM CLAIMS MANAGEMENT
// ============================================================================

export interface GrantPlatformAdminRoleRequest {
  targetEmail: string;
  enabled: boolean;
}

export interface GrantPlatformAdminRoleResponse {
  success: boolean;
  targetEmail: string;
  targetUid: string;
  isPlatformAdmin: boolean;
  message: string;
}

export interface SyncPlatformAdminClaimsResponse {
  success: boolean;
  claimsApplied: boolean;
  targetEmail: string;
  message: string;
}

/**
 * Stamps the cryptographic platform_admin Custom Claim onto the caller's Firebase Auth token.
 * Can be called by authorized bootstrap platform admins or existing platform admins.
 */
export async function executeSyncPlatformAdminClaims(
  authDirectory: ServerAuthDirectory | null,
  auth: CallableAuthContext | null | undefined
): Promise<SyncPlatformAdminClaimsResponse> {
  const verifiedAuth = assertVerifiedAuthContext(auth);
  const callerEmail = (verifiedAuth.token?.email || '').trim().toLowerCase();

  const isAuthorizedEmail = isAuthorizedPlatformAdminEmail(callerEmail);
  const hasAdminClaim =
    verifiedAuth.token?.role === 'platform_admin' ||
    verifiedAuth.token?.platform_admin === true;

  if (!isAuthorizedEmail && !hasAdminClaim) {
    throw new Error(
      `PERMISSION_DENIED: User "${callerEmail || verifiedAuth.uid}" is not authorized as a Platform Administrator.`
    );
  }

  if (!authDirectory || typeof authDirectory.setCustomUserClaims !== 'function') {
    throw new Error('FIREBASE_ADMIN_UNAVAILABLE: Authentication service is required.');
  }

  await authDirectory.setCustomUserClaims!(verifiedAuth.uid, {
    role: 'platform_admin',
    platform_admin: true,
  });

  return {
    success: true,
    claimsApplied: true,
    targetEmail: callerEmail,
    message: `Platform administrator custom claim successfully stamped on UID "${verifiedAuth.uid}".`,
  };
}

/**
 * Allows an active Platform Administrator to grant or revoke the platform_admin Custom Claim
 * on any user by email address, updating their Firebase Auth claims and Firestore profile.
 */
export async function executeGrantPlatformAdminRole(
  dbDriver: ServerDatabaseDriver,
  authDirectory: ServerAuthDirectory | null,
  auth: CallableAuthContext | null | undefined,
  input: GrantPlatformAdminRoleRequest
): Promise<GrantPlatformAdminRoleResponse> {
  const verifiedAuth = assertVerifiedAuthContext(auth);
  const cleanEmail = (input?.targetEmail || '').trim().toLowerCase();

  if (!isValidEmailAddress(cleanEmail)) {
    throw new Error('INVALID_ARGUMENT: A valid targetEmail address is required.');
  }

  if (!authDirectory || typeof authDirectory.setCustomUserClaims !== 'function') {
    throw new Error(
      'FIREBASE_ADMIN_UNAVAILABLE: Authentication service with custom claims management is required.'
    );
  }

  return await dbDriver.runTransaction(async (tx) => {
    await assertCallerIsActivePlatformAdmin(tx, verifiedAuth);

    const authUser = await authDirectory.getUserByEmail(cleanEmail);
    if (!authUser) {
      throw new Error(`NOT_FOUND: User "${cleanEmail}" does not exist in Firebase Authentication.`);
    }

    const isGranting = Boolean(input.enabled);
    const claims = isGranting
      ? { role: 'platform_admin', platform_admin: true }
      : { role: 'user', platform_admin: false };

    await authDirectory.setCustomUserClaims!(authUser.uid, claims);

    const userDocPath = `users/${authUser.uid}`;
    const existingProfile = await tx.getDoc(userDocPath);
    const nowIso = new Date().toISOString();

    if (existingProfile) {
      await tx.setDoc(userDocPath, {
        ...existingProfile,
        role: isGranting ? 'platform_admin' : 'cashier',
        roleLabel: isGranting ? 'Platform Administrator' : (existingProfile.roleLabel || 'Cashier'),
        businessId: isGranting ? 'PLATFORM' : (existingProfile.businessId || 'PLATFORM'),
        updatedAt: nowIso,
      });
    }

    return {
      success: true,
      targetEmail: cleanEmail,
      targetUid: authUser.uid,
      isPlatformAdmin: isGranting,
      message: isGranting
        ? `Custom claim [role: platform_admin] granted to ${cleanEmail}.`
        : `Custom claim [role: platform_admin] revoked from ${cleanEmail}.`,
    };
  });
}
