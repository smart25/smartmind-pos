/**
 * Environment-specific bootstrap identities for SmartMind POS.
 *
 * Production and staging deliberately have different administrator emails.
 * The caller must provide a known Firebase project ID; unknown projects fail closed.
 */
export const PRODUCTION_FIREBASE_PROJECT_ID = 'gen-lang-client-0985802946';
export const STAGING_FIREBASE_PROJECT_ID = 'smartmind-pos-staging';

export const PRODUCTION_BOOTSTRAP_PLATFORM_ADMIN_EMAIL =
  'smartnwokolo@gmail.com';
export const STAGING_BOOTSTRAP_PLATFORM_ADMIN_EMAIL =
  'smart@smartmindconcept.com';

export function getBootstrapPlatformAdminEmail(projectId: string): string {
  if (projectId === STAGING_FIREBASE_PROJECT_ID) {
    return STAGING_BOOTSTRAP_PLATFORM_ADMIN_EMAIL;
  }
  if (projectId === PRODUCTION_FIREBASE_PROJECT_ID) {
    return PRODUCTION_BOOTSTRAP_PLATFORM_ADMIN_EMAIL;
  }
  throw new Error(
    `UNKNOWN_PROJECT_CONFIGURATION: No Platform Administrator bootstrap identity is configured for project "${projectId}".`
  );
}

/** Both environment administrator identities are reserved and cannot be tenant owners or staff. */
export function isReservedPlatformAdminEmail(email?: string | null): boolean {
  const normalized = (email || '').trim().toLowerCase();
  return (
    normalized === PRODUCTION_BOOTSTRAP_PLATFORM_ADMIN_EMAIL ||
    normalized === STAGING_BOOTSTRAP_PLATFORM_ADMIN_EMAIL
  );
}
