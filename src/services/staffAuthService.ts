/**
 * SmartMind POS — Staff Firebase Authentication Provisioning Service
 *
 * Calls the local staging admin middleware to create or update staff credentials
 * with emailVerified: true, allowing staff to log in immediately without
 * requiring email verification links.
 */

import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';

export interface ProvisionStaffAuthInput {
  email: string;
  password?: string;
  fullName: string;
}

export interface ProvisionStaffAuthResult {
  uid?: string;
  email: string;
  isExistingAuthUser?: boolean;
}

// Known mapping of existing staff emails that were created before automated provisioning
const KNOWN_LEGACY_STAFF_UIDS: Record<string, string> = {
  'uzo@gmail.com': '8JbTcgrEUOcAo9CdirSYzwMpari2',
  'amaka@gmail.com': 'zeUgKyHmohMkfddx1tfP1ogxx073',
};

export async function provisionStaffAccount(
  input: ProvisionStaffAuthInput
): Promise<ProvisionStaffAuthResult> {
  const cleanEmail = input.email.trim().toLowerCase();
  const cleanPassword = input.password?.trim();

  // If known legacy staff UID exists, return it directly
  if (KNOWN_LEGACY_STAFF_UIDS[cleanEmail]) {
    return {
      uid: KNOWN_LEGACY_STAFF_UIDS[cleanEmail],
      email: cleanEmail,
      isExistingAuthUser: true,
    };
  }

  // If no password provided, return undefined UID so caller can fallback to Cloud Functions
  if (!cleanPassword) {
    return { email: cleanEmail };
  }

  // 1. Try local staging-admin dev middleware if running in local Vite dev server
  const isHttp =
    typeof window !== 'undefined' &&
    window.location.protocol.startsWith('http');
  if (isHttp) {
    try {
      const response = await fetch('/api/staging-admin/create-staff-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: cleanEmail,
          password: cleanPassword,
          fullName: input.fullName.trim(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          uid: data.uid,
          email: data.email || cleanEmail,
          isExistingAuthUser: Boolean(data.isExistingAuthUser),
        };
      }
    } catch {
      // Dev middleware not responding; fall through to direct Firebase client provisioning
    }
  }

  // 2. In production web & Electron desktop, let the server-side inviteAuthorizedStaff
  // Cloud Function create/verify the Firebase Auth account with emailVerified: true
  // and bind /users/{uid} atomically. Creating via client-side createUserWithEmailAndPassword
  // leaves emailVerified: false, which is rejected by Firestore rules.
  return { email: cleanEmail };
}

export async function resetStaffAccountPassword(
  email: string,
  newPassword: string,
  fullName?: string
): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const isHttp =
    typeof window !== 'undefined' &&
    window.location.protocol.startsWith('http');

  if (isHttp) {
    try {
      const response = await fetch('/api/staging-admin/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: cleanEmail,
          password: newPassword.trim(),
          fullName: fullName?.trim(),
        }),
      });

      if (response.ok) {
        return;
      }
    } catch {
      // Local dev middleware not available, fall back to email reset
    }
  }

  // In live production web / Electron desktop, send a secure password reset email
  try {
    await sendPasswordResetEmail(auth, cleanEmail);
  } catch (err: any) {
    console.warn('[StaffAuth] Failed to send password reset email:', err);
    throw new Error(
      err?.message || `Failed to reset password for ${cleanEmail}.`
    );
  }
}
