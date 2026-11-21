/**
 * SmartMind POS — Unit Tests for Isolated Live Staging Test Harness
 *
 * Purely local validation tests (zero network calls, zero Firebase connections, zero emulators).
 * Verifies that the staging test loader, client initializer guards, admin credential validator,
 * and scoped fixture tracker all fail closed on any cross-environment or emulator leak.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import prodAppletConfig from '../../../firebase-applet-config.json';
import {
  initStagingAdminContext,
  loadAndValidateStagingServiceAccount,
  ScopedStagingFixtureTracker,
} from './stagingAdminSdk';
import {
  FORBIDDEN_PRODUCTION_DATABASE_ID,
  FORBIDDEN_PRODUCTION_PROJECT_ID,
  loadAndValidateStagingTestEnv,
  STAGING_FIRESTORE_DATABASE_ID,
  STAGING_FUNCTIONS_REGION,
  STAGING_PROJECT_ID,
  summarizeSafeStagingConfig,
} from './stagingTestEnv';

function makeValidStagingRawEnv(): Record<string, string> {
  return {
    VITE_FIREBASE_API_KEY: 'staging-synthetic-api-key-value',
    VITE_FIREBASE_AUTH_DOMAIN: 'smartmind-pos-staging.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: STAGING_PROJECT_ID,
    VITE_FIREBASE_STORAGE_BUCKET: 'smartmind-pos-staging.firebasestorage.app',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '757400157737',
    VITE_FIREBASE_APP_ID: '1:757400157737:web:0000000000000000000000',
    VITE_FIREBASE_FIRESTORE_DATABASE_ID: STAGING_FIRESTORE_DATABASE_ID,
    VITE_USE_FIREBASE_EMULATORS: 'false',
  };
}

test('1. Loads real .env.staging cleanly without exposing secret values in safe summary', () => {
  const env = loadAndValidateStagingTestEnv({ processEnv: {} });
  assert.equal(env.projectId, STAGING_PROJECT_ID);
  assert.equal(env.firestoreDatabaseId, STAGING_FIRESTORE_DATABASE_ID);
  assert.equal(env.functionsRegion, STAGING_FUNCTIONS_REGION);
  assert.equal(env.useFirebaseEmulators, false);

  const summary = summarizeSafeStagingConfig(env);
  assert.equal(summary.projectId, STAGING_PROJECT_ID);
  assert.equal(summary.hasApiKey, true);
  assert.equal('apiKey' in summary, false);
  assert.equal('appId' in summary, false);
});

test('2. Rejects production project ID and production named Firestore database', () => {
  assert.throws(
    () =>
      loadAndValidateStagingTestEnv({
        processEnv: {},
        rawEnvOverride: {
          ...makeValidStagingRawEnv(),
          VITE_FIREBASE_PROJECT_ID: FORBIDDEN_PRODUCTION_PROJECT_ID,
        },
      }),
    /CROSS_ENVIRONMENT_VIOLATION/
  );

  assert.throws(
    () =>
      loadAndValidateStagingTestEnv({
        processEnv: {},
        rawEnvOverride: {
          ...makeValidStagingRawEnv(),
          VITE_FIREBASE_FIRESTORE_DATABASE_ID: FORBIDDEN_PRODUCTION_DATABASE_ID,
        },
      }),
    /CROSS_ENVIRONMENT_VIOLATION/
  );
});

test('3. Rejects emulator flags and host emulator environment variables', () => {
  assert.throws(
    () =>
      loadAndValidateStagingTestEnv({
        processEnv: {},
        rawEnvOverride: {
          ...makeValidStagingRawEnv(),
          VITE_USE_FIREBASE_EMULATORS: 'true',
        },
      }),
    /EMULATOR_PROHIBITED/
  );

  assert.throws(
    () =>
      loadAndValidateStagingTestEnv({
        processEnv: { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8085' },
        rawEnvOverride: makeValidStagingRawEnv(),
      }),
    /EMULATOR_PROHIBITED/
  );

  assert.throws(
    () =>
      loadAndValidateStagingTestEnv({
        processEnv: { FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' },
        rawEnvOverride: makeValidStagingRawEnv(),
      }),
    /EMULATOR_PROHIBITED/
  );
});

test('4. Rejects missing keys and accidental reuse of production firebase-applet-config.json credentials', () => {
  const incomplete = makeValidStagingRawEnv();
  delete incomplete.VITE_FIREBASE_APP_ID;

  assert.throws(
    () =>
      loadAndValidateStagingTestEnv({
        processEnv: {},
        rawEnvOverride: incomplete,
      }),
    /STAGING_CONFIG_INCOMPLETE/
  );

  assert.throws(
    () =>
      loadAndValidateStagingTestEnv({
        processEnv: {},
        rawEnvOverride: {
          ...makeValidStagingRawEnv(),
          VITE_FIREBASE_API_KEY: prodAppletConfig.apiKey,
        },
      }),
    /CROSS_ENVIRONMENT_VIOLATION/
  );
});

test('5. Admin credential validator rejects missing credentials and production service accounts', () => {
  const env = loadAndValidateStagingTestEnv({
    processEnv: {},
    rawEnvOverride: makeValidStagingRawEnv(),
  });

  assert.throws(
    () =>
      initStagingAdminContext({
        runId: 'unit-check-01',
        env,
        processEnv: {},
      }),
    /STAGING_ADMIN_CREDENTIAL_REQUIRED/
  );

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-staging-sa-test-'));
  const prodSaPath = path.join(tmpDir, 'prod-sa.json');
  try {
    fs.writeFileSync(
      prodSaPath,
      JSON.stringify({
        type: 'service_account',
        project_id: FORBIDDEN_PRODUCTION_PROJECT_ID,
        client_email: 'fake@example.iam.gserviceaccount.com',
        private_key: '---FAKE---',
      })
    );

    assert.throws(
      () => loadAndValidateStagingServiceAccount(prodSaPath),
      /CROSS_ENVIRONMENT_VIOLATION.*PRODUCTION/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('6. ScopedStagingFixtureTracker rejects unscoped paths and sorts nested doc deletes deepest-first', () => {
  const tracker = new ScopedStagingFixtureTracker('run-20261112-001');

  assert.throws(
    () => tracker.trackFirestoreDoc('businesses/biz-existing-tenant'),
    /UNSCOPED_FIXTURE_PATH_REJECTED/
  );

  assert.throws(
    () => tracker.trackStorageObject('businesses/biz-existing-tenant/branding/business-logo'),
    /UNSCOPED_FIXTURE_PATH_REJECTED/
  );

  tracker.trackFirestoreDoc(
    `businesses/${tracker.runNamespace}-biz`
  );
  tracker.trackFirestoreDoc(
    `businesses/${tracker.runNamespace}-biz/shops/${tracker.runNamespace}-shop`
  );
  tracker.trackFirestoreDoc(
    `businesses/${tracker.runNamespace}-biz/shops/${tracker.runNamespace}-shop/sales/${tracker.runNamespace}-sale`
  );

  const ordered = tracker.getTrackedFirestoreDocPaths();
  assert.equal(ordered[0].includes('/sales/'), true);
  assert.equal(ordered[1].includes('/shops/'), true);
  assert.equal(ordered[2], `businesses/${tracker.runNamespace}-biz`);
});
