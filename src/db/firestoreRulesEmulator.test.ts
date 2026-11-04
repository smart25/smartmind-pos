/**
 * SmartMind POS — Local Firestore Emulator Security Rules Test Suite
 *
 * Target Project ID: gen-lang-client-0985802946
 * Target Named Firestore Database ID: ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4
 * Local Firestore Emulator Endpoint: 127.0.0.1:8085 (also auto-detects 8080 or FIRESTORE_EMULATOR_HOST)
 *
 * IMPORTANT:
 * - Connects strictly to the local Firestore Emulator using synthetic test data.
 * - Never uses production credentials or connects to production Cloud Firestore.
 * - Loads the project's actual `firestore.rules` file from disk and verifies that
 *   all SEC-01 through SEC-11 hardening rules are present before running tests.
 * - Tests both the standard RulesTestEnvironment context and the explicit named
 *   Firestore database (`ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4`).
 *
 * Run on Windows via:
 *   npm run test:rules
 * or:
 *   npm run test:rules:emulator
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
import { FirebaseApp, deleteApp, initializeApp } from 'firebase/app';
import {
  collection as modularCollection,
  connectFirestoreEmulator,
  deleteDoc as modularDeleteDoc,
  doc as modularDoc,
  getDoc as modularGetDoc,
  getDocs as modularGetDocs,
  getFirestore,
  setDoc as modularSetDoc,
  updateDoc as modularUpdateDoc,
} from 'firebase/firestore';

export const TARGET_FIREBASE_PROJECT_ID = 'gen-lang-client-0985802946';
export const TARGET_NAMED_DATABASE_ID =
  'ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4';
export const BOOTSTRAP_ADMIN_EMAIL = 'smartnwokolo@gmail.com';
export const UNRECOGNIZED_EMAIL = 's.moronfola@gmail.com';

const DEFAULT_EMULATOR_HOST = '127.0.0.1';
const CANDIDATE_EMULATOR_PORTS = [8085, 8080];

async function isPortReachable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const onError = () => {
      socket.destroy();
      resolve(false);
    };
    socket.setTimeout(1200);
    socket.once('error', onError);
    socket.once('timeout', onError);
    socket.connect(port, host, () => {
      socket.end();
      resolve(true);
    });
  });
}

async function resolveActiveEmulatorEndpoint(
  configuredPort?: number
): Promise<{ host: string; port: number; reachable: boolean }> {
  const envHost = process.env.FIRESTORE_EMULATOR_HOST;
  if (envHost && envHost.includes(':')) {
    const [h, p] = envHost.split(':');
    const parsedPort = Number(p);
    if (h && Number.isInteger(parsedPort) && parsedPort > 0) {
      const normalizedHost = h === 'localhost' ? '127.0.0.1' : h;
      const reachable = await isPortReachable(normalizedHost, parsedPort);
      return { host: normalizedHost, port: parsedPort, reachable };
    }
  }

  const portsToProbe = Array.from(
    new Set([
      ...(typeof configuredPort === 'number' && configuredPort > 0
        ? [configuredPort]
        : []),
      ...CANDIDATE_EMULATOR_PORTS,
    ])
  );

  for (const port of portsToProbe) {
    if (await isPortReachable(DEFAULT_EMULATOR_HOST, port)) {
      return { host: DEFAULT_EMULATOR_HOST, port, reachable: true };
    }
  }

  return {
    host: DEFAULT_EMULATOR_HOST,
    port: configuredPort || CANDIDATE_EMULATOR_PORTS[0],
    reachable: false,
  };
}

// ============================================================================
// Synthetic Fixture Builders Matching `firestore.rules` Schema Validators
// ============================================================================

const NOW_ISO = '2026-10-26T12:00:00.000Z';

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
  createdAt?: string;
  updatedAt?: string;
}) {
  return {
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
}

function makeBusinessFixture(overrides: {
  id: string;
  name?: string;
  ownerUserId: string;
  ownerName?: string;
  ownerEmail?: string;
  status?: 'active' | 'suspended';
  createdAt?: string;
  updatedAt?: string;
}) {
  return {
    id: overrides.id,
    name: overrides.name ?? 'Alpha Retail Supermarket Ltd',
    businessType: 'Supermarket & Grocery Chain',
    ownerUserId: overrides.ownerUserId,
    ownerName: overrides.ownerName ?? 'Adaeze Alpha',
    ownerEmail: overrides.ownerEmail ?? 'owner@alpharetail.ng',
    contactEmail: overrides.ownerEmail ?? 'owner@alpharetail.ng',
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
  createdAt?: string;
  updatedAt?: string;
}) {
  return {
    id: overrides.id,
    shopId: overrides.shopId,
    businessId: overrides.businessId,
    categoryId: `cat-${overrides.shopId}-general`,
    categoryName: 'General Merchandise',
    sku: overrides.sku ?? 'SKU-RICE-50KG',
    barcode: overrides.sku ?? 'SKU-RICE-50KG',
    name: overrides.name ?? 'Royal Parboiled Rice 50kg',
    unit: 'Bag',
    costPriceKobo: overrides.costPriceKobo ?? 6500000,
    sellingPriceKobo: overrides.sellingPriceKobo ?? 7500000,
    stockQuantity: overrides.stockQuantity ?? 20,
    reorderLevel: 5,
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
    overrides.totalAmountKobo ??
    subtotalKobo - discountAmountKobo + taxAmountKobo;
  const paymentMethod = overrides.paymentMethod ?? 'cash';
  const amountTenderedKobo =
    overrides.amountTenderedKobo ??
    (paymentMethod === 'credit' ? 0 : totalAmountKobo);
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
    reason: `Movement reason for ${overrides.type}`,
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

// ============================================================================
// Test Environment Lifecycle & Baseline Tenant Seed Helper
// ============================================================================

let testEnv: RulesTestEnvironment;
let emulatorHost = DEFAULT_EMULATOR_HOST;
let emulatorPort = 8085;
const rulesFilePath = path.resolve(process.cwd(), 'firestore.rules');
const rulesContent = fs.readFileSync(rulesFilePath, 'utf8');
const activeModularApps: FirebaseApp[] = [];

// Canonical test actor UIDs & Business/Shop IDs
const ADMIN_UID = 'uid-platform-admin-smart';
const BIZ_ALPHA_ID = 'biz-live-alpha-01';
const SHOP_ALPHA_1_ID = 'shop-live-alpha-01';
const SHOP_ALPHA_2_ID = 'shop-live-alpha-02';
const OWNER_ALPHA_UID = 'uid-owner-alpha-01';
const MANAGER_ALPHA_UID = 'uid-mgr-alpha-01';
const CASHIER_ALPHA_UID = 'uid-cashier-alpha-01';

const BIZ_BETA_ID = 'biz-live-beta-02';
const SHOP_BETA_1_ID = 'shop-live-beta-02';
const OWNER_BETA_UID = 'uid-owner-beta-02';
const CASHIER_BETA_UID = 'uid-cashier-beta-02';

function assertHardenedRulesLoaded(content: string) {
  const requiredMarkers = [
    'function hasSalesPermission()',
    'function hasDiscountPermission()',
    'function hasRefundOrVoidPermission()',
    'function hasCataloguePermission()',
    'function hasInventoryAdjustmentPermission()',
    'function isPlatformAdminBusinessSentinel(id)',
    'function isValidSaleItem(',
    'function isAssignedShopStaffProfile(',
    'function profileHasPermission(',
  ];
  const missing = requiredMarkers.filter((m) => !content.includes(m));
  if (missing.length > 0) {
    throw new Error(
      `OUTDATED_FIRESTORE_RULES_FILE: The local firestore.rules file at "${rulesFilePath}" is missing required SEC-01..SEC-11 / expression-limit optimization functions (${missing.join(', ')}). ` +
        `Please copy the latest firestore.rules from the AI Studio project into "${rulesFilePath}" before running the emulator tests.`
    );
  }
}

async function seedDatabaseDocuments(db: {
  doc(docPath: string): { set(data: Record<string, any>): Promise<unknown> };
}) {
  // 1. Platform Administrator profile
  await db.doc(`users/${ADMIN_UID}`).set(
    makeUserProfileFixture({
      id: ADMIN_UID,
      businessId: 'PLATFORM',
      email: BOOTSTRAP_ADMIN_EMAIL,
      fullName: 'SmartMind Platform Admin',
      role: 'platform_admin',
      roleLabel: 'Platform Administrator',
      assignedShopIds: [],
      permissions: [],
    })
  );

  // 2. Business Alpha + 2 Shops + Owner, Shop Manager (assigned to shop 1), Cashier (assigned to shop 1)
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
      name: 'Alpha Lekki Branch',
    })
  );

  await db.doc(`businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_2_ID}`).set(
    makeShopFixture({
      id: SHOP_ALPHA_2_ID,
      businessId: BIZ_ALPHA_ID,
      code: 'ALP-02',
      name: 'Alpha Ikeja Branch',
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
        'process_sales',
        'apply_discounts',
        'process_returns',
        'manage_products',
        'manage_categories',
        'adjust_inventory',
        'manage_debt_book',
        'manage_invoices',
      ],
    })
  );

  await db.doc(`users/${MANAGER_ALPHA_UID}`).set(
    makeUserProfileFixture({
      id: MANAGER_ALPHA_UID,
      businessId: BIZ_ALPHA_ID,
      email: 'manager@alpha.ng',
      fullName: 'Chidi Manager',
      role: 'shop_manager',
      assignedShopIds: [SHOP_ALPHA_1_ID],
      permissions: [
        'process_sales',
        'apply_discounts',
        'process_returns',
        'manage_products',
        'manage_categories',
        'adjust_inventory',
        'manage_debt_book',
        'manage_invoices',
      ],
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
    })
  );

  // Seed baseline Product, Completed Sale, and Sale Line Item in Alpha Shop 1
  await db
    .doc(
      `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/prod-alpha-01`
    )
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
        cashierName: 'Bolanle Cashier',
        subtotalKobo: 1000000,
        discountAmountKobo: 0,
        taxRatePercent: 7.5,
        taxAmountKobo: 75000,
        totalAmountKobo: 1075000,
        amountTenderedKobo: 1100000,
        changeDueKobo: 25000,
        paymentMethod: 'cash',
        status: 'completed',
        syncAckId: 'ack-initial-seed-01',
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
        unitPriceKobo: 500000,
        quantity: 2,
        lineTotalKobo: 1000000,
      })
    );

  // 3. Business Beta + Shop + Owner + Cashier
  await db.doc(`businesses/${BIZ_BETA_ID}`).set(
    makeBusinessFixture({
      id: BIZ_BETA_ID,
      name: 'Beta Horizon Stores Ltd',
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
      permissions: ['process_sales', 'manage_products'],
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
    })
  );
}

async function seedStandardMultiTenantFixtures(env: RulesTestEnvironment) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await seedDatabaseDocuments(ctx.firestore());
  });
}

function getAuthenticatedDb(
  uid: string,
  email: string,
  emailVerified = true
) {
  return testEnv
    .authenticatedContext(uid, {
      email,
      email_verified: emailVerified,
    })
    .firestore();
}

/**
 * Creates a Firestore client bound explicitly to the target named Firestore database
 * (`ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4`) on the local emulator.
 */
function createNamedDatabaseClient(
  authToken?: Record<string, any> | 'owner'
) {
  const appName = `named-db-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const app = initializeApp(
    { projectId: TARGET_FIREBASE_PROJECT_ID, apiKey: 'fake-emulator-api-key' },
    appName
  );
  activeModularApps.push(app);
  const namedDb = getFirestore(app, TARGET_NAMED_DATABASE_ID);
  connectFirestoreEmulator(
    namedDb,
    emulatorHost,
    emulatorPort,
    authToken ? { mockUserToken: authToken as any } : undefined
  );

  return {
    doc(docPath: string) {
      const ref = modularDoc(namedDb, docPath);
      return {
        get: () => modularGetDoc(ref),
        set: (data: Record<string, any>) => modularSetDoc(ref, data),
        update: (data: Record<string, any>) => modularUpdateDoc(ref, data),
        delete: () => modularDeleteDoc(ref),
      };
    },
    collection(colPath: string) {
      const colRef = modularCollection(namedDb, colPath);
      return {
        get: () => modularGetDocs(colRef),
      };
    },
  };
}

function getNamedAuthenticatedDb(
  uid: string,
  email: string,
  emailVerified = true
) {
  return createNamedDatabaseClient({
    sub: uid,
    user_id: uid,
    email,
    email_verified: emailVerified,
  });
}

async function clearNamedDatabaseOnEmulator() {
  const clearUrl = `http://${emulatorHost}:${emulatorPort}/emulator/v1/projects/${TARGET_FIREBASE_PROJECT_ID}/databases/${TARGET_NAMED_DATABASE_ID}/documents`;
  const resp = await fetch(clearUrl, { method: 'DELETE' });
  if (!resp.ok) {
    throw new Error(
      `Failed to clear named database ${TARGET_NAMED_DATABASE_ID} on emulator: ${await resp.text()}`
    );
  }
}

before(async () => {
  // 1. Verify project configuration files target the exact project and named database
  const firebaseJson = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'firebase.json'), 'utf8')
  );
  const firebaserc = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), '.firebaserc'), 'utf8')
  );
  assert.equal(firebaserc.projects?.default, TARGET_FIREBASE_PROJECT_ID);
  assert.equal(firebaseJson.firestore?.database, TARGET_NAMED_DATABASE_ID);
  assert.equal(firebaseJson.firestore?.rules, 'firestore.rules');
  assert.ok(
    [8080, 8085].includes(Number(firebaseJson.emulators?.firestore?.port)),
    'firebase.json emulators.firestore.port must be 8085 or 8080'
  );

  // 2. Verify local firestore.rules has all SEC-01 through SEC-11 hardening rules
  assertHardenedRulesLoaded(rulesContent);

  // 3. Auto-detect active Firestore Emulator port (8085, 8080, or FIRESTORE_EMULATOR_HOST)
  const resolved = await resolveActiveEmulatorEndpoint(
    Number(firebaseJson.emulators?.firestore?.port)
  );
  emulatorHost = resolved.host;
  emulatorPort = resolved.port;

  if (!resolved.reachable) {
    throw new Error(
      `FIRESTORE_EMULATOR_NOT_RUNNING: Local Firestore Emulator is not reachable at ${emulatorHost}:${emulatorPort} (probed ports 8085 and 8080). ` +
        `Start it via: firebase emulators:start --only firestore --project ${TARGET_FIREBASE_PROJECT_ID}`
    );
  }

  testEnv = await initializeTestEnvironment({
    projectId: TARGET_FIREBASE_PROJECT_ID,
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
    await seedStandardMultiTenantFixtures(testEnv);
  }
});

after(async () => {
  for (const app of activeModularApps) {
    try {
      await deleteApp(app);
    } catch {
      // ignore cleanup errors
    }
  }
  if (testEnv) {
    await testEnv.cleanup();
  }
});

// ============================================================================
// 1. UNAUTHENTICATED OR UNVERIFIED USERS DENIED ACCESS
// ============================================================================
test('1. Unauthenticated and unverified-email users are denied read/write access across all collections', async () => {
  const unauthedDb = testEnv.unauthenticatedContext().firestore();

  // Unauthenticated reads denied
  await assertFails(unauthedDb.doc(`users/${OWNER_ALPHA_UID}`).get());
  await assertFails(unauthedDb.doc(`businesses/${BIZ_ALPHA_ID}`).get());
  await assertFails(
    unauthedDb.doc(`businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}`).get()
  );
  await assertFails(
    unauthedDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/prod-alpha-01`
      )
      .get()
  );
  await assertFails(
    unauthedDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-01`
      )
      .get()
  );

  // Unauthenticated writes denied
  await assertFails(
    unauthedDb.doc('users/uid-anon-attempt').set(
      makeUserProfileFixture({
        id: 'uid-anon-attempt',
        businessId: BIZ_ALPHA_ID,
        email: 'anon@alpha.ng',
        fullName: 'Anon User',
        role: 'cashier',
      })
    )
  );

  // Authenticated user with email_verified == false is denied even if profile exists in Firestore
  const unverifiedOwnerDb = getAuthenticatedDb(
    OWNER_ALPHA_UID,
    'owner@alpha.ng',
    false
  );
  await assertFails(unverifiedOwnerDb.doc(`users/${OWNER_ALPHA_UID}`).get());
  await assertFails(
    unverifiedOwnerDb.doc(`businesses/${BIZ_ALPHA_ID}`).get()
  );
  await assertFails(
    unverifiedOwnerDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/prod-alpha-01`
      )
      .get()
  );
});

// ============================================================================
// 2. CROSS-TENANT & UNASSIGNED-SHOP ISOLATION
// ============================================================================
test('2. Users from different businesses are denied cross-tenant access, and staff cannot access unassigned shops', async () => {
  const betaOwnerDb = getAuthenticatedDb(OWNER_BETA_UID, 'owner@beta.ng', true);
  const betaCashierDb = getAuthenticatedDb(
    CASHIER_BETA_UID,
    'cashier@beta.ng',
    true
  );
  const alphaCashierDb = getAuthenticatedDb(
    CASHIER_ALPHA_UID,
    'cashier@alpha.ng',
    true
  );

  // Positive: Beta Owner can read their own business and shop
  await assertSucceeds(betaOwnerDb.doc(`businesses/${BIZ_BETA_ID}`).get());
  await assertSucceeds(
    betaOwnerDb.doc(`businesses/${BIZ_BETA_ID}/shops/${SHOP_BETA_1_ID}`).get()
  );

  // Negative: Beta Owner and Beta Cashier cannot read or write Business Alpha's business, shops, products, sales, or audit events
  await assertFails(betaOwnerDb.doc(`businesses/${BIZ_ALPHA_ID}`).get());
  await assertFails(
    betaOwnerDb.doc(`businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}`).get()
  );
  await assertFails(
    betaOwnerDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/prod-alpha-01`
      )
      .get()
  );
  await assertFails(
    betaCashierDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-01`
      )
      .get()
  );
  await assertFails(
    betaOwnerDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/prod-cross-tenant`
      )
      .set(
        makeProductFixture({
          id: 'prod-cross-tenant',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
        })
      )
  );
  await assertFails(
    betaOwnerDb.collection(`businesses/${BIZ_ALPHA_ID}/audit_events`).get()
  );

  // Negative: Alpha Cashier assigned ONLY to SHOP_ALPHA_1_ID cannot read or write unassigned SHOP_ALPHA_2_ID
  await assertFails(
    alphaCashierDb
      .doc(`businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_2_ID}`)
      .get()
  );
  await assertFails(
    alphaCashierDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_2_ID}/sales/sale-unassigned-shop`
      )
      .set(
        makeSaleFixture({
          id: 'sale-unassigned-shop',
          shopId: SHOP_ALPHA_2_ID,
          businessId: BIZ_ALPHA_ID,
          cashierUserId: CASHIER_ALPHA_UID,
        })
      )
  );
});

// ============================================================================
// 3. CASHIER RESTRICTIONS (NO REFUNDS, VOIDS, DISCOUNTS, OR STOCK ADJUSTMENTS)
// ============================================================================
test('3. Cashiers can record standard completed sales but are denied self-permission escalation, unauthorized refunds, voids, discounts, and stock adjustments', async () => {
  const alphaCashierDb = getAuthenticatedDb(
    CASHIER_ALPHA_UID,
    'cashier@alpha.ng',
    true
  );

  // Positive: Cashier can read products in assigned shop and create a standard non-discounted completed sale + sale line item + sale_deduction movement
  await assertSucceeds(
    alphaCashierDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/prod-alpha-01`
      )
      .get()
  );
  await assertSucceeds(
    alphaCashierDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-cashier-valid-01`
      )
      .set(
        makeSaleFixture({
          id: 'sale-cashier-valid-01',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
          cashierUserId: CASHIER_ALPHA_UID,
          discountAmountKobo: 0,
        })
      )
  );
  await assertSucceeds(
    alphaCashierDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-cashier-valid-01/items/item-cashier-valid-01`
      )
      .set(
        makeSaleItemFixture({
          id: 'item-cashier-valid-01',
          saleId: 'sale-cashier-valid-01',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
        })
      )
  );
  await assertSucceeds(
    alphaCashierDb
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
          referenceId: 'sale-cashier-valid-01',
        })
      )
  );

  // Negative 3a: Cashier cannot update their own /users/{uid} profile to grant themselves permissions or escalate their role
  await assertFails(
    alphaCashierDb.doc(`users/${CASHIER_ALPHA_UID}`).update({
      permissions: ['process_sales', 'apply_discounts', 'process_returns', 'adjust_inventory'],
      updatedAt: '2026-10-26T13:00:00.000Z',
    })
  );
  await assertFails(
    alphaCashierDb.doc(`users/${CASHIER_ALPHA_UID}`).update({
      role: 'shop_manager',
      updatedAt: '2026-10-26T13:00:00.000Z',
    })
  );

  // Negative 3b: Cashier cannot spoof another operator's cashierUserId when creating a sale
  await assertFails(
    alphaCashierDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-cashier-spoofed-uid`
      )
      .set(
        makeSaleFixture({
          id: 'sale-cashier-spoofed-uid',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
          cashierUserId: MANAGER_ALPHA_UID,
          discountAmountKobo: 0,
        })
      )
  );

  // Negative 3c: Cashier without apply_discounts permission is denied creating a discounted sale
  await assertFails(
    alphaCashierDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-cashier-discount-denied`
      )
      .set(
        makeSaleFixture({
          id: 'sale-cashier-discount-denied',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
          cashierUserId: CASHIER_ALPHA_UID,
          subtotalKobo: 1000000,
          discountAmountKobo: 100000,
          taxAmountKobo: 67500,
          totalAmountKobo: 967500,
          amountTenderedKobo: 1000000,
          changeDueKobo: 32500,
        })
      )
  );

  // Negative 3d: Cashier cannot refund or void a completed sale
  await assertFails(
    alphaCashierDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-01`
      )
      .update({
        status: 'refunded',
        syncedAt: '2026-10-26T13:00:00.000Z',
      })
  );
  await assertFails(
    alphaCashierDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-01`
      )
      .update({
        status: 'voided',
        syncedAt: '2026-10-26T13:00:00.000Z',
      })
  );

  // Negative 3e: Cashier cannot forge a sale_refunded or sale_voided audit event
  await assertFails(
    alphaCashierDb
      .doc(`businesses/${BIZ_ALPHA_ID}/audit_events/aud-cashier-forged-void`)
      .set({
        id: 'aud-cashier-forged-void',
        businessId: BIZ_ALPHA_ID,
        shopId: SHOP_ALPHA_1_ID,
        userId: CASHIER_ALPHA_UID,
        userName: 'Bolanle Cashier',
        action: 'sale_voided',
        entityType: 'sale',
        entityId: 'sale-alpha-completed-01',
        createdAt: NOW_ISO,
      })
  );

  // Negative 3f: Cashier cannot create or update products or perform restock/damage/return_in stock adjustments
  await assertFails(
    alphaCashierDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/prod-alpha-01`
      )
      .update({
        stockQuantity: 999,
        updatedAt: '2026-10-26T13:00:00.000Z',
      })
  );
  await assertFails(
    alphaCashierDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/inventory_movements/mov-cashier-restock-denied`
      )
      .set(
        makeInventoryMovementFixture({
          id: 'mov-cashier-restock-denied',
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

  // Positive 3g: If Business Owner explicitly grants apply_discounts to Cashier, Cashier can create a valid discounted sale, but still cannot exceed subtotalKobo
  const alphaOwnerDb = getAuthenticatedDb(
    OWNER_ALPHA_UID,
    'owner@alpha.ng',
    true
  );
  await assertSucceeds(
    alphaOwnerDb.doc(`users/${CASHIER_ALPHA_UID}`).update({
      permissions: ['process_sales', 'apply_discounts'],
      updatedAt: '2026-10-26T13:10:00.000Z',
    })
  );
  await assertSucceeds(
    alphaCashierDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-cashier-authorized-discount`
      )
      .set(
        makeSaleFixture({
          id: 'sale-cashier-authorized-discount',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
          cashierUserId: CASHIER_ALPHA_UID,
          subtotalKobo: 1000000,
          discountAmountKobo: 100000,
          taxAmountKobo: 67500,
          totalAmountKobo: 967500,
          amountTenderedKobo: 1000000,
          changeDueKobo: 32500,
        })
      )
  );
  // Discount exceeding subtotalKobo is strictly rejected even with apply_discounts permission
  await assertFails(
    alphaCashierDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-cashier-excessive-discount`
      )
      .set(
        makeSaleFixture({
          id: 'sale-cashier-excessive-discount',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
          cashierUserId: CASHIER_ALPHA_UID,
          subtotalKobo: 1000000,
          discountAmountKobo: 1050000, // Exceeds subtotal!
          taxAmountKobo: 75000,
          totalAmountKobo: 25000,
          amountTenderedKobo: 25000,
          changeDueKobo: 0,
        })
      )
  );
});

// ============================================================================
// 4. COMPLETED SALES REJECT MODIFICATIONS TO FINANCIAL, LINE ITEM & IDENTITY FIELDS
// ============================================================================
test('4. Completed sales lock all checkout-time financial, line-item, timestamp, and identity fields against post-checkout tampering by any role', async () => {
  const alphaOwnerDb = getAuthenticatedDb(
    OWNER_ALPHA_UID,
    'owner@alpha.ng',
    true
  );
  const alphaManagerDb = getAuthenticatedDb(
    MANAGER_ALPHA_UID,
    'manager@alpha.ng',
    true
  );
  const saleRefOwner = alphaOwnerDb.doc(
    `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-01`
  );
  const saleRefManager = alphaManagerDb.doc(
    `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-01`
  );
  const saleItemRefOwner = alphaOwnerDb.doc(
    `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-01/items/item-alpha-01`
  );
  const saleItemRefManager = alphaManagerDb.doc(
    `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-01/items/item-alpha-01`
  );

  // Negative 4a: Even Business Owner or Shop Manager cannot alter totalAmountKobo, discountAmountKobo, taxAmountKobo, amountTenderedKobo, changeDueKobo, paymentMethod, cashierUserId, cashierName, createdAt, receiptNumber, or syncAckId on a completed sale
  await assertFails(
    saleRefOwner.update({
      totalAmountKobo: 500000,
      syncedAt: '2026-10-26T14:00:00.000Z',
    })
  );
  await assertFails(
    saleRefOwner.update({
      discountAmountKobo: 200000,
      totalAmountKobo: 875000,
      syncedAt: '2026-10-26T14:00:00.000Z',
    })
  );
  await assertFails(
    saleRefOwner.update({
      paymentMethod: 'bank_transfer',
      syncedAt: '2026-10-26T14:00:00.000Z',
    })
  );
  await assertFails(
    saleRefManager.update({
      cashierUserId: MANAGER_ALPHA_UID,
      syncedAt: '2026-10-26T14:00:00.000Z',
    })
  );
  await assertFails(
    saleRefManager.update({
      cashierName: 'Tampered Cashier Name',
      syncedAt: '2026-10-26T14:00:00.000Z',
    })
  );
  await assertFails(
    saleRefManager.update({
      amountTenderedKobo: 2000000,
      changeDueKobo: 925000,
      syncedAt: '2026-10-26T14:00:00.000Z',
    })
  );
  await assertFails(
    saleRefOwner.update({
      createdAt: '2020-01-01T00:00:00.000Z',
      syncedAt: '2026-10-26T14:00:00.000Z',
    })
  );
  await assertFails(
    saleRefOwner.update({
      syncAckId: 'ack-forged-override',
      syncedAt: '2026-10-26T14:00:00.000Z',
    })
  );
  await assertFails(
    saleRefOwner.update({
      items: [], // Shadow field injection
      syncedAt: '2026-10-26T14:00:00.000Z',
    })
  );
  await assertFails(saleRefOwner.delete());

  // Negative 4b: Completed sale line items (/sales/{saleId}/items/{itemId}) cannot be modified or deleted by any role
  await assertFails(
    saleItemRefOwner.update({
      quantity: 1,
      lineTotalKobo: 500000,
    })
  );
  await assertFails(
    saleItemRefManager.update({
      unitPriceKobo: 100000,
      lineTotalKobo: 200000,
    })
  );
  await assertFails(saleItemRefOwner.delete());
  await assertFails(saleItemRefManager.delete());

  // Negative 4c: Cannot create a sale line item with invalid arithmetic (lineTotalKobo != unitPriceKobo * quantity)
  await assertFails(
    alphaOwnerDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-01/items/item-bad-math`
      )
      .set(
        makeSaleItemFixture({
          id: 'item-bad-math',
          saleId: 'sale-alpha-completed-01',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
          unitPriceKobo: 500000,
          quantity: 2,
          lineTotalKobo: 100000, // Mismatched line total
        })
      )
  );

  // Negative 4d: Cannot create a sale with initial status 'refunded' or 'voided' or unbalanced arithmetic
  await assertFails(
    alphaOwnerDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-bad-initial-status`
      )
      .set(
        makeSaleFixture({
          id: 'sale-bad-initial-status',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
          cashierUserId: OWNER_ALPHA_UID,
          status: 'refunded',
        })
      )
  );
  await assertFails(
    alphaOwnerDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-bad-math`
      )
      .set(
        makeSaleFixture({
          id: 'sale-bad-math',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
          cashierUserId: OWNER_ALPHA_UID,
          subtotalKobo: 1000000,
          discountAmountKobo: 0,
          taxAmountKobo: 75000,
          totalAmountKobo: 500000, // Mismatched total!
          amountTenderedKobo: 500000,
          changeDueKobo: 0,
        })
      )
  );

  // Positive 4e: Legitimate idempotent sync acknowledgment on a completed sale (setting initial syncAckId & updating syncedAt while keeping status == 'completed') succeeds, and subsequent syncAckId overwrite is denied
  const alphaCashierDb = getAuthenticatedDb(
    CASHIER_ALPHA_UID,
    'cashier@alpha.ng',
    true
  );
  const unsyncedSaleRefCashier = alphaCashierDb.doc(
    `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-02`
  );
  await assertSucceeds(
    unsyncedSaleRefCashier.set(
      makeSaleFixture({
        id: 'sale-alpha-completed-02',
        shopId: SHOP_ALPHA_1_ID,
        businessId: BIZ_ALPHA_ID,
        cashierUserId: CASHIER_ALPHA_UID,
        status: 'completed',
      })
    )
  );
  await assertSucceeds(
    unsyncedSaleRefCashier.update({
      status: 'completed',
      syncAckId: 'ack-first-sync-02',
      syncedAt: '2026-10-26T14:02:00.000Z',
    })
  );
  await assertFails(
    unsyncedSaleRefCashier.update({
      status: 'completed',
      syncAckId: 'ack-tampered-sync-02',
      syncedAt: '2026-10-26T14:03:00.000Z',
    })
  );

  // Positive 4f: Authorized Shop Manager (with process_returns) CAN transition a completed sale to 'refunded' without altering financial fields
  await assertSucceeds(
    saleRefManager.update({
      status: 'refunded',
      syncedAt: '2026-10-26T14:05:00.000Z',
    })
  );

  // Negative 4g: Once a sale reaches terminal 'refunded' status, it cannot be reverted to 'completed', switched to 'voided', or updated again
  await assertFails(
    saleRefOwner.update({
      status: 'completed',
      syncedAt: '2026-10-26T14:10:00.000Z',
    })
  );
  await assertFails(
    saleRefOwner.update({
      status: 'voided',
      syncedAt: '2026-10-26T14:12:00.000Z',
    })
  );
  await assertFails(
    saleRefOwner.update({
      syncedAt: '2026-10-26T14:15:00.000Z',
    })
  );

  // Positive 4h & Negative 4i: Authorized Business Owner CAN transition a completed sale to 'voided', and terminal 'voided' status is permanently locked
  const secondSaleRefOwner = alphaOwnerDb.doc(
    `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-02`
  );
  await assertSucceeds(
    secondSaleRefOwner.update({
      status: 'voided',
      syncedAt: '2026-10-26T14:20:00.000Z',
    })
  );
  await assertFails(
    secondSaleRefOwner.update({
      status: 'completed',
      syncedAt: '2026-10-26T14:25:00.000Z',
    })
  );
  await assertFails(
    secondSaleRefOwner.update({
      status: 'refunded',
      syncedAt: '2026-10-26T14:26:00.000Z',
    })
  );
});

// ============================================================================
// 5. AUTHORIZED MANAGERS AND OWNERS ROLE & GRANULAR PERMISSION BOUNDARIES
// ============================================================================
test('5. Authorized Shop Managers and Business Owners are allowed only operations permitted by their roles and granular permissions', async () => {
  const alphaOwnerDb = getAuthenticatedDb(
    OWNER_ALPHA_UID,
    'owner@alpha.ng',
    true
  );
  const alphaManagerDb = getAuthenticatedDb(
    MANAGER_ALPHA_UID,
    'manager@alpha.ng',
    true
  );

  // Positive: Shop Manager can create & update products and record restock movements in assigned shop (SHOP_ALPHA_1_ID)
  await assertSucceeds(
    alphaManagerDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/prod-mgr-new-01`
      )
      .set(
        makeProductFixture({
          id: 'prod-mgr-new-01',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
        })
      )
  );
  await assertSucceeds(
    alphaManagerDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/inventory_movements/mov-mgr-restock-01`
      )
      .set(
        makeInventoryMovementFixture({
          id: 'mov-mgr-restock-01',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
          productId: 'prod-alpha-01',
          type: 'restock',
          quantityDelta: 15,
          previousQuantity: 25,
          newQuantity: 40,
          performedByUserId: MANAGER_ALPHA_UID,
        })
      )
  );

  // Negative: Shop Manager CANNOT delete a product (only Business Owner can delete products)
  await assertFails(
    alphaManagerDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/prod-mgr-new-01`
      )
      .delete()
  );

  // Positive: Business Owner CAN delete a product
  await assertSucceeds(
    alphaOwnerDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/prod-mgr-new-01`
      )
      .delete()
  );

  // Negative: Shop Manager CANNOT create a new shop, update shop configuration (taxRatePercent/status), or provision staff users
  await assertFails(
    alphaManagerDb
      .doc(`businesses/${BIZ_ALPHA_ID}/shops/shop-live-alpha-03`)
      .set(
        makeShopFixture({
          id: 'shop-live-alpha-03',
          businessId: BIZ_ALPHA_ID,
        })
      )
  );
  await assertFails(
    alphaManagerDb
      .doc(`businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}`)
      .update({
        taxRatePercent: 0,
        updatedAt: '2026-10-26T15:00:00.000Z',
      })
  );
  await assertFails(
    alphaManagerDb.doc('users/uid-mgr-created-staff').set(
      makeUserProfileFixture({
        id: 'uid-mgr-created-staff',
        businessId: BIZ_ALPHA_ID,
        email: 'newcashier@alpha.ng',
        fullName: 'New Cashier',
        role: 'cashier',
        assignedShopIds: [SHOP_ALPHA_1_ID],
      })
    )
  );

  // Positive: Business Owner CAN create a new shop, update shop configuration, and invite a cashier/shop_manager within their business
  await assertSucceeds(
    alphaOwnerDb
      .doc(`businesses/${BIZ_ALPHA_ID}/shops/shop-live-alpha-03`)
      .set(
        makeShopFixture({
          id: 'shop-live-alpha-03',
          businessId: BIZ_ALPHA_ID,
          code: 'ALP-03',
          name: 'Alpha Surulere Branch',
        })
      )
  );
  await assertSucceeds(
    alphaOwnerDb.doc('users/uid-owner-invited-cashier').set(
      makeUserProfileFixture({
        id: 'uid-owner-invited-cashier',
        businessId: BIZ_ALPHA_ID,
        email: 'invited.cashier@alpha.ng',
        fullName: 'Invited Cashier',
        role: 'cashier',
        assignedShopIds: [SHOP_ALPHA_1_ID],
        permissions: ['process_sales'],
      })
    )
  );

  // Negative: Business Owner CANNOT escalate a user to business_owner or platform_admin, nor change their business status/ownerUserId
  await assertFails(
    alphaOwnerDb.doc('users/uid-owner-escalate-attempt').set(
      makeUserProfileFixture({
        id: 'uid-owner-escalate-attempt',
        businessId: BIZ_ALPHA_ID,
        email: 'secondowner@alpha.ng',
        fullName: 'Second Owner Attempt',
        role: 'business_owner',
        assignedShopIds: [SHOP_ALPHA_1_ID],
      })
    )
  );
  await assertFails(
    alphaOwnerDb.doc(`businesses/${BIZ_ALPHA_ID}`).update({
      status: 'suspended',
      updatedAt: '2026-10-26T15:00:00.000Z',
    })
  );

  // Granular permission check: if Shop Manager's manage_products, adjust_inventory, and process_returns permissions are revoked, they are immediately denied those operations
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`users/${MANAGER_ALPHA_UID}`).update({
      permissions: ['process_sales'], // manage_products, adjust_inventory, process_returns removed
    });
  });

  // Manager cannot re-grant permissions to self
  await assertFails(
    alphaManagerDb.doc(`users/${MANAGER_ALPHA_UID}`).update({
      permissions: ['process_sales', 'manage_products', 'adjust_inventory', 'process_returns'],
      updatedAt: '2026-10-26T15:05:00.000Z',
    })
  );

  // Manager denied product creation after manage_products revoked
  await assertFails(
    alphaManagerDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/prod-mgr-denied-after-revoke`
      )
      .set(
        makeProductFixture({
          id: 'prod-mgr-denied-after-revoke',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
        })
      )
  );

  // Manager denied restock adjustment after adjust_inventory revoked
  await assertFails(
    alphaManagerDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/inventory_movements/mov-mgr-denied-after-revoke`
      )
      .set(
        makeInventoryMovementFixture({
          id: 'mov-mgr-denied-after-revoke',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
          productId: 'prod-alpha-01',
          type: 'restock',
          quantityDelta: 5,
          previousQuantity: 25,
          newQuantity: 30,
          performedByUserId: MANAGER_ALPHA_UID,
        })
      )
  );

  // Manager denied sale refund after process_returns revoked
  await assertFails(
    alphaManagerDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-01`
      )
      .update({
        status: 'refunded',
        syncedAt: '2026-10-26T15:10:00.000Z',
      })
  );
});

// ============================================================================
// 6. PLATFORM ADMINISTRATOR BOOTSTRAP & TENANT SEPARATION
// ============================================================================
test('6. Platform Administrator bootstrap is restricted strictly to verified smartnwokolo@gmail.com with active profile checks and separated from operational shop data', async () => {
  const newAdminUid = 'uid-bootstrap-smart-fresh';

  // Negative 6a: Unrecognized email (including s.moronfola@gmail.com) cannot bootstrap a platform_admin profile
  const unrecognizedAdminDb = getAuthenticatedDb(
    'uid-unrecognized-admin',
    UNRECOGNIZED_EMAIL,
    true
  );
  await assertFails(
    unrecognizedAdminDb.doc('users/uid-unrecognized-admin').set(
      makeUserProfileFixture({
        id: 'uid-unrecognized-admin',
        businessId: 'PLATFORM',
        email: UNRECOGNIZED_EMAIL,
        fullName: 'Unauthorized Admin Attempt',
        role: 'platform_admin',
        assignedShopIds: [],
      })
    )
  );

  // Negative 6b: Unverified smartnwokolo@gmail.com cannot bootstrap
  const unverifiedBootstrapDb = getAuthenticatedDb(
    newAdminUid,
    BOOTSTRAP_ADMIN_EMAIL,
    false
  );
  await assertFails(
    unverifiedBootstrapDb.doc(`users/${newAdminUid}`).set(
      makeUserProfileFixture({
        id: newAdminUid,
        businessId: 'PLATFORM',
        email: BOOTSTRAP_ADMIN_EMAIL,
        fullName: 'SmartMind Platform Admin',
        role: 'platform_admin',
        assignedShopIds: [],
      })
    )
  );

  // Negative 6c: Verified smartnwokolo@gmail.com WITHOUT an initialized active profile cannot perform Platform Admin actions yet
  const verifiedBootstrapDb = getAuthenticatedDb(
    newAdminUid,
    BOOTSTRAP_ADMIN_EMAIL,
    true
  );
  await assertFails(
    verifiedBootstrapDb.doc('businesses/biz-before-bootstrap').set(
      makeBusinessFixture({
        id: 'biz-before-bootstrap',
        ownerUserId: 'uid-owner-gamma-03',
      })
    )
  );

  // Negative 6d: Verified smartnwokolo@gmail.com cannot create a platform_admin profile bound to a tenant business, with assignedShopIds, or with status 'suspended'
  await assertFails(
    verifiedBootstrapDb.doc(`users/${newAdminUid}`).set(
      makeUserProfileFixture({
        id: newAdminUid,
        businessId: BIZ_ALPHA_ID, // Must be PLATFORM sentinel
        email: BOOTSTRAP_ADMIN_EMAIL,
        fullName: 'SmartMind Platform Admin',
        role: 'platform_admin',
        assignedShopIds: [],
      })
    )
  );
  await assertFails(
    verifiedBootstrapDb.doc(`users/${newAdminUid}`).set(
      makeUserProfileFixture({
        id: newAdminUid,
        businessId: 'PLATFORM',
        email: BOOTSTRAP_ADMIN_EMAIL,
        fullName: 'SmartMind Platform Admin',
        role: 'platform_admin',
        assignedShopIds: [SHOP_ALPHA_1_ID], // Must be empty
      })
    )
  );
  await assertFails(
    verifiedBootstrapDb.doc(`users/${newAdminUid}`).set(
      makeUserProfileFixture({
        id: newAdminUid,
        businessId: 'PLATFORM',
        email: BOOTSTRAP_ADMIN_EMAIL,
        fullName: 'SmartMind Platform Admin',
        role: 'platform_admin',
        assignedShopIds: [],
        status: 'suspended', // Must be active
      })
    )
  );

  // Positive 6e: Verified smartnwokolo@gmail.com CAN bootstrap own active platform_admin profile with businessId == 'PLATFORM' and assignedShopIds == []
  await assertSucceeds(
    verifiedBootstrapDb.doc(`users/${newAdminUid}`).set(
      makeUserProfileFixture({
        id: newAdminUid,
        businessId: 'PLATFORM',
        email: BOOTSTRAP_ADMIN_EMAIL,
        fullName: 'SmartMind Platform Admin',
        role: 'platform_admin',
        assignedShopIds: [],
      })
    )
  );

  // Governance vs Operational separation for active Platform Admin
  const activeAdminDb = getAuthenticatedDb(
    ADMIN_UID,
    BOOTSTRAP_ADMIN_EMAIL,
    true
  );

  // Positive: Platform Admin can provision a new tenant business (for another ownerUserId), its first shop, and its primary owner profile
  await assertSucceeds(
    activeAdminDb.doc('businesses/biz-live-gamma-03').set(
      makeBusinessFixture({
        id: 'biz-live-gamma-03',
        name: 'Gamma Retail Ltd',
        ownerUserId: 'uid-owner-gamma-03',
        ownerEmail: 'owner@gamma.ng',
      })
    )
  );
  await assertSucceeds(
    activeAdminDb.doc('users/uid-owner-gamma-03').set(
      makeUserProfileFixture({
        id: 'uid-owner-gamma-03',
        businessId: 'biz-live-gamma-03',
        email: 'owner@gamma.ng',
        fullName: 'Gamma Primary Owner',
        role: 'business_owner',
        assignedShopIds: ['shop-live-gamma-03'],
      })
    )
  );

  // Negative: Platform Admin cannot assign self as ownerUserId of a tenant business or create a business document with ID 'PLATFORM'
  await assertFails(
    activeAdminDb.doc('businesses/biz-self-owned').set(
      makeBusinessFixture({
        id: 'biz-self-owned',
        ownerUserId: ADMIN_UID,
        ownerEmail: BOOTSTRAP_ADMIN_EMAIL,
      })
    )
  );
  await assertFails(
    activeAdminDb.doc('businesses/PLATFORM').set(
      makeBusinessFixture({
        id: 'PLATFORM',
        ownerUserId: 'uid-owner-gamma-03',
      })
    )
  );

  // Negative: Platform Admin is strictly denied access to operational shop subcollections (products, sales, sale items, inventory_movements, customers, payments, invoices)
  await assertFails(
    activeAdminDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/prod-alpha-01`
      )
      .get()
  );
  await assertFails(
    activeAdminDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-01`
      )
      .get()
  );
  await assertFails(
    activeAdminDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-01/items/item-alpha-01`
      )
      .get()
  );
  await assertFails(
    activeAdminDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-admin-attempt`
      )
      .set(
        makeSaleFixture({
          id: 'sale-admin-attempt',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
          cashierUserId: ADMIN_UID,
        })
      )
  );
  await assertFails(
    activeAdminDb
      .collection(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/inventory_movements`
      )
      .get()
  );

  // Negative 6f: If Platform Admin profile status is suspended, all Platform Admin capabilities are immediately revoked
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`users/${ADMIN_UID}`).update({
      status: 'suspended',
    });
  });
  await assertFails(
    activeAdminDb.doc(`businesses/${BIZ_ALPHA_ID}`).update({
      status: 'suspended',
      updatedAt: '2026-10-26T16:00:00.000Z',
    })
  );
});

// ============================================================================
// 7. QUARANTINED PRE-FIREBASE & DEMO IDS PERMANENTLY BLOCKED
// ============================================================================
test('7. Quarantined business, shop, and all four legacy pre-Firebase test sale/sync IDs are blocked from creation and access', async () => {
  const activeAdminDb = getAuthenticatedDb(
    ADMIN_UID,
    BOOTSTRAP_ADMIN_EMAIL,
    true
  );
  const alphaOwnerDb = getAuthenticatedDb(
    OWNER_ALPHA_UID,
    'owner@alpha.ng',
    true
  );

  // Negative 7a: Quarantined business ID `biz-0003-u42w` and demo business `biz-emerald-01` cannot be created even by Platform Admin
  await assertFails(
    activeAdminDb.doc('businesses/biz-0003-u42w').set(
      makeBusinessFixture({
        id: 'biz-0003-u42w',
        ownerUserId: OWNER_ALPHA_UID,
      })
    )
  );
  await assertFails(
    activeAdminDb.doc('businesses/biz-emerald-01').set(
      makeBusinessFixture({
        id: 'biz-emerald-01',
        ownerUserId: OWNER_ALPHA_UID,
      })
    )
  );

  // Negative 7b: Quarantined shop ID `shop-0005-9i6p` and demo shop `shop-vi-01` cannot be created under a valid business
  await assertFails(
    alphaOwnerDb.doc(`businesses/${BIZ_ALPHA_ID}/shops/shop-0005-9i6p`).set(
      makeShopFixture({
        id: 'shop-0005-9i6p',
        businessId: BIZ_ALPHA_ID,
      })
    )
  );
  await assertFails(
    alphaOwnerDb.doc(`businesses/${BIZ_ALPHA_ID}/shops/shop-vi-01`).set(
      makeShopFixture({
        id: 'shop-vi-01',
        businessId: BIZ_ALPHA_ID,
      })
    )
  );

  // Negative 7c: All 4 quarantined sale IDs and all 4 quarantined sync IDs are blocked from being uploaded to any live shop
  const quarantinedPairs = [
    {
      syncId: 'sync-sale-1792837064449-h1dw',
      saleId: 'sale-1792837064449-h1dw',
    },
    {
      syncId: 'sync-sale-1792840077667-3knj',
      saleId: 'sale-1792840077667-3knj',
    },
    {
      syncId: 'sync-sale-1792840085221-qjdb',
      saleId: 'sale-1792840085221-qjdb',
    },
    {
      syncId: 'sync-sale-1792840089845-kc84',
      saleId: 'sale-1792840089845-kc84',
    },
  ];

  for (const pair of quarantinedPairs) {
    await assertFails(
      alphaOwnerDb
        .doc(
          `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/${pair.saleId}`
        )
        .set(
          makeSaleFixture({
            id: pair.saleId,
            shopId: SHOP_ALPHA_1_ID,
            businessId: BIZ_ALPHA_ID,
            cashierUserId: OWNER_ALPHA_UID,
          })
        )
    );

    await assertFails(
      alphaOwnerDb
        .doc(
          `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sync_operations/${pair.syncId}`
        )
        .set({
          id: pair.syncId,
          businessId: BIZ_ALPHA_ID,
          shopId: SHOP_ALPHA_1_ID,
          entityType: 'sale',
          entityId: pair.saleId,
          operationType: 'create',
          actorUserId: OWNER_ALPHA_UID,
          outcome: 'acknowledged',
          schemaVersion: 6,
          processedAt: NOW_ISO,
        })
    );
  }
});

// ============================================================================
// 8. CATCH-ALL RULE, SERVER-ONLY LEDGERS & NAMED DATABASE VERIFICATION
// ============================================================================
test('8. Catch-all rule denies unrecognized paths, server-only ledgers reject client writes, and the named Firestore database enforces all security rules end-to-end', async () => {
  const activeAdminDb = getAuthenticatedDb(
    ADMIN_UID,
    BOOTSTRAP_ADMIN_EMAIL,
    true
  );
  const alphaOwnerDb = getAuthenticatedDb(
    OWNER_ALPHA_UID,
    'owner@alpha.ng',
    true
  );

  // Unrecognized root path denied for both Owner and Platform Admin
  await assertFails(alphaOwnerDb.doc('unrecognized_root_collection/doc-1').get());
  await assertFails(
    activeAdminDb
      .doc('unrecognized_root_collection/doc-1')
      .set({ test: 'denied' })
  );

  // Unrecognized nested subcollection under business and shop denied
  await assertFails(
    alphaOwnerDb
      .doc(`businesses/${BIZ_ALPHA_ID}/unrecognized_subcollection/doc-1`)
      .set({ test: 'denied' })
  );
  await assertFails(
    alphaOwnerDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/unknown_ledger/doc-1`
      )
      .set({ test: 'denied' })
  );

  // Server-only ledgers (`staff_provisioning_keys` and `subscription_events`) deny direct client writes
  await assertFails(
    alphaOwnerDb
      .doc(`businesses/${BIZ_ALPHA_ID}/staff_provisioning_keys/idem-client-write`)
      .set({
        id: 'idem-client-write',
        businessId: BIZ_ALPHA_ID,
        createdAt: NOW_ISO,
      })
  );
  await assertFails(
    activeAdminDb
      .doc(`businesses/${BIZ_ALPHA_ID}/subscription_events/sub-client-write`)
      .set({
        id: 'sub-client-write',
        businessId: BIZ_ALPHA_ID,
        createdAt: NOW_ISO,
      })
  );

  // ==========================================================================
  // Named Database (`ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4`)
  // End-to-End Verification
  // ==========================================================================
  await clearNamedDatabaseOnEmulator();
  const namedAdminBypassDb = createNamedDatabaseClient('owner');
  await seedDatabaseDocuments(namedAdminBypassDb);

  const namedUnauthedDb = createNamedDatabaseClient(undefined);
  const namedAlphaCashierDb = getNamedAuthenticatedDb(
    CASHIER_ALPHA_UID,
    'cashier@alpha.ng',
    true
  );
  const namedAlphaManagerDb = getNamedAuthenticatedDb(
    MANAGER_ALPHA_UID,
    'manager@alpha.ng',
    true
  );
  const namedAlphaOwnerDb = getNamedAuthenticatedDb(
    OWNER_ALPHA_UID,
    'owner@alpha.ng',
    true
  );
  const namedBetaOwnerDb = getNamedAuthenticatedDb(
    OWNER_BETA_UID,
    'owner@beta.ng',
    true
  );
  const namedPlatformAdminDb = getNamedAuthenticatedDb(
    ADMIN_UID,
    BOOTSTRAP_ADMIN_EMAIL,
    true
  );

  // 8.1 Unauthenticated denied on named database
  await assertFails(namedUnauthedDb.doc(`businesses/${BIZ_ALPHA_ID}`).get());

  // 8.2 Cross-tenant denied & assigned-shop permitted on named database
  await assertFails(namedBetaOwnerDb.doc(`businesses/${BIZ_ALPHA_ID}`).get());
  await assertSucceeds(
    namedAlphaCashierDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/prod-alpha-01`
      )
      .get()
  );

  // 8.3 Cashier valid sale permitted, unauthorized discount & refund denied on named database
  await assertSucceeds(
    namedAlphaCashierDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-named-db-valid`
      )
      .set(
        makeSaleFixture({
          id: 'sale-named-db-valid',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
          cashierUserId: CASHIER_ALPHA_UID,
          discountAmountKobo: 0,
        })
      )
  );
  await assertFails(
    namedAlphaCashierDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-named-db-discount-denied`
      )
      .set(
        makeSaleFixture({
          id: 'sale-named-db-discount-denied',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
          cashierUserId: CASHIER_ALPHA_UID,
          subtotalKobo: 1000000,
          discountAmountKobo: 100000,
          taxAmountKobo: 67500,
          totalAmountKobo: 967500,
        })
      )
  );

  // 8.4 Completed sale paymentMethod & line item immutability enforced on named database
  await assertFails(
    namedAlphaOwnerDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-01`
      )
      .update({
        paymentMethod: 'pos_card',
        syncedAt: '2026-10-26T17:00:00.000Z',
      })
  );
  await assertFails(
    namedAlphaOwnerDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-01/items/item-alpha-01`
      )
      .update({
        quantity: 99,
      })
  );

  // 8.5 Manager granular permission revocation enforced on named database
  await namedAdminBypassDb.doc(`users/${MANAGER_ALPHA_UID}`).update({
    permissions: ['process_sales'],
  });
  await assertFails(
    namedAlphaManagerDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/products/prod-named-mgr-denied`
      )
      .set(
        makeProductFixture({
          id: 'prod-named-mgr-denied',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
        })
      )
  );

  // 8.6 Platform Admin operational separation & quarantine enforced on named database
  await assertFails(
    namedPlatformAdminDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-alpha-completed-01`
      )
      .get()
  );
  await assertFails(
    namedAlphaOwnerDb
      .doc(
        `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/sales/sale-1792837064449-h1dw`
      )
      .set(
        makeSaleFixture({
          id: 'sale-1792837064449-h1dw',
          shopId: SHOP_ALPHA_1_ID,
          businessId: BIZ_ALPHA_ID,
          cashierUserId: OWNER_ALPHA_UID,
        })
      )
  );
});
