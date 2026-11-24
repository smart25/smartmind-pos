import React, { useState } from 'react';
import {
  Building2,
  ShieldAlert,
  RefreshCw,
  LogOut,
  CheckCircle2,
  Database,
  Store,
  UserCheck,
  AlertTriangle,
} from 'lucide-react';
import { BusinessType, ShopCategory } from '../types/pos';
import {
  CreateBusinessInput,
  CreateShopInput,
} from '../utils/posCalculations';
import { firebaseConfig, auth, sendEmailVerification } from '../firebase';

interface LiveOnboardingPageProps {
  status: 'no_membership' | 'suspended' | 'error';
  uid: string;
  email: string;
  displayName: string;
  missingBusinessId?: string;
  isBootstrapAdminCandidate?: boolean;
  errorCode?: string;
  errorMessage?: string;
  requiredProvisioningSteps?: string[];
  isBusy?: boolean;
  onRetryMembershipCheck: () => void;
  onSignOut: () => void;
  onProvisionLiveBusinessOwner?: (
    businessInput: CreateBusinessInput,
    shopInput: CreateShopInput
  ) => Promise<void>;
  onProvisionLivePlatformAdmin?: () => Promise<void>;
}

const BUSINESS_TYPES: BusinessType[] = [
  'Supermarket & Grocery Chain',
  'Pharmacy & Healthcare Retail',
  'Department & General Retail',
  'Restaurant, Bakery & Hospitality',
  'Specialty & Convenience Stores',
];

const SHOP_CATEGORIES: ShopCategory[] = [
  'Supermarket',
  'Pharmacy',
  'Express Mart',
  'Restaurant & Bakery',
  'Bar & Lounge',
  'Retail Store',
];

export const LiveOnboardingPage: React.FC<LiveOnboardingPageProps> = ({
  status,
  uid,
  email,
  displayName,
  missingBusinessId,
  isBootstrapAdminCandidate = false,
  errorCode,
  errorMessage,
  requiredProvisioningSteps = [],
  isBusy = false,
  onRetryMembershipCheck,
  onSignOut,
  onProvisionLiveBusinessOwner,
  onProvisionLivePlatformAdmin,
}) => {
  const draftKey = `smartmind_live_onboarding_draft_${uid || 'default'}`;
  const savedDraft = React.useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw =
        window.sessionStorage.getItem(draftKey) ||
        window.localStorage.getItem(draftKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [draftKey]);

  const [businessName, setBusinessName] = useState<string>(
    savedDraft?.businessName ?? ''
  );
  const [businessType, setBusinessType] = useState<BusinessType>(
    savedDraft?.businessType ?? 'Supermarket & Grocery Chain'
  );
  const [primaryPhone, setPrimaryPhone] = useState<string>(
    savedDraft?.primaryPhone ?? '+2348000000000'
  );
  const [headquartersAddress, setHeadquartersAddress] = useState<string>(
    savedDraft?.headquartersAddress ?? 'Lagos, Nigeria'
  );
  const [shopName, setShopName] = useState<string>(savedDraft?.shopName ?? '');
  const [shopCategory, setShopCategory] = useState<ShopCategory>(
    savedDraft?.shopCategory ?? 'Supermarket'
  );
  const [shopCity, setShopCity] = useState<string>(
    savedDraft?.shopCity ?? 'Lagos'
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const handleSendVerification = async () => {
    if (!auth.currentUser) {
      setVerificationError(
        'No active Firebase Authentication session found. Please sign in again.'
      );
      return;
    }
    setVerificationError(null);
    try {
      await sendEmailVerification(auth.currentUser);
      setVerificationSent(true);
    } catch (err: any) {
      setVerificationError(
        err?.message || 'Failed to dispatch verification email.'
      );
    }
  };

  const handleConfirmVerifiedAndRefresh = async () => {
    setVerificationError(null);
    try {
      if (auth.currentUser) {
        await auth.currentUser.reload();
        await auth.currentUser.getIdToken(true);
        if (!auth.currentUser.emailVerified) {
          setVerificationError(
            `Firebase Authentication still reports emailVerified == false for ${
              auth.currentUser.email || email
            }. Open the verification link sent to your email inbox first, then click "I have verified my email (Check Again)".`
          );
          return;
        }
      }
      await Promise.resolve(onRetryMembershipCheck());
    } catch (err: any) {
      setVerificationError(
        err?.message ||
          'Failed to refresh Firebase Authentication token or synchronize profile.'
      );
    }
  };

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const payload = JSON.stringify({
        businessName,
        businessType,
        primaryPhone,
        headquartersAddress,
        shopName,
        shopCategory,
        shopCity,
      });
      window.sessionStorage.setItem(draftKey, payload);
      window.localStorage.setItem(draftKey, payload);
    } catch {
      // Ignore storage errors
    }
  }, [
    draftKey,
    businessName,
    businessType,
    primaryPhone,
    headquartersAddress,
    shopName,
    shopCategory,
    shopCity,
  ]);

  const handleProvisionOwnerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!businessName.trim() || businessName.trim().length < 2) {
      setFormError('Enter a valid Business Name (at least 2 characters).');
      return;
    }
    if (!shopName.trim() || shopName.trim().length < 2) {
      setFormError('Enter a valid First Shop Name (at least 2 characters).');
      return;
    }
    if (!onProvisionLiveBusinessOwner) return;

    try {
      await onProvisionLiveBusinessOwner(
        {
          name: businessName.trim(),
          businessType,
          ownerName: displayName || email.split('@')[0],
          ownerEmail: email,
          contactEmail: email,
          primaryPhone: primaryPhone.trim() || '+2348000000000',
          headquartersAddress: headquartersAddress.trim() || 'Lagos, Nigeria',
        },
        {
          name: shopName.trim(),
          category: shopCategory,
          locationCity: shopCity.trim() || 'Lagos',
          address: headquartersAddress.trim() || 'Lagos, Nigeria',
          phone: primaryPhone.trim() || '+2348000000000',
        }
      );
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.removeItem(draftKey);
          window.localStorage.removeItem(draftKey);
        } catch {
          // Ignore storage errors
        }
      }
    } catch (err: any) {
      setFormError(
        err?.message || 'Failed to provision live business in Firestore.'
      );
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between p-4 sm:p-6">
      <div className="max-w-3xl w-full mx-auto my-auto space-y-5">
        {/* Header Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
                  status === 'error' || status === 'suspended'
                    ? 'bg-rose-50 border-rose-200 text-rose-700'
                    : 'bg-amber-50 border-amber-200 text-amber-700'
                }`}
              >
                {status === 'error' || status === 'suspended' ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <ShieldAlert className="w-5 h-5" />
                )}
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold">
                  Live Cloud Mode · Zero Sample Data Fallback
                </span>
                <h1 className="text-lg sm:text-xl font-display font-bold text-slate-900 mt-1.5">
                  {status === 'no_membership' &&
                    'No Business Membership Assigned in Firestore'}
                  {status === 'suspended' && 'Account or Business Suspended'}
                  {status === 'error' &&
                    'Unable to Load Live Business Records'}
                </h1>
                <p className="text-xs sm:text-sm text-slate-600 mt-1">
                  {status === 'no_membership' &&
                    'You are signed in with a real Firebase account, but no business or shop membership record exists for your account in Cloud Firestore yet. Demo data has been blocked.'}
                  {status === 'suspended' &&
                    (errorMessage ||
                      'Your user profile or business is currently suspended.')}
                  {status === 'error' &&
                    (errorMessage ||
                      'A Firestore query error occurred. The application did not fall back to sample data.')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onRetryMembershipCheck}
                disabled={isBusy}
                className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`}
                />
                <span>{isBusy ? 'Checking...' : 'Retry / Refresh'}</span>
              </button>
              <button
                type="button"
                onClick={onSignOut}
                className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>

          {/* Authenticated Identity & Database Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-xs">
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200/80">
              <span className="text-slate-500 block">Authenticated Email</span>
              <span className="font-semibold text-slate-900 break-all">
                {email}
              </span>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200/80">
              <span className="text-slate-500 block">Firebase Auth UID</span>
              <code className="font-mono text-[11px] font-semibold text-slate-900 break-all">
                {uid}
              </code>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200/80">
              <span className="text-slate-500 block">Firestore Database</span>
              <code className="font-mono text-[11px] font-semibold text-emerald-800 break-all">
                {firebaseConfig.firestoreDatabaseId}
              </code>
            </div>
          </div>

          {/* Required Firestore Records Diagnostics */}
          {requiredProvisioningSteps.length > 0 && (
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                <Database className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Required Firestore Provisioning Details</span>
              </div>
              <ul className="list-disc list-inside text-xs text-amber-900 space-y-1">
                {requiredProvisioningSteps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
                {missingBusinessId && (
                  <li>
                    Missing Business Document:{' '}
                    <code className="font-mono font-bold">
                      /businesses/{missingBusinessId}
                    </code>
                  </li>
                )}
              </ul>
            </div>
          )}

          {errorCode && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 text-xs text-rose-900">
              <strong>Error Code:</strong>{' '}
              <code className="font-mono">{errorCode}</code> — {errorMessage}
            </div>
          )}

          {errorCode === 'EMAIL_NOT_VERIFIED' && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-xs text-amber-950 space-y-2.5">
              <div className="flex items-center gap-2 font-bold text-amber-900">
                <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Email Verification Required to Activate Workspace Access</span>
              </div>
              <p className="text-amber-800 leading-relaxed">
                Cloud Firestore security rules require your Firebase Authentication account email to be verified (<code className="font-mono">email_verified == true</code>). Setting your password via a Firebase password setup link does not automatically verify your email address. Click the button below to receive a verification link, open the link in your inbox, and then click &quot;I have verified my email (Check Again)&quot;.
              </p>
              {verificationError && (
                <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-xs text-rose-800">
                  {verificationError}
                </div>
              )}
              {verificationSent && (
                <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Verification email dispatched to <strong>{email}</strong>! Check your inbox, click the verification link, then click &quot;I have verified my email (Check Again)&quot; below.</span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={isBusy || verificationSent}
                  onClick={handleSendVerification}
                  className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-xs cursor-pointer"
                >
                  {verificationSent ? 'Verification Email Dispatched' : `Send Verification Email to ${email}`}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmVerifiedAndRefresh}
                  disabled={isBusy}
                  className="px-3.5 py-2 rounded-lg border border-amber-300 bg-white hover:bg-amber-50 text-amber-900 font-semibold text-xs cursor-pointer"
                >
                  I have verified my email (Check Again)
                </button>
              </div>
            </div>
          )}

          {(errorCode === 'permission-denied' ||
            errorCode === 'OWNER_AUTH_SYNC_FAILED') && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-xs text-amber-950 space-y-2.5">
              <div className="flex items-center gap-2 font-bold text-amber-900">
                <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
                <span>Security Token Refresh Needed</span>
              </div>
              <p className="text-amber-800 leading-relaxed">
                If you just verified your email address (<strong>{email}</strong>) or updated your Firebase project settings, your browser session must refresh its security credentials from Firebase to activate Cloud Firestore access.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={onRetryMembershipCheck}
                  className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                  <span>Refresh Token &amp; Check Again</span>
                </button>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs cursor-pointer flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out &amp; Sign Back In</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Explicit User-Initiated Provisioning for Authorized Bootstrap Platform Administrator */}
        {status === 'no_membership' && isBootstrapAdminCandidate && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-display font-bold text-slate-900">
                  Initialize Platform Administrator Profile ({email})
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Your verified Firebase Authentication identity is recognized by{' '}
                  <code className="font-mono">firestore.rules</code> (
                  <code className="font-mono">isBootstrapPlatformAdmin()</code>)
                  to create your active Platform Administrator profile at{' '}
                  <code className="font-mono">/users/{uid}</code> in{' '}
                  <code className="font-mono">
                    {firebaseConfig.firestoreDatabaseId}
                  </code>
                  . Platform Administrators remain strictly separate from tenant
                  Business Owner accounts and operational shop data.
                </p>
              </div>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                {formError}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
              {onProvisionLivePlatformAdmin && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={async () => {
                    setFormError(null);
                    try {
                      await onProvisionLivePlatformAdmin();
                    } catch (err: any) {
                      setFormError(
                        err?.message ||
                          'Failed to initialize Platform Administrator profile in Firestore.'
                      );
                    }
                  }}
                  className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Initialize Platform Administrator Profile in Firestore
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
