/**
 * SmartMind POS — Staff Firebase Authentication Provisioning Service
 *
 * Calls the local staging admin middleware to create or update staff credentials
 * with emailVerified: true, allowing staff to log in immediately without
 * requiring email verification links.
 */

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

export async function provisionStaffAccount(
  input: ProvisionStaffAuthInput
): Promise<ProvisionStaffAuthResult> {
  const cleanEmail = input.email.trim().toLowerCase();
  const cleanPassword = input.password?.trim();

  // If no password provided, return undefined UID so caller can fallback to Cloud Functions
  if (!cleanPassword) {
    return { email: cleanEmail };
  }

  // Staging admin middleware is only reachable on HTTP with local Vite dev server
  const isHttp =
    typeof window !== 'undefined' &&
    window.location.protocol.startsWith('http');
  if (!isHttp) {
    // In standalone Electron desktop mode (file://), Cloud Functions
    // (provisionBusinessAndPrimaryOwner / inviteAuthorizedStaff) securely provision the account.
    return { email: cleanEmail };
  }

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

    if (!response.ok) {
      return { email: cleanEmail };
    }

    const data = await response.json();
    return {
      uid: data.uid,
      email: data.email || cleanEmail,
      isExistingAuthUser: Boolean(data.isExistingAuthUser),
    };
  } catch {
    // Graceful fallback to backend Cloud Functions when local middleware is not reachable
    return { email: cleanEmail };
  }
}

export async function resetStaffAccountPassword(
  email: string,
  newPassword: string,
  fullName?: string
): Promise<void> {
  const isHttp =
    typeof window !== 'undefined' &&
    window.location.protocol.startsWith('http');
  if (!isHttp) {
    console.info(
      '[Auth] Local middleware not available on file:// protocol. Skipping local password sync.'
    );
    return;
  }

  const response = await fetch('/api/staging-admin/reset-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password: newPassword.trim(),
      fullName: fullName?.trim(),
    }),
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw new Error(
      errorJson.error ||
        `Failed to update staff password in Firebase Authentication (HTTP ${response.status})`
    );
  }
}
