/**
 * SmartMind POS — Staging Firestore Security Rules Emulator Test Suite
 *
 * Target Firebase Project ID: smartmind-pos-staging
 * Target Firestore Database: (default)
 * Rules file loaded: firestore.staging.rules
 * Emulator Port: 8085 (127.0.0.1:8085)
 *
 * IMPORTANT:
 * - Connects strictly to the local Firestore Emulator Suite using @firebase/rules-unit-testing.
 * - Never connects to live Cloud Firestore or any real Firebase project.
 * - Loads the staging security rules directly from firestore.staging.rules.
 * - Seeds isolated test data for two tenants (Alpha and Beta) and tests real authorization rules.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

export const STAGING_PROJECT_ID = 'smartmind-pos-staging';
export const STAGING_ADMIN_EMAIL = 'smart@smartmindconcept.com';
export const UNVERIFIED_ADMIN_EMAIL = 'smart@smartmindconcept.com';
export const UNAUTHORIZED_ADMIN_EMAIL = 'intruder@otherdomain.com';

const DEFAULT_EMULATOR_HOST = '127.0.0.1';
const DEFAULT_EMULATOR_PORT = 8085;

// Canonical test actor UIDs & Tenant IDs
export const ADMIN_UID = 'uid-staging-admin-smart';
export const BIZ_ALPHA_ID = 'biz-live-alpha-01';
export const SHOP_ALPHA_1_ID = 'shop-live-alpha-01';
export const SHOP_ALPHA_2_ID = 'shop-live-alpha-02';
export const OWNER_ALPHA_UID = 'uid-owner-alpha-01';
export const MGR_ALPHA_UID = 'uid-mgr-alpha-01';
export const CASHIER_ALPHA_UID = 'uid-cashier-alpha-01';

export const BIZ_BETA_ID = 'biz-live-beta-02';
export const SHOP_BETA_1_ID = 'shop-live-beta-02';
export const OWNER_BETA_UID = 'uid-owner-beta-02';
export const CASHIER_BETA_UID = 'uid-cashier-beta-02';

const NOW_ISO = '2026-11-04T12:00:00.000Z';

// ============================================================================
// Synthetic Test Fixtures Matching firestore.staging.rules Validators
// ============================================================================

function makeUserProfileFixture(overrides: {
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
  createdAt?: string;
  updatedAt?: string;
}) {
  const payload: Record<string, any> = {
    id: overrides.id,
    businessId: overrides.businessId,
    username: overrides.email.split('@')[0],
    email: overrides.email,
    fullName: overrides.fullName,
    role: overrides.role,
    roleLabel: overrides.roleLabel || overrides.role,
    assignedShopIds: overrides.assignedShopIds ?? [],
    permissions: overrides.permissions ?? [],
    status: overrides.status ?? 'active',
    schemaVersion: 1,
    createdAt: overrides.createdAt ?? NOW_ISO,
    updatedAt: overrides.updatedAt ?? NOW_ISO,
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
  name?: string;
  legalName?: string;
  ownerUserId: string;
  ownerName?: string;
  ownerEmail?: string;
  status?: 'active' | 'suspended';
  createdAt?: string;
  updatedAt?: string;
}) {
  return {
    id: overrides.id,
    name: overrides.name ?? 'Alpha Supermarket Chain',
    legalName: overrides.legalName ?? 'Alpha Retail Ltd',
    businessType: 'Supermarket & Grocery Chain',
    ownerUserId: overrides.ownerUserId,
    ownerName: overrides.ownerName ?? 'Adaeze Alpha',
    ownerEmail: overrides.ownerEmail ?? 'owner@alpha.ng',
    contactEmail: overrides.ownerEmail ?? 'contact@alpha.ng',
    primaryPhone: '+2348030001111',
    headquartersAddress: '12 Admiralty Way, Lekki Phase 1, Lagos',
    currencyCode: 'NGN',
    currencySymbol: '₦',
    defaultTaxRatePercent: 7.5,
    status: overrides.status ?? 'active',
    schemaVersion: 1,
    createdAt: overrides.createdAt ?? NOW_ISO,
    updatedAt: overrides.updatedAt ?? NOW_ISO,
  };
}

function makeShopFixture(overrides: {
  id: string;
  businessId: string;
  code?: string;
  name?: string;
  status?: 'active' | 'inactive' | 'maintenance';
  createdAt?: string;
  updatedAt?: string;
}) {
  return {
    id: overrides.id,
    businessId: overrides.businessId,
    code: overrides.code ?? 'ALP-01',
    name: overrides.name ?? 'Alpha Lekki Branch',
    category: 'Supermarket',
    locationCity: 'Lagos',
    address: '12 Admiralty Way, Lekki',
    phone: '+2348030001111',
    managerName: 'Chidi Manager',
    status: overrides.status ?? 'active',
    terminalId: 'TERM-ALP-01',
    taxRatePercent: 7.5,
    schemaVersion: 1,
    createdAt: overrides.createdAt ?? NOW_ISO,
    updatedAt: overrides.updatedAt ?? NOW_ISO,
  };
}

function makeProductFixture(overrides: {
  id: string;
  shopId: string;
  businessId: string;
  name?: string;
  sku?: string;
  costPriceKobo?: number;
  sellingPriceKobo?: number;
  stockQuantity?: number;
  reorderLevel?: number;
  createdAt?: string;
  updatedAt?: string;
}) {
  return {
    id: overrides.id,
    shopId: overrides.shopId,
    businessId: overrides.businessId,
    categoryId: `cat-${overrides.shopId}-gen`,
    categoryName: 'General Merchandise',
    sku: overrides.sku ?? 'SKU-RICE-50KG',
    barcode: overrides.sku ?? 'SKU-RICE-50KG',
    name: overrides.name ?? 'Royal Parboiled Rice 50kg',
    unit: 'Bag',
    costPriceKobo: overrides.costPriceKobo ?? 6500000,
    sellingPriceKobo: overrides.sellingPriceKobo ?? 7500000,
    stockQuantity: overrides.stockQuantity ?? 25,
    reorderLevel: overrides.reorderLevel ?? 5,
    isActive: true,
    schemaVersion: 1,
    createdAt: overrides.createdAt ?? NOW_ISO,
    updatedAt: overrides.updatedAt ?? NOW_ISO,
  };
}

function makeSaleFixture(overrides: {
  id: string;
  shopId: string;
  businessId: string;
  receiptNumber?: string;
  cashierUserId: string;
  cashierName?: string;
  subtotalKobo?: number;
  discountAmountKobo?: number;
  taxRatePercent?: number;
  taxAmountKobo?: number;
  totalAmountKobo?: number;
  amountTenderedKobo?: number;
  changeDueKobo?: number;
  paymentMethod?: string;
  status?: 'completed' | 'refunded' | 'voided';
  idempotencyKey?: string;
  syncAckId?: string;
  createdAt?: string;
  syncedAt?: string;
}) {
  const subtotalKobo = overrides.subtotalKobo ?? 1000000;
  const discountAmountKobo = overrides.discountAmountKobo ?? 0;
  const taxAmountKobo = overrides.taxAmountKobo ?? 75000;
  const totalAmountKobo =
    overrides.totalAmountKobo ?? subtotalKobo - discountAmountKobo + taxAmountKobo;
  const paymentMethod = overrides.paymentMethod ?? 'cash';
  const amountTenderedKobo =
    overrides.amountTenderedKobo ?? (paymentMethod === 'credit' ? 0 : totalAmountKobo);
  const changeDueKobo =
    overrides.changeDueKobo ??
    (paymentMethod === 'credit' ? 0 : amountTenderedKobo - totalAmountKobo);

  const payload: Record<string, any> = {
    id: overrides.id,
    shopId: overrides.shopId,
    businessId: overrides.businessId,
    receiptNumber: overrides.receiptNumber ?? `RCP-${overrides.id}`,
    terminalId: 'TERM-ALP-01',
    cashierUserId: overrides.cashierUserId,
    cashierName: overrides.cashierName ?? 'Bolanle Cashier',
    subtotalKobo,
    discountAmountKobo,
    taxRatePercent: overrides.taxRatePercent ?? 7.5,
    taxAmountKobo,
    totalAmountKobo,
    amountTenderedKobo,
    changeDueKobo,
    paymentMethod,
    status: overrides.status ?? 'completed',
    idempotencyKey: overrides.idempotencyKey ?? `idem-${overrides.id}`,
    schemaVersion: 1,
    createdAt: overrides.createdAt ?? NOW_ISO,
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
  productId?: string;
  sku?: string;
  productName?: string;
  unitPriceKobo?: number;
  costPriceKobo?: number;
  quantity?: number;
  lineTotalKobo?: number;
  createdAt?: string;
}) {
  const unitPriceKobo = overrides.unitPriceKobo ?? 500000;
  const quantity = overrides.quantity ?? 2;
  const lineTotalKobo = overrides.lineTotalKobo ?? unitPriceKobo * quantity;
  return {
    id: overrides.id,
    saleId: overrides.saleId,
    shopId: overrides.shopId,
    businessId: overrides.businessId,
    productId: overrides.productId ?? 'prod-alpha-01',
    sku: overrides.sku ?? 'SKU-RICE-50KG',
    barcode: overrides.sku ?? 'SKU-RICE-50KG',
    productName: overrides.productName ?? 'Royal Parboiled Rice 50kg',
    unit: 'Bag',
    unitPriceKobo,
    costPriceKobo: overrides.costPriceKobo ?? 400000,
    quantity,
    lineTotalKobo,
    schemaVersion: 1,
    createdAt: overrides.createdAt ?? NOW_ISO,
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
    reason: overrides.reason ?? `Stock movement ${overrides.type} authorized`,
    performedByUserId: overrides.performedByUserId,
    performedByName: overrides.performedByName ?? 'Staff Member',
    schemaVersion: 1,
    createdAt: NOW_ISO,
  };
  if (overrides.referenceId) {
    payload.referenceId = overrides.referenceId;
  }
  return payload;
}

function makePlatformAuditLogFixture(overrides: {
  id: string;
  businessId: string;
  businessName?: string;
  adminUid: string;
  adminEmail: string;
  adminName?: string;
  action: string;
  targetEntityType: 'business' | 'shop' | 'user' | 'product' | 'sale' | 'subscription';
  targetEntityId: string;
  targetEntityName?: string;
  reason: string;
  createdAt?: string;
}) {
  return {
    id: overrides.id,
    businessId: overrides.businessId,
    businessName: overrides.businessName ?? 'Alpha Supermarket Chain',
    adminUid: overrides.adminUid,
    adminEmail: overrides.adminEmail,
    adminName: overrides.adminName ?? 'Platform Administrator',
    action: overrides.action,
    targetEntityType: overrides.targetEntityType,
    targetEntityId: overrides.targetEntityId,
    targetEntityName: overrides.targetEntityName ?? 'Target Entity',
    reason: overrides.reason,
    createdAt: overrides.createdAt ?? NOW_ISO,
  };
}

// ============================================================================
// Multi-Tenant Baseline Document Seeding
// ============================================================================

async function seedStagingMultiTenantFixtures(env: RulesTestEnvironment) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    // 1. Platform Administrator Profile (Bound to sentinel PLATFORM)
    await db.doc(`users/${ADMIN_UID}`).set(
      makeUserProfileFixture({
        id: ADMIN_UID,
        businessId: 'PLATFORM',
        email: STAGING_ADMIN_EMAIL,
        fullName: 'SmartMind Platform Admin',
        role: 'platform_admin',
        roleLabel: 'Platform Administrator',
        assignedShopIds: [],
        permissions: [],
        status: 'active',
        emailVerified: true,
        passwordSetupStatus: 'verified',
        authUidLinked: true,
      })
    );

    // 2. Tenant Alpha (Business, 2 Shops, Owner, Manager, Cashier)
    await db.doc(`businesses/${BIZ_ALPHA_ID}`).set(
      makeBusinessFixture({
        id: BIZ_ALPHA_ID,
        name: 'Alpha Supermarket Chain',
        ownerUserId: OWNER_ALPHA_UID,
        ownerName: 'Adaeze Alpha',
        ownerEmail: 'owner@alpha.ng',
      })
    );

    await db.doc(`businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}`).set(
      makeShopFixture({
        id: SHOP_ALPHA_1_ID,
        businessId: BIZ_ALPHA_ID,
        code: 'ALP-01',
        name: 'Alpha Central Shop',
      })
    );

    await db.doc(`businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_2_ID}`).set(
      makeShopFixture({
        id: SHOP_ALPHA_2_ID,
        businessId: BIZ_ALPHA_ID,
        code: 'ALP-02',
        name: 'Alpha Annex Shop',
      })
    );

    await db.doc(`users/${OWNER_ALPHA_UID}`).set(
      makeUserProfileFixture({
        id: OWNER_ALPHA_UID,
        businessId: BIZ_ALPHA_ID,
        email: 'owner@alpha.ng',
        fullName: 'Adaeze Alpha',
        role: 'business_owner',
        assignedShopIds: [SHOP_ALPHA_1_ID, SHOP_ALPHA_2_ID],
        permissions: [
          'manage_business_settings',
          'manage_shops',
          'manage_staff',
          'view_business_reports',
        ],
        status: 'active',
        emailVerified: true,
        passwordSetupStatus: 'verified',
        authUidLinked: true,
      })
    );

    await db.doc(`users/${MGR_ALPHA_UID}`).set(
      makeUserProfileFixture({
        id: MGR_ALPHA_UID,
        businessId: BIZ_ALPHA_ID,
        email: 'manager@alpha.ng',
        fullName: 'Chidi Manager',
        role: 'shop_manager',
        assignedShopIds: [SHOP_ALPHA_1_ID],
        permissions: [
          'process_sales',
          'manage_products',
          'adjust_inventory',
          'process_returns',
          'process_refunds',
        ],
        status: 'active',
        emailVerified: true,
      })
    );

    await db.doc(`users/${CASHIER_ALPHA_UID}`).set(
      makeUserProfileFixture({
        id: CASHIER_ALPHA_UID,
        businessId: BIZ_ALPHA_ID,
        email: 'cashier@alpha.ng',
        fullName: 'Bolanle Cashier',
        role: 'cashier',
        assignedShopIds: [SHOP_ALPHA_1_ID],
        permissions: ['process_sales'],
        status: 'active',
        emailVerified: true,
      })
    );

    // Product, Sale & Line Item in Shop Alpha 1
    await db
      .doc(`businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/prod-alpha-01`)
      .set(
        makeProductFixture({
          id: 'prod-alpha-01',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
          stockQuantity: 25,
        })
      );

    await db
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-01`
      )
      .set(
        makeSaleFixture({
          id: 'sale-alpha-completed-01',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
          cashierUserId: CASHIER_ALPHA_UID,
          status: 'completed',
          syncAckId: 'ack-init-seed-01',
        })
      );

    await db
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-01/items/item-alpha-01`
      )
      .set(
        makeSaleItemFixture({
          id: 'item-alpha-01',
          saleId: 'sale-alpha-completed-01',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
          productId: 'prod-alpha-01',
        })
      );

    // 3. Tenant Beta (Business, 1 Shop, Owner, Cashier, Product, Sale)
    await db.doc(`businesses/${BIZ_BETA_ID}`).set(
      makeBusinessFixture({
        id: BIZ_BETA_ID,
        name: 'Beta Healthcare Pharmacy',
        ownerUserId: OWNER_BETA_UID,
        ownerName: 'Tunde Beta',
        ownerEmail: 'owner@beta.ng',
      })
    );

    await db.doc(`businesses/${BIZ_BETA_ID}/shops/${SHOP_BETA_1_ID}`).set(
      makeShopFixture({
        id: SHOP_BETA_1_ID,
        businessId: BIZ_BETA_ID,
        code: 'BET-01',
        name: 'Beta Abuja Branch',
      })
    );

    await db.doc(`users/${OWNER_BETA_UID}`).set(
      makeUserProfileFixture({
        id: OWNER_BETA_UID,
        businessId: BIZ_BETA_ID,
        email: 'owner@beta.ng',
        fullName: 'Tunde Beta',
        role: 'business_owner',
        assignedShopIds: [SHOP_BETA_1_ID],
        permissions: ['manage_business_settings', 'manage_shops', 'manage_staff'],
        status: 'active',
        emailVerified: true,
      })
    );

    await db.doc(`users/${CASHIER_BETA_UID}`).set(
      makeUserProfileFixture({
        id: CASHIER_BETA_UID,
        businessId: BIZ_BETA_ID,
        email: 'cashier@beta.ng',
        fullName: 'Kemi Beta Cashier',
        role: 'cashier',
        assignedShopIds: [SHOP_BETA_1_ID],
        permissions: ['process_sales'],
        status: 'active',
        emailVerified: true,
      })
    );

    await db
      .doc(`businesses/${BIZ_BETA_ID}/shops/${SHOP_BETA_1_ID}/products/prod-beta-01`)
      .set(
        makeProductFixture({
          id: 'prod-beta-01',
          shopId: SHOP_BETA_1_ID,
          businessId: BIZ_BETA_ID,
          name: 'Paracetamol 500mg',
          sku: 'SKU-PARA-500',
        })
      );

    await db
      .doc(`businesses/${BIZ_BETA_ID}/shops/${SHOP_BETA_1_ID}/sales/sale-beta-completed-01`)
      .set(
        makeSaleFixture({
          id: 'sale-beta-completed-01',
          shopId: SHOP_BETA_1_ID,
          businessId: BIZ_BETA_ID,
          cashierUserId: CASHIER_BETA_UID,
          status: 'completed',
        })
      );
  });
}

// ============================================================================
// Test Lifecycle Hooks & Port Auto-Detection
// ============================================================================

let testEnv: RulesTestEnvironment;
let emulatorHost = DEFAULT_EMULATOR_HOST;
let emulatorPort = DEFAULT_EMULATOR_PORT;

async function isPortReachable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const cleanup = () => {
      socket.destroy();
      resolve(false);
    };
    socket.setTimeout(1200);
    socket.once('error', cleanup);
    socket.once('timeout', cleanup);
    socket.connect(port, host, () => {
      socket.end();
      resolve(true);
    });
  });
}

before(async () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.staging.rules');
  if (!fs.existsSync(rulesPath)) {
    throw new Error(`MISSING_RULES_FILE: firestore.staging.rules not found at ${rulesPath}`);
  }
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  // Verify that staging rules contain the expected platform admin audit log rule
  assert.ok(
    rulesContent.includes('isValidPlatformAdminAuditLog'),
    'firestore.staging.rules must declare isValidPlatformAdminAuditLog validator'
  );

  // Probe environment or candidate ports (8085 default for staging emulator)
  const envHost = process.env.FIRESTORE_EMULATOR_HOST;
  if (envHost && envHost.includes(':')) {
    const [h, p] = envHost.split(':');
    emulatorHost = h === 'localhost' ? '127.0.0.1' : h;
    emulatorPort = Number(p);
  } else {
    const reachable = await isPortReachable(DEFAULT_EMULATOR_HOST, DEFAULT_EMULATOR_PORT);
    if (!reachable) {
      throw new Error(
        `FIRESTORE_EMULATOR_NOT_RUNNING: Local Firestore Emulator is not reachable at ${DEFAULT_EMULATOR_HOST}:${DEFAULT_EMULATOR_PORT}. ` +
          `Execute via: npm run test:firestore:rules (which launches firebase emulators:exec) or run: ` +
          `firebase emulators:start --only firestore --config firebase.staging.json --project ${STAGING_PROJECT_ID}`
      );
    }
  }

  testEnv = await initializeTestEnvironment({
    projectId: STAGING_PROJECT_ID,
    firestore: {
      host: emulatorHost,
      port: emulatorPort,
      rules: rulesContent,
    },
  });
});

beforeEach(async () => {
  if (testEnv) {
    await testEnv.clearFirestore();
    await seedStagingMultiTenantFixtures(testEnv);
  }
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

function getAuthedDb(uid: string, email: string, emailVerified = true) {
  return testEnv
    .authenticatedContext(uid, {
      email,
      email_verified: emailVerified,
    })
    .firestore();
}

function getUnauthedDb() {
  return testEnv.unauthenticatedContext().firestore();
}

// ============================================================================
// TEST SUITE: Genuine Firestore Security Rules Execution on Emulator
// ============================================================================

test('1. Platform Admin can list all businesses; Business owners cannot list all businesses', async () => {
  const adminDb = getAuthedDb(ADMIN_UID, STAGING_ADMIN_EMAIL, true);
  const ownerADb = getAuthedDb(OWNER_ALPHA_UID, 'owner@alpha.ng', true);
  const ownerBDb = getAuthedDb(OWNER_BETA_UID, 'owner@beta.ng', true);

  // Positive: Verified Platform Admin can query/list all businesses globally
  await assertSucceeds(adminDb.collection('businesses').get());

  // Negative: Tenant business owners are strictly blocked from listing all businesses
  await assertFails(ownerADb.collection('businesses').get());
  await assertFails(ownerBDb.collection('businesses').get());
});

test('2. Tenant isolation: Business A cannot access Business B records', async () => {
  const ownerADb = getAuthedDb(OWNER_ALPHA_UID, 'owner@alpha.ng', true);

  // Positive: Owner A can read own business, shops, products, and sales
  await assertSucceeds(ownerADb.doc(`businesses/${BIZ_ALPHA_ID}`).get());
  await assertSucceeds(
    ownerADb.doc(`businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}`).get()
  );
  await assertSucceeds(
    ownerADb
      .doc(`businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/prod-alpha-01`)
      .get()
  );
  await assertSucceeds(
    ownerADb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-01`
      )
      .get()
  );

  // Negative: Owner A is denied reading or writing Business B records
  await assertFails(ownerADb.doc(`businesses/${BIZ_BETA_ID}`).get());
  await assertFails(
    ownerADb.doc(`businesses/${BIZ_BETA_ID}/shops/${SHOP_BETA_1_ID}`).get()
  );
  await assertFails(
    ownerADb
      .doc(`businesses/${BIZ_BETA_ID}/shops/${SHOP_BETA_1_ID}/products/prod-beta-01`)
      .get()
  );
  await assertFails(
    ownerADb
      .doc(`businesses/${BIZ_BETA_ID}/shops/${SHOP_BETA_1_ID}/sales/sale-beta-completed-01`)
      .get()
  );
  await assertFails(
    ownerADb
      .doc(`businesses/${BIZ_BETA_ID}/shops/${SHOP_BETA_1_ID}/products/prod-intruder`)
      .set(
        makeProductFixture({
          id: 'prod-intruder',
          shopId: SHOP_BETA_1_ID,
          businessId: BIZ_BETA_ID,
        })
      )
  );
});

test('3. Shop isolation: Shop A manager cannot access Shop B or unassigned Shop A2', async () => {
  const mgrADb = getAuthedDb(MGR_ALPHA_UID, 'manager@alpha.ng', true);

  // Positive: Manager A can read assigned Shop Alpha 1
  await assertSucceeds(
    mgrADb.doc(`businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}`).get()
  );
  await assertSucceeds(
    mgrADb
      .doc(`businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/prod-alpha-01`)
      .get()
  );

  // Negative: Manager A is denied accessing unassigned Shop Alpha 2 in same business
  await assertFails(
    mgrADb.doc(`businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_2_ID}`).get()
  );
  await assertFails(
    mgrADb
      .doc(`businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_2_ID}/products/prod-alpha-02`)
      .set(
        makeProductFixture({
          id: 'prod-alpha-02',
          shopId: SHOP_ALPHA_2_ID,
          businessId: BIZ_ALPHA_ID,
        })
      )
  );

  // Negative: Manager A is denied accessing other tenant Shop Beta 1
  await assertFails(
    mgrADb.doc(`businesses/${BIZ_BETA_ID}/shops/${SHOP_BETA_1_ID}`).get()
  );
});

test('4. Cashier restrictions: Cashier cannot modify unauthorized inventory or stock', async () => {
  const cashierADb = getAuthedDb(CASHIER_ALPHA_UID, 'cashier@alpha.ng', true);

  // Negative: Cashier cannot directly update product catalog stock
  await assertFails(
    cashierADb
      .doc(`businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/prod-alpha-01`)
      .update({
        stockQuantity: 999,
        updatedAt: NOW_ISO,
      })
  );

  // Negative: Cashier cannot create restock or damage stock adjustments
  await assertFails(
    cashierADb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/inventory_movements/mov-cashier-denied`
      )
      .set(
        makeInventoryMovementFixture({
          id: 'mov-cashier-denied',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
          productId: 'prod-alpha-01',
          type: 'restock',
          quantityDelta: 10,
          previousQuantity: 25,
          newQuantity: 35,
          performedByUserId: CASHIER_ALPHA_UID,
        })
      )
  );

  // Positive: Cashier CAN record valid checkout sale_deduction movement
  await assertSucceeds(
    cashierADb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/inventory_movements/mov-sale-deduct-01`
      )
      .set(
        makeInventoryMovementFixture({
          id: 'mov-sale-deduct-01',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
          productId: 'prod-alpha-01',
          type: 'sale_deduction',
          quantityDelta: -2,
          previousQuantity: 25,
          newQuantity: 23,
          performedByUserId: CASHIER_ALPHA_UID,
          referenceId: 'sale-alpha-completed-01',
        })
      )
  );
});

test('5. Privilege escalation blocked: Ordinary users cannot modify their own roles or permissions', async () => {
  const cashierADb = getAuthedDb(CASHIER_ALPHA_UID, 'cashier@alpha.ng', true);
  const mgrADb = getAuthedDb(MGR_ALPHA_UID, 'manager@alpha.ng', true);
  const ownerADb = getAuthedDb(OWNER_ALPHA_UID, 'owner@alpha.ng', true);

  // Negative: Cashier cannot promote self to shop_manager or business_owner
  await assertFails(
    cashierADb.doc(`users/${CASHIER_ALPHA_UID}`).update({
      role: 'shop_manager',
      updatedAt: NOW_ISO,
    })
  );
  await assertFails(
    cashierADb.doc(`users/${CASHIER_ALPHA_UID}`).update({
      permissions: ['process_sales', 'manage_products', 'adjust_inventory'],
      updatedAt: NOW_ISO,
    })
  );

  // Negative: Manager cannot promote self to business_owner
  await assertFails(
    mgrADb.doc(`users/${MGR_ALPHA_UID}`).update({
      role: 'business_owner',
      updatedAt: NOW_ISO,
    })
  );

  // Negative: Business owner cannot promote self to platform_admin
  await assertFails(
    ownerADb.doc(`users/${OWNER_ALPHA_UID}`).update({
      role: 'platform_admin',
      updatedAt: NOW_ISO,
    })
  );
});

test('6. Unverified Platform Admin cannot access global administration', async () => {
  const unverifiedAdminDb = getAuthedDb(ADMIN_UID, STAGING_ADMIN_EMAIL, false);

  // Negative: Unverified email token (email_verified == false) is rejected for global listing and documents
  await assertFails(unverifiedAdminDb.collection('businesses').get());
  await assertFails(unverifiedAdminDb.doc(`businesses/${BIZ_ALPHA_ID}`).get());
  await assertFails(
    unverifiedAdminDb.doc(`platform_audit_logs/log-unverified-admin`).set(
      makePlatformAuditLogFixture({
        id: 'log-unverified-admin',
        businessId: BIZ_ALPHA_ID,
        adminUid: ADMIN_UID,
        adminEmail: STAGING_ADMIN_EMAIL,
        action: 'business_suspended',
        targetEntityType: 'business',
        targetEntityId: BIZ_ALPHA_ID,
        reason: 'Attempted from unverified session',
      })
    )
  );
});

test('7. A forged platform_admin role or unauthorized email cannot grant administrator privileges', async () => {
  const imposterUid = 'uid-imposter-user';
  const imposterDb = getAuthedDb(imposterUid, UNAUTHORIZED_ADMIN_EMAIL, true);

  // Negative: Imposter cannot self-assign platform_admin profile
  await assertFails(
    imposterDb.doc(`users/${imposterUid}`).set(
      makeUserProfileFixture({
        id: imposterUid,
        businessId: 'PLATFORM',
        email: UNAUTHORIZED_ADMIN_EMAIL,
        fullName: 'Imposter Admin',
        role: 'platform_admin',
      })
    )
  );

  // Negative: Imposter cannot list or read businesses
  await assertFails(imposterDb.collection('businesses').get());
  await assertFails(imposterDb.doc(`businesses/${BIZ_ALPHA_ID}`).get());
});

test('8. Authorized Platform Admin can perform permitted administrative operations', async () => {
  const adminDb = getAuthedDb(ADMIN_UID, STAGING_ADMIN_EMAIL, true);

  // Positive: Admin can read across all tenant collections
  await assertSucceeds(adminDb.doc(`businesses/${BIZ_ALPHA_ID}`).get());
  await assertSucceeds(adminDb.doc(`businesses/${BIZ_BETA_ID}`).get());
  await assertSucceeds(
    adminDb.doc(`businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}`).get()
  );
  await assertSucceeds(
    adminDb
      .doc(`businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/prod-alpha-01`)
      .get()
  );
  await assertSucceeds(
    adminDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-01`
      )
      .get()
  );

  // Positive: Admin can update business status to suspended
  await assertSucceeds(
    adminDb.doc(`businesses/${BIZ_ALPHA_ID}`).update({
      status: 'suspended',
      updatedAt: '2026-11-04T12:05:00.000Z',
    })
  );

  // Positive: Admin can adjust inventory stock via inventory_movement
  await assertSucceeds(
    adminDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/inventory_movements/mov-admin-correction-01`
      )
      .set(
        makeInventoryMovementFixture({
          id: 'mov-admin-correction-01',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
          productId: 'prod-alpha-01',
          type: 'audit_correction',
          quantityDelta: 15,
          previousQuantity: 25,
          newQuantity: 40,
          reason: 'Physical shelf count adjustment by Platform Administrator',
          performedByUserId: ADMIN_UID,
          performedByName: 'Platform Administrator',
        })
      )
  );

  // Positive: Admin can update product catalog stock directly
  await assertSucceeds(
    adminDb
      .doc(`businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/prod-alpha-01`)
      .update({
        stockQuantity: 40,
        updatedAt: '2026-11-04T12:06:00.000Z',
      })
  );

  // Positive: Admin can void a completed sale
  await assertSucceeds(
    adminDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-01`
      )
      .update({
        status: 'voided',
        syncedAt: '2026-11-04T12:07:00.000Z',
      })
  );
});

test('9. Platform Admin audit logs allow creation but reject modification and deletion', async () => {
  const adminDb = getAuthedDb(ADMIN_UID, STAGING_ADMIN_EMAIL, true);
  const logRef = adminDb.doc('platform_audit_logs/log-admin-valid-01');

  // Positive: Admin can create an immutable audit record with valid fields and mandatory reason
  await assertSucceeds(
    logRef.set(
      makePlatformAuditLogFixture({
        id: 'log-admin-valid-01',
        businessId: BIZ_ALPHA_ID,
        adminUid: ADMIN_UID,
        adminEmail: STAGING_ADMIN_EMAIL,
        action: 'business_suspended',
        targetEntityType: 'business',
        targetEntityId: BIZ_ALPHA_ID,
        reason: 'Temporary suspension pending license renewal verification',
      })
    )
  );

  // Negative: Audit log update is strictly denied
  await assertFails(
    logRef.update({
      reason: 'Tampered reason attempt',
    })
  );

  // Negative: Audit log deletion is strictly denied
  await assertFails(logRef.delete());
});

test('10. Unauthorized users cannot create or read global platform audit logs', async () => {
  const ownerADb = getAuthedDb(OWNER_ALPHA_UID, 'owner@alpha.ng', true);
  const cashierADb = getAuthedDb(CASHIER_ALPHA_UID, 'cashier@alpha.ng', true);
  const unauthedDb = getUnauthedDb();

  // Negative: Business owner, cashier, and anonymous users cannot write to platform_audit_logs
  await assertFails(
    ownerADb.doc('platform_audit_logs/log-owner-attempt').set(
      makePlatformAuditLogFixture({
        id: 'log-owner-attempt',
        businessId: BIZ_ALPHA_ID,
        adminUid: OWNER_ALPHA_UID,
        adminEmail: 'owner@alpha.ng',
        action: 'business_suspended',
        targetEntityType: 'business',
        targetEntityId: BIZ_ALPHA_ID,
        reason: 'Owner attempting to write audit log',
      })
    )
  );

  await assertFails(
    cashierADb.doc('platform_audit_logs/log-cashier-attempt').set(
      makePlatformAuditLogFixture({
        id: 'log-cashier-attempt',
        businessId: BIZ_ALPHA_ID,
        adminUid: CASHIER_ALPHA_UID,
        adminEmail: 'cashier@alpha.ng',
        action: 'user_disabled',
        targetEntityType: 'user',
        targetEntityId: CASHIER_ALPHA_UID,
        reason: 'Cashier attempting to write audit log',
      })
    )
  );

  await assertFails(
    unauthedDb.doc('platform_audit_logs/log-anon-attempt').set(
      makePlatformAuditLogFixture({
        id: 'log-anon-attempt',
        businessId: BIZ_ALPHA_ID,
        adminUid: 'anon',
        adminEmail: 'anon@example.com',
        action: 'user_disabled',
        targetEntityType: 'user',
        targetEntityId: 'anon',
        reason: 'Anonymous audit log attempt',
      })
    )
  );

  // Negative: Non-admin users cannot read or list platform audit logs
  await assertFails(ownerADb.collection('platform_audit_logs').get());
  await assertFails(cashierADb.collection('platform_audit_logs').get());
});

test('11. Invalid audit records are rejected (schema validation & reason requirements)', async () => {
  const adminDb = getAuthedDb(ADMIN_UID, STAGING_ADMIN_EMAIL, true);

  // Negative: Missing mandatory reason (empty or 1 character)
  await assertFails(
    adminDb.doc('platform_audit_logs/log-bad-reason').set({
      id: 'log-bad-reason',
      businessId: BIZ_ALPHA_ID,
      businessName: 'Alpha Supermarket Chain',
      adminUid: ADMIN_UID,
      adminEmail: STAGING_ADMIN_EMAIL,
      adminName: 'Platform Admin',
      action: 'business_suspended',
      targetEntityType: 'business',
      targetEntityId: BIZ_ALPHA_ID,
      targetEntityName: 'Alpha Supermarket',
      reason: 'x', // Too short (must be >= 2 characters)
      createdAt: NOW_ISO,
    })
  );

  // Negative: adminUid mismatch with request.auth.uid
  await assertFails(
    adminDb.doc('platform_audit_logs/log-uid-mismatch').set(
      makePlatformAuditLogFixture({
        id: 'log-uid-mismatch',
        businessId: BIZ_ALPHA_ID,
        adminUid: 'uid-spoofed-other-admin',
        adminEmail: STAGING_ADMIN_EMAIL,
        action: 'business_suspended',
        targetEntityType: 'business',
        targetEntityId: BIZ_ALPHA_ID,
        reason: 'Valid reason here',
      })
    )
  );

  // Negative: adminEmail mismatch with authorized staging email
  await assertFails(
    adminDb.doc('platform_audit_logs/log-email-mismatch').set(
      makePlatformAuditLogFixture({
        id: 'log-email-mismatch',
        businessId: BIZ_ALPHA_ID,
        adminUid: ADMIN_UID,
        adminEmail: 'other-email@domain.com',
        action: 'business_suspended',
        targetEntityType: 'business',
        targetEntityId: BIZ_ALPHA_ID,
        reason: 'Valid reason here',
      })
    )
  );
});

test('12. Completed sales cannot be deleted by any role', async () => {
  const adminDb = getAuthedDb(ADMIN_UID, STAGING_ADMIN_EMAIL, true);
  const ownerADb = getAuthedDb(OWNER_ALPHA_UID, 'owner@alpha.ng', true);
  const mgrADb = getAuthedDb(MGR_ALPHA_UID, 'manager@alpha.ng', true);
  const cashierADb = getAuthedDb(CASHIER_ALPHA_UID, 'cashier@alpha.ng', true);

  const salePath = `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-01`;

  // Negative: Deletion of completed sale is strictly forbidden for all roles
  await assertFails(adminDb.doc(salePath).delete());
  await assertFails(ownerADb.doc(salePath).delete());
  await assertFails(mgrADb.doc(salePath).delete());
  await assertFails(cashierADb.doc(salePath).delete());
});

test('13. Completed sale line items cannot be modified or deleted by any role', async () => {
  const adminDb = getAuthedDb(ADMIN_UID, STAGING_ADMIN_EMAIL, true);
  const ownerADb = getAuthedDb(OWNER_ALPHA_UID, 'owner@alpha.ng', true);
  const mgrADb = getAuthedDb(MGR_ALPHA_UID, 'manager@alpha.ng', true);

  const itemPath = `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-01/items/item-alpha-01`;

  // Negative: Line item modification is denied
  await assertFails(
    adminDb.doc(itemPath).update({
      quantity: 1,
      lineTotalKobo: 500000,
    })
  );
  await assertFails(
    ownerADb.doc(itemPath).update({
      unitPriceKobo: 250000,
      lineTotalKobo: 500000,
    })
  );

  // Negative: Line item deletion is denied
  await assertFails(adminDb.doc(itemPath).delete());
  await assertFails(ownerADb.doc(itemPath).delete());
  await assertFails(mgrADb.doc(itemPath).delete());
});

test('14. Only permitted status transitions can be made on completed sales (financial values locked)', async () => {
  const mgrADb = getAuthedDb(MGR_ALPHA_UID, 'manager@alpha.ng', true);
  const ownerADb = getAuthedDb(OWNER_ALPHA_UID, 'owner@alpha.ng', true);
  const salePath = `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-01`;

  // Negative: Manager cannot alter financial totals or change cashier during refund
  await assertFails(
    mgrADb.doc(salePath).update({
      status: 'refunded',
      totalAmountKobo: 500000, // Altering financial amount is forbidden!
      syncedAt: '2026-11-04T12:10:00.000Z',
    })
  );

  // Negative: Transitioning to invalid status like 'draft' or 'cancelled' is denied
  await assertFails(
    ownerADb.doc(salePath).update({
      status: 'draft',
      syncedAt: '2026-11-04T12:10:00.000Z',
    })
  );

  // Positive: Manager with process_refunds can transition status to 'refunded' without altering financial fields
  await assertSucceeds(
    mgrADb.doc(salePath).update({
      status: 'refunded',
      syncedAt: '2026-11-04T12:10:00.000Z',
    })
  );
});

test('15. Administrative reason requirements are enforced for inventory movements and audit records', async () => {
  const adminDb = getAuthedDb(ADMIN_UID, STAGING_ADMIN_EMAIL, true);

  // Negative: Inventory movement with empty reason is rejected
  await assertFails(
    adminDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/inventory_movements/mov-no-reason`
      )
      .set(
        makeInventoryMovementFixture({
          id: 'mov-no-reason',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
          productId: 'prod-alpha-01',
          type: 'audit_correction',
          quantityDelta: 5,
          previousQuantity: 25,
          newQuantity: 30,
          reason: '', // Empty reason forbidden
          performedByUserId: ADMIN_UID,
        })
      )
  );

  // Positive: Inventory movement with valid reason is accepted
  await assertSucceeds(
    adminDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/inventory_movements/mov-valid-reason`
      )
      .set(
        makeInventoryMovementFixture({
          id: 'mov-valid-reason',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
          productId: 'prod-alpha-01',
          type: 'audit_correction',
          quantityDelta: 5,
          previousQuantity: 25,
          newQuantity: 30,
          reason: 'Periodic inventory recount confirmed 30 units on shelf',
          performedByUserId: ADMIN_UID,
        })
      )
  );
});

test('16. Existing owner authentication synchronization permissions remain intact', async () => {
  // Test case A: Unverified Business Owner can read their own profile (isSelfUserRead)
  const unverifiedOwnerDb = getAuthedDb(OWNER_ALPHA_UID, 'owner@alpha.ng', false);
  await assertSucceeds(unverifiedOwnerDb.doc(`users/${OWNER_ALPHA_UID}`).get());

  // Test case B: Unverified Business Owner cannot read other users
  await assertFails(unverifiedOwnerDb.doc(`users/${CASHIER_ALPHA_UID}`).get());

  // Test case C: Verified Business Owner can update own auth metadata (isBusinessOwnerSelfAuthMetadataUpdate)
  const verifiedOwnerDb = getAuthedDb(OWNER_ALPHA_UID, 'owner@alpha.ng', true);
  await assertSucceeds(
    verifiedOwnerDb.doc(`users/${OWNER_ALPHA_UID}`).update({
      emailVerified: true,
      passwordSetupStatus: 'verified',
      authUidLinked: true,
      updatedAt: '2026-11-04T12:15:00.000Z',
    })
  );

  // Test case D: Verified Business Owner cannot modify own role during auth metadata update
  await assertFails(
    verifiedOwnerDb.doc(`users/${OWNER_ALPHA_UID}`).update({
      emailVerified: true,
      passwordSetupStatus: 'verified',
      authUidLinked: true,
      role: 'platform_admin',
      updatedAt: '2026-11-04T12:15:00.000Z',
    })
  );
});

test('17. Unauthenticated user denied all reads and writes across all collections', async () => {
  const unauthedDb = getUnauthedDb();

  await assertFails(unauthedDb.doc(`users/${ADMIN_UID}`).get());
  await assertFails(unauthedDb.doc(`businesses/${BIZ_ALPHA_ID}`).get());
  await assertFails(
    unauthedDb.doc(`businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}`).get()
  );
  await assertFails(
    unauthedDb
      .doc(`businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/prod-alpha-01`)
      .get()
  );
  await assertFails(
    unauthedDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-01`
      )
      .get()
  );
  await assertFails(unauthedDb.collection('platform_audit_logs').get());

  await assertFails(
    unauthedDb.doc(`businesses/${BIZ_ALPHA_ID}`).update({
      name: 'Hacked Business',
    })
  );
});
