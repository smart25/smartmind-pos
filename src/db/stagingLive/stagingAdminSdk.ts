/**
 * SmartMind POS — Dedicated Staging-Only Firebase Admin SDK Initializer & Scoped Fixture Tracker
 *
 * Strictly isolated from `functions/src/core.ts` (`getOrInitServerAdmin()`).
 * - Used ONLY for approved staging fixture setup, scoped cleanup, and read-only Admin inspection.
 * - Never used to evaluate security rule assertions (those MUST use `stagingClientSdk.ts`).
 * - Never falls back to production (`gen-lang-client-0985802946`) or `[DEFAULT]` Admin app.
 * - Enforces run-scoped cleanup (`smartmind-staging-test-{runId}`) and prohibits whole-DB/bucket wipes.
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  FORBIDDEN_PRODUCTION_PROJECT_ID,
  loadAndValidateStagingTestEnv,
  REPO_ROOT,
  STAGING_FIRESTORE_DATABASE_ID,
  STAGING_PROJECT_ID,
  ValidatedStagingTestEnv,
} from './stagingTestEnv';

export interface StagingServiceAccountJson {
  type?: string;
  project_id?: string;
  client_email?: string;
  private_key?: string;
}

export interface StagingAdminAppHandle {
  name: string;
  options: {
    projectId?: string;
    storageBucket?: string;
  };
}

export interface StagingAdminDocRef {
  path: string;
  get(): Promise<{ exists: boolean; data(): Record<string, any> | undefined }>;
  set(data: Record<string, any>, options?: { merge?: boolean }): Promise<unknown>;
  update(data: Record<string, any>): Promise<unknown>;
  delete(): Promise<unknown>;
}

export interface StagingAdminFirestore {
  doc(documentPath: string): StagingAdminDocRef;
}

export interface StagingAdminAuthUser {
  uid: string;
  email?: string;
  emailVerified: boolean;
  disabled: boolean;
}

export interface StagingAdminAuth {
  getUser(uid: string): Promise<StagingAdminAuthUser>;
  getUserByEmail(email: string): Promise<StagingAdminAuthUser>;
  listUsers(maxResults?: number): Promise<{
    users: StagingAdminAuthUser[];
  }>;
  createUser(properties: {
    uid: string;
    email: string;
    password?: string;
    displayName?: string;
    emailVerified?: boolean;
    disabled?: boolean;
  }): Promise<StagingAdminAuthUser>;
  deleteUser(uid: string): Promise<void>;
  createCustomToken(uid: string, developerClaims?: Record<string, unknown>): Promise<string>;
}

export interface StagingAdminStorageFile {
  name: string;
  save(data: Uint8Array | Buffer, options?: { contentType?: string }): Promise<unknown>;
  delete(options?: { ignoreNotFound?: boolean }): Promise<unknown>;
  exists(): Promise<[boolean]>;
}

export interface StagingAdminBucket {
  name: string;
  file(filePath: string): StagingAdminStorageFile;
}

export interface StagingAdminStorage {
  bucket(name?: string): StagingAdminBucket;
}

export interface StagingAdminSecurityRules {
  getFirestoreRuleset(): Promise<{
    name: string;
    createTime: string;
    source: { files: Array<{ name: string; content: string }> };
  }>;
  getStorageRuleset(): Promise<{
    name: string;
    createTime: string;
    source: { files: Array<{ name: string; content: string }> };
  }>;
}

export interface StagingAdminContext {
  appName: string;
  runNamespace: string;
  app: StagingAdminAppHandle;
  db: StagingAdminFirestore;
  auth: StagingAdminAuth;
  bucket: StagingAdminBucket;
  securityRules: StagingAdminSecurityRules;
  env: ValidatedStagingTestEnv;
  tracker: ScopedStagingFixtureTracker;
  dispose: () => Promise<void>;
}

export interface InitStagingAdminOptions {
  runId: string;
  env?: ValidatedStagingTestEnv;
  serviceAccountPath?: string;
  allowApplicationDefault?: boolean;
  processEnv?: Record<string, string | undefined>;
}

interface AdminModules {
  appModule: {
    getApps(): StagingAdminAppHandle[];
    initializeApp(options: Record<string, any>, name: string): StagingAdminAppHandle;
    deleteApp(app: StagingAdminAppHandle): Promise<void>;
    cert(serviceAccount: StagingServiceAccountJson): unknown;
    applicationDefault(): unknown;
  };
  firestoreModule: {
    getFirestore(app: StagingAdminAppHandle, databaseId: string): StagingAdminFirestore;
  };
  authModule: {
    getAuth(app: StagingAdminAppHandle): StagingAdminAuth;
  };
  storageModule: {
    getStorage(app: StagingAdminAppHandle): StagingAdminStorage;
  };
  securityRulesModule: {
    getSecurityRules(app: StagingAdminAppHandle): StagingAdminSecurityRules;
  };
}

function loadFunctionsAdminModules(): AdminModules {
  const functionsDir = path.join(REPO_ROOT, 'functions');
  const requireFromRepo = createRequire(import.meta.url);
  const resolveFromFunctions = (subpath: string) =>
    requireFromRepo.resolve(subpath, { paths: [functionsDir, REPO_ROOT] });

  return {
    appModule: requireFromRepo(resolveFromFunctions('firebase-admin/app')),
    firestoreModule: requireFromRepo(
      resolveFromFunctions('firebase-admin/firestore')
    ),
    authModule: requireFromRepo(resolveFromFunctions('firebase-admin/auth')),
    storageModule: requireFromRepo(resolveFromFunctions('firebase-admin/storage')),
    securityRulesModule: requireFromRepo(
      resolveFromFunctions('firebase-admin/security-rules')
    ),
  };
}

/**
 * Parses and strictly validates a staging service-account JSON file before
 * passing it to `firebase-admin`. Fails closed on any non-staging project.
 */
export function loadAndValidateStagingServiceAccount(
  filePath: string
): StagingServiceAccountJson {
  const trimmed = filePath.trim();
  if (!trimmed) {
    throw new Error(
      'STAGING_ADMIN_CREDENTIAL_MISSING: Service account path cannot be empty.'
    );
  }
  if (!fs.existsSync(trimmed)) {
    throw new Error(
      `STAGING_ADMIN_CREDENTIAL_NOT_FOUND: Staging service account file does not exist at "${trimmed}".`
    );
  }

  let parsed: StagingServiceAccountJson;
  try {
    parsed = JSON.parse(fs.readFileSync(trimmed, 'utf8'));
  } catch {
    throw new Error(
      'STAGING_ADMIN_CREDENTIAL_INVALID: Service account file is not valid JSON.'
    );
  }

  const projectId = parsed.project_id?.trim();
  if (!projectId) {
    throw new Error(
      'STAGING_ADMIN_CREDENTIAL_INVALID: Service account JSON is missing "project_id".'
    );
  }
  if (projectId === FORBIDDEN_PRODUCTION_PROJECT_ID) {
    throw new Error(
      `CROSS_ENVIRONMENT_VIOLATION: Service account belongs to PRODUCTION ("${FORBIDDEN_PRODUCTION_PROJECT_ID}"). Staging Admin SDK refused initialization.`
    );
  }
  if (projectId !== STAGING_PROJECT_ID) {
    throw new Error(
      `CROSS_ENVIRONMENT_VIOLATION: Service account project_id "${projectId}" does not equal "${STAGING_PROJECT_ID}".`
    );
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(
      'STAGING_ADMIN_CREDENTIAL_INVALID: Service account JSON is missing client_email or private_key.'
    );
  }

  return parsed;
}

export const PROTECTED_PREEXISTING_STAGING_UIDS = new Set<string>([
  'hLG3ltaqMJh4lJlixuL9QpKVu3u2', // smart@smartmindconcept.com
  'xC5hccJfqgYfDhjKWAW8MGKZTBH3', // evinwokolo25@gmail.com
]);

/**
 * Tracks ONLY documents, Storage objects, and ephemeral Auth users created
 * by a single test run under `smartmind-staging-test-{runId}`, preventing broad deletions.
 */
export class ScopedStagingFixtureTracker {
  readonly runNamespace: string;
  private readonly firestoreDocPaths = new Set<string>();
  private readonly storageObjectPaths = new Set<string>();
  private readonly authUids = new Set<string>();

  constructor(private readonly runId: string) {
    const clean = runId.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
    if (!clean) {
      throw new Error('INVALID_ARGUMENT: runId cannot be blank.');
    }
    this.runNamespace = `smartmind-staging-test-${clean}`;
  }

  private assertPathBelongsToRun(targetPath: string, kind: 'Firestore' | 'Storage'): string {
    const normalized = targetPath.trim().replace(/^\/+/, '');
    if (!normalized) {
      throw new Error(`INVALID_ARGUMENT: ${kind} path cannot be empty.`);
    }
    if (!normalized.includes(this.runId) && !normalized.includes(this.runNamespace)) {
      throw new Error(
        `UNSCOPED_FIXTURE_PATH_REJECTED: ${kind} path "${normalized}" does not include run identifier "${this.runId}". Refusing to track or delete non-run data.`
      );
    }
    return normalized;
  }

  trackFirestoreDoc(documentPath: string): string {
    const normalized = this.assertPathBelongsToRun(documentPath, 'Firestore');
    this.firestoreDocPaths.add(normalized);
    return normalized;
  }

  trackStorageObject(objectPath: string): string {
    const normalized = this.assertPathBelongsToRun(objectPath, 'Storage');
    this.storageObjectPaths.add(normalized);
    return normalized;
  }

  trackAuthUser(uid: string): string {
    const trimmed = uid.trim();
    if (!trimmed) {
      throw new Error('INVALID_ARGUMENT: Auth UID cannot be empty.');
    }
    if (PROTECTED_PREEXISTING_STAGING_UIDS.has(trimmed)) {
      throw new Error(
        `PROTECTED_ACCOUNT_REJECTED: Refusing to track pre-existing staging account "${trimmed}" for deletion.`
      );
    }
    if (!trimmed.includes(this.runId) && !trimmed.includes(this.runNamespace)) {
      throw new Error(
        `UNSCOPED_AUTH_UID_REJECTED: Auth UID "${trimmed}" does not include run identifier "${this.runId}".`
      );
    }
    this.authUids.add(trimmed);
    return trimmed;
  }

  getTrackedFirestoreDocPaths(): string[] {
    // Delete deepest nested subcollection paths before parent docs
    return Array.from(this.firestoreDocPaths).sort(
      (a, b) => b.split('/').length - a.split('/').length
    );
  }

  getTrackedStorageObjectPaths(): string[] {
    return Array.from(this.storageObjectPaths);
  }

  getTrackedAuthUids(): string[] {
    return Array.from(this.authUids);
  }

  async cleanupTrackedFixtures(
    db: StagingAdminFirestore,
    bucket: StagingAdminBucket,
    auth?: StagingAdminAuth
  ): Promise<{ deletedDocs: number; deletedObjects: number; deletedUsers: number }> {
    let deletedDocs = 0;
    let deletedObjects = 0;
    let deletedUsers = 0;

    for (const objPath of this.getTrackedStorageObjectPaths()) {
      this.assertPathBelongsToRun(objPath, 'Storage');
      await bucket.file(objPath).delete({ ignoreNotFound: true });
      deletedObjects++;
    }
    this.storageObjectPaths.clear();

    for (const docPath of this.getTrackedFirestoreDocPaths()) {
      this.assertPathBelongsToRun(docPath, 'Firestore');
      await db.doc(docPath).delete();
      deletedDocs++;
    }
    this.firestoreDocPaths.clear();

    if (auth) {
      for (const uid of this.getTrackedAuthUids()) {
        if (PROTECTED_PREEXISTING_STAGING_UIDS.has(uid)) {
          continue;
        }
        try {
          await auth.deleteUser(uid);
          deletedUsers++;
        } catch (err: any) {
          if (err?.code !== 'auth/user-not-found') {
            throw err;
          }
        }
      }
      this.authUids.clear();
    }

    return { deletedDocs, deletedObjects, deletedUsers };
  }
}

/**
 * Initializes an isolated, uniquely named Firebase Admin SDK app strictly
 * bound to `smartmind-pos-staging` and Firestore `(default)`.
 */
export function initStagingAdminContext(
  options: InitStagingAdminOptions
): StagingAdminContext {
  const processEnv = options.processEnv ?? process.env;
  const env =
    options.env ?? loadAndValidateStagingTestEnv({ processEnv });

  if (env.projectId !== STAGING_PROJECT_ID) {
    throw new Error(
      `CROSS_ENVIRONMENT_VIOLATION: Staging Admin refused project "${env.projectId}".`
    );
  }

  const tracker = new ScopedStagingFixtureTracker(options.runId);
  const appName = `smartmind-staging-admin-${options.runId
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  const credPath =
    options.serviceAccountPath?.trim() ||
    processEnv.STAGING_FIREBASE_SERVICE_ACCOUNT_PATH?.trim() ||
    processEnv.GOOGLE_APPLICATION_CREDENTIALS?.trim();

  if (!credPath && !options.allowApplicationDefault) {
    throw new Error(
      'STAGING_ADMIN_CREDENTIAL_REQUIRED: Set STAGING_FIREBASE_SERVICE_ACCOUNT_PATH (or GOOGLE_APPLICATION_CREDENTIALS) pointing to a service-account JSON for "smartmind-pos-staging". Silent default fallback is disabled.'
    );
  }

  const modules = loadFunctionsAdminModules();
  if (modules.appModule.getApps().some((a) => a.name === appName)) {
    throw new Error(
      `DUPLICATE_STAGING_ADMIN_APP: Admin app "${appName}" is already initialized.`
    );
  }

  const credential = credPath
    ? modules.appModule.cert(loadAndValidateStagingServiceAccount(credPath))
    : modules.appModule.applicationDefault();

  const app = modules.appModule.initializeApp(
    {
      credential,
      projectId: STAGING_PROJECT_ID,
      storageBucket: env.storageBucket,
    },
    appName
  );

  // Verify the actual initialized Admin app projectId before returning handles.
  if (app.options.projectId !== STAGING_PROJECT_ID) {
    void modules.appModule.deleteApp(app);
    throw new Error(
      `CROSS_ENVIRONMENT_VIOLATION: Initialized Admin app projectId "${app.options.projectId}" does not match "${STAGING_PROJECT_ID}".`
    );
  }

  const db = modules.firestoreModule.getFirestore(
    app,
    STAGING_FIRESTORE_DATABASE_ID
  );
  const auth = modules.authModule.getAuth(app);
  const bucket = modules.storageModule.getStorage(app).bucket(env.storageBucket);
  const securityRules = modules.securityRulesModule.getSecurityRules(app);

  const dispose = async () => {
    await modules.appModule.deleteApp(app);
  };

  return {
    appName,
    runNamespace: tracker.runNamespace,
    app,
    db,
    auth,
    bucket,
    securityRules,
    env,
    tracker,
    dispose,
  };
}
