/**
 * SmartMind POS — Trusted Cloud Functions (2nd Gen) Deployable Entry Point
 *
 * This file is loaded by Firebase CLI during function discovery and deployment.
 * It enforces strict fail-closed regional resolution from deployment environment metadata:
 * - smartmind-pos-staging -> africa-south1
 * - gen-lang-client-0985802946 -> us-central1
 * - Missing metadata -> throws MISSING_PROJECT_CONFIGURATION
 * - Unknown metadata -> throws UNKNOWN_PROJECT_CONFIGURATION
 *
 * It contains NO silent fallback to ensure full compliance with the fail-closed deployment policy.
 */

import {
  resolveDeploymentRegion,
  resolveDeploymentDatabaseId,
  getOrInitServerAdmin,
  wrapCallable,
  executeProvisionBusinessAndPrimaryOwner,
  executeRepairBusinessOwnerAuth,
  executeSyncPosOperation,
  executeInviteAuthorizedStaff,
  executeSetTenantStatus,
  executeResetUserPassword,
  ResetUserPasswordRequest,
  ProvisionBusinessRequest,
  ProvisionBusinessResponse,
  RepairBusinessOwnerAuthRequest,
  RepairBusinessOwnerAuthResponse,
  SyncOperationPayload,
  SyncOperationResponse,
  InviteAuthorizedStaffRequest,
  SetTenantStatusRequest,
  executeStartPlatformAdminSupportSession,
  executeEndPlatformAdminSupportSession,
  executeGetPlatformAdminSupportSession,
  StartPlatformAdminSupportSessionRequest,
  EndPlatformAdminSupportSessionRequest,
  PlatformAdminSupportSessionResponse,
  EXPECTED_FIREBASE_PROJECT_ID,
  STAGING_FIREBASE_PROJECT_ID,
  STAGING_FUNCTIONS_REGION,
  PRODUCTION_FUNCTIONS_REGION,
} from './core';

// Re-export all core types, constants, validators, and handlers
export * from './core';

/**
 * Resolved export-time deployment region and Firestore database ID.
 * Evaluated strictly during Firebase Functions discovery and module initialization.
 * Must resolve from trusted deployment environment metadata (GCLOUD_PROJECT, FIREBASE_PROJECT, etc.).
 * Strictly throws MISSING_PROJECT_CONFIGURATION, UNKNOWN_PROJECT_CONFIGURATION, or CROSS_ENVIRONMENT_VIOLATION if invalid.
 */
export const RESOLVED_DEPLOYMENT_REGION: 'africa-south1' | 'us-central1' =
  resolveDeploymentRegion();

export const RESOLVED_FIRESTORE_DATABASE_ID: string =
  resolveDeploymentDatabaseId();

export const CLOUD_FUNCTIONS_REGION = RESOLVED_DEPLOYMENT_REGION;

/**
 * Ensure the [DEFAULT] Firebase Admin app is initialized at module load time
 * in Cloud Functions runtime before firebase-functions/v2/https onCall middleware
 * verifies incoming Authorization Bearer ID tokens.
 * No-ops in unit-test environments.
 */
getOrInitServerAdmin();

export const provisionBusinessAndPrimaryOwner = wrapCallable<
  ProvisionBusinessRequest,
  ProvisionBusinessResponse
>(
  (drivers, auth, data) =>
    executeProvisionBusinessAndPrimaryOwner(
      drivers.dbDriver,
      drivers.authDirectory,
      auth,
      data
    ),
  RESOLVED_DEPLOYMENT_REGION
);

export const repairBusinessOwnerAuth = wrapCallable<
  RepairBusinessOwnerAuthRequest,
  RepairBusinessOwnerAuthResponse
>(
  (drivers, auth, data) =>
    executeRepairBusinessOwnerAuth(
      drivers.dbDriver,
      drivers.authDirectory,
      auth,
      data
    ),
  RESOLVED_DEPLOYMENT_REGION
);

export const syncPosOperation = wrapCallable<
  SyncOperationPayload,
  SyncOperationResponse
>(
  (drivers, auth, data) => executeSyncPosOperation(drivers.dbDriver, auth, data),
  RESOLVED_DEPLOYMENT_REGION
);

/** Alias exported for backward compatibility with callers using syncShopOperation */
export const syncShopOperation = syncPosOperation;

export const inviteAuthorizedStaff = wrapCallable<
  InviteAuthorizedStaffRequest,
  { status: 'created'; isIdempotentReplay?: boolean; staffUser: Record<string, any> }
>(
  (drivers, auth, data) =>
    executeInviteAuthorizedStaff(
      drivers.dbDriver,
      auth,
      data,
      drivers.authDirectory
    ),
  RESOLVED_DEPLOYMENT_REGION
);

export const setTenantStatus = wrapCallable<
  SetTenantStatusRequest,
  {
    businessId: string;
    status: 'active' | 'suspended';
    updatedAt: string;
    auditEventId: string;
    subscriptionEventId: string;
  }
>(
  (drivers, auth, data) => executeSetTenantStatus(drivers.dbDriver, auth, data),
  RESOLVED_DEPLOYMENT_REGION
);

export const startPlatformAdminSupportSession = wrapCallable<
  StartPlatformAdminSupportSessionRequest,
  PlatformAdminSupportSessionResponse
>(
  (drivers, auth, data) =>
    executeStartPlatformAdminSupportSession(
      drivers.dbDriver,
      auth,
      data
    ),
  RESOLVED_DEPLOYMENT_REGION
);

export const endPlatformAdminSupportSession = wrapCallable<
  EndPlatformAdminSupportSessionRequest,
  PlatformAdminSupportSessionResponse
>(
  (drivers, auth, data) =>
    executeEndPlatformAdminSupportSession(
      drivers.dbDriver,
      auth,
      data
    ),
  RESOLVED_DEPLOYMENT_REGION
);

export const getPlatformAdminSupportSession = wrapCallable<
  Record<string, never>,
  PlatformAdminSupportSessionResponse | null
>(
  (drivers, auth) =>
    executeGetPlatformAdminSupportSession(drivers.dbDriver, auth),
  RESOLVED_DEPLOYMENT_REGION
);

export const resetUserPassword = wrapCallable<
  ResetUserPasswordRequest,
  { success: boolean; message: string; targetUserId: string }
>(
  (drivers, auth, data) =>
    executeResetUserPassword(
      drivers.dbDriver,
      drivers.authDirectory,
      auth,
      data
    ),
  RESOLVED_DEPLOYMENT_REGION
);

export const CLOUD_FUNCTIONS_MANIFEST = {
  runtime: 'nodejs22',
  region: RESOLVED_DEPLOYMENT_REGION,
  stagingRegion: STAGING_FUNCTIONS_REGION,
  productionRegion: PRODUCTION_FUNCTIONS_REGION,
  projectId: EXPECTED_FIREBASE_PROJECT_ID,
  firestoreDatabaseId: RESOLVED_FIRESTORE_DATABASE_ID,
  stagingProjectId: STAGING_FIREBASE_PROJECT_ID,
  requiresBlazePlan: true,
  endpoints: [
    'provisionBusinessAndPrimaryOwner',
    'repairBusinessOwnerAuth',
    'syncPosOperation',
    'syncShopOperation',
    'inviteAuthorizedStaff',
    'setTenantStatus',
    'resetUserPassword',
    'startPlatformAdminSupportSession',
    'endPlatformAdminSupportSession',
    'getPlatformAdminSupportSession',
  ],
} as const;
