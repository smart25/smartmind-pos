/**
 * SmartMind POS — 6-Check Live Staging Smoke Suite
 *
 * Targets ACTUAL `smartmind-pos-staging` (never emulators, never production).
 * Requires `STAGING_FIREBASE_SERVICE_ACCOUNT_PATH` (or `GOOGLE_APPLICATION_CREDENTIALS`)
 * pointing to a staging-only service account JSON for `smartmind-pos-staging`.
 *
 * All test data is strictly scoped under `smartmind-staging-test-{runId}` and
 * cleaned up in `after()` without touching existing staging accounts or records.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, test } from 'node:test';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
import {
  initStagingAdminContext,
  StagingAdminContext,
} from './stagingAdminSdk';
import {
  createStagingClientContext,
  StagingClientContext,
  StagingClientRegistry,
} from './stagingClientSdk';
import {
  loadAndValidateStagingTestEnv,
  STAGING_FIRESTORE_DATABASE_ID,
  STAGING_FUNCTIONS_REGION,
  STAGING_PROJECT_ID,
  ValidatedStagingTestEnv,
} from './stagingTestEnv';

const RUN_ID = `smoke-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const NOW_ISO = new Date().toISOString();

let env: ValidatedStagingTestEnv;
let adminCtx: StagingAdminContext;
let clients: StagingClientRegistry;

let ownerAClient: StagingClientContext;
let anonClient: StagingClientContext;

const OWNER_A_UID = `${`smartmind-staging-test-${RUN_ID}`}-owner-a`;
const OWNER_B_UID = `${`smartmind-staging-test-${RUN_ID}`}-owner-b`;
const OWNER_A_EMAIL = `${OWNER_A_UID}@staging-test.smartmind.local`;
const OWNER_B_EMAIL = `${OWNER_B_UID}@staging-test.smartmind.local`;
const TEST_PASSWORD = `SmTest!${crypto.randomBytes(12).toString('hex')}`;

const BIZ_A_ID = `smartmind-staging-test-${RUN_ID}-biz-a`;
const SHOP_A_ID = `smartmind-staging-test-${RUN_ID}-shop-a1`;
const BIZ_B_ID = `smartmind-staging-test-${RUN_ID}-biz-b`;
const SHOP_B_ID = `smartmind-staging-test-${RUN_ID}-shop-b1`;

const TINY_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

before(async () => {
  env = loadAndValidateStagingTestEnv();
  adminCtx = initStagingAdminContext({ runId: RUN_ID, env });
  clients = new StagingClientRegistry(RUN_ID, env);

  // Create isolated ephemeral Auth actors and register for scoped cleanup
  await adminCtx.auth.createUser({
    uid: OWNER_A_UID,
    email: OWNER_A_EMAIL,
    password: TEST_PASSWORD,
    displayName: 'Smoke Test Owner A',
    emailVerified: true,
    disabled: false,
  });
  adminCtx.tracker.trackAuthUser(OWNER_A_UID);

  await adminCtx.auth.createUser({
    uid: OWNER_B_UID,
    email: OWNER_B_EMAIL,
    password: TEST_PASSWORD,
    displayName: 'Smoke Test Owner B',
    emailVerified: true,
    disabled: false,
  });
  adminCtx.tracker.trackAuthUser(OWNER_B_UID);

  // Seed run-scoped Firestore profiles, businesses, and shops
  const userAPath = adminCtx.tracker.trackFirestoreDoc(`users/${OWNER_A_UID}`);
  await adminCtx.db.doc(userAPath).set({
    id: OWNER_A_UID,
    businessId: BIZ_A_ID,
    username: 'smoke_owner_a',
    email: OWNER_A_EMAIL,
    fullName: 'Smoke Test Owner A',
    role: 'business_owner',
    roleLabel: 'Business Owner',
    assignedShopIds: [SHOP_A_ID],
    permissions: [],
    status: 'active',
    schemaVersion: 1,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  });

  const userBPath = adminCtx.tracker.trackFirestoreDoc(`users/${OWNER_B_UID}`);
  await adminCtx.db.doc(userBPath).set({
    id: OWNER_B_UID,
    businessId: BIZ_B_ID,
    username: 'smoke_owner_b',
    email: OWNER_B_EMAIL,
    fullName: 'Smoke Test Owner B',
    role: 'business_owner',
    roleLabel: 'Business Owner',
    assignedShopIds: [SHOP_B_ID],
    permissions: [],
    status: 'active',
    schemaVersion: 1,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  });

  const bizAPath = adminCtx.tracker.trackFirestoreDoc(`businesses/${BIZ_A_ID}`);
  await adminCtx.db.doc(bizAPath).set({
    id: BIZ_A_ID,
    name: 'Smoke Test Business A',
    businessType: 'Retail',
    ownerUserId: OWNER_A_UID,
    ownerName: 'Smoke Test Owner A',
    ownerEmail: OWNER_A_EMAIL,
    contactEmail: OWNER_A_EMAIL,
    primaryPhone: '+2348000000001',
    headquartersAddress: '1 Test Avenue, Lagos',
    currencyCode: 'NGN',
    currencySymbol: '₦',
    defaultTaxRatePercent: 7.5,
    status: 'active',
    schemaVersion: 1,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  });

  const shopAPath = adminCtx.tracker.trackFirestoreDoc(
    `businesses/${BIZ_A_ID}/shops/${SHOP_A_ID}`
  );
  await adminCtx.db.doc(shopAPath).set({
    id: SHOP_A_ID,
    businessId: BIZ_A_ID,
    code: 'SMK-A1',
    name: 'Smoke Test Shop A1',
    category: 'Retail',
    locationCity: 'Lagos',
    address: '1 Test Avenue, Lagos',
    phone: '+2348000000001',
    managerName: 'Smoke Manager A1',
    status: 'active',
    terminalId: 'TERM-SMK-A1',
    taxRatePercent: 7.5,
    schemaVersion: 1,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  });

  const bizBPath = adminCtx.tracker.trackFirestoreDoc(`businesses/${BIZ_B_ID}`);
  await adminCtx.db.doc(bizBPath).set({
    id: BIZ_B_ID,
    name: 'Smoke Test Business B',
    businessType: 'Retail',
    ownerUserId: OWNER_B_UID,
    ownerName: 'Smoke Test Owner B',
    ownerEmail: OWNER_B_EMAIL,
    contactEmail: OWNER_B_EMAIL,
    primaryPhone: '+2348000000002',
    headquartersAddress: '2 Test Avenue, Abuja',
    currencyCode: 'NGN',
    currencySymbol: '₦',
    defaultTaxRatePercent: 7.5,
    status: 'active',
    schemaVersion: 1,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  });

  const shopBPath = adminCtx.tracker.trackFirestoreDoc(
    `businesses/${BIZ_B_ID}/shops/${SHOP_B_ID}`
  );
  await adminCtx.db.doc(shopBPath).set({
    id: SHOP_B_ID,
    businessId: BIZ_B_ID,
    code: 'SMK-B1',
    name: 'Smoke Test Shop B1',
    category: 'Retail',
    locationCity: 'Abuja',
    address: '2 Test Avenue, Abuja',
    phone: '+2348000000002',
    managerName: 'Smoke Manager B1',
    status: 'active',
    terminalId: 'TERM-SMK-B1',
    taxRatePercent: 7.5,
    schemaVersion: 1,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  });

  // Pre-seed Business B Storage logo via Admin SDK so unauthorized read tests permission denial (not object-not-found)
  const logoBPath = adminCtx.tracker.trackStorageObject(
    `businesses/${BIZ_B_ID}/branding/business-logo`
  );
  await adminCtx.bucket.file(logoBPath).save(Buffer.from(TINY_PNG), {
    contentType: 'image/png',
  });

  ownerAClient = clients.getOrCreateActorContext('owner-a');
  anonClient = clients.getOrCreateActorContext('anon');
});

after(async () => {
  await clients?.disposeAll();
  if (adminCtx) {
    try {
      const cleanup = await adminCtx.tracker.cleanupTrackedFixtures(
        adminCtx.db,
        adminCtx.bucket,
        adminCtx.auth
      );
      console.info(
        `[Staging Smoke Cleanup] run=${RUN_ID} deletedDocs=${cleanup.deletedDocs} deletedObjects=${cleanup.deletedObjects} deletedUsers=${cleanup.deletedUsers}`
      );
    } finally {
      await adminCtx.dispose();
    }
  }
});

test('1. Verify staging client initialization (project, DB, region, no emulators)', () => {
  assert.equal(ownerAClient.app.options.projectId, STAGING_PROJECT_ID);
  assert.equal(ownerAClient.env.firestoreDatabaseId, STAGING_FIRESTORE_DATABASE_ID);
  assert.equal(ownerAClient.env.functionsRegion, STAGING_FUNCTIONS_REGION);
  assert.equal(ownerAClient.env.useFirebaseEmulators, false);
});

test('2. Verify authenticated staging user identity via live Firebase Auth', async () => {
  const credential = await signInWithEmailAndPassword(
    ownerAClient.auth,
    OWNER_A_EMAIL,
    TEST_PASSWORD
  );
  assert.equal(credential.user.uid, OWNER_A_UID);
  assert.equal(credential.user.email, OWNER_A_EMAIL);
  assert.equal(credential.user.emailVerified, true);
});

test('3. Verify expected Firestore database (default) contains seeded staging tenant', async () => {
  const userSnap = await getDoc(doc(ownerAClient.db, 'users', OWNER_A_UID));
  assert.equal(userSnap.exists(), true);
  assert.equal(userSnap.data()?.businessId, BIZ_A_ID);
  assert.equal(userSnap.data()?.role, 'business_owner');
});

test('4. Authorized read: Business Owner A reads own business and shop via Client SDK', async () => {
  const bizSnap = await getDoc(doc(ownerAClient.db, 'businesses', BIZ_A_ID));
  assert.equal(bizSnap.exists(), true);
  assert.equal(bizSnap.data()?.ownerUserId, OWNER_A_UID);

  const shopSnap = await getDoc(
    doc(ownerAClient.db, 'businesses', BIZ_A_ID, 'shops', SHOP_A_ID)
  );
  assert.equal(shopSnap.exists(), true);
  assert.equal(shopSnap.data()?.businessId, BIZ_A_ID);
});

test('5. Unauthorized read: Business Owner A and anonymous client are denied Business B', async () => {
  await assert.rejects(
    () => getDoc(doc(ownerAClient.db, 'businesses', BIZ_B_ID)),
    (err: any) => err?.code === 'permission-denied'
  );

  await assert.rejects(
    () => getDoc(doc(anonClient.db, 'businesses', BIZ_A_ID)),
    (err: any) => err?.code === 'permission-denied'
  );
});

test('6. Storage permission check: Owner A uploads/reads own logo, denied Business B logo', async () => {
  const ownLogoPath = adminCtx.tracker.trackStorageObject(
    `businesses/${BIZ_A_ID}/branding/business-logo`
  );
  const ownLogoRef = ref(ownerAClient.storage, ownLogoPath);

  await uploadBytes(ownLogoRef, TINY_PNG, { contentType: 'image/png' });
  const downloaded = await getBytes(ownLogoRef);
  assert.equal(downloaded.byteLength, TINY_PNG.byteLength);

  const otherLogoRef = ref(
    ownerAClient.storage,
    `businesses/${BIZ_B_ID}/branding/business-logo`
  );
  await assert.rejects(
    () => getBytes(otherLogoRef),
    (err: any) => err?.code === 'storage/unauthorized'
  );
  await assert.rejects(
    () => uploadBytes(otherLogoRef, TINY_PNG, { contentType: 'image/png' }),
    (err: any) => err?.code === 'storage/unauthorized'
  );
});
