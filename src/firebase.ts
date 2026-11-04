/**
 * SmartMind POS — Phase 6: Firebase Client Initialization & Error Handling
 *
 * Uses provisioned firebase-applet-config.json with environment variable overrides.
 * Never embeds Firebase Admin SDK credentials or private service-account keys.
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  Auth,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  setLogLevel,
  doc,
  getDocFromServer,
  Firestore,
} from 'firebase/firestore';
import {
  getFunctions,
  httpsCallable,
  Functions,
  HttpsCallable,
} from 'firebase/functions';
import appletConfig from '../firebase-applet-config.json';
import type {
  InviteAuthorizedStaffRequest,
  ProvisionBusinessRequest,
  ProvisionBusinessResponse,
  RepairBusinessOwnerAuthRequest,
  RepairBusinessOwnerAuthResponse,
  SetTenantStatusRequest,
  SyncOperationPayload,
  SyncOperationResponse,
} from '../functions/src/index';

export interface InviteAuthorizedStaffResponse {
  status: 'created';
  isIdempotentReplay?: boolean;
  staffUser: Record<string, any>;
}

export interface SetTenantStatusResponse {
  businessId: string;
  status: 'active' | 'suspended';
  updatedAt: string;
  auditEventId: string;
  subscriptionEventId: string;
}

export type {
  InviteAuthorizedStaffRequest,
  ProvisionBusinessRequest,
  ProvisionBusinessResponse,
  RepairBusinessOwnerAuthRequest,
  RepairBusinessOwnerAuthResponse,
  SetTenantStatusRequest,
  SyncOperationPayload,
  SyncOperationResponse,
};
export type SyncOperationRequest = SyncOperationPayload;

/**
 * Explicit environment-specific Cloud Functions deployment regions.
 * - Staging: africa-south1 (Johannesburg) co-located with staging Firestore.
 * - Production: us-central1 provisionally, pending live production verification.
 */
export const STAGING_FUNCTIONS_REGION = 'africa-south1' as const;
export const PRODUCTION_FUNCTIONS_REGION = 'us-central1' as const;
export const CLOUD_FUNCTIONS_REGION = STAGING_FUNCTIONS_REGION;

export interface ClientFirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  firestoreDatabaseId: string;
  functionsRegion: string;
}

export interface ClientConfigResolution {
  config: ClientFirebaseConfig;
  environment: 'staging' | 'production' | 'custom';
  isStaging: boolean;
  isProduction: boolean;
  missingStagingKeys: string[];
}

export function resolveClientFirebaseConfig(
  rawEnv?: Record<string, string | undefined>
): ClientConfigResolution {
  const env: Record<string, string | undefined> =
    rawEnv ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env
      ? (import.meta as any).env
      : typeof process !== 'undefined' && process.env
      ? process.env
      : {});

  const mode =
    env.MODE || (typeof process !== 'undefined' && process.env?.NODE_ENV) || '';
  const isStagingMode =
    mode === 'staging' ||
    env.VITE_APP_ENV === 'staging' ||
    env.VITE_FIREBASE_PROJECT_ID === 'smartmind-pos-staging';

  if (isStagingMode) {
    // STAGING MODE:
    // Read staging configuration EXCLUSIVELY from Vite environment variables.
    // NEVER fall back to firebase-applet-config.json.
    const apiKey = env.VITE_FIREBASE_API_KEY?.trim() || '';
    const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || '';
    const projectId =
      env.VITE_FIREBASE_PROJECT_ID?.trim() || 'smartmind-pos-staging';
    const storageBucket = env.VITE_FIREBASE_STORAGE_BUCKET?.trim() || '';
    const messagingSenderId =
      env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() || '';
    const appId = env.VITE_FIREBASE_APP_ID?.trim() || '';
    const firestoreDatabaseId =
      env.VITE_FIREBASE_FIRESTORE_DATABASE_ID?.trim() || '(default)';

    // Strict validation 1: Staging cannot initialize using the production project ID
    if (projectId !== 'smartmind-pos-staging') {
      throw new Error(
        `CROSS_ENVIRONMENT_VIOLATION: Staging mode cannot initialize using project ID "${projectId}". Staging project must strictly equal "smartmind-pos-staging".`
      );
    }

    // Strict validation 2: Staging cannot use the production named Firestore database
    if (firestoreDatabaseId !== '(default)') {
      throw new Error(
        `CROSS_ENVIRONMENT_VIOLATION: Staging mode cannot use Firestore database "${firestoreDatabaseId}". Staging must strictly equal "(default)".`
      );
    }

    // Check for missing required staging variables
    const missingKeys: string[] = [];
    if (!apiKey) missingKeys.push('VITE_FIREBASE_API_KEY');
    if (!authDomain) missingKeys.push('VITE_FIREBASE_AUTH_DOMAIN');
    if (!storageBucket) missingKeys.push('VITE_FIREBASE_STORAGE_BUCKET');
    if (!messagingSenderId) missingKeys.push('VITE_FIREBASE_MESSAGING_SENDER_ID');
    if (!appId) missingKeys.push('VITE_FIREBASE_APP_ID');

    // In staging mode: default to STAGING_FUNCTIONS_REGION ('africa-south1')
    // Reject any unexpected non-staging region override
    const rawStagingFunctionsRegion = env.VITE_FIREBASE_FUNCTIONS_REGION?.trim();
    if (
      rawStagingFunctionsRegion &&
      rawStagingFunctionsRegion !== STAGING_FUNCTIONS_REGION
    ) {
      throw new Error(
        `CROSS_ENVIRONMENT_VIOLATION: Staging mode cannot be overridden with non-staging functions region "${rawStagingFunctionsRegion}". Staging functions region must strictly equal "${STAGING_FUNCTIONS_REGION}".`
      );
    }
    const functionsRegion = STAGING_FUNCTIONS_REGION;

    const config: ClientFirebaseConfig = {
      apiKey,
      authDomain,
      projectId,
      storageBucket,
      messagingSenderId,
      appId,
      firestoreDatabaseId,
      functionsRegion,
    };

    return {
      config,
      environment: 'staging',
      isStaging: true,
      isProduction: false,
      missingStagingKeys: missingKeys,
    };
  }

  // PRODUCTION / DEFAULT MODE:
  // Preserves existing production configuration and behavior
  const resolvedFirestoreDatabaseId =
    env.VITE_FIREBASE_FIRESTORE_DATABASE_ID?.trim() ||
    appletConfig.firestoreDatabaseId;

  // In production mode: default to PRODUCTION_FUNCTIONS_REGION ('us-central1')
  // Do not inherit the staging region.
  const rawProdFunctionsRegion = env.VITE_FIREBASE_FUNCTIONS_REGION?.trim();
  const functionsRegion = rawProdFunctionsRegion || PRODUCTION_FUNCTIONS_REGION;

  const config: ClientFirebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY?.trim() || appletConfig.apiKey,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || appletConfig.authDomain,
    projectId: env.VITE_FIREBASE_PROJECT_ID?.trim() || appletConfig.projectId,
    storageBucket:
      env.VITE_FIREBASE_STORAGE_BUCKET?.trim() || appletConfig.storageBucket,
    messagingSenderId:
      env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() ||
      appletConfig.messagingSenderId,
    appId: env.VITE_FIREBASE_APP_ID?.trim() || appletConfig.appId,
    firestoreDatabaseId: resolvedFirestoreDatabaseId,
    functionsRegion,
  };

  const isProduction = config.projectId === 'gen-lang-client-0985802946';

  return {
    config,
    environment: isProduction ? 'production' : 'custom',
    isStaging: false,
    isProduction,
    missingStagingKeys: [],
  };
}

const clientResolution = resolveClientFirebaseConfig();

export const firebaseConfig = clientResolution.config;
export const isStagingMode = clientResolution.isStaging;
export const isProductionMode = clientResolution.isProduction;
export const missingStagingKeys = clientResolution.missingStagingKeys;

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.apiKey !== 'YOUR_FIREBASE_API_KEY' &&
    (!isStagingMode || missingStagingKeys.length === 0)
);

export function getFirebaseConfigDiagnostics() {
  const requiredEnvKeys = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
    'VITE_FIREBASE_FIRESTORE_DATABASE_ID',
  ] as const;

  const env: Record<string, string | undefined> =
    typeof import.meta !== 'undefined' && (import.meta as any).env
      ? (import.meta as any).env
      : typeof process !== 'undefined' && process.env
      ? process.env
      : {};

  const envPresence: Record<string, boolean> = {};
  for (const key of requiredEnvKeys) {
    envPresence[key] = Boolean(env[key] && String(env[key]).trim().length > 0);
  }

  return {
    isFirebaseConfigured,
    environment: clientResolution.environment,
    isStaging: isStagingMode,
    isProduction: isProductionMode,
    missingStagingKeys,
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain,
    firestoreDatabaseId: firebaseConfig.firestoreDatabaseId,
    functionsRegion: firebaseConfig.functionsRegion,
    storageBucket: firebaseConfig.storageBucket,
    hasApiKey: Boolean(firebaseConfig.apiKey && firebaseConfig.apiKey.length > 10),
    hasAppId: Boolean(firebaseConfig.appId && firebaseConfig.appId.length > 10),
    hasMessagingSenderId: Boolean(firebaseConfig.messagingSenderId),
    envPresence,
  };
}

function initFirebaseClientApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApp();
  }

  if (isStagingMode && missingStagingKeys.length > 0) {
    const errorMsg = `STAGING_CONFIGURATION_INCOMPLETE: Staging mode requires all VITE_FIREBASE_* variables to be populated in .env.staging from the Firebase Console (SmartMind POS Validation). Missing: ${missingStagingKeys.join(
      ', '
    )}. Silent fallback to production credentials in firebase-applet-config.json is strictly forbidden.`;
    throw new Error(errorMsg);
  }

  return initializeApp(firebaseConfig);
}

export const app: FirebaseApp = initFirebaseClientApp();

// Prevent internal @firebase/firestore WebChannel transport retries from emitting noisy
// console.error logs when the POS operates in offline-first mode or behind iframe proxies.
try {
  setLogLevel('silent');
} catch {
  // Ignore if unsupported in test environment
}

function createFirestoreInstance(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db: Firestore = createFirestoreInstance();
export const auth: Auth = getAuth(app);
export const functions: Functions = getFunctions(
  app,
  firebaseConfig.functionsRegion
);
export const googleProvider = new GoogleAuthProvider();

export const callProvisionBusinessAndPrimaryOwner: HttpsCallable<
  ProvisionBusinessRequest,
  ProvisionBusinessResponse
> = httpsCallable<ProvisionBusinessRequest, ProvisionBusinessResponse>(
  functions,
  'provisionBusinessAndPrimaryOwner'
);

export const callRepairBusinessOwnerAuth: HttpsCallable<
  RepairBusinessOwnerAuthRequest,
  RepairBusinessOwnerAuthResponse
> = httpsCallable<
  RepairBusinessOwnerAuthRequest,
  RepairBusinessOwnerAuthResponse
>(functions, 'repairBusinessOwnerAuth');

export const callInviteAuthorizedStaff: HttpsCallable<
  InviteAuthorizedStaffRequest,
  InviteAuthorizedStaffResponse
> = httpsCallable<InviteAuthorizedStaffRequest, InviteAuthorizedStaffResponse>(
  functions,
  'inviteAuthorizedStaff'
);

export const callSetTenantStatus: HttpsCallable<
  SetTenantStatusRequest,
  SetTenantStatusResponse
> = httpsCallable<SetTenantStatusRequest, SetTenantStatusResponse>(
  functions,
  'setTenantStatus'
);

export const callSyncPosOperation: HttpsCallable<
  SyncOperationPayload,
  SyncOperationResponse
> = httpsCallable<SyncOperationPayload, SyncOperationResponse>(
  functions,
  'syncPosOperation'
);

export const callSyncShopOperation: HttpsCallable<
  SyncOperationPayload,
  SyncOperationResponse
> = httpsCallable<SyncOperationPayload, SyncOperationResponse>(
  functions,
  'syncShopOperation'
);

export {
  signInWithPopup,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  firebaseSignOut,
  onAuthStateChanged,
  httpsCallable,
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  if (typeof window === 'undefined' || !isFirebaseConfigured) {
    return false;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.warn('Firestore client is currently operating in offline mode.');
      return false;
    }
    // Permission denied on /test/connection confirms Firestore server is reachable
    return true;
  }
}

if (typeof window !== 'undefined' && isFirebaseConfigured) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      testFirestoreConnection().catch(() => {});
    }
  });
}
