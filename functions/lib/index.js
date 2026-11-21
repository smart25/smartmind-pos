"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLOUD_FUNCTIONS_MANIFEST = exports.resetUserPassword = exports.getPlatformAdminSupportSession = exports.endPlatformAdminSupportSession = exports.startPlatformAdminSupportSession = exports.setTenantStatus = exports.inviteAuthorizedStaff = exports.syncShopOperation = exports.syncPosOperation = exports.repairBusinessOwnerAuth = exports.provisionBusinessAndPrimaryOwner = exports.CLOUD_FUNCTIONS_REGION = exports.RESOLVED_FIRESTORE_DATABASE_ID = exports.RESOLVED_DEPLOYMENT_REGION = void 0;
const core_1 = require("./core");
// Re-export all core types, constants, validators, and handlers
__exportStar(require("./core"), exports);
/**
 * Resolved export-time deployment region and Firestore database ID.
 * Evaluated strictly during Firebase Functions discovery and module initialization.
 * Must resolve from trusted deployment environment metadata (GCLOUD_PROJECT, FIREBASE_PROJECT, etc.).
 * Strictly throws MISSING_PROJECT_CONFIGURATION, UNKNOWN_PROJECT_CONFIGURATION, or CROSS_ENVIRONMENT_VIOLATION if invalid.
 */
exports.RESOLVED_DEPLOYMENT_REGION = (0, core_1.resolveDeploymentRegion)();
exports.RESOLVED_FIRESTORE_DATABASE_ID = (0, core_1.resolveDeploymentDatabaseId)();
exports.CLOUD_FUNCTIONS_REGION = exports.RESOLVED_DEPLOYMENT_REGION;
/**
 * Ensure the [DEFAULT] Firebase Admin app is initialized at module load time
 * in Cloud Functions runtime before firebase-functions/v2/https onCall middleware
 * verifies incoming Authorization Bearer ID tokens.
 * No-ops in unit-test environments.
 */
(0, core_1.getOrInitServerAdmin)();
exports.provisionBusinessAndPrimaryOwner = (0, core_1.wrapCallable)((drivers, auth, data) => (0, core_1.executeProvisionBusinessAndPrimaryOwner)(drivers.dbDriver, drivers.authDirectory, auth, data), exports.RESOLVED_DEPLOYMENT_REGION);
exports.repairBusinessOwnerAuth = (0, core_1.wrapCallable)((drivers, auth, data) => (0, core_1.executeRepairBusinessOwnerAuth)(drivers.dbDriver, drivers.authDirectory, auth, data), exports.RESOLVED_DEPLOYMENT_REGION);
exports.syncPosOperation = (0, core_1.wrapCallable)((drivers, auth, data) => (0, core_1.executeSyncPosOperation)(drivers.dbDriver, auth, data), exports.RESOLVED_DEPLOYMENT_REGION);
/** Alias exported for backward compatibility with callers using syncShopOperation */
exports.syncShopOperation = exports.syncPosOperation;
exports.inviteAuthorizedStaff = (0, core_1.wrapCallable)((drivers, auth, data) => (0, core_1.executeInviteAuthorizedStaff)(drivers.dbDriver, auth, data, drivers.authDirectory), exports.RESOLVED_DEPLOYMENT_REGION);
exports.setTenantStatus = (0, core_1.wrapCallable)((drivers, auth, data) => (0, core_1.executeSetTenantStatus)(drivers.dbDriver, auth, data), exports.RESOLVED_DEPLOYMENT_REGION);
exports.startPlatformAdminSupportSession = (0, core_1.wrapCallable)((drivers, auth, data) => (0, core_1.executeStartPlatformAdminSupportSession)(drivers.dbDriver, auth, data), exports.RESOLVED_DEPLOYMENT_REGION);
exports.endPlatformAdminSupportSession = (0, core_1.wrapCallable)((drivers, auth, data) => (0, core_1.executeEndPlatformAdminSupportSession)(drivers.dbDriver, auth, data), exports.RESOLVED_DEPLOYMENT_REGION);
exports.getPlatformAdminSupportSession = (0, core_1.wrapCallable)((drivers, auth) => (0, core_1.executeGetPlatformAdminSupportSession)(drivers.dbDriver, auth), exports.RESOLVED_DEPLOYMENT_REGION);
exports.resetUserPassword = (0, core_1.wrapCallable)((drivers, auth, data) => (0, core_1.executeResetUserPassword)(drivers.dbDriver, drivers.authDirectory, auth, data), exports.RESOLVED_DEPLOYMENT_REGION);
exports.CLOUD_FUNCTIONS_MANIFEST = {
    runtime: 'nodejs22',
    region: exports.RESOLVED_DEPLOYMENT_REGION,
    stagingRegion: core_1.STAGING_FUNCTIONS_REGION,
    productionRegion: core_1.PRODUCTION_FUNCTIONS_REGION,
    projectId: core_1.EXPECTED_FIREBASE_PROJECT_ID,
    firestoreDatabaseId: exports.RESOLVED_FIRESTORE_DATABASE_ID,
    stagingProjectId: core_1.STAGING_FIREBASE_PROJECT_ID,
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
};
//# sourceMappingURL=index.js.map