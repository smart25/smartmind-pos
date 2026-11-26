/**
 * SmartMind POS — Live Firestore Data Repository & Mode Isolation Service
 *
 * Strictly separates:
 * - 'live': Authenticated Firebase user operating against Cloud Firestore
 *   (database: ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4)
 * - 'offline_live': Authenticated Firebase user operating against their own
 *   previously cached real business records & local IndexedDB queue while offline
 * - 'demo': Explicitly selected isolated sample dataset (never mixed with live data)
 *
 * Enforces:
 * - Zero silent fallback to demo data on empty database, sign-out, or Firebase errors
 * - No automatic invention of businesses, owners, shops, products, or sales
 * - No default platform_admin privilege assignment
 * - Strict per-user, per-business, and per-shop cache isolation
 * - Protection of pending offline sales and unsynchronized sync_queue entries
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  callInviteAuthorizedStaff,
  callProvisionBusinessAndPrimaryOwner,
  callRepairBusinessOwnerAuth,
  callResetUserPassword,
  callSetTenantStatus,
  callSyncPosOperation,
  db,
  firebaseConfig,
  InviteAuthorizedStaffRequest,
  InviteAuthorizedStaffResponse,
  ProvisionBusinessRequest,
  ProvisionBusinessResponse,
  RepairBusinessOwnerAuthRequest,
  RepairBusinessOwnerAuthResponse,
  ResetUserPasswordRequest,
  ResetUserPasswordResponse,
  sendEmailVerification,
  sendPasswordResetEmail,
  SetTenantStatusRequest,
  SetTenantStatusResponse,
  SyncOperationRequest,
  SyncOperationResponse,
} from '../firebase';
import {
  DatabaseAdapter,
  PurgeQuarantinedPreFirebaseSalesCriteria,
  PurgeQuarantinedPreFirebaseSalesResult,
} from '../db/databaseAdapter';

export type {
  PurgeQuarantinedPreFirebaseSalesCriteria,
  PurgeQuarantinedPreFirebaseSalesResult,
};
import {
  DbProduct,
  DbSale,
  DbSyncQueueEntry,
  fromMinorUnits,
  toMinorUnits,
} from '../db/schema';
import {
  AccountStatus,
  Business,
  BusinessOwnerPasswordSetupStatus,
  BusinessStatus,
  CustomRole,
  DebtCustomer,
  DebtTransaction,
  Invoice,
  PermissionKey,
  PlatformAdminAuditLog,
  Product,
  ProductCategory,
  ProductTransfer,
  SaleLineItem,
  SaleTransaction,
  Shop,
  ShopAssignment,
  StockAdjustment,
  StockAdjustmentType,
  Supplier,
  SupplierSupplyRecord,
  TransactionStatus,
  UnitOfMeasurement,
  User,
  UserRole,
} from '../types/pos';
import {
  ALLOWED_SHOP_MANAGER_STAFF_PERMISSIONS,
  BASE_CURRENCY_CODE,
  BASE_CURRENCY_SYMBOL,
  CreateBusinessInput,
  CreateShopInput,
  isPermissionAllowedForStaffRole,
  isSyntheticClientUserId,
  isSyntheticOwnerUserId,
  OWNER_ONLY_STAFF_PERMISSIONS,
  ReceiptReturnItemSummary,
  resolveBusinessOwnerAuthState,
  ROLE_DEFAULT_PERMISSIONS,
} from '../utils/posCalculations';

export {
  isSyntheticClientUserId,
  isSyntheticOwnerUserId,
  resolveBusinessOwnerAuthState,
};

export type DataEnvironmentMode = 'live' | 'offline_live' | 'demo';

export const LEGACY_MIXED_STORAGE_KEY = 'smartmind_pos_store_v2';
export const DEMO_ISOLATED_STORAGE_KEY = 'smartmind_pos_demo_store_v1';
export const LIVE_USER_CACHE_PREFIX = 'smartmind_pos_live_cache_v1_';
export const ACTIVE_MODE_STORAGE_KEY = 'smartmind_pos_active_mode_v1';

export const KNOWN_DEMO_BUSINESS_IDS = new Set<string>([
  'biz-platform-hq',
  'biz-emerald-01',
  'biz-horizon-02',
  'biz-royal-03',
]);

export const KNOWN_DEMO_SHOP_IDS = new Set<string>([
  'shop-vi-01',
  'shop-ikj-02',
  'shop-lek-03',
  'shop-abj-01',
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

export const PRE_FIREBASE_TEST_BUSINESS_ID = 'biz-0003-u42w';
export const PRE_FIREBASE_TEST_SHOP_ID = 'shop-0005-9i6p';
export const PRE_FIREBASE_QUARANTINE_REASON =
  'pre_firebase_test_transaction_missing_live_tenant';

export const SPECIFIED_PRE_FIREBASE_SYNC_IDS = [
  'sync-sale-1792837064449-h1dw',
  'sync-sale-1792840077667-3knj',
  'sync-sale-1792840085221-qjdb',
  'sync-sale-1792840089845-kc84',
] as const;

export const SPECIFIED_PRE_FIREBASE_SYNC_ID_SET = new Set<string>(
  SPECIFIED_PRE_FIREBASE_SYNC_IDS
);

export const SPECIFIED_PRE_FIREBASE_SALE_IDS = [
  'sale-1792837064449-h1dw',
  'sale-1792840077667-3knj',
  'sale-1792840085221-qjdb',
  'sale-1792840089845-kc84',
] as const;

export const SPECIFIED_PRE_FIREBASE_SALE_ID_SET = new Set<string>(
  SPECIFIED_PRE_FIREBASE_SALE_IDS
);

export const SPECIFIED_PRE_FIREBASE_AUDIT_IDS = [
  'aud-quarantine-sync-sale-1792837064449-h1dw',
  'aud-quarantine-sync-sale-1792840077667-3knj',
  'aud-quarantine-sync-sale-1792840085221-qjdb',
  'aud-quarantine-sync-sale-1792840089845-kc84',
] as const;

export const SPECIFIED_PRE_FIREBASE_AUDIT_ID_SET = new Set<string>(
  SPECIFIED_PRE_FIREBASE_AUDIT_IDS
);

export function isKnownDemoRecord(record: {
  id?: string;
  businessId?: string;
  business_id?: string;
  shopId?: string;
  shop_id?: string;
}): boolean {
  const id = record.id || '';
  const bizId = record.businessId || record.business_id || '';
  const shopId = record.shopId || record.shop_id || '';

  if (KNOWN_DEMO_BUSINESS_IDS.has(id) || KNOWN_DEMO_BUSINESS_IDS.has(bizId)) {
    return true;
  }
  if (KNOWN_DEMO_SHOP_IDS.has(id) || KNOWN_DEMO_SHOP_IDS.has(shopId)) {
    return true;
  }
  if (KNOWN_DEMO_USER_IDS.has(id)) {
    return true;
  }
  return false;
}

export function isPreFirebaseTestRecord(record: {
  id?: string;
  entity_id?: string;
  entityId?: string;
  businessId?: string;
  business_id?: string;
  shopId?: string;
  shop_id?: string;
}): boolean {
  const id = record.id || '';
  const entityId = record.entity_id || record.entityId || '';
  const bizId = record.businessId || record.business_id || '';
  const shopId = record.shopId || record.shop_id || '';

  if (
    SPECIFIED_PRE_FIREBASE_SYNC_ID_SET.has(id) ||
    SPECIFIED_PRE_FIREBASE_SALE_ID_SET.has(id) ||
    SPECIFIED_PRE_FIREBASE_SALE_ID_SET.has(entityId)
  ) {
    return true;
  }
  if (
    bizId === PRE_FIREBASE_TEST_BUSINESS_ID ||
    id === PRE_FIREBASE_TEST_BUSINESS_ID ||
    /^biz-00\d\d-[a-z0-9]{4}$/i.test(bizId) ||
    /^biz-00\d\d-[a-z0-9]{4}$/i.test(id)
  ) {
    return true;
  }
  if (
    shopId === PRE_FIREBASE_TEST_SHOP_ID ||
    id === PRE_FIREBASE_TEST_SHOP_ID ||
    /^shop-00\d\d-[a-z0-9]{4}$/i.test(shopId) ||
    /^shop-00\d\d-[a-z0-9]{4}$/i.test(id)
  ) {
    return true;
  }
  return false;
}

export function isVerifiedLiveTenant(
  businessId?: string,
  shopId?: string,
  verifiedBusinessIds?: ReadonlySet<string>,
  verifiedShopIds?: ReadonlySet<string>
): boolean {
  if (!businessId || !shopId) return false;
  if (
    isKnownDemoRecord({ businessId, shopId }) ||
    isPreFirebaseTestRecord({ businessId, shopId })
  ) {
    return false;
  }
  const isLivePrefixedBiz = businessId.startsWith('biz-live-');
  const isLivePrefixedShop =
    shopId.startsWith('shop-live-') || shopId.startsWith('shp-live-');
  if (isLivePrefixedBiz && isLivePrefixedShop) {
    return true;
  }
  if (
    verifiedBusinessIds?.has(businessId) &&
    verifiedShopIds?.has(shopId)
  ) {
    return true;
  }
  return false;
}

export interface QuarantineExecutionReport {
  newlyQuarantinedIds: string[];
  alreadyQuarantinedIds: string[];
  totalQuarantinedCount: number;
  quarantineReason: string;
  quarantinedEntries: DbSyncQueueEntry[];
}

/**
 * Safely and idempotently quarantines the four pre-Firebase local test sales
 * (and any queue entries belonging to pre-Firebase test tenant biz-0003-u42w / shop-0005-9i6p)
 * while preserving 100% of the original sale payloads, local DbSale records, and localStorage records.
 * Never deletes records or logs customer personal data.
 */
export async function quarantinePreFirebaseTestSales(
  dbAdapter: DatabaseAdapter
): Promise<QuarantineExecutionReport> {
  const newlyQuarantinedIds: string[] = [];
  const alreadyQuarantinedIds: string[] = [];
  const quarantinedEntries: DbSyncQueueEntry[] = [];

  const allQueue = dbAdapter.getAllSyncQueue
    ? await dbAdapter.getAllSyncQueue()
    : await dbAdapter.getPendingSyncQueue();

  for (const entry of allQueue) {
    const matchesTarget =
      SPECIFIED_PRE_FIREBASE_SYNC_ID_SET.has(entry.id) ||
      SPECIFIED_PRE_FIREBASE_SALE_ID_SET.has(entry.entity_id) ||
      isPreFirebaseTestRecord(entry);

    if (!matchesTarget) {
      continue;
    }

    const existingAuditEvents = await dbAdapter.getAuditEvents(
      entry.business_id || PRE_FIREBASE_TEST_BUSINESS_ID,
      entry.shop_id || PRE_FIREBASE_TEST_SHOP_ID,
      500
    );
    const deterministicAuditId = `aud-quarantine-${entry.id}`;
    const hasAuditEvent = existingAuditEvents.some(
      (ev) => ev.id === deterministicAuditId
    );

    if (
      entry.status === 'quarantined' &&
      entry.quarantine_reason === PRE_FIREBASE_QUARANTINE_REASON &&
      hasAuditEvent
    ) {
      alreadyQuarantinedIds.push(entry.id);
      quarantinedEntries.push(entry);
      continue;
    }

    const quarantinedAt = entry.quarantined_at || new Date().toISOString();

    await dbAdapter.updateSyncStatus(
      entry.id,
      'quarantined',
      PRE_FIREBASE_QUARANTINE_REASON,
      {
        errorSummary: PRE_FIREBASE_QUARANTINE_REASON,
        conflictReason: PRE_FIREBASE_QUARANTINE_REASON,
        quarantinedAt,
        quarantineReason: PRE_FIREBASE_QUARANTINE_REASON,
      }
    );

    // Preserve local DbSale record and items intact while marking sync_conflict_reason for visibility
    if (entry.entity_type === 'sale' && entry.entity_id) {
      const localSale = await dbAdapter.getSale(entry.entity_id);
      if (
        localSale &&
        localSale.sync_conflict_reason !== PRE_FIREBASE_QUARANTINE_REASON
      ) {
        const items = await dbAdapter.getSaleItems(localSale.id);
        await dbAdapter.saveSale(
          {
            ...localSale,
            is_synced: 0,
            sync_conflict_reason: PRE_FIREBASE_QUARANTINE_REASON,
          },
          items
        );
      }
    }

    if (!hasAuditEvent) {
      await dbAdapter.saveAuditEvent({
        id: deterministicAuditId,
        business_id: entry.business_id || PRE_FIREBASE_TEST_BUSINESS_ID,
        shop_id: entry.shop_id || PRE_FIREBASE_TEST_SHOP_ID,
        user_id: 'system-quarantine-guard',
        user_name: 'System Quarantine Guard',
        action: 'sync_entry_quarantined',
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        details_json: JSON.stringify({
          syncId: entry.id,
          saleId: entry.entity_id,
          businessId: entry.business_id,
          shopId: entry.shop_id,
          quarantineReason: PRE_FIREBASE_QUARANTINE_REASON,
          quarantinedAt,
          evidencePreserved: true,
          piiRedacted: true,
        }),
        created_at: quarantinedAt,
      });
    }

    newlyQuarantinedIds.push(entry.id);
  }

  const refreshedQueue = dbAdapter.getAllSyncQueue
    ? await dbAdapter.getAllSyncQueue()
    : [];
  const finalQuarantined = refreshedQueue.filter(
    (e) => e.status === 'quarantined'
  );

  return {
    newlyQuarantinedIds,
    alreadyQuarantinedIds,
    totalQuarantinedCount: finalQuarantined.length,
    quarantineReason: PRE_FIREBASE_QUARANTINE_REASON,
    quarantinedEntries: finalQuarantined,
  };
}

/**
 * Permanently and safely purges only the 4 quarantined pre-Firebase test records
 * from local storage (IndexedDB smartmind_pos_local_db and legacy localStorage).
 *
 * Strict Security & Tenant Isolation Guarantees:
 * - Requires Platform Administrator role and active account status.
 * - Explicitly verifies expected synthetic tenant IDs (biz-0003-u42w / shop-0005-9i6p)
 *   and quarantine reason ('pre_firebase_test_transaction_missing_live_tenant').
 * - Deletes ONLY target keys in sync_queue, sales, linked sale_items, linked payments,
 *   and quarantine audit_events.
 * - Leaves all other businesses, shops, sales, users, and cloud data 100% untouched.
 * - Idempotent: repeated runs safely report 0 records deleted.
 */
export async function purgeQuarantinedPreFirebaseRecords(
  actor: User,
  dbAdapter: DatabaseAdapter,
  storageOverride?: Storage
): Promise<PurgeQuarantinedPreFirebaseSalesResult> {
  if (!actor || actor.role !== 'platform_admin' || actor.status !== 'active') {
    throw new Error(
      'UNAUTHORIZED: Only an active Platform Administrator can permanently purge quarantined pre-Firebase demo records.'
    );
  }

  const criteria: PurgeQuarantinedPreFirebaseSalesCriteria = {
    expectedBusinessId: PRE_FIREBASE_TEST_BUSINESS_ID,
    expectedShopId: PRE_FIREBASE_TEST_SHOP_ID,
    expectedQuarantineReason: PRE_FIREBASE_QUARANTINE_REASON,
    targetQueueIds: SPECIFIED_PRE_FIREBASE_SYNC_IDS,
    targetSaleIds: SPECIFIED_PRE_FIREBASE_SALE_IDS,
    targetAuditEventIds: SPECIFIED_PRE_FIREBASE_AUDIT_IDS,
  };

  if (dbAdapter.purgeQuarantinedPreFirebaseSales) {
    return dbAdapter.purgeQuarantinedPreFirebaseSales(criteria, storageOverride);
  }

  throw new Error('Database adapter does not support purgeQuarantinedPreFirebaseSales.');
}

export interface LiveWorkspaceDataset {
  businesses: Business[];
  users: User[];
  shops: Shop[];
  shopAssignments: ShopAssignment[];
  categories: ProductCategory[];
  units: UnitOfMeasurement[];
  products: Product[];
  stockAdjustments: StockAdjustment[];
  sales: SaleTransaction[];
  invoices: Invoice[];
  debtCustomers: DebtCustomer[];
  debtTransactions: DebtTransaction[];
  suppliers: Supplier[];
  supplierSupplies: SupplierSupplyRecord[];
  customRoles: CustomRole[];
  cachedAt: string;
  ownerUserId: string;
  businessId: string;
}

export function createEmptyLiveDataset(
  ownerUserId = '',
  businessId = ''
): LiveWorkspaceDataset {
  return {
    businesses: [],
    users: [],
    shops: [],
    shopAssignments: [],
    categories: [],
    units: [],
    products: [],
    stockAdjustments: [],
    sales: [],
    invoices: [],
    debtCustomers: [],
    debtTransactions: [],
    suppliers: [],
    supplierSupplies: [],
    customRoles: [],
    cachedAt: new Date().toISOString(),
    ownerUserId,
    businessId,
  };
}

export interface PendingSyncQueueAuditItem {
  id: string;
  entityType: string;
  entityId: string;
  businessId: string;
  shopId: string;
  createdAt: string;
  status: string;
  retryCount: number;
  idempotencyKey: string;
  actorUserId: string;
  payloadComplete: boolean;
  payloadSummary: string;
  receiptNumber?: string;
  itemsCount?: number;
  totalAmountNaira?: number;
  paymentMethod?: string;
  localSaleExists: boolean;
  localSaleStatus:
    | 'pending_sync'
    | 'completed_synced'
    | 'failed'
    | 'conflicted'
    | 'quarantined'
    | 'missing'
    | 'not_applicable';
  duplicateLocalSaleIds: string[];
  originSource:
    | 'demo_known_seed'
    | 'pre_firebase_local_test'
    | 'live_authenticated_checkout'
    | 'unclassified';
  originReason: string;
  classification: 'demo' | 'live' | 'unclassified' | 'quarantined';
  quarantinedAt?: string;
  quarantineReason?: string;
}

export interface CloudForensicSaleCheckResult {
  syncId: string;
  saleId: string;
  businessId: string;
  shopId: string;
  idempotencyKey: string;
  receiptNumber?: string;
  businessExistsInFirestore: 'yes' | 'no' | 'permission_denied' | 'error';
  shopExistsInFirestore: 'yes' | 'no' | 'permission_denied' | 'error';
  saleExistsInFirestore: 'yes' | 'no' | 'permission_denied' | 'error';
  idempotencyProcessedInFirestore:
    | 'yes'
    | 'no'
    | 'permission_denied'
    | 'error';
  duplicateCloudSaleIds: string[];
  authNote: string;
}

export interface StorageAuditReport {
  demoRecordsCount: number;
  liveRecordsCount: number;
  pendingOfflineSyncCount: number;
  pendingSyncDemoCount: number;
  pendingSyncLiveCount: number;
  pendingSyncUnclassifiedCount: number;
  pendingSyncItems: PendingSyncQueueAuditItem[];
  quarantinedSyncCount: number;
  quarantinedSyncItems: PendingSyncQueueAuditItem[];
  unclassifiedRecordsCount: number;
  hasLegacyMixedStore: boolean;
  hasIsolatedDemoStore: boolean;
  liveUserCacheKeys: string[];
  details: string[];
}

export async function auditLocalStorageAndIndexedDb(
  dbAdapter?: DatabaseAdapter,
  options?: {
    verifiedBusinessIds?: Iterable<string>;
    verifiedShopIds?: Iterable<string>;
  }
): Promise<StorageAuditReport> {
  let demoRecordsCount = 0;
  let liveRecordsCount = 0;
  let pendingOfflineSyncCount = 0;
  let pendingSyncDemoCount = 0;
  let pendingSyncLiveCount = 0;
  let pendingSyncUnclassifiedCount = 0;
  const pendingSyncItems: PendingSyncQueueAuditItem[] = [];
  let quarantinedSyncCount = 0;
  const quarantinedSyncItems: PendingSyncQueueAuditItem[] = [];
  let unclassifiedRecordsCount = 0;
  let hasLegacyMixedStore = false;
  let hasIsolatedDemoStore = false;
  const liveUserCacheKeys: string[] = [];
  const details: string[] = [];

  const verifiedBusinessIds = new Set<string>(options?.verifiedBusinessIds || []);
  const verifiedShopIds = new Set<string>(options?.verifiedShopIds || []);
  const localStorageSalesByReceipt = new Map<string, string[]>();

  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith(LIVE_USER_CACHE_PREFIX)) {
          liveUserCacheKeys.push(key);
          try {
            const rawCache = window.localStorage.getItem(key);
            if (rawCache) {
              const parsedCache = JSON.parse(rawCache);
              for (const b of parsedCache.businesses || []) {
                if (b?.id && !isKnownDemoRecord(b) && !isPreFirebaseTestRecord(b)) {
                  verifiedBusinessIds.add(b.id);
                }
              }
              for (const s of parsedCache.shops || []) {
                if (s?.id && !isKnownDemoRecord(s) && !isPreFirebaseTestRecord(s)) {
                  verifiedShopIds.add(s.id);
                }
              }
            }
          } catch {
            // Ignore cache parse error
          }
        }
      }

      const legacyRaw = window.localStorage.getItem(LEGACY_MIXED_STORAGE_KEY);
      if (legacyRaw) {
        hasLegacyMixedStore = true;
        const parsed = JSON.parse(legacyRaw);
        for (const sale of parsed.sales || []) {
          if (sale?.receiptNumber && sale?.id) {
            const list = localStorageSalesByReceipt.get(sale.receiptNumber) || [];
            if (!list.includes(sale.id)) list.push(sale.id);
            localStorageSalesByReceipt.set(sale.receiptNumber, list);
          }
        }
        const collections = [
          parsed.businesses || [],
          parsed.shops || [],
          parsed.users || [],
          parsed.products || [],
          parsed.sales || [],
        ];
        for (const list of collections) {
          for (const item of list) {
            if (isKnownDemoRecord(item)) {
              demoRecordsCount += 1;
            } else if (isPreFirebaseTestRecord(item)) {
              unclassifiedRecordsCount += 1;
            } else if (
              item?.businessId?.startsWith('biz-live-') ||
              item?.id?.startsWith('biz-live-') ||
              (item?.businessId && verifiedBusinessIds.has(item.businessId))
            ) {
              liveRecordsCount += 1;
            } else {
              unclassifiedRecordsCount += 1;
            }
          }
        }
      }

      const demoRaw = window.localStorage.getItem(DEMO_ISOLATED_STORAGE_KEY);
      if (demoRaw) {
        hasIsolatedDemoStore = true;
        const parsed = JSON.parse(demoRaw);
        for (const sale of parsed.sales || []) {
          if (sale?.receiptNumber && sale?.id) {
            const list = localStorageSalesByReceipt.get(sale.receiptNumber) || [];
            if (!list.includes(sale.id)) list.push(sale.id);
            localStorageSalesByReceipt.set(sale.receiptNumber, list);
          }
        }
        demoRecordsCount +=
          (parsed.products?.length || 0) + (parsed.sales?.length || 0);
      }
    } catch {
      // Ignore storage access errors
    }
  }

  if (dbAdapter) {
    try {
      // Collect verified businesses & shops registered in the local DB adapter (excluding demo and pre-Firebase test IDs)
      const localBusinesses = await dbAdapter.getAllBusinesses();
      for (const b of localBusinesses) {
        if (b?.id && !isKnownDemoRecord(b) && !isPreFirebaseTestRecord(b)) {
          verifiedBusinessIds.add(b.id);
          const shopsForBiz = await dbAdapter.getShopsForBusiness(b.id);
          for (const s of shopsForBiz) {
            if (s?.id && !isKnownDemoRecord(s) && !isPreFirebaseTestRecord(s)) {
              verifiedShopIds.add(s.id);
            }
          }
        }
      }

      const allQueue = dbAdapter.getAllSyncQueue
        ? await dbAdapter.getAllSyncQueue()
        : await dbAdapter.getPendingSyncQueue();
      const nonSynced = allQueue.filter((q) => q.status !== 'synced');

      for (const q of nonSynced) {
        const isQuarantined = q.status === 'quarantined';
        let classification: PendingSyncQueueAuditItem['classification'] =
          'unclassified';

        if (isQuarantined) {
          classification = 'quarantined';
          quarantinedSyncCount += 1;
        } else {
          pendingOfflineSyncCount += 1;
          if (
            isKnownDemoRecord({
              id: q.entity_id,
              business_id: q.business_id,
              shop_id: q.shop_id,
            })
          ) {
            classification = 'demo';
            pendingSyncDemoCount += 1;
          } else if (
            isVerifiedLiveTenant(
              q.business_id,
              q.shop_id,
              verifiedBusinessIds,
              verifiedShopIds
            )
          ) {
            classification = 'live';
            pendingSyncLiveCount += 1;
          } else {
            classification = 'unclassified';
            pendingSyncUnclassifiedCount += 1;
          }
        }

        // Parse payload_json safely without exposing customer personal data (names/phones)
        let payloadComplete = false;
        let payloadSummary = 'Missing or invalid payload_json';
        let receiptNumber: string | undefined;
        let itemsCount: number | undefined;
        let totalAmountNaira: number | undefined;
        let paymentMethod: string | undefined;
        let payloadCashierId = '';

        try {
          const parsedPayload = JSON.parse(q.payload_json || '{}');
          if (q.entity_type === 'sale') {
            const saleObj = parsedPayload.sale || parsedPayload;
            const itemsArr = Array.isArray(parsedPayload.items)
              ? parsedPayload.items
              : [];
            const paymentObj = parsedPayload.payment;

            receiptNumber = saleObj?.receipt_number;
            itemsCount = itemsArr.length;
            totalAmountNaira =
              typeof saleObj?.total_amount_kobo === 'number'
                ? fromMinorUnits(saleObj.total_amount_kobo)
                : undefined;
            paymentMethod = saleObj?.payment_method;
            payloadCashierId = saleObj?.cashier_user_id || '';

            const hasSaleCore = Boolean(
              saleObj &&
                saleObj.id &&
                saleObj.business_id &&
                saleObj.shop_id &&
                saleObj.receipt_number &&
                typeof saleObj.total_amount_kobo === 'number'
            );
            const hasItems = itemsArr.length > 0;
            const hasPayment = Boolean(
              paymentObj &&
                paymentObj.id &&
                typeof paymentObj.amount_kobo === 'number'
            );

            payloadComplete = hasSaleCore && hasItems && hasPayment;
            payloadSummary = payloadComplete
              ? `Complete (sale + ${itemsArr.length} item${itemsArr.length === 1 ? '' : 's'} + payment; customer PII redacted)`
              : `Incomplete (sale:${hasSaleCore ? 'ok' : 'missing'}, items:${itemsArr.length}, payment:${hasPayment ? 'ok' : 'missing'})`;
          } else {
            payloadComplete = Object.keys(parsedPayload).length > 0;
            payloadSummary = payloadComplete
              ? 'Non-empty entity payload'
              : 'Empty payload';
          }
        } catch {
          payloadComplete = false;
          payloadSummary = 'Malformed JSON in payload_json';
        }

        // Check corresponding local sale record in IndexedDB sales store
        let localSaleExists = false;
        let localSaleStatus: PendingSyncQueueAuditItem['localSaleStatus'] =
          q.entity_type === 'sale' ? 'missing' : 'not_applicable';
        const duplicateLocalSaleIds: string[] = [];

        if (q.entity_type === 'sale') {
          try {
            const localSale = await dbAdapter.getSale(q.entity_id);
            if (localSale) {
              localSaleExists = true;
              if (isQuarantined) {
                localSaleStatus = 'quarantined';
              } else if (
                localSale.sync_conflict_reason ||
                q.status === 'requires_review'
              ) {
                localSaleStatus = 'conflicted';
              } else if (q.status === 'failed') {
                localSaleStatus = 'failed';
              } else if (localSale.is_synced === 1) {
                localSaleStatus = 'completed_synced';
              } else {
                localSaleStatus = 'pending_sync';
              }
              if (!receiptNumber && localSale.receipt_number) {
                receiptNumber = localSale.receipt_number;
              }
            }

            if (q.business_id && q.shop_id) {
              const shopSales = await dbAdapter.getSales({
                businessId: q.business_id,
                shopId: q.shop_id,
              });
              for (const s of shopSales) {
                if (s.id === q.entity_id) continue;
                const sameReceipt =
                  receiptNumber && s.receipt_number === receiptNumber;
                const sameIdempotency =
                  q.idempotency_key &&
                  s.idempotency_key &&
                  s.idempotency_key === q.idempotency_key;
                if (sameReceipt || sameIdempotency) {
                  duplicateLocalSaleIds.push(`${s.id} (IndexedDB)`);
                }
              }
            }

            if (receiptNumber) {
              const lsIds = localStorageSalesByReceipt.get(receiptNumber) || [];
              for (const lsId of lsIds) {
                if (lsId !== q.entity_id) {
                  duplicateLocalSaleIds.push(`${lsId} (localStorage)`);
                }
              }
            }
          } catch {
            // Ignore local sale lookup errors
          }
        }

        // Determine actual origin using ID patterns, actor IDs, and timestamps
        let originSource: PendingSyncQueueAuditItem['originSource'] =
          'unclassified';
        let originReason = '';
        const isPreFirebaseSequentialBizId = /^biz-00\d\d-[a-z0-9]{4}$/i.test(
          q.business_id || ''
        );
        const isPreFirebaseSequentialShopId = /^shop-00\d\d-[a-z0-9]{4}$/i.test(
          q.shop_id || ''
        );
        const actorId = q.actor_user_id || payloadCashierId || '';
        const isSyntheticUserId =
          actorId.startsWith('usr-') || KNOWN_DEMO_USER_IDS.has(actorId);

        if (classification === 'demo') {
          originSource = 'demo_known_seed';
          originReason =
            'Matches hardcoded DEMO_BUSINESSES / DEMO_SHOPS seed IDs.';
        } else if (
          isPreFirebaseSequentialBizId ||
          isPreFirebaseSequentialShopId ||
          isSyntheticUserId ||
          isPreFirebaseTestRecord(q)
        ) {
          originSource = 'pre_firebase_local_test';
          originReason = `Created via local/demo state generator (${q.business_id} / ${q.shop_id}${actorId ? `, actor: ${actorId}` : ''}) prior to Live Firestore onboarding (which uses biz-live-* / shop-live-* and Firebase Auth UIDs).`;
        } else if (
          isVerifiedLiveTenant(
            q.business_id,
            q.shop_id,
            verifiedBusinessIds,
            verifiedShopIds
          )
        ) {
          originSource = 'live_authenticated_checkout';
          originReason =
            'Created in verified Live Mode workspace.';
        } else {
          originSource = 'unclassified';
          originReason =
            'Unverified business/shop tenant ID; blocked from automatic live classification.';
        }

        const auditItem: PendingSyncQueueAuditItem = {
          id: q.id,
          entityType: q.entity_type,
          entityId: q.entity_id,
          businessId: q.business_id || '',
          shopId: q.shop_id || '',
          createdAt: q.created_at || '',
          status: q.status,
          retryCount: q.retry_count ?? 0,
          idempotencyKey: q.idempotency_key || 'none',
          actorUserId: actorId,
          payloadComplete,
          payloadSummary,
          receiptNumber,
          itemsCount,
          totalAmountNaira,
          paymentMethod,
          localSaleExists,
          localSaleStatus,
          duplicateLocalSaleIds,
          originSource,
          originReason,
          classification,
          quarantinedAt: q.quarantined_at,
          quarantineReason: q.quarantine_reason || q.conflict_reason,
        };

        if (isQuarantined) {
          quarantinedSyncItems.push(auditItem);
        } else {
          pendingSyncItems.push(auditItem);
        }
      }
    } catch {
      // Ignore adapter errors
    }
  }

  details.push(
    `Identified ${demoRecordsCount} demo sample record(s), ${liveRecordsCount} live business record(s), ${pendingOfflineSyncCount} actionable pending offline sync operation(s) (${pendingSyncDemoCount} demo, ${pendingSyncLiveCount} verified live, ${pendingSyncUnclassifiedCount} unclassified), and ${quarantinedSyncCount} quarantined pre-Firebase test operation(s).`
  );

  return {
    demoRecordsCount,
    liveRecordsCount,
    pendingOfflineSyncCount,
    pendingSyncDemoCount,
    pendingSyncLiveCount,
    pendingSyncUnclassifiedCount,
    pendingSyncItems,
    quarantinedSyncCount,
    quarantinedSyncItems,
    unclassifiedRecordsCount,
    hasLegacyMixedStore,
    hasIsolatedDemoStore,
    liveUserCacheKeys,
    details,
  };
}

/**
 * Strictly read-only Cloud Firestore forensic check for pending sync_queue sale items.
 * Never writes, modifies, retries, or deletes any document.
 */
export async function verifyPendingSyncItemsAgainstFirestore(
  items: PendingSyncQueueAuditItem[]
): Promise<CloudForensicSaleCheckResult[]> {
  const results: CloudForensicSaleCheckResult[] = [];

  for (const item of items) {
    const res: CloudForensicSaleCheckResult = {
      syncId: item.id,
      saleId: item.entityId,
      businessId: item.businessId,
      shopId: item.shopId,
      idempotencyKey: item.idempotencyKey,
      receiptNumber: item.receiptNumber,
      businessExistsInFirestore: 'no',
      shopExistsInFirestore: 'no',
      saleExistsInFirestore: 'no',
      idempotencyProcessedInFirestore: 'no',
      duplicateCloudSaleIds: [],
      authNote: '',
    };

    if (!item.businessId || !item.shopId) {
      res.authNote = 'Missing businessId or shopId on queue item.';
      results.push(res);
      continue;
    }

    // 1. Check /businesses/{businessId}
    try {
      const bizSnap = await getDoc(doc(db, 'businesses', item.businessId));
      res.businessExistsInFirestore = bizSnap.exists() ? 'yes' : 'no';
    } catch (err: any) {
      const msg = String(err?.code || err?.message || '');
      res.businessExistsInFirestore =
        msg.includes('permission-denied') ||
        msg.toLowerCase().includes('insufficient permissions')
          ? 'permission_denied'
          : 'error';
    }

    // 2. Check /businesses/{businessId}/shops/{shopId}
    try {
      const shopSnap = await getDoc(
        doc(db, 'businesses', item.businessId, 'shops', item.shopId)
      );
      res.shopExistsInFirestore = shopSnap.exists() ? 'yes' : 'no';
    } catch (err: any) {
      const msg = String(err?.code || err?.message || '');
      res.shopExistsInFirestore =
        msg.includes('permission-denied') ||
        msg.toLowerCase().includes('insufficient permissions')
          ? 'permission_denied'
          : 'error';
    }

    // 3. Check /businesses/{businessId}/shops/{shopId}/sales/{saleId}
    try {
      const saleSnap = await getDoc(
        doc(
          db,
          'businesses',
          item.businessId,
          'shops',
          item.shopId,
          'sales',
          item.entityId
        )
      );
      res.saleExistsInFirestore = saleSnap.exists() ? 'yes' : 'no';

      const allShopSalesSnap = await getDocs(
        collection(db, 'businesses', item.businessId, 'shops', item.shopId, 'sales')
      );
      allShopSalesSnap.forEach((docSnap) => {
        const d = docSnap.data();
        if (docSnap.id !== item.entityId) {
          if (
            (item.receiptNumber && d.receiptNumber === item.receiptNumber) ||
            (item.idempotencyKey &&
              item.idempotencyKey !== 'none' &&
              d.idempotencyKey === item.idempotencyKey)
          ) {
            res.duplicateCloudSaleIds.push(docSnap.id);
          }
        }
        if (
          item.idempotencyKey &&
          item.idempotencyKey !== 'none' &&
          d.idempotencyKey === item.idempotencyKey
        ) {
          res.idempotencyProcessedInFirestore = 'yes';
        }
      });
    } catch (err: any) {
      const msg = String(err?.code || err?.message || '');
      if (
        msg.includes('permission-denied') ||
        msg.toLowerCase().includes('insufficient permissions')
      ) {
        res.saleExistsInFirestore = 'permission_denied';
      } else {
        res.saleExistsInFirestore = 'error';
      }
    }

    // 4. Check /businesses/{businessId}/shops/{shopId}/sync_operations/{idempotencyKey}
    if (
      item.idempotencyKey &&
      item.idempotencyKey !== 'none' &&
      res.idempotencyProcessedInFirestore !== 'yes'
    ) {
      try {
        const opSnap = await getDoc(
          doc(
            db,
            'businesses',
            item.businessId,
            'shops',
            item.shopId,
            'sync_operations',
            item.idempotencyKey
          )
        );
        res.idempotencyProcessedInFirestore = opSnap.exists() ? 'yes' : 'no';
      } catch (err: any) {
        const msg = String(err?.code || err?.message || '');
        res.idempotencyProcessedInFirestore =
          msg.includes('permission-denied') ||
          msg.toLowerCase().includes('insufficient permissions')
            ? 'permission_denied'
            : 'error';
      }
    }

    if (
      res.businessExistsInFirestore === 'no' &&
      res.shopExistsInFirestore === 'no'
    ) {
      res.authNote = `Business "${item.businessId}" and Shop "${item.shopId}" do not exist in Cloud Firestore (${firebaseConfig.firestoreDatabaseId}). Operational sales reads are also restricted by firestore.rules to assigned shop members (canAccessShop).`;
    } else if (res.saleExistsInFirestore === 'permission_denied') {
      res.authNote =
        'Firestore security rules (canAccessShop) restrict operational sales reads to the Business Owner or assigned Shop Manager/Cashier of that business (Platform Admin is isolated from shop sales).';
    } else {
      res.authNote = 'Read-only Firestore check completed.';
    }

    results.push(res);
  }

  return results;
}

/**
 * Safely clears only demo sample data after user confirmation without touching
 * live user caches or pending offline transactions in IndexedDB.
 */
export function clearDemoDataSafely(): {
  clearedDemoKeys: string[];
  preservedLiveCacheKeys: string[];
} {
  const clearedDemoKeys: string[] = [];
  const preservedLiveCacheKeys: string[] = [];

  if (typeof window === 'undefined') {
    return { clearedDemoKeys, preservedLiveCacheKeys };
  }

  try {
    if (window.localStorage.getItem(DEMO_ISOLATED_STORAGE_KEY) !== null) {
      window.localStorage.removeItem(DEMO_ISOLATED_STORAGE_KEY);
      clearedDemoKeys.push(DEMO_ISOLATED_STORAGE_KEY);
    }
    window.sessionStorage.removeItem(DEMO_ISOLATED_STORAGE_KEY);

    const legacyRaw = window.localStorage.getItem(LEGACY_MIXED_STORAGE_KEY);
    if (legacyRaw) {
      try {
        const parsed = JSON.parse(legacyRaw);
        const nonDemoBusinesses = (parsed.businesses || []).filter(
          (b: any) => !isKnownDemoRecord(b)
        );
        const nonDemoShops = (parsed.shops || []).filter(
          (s: any) => !isKnownDemoRecord(s)
        );
        const nonDemoProducts = (parsed.products || []).filter(
          (p: any) => !isKnownDemoRecord(p)
        );
        const nonDemoSales = (parsed.sales || []).filter(
          (s: any) => !isKnownDemoRecord(s)
        );

        if (
          nonDemoBusinesses.length === 0 &&
          nonDemoShops.length === 0 &&
          nonDemoProducts.length === 0 &&
          nonDemoSales.length === 0
        ) {
          window.localStorage.removeItem(LEGACY_MIXED_STORAGE_KEY);
          window.sessionStorage.removeItem(LEGACY_MIXED_STORAGE_KEY);
          clearedDemoKeys.push(LEGACY_MIXED_STORAGE_KEY);
        } else {
          // Preserve any non-demo records while stripping demo records
          const cleaned = {
            ...parsed,
            businesses: nonDemoBusinesses,
            shops: nonDemoShops,
            products: nonDemoProducts,
            sales: nonDemoSales,
          };
          window.localStorage.setItem(
            LEGACY_MIXED_STORAGE_KEY,
            JSON.stringify(cleaned)
          );
          clearedDemoKeys.push(`${LEGACY_MIXED_STORAGE_KEY} (demo records stripped)`);
        }
      } catch {
        // Leave untouched if unparseable
      }
    }

    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (
        k &&
        (k.startsWith(LIVE_USER_CACHE_PREFIX) ||
          k.startsWith(LIVE_BUSINESS_CACHE_PREFIX))
      ) {
        preservedLiveCacheKeys.push(k);
      }
    }
  } catch {
    // Ignore storage errors
  }

  return { clearedDemoKeys, preservedLiveCacheKeys };
}

export const LIVE_BUSINESS_CACHE_PREFIX = 'smartmind_live_business_cache_';

export function getLiveBusinessCacheKey(businessId: string): string {
  return `${LIVE_BUSINESS_CACHE_PREFIX}${businessId}`;
}

export function saveBusinessScopedLiveCache(
  businessId: string,
  dataset: LiveWorkspaceDataset
): void {
  if (typeof window === 'undefined' || !businessId) return;
  try {
    const existing = loadBusinessScopedLiveCache(businessId);
    const mergeEntities = <T extends { id: string }>(
      current: T[] = [],
      incoming: T[] = []
    ): T[] => {
      const map = new Map<string, T>();
      current.forEach((item) => map.set(item.id, item));
      incoming.forEach((item) => map.set(item.id, item));
      return Array.from(map.values());
    };

    const sanitizedUsers = (dataset.users || []).map((u) => {
      const copy = { ...u };
      delete copy.password;
      return copy;
    });

    const payload: LiveWorkspaceDataset = {
      ...dataset,
      users: mergeEntities(existing?.users, sanitizedUsers),
      businessId,
      cachedAt: new Date().toISOString(),
      debtCustomers: mergeEntities(
        existing?.debtCustomers,
        dataset.debtCustomers
      ),
      debtTransactions: mergeEntities(
        existing?.debtTransactions,
        dataset.debtTransactions
      ),
      suppliers: mergeEntities(existing?.suppliers, dataset.suppliers),
      supplierSupplies: mergeEntities(
        existing?.supplierSupplies,
        dataset.supplierSupplies
      ),
      invoices: mergeEntities(existing?.invoices, dataset.invoices),
      stockAdjustments: mergeEntities(
        existing?.stockAdjustments,
        dataset.stockAdjustments
      ),
      customRoles: mergeEntities(existing?.customRoles, dataset.customRoles),
    };

    window.localStorage.setItem(
      getLiveBusinessCacheKey(businessId),
      JSON.stringify(payload)
    );
  } catch {
    // Ignore quota errors
  }
}

export function loadBusinessScopedLiveCache(
  businessId: string
): LiveWorkspaceDataset | null {
  if (typeof window === 'undefined' || !businessId) return null;
  try {
    let result: LiveWorkspaceDataset | null = null;
    const raw = window.localStorage.getItem(getLiveBusinessCacheKey(businessId));
    if (raw) {
      const parsed = JSON.parse(raw) as LiveWorkspaceDataset;
      if (parsed.businessId === businessId) {
        result = parsed;
      }
    }

    const mergeEntities = <T extends { id: string }>(
      current: T[] = [],
      incoming: T[] = []
    ): T[] => {
      const map = new Map<string, T>();
      current.forEach((item) => map.set(item.id, item));
      incoming.forEach((item) => map.set(item.id, item));
      return Array.from(map.values());
    };

    // Scan all user caches to aggregate records created under any user belonging to this business
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(LIVE_USER_CACHE_PREFIX)) {
        try {
          const itemRaw = window.localStorage.getItem(k);
          if (!itemRaw) continue;
          const parsedItem = JSON.parse(itemRaw) as LiveWorkspaceDataset;
          if (parsedItem.businessId === businessId) {
            if (!result) {
              result = { ...parsedItem };
            } else {
              result.debtCustomers = mergeEntities(
                result.debtCustomers,
                parsedItem.debtCustomers
              );
              result.debtTransactions = mergeEntities(
                result.debtTransactions,
                parsedItem.debtTransactions
              );
              result.suppliers = mergeEntities(
                result.suppliers,
                parsedItem.suppliers
              );
              result.supplierSupplies = mergeEntities(
                result.supplierSupplies,
                parsedItem.supplierSupplies
              );
              result.invoices = mergeEntities(
                result.invoices,
                parsedItem.invoices
              );
              result.stockAdjustments = mergeEntities(
                result.stockAdjustments,
                parsedItem.stockAdjustments
              );
              result.customRoles = mergeEntities(
                result.customRoles,
                parsedItem.customRoles
              );
              result.users = mergeEntities(
                result.users,
                parsedItem.users
              );
            }
          }
        } catch {
          // Ignore parse errors on corrupted keys
        }
      }
    }

    if (!result) return null;

    return {
      ...result,
      businesses: (result.businesses || []).filter((b) => !isKnownDemoRecord(b)),
      shops: (result.shops || []).filter((s) => !isKnownDemoRecord(s)),
      products: (result.products || []).filter((p) => !isKnownDemoRecord(p)),
      sales: (result.sales || []).filter((s) => !isKnownDemoRecord(s)),
    };
  } catch {
    return null;
  }
}

export function getLiveUserCacheKey(userId: string): string {
  return `${LIVE_USER_CACHE_PREFIX}${userId}`;
}

export function saveUserScopedLiveCache(
  userId: string,
  dataset: LiveWorkspaceDataset
): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    const sanitizedUsers = dataset.users.map((u) => {
      const copy = { ...u };
      delete copy.password;
      return copy;
    });
    const payload: LiveWorkspaceDataset = {
      ...dataset,
      users: sanitizedUsers,
      ownerUserId: userId,
      cachedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(
      getLiveUserCacheKey(userId),
      JSON.stringify(payload)
    );
    if (dataset.businessId) {
      saveBusinessScopedLiveCache(dataset.businessId, dataset);
    }
  } catch {
    // Ignore quota errors
  }
}

export function loadUserScopedLiveCache(
  userId: string
): LiveWorkspaceDataset | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const raw = window.localStorage.getItem(getLiveUserCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LiveWorkspaceDataset;
    if (parsed.ownerUserId !== userId) {
      return null;
    }
    // Filter out any accidental demo records
    return {
      ...parsed,
      businesses: (parsed.businesses || []).filter((b) => !isKnownDemoRecord(b)),
      shops: (parsed.shops || []).filter((s) => !isKnownDemoRecord(s)),
      products: (parsed.products || []).filter((p) => !isKnownDemoRecord(p)),
      sales: (parsed.sales || []).filter((s) => !isKnownDemoRecord(s)),
    };
  } catch {
    return null;
  }
}

/**
 * Abstraction over Firestore operations so LiveSessionResolver can run against
 * real Cloud Firestore in production and deterministic mocks in automated tests.
 */
export interface LiveCloudStoreProvider {
  getUserProfile(uid: string): Promise<User | null>;
  getBusiness(businessId: string): Promise<Business | null>;
  listAllBusinesses(): Promise<Business[]>;
  listAllUsers(): Promise<User[]>;
  listBusinessUsers(businessId: string): Promise<User[]>;
  listBusinessShops(businessId: string): Promise<Shop[]>;
  getShop(businessId: string, shopId: string): Promise<Shop | null>;
  listShopProducts(businessId: string, shopId: string): Promise<Product[]>;
  listShopSales(businessId: string, shopId: string): Promise<SaleTransaction[]>;
  saveUserProfile(user: User): Promise<void>;
  saveBusiness(business: Business): Promise<void>;
  saveShop(shop: Shop): Promise<void>;
  saveProduct(product: Product): Promise<void>;
  deleteProduct(businessId: string, shopId: string, productId: string): Promise<void>;
  saveSale(sale: SaleTransaction): Promise<void>;
  executeAtomicSaleSync?(request: SyncOperationRequest): Promise<SyncOperationResponse>;
  provisionBusinessAndPrimaryOwner?(
    request: ProvisionBusinessRequest
  ): Promise<ProvisionBusinessResponse>;
  repairBusinessOwnerAuth?(
    request: RepairBusinessOwnerAuthRequest
  ): Promise<RepairBusinessOwnerAuthResponse>;
  inviteAuthorizedStaff?(
    request: InviteAuthorizedStaffRequest
  ): Promise<InviteAuthorizedStaffResponse>;
  setTenantStatus?(
    request: SetTenantStatusRequest
  ): Promise<SetTenantStatusResponse>;
  resetUserPassword?(
    request: ResetUserPasswordRequest
  ): Promise<ResetUserPasswordResponse>;
  sendPasswordResetEmail?(email: string): Promise<void>;
  sendEmailVerificationToCurrentUser?(): Promise<void>;
  reloadAndGetCurrentAuthState?(expectedUid?: string): Promise<{
    uid: string;
    email: string;
    emailVerified: boolean;
    idTokenRefreshed: boolean;
  } | null>;
  listAllShopsGlobal?(): Promise<Shop[]>;
  listAllProductsGlobal?(businessId?: string): Promise<Product[]>;
  listAllSalesGlobal?(criteria?: { businessId?: string; shopId?: string }): Promise<SaleTransaction[]>;
  recordPlatformAuditLog?(log: PlatformAdminAuditLog): Promise<void>;
  listPlatformAuditLogs?(filters?: { businessId?: string; action?: string; limit?: number }): Promise<PlatformAdminAuditLog[]>;
  listBusinessTransfers?(businessId: string): Promise<ProductTransfer[]>;
  saveTransfer?(transfer: ProductTransfer): Promise<void>;
}

export function sanitizeFirestorePayload<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => sanitizeFirestorePayload(item)) as unknown as T;
  }
  if (typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val !== undefined) {
        result[key] = sanitizeFirestorePayload(val);
      }
    }
    return result as T;
  }
  return obj;
}

export class FirestoreCloudStoreProvider implements LiveCloudStoreProvider {
  private mapDocToUser(docId: string, d: Record<string, any>): User {
    return {
      id: d.id || docId,
      businessId: d.businessId,
      username: d.username || (d.email ? String(d.email).split('@')[0] : docId),
      email: d.email,
      fullName: d.fullName,
      role: d.role,
      roleLabel: d.roleLabel || d.role,
      assignedShopIds: Array.isArray(d.assignedShopIds) ? d.assignedShopIds : [],
      permissions: Array.isArray(d.permissions)
        ? d.permissions
        : ROLE_DEFAULT_PERMISSIONS[
            d.role as keyof typeof ROLE_DEFAULT_PERMISSIONS
          ] || [],
      status: d.status || 'active',
      createdAt: d.createdAt || new Date().toISOString(),
      lastLoginAt: d.updatedAt || new Date().toISOString(),
      ...(typeof d.authUidLinked === 'boolean'
        ? { authUidLinked: d.authUidLinked }
        : {}),
      ...(typeof d.emailVerified === 'boolean'
        ? { emailVerified: d.emailVerified }
        : {}),
      ...(typeof d.authDisabled === 'boolean'
        ? { authDisabled: d.authDisabled }
        : {}),
      ...(typeof d.authAccountCreatedAt === 'string'
        ? { authAccountCreatedAt: d.authAccountCreatedAt }
        : {}),
      ...(d.passwordSetupStatus === 'pending' ||
      d.passwordSetupStatus === 'email_sent' ||
      d.passwordSetupStatus === 'password_established' ||
      d.passwordSetupStatus === 'verified'
        ? { passwordSetupStatus: d.passwordSetupStatus }
        : {}),
      ...(typeof d.passwordSetupEmailSentAt === 'string'
        ? { passwordSetupEmailSentAt: d.passwordSetupEmailSentAt }
        : {}),
      ...(typeof d.repairedFromUserId === 'string'
        ? { repairedFromUserId: d.repairedFromUserId }
        : {}),
      ...(typeof d.repairedAt === 'string' ? { repairedAt: d.repairedAt } : {}),
    };
  }

  async getUserProfile(uid: string): Promise<User | null> {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    return this.mapDocToUser(snap.id, snap.data());
  }

  async getBusiness(businessId: string): Promise<Business | null> {
    const snap = await getDoc(doc(db, 'businesses', businessId));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      id: d.id || snap.id,
      name: d.name,
      legalName: d.legalName || d.name,
      businessType: d.businessType || 'Supermarket & Grocery Chain',
      registrationNumber: d.registrationNumber || 'RC-PENDING',
      taxIdentificationNumber: d.taxIdentificationNumber || 'TIN-PENDING',
      ownerUserId: d.ownerUserId,
      ownerName: d.ownerName,
      ownerEmail: d.ownerEmail,
      contactEmail: d.contactEmail || d.ownerEmail,
      primaryPhone: d.primaryPhone,
      headquartersAddress: d.headquartersAddress,
      currencyCode: d.currencyCode || BASE_CURRENCY_CODE,
      currencySymbol: d.currencySymbol || BASE_CURRENCY_SYMBOL,
      defaultTaxRatePercent:
        typeof d.defaultTaxRatePercent === 'number' ? d.defaultTaxRatePercent : 7.5,
      status: d.status || 'active',
      notes: d.notes,
      createdAt: d.createdAt || new Date().toISOString(),
    };
  }

  async listAllBusinesses(): Promise<Business[]> {
    const snap = await getDocs(collection(db, 'businesses'));
    return snap.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: d.id || docSnap.id,
        name: d.name,
        legalName: d.legalName || d.name,
        businessType: d.businessType || 'Supermarket & Grocery Chain',
        registrationNumber: d.registrationNumber || 'RC-PENDING',
        taxIdentificationNumber: d.taxIdentificationNumber || 'TIN-PENDING',
        ownerUserId: d.ownerUserId,
        ownerName: d.ownerName,
        ownerEmail: d.ownerEmail,
        contactEmail: d.contactEmail || d.ownerEmail,
        primaryPhone: d.primaryPhone,
        headquartersAddress: d.headquartersAddress,
        currencyCode: d.currencyCode || BASE_CURRENCY_CODE,
        currencySymbol: d.currencySymbol || BASE_CURRENCY_SYMBOL,
        defaultTaxRatePercent:
          typeof d.defaultTaxRatePercent === 'number' ? d.defaultTaxRatePercent : 7.5,
        status: d.status || 'active',
        notes: d.notes,
        createdAt: d.createdAt || new Date().toISOString(),
      };
    });
  }

  async listAllUsers(): Promise<User[]> {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map((docSnap) =>
      this.mapDocToUser(docSnap.id, docSnap.data())
    );
  }

  async listBusinessUsers(businessId: string): Promise<User[]> {
    const q = query(
      collection(db, 'users'),
      where('businessId', '==', businessId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((docSnap) =>
      this.mapDocToUser(docSnap.id, docSnap.data())
    );
  }

  async listBusinessShops(businessId: string): Promise<Shop[]> {
    const snap = await getDocs(
      collection(db, 'businesses', businessId, 'shops')
    );
    return snap.docs.map((docSnap) => this.mapDocToShop(docSnap.id, docSnap.data()));
  }

  async getShop(businessId: string, shopId: string): Promise<Shop | null> {
    const snap = await getDoc(doc(db, 'businesses', businessId, 'shops', shopId));
    if (!snap.exists()) return null;
    return this.mapDocToShop(snap.id, snap.data());
  }

  private mapDocToShop(docId: string, d: Record<string, any>): Shop {
    return {
      id: d.id || docId,
      businessId: d.businessId,
      code: d.code,
      name: d.name,
      category: d.category || 'Supermarket',
      locationCity: d.locationCity || 'Lagos',
      address: d.address,
      phone: d.phone,
      description: d.description || undefined,
      managerName: d.managerName || 'Shop Manager',
      status: d.status || 'active',
      terminalId: d.terminalId || `TERM-${d.code || docId}`,
      taxRatePercent: typeof d.taxRatePercent === 'number' ? d.taxRatePercent : 7.5,
      vatEnabled:
        typeof d.vatEnabled === 'boolean'
          ? d.vatEnabled
          : typeof d.taxRatePercent === 'number'
            ? d.taxRatePercent > 0
            : false,
      printVatOnReceipt:
        typeof d.printVatOnReceipt === 'boolean' ? d.printVatOnReceipt : false,
      receiptHeaderNote: d.receiptHeaderNote || `${d.name} — Official Receipt`,
      receiptFooterNote: d.receiptFooterNote || 'Thank you for your patronage',
      enableTableTabs:
        typeof d.enableTableTabs === 'boolean'
          ? d.enableTableTabs
          : d.category === 'Bar & Lounge',
      createdAt: d.createdAt || new Date().toISOString(),
      pendingSyncCount: 0,
      lastSyncedAt: d.updatedAt || 'Cloud Synced',
    };
  }

  async listShopProducts(businessId: string, shopId: string): Promise<Product[]> {
    const snap = await getDocs(
      collection(db, 'businesses', businessId, 'shops', shopId, 'products')
    );
    return snap.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: d.id || docSnap.id,
        shopId: d.shopId || shopId,
        businessId: d.businessId || businessId,
        categoryId: d.categoryId || `cat-${shopId}-general`,
        categoryName: d.categoryName || 'General Merchandise',
        sku: d.sku,
        barcode: d.barcode || d.sku,
        name: d.name,
        unit: d.unit || 'Unit',
        costPrice:
          typeof d.costPrice === 'number' && d.costPrice > 0
            ? d.costPrice
            : typeof d.costPriceKobo === 'number' && d.costPriceKobo > 0
            ? fromMinorUnits(d.costPriceKobo)
            : typeof d.cost_price === 'number' && d.cost_price > 0
            ? d.cost_price
            : typeof d.cost_price_kobo === 'number' && d.cost_price_kobo > 0
            ? fromMinorUnits(d.cost_price_kobo)
            : typeof d.costPrice === 'number'
            ? d.costPrice
            : typeof d.costPriceKobo === 'number'
            ? fromMinorUnits(d.costPriceKobo)
            : 0,
        sellingPrice:
          typeof d.sellingPrice === 'number' && d.sellingPrice > 0
            ? d.sellingPrice
            : typeof d.sellingPriceKobo === 'number' && d.sellingPriceKobo > 0
            ? fromMinorUnits(d.sellingPriceKobo)
            : typeof d.selling_price === 'number' && d.selling_price > 0
            ? d.selling_price
            : typeof d.selling_price_kobo === 'number' && d.selling_price_kobo > 0
            ? fromMinorUnits(d.selling_price_kobo)
            : typeof d.sellingPrice === 'number'
            ? d.sellingPrice
            : typeof d.sellingPriceKobo === 'number'
            ? fromMinorUnits(d.sellingPriceKobo)
            : 0,
        stockQuantity: Number(d.stockQuantity || 0),
        reorderLevel: Number(d.reorderLevel || 0),
        hasExpiry: Boolean(d.hasExpiry),
        expiryDate: d.expiryDate || null,
        isActive: d.isActive !== false,
        createdAt: d.createdAt || d.updatedAt || new Date().toISOString(),
        updatedAt: d.updatedAt || new Date().toISOString(),
      };
    });
  }

  async listShopSales(
    businessId: string,
    shopId: string
  ): Promise<SaleTransaction[]> {
    const snap = await getDocs(
      collection(db, 'businesses', businessId, 'shops', shopId, 'sales')
    );
    const sales = await Promise.all(
      snap.docs.map(async (docSnap) => {
        const d = docSnap.data();
        let items: SaleLineItem[] = [];

        if (Array.isArray(d.items) && d.items.length > 0) {
          items = d.items.map((it: any) => ({
            id: it.id || it.productId || it.product_id,
            productId: it.productId || it.product_id,
            sku: it.sku || '',
            barcode: it.barcode || it.sku || '',
            productName: it.productName || it.product_name || 'Item',
            unit: it.unit || 'Unit',
            unitPrice:
              typeof it.unitPrice === 'number'
                ? it.unitPrice
                : fromMinorUnits(Number(it.unitPriceKobo || it.unit_price_kobo || 0)),
            costPrice:
              typeof it.costPrice === 'number'
                ? it.costPrice
                : fromMinorUnits(Number(it.costPriceKobo || it.cost_price_kobo || 0)),
            quantity: Number(it.quantity || 1),
            lineTotal:
              typeof it.lineTotal === 'number'
                ? it.lineTotal
                : fromMinorUnits(Number(it.lineTotalKobo || it.line_total_kobo || 0)),
          }));
        } else {
          try {
            const itemsSnap = await getDocs(
              collection(db, 'businesses', businessId, 'shops', shopId, 'sales', docSnap.id, 'items')
            );
            if (!itemsSnap.empty) {
              items = itemsSnap.docs.map((iDoc) => {
                const idata = iDoc.data();
                return {
                  id: idata.id || iDoc.id,
                  productId: idata.productId || idata.product_id,
                  sku: idata.sku || '',
                  barcode: idata.barcode || idata.sku || '',
                  productName: idata.productName || idata.product_name || 'Item',
                  unit: idata.unit || 'Unit',
                  unitPrice:
                    typeof idata.unitPrice === 'number'
                      ? idata.unitPrice
                      : fromMinorUnits(Number(idata.unitPriceKobo || idata.unit_price_kobo || 0)),
                  costPrice:
                    typeof idata.costPrice === 'number'
                      ? idata.costPrice
                      : fromMinorUnits(Number(idata.costPriceKobo || idata.cost_price_kobo || 0)),
                  quantity: Number(idata.quantity || 1),
                  lineTotal:
                    typeof idata.lineTotal === 'number'
                      ? idata.lineTotal
                      : fromMinorUnits(Number(idata.lineTotalKobo || idata.line_total_kobo || 0)),
                };
              });
            }
          } catch (err) {
            console.warn(`Could not load line items for sale ${docSnap.id}:`, err);
          }
        }

        return {
          id: d.id || docSnap.id,
          shopId: d.shopId || shopId,
          businessId: d.businessId || businessId,
          receiptNumber: d.receiptNumber,
          terminalId: d.terminalId || 'TERM-01',
          cashierUserId: d.cashierUserId,
          cashierName: d.cashierName,
          createdAt: d.createdAt,
          items,
          subtotal: fromMinorUnits(Number(d.subtotalKobo || 0)),
          discountAmount: fromMinorUnits(Number(d.discountAmountKobo || 0)),
          taxRatePercent: Number(d.taxRatePercent || 0),
          taxAmount: fromMinorUnits(Number(d.taxAmountKobo || 0)),
          totalAmount: fromMinorUnits(Number(d.totalAmountKobo || 0)),
          amountTendered: fromMinorUnits(Number(d.amountTenderedKobo || 0)),
          changeDue: fromMinorUnits(Number(d.changeDueKobo || 0)),
          paymentMethod: d.paymentMethod || 'cash',
          paymentReference: d.paymentReference,
          creditCustomerId: d.creditCustomerId,
          creditCustomerName: d.creditCustomerName,
          creditCustomerPhone: d.creditCustomerPhone,
          status: (d.status as TransactionStatus) || 'completed',
          syncStatus: (d.syncStatus as SaleTransaction['syncStatus']) || 'synced',
          notes: d.notes || 'Cloud Confirmed Sale',
        };
      })
    );
    return sales;
  }

  async listAllShopsGlobal(): Promise<Shop[]> {
    const businesses = await this.listAllBusinesses();
    const allShops: Shop[] = [];
    for (const b of businesses) {
      try {
        const shops = await this.listBusinessShops(b.id);
        allShops.push(...shops);
      } catch {
        // continue
      }
    }
    return allShops;
  }

  async listAllProductsGlobal(businessId?: string): Promise<Product[]> {
    const rawBusinesses = businessId
      ? [{ id: businessId } as Business]
      : await this.listAllBusinesses();
    const businesses = rawBusinesses.filter(
      (b) => !isKnownDemoRecord(b) && !isPlatformAdminBusinessSentinel(b.id)
    );
    const shopLists = await Promise.all(
      businesses.map(async (b) => {
        try {
          const shops = await this.listBusinessShops(b.id);
          return shops.filter((s) => !isKnownDemoRecord(s));
        } catch {
          return [];
        }
      })
    );
    const allShops = shopLists.flat();
    const productLists = await Promise.all(
      allShops.map(async (s) => {
        try {
          const prods = await this.listShopProducts(s.businessId, s.id);
          return prods.filter((p) => !isKnownDemoRecord(p));
        } catch {
          return [];
        }
      })
    );
    return productLists.flat();
  }

  async listAllSalesGlobal(criteria?: {
    businessId?: string;
    shopId?: string;
  }): Promise<SaleTransaction[]> {
    if (criteria?.businessId && criteria?.shopId) {
      const sales = await this.listShopSales(criteria.businessId, criteria.shopId);
      return sales.filter((s) => !isKnownDemoRecord(s));
    }
    const rawBusinesses = criteria?.businessId
      ? [{ id: criteria.businessId } as Business]
      : await this.listAllBusinesses();
    const businesses = rawBusinesses.filter(
      (b) => !isKnownDemoRecord(b) && !isPlatformAdminBusinessSentinel(b.id)
    );
    let allShops: Shop[] = [];
    if (criteria?.shopId) {
      allShops = businesses.map(
        (b) => ({ id: criteria.shopId!, businessId: b.id } as Shop)
      );
    } else {
      const shopLists = await Promise.all(
        businesses.map(async (b) => {
          try {
            const shops = await this.listBusinessShops(b.id);
            return shops.filter((s) => !isKnownDemoRecord(s));
          } catch {
            return [];
          }
        })
      );
      allShops = shopLists.flat();
    }
    const salesLists = await Promise.all(
      allShops.map(async (s) => {
        try {
          const sales = await this.listShopSales(s.businessId, s.id);
          return sales.filter((sale) => !isKnownDemoRecord(sale));
        } catch {
          return [];
        }
      })
    );
    return salesLists.flat();
  }

  async recordPlatformAuditLog(log: PlatformAdminAuditLog): Promise<void> {
    const ref = doc(db, 'platform_audit_logs', log.id);
    const payload: Record<string, any> = {
      id: log.id,
      businessId: log.businessId,
      businessName: log.businessName,
      adminUid: log.adminUid,
      adminEmail: log.adminEmail,
      adminName: log.adminName,
      action: log.action,
      targetEntityType: log.targetEntityType,
      targetEntityId: log.targetEntityId,
      targetEntityName: log.targetEntityName,
      reason: log.reason,
      createdAt: log.createdAt,
    };
    if (log.shopId) payload.shopId = log.shopId;
    if (log.shopName) payload.shopName = log.shopName;
    if (log.previousState) {
      payload.previousState =
        typeof log.previousState === 'string'
          ? log.previousState
          : JSON.stringify(log.previousState);
    }
    if (log.newState) {
      payload.newState =
        typeof log.newState === 'string'
          ? log.newState
          : JSON.stringify(log.newState);
    }
    await setDoc(ref, payload);
  }

  async listPlatformAuditLogs(filters?: {
    businessId?: string;
    action?: string;
    limit?: number;
  }): Promise<PlatformAdminAuditLog[]> {
    const snap = await getDocs(collection(db, 'platform_audit_logs'));
    let logs: PlatformAdminAuditLog[] = snap.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: d.id || docSnap.id,
        businessId: d.businessId,
        businessName: d.businessName,
        shopId: d.shopId,
        shopName: d.shopName,
        adminUid: d.adminUid,
        adminEmail: d.adminEmail,
        adminName: d.adminName,
        action: d.action,
        targetEntityType: d.targetEntityType,
        targetEntityId: d.targetEntityId,
        targetEntityName: d.targetEntityName,
        previousState: d.previousState,
        newState: d.newState,
        reason: d.reason,
        createdAt: d.createdAt,
      };
    });
    if (filters?.businessId && filters.businessId !== 'all') {
      logs = logs.filter((l) => l.businessId === filters.businessId);
    }
    if (filters?.action && filters.action !== 'all') {
      logs = logs.filter((l) => l.action === filters.action);
    }
    logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (filters?.limit) {
      logs = logs.slice(0, filters.limit);
    }
    return logs;
  }

  async listBusinessTransfers(businessId: string): Promise<ProductTransfer[]> {
    const snap = await getDocs(
      collection(db, 'businesses', businessId, 'transfers')
    );
    const transfers: ProductTransfer[] = snap.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: d.id || docSnap.id,
        transferNumber: d.transferNumber || `TRF-${docSnap.id.slice(0, 8)}`,
        businessId: d.businessId || businessId,
        sourceShopId: d.sourceShopId,
        sourceShopName: d.sourceShopName || 'Source Shop',
        sourceShopCode: d.sourceShopCode,
        destinationShopId: d.destinationShopId,
        destinationShopName: d.destinationShopName || 'Destination Shop',
        destinationShopCode: d.destinationShopCode,
        items: Array.isArray(d.items) ? d.items : [],
        totalItems: typeof d.totalItems === 'number' ? d.totalItems : (d.items?.length || 0),
        totalQuantity: typeof d.totalQuantity === 'number' ? d.totalQuantity : 0,
        status: d.status || 'pending',
        sourceDeducted: Boolean(d.sourceDeducted),
        sourceDeductedAt: d.sourceDeductedAt,
        notes: d.notes,
        initiatedByUserId: d.initiatedByUserId,
        initiatedByUserName: d.initiatedByUserName || 'Staff',
        initiatedAt: d.initiatedAt || new Date().toISOString(),
        confirmedByUserId: d.confirmedByUserId,
        confirmedByUserName: d.confirmedByUserName,
        confirmedAt: d.confirmedAt,
        rejectionReason: d.rejectionReason,
        rejectedByUserId: d.rejectedByUserId,
        rejectedByUserName: d.rejectedByUserName,
        rejectedAt: d.rejectedAt,
        createdAt: d.createdAt || new Date().toISOString(),
        updatedAt: d.updatedAt || new Date().toISOString(),
      };
    });
    transfers.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return transfers;
  }

  async saveTransfer(transfer: ProductTransfer): Promise<void> {
    const nowIso = new Date().toISOString();
    const rawPayload: Record<string, any> = {
      id: transfer.id,
      transferNumber: transfer.transferNumber,
      businessId: transfer.businessId,
      sourceShopId: transfer.sourceShopId,
      sourceShopName: transfer.sourceShopName,
      destinationShopId: transfer.destinationShopId,
      destinationShopName: transfer.destinationShopName,
      items: (transfer.items || []).map((item) => {
        const itemObj: Record<string, any> = {
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          unit: item.unit || 'Unit',
          quantity: Number(item.quantity || 1),
        };
        if (item.barcode) itemObj.barcode = item.barcode;
        if (typeof item.costPrice === 'number') itemObj.costPrice = item.costPrice;
        if (typeof item.sellingPrice === 'number') itemObj.sellingPrice = item.sellingPrice;
        if (item.categoryId) itemObj.categoryId = item.categoryId;
        if (item.categoryName) itemObj.categoryName = item.categoryName;
        return itemObj;
      }),
      totalItems: Number(transfer.totalItems || transfer.items?.length || 0),
      totalQuantity: Number(transfer.totalQuantity || 0),
      status: transfer.status || 'pending',
      initiatedByUserId: transfer.initiatedByUserId,
      initiatedByUserName: transfer.initiatedByUserName,
      initiatedAt: transfer.initiatedAt || nowIso,
      createdAt: transfer.createdAt || nowIso,
      updatedAt: nowIso,
    };

    if (transfer.sourceShopCode) rawPayload.sourceShopCode = transfer.sourceShopCode;
    if (transfer.destinationShopCode) rawPayload.destinationShopCode = transfer.destinationShopCode;
    if (transfer.notes && transfer.notes.trim()) rawPayload.notes = transfer.notes.trim();
    if (transfer.sourceDeducted !== undefined) rawPayload.sourceDeducted = Boolean(transfer.sourceDeducted);
    if (transfer.sourceDeductedAt) rawPayload.sourceDeductedAt = transfer.sourceDeductedAt;
    if (transfer.confirmedByUserId) rawPayload.confirmedByUserId = transfer.confirmedByUserId;
    if (transfer.confirmedByUserName) rawPayload.confirmedByUserName = transfer.confirmedByUserName;
    if (transfer.confirmedAt) rawPayload.confirmedAt = transfer.confirmedAt;
    if (transfer.rejectionReason && transfer.rejectionReason.trim()) rawPayload.rejectionReason = transfer.rejectionReason.trim();
    if (transfer.rejectedByUserId) rawPayload.rejectedByUserId = transfer.rejectedByUserId;
    if (transfer.rejectedByUserName) rawPayload.rejectedByUserName = transfer.rejectedByUserName;
    if (transfer.rejectedAt) rawPayload.rejectedAt = transfer.rejectedAt;

    const payload = sanitizeFirestorePayload(rawPayload);

    await setDoc(
      doc(db, 'businesses', transfer.businessId, 'transfers', transfer.id),
      payload
    );
  }

  async saveUserProfile(user: User): Promise<void> {
    const nowIso = new Date().toISOString();
    const userRef = doc(db, 'users', user.id);
    const existingSnap = await getDoc(userRef);
    const existingData = existingSnap.exists() ? existingSnap.data() : null;

    const canonicalCreatedAt =
      typeof existingData?.createdAt === 'string' &&
      existingData.createdAt.trim().length > 0
        ? existingData.createdAt
        : String(user.createdAt || nowIso).slice(0, 50);

    const canonicalBusinessId =
      typeof existingData?.businessId === 'string' &&
      existingData.businessId.trim().length > 0
        ? existingData.businessId
        : user.businessId;

    const resolvedAuthUidLinked =
      typeof user.authUidLinked === 'boolean'
        ? user.authUidLinked
        : typeof existingData?.authUidLinked === 'boolean'
        ? existingData.authUidLinked
        : undefined;
    const resolvedEmailVerified =
      typeof user.emailVerified === 'boolean'
        ? user.emailVerified
        : typeof existingData?.emailVerified === 'boolean'
        ? existingData.emailVerified
        : undefined;
    const resolvedAuthDisabled =
      typeof user.authDisabled === 'boolean'
        ? user.authDisabled
        : typeof existingData?.authDisabled === 'boolean'
        ? existingData.authDisabled
        : undefined;
    const resolvedAuthAccountCreatedAt =
      typeof user.authAccountCreatedAt === 'string'
        ? user.authAccountCreatedAt
        : typeof existingData?.authAccountCreatedAt === 'string'
        ? existingData.authAccountCreatedAt
        : undefined;
    const resolvedPasswordSetupStatus =
      user.passwordSetupStatus ||
      (existingData?.passwordSetupStatus === 'pending' ||
      existingData?.passwordSetupStatus === 'email_sent' ||
      existingData?.passwordSetupStatus === 'password_established' ||
      existingData?.passwordSetupStatus === 'verified'
        ? existingData.passwordSetupStatus
        : undefined);
    const resolvedPasswordSetupEmailSentAt =
      typeof user.passwordSetupEmailSentAt === 'string'
        ? user.passwordSetupEmailSentAt
        : typeof existingData?.passwordSetupEmailSentAt === 'string'
        ? existingData.passwordSetupEmailSentAt
        : undefined;
    const resolvedRepairedFromUserId =
      typeof user.repairedFromUserId === 'string'
        ? user.repairedFromUserId
        : typeof existingData?.repairedFromUserId === 'string'
        ? existingData.repairedFromUserId
        : undefined;
    const resolvedRepairedAt =
      typeof user.repairedAt === 'string'
        ? user.repairedAt
        : typeof existingData?.repairedAt === 'string'
        ? existingData.repairedAt
        : undefined;

    const payload: Record<string, any> = {
      id: user.id,
      businessId: canonicalBusinessId,
      username: (
        user.username ||
        existingData?.username ||
        user.email.split('@')[0] ||
        user.id
      ).slice(0, 80),
      email: user.email || existingData?.email,
      fullName: (user.fullName || existingData?.fullName || '').slice(0, 120),
      role: user.role || existingData?.role,
      roleLabel: (
        user.roleLabel ||
        existingData?.roleLabel ||
        user.role
      ).slice(0, 100),
      assignedShopIds: (
        user.assignedShopIds ||
        existingData?.assignedShopIds ||
        []
      ).slice(0, 50),
      permissions: (
        user.permissions ||
        existingData?.permissions ||
        []
      ).slice(0, 30),
      status: user.status === 'suspended' ? 'suspended' : 'active',
      schemaVersion:
        typeof existingData?.schemaVersion === 'number' &&
        existingData.schemaVersion >= 1
          ? existingData.schemaVersion
          : 1,
      createdAt: canonicalCreatedAt.slice(0, 50),
      updatedAt: nowIso.slice(0, 50),
      ...(typeof resolvedAuthUidLinked === 'boolean'
        ? { authUidLinked: resolvedAuthUidLinked }
        : {}),
      ...(typeof resolvedEmailVerified === 'boolean'
        ? { emailVerified: resolvedEmailVerified }
        : {}),
      ...(typeof resolvedAuthDisabled === 'boolean'
        ? { authDisabled: resolvedAuthDisabled }
        : {}),
      ...(typeof resolvedAuthAccountCreatedAt === 'string'
        ? { authAccountCreatedAt: resolvedAuthAccountCreatedAt.slice(0, 50) }
        : {}),
      ...(resolvedPasswordSetupStatus
        ? { passwordSetupStatus: resolvedPasswordSetupStatus }
        : {}),
      ...(typeof resolvedPasswordSetupEmailSentAt === 'string'
        ? {
            passwordSetupEmailSentAt: resolvedPasswordSetupEmailSentAt.slice(
              0,
              50
            ),
          }
        : {}),
      ...(typeof resolvedRepairedFromUserId === 'string'
        ? { repairedFromUserId: resolvedRepairedFromUserId.slice(0, 128) }
        : {}),
      ...(typeof resolvedRepairedAt === 'string'
        ? { repairedAt: resolvedRepairedAt.slice(0, 50) }
        : {}),
      ...(typeof user.customRoleId === 'string' && user.customRoleId
        ? { customRoleId: user.customRoleId.slice(0, 100) }
        : typeof existingData?.customRoleId === 'string' && existingData.customRoleId
        ? { customRoleId: existingData.customRoleId.slice(0, 100) }
        : {}),
    };
    await setDoc(userRef, payload);
  }

  async saveBusiness(business: Business): Promise<void> {
    const nowIso = new Date().toISOString();
    const bizRef = doc(db, 'businesses', business.id);
    const existingSnap = await getDoc(bizRef);
    const existingData = existingSnap.exists() ? existingSnap.data() : null;
    const canonicalCreatedAt =
      typeof existingData?.createdAt === 'string' &&
      existingData.createdAt.trim().length > 0
        ? existingData.createdAt
        : String(business.createdAt || nowIso).slice(0, 50);

    const payload: Record<string, any> = {
      id: business.id,
      name: business.name.slice(0, 140),
      businessType: (business.businessType || 'Supermarket & Grocery Chain').slice(0, 100),
      ownerUserId: business.ownerUserId,
      ownerName: business.ownerName.slice(0, 120),
      ownerEmail: business.ownerEmail,
      contactEmail: business.contactEmail || business.ownerEmail,
      primaryPhone: (business.primaryPhone || '+2348000000000').slice(0, 40),
      headquartersAddress: (business.headquartersAddress || 'Lagos, Nigeria').slice(0, 250),
      currencyCode: (business.currencyCode || 'NGN').slice(0, 3),
      currencySymbol: (business.currencySymbol || '₦').slice(0, 5),
      defaultTaxRatePercent: Number(business.defaultTaxRatePercent ?? 7.5),
      status: business.status === 'suspended' ? 'suspended' : 'active',
      schemaVersion:
        typeof existingData?.schemaVersion === 'number' &&
        existingData.schemaVersion >= 1
          ? existingData.schemaVersion
          : 1,
      createdAt: canonicalCreatedAt.slice(0, 50),
      updatedAt: nowIso.slice(0, 50),
    };
    if (business.legalName) payload.legalName = business.legalName.slice(0, 180);
    if (business.registrationNumber)
      payload.registrationNumber = business.registrationNumber.slice(0, 60);
    if (business.taxIdentificationNumber)
      payload.taxIdentificationNumber = business.taxIdentificationNumber.slice(0, 60);
    if (business.notes) payload.notes = business.notes.slice(0, 500);

    await setDoc(bizRef, payload);
  }

  async saveShop(shop: Shop): Promise<void> {
    const nowIso = new Date().toISOString();
    const shopRef = doc(db, 'businesses', shop.businessId, 'shops', shop.id);
    const existingSnap = await getDoc(shopRef);
    const existingData = existingSnap.exists() ? existingSnap.data() : null;
    const canonicalCreatedAt =
      typeof existingData?.createdAt === 'string' &&
      existingData.createdAt.trim().length > 0
        ? existingData.createdAt
        : String(shop.createdAt || nowIso).slice(0, 50);

    const payload: Record<string, any> = {
      id: shop.id,
      businessId: shop.businessId,
      code: (shop.code || 'SHP-01').slice(0, 30),
      name: shop.name.slice(0, 140),
      category: (shop.category || 'Supermarket').slice(0, 80),
      locationCity: (shop.locationCity || 'Lagos').slice(0, 80),
      address: (shop.address || 'Lagos').slice(0, 240),
      phone: (shop.phone || '+2348000000000').slice(0, 40),
      managerName: (shop.managerName || 'Shop Manager').slice(0, 120),
      status: shop.status || 'active',
      terminalId: (shop.terminalId || `TERM-${shop.code}`).slice(0, 60),
      taxRatePercent: Number(shop.taxRatePercent ?? 7.5),
      vatEnabled:
        typeof shop.vatEnabled === 'boolean'
          ? shop.vatEnabled
          : typeof shop.taxRatePercent === 'number'
            ? shop.taxRatePercent > 0
            : false,
      printVatOnReceipt:
        typeof shop.printVatOnReceipt === 'boolean'
          ? shop.printVatOnReceipt
          : false,
      schemaVersion:
        typeof existingData?.schemaVersion === 'number' &&
        existingData.schemaVersion >= 1
          ? existingData.schemaVersion
          : 1,
      createdAt: canonicalCreatedAt.slice(0, 50),
      updatedAt: nowIso.slice(0, 50),
    };
    if (shop.receiptHeaderNote)
      payload.receiptHeaderNote = shop.receiptHeaderNote.slice(0, 300);
    if (shop.receiptFooterNote)
      payload.receiptFooterNote = shop.receiptFooterNote.slice(0, 300);
    if (shop.description)
      payload.description = shop.description.slice(0, 300);
    if (typeof shop.enableTableTabs === 'boolean') {
      payload.enableTableTabs = shop.enableTableTabs;
    }

    await setDoc(shopRef, payload);
  }

  async saveProduct(product: Product): Promise<void> {
    const nowIso = new Date().toISOString();
    const cleanCatId = (product.categoryId || `cat-${product.shopId}-general`).replace(
      /[^a-zA-Z0-9_-]/g,
      '-'
    );
    const productRef = doc(
      db,
      'businesses',
      product.businessId,
      'shops',
      product.shopId,
      'products',
      product.id
    );
    let resolvedCreatedAt = product.createdAt;
    if (!resolvedCreatedAt) {
      try {
        const existingSnap = await getDoc(productRef);
        if (existingSnap.exists()) {
          resolvedCreatedAt = existingSnap.data()?.createdAt;
        }
      } catch {
        // Fallback below
      }
    }
    if (!resolvedCreatedAt) {
      resolvedCreatedAt = product.updatedAt || nowIso;
    }

    const rawPayload = {
      id: product.id,
      shopId: product.shopId,
      businessId: product.businessId,
      categoryId: cleanCatId.slice(0, 128),
      categoryName: (product.categoryName || 'General').slice(0, 80),
      sku: (product.sku || product.id).slice(0, 64),
      barcode: (product.barcode || product.sku || product.id).slice(0, 64),
      name: product.name.slice(0, 160),
      unit: (product.unit || 'Unit').slice(0, 40),
      costPrice: Number(product.costPrice || 0),
      sellingPrice: Number(product.sellingPrice || 0),
      costPriceKobo: Math.max(0, Math.round(toMinorUnits(product.costPrice || 0))),
      sellingPriceKobo: Math.max(0, Math.round(toMinorUnits(product.sellingPrice || 0))),
      stockQuantity: Math.max(0, Math.floor(product.stockQuantity || 0)),
      reorderLevel: Math.max(0, Math.floor(product.reorderLevel || 0)),
      hasExpiry: Boolean(product.hasExpiry),
      expiryDate: product.hasExpiry && product.expiryDate ? String(product.expiryDate).slice(0, 40) : null,
      isActive: Boolean(product.isActive),
      schemaVersion: 1,
      createdAt: resolvedCreatedAt.slice(0, 50),
      updatedAt: nowIso.slice(0, 50),
    };
    const payload = sanitizeFirestorePayload(rawPayload);
    await setDoc(productRef, payload);
  }

  async deleteProduct(
    businessId: string,
    shopId: string,
    productId: string
  ): Promise<void> {
    await deleteDoc(
      doc(db, 'businesses', businessId, 'shops', shopId, 'products', productId)
    );
  }

  async saveSale(_sale: SaleTransaction): Promise<void> {
    throw new Error(
      'DIRECT_CLIENT_SALE_WRITE_FORBIDDEN: Direct client-side sale writes are forbidden. All live sales must be committed atomically with stock deduction, payment, inventory movement, and sync receipt via syncPosOperation.'
    );
  }

  async executeAtomicSaleSync(
    request: SyncOperationRequest
  ): Promise<SyncOperationResponse> {
    const callableResult = await callSyncPosOperation(request);
    return callableResult.data;
  }

  async provisionBusinessAndPrimaryOwner(
    request: ProvisionBusinessRequest
  ): Promise<ProvisionBusinessResponse> {
    const callableResult = await callProvisionBusinessAndPrimaryOwner(request);
    return callableResult.data;
  }

  async repairBusinessOwnerAuth(
    request: RepairBusinessOwnerAuthRequest
  ): Promise<RepairBusinessOwnerAuthResponse> {
    const callableResult = await callRepairBusinessOwnerAuth(request);
    return callableResult.data;
  }

  async inviteAuthorizedStaff(
    request: InviteAuthorizedStaffRequest
  ): Promise<InviteAuthorizedStaffResponse> {
    const callableResult = await callInviteAuthorizedStaff(request);
    return callableResult.data;
  }

  async setTenantStatus(
    request: SetTenantStatusRequest
  ): Promise<SetTenantStatusResponse> {
    const callableResult = await callSetTenantStatus(request);
    return callableResult.data;
  }

  async resetUserPassword(
    request: ResetUserPasswordRequest
  ): Promise<ResetUserPasswordResponse> {
    const callableResult = await callResetUserPassword(request);
    return callableResult.data;
  }

  async sendPasswordResetEmail(email: string): Promise<void> {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
  }

  async sendEmailVerificationToCurrentUser(): Promise<void> {
    if (!auth.currentUser) {
      throw new Error(
        'UNAUTHENTICATED_SESSION: No active Firebase Authentication user is signed in to receive a verification email.'
      );
    }
    await sendEmailVerification(auth.currentUser);
  }

  async reloadAndGetCurrentAuthState(expectedUid?: string): Promise<{
    uid: string;
    email: string;
    emailVerified: boolean;
    idTokenRefreshed: boolean;
  } | null> {
    if (!auth.currentUser) return null;
    if (expectedUid && auth.currentUser.uid !== expectedUid.trim()) {
      return null;
    }
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    return {
      uid: auth.currentUser.uid,
      email: (auth.currentUser.email || '').trim().toLowerCase(),
      emailVerified: auth.currentUser.emailVerified === true,
      idTokenRefreshed: true,
    };
  }
}

export const BOOTSTRAP_PLATFORM_ADMIN_EMAIL = 'smartnwokolo@gmail.com';
export const STAGING_PLATFORM_ADMIN_EMAIL = 'smart@smartmindconcept.com';
export const AUTHORIZED_PLATFORM_ADMIN_EMAILS = new Set<string>([
  BOOTSTRAP_PLATFORM_ADMIN_EMAIL,
  STAGING_PLATFORM_ADMIN_EMAIL,
]);
export const PLATFORM_ADMIN_BUSINESS_SENTINEL = 'PLATFORM';

export function isAuthorizedPlatformAdminEmail(email?: string | null): boolean {
  const clean = (email || '').trim().toLowerCase();
  return AUTHORIZED_PLATFORM_ADMIN_EMAILS.has(clean);
}

export function isPlatformAdminBusinessSentinel(
  businessId?: string | null
): boolean {
  const clean = (businessId || '').trim();
  return clean === 'PLATFORM' || clean === 'biz-platform-live';
}

export function canBootstrapPlatformAdminIdentity(params: {
  uid?: string | null;
  email?: string | null;
  emailVerified?: boolean;
}): boolean {
  const cleanUid = (params.uid || '').trim();
  const cleanEmail = (params.email || '').trim().toLowerCase();
  if (!cleanUid || cleanUid === 'unauthenticated') return false;
  if (params.emailVerified === false) return false;
  return isAuthorizedPlatformAdminEmail(cleanEmail);
}

export interface LiveSessionResolutionResult {
  status: 'ready' | 'no_membership' | 'suspended' | 'error';
  dataMode: DataEnvironmentMode;
  user?: User;
  dataset?: LiveWorkspaceDataset;
  uid: string;
  email: string;
  displayName: string;
  emailVerified?: boolean;
  missingBusinessId?: string;
  isBootstrapAdminCandidate?: boolean;
  errorCode?: string;
  errorMessage?: string;
  requiredProvisioningSteps?: string[];
}

export interface PersistLiveBusinessResult {
  status: 'provisioned' | 'idempotent_replay';
  isIdempotentReplay: boolean;
  authAccountCreated?: boolean;
  business: Business;
  primaryOwner: User;
  firstShop?: Shop;
}

export interface RepairLiveBusinessOwnerAuthResult {
  status: 'repaired' | 'already_bound' | 'idempotent_replay';
  isIdempotentReplay: boolean;
  authAccountCreated: boolean;
  previousOwnerUserId: string;
  canonicalOwnerUid: string;
  removedSyntheticOwnerUserId?: string;
  syntheticProfileDeleted: boolean;
  business: Business;
  primaryOwner: User;
}

export interface SendOwnerPasswordSetupEmailResult {
  status: 'password_setup_email_sent';
  sentToEmail: string;
  email: string;
  sentAt: string;
  isResend: boolean;
  emailDispatched: boolean;
  metadataPersisted: boolean;
  updatedOwner: User;
}

export interface InviteLiveStaffResult {
  status: 'created';
  isIdempotentReplay: boolean;
  staffUser: User;
}

/**
 * Reconciles provisional local application state (businesses, users, shops, shopAssignments)
 * with the canonical IDs returned by the `provisionBusinessAndPrimaryOwner` Cloud Function.
 */
export function reconcileProvisionedBusinessState(
  state: {
    businesses: Business[];
    users: User[];
    shops: Shop[];
    shopAssignments: ShopAssignment[];
  },
  provisionalIds: {
    businessId: string;
    ownerUserId: string;
    firstShopId?: string;
    firstAssignmentId?: string;
  },
  provisioned: PersistLiveBusinessResult
): {
  businesses: Business[];
  users: User[];
  shops: Shop[];
  shopAssignments: ShopAssignment[];
} {
  const canonicalBizId = provisioned.business.id;
  const canonicalOwnerId = provisioned.primaryOwner.id;
  const canonicalShopId =
    provisioned.firstShop?.id || provisionalIds.firstShopId;

  const businesses = state.businesses.map((b) =>
    b.id === provisionalIds.businessId
      ? {
          ...b,
          ...provisioned.business,
          id: canonicalBizId,
          ownerUserId: canonicalOwnerId,
        }
      : b
  );

  const users = state.users.map((u) =>
    u.id === provisionalIds.ownerUserId
      ? {
          ...u,
          ...provisioned.primaryOwner,
          id: canonicalOwnerId,
          businessId: canonicalBizId,
          assignedShopIds: canonicalShopId
            ? [canonicalShopId]
            : provisioned.primaryOwner.assignedShopIds,
        }
      : u
  );

  const shops =
    provisioned.firstShop && provisionalIds.firstShopId
      ? state.shops.map((s) =>
          s.id === provisionalIds.firstShopId
            ? {
                ...s,
                ...provisioned.firstShop!,
                id: canonicalShopId!,
                businessId: canonicalBizId,
              }
            : s
        )
      : state.shops;

  const shopAssignments = state.shopAssignments.map((a) => {
    const matchesProvisional =
      (provisionalIds.firstAssignmentId &&
        a.id === provisionalIds.firstAssignmentId) ||
      (a.userId === provisionalIds.ownerUserId &&
        a.businessId === provisionalIds.businessId);
    if (!matchesProvisional) return a;
    const resolvedShopId = canonicalShopId || a.shopId;
    return {
      ...a,
      id: `asgn-${resolvedShopId}-${canonicalOwnerId}`,
      userId: canonicalOwnerId,
      businessId: canonicalBizId,
      shopId: resolvedShopId,
    };
  });

  return {
    businesses,
    users,
    shops,
    shopAssignments,
  };
}

/**
 * Reconciles provisional local application state (users, shopAssignments)
 * with the canonical staff UID returned by the `inviteAuthorizedStaff` Cloud Function.
 */
export function reconcileInvitedStaffState(
  state: {
    users: User[];
    shopAssignments: ShopAssignment[];
  },
  provisionalUserId: string,
  invitedStaff: User
): {
  users: User[];
  shopAssignments: ShopAssignment[];
} {
  const canonicalStaffId = invitedStaff.id;
  const users = state.users.map((u) =>
    u.id === provisionalUserId
      ? {
          ...u,
          ...invitedStaff,
          id: canonicalStaffId,
        }
      : u
  );
  const shopAssignments = state.shopAssignments.map((a, idx) =>
    a.userId === provisionalUserId
      ? {
          ...a,
          id: `asgn-${canonicalStaffId}-${a.shopId}-${idx}`,
          userId: canonicalStaffId,
          businessId: invitedStaff.businessId,
        }
      : a
  );
  return {
    users,
    shopAssignments,
  };
}

export class LiveFirestoreDataService {
  private committedIdempotencyReceipts = new Map<string, SyncOperationResponse>();

  constructor(
    private cloudProvider: LiveCloudStoreProvider = new FirestoreCloudStoreProvider(),
    private dbAdapter?: DatabaseAdapter
  ) {}

  async purgeQuarantinedPreFirebaseRecords(
    actor: User
  ): Promise<PurgeQuarantinedPreFirebaseSalesResult> {
    if (!this.dbAdapter) {
      throw new Error(
        'Database adapter is required to purge local quarantined pre-Firebase records.'
      );
    }
    return purgeQuarantinedPreFirebaseRecords(actor, this.dbAdapter);
  }

  /**
   * Resolves an authenticated Firebase user's live business membership, authorized shops,
   * and operational records without ever inventing demo data or falling back to mockPosData.
   */
  async resolveAuthenticatedSession(params: {
    uid: string;
    email: string;
    displayName?: string | null;
    emailVerified?: boolean;
  }): Promise<LiveSessionResolutionResult> {
    const cleanUid = (params.uid || '').trim();
    const cleanEmail = (params.email || '').trim().toLowerCase();
    const cleanName =
      (params.displayName || '').trim() || cleanEmail.split('@')[0] || 'User';

    if (!cleanUid || cleanUid === 'unauthenticated' || !cleanEmail) {
      return {
        status: 'error',
        dataMode: 'live',
        uid: cleanUid,
        email: cleanEmail,
        displayName: cleanName,
        emailVerified: params.emailVerified,
        isBootstrapAdminCandidate: false,
        errorCode: 'UNAUTHENTICATED_SESSION',
        errorMessage:
          'A valid Firebase Authentication UID and email address are required.',
      };
    }

    let actualEmailVerified = params.emailVerified;
    if (typeof this.cloudProvider.reloadAndGetCurrentAuthState === 'function') {
      try {
        const liveAuth = await this.cloudProvider.reloadAndGetCurrentAuthState(
          cleanUid
        );
        if (liveAuth && liveAuth.uid === cleanUid) {
          actualEmailVerified = liveAuth.emailVerified;
        }
      } catch {
        // Non-blocking if reload helper is offline; fall back to params.emailVerified
      }
    }

    if (actualEmailVerified === false) {
      let unverifiedOwnerProfile: User | undefined;
      try {
        const existingUnverified = await this.cloudProvider.getUserProfile(
          cleanUid
        );
        if (
          existingUnverified &&
          existingUnverified.role === 'business_owner' &&
          existingUnverified.id === cleanUid &&
          (existingUnverified.email || '').trim().toLowerCase() === cleanEmail
        ) {
          unverifiedOwnerProfile =
            await this.synchronizeBusinessOwnerSignInState({
              authenticatedUid: cleanUid,
              authenticatedEmail: cleanEmail,
              emailVerified: false,
            });
        }
      } catch {
        // Non-blocking when unverified
      }

      return {
        status: 'error',
        dataMode: 'live',
        ...(unverifiedOwnerProfile ? { user: unverifiedOwnerProfile } : {}),
        uid: cleanUid,
        email: cleanEmail,
        displayName: unverifiedOwnerProfile?.fullName || cleanName,
        emailVerified: false,
        isBootstrapAdminCandidate: false,
        errorCode: 'EMAIL_NOT_VERIFIED',
        errorMessage:
          'Your Firebase Authentication email address is not verified (emailVerified == false). Verify your email address before accessing live workspaces or administrator functions.',
      };
    }

    const isBootstrapCandidate = canBootstrapPlatformAdminIdentity({
      uid: cleanUid,
      email: cleanEmail,
      emailVerified: actualEmailVerified,
    });

    try {
      // 1. Load user profile from /users/{uid}
      let userProfile = await this.cloudProvider.getUserProfile(cleanUid);

      if (!userProfile) {
        return {
          status: 'no_membership',
          dataMode: 'live',
          uid: cleanUid,
          email: cleanEmail,
          displayName: cleanName,
          emailVerified: params.emailVerified,
          isBootstrapAdminCandidate: isBootstrapCandidate,
          requiredProvisioningSteps: [
            `Database "${firebaseConfig.firestoreDatabaseId}" has no user profile document at /users/${cleanUid} for ${cleanEmail}.`,
            `A Platform Administrator or Business Owner must provision /users/${cleanUid} with a valid businessId, role, and assignedShopIds.`,
            isBootstrapCandidate
              ? `Because you are signed in with the verified bootstrap administrator identity (${cleanEmail}), you can explicitly initialize your Platform Administrator profile in Firestore below.`
              : `Share your UID (${cleanUid}) and email (${cleanEmail}) with your administrator to be assigned to a business.`,
          ],
        };
      }

      if (userProfile.status === 'suspended') {
        return {
          status: 'suspended',
          dataMode: 'live',
          user: userProfile,
          uid: cleanUid,
          email: cleanEmail,
          displayName: userProfile.fullName,
          emailVerified: params.emailVerified,
          errorMessage: `Account "${userProfile.fullName}" (${userProfile.email}) is currently suspended.`,
        };
      }

      // 2. If Platform Administrator: verify identity + profile match + non-tenant sentinel, then load businesses, shops, and users (never shop products/sales)
      if (userProfile.role === 'platform_admin') {
        const profileEmail = (userProfile.email || '').trim().toLowerCase();
        if (
          userProfile.id !== cleanUid ||
          profileEmail !== cleanEmail ||
          !isAuthorizedPlatformAdminEmail(cleanEmail) ||
          !isPlatformAdminBusinessSentinel(userProfile.businessId) ||
          (Array.isArray(userProfile.assignedShopIds) &&
            userProfile.assignedShopIds.length > 0)
        ) {
          return {
            status: 'error',
            dataMode: 'live',
            uid: cleanUid,
            email: cleanEmail,
            displayName: cleanName,
            emailVerified: params.emailVerified,
            isBootstrapAdminCandidate: false,
            errorCode: 'UNAUTHORIZED_PLATFORM_ADMIN_IDENTITY',
            errorMessage: `SECURITY_VIOLATION: Account "${cleanEmail}" is not authorized as the Platform Administrator or has an invalid tenant assignment.`,
          };
        }

        const businesses = (await this.cloudProvider.listAllBusinesses()).filter(
          (b) =>
            !isKnownDemoRecord(b) && !isPlatformAdminBusinessSentinel(b.id)
        );
        const listedUsers = (await this.cloudProvider.listAllUsers()).filter(
          (u) => !isKnownDemoRecord(u)
        );
        const usersById = new Map<string, User>();
        for (const u of listedUsers) {
          usersById.set(u.id, u);
        }

        // Auto-reconcile known unlinked staff accounts to their canonical Firebase Auth UIDs
        const knownStaffUidMap: Record<string, string> = {
          'uzo@gmail.com': '8JbTcgrEUOcAo9CdirSYzwMpari2',
          'amaka@gmail.com': 'zeUgKyHmohMkfddx1tfP1ogxx073',
        };

        for (const [staffEmail, targetUid] of Object.entries(knownStaffUidMap)) {
          const match = listedUsers.find(
            (u) => (u.email || '').trim().toLowerCase() === staffEmail.toLowerCase()
          );
          if (match && match.id !== targetUid) {
            try {
              const existingTarget = await this.cloudProvider.getUserProfile(targetUid);
              if (!existingTarget) {
                const linkedUser: User = {
                  ...match,
                  id: targetUid,
                  authUidLinked: true,
                  repairedFromUserId: match.id,
                  repairedAt: new Date().toISOString(),
                };
                if (typeof this.cloudProvider.saveUserProfile === 'function') {
                  await this.cloudProvider.saveUserProfile(linkedUser);
                }
                usersById.set(targetUid, linkedUser);
              } else {
                usersById.set(targetUid, existingTarget);
              }
            } catch (linkErr) {
              console.warn(`[LiveSync] Failed to auto-reconcile staff UID for ${staffEmail}:`, linkErr);
            }
          }
        }

        // Explicitly fetch each business's primary owner by canonical Firebase UID
        // so Refresh Live Data always retrieves the freshest /users/{uid} record.
        for (const biz of businesses) {
          const canonicalOwnerUid = (biz.ownerUserId || '').trim();
          if (
            canonicalOwnerUid &&
            !isSyntheticOwnerUserId(canonicalOwnerUid) &&
            !isSyntheticClientUserId(canonicalOwnerUid)
          ) {
            try {
              const latestOwner = await this.cloudProvider.getUserProfile(
                canonicalOwnerUid
              );
              if (latestOwner && !isKnownDemoRecord(latestOwner)) {
                usersById.set(latestOwner.id, latestOwner);
              }
            } catch {
              // Keep listed user profile if individual lookup fails
            }
          }
        }

        const users = Array.from(usersById.values());
        const allShops: Shop[] = [];
        for (const biz of businesses) {
          const bShops = await this.cloudProvider.listBusinessShops(biz.id);
          allShops.push(...bShops.filter((s) => !isKnownDemoRecord(s)));
        }

        const activeAdminProfile = userProfile;
        const dataset: LiveWorkspaceDataset = {
          ...createEmptyLiveDataset(activeAdminProfile.id, activeAdminProfile.businessId),
          businesses,
          users: users.some((u) => u.id === activeAdminProfile.id)
            ? users
            : [activeAdminProfile, ...users],
          shops: allShops,
        };
        saveUserScopedLiveCache(activeAdminProfile.id, dataset);

        return {
          status: 'ready',
          dataMode: 'live',
          user: activeAdminProfile,
          dataset,
          uid: cleanUid,
          email: cleanEmail,
          displayName: userProfile.fullName,
          emailVerified: params.emailVerified,
        };
      }

      // 3. Business Owner, Shop Manager, or Cashier: load their assigned business (must not use Platform Admin sentinel)
      if (userProfile.role === 'business_owner') {
        userProfile = await this.synchronizeBusinessOwnerSignInState({
          authenticatedUid: cleanUid,
          authenticatedEmail: cleanEmail,
          emailVerified: actualEmailVerified === true,
          expectedBusinessId: userProfile.businessId,
        });
      }
      if (
        !userProfile.businessId ||
        isPlatformAdminBusinessSentinel(userProfile.businessId)
      ) {
        return {
          status: 'no_membership',
          dataMode: 'live',
          user: userProfile,
          uid: cleanUid,
          email: cleanEmail,
          displayName: userProfile.fullName,
          isBootstrapAdminCandidate: isBootstrapCandidate,
          requiredProvisioningSteps: [
            `Your profile at /users/${params.uid} does not have a valid tenant businessId.`,
          ],
        };
      }

      const business = await this.cloudProvider.getBusiness(
        userProfile.businessId
      );
      if (!business || isKnownDemoRecord(business)) {
        return {
          status: 'no_membership',
          dataMode: 'live',
          user: userProfile,
          uid: params.uid,
          email: cleanEmail,
          displayName: userProfile.fullName,
          missingBusinessId: userProfile.businessId,
          isBootstrapAdminCandidate: isBootstrapCandidate,
          requiredProvisioningSteps: [
            `User profile /users/${params.uid} references businessId "${userProfile.businessId}", but /businesses/${userProfile.businessId} does not exist in Firestore.`,
            `Provision /businesses/${userProfile.businessId} in Firestore before accessing shop workspaces.`,
          ],
        };
      }

      if (business.status === 'suspended') {
        return {
          status: 'suspended',
          dataMode: 'live',
          user: userProfile,
          uid: params.uid,
          email: cleanEmail,
          displayName: userProfile.fullName,
          errorMessage: `Business "${business.name}" is currently suspended.`,
        };
      }

      // 4. Load only authorized shops for this user
      let authorizedShops: Shop[] = [];
      if (userProfile.role === 'business_owner') {
        const allBizShops = await this.cloudProvider.listBusinessShops(
          business.id
        );
        authorizedShops = allBizShops.filter(
          (s) => s.businessId === business.id && !isKnownDemoRecord(s)
        );
      } else {
        for (const shopId of userProfile.assignedShopIds || []) {
          const shop = await this.cloudProvider.getShop(business.id, shopId);
          if (shop && shop.businessId === business.id && !isKnownDemoRecord(shop)) {
            authorizedShops.push(shop);
          }
        }
      }
      // Restore computer-local printer preferences without reading or writing them to Firestore.
      if (this.dbAdapter) {
        authorizedShops = await Promise.all(
          authorizedShops.map(async (shop) => {
            try {
              const localShop = await this.dbAdapter!.getShop(shop.id);

              if (
                !localShop ||
                localShop.business_id !== shop.businessId ||
                !localShop.printer_settings_json
              ) {
                return shop;
              }

              const localSettings = JSON.parse(
                localShop.printer_settings_json
              ) as Shop['printerSettings'];

              if (
                !localSettings ||
                typeof localSettings !== 'object' ||
                typeof localSettings.defaultPrinterId !== 'string' ||
                !['thermal', 'a4'].includes(
                  localSettings.receiptPrinterMode
                )
              ) {
                console.warn(
                  `Ignoring invalid local printer settings for shop ${shop.id}.`
                );
                return shop;
              }

              return {
                ...shop,
                printerSettings: localSettings,
              };
            } catch (error) {
              console.warn(
                `Could not restore local printer settings for shop ${shop.id}:`,
                error
              );
              return shop;
            }
          })
        );
      }
      // 5. Load users in this business (if business_owner or staff with manage_staff permission, load all business staff; otherwise just current user)
      let businessUsers: User[] = [userProfile];
      if (
        userProfile.role === 'business_owner' ||
        (Array.isArray(userProfile.permissions) &&
          userProfile.permissions.includes('manage_staff'))
      ) {
        try {
          const fetchedUsers = await this.cloudProvider.listBusinessUsers(
            business.id
          );
          const cleanUsers = fetchedUsers.filter(
            (u) => u.businessId === business.id && !isKnownDemoRecord(u)
          );
          businessUsers = cleanUsers.some((u) => u.id === userProfile.id)
            ? cleanUsers
            : [userProfile, ...cleanUsers];
        } catch {
          businessUsers = [userProfile];
        }
      }

      // 6. Load products, sales, default categories/units for authorized shops, and merge local unsynced records
      const products: Product[] = [];
      const sales: SaleTransaction[] = [];
      const categories: ProductCategory[] = [];
      const units: UnitOfMeasurement[] = [];

      for (const shop of authorizedShops) {
        categories.push({
          id: `cat-${shop.id}-general`,
          shopId: shop.id,
          businessId: business.id,
          name: 'General Merchandise',
          description: `Default category for ${shop.name}`,
        });
        units.push(
          {
            id: `unit-${shop.id}-unit`,
            shopId: shop.id,
            businessId: business.id,
            name: 'Unit',
            abbreviation: 'unit',
          },
          {
            id: `unit-${shop.id}-pack`,
            shopId: shop.id,
            businessId: business.id,
            name: 'Pack',
            abbreviation: 'pk',
          }
        );

        const cloudProducts = await this.cloudProvider.listShopProducts(
          business.id,
          shop.id
        );
        const validCloudProducts = cloudProducts.filter(
          (p) =>
            p.businessId === business.id &&
            p.shopId === shop.id &&
            !isKnownDemoRecord(p)
        );

        const cloudSales = await this.cloudProvider.listShopSales(
          business.id,
          shop.id
        );
        const validCloudSales = cloudSales.filter(
          (s) =>
            s.businessId === business.id &&
            s.shopId === shop.id &&
            !isKnownDemoRecord(s)
        );

        // Merge local IndexedDB unsynced products and sales for this exact shop (protecting offline sales)
        const mergedShopProducts = await this.mergeLocalShopProducts(
          business.id,
          shop.id,
          validCloudProducts
        );
        const mergedShopSales = await this.mergeLocalShopSales(
          business.id,
          shop.id,
          validCloudSales
        );

        // Ensure categories referenced by products exist in categories list
        const existingCatIds = new Set(categories.map((c) => c.id));
        for (const prod of mergedShopProducts) {
          if (prod.categoryId && !existingCatIds.has(prod.categoryId)) {
            existingCatIds.add(prod.categoryId);
            categories.push({
              id: prod.categoryId,
              shopId: shop.id,
              businessId: business.id,
              name: prod.categoryName || 'General',
              description: `Category for ${shop.name}`,
            });
          }
        }

        products.push(...mergedShopProducts);
        sales.push(...mergedShopSales);
      }

      // Collect auxiliary entities (invoices, debt book, suppliers) from Cloud Firestore for all authorized shops
      const cloudInvoices: Invoice[] = [];
      const cloudDebtCustomers: DebtCustomer[] = [];
      const cloudDebtTransactions: DebtTransaction[] = [];
      const cloudSuppliers: Supplier[] = [];
      const cloudSupplierSupplies: SupplierSupplyRecord[] = [];

      for (const shop of authorizedShops) {
        try {
          const [sInvs, sCusts, sTxs, sSups, sSupplies] = await Promise.all([
            this.listShopInvoices(business.id, shop.id).catch(() => [] as Invoice[]),
            this.listShopCustomers(business.id, shop.id).catch(() => [] as DebtCustomer[]),
            this.listShopDebtTransactions(business.id, shop.id).catch(() => [] as DebtTransaction[]),
            this.listShopSuppliers(business.id, shop.id).catch(() => [] as Supplier[]),
            this.listShopSupplierSupplies(business.id, shop.id).catch(() => [] as SupplierSupplyRecord[]),
          ]);
          cloudInvoices.push(...sInvs);
          cloudDebtCustomers.push(...sCusts);
          cloudDebtTransactions.push(...sTxs);
          cloudSuppliers.push(...sSups);
          cloudSupplierSupplies.push(...sSupplies);
        } catch {
          // ignore network or offline failures
        }
      }

      // Preserve any previously cached local-only entities (invoices, debt book, suppliers, stockAdjustments) for this business and its authorized users
      const businessCache = loadBusinessScopedLiveCache(business.id);
      const userCache = loadUserScopedLiveCache(userProfile.id);
      const existingCache =
        businessCache ||
        (userCache && userCache.businessId === business.id ? userCache : null);
      const isSameBusinessCache = !!existingCache;
      const authorizedShopIdSet = new Set(authorizedShops.map((s) => s.id));

      const mergeEntitiesList = <T extends { id: string }>(primary?: T[], fallback?: T[]): T[] => {
        const map = new Map<string, T>();
        (fallback || []).forEach((item) => {
          if (item && item.id) map.set(item.id, item);
        });
        (primary || []).forEach((item) => {
          if (item && item.id) map.set(item.id, item);
        });
        return Array.from(map.values());
      };

      if (
        businessUsers.length <= 1 &&
        existingCache?.users &&
        existingCache.users.length > 0
      ) {
        const cachedStaff = existingCache.users.filter(
          (u) => u.businessId === business.id && !isKnownDemoRecord(u)
        );
        const staffMap = new Map<string, User>();
        cachedStaff.forEach((u) => staffMap.set(u.id, u));
        businessUsers.forEach((u) => staffMap.set(u.id, u));
        businessUsers = Array.from(staffMap.values());
      }

      const dataset: LiveWorkspaceDataset = {
        businesses: [business],
        users: businessUsers,
        shops: authorizedShops,
        shopAssignments: [],
        categories,
        units,
        products,
        stockAdjustments: isSameBusinessCache
          ? (existingCache.stockAdjustments || []).filter(
              (a) =>
                a.businessId === business.id &&
                (authorizedShopIdSet.has(a.shopId) || !a.shopId)
            )
          : [],
        sales,
        invoices: mergeEntitiesList(
          cloudInvoices.filter((i) => !isKnownDemoRecord(i as any)),
          isSameBusinessCache
            ? (existingCache.invoices || []).filter(
                (i) =>
                  i.businessId === business.id &&
                  (authorizedShopIdSet.has(i.shopId) || !i.shopId)
              )
            : []
        ),
        debtCustomers: mergeEntitiesList(
          cloudDebtCustomers.filter((c) => !isKnownDemoRecord(c as any)),
          isSameBusinessCache
            ? (existingCache.debtCustomers || []).filter(
                (c) => c.businessId === business.id
              )
            : []
        ),
        debtTransactions: mergeEntitiesList(
          cloudDebtTransactions.filter((t) => !isKnownDemoRecord(t as any)),
          isSameBusinessCache
            ? (existingCache.debtTransactions || []).filter(
                (t) => t.businessId === business.id
              )
            : []
        ),
        suppliers: mergeEntitiesList(
          cloudSuppliers.filter((s) => !isKnownDemoRecord(s as any)),
          isSameBusinessCache
            ? (existingCache.suppliers || []).filter(
                (s) => s.businessId === business.id
              )
            : []
        ),
        supplierSupplies: mergeEntitiesList(
          cloudSupplierSupplies.filter((r) => !isKnownDemoRecord(r as any)),
          isSameBusinessCache
            ? (existingCache.supplierSupplies || []).filter(
                (r) => r.businessId === business.id
              )
            : []
        ),
        customRoles: isSameBusinessCache
          ? (existingCache.customRoles || []).filter(
              (r) => r.businessId === business.id
            )
          : [],
        cachedAt: new Date().toISOString(),
        ownerUserId: userProfile.id,
        businessId: business.id,
      };

      saveUserScopedLiveCache(userProfile.id, dataset);
      saveBusinessScopedLiveCache(business.id, dataset);

      return {
        status: 'ready',
        dataMode: 'live',
        user: userProfile,
        dataset,
        uid: params.uid,
        email: cleanEmail,
        displayName: userProfile.fullName,
      };
    } catch (err: any) {
      const code = String(err?.code || '');
      const message = String(err?.message || err || 'Unknown Firestore error');

      // Permission or synchronization verification errors MUST be reported clearly and never disguised as demo, cached, or verified data
      if (
        code.includes('permission-denied') ||
        message.toLowerCase().includes('missing or insufficient permissions') ||
        message.includes('PERMISSION_DENIED') ||
        message.includes('OWNER_AUTH_SYNC_FAILED')
      ) {
        return {
          status: 'error',
          dataMode: 'live',
          uid: params.uid,
          email: cleanEmail,
          displayName: cleanName,
          emailVerified: actualEmailVerified,
          errorCode: message.includes('OWNER_AUTH_SYNC_FAILED')
            ? 'OWNER_AUTH_SYNC_FAILED'
            : 'permission-denied',
          errorMessage: message.includes('OWNER_AUTH_SYNC_FAILED')
            ? message
            : `Firestore Permission Denied on database "${firebaseConfig.firestoreDatabaseId}": ${message}`,
        };
      }

      // Offline / network error: check if this exact user has a verified cached live dataset
      const cached = loadUserScopedLiveCache(params.uid);
      if (cached && cached.users.some((u) => u.id === params.uid)) {
        const cachedUser = cached.users.find((u) => u.id === params.uid)!;
        return {
          status: 'ready',
          dataMode: 'offline_live',
          user: cachedUser,
          dataset: cached,
          uid: params.uid,
          email: cleanEmail,
          displayName: cachedUser.fullName,
        };
      }

      return {
        status: 'error',
        dataMode: 'live',
        uid: params.uid,
        email: cleanEmail,
        displayName: cleanName,
        errorCode: code || 'unavailable',
        errorMessage: `Unable to load live business records from Cloud Firestore (${code || 'network_error'}): ${message}`,
      };
    }
  }

  private async mergeLocalShopProducts(
    businessId: string,
    shopId: string,
    cloudProducts: Product[]
  ): Promise<Product[]> {
    const byId = new Map<string, Product>();
    for (const p of cloudProducts) {
      byId.set(p.id, p);
    }
    if (!this.dbAdapter) return Array.from(byId.values());

    try {
      const localProducts: DbProduct[] = await this.dbAdapter.getProducts({
        shopId,
        businessId,
      });
      for (const lp of localProducts) {
        if (
          lp.business_id === businessId &&
          lp.shop_id === shopId &&
          !isKnownDemoRecord(lp) &&
          !isPreFirebaseTestRecord(lp) &&
          !byId.has(lp.id)
        ) {
          byId.set(lp.id, {
            id: lp.id,
            shopId: lp.shop_id,
            businessId: lp.business_id,
            categoryId: lp.category_id,
            categoryName: lp.category_name,
            sku: lp.sku,
            barcode: lp.barcode,
            name: lp.name,
            unit: lp.unit,
            costPrice: fromMinorUnits(lp.cost_price_kobo),
            sellingPrice: fromMinorUnits(lp.selling_price_kobo),
            stockQuantity: lp.stock_quantity,
            reorderLevel: lp.reorder_level,
            isActive: lp.is_active === 1,
            updatedAt: lp.updated_at,
          });
        }
      }
    } catch {
      // Ignore local adapter read errors
    }

    return Array.from(byId.values());
  }

  private async mergeLocalShopSales(
    businessId: string,
    shopId: string,
    cloudSales: SaleTransaction[]
  ): Promise<SaleTransaction[]> {
    const byId = new Map<string, SaleTransaction>();
    const byReceipt = new Set<string>();
    for (const s of cloudSales) {
      byId.set(s.id, s);
      byReceipt.add(s.receiptNumber);
    }
    if (!this.dbAdapter) return Array.from(byId.values());

    try {
      const localSales: DbSale[] = await this.dbAdapter.getSales({
        businessId,
        shopId,
      });
      for (const ls of localSales) {
        const existing = byId.get(ls.id);
        if (existing) {
          if (!existing.items || existing.items.length === 0) {
            try {
              const items = await this.dbAdapter.getSaleItems(ls.id);
              if (items && items.length > 0) {
                existing.items = items.map((item) => ({
                  id: item.id,
                  productId: item.product_id,
                  sku: item.sku,
                  barcode: item.barcode,
                  productName: item.product_name,
                  unit: item.unit,
                  unitPrice: fromMinorUnits(item.unit_price_kobo),
                  costPrice: fromMinorUnits(item.cost_price_kobo),
                  quantity: item.quantity,
                  lineTotal: fromMinorUnits(item.line_total_kobo),
                }));
              }
            } catch {
              // continue
            }
          }
        } else if (
          ls.business_id === businessId &&
          ls.shop_id === shopId &&
          !isKnownDemoRecord(ls) &&
          !isPreFirebaseTestRecord(ls) &&
          ls.sync_conflict_reason !== PRE_FIREBASE_QUARANTINE_REASON &&
          !byReceipt.has(ls.receipt_number)
        ) {
          const items = await this.dbAdapter.getSaleItems(ls.id);
          byId.set(ls.id, {
            id: ls.id,
            shopId: ls.shop_id,
            businessId: ls.business_id,
            receiptNumber: ls.receipt_number,
            terminalId: ls.terminal_id,
            cashierUserId: ls.cashier_user_id,
            cashierName: ls.cashier_name,
            createdAt: ls.created_at,
            items: items.map((item) => ({
              id: item.id,
              productId: item.product_id,
              sku: item.sku,
              barcode: item.barcode,
              productName: item.product_name,
              unit: item.unit,
              unitPrice: fromMinorUnits(item.unit_price_kobo),
              costPrice: fromMinorUnits(item.cost_price_kobo),
              quantity: item.quantity,
              lineTotal: fromMinorUnits(item.line_total_kobo),
            })),
            subtotal: fromMinorUnits(ls.subtotal_kobo),
            discountAmount: fromMinorUnits(ls.discount_amount_kobo),
            taxRatePercent: ls.tax_rate_percent,
            taxAmount: fromMinorUnits(ls.tax_amount_kobo),
            totalAmount: fromMinorUnits(ls.total_amount_kobo),
            amountTendered: fromMinorUnits(ls.amount_tendered_kobo),
            changeDue: fromMinorUnits(ls.change_due_kobo),
            paymentMethod: (ls.payment_method as SaleTransaction['paymentMethod']) || 'cash',
            paymentReference: ls.payment_reference,
            creditCustomerId: ls.credit_customer_id,
            creditCustomerName: ls.credit_customer_name,
            creditCustomerPhone: ls.credit_customer_phone,
            status: ls.is_synced === 1 ? 'completed' : 'pending_sync',
            syncStatus:
              ls.is_synced === 1 ? 'synced' : 'pending_local_queue',
            notes: ls.notes,
          });
        }
      }
    } catch {
      // Ignore local adapter read errors
    }

    return Array.from(byId.values());
  }

  /**
   * Explicit user-initiated onboarding action (never automatic!) to provision a new
   * live Business Owner account + empty Business + initial empty Shop in Firestore.
   */
  async provisionLiveBusinessOwnerWorkspace(params: {
    uid: string;
    email: string;
    fullName: string;
    emailVerified?: boolean;
    businessInput: CreateBusinessInput;
    initialShopInput: CreateShopInput;
  }): Promise<LiveSessionResolutionResult> {
    const cleanUid = (params.uid || '').trim();
    const cleanEmail = (params.email || '').trim().toLowerCase();

    if (!cleanUid || cleanUid === 'unauthenticated') {
      throw new Error(
        'SECURITY_VIOLATION: Authenticated Firebase UID is required to provision a business workspace.'
      );
    }
    if (params.emailVerified === false) {
      throw new Error(
        'SECURITY_VIOLATION: Verified Firebase Authentication email (emailVerified == true) is required.'
      );
    }
    if (isAuthorizedPlatformAdminEmail(cleanEmail)) {
      throw new Error(
        `SECURITY_VIOLATION: Platform Administrator identity (${cleanEmail}) must remain separate from tenant Business Owner accounts.`
      );
    }

    const existingProfile = await this.cloudProvider.getUserProfile(cleanUid);
    if (existingProfile && existingProfile.role === 'platform_admin') {
      throw new Error(
        'SECURITY_VIOLATION: Platform Administrator cannot be provisioned as a Business Owner.'
      );
    }

    const nowDate = new Date().toISOString().slice(0, 10);
    const suffix = Date.now().toString(36);
    const businessId = `biz-live-${suffix}`;
    const shopId = `shop-live-${suffix}`;
    const prefix =
      params.businessInput.name
        .trim()
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 3) || 'SHP';

    const newBusiness: Business = {
      id: businessId,
      name: params.businessInput.name.trim(),
      legalName: params.businessInput.name.trim(),
      businessType: params.businessInput.businessType,
      registrationNumber: `RC-${Date.now().toString().slice(-6)}`,
      taxIdentificationNumber: `TIN-${Date.now().toString().slice(-6)}`,
      ownerUserId: cleanUid,
      ownerName: params.fullName.trim(),
      ownerEmail: cleanEmail,
      contactEmail: (params.businessInput.contactEmail || cleanEmail).trim().toLowerCase(),
      primaryPhone: params.businessInput.primaryPhone.trim(),
      headquartersAddress: params.businessInput.headquartersAddress.trim(),
      currencyCode: BASE_CURRENCY_CODE,
      currencySymbol: BASE_CURRENCY_SYMBOL,
      defaultTaxRatePercent: 7.5,
      status: 'active',
      notes: params.businessInput.notes?.trim(),
      createdAt: nowDate,
    };

    const newShop: Shop = {
      id: shopId,
      businessId,
      code: `${prefix}-01`,
      name: params.initialShopInput.name.trim(),
      category: params.initialShopInput.category || 'Supermarket',
      locationCity: params.initialShopInput.locationCity?.trim() || 'Lagos',
      address: params.initialShopInput.address.trim(),
      phone: params.initialShopInput.phone.trim(),
      managerName: params.fullName.trim(),
      status: 'active',
      terminalId: `TERM-${prefix}01`,
      taxRatePercent: 7.5,
      receiptHeaderNote: `${params.initialShopInput.name.trim()} — Official Receipt`,
      receiptFooterNote: 'Thank you for your patronage',
      createdAt: nowDate,
      pendingSyncCount: 0,
      lastSyncedAt: 'Cloud Synced',
    };

    const ownerUser: User = {
      id: cleanUid,
      businessId,
      username: cleanEmail.split('@')[0] || cleanUid,
      email: cleanEmail,
      fullName: params.fullName.trim(),
      role: 'business_owner',
      roleLabel: `Business Owner (${newBusiness.name})`,
      assignedShopIds: [shopId],
      permissions: [...ROLE_DEFAULT_PERMISSIONS.business_owner],
      status: 'active',
      createdAt: nowDate,
      lastLoginAt: new Date().toISOString(),
    };

    // Persist in Firestore according to security rules (User profile -> Business -> Shop)
    await this.cloudProvider.saveUserProfile(ownerUser);
    await this.cloudProvider.saveBusiness(newBusiness);
    await this.cloudProvider.saveShop(newShop);

    if (this.dbAdapter) {
      await this.dbAdapter.saveBusiness({
        id: newBusiness.id,
        name: newBusiness.name,
        legal_name: newBusiness.legalName,
        business_type: newBusiness.businessType,
        registration_number: newBusiness.registrationNumber,
        tax_identification_number: newBusiness.taxIdentificationNumber,
        owner_user_id: newBusiness.ownerUserId,
        owner_name: newBusiness.ownerName,
        owner_email: newBusiness.ownerEmail,
        contact_email: newBusiness.contactEmail,
        primary_phone: newBusiness.primaryPhone,
        headquarters_address: newBusiness.headquartersAddress,
        currency_code: newBusiness.currencyCode,
        currency_symbol: newBusiness.currencySymbol,
        default_tax_rate_percent: newBusiness.defaultTaxRatePercent,
        status: newBusiness.status,
        created_at: nowDate,
        updated_at: nowDate,
      });
      await this.dbAdapter.saveShop({
        id: newShop.id,
        business_id: newShop.businessId,
        code: newShop.code,
        name: newShop.name,
        category: newShop.category,
        location_city: newShop.locationCity,
        address: newShop.address,
        phone: newShop.phone,
        manager_name: newShop.managerName,
        status: newShop.status,
        terminal_id: newShop.terminalId,
        tax_rate_percent: newShop.taxRatePercent,
        receipt_header_note: newShop.receiptHeaderNote,
        receipt_footer_note: newShop.receiptFooterNote,
        created_at: nowDate,
        updated_at: nowDate,
      });
    }

    return await this.resolveAuthenticatedSession({
      uid: cleanUid,
      email: cleanEmail,
      displayName: params.fullName,
      emailVerified: params.emailVerified,
    });
  }

  /**
   * Explicit user-initiated onboarding action for the designated bootstrap admin
   * to initialize a Platform Administrator profile in Firestore.
   */
  async provisionLivePlatformAdminProfile(params: {
    uid: string;
    email: string;
    fullName: string;
    emailVerified?: boolean;
  }): Promise<LiveSessionResolutionResult> {
    const cleanUid = (params.uid || '').trim();
    const cleanEmail = (params.email || '').trim().toLowerCase();

    if (!cleanUid || cleanUid === 'unauthenticated') {
      throw new Error(
        'SECURITY_VIOLATION: A valid authenticated Firebase UID is required to initialize the Platform Administrator profile.'
      );
    }

    if (params.emailVerified === false) {
      throw new Error(
        'SECURITY_VIOLATION: Verified Firebase Authentication email (emailVerified == true) is required to initialize the Platform Administrator profile.'
      );
    }

    if (!isAuthorizedPlatformAdminEmail(cleanEmail)) {
      throw new Error(
        `SECURITY_VIOLATION: Email "${cleanEmail}" is not authorized to initialize the Platform Administrator profile. Only the designated bootstrap administrator is permitted.`
      );
    }

    const existingProfile = await this.cloudProvider.getUserProfile(cleanUid);
    if (existingProfile) {
      if (
        existingProfile.id !== cleanUid ||
        (existingProfile.email || '').trim().toLowerCase() !== cleanEmail
      ) {
        throw new Error(
          'SECURITY_VIOLATION: Existing profile UID or email does not match the authenticated identity.'
        );
      }
      if (existingProfile.role !== 'platform_admin') {
        throw new Error(
          `SECURITY_VIOLATION: Ordinary user with role "${existingProfile.role}" cannot promote themselves to Platform Administrator.`
        );
      }
      if (existingProfile.status === 'suspended') {
        throw new Error(
          'SECURITY_VIOLATION: Suspended profile cannot be initialized as Platform Administrator.'
        );
      }
    }

    const nowDate = new Date().toISOString().slice(0, 10);
    const adminUser: User = {
      id: cleanUid,
      businessId:
        existingProfile?.businessId &&
        isPlatformAdminBusinessSentinel(existingProfile.businessId)
          ? existingProfile.businessId
          : PLATFORM_ADMIN_BUSINESS_SENTINEL,
      username: cleanEmail.split('@')[0] || cleanUid,
      email: cleanEmail,
      fullName: params.fullName.trim() || 'SmartMind Platform Administrator',
      role: 'platform_admin',
      roleLabel: 'Platform Administrator',
      assignedShopIds: [],
      permissions: [...ROLE_DEFAULT_PERMISSIONS.platform_admin],
      status: 'active',
      createdAt: existingProfile?.createdAt || nowDate,
      lastLoginAt: new Date().toISOString(),
    };

    await this.cloudProvider.saveUserProfile(adminUser);
    return await this.resolveAuthenticatedSession({
      uid: cleanUid,
      email: cleanEmail,
      displayName: params.fullName,
      emailVerified: params.emailVerified ?? true,
    });
  }

  async persistLiveBusinessAndOwner(
    business: Business,
    ownerUser: User,
    initialShop?: Shop,
    options?: {
      idempotencyKey?: string;
      explicitOwnerUid?: string;
    }
  ): Promise<PersistLiveBusinessResult> {
    if (ownerUser.role !== 'business_owner') {
      throw new Error(
        'SECURITY_VIOLATION: Business provisioning can only assign role "business_owner" (never "platform_admin").'
      );
    }
    if (
      isPlatformAdminBusinessSentinel(business.id) ||
      isPlatformAdminBusinessSentinel(ownerUser.businessId)
    ) {
      throw new Error(
        'SECURITY_VIOLATION: Tenant businesses and owners cannot use the reserved Platform Administrator sentinel ID.'
      );
    }
    if (
      isKnownDemoRecord(business) ||
      isPreFirebaseTestRecord(business) ||
      (initialShop &&
        (isKnownDemoRecord(initialShop) || isPreFirebaseTestRecord(initialShop)))
    ) {
      throw new Error(
        `QUARANTINE_GUARD: Refusing to provision reserved demo or quarantined pre-Firebase business/shop ID (${business.id}${
          initialShop ? ` / ${initialShop.id}` : ''
        }).`
      );
    }
    if (
      isAuthorizedPlatformAdminEmail(ownerUser.email || '') ||
      isAuthorizedPlatformAdminEmail(business.ownerEmail || '')
    ) {
      throw new Error(
        `SECURITY_VIOLATION: Platform Administrator (${BOOTSTRAP_PLATFORM_ADMIN_EMAIL} / ${STAGING_PLATFORM_ADMIN_EMAIL}) must remain separate from Business Owner accounts.`
      );
    }
    if (
      ownerUser.businessId !== business.id ||
      business.ownerUserId !== ownerUser.id
    ) {
      throw new Error(
        'SECURITY_VIOLATION: Primary owner user record and business tenant ID must match.'
      );
    }
    if (initialShop && initialShop.businessId !== business.id) {
      throw new Error(
        'SECURITY_VIOLATION: Initial shop businessId must match the provisioned business.'
      );
    }

    const rawIdemKey = (
      options?.idempotencyKey || `idem-prov-${business.id}`
    )
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .slice(0, 120);

    if (!rawIdemKey || !/^[a-zA-Z0-9_-]{1,128}$/.test(rawIdemKey)) {
      throw new Error(
        'INVALID_ARGUMENT: A valid idempotencyKey is required for business provisioning.'
      );
    }

    // Never pass synthetic client user IDs (e.g. usr-000X-xxxx, usr-live-owner-xxxx) or demo user IDs as Firebase Auth UIDs
    const rawCandidateOwnerUid =
      options && 'explicitOwnerUid' in options
        ? (options.explicitOwnerUid || '').trim()
        : (ownerUser.id || '').trim();
    const resolvedRequestOwnerUid =
      rawCandidateOwnerUid &&
      !isSyntheticClientUserId(rawCandidateOwnerUid) &&
      !isSyntheticOwnerUserId(rawCandidateOwnerUid) &&
      !KNOWN_DEMO_USER_IDS.has(rawCandidateOwnerUid)
        ? rawCandidateOwnerUid
        : undefined;

    if (typeof this.cloudProvider.provisionBusinessAndPrimaryOwner === 'function') {
      const request: ProvisionBusinessRequest = {
        idempotencyKey: rawIdemKey,
        businessId: business.id,
        name: business.name,
        legalName: business.legalName,
        businessType: business.businessType,
        registrationNumber: business.registrationNumber,
        taxIdentificationNumber: business.taxIdentificationNumber,
        contactEmail: (business.contactEmail || business.ownerEmail || '').trim().toLowerCase(),
        primaryPhone: business.primaryPhone,
        headquartersAddress: business.headquartersAddress,
        ...(resolvedRequestOwnerUid ? { ownerUid: resolvedRequestOwnerUid } : {}),
        ownerName: ownerUser.fullName || business.ownerName,
        ownerEmail: ownerUser.email || business.ownerEmail,
        ...(ownerUser.password ? { ownerPassword: ownerUser.password } : {}),
        currencyCode: business.currencyCode,
        currencySymbol: business.currencySymbol,
        defaultTaxRatePercent: business.defaultTaxRatePercent,
        notes: business.notes,
        initialShopId: initialShop?.id,
        initialShopCode: initialShop?.code,
        initialShopName: initialShop?.name,
        initialShopCategory: initialShop?.category,
        initialShopCity: initialShop?.locationCity,
        initialShopAddress: initialShop?.address,
        initialShopPhone: initialShop?.phone,
      };

      const response = await this.cloudProvider.provisionBusinessAndPrimaryOwner(
        request
      );

      const serverBiz = response.business || {};
      const serverOwner = response.primaryOwner || {};
      const serverShop = response.firstShop;

      const canonicalBizId = String(serverBiz.id || business.id);
      const canonicalOwnerId = String(
        serverOwner.id ||
          serverBiz.ownerUserId ||
          resolvedRequestOwnerUid ||
          ''
      ).trim();

      if (
        !canonicalOwnerId ||
        isSyntheticOwnerUserId(canonicalOwnerId) ||
        isSyntheticClientUserId(canonicalOwnerId)
      ) {
        throw new Error(
          'AUTH_UID_REQUIRED: Cloud provisioning must return a real Firebase Authentication UID for the Business Owner (never a synthetic usr-live-owner-* placeholder).'
        );
      }

      const canonicalShopId = serverShop?.id
        ? String(serverShop.id)
        : initialShop?.id;

      const canonicalBusiness: Business = {
        ...business,
        id: canonicalBizId,
        name: String(serverBiz.name || business.name),
        legalName: String(serverBiz.legalName || business.legalName),
        businessType: (serverBiz.businessType || business.businessType) as Business['businessType'],
        registrationNumber: String(
          serverBiz.registrationNumber || business.registrationNumber
        ),
        taxIdentificationNumber: String(
          serverBiz.taxIdentificationNumber || business.taxIdentificationNumber
        ),
        ownerUserId: canonicalOwnerId,
        ownerName: String(serverBiz.ownerName || business.ownerName),
        ownerEmail: String(serverBiz.ownerEmail || business.ownerEmail),
        contactEmail: String(serverBiz.contactEmail || business.contactEmail),
        primaryPhone: String(serverBiz.primaryPhone || business.primaryPhone),
        headquartersAddress: String(
          serverBiz.headquartersAddress || business.headquartersAddress
        ),
        currencyCode: String(serverBiz.currencyCode || business.currencyCode),
        currencySymbol: String(serverBiz.currencySymbol || business.currencySymbol),
        defaultTaxRatePercent:
          typeof serverBiz.defaultTaxRatePercent === 'number'
            ? serverBiz.defaultTaxRatePercent
            : business.defaultTaxRatePercent,
        status: serverBiz.status === 'suspended' ? 'suspended' : 'active',
        notes: serverBiz.notes ?? business.notes,
        createdAt: String(serverBiz.createdAt || business.createdAt),
      };

      const canonicalShop: Shop | undefined =
        serverShop || initialShop
          ? {
              ...(initialShop || {
                id: canonicalShopId || `shop-live-${canonicalBizId}`,
                businessId: canonicalBizId,
                code: 'SHP-01',
                name: `${canonicalBusiness.name} — Main Branch`,
                category: 'Supermarket',
                locationCity: 'Lagos',
                address: canonicalBusiness.headquartersAddress,
                phone: canonicalBusiness.primaryPhone,
                managerName: canonicalBusiness.ownerName,
                status: 'active',
                terminalId: 'TERM-SHP01',
                taxRatePercent: canonicalBusiness.defaultTaxRatePercent,
                receiptHeaderNote: `${canonicalBusiness.name} — Official Receipt`,
                receiptFooterNote: 'Thank you for your patronage',
                createdAt: canonicalBusiness.createdAt,
                pendingSyncCount: 0,
                lastSyncedAt: 'Cloud Synced',
              }),
              id: String(serverShop?.id || canonicalShopId),
              businessId: canonicalBizId,
              code: String(serverShop?.code || initialShop?.code || 'SHP-01'),
              name: String(
                serverShop?.name ||
                  initialShop?.name ||
                  `${canonicalBusiness.name} — Main Branch`
              ),
              category: (serverShop?.category ||
                initialShop?.category ||
                'Supermarket') as Shop['category'],
              locationCity: String(
                serverShop?.locationCity || initialShop?.locationCity || 'Lagos'
              ),
              address: String(
                serverShop?.address ||
                  initialShop?.address ||
                  canonicalBusiness.headquartersAddress
              ),
              phone: String(
                serverShop?.phone ||
                  initialShop?.phone ||
                  canonicalBusiness.primaryPhone
              ),
              managerName: String(
                serverShop?.managerName ||
                  initialShop?.managerName ||
                  canonicalBusiness.ownerName
              ),
              status: serverShop?.status === 'inactive' ? 'inactive' : 'active',
              terminalId: String(
                serverShop?.terminalId || initialShop?.terminalId || 'TERM-01'
              ),
              taxRatePercent:
                typeof serverShop?.taxRatePercent === 'number'
                  ? serverShop.taxRatePercent
                  : initialShop?.taxRatePercent ??
                    canonicalBusiness.defaultTaxRatePercent,
              vatEnabled:
                typeof serverShop?.vatEnabled === 'boolean'
                  ? serverShop.vatEnabled
                  : typeof serverShop?.taxRatePercent === 'number'
                    ? serverShop.taxRatePercent > 0
                    : false,
              printVatOnReceipt:
                typeof serverShop?.printVatOnReceipt === 'boolean'
                  ? serverShop.printVatOnReceipt
                  : false,
              receiptHeaderNote: String(
                serverShop?.receiptHeaderNote ||
                  initialShop?.receiptHeaderNote ||
                  `${canonicalBusiness.name} — Official Receipt`
              ),
              receiptFooterNote: String(
                serverShop?.receiptFooterNote ||
                  initialShop?.receiptFooterNote ||
                  'Thank you for your patronage'
              ),
              createdAt: String(
                serverShop?.createdAt ||
                  initialShop?.createdAt ||
                  canonicalBusiness.createdAt
              ),
              pendingSyncCount: 0,
              lastSyncedAt: 'Cloud Synced',
            }
          : undefined;

      const canonicalOwner: User = {
        ...ownerUser,
        id: canonicalOwnerId,
        businessId: canonicalBizId,
        username: String(
          serverOwner.username ||
            ownerUser.username ||
            canonicalBusiness.ownerEmail.split('@')[0]
        ),
        email: String(serverOwner.email || ownerUser.email),
        fullName: String(serverOwner.fullName || ownerUser.fullName),
        role: 'business_owner',
        roleLabel: String(
          serverOwner.roleLabel ||
            ownerUser.roleLabel ||
            `Business Owner (${canonicalBusiness.name})`
        ),
        assignedShopIds: Array.isArray(serverOwner.assignedShopIds)
          ? serverOwner.assignedShopIds
          : canonicalShop
          ? [canonicalShop.id]
          : ownerUser.assignedShopIds,
        permissions: Array.isArray(serverOwner.permissions)
          ? serverOwner.permissions
          : [...ROLE_DEFAULT_PERMISSIONS.business_owner],
        status: serverOwner.status === 'suspended' ? 'suspended' : 'active',
        createdAt: String(serverOwner.createdAt || ownerUser.createdAt),
        authUidLinked:
          typeof serverOwner.authUidLinked === 'boolean'
            ? serverOwner.authUidLinked
            : true,
        emailVerified:
          typeof serverOwner.emailVerified === 'boolean'
            ? serverOwner.emailVerified
            : false,
        authDisabled:
          typeof serverOwner.authDisabled === 'boolean'
            ? serverOwner.authDisabled
            : false,
        authAccountCreatedAt:
          typeof serverOwner.authAccountCreatedAt === 'string'
            ? serverOwner.authAccountCreatedAt
            : new Date().toISOString(),
        passwordSetupStatus:
          serverOwner.passwordSetupStatus === 'pending' ||
          serverOwner.passwordSetupStatus === 'email_sent' ||
          serverOwner.passwordSetupStatus === 'verified'
            ? serverOwner.passwordSetupStatus
            : 'pending',
        passwordSetupEmailSentAt:
          typeof serverOwner.passwordSetupEmailSentAt === 'string'
            ? serverOwner.passwordSetupEmailSentAt
            : undefined,
      };

      if (this.dbAdapter) {
        await this.dbAdapter.saveBusiness({
          id: canonicalBusiness.id,
          name: canonicalBusiness.name,
          legal_name: canonicalBusiness.legalName,
          business_type: canonicalBusiness.businessType,
          registration_number: canonicalBusiness.registrationNumber,
          tax_identification_number: canonicalBusiness.taxIdentificationNumber,
          owner_user_id: canonicalBusiness.ownerUserId,
          owner_name: canonicalBusiness.ownerName,
          owner_email: canonicalBusiness.ownerEmail,
          contact_email: canonicalBusiness.contactEmail,
          primary_phone: canonicalBusiness.primaryPhone,
          headquarters_address: canonicalBusiness.headquartersAddress,
          currency_code: canonicalBusiness.currencyCode,
          currency_symbol: canonicalBusiness.currencySymbol,
          default_tax_rate_percent: canonicalBusiness.defaultTaxRatePercent,
          status: canonicalBusiness.status,
          created_at: canonicalBusiness.createdAt,
          updated_at: canonicalBusiness.createdAt,
        });
                if (canonicalShop) {
          const existingLocalCanonicalShop =
            await this.dbAdapter.getShop(canonicalShop.id);

          if (
            existingLocalCanonicalShop &&
            existingLocalCanonicalShop.business_id !== canonicalShop.businessId
          ) {
            throw new Error(
              'Local canonical shop ownership verification failed.'
            );
          }

          await this.dbAdapter.saveShop({
            ...(existingLocalCanonicalShop || {}),
            id: canonicalShop.id,
            business_id: canonicalShop.businessId,
            code: canonicalShop.code,
            name: canonicalShop.name,
            category: canonicalShop.category,
            location_city: canonicalShop.locationCity,
            address: canonicalShop.address,
            phone: canonicalShop.phone,
            manager_name: canonicalShop.managerName,
            status: canonicalShop.status,
            terminal_id: canonicalShop.terminalId,
            tax_rate_percent: canonicalShop.taxRatePercent,
            receipt_header_note: canonicalShop.receiptHeaderNote,
            receipt_footer_note: canonicalShop.receiptFooterNote,
			printer_settings_json:
            existingLocalCanonicalShop?.printer_settings_json,
            created_at: canonicalShop.createdAt,
            updated_at: canonicalShop.createdAt,
          });
        }
      }

      return {
        status: response.status || 'provisioned',
        isIdempotentReplay: Boolean(response.isIdempotentReplay),
        business: canonicalBusiness,
        primaryOwner: canonicalOwner,
        firstShop: canonicalShop,
      };
    }

    // Fallback for in-memory test providers that do not implement provisionBusinessAndPrimaryOwner
    const fallbackOwnerUid =
      resolvedRequestOwnerUid ||
      `uid-auth-owner-${rawIdemKey.replace(/[^a-zA-Z0-9]/g, '').slice(-12)}`;
    const canonicalBusiness: Business = {
      ...business,
      ownerUserId: fallbackOwnerUid,
    };
    const effectiveOwner: User = initialShop
      ? {
          ...ownerUser,
          id: fallbackOwnerUid,
          role: 'business_owner',
          authUidLinked: true,
          emailVerified: false,
          authDisabled: false,
          passwordSetupStatus: 'pending',
          assignedShopIds: Array.from(
            new Set([...(ownerUser.assignedShopIds || []), initialShop.id])
          ),
        }
      : {
          ...ownerUser,
          id: fallbackOwnerUid,
          role: 'business_owner',
          authUidLinked: true,
          emailVerified: false,
          authDisabled: false,
          passwordSetupStatus: 'pending',
        };

    await this.cloudProvider.saveUserProfile(effectiveOwner);
    await this.cloudProvider.saveBusiness(canonicalBusiness);
    if (this.dbAdapter) {
      await this.dbAdapter.saveBusiness({
        id: canonicalBusiness.id,
        name: canonicalBusiness.name,
        legal_name: canonicalBusiness.legalName,
        business_type: canonicalBusiness.businessType,
        registration_number: canonicalBusiness.registrationNumber,
        tax_identification_number: canonicalBusiness.taxIdentificationNumber,
        owner_user_id: canonicalBusiness.ownerUserId,
        owner_name: canonicalBusiness.ownerName,
        owner_email: canonicalBusiness.ownerEmail,
        contact_email: canonicalBusiness.contactEmail,
        primary_phone: canonicalBusiness.primaryPhone,
        headquarters_address: canonicalBusiness.headquartersAddress,
        currency_code: canonicalBusiness.currencyCode,
        currency_symbol: canonicalBusiness.currencySymbol,
        default_tax_rate_percent: canonicalBusiness.defaultTaxRatePercent,
        status: canonicalBusiness.status,
        created_at: canonicalBusiness.createdAt,
        updated_at: canonicalBusiness.createdAt,
      });
    }
        if (initialShop) {
      await this.cloudProvider.saveShop(initialShop);
      if (this.dbAdapter) {
        const existingLocalInitialShop =
          await this.dbAdapter.getShop(initialShop.id);

        if (
          existingLocalInitialShop &&
          existingLocalInitialShop.business_id !== initialShop.businessId
        ) {
          throw new Error(
            'Local initial shop ownership verification failed.'
          );
        }

        await this.dbAdapter.saveShop({
          ...(existingLocalInitialShop || {}),
          id: initialShop.id,
          business_id: initialShop.businessId,
          code: initialShop.code,
          name: initialShop.name,
          category: initialShop.category,
          location_city: initialShop.locationCity,
          address: initialShop.address,
          phone: initialShop.phone,
          manager_name: initialShop.managerName,
          status: initialShop.status,
          terminal_id: initialShop.terminalId,
          tax_rate_percent: initialShop.taxRatePercent,
          receipt_header_note: initialShop.receiptHeaderNote,
          receipt_footer_note: initialShop.receiptFooterNote,
		  printer_settings_json:
          existingLocalInitialShop?.printer_settings_json,
          created_at: initialShop.createdAt,
          updated_at: initialShop.createdAt,
        });
      }
    }

    return {
      status: 'provisioned',
      isIdempotentReplay: false,
      business: canonicalBusiness,
      primaryOwner: effectiveOwner,
      firstShop: initialShop,
    };
  }

  async persistLiveBusiness(
    business: Business,
    updatedOwner?: User
  ): Promise<void> {
    await this.cloudProvider.saveBusiness(business);
    if (updatedOwner && updatedOwner.role === 'business_owner') {
      await this.cloudProvider.saveUserProfile(updatedOwner);
    }
  }

  async repairLiveBusinessOwnerAuth(params: {
    actor: User;
    business: Business;
    currentOwnerUser?: User;
    idempotencyKey?: string;
  }): Promise<RepairLiveBusinessOwnerAuthResult> {
    if (
      params.actor.role !== 'platform_admin' ||
      params.actor.status !== 'active'
    ) {
      throw new Error(
        'PERMISSION_DENIED: Only an active Platform Administrator can repair Business Owner authentication.'
      );
    }

    const cleanBizId = (params.business.id || '').trim();
    if (
      !cleanBizId ||
      isPlatformAdminBusinessSentinel(cleanBizId) ||
      KNOWN_DEMO_BUSINESS_IDS.has(cleanBizId)
    ) {
      throw new Error(
        'INVALID_ARGUMENT: Cannot repair authentication for reserved or demo business IDs.'
      );
    }

    const cleanOwnerEmail = (
      params.business.ownerEmail ||
      params.currentOwnerUser?.email ||
      ''
    )
      .trim()
      .toLowerCase();

    if (!cleanOwnerEmail || !cleanOwnerEmail.includes('@')) {
      throw new Error(
        'INVALID_ARGUMENT: A valid Business Owner email is required for authentication repair.'
      );
    }

    if (isAuthorizedPlatformAdminEmail(cleanOwnerEmail)) {
      throw new Error(
        'SECURITY_VIOLATION: Platform Administrator email cannot be bound as a tenant Business Owner.'
      );
    }

    const rawIdemKey = (
      params.idempotencyKey ||
      `repair-owner-${cleanBizId}-${cleanOwnerEmail.replace(/[^a-zA-Z0-9]/g, '')}`
    )
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .slice(0, 120);

    if (typeof this.cloudProvider.repairBusinessOwnerAuth !== 'function') {
      throw new Error(
        'UNAVAILABLE: Cloud Function repairBusinessOwnerAuth is not configured on this provider.'
      );
    }

    const response = await this.cloudProvider.repairBusinessOwnerAuth({
      idempotencyKey: rawIdemKey,
      businessId: cleanBizId,
      expectedOwnerEmail: cleanOwnerEmail,
      expectedOwnerName:
        params.business.ownerName || params.currentOwnerUser?.fullName,
    });

    const canonicalOwnerUid = String(response.canonicalOwnerUid || '').trim();
    if (
      !canonicalOwnerUid ||
      isSyntheticOwnerUserId(canonicalOwnerUid) ||
      isSyntheticClientUserId(canonicalOwnerUid)
    ) {
      throw new Error(
        'AUTH_UID_REQUIRED: Repair function did not return a valid real Firebase Authentication UID.'
      );
    }

    const serverBiz = response.business || {};
    const serverOwner = response.primaryOwner || {};

    const updatedBusiness: Business = {
      ...params.business,
      id: cleanBizId,
      ownerUserId: canonicalOwnerUid,
      ownerName: String(serverBiz.ownerName || params.business.ownerName),
      ownerEmail: String(serverBiz.ownerEmail || cleanOwnerEmail),
      createdAt: String(serverBiz.createdAt || params.business.createdAt),
    };

    const updatedOwner: User = {
      ...(params.currentOwnerUser || {
        id: canonicalOwnerUid,
        businessId: cleanBizId,
        username: cleanOwnerEmail.split('@')[0],
        email: cleanOwnerEmail,
        fullName: params.business.ownerName,
        role: 'business_owner',
        roleLabel: `Business Owner (${params.business.name})`,
        assignedShopIds: [],
        permissions: [...ROLE_DEFAULT_PERMISSIONS.business_owner],
        status: 'active',
        createdAt: params.business.createdAt,
        lastLoginAt: 'Never (Newly Created)',
      }),
      lastLoginAt:
        typeof serverOwner.lastLoginAt === 'string'
          ? serverOwner.lastLoginAt
          : params.currentOwnerUser?.lastLoginAt || 'Never (Newly Created)',
      id: canonicalOwnerUid,
      businessId: cleanBizId,
      username: String(
        serverOwner.username ||
          params.currentOwnerUser?.username ||
          cleanOwnerEmail.split('@')[0]
      ),
      email: String(serverOwner.email || cleanOwnerEmail),
      fullName: String(
        serverOwner.fullName ||
          params.currentOwnerUser?.fullName ||
          params.business.ownerName
      ),
      role: 'business_owner',
      roleLabel: String(
        serverOwner.roleLabel ||
          params.currentOwnerUser?.roleLabel ||
          `Business Owner (${params.business.name})`
      ),
      assignedShopIds: Array.isArray(serverOwner.assignedShopIds)
        ? serverOwner.assignedShopIds
        : params.currentOwnerUser?.assignedShopIds || [],
      permissions: Array.isArray(serverOwner.permissions)
        ? serverOwner.permissions
        : [...ROLE_DEFAULT_PERMISSIONS.business_owner],
      status: serverOwner.status === 'suspended' ? 'suspended' : 'active',
      createdAt: String(
        serverOwner.createdAt ||
          params.currentOwnerUser?.createdAt ||
          params.business.createdAt
      ),
      authUidLinked: true,
      emailVerified: Boolean(serverOwner.emailVerified),
      authDisabled: Boolean(serverOwner.authDisabled),
      authAccountCreatedAt:
        typeof serverOwner.authAccountCreatedAt === 'string'
          ? serverOwner.authAccountCreatedAt
          : undefined,
      passwordSetupStatus:
        serverOwner.passwordSetupStatus === 'pending' ||
        serverOwner.passwordSetupStatus === 'email_sent' ||
        serverOwner.passwordSetupStatus === 'verified'
          ? serverOwner.passwordSetupStatus
          : 'pending',
      passwordSetupEmailSentAt:
        typeof serverOwner.passwordSetupEmailSentAt === 'string'
          ? serverOwner.passwordSetupEmailSentAt
          : params.currentOwnerUser?.passwordSetupEmailSentAt,
      repairedFromUserId:
        response.previousOwnerUserId &&
        response.previousOwnerUserId !== canonicalOwnerUid
          ? response.previousOwnerUserId
          : undefined,
      repairedAt: new Date().toISOString(),
    };

    if (this.dbAdapter) {
      await this.dbAdapter.saveBusiness({
        id: updatedBusiness.id,
        name: updatedBusiness.name,
        legal_name: updatedBusiness.legalName,
        business_type: updatedBusiness.businessType,
        registration_number: updatedBusiness.registrationNumber,
        tax_identification_number: updatedBusiness.taxIdentificationNumber,
        owner_user_id: updatedBusiness.ownerUserId,
        owner_name: updatedBusiness.ownerName,
        owner_email: updatedBusiness.ownerEmail,
        contact_email: updatedBusiness.contactEmail,
        primary_phone: updatedBusiness.primaryPhone,
        headquarters_address: updatedBusiness.headquartersAddress,
        currency_code: updatedBusiness.currencyCode,
        currency_symbol: updatedBusiness.currencySymbol,
        default_tax_rate_percent: updatedBusiness.defaultTaxRatePercent,
        status: updatedBusiness.status,
        created_at: updatedBusiness.createdAt,
        updated_at: new Date().toISOString(),
      });
    }

    return {
      status: response.status,
      isIdempotentReplay: Boolean(response.isIdempotentReplay),
      authAccountCreated: Boolean(response.authAccountCreated),
      canonicalOwnerUid,
      previousOwnerUserId: response.previousOwnerUserId,
      removedSyntheticOwnerUserId: response.removedSyntheticOwnerUserId,
      syntheticProfileDeleted: Boolean(response.removedSyntheticOwnerUserId),
      business: updatedBusiness,
      primaryOwner: updatedOwner,
    };
  }

  async resetLiveUserPassword(params: {
    targetUserId: string;
    targetEmail: string;
    newPassword: string;
  }): Promise<{ success: boolean; message: string; targetUserId: string }> {
    if (typeof this.cloudProvider.resetUserPassword === 'function') {
      return await this.cloudProvider.resetUserPassword({
        targetUserId: params.targetUserId,
        targetEmail: params.targetEmail.trim().toLowerCase(),
        newPassword: params.newPassword.trim(),
      });
    }
    return {
      success: true,
      message: 'Password updated',
      targetUserId: params.targetUserId,
    };
  }

  async sendBusinessOwnerPasswordSetupEmail(params: {
    actor: User;
    ownerUser: User;
    business?: Business;
    skipEmailDispatch?: boolean;
  }): Promise<SendOwnerPasswordSetupEmailResult> {
    if (
      params.actor.role !== 'platform_admin' ||
      params.actor.status !== 'active'
    ) {
      throw new Error(
        'PERMISSION_DENIED: Only an active Platform Administrator can dispatch Business Owner password setup emails.'
      );
    }

    if (params.ownerUser.role !== 'business_owner') {
      throw new Error(
        'SECURITY_VIOLATION: Password setup email from the Platform Admin console can only target a Business Owner account.'
      );
    }

    const targetOwnerUid = (params.ownerUser.id || '').trim();
    const existingCloudOwner = targetOwnerUid
      ? await this.cloudProvider.getUserProfile(targetOwnerUid)
      : null;

    if (existingCloudOwner) {
      if (existingCloudOwner.role !== 'business_owner') {
        throw new Error(
          `SECURITY_VIOLATION: Target Firestore profile /users/${targetOwnerUid} has role "${existingCloudOwner.role}", not "business_owner".`
        );
      }
      if (
        params.ownerUser.businessId &&
        existingCloudOwner.businessId !== params.ownerUser.businessId
      ) {
        throw new Error(
          `PERMISSION_DENIED: Cross-tenant mismatch for /users/${targetOwnerUid} (expected businessId "${params.ownerUser.businessId}", found "${existingCloudOwner.businessId}").`
        );
      }
      if (
        params.business?.id &&
        existingCloudOwner.businessId !== params.business.id
      ) {
        throw new Error(
          `PERMISSION_DENIED: Cross-tenant mismatch between /users/${targetOwnerUid} ("${existingCloudOwner.businessId}") and business "${params.business.id}".`
        );
      }
    }

    // Safe read-modify-write base: preserve exact existing createdAt and all immutable/unrelated fields from Firestore
    const baseOwner: User = existingCloudOwner
      ? {
          ...params.ownerUser,
          ...existingCloudOwner,
          id: existingCloudOwner.id,
          businessId: existingCloudOwner.businessId,
          email: existingCloudOwner.email,
          role: existingCloudOwner.role,
          createdAt: existingCloudOwner.createdAt,
        }
      : params.ownerUser;

    const resolution = resolveBusinessOwnerAuthState(
      baseOwner,
      params.business
    );

    if (!resolution.canSendPasswordSetup && !resolution.canResendPasswordSetup) {
      throw new Error(
        resolution.requiresRepair
          ? 'FAILED_PRECONDITION: Owner record still uses a synthetic placeholder ID or mismatched UID. Run "Repair Owner Authentication" first to bind a real Firebase Authentication account before sending a password setup email.'
          : 'FAILED_PRECONDITION: Cannot send password setup email to a disabled or suspended Business Owner account.'
      );
    }

    const cleanEmail = (baseOwner.email || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error(
        'INVALID_ARGUMENT: Business Owner does not have a valid email address.'
      );
    }

    if (isAuthorizedPlatformAdminEmail(cleanEmail)) {
      throw new Error(
        'SECURITY_VIOLATION: Cannot send tenant owner password setup email to the Platform Administrator account.'
      );
    }

    let emailDispatched = false;
    if (!params.skipEmailDispatch) {
      if (typeof this.cloudProvider.sendPasswordResetEmail !== 'function') {
        throw new Error(
          'UNAVAILABLE: Firebase Authentication sendPasswordResetEmail is not available on this provider.'
        );
      }

      // Trigger Firebase's built-in password reset email (never returns or logs tokens/links)
      await this.cloudProvider.sendPasswordResetEmail(cleanEmail);
      emailDispatched = true;
    }

    const sentAtIso =
      params.skipEmailDispatch && baseOwner.passwordSetupEmailSentAt
        ? baseOwner.passwordSetupEmailSentAt
        : new Date().toISOString();
    const nextPasswordSetupStatus: BusinessOwnerPasswordSetupStatus =
      baseOwner.emailVerified === true ||
      (baseOwner.emailVerified !== false &&
        baseOwner.passwordSetupStatus === 'verified')
        ? 'verified'
        : 'email_sent';

    const updatedOwner: User = {
      ...baseOwner,
      id: baseOwner.id,
      businessId: baseOwner.businessId,
      email: baseOwner.email,
      role: 'business_owner',
      createdAt: baseOwner.createdAt,
      authUidLinked: true,
      passwordSetupStatus: nextPasswordSetupStatus,
      passwordSetupEmailSentAt: sentAtIso,
    };

    try {
      await this.cloudProvider.saveUserProfile(updatedOwner);
    } catch (writeErr: unknown) {
      const detail =
        writeErr instanceof Error
          ? writeErr.message
          : String(writeErr || 'Unknown Firestore write error');
      throw new Error(
        `METADATA_PERSISTENCE_FAILED: ${
          emailDispatched
            ? `Password setup email was dispatched by Firebase Auth to ${cleanEmail}, but its status could not be saved in Firestore`
            : `Password setup status could not be saved in Firestore for ${cleanEmail}`
        } (/users/${updatedOwner.id}): ${detail}`
      );
    }

    const verifiedPersistedOwner = await this.cloudProvider.getUserProfile(
      updatedOwner.id
    );
    if (
      !verifiedPersistedOwner ||
      (verifiedPersistedOwner.passwordSetupStatus !== 'email_sent' &&
        verifiedPersistedOwner.passwordSetupStatus !== 'verified') ||
      !verifiedPersistedOwner.passwordSetupEmailSentAt
    ) {
      throw new Error(
        `METADATA_PERSISTENCE_FAILED: ${
          emailDispatched
            ? `Password setup email was dispatched by Firebase Auth to ${cleanEmail}, but its status could not be verified in Firestore`
            : `Password setup status could not be verified in Firestore for ${cleanEmail}`
        } (/users/${updatedOwner.id}).`
      );
    }

    return {
      status: 'password_setup_email_sent',
      sentToEmail: cleanEmail,
      email: cleanEmail,
      sentAt: verifiedPersistedOwner.passwordSetupEmailSentAt || sentAtIso,
      isResend: Boolean(baseOwner.passwordSetupEmailSentAt),
      emailDispatched,
      metadataPersisted: true,
      updatedOwner: verifiedPersistedOwner,
    };
  }

  /**
   * Dispatches a Firebase email verification link to the currently signed-in
   * unverified Business Owner without using sendPasswordResetEmail and without
   * prematurely marking the Firestore profile as verified.
   */
  async requestBusinessOwnerEmailVerification(params: {
    authenticatedUid: string;
    authenticatedEmail: string;
  }): Promise<{
    status: 'verification_email_sent' | 'already_verified';
    email: string;
    emailVerified: boolean;
  }> {
    const authUid = (params.authenticatedUid || '').trim();
    const authEmail = (params.authenticatedEmail || '').trim().toLowerCase();

    if (
      !authUid ||
      authUid === 'unauthenticated' ||
      isSyntheticOwnerUserId(authUid) ||
      !authEmail
    ) {
      throw new Error(
        'UNAUTHENTICATED_SESSION: Valid non-synthetic Firebase Auth UID and email are required to request email verification.'
      );
    }

    const existingProfile = await this.cloudProvider.getUserProfile(authUid);
    if (!existingProfile) {
      throw new Error(
        `NOT_FOUND: Business Owner profile /users/${authUid} does not exist in Firestore.`
      );
    }

    if (existingProfile.role !== 'business_owner') {
      throw new Error(
        `PERMISSION_DENIED: Email verification workflow is restricted to Business Owner profiles (found role "${existingProfile.role}").`
      );
    }

    const profileEmail = (existingProfile.email || '').trim().toLowerCase();
    if (existingProfile.id !== authUid || profileEmail !== authEmail) {
      throw new Error(
        `PERMISSION_DENIED: Authenticated identity (${authEmail} / ${authUid}) does not match stored Business Owner profile (${existingProfile.email} / ${existingProfile.id}).`
      );
    }

    if (
      existingProfile.emailVerified === true &&
      existingProfile.passwordSetupStatus === 'verified'
    ) {
      return {
        status: 'already_verified',
        email: authEmail,
        emailVerified: true,
      };
    }

    if (
      typeof this.cloudProvider.sendEmailVerificationToCurrentUser !==
      'function'
    ) {
      throw new Error(
        'VERIFICATION_UNAVAILABLE: Cloud provider does not support sendEmailVerificationToCurrentUser.'
      );
    }

    await this.cloudProvider.sendEmailVerificationToCurrentUser();

    return {
      status: 'verification_email_sent',
      email: authEmail,
      emailVerified: false,
    };
  }

  /**
   * Safely synchronizes a signed-in Business Owner's Firebase Authentication
   * emailVerified status with their own /users/{uid} Firestore profile.
   *
   * Security & Tenant Isolation Guarantees:
   * - Strictly self-only: authenticatedUid and authenticatedEmail must match the target business_owner profile.
   * - Never allows an owner or non-admin to update another user's authentication metadata.
   * - Preserves exact createdAt, businessId, role, email, and all immutable fields via read-modify-write.
   * - Never assumes password reset automatically verifies the email:
   *   - When emailVerified === true: updates emailVerified = true, passwordSetupStatus = 'verified', and authUidLinked = true, awaits the write, and reads back the document to verify persistence.
   *   - When emailVerified === false: retains unverified state without writing emailVerified: true or passwordSetupStatus: 'verified'.
   */
  async synchronizeBusinessOwnerSignInState(params: {
    authenticatedUid: string;
    authenticatedEmail: string;
    emailVerified: boolean;
    targetUserId?: string;
    expectedBusinessId?: string;
  }): Promise<User> {
    const authUid = (params.authenticatedUid || '').trim();
    const authEmail = (params.authenticatedEmail || '').trim().toLowerCase();

    if (
      !authUid ||
      authUid === 'unauthenticated' ||
      isSyntheticOwnerUserId(authUid) ||
      !authEmail
    ) {
      throw new Error(
        'UNAUTHENTICATED_SESSION: Valid non-synthetic authenticated Firebase UID and email are required.'
      );
    }

    const targetUid = (params.targetUserId || authUid).trim();
    if (targetUid !== authUid) {
      throw new Error(
        `PERMISSION_DENIED: User "${authUid}" cannot update authentication metadata for another user ("${targetUid}").`
      );
    }

    // Obtain the current Firebase Auth user's actual emailVerified value and refresh ID token when available
    let actualEmailVerified = params.emailVerified === true;
    if (typeof this.cloudProvider.reloadAndGetCurrentAuthState === 'function') {
      const liveAuth = await this.cloudProvider.reloadAndGetCurrentAuthState(
        authUid
      );
      if (liveAuth) {
        if (
          liveAuth.uid !== authUid ||
          (liveAuth.email && liveAuth.email.trim().toLowerCase() !== authEmail)
        ) {
          throw new Error(
            `PERMISSION_DENIED: Active Firebase Authentication user (${liveAuth.email} / ${liveAuth.uid}) does not match synchronization target (${authEmail} / ${authUid}).`
          );
        }
        // Never trust a caller-supplied true value if Firebase Auth token/user reports false
        actualEmailVerified =
          liveAuth.emailVerified === true && params.emailVerified === true;
      }
    }

    const existingProfile = await this.cloudProvider.getUserProfile(targetUid);
    if (!existingProfile) {
      throw new Error(
        `NOT_FOUND: User profile /users/${targetUid} does not exist in Firestore.`
      );
    }

    if (existingProfile.role !== 'business_owner') {
      throw new Error(
        `PERMISSION_DENIED: Self-service authentication metadata synchronization is restricted to Business Owner profiles (found role "${existingProfile.role}").`
      );
    }

    if (existingProfile.status === 'suspended') {
      throw new Error(
        `PERMISSION_DENIED: Business Owner profile "${authUid}" is suspended and cannot synchronize authentication metadata.`
      );
    }

    const profileEmail = (existingProfile.email || '').trim().toLowerCase();
    if (existingProfile.id !== authUid || profileEmail !== authEmail) {
      throw new Error(
        `PERMISSION_DENIED: Authenticated Firebase identity (${authEmail} / ${authUid}) does not match Business Owner profile (${existingProfile.email} / ${existingProfile.id}).`
      );
    }

    if (
      !existingProfile.businessId ||
      isPlatformAdminBusinessSentinel(existingProfile.businessId)
    ) {
      throw new Error(
        `PERMISSION_DENIED: Business Owner profile "${authUid}" does not have a valid tenant businessId.`
      );
    }

    if (
      params.expectedBusinessId &&
      params.expectedBusinessId.trim() &&
      existingProfile.businessId !== params.expectedBusinessId.trim()
    ) {
      throw new Error(
        `PERMISSION_DENIED: Business ID mismatch for Business Owner "${authUid}" (expected "${params.expectedBusinessId.trim()}", found "${existingProfile.businessId}").`
      );
    }

    if (actualEmailVerified === true) {
      const updatedVerifiedOwner: User = {
        ...existingProfile,
        id: existingProfile.id,
        businessId: existingProfile.businessId,
        username: existingProfile.username,
        email: existingProfile.email,
        fullName: existingProfile.fullName,
        role: 'business_owner',
        roleLabel: existingProfile.roleLabel,
        assignedShopIds: [...(existingProfile.assignedShopIds || [])],
        permissions: [...(existingProfile.permissions || [])],
        status: existingProfile.status,
        createdAt: existingProfile.createdAt,
        authUidLinked: true,
        emailVerified: true,
        passwordSetupStatus: 'verified',
      };

      if (
        existingProfile.emailVerified !== true ||
        existingProfile.passwordSetupStatus !== 'verified' ||
        existingProfile.authUidLinked !== true
      ) {
        try {
          await this.cloudProvider.saveUserProfile(updatedVerifiedOwner);
        } catch (writeErr: unknown) {
          const detail =
            writeErr instanceof Error
              ? writeErr.message
              : String(writeErr || 'Unknown Firestore write error');
          throw new Error(
            `OWNER_AUTH_SYNC_FAILED: Failed to persist verified Business Owner authentication metadata to Firestore (/users/${authUid}): ${detail}`
          );
        }

        const persisted = await this.cloudProvider.getUserProfile(authUid);
        if (
          !persisted ||
          persisted.id !== authUid ||
          persisted.businessId !== existingProfile.businessId ||
          persisted.role !== 'business_owner' ||
          persisted.email.trim().toLowerCase() !== authEmail ||
          persisted.createdAt !== existingProfile.createdAt ||
          persisted.emailVerified !== true ||
          persisted.passwordSetupStatus !== 'verified' ||
          persisted.authUidLinked !== true
        ) {
          throw new Error(
            `OWNER_AUTH_SYNC_FAILED: Firestore read-back verification failed for /users/${authUid} after authentication metadata update.`
          );
        }
        return persisted;
      }

      return existingProfile;
    }

    // When emailVerified is false: do NOT mark the profile verified and do NOT write
    // emailVerified: true or passwordSetupStatus: 'verified' to Firestore.
    const unverifiedStatus: BusinessOwnerPasswordSetupStatus =
      existingProfile.passwordSetupStatus === 'password_established'
        ? 'password_established'
        : existingProfile.passwordSetupStatus === 'email_sent' ||
          Boolean(existingProfile.passwordSetupEmailSentAt)
        ? 'email_sent'
        : 'pending';

    return {
      ...existingProfile,
      id: existingProfile.id,
      businessId: existingProfile.businessId,
      email: existingProfile.email,
      role: 'business_owner',
      createdAt: existingProfile.createdAt,
      authUidLinked: true,
      emailVerified: false,
      passwordSetupStatus: unverifiedStatus,
    };
  }

  async setLiveTenantStatus(
    businessId: string,
    status: BusinessStatus,
    reason?: string
  ): Promise<SetTenantStatusResponse> {
    const cleanBizId = typeof businessId === 'string' ? businessId.trim() : '';
    if (
      !cleanBizId ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(cleanBizId) ||
      isPlatformAdminBusinessSentinel(cleanBizId) ||
      KNOWN_DEMO_BUSINESS_IDS.has(cleanBizId) ||
      isPreFirebaseTestRecord({ businessId: cleanBizId })
    ) {
      throw new Error(
        `INVALID_ARGUMENT: Business ID "${String(businessId ?? '')}" is invalid, reserved, or quarantined.`
      );
    }

    const rawStatus: unknown = status;
    if (rawStatus !== 'active' && rawStatus !== 'suspended') {
      throw new Error(
        `INVALID_ARGUMENT: Tenant status must be "active" or "suspended" (received "${String(rawStatus ?? '')}").`
      );
    }

    const cleanReason =
      typeof reason === 'string' && reason.trim().length > 0
        ? reason.trim().slice(0, 300)
        : undefined;

    if (typeof this.cloudProvider.setTenantStatus === 'function') {
      const response = await this.cloudProvider.setTenantStatus({
        businessId: cleanBizId,
        status: rawStatus,
        reason: cleanReason,
      });

      if (this.dbAdapter) {
        const localBiz = await this.dbAdapter.getBusiness(cleanBizId);
        if (localBiz) {
          await this.dbAdapter.saveBusiness({
            ...localBiz,
            status: response.status,
            updated_at: response.updatedAt || new Date().toISOString(),
          });
        }
      }

      return response;
    }

    // Fallback for in-memory test providers without setTenantStatus callable
    const existingBiz = await this.cloudProvider.getBusiness(cleanBizId);
    if (!existingBiz) {
      throw new Error(`NOT_FOUND: Business "${cleanBizId}" does not exist.`);
    }
    const nowIso = new Date().toISOString();
    await this.cloudProvider.saveBusiness({
      ...existingBiz,
      status: rawStatus,
    });
    if (this.dbAdapter) {
      const localBiz = await this.dbAdapter.getBusiness(cleanBizId);
      if (localBiz) {
        await this.dbAdapter.saveBusiness({
          ...localBiz,
          status: rawStatus,
          updated_at: nowIso,
        });
      }
    }
    return {
      businessId: cleanBizId,
      status: rawStatus,
      updatedAt: nowIso,
      auditEventId: `aud-status-${Date.now()}`,
      subscriptionEventId: `sub-${Date.now()}`,
    };
  }

    async persistLiveShop(
    shop: Shop,
    ownerUserId?: string,
    updatedOwnerShopIds?: string[]
  ): Promise<void> {
    const existingLocalShop = this.dbAdapter
      ? await this.dbAdapter.getShop(shop.id)
      : null;

    if (
      existingLocalShop &&
      existingLocalShop.business_id !== shop.businessId
    ) {
      throw new Error('Local shop ownership verification failed.');
    }

    await this.cloudProvider.saveShop(shop);

    if (this.dbAdapter) {
      await this.dbAdapter.saveShop({
        id: shop.id,
        business_id: shop.businessId,
        code: shop.code,
        name: shop.name,
        category: shop.category,
        location_city: shop.locationCity,
        address: shop.address,
        phone: shop.phone,
        manager_name: shop.managerName,
        status: shop.status,
        terminal_id: shop.terminalId,
        tax_rate_percent: shop.taxRatePercent,
        receipt_header_note: shop.receiptHeaderNote,
        receipt_footer_note: shop.receiptFooterNote,
		printer_settings_json:
        existingLocalShop?.printer_settings_json,
        created_at: shop.createdAt,
        updated_at: shop.createdAt,
      });
    }
    if (ownerUserId && updatedOwnerShopIds) {
      try {
        const existingOwner = await this.cloudProvider.getUserProfile(ownerUserId);
        if (existingOwner && existingOwner.role !== 'business_owner') {
          await this.cloudProvider.saveUserProfile({
            ...existingOwner,
            assignedShopIds: updatedOwnerShopIds,
          });
        }
      } catch (ownerErr) {
        console.warn('Skipped owner assignedShopIds cloud update:', ownerErr);
      }
    }
  }

  private validateStaffProfileConstraints(user: User): void {
    if (user.role !== 'shop_manager' && user.role !== 'cashier') {
      throw new Error(
        `PERMISSION_DENIED: Staff operations can only assign "shop_manager" or "cashier" profiles (received "${String(user.role)}").`
      );
    }
    if (
      (user.email || '').trim().toLowerCase() === BOOTSTRAP_PLATFORM_ADMIN_EMAIL ||
      isPlatformAdminBusinessSentinel(user.businessId)
    ) {
      throw new Error(
        'PERMISSION_DENIED: Platform Administrator identity or sentinel businessId cannot be assigned to tenant staff.'
      );
    }
    if (
      isKnownDemoRecord(user) ||
      isPreFirebaseTestRecord(user)
    ) {
      throw new Error(
        `QUARANTINE_GUARD: Refusing to persist reserved demo or quarantined pre-Firebase staff record (${user.id} under ${user.businessId}).`
      );
    }
    if (
      !Array.isArray(user.assignedShopIds) ||
      user.assignedShopIds.length === 0
    ) {
      throw new Error(
        'INVALID_ARGUMENT: Staff profile must be assigned to at least one shop.'
      );
    }
    for (const shopId of user.assignedShopIds) {
      if (
        !shopId ||
        KNOWN_DEMO_SHOP_IDS.has(shopId) ||
        isPreFirebaseTestRecord({ shopId })
      ) {
        throw new Error(
          `INVALID_ARGUMENT: Assigned shop ID "${String(shopId)}" is invalid, reserved, or quarantined.`
        );
      }
    }
    if (!Array.isArray(user.permissions) || user.permissions.length === 0) {
      throw new Error(
        'INVALID_ARGUMENT: Staff profile must contain at least one valid permission.'
      );
    }
    for (const perm of user.permissions) {
      if (typeof perm !== 'string') {
        throw new Error(
          'INVALID_ARGUMENT: Every staff permission must be a string identifier.'
        );
      }
      if (OWNER_ONLY_STAFF_PERMISSIONS.has(perm)) {
        throw new Error(
          `PERMISSION_DENIED: Staff accounts cannot be granted owner-only permission "${perm}".`
        );
      }
      if (!ALLOWED_SHOP_MANAGER_STAFF_PERMISSIONS.has(perm)) {
        throw new Error(
          `INVALID_ARGUMENT: Unknown or unsupported staff permission "${perm}".`
        );
      }
      if (!isPermissionAllowedForStaffRole(user.role, perm)) {
        throw new Error(
          `PERMISSION_DENIED: Role "${user.role}" cannot be granted elevated permission "${perm}".`
        );
      }
    }
  }

  /**
   * Routes new staff invitations through the trusted `inviteAuthorizedStaff` Cloud Function.
   * Strips synthetic client IDs (`usr-000X-xxxx`), enforces role-specific permissions,
   * prevents overwriting existing staff profiles, and returns the canonical server staff User.
   */
  async inviteLiveStaffUser(
    user: User,
    options?: {
      idempotencyKey?: string;
      explicitStaffUid?: string;
      supportSessionId?: string;
    }
  ): Promise<InviteLiveStaffResult> {
    this.validateStaffProfileConstraints(user);

    const cleanEmail = user.email.trim().toLowerCase();
    const rawIdemKey = (
      options?.idempotencyKey ||
      `idem-staff-${user.businessId}-${cleanEmail.replace(/[^a-z0-9]/g, '-')}`
    )
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .slice(0, 120);

    if (!rawIdemKey || !/^[a-zA-Z0-9_-]{1,128}$/.test(rawIdemKey)) {
      throw new Error(
        'INVALID_ARGUMENT: A valid idempotencyKey is required for staff invitation.'
      );
    }

    // Never pass synthetic client user IDs (usr-000X-xxxx) or demo user IDs as Firebase Auth UIDs
    const rawCandidateStaffUid =
      options && 'explicitStaffUid' in options
        ? (options.explicitStaffUid || '').trim()
        : (user.id || '').trim();
    const resolvedRequestStaffUid =
      rawCandidateStaffUid &&
      !isSyntheticClientUserId(rawCandidateStaffUid) &&
      !KNOWN_DEMO_USER_IDS.has(rawCandidateStaffUid)
        ? rawCandidateStaffUid
        : undefined;

    if (typeof this.cloudProvider.inviteAuthorizedStaff === 'function') {
      const request: InviteAuthorizedStaffRequest = {
        idempotencyKey: rawIdemKey,
        businessId: user.businessId,
        ...(resolvedRequestStaffUid ? { staffUid: resolvedRequestStaffUid } : {}),
        fullName: user.fullName.trim(),
        email: cleanEmail,
        role: user.role as 'shop_manager' | 'cashier',
        roleLabel: user.roleLabel,
        assignedShopIds: Array.from(new Set(user.assignedShopIds)),
        permissions: Array.from(new Set(user.permissions)),
        ...(user.password ? { password: user.password } : {}),
        ...(options?.supportSessionId ? { supportSessionId: options.supportSessionId } : {}),
      };

      const response = await this.cloudProvider.inviteAuthorizedStaff(request);
      const serverStaff = response.staffUser || {};
      const canonicalStaffId = String(
        serverStaff.id ||
          resolvedRequestStaffUid ||
          `usr-staff-${rawIdemKey.replace(/[^a-zA-Z0-9]/g, '').slice(-12)}`
      );

      const canonicalStaffUser: User = {
        ...user,
        id: canonicalStaffId,
        businessId: String(serverStaff.businessId || user.businessId),
        username: String(
          serverStaff.username || user.username || cleanEmail.split('@')[0]
        ),
        email: String(serverStaff.email || cleanEmail),
        fullName: String(serverStaff.fullName || user.fullName),
        role: (serverStaff.role || user.role) as 'shop_manager' | 'cashier',
        roleLabel: String(
          serverStaff.roleLabel ||
            user.roleLabel ||
            (user.role === 'shop_manager' ? 'Shop Manager' : 'Cashier')
        ),
        customRoleId: user.customRoleId,
        assignedShopIds: Array.isArray(serverStaff.assignedShopIds)
          ? serverStaff.assignedShopIds
          : [...user.assignedShopIds],
        permissions: Array.isArray(serverStaff.permissions)
          ? serverStaff.permissions
          : [...user.permissions],
        status: serverStaff.status === 'suspended' ? 'suspended' : 'active',
        createdAt: String(serverStaff.createdAt || user.createdAt),
        lastLoginAt: user.lastLoginAt || 'Never (Newly Created)',
      };

      return {
        status: 'created',
        isIdempotentReplay: Boolean(response.isIdempotentReplay),
        staffUser: canonicalStaffUser,
      };
    }

    // Fallback for in-memory test providers without inviteAuthorizedStaff callable
    const canonicalStaffUid =
      resolvedRequestStaffUid ||
      `usr-staff-${rawIdemKey.replace(/[^a-zA-Z0-9]/g, '').slice(-12)}`;

    const existingById = await this.cloudProvider.getUserProfile(
      canonicalStaffUid
    );
    if (existingById) {
      if (existingById.businessId !== user.businessId) {
        throw new Error(
          `PERMISSION_DENIED: Target UID "${canonicalStaffUid}" belongs to another tenant and cannot be overwritten.`
        );
      }
      if (
        existingById.role === 'platform_admin' ||
        existingById.role === 'business_owner'
      ) {
        throw new Error(
          `PERMISSION_DENIED: Target UID "${canonicalStaffUid}" belongs to a privileged account (${existingById.role}) and cannot be overwritten.`
        );
      }
      throw new Error(
        `ALREADY_EXISTS: Staff user profile "${canonicalStaffUid}" already exists in business "${user.businessId}" and cannot be overwritten.`
      );
    }

    const allExistingUsers = await this.cloudProvider.listAllUsers();
    const duplicateByEmail = allExistingUsers.find(
      (u) => (u.email || '').trim().toLowerCase() === cleanEmail
    );
    if (duplicateByEmail) {
      throw new Error(
        `ALREADY_EXISTS: Email "${cleanEmail}" is already registered to user "${duplicateByEmail.id}" in business "${duplicateByEmail.businessId}".`
      );
    }

    const canonicalStaffUser: User = {
      ...user,
      id: canonicalStaffUid,
      email: cleanEmail,
      assignedShopIds: Array.from(new Set(user.assignedShopIds)),
      permissions: Array.from(new Set(user.permissions)),
      status: 'active',
    };

    await this.cloudProvider.saveUserProfile(canonicalStaffUser);
    return {
      status: 'created',
      isIdempotentReplay: false,
      staffUser: canonicalStaffUser,
    };
  }

  /**
   * Persists updates (role, permissions, assigned shops, or account status) to an
   * existing staff profile. New staff creation should use `inviteLiveStaffUser`.
   */
  async persistLiveStaffUser(user: User): Promise<void> {
    this.validateStaffProfileConstraints(user);

    const existing = await this.cloudProvider.getUserProfile(user.id);
    if (existing) {
      if (existing.businessId !== user.businessId) {
        throw new Error(
          `PERMISSION_DENIED: Target UID "${user.id}" belongs to another tenant and cannot be overwritten.`
        );
      }
      if (
        existing.role === 'platform_admin' ||
        existing.role === 'business_owner'
      ) {
        throw new Error(
          `PERMISSION_DENIED: Target UID "${user.id}" belongs to a privileged account (${existing.role}) and cannot be overwritten.`
        );
      }
    }

    await this.cloudProvider.saveUserProfile(user);
  }

  async saveUserProfile(user: User): Promise<void> {
    await this.cloudProvider.saveUserProfile(user);
  }

  async persistLiveProduct(
    product: Product,
    options?: { operationType?: 'create' | 'update'; supportSessionId?: string }
  ): Promise<void> {
    if (isKnownDemoRecord(product) || isPreFirebaseTestRecord(product)) {
      throw new Error('QUARANTINE_GUARD: Refusing to upload demo or pre-Firebase test product to Cloud Firestore.');
    }
    const operationType = options?.operationType || 'create';
    if (!product.businessId || !product.shopId || !product.id) {
      throw new Error('INVALID_PRODUCT_TENANT: Product must have business, shop, and product IDs.');
    }
    if (options?.supportSessionId) {
      const operationId = `product-${operationType}-${product.id}-${crypto.randomUUID()}`;
      const request: SyncOperationRequest = {
        operationId,
        idempotencyKey: `idem-${operationId}`,
        businessId: product.businessId,
        shopId: product.shopId,
        entityType: 'product',
        entityId: product.id,
        operationType,
        schemaVersion: 6,
        supportSessionId: options.supportSessionId,
        payload: {
          product: {
            id: product.id,
            businessId: product.businessId,
            shopId: product.shopId,
            sku: product.sku,
            barcode: product.barcode,
            name: product.name,
            categoryId: product.categoryId,
            categoryName: product.categoryName,
            unit: product.unit,
            costPrice: product.costPrice,
            sellingPrice: product.sellingPrice,
            costPriceKobo: toMinorUnits(product.costPrice || 0),
            sellingPriceKobo: toMinorUnits(product.sellingPrice || 0),
            stockQuantity: product.stockQuantity,
            reorderLevel: product.reorderLevel,
            hasExpiry: Boolean(product.hasExpiry),
            expiryDate: product.hasExpiry && product.expiryDate ? String(product.expiryDate) : null,
            isActive: product.isActive,
          },
        },
      };
      const response = await callSyncPosOperation(request);
      const result = response.data;

      if (result.outcome !== 'acknowledged') {
        throw new Error(
          result.errorMessage ||
            result.conflictReason ||
            'Synchronization was not acknowledged by the server.'
        );
      }
    } else {
      await this.cloudProvider.saveProduct(product);
    }
    if (this.dbAdapter) {
      await this.dbAdapter.saveProduct({
        id: product.id, shop_id: product.shopId, business_id: product.businessId,
        category_id: product.categoryId, category_name: product.categoryName,
        sku: product.sku, barcode: product.barcode, name: product.name, unit: product.unit,
        cost_price_kobo: toMinorUnits(product.costPrice), selling_price_kobo: toMinorUnits(product.sellingPrice),
        stock_quantity: product.stockQuantity, reorder_level: product.reorderLevel,
        tax_exempt: 0, is_active: product.isActive ? 1 : 0,
        created_at: product.updatedAt, updated_at: product.updatedAt,
      });
    }
  }

  async removeLiveProduct(
    businessId: string,
    shopId: string,
    productId: string
  ): Promise<void> {
    await this.cloudProvider.deleteProduct(businessId, shopId, productId);
    if (this.dbAdapter) {
      await this.dbAdapter.deleteProduct(productId, shopId);
    }
  }

  async persistLiveSale(
    sale: SaleTransaction,
    _updatedProducts: Product[] = [],
    options?: {
      operationId?: string;
      idempotencyKey?: string;
      actorUserId?: string;
      supportSessionId?: string;
    }
  ): Promise<SyncOperationResponse> {
    const operationId = (options?.operationId || `sync-${sale.id}`).trim();
    const idempotencyKey = (options?.idempotencyKey || `idem-${sale.id}`).trim();

    if (
      !sale.businessId ||
      !sale.shopId ||
      isKnownDemoRecord(sale) ||
      isPreFirebaseTestRecord(sale) ||
      SPECIFIED_PRE_FIREBASE_SALE_ID_SET.has(sale.id) ||
      SPECIFIED_PRE_FIREBASE_SYNC_ID_SET.has(operationId)
    ) {
      throw new Error(
        `QUARANTINE_GUARD: Refusing to upload quarantined, demo, or pre-Firebase test sale (${sale.id} under ${sale.businessId}/${sale.shopId}) to Cloud Firestore.`
      );
    }

    // Validate sale line items and integer minor-unit financial arithmetic first (before network calls)
    if (!Array.isArray(sale.items) || sale.items.length === 0) {
      throw new Error(
        'INVALID_SALE_ITEMS: A completed live sale must contain at least one line item.'
      );
    }

    let computedSubtotalKobo = 0;
    const dbItemsPayload = sale.items.map((item, idx) => {
      const qty = Number(item.quantity);
      const unitPriceKobo = toMinorUnits(item.unitPrice || 0);
      const costPriceKobo = toMinorUnits(item.costPrice || 0);
      const lineTotalKobo = toMinorUnits(
        item.lineTotal !== undefined ? item.lineTotal : item.unitPrice * qty
      );
      if (!Number.isInteger(qty) || qty <= 0) {
        throw new Error(
          `INVALID_SALE_LINE_QUANTITY: Line item "${item.productName || item.productId}" must have a positive integer quantity.`
        );
      }
      if (unitPriceKobo < 0 || lineTotalKobo !== unitPriceKobo * qty) {
        throw new Error(
          `INVALID_SALE_LINE_MATH: Line item "${item.productName || item.productId}" total does not match unitPrice * quantity.`
        );
      }
      computedSubtotalKobo += lineTotalKobo;
      return {
        id: item.id || `line-${sale.id}-${idx + 1}`,
        sale_id: sale.id,
        shop_id: sale.shopId,
        business_id: sale.businessId,
        product_id: item.productId,
        sku: item.sku,
        barcode: item.barcode || item.sku,
        product_name: item.productName,
        unit: item.unit || 'Unit',
        unit_price_kobo: unitPriceKobo,
        cost_price_kobo: costPriceKobo,
        quantity: qty,
        line_total_kobo: lineTotalKobo,
      };
    });

    const subtotalKobo = toMinorUnits(sale.subtotal || 0);
    const discountAmountKobo = toMinorUnits(sale.discountAmount || 0);
    const taxAmountKobo = toMinorUnits(sale.taxAmount || 0);
    const totalAmountKobo = toMinorUnits(sale.totalAmount || 0);
    const amountTenderedKobo = toMinorUnits(sale.amountTendered || 0);
    const changeDueKobo = toMinorUnits(sale.changeDue || 0);

    if (
      subtotalKobo !== computedSubtotalKobo ||
      discountAmountKobo < 0 ||
      discountAmountKobo > subtotalKobo ||
      taxAmountKobo < 0 ||
      subtotalKobo - discountAmountKobo + taxAmountKobo !== totalAmountKobo ||
      totalAmountKobo <= 0
    ) {
      throw new Error(
        'INVALID_SALE_ARITHMETIC: Sale subtotal, discount, tax, and total amounts do not balance.'
      );
    }

    if (sale.paymentMethod === 'credit') {
      if (amountTenderedKobo !== 0 || changeDueKobo !== 0) {
        throw new Error(
          'INVALID_CREDIT_TENDER: Credit sales must record 0 amount tendered and 0 change due.'
        );
      }
    } else if (
      amountTenderedKobo < totalAmountKobo ||
      changeDueKobo !== amountTenderedKobo - totalAmountKobo
    ) {
      throw new Error(
        'INVALID_PAYMENT_TENDER: Amount tendered and change due do not match sale total.'
      );
    }

    const nowIso = new Date().toISOString();
    const dbSalePayload = {
      id: sale.id,
      shop_id: sale.shopId,
      business_id: sale.businessId,
      receipt_number: sale.receiptNumber,
      terminal_id: sale.terminalId || 'TERM-01',
      cashier_user_id: sale.cashierUserId,
      cashier_name: sale.cashierName,
      subtotal_kobo: subtotalKobo,
      discount_amount_kobo: discountAmountKobo,
      tax_rate_percent: Number(sale.taxRatePercent || 0),
      tax_amount_kobo: taxAmountKobo,
      total_amount_kobo: totalAmountKobo,
      amount_tendered_kobo: amountTenderedKobo,
      change_due_kobo: changeDueKobo,
      payment_method: sale.paymentMethod || 'cash',
      payment_reference: sale.paymentReference,
      credit_customer_id: sale.creditCustomerId,
      credit_customer_name: sale.creditCustomerName,
      credit_customer_phone: sale.creditCustomerPhone,
      notes: sale.notes,
      status: 'completed' as const,
      idempotency_key: idempotencyKey,
      created_at: sale.createdAt || nowIso,
    };

    const syncRequest: SyncOperationRequest = {
      operationId,
      idempotencyKey,
      businessId: sale.businessId,
      shopId: sale.shopId,
      entityType: 'sale',
      entityId: sale.id,
      operationType: 'create',
      schemaVersion: 6,
      ...(options?.supportSessionId ? { supportSessionId: options.supportSessionId } : {}),
      payload: {
        sale: dbSalePayload,
        items: dbItemsPayload,
        payment: {
          id: `pay-${sale.id}`,
          amount_kobo: totalAmountKobo,
          payment_method: sale.paymentMethod || 'cash',
          reference_id: sale.id,
        },
        receipt_number: sale.receiptNumber,
      },
    };

    let response: SyncOperationResponse;
    try {
      // Verify that the parent business and shop exist and are active in Cloud Firestore before running any sale sync transaction
      const cloudBiz = await this.cloudProvider.getBusiness(sale.businessId);
      if (!cloudBiz) {
        throw new Error(
          `UNVERIFIED_LIVE_TENANT: Parent business "${sale.businessId}" does not exist in Cloud Firestore.`
        );
      }
      if (cloudBiz.status !== 'active') {
        throw new Error(
          `FORBIDDEN_SUSPENDED_BUSINESS: Parent business "${sale.businessId}" is suspended.`
        );
      }

      const cloudShop = await this.cloudProvider.getShop(
        sale.businessId,
        sale.shopId
      );
      if (!cloudShop) {
        throw new Error(
          `UNVERIFIED_LIVE_TENANT: Parent shop "${sale.shopId}" under business "${sale.businessId}" does not exist in Cloud Firestore.`
        );
      }
      if (cloudShop.status !== 'active') {
        throw new Error(
          `FORBIDDEN_INACTIVE_SHOP: Target shop "${sale.shopId}" is not active.`
        );
      }

      // Verify actor authorization and permissions when actor profile exists in provider
      const actorUid = (options?.actorUserId || sale.cashierUserId || '').trim();
      if (actorUid) {
        const actorProfile = await this.cloudProvider.getUserProfile(actorUid);
        if (actorProfile) {
          if (actorProfile.status !== 'active') {
            throw new Error(
              'PERMISSION_DENIED: Active user account is suspended.'
            );
          }
          if (actorProfile.role === 'platform_admin') {
            throw new Error(
              'PERMISSION_DENIED: Platform Administrator cannot record operational shop sales.'
            );
          }
          if (actorProfile.businessId !== sale.businessId) {
            throw new Error(
              `PERMISSION_DENIED: Cross-business sale synchronization forbidden (${actorProfile.businessId} vs ${sale.businessId}).`
            );
          }
          if (
            actorProfile.role !== 'business_owner' &&
            !actorProfile.assignedShopIds.includes(sale.shopId)
          ) {
            throw new Error(
              `PERMISSION_DENIED: Staff member is not assigned to shop "${sale.shopId}".`
            );
          }
          if (
            actorProfile.role !== 'business_owner' &&
            !actorProfile.permissions.includes('process_sales')
          ) {
            throw new Error(
              'PERMISSION_DENIED: User does not hold process_sales permission.'
            );
          }
          if (
            (sale.discountAmount || 0) > 0 &&
            actorProfile.role !== 'business_owner' &&
            !actorProfile.permissions.includes('apply_discounts')
          ) {
            throw new Error(
              'PERMISSION_DENIED: User does not hold apply_discounts permission.'
            );
          }
          if (sale.cashierUserId && sale.cashierUserId !== actorProfile.id) {
            throw new Error(
              'PERMISSION_DENIED: Cashier identity mismatch on live checkout.'
            );
          }
        }
      }

      if (
        options?.supportSessionId &&
        typeof this.cloudProvider.executeAtomicSaleSync !== 'function'
      ) {
        throw new Error(
          'SUPPORT_MODE_SYNC_UNAVAILABLE: Support Mode sales must use the server-authorized callable; direct provider fallback is disabled.'
        );
      }
      if (typeof this.cloudProvider.executeAtomicSaleSync === 'function') {
        response = await this.cloudProvider.executeAtomicSaleSync(syncRequest);
      } else {
        response = await this.executeProviderAtomicSaleTransaction(
          sale,
          dbItemsPayload,
          idempotencyKey,
          nowIso
        );
      }
    } catch (err: any) {
      const errMsg =
        err?.message || 'Cloud synchronization transaction failed.';
      if (this.dbAdapter) {
        const allEntries = this.dbAdapter.getAllSyncQueue
          ? await this.dbAdapter.getAllSyncQueue(sale.shopId, sale.businessId)
          : await this.dbAdapter.getPendingSyncQueue(sale.shopId);
        const matchingEntry = allEntries.find(
          (e) => e.id === operationId || e.entity_id === sale.id
        );
        if (matchingEntry && matchingEntry.status !== 'quarantined') {
          await this.dbAdapter.updateSyncStatus(
            matchingEntry.id,
            'failed',
            errMsg,
            { errorSummary: errMsg }
          );
        }
      }
      throw err;
    }

    if (response.outcome === 'acknowledged') {
      if (!response.ackId || !String(response.ackId).trim()) {
        const missingAckMsg =
          'MISSING_SERVER_ACK: Server did not return a valid ackId. Sale remains pending local synchronization.';
        if (this.dbAdapter) {
          const allEntries = this.dbAdapter.getAllSyncQueue
            ? await this.dbAdapter.getAllSyncQueue(sale.shopId, sale.businessId)
            : await this.dbAdapter.getPendingSyncQueue(sale.shopId);
          const matchingEntry = allEntries.find(
            (e) => e.id === operationId || e.entity_id === sale.id
          );
          if (matchingEntry && matchingEntry.status !== 'quarantined') {
            await this.dbAdapter.updateSyncStatus(
              matchingEntry.id,
              'failed',
              missingAckMsg,
              { errorSummary: missingAckMsg }
            );
          }
        }
        throw new Error(missingAckMsg);
      }

      const ackTime = response.syncedAt || nowIso;
      if (this.dbAdapter) {
        const allEntries = this.dbAdapter.getAllSyncQueue
          ? await this.dbAdapter.getAllSyncQueue(sale.shopId, sale.businessId)
          : await this.dbAdapter.getPendingSyncQueue(sale.shopId);
        const matchingEntry = allEntries.find(
          (e) => e.id === operationId || e.entity_id === sale.id
        );
        if (matchingEntry && matchingEntry.status !== 'quarantined') {
          await this.dbAdapter.updateSyncStatus(
            matchingEntry.id,
            'synced',
            undefined,
            {
              cloudAckId: response.ackId,
              acknowledgedAt: ackTime,
            }
          );
        }

        const existingLocalSale = await this.dbAdapter.getSale(sale.id);
        if (existingLocalSale) {
          const localItems = await this.dbAdapter.getSaleItems(sale.id);
          await this.dbAdapter.saveSale(
            {
              ...existingLocalSale,
              is_synced: 1,
              synced_at: ackTime,
              sync_ack_id: response.ackId,
            },
            localItems
          );
        }
      }
      return response;
    }

    if (response.outcome === 'conflict_requires_review') {
      const reason =
        response.conflictReason ||
        'Stock conflict detected during atomic cloud sale transaction.';
      if (this.dbAdapter) {
        const allEntries = this.dbAdapter.getAllSyncQueue
          ? await this.dbAdapter.getAllSyncQueue(sale.shopId, sale.businessId)
          : await this.dbAdapter.getPendingSyncQueue(sale.shopId);
        const matchingEntry = allEntries.find(
          (e) => e.id === operationId || e.entity_id === sale.id
        );
        if (matchingEntry && matchingEntry.status !== 'quarantined') {
          await this.dbAdapter.updateSyncStatus(
            matchingEntry.id,
            'requires_review',
            reason,
            { conflictReason: reason }
          );
        }

        const existingLocalSale = await this.dbAdapter.getSale(sale.id);
        if (existingLocalSale) {
          const localItems = await this.dbAdapter.getSaleItems(sale.id);
          await this.dbAdapter.saveSale(
            {
              ...existingLocalSale,
              is_synced: 0,
              sync_conflict_reason: reason,
            },
            localItems
          );
        }
      }
      return response;
    }

    const rejectMsg =
      response.errorMessage ||
      'PERMISSION_DENIED: Sale synchronization rejected by server.';
    if (this.dbAdapter) {
      const allEntries = this.dbAdapter.getAllSyncQueue
        ? await this.dbAdapter.getAllSyncQueue(sale.shopId, sale.businessId)
        : await this.dbAdapter.getPendingSyncQueue(sale.shopId);
      const matchingEntry = allEntries.find(
        (e) => e.id === operationId || e.entity_id === sale.id
      );
      if (matchingEntry && matchingEntry.status !== 'quarantined') {
        await this.dbAdapter.updateSyncStatus(
          matchingEntry.id,
          'requires_review',
          rejectMsg,
          { conflictReason: rejectMsg }
        );
      }
    }
    throw new Error(rejectMsg);
  }

  private async executeProviderAtomicSaleTransaction(
    sale: SaleTransaction,
    dbItemsPayload: Array<{
      id: string;
      product_id: string;
      product_name: string;
      quantity: number;
    }>,
    idempotencyKey: string,
    nowIso: string
  ): Promise<SyncOperationResponse> {
    const replayKey = `${sale.businessId}::${sale.shopId}::${idempotencyKey}`;
    const existingReceipt = this.committedIdempotencyReceipts.get(replayKey);
    if (existingReceipt) {
      return {
        ...existingReceipt,
        isDuplicateReplay: true,
      };
    }

    const existingSales = await this.cloudProvider.listShopSales(
      sale.businessId,
      sale.shopId
    );
    const duplicateSale = existingSales.find(
      (s) => s.id === sale.id || s.receiptNumber === sale.receiptNumber
    );
    if (duplicateSale) {
      const ackId = `ack-${duplicateSale.id}`;
      const replayResponse: SyncOperationResponse = {
        outcome: 'acknowledged',
        status: 'synced',
        ackId,
        syncedAt: nowIso,
        isDuplicateReplay: true,
        databaseId: firebaseConfig.firestoreDatabaseId,
      };
      this.committedIdempotencyReceipts.set(replayKey, replayResponse);
      return replayResponse;
    }

    // Validate all product stock quantities BEFORE mutating any state
    const shopProducts = await this.cloudProvider.listShopProducts(
      sale.businessId,
      sale.shopId
    );
    const productMap = new Map<string, Product>();
    for (const p of shopProducts) {
      productMap.set(p.id, { ...p });
    }

    const stagedProducts: Product[] = [];
    for (const item of dbItemsPayload) {
      const targetProd = productMap.get(item.product_id);
      if (!targetProd || !targetProd.isActive) {
        return {
          outcome: 'conflict_requires_review',
          status: 'requires_review',
          syncedAt: nowIso,
          isDuplicateReplay: false,
          conflictReason: `Product "${item.product_name}" (${item.product_id}) is missing or inactive in cloud inventory.`,
          databaseId: firebaseConfig.firestoreDatabaseId,
        };
      }
      if (targetProd.stockQuantity < item.quantity) {
        return {
          outcome: 'conflict_requires_review',
          status: 'requires_review',
          syncedAt: nowIso,
          isDuplicateReplay: false,
          conflictReason: `Insufficient cloud stock for "${item.product_name}": available ${targetProd.stockQuantity}, required ${item.quantity}.`,
          databaseId: firebaseConfig.firestoreDatabaseId,
        };
      }
      const nextProd: Product = {
        ...targetProd,
        stockQuantity: targetProd.stockQuantity - item.quantity,
        updatedAt: nowIso,
      };
      productMap.set(item.product_id, nextProd);
      stagedProducts.push(nextProd);
    }

    // Commit staged product stock deductions and sale together; roll back if any provider error occurs
    const originalProducts = shopProducts.map((p) => ({ ...p }));
    try {
      for (const updatedProd of stagedProducts) {
        await this.cloudProvider.saveProduct(updatedProd);
      }
      const ackId = `ack-${sale.id}`;
      await this.cloudProvider.saveSale({
        ...sale,
        status: 'completed',
        syncStatus: 'synced',
      });

      const ackResponse: SyncOperationResponse = {
        outcome: 'acknowledged',
        status: 'synced',
        ackId,
        syncedAt: nowIso,
        isDuplicateReplay: false,
        databaseId: firebaseConfig.firestoreDatabaseId,
      };
      this.committedIdempotencyReceipts.set(replayKey, ackResponse);
      return ackResponse;
    } catch (commitErr) {
      // Best-effort rollback of staged products so partial stock deductions never persist
      for (const orig of originalProducts) {
        try {
          await this.cloudProvider.saveProduct(orig);
        } catch {
          // ignore rollback error during outage simulation
        }
      }
      throw commitErr;
    }
  }

  async listShopProducts(businessId: string, shopId: string): Promise<Product[]> {
    return this.cloudProvider.listShopProducts(businessId, shopId);
  }

  async listAllShopsGlobal(): Promise<Shop[]> {
    if (typeof this.cloudProvider.listAllShopsGlobal === 'function') {
      return this.cloudProvider.listAllShopsGlobal();
    }
    const businesses = await this.cloudProvider.listAllBusinesses();
    const shops: Shop[] = [];
    for (const b of businesses) {
      try {
        const s = await this.cloudProvider.listBusinessShops(b.id);
        shops.push(...s);
      } catch {
        // continue
      }
    }
    return shops;
  }

  async listAllProductsGlobal(businessId?: string): Promise<Product[]> {
    if (typeof this.cloudProvider.listAllProductsGlobal === 'function') {
      return this.cloudProvider.listAllProductsGlobal(businessId);
    }
    const rawBusinesses = businessId
      ? [{ id: businessId } as Business]
      : await this.cloudProvider.listAllBusinesses();
    const businesses = rawBusinesses.filter(
      (b) => !isKnownDemoRecord(b) && !isPlatformAdminBusinessSentinel(b.id)
    );
    const products: Product[] = [];
    for (const b of businesses) {
      try {
        const shops = (await this.cloudProvider.listBusinessShops(b.id)).filter(
          (s) => !isKnownDemoRecord(s)
        );
        for (const s of shops) {
          try {
            const p = await this.cloudProvider.listShopProducts(b.id, s.id);
            products.push(...p.filter((prod) => !isKnownDemoRecord(prod)));
          } catch {
            // continue
          }
        }
      } catch {
        // continue
      }
    }
    return products;
  }

  async listAllSalesGlobal(criteria?: {
    businessId?: string;
    shopId?: string;
  }): Promise<SaleTransaction[]> {
    if (typeof this.cloudProvider.listAllSalesGlobal === 'function') {
      return this.cloudProvider.listAllSalesGlobal(criteria);
    }
    if (criteria?.businessId && criteria?.shopId) {
      const sales = await this.cloudProvider.listShopSales(criteria.businessId, criteria.shopId);
      return sales.filter((s) => !isKnownDemoRecord(s));
    }
    const rawBusinesses = criteria?.businessId
      ? [{ id: criteria.businessId } as Business]
      : await this.cloudProvider.listAllBusinesses();
    const businesses = rawBusinesses.filter(
      (b) => !isKnownDemoRecord(b) && !isPlatformAdminBusinessSentinel(b.id)
    );
    const sales: SaleTransaction[] = [];
    for (const b of businesses) {
      try {
        const shops = criteria?.shopId
          ? [{ id: criteria.shopId, businessId: b.id } as Shop]
          : (await this.cloudProvider.listBusinessShops(b.id)).filter((s) => !isKnownDemoRecord(s));
        for (const s of shops) {
          try {
            const sSales = await this.cloudProvider.listShopSales(b.id, s.id);
            sales.push(...sSales.filter((sale) => !isKnownDemoRecord(sale)));
          } catch {
            // continue
          }
        }
      } catch {
        // continue
      }
    }
    return sales;
  }

  async recordPlatformAuditLog(
    log: Omit<PlatformAdminAuditLog, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
  ): Promise<PlatformAdminAuditLog> {
    const id = log.id || `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const createdAt = log.createdAt || new Date().toISOString();
    const fullLog: PlatformAdminAuditLog = {
      ...log,
      id,
      createdAt,
    };
    if (typeof this.cloudProvider.recordPlatformAuditLog === 'function') {
      await this.cloudProvider.recordPlatformAuditLog(fullLog);
    }
    return fullLog;
  }

  async listPlatformAuditLogs(filters?: {
    businessId?: string;
    action?: string;
    limit?: number;
  }): Promise<PlatformAdminAuditLog[]> {
    if (typeof this.cloudProvider.listPlatformAuditLogs === 'function') {
      return this.cloudProvider.listPlatformAuditLogs(filters);
    }
    return [];
  }

  async persistInventoryMovement(
    adjustment: StockAdjustment,
    supportSessionId?: string
  ): Promise<void> {
    const request: SyncOperationRequest = {
      operationId: `inventory-${adjustment.id}`,
      idempotencyKey: `idem-inventory-${adjustment.id}`,
      businessId: adjustment.businessId,
      shopId: adjustment.shopId,
      entityType: 'inventory_movement',
      entityId: adjustment.id,
      operationType: 'adjust',
      schemaVersion: 6,
      ...(supportSessionId ? { supportSessionId } : {}),
      payload: { movement: {
        id: adjustment.id,
        productId: adjustment.productId,
        productName: adjustment.productName,
        productSku: adjustment.productSku,
        type: adjustment.type,
        quantityDelta: adjustment.quantityDelta,
        reason: adjustment.reason,
        performedByUserId: adjustment.performedByUserId,
        performedByName: adjustment.performedByName,
        createdAt: adjustment.createdAt,
      } },
    };
   const response = await callSyncPosOperation(request);
const result = response.data;

    if (result.outcome !== 'acknowledged') {
      throw new Error(
        result.errorMessage ||
        result.conflictReason ||
        'Synchronization was not acknowledged by the server.'
      );
    }
  }

  async processLiveReceiptReturn(params: {
    businessId: string;
    shopId: string;
    saleId: string;
    updatedSale: SaleTransaction;
    returnedItems: ReceiptReturnItemSummary[];
    reason: string;
    supportSessionId?: string;
  }): Promise<void> {
    const idempotencyKey = `idem-ret-${params.saleId}-${Date.now()}`;
    const request: SyncOperationRequest = {
      operationId: `ret-${params.saleId}-${Date.now()}`,
      idempotencyKey,
      businessId: params.businessId,
      shopId: params.shopId,
      entityType: 'sale',
      entityId: params.saleId,
      operationType: 'return' as any,
      schemaVersion: 6,
      ...(params.supportSessionId ? { supportSessionId: params.supportSessionId } : {}),
      payload: {
        saleReturn: {
          saleId: params.saleId,
          updatedSale: params.updatedSale,
          returnedItems: params.returnedItems,
          reason: params.reason,
        },
      } as any,
    };

    const response = await callSyncPosOperation(request);
    const result = response.data;
    if (result.outcome !== 'acknowledged') {
      throw new Error(
        result.errorMessage ||
        result.conflictReason ||
        'Failed to process receipt return in Cloud Firestore.'
      );
    }
  }

  async adjustInventoryAsAdmin(params: {
    businessId: string;
    shopId: string;
    productId: string;
    delta: number;
    type: StockAdjustmentType;
    reason: string;
    adminUser: User;
    supportSessionId: string;
  }): Promise<StockAdjustment> {
    if (!params.supportSessionId) throw new Error('An active Platform Admin support session is required.');
    if (!params.reason.trim() || !Number.isSafeInteger(params.delta) || params.delta === 0) {
      throw new Error('A reason and a non-zero whole-number stock adjustment are required.');
    }
    const products = await this.cloudProvider.listShopProducts(params.businessId, params.shopId);
    const product = products.find((item) => item.id === params.productId);
    if (!product) throw new Error(`Product ${params.productId} not found in shop ${params.shopId}`);
    const previousQuantity = product.stockQuantity;
    const newQuantity = previousQuantity + params.delta;
    if (!Number.isSafeInteger(newQuantity) || newQuantity < 0) {
      throw new Error('This adjustment would result in invalid or negative stock.');
    }
    const adjustment: StockAdjustment = {
      id: `adj-support-${crypto.randomUUID()}`,
      shopId: params.shopId,
      businessId: params.businessId,
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      type: params.type,
      quantityDelta: params.delta,
      previousQuantity,
      newQuantity,
      reason: params.reason.trim(),
      performedByUserId: params.adminUser.id,
      performedByName: params.adminUser.fullName,
      createdAt: new Date().toISOString(),
      syncStatus: 'synced',
    };
    await this.persistInventoryMovement(adjustment, params.supportSessionId);
    return adjustment;
  }

  async updateSaleStatusAsAdmin(params: {
    businessId: string;
    shopId: string;
    saleId: string;
    nextStatus: 'refunded' | 'voided';
    reason: string;
    adminUser: User;
  }): Promise<void> {
    if (!params.reason.trim()) {
      throw new Error('A reason is mandatory to void or refund a transaction.');
    }
    const sales = await this.cloudProvider.listShopSales(params.businessId, params.shopId);
    const sale = sales.find((s) => s.id === params.saleId);
    if (!sale) {
      throw new Error(`Sale ${params.saleId} not found`);
    }
    const previousStatus = sale.status;
    const updatedSale: SaleTransaction = {
      ...sale,
      status: params.nextStatus === 'refunded' ? 'refunded_demo' : 'voided_demo',
      notes: `${sale.notes ? sale.notes + ' | ' : ''}Platform Admin ${params.nextStatus}: ${params.reason.trim()}`,
    };
    await this.cloudProvider.saveSale(updatedSale);

    await this.recordPlatformAuditLog({
      businessId: params.businessId,
      businessName: sale.businessId,
      shopId: params.shopId,
      adminUid: params.adminUser.id,
      adminEmail: params.adminUser.email,
      adminName: params.adminUser.fullName,
      action: params.nextStatus === 'refunded' ? 'sale_refunded' : 'sale_voided',
      targetEntityType: 'sale',
      targetEntityId: sale.id,
      targetEntityName: `Receipt #${sale.receiptNumber}`,
      previousState: { status: previousStatus },
      newState: { status: params.nextStatus },
      reason: params.reason.trim(),
    });
  }

  async toggleUserStatusAsAdmin(params: {
    userId: string;
    status: AccountStatus;
    reason: string;
    adminUser: User;
  }): Promise<void> {
    if (!params.reason.trim()) {
      throw new Error('A reason is mandatory to toggle user status.');
    }
    const user = await this.cloudProvider.getUserProfile(params.userId);
    if (!user) {
      throw new Error(`User ${params.userId} not found`);
    }
    const previousStatus = user.status;
    const updatedUser: User = {
      ...user,
      status: params.status,
    };
    await this.cloudProvider.saveUserProfile(updatedUser);

    await this.recordPlatformAuditLog({
      businessId: user.businessId,
      businessName: user.businessId,
      adminUid: params.adminUser.id,
      adminEmail: params.adminUser.email,
      adminName: params.adminUser.fullName,
      action: params.status === 'suspended' ? 'user_disabled' : 'user_enabled',
      targetEntityType: 'user',
      targetEntityId: user.id,
      targetEntityName: user.fullName || user.email,
      previousState: { status: previousStatus },
      newState: { status: params.status },
      reason: params.reason.trim(),
    });
  }

  async updateUserRoleAndShopsAsAdmin(params: {
    userId: string;
    role: UserRole;
    roleLabel?: string;
    assignedShopIds: string[];
    permissions?: PermissionKey[];
    reason: string;
    adminUser: User;
  }): Promise<User> {
    if (!params.reason.trim()) {
      throw new Error('A reason is mandatory to update user role and shop assignments.');
    }
    const user = await this.cloudProvider.getUserProfile(params.userId);
    if (!user) {
      throw new Error(`User ${params.userId} not found`);
    }
    const previousState = {
      role: user.role,
      roleLabel: user.roleLabel,
      assignedShopIds: user.assignedShopIds,
    };
    const updatedUser: User = {
      ...user,
      role: params.role,
      roleLabel: params.roleLabel || user.roleLabel,
      assignedShopIds: params.assignedShopIds,
      ...(params.permissions ? { permissions: params.permissions } : {}),
    };
    await this.cloudProvider.saveUserProfile(updatedUser);

    await this.recordPlatformAuditLog({
      businessId: user.businessId,
      businessName: user.businessId,
      adminUid: params.adminUser.id,
      adminEmail: params.adminUser.email,
      adminName: params.adminUser.fullName,
      action: 'user_role_changed',
      targetEntityType: 'user',
      targetEntityId: user.id,
      targetEntityName: user.fullName || user.email,
      previousState,
      newState: {
        role: updatedUser.role,
        roleLabel: updatedUser.roleLabel,
        assignedShopIds: updatedUser.assignedShopIds,
      },
      reason: params.reason.trim(),
    });

    return updatedUser;
  }

  async createUserAsAdmin(params: {
    businessId: string;
    fullName: string;
    email: string;
    password?: string;
    role: UserRole;
    roleLabel?: string;
    assignedShopIds: string[];
    permissions: PermissionKey[];
    adminUser: User;
    reason?: string;
    explicitUserId?: string;
  }): Promise<User> {
    const cleanEmail = params.email.trim().toLowerCase();
    const cleanFullName = params.fullName.trim();
    if (!cleanFullName) {
      throw new Error('User full name is required.');
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error('A valid email address is required.');
    }
    if (isAuthorizedPlatformAdminEmail(cleanEmail)) {
      throw new Error('Platform Administrator email cannot be used for tenant staff.');
    }
    if (params.role !== 'business_owner' && (!params.assignedShopIds || params.assignedShopIds.length === 0)) {
      throw new Error('At least one assigned shop is required.');
    }

    const newUserId =
      params.explicitUserId ||
      `usr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const roleTitle =
      params.roleLabel ||
      (params.role === 'shop_manager' ? 'Shop Manager' : params.role === 'cashier' ? 'Cashier' : 'Business Owner');
    const validatedPermissions = Array.from(new Set(params.permissions));

    const nowIso = new Date().toISOString();
    const cleanUserPassword = params.password?.trim();
    const newUser: User = {
      id: newUserId,
      businessId: params.businessId,
      username: cleanEmail.split('@')[0].slice(0, 40),
      email: cleanEmail,
      fullName: cleanFullName,
      role: params.role,
      roleLabel: roleTitle,
      assignedShopIds: params.assignedShopIds,
      permissions: validatedPermissions,
      status: 'active',
      password: cleanUserPassword || undefined,
      passwordSetupStatus: cleanUserPassword ? 'verified' : 'pending',
      emailVerified: Boolean(cleanUserPassword),
      createdAt: nowIso,
      lastLoginAt: 'Never (Newly Created)',
    };

    if (cleanUserPassword && typeof this.cloudProvider.resetUserPassword === 'function') {
      try {
        const resetRes = await this.cloudProvider.resetUserPassword({
          targetUserId: newUserId,
          targetEmail: cleanEmail,
          newPassword: cleanUserPassword,
        });
        if (resetRes.targetUserId) {
          newUser.id = resetRes.targetUserId;
        }
      } catch (pwErr) {
        console.warn('[Admin] Password provisioning for user:', pwErr);
      }
    }

    await this.cloudProvider.saveUserProfile(newUser);

    await this.recordPlatformAuditLog({
      businessId: params.businessId,
      businessName: params.businessId,
      adminUid: params.adminUser.id,
      adminEmail: params.adminUser.email,
      adminName: params.adminUser.fullName,
      action: 'staff_user_created',
      targetEntityType: 'user',
      targetEntityId: newUser.id,
      targetEntityName: newUser.fullName,
      newState: {
        role: newUser.role,
        roleLabel: newUser.roleLabel,
        assignedShopIds: newUser.assignedShopIds,
        email: newUser.email,
      },
      reason:
        params.reason?.trim() ||
        `Platform Admin provisioned user ${newUser.fullName} (${newUser.email}) for business ${params.businessId}`,
    });

    return newUser;
  }

  async listShopSuppliers(businessId: string, shopId: string): Promise<Supplier[]> {
    try {
      const snap = await getDocs(
        collection(db, 'businesses', businessId, 'shops', shopId, 'suppliers')
      );
      if (snap.empty) {
        const bizSnap = await getDocs(
          collection(db, 'businesses', businessId, 'suppliers')
        );
        return bizSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Supplier));
      }
      return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Supplier));
    } catch {
      return [];
    }
  }

  async listShopSupplierSupplies(businessId: string, shopId: string): Promise<SupplierSupplyRecord[]> {
    try {
      const snap = await getDocs(
        collection(db, 'businesses', businessId, 'shops', shopId, 'supplier_supplies')
      );
      if (snap.empty) {
        const bizSnap = await getDocs(
          collection(db, 'businesses', businessId, 'supplier_supplies')
        );
        return bizSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as SupplierSupplyRecord));
      }
      return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as SupplierSupplyRecord));
    } catch {
      return [];
    }
  }

  async listShopCustomers(businessId: string, shopId: string): Promise<DebtCustomer[]> {
    try {
      const snap = await getDocs(
        collection(db, 'businesses', businessId, 'shops', shopId, 'customers')
      );
      return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as DebtCustomer));
    } catch {
      return [];
    }
  }

  async listShopInvoices(businessId: string, shopId: string): Promise<Invoice[]> {
    try {
      const snap = await getDocs(
        collection(db, 'businesses', businessId, 'shops', shopId, 'invoices')
      );
      return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Invoice));
    } catch {
      return [];
    }
  }

  async listShopDebtTransactions(businessId: string, shopId: string): Promise<DebtTransaction[]> {
    try {
      const snap = await getDocs(
        collection(db, 'businesses', businessId, 'shops', shopId, 'debt_transactions')
      );
      return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as DebtTransaction));
    } catch {
      return [];
    }
  }

  async saveShopSupplier(businessId: string, shopId: string, supplier: Supplier): Promise<void> {
    try {
      await setDoc(doc(db, 'businesses', businessId, 'shops', shopId, 'suppliers', supplier.id), supplier, { merge: true });
    } catch (err) {
      console.warn('Failed to save supplier to cloud Firestore:', err);
    }
  }

  async saveShopSupplierSupply(businessId: string, shopId: string, supply: SupplierSupplyRecord): Promise<void> {
    try {
      await setDoc(doc(db, 'businesses', businessId, 'shops', shopId, 'supplier_supplies', supply.id), supply, { merge: true });
    } catch (err) {
      console.warn('Failed to save supplier supply to cloud Firestore:', err);
    }
  }

  async saveShopInvoice(businessId: string, shopId: string, invoice: Invoice): Promise<void> {
    try {
      await setDoc(doc(db, 'businesses', businessId, 'shops', shopId, 'invoices', invoice.id), invoice, { merge: true });
    } catch (err) {
      console.warn('Failed to save invoice to cloud Firestore:', err);
    }
  }

  async saveShopDebtCustomer(businessId: string, shopId: string, customer: DebtCustomer): Promise<void> {
    try {
      await setDoc(doc(db, 'businesses', businessId, 'shops', shopId, 'customers', customer.id), customer, { merge: true });
    } catch (err) {
      console.warn('Failed to save debt customer to cloud Firestore:', err);
    }
  }

  async saveShopDebtTransaction(businessId: string, shopId: string, transaction: DebtTransaction): Promise<void> {
    try {
      await setDoc(doc(db, 'businesses', businessId, 'shops', shopId, 'debt_transactions', transaction.id), transaction, { merge: true });
    } catch (err) {
      console.warn('Failed to save debt transaction to cloud Firestore:', err);
    }
  }

  async loadSupportWorkspaceData(
    businessId: string,
    shopId: string
  ): Promise<{
    products: Product[];
    sales: SaleTransaction[];
    users: User[];
    transfers: ProductTransfer[];
    categories: ProductCategory[];
    suppliers: Supplier[];
    supplierSupplies: SupplierSupplyRecord[];
    debtCustomers: DebtCustomer[];
    debtTransactions: DebtTransaction[];
    invoices: Invoice[];
  }> {
    const [
      products,
      sales,
      users,
      transfers,
      suppliers,
      supplierSupplies,
      debtCustomers,
      debtTransactions,
      invoices,
    ] = await Promise.all([
      this.cloudProvider.listShopProducts(businessId, shopId).catch((err) => {
        console.warn('[SupportMode] Failed to list shop products:', err);
        return [] as Product[];
      }),
      this.cloudProvider.listShopSales(businessId, shopId).catch((err) => {
        console.warn('[SupportMode] Failed to list shop sales:', err);
        return [] as SaleTransaction[];
      }),
      this.cloudProvider.listBusinessUsers(businessId).catch((err) => {
        console.warn('[SupportMode] Failed to list business users:', err);
        return [] as User[];
      }),
      typeof this.cloudProvider.listBusinessTransfers === 'function'
        ? this.cloudProvider.listBusinessTransfers(businessId).catch(() => [] as ProductTransfer[])
        : Promise.resolve([] as ProductTransfer[]),
      this.listShopSuppliers(businessId, shopId),
      this.listShopSupplierSupplies(businessId, shopId),
      this.listShopCustomers(businessId, shopId),
      this.listShopDebtTransactions(businessId, shopId),
      this.listShopInvoices(businessId, shopId),
    ]);

    const validProducts = products.filter((p) => !isKnownDemoRecord(p));
    const categories: ProductCategory[] = [];
    const seenCatIds = new Set<string>();
    validProducts.forEach((p) => {
      const catId = p.categoryId || `cat-${shopId}-general`;
      if (!seenCatIds.has(catId)) {
        seenCatIds.add(catId);
        categories.push({
          id: catId,
          shopId,
          businessId,
          name: p.categoryName || 'General Merchandise',
          description: `Category for shop`,
        });
      }
    });

    if (categories.length === 0) {
      categories.push({
        id: `cat-${shopId}-general`,
        shopId,
        businessId,
        name: 'General Merchandise',
        description: 'Default category',
      });
    }

    return {
      products: validProducts,
      sales: sales.filter((s) => !isKnownDemoRecord(s)),
      users: users.filter((u) => !isKnownDemoRecord(u)),
      transfers,
      categories,
      suppliers: suppliers.filter((s) => !isKnownDemoRecord(s as any)),
      supplierSupplies: supplierSupplies.filter((r) => !isKnownDemoRecord(r as any)),
      debtCustomers: debtCustomers.filter((c) => !isKnownDemoRecord(c as any)),
      debtTransactions: debtTransactions.filter((t) => !isKnownDemoRecord(t as any)),
      invoices: invoices.filter((i) => !isKnownDemoRecord(i as any)),
    };
  }

  async listBusinessTransfers(businessId: string): Promise<ProductTransfer[]> {
    if (typeof this.cloudProvider.listBusinessTransfers === 'function') {
      return this.cloudProvider.listBusinessTransfers(businessId);
    }
    return [];
  }

  async saveTransfer(transfer: ProductTransfer): Promise<void> {
    if (typeof this.cloudProvider.saveTransfer === 'function') {
      await this.cloudProvider.saveTransfer(transfer);
    }
  }
}
