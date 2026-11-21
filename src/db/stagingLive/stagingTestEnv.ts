/**
 * SmartMind POS — Live Staging Test Environment Loader & Fail-Closed Guard
 *
 * Strictly isolated from src/firebase.ts and functions/src/core.ts.
 * Explicitly parses .env.staging (since `tsx --test` does not run Vite)
 * and enforces hard fail-closed invariants so staging tests can NEVER
 * target production or connect to Firebase Emulators.
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prodAppletConfig from '../../../firebase-applet-config.json';

export const STAGING_PROJECT_ID = 'smartmind-pos-staging' as const;
export const STAGING_FIRESTORE_DATABASE_ID = '(default)' as const;
export const STAGING_FUNCTIONS_REGION = 'africa-south1' as const;
export const STAGING_ADMIN_EMAIL = 'smart@smartmindconcept.com' as const;

export const FORBIDDEN_PRODUCTION_PROJECT_ID = 'gen-lang-client-0985802946' as const;
export const FORBIDDEN_PRODUCTION_DATABASE_ID =
  'ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4' as const;

export const REQUIRED_STAGING_ENV_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_FIRESTORE_DATABASE_ID',
  'VITE_USE_FIREBASE_EMULATORS',
] as const;

export const EMULATOR_HOST_ENV_KEYS = [
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_AUTH_EMULATOR_HOST',
  'FIREBASE_STORAGE_EMULATOR_HOST',
  'STORAGE_EMULATOR_HOST',
  'FUNCTIONS_EMULATOR_HOST',
  'PUBSUB_EMULATOR_HOST',
  'FIREBASE_DATABASE_EMULATOR_HOST',
  'FIREBASE_EMULATOR_HUB',
] as const;

export interface ValidatedStagingTestEnv {
  apiKey: string;
  authDomain: string;
  projectId: typeof STAGING_PROJECT_ID;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  firestoreDatabaseId: typeof STAGING_FIRESTORE_DATABASE_ID;
  functionsRegion: typeof STAGING_FUNCTIONS_REGION;
  useFirebaseEmulators: false;
}

export interface LoadStagingTestEnvOptions {
  envFilePath?: string;
  rawEnvOverride?: Record<string, string | undefined>;
  processEnv?: Record<string, string | undefined>;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../../..');
export const DEFAULT_ENV_STAGING_PATH = path.join(REPO_ROOT, '.env.staging');

function containsForbiddenProductionMarker(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.includes(FORBIDDEN_PRODUCTION_PROJECT_ID) ||
    lower.includes(FORBIDDEN_PRODUCTION_DATABASE_ID)
  );
}

/**
 * Loads `.env.staging` and validates every staging-only invariant.
 * Never logs or includes secret values (API keys / App IDs) in error messages.
 */
export function loadAndValidateStagingTestEnv(
  options: LoadStagingTestEnvOptions = {}
): ValidatedStagingTestEnv {
  const processEnv = options.processEnv ?? process.env;

  // 1. Reject any active Firebase Emulator host variables in the host environment.
  for (const emulatorKey of EMULATOR_HOST_ENV_KEYS) {
    const val = processEnv[emulatorKey]?.trim();
    if (val) {
      throw new Error(
        `EMULATOR_PROHIBITED: Environment variable "${emulatorKey}" is set. Live staging tests must never use Firebase Emulators.`
      );
    }
  }

  // 2. Reject any host-level process.env overrides pointing to production or non-staging.
  const hostProjectVars = [
    'VITE_FIREBASE_PROJECT_ID',
    'GCLOUD_PROJECT',
    'GOOGLE_CLOUD_PROJECT',
    'FIREBASE_PROJECT',
    'PROJECT_ID',
  ] as const;
  for (const key of hostProjectVars) {
    const val = processEnv[key]?.trim();
    if (val && val !== STAGING_PROJECT_ID) {
      throw new Error(
        `CROSS_ENVIRONMENT_VIOLATION: Host environment variable "${key}" is set to "${val}", which does not equal "${STAGING_PROJECT_ID}".`
      );
    }
  }

  const hostDbVars = [
    'VITE_FIREBASE_FIRESTORE_DATABASE_ID',
    'FIRESTORE_DATABASE_ID',
  ] as const;
  for (const key of hostDbVars) {
    const val = processEnv[key]?.trim();
    if (val && val !== STAGING_FIRESTORE_DATABASE_ID) {
      throw new Error(
        `CROSS_ENVIRONMENT_VIOLATION: Host environment variable "${key}" is set to "${val}", which does not equal "${STAGING_FIRESTORE_DATABASE_ID}".`
      );
    }
  }

  if (
    processEnv.VITE_USE_FIREBASE_EMULATORS !== undefined &&
    processEnv.VITE_USE_FIREBASE_EMULATORS.trim() !== '' &&
    processEnv.VITE_USE_FIREBASE_EMULATORS.trim().toLowerCase() !== 'false'
  ) {
    throw new Error(
      'EMULATOR_PROHIBITED: Host environment variable "VITE_USE_FIREBASE_EMULATORS" is enabled. Live staging tests prohibit emulators.'
    );
  }

  // 3. Parse .env.staging (or use injected rawEnvOverride in unit tests).
  let parsedEnv: Record<string, string | undefined>;
  if (options.rawEnvOverride) {
    parsedEnv = { ...options.rawEnvOverride };
  } else {
    const envPath = options.envFilePath ?? DEFAULT_ENV_STAGING_PATH;
    if (!fs.existsSync(envPath)) {
      throw new Error(
        `STAGING_CONFIG_MISSING: Required staging environment file not found at "${envPath}".`
      );
    }
    parsedEnv = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
  }

  // 4. Verify all required keys exist and are non-empty.
  const missingKeys: string[] = [];
  for (const key of REQUIRED_STAGING_ENV_KEYS) {
    const value = parsedEnv[key]?.trim();
    if (!value) {
      missingKeys.push(key);
    }
  }
  if (missingKeys.length > 0) {
    throw new Error(
      `STAGING_CONFIG_INCOMPLETE: Missing required staging keys: ${missingKeys.join(', ')}.`
    );
  }

  const apiKey = parsedEnv.VITE_FIREBASE_API_KEY!.trim();
  const authDomain = parsedEnv.VITE_FIREBASE_AUTH_DOMAIN!.trim();
  const projectId = parsedEnv.VITE_FIREBASE_PROJECT_ID!.trim();
  const storageBucket = parsedEnv.VITE_FIREBASE_STORAGE_BUCKET!.trim();
  const messagingSenderId = parsedEnv.VITE_FIREBASE_MESSAGING_SENDER_ID!.trim();
  const appId = parsedEnv.VITE_FIREBASE_APP_ID!.trim();
  const firestoreDatabaseId = parsedEnv.VITE_FIREBASE_FIRESTORE_DATABASE_ID!.trim();
  const useEmulatorsRaw = parsedEnv.VITE_USE_FIREBASE_EMULATORS!.trim().toLowerCase();

  // 5. Strict staging-only invariants.
  if (projectId !== STAGING_PROJECT_ID) {
    throw new Error(
      `CROSS_ENVIRONMENT_VIOLATION: VITE_FIREBASE_PROJECT_ID must strictly equal "${STAGING_PROJECT_ID}" (got "${projectId}").`
    );
  }

  if (firestoreDatabaseId !== STAGING_FIRESTORE_DATABASE_ID) {
    throw new Error(
      `CROSS_ENVIRONMENT_VIOLATION: VITE_FIREBASE_FIRESTORE_DATABASE_ID must strictly equal "${STAGING_FIRESTORE_DATABASE_ID}" (got "${firestoreDatabaseId}").`
    );
  }

  if (useEmulatorsRaw !== 'false') {
    throw new Error(
      `EMULATOR_PROHIBITED: VITE_USE_FIREBASE_EMULATORS must strictly equal "false" (got "${useEmulatorsRaw}").`
    );
  }

  if (
    containsForbiddenProductionMarker(authDomain) ||
    !authDomain.startsWith(`${STAGING_PROJECT_ID}.`)
  ) {
    throw new Error(
      `CROSS_ENVIRONMENT_VIOLATION: VITE_FIREBASE_AUTH_DOMAIN ("${authDomain}") does not belong to "${STAGING_PROJECT_ID}".`
    );
  }

  if (
    containsForbiddenProductionMarker(storageBucket) ||
    !storageBucket.startsWith(`${STAGING_PROJECT_ID}.`)
  ) {
    throw new Error(
      `CROSS_ENVIRONMENT_VIOLATION: VITE_FIREBASE_STORAGE_BUCKET ("${storageBucket}") does not belong to "${STAGING_PROJECT_ID}".`
    );
  }

  if (
    apiKey.startsWith('YOUR_') ||
    appId.startsWith('YOUR_') ||
    messagingSenderId.startsWith('YOUR_')
  ) {
    throw new Error(
      'STAGING_CONFIG_INCOMPLETE: Staging configuration still contains placeholder values.'
    );
  }

  // 6. Reject accidental reuse of production firebase-applet-config.json credentials.
  if (
    apiKey === prodAppletConfig.apiKey ||
    appId === prodAppletConfig.appId ||
    messagingSenderId === prodAppletConfig.messagingSenderId
  ) {
    throw new Error(
      'CROSS_ENVIRONMENT_VIOLATION: Staging configuration matched production credentials from firebase-applet-config.json.'
    );
  }

  return {
    apiKey,
    authDomain,
    projectId: STAGING_PROJECT_ID,
    storageBucket,
    messagingSenderId,
    appId,
    firestoreDatabaseId: STAGING_FIRESTORE_DATABASE_ID,
    functionsRegion: STAGING_FUNCTIONS_REGION,
    useFirebaseEmulators: false,
  };
}

/**
 * Returns non-sensitive diagnostics safe for console output.
 */
export function summarizeSafeStagingConfig(env: ValidatedStagingTestEnv): {
  projectId: string;
  authDomain: string;
  storageBucket: string;
  firestoreDatabaseId: string;
  functionsRegion: string;
  useFirebaseEmulators: boolean;
  hasApiKey: boolean;
  hasAppId: boolean;
  hasMessagingSenderId: boolean;
} {
  return {
    projectId: env.projectId,
    authDomain: env.authDomain,
    storageBucket: env.storageBucket,
    firestoreDatabaseId: env.firestoreDatabaseId,
    functionsRegion: env.functionsRegion,
    useFirebaseEmulators: env.useFirebaseEmulators,
    hasApiKey: env.apiKey.length > 0,
    hasAppId: env.appId.length > 0,
    hasMessagingSenderId: env.messagingSenderId.length > 0,
  };
}
