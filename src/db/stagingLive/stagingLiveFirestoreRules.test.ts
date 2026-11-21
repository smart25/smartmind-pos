/**
 * SmartMind POS — Live Staging Firestore Security Rules Suite (25 Scenarios)
 *
 * Executes against ACTUAL `smartmind-pos-staging` (database `(default)` in `africa-south1`).
 * Covers:
 * - All 17 scenarios from `src/db/firestoreStagingRulesEmulator.test.ts` (S1–S17)
 * - All 8 production-reference scenarios adapted from `src/db/firestoreRulesEmulator.test.ts` (P1–P8)
 *
 * Strictly scoped under `smartmind-staging-test-{runId}`.
 * Never modifies or deletes pre-existing staging accounts (`hLG3ltaqMJh4lJlixuL9QpKVu3u2`,
 * `xC5hccJfqgYfDhjKWAW8MGKZTBH3`) and never touches emulators or production.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, test } from 'node:test';
import {
  signInWithCustomToken,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  initStagingAdminContext,
  PROTECTED_PREEXISTING_STAGING_UIDS,
  StagingAdminContext,
} from './stagingAdminSdk';
import {
  StagingClientContext,
  StagingClientRegistry,
} from './stagingClientSdk';
import {
  loadAndValidateStagingTestEnv,
  STAGING_ADMIN_EMAIL,
  ValidatedStagingTestEnv,
} from './stagingTestEnv';

const RUN_ID = `fs-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
const NAMESPACE = `smartmind-staging-test-${RUN_ID}`;
const NOW_ISO = new Date().toISOString();
const TEST_PASSWORD = `SmFs!${crypto.randomBytes(12).toString('hex')}`;

// Pre-existing Staging Platform Admin UID (read/governance-only via custom token; never mutated)
const STAGING_ADMIN_UID = 'hLG3ltaqMJh4lJlixuL9QpKVu3u2';

// Scoped Ephemeral Tenant Actors
const OWNER_ALPHA_UID = `${NAMESPACE}-owner-a`;
const MGR_ALPHA_UID = `${NAMESPACE}-mgr-a`;
const MGR_LIMITED_UID = `${NAMESPACE}-mgr-lim-a`;
const CASHIER_ALPHA_UID = `${NAMESPACE}-cash-a`;
const OWNER_BETA_UID = `${NAMESPACE}-owner-b`;
const CASHIER_BETA_UID = `${NAMESPACE}-cash-b`;
const UNVERIFIED_OWNER_UID = `${NAMESPACE}-unv-owner`;
const UNVERIFIED_USER_UID = `${NAMESPACE}-unv-user`;
const IMPOSTER_UID = `${NAMESPACE}-imposter`;
const FORGED_ADMIN_UID = `${NAMESPACE}-forged-adm`;

// Scoped Ephemeral Businesses, Shops & Core Entities
const BIZ_ALPHA_ID = `${NAMESPACE}-biz-a`;
const SHOP_ALPHA_1_ID = `${NAMESPACE}-shop-a1`;
const SHOP_ALPHA_2_ID = `${NAMESPACE}-shop-a2`;
const PROD_ALPHA_1_ID = `${NAMESPACE}-prod-a1`;
const SALE_ALPHA_COMPLETED_ID = `${NAMESPACE}-sale-a1`;
const ITEM_ALPHA_1_ID = `${NAMESPACE}-item-a1`;

const BIZ_BETA_ID = `${NAMESPACE}-biz-b`;
const SHOP_BETA_1_ID = `${NAMESPACE}-shop-b1`;
const PROD_BETA_1_ID = `${NAMESPACE}-prod-b1`;
const SALE_BETA_COMPLETED_ID = `${NAMESPACE}-sale-b1`;

let env: ValidatedStagingTestEnv;
let adminCtx: StagingAdminContext;
let clients: StagingClientRegistry;

let adminClient: StagingClientContext;
let ownerAClient: StagingClientContext;
let mgrAClient: StagingClientContext;
let mgrLimitedClient: StagingClientContext;
let cashierAClient: StagingClientContext;
let ownerBClient: StagingClientContext;
let cashierBClient: StagingClientContext;
let unverifiedOwnerClient: StagingClientContext;
let unverifiedUserClient: StagingClientContext;
let imposterClient: StagingClientContext;
let forgedAdminClient: StagingClientContext;
let unauthedClient: StagingClientContext;

async function assertPermissionDenied(
  op: Promise<unknown> | (() => Promise<unknown>),
  label: string
): Promise<void> {
  const execute = typeof op === 'function' ? op : () => op;
  let lastErr: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await execute();
      assert.fail(`[${label}] Expected operation to be DENIED, but it succeeded.`);
    } catch (err: any) {
      lastErr = err;
      const code = String(err?.code || '');
      const msg = String(err?.message || '');
      if (
        code === 'permission-denied' ||
        code.includes('permission-denied') ||
        msg.includes('PERMISSION_DENIED') ||
        msg.includes('Missing or insufficient permissions')
      ) {
        return;
      }
      if (
        (code.includes('unavailable') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('ECONNRESET') ||
          code.includes('deadline-exceeded')) &&
        attempt < 2
      ) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      assert.fail(
        `[${label}] Expected permission-denied, got code="${code}" message="${msg}"`
      );
    }
  }
  throw lastErr;
}

async function assertAllowed<T>(
  op: Promise<T> | (() => Promise<T>),
  label: string
): Promise<T> {
  const execute = typeof op === 'function' ? op : () => op;
  let lastErr: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await execute();
    } catch (err: any) {
      lastErr = err;
      const code = String(err?.code || '');
      const msg = String(err?.message || '');
      if (
        (code.includes('unavailable') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('ECONNRESET') ||
          code.includes('deadline-exceeded')) &&
        attempt < 2
      ) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      assert.fail(
        `[${label}] Expected operation to be ALLOWED, but failed with code="${err?.code}" message="${err?.message}"`
      );
    }
  }
  throw lastErr;
}

function makeUserFixture(overrides: {
  id: string;
  businessId: string;
  email: string;
  fullName: string;
  role: 'platform_admin' | 'business_owner' | 'shop_manager' | 'cashier';
  roleLabel?: string;
  assignedShopIds?: string[];
  permissions?: string[];
  status?: 'active' | 'suspended';
  emailVerified?: boolean;
  passwordSetupStatus?: string;
  authUidLinked?: boolean;
}) {
  const payload: Record<string, any> = {
    id: overrides.id,
    businessId: overrides.businessId,
    username: overrides.email.split('@')[0].slice(0, 40),
    email: overrides.email,
    fullName: overrides.fullName,
    role: overrides.role,
    roleLabel:
      overrides.roleLabel ??
      (overrides.role === 'business_owner'
        ? 'Business Owner'
        : overrides.role === 'shop_manager'
          ? 'Shop Manager'
          : overrides.role === 'cashier'
            ? 'Cashier'
            : 'Platform Administrator'),
    assignedShopIds: overrides.assignedShopIds ?? [],
    permissions: overrides.permissions ?? [],
    status: overrides.status ?? 'active',
    schemaVersion: 1,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  };
  if (overrides.emailVerified !== undefined) {
    payload.emailVerified = overrides.emailVerified;
  }
  if (overrides.passwordSetupStatus !== undefined) {
    payload.passwordSetupStatus = overrides.passwordSetupStatus;
  }
  if (overrides.authUidLinked !== undefined) {
    payload.authUidLinked = overrides.authUidLinked;
  }
  return payload;
}

function makeBusinessFixture(overrides: {
  id: string;
  name: string;
  ownerUserId: string;
  ownerName: string;
  ownerEmail: string;
  status?: 'active' | 'suspended';
}) {
  return {
    id: overrides.id,
    name: overrides.name,
    businessType: 'Retail',
    ownerUserId: overrides.ownerUserId,
    ownerName: overrides.ownerName,
    ownerEmail: overrides.ownerEmail,
    contactEmail: overrides.ownerEmail,
    primaryPhone: '+2348000000100',
    headquartersAddress: '10 Staging Avenue, Lagos',
    currencyCode: 'NGN',
    currencySymbol: '₦',
    defaultTaxRatePercent: 7.5,
    status: overrides.status ?? 'active',
    schemaVersion: 1,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  };
}

function makeShopFixture(overrides: {
  id: string;
  businessId: string;
  code: string;
  name: string;
  status?: 'active' | 'inactive' | 'maintenance';
}) {
  return {
    id: overrides.id,
    businessId: overrides.businessId,
    code: overrides.code,
    name: overrides.name,
    category: 'Retail',
    locationCity: 'Lagos',
    address: '10 Staging Avenue, Lagos',
    phone: '+2348000000101',
    managerName: 'Staging Manager',
    status: overrides.status ?? 'active',
    terminalId: `TERM-${overrides.code}`,
    taxRatePercent: 7.5,
    schemaVersion: 1,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  };
}

function makeProductFixture(overrides: {
  id: string;
  shopId: string;
  businessId: string;
  name?: string;
  sku?: string;
  stockQuantity?: number;
}) {
  return {
    id: overrides.id,
    shopId: overrides.shopId,
    businessId: overrides.businessId,
    categoryId: `${NAMESPACE}-cat-gen`,
    categoryName: 'General Merchandise',
    sku: overrides.sku ?? 'SKU-RICE-50KG',
    barcode: overrides.sku ?? 'SKU-RICE-50KG',
    name: overrides.name ?? 'Royal Parboiled Rice 50kg',
    unit: 'Bag',
    costPriceKobo: 6500000,
    sellingPriceKobo: 7500000,
    stockQuantity: overrides.stockQuantity ?? 25,
    reorderLevel: 5,
    isActive: true,
    schemaVersion: 1,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  };
}

function makeSaleFixture(overrides: {
  id: string;
  shopId: string;
  businessId: string;
  cashierUserId: string;
  cashierName?: string;
  subtotalKobo?: number;
  discountAmountKobo?: number;
  taxAmountKobo?: number;
  totalAmountKobo?: number;
  amountTenderedKobo?: number;
  changeDueKobo?: number;
  status?: 'completed' | 'refunded' | 'voided';
  syncAckId?: string;
  syncedAt?: string;
}) {
  const subtotalKobo = overrides.subtotalKobo ?? 1000000;
  const discountAmountKobo = overrides.discountAmountKobo ?? 0;
  const taxAmountKobo = overrides.taxAmountKobo ?? 75000;
  const totalAmountKobo =
    overrides.totalAmountKobo ?? subtotalKobo - discountAmountKobo + taxAmountKobo;
  const amountTenderedKobo = overrides.amountTenderedKobo ?? totalAmountKobo;
  const changeDueKobo =
    overrides.changeDueKobo ?? amountTenderedKobo - totalAmountKobo;

  const payload: Record<string, any> = {
    id: overrides.id,
    shopId: overrides.shopId,
    businessId: overrides.businessId,
    receiptNumber: `RCP-${overrides.id}`.slice(0, 60),
    terminalId: 'TERM-ALP-01',
    cashierUserId: overrides.cashierUserId,
    cashierName: overrides.cashierName ?? 'Bolanle Cashier',
    subtotalKobo,
    discountAmountKobo,
    taxRatePercent: 7.5,
    taxAmountKobo,
    totalAmountKobo,
    amountTenderedKobo,
    changeDueKobo,
    paymentMethod: 'cash',
    status: overrides.status ?? 'completed',
    idempotencyKey: `idem-${overrides.id}`.slice(0, 120),
    schemaVersion: 1,
    createdAt: NOW_ISO,
    syncedAt: overrides.syncedAt ?? NOW_ISO,
  };
  if (overrides.syncAckId !== undefined) {
    payload.syncAckId = overrides.syncAckId;
  }
  return payload;
}

function makeSaleItemFixture(overrides: {
  id: string;
  saleId: string;
  shopId: string;
  businessId: string;
  productId: string;
}) {
  return {
    id: overrides.id,
    saleId: overrides.saleId,
    shopId: overrides.shopId,
    businessId: overrides.businessId,
    productId: overrides.productId,
    sku: 'SKU-RICE-50KG',
    barcode: 'SKU-RICE-50KG',
    productName: 'Royal Parboiled Rice 50kg',
    unit: 'Bag',
    unitPriceKobo: 500000,
    costPriceKobo: 400000,
    quantity: 2,
    lineTotalKobo: 1000000,
    schemaVersion: 1,
    createdAt: NOW_ISO,
  };
}

function makeInventoryMovementFixture(overrides: {
  id: string;
  shopId: string;
  businessId: string;
  productId: string;
  type:
    | 'restock'
    | 'add_stock'
    | 'damage_spoilage'
    | 'return_in'
    | 'audit_correction'
    | 'sale_deduction';
  quantityDelta: number;
  previousQuantity: number;
  newQuantity: number;
  reason?: string;
  performedByUserId: string;
  performedByName?: string;
  referenceId?: string;
}) {
  const payload: Record<string, any> = {
    id: overrides.id,
    shopId: overrides.shopId,
    businessId: overrides.businessId,
    productId: overrides.productId,
    productName: 'Royal Parboiled Rice 50kg',
    productSku: 'SKU-RICE-50KG',
    type: overrides.type,
    quantityDelta: overrides.quantityDelta,
    previousQuantity: overrides.previousQuantity,
    newQuantity: overrides.newQuantity,
    reason: overrides.reason ?? `Authorized ${overrides.type}`,
    performedByUserId: overrides.performedByUserId,
    performedByName: overrides.performedByName ?? 'Staff Member',
    schemaVersion: 1,
    createdAt: NOW_ISO,
  };
  if (overrides.referenceId !== undefined) {
    payload.referenceId = overrides.referenceId;
  }
  return payload;
}

function makePlatformAuditLogFixture(overrides: {
  id: string;
  businessId: string;
  adminUid: string;
  adminEmail: string;
  action: string;
  targetEntityType: 'business' | 'shop' | 'user' | 'product' | 'sale' | 'subscription';
  targetEntityId: string;
  reason: string;
}) {
  return {
    id: overrides.id,
    businessId: overrides.businessId,
    businessName: 'Alpha Supermarket Chain',
    adminUid: overrides.adminUid,
    adminEmail: overrides.adminEmail,
    adminName: 'SmartMind Platform Admin',
    action: overrides.action,
    targetEntityType: overrides.targetEntityType,
    targetEntityId: overrides.targetEntityId,
    targetEntityName: 'Scoped Target Entity',
    reason: overrides.reason,
    createdAt: NOW_ISO,
  };
}

async function createAndTrackEphemeralUser(params: {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}) {
  assert.ok(
    !PROTECTED_PREEXISTING_STAGING_UIDS.has(params.uid),
    `Refusing to create protected UID ${params.uid}`
  );
  await adminCtx.auth.createUser({
    uid: params.uid,
    email: params.email,
    password: TEST_PASSWORD,
    displayName: params.displayName,
    emailVerified: params.emailVerified,
    disabled: false,
  });
  adminCtx.tracker.trackAuthUser(params.uid);
}

before(async () => {
  env = loadAndValidateStagingTestEnv();
  adminCtx = initStagingAdminContext({ runId: RUN_ID, env });
  clients = new StagingClientRegistry(RUN_ID, env);

  // Confirm live staging Platform Admin exists and is verified (never modify or delete)
  const realAdminRecord = await adminCtx.auth.getUser(STAGING_ADMIN_UID);
  assert.equal(realAdminRecord.email, STAGING_ADMIN_EMAIL);
  assert.equal(realAdminRecord.emailVerified, true);
  const realAdminProfile = await adminCtx.db
    .doc(`users/${STAGING_ADMIN_UID}`)
    .get();
  assert.equal(realAdminProfile.exists, true);
  assert.equal(realAdminProfile.data()?.role, 'platform_admin');

  // Create run-scoped ephemeral Auth users
  const actors = [
    {
      uid: OWNER_ALPHA_UID,
      email: `${OWNER_ALPHA_UID}@staging-test.smartmind.local`,
      displayName: 'Alpha Owner',
      emailVerified: true,
    },
    {
      uid: MGR_ALPHA_UID,
      email: `${MGR_ALPHA_UID}@staging-test.smartmind.local`,
      displayName: 'Alpha Manager',
      emailVerified: true,
    },
    {
      uid: MGR_LIMITED_UID,
      email: `${MGR_LIMITED_UID}@staging-test.smartmind.local`,
      displayName: 'Alpha Limited Manager',
      emailVerified: true,
    },
    {
      uid: CASHIER_ALPHA_UID,
      email: `${CASHIER_ALPHA_UID}@staging-test.smartmind.local`,
      displayName: 'Alpha Cashier',
      emailVerified: true,
    },
    {
      uid: OWNER_BETA_UID,
      email: `${OWNER_BETA_UID}@staging-test.smartmind.local`,
      displayName: 'Beta Owner',
      emailVerified: true,
    },
    {
      uid: CASHIER_BETA_UID,
      email: `${CASHIER_BETA_UID}@staging-test.smartmind.local`,
      displayName: 'Beta Cashier',
      emailVerified: true,
    },
    {
      uid: UNVERIFIED_OWNER_UID,
      email: `${UNVERIFIED_OWNER_UID}@staging-test.smartmind.local`,
      displayName: 'Alpha Unverified Owner',
      emailVerified: false,
    },
    {
      uid: UNVERIFIED_USER_UID,
      email: `${UNVERIFIED_USER_UID}@staging-test.smartmind.local`,
      displayName: 'Unverified Staff',
      emailVerified: false,
    },
    {
      uid: IMPOSTER_UID,
      email: `${IMPOSTER_UID}@staging-test.smartmind.local`,
      displayName: 'Imposter User',
      emailVerified: true,
    },
    {
      uid: FORGED_ADMIN_UID,
      email: `${FORGED_ADMIN_UID}@staging-test.smartmind.local`,
      displayName: 'Forged Admin User',
      emailVerified: true,
    },
  ];

  for (const actor of actors) {
    await createAndTrackEphemeralUser(actor);
  }

  // Seed run-scoped Firestore tenant hierarchy via Admin SDK (all tracked for cleanup)
  const seedDocs: Array<{ path: string; data: Record<string, any> }> = [
    {
      path: `businesses/${BIZ_ALPHA_ID}`,
      data: makeBusinessFixture({
        id: BIZ_ALPHA_ID,
        name: 'Alpha Supermarket Chain',
        ownerUserId: OWNER_ALPHA_UID,
        ownerName: 'Alpha Owner',
        ownerEmail: `${OWNER_ALPHA_UID}@staging-test.smartmind.local`,
      }),
    },
    {
      path: `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}`,
      data: makeShopFixture({
        id: SHOP_ALPHA_1_ID,
        businessId: BIZ_ALPHA_ID,
        code: 'ALP-01',
        name: 'Alpha Central Shop',
      }),
    },
    {
      path: `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_2_ID}`,
      data: makeShopFixture({
        id: SHOP_ALPHA_2_ID,
        businessId: BIZ_ALPHA_ID,
        code: 'ALP-02',
        name: 'Alpha Annex Shop',
      }),
    },
    {
      path: `users/${OWNER_ALPHA_UID}`,
      data: makeUserFixture({
        id: OWNER_ALPHA_UID,
        businessId: BIZ_ALPHA_ID,
        email: `${OWNER_ALPHA_UID}@staging-test.smartmind.local`,
        fullName: 'Alpha Owner',
        role: 'business_owner',
        assignedShopIds: [SHOP_ALPHA_1_ID, SHOP_ALPHA_2_ID],
        permissions: [
          'manage_business_settings',
          'manage_shops',
          'manage_staff',
          'view_business_reports',
        ],
        emailVerified: true,
        passwordSetupStatus: 'verified',
        authUidLinked: true,
      }),
    },
    {
      path: `users/${MGR_ALPHA_UID}`,
      data: makeUserFixture({
        id: MGR_ALPHA_UID,
        businessId: BIZ_ALPHA_ID,
        email: `${MGR_ALPHA_UID}@staging-test.smartmind.local`,
        fullName: 'Alpha Manager',
        role: 'shop_manager',
        assignedShopIds: [SHOP_ALPHA_1_ID],
        permissions: [
          'process_sales',
          'manage_products',
          'adjust_inventory',
          'process_returns',
          'process_refunds',
        ],
      }),
    },
    {
      path: `users/${MGR_LIMITED_UID}`,
      data: makeUserFixture({
        id: MGR_LIMITED_UID,
        businessId: BIZ_ALPHA_ID,
        email: `${MGR_LIMITED_UID}@staging-test.smartmind.local`,
        fullName: 'Alpha Limited Manager',
        role: 'shop_manager',
        assignedShopIds: [SHOP_ALPHA_1_ID],
        permissions: ['process_sales'],
      }),
    },
    {
      path: `users/${CASHIER_ALPHA_UID}`,
      data: makeUserFixture({
        id: CASHIER_ALPHA_UID,
        businessId: BIZ_ALPHA_ID,
        email: `${CASHIER_ALPHA_UID}@staging-test.smartmind.local`,
        fullName: 'Alpha Cashier',
        role: 'cashier',
        assignedShopIds: [SHOP_ALPHA_1_ID],
        permissions: ['process_sales'],
      }),
    },
    {
      path: `users/${UNVERIFIED_OWNER_UID}`,
      data: makeUserFixture({
        id: UNVERIFIED_OWNER_UID,
        businessId: BIZ_ALPHA_ID,
        email: `${UNVERIFIED_OWNER_UID}@staging-test.smartmind.local`,
        fullName: 'Alpha Unverified Owner',
        role: 'business_owner',
        assignedShopIds: [SHOP_ALPHA_1_ID],
        permissions: [],
        emailVerified: false,
      }),
    },
    {
      path: `users/${UNVERIFIED_USER_UID}`,
      data: makeUserFixture({
        id: UNVERIFIED_USER_UID,
        businessId: BIZ_ALPHA_ID,
        email: `${UNVERIFIED_USER_UID}@staging-test.smartmind.local`,
        fullName: 'Unverified Staff',
        role: 'shop_manager',
        assignedShopIds: [SHOP_ALPHA_1_ID],
        permissions: ['process_sales', 'manage_products'],
      }),
    },
    {
      path: `users/${IMPOSTER_UID}`,
      data: makeUserFixture({
        id: IMPOSTER_UID,
        businessId: BIZ_ALPHA_ID,
        email: `${IMPOSTER_UID}@staging-test.smartmind.local`,
        fullName: 'Imposter User',
        role: 'cashier',
        assignedShopIds: [SHOP_ALPHA_1_ID],
        permissions: ['process_sales'],
      }),
    },
    {
      // Intentionally seeded via Admin SDK with forged role='platform_admin' & wrong email
      path: `users/${FORGED_ADMIN_UID}`,
      data: makeUserFixture({
        id: FORGED_ADMIN_UID,
        businessId: 'PLATFORM',
        email: `${FORGED_ADMIN_UID}@staging-test.smartmind.local`,
        fullName: 'Forged Admin User',
        role: 'platform_admin',
        assignedShopIds: [],
        permissions: [],
      }),
    },
    {
      path: `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/${PROD_ALPHA_1_ID}`,
      data: makeProductFixture({
        id: PROD_ALPHA_1_ID,
        shopId: SHOP_ALPHA_1_ID,
        businessId: BIZ_ALPHA_ID,
        stockQuantity: 25,
      }),
    },
    {
      path: `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/${SALE_ALPHA_COMPLETED_ID}`,
      data: makeSaleFixture({
        id: SALE_ALPHA_COMPLETED_ID,
        shopId: SHOP_ALPHA_1_ID,
        businessId: BIZ_ALPHA_ID,
        cashierUserId: CASHIER_ALPHA_UID,
        status: 'completed',
        syncAckId: 'ack-init-seed-01',
      }),
    },
    {
      path: `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/${SALE_ALPHA_COMPLETED_ID}/items/${ITEM_ALPHA_1_ID}`,
      data: makeSaleItemFixture({
        id: ITEM_ALPHA_1_ID,
        saleId: SALE_ALPHA_COMPLETED_ID,
        shopId: SHOP_ALPHA_1_ID,
        businessId: BIZ_ALPHA_ID,
        productId: PROD_ALPHA_1_ID,
      }),
    },
    // Tenant Beta
    {
      path: `businesses/${BIZ_BETA_ID}`,
      data: makeBusinessFixture({
        id: BIZ_BETA_ID,
        name: 'Beta Healthcare Pharmacy',
        ownerUserId: OWNER_BETA_UID,
        ownerName: 'Beta Owner',
        ownerEmail: `${OWNER_BETA_UID}@staging-test.smartmind.local`,
      }),
    },
    {
      path: `businesses/${BIZ_BETA_ID}/shops/${SHOP_BETA_1_ID}`,
      data: makeShopFixture({
        id: SHOP_BETA_1_ID,
        businessId: BIZ_BETA_ID,
        code: 'BET-01',
        name: 'Beta Abuja Branch',
      }),
    },
    {
      path: `users/${OWNER_BETA_UID}`,
      data: makeUserFixture({
        id: OWNER_BETA_UID,
        businessId: BIZ_BETA_ID,
        email: `${OWNER_BETA_UID}@staging-test.smartmind.local`,
        fullName: 'Beta Owner',
        role: 'business_owner',
        assignedShopIds: [SHOP_BETA_1_ID],
        permissions: ['manage_business_settings', 'manage_shops', 'manage_staff'],
      }),
    },
    {
      path: `users/${CASHIER_BETA_UID}`,
      data: makeUserFixture({
        id: CASHIER_BETA_UID,
        businessId: BIZ_BETA_ID,
        email: `${CASHIER_BETA_UID}@staging-test.smartmind.local`,
        fullName: 'Beta Cashier',
        role: 'cashier',
        assignedShopIds: [SHOP_BETA_1_ID],
        permissions: ['process_sales'],
      }),
    },
    {
      path: `businesses/${BIZ_BETA_ID}/shops/${SHOP_BETA_1_ID}/products/${PROD_BETA_1_ID}`,
      data: makeProductFixture({
        id: PROD_BETA_1_ID,
        shopId: SHOP_BETA_1_ID,
        businessId: BIZ_BETA_ID,
        name: 'Paracetamol 500mg',
        sku: 'SKU-PARA-500',
      }),
    },
    {
      path: `businesses/${BIZ_BETA_ID}/shops/${SHOP_BETA_1_ID}/sales/${SALE_BETA_COMPLETED_ID}`,
      data: makeSaleFixture({
        id: SALE_BETA_COMPLETED_ID,
        shopId: SHOP_BETA_1_ID,
        businessId: BIZ_BETA_ID,
        cashierUserId: CASHIER_BETA_UID,
        status: 'completed',
      }),
    },
  ];

  for (const item of seedDocs) {
    adminCtx.tracker.trackFirestoreDoc(item.path);
    await adminCtx.db.doc(item.path).set(item.data);
  }

  // Sign in isolated Client SDK contexts
  adminClient = clients.getOrCreateActorContext('platform-admin');
  const customToken = await adminCtx.auth.createCustomToken(STAGING_ADMIN_UID);
  await signInWithCustomToken(adminClient.auth, customToken);

  ownerAClient = clients.getOrCreateActorContext('owner-a');
  await signInWithEmailAndPassword(
    ownerAClient.auth,
    `${OWNER_ALPHA_UID}@staging-test.smartmind.local`,
    TEST_PASSWORD
  );

  mgrAClient = clients.getOrCreateActorContext('mgr-a');
  await signInWithEmailAndPassword(
    mgrAClient.auth,
    `${MGR_ALPHA_UID}@staging-test.smartmind.local`,
    TEST_PASSWORD
  );

  mgrLimitedClient = clients.getOrCreateActorContext('mgr-lim-a');
  await signInWithEmailAndPassword(
    mgrLimitedClient.auth,
    `${MGR_LIMITED_UID}@staging-test.smartmind.local`,
    TEST_PASSWORD
  );

  cashierAClient = clients.getOrCreateActorContext('cashier-a');
  await signInWithEmailAndPassword(
    cashierAClient.auth,
    `${CASHIER_ALPHA_UID}@staging-test.smartmind.local`,
    TEST_PASSWORD
  );

  ownerBClient = clients.getOrCreateActorContext('owner-b');
  await signInWithEmailAndPassword(
    ownerBClient.auth,
    `${OWNER_BETA_UID}@staging-test.smartmind.local`,
    TEST_PASSWORD
  );

  cashierBClient = clients.getOrCreateActorContext('cashier-b');
  await signInWithEmailAndPassword(
    cashierBClient.auth,
    `${CASHIER_BETA_UID}@staging-test.smartmind.local`,
    TEST_PASSWORD
  );

  unverifiedOwnerClient = clients.getOrCreateActorContext('unverified-owner');
  await signInWithEmailAndPassword(
    unverifiedOwnerClient.auth,
    `${UNVERIFIED_OWNER_UID}@staging-test.smartmind.local`,
    TEST_PASSWORD
  );

  unverifiedUserClient = clients.getOrCreateActorContext('unverified-user');
  await signInWithEmailAndPassword(
    unverifiedUserClient.auth,
    `${UNVERIFIED_USER_UID}@staging-test.smartmind.local`,
    TEST_PASSWORD
  );

  imposterClient = clients.getOrCreateActorContext('imposter');
  await signInWithEmailAndPassword(
    imposterClient.auth,
    `${IMPOSTER_UID}@staging-test.smartmind.local`,
    TEST_PASSWORD
  );

  forgedAdminClient = clients.getOrCreateActorContext('forged-admin');
  await signInWithEmailAndPassword(
    forgedAdminClient.auth,
    `${FORGED_ADMIN_UID}@staging-test.smartmind.local`,
    TEST_PASSWORD
  );

  unauthedClient = clients.getOrCreateActorContext('unauthed');
});

after(async () => {
  try {
    if (clients) {
      await clients.disposeAll();
    }
  } finally {
    if (adminCtx) {
      const cleanup = await adminCtx.tracker.cleanupTrackedFixtures(
        adminCtx.db,
        adminCtx.bucket,
        adminCtx.auth
      );
      await adminCtx.dispose();
      console.log(
        `[LIVE_STAGING_FIRESTORE_RULES] Cleaned up run=${RUN_ID}: deletedDocs=${cleanup.deletedDocs} deletedObjects=${cleanup.deletedObjects} deletedUsers=${cleanup.deletedUsers}`
      );
    }
  }
});

// ============================================================================
// PART A — Staging Firestore Security Scenarios (S1–S17)
// ============================================================================

test('S1. Platform Admin can list all businesses; Business owners cannot list all businesses', async () => {
  const adminList = await assertAllowed(
    getDocs(collection(adminClient.db, 'businesses')),
    'S1 admin list businesses'
  );
  const listedIds = new Set(adminList.docs.map((d) => d.id));
  assert.ok(listedIds.has(BIZ_ALPHA_ID));
  assert.ok(listedIds.has(BIZ_BETA_ID));

  await assertPermissionDenied(
    getDocs(collection(ownerAClient.db, 'businesses')),
    'S1 ownerA list all businesses'
  );

  const ownBiz = await assertAllowed(
    getDoc(doc(ownerAClient.db, 'businesses', BIZ_ALPHA_ID)),
    'S1 ownerA get own business'
  );
  assert.equal(ownBiz.exists(), true);
});

test('S2. Tenant isolation: Business A cannot access Business B records', async () => {
  await assertPermissionDenied(
    getDoc(doc(ownerAClient.db, 'businesses', BIZ_BETA_ID)),
    'S2 ownerA read Beta business'
  );
  await assertPermissionDenied(
    getDoc(doc(ownerAClient.db, `businesses/${BIZ_BETA_ID}/shops/${SHOP_BETA_1_ID}`)),
    'S2 ownerA read Beta shop'
  );
  await assertPermissionDenied(
    getDoc(
      doc(
        ownerAClient.db,
        `businesses/${BIZ_BETA_ID}/shops/${SHOP_BETA_1_ID}/products/${PROD_BETA_1_ID}`
      )
    ),
    'S2 ownerA read Beta product'
  );
  await assertPermissionDenied(
    getDoc(
      doc(
        ownerAClient.db,
        `businesses/${BIZ_BETA_ID}/shops/${SHOP_BETA_1_ID}/sales/${SALE_BETA_COMPLETED_ID}`
      )
    ),
    'S2 ownerA read Beta sale'
  );
  await assertPermissionDenied(
    getDoc(doc(ownerAClient.db, 'users', OWNER_BETA_UID)),
    'S2 ownerA read Beta owner profile'
  );

  const crossProdId = `${NAMESPACE}-prod-cross-deny`;
  await assertPermissionDenied(
    setDoc(
      doc(
        ownerAClient.db,
        `businesses/${BIZ_BETA_ID}/shops/${SHOP_BETA_1_ID}/products/${crossProdId}`
      ),
      makeProductFixture({
        id: crossProdId,
        shopId: SHOP_BETA_1_ID,
        businessId: BIZ_BETA_ID,
      })
    ),
    'S2 ownerA write Beta product'
  );
});

test('S3. Shop isolation: Shop A manager cannot access Shop B or unassigned Shop A2', async () => {
  const assignedShop = await assertAllowed(
    getDoc(doc(mgrAClient.db, `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}`)),
    'S3 mgrA read assigned shop A1'
  );
  assert.equal(assignedShop.exists(), true);

  await assertPermissionDenied(
    getDoc(doc(mgrAClient.db, `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_2_ID}`)),
    'S3 mgrA read unassigned shop A2'
  );
  await assertPermissionDenied(
    getDocs(
      collection(
        mgrAClient.db,
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_2_ID}/products`
      )
    ),
    'S3 mgrA list unassigned shop A2 products'
  );
  await assertPermissionDenied(
    getDoc(doc(mgrAClient.db, `businesses/${BIZ_BETA_ID}/shops/${SHOP_BETA_1_ID}`)),
    'S3 mgrA read foreign shop B1'
  );
});

test('S4. Cashier restrictions: Cashier cannot modify unauthorized inventory or stock', async () => {
  const prod = await assertAllowed(
    getDoc(
      doc(
        cashierAClient.db,
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/${PROD_ALPHA_1_ID}`
      )
    ),
    'S4 cashierA read assigned shop product'
  );
  assert.equal(prod.exists(), true);

  const newProdId = `${NAMESPACE}-prod-cashier-deny`;
  await assertPermissionDenied(
    setDoc(
      doc(
        cashierAClient.db,
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/${newProdId}`
      ),
      makeProductFixture({
        id: newProdId,
        shopId: SHOP_ALPHA_1_ID,
        businessId: BIZ_ALPHA_ID,
      })
    ),
    'S4 cashierA create product'
  );

  await assertPermissionDenied(
    updateDoc(
      doc(
        cashierAClient.db,
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/${PROD_ALPHA_1_ID}`
      ),
      { stockQuantity: 99, updatedAt: NOW_ISO }
    ),
    'S4 cashierA update product stock'
  );

  await assertPermissionDenied(
    deleteDoc(
      doc(
        cashierAClient.db,
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/${PROD_ALPHA_1_ID}`
      )
    ),
    'S4 cashierA delete product'
  );

  const movRestockId = `${NAMESPACE}-mov-cashier-restock`;
  await assertPermissionDenied(
    setDoc(
      doc(
        cashierAClient.db,
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/inventory_movements/${movRestockId}`
      ),
      makeInventoryMovementFixture({
        id: movRestockId,
        shopId: SHOP_ALPHA_1_ID,
        businessId: BIZ_ALPHA_ID,
        productId: PROD_ALPHA_1_ID,
        type: 'restock',
        quantityDelta: 10,
        previousQuantity: 25,
        newQuantity: 35,
        performedByUserId: CASHIER_ALPHA_UID,
      })
    ),
    'S4 cashierA create restock movement'
  );
});

test('S5. Privilege escalation blocked: Ordinary users cannot modify their own roles or permissions', async () => {
  await assertPermissionDenied(
    updateDoc(doc(cashierAClient.db, 'users', CASHIER_ALPHA_UID), {
      role: 'shop_manager',
      updatedAt: NOW_ISO,
    }),
    'S5 cashier self-escalate to shop_manager'
  );
  await assertPermissionDenied(
    updateDoc(doc(cashierAClient.db, 'users', CASHIER_ALPHA_UID), {
      role: 'platform_admin',
      updatedAt: NOW_ISO,
    }),
    'S5 cashier self-escalate to platform_admin'
  );
  await assertPermissionDenied(
    updateDoc(doc(cashierAClient.db, 'users', CASHIER_ALPHA_UID), {
      permissions: ['process_sales', 'manage_products', 'adjust_inventory'],
      updatedAt: NOW_ISO,
    }),
    'S5 cashier self-grant manager permissions'
  );
  await assertPermissionDenied(
    updateDoc(doc(mgrAClient.db, 'users', MGR_ALPHA_UID), {
      role: 'business_owner',
      updatedAt: NOW_ISO,
    }),
    'S5 manager self-escalate to business_owner'
  );
  await assertPermissionDenied(
    updateDoc(doc(mgrAClient.db, 'users', MGR_ALPHA_UID), {
      businessId: BIZ_BETA_ID,
      updatedAt: NOW_ISO,
    }),
    'S5 manager switch businessId'
  );
});

test('S6. Unverified users cannot access global administration or operational collections', async () => {
  await assertPermissionDenied(
    getDocs(collection(unverifiedUserClient.db, 'businesses')),
    'S6 unverified user list businesses'
  );
  await assertPermissionDenied(
    getDocs(collection(unverifiedUserClient.db, 'platform_audit_logs')),
    'S6 unverified user list platform_audit_logs'
  );
  await assertPermissionDenied(
    getDoc(doc(unverifiedUserClient.db, `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}`)),
    'S6 unverified user read shop'
  );

  // Confirm pre-existing Staging Admin cannot act without email_verified=true (account stays verified)
  const adminRecord = await adminCtx.auth.getUser(STAGING_ADMIN_UID);
  assert.equal(adminRecord.emailVerified, true);
});

test('S7. A forged platform_admin role or unauthorized email cannot grant administrator privileges', async () => {
  await assertPermissionDenied(
    updateDoc(doc(imposterClient.db, 'users', IMPOSTER_UID), {
      role: 'platform_admin',
      businessId: 'PLATFORM',
      updatedAt: NOW_ISO,
    }),
    'S7 imposter self-update role to platform_admin'
  );

  // Even with Admin-seeded role='platform_admin' & businessId='PLATFORM', non-staging-admin email is rejected
  await assertPermissionDenied(
    getDocs(collection(forgedAdminClient.db, 'businesses')),
    'S7 forged admin email list businesses'
  );
  await assertPermissionDenied(
    getDocs(collection(forgedAdminClient.db, 'platform_audit_logs')),
    'S7 forged admin email read platform_audit_logs'
  );
  const forgedLogId = `${NAMESPACE}-forged-audit`;
  await assertPermissionDenied(
    setDoc(
      doc(forgedAdminClient.db, 'platform_audit_logs', forgedLogId),
      makePlatformAuditLogFixture({
        id: forgedLogId,
        businessId: BIZ_ALPHA_ID,
        adminUid: FORGED_ADMIN_UID,
        adminEmail: `${FORGED_ADMIN_UID}@staging-test.smartmind.local`,
        action: 'forged_action',
        targetEntityType: 'business',
        targetEntityId: BIZ_ALPHA_ID,
        reason: 'Forged attempt',
      })
    ),
    'S7 forged admin email write platform_audit_logs'
  );
});

test('S8. Authorized Platform Admin governance succeeds while direct operational writes are separated (denied)', async () => {
  const adminBizId = `${NAMESPACE}-biz-adm`;
  const adminShopId = `${NAMESPACE}-shop-adm1`;
  const adminBizPath = `businesses/${adminBizId}`;
  const adminShopPath = `businesses/${adminBizId}/shops/${adminShopId}`;
  adminCtx.tracker.trackFirestoreDoc(adminShopPath);
  adminCtx.tracker.trackFirestoreDoc(adminBizPath);

  await assertAllowed(
    setDoc(
      doc(adminClient.db, adminBizPath),
      makeBusinessFixture({
        id: adminBizId,
        name: 'Admin Provisioned Staging Biz',
        ownerUserId: OWNER_ALPHA_UID,
        ownerName: 'Alpha Owner',
        ownerEmail: `${OWNER_ALPHA_UID}@staging-test.smartmind.local`,
      })
    ),
    'S8 admin create business'
  );

  await assertAllowed(
    updateDoc(doc(adminClient.db, adminBizPath), {
      status: 'suspended',
      updatedAt: NOW_ISO,
    }),
    'S8 admin suspend business'
  );
  await assertAllowed(
    updateDoc(doc(adminClient.db, adminBizPath), {
      status: 'active',
      updatedAt: NOW_ISO,
    }),
    'S8 admin reactivate business'
  );

  await assertAllowed(
    setDoc(
      doc(adminClient.db, adminShopPath),
      makeShopFixture({
        id: adminShopId,
        businessId: adminBizId,
        code: 'ADM-01',
        name: 'Admin Provisioned Shop',
      })
    ),
    'S8 admin create shop'
  );

  // Operational read allowed
  const alphaProd = await assertAllowed(
    getDoc(
      doc(
        adminClient.db,
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/${PROD_ALPHA_1_ID}`
      )
    ),
    'S8 admin read operational product'
  );
  assert.equal(alphaProd.exists(), true);

  // Operational direct client writes MUST be denied under deployed firestore.staging.rules
  const blockedProdId = `${NAMESPACE}-prod-adm-deny`;
  await assertPermissionDenied(
    setDoc(
      doc(
        adminClient.db,
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/${blockedProdId}`
      ),
      makeProductFixture({
        id: blockedProdId,
        shopId: SHOP_ALPHA_1_ID,
        businessId: BIZ_ALPHA_ID,
      })
    ),
    'S8 admin direct product create denied'
  );

  const blockedMovId = `${NAMESPACE}-mov-adm-deny`;
  await assertPermissionDenied(
    setDoc(
      doc(
        adminClient.db,
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/inventory_movements/${blockedMovId}`
      ),
      makeInventoryMovementFixture({
        id: blockedMovId,
        shopId: SHOP_ALPHA_1_ID,
        businessId: BIZ_ALPHA_ID,
        productId: PROD_ALPHA_1_ID,
        type: 'restock',
        quantityDelta: 5,
        previousQuantity: 25,
        newQuantity: 30,
        performedByUserId: STAGING_ADMIN_UID,
      })
    ),
    'S8 admin direct inventory_movements create denied'
  );

  await assertPermissionDenied(
    updateDoc(
      doc(
        adminClient.db,
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/${SALE_ALPHA_COMPLETED_ID}`
      ),
      { status: 'voided', syncedAt: NOW_ISO }
    ),
    'S8 admin direct sale void denied'
  );
});

test('S9. Platform Admin audit logs allow creation but reject modification and deletion', async () => {
  const auditId = `${NAMESPACE}-audit-01`;
  const auditPath = `platform_audit_logs/${auditId}`;
  adminCtx.tracker.trackFirestoreDoc(auditPath);

  await assertAllowed(
    setDoc(
      doc(adminClient.db, auditPath),
      makePlatformAuditLogFixture({
        id: auditId,
        businessId: BIZ_ALPHA_ID,
        adminUid: STAGING_ADMIN_UID,
        adminEmail: STAGING_ADMIN_EMAIL,
        action: 'tenant_status_updated',
        targetEntityType: 'business',
        targetEntityId: BIZ_ALPHA_ID,
        reason: 'Live staging rule verification test audit entry',
      })
    ),
    'S9 admin create platform_audit_log'
  );

  const fetched = await assertAllowed(
    getDoc(doc(adminClient.db, auditPath)),
    'S9 admin read platform_audit_log'
  );
  assert.equal(fetched.exists(), true);

  await assertPermissionDenied(
    updateDoc(doc(adminClient.db, auditPath), { reason: 'Tampered reason' }),
    'S9 admin update platform_audit_log'
  );
  await assertPermissionDenied(
    deleteDoc(doc(adminClient.db, auditPath)),
    'S9 admin delete platform_audit_log'
  );
});

test('S10. Unauthorized users cannot create or read global platform audit logs', async () => {
  await assertPermissionDenied(
    getDocs(collection(ownerAClient.db, 'platform_audit_logs')),
    'S10 ownerA list platform_audit_logs'
  );
  await assertPermissionDenied(
    getDocs(collection(mgrAClient.db, 'platform_audit_logs')),
    'S10 mgrA list platform_audit_logs'
  );
  await assertPermissionDenied(
    getDocs(collection(cashierAClient.db, 'platform_audit_logs')),
    'S10 cashierA list platform_audit_logs'
  );

  const ownerAuditId = `${NAMESPACE}-owner-audit-deny`;
  await assertPermissionDenied(
    setDoc(
      doc(ownerAClient.db, 'platform_audit_logs', ownerAuditId),
      makePlatformAuditLogFixture({
        id: ownerAuditId,
        businessId: BIZ_ALPHA_ID,
        adminUid: OWNER_ALPHA_UID,
        adminEmail: `${OWNER_ALPHA_UID}@staging-test.smartmind.local`,
        action: 'unauthorized_audit',
        targetEntityType: 'business',
        targetEntityId: BIZ_ALPHA_ID,
        reason: 'Owner should be rejected',
      })
    ),
    'S10 ownerA create platform_audit_log'
  );
});

test('S11. Invalid audit records are rejected (schema validation & reason requirements)', async () => {
  const baseId = `${NAMESPACE}-inv-audit`;

  await assertPermissionDenied(
    setDoc(
      doc(adminClient.db, 'platform_audit_logs', `${baseId}-short-reason`),
      makePlatformAuditLogFixture({
        id: `${baseId}-short-reason`,
        businessId: BIZ_ALPHA_ID,
        adminUid: STAGING_ADMIN_UID,
        adminEmail: STAGING_ADMIN_EMAIL,
        action: 'test_action',
        targetEntityType: 'business',
        targetEntityId: BIZ_ALPHA_ID,
        reason: 'x',
      })
    ),
    'S11 reject reason length < 2'
  );

  await assertPermissionDenied(
    setDoc(
      doc(adminClient.db, 'platform_audit_logs', `${baseId}-bad-type`),
      makePlatformAuditLogFixture({
        id: `${baseId}-bad-type`,
        businessId: BIZ_ALPHA_ID,
        adminUid: STAGING_ADMIN_UID,
        adminEmail: STAGING_ADMIN_EMAIL,
        action: 'test_action',
        targetEntityType: 'invalid_entity' as any,
        targetEntityId: BIZ_ALPHA_ID,
        reason: 'Valid reason string',
      })
    ),
    'S11 reject invalid targetEntityType'
  );

  await assertPermissionDenied(
    setDoc(
      doc(adminClient.db, 'platform_audit_logs', `${baseId}-id-mismatch`),
      makePlatformAuditLogFixture({
        id: `${baseId}-other-id`,
        businessId: BIZ_ALPHA_ID,
        adminUid: STAGING_ADMIN_UID,
        adminEmail: STAGING_ADMIN_EMAIL,
        action: 'test_action',
        targetEntityType: 'business',
        targetEntityId: BIZ_ALPHA_ID,
        reason: 'Valid reason string',
      })
    ),
    'S11 reject mismatched log id'
  );

  await assertPermissionDenied(
    setDoc(
      doc(adminClient.db, 'platform_audit_logs', `${baseId}-forged-email`),
      makePlatformAuditLogFixture({
        id: `${baseId}-forged-email`,
        businessId: BIZ_ALPHA_ID,
        adminUid: STAGING_ADMIN_UID,
        adminEmail: 'other@example.com',
        action: 'test_action',
        targetEntityType: 'business',
        targetEntityId: BIZ_ALPHA_ID,
        reason: 'Valid reason string',
      })
    ),
    'S11 reject unauthorized adminEmail'
  );
});

test('S12. Completed sales cannot be deleted by any role', async () => {
  const saleRefPath = `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/${SALE_ALPHA_COMPLETED_ID}`;
  await assertPermissionDenied(
    deleteDoc(doc(adminClient.db, saleRefPath)),
    'S12 admin delete completed sale'
  );
  await assertPermissionDenied(
    deleteDoc(doc(ownerAClient.db, saleRefPath)),
    'S12 ownerA delete completed sale'
  );
  await assertPermissionDenied(
    deleteDoc(doc(mgrAClient.db, saleRefPath)),
    'S12 mgrA delete completed sale'
  );
  await assertPermissionDenied(
    deleteDoc(doc(cashierAClient.db, saleRefPath)),
    'S12 cashierA delete completed sale'
  );
});

test('S13. Completed sale line items cannot be modified or deleted by any role', async () => {
  const itemPath = `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/${SALE_ALPHA_COMPLETED_ID}/items/${ITEM_ALPHA_1_ID}`;

  for (const [label, ctx] of [
    ['admin', adminClient],
    ['ownerA', ownerAClient],
    ['mgrA', mgrAClient],
    ['cashierA', cashierAClient],
  ] as const) {
    await assertPermissionDenied(
      updateDoc(doc(ctx.db, itemPath), { quantity: 10, lineTotalKobo: 5000000 }),
      `S13 ${label} update sale line item`
    );
    await assertPermissionDenied(
      deleteDoc(doc(ctx.db, itemPath)),
      `S13 ${label} delete sale line item`
    );
  }
});

test('S14. Only permitted status transitions can be made on completed sales (financial values locked)', async () => {
  const saleId = `${NAMESPACE}-sale-status`;
  const salePath = `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/${saleId}`;
  adminCtx.tracker.trackFirestoreDoc(salePath);

  await adminCtx.db.doc(salePath).set(
    makeSaleFixture({
      id: saleId,
      shopId: SHOP_ALPHA_1_ID,
      businessId: BIZ_ALPHA_ID,
      cashierUserId: CASHIER_ALPHA_UID,
      status: 'completed',
    })
  );

  // Financial tampering denied
  await assertPermissionDenied(
    updateDoc(doc(mgrAClient.db, salePath), { totalAmountKobo: 500000 }),
    'S14 mgrA alter totalAmountKobo'
  );

  // Cashier cannot void or refund
  await assertPermissionDenied(
    updateDoc(doc(cashierAClient.db, salePath), {
      status: 'voided',
      syncedAt: NOW_ISO,
    }),
    'S14 cashierA void completed sale'
  );

  // Assigned Shop Manager with process_refunds CAN transition completed -> voided
  await assertAllowed(
    updateDoc(doc(mgrAClient.db, salePath), {
      status: 'voided',
      syncedAt: NOW_ISO,
    }),
    'S14 mgrA transition completed -> voided'
  );

  // Terminal state lock: voided cannot transition back to completed or refunded
  await assertPermissionDenied(
    updateDoc(doc(mgrAClient.db, salePath), {
      status: 'completed',
      syncedAt: NOW_ISO,
    }),
    'S14 mgrA revert voided -> completed'
  );
  await assertPermissionDenied(
    updateDoc(doc(ownerAClient.db, salePath), {
      status: 'refunded',
      syncedAt: NOW_ISO,
    }),
    'S14 ownerA change voided -> refunded'
  );
});

test('S15. Administrative reason requirements are enforced for inventory movements and audit records', async () => {
  const movBase = `${NAMESPACE}-mov-reason`;
  await assertPermissionDenied(
    setDoc(
      doc(
        mgrAClient.db,
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/inventory_movements/${movBase}-empty`
      ),
      makeInventoryMovementFixture({
        id: `${movBase}-empty`,
        shopId: SHOP_ALPHA_1_ID,
        businessId: BIZ_ALPHA_ID,
        productId: PROD_ALPHA_1_ID,
        type: 'restock',
        quantityDelta: 5,
        previousQuantity: 25,
        newQuantity: 30,
        reason: '',
        performedByUserId: MGR_ALPHA_UID,
      })
    ),
    'S15 reject empty inventory movement reason'
  );

  const validMovPath = `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/inventory_movements/${movBase}-ok`;
  adminCtx.tracker.trackFirestoreDoc(validMovPath);
  await assertAllowed(
    setDoc(
      doc(mgrAClient.db, validMovPath),
      makeInventoryMovementFixture({
        id: `${movBase}-ok`,
        shopId: SHOP_ALPHA_1_ID,
        businessId: BIZ_ALPHA_ID,
        productId: PROD_ALPHA_1_ID,
        type: 'restock',
        quantityDelta: 5,
        previousQuantity: 25,
        newQuantity: 30,
        reason: 'Supplier delivery verified #INV-2026',
        performedByUserId: MGR_ALPHA_UID,
      })
    ),
    'S15 mgrA create valid restock movement with reason'
  );

  await assertPermissionDenied(
    setDoc(
      doc(adminClient.db, 'platform_audit_logs', `${NAMESPACE}-audit-empty-reason`),
      makePlatformAuditLogFixture({
        id: `${NAMESPACE}-audit-empty-reason`,
        businessId: BIZ_ALPHA_ID,
        adminUid: STAGING_ADMIN_UID,
        adminEmail: STAGING_ADMIN_EMAIL,
        action: 'tenant_status_updated',
        targetEntityType: 'business',
        targetEntityId: BIZ_ALPHA_ID,
        reason: '',
      })
    ),
    'S15 reject empty platform audit reason'
  );
});

test('S16. Existing owner authentication synchronization permissions remain intact', async () => {
  // Case A: Unverified Business Owner can read their own profile via isSelfUserRead,
  // while still denied operational reads/writes
  const selfProfile = await assertAllowed(
    getDoc(doc(unverifiedOwnerClient.db, 'users', UNVERIFIED_OWNER_UID)),
    'S16 unverified owner reads own user profile (isSelfUserRead)'
  );
  assert.equal(selfProfile.exists(), true);

  await assertPermissionDenied(
    getDoc(doc(unverifiedOwnerClient.db, 'businesses', BIZ_ALPHA_ID)),
    'S16 unverified owner denied business doc read'
  );
  await assertPermissionDenied(
    updateDoc(doc(unverifiedOwnerClient.db, 'users', UNVERIFIED_OWNER_UID), {
      emailVerified: true,
      passwordSetupStatus: 'verified',
      updatedAt: NOW_ISO,
    }),
    'S16 unverified owner denied self metadata update before email verification'
  );

  // Case B: Verified Business Owner can update ONLY permitted auth metadata fields
  await assertAllowed(
    updateDoc(doc(ownerAClient.db, 'users', OWNER_ALPHA_UID), {
      emailVerified: true,
      passwordSetupStatus: 'verified',
      authUidLinked: true,
      updatedAt: NOW_ISO,
    }),
    'S16 verified owner self-sync auth metadata'
  );

  // Denied if trying to tamper with role or permissions alongside metadata update
  await assertPermissionDenied(
    updateDoc(doc(ownerAClient.db, 'users', OWNER_ALPHA_UID), {
      emailVerified: true,
      passwordSetupStatus: 'verified',
      role: 'platform_admin',
      updatedAt: NOW_ISO,
    }),
    'S16 verified owner denied changing role during metadata update'
  );
});

test('S17. Unauthenticated user denied all reads and writes across all collections', async () => {
  await assertPermissionDenied(
    getDoc(doc(unauthedClient.db, 'users', OWNER_ALPHA_UID)),
    'S17 unauth read user'
  );
  await assertPermissionDenied(
    getDoc(doc(unauthedClient.db, 'businesses', BIZ_ALPHA_ID)),
    'S17 unauth read business'
  );
  await assertPermissionDenied(
    getDoc(doc(unauthedClient.db, `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}`)),
    'S17 unauth read shop'
  );
  await assertPermissionDenied(
    getDoc(
      doc(
        unauthedClient.db,
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/${PROD_ALPHA_1_ID}`
      )
    ),
    'S17 unauth read product'
  );
  await assertPermissionDenied(
    getDocs(collection(unauthedClient.db, 'platform_audit_logs')),
    'S17 unauth list platform_audit_logs'
  );
  await assertPermissionDenied(
    setDoc(
      doc(unauthedClient.db, `businesses/${NAMESPACE}-unauth`),
      makeBusinessFixture({
        id: `${NAMESPACE}-unauth`,
        name: 'Unauthorized',
        ownerUserId: OWNER_ALPHA_UID,
        ownerName: 'Alpha',
        ownerEmail: `${OWNER_ALPHA_UID}@staging-test.smartmind.local`,
      })
    ),
    'S17 unauth write business'
  );
});

// ============================================================================
// PART B — Production-Reference Scenarios Adapted to Live Staging (P1–P8)
// ============================================================================

test('P1 (Prod Ref #1). Unauthenticated and unverified users are denied operational read/write across tenant collections', async () => {
  const custPath = `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/customers/${NAMESPACE}-cust-p1`;
  const syncPath = `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sync_operations/${NAMESPACE}-sync-p1`;
  for (const [label, ctx] of [
    ['unauthed', unauthedClient],
    ['unverifiedUser', unverifiedUserClient],
  ] as const) {
    await assertPermissionDenied(
      getDoc(
        doc(
          ctx.db,
          `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/${SALE_ALPHA_COMPLETED_ID}`
        )
      ),
      `P1 ${label} read sale`
    );
    await assertPermissionDenied(
      setDoc(doc(ctx.db, custPath), {
        id: `${NAMESPACE}-cust-p1`,
        shopId: SHOP_ALPHA_1_ID,
        businessId: BIZ_ALPHA_ID,
        fullName: 'Blocked Customer',
        phone: '+2348000000111',
        outstandingBalanceKobo: 0,
        status: 'active',
        schemaVersion: 1,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
      }),
      `P1 ${label} create customer`
    );
    await assertPermissionDenied(
      setDoc(doc(ctx.db, syncPath), {
        id: `${NAMESPACE}-sync-p1`,
        businessId: BIZ_ALPHA_ID,
        shopId: SHOP_ALPHA_1_ID,
        entityType: 'sale',
        entityId: SALE_ALPHA_COMPLETED_ID,
        operationType: 'create',
        actorUserId: UNVERIFIED_USER_UID,
        outcome: 'acknowledged',
        schemaVersion: 1,
        processedAt: NOW_ISO,
      }),
      `P1 ${label} create sync_operation`
    );
  }
});

test('P2 (Prod Ref #2). Cross-tenant & unassigned-shop isolation across customers, sync_operations, and audit_events', async () => {
  await assertPermissionDenied(
    getDocs(
      collection(
        ownerBClient.db,
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/customers`
      )
    ),
    'P2 ownerB list Alpha customers'
  );
  await assertPermissionDenied(
    getDocs(collection(ownerBClient.db, `businesses/${BIZ_ALPHA_ID}/audit_events`)),
    'P2 ownerB list Alpha audit_events'
  );
  await assertPermissionDenied(
    getDocs(
      collection(
        cashierAClient.db,
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_2_ID}/sales`
      )
    ),
    'P2 cashierA list unassigned shop A2 sales'
  );
  await assertPermissionDenied(
    setDoc(
      doc(
        mgrAClient.db,
        `businesses/${BIZ_ALPHA_ID}/audit_events/${NAMESPACE}-evt-a2-deny`
      ),
      {
        id: `${NAMESPACE}-evt-a2-deny`,
        businessId: BIZ_ALPHA_ID,
        shopId: SHOP_ALPHA_2_ID,
        userId: MGR_ALPHA_UID,
        userName: 'Alpha Manager',
        action: 'product_updated',
        entityType: 'product',
        entityId: PROD_ALPHA_1_ID,
        createdAt: NOW_ISO,
      }
    ),
    'P2 mgrA write audit_event for unassigned shop A2'
  );
});

test('P3 (Prod Ref #3). Cashier can record valid sale + item + sale_deduction, but denied discounts, forged cashierUserId, or forged void audits', async () => {
  const validSaleId = `${NAMESPACE}-sale-cash-ok`;
  const validSalePath = `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/${validSaleId}`;
  const validItemPath = `${validSalePath}/items/${NAMESPACE}-item-ok`;
  const validMovPath = `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/inventory_movements/${NAMESPACE}-mov-deduct`;
  adminCtx.tracker.trackFirestoreDoc(validItemPath);
  adminCtx.tracker.trackFirestoreDoc(validMovPath);
  adminCtx.tracker.trackFirestoreDoc(validSalePath);

  await assertAllowed(
    setDoc(
      doc(cashierAClient.db, validSalePath),
      makeSaleFixture({
        id: validSaleId,
        shopId: SHOP_ALPHA_1_ID,
        businessId: BIZ_ALPHA_ID,
        cashierUserId: CASHIER_ALPHA_UID,
        status: 'completed',
      })
    ),
    'P3 cashierA create valid completed sale'
  );
  await assertAllowed(
    setDoc(
      doc(cashierAClient.db, validItemPath),
      makeSaleItemFixture({
        id: `${NAMESPACE}-item-ok`,
        saleId: validSaleId,
        shopId: SHOP_ALPHA_1_ID,
        businessId: BIZ_ALPHA_ID,
        productId: PROD_ALPHA_1_ID,
      })
    ),
    'P3 cashierA create valid sale item'
  );
  await assertAllowed(
    setDoc(
      doc(cashierAClient.db, validMovPath),
      makeInventoryMovementFixture({
        id: `${NAMESPACE}-mov-deduct`,
        shopId: SHOP_ALPHA_1_ID,
        businessId: BIZ_ALPHA_ID,
        productId: PROD_ALPHA_1_ID,
        type: 'sale_deduction',
        quantityDelta: -2,
        previousQuantity: 25,
        newQuantity: 23,
        performedByUserId: CASHIER_ALPHA_UID,
        referenceId: validSaleId,
      })
    ),
    'P3 cashierA create sale_deduction inventory movement'
  );

  // Cashier lacks apply_discounts -> discountAmountKobo > 0 rejected
  await assertPermissionDenied(
    setDoc(
      doc(
        cashierAClient.db,
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/${NAMESPACE}-sale-disc-deny`
      ),
      makeSaleFixture({
        id: `${NAMESPACE}-sale-disc-deny`,
        shopId: SHOP_ALPHA_1_ID,
        businessId: BIZ_ALPHA_ID,
        cashierUserId: CASHIER_ALPHA_UID,
        subtotalKobo: 1000000,
        discountAmountKobo: 100000,
        taxAmountKobo: 67500,
        totalAmountKobo: 967500,
      })
    ),
    'P3 cashierA apply unauthorized discount'
  );

  // Forged cashierUserId rejected
  await assertPermissionDenied(
    setDoc(
      doc(
        cashierAClient.db,
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/${NAMESPACE}-sale-forge-deny`
      ),
      makeSaleFixture({
        id: `${NAMESPACE}-sale-forge-deny`,
        shopId: SHOP_ALPHA_1_ID,
        businessId: BIZ_ALPHA_ID,
        cashierUserId: MGR_ALPHA_UID,
      })
    ),
    'P3 cashierA forge cashierUserId'
  );

  // Cashier cannot write privileged audit actions like sale_voided
  await assertPermissionDenied(
    setDoc(
      doc(
        cashierAClient.db,
        `businesses/${BIZ_ALPHA_ID}/audit_events/${NAMESPACE}-evt-void-deny`
      ),
      {
        id: `${NAMESPACE}-evt-void-deny`,
        businessId: BIZ_ALPHA_ID,
        shopId: SHOP_ALPHA_1_ID,
        userId: CASHIER_ALPHA_UID,
        userName: 'Alpha Cashier',
        action: 'sale_voided',
        entityType: 'sale',
        entityId: validSaleId,
        createdAt: NOW_ISO,
      }
    ),
    'P3 cashierA forge sale_voided audit event'
  );
});

test('P4 (Prod Ref #4). Completed sale locks financial math, createdAt, cashierUserId, and existing syncAckId against tampering', async () => {
  const lockedSaleId = `${NAMESPACE}-sale-locked`;
  const lockedSalePath = `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/${lockedSaleId}`;
  adminCtx.tracker.trackFirestoreDoc(lockedSalePath);

  await adminCtx.db.doc(lockedSalePath).set(
    makeSaleFixture({
      id: lockedSaleId,
      shopId: SHOP_ALPHA_1_ID,
      businessId: BIZ_ALPHA_ID,
      cashierUserId: CASHIER_ALPHA_UID,
      status: 'completed',
      syncAckId: 'ack-immutable-01',
    })
  );

  await assertPermissionDenied(
    updateDoc(doc(mgrAClient.db, lockedSalePath), {
      syncAckId: 'ack-tampered-99',
      syncedAt: NOW_ISO,
    }),
    'P4 deny modifying existing syncAckId'
  );
  await assertPermissionDenied(
    updateDoc(doc(mgrAClient.db, lockedSalePath), {
      createdAt: '2020-01-01T00:00:00.000Z',
    }),
    'P4 deny modifying createdAt'
  );
  await assertPermissionDenied(
    updateDoc(doc(mgrAClient.db, lockedSalePath), {
      cashierUserId: OWNER_ALPHA_UID,
    }),
    'P4 deny modifying cashierUserId'
  );

  // Updating syncedAt alone while status stays completed & syncAckId unchanged IS allowed
  await assertAllowed(
    updateDoc(doc(cashierAClient.db, lockedSalePath), {
      syncedAt: new Date().toISOString(),
    }),
    'P4 allow syncedAt acknowledgment update on completed sale'
  );
});

test('P5 (Prod Ref #5). Manager granular permissions enforced and product deletion stays restricted to Business Owner', async () => {
  const limitedProdId = `${NAMESPACE}-prod-lim-deny`;
  await assertPermissionDenied(
    setDoc(
      doc(
        mgrLimitedClient.db,
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/${limitedProdId}`
      ),
      makeProductFixture({
        id: limitedProdId,
        shopId: SHOP_ALPHA_1_ID,
        businessId: BIZ_ALPHA_ID,
      })
    ),
    'P5 limited manager without manage_products denied product create'
  );

  const mgrProdPath = `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/${NAMESPACE}-prod-mgr-ok`;
  adminCtx.tracker.trackFirestoreDoc(mgrProdPath);

  await assertAllowed(
    setDoc(
      doc(mgrAClient.db, mgrProdPath),
      makeProductFixture({
        id: `${NAMESPACE}-prod-mgr-ok`,
        shopId: SHOP_ALPHA_1_ID,
        businessId: BIZ_ALPHA_ID,
      })
    ),
    'P5 full manager creates product'
  );

  // Even a full manager is denied product delete (business_owner only)
  await assertPermissionDenied(
    deleteDoc(doc(mgrAClient.db, mgrProdPath)),
    'P5 manager denied product delete'
  );

  // Business Owner of Tenant Alpha CAN delete product
  await assertAllowed(
    deleteDoc(doc(ownerAClient.db, mgrProdPath)),
    'P5 business_owner deletes product'
  );
});

test('P6 (Prod Ref #6). Platform Admin governance restricted to verified staging admin & separated from operational collections', async () => {
  // Non-admin email cannot create platform_provisioning_keys or audit logs or businesses
  await assertPermissionDenied(
    setDoc(
      doc(ownerAClient.db, 'businesses', `${NAMESPACE}-owner-create-biz-deny`),
      makeBusinessFixture({
        id: `${NAMESPACE}-owner-create-biz-deny`,
        name: 'Unauthorized Biz',
        ownerUserId: OWNER_ALPHA_UID,
        ownerName: 'Alpha Owner',
        ownerEmail: `${OWNER_ALPHA_UID}@staging-test.smartmind.local`,
      })
    ),
    'P6 non-admin owner denied creating business'
  );

  // Staging Platform Admin denied operational writes on customers & sync_operations
  await assertPermissionDenied(
    setDoc(
      doc(
        adminClient.db,
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/customers/${NAMESPACE}-adm-cust-deny`
      ),
      {
        id: `${NAMESPACE}-adm-cust-deny`,
        shopId: SHOP_ALPHA_1_ID,
        businessId: BIZ_ALPHA_ID,
        fullName: 'Admin Should Not Create',
        phone: '+2348000000222',
        outstandingBalanceKobo: 0,
        status: 'active',
        schemaVersion: 1,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
      }
    ),
    'P6 platform admin denied direct customer create'
  );
  await assertPermissionDenied(
    setDoc(
      doc(
        adminClient.db,
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sync_operations/${NAMESPACE}-adm-sync-deny`
      ),
      {
        id: `${NAMESPACE}-adm-sync-deny`,
        businessId: BIZ_ALPHA_ID,
        shopId: SHOP_ALPHA_1_ID,
        entityType: 'sale',
        entityId: SALE_ALPHA_COMPLETED_ID,
        operationType: 'create',
        actorUserId: STAGING_ADMIN_UID,
        outcome: 'acknowledged',
        schemaVersion: 1,
        processedAt: NOW_ISO,
      }
    ),
    'P6 platform admin denied direct sync_operation create'
  );
});

test('P7 (Prod Ref #7). Quarantined business, shop, demo, and all 4 pre-Firebase sale/sync IDs are blocked', async () => {
  await assertPermissionDenied(
    setDoc(
      doc(adminClient.db, 'businesses/biz-0003-u42w'),
      makeBusinessFixture({
        id: 'biz-0003-u42w',
        name: 'Quarantined Biz',
        ownerUserId: OWNER_ALPHA_UID,
        ownerName: 'Alpha Owner',
        ownerEmail: `${OWNER_ALPHA_UID}@staging-test.smartmind.local`,
      })
    ),
    'P7 block quarantined biz-0003-u42w'
  );
  await assertPermissionDenied(
    setDoc(
      doc(ownerAClient.db, `businesses/${BIZ_ALPHA_ID}/shops/shop-0005-9i6p`),
      makeShopFixture({
        id: 'shop-0005-9i6p',
        businessId: BIZ_ALPHA_ID,
        code: 'Q-01',
        name: 'Quarantined Shop',
      })
    ),
    'P7 block quarantined shop-0005-9i6p'
  );
  await assertPermissionDenied(
    setDoc(
      doc(adminClient.db, 'businesses/biz-emerald-01'),
      makeBusinessFixture({
        id: 'biz-emerald-01',
        name: 'Demo Biz',
        ownerUserId: OWNER_ALPHA_UID,
        ownerName: 'Alpha Owner',
        ownerEmail: `${OWNER_ALPHA_UID}@staging-test.smartmind.local`,
      })
    ),
    'P7 block demo biz-emerald-01'
  );

  const quarantinedSaleIds = [
    'sale-1792837064449-h1dw',
    'sale-1792840077667-3knj',
    'sale-1792840085221-qjdb',
    'sale-1792840089845-kc84',
  ];
  for (const saleId of quarantinedSaleIds) {
    await assertPermissionDenied(
      setDoc(
        doc(
          cashierAClient.db,
          `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/${saleId}`
        ),
        makeSaleFixture({
          id: saleId,
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
          cashierUserId: CASHIER_ALPHA_UID,
        })
      ),
      `P7 block quarantined ${saleId}`
    );
  }

  const quarantinedSyncIds = [
    'sync-sale-1792837064449-h1dw',
    'sync-sale-1792840077667-3knj',
    'sync-sale-1792840085221-qjdb',
    'sync-sale-1792840089845-kc84',
  ];
  for (const syncId of quarantinedSyncIds) {
    await assertPermissionDenied(
      setDoc(
        doc(
          cashierAClient.db,
          `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sync_operations/${syncId}`
        ),
        {
          id: syncId,
          businessId: BIZ_ALPHA_ID,
          shopId: SHOP_ALPHA_1_ID,
          entityType: 'sale',
          entityId: SALE_ALPHA_COMPLETED_ID,
          operationType: 'create',
          actorUserId: CASHIER_ALPHA_UID,
          outcome: 'acknowledged',
          schemaVersion: 1,
          processedAt: NOW_ISO,
        }
      ),
      `P7 block quarantined ${syncId}`
    );
  }
});

test('P8 (Prod Ref #8). Catch-all denies unrecognized paths and server-only ledgers reject client writes on (default)', async () => {
  // Unrecognized top-level collection
  await assertPermissionDenied(
    getDoc(doc(adminClient.db, 'unrecognized_root_collection', `${NAMESPACE}-doc`)),
    'P8 catch-all admin read unrecognized path'
  );
  await assertPermissionDenied(
    setDoc(doc(ownerAClient.db, 'unrecognized_root_collection', `${NAMESPACE}-doc`), {
      id: `${NAMESPACE}-doc`,
    }),
    'P8 catch-all owner write unrecognized path'
  );

  // Server-only ledgers reject all client writes even by Platform Admin or Business Owner
  await assertPermissionDenied(
    setDoc(doc(adminClient.db, 'platform_provisioning_keys', `${NAMESPACE}-ppk`), {
      id: `${NAMESPACE}-ppk`,
      createdAt: NOW_ISO,
    }),
    'P8 server-only platform_provisioning_keys write denied'
  );
  await assertPermissionDenied(
    setDoc(doc(adminClient.db, 'platform_owner_repair_keys', `${NAMESPACE}-pork`), {
      id: `${NAMESPACE}-pork`,
      createdAt: NOW_ISO,
    }),
    'P8 server-only platform_owner_repair_keys write denied'
  );
  await assertPermissionDenied(
    setDoc(
      doc(
        ownerAClient.db,
        `businesses/${BIZ_ALPHA_ID}/staff_provisioning_keys/${NAMESPACE}-spk`
      ),
      { id: `${NAMESPACE}-spk`, createdAt: NOW_ISO }
    ),
    'P8 server-only staff_provisioning_keys write denied'
  );
  await assertPermissionDenied(
    setDoc(
      doc(
        adminClient.db,
        `businesses/${BIZ_ALPHA_ID}/subscription_events/${NAMESPACE}-sub`
      ),
      { id: `${NAMESPACE}-sub`, createdAt: NOW_ISO }
    ),
    'P8 server-only subscription_events write denied'
  );
});
