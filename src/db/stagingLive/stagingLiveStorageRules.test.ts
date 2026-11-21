/**
 * SmartMind POS — Live Staging Storage Security Rules Suite (15 Scenarios)
 *
 * Executes against ACTUAL `smartmind-pos-staging` Cloud Storage bucket
 * (`smartmind-pos-staging.firebasestorage.app`).
 * Reproduces all 15 scenarios from `src/db/storageRulesEmulator.test.ts`.
 *
 * Strictly scoped under `businesses/smartmind-staging-test-{runId}-...`
 * and cleans up all uploaded objects, Firestore user/business docs, and
 * ephemeral Auth accounts in `after()`.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, test } from 'node:test';
import {
  signInWithCustomToken,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';
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

const RUN_ID = `st-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
const NAMESPACE = `smartmind-staging-test-${RUN_ID}`;
const NOW_ISO = new Date().toISOString();
const TEST_PASSWORD = `SmSt!${crypto.randomBytes(12).toString('hex')}`;

// Pre-existing Staging Platform Admin (read/test-path only via custom token; never modified)
const STAGING_ADMIN_UID = 'hLG3ltaqMJh4lJlixuL9QpKVu3u2';

// Scoped Ephemeral Actors
const PROD_ADMIN_IMP_UID = `${NAMESPACE}-prod-admin-imp`;
const PROD_ADMIN_EMAIL = 'smartnwokolo@gmail.com';
const OWNER_ALPHA_UID = `${NAMESPACE}-owner-a`;
const MGR_ALPHA_UID = `${NAMESPACE}-mgr-a`;
const CASHIER_ALPHA_UID = `${NAMESPACE}-cash-a`;
const SUSPENDED_ALPHA_UID = `${NAMESPACE}-susp-a`;
const UNVERIFIED_OWNER_UID = `${NAMESPACE}-unv-owner`;
const OWNER_BETA_UID = `${NAMESPACE}-owner-b`;

// Scoped Tenant Paths
const BIZ_ALPHA_ID = `${NAMESPACE}-biz-a`;
const SHOP_ALPHA_1_ID = `${NAMESPACE}-shop-a1`;
const SHOP_ALPHA_2_ID = `${NAMESPACE}-shop-a2`;
const BIZ_BETA_ID = `${NAMESPACE}-biz-b`;

const ALPHA_BIZ_LOGO_PATH = `businesses/${BIZ_ALPHA_ID}/branding/business-logo`;
const ALPHA_SHOP1_LOGO_PATH = `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/branding/shop-logo`;
const ALPHA_SHOP2_LOGO_PATH = `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_2_ID}/branding/shop-logo`;
const BETA_BIZ_LOGO_PATH = `businesses/${BIZ_BETA_ID}/branding/business-logo`;

const TINY_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

let env: ValidatedStagingTestEnv;
let adminCtx: StagingAdminContext;
let clients: StagingClientRegistry;

let stagingAdminClient: StagingClientContext;
let prodAdminImposterClient: StagingClientContext;
let ownerAClient: StagingClientContext;
let mgrAClient: StagingClientContext;
let cashierAClient: StagingClientContext;
let suspendedClient: StagingClientContext;
let unverifiedOwnerClient: StagingClientContext;
let ownerBClient: StagingClientContext;
let unauthedClient: StagingClientContext;

async function assertStorageDenied(
  promise: Promise<unknown>,
  label: string
): Promise<void> {
  let rejected = false;
  try {
    await promise;
  } catch (err: any) {
    rejected = true;
    const code = String(err?.code || '');
    const msg = String(err?.message || '');
    assert.ok(
      code === 'storage/unauthorized' ||
        code.includes('unauthorized') ||
        msg.includes('storage/unauthorized') ||
        msg.includes('User does not have permission'),
      `[${label}] Expected storage/unauthorized, got code="${code}" message="${msg}"`
    );
  }
  assert.ok(rejected, `[${label}] Expected Storage operation to be DENIED, but it succeeded.`);
}

async function assertStorageAllowed<T>(
  promise: Promise<T>,
  label: string
): Promise<T> {
  try {
    return await promise;
  } catch (err: any) {
    assert.fail(
      `[${label}] Expected Storage operation to be ALLOWED, but failed with code="${err?.code}" message="${err?.message}"`
    );
  }
}

async function createAndTrackAuth(params: {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}) {
  assert.ok(!PROTECTED_PREEXISTING_STAGING_UIDS.has(params.uid));
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

  const adminRecord = await adminCtx.auth.getUser(STAGING_ADMIN_UID);
  assert.equal(adminRecord.email, STAGING_ADMIN_EMAIL);
  assert.equal(adminRecord.emailVerified, true);

  // Ephemeral Auth accounts for Storage scenarios
  await createAndTrackAuth({
    uid: PROD_ADMIN_IMP_UID,
    email: PROD_ADMIN_EMAIL,
    displayName: 'Production Admin Identity',
    emailVerified: true,
  });
  await createAndTrackAuth({
    uid: OWNER_ALPHA_UID,
    email: `${OWNER_ALPHA_UID}@staging-test.smartmind.local`,
    displayName: 'Alpha Owner',
    emailVerified: true,
  });
  await createAndTrackAuth({
    uid: MGR_ALPHA_UID,
    email: `${MGR_ALPHA_UID}@staging-test.smartmind.local`,
    displayName: 'Alpha Manager',
    emailVerified: true,
  });
  await createAndTrackAuth({
    uid: CASHIER_ALPHA_UID,
    email: `${CASHIER_ALPHA_UID}@staging-test.smartmind.local`,
    displayName: 'Alpha Cashier',
    emailVerified: true,
  });
  await createAndTrackAuth({
    uid: SUSPENDED_ALPHA_UID,
    email: `${SUSPENDED_ALPHA_UID}@staging-test.smartmind.local`,
    displayName: 'Alpha Suspended Staff',
    emailVerified: true,
  });
  await createAndTrackAuth({
    uid: UNVERIFIED_OWNER_UID,
    email: `${UNVERIFIED_OWNER_UID}@staging-test.smartmind.local`,
    displayName: 'Alpha Unverified Owner',
    emailVerified: false,
  });
  await createAndTrackAuth({
    uid: OWNER_BETA_UID,
    email: `${OWNER_BETA_UID}@staging-test.smartmind.local`,
    displayName: 'Beta Owner',
    emailVerified: true,
  });

  // Seed Firestore user profiles referenced by Storage Rules `firestore.get(...)`
  const profiles: Array<{ uid: string; data: Record<string, any> }> = [
    {
      uid: PROD_ADMIN_IMP_UID,
      data: {
        id: PROD_ADMIN_IMP_UID,
        businessId: 'PLATFORM',
        username: 'prod_admin_imp',
        email: PROD_ADMIN_EMAIL,
        fullName: 'Prod Admin Identity',
        role: 'platform_admin',
        roleLabel: 'Platform Administrator',
        assignedShopIds: [],
        permissions: [],
        status: 'active',
        schemaVersion: 1,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
      },
    },
    {
      uid: OWNER_ALPHA_UID,
      data: {
        id: OWNER_ALPHA_UID,
        businessId: BIZ_ALPHA_ID,
        username: 'st_owner_a',
        email: `${OWNER_ALPHA_UID}@staging-test.smartmind.local`,
        fullName: 'Alpha Owner',
        role: 'business_owner',
        roleLabel: 'Business Owner',
        assignedShopIds: [SHOP_ALPHA_1_ID, SHOP_ALPHA_2_ID],
        permissions: ['manage_business_settings'],
        status: 'active',
        schemaVersion: 1,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
      },
    },
    {
      uid: MGR_ALPHA_UID,
      data: {
        id: MGR_ALPHA_UID,
        businessId: BIZ_ALPHA_ID,
        username: 'st_mgr_a',
        email: `${MGR_ALPHA_UID}@staging-test.smartmind.local`,
        fullName: 'Alpha Manager',
        role: 'shop_manager',
        roleLabel: 'Shop Manager',
        assignedShopIds: [SHOP_ALPHA_1_ID],
        permissions: ['process_sales', 'manage_products'],
        status: 'active',
        schemaVersion: 1,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
      },
    },
    {
      uid: CASHIER_ALPHA_UID,
      data: {
        id: CASHIER_ALPHA_UID,
        businessId: BIZ_ALPHA_ID,
        username: 'st_cash_a',
        email: `${CASHIER_ALPHA_UID}@staging-test.smartmind.local`,
        fullName: 'Alpha Cashier',
        role: 'cashier',
        roleLabel: 'Cashier',
        assignedShopIds: [SHOP_ALPHA_1_ID],
        permissions: ['process_sales'],
        status: 'active',
        schemaVersion: 1,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
      },
    },
    {
      uid: SUSPENDED_ALPHA_UID,
      data: {
        id: SUSPENDED_ALPHA_UID,
        businessId: BIZ_ALPHA_ID,
        username: 'st_susp_a',
        email: `${SUSPENDED_ALPHA_UID}@staging-test.smartmind.local`,
        fullName: 'Alpha Suspended Staff',
        role: 'business_owner',
        roleLabel: 'Business Owner',
        assignedShopIds: [SHOP_ALPHA_1_ID],
        permissions: [],
        status: 'suspended',
        schemaVersion: 1,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
      },
    },
    {
      uid: UNVERIFIED_OWNER_UID,
      data: {
        id: UNVERIFIED_OWNER_UID,
        businessId: BIZ_ALPHA_ID,
        username: 'st_unv_a',
        email: `${UNVERIFIED_OWNER_UID}@staging-test.smartmind.local`,
        fullName: 'Alpha Unverified Owner',
        role: 'business_owner',
        roleLabel: 'Business Owner',
        assignedShopIds: [SHOP_ALPHA_1_ID],
        permissions: [],
        status: 'active',
        schemaVersion: 1,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
      },
    },
    {
      uid: OWNER_BETA_UID,
      data: {
        id: OWNER_BETA_UID,
        businessId: BIZ_BETA_ID,
        username: 'st_owner_b',
        email: `${OWNER_BETA_UID}@staging-test.smartmind.local`,
        fullName: 'Beta Owner',
        role: 'business_owner',
        roleLabel: 'Business Owner',
        assignedShopIds: [],
        permissions: ['manage_business_settings'],
        status: 'active',
        schemaVersion: 1,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
      },
    },
  ];

  for (const p of profiles) {
    const docPath = `users/${p.uid}`;
    adminCtx.tracker.trackFirestoreDoc(docPath);
    await adminCtx.db.doc(docPath).set(p.data);
  }

  // Track baseline objects & upload initial branding fixtures via Admin SDK
  for (const objPath of [
    ALPHA_BIZ_LOGO_PATH,
    ALPHA_SHOP1_LOGO_PATH,
    ALPHA_SHOP2_LOGO_PATH,
    BETA_BIZ_LOGO_PATH,
  ]) {
    adminCtx.tracker.trackStorageObject(objPath);
    await adminCtx.bucket.file(objPath).save(Buffer.from(TINY_PNG), {
      contentType: 'image/png',
    });
  }

  // Sign in Client SDK contexts
  stagingAdminClient = clients.getOrCreateActorContext('staging-admin');
  const token = await adminCtx.auth.createCustomToken(STAGING_ADMIN_UID);
  await signInWithCustomToken(stagingAdminClient.auth, token);

  prodAdminImposterClient = clients.getOrCreateActorContext('prod-admin-imp');
  await signInWithEmailAndPassword(
    prodAdminImposterClient.auth,
    PROD_ADMIN_EMAIL,
    TEST_PASSWORD
  );

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

  cashierAClient = clients.getOrCreateActorContext('cashier-a');
  await signInWithEmailAndPassword(
    cashierAClient.auth,
    `${CASHIER_ALPHA_UID}@staging-test.smartmind.local`,
    TEST_PASSWORD
  );

  suspendedClient = clients.getOrCreateActorContext('suspended-a');
  await signInWithEmailAndPassword(
    suspendedClient.auth,
    `${SUSPENDED_ALPHA_UID}@staging-test.smartmind.local`,
    TEST_PASSWORD
  );

  unverifiedOwnerClient = clients.getOrCreateActorContext('unverified-owner');
  await signInWithEmailAndPassword(
    unverifiedOwnerClient.auth,
    `${UNVERIFIED_OWNER_UID}@staging-test.smartmind.local`,
    TEST_PASSWORD
  );

  ownerBClient = clients.getOrCreateActorContext('owner-b');
  await signInWithEmailAndPassword(
    ownerBClient.auth,
    `${OWNER_BETA_UID}@staging-test.smartmind.local`,
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
        `[LIVE_STAGING_STORAGE_RULES] Cleaned up run=${RUN_ID}: deletedDocs=${cleanup.deletedDocs} deletedObjects=${cleanup.deletedObjects} deletedUsers=${cleanup.deletedUsers}`
      );
    }
  }
});

test('1. Staging Platform Admin (smart@smartmindconcept.com) can access and update branding across all tenants in staging', async () => {
  await assertStorageAllowed(
    uploadBytes(ref(stagingAdminClient.storage, ALPHA_BIZ_LOGO_PATH), TINY_PNG, {
      contentType: 'image/png',
    }),
    'Storage 1 admin upload Alpha logo'
  );
  await assertStorageAllowed(
    uploadBytes(ref(stagingAdminClient.storage, BETA_BIZ_LOGO_PATH), TINY_PNG, {
      contentType: 'image/png',
    }),
    'Storage 1 admin upload Beta logo'
  );
  const downloaded = await assertStorageAllowed(
    getBytes(ref(stagingAdminClient.storage, BETA_BIZ_LOGO_PATH)),
    'Storage 1 admin read Beta logo'
  );
  assert.equal(downloaded.byteLength, TINY_PNG.byteLength);
});

test('2. Production administrator identity (smartnwokolo@gmail.com) is DENIED as Platform Admin in staging storage rules', async () => {
  await assertStorageDenied(
    uploadBytes(
      ref(prodAdminImposterClient.storage, ALPHA_BIZ_LOGO_PATH),
      TINY_PNG,
      { contentType: 'image/png' }
    ),
    'Storage 2 prod admin email upload denied'
  );
  await assertStorageDenied(
    getBytes(ref(prodAdminImposterClient.storage, ALPHA_BIZ_LOGO_PATH)),
    'Storage 2 prod admin email read denied'
  );
});

test('3. Active business owner uploads their own business logo -> SUCCEEDS', async () => {
  const res = await assertStorageAllowed(
    uploadBytes(ref(ownerAClient.storage, ALPHA_BIZ_LOGO_PATH), TINY_PNG, {
      contentType: 'image/png',
    }),
    'Storage 3 ownerA upload own logo'
  );
  assert.equal(res.metadata.contentType, 'image/png');
});

test("4. Business owner cannot access or upload another tenant's logo -> DENIED", async () => {
  await assertStorageDenied(
    getBytes(ref(ownerAClient.storage, BETA_BIZ_LOGO_PATH)),
    'Storage 4 ownerA read Beta logo'
  );
  await assertStorageDenied(
    uploadBytes(ref(ownerAClient.storage, BETA_BIZ_LOGO_PATH), TINY_PNG, {
      contentType: 'image/png',
    }),
    'Storage 4 ownerA upload Beta logo'
  );
});

test('5. Assigned shop manager uploads an assigned shop logo -> SUCCEEDS', async () => {
  const res = await assertStorageAllowed(
    uploadBytes(ref(mgrAClient.storage, ALPHA_SHOP1_LOGO_PATH), TINY_PNG, {
      contentType: 'image/webp',
    }),
    'Storage 5 mgrA upload assigned shop 1 logo'
  );
  assert.equal(res.metadata.contentType, 'image/webp');
});

test('6. Unassigned shop manager can read tenant shop logos but is DENIED write to an unassigned shop', async () => {
  const bytes = await assertStorageAllowed(
    getBytes(ref(mgrAClient.storage, ALPHA_SHOP2_LOGO_PATH)),
    'Storage 6 mgrA read unassigned shop 2 logo'
  );
  assert.ok(bytes.byteLength > 0);

  await assertStorageDenied(
    uploadBytes(ref(mgrAClient.storage, ALPHA_SHOP2_LOGO_PATH), TINY_PNG, {
      contentType: 'image/png',
    }),
    'Storage 6 mgrA upload unassigned shop 2 logo denied'
  );
});

test('7. Cashier can read tenant logos for receipt rendering but is DENIED upload and deletion', async () => {
  const bizBytes = await assertStorageAllowed(
    getBytes(ref(cashierAClient.storage, ALPHA_BIZ_LOGO_PATH)),
    'Storage 7 cashierA read business logo'
  );
  assert.ok(bizBytes.byteLength > 0);

  const shopBytes = await assertStorageAllowed(
    getBytes(ref(cashierAClient.storage, ALPHA_SHOP1_LOGO_PATH)),
    'Storage 7 cashierA read shop logo'
  );
  assert.ok(shopBytes.byteLength > 0);

  await assertStorageDenied(
    uploadBytes(ref(cashierAClient.storage, ALPHA_BIZ_LOGO_PATH), TINY_PNG, {
      contentType: 'image/png',
    }),
    'Storage 7 cashierA upload denied'
  );
  await assertStorageDenied(
    deleteObject(ref(cashierAClient.storage, ALPHA_BIZ_LOGO_PATH)),
    'Storage 7 cashierA delete denied'
  );
});

test('8. Inactive/suspended user is DENIED read and write access', async () => {
  await assertStorageDenied(
    getBytes(ref(suspendedClient.storage, ALPHA_BIZ_LOGO_PATH)),
    'Storage 8 suspended user read denied'
  );
  await assertStorageDenied(
    uploadBytes(ref(suspendedClient.storage, ALPHA_BIZ_LOGO_PATH), TINY_PNG, {
      contentType: 'image/png',
    }),
    'Storage 8 suspended user upload denied'
  );
});

test('9. Unverified user email is DENIED read and write access', async () => {
  await assertStorageDenied(
    getBytes(ref(unverifiedOwnerClient.storage, ALPHA_BIZ_LOGO_PATH)),
    'Storage 9 unverified owner read denied'
  );
  await assertStorageDenied(
    uploadBytes(ref(unverifiedOwnerClient.storage, ALPHA_BIZ_LOGO_PATH), TINY_PNG, {
      contentType: 'image/png',
    }),
    'Storage 9 unverified owner upload denied'
  );
});

test('10. Arbitrary filenames in branding folder are DENIED', async () => {
  const invalidPath = `businesses/${BIZ_ALPHA_ID}/branding/evil-payload.html`;
  await assertStorageDenied(
    uploadBytes(ref(ownerAClient.storage, invalidPath), TINY_PNG, {
      contentType: 'image/png',
    }),
    'Storage 10 arbitrary filename upload denied'
  );
});

test('11. Files above 512 KB limit are DENIED', async () => {
  const oversized = new Uint8Array(520 * 1024);
  oversized.set(TINY_PNG, 0);
  await assertStorageDenied(
    uploadBytes(ref(ownerAClient.storage, ALPHA_BIZ_LOGO_PATH), oversized, {
      contentType: 'image/png',
    }),
    'Storage 11 oversized >512KB file denied'
  );
});

test('12. Unsupported MIME types are DENIED', async () => {
  const textPayload = new TextEncoder().encode('<svg>not-allowed</svg>');
  await assertStorageDenied(
    uploadBytes(ref(ownerAClient.storage, ALPHA_BIZ_LOGO_PATH), textPayload, {
      contentType: 'image/svg+xml',
    }),
    'Storage 12 unsupported SVG MIME type denied'
  );
  await assertStorageDenied(
    uploadBytes(ref(ownerAClient.storage, ALPHA_BIZ_LOGO_PATH), textPayload, {
      contentType: 'application/javascript',
    }),
    'Storage 12 unsupported JS MIME type denied'
  );
});

test('13. Unauthenticated requests are DENIED across all paths', async () => {
  await assertStorageDenied(
    getBytes(ref(unauthedClient.storage, ALPHA_BIZ_LOGO_PATH)),
    'Storage 13 unauth read denied'
  );
  await assertStorageDenied(
    uploadBytes(ref(unauthedClient.storage, ALPHA_BIZ_LOGO_PATH), TINY_PNG, {
      contentType: 'image/png',
    }),
    'Storage 13 unauth upload denied'
  );
});

test('14. Authorized logo replacement and overwrite work correctly', async () => {
  const replacementBytes = new Uint8Array([...TINY_PNG, 0x00]);
  await assertStorageAllowed(
    uploadBytes(ref(ownerAClient.storage, ALPHA_BIZ_LOGO_PATH), replacementBytes, {
      contentType: 'image/jpeg',
    }),
    'Storage 14 overwrite logo as JPEG'
  );
  const downloaded = await assertStorageAllowed(
    getBytes(ref(ownerAClient.storage, ALPHA_BIZ_LOGO_PATH)),
    'Storage 14 read overwritten logo'
  );
  assert.equal(downloaded.byteLength, replacementBytes.byteLength);
});

test('15. Authorized deletion works correctly and removes the object', async () => {
  await assertStorageAllowed(
    deleteObject(ref(ownerAClient.storage, ALPHA_BIZ_LOGO_PATH)),
    'Storage 15 ownerA delete own business logo'
  );

  // Confirm deleted object no longer exists via Admin SDK
  const [exists] = await adminCtx.bucket.file(ALPHA_BIZ_LOGO_PATH).exists();
  assert.equal(exists, false);

  // Cross-tenant delete by ownerB remains denied on Alpha shop logo
  await assertStorageDenied(
    deleteObject(ref(ownerBClient.storage, ALPHA_SHOP1_LOGO_PATH)),
    'Storage 15 ownerB denied deleting Alpha shop logo'
  );
});
