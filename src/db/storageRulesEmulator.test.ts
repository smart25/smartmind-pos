/**
 * SmartMind POS — Staging Firebase Storage & Firestore Emulator Security Rules Test Suite
 *
 * Target Firebase Project ID: smartmind-pos-staging
 * Target Firestore Database: (default)
 * Rules files loaded: storage.staging.rules & firestore.staging.rules
 * Emulator Ports: Firestore (8085), Storage (9199)
 *
 * IMPORTANT:
 * - Connects strictly to local Firebase Emulators using @firebase/rules-unit-testing.
 * - Tests actual Storage rules evaluation, cross-service Firestore lookups (firestore.get),
 *   exact path matching, file size limits, MIME type validation, tenant isolation, and environment identity isolation.
 * - All read-denial test cases seed the target Storage objects prior to testing, ensuring that
 *   unauthorized reads fail strictly due to security rule permission denial rather than missing objects.
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
import { ref, uploadBytes, deleteObject, getBytes } from 'firebase/storage';

export const STAGING_PROJECT_ID = 'smartmind-pos-staging';

// Environment Admin Identities
export const STAGING_ADMIN_EMAIL = 'smart@smartmindconcept.com';
export const PROD_ADMIN_EMAIL = 'smartnwokolo@gmail.com';

const DEFAULT_EMULATOR_HOST = '127.0.0.1';
const DEFAULT_FIRESTORE_PORT = 8085;
const DEFAULT_STORAGE_PORT = 9199;

// Canonical Test Actor UIDs & Tenant IDs
export const STAGING_ADMIN_UID = 'uid-staging-admin-smart';
export const PROD_ADMIN_UID = 'uid-prod-admin-smart';

export const BIZ_ALPHA_ID = 'biz-alpha-01';
export const SHOP_ALPHA_1_ID = 'shop-alpha-01';
export const SHOP_ALPHA_2_ID = 'shop-alpha-02';

export const OWNER_ALPHA_UID = 'uid-owner-alpha-01';
export const MGR_ALPHA_UID = 'uid-mgr-alpha-01';
export const CASHIER_ALPHA_UID = 'uid-cashier-alpha-01';
export const SUSPENDED_ALPHA_UID = 'uid-suspended-alpha-01';

export const BIZ_BETA_ID = 'biz-beta-02';
export const SHOP_BETA_1_ID = 'shop-beta-01';
export const OWNER_BETA_UID = 'uid-owner-beta-02';

const NOW_ISO = '2026-11-04T12:00:00.000Z';

function makeBuffer(sizeBytes: number): Uint8Array {
  const buf = new Uint8Array(sizeBytes);
  buf.fill(0x65); // ASCII 'e'
  return buf;
}

const SMALL_PNG_BUFFER = makeBuffer(10 * 1024); // 10 KB PNG
const SMALL_JPEG_BUFFER = makeBuffer(15 * 1024); // 15 KB JPEG
const SMALL_WEBP_BUFFER = makeBuffer(20 * 1024); // 20 KB WebP
const OVERSIZED_BUFFER = makeBuffer(600 * 1024); // 600 KB (> 512 KB limit)

function makeUserProfile(overrides: {
  id: string;
  businessId: string;
  email: string;
  fullName: string;
  role: 'platform_admin' | 'business_owner' | 'shop_manager' | 'cashier';
  assignedShopIds?: string[];
  permissions?: string[];
  status?: 'active' | 'suspended';
}) {
  return {
    id: overrides.id,
    businessId: overrides.businessId,
    username: overrides.email.split('@')[0],
    email: overrides.email,
    fullName: overrides.fullName,
    role: overrides.role,
    roleLabel: overrides.role,
    assignedShopIds: overrides.assignedShopIds ?? [],
    permissions: overrides.permissions ?? [],
    status: overrides.status ?? 'active',
    schemaVersion: 1,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  };
}

let testEnv: RulesTestEnvironment;
let stagingStorageRules: string;
let stagingFirestoreRules: string;

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

async function seedFirestoreProfiles(env: RulesTestEnvironment) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    // 1. Staging Admin (smart@smartmindconcept.com)
    await db.doc(`users/${STAGING_ADMIN_UID}`).set(
      makeUserProfile({
        id: STAGING_ADMIN_UID,
        businessId: 'PLATFORM',
        email: STAGING_ADMIN_EMAIL,
        fullName: 'Staging Platform Admin',
        role: 'platform_admin',
      })
    );

    // 2. Production Admin Profile in Staging Firestore (smartnwokolo@gmail.com)
    await db.doc(`users/${PROD_ADMIN_UID}`).set(
      makeUserProfile({
        id: PROD_ADMIN_UID,
        businessId: 'PLATFORM',
        email: PROD_ADMIN_EMAIL,
        fullName: 'Production Platform Admin',
        role: 'platform_admin',
      })
    );

    // 3. Tenant Alpha Profiles
    await db.doc(`users/${OWNER_ALPHA_UID}`).set(
      makeUserProfile({
        id: OWNER_ALPHA_UID,
        businessId: BIZ_ALPHA_ID,
        email: 'owner@alpha.ng',
        fullName: 'Adaeze Owner',
        role: 'business_owner',
        assignedShopIds: [SHOP_ALPHA_1_ID, SHOP_ALPHA_2_ID],
      })
    );

    await db.doc(`users/${MGR_ALPHA_UID}`).set(
      makeUserProfile({
        id: MGR_ALPHA_UID,
        businessId: BIZ_ALPHA_ID,
        email: 'manager@alpha.ng',
        fullName: 'Chidi Manager',
        role: 'shop_manager',
        assignedShopIds: [SHOP_ALPHA_1_ID],
      })
    );

    await db.doc(`users/${CASHIER_ALPHA_UID}`).set(
      makeUserProfile({
        id: CASHIER_ALPHA_UID,
        businessId: BIZ_ALPHA_ID,
        email: 'cashier@alpha.ng',
        fullName: 'Bolanle Cashier',
        role: 'cashier',
        assignedShopIds: [SHOP_ALPHA_1_ID],
      })
    );

    await db.doc(`users/${SUSPENDED_ALPHA_UID}`).set(
      makeUserProfile({
        id: SUSPENDED_ALPHA_UID,
        businessId: BIZ_ALPHA_ID,
        email: 'suspended@alpha.ng',
        fullName: 'Suspended Staff',
        role: 'business_owner',
        status: 'suspended',
      })
    );

    // 4. Tenant Beta Profiles
    await db.doc(`users/${OWNER_BETA_UID}`).set(
      makeUserProfile({
        id: OWNER_BETA_UID,
        businessId: BIZ_BETA_ID,
        email: 'owner@beta.ng',
        fullName: 'Tunde Beta Owner',
        role: 'business_owner',
        assignedShopIds: [SHOP_BETA_1_ID],
      })
    );
  });
}

/**
 * Seed existing logo objects into Storage bypassing security rules.
 * Guarantees that subsequent read-denial tests evaluate permission rules rather than missing objects.
 */
async function seedStorageLogos(env: RulesTestEnvironment) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const s = ctx.storage();
    await uploadBytes(ref(s, `businesses/${BIZ_ALPHA_ID}/branding/business-logo`), SMALL_PNG_BUFFER, { contentType: 'image/png' });
    await uploadBytes(ref(s, `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/branding/shop-logo`), SMALL_PNG_BUFFER, { contentType: 'image/png' });
    await uploadBytes(ref(s, `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_2_ID}/branding/shop-logo`), SMALL_PNG_BUFFER, { contentType: 'image/png' });

    await uploadBytes(ref(s, `businesses/${BIZ_BETA_ID}/branding/business-logo`), SMALL_PNG_BUFFER, { contentType: 'image/png' });
    await uploadBytes(ref(s, `businesses/${BIZ_BETA_ID}/shops/${SHOP_BETA_1_ID}/branding/shop-logo`), SMALL_PNG_BUFFER, { contentType: 'image/png' });
  });
}

before(async () => {
  const isFirestoreReady = await isPortReachable(DEFAULT_EMULATOR_HOST, DEFAULT_FIRESTORE_PORT);
  const isStorageReady = await isPortReachable(DEFAULT_EMULATOR_HOST, DEFAULT_STORAGE_PORT);

  if (!isFirestoreReady || !isStorageReady) {
    throw new Error(
      `EMULATORS_NOT_RUNNING: Firebase Firestore (8085) or Storage (9199) emulator is not reachable on ${DEFAULT_EMULATOR_HOST}. ` +
        `Run tests via: npm run test:storage:rules`
    );
  }

  stagingStorageRules = fs.readFileSync(path.resolve(process.cwd(), 'storage.staging.rules'), 'utf8');
  stagingFirestoreRules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.staging.rules'), 'utf8');

  testEnv = await initializeTestEnvironment({
    projectId: STAGING_PROJECT_ID,
    firestore: {
      host: DEFAULT_EMULATOR_HOST,
      port: DEFAULT_FIRESTORE_PORT,
      rules: stagingFirestoreRules,
    },
    storage: {
      host: DEFAULT_EMULATOR_HOST,
      port: DEFAULT_STORAGE_PORT,
      rules: stagingStorageRules,
    },
  });
});

beforeEach(async () => {
  if (testEnv) {
    await testEnv.clearFirestore();
    await testEnv.clearStorage();
    await seedFirestoreProfiles(testEnv);
    await seedStorageLogos(testEnv);
  }
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

function getAuthedStorage(env: RulesTestEnvironment, uid: string, email: string, emailVerified = true) {
  const ctx = env.authenticatedContext(uid, {
    email,
    email_verified: emailVerified,
  });
  return ctx.storage();
}

function getUnauthedStorage(env: RulesTestEnvironment) {
  return env.unauthenticatedContext().storage();
}

// ============================================================================
// STAGING STORAGE EMULATOR SECURITY RULES TEST SUITE (15 SCENARIOS)
// ============================================================================

test('1. Staging Platform Admin (smart@smartmindconcept.com) can access and update branding across all tenants in staging', async () => {
  const storage = getAuthedStorage(testEnv, STAGING_ADMIN_UID, STAGING_ADMIN_EMAIL, true);

  // Business logo upload & read for Tenant Alpha
  const alphaBizLogoRef = ref(storage, `businesses/${BIZ_ALPHA_ID}/branding/business-logo`);
  await assertSucceeds(getBytes(alphaBizLogoRef)); // Pre-seeded object exists
  await assertSucceeds(uploadBytes(alphaBizLogoRef, SMALL_PNG_BUFFER, { contentType: 'image/png' }));

  // Shop logo upload & read for Tenant Beta
  const betaShopLogoRef = ref(storage, `businesses/${BIZ_BETA_ID}/shops/${SHOP_BETA_1_ID}/branding/shop-logo`);
  await assertSucceeds(getBytes(betaShopLogoRef)); // Pre-seeded object exists
  await assertSucceeds(uploadBytes(betaShopLogoRef, SMALL_JPEG_BUFFER, { contentType: 'image/jpeg' }));
});

test('2. Production administrator identity (smartnwokolo@gmail.com) is DENIED as Platform Admin in staging storage rules', async () => {
  const prodAdminStorage = getAuthedStorage(testEnv, PROD_ADMIN_UID, PROD_ADMIN_EMAIL, true);
  const alphaOwnerStorage = getAuthedStorage(testEnv, OWNER_ALPHA_UID, 'owner@alpha.ng', true);

  const alphaBizLogoRef = ref(prodAdminStorage, `businesses/${BIZ_ALPHA_ID}/branding/business-logo`);

  // Confirm target logo exists and is readable by authorized tenant owner
  await assertSucceeds(getBytes(ref(alphaOwnerStorage, `businesses/${BIZ_ALPHA_ID}/branding/business-logo`)));

  // Production admin attempting read & write in staging environment must fail
  await assertFails(getBytes(alphaBizLogoRef));
  await assertFails(uploadBytes(alphaBizLogoRef, SMALL_PNG_BUFFER, { contentType: 'image/png' }));
});

test('3. Active business owner uploads their own business logo -> SUCCEEDS', async () => {
  const storage = getAuthedStorage(testEnv, OWNER_ALPHA_UID, 'owner@alpha.ng', true);
  const logoRef = ref(storage, `businesses/${BIZ_ALPHA_ID}/branding/business-logo`);

  // Authorized read of pre-seeded logo
  await assertSucceeds(getBytes(logoRef));

  // Authorized replacement write
  await assertSucceeds(uploadBytes(logoRef, SMALL_PNG_BUFFER, { contentType: 'image/png' }));
});

test('4. Business owner cannot access or upload another tenant\'s logo -> DENIED', async () => {
  const ownerAStorage = getAuthedStorage(testEnv, OWNER_ALPHA_UID, 'owner@alpha.ng', true);
  const ownerBStorage = getAuthedStorage(testEnv, OWNER_BETA_UID, 'owner@beta.ng', true);

  const betaLogoRef = ref(ownerAStorage, `businesses/${BIZ_BETA_ID}/branding/business-logo`);

  // Confirm target logo exists and is readable by Tenant Beta owner
  await assertSucceeds(getBytes(ref(ownerBStorage, `businesses/${BIZ_BETA_ID}/branding/business-logo`)));

  // Tenant Alpha owner denied read & write on Tenant Beta logo
  await assertFails(getBytes(betaLogoRef));
  await assertFails(uploadBytes(betaLogoRef, SMALL_PNG_BUFFER, { contentType: 'image/png' }));
});

test('5. Assigned shop manager uploads an assigned shop logo -> SUCCEEDS', async () => {
  const storage = getAuthedStorage(testEnv, MGR_ALPHA_UID, 'manager@alpha.ng', true);
  const shopLogoRef = ref(storage, `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/branding/shop-logo`);

  // Authorized manager read & write on assigned shop
  await assertSucceeds(getBytes(shopLogoRef));
  await assertSucceeds(uploadBytes(shopLogoRef, SMALL_JPEG_BUFFER, { contentType: 'image/jpeg' }));
});

test('6. Unassigned shop manager can read tenant shop logos but is DENIED write to an unassigned shop', async () => {
  const mgrAStorage = getAuthedStorage(testEnv, MGR_ALPHA_UID, 'manager@alpha.ng', true);
  const ownerAStorage = getAuthedStorage(testEnv, OWNER_ALPHA_UID, 'owner@alpha.ng', true);

  const shop2LogoRef = ref(mgrAStorage, `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_2_ID}/branding/shop-logo`);

  // Confirm Shop 2 logo exists and is readable by business owner and tenant staff
  await assertSucceeds(getBytes(ref(ownerAStorage, `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_2_ID}/branding/shop-logo`)));
  await assertSucceeds(getBytes(shop2LogoRef)); // Tenant member read is permitted for receipt rendering

  // Manager assigned only to Shop 1 is denied write on Shop 2
  await assertFails(uploadBytes(shop2LogoRef, SMALL_JPEG_BUFFER, { contentType: 'image/jpeg' }));
});

test('7. Cashier can read tenant logos for receipt rendering but is DENIED upload and deletion', async () => {
  const cashierStorage = getAuthedStorage(testEnv, CASHIER_ALPHA_UID, 'cashier@alpha.ng', true);
  const ownerStorage = getAuthedStorage(testEnv, OWNER_ALPHA_UID, 'owner@alpha.ng', true);

  const shopLogoRef = ref(cashierStorage, `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/branding/shop-logo`);
  const bizLogoRef = ref(cashierStorage, `businesses/${BIZ_ALPHA_ID}/branding/business-logo`);

  // Confirm target logos exist
  await assertSucceeds(getBytes(ref(ownerStorage, `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/branding/shop-logo`)));
  await assertSucceeds(getBytes(ref(ownerStorage, `businesses/${BIZ_ALPHA_ID}/branding/business-logo`)));

  // Cashier tenant member read is permitted for POS & receipt display
  await assertSucceeds(getBytes(shopLogoRef));
  await assertSucceeds(getBytes(bizLogoRef));

  // Cashier write & delete are strictly denied
  await assertFails(uploadBytes(shopLogoRef, SMALL_PNG_BUFFER, { contentType: 'image/png' }));
  await assertFails(uploadBytes(bizLogoRef, SMALL_PNG_BUFFER, { contentType: 'image/png' }));
  await assertFails(deleteObject(shopLogoRef));
  await assertFails(deleteObject(bizLogoRef));
});

test('8. Inactive/suspended user is DENIED read and write access', async () => {
  const suspendedStorage = getAuthedStorage(testEnv, SUSPENDED_ALPHA_UID, 'suspended@alpha.ng', true);
  const ownerStorage = getAuthedStorage(testEnv, OWNER_ALPHA_UID, 'owner@alpha.ng', true);

  const bizLogoRef = ref(suspendedStorage, `businesses/${BIZ_ALPHA_ID}/branding/business-logo`);

  // Confirm target logo exists
  await assertSucceeds(getBytes(ref(ownerStorage, `businesses/${BIZ_ALPHA_ID}/branding/business-logo`)));

  // Suspended user denied read and write
  await assertFails(getBytes(bizLogoRef));
  await assertFails(uploadBytes(bizLogoRef, SMALL_PNG_BUFFER, { contentType: 'image/png' }));
});

test('9. Unverified user email is DENIED read and write access', async () => {
  const unverifiedOwnerStorage = getAuthedStorage(testEnv, OWNER_ALPHA_UID, 'owner@alpha.ng', false); // email_verified: false
  const verifiedOwnerStorage = getAuthedStorage(testEnv, OWNER_ALPHA_UID, 'owner@alpha.ng', true);

  const bizLogoRef = ref(unverifiedOwnerStorage, `businesses/${BIZ_ALPHA_ID}/branding/business-logo`);

  // Confirm target logo exists for verified session
  await assertSucceeds(getBytes(ref(verifiedOwnerStorage, `businesses/${BIZ_ALPHA_ID}/branding/business-logo`)));

  // Unverified email token session denied read and write
  await assertFails(getBytes(bizLogoRef));
  await assertFails(uploadBytes(bizLogoRef, SMALL_PNG_BUFFER, { contentType: 'image/png' }));
});

test('10. Arbitrary filenames in branding folder are DENIED', async () => {
  const storage = getAuthedStorage(testEnv, OWNER_ALPHA_UID, 'owner@alpha.ng', true);

  const arbitraryRef1 = ref(storage, `businesses/${BIZ_ALPHA_ID}/branding/custom-avatar.png`);
  const arbitraryRef2 = ref(storage, `businesses/${BIZ_ALPHA_ID}/shops/${SHOP_ALPHA_1_ID}/branding/logo.jpg`);

  await assertFails(uploadBytes(arbitraryRef1, SMALL_PNG_BUFFER, { contentType: 'image/png' }));
  await assertFails(uploadBytes(arbitraryRef2, SMALL_JPEG_BUFFER, { contentType: 'image/jpeg' }));
});

test('11. Files above 512 KB limit are DENIED', async () => {
  const storage = getAuthedStorage(testEnv, OWNER_ALPHA_UID, 'owner@alpha.ng', true);
  const bizLogoRef = ref(storage, `businesses/${BIZ_ALPHA_ID}/branding/business-logo`);

  // 600 KB file upload must fail
  await assertFails(uploadBytes(bizLogoRef, OVERSIZED_BUFFER, { contentType: 'image/png' }));
});

test('12. Unsupported MIME types are DENIED', async () => {
  const storage = getAuthedStorage(testEnv, OWNER_ALPHA_UID, 'owner@alpha.ng', true);
  const bizLogoRef = ref(storage, `businesses/${BIZ_ALPHA_ID}/branding/business-logo`);

  // GIF or PDF format must fail
  await assertFails(uploadBytes(bizLogoRef, SMALL_PNG_BUFFER, { contentType: 'image/gif' }));
  await assertFails(uploadBytes(bizLogoRef, SMALL_PNG_BUFFER, { contentType: 'application/pdf' }));
});

test('13. Unauthenticated requests are DENIED across all paths', async () => {
  const unauthedStorage = getUnauthedStorage(testEnv);
  const ownerStorage = getAuthedStorage(testEnv, OWNER_ALPHA_UID, 'owner@alpha.ng', true);

  const bizLogoRef = ref(unauthedStorage, `businesses/${BIZ_ALPHA_ID}/branding/business-logo`);

  // Confirm target logo exists
  await assertSucceeds(getBytes(ref(ownerStorage, `businesses/${BIZ_ALPHA_ID}/branding/business-logo`)));

  // Anonymous context denied read and write
  await assertFails(getBytes(bizLogoRef));
  await assertFails(uploadBytes(bizLogoRef, SMALL_PNG_BUFFER, { contentType: 'image/png' }));
});

test('14. Authorized logo replacement and overwrite work correctly', async () => {
  const storage = getAuthedStorage(testEnv, OWNER_ALPHA_UID, 'owner@alpha.ng', true);
  const bizLogoRef = ref(storage, `businesses/${BIZ_ALPHA_ID}/branding/business-logo`);

  // 1. Initial upload
  await assertSucceeds(uploadBytes(bizLogoRef, SMALL_PNG_BUFFER, { contentType: 'image/png' }));

  // 2. Overwrite / replacement with WebP logo
  await assertSucceeds(uploadBytes(bizLogoRef, SMALL_WEBP_BUFFER, { contentType: 'image/webp' }));

  // 3. Read back replaced logo
  await assertSucceeds(getBytes(bizLogoRef));
});

test('15. Authorized deletion works correctly and removes the object', async () => {
  const storage = getAuthedStorage(testEnv, OWNER_ALPHA_UID, 'owner@alpha.ng', true);
  const bizLogoRef = ref(storage, `businesses/${BIZ_ALPHA_ID}/branding/business-logo`);

  // 1. Confirm logo exists
  await assertSucceeds(getBytes(bizLogoRef));

  // 2. Authorized deletion by owner
  await assertSucceeds(deleteObject(bizLogoRef));

  // 3. Subsequent read fails with storage/object-not-found
  try {
    await getBytes(bizLogoRef);
    assert.fail('Expected getBytes to fail after deletion');
  } catch (err: any) {
    assert.ok(
      err.code === 'storage/object-not-found' || err.message?.includes('object-not-found'),
      `Unexpected error code: ${err.code}`
    );
  }
});