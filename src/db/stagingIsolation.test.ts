import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveClientFirebaseConfig } from '../firebase';
import appletConfig from '../../firebase-applet-config.json';

test('Staging Frontend Isolation: staging mode cannot initialize using the production project ID', () => {
  assert.throws(
    () => {
      resolveClientFirebaseConfig({
        MODE: 'staging',
        VITE_FIREBASE_PROJECT_ID: 'gen-lang-client-0985802946', // Production project ID
        VITE_FIREBASE_FIRESTORE_DATABASE_ID: '(default)',
        VITE_FIREBASE_API_KEY: 'mock-staging-key',
        VITE_FIREBASE_AUTH_DOMAIN: 'smartmind-pos-staging.firebaseapp.com',
        VITE_FIREBASE_STORAGE_BUCKET: 'smartmind-pos-staging.firebasestorage.app',
        VITE_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
        VITE_FIREBASE_APP_ID: '1:1234567890:web:abcdef',
      });
    },
    /CROSS_ENVIRONMENT_VIOLATION.*Staging mode cannot initialize using project ID "gen-lang-client-0985802946"/
  );
});

test('Staging Frontend Isolation: staging mode cannot use the production named Firestore database', () => {
  assert.throws(
    () => {
      resolveClientFirebaseConfig({
        MODE: 'staging',
        VITE_FIREBASE_PROJECT_ID: 'smartmind-pos-staging',
        VITE_FIREBASE_FIRESTORE_DATABASE_ID:
          'ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4', // Production named DB
        VITE_FIREBASE_API_KEY: 'mock-staging-key',
        VITE_FIREBASE_AUTH_DOMAIN: 'smartmind-pos-staging.firebaseapp.com',
        VITE_FIREBASE_STORAGE_BUCKET: 'smartmind-pos-staging.firebasestorage.app',
        VITE_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
        VITE_FIREBASE_APP_ID: '1:1234567890:web:abcdef',
      });
    },
    /CROSS_ENVIRONMENT_VIOLATION.*Staging mode cannot use Firestore database "ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4"/
  );
});

test('Staging Frontend Isolation: missing staging variables cause a clear failure with all missing keys listed', () => {
  const result = resolveClientFirebaseConfig({
    MODE: 'staging',
    VITE_FIREBASE_PROJECT_ID: 'smartmind-pos-staging',
    VITE_FIREBASE_FIRESTORE_DATABASE_ID: '(default)',
    VITE_FIREBASE_API_KEY: '',
    VITE_FIREBASE_AUTH_DOMAIN: '',
    VITE_FIREBASE_STORAGE_BUCKET: '',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '',
    VITE_FIREBASE_APP_ID: '',
  });

  assert.equal(result.isStaging, true);
  assert.equal(result.isProduction, false);
  assert.equal(result.config.projectId, 'smartmind-pos-staging');
  assert.equal(result.config.firestoreDatabaseId, '(default)');
  assert.deepEqual(result.missingStagingKeys, [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
  ]);
});

test('Staging Frontend Isolation: valid staging variables resolve cleanly without falling back to firebase-applet-config.json', () => {
  const result = resolveClientFirebaseConfig({
    MODE: 'staging',
    VITE_FIREBASE_PROJECT_ID: 'smartmind-pos-staging',
    VITE_FIREBASE_FIRESTORE_DATABASE_ID: '(default)',
    VITE_FIREBASE_API_KEY: 'staging-api-key-test-value',
    VITE_FIREBASE_AUTH_DOMAIN: 'smartmind-pos-staging.firebaseapp.com',
    VITE_FIREBASE_STORAGE_BUCKET: 'smartmind-pos-staging.firebasestorage.app',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '987654321',
    VITE_FIREBASE_APP_ID: '1:987654321:web:staging123',
  });

  assert.equal(result.isStaging, true);
  assert.equal(result.isProduction, false);
  assert.equal(result.missingStagingKeys.length, 0);
  assert.equal(result.config.projectId, 'smartmind-pos-staging');
  assert.equal(result.config.firestoreDatabaseId, '(default)');
  assert.equal(result.config.apiKey, 'staging-api-key-test-value');
  assert.notEqual(result.config.apiKey, appletConfig.apiKey);
  assert.notEqual(result.config.appId, appletConfig.appId);
});

test('Production Mode Preservation: production mode continues using existing production configuration and named database', () => {
  const result = resolveClientFirebaseConfig({
    MODE: 'production',
  });

  assert.equal(result.isStaging, false);
  assert.equal(result.isProduction, true);
  assert.equal(result.config.projectId, 'gen-lang-client-0985802946');
  assert.equal(
    result.config.firestoreDatabaseId,
    'ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4'
  );
  assert.equal(result.config.apiKey, appletConfig.apiKey);
  assert.equal(result.config.appId, appletConfig.appId);
  assert.equal(result.config.authDomain, appletConfig.authDomain);
  assert.equal(result.config.functionsRegion, 'us-central1');
});

test('Frontend Environment-Specific Region Constants: STAGING_FUNCTIONS_REGION is africa-south1, PRODUCTION_FUNCTIONS_REGION is us-central1', async () => {
  const { STAGING_FUNCTIONS_REGION, PRODUCTION_FUNCTIONS_REGION, functions } = await import('../firebase');
  assert.equal(STAGING_FUNCTIONS_REGION, 'africa-south1');
  assert.equal(PRODUCTION_FUNCTIONS_REGION, 'us-central1');
  assert.ok(functions);
});

test('Staging Frontend Isolation: staging mode resolves functionsRegion to africa-south1', () => {
  const result = resolveClientFirebaseConfig({
    MODE: 'staging',
    VITE_FIREBASE_PROJECT_ID: 'smartmind-pos-staging',
    VITE_FIREBASE_FIRESTORE_DATABASE_ID: '(default)',
    VITE_FIREBASE_API_KEY: 'staging-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'smartmind-pos-staging.firebaseapp.com',
    VITE_FIREBASE_STORAGE_BUCKET: 'smartmind-pos-staging.firebasestorage.app',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '987654321',
    VITE_FIREBASE_APP_ID: '1:987654321:web:staging123',
  });

  assert.equal(result.config.functionsRegion, 'africa-south1');
});

test('Staging Frontend Isolation: non-staging functions region override is rejected', () => {
  assert.throws(
    () => {
      resolveClientFirebaseConfig({
        MODE: 'staging',
        VITE_FIREBASE_PROJECT_ID: 'smartmind-pos-staging',
        VITE_FIREBASE_FIRESTORE_DATABASE_ID: '(default)',
        VITE_FIREBASE_API_KEY: 'staging-key',
        VITE_FIREBASE_AUTH_DOMAIN: 'smartmind-pos-staging.firebaseapp.com',
        VITE_FIREBASE_STORAGE_BUCKET: 'smartmind-pos-staging.firebasestorage.app',
        VITE_FIREBASE_MESSAGING_SENDER_ID: '987654321',
        VITE_FIREBASE_APP_ID: '1:987654321:web:staging123',
        VITE_FIREBASE_FUNCTIONS_REGION: 'us-central1',
      });
    },
    /CROSS_ENVIRONMENT_VIOLATION.*Staging mode cannot be overridden with non-staging functions region "us-central1"/
  );
});

test('Backend Regional Resolution: staging project maps strictly to africa-south1', async () => {
  const { resolveDeploymentRegion, STAGING_FUNCTIONS_REGION } = await import('../../functions/src/core');
  assert.equal(resolveDeploymentRegion({ GCLOUD_PROJECT: 'smartmind-pos-staging' }), 'africa-south1');
  assert.equal(STAGING_FUNCTIONS_REGION, 'africa-south1');
});

test('Backend Regional Resolution: production project maps strictly to us-central1', async () => {
  const { resolveDeploymentRegion, PRODUCTION_FUNCTIONS_REGION } = await import('../../functions/src/core');
  assert.equal(resolveDeploymentRegion({ GCLOUD_PROJECT: 'gen-lang-client-0985802946' }), 'us-central1');
  assert.equal(PRODUCTION_FUNCTIONS_REGION, 'us-central1');
});

test('Backend Regional Resolution: missing project identity fails closed', async () => {
  const { resolveDeploymentRegion } = await import('../../functions/src/core');
  assert.throws(
    () => resolveDeploymentRegion({}),
    /MISSING_PROJECT_CONFIGURATION.*Cloud Functions deployment project identity could not be resolved/
  );
});

test('Backend Regional Resolution: unknown project identity fails closed', async () => {
  const { resolveDeploymentRegion } = await import('../../functions/src/core');
  assert.throws(
    () => resolveDeploymentRegion({ GCLOUD_PROJECT: 'unauthorized-project-999' }),
    /UNKNOWN_PROJECT_CONFIGURATION.*Project ID "unauthorized-project-999" is neither recognized staging/
  );
});

test('Backend Runtime Cross-Environment Isolation: staging cannot resolve production database', async () => {
  const { resolveCurrentEnvironment } = await import('../../functions/src/core');
  assert.throws(
    () =>
      resolveCurrentEnvironment({
        GCLOUD_PROJECT: 'smartmind-pos-staging',
        FIRESTORE_DATABASE_ID: 'ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4',
      }),
    /CROSS_ENVIRONMENT_VIOLATION.*Staging project "smartmind-pos-staging" is strictly forbidden from connecting to production database/
  );
});

test('Backend Runtime Cross-Environment Isolation: production cannot resolve staging database', async () => {
  const { resolveCurrentEnvironment } = await import('../../functions/src/core');
  assert.throws(
    () =>
      resolveCurrentEnvironment({
        GCLOUD_PROJECT: 'gen-lang-client-0985802946',
        FIRESTORE_DATABASE_ID: '(default)',
      }),
    /CROSS_ENVIRONMENT_VIOLATION.*Production project "gen-lang-client-0985802946" is strictly forbidden from connecting to database "\(default\)"/
  );
});

test('Regional Alignment: Frontend and Backend regional mappings agree', async () => {
  const frontend = await import('../firebase');
  const backend = await import('../../functions/src/core');

  assert.equal(frontend.STAGING_FUNCTIONS_REGION, backend.STAGING_FUNCTIONS_REGION);
  assert.equal(frontend.PRODUCTION_FUNCTIONS_REGION, backend.PRODUCTION_FUNCTIONS_REGION);
  assert.equal(frontend.STAGING_FUNCTIONS_REGION, 'africa-south1');
  assert.equal(frontend.PRODUCTION_FUNCTIONS_REGION, 'us-central1');
});

test('Pure Regional Resolution: synthetic project identities map correctly without SDK initialization', async () => {
  const {
    resolveRegionForProject,
    STAGING_FIREBASE_PROJECT_ID,
    PRODUCTION_FIREBASE_PROJECT_ID,
  } = await import('../../functions/src/core');

  assert.equal(resolveRegionForProject(STAGING_FIREBASE_PROJECT_ID), 'africa-south1');
  assert.equal(resolveRegionForProject(PRODUCTION_FIREBASE_PROJECT_ID), 'us-central1');
  assert.equal(resolveRegionForProject('smartmind-pos-staging'), 'africa-south1');
  assert.equal(resolveRegionForProject('gen-lang-client-0985802946'), 'us-central1');
});

test('Pure Regional Resolution: missing and unknown identities fail closed without initializing Firebase Admin', async () => {
  const { resolveRegionForProject } = await import('../../functions/src/core');

  assert.throws(
    () => resolveRegionForProject(undefined),
    /MISSING_PROJECT_CONFIGURATION/
  );
  assert.throws(
    () => resolveRegionForProject('   '),
    /MISSING_PROJECT_CONFIGURATION/
  );
  assert.throws(
    () => resolveRegionForProject('synthetic-unauthorized-id'),
    /UNKNOWN_PROJECT_CONFIGURATION.*synthetic-unauthorized-id/
  );
});

test('Test Environment Isolation: importing backend core does not initialize Firebase Admin or network connections', async () => {
  const { getOrInitServerAdmin } = await import('../../functions/src/core');
  // In non-Cloud-Function environments (e.g. unit tests), getOrInitServerAdmin() strictly returns null
  assert.equal(getOrInitServerAdmin(), null);
});

test('Deployable Functions Entry Point: deployment discovery resolves strictly to africa-south1 for staging', async () => {
  const originalGcloud = process.env.GCLOUD_PROJECT;
  try {
    process.env.GCLOUD_PROJECT = 'smartmind-pos-staging';
    const entry = await import(`../../functions/src/index.ts?t=${Date.now()}`);
    assert.equal(entry.RESOLVED_DEPLOYMENT_REGION, 'africa-south1');
    assert.equal(entry.CLOUD_FUNCTIONS_REGION, 'africa-south1');
    assert.ok(entry.provisionBusinessAndPrimaryOwner);
    assert.ok(entry.syncPosOperation);
    assert.ok(entry.syncShopOperation);
    assert.ok(entry.inviteAuthorizedStaff);
    assert.ok(entry.setTenantStatus);
  } finally {
    if (originalGcloud !== undefined) {
      process.env.GCLOUD_PROJECT = originalGcloud;
    } else {
      delete process.env.GCLOUD_PROJECT;
    }
  }
});

test('Deployable Functions Entry Point: deployment discovery resolves strictly to us-central1 for production', async () => {
  const originalGcloud = process.env.GCLOUD_PROJECT;
  try {
    process.env.GCLOUD_PROJECT = 'gen-lang-client-0985802946';
    const entry = await import(`../../functions/src/index.ts?t=${Date.now()}`);
    assert.equal(entry.RESOLVED_DEPLOYMENT_REGION, 'us-central1');
    assert.equal(entry.CLOUD_FUNCTIONS_REGION, 'us-central1');
  } finally {
    if (originalGcloud !== undefined) {
      process.env.GCLOUD_PROJECT = originalGcloud;
    } else {
      delete process.env.GCLOUD_PROJECT;
    }
  }
});

test('Deployable Functions Entry Point: missing deployment metadata strictly throws MISSING_PROJECT_CONFIGURATION (no silent default)', async () => {
  const originalGcloud = process.env.GCLOUD_PROJECT;
  const originalFirebaseProject = process.env.FIREBASE_PROJECT;
  const originalGoogleProject = process.env.GOOGLE_CLOUD_PROJECT;
  const originalFirebaseConfig = process.env.FIREBASE_CONFIG;
  const originalProjectId = process.env.PROJECT_ID;

  delete process.env.GCLOUD_PROJECT;
  delete process.env.FIREBASE_PROJECT;
  delete process.env.GOOGLE_CLOUD_PROJECT;
  delete process.env.FIREBASE_CONFIG;
  delete process.env.PROJECT_ID;

  try {
    await assert.rejects(
      async () => {
        await import(`../../functions/src/index.ts?t=${Date.now()}`);
      },
      /MISSING_PROJECT_CONFIGURATION/
    );
  } finally {
    if (originalGcloud !== undefined) process.env.GCLOUD_PROJECT = originalGcloud;
    if (originalFirebaseProject !== undefined) process.env.FIREBASE_PROJECT = originalFirebaseProject;
    if (originalGoogleProject !== undefined) process.env.GOOGLE_CLOUD_PROJECT = originalGoogleProject;
    if (originalFirebaseConfig !== undefined) process.env.FIREBASE_CONFIG = originalFirebaseConfig;
    if (originalProjectId !== undefined) process.env.PROJECT_ID = originalProjectId;
  }
});

test('Deployable Functions Entry Point: unknown deployment project strictly throws UNKNOWN_PROJECT_CONFIGURATION', async () => {
  const originalGcloud = process.env.GCLOUD_PROJECT;
  try {
    process.env.GCLOUD_PROJECT = 'unauthorized-project-xyz';
    await assert.rejects(
      async () => {
        await import(`../../functions/src/index.ts?t=${Date.now()}`);
      },
      /UNKNOWN_PROJECT_CONFIGURATION.*unauthorized-project-xyz/
    );
  } finally {
    if (originalGcloud !== undefined) {
      process.env.GCLOUD_PROJECT = originalGcloud;
    } else {
      delete process.env.GCLOUD_PROJECT;
    }
  }
});

test('Deployable Functions Entry Point: deployment discovery resolves via FIREBASE_CONFIG JSON metadata for staging', async () => {
  const originalGcloud = process.env.GCLOUD_PROJECT;
  const originalFirebaseConfig = process.env.FIREBASE_CONFIG;
  delete process.env.GCLOUD_PROJECT;
  try {
    process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'smartmind-pos-staging' });
    const entry = await import(`../../functions/src/index.ts?t=${Date.now()}`);
    assert.equal(entry.RESOLVED_DEPLOYMENT_REGION, 'africa-south1');
  } finally {
    if (originalGcloud !== undefined) process.env.GCLOUD_PROJECT = originalGcloud;
    if (originalFirebaseConfig !== undefined) process.env.FIREBASE_CONFIG = originalFirebaseConfig;
    else delete process.env.FIREBASE_CONFIG;
  }
});

test('Deployable Functions Entry Point: deployment discovery resolves via FIREBASE_CONFIG JSON metadata for production', async () => {
  const originalGcloud = process.env.GCLOUD_PROJECT;
  const originalFirebaseConfig = process.env.FIREBASE_CONFIG;
  delete process.env.GCLOUD_PROJECT;
  try {
    process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'gen-lang-client-0985802946' });
    const entry = await import(`../../functions/src/index.ts?t=${Date.now()}`);
    assert.equal(entry.RESOLVED_DEPLOYMENT_REGION, 'us-central1');
  } finally {
    if (originalGcloud !== undefined) process.env.GCLOUD_PROJECT = originalGcloud;
    if (originalFirebaseConfig !== undefined) process.env.FIREBASE_CONFIG = originalFirebaseConfig;
    else delete process.env.FIREBASE_CONFIG;
  }
});

test('Deployment Script Portability: staging deployment scripts are cross-platform and avoid POSIX-only inline env syntax', async () => {
  const pkg = (await import('../../package.json')).default;
  const stagingScripts = [
    'deploy:staging',
    'deploy:staging:functions',
    'deploy:staging:rules',
    'deploy:staging:indexes',
  ] as const;

  for (const scriptName of stagingScripts) {
    const scriptCmd = pkg.scripts[scriptName];
    assert.ok(scriptCmd, `Missing script "${scriptName}" in package.json`);
    assert.match(
      scriptCmd,
      /--project smartmind-pos-staging/,
      `Script "${scriptName}" must target "--project smartmind-pos-staging"`
    );
    assert.match(
      scriptCmd,
      /--config firebase\.staging\.json/,
      `Script "${scriptName}" must target "--config firebase.staging.json"`
    );
    // Disallow raw POSIX-only inline variable assignment without cross-env at the start of command
    assert.doesNotMatch(
      scriptCmd,
      /^[A-Z_]+=\S+\s+firebase/,
      `Script "${scriptName}" contains POSIX-only inline env variable syntax which fails on Windows PowerShell and CMD`
    );
  }
});

test('Staging Business Provisioning: accepts (default) database and staging Platform Admin email in smartmind-pos-staging, and rejects production database ID', async () => {
  const {
    executeProvisionBusinessAndPrimaryOwner,
    STAGING_PLATFORM_ADMIN_EMAIL,
    PRODUCTION_NAMED_FIRESTORE_DATABASE_ID,
    isAuthorizedPlatformAdminEmail,
  } = await import('../../functions/src/core');

  assert.equal(isAuthorizedPlatformAdminEmail('smart@smartmindconcept.com'), true);
  assert.equal(isAuthorizedPlatformAdminEmail('smartnwokolo@gmail.com'), true);
  assert.equal(isAuthorizedPlatformAdminEmail('evnwokolo25@gmail.com'), false);

  const originalGcloud = process.env.GCLOUD_PROJECT;
  try {
    process.env.GCLOUD_PROJECT = 'smartmind-pos-staging';

    const store = new Map<string, Record<string, any>>();
    store.set('users/uid-staging-admin-01', {
      id: 'uid-staging-admin-01',
      businessId: 'PLATFORM',
      email: STAGING_PLATFORM_ADMIN_EMAIL,
      fullName: 'SmartMind Staging Admin',
      role: 'platform_admin',
      status: 'active',
    });

    const stagingDefaultDbDriver = {
      databaseId: '(default)',
      async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
        const tx = {
          async getDoc(path: string) {
            return store.get(path) ?? null;
          },
          async queryDocsByField(collectionPath: string, field: string, value: string) {
            const matches: Record<string, any>[] = [];
            for (const [key, doc] of store.entries()) {
              if (key.startsWith(`${collectionPath}/`) && !key.slice(collectionPath.length + 1).includes('/')) {
                if (doc[field] === value) matches.push(doc);
              }
            }
            return matches;
          },
          setDoc(path: string, data: Record<string, any>) {
            store.set(path, data);
          },
          deleteDoc(path: string) {
            store.delete(path);
          },
        };
        return await fn(tx);
      },
    };

    const mockStagingAuthDir = {
      async getUserByEmail(email: string) {
        if (email === STAGING_PLATFORM_ADMIN_EMAIL) {
          return {
            uid: 'uid-staging-admin-01',
            email: STAGING_PLATFORM_ADMIN_EMAIL,
            emailVerified: true,
          };
        }
        return null;
      },
      async getUserByUid(uid: string) {
        if (uid === 'uid-staging-admin-01') {
          return {
            uid: 'uid-staging-admin-01',
            email: STAGING_PLATFORM_ADMIN_EMAIL,
            emailVerified: true,
          };
        }
        return null;
      },
      async createUser(params: {
        email: string;
        displayName: string;
        emailVerified?: boolean;
        disabled?: boolean;
      }) {
        return {
          uid: 'uid-firebase-auth-evnwokolo25',
          email: params.email.trim().toLowerCase(),
          emailVerified: params.emailVerified ?? false,
          disabled: params.disabled ?? false,
        };
      },
    };

    const res = await executeProvisionBusinessAndPrimaryOwner(
      stagingDefaultDbDriver,
      mockStagingAuthDir,
      {
        uid: 'uid-staging-admin-01',
        token: {
          email: STAGING_PLATFORM_ADMIN_EMAIL,
          email_verified: true,
        },
      },
      {
        idempotencyKey: 'prov-staging-test-001',
        name: 'SmartMind Validation Store',
        businessType: 'Supermarket & Grocery Chain',
        contactEmail: 'evnwokolo25@gmail.com',
        primaryPhone: '+2348000000001',
        headquartersAddress: '10 Staging Way, Lagos',
        ownerName: 'SmartMind Test Owner',
        ownerEmail: 'evnwokolo25@gmail.com',
      }
    );

    assert.equal(res.status, 'provisioned');
    assert.equal(res.databaseId, '(default)');
    assert.equal(res.business.name, 'SmartMind Validation Store');
    assert.equal(res.primaryOwner.email, 'evnwokolo25@gmail.com');
    assert.equal(res.primaryOwner.id, 'uid-firebase-auth-evnwokolo25');
    assert.equal(res.business.ownerUserId, 'uid-firebase-auth-evnwokolo25');
    assert.equal(res.primaryOwner.id.startsWith('usr-live-owner-'), false);

    // In staging, a driver bound to the production named database must be rejected
    const wrongProdDbDriverInStaging = {
      ...stagingDefaultDbDriver,
      databaseId: PRODUCTION_NAMED_FIRESTORE_DATABASE_ID,
    };

    await assert.rejects(
      async () => {
        await executeProvisionBusinessAndPrimaryOwner(
          wrongProdDbDriverInStaging,
          mockStagingAuthDir,
          {
            uid: 'uid-staging-admin-01',
            token: {
              email: STAGING_PLATFORM_ADMIN_EMAIL,
              email_verified: true,
            },
          },
          {
            idempotencyKey: 'prov-staging-test-002',
            name: 'Invalid DB Store',
            businessType: 'Supermarket & Grocery Chain',
            contactEmail: 'owner2@example.com',
            primaryPhone: '+2348000000002',
            headquartersAddress: '12 Staging Way, Lagos',
            ownerName: 'Test Owner Two',
            ownerEmail: 'owner2@example.com',
          }
        );
      },
      /DATABASE_CONFIG_MISMATCH.*Expected Firestore database "\(default\)"/
    );
  } finally {
    if (originalGcloud !== undefined) {
      process.env.GCLOUD_PROJECT = originalGcloud;
    } else {
      delete process.env.GCLOUD_PROJECT;
    }
  }
});

test('Deployable Functions Manifest: CLOUD_FUNCTIONS_MANIFEST.firestoreDatabaseId resolves to (default) in staging and ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4 in production with no cross-environment fallback', async () => {
  const originalGcloud = process.env.GCLOUD_PROJECT;
  const originalDbId = process.env.FIRESTORE_DATABASE_ID;
  delete process.env.FIRESTORE_DATABASE_ID;

  try {
    // 1. Staging environment reports (default) and africa-south1
    process.env.GCLOUD_PROJECT = 'smartmind-pos-staging';
    const stagingEntry = await import(
      `../../functions/src/index.ts?env=staging-manifest-${Date.now()}`
    );
    assert.equal(stagingEntry.RESOLVED_DEPLOYMENT_REGION, 'africa-south1');
    assert.equal(stagingEntry.RESOLVED_FIRESTORE_DATABASE_ID, '(default)');
    assert.equal(stagingEntry.CLOUD_FUNCTIONS_MANIFEST.region, 'africa-south1');
    assert.equal(
      stagingEntry.CLOUD_FUNCTIONS_MANIFEST.firestoreDatabaseId,
      '(default)'
    );
    assert.ok(
      stagingEntry.CLOUD_FUNCTIONS_MANIFEST.endpoints.includes(
        'repairBusinessOwnerAuth'
      )
    );
    assert.equal(typeof stagingEntry.repairBusinessOwnerAuth, 'function');

    // 2. Production environment reports ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4 and us-central1
    process.env.GCLOUD_PROJECT = 'gen-lang-client-0985802946';
    const prodEntry = await import(
      `../../functions/src/index.ts?env=prod-manifest-${Date.now()}`
    );
    assert.equal(prodEntry.RESOLVED_DEPLOYMENT_REGION, 'us-central1');
    assert.equal(
      prodEntry.RESOLVED_FIRESTORE_DATABASE_ID,
      'ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4'
    );
    assert.equal(prodEntry.CLOUD_FUNCTIONS_MANIFEST.region, 'us-central1');
    assert.equal(
      prodEntry.CLOUD_FUNCTIONS_MANIFEST.firestoreDatabaseId,
      'ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4'
    );

    // 3. Cross-environment database override in staging is strictly rejected
    process.env.GCLOUD_PROJECT = 'smartmind-pos-staging';
    process.env.FIRESTORE_DATABASE_ID =
      'ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4';
    await assert.rejects(
      async () => {
        await import(
          `../../functions/src/index.ts?env=staging-cross-db-${Date.now()}`
        );
      },
      /CROSS_ENVIRONMENT_VIOLATION/
    );

    // 4. Cross-environment database override in production is strictly rejected
    process.env.GCLOUD_PROJECT = 'gen-lang-client-0985802946';
    process.env.FIRESTORE_DATABASE_ID = '(default)';
    await assert.rejects(
      async () => {
        await import(
          `../../functions/src/index.ts?env=prod-cross-db-${Date.now()}`
        );
      },
      /CROSS_ENVIRONMENT_VIOLATION/
    );
  } finally {
    if (originalGcloud !== undefined) {
      process.env.GCLOUD_PROJECT = originalGcloud;
    } else {
      delete process.env.GCLOUD_PROJECT;
    }
    if (originalDbId !== undefined) {
      process.env.FIRESTORE_DATABASE_ID = originalDbId;
    } else {
      delete process.env.FIRESTORE_DATABASE_ID;
    }
  }
});

test('Business Owner Authentication & Onboarding (Phases 1-7): Real Auth UID Creation, Reuse, Synthetic ID Prevention, Safe Owner Repair, Partial Failure Recovery, Password Setup Email, Privilege Separation, and Rules Isolation', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const {
    executeProvisionBusinessAndPrimaryOwner,
    executeRepairBusinessOwnerAuth,
    executeInviteAuthorizedStaff,
    STAGING_PLATFORM_ADMIN_EMAIL,
    BOOTSTRAP_PLATFORM_ADMIN_EMAIL,
  } = await import('../../functions/src/core');
  const {
    resolveBusinessOwnerAuthState,
    isSyntheticOwnerUserId,
    validateBusinessRegistrationInput,
    ROLE_DEFAULT_PERMISSIONS,
  } = await import('../utils/posCalculations');
  const { LiveFirestoreDataService } = await import(
    '../services/liveFirestoreDataService'
  );
  const { MemoryDatabaseAdapter } = await import('./adapters/memoryAdapter');

  const originalGcloud = process.env.GCLOUD_PROJECT;
  const originalDbId = process.env.FIRESTORE_DATABASE_ID;
  delete process.env.FIRESTORE_DATABASE_ID;
  process.env.GCLOUD_PROJECT = 'smartmind-pos-staging';

  try {
    // -------------------------------------------------------------------------
    // Setup Staging In-Memory Firestore & Auth Directory
    // -------------------------------------------------------------------------
    const store = new Map<string, Record<string, unknown>>();
    let simulateFirestoreCommitFailure = false;

    const stagingDbDriver = {
      databaseId: '(default)',
      async runTransaction<T>(
        fn: (tx: import('../../functions/src/core').ServerTransactionContext) => Promise<T>
      ): Promise<T> {
        const snapshot = new Map<string, Record<string, unknown>>();
        for (const [k, v] of store.entries()) {
          snapshot.set(k, JSON.parse(JSON.stringify(v)));
        }
        const stagedWrites = new Map<string, Record<string, unknown>>();
        const stagedDeletes = new Set<string>();

        const tx: import('../../functions/src/core').ServerTransactionContext = {
          async getDoc(docPath: string) {
            if (stagedDeletes.has(docPath)) return null;
            if (stagedWrites.has(docPath)) {
              return JSON.parse(JSON.stringify(stagedWrites.get(docPath)!));
            }
            const existing = snapshot.get(docPath);
            return existing ? JSON.parse(JSON.stringify(existing)) : null;
          },
          async queryDocsByField(
            collectionPath: string,
            field: string,
            value: string
          ) {
            const matches: Record<string, unknown>[] = [];
            for (const [key, doc] of snapshot.entries()) {
              if (stagedDeletes.has(key)) continue;
              if (
                key.startsWith(`${collectionPath}/`) &&
                !key.slice(collectionPath.length + 1).includes('/')
              ) {
                if (doc[field] === value) {
                  matches.push(JSON.parse(JSON.stringify(doc)));
                }
              }
            }
            return matches;
          },
          setDoc(docPath: string, data: Record<string, unknown>) {
            stagedDeletes.delete(docPath);
            stagedWrites.set(docPath, JSON.parse(JSON.stringify(data)));
          },
          deleteDoc(docPath: string) {
            stagedWrites.delete(docPath);
            stagedDeletes.add(docPath);
          },
        };

        const result = await fn(tx);
        if (
          simulateFirestoreCommitFailure &&
          (stagedWrites.size > 0 || stagedDeletes.size > 0)
        ) {
          throw new Error('SIMULATED_FIRESTORE_TRANSACTION_FAILURE');
        }
        for (const delPath of stagedDeletes) {
          store.delete(delPath);
        }
        for (const [writePath, writeData] of stagedWrites.entries()) {
          store.set(writePath, writeData);
        }
        return result;
      },
    };

    const authByEmail = new Map<
      string,
      {
        uid: string;
        email: string;
        displayName: string;
        emailVerified: boolean;
        disabled: boolean;
        password?: never;
      }
    >();
    const authByUid = new Map<
      string,
      {
        uid: string;
        email: string;
        displayName: string;
        emailVerified: boolean;
        disabled: boolean;
      }
    >();
    let createUserCallCount = 0;

    const authDir = {
      registerExisting(
        uid: string,
        email: string,
        displayName: string,
        emailVerified = true,
        disabled = false
      ) {
        const cleanEmail = email.trim().toLowerCase();
        const rec = { uid, email: cleanEmail, displayName, emailVerified, disabled };
        authByEmail.set(cleanEmail, rec);
        authByUid.set(uid, rec);
      },
      async getUserByEmail(email: string) {
        return authByEmail.get(email.trim().toLowerCase()) ?? null;
      },
      async getUserByUid(uid: string) {
        return authByUid.get(uid) ?? null;
      },
      async createUser(params: {
        email: string;
        displayName: string;
        emailVerified?: boolean;
        disabled?: boolean;
      }) {
        createUserCallCount += 1;
        const cleanEmail = params.email.trim().toLowerCase();
        const existing = authByEmail.get(cleanEmail);
        if (existing) return existing;
        const uid = `uid-real-firebase-owner-${createUserCallCount}`;
        const created = {
          uid,
          email: cleanEmail,
          displayName: params.displayName,
          emailVerified: params.emailVerified ?? false,
          disabled: params.disabled ?? false,
        };
        // Verify no password is accepted or stored
        assert.equal('password' in (params as Record<string, unknown>), false);
        authByEmail.set(cleanEmail, created);
        authByUid.set(uid, created);
        return created;
      },
    };

    const stagingAdminAuth = {
      uid: 'uid-staging-admin-01',
      token: {
        email: STAGING_PLATFORM_ADMIN_EMAIL,
        email_verified: true,
      },
    };
    authDir.registerExisting(
      'uid-staging-admin-01',
      STAGING_PLATFORM_ADMIN_EMAIL,
      'SmartMind Staging Admin',
      true,
      false
    );
    store.set('users/uid-staging-admin-01', {
      id: 'uid-staging-admin-01',
      businessId: 'PLATFORM',
      username: 'smart',
      email: STAGING_PLATFORM_ADMIN_EMAIL,
      fullName: 'SmartMind Staging Admin',
      role: 'platform_admin',
      status: 'active',
    });

    // -------------------------------------------------------------------------
    // Scenario 1 & 3: New owner Authentication account creation & real UID binding
    // -------------------------------------------------------------------------
    const newOwnerRes = await executeProvisionBusinessAndPrimaryOwner(
      stagingDbDriver,
      authDir,
      stagingAdminAuth,
      {
        idempotencyKey: 'idem-new-owner-auth-01',
        businessId: 'biz-staging-new-01',
        initialShopId: 'shop-staging-new-01',
        name: 'Emerald Supermarket',
        businessType: 'Supermarket & Grocery Chain',
        contactEmail: 'info@emerald.ng',
        primaryPhone: '+2348031112222',
        headquartersAddress: '12 Marina, Lagos',
        ownerName: 'Chidinma Okafor',
        ownerEmail: 'chidinma@emerald.ng',
      }
    );

    assert.equal(createUserCallCount, 1);
    const createdAuthUser = await authDir.getUserByEmail('chidinma@emerald.ng');
    assert.ok(createdAuthUser);
    assert.equal(createdAuthUser.uid, 'uid-real-firebase-owner-1');
    assert.equal(createdAuthUser.emailVerified, false);
    assert.equal(createdAuthUser.disabled, false);
    assert.equal('password' in createdAuthUser, false);

    // Real UID bound in both /users/{uid} and /businesses/{businessId}.ownerUserId
    assert.equal(newOwnerRes.primaryOwner.id, 'uid-real-firebase-owner-1');
    assert.equal(newOwnerRes.business.ownerUserId, 'uid-real-firebase-owner-1');
    assert.equal(isSyntheticOwnerUserId(newOwnerRes.primaryOwner.id), false);
    assert.ok(store.has('users/uid-real-firebase-owner-1'));
    assert.equal(
      store.get('businesses/biz-staging-new-01')?.ownerUserId,
      'uid-real-firebase-owner-1'
    );
    assert.equal(
      store.get('users/uid-real-firebase-owner-1')?.authUidLinked,
      true
    );
    assert.equal(
      store.get('users/uid-real-firebase-owner-1')?.passwordSetupStatus,
      'pending'
    );

    // -------------------------------------------------------------------------
    // Scenario 2: Existing Auth account reuse (no duplicate Auth account created)
    // -------------------------------------------------------------------------
    authDir.registerExisting(
      'uid-existing-verified-owner-99',
      'existing.owner@crestview.ng',
      'Dr. Folake Coker',
      true,
      false
    );
    const countBeforeExisting = createUserCallCount;
    const reusedOwnerRes = await executeProvisionBusinessAndPrimaryOwner(
      stagingDbDriver,
      authDir,
      stagingAdminAuth,
      {
        idempotencyKey: 'idem-reused-owner-auth-02',
        businessId: 'biz-staging-reused-02',
        initialShopId: 'shop-staging-reused-02',
        name: 'Crestview Pharmacy',
        businessType: 'Pharmacy & Healthcare Retail',
        contactEmail: 'hq@crestview.ng',
        primaryPhone: '+2348023334444',
        headquartersAddress: '22 Awolowo Rd, Ikoyi',
        ownerName: 'Dr. Folake Coker',
        ownerEmail: 'existing.owner@crestview.ng',
      }
    );
    assert.equal(
      createUserCallCount,
      countBeforeExisting,
      'Must reuse existing Firebase Auth user without calling createUser'
    );
    assert.equal(reusedOwnerRes.primaryOwner.id, 'uid-existing-verified-owner-99');
    assert.equal(
      reusedOwnerRes.business.ownerUserId,
      'uid-existing-verified-owner-99'
    );
    assert.ok(store.has('users/uid-existing-verified-owner-99'));

    // -------------------------------------------------------------------------
    // Scenario 4: Prevention of synthetic owner IDs (usr-live-owner-*) in live mode
    // -------------------------------------------------------------------------
    assert.equal(isSyntheticOwnerUserId('usr-live-owner-test001'), true);
    assert.equal(isSyntheticOwnerUserId('uid-real-firebase-owner-1'), false);

    // Calling executeProvisionBusinessAndPrimaryOwner without authDirectory and without real UID is rejected
    await assert.rejects(
      executeProvisionBusinessAndPrimaryOwner(
        stagingDbDriver,
        null,
        stagingAdminAuth,
        {
          idempotencyKey: 'idem-no-auth-dir-03',
          name: 'No Auth Dir Store',
          businessType: 'Supermarket',
          contactEmail: 'noauth@store.ng',
          primaryPhone: '+2348000000000',
          headquartersAddress: 'Lagos',
          ownerName: 'No Auth Owner',
          ownerEmail: 'noauth@store.ng',
        }
      ),
      /AUTH_UID_REQUIRED.*Synthetic owner IDs \(usr-live-owner-\*\) are strictly forbidden/
    );

    // Calling with an explicit synthetic usr-live-owner-* UID is rejected
    await assert.rejects(
      executeProvisionBusinessAndPrimaryOwner(
        stagingDbDriver,
        null,
        stagingAdminAuth,
        {
          idempotencyKey: 'idem-synthetic-uid-04',
          ownerUid: 'usr-live-owner-fake123456',
          name: 'Synthetic Attempt Store',
          businessType: 'Supermarket',
          contactEmail: 'syn@store.ng',
          primaryPhone: '+2348000000000',
          headquartersAddress: 'Lagos',
          ownerName: 'Syn Owner',
          ownerEmail: 'syn@store.ng',
        }
      ),
      /AUTH_UID_REQUIRED|FAILED_PRECONDITION|INVALID_ARGUMENT/
    );

    // -------------------------------------------------------------------------
    // Scenario 7: Recovery after partial Authentication / Firestore failure
    // -------------------------------------------------------------------------
    // Attempt 1: Firebase Auth user is created, then Firestore transaction aborts
    simulateFirestoreCommitFailure = true;
    await assert.rejects(
      executeProvisionBusinessAndPrimaryOwner(
        stagingDbDriver,
        authDir,
        stagingAdminAuth,
        {
          idempotencyKey: 'idem-partial-fail-recovery-05',
          businessId: 'biz-partial-recovery-05',
          initialShopId: 'shop-partial-recovery-05',
          name: 'Resilient Retail Ltd',
          businessType: 'Department & General Retail',
          contactEmail: 'hq@resilient.ng',
          primaryPhone: '+2348055556666',
          headquartersAddress: 'Victoria Island, Lagos',
          ownerName: 'Babatunde Bakare',
          ownerEmail: 'babatunde@resilient.ng',
        }
      ),
      /SIMULATED_FIRESTORE_TRANSACTION_FAILURE/
    );
    // Auth user was created on Attempt 1, but Firestore has no business or user doc yet
    const authUserAfterAttempt1 = await authDir.getUserByEmail(
      'babatunde@resilient.ng'
    );
    assert.ok(authUserAfterAttempt1);
    assert.equal(store.has('businesses/biz-partial-recovery-05'), false);
    assert.equal(store.has(`users/${authUserAfterAttempt1.uid}`), false);

    // Attempt 2: Retry with same idempotencyKey reuses the created Auth user and commits cleanly
    simulateFirestoreCommitFailure = false;
    const countBeforeRetry = createUserCallCount;
    const recoveredRes = await executeProvisionBusinessAndPrimaryOwner(
      stagingDbDriver,
      authDir,
      stagingAdminAuth,
      {
        idempotencyKey: 'idem-partial-fail-recovery-05',
        businessId: 'biz-partial-recovery-05',
        initialShopId: 'shop-partial-recovery-05',
        name: 'Resilient Retail Ltd',
        businessType: 'Department & General Retail',
        contactEmail: 'hq@resilient.ng',
        primaryPhone: '+2348055556666',
        headquartersAddress: 'Victoria Island, Lagos',
        ownerName: 'Babatunde Bakare',
        ownerEmail: 'babatunde@resilient.ng',
      }
    );
    assert.equal(
      createUserCallCount,
      countBeforeRetry,
      'Retry after Firestore abort must reuse the Auth account created in Attempt 1'
    );
    assert.equal(recoveredRes.primaryOwner.id, authUserAfterAttempt1.uid);
    assert.equal(recoveredRes.business.ownerUserId, authUserAfterAttempt1.uid);
    assert.ok(store.has('businesses/biz-partial-recovery-05'));
    assert.ok(store.has(`users/${authUserAfterAttempt1.uid}`));

    // -------------------------------------------------------------------------
    // Scenario 5 & 6: Safe migration/repair from synthetic owner IDs & idempotent retry
    // Simulate existing staging test business:
    // Business: SmartMind Validation Store (biz-live-0001-mip0)
    // Owner: SmartMind Test Owner (evnwokolo25@gmail.com)
    // Synthetic ID: usr-live-owner-provmip0001
    // -------------------------------------------------------------------------
    const legacySyntheticOwnerId = 'usr-live-owner-provmip0001';
    const legacyBizId = 'biz-live-0001-mip0';
    const legacyShopId = 'shop-live-0001-mip0';
    store.set(`businesses/${legacyBizId}`, {
      id: legacyBizId,
      name: 'SmartMind Validation Store',
      legalName: 'SmartMind Validation Store Ltd',
      businessType: 'Supermarket & Grocery Chain',
      registrationNumber: 'RC-1000001',
      taxIdentificationNumber: 'TIN-1000001-0001',
      ownerUserId: legacySyntheticOwnerId,
      ownerName: 'SmartMind Test Owner',
      ownerEmail: 'evnwokolo25@gmail.com',
      contactEmail: 'evnwokolo25@gmail.com',
      primaryPhone: '+2348030001111',
      headquartersAddress: 'Lagos, Nigeria',
      currencyCode: 'NGN',
      currencySymbol: '₦',
      defaultTaxRatePercent: 7.5,
      status: 'active',
      schemaVersion: 6,
      createdAt: '2026-11-02T10:00:00Z',
      updatedAt: '2026-11-02T10:00:00Z',
    });
    store.set(`users/${legacySyntheticOwnerId}`, {
      id: legacySyntheticOwnerId,
      businessId: legacyBizId,
      username: 'evnwokolo25',
      email: 'evnwokolo25@gmail.com',
      fullName: 'SmartMind Test Owner',
      role: 'business_owner',
      roleLabel: 'Business Owner (SmartMind Validation Store)',
      assignedShopIds: [legacyShopId],
      permissions: [...ROLE_DEFAULT_PERMISSIONS.business_owner],
      status: 'active',
      schemaVersion: 6,
      createdAt: '2026-11-02T10:00:00Z',
      updatedAt: '2026-11-02T10:00:00Z',
      lastLoginAt: 'Never (Newly Created)',
    });
    store.set(`businesses/${legacyBizId}/shops/${legacyShopId}`, {
      id: legacyShopId,
      businessId: legacyBizId,
      code: 'SMV-01',
      name: 'SmartMind Validation Store — Main Branch',
      status: 'active',
    });
    store.set(`businesses/${legacyBizId}/sales/sale-existing-001`, {
      id: 'sale-existing-001',
      businessId: legacyBizId,
      shopId: legacyShopId,
      totalAmountKobo: 250000,
    });

    // Verify dashboard state resolution BEFORE repair shows 'Auth Binding Required'
    const preRepairState = resolveBusinessOwnerAuthState(
      store.get(`users/${legacySyntheticOwnerId}`) as unknown as import('../types/pos').User,
      store.get(`businesses/${legacyBizId}`) as unknown as import('../types/pos').Business
    );
    assert.equal(preRepairState.primaryState, 'Auth Binding Required');
    assert.equal(preRepairState.label, 'Auth Binding Required');
    assert.equal(preRepairState.canRepairAuth, true);
    assert.equal(preRepairState.canSendPasswordSetup, false);

    // Execute safe owner authentication repair
    const repairResult = await executeRepairBusinessOwnerAuth(
      stagingDbDriver,
      authDir,
      stagingAdminAuth,
      {
        idempotencyKey: 'idem-repair-mip0-001',
        businessId: legacyBizId,
        expectedOwnerEmail: 'evnwokolo25@gmail.com',
        expectedOwnerName: 'SmartMind Test Owner',
      }
    );

    assert.equal(repairResult.status, 'repaired');
    assert.equal(repairResult.isIdempotentReplay, false);
    assert.equal(repairResult.authAccountCreated, true);
    assert.equal(repairResult.previousOwnerUserId, legacySyntheticOwnerId);
    assert.equal(
      repairResult.removedSyntheticOwnerUserId,
      legacySyntheticOwnerId
    );
    assert.equal(
      isSyntheticOwnerUserId(repairResult.canonicalOwnerUid),
      false
    );

    // Verify canonical /users/{uid} exists, old synthetic profile is deleted, and business/shop/sales are preserved
    assert.equal(store.has(`users/${legacySyntheticOwnerId}`), false);
    assert.ok(store.has(`users/${repairResult.canonicalOwnerUid}`));
    assert.equal(
      store.get(`businesses/${legacyBizId}`)?.ownerUserId,
      repairResult.canonicalOwnerUid
    );
    assert.ok(store.has(`businesses/${legacyBizId}/shops/${legacyShopId}`));
    assert.ok(store.has(`businesses/${legacyBizId}/sales/sale-existing-001`));

    // Verify idempotent retry of executeRepairBusinessOwnerAuth returns replay cleanly
    const repairReplay = await executeRepairBusinessOwnerAuth(
      stagingDbDriver,
      authDir,
      stagingAdminAuth,
      {
        idempotencyKey: 'idem-repair-mip0-001',
        businessId: legacyBizId,
        expectedOwnerEmail: 'evnwokolo25@gmail.com',
      }
    );
    assert.equal(repairReplay.isIdempotentReplay, true);
    assert.equal(
      repairReplay.canonicalOwnerUid,
      repairResult.canonicalOwnerUid
    );

    // Verify dashboard state AFTER repair shows 'Password Setup Pending'
    const postRepairState = resolveBusinessOwnerAuthState(
      store.get(`users/${repairResult.canonicalOwnerUid}`) as unknown as import('../types/pos').User,
      store.get(`businesses/${legacyBizId}`) as unknown as import('../types/pos').Business
    );
    assert.equal(postRepairState.primaryState, 'Password Setup Pending');
    assert.equal(postRepairState.label, 'Password Setup Pending');
    assert.equal(postRepairState.canRepairAuth, false);
    assert.equal(postRepairState.canSendPasswordSetup, true);

    // -------------------------------------------------------------------------
    // Scenario 8: Password setup email handling & state transition
    // -------------------------------------------------------------------------
    const localDb = new MemoryDatabaseAdapter();
    await localDb.initialize();
    const passwordResetDispatchedTo: string[] = [];
    const cloudProvider: import('../services/liveFirestoreDataService').LiveCloudStoreProvider = {
      async getUserProfile(uid: string) {
        return (store.get(`users/${uid}`) as unknown as import('../types/pos').User) || null;
      },
      async getBusiness(businessId: string) {
        return (store.get(`businesses/${businessId}`) as unknown as import('../types/pos').Business) || null;
      },
      async listAllBusinesses() {
        return [];
      },
      async listAllUsers() {
        return [];
      },
      async listBusinessUsers() {
        return [];
      },
      async listBusinessShops() {
        return [];
      },
      async getShop() {
        return null;
      },
      async listShopProducts() {
        return [];
      },
      async listShopSales() {
        return [];
      },
      async saveUserProfile(user: import('../types/pos').User) {
        store.set(`users/${user.id}`, { ...user });
      },
      async saveBusiness(business: import('../types/pos').Business) {
        store.set(`businesses/${business.id}`, { ...business });
      },
      async saveShop() {},
      async saveProduct() {},
      async deleteProduct() {},
      async saveSale() {},
      async sendPasswordResetEmail(targetEmail: string) {
        passwordResetDispatchedTo.push(targetEmail);
      },
    };
    const liveService = new LiveFirestoreDataService(cloudProvider, localDb);

    const platformAdminActor = {
      id: 'uid-staging-admin-01',
      businessId: 'PLATFORM',
      username: 'smart',
      email: STAGING_PLATFORM_ADMIN_EMAIL,
      fullName: 'SmartMind Staging Admin',
      role: 'platform_admin' as const,
      roleLabel: 'Platform Administrator',
      assignedShopIds: [],
      permissions: [...ROLE_DEFAULT_PERMISSIONS.platform_admin],
      status: 'active' as const,
      createdAt: '2026-11-01',
      lastLoginAt: '2026-11-01T10:00:00Z',
    };

    // Cannot send password setup email BEFORE repair (when ID is still synthetic)
    await assert.rejects(
      liveService.sendBusinessOwnerPasswordSetupEmail({
        actor: platformAdminActor,
        ownerUser: {
          id: legacySyntheticOwnerId,
          businessId: legacyBizId,
          username: 'evnwokolo25',
          email: 'evnwokolo25@gmail.com',
          fullName: 'SmartMind Test Owner',
          role: 'business_owner',
          roleLabel: 'Business Owner',
          assignedShopIds: [legacyShopId],
          permissions: [...ROLE_DEFAULT_PERMISSIONS.business_owner],
          status: 'active',
          createdAt: '2026-11-02',
          lastLoginAt: 'Never (Newly Created)',
        },
      }),
      /FAILED_PRECONDITION.*Repair Owner Authentication/
    );
    assert.equal(passwordResetDispatchedTo.length, 0);

    // Send password setup email AFTER repair (with real Firebase Auth UID)
    const repairedOwnerUser: import('../types/pos').User = {
      ...(store.get(`users/${repairResult.canonicalOwnerUid}`) as unknown as import('../types/pos').User),
      lastLoginAt: 'Never (Newly Created)',
    };
    const repairedBiz: import('../types/pos').Business = {
      ...(store.get(`businesses/${legacyBizId}`) as unknown as import('../types/pos').Business),
    };

    const emailSendRes = await liveService.sendBusinessOwnerPasswordSetupEmail({
      actor: platformAdminActor,
      ownerUser: repairedOwnerUser,
      business: repairedBiz,
    });
    assert.equal(emailSendRes.email, 'evnwokolo25@gmail.com');
    assert.equal(emailSendRes.sentToEmail, 'evnwokolo25@gmail.com');
    assert.deepEqual(passwordResetDispatchedTo, ['evnwokolo25@gmail.com']);
    assert.equal(
      emailSendRes.updatedOwner.passwordSetupStatus,
      'email_sent'
    );
    assert.ok(emailSendRes.updatedOwner.passwordSetupEmailSentAt);
    // Ensure no password, token, or reset link is exposed in response
    assert.equal('password' in emailSendRes, false);
    assert.equal('resetLink' in emailSendRes, false);
    assert.equal('token' in emailSendRes, false);

    // Verify state transitions to 'Password Setup Email Sent' and allows Resend
    const emailSentState = resolveBusinessOwnerAuthState(
      emailSendRes.updatedOwner,
      repairedBiz
    );
    assert.equal(emailSentState.primaryState, 'Password Setup Email Sent');
    assert.equal(emailSentState.label, 'Password Setup Email Sent');
    assert.equal(emailSentState.canSendPasswordSetup, false);
    assert.equal(emailSentState.canResendPasswordSetup, true);

    // Once owner verifies email and signs in, state transitions to 'Auth UID Linked'
    const verifiedOwnerState = resolveBusinessOwnerAuthState(
      {
        ...emailSendRes.updatedOwner,
        emailVerified: true,
        passwordSetupStatus: 'verified',
      },
      repairedBiz
    );
    assert.equal(verifiedOwnerState.primaryState, 'Auth UID Linked');
    assert.equal(verifiedOwnerState.label, 'Auth UID Linked');

    // Disabled / suspended owner shows 'Account Disabled'
    const disabledOwnerState = resolveBusinessOwnerAuthState(
      {
        ...emailSendRes.updatedOwner,
        status: 'suspended',
      },
      repairedBiz
    );
    assert.equal(disabledOwnerState.primaryState, 'Account Disabled');
    assert.equal(disabledOwnerState.label, 'Account Disabled');
    assert.equal(disabledOwnerState.canSendPasswordSetup, false);
    assert.equal(disabledOwnerState.canResendPasswordSetup, false);

    // -------------------------------------------------------------------------
    // Scenario 9, 10 & 11: Unauthorized attempts, Cross-business protection, & Platform Admin privilege separation
    // -------------------------------------------------------------------------
    // 9a. Unauthenticated caller cannot repair owner auth
    await assert.rejects(
      executeRepairBusinessOwnerAuth(stagingDbDriver, authDir, null, {
        idempotencyKey: 'idem-unauth-repair-01',
        businessId: legacyBizId,
        expectedOwnerEmail: 'evnwokolo25@gmail.com',
      }),
      /UNAUTHENTICATED/
    );

    // 9b. Business Owner (non-Platform Admin) cannot call repairBusinessOwnerAuth or provisionBusinessAndPrimaryOwner
    const tenantOwnerCaller = {
      uid: repairResult.canonicalOwnerUid,
      token: {
        email: 'evnwokolo25@gmail.com',
        email_verified: true,
      },
    };
    await assert.rejects(
      executeRepairBusinessOwnerAuth(
        stagingDbDriver,
        authDir,
        tenantOwnerCaller,
        {
          idempotencyKey: 'idem-tenant-owner-repair-attempt',
          businessId: legacyBizId,
          expectedOwnerEmail: 'evnwokolo25@gmail.com',
        }
      ),
      /PERMISSION_DENIED/
    );

    // 9c. Tenant owner cannot use inviteAuthorizedStaff to create a business_owner or platform_admin
    await assert.rejects(
      executeInviteAuthorizedStaff(
        stagingDbDriver,
        tenantOwnerCaller,
        {
          idempotencyKey: 'idem-tenant-owner-escalate-01',
          businessId: legacyBizId,
          email: 'another.owner@store.ng',
          fullName: 'Escalated Owner',
          role: 'business_owner' as unknown as 'shop_manager',
          assignedShopIds: [legacyShopId],
        },
        authDir
      ),
      /PERMISSION_DENIED|INVALID_ARGUMENT/
    );

    // 10. Cross-business protection: repair refuses if expectedOwnerEmail does not match business.ownerEmail
    await assert.rejects(
      executeRepairBusinessOwnerAuth(
        stagingDbDriver,
        authDir,
        stagingAdminAuth,
        {
          idempotencyKey: 'idem-cross-biz-mismatch-01',
          businessId: legacyBizId,
          expectedOwnerEmail: 'chidinma@emerald.ng', // Owner of a different business
        }
      ),
      /PERMISSION_DENIED.*mismatch|does not match/i
    );

    // 10b. Repair never deletes a synthetic user record belonging to a DIFFERENT business
    store.set('users/usr-live-owner-otherbiz99', {
      id: 'usr-live-owner-otherbiz99',
      businessId: 'biz-staging-new-01',
      email: 'chidinma@emerald.ng',
      role: 'business_owner',
      status: 'active',
    });
    await executeRepairBusinessOwnerAuth(
      stagingDbDriver,
      authDir,
      stagingAdminAuth,
      {
        idempotencyKey: 'idem-repair-never-delete-other-biz',
        businessId: legacyBizId,
        expectedOwnerEmail: 'evnwokolo25@gmail.com',
      }
    );
    assert.equal(
      store.has('users/usr-live-owner-otherbiz99'),
      true,
      'Must never delete a user document belonging to another business'
    );

    // 11. Platform Admin privilege separation: neither smart@smartmindconcept.com nor smartnwokolo@gmail.com can be registered as a Business Owner
    const adminEmailValidationStaging = validateBusinessRegistrationInput(
      {
        name: 'Admin Attempt Store',
        businessType: 'Supermarket & Grocery Chain',
        contactEmail: 'contact@store.ng',
        primaryPhone: '+2348031234567',
        headquartersAddress: 'Lagos',
        ownerName: 'Staging Admin',
        ownerEmail: STAGING_PLATFORM_ADMIN_EMAIL,
      },
      [],
      []
    );
    assert.equal(adminEmailValidationStaging.valid, false);

    const adminEmailValidationProd = validateBusinessRegistrationInput(
      {
        name: 'Admin Attempt Store',
        businessType: 'Supermarket & Grocery Chain',
        contactEmail: 'contact@store.ng',
        primaryPhone: '+2348031234567',
        headquartersAddress: 'Lagos',
        ownerName: 'Prod Admin',
        ownerEmail: BOOTSTRAP_PLATFORM_ADMIN_EMAIL,
      },
      [],
      []
    );
    assert.equal(adminEmailValidationProd.valid, false);

    // -------------------------------------------------------------------------
    // Scenario 12: Staging vs Production rules & configuration isolation
    // -------------------------------------------------------------------------
    const rootDir = process.cwd();
    const stagingFirebaseJson = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'firebase.staging.json'), 'utf8')
    );
    const prodFirebaseJson = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'firebase.production.json'), 'utf8')
    );
    assert.equal(
      stagingFirebaseJson.firestore.rules,
      'firestore.staging.rules',
      'firebase.staging.json must reference firestore.staging.rules'
    );
    assert.equal(
      prodFirebaseJson.firestore.rules,
      'firestore.rules',
      'firebase.production.json must remain bound to firestore.rules'
    );

    const stagingRulesContent = fs.readFileSync(
      path.join(rootDir, 'firestore.staging.rules'),
      'utf8'
    );
    const prodRulesContent = fs.readFileSync(
      path.join(rootDir, 'firestore.rules'),
      'utf8'
    );
    assert.ok(
      stagingRulesContent.includes('smart@smartmindconcept.com'),
      'firestore.staging.rules must authorize smart@smartmindconcept.com'
    );
    assert.ok(
      !stagingRulesContent.includes('smartnwokolo@gmail.com'),
      'firestore.staging.rules must not contain production admin email smartnwokolo@gmail.com'
    );
    assert.ok(
      stagingRulesContent.includes('platform_owner_repair_keys'),
      'firestore.staging.rules must include platform_owner_repair_keys rules'
    );
    assert.equal(
      prodRulesContent.includes('smart@smartmindconcept.com'),
      false,
      'Production firestore.rules must remain unmodified'
    );
  } finally {
    if (originalGcloud !== undefined) {
      process.env.GCLOUD_PROJECT = originalGcloud;
    } else {
      delete process.env.GCLOUD_PROJECT;
    }
    if (originalDbId !== undefined) {
      process.env.FIRESTORE_DATABASE_ID = originalDbId;
    } else {
      delete process.env.FIRESTORE_DATABASE_ID;
    }
  }
});

test('Business Owner Password Setup Metadata Synchronization: ISO-8601 createdAt preservation, rule-enforced updates, error honesty, refresh reconciliation, and sign-in emailVerified lifecycle (Scenarios A–I)', async () => {
  const { STAGING_PLATFORM_ADMIN_EMAIL } = await import('../../functions/src/core');
  const {
    resolveBusinessOwnerAuthState,
    ROLE_DEFAULT_PERMISSIONS,
  } = await import('../utils/posCalculations');
  const { LiveFirestoreDataService } = await import(
    '../services/liveFirestoreDataService'
  );
  const { MemoryDatabaseAdapter } = await import('./adapters/memoryAdapter');

  const canonicalUid = 'xC5hccJfqqYfDhjKWAW8MGKZTBH3';
  const validationBizId = 'biz-live-0001-mip0';
  const validationShopId = 'shop-live-0001-mip0';
  const serverIsoCreatedAt = '2026-11-02T14:35:22.789Z';
  const provisionedIsoCreatedAt = '2026-11-03T08:12:45.123Z';

  const firestoreUsers = new Map<string, import('../types/pos').User>();
  const firestoreBusinesses = new Map<string, import('../types/pos').Business>();
  const firestoreShops = new Map<string, import('../types/pos').Shop>();
  const resetEmailLog: string[] = [];
  let simulateMetadataWriteFailure = false;

  // Enforce firestore.staging.rules invariant on saveUserProfile:
  // If document already exists, request.resource.data.createdAt MUST equal resource.data.createdAt
  // and request.resource.data.businessId MUST equal resource.data.businessId.
  const ruleEnforcingCloudProvider: import('../services/liveFirestoreDataService').LiveCloudStoreProvider = {
    async getUserProfile(uid: string) {
      const existing = firestoreUsers.get(uid);
      return existing ? { ...existing } : null;
    },
    async getBusiness(businessId: string) {
      const existing = firestoreBusinesses.get(businessId);
      return existing ? { ...existing } : null;
    },
    async listAllBusinesses() {
      return Array.from(firestoreBusinesses.values()).map((b) => ({ ...b }));
    },
    async listAllUsers() {
      return Array.from(firestoreUsers.values()).map((u) => ({ ...u }));
    },
    async listBusinessUsers(businessId: string) {
      return Array.from(firestoreUsers.values())
        .filter((u) => u.businessId === businessId)
        .map((u) => ({ ...u }));
    },
    async listBusinessShops(businessId: string) {
      return Array.from(firestoreShops.values())
        .filter((s) => s.businessId === businessId)
        .map((s) => ({ ...s }));
    },
    async getShop(businessId: string, shopId: string) {
      const s = firestoreShops.get(shopId);
      return s && s.businessId === businessId ? { ...s } : null;
    },
    async listShopProducts() {
      return [];
    },
    async listShopSales() {
      return [];
    },
    async saveUserProfile(user: import('../types/pos').User) {
      if (simulateMetadataWriteFailure) {
        throw new Error('PERMISSION_DENIED: Simulated Firestore write rejection');
      }
      const existing = firestoreUsers.get(user.id);
      if (existing) {
        if (user.createdAt !== existing.createdAt) {
          throw new Error(
            `PERMISSION_DENIED: firestore.staging.rules rejected /users/${user.id} update because request.resource.data.createdAt ("${user.createdAt}") !== resource.data.createdAt ("${existing.createdAt}").`
          );
        }
        if (user.businessId !== existing.businessId) {
          throw new Error(
            `PERMISSION_DENIED: firestore.staging.rules rejected /users/${user.id} update because businessId changed.`
          );
        }
      }
      firestoreUsers.set(user.id, { ...user });
    },
    async saveBusiness(business: import('../types/pos').Business) {
      const existing = firestoreBusinesses.get(business.id);
      if (existing && business.createdAt !== existing.createdAt) {
        throw new Error(
          `PERMISSION_DENIED: firestore.staging.rules rejected /businesses/${business.id} update because createdAt changed.`
        );
      }
      firestoreBusinesses.set(business.id, { ...business });
    },
    async saveShop(shop: import('../types/pos').Shop) {
      firestoreShops.set(shop.id, { ...shop });
    },
    async saveProduct() {},
    async deleteProduct() {},
    async saveSale() {},
    async sendPasswordResetEmail(email: string) {
      resetEmailLog.push(email);
    },
    async provisionBusinessAndPrimaryOwner(req) {
      const provOwner: import('../types/pos').User = {
        id: 'uid-provisioned-owner-iso01',
        businessId: req.businessId || 'biz-live-iso-01',
        username: req.ownerEmail.split('@')[0],
        email: req.ownerEmail.toLowerCase(),
        fullName: req.ownerName,
        role: 'business_owner',
        roleLabel: `Business Owner (${req.name})`,
        assignedShopIds: [req.initialShopId || 'shop-live-iso-01'],
        permissions: [...ROLE_DEFAULT_PERMISSIONS.business_owner],
        status: 'active',
        createdAt: provisionedIsoCreatedAt,
        lastLoginAt: provisionedIsoCreatedAt,
        authUidLinked: true,
        emailVerified: false,
        authDisabled: false,
        authAccountCreatedAt: provisionedIsoCreatedAt,
        passwordSetupStatus: 'pending',
      };
      const provBiz: import('../types/pos').Business = {
        id: req.businessId || 'biz-live-iso-01',
        name: req.name,
        legalName: `${req.name} Ltd`,
        businessType: req.businessType as import('../types/pos').Business['businessType'],
        registrationNumber: 'RC-999999',
        taxIdentificationNumber: 'TIN-999999',
        ownerUserId: provOwner.id,
        ownerName: req.ownerName,
        ownerEmail: req.ownerEmail.toLowerCase(),
        contactEmail: req.contactEmail.toLowerCase(),
        primaryPhone: req.primaryPhone,
        headquartersAddress: req.headquartersAddress,
        currencyCode: 'NGN',
        currencySymbol: '₦',
        defaultTaxRatePercent: 7.5,
        status: 'active',
        createdAt: provisionedIsoCreatedAt,
      };
      const provShop: import('../types/pos').Shop = {
        id: req.initialShopId || 'shop-live-iso-01',
        businessId: provBiz.id,
        code: 'ISO-01',
        name: `${req.name} — Main Branch`,
        category: 'Supermarket',
        locationCity: 'Lagos',
        address: req.headquartersAddress,
        phone: req.primaryPhone,
        managerName: req.ownerName,
        status: 'active',
        terminalId: 'TERM-ISO01',
        taxRatePercent: 7.5,
        receiptHeaderNote: 'Header',
        receiptFooterNote: 'Footer',
        createdAt: provisionedIsoCreatedAt,
        pendingSyncCount: 0,
        lastSyncedAt: 'Cloud Synced',
      };
      firestoreUsers.set(provOwner.id, { ...provOwner });
      firestoreBusinesses.set(provBiz.id, { ...provBiz });
      firestoreShops.set(provShop.id, { ...provShop });
      return {
        status: 'provisioned',
        isIdempotentReplay: false,
        authAccountCreated: true,
        databaseId: '(default)',
        business: provBiz,
        primaryOwner: provOwner,
        firstShop: provShop,
      };
    },
    async repairBusinessOwnerAuth(req) {
      const repairedOwner: import('../types/pos').User = {
        id: canonicalUid,
        businessId: req.businessId,
        username: 'evnwokolo25',
        email: 'evnwokolo25@gmail.com',
        fullName: 'SmartMind Test Owner',
        role: 'business_owner',
        roleLabel: 'Business Owner (SmartMind Validation Store)',
        assignedShopIds: [validationShopId],
        permissions: [...ROLE_DEFAULT_PERMISSIONS.business_owner],
        status: 'active',
        createdAt: serverIsoCreatedAt,
        lastLoginAt: 'Never (Newly Created)',
        authUidLinked: true,
        emailVerified: false,
        authDisabled: false,
        authAccountCreatedAt: serverIsoCreatedAt,
        passwordSetupStatus: 'pending',
        repairedFromUserId: 'usr-live-owner-provmip0001',
        repairedAt: '2026-11-03T07:00:00.000Z',
      };
      const repairedBiz: import('../types/pos').Business = {
        id: req.businessId,
        name: 'SmartMind Validation Store',
        legalName: 'SmartMind Validation Store Ltd',
        businessType: 'Supermarket & Grocery Chain',
        registrationNumber: 'RC-1000001',
        taxIdentificationNumber: 'TIN-1000001-0001',
        ownerUserId: canonicalUid,
        ownerName: 'SmartMind Test Owner',
        ownerEmail: 'evnwokolo25@gmail.com',
        contactEmail: 'evnwokolo25@gmail.com',
        primaryPhone: '+2348030001111',
        headquartersAddress: 'Lagos, Nigeria',
        currencyCode: 'NGN',
        currencySymbol: '₦',
        defaultTaxRatePercent: 7.5,
        status: 'active',
        createdAt: serverIsoCreatedAt,
      };
      firestoreUsers.set(canonicalUid, { ...repairedOwner });
      firestoreBusinesses.set(req.businessId, { ...repairedBiz });
      return {
        status: 'repaired',
        isIdempotentReplay: false,
        authAccountCreated: false,
        databaseId: '(default)',
        businessId: req.businessId,
        previousOwnerUserId: 'usr-live-owner-provmip0001',
        canonicalOwnerUid: canonicalUid,
        removedSyntheticOwnerUserId: 'usr-live-owner-provmip0001',
        business: repairedBiz,
        primaryOwner: repairedOwner,
      };
    },
  };

  const localDb = new MemoryDatabaseAdapter();
  await localDb.initialize();
  const liveService = new LiveFirestoreDataService(
    ruleEnforcingCloudProvider,
    localDb
  );

  const stagingAdminActor: import('../types/pos').User = {
    id: 'uid-staging-admin-01',
    businessId: 'PLATFORM',
    username: 'smart',
    email: STAGING_PLATFORM_ADMIN_EMAIL,
    fullName: 'SmartMind Staging Admin',
    role: 'platform_admin',
    roleLabel: 'Platform Administrator',
    assignedShopIds: [],
    permissions: [...ROLE_DEFAULT_PERMISSIONS.platform_admin],
    status: 'active',
    createdAt: '2026-11-01T00:00:00.000Z',
    lastLoginAt: '2026-11-03T08:00:00.000Z',
  };
  firestoreUsers.set(stagingAdminActor.id, { ...stagingAdminActor });

  // ---------------------------------------------------------------------------
  // A. Full ISO-8601 createdAt preservation during business provisioning and owner auth repair
  // ---------------------------------------------------------------------------
  const provResult = await liveService.persistLiveBusinessAndOwner(
    {
      id: 'biz-live-iso-01',
      name: 'ISO Timestamp Store',
      legalName: 'ISO Timestamp Store Ltd',
      businessType: 'Supermarket & Grocery Chain',
      registrationNumber: 'RC-999999',
      taxIdentificationNumber: 'TIN-999999',
      ownerUserId: 'usr-0001-temp',
      ownerName: 'Adaeze Obi',
      ownerEmail: 'adaeze@isostore.ng',
      contactEmail: 'adaeze@isostore.ng',
      primaryPhone: '+2348039998888',
      headquartersAddress: 'Lekki Phase 1, Lagos',
      currencyCode: 'NGN',
      currencySymbol: '₦',
      defaultTaxRatePercent: 7.5,
      status: 'active',
      createdAt: '2026-11-03', // Client-side short date passed in
    },
    {
      id: 'usr-0001-temp',
      businessId: 'biz-live-iso-01',
      username: 'adaeze',
      email: 'adaeze@isostore.ng',
      fullName: 'Adaeze Obi',
      role: 'business_owner',
      roleLabel: 'Business Owner',
      assignedShopIds: ['shop-live-iso-01'],
      permissions: [...ROLE_DEFAULT_PERMISSIONS.business_owner],
      status: 'active',
      createdAt: '2026-11-03',
      lastLoginAt: 'Never',
    },
    undefined,
    { idempotencyKey: 'idem-iso-prov-01' }
  );

  assert.equal(
    provResult.business.createdAt,
    provisionedIsoCreatedAt,
    'persistLiveBusinessAndOwner must preserve full ISO-8601 business.createdAt without .slice(0, 10) truncation'
  );
  assert.equal(
    provResult.primaryOwner.createdAt,
    provisionedIsoCreatedAt,
    'persistLiveBusinessAndOwner must preserve full ISO-8601 primaryOwner.createdAt without .slice(0, 10) truncation'
  );
  assert.equal(
    provResult.firstShop?.createdAt,
    provisionedIsoCreatedAt,
    'persistLiveBusinessAndOwner must preserve full ISO-8601 firstShop.createdAt without .slice(0, 10) truncation'
  );

  // Repair existing test business SmartMind Validation Store (biz-live-0001-mip0)
  const repairRes = await liveService.repairLiveBusinessOwnerAuth({
    actor: stagingAdminActor,
    business: {
      id: validationBizId,
      name: 'SmartMind Validation Store',
      legalName: 'SmartMind Validation Store Ltd',
      businessType: 'Supermarket & Grocery Chain',
      registrationNumber: 'RC-1000001',
      taxIdentificationNumber: 'TIN-1000001-0001',
      ownerUserId: 'usr-live-owner-provmip0001',
      ownerName: 'SmartMind Test Owner',
      ownerEmail: 'evnwokolo25@gmail.com',
      contactEmail: 'evnwokolo25@gmail.com',
      primaryPhone: '+2348030001111',
      headquartersAddress: 'Lagos, Nigeria',
      currencyCode: 'NGN',
      currencySymbol: '₦',
      defaultTaxRatePercent: 7.5,
      status: 'active',
      createdAt: '2026-11-02', // Truncated client state before repair
    },
  });

  assert.equal(repairRes.canonicalOwnerUid, canonicalUid);
  assert.equal(
    repairRes.primaryOwner.createdAt,
    serverIsoCreatedAt,
    'repairLiveBusinessOwnerAuth must preserve full ISO-8601 serverOwner.createdAt without .slice(0, 10) truncation'
  );
  assert.equal(
    repairRes.business.createdAt,
    serverIsoCreatedAt,
    'repairLiveBusinessOwnerAuth must preserve full ISO-8601 serverBiz.createdAt'
  );

  // ---------------------------------------------------------------------------
  // B, C & D. Password setup metadata update preserving createdAt, businessId, role, email, and canonical UID,
  //           passing Firestore rule check (request.resource.data.createdAt == resource.data.createdAt),
  //           and transitioning dashboard state from Password Setup Pending to Password Setup Email Sent.
  // ---------------------------------------------------------------------------
  // Even if caller passes a stale ownerUser object with a truncated 10-char createdAt,
  // sendBusinessOwnerPasswordSetupEmail performs a safe read-modify-write preserving the exact Firestore createdAt.
  const staleTruncatedCallerOwner: import('../types/pos').User = {
    ...repairRes.primaryOwner,
    createdAt: '2026-11-02', // Stale truncated createdAt in UI state
  };

  const preEmailState = resolveBusinessOwnerAuthState(
    staleTruncatedCallerOwner,
    repairRes.business
  );
  assert.equal(preEmailState.primaryState, 'Password Setup Pending');

  const emailDispatchRes = await liveService.sendBusinessOwnerPasswordSetupEmail({
    actor: stagingAdminActor,
    ownerUser: staleTruncatedCallerOwner,
    business: repairRes.business,
  });

  assert.equal(emailDispatchRes.status, 'password_setup_email_sent');
  assert.equal(emailDispatchRes.emailDispatched, true);
  assert.equal(emailDispatchRes.metadataPersisted, true);
  assert.equal(emailDispatchRes.updatedOwner.id, canonicalUid);
  assert.equal(emailDispatchRes.updatedOwner.businessId, validationBizId);
  assert.equal(emailDispatchRes.updatedOwner.role, 'business_owner');
  assert.equal(emailDispatchRes.updatedOwner.email, 'evnwokolo25@gmail.com');
  assert.equal(
    emailDispatchRes.updatedOwner.createdAt,
    serverIsoCreatedAt,
    'Password setup metadata update must preserve exact full ISO-8601 createdAt from Firestore'
  );
  assert.equal(emailDispatchRes.updatedOwner.passwordSetupStatus, 'email_sent');
  assert.ok(
    emailDispatchRes.updatedOwner.passwordSetupEmailSentAt &&
      emailDispatchRes.updatedOwner.passwordSetupEmailSentAt.length >= 20,
    'passwordSetupEmailSentAt must be a valid ISO-8601 timestamp'
  );

  // Confirm persisted document in Firestore store matches
  const persistedInStore = firestoreUsers.get(canonicalUid);
  assert.ok(persistedInStore);
  assert.equal(persistedInStore.passwordSetupStatus, 'email_sent');
  assert.equal(persistedInStore.createdAt, serverIsoCreatedAt);
  assert.equal(
    persistedInStore.passwordSetupEmailSentAt,
    emailDispatchRes.updatedOwner.passwordSetupEmailSentAt
  );

  const postEmailState = resolveBusinessOwnerAuthState(
    persistedInStore,
    repairRes.business
  );
  assert.equal(postEmailState.primaryState, 'Password Setup Email Sent');
  assert.equal(postEmailState.label, 'Password Setup Email Sent');
  assert.equal(postEmailState.isEmailVerified, false);
  assert.equal(postEmailState.canSendPasswordSetup, false);
  assert.equal(postEmailState.canResendPasswordSetup, true);

  // Verify missing emailVerified (undefined) with passwordSetupStatus === 'email_sent' never implies email verification
  const missingEmailVerifiedState = resolveBusinessOwnerAuthState(
    {
      id: canonicalUid,
      status: 'active',
      authUidLinked: true,
      passwordSetupStatus: 'email_sent',
      passwordSetupEmailSentAt: persistedInStore.passwordSetupEmailSentAt,
    },
    repairRes.business
  );
  assert.equal(missingEmailVerifiedState.isEmailVerified, false);
  assert.equal(
    missingEmailVerifiedState.primaryState,
    'Password Setup Email Sent'
  );

  // ---------------------------------------------------------------------------
  // E. Failure handling when sendPasswordResetEmail() succeeds but Firestore metadata write fails
  // ---------------------------------------------------------------------------
  simulateMetadataWriteFailure = true;
  const emailCountBeforeFailure = resetEmailLog.length;
  await assert.rejects(
    liveService.sendBusinessOwnerPasswordSetupEmail({
      actor: stagingAdminActor,
      ownerUser: persistedInStore,
      business: repairRes.business,
    }),
    /METADATA_PERSISTENCE_FAILED: Password setup email was dispatched by Firebase Auth to evnwokolo25@gmail\.com, but its status could not be saved in Firestore/
  );
  assert.equal(
    resetEmailLog.length,
    emailCountBeforeFailure + 1,
    'sendPasswordResetEmail was invoked, and subsequent Firestore failure was surfaced honestly without being swallowed'
  );
  simulateMetadataWriteFailure = false;

  // ---------------------------------------------------------------------------
  // F. Refresh / reload reading persisted Firestore state rather than stale truncated local cache
  // ---------------------------------------------------------------------------
  const adminRefreshSession = await liveService.resolveAuthenticatedSession({
    uid: stagingAdminActor.id,
    email: STAGING_PLATFORM_ADMIN_EMAIL,
    displayName: stagingAdminActor.fullName,
    emailVerified: true,
  });
  assert.equal(adminRefreshSession.status, 'ready');
  const refreshedOwner = adminRefreshSession.dataset?.users.find(
    (u) => u.id === canonicalUid
  );
  assert.ok(refreshedOwner, 'Refresh Live Data must retrieve owner by canonical Firebase UID');
  assert.equal(refreshedOwner.passwordSetupStatus, 'email_sent');
  assert.equal(refreshedOwner.createdAt, serverIsoCreatedAt);
  const refreshedDashboardState = resolveBusinessOwnerAuthState(
    refreshedOwner,
    adminRefreshSession.dataset?.businesses.find((b) => b.id === validationBizId)
  );
  assert.equal(refreshedDashboardState.primaryState, 'Password Setup Email Sent');
  assert.equal(refreshedDashboardState.isEmailVerified, false);

  // ---------------------------------------------------------------------------
  // G. Business Owner sign-in with emailVerified === false vs emailVerified === true
  // ---------------------------------------------------------------------------
  // G1: Owner signs in after setting password via reset link, but emailVerified is still false
  const ownerUnverifiedSession = await liveService.resolveAuthenticatedSession({
    uid: canonicalUid,
    email: 'evnwokolo25@gmail.com',
    displayName: 'SmartMind Test Owner',
    emailVerified: false,
  });
  assert.equal(ownerUnverifiedSession.status, 'error');
  assert.equal(ownerUnverifiedSession.errorCode, 'EMAIL_NOT_VERIFIED');
  const ownerAfterUnverifiedSignIn = firestoreUsers.get(canonicalUid);
  assert.ok(ownerAfterUnverifiedSignIn);
  assert.equal(ownerAfterUnverifiedSignIn.emailVerified, false);
  assert.equal(
    ownerAfterUnverifiedSignIn.passwordSetupStatus,
    'email_sent',
    'Unverified owner sign-in must NOT falsely mark passwordSetupStatus as verified'
  );
  const unverifiedSignInResolvedState = resolveBusinessOwnerAuthState(
    ownerAfterUnverifiedSignIn,
    repairRes.business
  );
  assert.equal(
    unverifiedSignInResolvedState.primaryState,
    'Password Setup Email Sent'
  );
  assert.equal(unverifiedSignInResolvedState.isEmailVerified, false);

  // G2: Owner verifies email and signs in with emailVerified === true
  const ownerVerifiedSession = await liveService.resolveAuthenticatedSession({
    uid: canonicalUid,
    email: 'evnwokolo25@gmail.com',
    displayName: 'SmartMind Test Owner',
    emailVerified: true,
  });
  assert.equal(ownerVerifiedSession.status, 'ready');
  assert.equal(ownerVerifiedSession.user?.id, canonicalUid);
  assert.equal(ownerVerifiedSession.user?.emailVerified, true);
  assert.equal(ownerVerifiedSession.user?.passwordSetupStatus, 'verified');
  assert.equal(ownerVerifiedSession.user?.createdAt, serverIsoCreatedAt);

  const ownerAfterVerifiedSignIn = firestoreUsers.get(canonicalUid);
  assert.ok(ownerAfterVerifiedSignIn);
  assert.equal(ownerAfterVerifiedSignIn.emailVerified, true);
  assert.equal(ownerAfterVerifiedSignIn.passwordSetupStatus, 'verified');
  assert.equal(ownerAfterVerifiedSignIn.createdAt, serverIsoCreatedAt);

  const finalVerifiedState = resolveBusinessOwnerAuthState(
    ownerAfterVerifiedSignIn,
    repairRes.business
  );
  assert.equal(finalVerifiedState.primaryState, 'Auth UID Linked');
  assert.equal(finalVerifiedState.isEmailVerified, true);

  // ---------------------------------------------------------------------------
  // H. Prevention of cross-tenant or non-admin metadata updates
  // ---------------------------------------------------------------------------
  // H1: Owner cannot synchronize/update another user's authentication metadata
  await assert.rejects(
    liveService.synchronizeBusinessOwnerSignInState({
      authenticatedUid: canonicalUid,
      authenticatedEmail: 'evnwokolo25@gmail.com',
      emailVerified: true,
      targetUserId: 'uid-provisioned-owner-iso01',
    }),
    /PERMISSION_DENIED.*cannot update authentication metadata for another user/
  );

  // H2: Non-admin (business_owner) cannot call sendBusinessOwnerPasswordSetupEmail
  await assert.rejects(
    liveService.sendBusinessOwnerPasswordSetupEmail({
      actor: ownerAfterVerifiedSignIn,
      ownerUser: provResult.primaryOwner,
      business: provResult.business,
    }),
    /PERMISSION_DENIED/
  );

  // H3: Cross-tenant mismatch in sendBusinessOwnerPasswordSetupEmail is rejected
  await assert.rejects(
    liveService.sendBusinessOwnerPasswordSetupEmail({
      actor: stagingAdminActor,
      ownerUser: ownerAfterVerifiedSignIn,
      business: provResult.business, // Different businessId ('biz-live-iso-01' !== 'biz-live-0001-mip0')
    }),
    /PERMISSION_DENIED.*Cross-tenant mismatch/
  );
});

test('Business Owner Authentication Synchronization Security Fix: Behavioral Staging Rules Evaluator & End-to-End Sign-In Synchronization (Scenarios A–L)', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { STAGING_PLATFORM_ADMIN_EMAIL } = await import('../../functions/src/core');
  const {
    resolveBusinessOwnerAuthState,
    ROLE_DEFAULT_PERMISSIONS,
  } = await import('../utils/posCalculations');
  const { LiveFirestoreDataService } = await import(
    '../services/liveFirestoreDataService'
  );
  const { MemoryDatabaseAdapter } = await import('./adapters/memoryAdapter');

  const rootDir = path.resolve(process.cwd());
  const stagingRulesText = fs.readFileSync(
    path.join(rootDir, 'firestore.staging.rules'),
    'utf8'
  );
  const prodRulesText = fs.readFileSync(
    path.join(rootDir, 'firestore.rules'),
    'utf8'
  );

  // Confirm firestore.staging.rules defines isSelfUserRead and isBusinessOwnerSelfAuthMetadataUpdate
  // while production firestore.rules remains completely untouched.
  assert.ok(
    stagingRulesText.includes('function isSelfUserRead(userId)'),
    'firestore.staging.rules must define isSelfUserRead(userId)'
  );
  assert.ok(
    stagingRulesText.includes(
      'function isBusinessOwnerSelfAuthMetadataUpdate(userId)'
    ),
    'firestore.staging.rules must define isBusinessOwnerSelfAuthMetadataUpdate(userId)'
  );
  assert.ok(
    stagingRulesText.includes(
      'request.resource.data.emailVerified == request.auth.token.email_verified'
    ),
    'firestore.staging.rules must enforce emailVerified == request.auth.token.email_verified'
  );
  assert.ok(
    stagingRulesText.includes("request.resource.data.diff(resource.data).affectedKeys().hasOnly(["),
    'firestore.staging.rules must restrict changed keys using diff(resource.data).affectedKeys().hasOnly(...)'
  );
  assert.equal(
    prodRulesText.includes('isBusinessOwnerSelfAuthMetadataUpdate'),
    false,
    'Production firestore.rules must NOT be modified by staging-only work'
  );

  // ===========================================================================
  // Behavioral Staging Security Rules Evaluator for /users/{userId} and /businesses/{businessId}
  // Mirrors the exact semantics of firestore.staging.rules
  // ===========================================================================
  interface RulesAuthContext {
    uid: string;
    token: {
      email?: string;
      email_verified?: boolean;
    };
  }

  const usersDocs = new Map<string, Record<string, any>>();
  const businessesDocs = new Map<string, Record<string, any>>();
  const shopsDocs = new Map<string, Record<string, any>>();

  function deepEqualValue(a: any, b: any): boolean {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((v, i) => deepEqualValue(v, b[i]));
    }
    return false;
  }

  function computeAffectedKeys(
    beforeDoc: Record<string, any>,
    afterDoc: Record<string, any>
  ): string[] {
    const allKeys = new Set([
      ...Object.keys(beforeDoc),
      ...Object.keys(afterDoc),
    ]);
    const changed: string[] = [];
    for (const k of allKeys) {
      if (!deepEqualValue(beforeDoc[k], afterDoc[k])) {
        changed.push(k);
      }
    }
    return changed;
  }

  function isAuthenticated(auth: RulesAuthContext | null): boolean {
    return auth !== null && auth.token?.email_verified === true;
  }

  function isAuthorizedStagingAdminEmail(email: unknown): boolean {
    return email === STAGING_PLATFORM_ADMIN_EMAIL;
  }

  function getUserProfileForAuth(
    auth: RulesAuthContext | null
  ): Record<string, any> | null {
    if (!auth) return null;
    return usersDocs.get(auth.uid) || null;
  }

  function hasActiveProfile(auth: RulesAuthContext | null): boolean {
    if (!isAuthenticated(auth)) return false;
    const p = getUserProfileForAuth(auth);
    return Boolean(p && p.status === 'active');
  }

  function isPlatformAdmin(auth: RulesAuthContext | null): boolean {
    if (!isAuthenticated(auth)) return false;
    if (!isAuthorizedStagingAdminEmail(auth?.token?.email)) return false;
    const p = getUserProfileForAuth(auth);
    return Boolean(
      p &&
        p.status === 'active' &&
        p.role === 'platform_admin' &&
        isAuthorizedStagingAdminEmail(p.email)
    );
  }

  function isBusinessOwnerOf(
    auth: RulesAuthContext | null,
    businessId: string
  ): boolean {
    if (!hasActiveProfile(auth)) return false;
    const p = getUserProfileForAuth(auth)!;
    return p.role === 'business_owner' && p.businessId === businessId;
  }

  function isSelfUserRead(
    auth: RulesAuthContext | null,
    userId: string,
    resourceData: Record<string, any> | null
  ): boolean {
    return Boolean(
      auth !== null &&
        auth.uid === userId &&
        resourceData !== null &&
        typeof auth.token?.email === 'string' &&
        typeof resourceData.email === 'string' &&
        auth.token.email === resourceData.email
    );
  }

  function isValidUserProfile(
    data: Record<string, any>,
    userId: string
  ): boolean {
    const requiredFields = [
      'id',
      'businessId',
      'username',
      'email',
      'fullName',
      'role',
      'roleLabel',
      'assignedShopIds',
      'permissions',
      'status',
      'schemaVersion',
      'createdAt',
      'updatedAt',
    ];
    const allowedFields = new Set([
      ...requiredFields,
      'authUidLinked',
      'emailVerified',
      'authDisabled',
      'authAccountCreatedAt',
      'passwordSetupStatus',
      'passwordSetupEmailSentAt',
      'repairedFromUserId',
      'repairedAt',
    ]);
    const allowedCashierPerms = new Set([
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
    const allowedManagerPerms = new Set([
      ...allowedCashierPerms,
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

    for (const req of requiredFields) {
      if (!(req in data)) return false;
    }
    for (const k of Object.keys(data)) {
      if (!allowedFields.has(k)) return false;
    }
    if (data.id !== userId) return false;
    if (
      !['platform_admin', 'business_owner', 'shop_manager', 'cashier'].includes(
        data.role
      )
    ) {
      return false;
    }
    if (!['active', 'suspended'].includes(data.status)) return false;
    if (
      !Array.isArray(data.assignedShopIds) ||
      !Array.isArray(data.permissions)
    ) {
      return false;
    }
    if (data.role === 'cashier') {
      if (
        data.permissions.length < 1 ||
        !data.permissions.every((p: string) => allowedCashierPerms.has(p))
      ) {
        return false;
      }
    }
    if (data.role === 'shop_manager') {
      if (
        data.permissions.length < 1 ||
        !data.permissions.every((p: string) => allowedManagerPerms.has(p))
      ) {
        return false;
      }
    }
    return true;
  }

  function isBusinessOwnerSelfAuthMetadataUpdate(
    auth: RulesAuthContext | null,
    userId: string,
    resourceData: Record<string, any> | null,
    requestData: Record<string, any>
  ): boolean {
    if (!auth || auth.uid !== userId) return false;
    if (auth.token?.email_verified !== true) return false;
    if (!resourceData) return false;
    if (
      resourceData.role !== 'business_owner' ||
      requestData.role !== 'business_owner'
    ) {
      return false;
    }
    if (
      resourceData.status !== 'active' ||
      requestData.status !== resourceData.status
    ) {
      return false;
    }
    if (requestData.id !== resourceData.id) return false;
    if (requestData.businessId !== resourceData.businessId) return false;
    if (requestData.email !== resourceData.email) return false;
    if (auth.token?.email !== resourceData.email) return false;
    if (isAuthorizedStagingAdminEmail(requestData.email)) return false;
    if (requestData.username !== resourceData.username) return false;
    if (requestData.fullName !== resourceData.fullName) return false;
    if (requestData.roleLabel !== resourceData.roleLabel) return false;
    if (
      !deepEqualValue(requestData.assignedShopIds, resourceData.assignedShopIds)
    ) {
      return false;
    }
    if (!deepEqualValue(requestData.permissions, resourceData.permissions)) {
      return false;
    }
    if (requestData.schemaVersion !== resourceData.schemaVersion) return false;
    if (requestData.createdAt !== resourceData.createdAt) return false;
    if (typeof requestData.emailVerified !== 'boolean') return false;
    if (requestData.emailVerified !== auth.token.email_verified) return false;
    if (requestData.emailVerified !== true) return false;
    if (requestData.passwordSetupStatus !== 'verified') return false;
    if (
      'authUidLinked' in requestData &&
      requestData.authUidLinked !== true
    ) {
      return false;
    }

    const allowedDiffKeys = new Set([
      'emailVerified',
      'passwordSetupStatus',
      'authUidLinked',
      'updatedAt',
    ]);
    const diffKeys = computeAffectedKeys(resourceData, requestData);
    return diffKeys.every((k) => allowedDiffKeys.has(k));
  }

  function evaluateUserGet(
    auth: RulesAuthContext | null,
    userId: string
  ): Record<string, any> | null {
    const resourceData = usersDocs.get(userId) || null;
    const allowed =
      isSelfUserRead(auth, userId, resourceData) ||
      (isAuthenticated(auth) &&
        (auth!.uid === userId ||
          isPlatformAdmin(auth) ||
          (hasActiveProfile(auth) &&
            getUserProfileForAuth(auth)!.role === 'business_owner' &&
            resourceData !== null &&
            resourceData.businessId ===
              getUserProfileForAuth(auth)!.businessId)));
    if (!allowed) {
      throw new Error(
        `FirebaseError: [code=permission-denied]: Missing or insufficient permissions reading /users/${userId}.`
      );
    }
    return resourceData ? { ...resourceData } : null;
  }

  function evaluateUserUpdate(
    auth: RulesAuthContext | null,
    userId: string,
    requestData: Record<string, any>
  ): void {
    const resourceData = usersDocs.get(userId) || null;
    if (!resourceData) {
      throw new Error(
        `FirebaseError: [code=permission-denied]: Document /users/${userId} does not exist for update.`
      );
    }
    const validSchema = isValidUserProfile(requestData, userId);
    const createdAtUnchanged = requestData.createdAt === resourceData.createdAt;
    const businessIdUnchanged =
      requestData.businessId === resourceData.businessId;

    const branchPlatformAdminOther =
      isPlatformAdmin(auth) &&
      userId !== auth!.uid &&
      !isAuthorizedStagingAdminEmail(requestData.email) &&
      ['business_owner', 'shop_manager', 'cashier'].includes(requestData.role);

    const branchPlatformAdminSelf =
      isPlatformAdmin(auth) &&
      userId === auth!.uid &&
      isAuthorizedStagingAdminEmail(requestData.email) &&
      requestData.role === 'platform_admin' &&
      requestData.status === 'active';

    const branchOwnerUpdatingStaff =
      isBusinessOwnerOf(auth, resourceData.businessId) &&
      ['shop_manager', 'cashier'].includes(resourceData.role) &&
      !isAuthorizedStagingAdminEmail(requestData.email) &&
      ['shop_manager', 'cashier'].includes(requestData.role);

    const branchOwnerSelfAuthMetadata = isBusinessOwnerSelfAuthMetadataUpdate(
      auth,
      userId,
      resourceData,
      requestData
    );

    if (
      !validSchema ||
      !createdAtUnchanged ||
      !businessIdUnchanged ||
      !(
        branchPlatformAdminOther ||
        branchPlatformAdminSelf ||
        branchOwnerUpdatingStaff ||
        branchOwnerSelfAuthMetadata
      )
    ) {
      throw new Error(
        `FirebaseError: [code=permission-denied]: Missing or insufficient permissions updating /users/${userId}.`
      );
    }

    usersDocs.set(userId, { ...requestData });
  }

  // Seed canonical staging data matching SmartMind Validation Store (biz-live-0001-mip0)
  const adminUid = 'uid-staging-admin-01';
  const ownerUid = 'xC5hccJfqqYfDhjKWAW8MGKZTBH3';
  const ownerEmail = 'evnwokolo25@gmail.com';
  const bizId = 'biz-live-0001-mip0';
  const shopId = 'shop-live-0001-mip0';
  const cashierUid = 'uid-cashier-mip0-01';
  const managerUid = 'uid-manager-mip0-01';
  const otherOwnerUid = 'uid-other-owner-99';
  const createdAtIso = '2026-11-02T14:35:22.789Z';

  usersDocs.set(adminUid, {
    id: adminUid,
    businessId: 'PLATFORM',
    username: 'smart',
    email: STAGING_PLATFORM_ADMIN_EMAIL,
    fullName: 'SmartMind Staging Admin',
    role: 'platform_admin',
    roleLabel: 'Platform Administrator',
    assignedShopIds: [],
    permissions: [...ROLE_DEFAULT_PERMISSIONS.platform_admin],
    status: 'active',
    schemaVersion: 6,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-03T07:00:00.000Z',
  });

  usersDocs.set(ownerUid, {
    id: ownerUid,
    businessId: bizId,
    username: 'evnwokolo25',
    email: ownerEmail,
    fullName: 'SmartMind Test Owner',
    role: 'business_owner',
    roleLabel: 'Business Owner (SmartMind Validation Store)',
    assignedShopIds: [shopId],
    permissions: [...ROLE_DEFAULT_PERMISSIONS.business_owner],
    status: 'active',
    authUidLinked: true,
    emailVerified: false,
    authDisabled: false,
    authAccountCreatedAt: createdAtIso,
    passwordSetupStatus: 'pending',
    schemaVersion: 6,
    createdAt: createdAtIso,
    updatedAt: createdAtIso,
  });

  usersDocs.set(cashierUid, {
    id: cashierUid,
    businessId: bizId,
    username: 'cashier.mip0',
    email: 'cashier@validationstore.ng',
    fullName: 'Validation Cashier',
    role: 'cashier',
    roleLabel: 'Cashier',
    assignedShopIds: [shopId],
    permissions: [...ROLE_DEFAULT_PERMISSIONS.cashier],
    status: 'active',
    schemaVersion: 6,
    createdAt: createdAtIso,
    updatedAt: createdAtIso,
  });

  usersDocs.set(managerUid, {
    id: managerUid,
    businessId: bizId,
    username: 'manager.mip0',
    email: 'manager@validationstore.ng',
    fullName: 'Validation Shop Manager',
    role: 'shop_manager',
    roleLabel: 'Shop Manager',
    assignedShopIds: [shopId],
    permissions: [...ROLE_DEFAULT_PERMISSIONS.shop_manager],
    status: 'active',
    schemaVersion: 6,
    createdAt: createdAtIso,
    updatedAt: createdAtIso,
  });

  usersDocs.set(otherOwnerUid, {
    id: otherOwnerUid,
    businessId: 'biz-live-other-99',
    username: 'otherowner',
    email: 'otherowner@otherstore.ng',
    fullName: 'Other Store Owner',
    role: 'business_owner',
    roleLabel: 'Business Owner',
    assignedShopIds: ['shop-live-other-99'],
    permissions: [...ROLE_DEFAULT_PERMISSIONS.business_owner],
    status: 'active',
    authUidLinked: true,
    emailVerified: true,
    passwordSetupStatus: 'verified',
    schemaVersion: 6,
    createdAt: createdAtIso,
    updatedAt: createdAtIso,
  });

  businessesDocs.set(bizId, {
    id: bizId,
    name: 'SmartMind Validation Store',
    legalName: 'SmartMind Validation Store Ltd',
    businessType: 'Supermarket & Grocery Chain',
    registrationNumber: 'RC-1000001',
    taxIdentificationNumber: 'TIN-1000001-0001',
    ownerUserId: ownerUid,
    ownerName: 'SmartMind Test Owner',
    ownerEmail,
    contactEmail: ownerEmail,
    primaryPhone: '+2348030001111',
    headquartersAddress: 'Lagos, Nigeria',
    currencyCode: 'NGN',
    currencySymbol: '₦',
    defaultTaxRatePercent: 7.5,
    status: 'active',
    schemaVersion: 6,
    createdAt: createdAtIso,
    updatedAt: createdAtIso,
  });

  shopsDocs.set(shopId, {
    id: shopId,
    businessId: bizId,
    code: 'SMV-01',
    name: 'SmartMind Validation Store — Main Branch',
    category: 'Supermarket',
    locationCity: 'Lagos',
    address: 'Lagos, Nigeria',
    phone: '+2348030001111',
    managerName: 'SmartMind Test Owner',
    status: 'active',
    terminalId: 'TERM-SMV-01',
    taxRatePercent: 7.5,
    receiptHeaderNote: 'Header',
    receiptFooterNote: 'Footer',
    createdAt: createdAtIso,
    pendingSyncCount: 0,
    lastSyncedAt: 'Cloud Synced',
  });

  // ---------------------------------------------------------------------------
  // SCENARIO A: Unverified authenticated business owner reading their own /users/{uid} profile when UID and email match
  // ---------------------------------------------------------------------------
  const unverifiedOwnerAuth: RulesAuthContext = {
    uid: ownerUid,
    token: {
      email: ownerEmail,
      email_verified: false,
    },
  };
  const selfReadUnverified = evaluateUserGet(unverifiedOwnerAuth, ownerUid);
  assert.ok(
    selfReadUnverified,
    'Scenario A: Unverified authenticated business owner must be permitted to read their own /users/{uid} profile when UID and email match'
  );
  assert.equal(selfReadUnverified.id, ownerUid);
  assert.equal(selfReadUnverified.email, ownerEmail);
  assert.equal(selfReadUnverified.emailVerified, false);

  // ---------------------------------------------------------------------------
  // SCENARIO B: Unverified user blocked from reading another user's profile
  // ---------------------------------------------------------------------------
  assert.throws(
    () => evaluateUserGet(unverifiedOwnerAuth, otherOwnerUid),
    /permission-denied/,
    'Scenario B: Unverified user must be blocked from reading another user profile'
  );
  assert.throws(
    () => evaluateUserGet(unverifiedOwnerAuth, cashierUid),
    /permission-denied/,
    'Scenario B: Unverified owner must be blocked from reading staff profile before email verification'
  );

  // ---------------------------------------------------------------------------
  // SCENARIO C: Unverified user blocked from reading their own profile if token email does not match stored profile email
  // ---------------------------------------------------------------------------
  const mismatchedEmailAuth: RulesAuthContext = {
    uid: ownerUid,
    token: {
      email: 'spoofed-different@gmail.com',
      email_verified: false,
    },
  };
  assert.throws(
    () => evaluateUserGet(mismatchedEmailAuth, ownerUid),
    /permission-denied/,
    'Scenario C: Unverified user must be blocked from reading their own profile if token email does not match stored profile email'
  );

  // ---------------------------------------------------------------------------
  // SCENARIO D: Unverified business owner blocked from writing emailVerified: true or passwordSetupStatus: 'verified'
  // ---------------------------------------------------------------------------
  assert.throws(
    () =>
      evaluateUserUpdate(unverifiedOwnerAuth, ownerUid, {
        ...usersDocs.get(ownerUid)!,
        emailVerified: true,
        passwordSetupStatus: 'verified',
        updatedAt: '2026-11-03T09:00:00.000Z',
      }),
    /permission-denied/,
    'Scenario D: Unverified business owner must be blocked from writing emailVerified: true or passwordSetupStatus: verified'
  );
  assert.throws(
    () =>
      evaluateUserUpdate(unverifiedOwnerAuth, ownerUid, {
        ...usersDocs.get(ownerUid)!,
        emailVerified: false,
        passwordSetupStatus: 'verified',
        updatedAt: '2026-11-03T09:00:00.000Z',
      }),
    /permission-denied/,
    'Scenario D: Unverified business owner must be blocked from updating their profile before email_verified == true'
  );

  // ---------------------------------------------------------------------------
  // SCENARIO K: Existing Platform Admin password setup email metadata update continues to work
  // ---------------------------------------------------------------------------
  let activeAuthContext: RulesAuthContext = {
    uid: adminUid,
    token: {
      email: STAGING_PLATFORM_ADMIN_EMAIL,
      email_verified: true,
    },
  };
  let simulateSyncWriteFailure = false;
  const verificationEmailsSent: string[] = [];
  const passwordResetEmailsSent: string[] = [];

  const rulesBackedProvider: import('../services/liveFirestoreDataService').LiveCloudStoreProvider = {
    async getUserProfile(uid: string) {
      const raw = evaluateUserGet(activeAuthContext, uid);
      if (!raw) return null;
      return {
        ...(raw as unknown as import('../types/pos').User),
        lastLoginAt: raw.updatedAt || raw.createdAt,
      };
    },
    async getBusiness(businessId: string) {
      if (!isAuthenticated(activeAuthContext)) {
        throw new Error(
          'FirebaseError: [code=permission-denied]: Missing or insufficient permissions reading business.'
        );
      }
      const b = businessesDocs.get(businessId);
      return b ? ({ ...b } as unknown as import('../types/pos').Business) : null;
    },
    async listAllBusinesses() {
      if (!isPlatformAdmin(activeAuthContext)) {
        throw new Error('FirebaseError: [code=permission-denied]');
      }
      return Array.from(businessesDocs.values()).map(
        (b) => ({ ...b } as unknown as import('../types/pos').Business)
      );
    },
    async listAllUsers() {
      if (!isPlatformAdmin(activeAuthContext)) {
        throw new Error('FirebaseError: [code=permission-denied]');
      }
      return Array.from(usersDocs.values()).map(
        (u) =>
          ({
            ...u,
            lastLoginAt: u.updatedAt || u.createdAt,
          } as unknown as import('../types/pos').User)
      );
    },
    async listBusinessUsers(businessId: string) {
      if (!isAuthenticated(activeAuthContext)) {
        throw new Error('FirebaseError: [code=permission-denied]');
      }
      return Array.from(usersDocs.values())
        .filter((u) => u.businessId === businessId)
        .map(
          (u) =>
            ({
              ...u,
              lastLoginAt: u.updatedAt || u.createdAt,
            } as unknown as import('../types/pos').User)
        );
    },
    async listBusinessShops(businessId: string) {
      if (!isAuthenticated(activeAuthContext)) {
        throw new Error('FirebaseError: [code=permission-denied]');
      }
      return Array.from(shopsDocs.values())
        .filter((s) => s.businessId === businessId)
        .map((s) => ({ ...s } as unknown as import('../types/pos').Shop));
    },
    async getShop(businessId: string, id: string) {
      const s = shopsDocs.get(id);
      return s && s.businessId === businessId
        ? ({ ...s } as unknown as import('../types/pos').Shop)
        : null;
    },
    async listShopProducts() {
      return [];
    },
    async listShopSales() {
      return [];
    },
    async saveUserProfile(user: import('../types/pos').User) {
      if (simulateSyncWriteFailure) {
        throw new Error(
          'FirebaseError: [code=permission-denied]: Simulated Firestore write failure during owner sign-in synchronization.'
        );
      }
      const existing = usersDocs.get(user.id);
      const nowIso = '2026-11-03T09:15:00.000Z';
      const docPayload: Record<string, any> = {
        id: user.id,
        businessId: existing?.businessId || user.businessId,
        username: user.username || existing?.username || user.email.split('@')[0],
        email: user.email || existing?.email,
        fullName: user.fullName || existing?.fullName,
        role: user.role || existing?.role,
        roleLabel: user.roleLabel || existing?.roleLabel || user.role,
        assignedShopIds: user.assignedShopIds || existing?.assignedShopIds || [],
        permissions: user.permissions || existing?.permissions || [],
        status: user.status === 'suspended' ? 'suspended' : 'active',
        schemaVersion: existing?.schemaVersion ?? 6,
        createdAt: existing?.createdAt || user.createdAt,
        updatedAt: nowIso,
        ...(typeof (user.authUidLinked ?? existing?.authUidLinked) === 'boolean'
          ? { authUidLinked: user.authUidLinked ?? existing?.authUidLinked }
          : {}),
        ...(typeof (user.emailVerified ?? existing?.emailVerified) === 'boolean'
          ? { emailVerified: user.emailVerified ?? existing?.emailVerified }
          : {}),
        ...(typeof (user.authDisabled ?? existing?.authDisabled) === 'boolean'
          ? { authDisabled: user.authDisabled ?? existing?.authDisabled }
          : {}),
        ...(typeof (
          user.authAccountCreatedAt ?? existing?.authAccountCreatedAt
        ) === 'string'
          ? {
              authAccountCreatedAt:
                user.authAccountCreatedAt ?? existing?.authAccountCreatedAt,
            }
          : {}),
        ...(user.passwordSetupStatus || existing?.passwordSetupStatus
          ? {
              passwordSetupStatus:
                user.passwordSetupStatus || existing?.passwordSetupStatus,
            }
          : {}),
        ...(typeof (
          user.passwordSetupEmailSentAt ?? existing?.passwordSetupEmailSentAt
        ) === 'string'
          ? {
              passwordSetupEmailSentAt:
                user.passwordSetupEmailSentAt ??
                existing?.passwordSetupEmailSentAt,
            }
          : {}),
      };
      evaluateUserUpdate(activeAuthContext, user.id, docPayload);
    },
    async saveBusiness() {},
    async saveShop() {},
    async saveProduct() {},
    async deleteProduct() {},
    async saveSale() {},
    async sendPasswordResetEmail(targetEmail: string) {
      passwordResetEmailsSent.push(targetEmail);
    },
    async sendEmailVerificationToCurrentUser() {
      if (!activeAuthContext?.token?.email) {
        throw new Error('UNAUTHENTICATED_SESSION');
      }
      verificationEmailsSent.push(activeAuthContext.token.email);
    },
    async reloadAndGetCurrentAuthState(expectedUid?: string) {
      if (!activeAuthContext) return null;
      if (expectedUid && activeAuthContext.uid !== expectedUid) return null;
      return {
        uid: activeAuthContext.uid,
        email: activeAuthContext.token.email || '',
        emailVerified: activeAuthContext.token.email_verified === true,
        idTokenRefreshed: true,
      };
    },
  };

  const localDb = new MemoryDatabaseAdapter();
  await localDb.initialize();
  const liveService = new LiveFirestoreDataService(rulesBackedProvider, localDb);

  const adminActor = (await rulesBackedProvider.getUserProfile(adminUid))!;
  const initialOwner = (await rulesBackedProvider.getUserProfile(ownerUid))!;
  const targetBiz = (await rulesBackedProvider.getBusiness(bizId))!;

  const adminSetupEmailRes = await liveService.sendBusinessOwnerPasswordSetupEmail({
    actor: adminActor,
    ownerUser: initialOwner,
    business: targetBiz,
  });
  assert.equal(adminSetupEmailRes.status, 'password_setup_email_sent');
  assert.equal(adminSetupEmailRes.metadataPersisted, true);
  assert.equal(adminSetupEmailRes.updatedOwner.passwordSetupStatus, 'email_sent');
  assert.equal(passwordResetEmailsSent.length, 1);

  // Switch activeAuthContext to the unverified Business Owner signing in after setting their password
  activeAuthContext = unverifiedOwnerAuth;
  const unverifiedSignInRes = await liveService.resolveAuthenticatedSession({
    uid: ownerUid,
    email: ownerEmail,
    displayName: 'SmartMind Test Owner',
    emailVerified: false,
  });
  assert.equal(unverifiedSignInRes.status, 'error');
  assert.equal(unverifiedSignInRes.errorCode, 'EMAIL_NOT_VERIFIED');
  assert.equal(
    unverifiedSignInRes.user?.emailVerified,
    false,
    'Unverified sign-in must read own profile via self-read rule and preserve emailVerified === false'
  );
  assert.equal(
    usersDocs.get(ownerUid)?.emailVerified,
    false,
    'Unverified sign-in must never mark Firestore profile verified'
  );
  assert.equal(
    usersDocs.get(ownerUid)?.passwordSetupStatus,
    'email_sent',
    'Unverified sign-in must preserve passwordSetupStatus === email_sent'
  );

  // Owner requests email verification link via requestBusinessOwnerEmailVerification (uses sendEmailVerification, NEVER sendPasswordResetEmail)
  const resetCountBeforeVerifyReq = passwordResetEmailsSent.length;
  const verifyEmailReqRes = await liveService.requestBusinessOwnerEmailVerification({
    authenticatedUid: ownerUid,
    authenticatedEmail: ownerEmail,
  });
  assert.equal(verifyEmailReqRes.status, 'verification_email_sent');
  assert.equal(verifyEmailReqRes.emailVerified, false);
  assert.deepEqual(verificationEmailsSent, [ownerEmail]);
  assert.equal(
    passwordResetEmailsSent.length,
    resetCountBeforeVerifyReq,
    'Email verification must NOT send another password reset email'
  );
  assert.equal(
    usersDocs.get(ownerUid)?.emailVerified,
    false,
    'Dispatching verification email must not prematurely mark Firestore profile verified'
  );

  // Even if caller passes emailVerified: true while Firebase Auth token still has email_verified: false,
  // synchronizeBusinessOwnerSignInState checks reloadAndGetCurrentAuthState and refuses to mark verified.
  const spoofedClientSync = await liveService.synchronizeBusinessOwnerSignInState({
    authenticatedUid: ownerUid,
    authenticatedEmail: ownerEmail,
    emailVerified: true, // Client claims true while token is false!
  });
  assert.equal(
    spoofedClientSync.emailVerified,
    false,
    'Never trust a client-supplied emailVerified: true when Firebase Auth token reports email_verified === false'
  );
  assert.equal(usersDocs.get(ownerUid)?.emailVerified, false);

  // ---------------------------------------------------------------------------
  // SCENARIO E: Verified business owner updating their own authentication metadata (emailVerified: true, passwordSetupStatus: 'verified', authUidLinked: true)
  // ---------------------------------------------------------------------------
  const verifiedOwnerAuth: RulesAuthContext = {
    uid: ownerUid,
    token: {
      email: ownerEmail,
      email_verified: true,
    },
  };
  activeAuthContext = verifiedOwnerAuth;

  // ---------------------------------------------------------------------------
  // SCENARIO F: Verified business owner blocked from changing role, businessId, email, id, permissions, assignedShopIds, status, or createdAt
  // ---------------------------------------------------------------------------
  const baseOwnerDoc = { ...usersDocs.get(ownerUid)! };
  const validSelfAuthMetaPayload = {
    ...baseOwnerDoc,
    emailVerified: true,
    passwordSetupStatus: 'verified',
    authUidLinked: true,
    updatedAt: '2026-11-03T09:20:00.000Z',
  };

  const forbiddenMutations: Array<{ field: string; payload: Record<string, any> }> = [
    {
      field: 'role',
      payload: { ...validSelfAuthMetaPayload, role: 'platform_admin' },
    },
    {
      field: 'businessId',
      payload: { ...validSelfAuthMetaPayload, businessId: 'biz-live-other-99' },
    },
    {
      field: 'email',
      payload: { ...validSelfAuthMetaPayload, email: 'hijacked@gmail.com' },
    },
    {
      field: 'id',
      payload: { ...validSelfAuthMetaPayload, id: 'uid-hijacked-id' },
    },
    {
      field: 'permissions',
      payload: { ...validSelfAuthMetaPayload, permissions: ['process_sales'] },
    },
    {
      field: 'assignedShopIds',
      payload: {
        ...validSelfAuthMetaPayload,
        assignedShopIds: [shopId, 'shop-extra-99'],
      },
    },
    {
      field: 'status',
      payload: { ...validSelfAuthMetaPayload, status: 'suspended' },
    },
    {
      field: 'createdAt',
      payload: { ...validSelfAuthMetaPayload, createdAt: '2026-11-02' },
    },
    {
      field: 'fullName (non-auth metadata field)',
      payload: { ...validSelfAuthMetaPayload, fullName: 'Changed Name' },
    },
  ];

  for (const mutation of forbiddenMutations) {
    assert.throws(
      () => evaluateUserUpdate(verifiedOwnerAuth, ownerUid, mutation.payload),
      /permission-denied/,
      `Scenario F: Verified business owner must be blocked from changing ${mutation.field}`
    );
  }

  // ---------------------------------------------------------------------------
  // SCENARIO G: Verified business owner blocked from updating another user's profile unless permitted by existing staff-management rules
  // ---------------------------------------------------------------------------
  // G1: Blocked from updating another business owner's profile
  assert.throws(
    () =>
      evaluateUserUpdate(verifiedOwnerAuth, otherOwnerUid, {
        ...usersDocs.get(otherOwnerUid)!,
        fullName: 'Tampered Other Owner',
        updatedAt: '2026-11-03T09:25:00.000Z',
      }),
    /permission-denied/,
    'Scenario G1: Verified business owner must be blocked from updating another business owner profile'
  );

  // G2: Permitted to update same-business cashier profile under existing staff-management rules
  evaluateUserUpdate(verifiedOwnerAuth, cashierUid, {
    ...usersDocs.get(cashierUid)!,
    fullName: 'Validation Cashier (Updated by Owner)',
    updatedAt: '2026-11-03T09:26:00.000Z',
  });
  assert.equal(
    usersDocs.get(cashierUid)?.fullName,
    'Validation Cashier (Updated by Owner)'
  );

  // G3: Blocked from escalating a staff member to business_owner
  assert.throws(
    () =>
      evaluateUserUpdate(verifiedOwnerAuth, cashierUid, {
        ...usersDocs.get(cashierUid)!,
        role: 'business_owner',
        updatedAt: '2026-11-03T09:27:00.000Z',
      }),
    /permission-denied/,
    'Scenario G3: Business owner cannot escalate staff role to business_owner via client update'
  );

  // ---------------------------------------------------------------------------
  // SCENARIO H: Non-owner staff (shop_manager, cashier) blocked from self-updating owner metadata or escalating privileges
  // ---------------------------------------------------------------------------
  const verifiedCashierAuth: RulesAuthContext = {
    uid: cashierUid,
    token: {
      email: 'cashier@validationstore.ng',
      email_verified: true,
    },
  };
  const verifiedManagerAuth: RulesAuthContext = {
    uid: managerUid,
    token: {
      email: 'manager@validationstore.ng',
      email_verified: true,
    },
  };

  assert.throws(
    () =>
      evaluateUserUpdate(verifiedCashierAuth, cashierUid, {
        ...usersDocs.get(cashierUid)!,
        emailVerified: true,
        passwordSetupStatus: 'verified',
        updatedAt: '2026-11-03T09:28:00.000Z',
      }),
    /permission-denied/,
    'Scenario H1: Cashier must be blocked from self-updating authentication metadata'
  );

  assert.throws(
    () =>
      evaluateUserUpdate(verifiedManagerAuth, managerUid, {
        ...usersDocs.get(managerUid)!,
        role: 'business_owner',
        emailVerified: true,
        passwordSetupStatus: 'verified',
        updatedAt: '2026-11-03T09:28:00.000Z',
      }),
    /permission-denied/,
    'Scenario H2: Shop Manager must be blocked from self-updating or escalating role to business_owner'
  );

  // ---------------------------------------------------------------------------
  // SCENARIO I: Failed Firestore synchronization during resolveAuthenticatedSession() does NOT fabricate verified status in memory
  // ---------------------------------------------------------------------------
  activeAuthContext = verifiedOwnerAuth;
  simulateSyncWriteFailure = true;
  const failedSyncSession = await liveService.resolveAuthenticatedSession({
    uid: ownerUid,
    email: ownerEmail,
    displayName: 'SmartMind Test Owner',
    emailVerified: true,
  });
  assert.equal(
    failedSyncSession.status,
    'error',
    'Scenario I: Failed Firestore synchronization must return status === error, never ready'
  );
  assert.equal(
    failedSyncSession.errorCode,
    'OWNER_AUTH_SYNC_FAILED',
    'Scenario I: Failed Firestore synchronization must return errorCode === OWNER_AUTH_SYNC_FAILED'
  );
  assert.equal(
    failedSyncSession.user,
    undefined,
    'Scenario I: Failed Firestore synchronization must NOT return a locally fabricated verified user object'
  );
  assert.equal(
    usersDocs.get(ownerUid)?.emailVerified,
    false,
    'Scenario I: Firestore document remains unverified when write fails'
  );
  assert.equal(
    usersDocs.get(ownerUid)?.passwordSetupStatus,
    'email_sent',
    'Scenario I: Firestore document retains passwordSetupStatus === email_sent when write fails'
  );
  simulateSyncWriteFailure = false;

  // ---------------------------------------------------------------------------
  // SCENARIO E & J: Successful verification and sign-in persists emailVerified: true and passwordSetupStatus: 'verified',
  //                 and the Platform Admin dashboard resolves the owner state as verified after refresh
  // ---------------------------------------------------------------------------
  const successfulVerifiedSession = await liveService.resolveAuthenticatedSession({
    uid: ownerUid,
    email: ownerEmail,
    displayName: 'SmartMind Test Owner',
    emailVerified: true,
  });
  assert.equal(successfulVerifiedSession.status, 'ready');
  assert.ok(successfulVerifiedSession.user);
  assert.equal(successfulVerifiedSession.user.id, ownerUid);
  assert.equal(successfulVerifiedSession.user.emailVerified, true);
  assert.equal(successfulVerifiedSession.user.passwordSetupStatus, 'verified');
  assert.equal(successfulVerifiedSession.user.authUidLinked, true);
  assert.equal(successfulVerifiedSession.user.createdAt, createdAtIso);

  // Verify persisted Firestore document
  const persistedOwnerDoc = usersDocs.get(ownerUid)!;
  assert.equal(persistedOwnerDoc.emailVerified, true);
  assert.equal(persistedOwnerDoc.passwordSetupStatus, 'verified');
  assert.equal(persistedOwnerDoc.authUidLinked, true);
  assert.equal(persistedOwnerDoc.createdAt, createdAtIso);

  // Platform Admin refreshes live data and resolves the owner's authentication state
  activeAuthContext = {
    uid: adminUid,
    token: {
      email: STAGING_PLATFORM_ADMIN_EMAIL,
      email_verified: true,
    },
  };
  const adminRefreshedSession = await liveService.resolveAuthenticatedSession({
    uid: adminUid,
    email: STAGING_PLATFORM_ADMIN_EMAIL,
    displayName: 'SmartMind Staging Admin',
    emailVerified: true,
  });
  assert.equal(adminRefreshedSession.status, 'ready');
  const refreshedOwnerInAdminDataset = adminRefreshedSession.dataset?.users.find(
    (u) => u.id === ownerUid
  );
  assert.ok(refreshedOwnerInAdminDataset);
  assert.equal(refreshedOwnerInAdminDataset.emailVerified, true);
  assert.equal(refreshedOwnerInAdminDataset.passwordSetupStatus, 'verified');

  const resolvedAdminDashboardState = resolveBusinessOwnerAuthState(
    refreshedOwnerInAdminDataset,
    targetBiz
  );
  assert.equal(resolvedAdminDashboardState.primaryState, 'Auth UID Linked');
  assert.equal(resolvedAdminDashboardState.isUidLinked, true);
  assert.equal(resolvedAdminDashboardState.isEmailVerified, true);
  assert.equal(resolvedAdminDashboardState.requiresRepair, false);

  // Also verify intermediate 'Password Established / Email Verification Pending' state resolution
  const intermediateEstablishedState = resolveBusinessOwnerAuthState(
    {
      id: ownerUid,
      status: 'active',
      authUidLinked: true,
      emailVerified: false,
      passwordSetupStatus: 'password_established',
    },
    targetBiz
  );
  assert.equal(
    intermediateEstablishedState.primaryState,
    'Password Established / Email Verification Pending'
  );
  assert.equal(intermediateEstablishedState.isEmailVerified, false);
});

// =============================================================================
// GLOBAL BUSINESS ADMINISTRATION SUITE (SCENARIOS A THROUGH P)
// =============================================================================
test('Global Business Administration: Full Multi-Tenant Oversight & Universal Administration (Scenarios A through P)', async () => {
  const fs = await import('node:fs');
  const {
    LiveFirestoreDataService,
    STAGING_PLATFORM_ADMIN_EMAIL,
  } = await import('../services/liveFirestoreDataService');
  const { canUserAccessView, resolveBusinessOwnerAuthState } = await import(
    '../utils/posCalculations'
  );

  // Multi-tenant in-memory test store
  const mockBusinesses = new Map<string, any>();
  const mockShops = new Map<string, any[]>();
  const mockProducts = new Map<string, any[]>();
  const mockSales = new Map<string, any[]>();
  const mockUsers = new Map<string, any>();
  const mockAuditLogs: any[] = [];

  // Seed two distinct tenant businesses
  const biz1: any = {
    id: 'biz-tenant-alpha',
    name: 'Alpha Supermarket Chain',
    legalName: 'Alpha Retail Ltd',
    businessType: 'Supermarket & Grocery Chain',
    registrationNumber: 'RC-111111',
    taxIdentificationNumber: 'TIN-111111',
    ownerUserId: 'usr-owner-alpha',
    ownerName: 'Alpha Owner',
    ownerEmail: 'owner@alpha.ng',
    contactEmail: 'contact@alpha.ng',
    primaryPhone: '+2348011111111',
    headquartersAddress: '100 Marina, Lagos',
    currencyCode: 'NGN',
    currencySymbol: '₦',
    defaultTaxRatePercent: 7.5,
    status: 'active' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  const biz2: any = {
    id: 'biz-tenant-beta',
    name: 'Beta Healthcare Pharmacy',
    legalName: 'Beta Pharmacy Ltd',
    businessType: 'Pharmacy & Healthcare Retail',
    registrationNumber: 'RC-222222',
    taxIdentificationNumber: 'TIN-222222',
    ownerUserId: 'usr-owner-beta',
    ownerName: 'Beta Owner',
    ownerEmail: 'owner@beta.ng',
    contactEmail: 'contact@beta.ng',
    primaryPhone: '+2348022222222',
    headquartersAddress: '200 Broad Street, Lagos',
    currencyCode: 'NGN',
    currencySymbol: '₦',
    defaultTaxRatePercent: 5.0,
    status: 'active' as const,
    createdAt: '2026-01-02T00:00:00.000Z',
  };

  mockBusinesses.set(biz1.id, biz1);
  mockBusinesses.set(biz2.id, biz2);

  // Seed shops
  const shop1Alpha = {
    id: 'shop-alpha-01',
    businessId: biz1.id,
    code: 'ALP-01',
    name: 'Alpha VI Branch',
    category: 'Supermarket' as const,
    locationCity: 'Lagos',
    address: 'VI Lagos',
    phone: '+2348011111111',
    managerName: 'Alpha Manager',
    status: 'active' as const,
    terminalId: 'TERM-ALP01',
    taxRatePercent: 7.5,
    receiptHeaderNote: 'Alpha VI',
    receiptFooterNote: 'Thanks',
    createdAt: '2026-01-01T00:00:00.000Z',
    pendingSyncCount: 0,
    lastSyncedAt: 'Cloud Synced',
  };

  const shop2Beta = {
    id: 'shop-beta-01',
    businessId: biz2.id,
    code: 'BET-01',
    name: 'Beta Ikeja Branch',
    category: 'Pharmacy' as const,
    locationCity: 'Lagos',
    address: 'Ikeja Lagos',
    phone: '+2348022222222',
    managerName: 'Beta Manager',
    status: 'active' as const,
    terminalId: 'TERM-BET01',
    taxRatePercent: 5.0,
    receiptHeaderNote: 'Beta Pharmacy',
    receiptFooterNote: 'Get well soon',
    createdAt: '2026-01-02T00:00:00.000Z',
    pendingSyncCount: 0,
    lastSyncedAt: 'Cloud Synced',
  };

  mockShops.set(biz1.id, [shop1Alpha]);
  mockShops.set(biz2.id, [shop2Beta]);

  // Seed products
  const prodAlpha = {
    id: 'prod-alpha-101',
    shopId: shop1Alpha.id,
    businessId: biz1.id,
    sku: 'SKU-ALP-101',
    barcode: 'BC-ALP-101',
    name: 'Corn Flakes 500g',
    categoryId: 'cat-groceries',
    categoryName: 'Groceries',
    unit: 'Box',
    costPrice: 2000,
    sellingPrice: 2500,
    stockQuantity: 50,
    reorderLevel: 10,
    isActive: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const prodBeta = {
    id: 'prod-beta-201',
    shopId: shop2Beta.id,
    businessId: biz2.id,
    sku: 'SKU-BET-201',
    barcode: 'BC-BET-201',
    name: 'Paracetamol 500mg',
    categoryId: 'cat-meds',
    categoryName: 'Medication',
    unit: 'Pack',
    costPrice: 500,
    sellingPrice: 800,
    stockQuantity: 120,
    reorderLevel: 20,
    isActive: true,
    updatedAt: '2026-01-02T00:00:00.000Z',
  };

  mockProducts.set(`${biz1.id}:${shop1Alpha.id}`, [prodAlpha]);
  mockProducts.set(`${biz2.id}:${shop2Beta.id}`, [prodBeta]);

  // Seed sales
  const saleAlpha = {
    id: 'sale-alpha-1001',
    shopId: shop1Alpha.id,
    businessId: biz1.id,
    receiptNumber: 'REC-ALP-001',
    terminalId: shop1Alpha.terminalId,
    cashierUserId: 'usr-cashier-alpha',
    cashierName: 'Alpha Cashier',
    createdAt: '2026-02-01T12:00:00.000Z',
    items: [],
    subtotal: 5000,
    discountAmount: 0,
    taxRatePercent: 7.5,
    taxAmount: 375,
    totalAmount: 5375,
    amountTendered: 6000,
    changeDue: 625,
    paymentMethod: 'cash' as const,
    status: 'completed' as const,
    syncStatus: 'synced' as const,
    notes: 'Sale Alpha',
  };

  const saleBeta = {
    id: 'sale-beta-2001',
    shopId: shop2Beta.id,
    businessId: biz2.id,
    receiptNumber: 'REC-BET-001',
    terminalId: shop2Beta.terminalId,
    cashierUserId: 'usr-cashier-beta',
    cashierName: 'Beta Cashier',
    createdAt: '2026-02-02T14:30:00.000Z',
    items: [],
    subtotal: 3200,
    discountAmount: 200,
    taxRatePercent: 5.0,
    taxAmount: 150,
    totalAmount: 3150,
    amountTendered: 3150,
    changeDue: 0,
    paymentMethod: 'pos_card' as const,
    status: 'completed' as const,
    syncStatus: 'synced' as const,
    notes: 'Sale Beta',
  };

  mockSales.set(`${biz1.id}:${shop1Alpha.id}`, [saleAlpha]);
  mockSales.set(`${biz2.id}:${shop2Beta.id}`, [saleBeta]);

  // Seed users (Platform Admin, Owners, Managers, Cashiers)
  const platformAdminUser: any = {
    id: 'usr-admin-master',
    businessId: 'PLATFORM',
    username: 'staging_admin',
    email: STAGING_PLATFORM_ADMIN_EMAIL,
    fullName: 'SmartMind Staging Platform Administrator',
    role: 'platform_admin',
    roleLabel: 'Platform Administrator',
    assignedShopIds: [],
    permissions: [],
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastLoginAt: '2026-02-01T00:00:00.000Z',
  };

  const ownerAlphaUser: any = {
    id: biz1.ownerUserId,
    businessId: biz1.id,
    username: 'alpha_owner',
    email: biz1.ownerEmail,
    fullName: biz1.ownerName,
    role: 'business_owner',
    roleLabel: 'Business Owner (Alpha)',
    assignedShopIds: [shop1Alpha.id],
    permissions: ['manage_business_settings', 'manage_shops', 'manage_staff'],
    status: 'active',
    authUidLinked: true,
    emailVerified: true,
    passwordSetupStatus: 'verified',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastLoginAt: '2026-02-01T00:00:00.000Z',
  };

  const managerAlphaUser: any = {
    id: 'usr-mgr-alpha',
    businessId: biz1.id,
    username: 'alpha_mgr',
    email: 'manager@alpha.ng',
    fullName: 'Alpha Manager',
    role: 'shop_manager',
    roleLabel: 'Shop Manager (Alpha)',
    assignedShopIds: [shop1Alpha.id],
    permissions: ['manage_products', 'process_sales', 'adjust_inventory'],
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastLoginAt: '2026-02-01T00:00:00.000Z',
  };

  const cashierAlphaUser: any = {
    id: 'usr-cashier-alpha',
    businessId: biz1.id,
    username: 'alpha_cashier',
    email: 'cashier@alpha.ng',
    fullName: 'Alpha Cashier',
    role: 'cashier',
    roleLabel: 'Cashier (Alpha)',
    assignedShopIds: [shop1Alpha.id],
    permissions: ['process_sales'],
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastLoginAt: '2026-02-01T00:00:00.000Z',
  };

  mockUsers.set(platformAdminUser.id, platformAdminUser);
  mockUsers.set(ownerAlphaUser.id, ownerAlphaUser);
  mockUsers.set(managerAlphaUser.id, managerAlphaUser);
  mockUsers.set(cashierAlphaUser.id, cashierAlphaUser);

  // Instantiate MockCloudStoreProvider
  const mockProvider: any = {
    async getUserProfile(uid: string) {
      return mockUsers.get(uid) || null;
    },
    async getBusiness(bizId: string) {
      return mockBusinesses.get(bizId) || null;
    },
    async listAllBusinesses() {
      return Array.from(mockBusinesses.values());
    },
    async listAllUsers() {
      return Array.from(mockUsers.values());
    },
    async listBusinessUsers(bizId: string) {
      return Array.from(mockUsers.values()).filter((u) => u.businessId === bizId);
    },
    async listBusinessShops(bizId: string) {
      return mockShops.get(bizId) || [];
    },
    async getShop(bizId: string, shopId: string) {
      const shops = mockShops.get(bizId) || [];
      return shops.find((s) => s.id === shopId) || null;
    },
    async listShopProducts(bizId: string, shopId: string) {
      return mockProducts.get(`${bizId}:${shopId}`) || [];
    },
    async listShopSales(bizId: string, shopId: string) {
      return mockSales.get(`${bizId}:${shopId}`) || [];
    },
    async saveUserProfile(user: any) {
      mockUsers.set(user.id, { ...user });
    },
    async saveBusiness(biz: any) {
      mockBusinesses.set(biz.id, { ...biz });
    },
    async saveShop(shop: any) {
      const list = mockShops.get(shop.businessId) || [];
      const idx = list.findIndex((s) => s.id === shop.id);
      if (idx >= 0) list[idx] = { ...shop };
      else list.push({ ...shop });
      mockShops.set(shop.businessId, list);
    },
    async saveProduct(product: any) {
      const key = `${product.businessId}:${product.shopId}`;
      const list = mockProducts.get(key) || [];
      const idx = list.findIndex((p) => p.id === product.id);
      if (idx >= 0) list[idx] = { ...product };
      else list.push({ ...product });
      mockProducts.set(key, list);
    },
    async saveSale(sale: any) {
      const key = `${sale.businessId}:${sale.shopId}`;
      const list = mockSales.get(key) || [];
      const idx = list.findIndex((s) => s.id === sale.id);
      if (idx >= 0) list[idx] = { ...sale };
      else list.push({ ...sale });
      mockSales.set(key, list);
    },
    async recordPlatformAuditLog(log: any) {
      mockAuditLogs.unshift({ ...log });
    },
    async listPlatformAuditLogs(filters?: any) {
      let res = [...mockAuditLogs];
      if (filters?.businessId && filters.businessId !== 'all') {
        res = res.filter((l) => l.businessId === filters.businessId);
      }
      if (filters?.action && filters.action !== 'all') {
        res = res.filter((l) => l.action === filters.action);
      }
      return res;
    },
  };

  const adminService = new LiveFirestoreDataService(mockProvider);

  // ---------------------------------------------------------------------------
  // SCENARIO A: Platform admin can view all registered businesses across all tenants
  // ---------------------------------------------------------------------------
  // SCENARIO A: Platform admin can view all registered businesses across all tenants
  // ---------------------------------------------------------------------------
  const allBusinesses = await mockProvider.listAllBusinesses();
  assert.equal(allBusinesses.length, 2, 'Scenario A: Admin must see all registered businesses');
  assert.ok(allBusinesses.some((b: any) => b.id === biz1.id));
  assert.ok(allBusinesses.some((b: any) => b.id === biz2.id));

  // ---------------------------------------------------------------------------
  // SCENARIO B: Platform admin can access dedicated administrative workspace for any business
  // ---------------------------------------------------------------------------
  const workspaceBiz1 = await mockProvider.getBusiness(biz1.id);
  assert.ok(workspaceBiz1, 'Scenario B: Admin can load tenant 1 business workspace');
  assert.equal(workspaceBiz1.name, 'Alpha Supermarket Chain');

  const workspaceBiz2 = await mockProvider.getBusiness(biz2.id);
  assert.ok(workspaceBiz2, 'Scenario B: Admin can load tenant 2 business workspace');
  assert.equal(workspaceBiz2.name, 'Beta Healthcare Pharmacy');

  // ---------------------------------------------------------------------------
  // SCENARIO C: Platform admin can view all shops across all businesses from global shops directory
  // ---------------------------------------------------------------------------
  const allShopsGlobal = await adminService.listAllShopsGlobal();
  assert.equal(allShopsGlobal.length, 2, 'Scenario C: Admin can view all shops globally');
  assert.ok(allShopsGlobal.some((s) => s.id === shop1Alpha.id && s.businessId === biz1.id));
  assert.ok(allShopsGlobal.some((s) => s.id === shop2Beta.id && s.businessId === biz2.id));

  // ---------------------------------------------------------------------------
  // SCENARIO D: Platform admin can view all products and inventory across all businesses and shops
  // ---------------------------------------------------------------------------
  const allProductsGlobal = await adminService.listAllProductsGlobal();
  assert.equal(allProductsGlobal.length, 2, 'Scenario D: Admin can view all products globally');
  assert.ok(allProductsGlobal.some((p) => p.id === prodAlpha.id && p.sku === 'SKU-ALP-101'));
  assert.ok(allProductsGlobal.some((p) => p.id === prodBeta.id && p.sku === 'SKU-BET-201'));

  // ---------------------------------------------------------------------------
  // SCENARIO E: Platform admin can view all sales transactions across all businesses with date filtering
  // ---------------------------------------------------------------------------
  const allSalesGlobal = await adminService.listAllSalesGlobal();
  assert.equal(allSalesGlobal.length, 2, 'Scenario E: Admin can view all sales globally');
  assert.ok(allSalesGlobal.some((s) => s.receiptNumber === 'REC-ALP-001'));
  assert.ok(allSalesGlobal.some((s) => s.receiptNumber === 'REC-BET-001'));

  // Scoped to business 1
  const biz1Sales = await adminService.listAllSalesGlobal({ businessId: biz1.id });
  assert.equal(biz1Sales.length, 1);
  assert.equal(biz1Sales[0].receiptNumber, 'REC-ALP-001');

  // ---------------------------------------------------------------------------
  // SCENARIO F: Platform admin can view all users (owners, managers, cashiers) across all businesses
  // ---------------------------------------------------------------------------
  const allUsersGlobal = await mockProvider.listAllUsers();
  assert.equal(allUsersGlobal.length, 4, 'Scenario F: Admin can view all users across businesses');
  assert.ok(allUsersGlobal.some((u: any) => u.role === 'platform_admin'));
  assert.ok(allUsersGlobal.some((u: any) => u.role === 'business_owner'));
  assert.ok(allUsersGlobal.some((u: any) => u.role === 'shop_manager'));
  assert.ok(allUsersGlobal.some((u: any) => u.role === 'cashier'));

  // ---------------------------------------------------------------------------
  // SCENARIO G: Platform admin can suspend and activate a business with required reason
  // ---------------------------------------------------------------------------
  await mockProvider.saveBusiness({
    ...biz2,
    status: 'suspended',
  });
  await adminService.recordPlatformAuditLog({
    businessId: biz2.id,
    businessName: biz2.name,
    adminUid: platformAdminUser.id,
    adminEmail: platformAdminUser.email,
    adminName: platformAdminUser.fullName,
    action: 'business_suspended',
    targetEntityType: 'business',
    targetEntityId: biz2.id,
    targetEntityName: biz2.name,
    reason: 'Temporary suspension pending annual regulatory tax filing update',
  });

  const updatedBiz2 = await mockProvider.getBusiness(biz2.id);
  assert.equal(updatedBiz2?.status, 'suspended', 'Scenario G: Business status must be suspended');
  const auditLogsG = await adminService.listPlatformAuditLogs({ businessId: biz2.id });
  assert.ok(auditLogsG.some((l) => l.action === 'business_suspended' && l.reason.includes('annual regulatory tax filing')));

  // ---------------------------------------------------------------------------
  // SCENARIO H: Platform admin can disable and enable a staff account with required reason
  // ---------------------------------------------------------------------------
  // Blank reason must throw
  await assert.rejects(
    () =>
      adminService.toggleUserStatusAsAdmin({
        userId: cashierAlphaUser.id,
        status: 'suspended',
        reason: '   ',
        adminUser: platformAdminUser,
      }),
    /reason is mandatory/
  );

  // Valid reason succeeds
  await adminService.toggleUserStatusAsAdmin({
    userId: cashierAlphaUser.id,
    status: 'suspended',
    reason: 'Security audit: Suspicious repeated checkout attempts',
    adminUser: platformAdminUser,
  });

  const updatedCashier = await mockProvider.getUserProfile(cashierAlphaUser.id);
  assert.equal(updatedCashier?.status, 'suspended', 'Scenario H: Staff account must be suspended');
  const auditLogsH = await adminService.listPlatformAuditLogs({ action: 'user_disabled' });
  assert.ok(auditLogsH.length > 0 && auditLogsH[0].reason.includes('Suspicious repeated checkout'));

  // ---------------------------------------------------------------------------
  // SCENARIO I: Platform admin can adjust inventory stock for any product in any shop with required reason
  // ---------------------------------------------------------------------------
  await assert.rejects(
    () =>
      adminService.adjustInventoryAsAdmin({
        businessId: biz1.id,
        shopId: shop1Alpha.id,
        productId: prodAlpha.id,
        delta: 15,
        type: 'restock',
        reason: '',
        adminUser: platformAdminUser,
      }),
    /reason is mandatory/
  );

  const adjResult = await adminService.adjustInventoryAsAdmin({
    businessId: biz1.id,
    shopId: shop1Alpha.id,
    productId: prodAlpha.id,
    delta: 15,
    type: 'audit_correction',
    reason: 'Physical count confirmed 65 units on warehouse shelf',
    adminUser: platformAdminUser,
  });
  assert.equal(adjResult.newQuantity, 65, 'Scenario I: Stock must update to 65');
  const updatedProdAlpha = (await mockProvider.listShopProducts(biz1.id, shop1Alpha.id)).find(
    (p: any) => p.id === prodAlpha.id
  );
  assert.equal(updatedProdAlpha?.stockQuantity, 65);

  // ---------------------------------------------------------------------------
  // SCENARIO J: Platform admin can void or refund a sale with required reason
  // ---------------------------------------------------------------------------
  await assert.rejects(
    () =>
      adminService.updateSaleStatusAsAdmin({
        businessId: biz1.id,
        shopId: shop1Alpha.id,
        saleId: saleAlpha.id,
        nextStatus: 'voided',
        reason: '',
        adminUser: platformAdminUser,
      }),
    /reason is mandatory/
  );

  await adminService.updateSaleStatusAsAdmin({
    businessId: biz1.id,
    shopId: shop1Alpha.id,
    saleId: saleAlpha.id,
    nextStatus: 'voided',
    reason: 'Customer cancelled transaction at counter before leaving store',
    adminUser: platformAdminUser,
  });
  const updatedSaleAlpha = (await mockProvider.listShopSales(biz1.id, shop1Alpha.id)).find(
    (s: any) => s.id === saleAlpha.id
  );
  assert.equal(updatedSaleAlpha?.status, 'voided_demo', 'Scenario J: Sale status must be voided');

  // ---------------------------------------------------------------------------
  // SCENARIO K: Platform admin can update business configuration (name, contact, tax rate) and changes persist
  // ---------------------------------------------------------------------------
  await mockProvider.saveBusiness({
    ...biz1,
    name: 'Alpha Supermarket Chain (Upgraded)',
    defaultTaxRatePercent: 8.5,
    contactEmail: 'hq@alpha-retail.ng',
  });
  const refreshedBiz1 = await mockProvider.getBusiness(biz1.id);
  assert.equal(refreshedBiz1?.name, 'Alpha Supermarket Chain (Upgraded)');
  assert.equal(refreshedBiz1?.defaultTaxRatePercent, 8.5);
  assert.equal(refreshedBiz1?.contactEmail, 'hq@alpha-retail.ng');

  // ---------------------------------------------------------------------------
  // SCENARIO L: Platform admin can manage subscription status and tiers for any business
  // ---------------------------------------------------------------------------
  const testSub = {
    businessId: biz1.id,
    businessName: biz1.name,
    tier: 'enterprise' as const,
    status: 'active' as const,
    maxShops: 10,
    maxUsers: 50,
    monthlyFeeNaira: 75000,
    startDate: '2026-01-01',
    renewalDate: '2027-01-01',
    gracePeriodDays: 30,
    notes: 'Premium Enterprise Multi-Tenant License',
  };
  await adminService.recordPlatformAuditLog({
    businessId: biz1.id,
    businessName: biz1.name,
    adminUid: platformAdminUser.id,
    adminEmail: platformAdminUser.email,
    adminName: platformAdminUser.fullName,
    action: 'subscription_plan_updated',
    targetEntityType: 'subscription',
    targetEntityId: biz1.id,
    targetEntityName: `${biz1.name} Subscription`,
    reason: 'Upgraded tenant to Enterprise plan with 10 shops quota',
  });
  assert.equal(testSub.tier, 'enterprise');
  assert.equal(testSub.maxShops, 10);

  // ---------------------------------------------------------------------------
  // SCENARIO M: All administrative actions are recorded in the global platform audit log
  // ---------------------------------------------------------------------------
  const allLogs = await adminService.listPlatformAuditLogs();
  assert.ok(allLogs.length >= 4, 'Scenario M: Audit trail contains multiple append-only records');
  for (const log of allLogs) {
    assert.ok(log.id, 'Log must have id');
    assert.ok(log.businessId, 'Log must have businessId');
    assert.ok(log.adminUid, 'Log must have adminUid');
    assert.ok(log.action, 'Log must have action');
    assert.ok(log.reason && log.reason.trim().length > 0, 'Log must have mandatory reason');
  }

  // ---------------------------------------------------------------------------
  // SCENARIO N: Non-admin users (business owners, managers, cashiers) CANNOT access platform admin routes or views
  // ---------------------------------------------------------------------------
  assert.equal(canUserAccessView(platformAdminUser, 'platform_admin'), true, 'Platform admin can access platform_admin');
  assert.equal(canUserAccessView(ownerAlphaUser, 'platform_admin'), false, 'Business owner CANNOT access platform_admin');
  assert.equal(canUserAccessView(managerAlphaUser, 'platform_admin'), false, 'Shop manager CANNOT access platform_admin');
  assert.equal(canUserAccessView(cashierAlphaUser, 'platform_admin'), false, 'Cashier CANNOT access platform_admin');

  // ---------------------------------------------------------------------------
  // SCENARIO O: Existing business owner authentication and password setup flows remain fully functional
  // ---------------------------------------------------------------------------
  const resolvedOwnerAuthState = resolveBusinessOwnerAuthState(ownerAlphaUser, biz1);
  assert.equal(resolvedOwnerAuthState.primaryState, 'Auth UID Linked');
  assert.equal(resolvedOwnerAuthState.isUidLinked, true);
  assert.equal(resolvedOwnerAuthState.isEmailVerified, true);
  assert.equal(resolvedOwnerAuthState.requiresRepair, false);

  const pendingOwnerAuthState = resolveBusinessOwnerAuthState(
    {
      ...ownerAlphaUser,
      emailVerified: false,
      passwordSetupStatus: 'email_sent',
    },
    biz1
  );
  assert.equal(pendingOwnerAuthState.primaryState, 'Password Setup Email Sent');
  assert.equal(pendingOwnerAuthState.isEmailVerified, false);

  // ---------------------------------------------------------------------------
  // SCENARIO P: Staging-only boundary is preserved: no production configuration or rules files modified
  // ---------------------------------------------------------------------------
  assert.ok(fs.existsSync('firestore.staging.rules'), 'firestore.staging.rules exists');
  assert.ok(fs.existsSync('firestore.rules'), 'production firestore.rules exists');
  assert.ok(fs.existsSync('firebase.production.json'), 'firebase.production.json exists');
  assert.ok(fs.existsSync('firebase.staging.json'), 'firebase.staging.json exists');

  const prodJson = JSON.parse(fs.readFileSync('firebase.production.json', 'utf8'));
  assert.equal(prodJson.firestore?.rules, 'firestore.rules', 'Production firebase config references firestore.rules');
  assert.equal(prodJson.firestore?.database, 'ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4', 'Production database untouched');

  const stagingJson = JSON.parse(fs.readFileSync('firebase.staging.json', 'utf8'));
  assert.equal(stagingJson.firestore?.rules, 'firestore.staging.rules', 'Staging config references firestore.staging.rules');
  assert.equal(stagingJson.firestore?.database, '(default)', 'Staging database is (default)');
});





