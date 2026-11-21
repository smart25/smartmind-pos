/**
 * SmartMind POS — Isolated Staging Firebase Client SDK Initializer
 *
 * Uses modular Firebase Web Client SDK directly with uniquely named apps
 * so security rule assertions execute against live `smartmind-pos-staging`
 * rules without ever importing `src/firebase.ts` or connecting to emulators.
 */

import { deleteApp, FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth, signOut } from 'firebase/auth';
import {
  Firestore,
  getFirestore,
  initializeFirestore,
  terminate,
} from 'firebase/firestore';
import { Functions, getFunctions } from 'firebase/functions';
import { FirebaseStorage, getStorage } from 'firebase/storage';
import {
  loadAndValidateStagingTestEnv,
  STAGING_FIRESTORE_DATABASE_ID,
  STAGING_FUNCTIONS_REGION,
  STAGING_PROJECT_ID,
  ValidatedStagingTestEnv,
} from './stagingTestEnv';

export interface StagingClientContext {
  appName: string;
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
  functions: Functions;
  env: ValidatedStagingTestEnv;
  dispose: () => Promise<void>;
}

function sanitizeSegment(segment: string): string {
  const cleaned = segment.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
  if (!cleaned) {
    throw new Error('INVALID_ARGUMENT: App name segment cannot be blank.');
  }
  return cleaned;
}

/**
 * Creates an isolated, uniquely named Firebase Client SDK context pinned strictly
 * to `smartmind-pos-staging` and Firestore database `(default)`.
 */
export function createStagingClientContext(
  runId: string,
  actorKey: string,
  envOverride?: ValidatedStagingTestEnv
): StagingClientContext {
  const env = envOverride ?? loadAndValidateStagingTestEnv();

  if (env.projectId !== STAGING_PROJECT_ID) {
    throw new Error(
      `CROSS_ENVIRONMENT_VIOLATION: Client SDK refused project "${env.projectId}".`
    );
  }
  if (env.firestoreDatabaseId !== STAGING_FIRESTORE_DATABASE_ID) {
    throw new Error(
      `CROSS_ENVIRONMENT_VIOLATION: Client SDK refused database "${env.firestoreDatabaseId}".`
    );
  }

  const appName = `smartmind-staging-client-${sanitizeSegment(
    runId
  )}-${sanitizeSegment(actorKey)}`;

  if (getApps().some((existing) => existing.name === appName)) {
    throw new Error(
      `DUPLICATE_STAGING_CLIENT_APP: Firebase client app "${appName}" is already initialized.`
    );
  }

  const app = initializeApp(
    {
      apiKey: env.apiKey,
      authDomain: env.authDomain,
      projectId: env.projectId,
      storageBucket: env.storageBucket,
      messagingSenderId: env.messagingSenderId,
      appId: env.appId,
    },
    appName
  );

  // Independently verify initialized app options before constructing service handles.
  if (app.options.projectId !== STAGING_PROJECT_ID) {
    void deleteApp(app);
    throw new Error(
      `CROSS_ENVIRONMENT_VIOLATION: Initialized Firebase app projectId "${app.options.projectId}" does not match "${STAGING_PROJECT_ID}".`
    );
  }
  if (!app.options.authDomain?.startsWith(`${STAGING_PROJECT_ID}.`)) {
    void deleteApp(app);
    throw new Error(
      `CROSS_ENVIRONMENT_VIOLATION: Initialized Firebase app authDomain "${app.options.authDomain}" does not match "${STAGING_PROJECT_ID}".`
    );
  }

  const auth = getAuth(app);
  let db: Firestore;
  try {
    db = initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
      },
      STAGING_FIRESTORE_DATABASE_ID
    );
  } catch {
    db = getFirestore(app, STAGING_FIRESTORE_DATABASE_ID);
  }

  if (db.app.options.projectId !== STAGING_PROJECT_ID) {
    void deleteApp(app);
    throw new Error(
      `CROSS_ENVIRONMENT_VIOLATION: Firestore client app projectId "${db.app.options.projectId}" mismatch.`
    );
  }

  const storage = getStorage(app);
  const functions = getFunctions(app, STAGING_FUNCTIONS_REGION);

  const dispose = async () => {
    try {
      await terminate(db);
    } catch {
      // Best-effort Firestore client termination
    }
    try {
      if (auth.currentUser) {
        await signOut(auth);
      }
    } catch {
      // Best-effort signOut before app deletion
    }
    await deleteApp(app);
  };

  return {
    appName,
    app,
    auth,
    db,
    storage,
    functions,
    env,
    dispose,
  };
}

/**
 * Tracks multiple isolated actor client contexts for a single test run
 * and disposes all of them safely in teardown.
 */
export class StagingClientRegistry {
  private readonly contexts = new Map<string, StagingClientContext>();

  constructor(
    private readonly runId: string,
    private readonly env: ValidatedStagingTestEnv = loadAndValidateStagingTestEnv()
  ) {}

  getOrCreateActorContext(actorKey: string): StagingClientContext {
    const existing = this.contexts.get(actorKey);
    if (existing) {
      return existing;
    }
    const created = createStagingClientContext(this.runId, actorKey, this.env);
    this.contexts.set(actorKey, created);
    return created;
  }

  async disposeAll(): Promise<void> {
    const all = Array.from(this.contexts.values());
    this.contexts.clear();
    await Promise.allSettled(all.map((ctx) => ctx.dispose()));
  }
}
