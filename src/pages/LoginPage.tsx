import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
  Lock,
  User as UserIcon,
  AlertCircle,
  ShieldCheck,
  Monitor,
  Database,
  Store,
  ArrowRight,
  Cloud,
  CheckCircle2,
  KeyRound,
} from 'lucide-react';
import { User } from '../types/pos';
import {
  DEFAULT_DEMO_PASSWORD,
  validateLoginInput,
} from '../utils/posCalculations';
import {
  auth,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  isFirebaseConfigured,
} from '../firebase';

export interface AuthenticatedFirebaseIdentity {
  uid: string;
  email: string;
  displayName?: string | null;
  emailVerified?: boolean;
}

interface LoginPageProps {
  demoUsers: User[];
  initialAuthMode?: 'firebase' | 'demo';
  onAuthenticated: (
    user: User,
    rememberMe: boolean,
    authMode?: 'firebase' | 'demo'
  ) => void;
  onAuthenticatedFirebase?: (
    identity: AuthenticatedFirebaseIdentity,
    rememberMe: boolean
  ) => Promise<void> | void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  demoUsers,
  initialAuthMode,
  onAuthenticated,
  onAuthenticatedFirebase,
}) => {
  const loginDraftKey = 'smartmind_login_draft_v1';
  const savedLoginDraft = React.useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.sessionStorage.getItem(loginDraftKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const defaultMode: 'firebase' | 'demo' =
    initialAuthMode ??
    savedLoginDraft?.authMode ??
    (isFirebaseConfigured ? 'firebase' : 'demo');
  const [authMode, setAuthMode] = useState<'firebase' | 'demo'>(defaultMode);
  const [identifier, setIdentifier] = useState<string>(
    savedLoginDraft?.identifier ??
      (defaultMode === 'demo' ? 'owner@smartmindpos.demo' : '')
  );
  const [password, setPassword] = useState(
    defaultMode === 'demo' ? DEFAULT_DEMO_PASSWORD : ''
  );
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(
    null
  );
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    demoUsers[0]?.id ?? ''
  );

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(
        loginDraftKey,
        JSON.stringify({ authMode, identifier })
      );
    } catch {
      // Ignore storage errors
    }
  }, [authMode, identifier]);

  const handleSelectPreset = (user: User) => {
    setAuthMode('demo');
    setSelectedPresetId(user.id);
    setIdentifier(user.email);
    setPassword(DEFAULT_DEMO_PASSWORD);
    setErrorMessage(null);
    setResetSuccessMessage(null);
  };

  const handlePasswordReset = async () => {
    setErrorMessage(null);
    setResetSuccessMessage(null);
    const cleanEmail = identifier.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMessage(
        'Enter your account email address above to receive a Firebase password reset link.'
      );
      return;
    }

    if (authMode === 'demo') {
      setResetSuccessMessage(
        `Demo Mode Notice: In isolated Demo Mode, use the quick-fill profile cards below or ask your Business Owner to reset your demo credential. Switch to "Firebase Cloud" for real email password reset.`
      );
      return;
    }

    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setResetSuccessMessage(
        `Password reset email dispatched via Firebase Authentication to ${cleanEmail}. Check your inbox to complete the reset.`
      );
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Unable to send password reset email. Verify your email address.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setResetSuccessMessage(null);
    setIsLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const fbUser = cred.user;
      const email = (fbUser.email || '').trim().toLowerCase();

      if (!email) {
        setErrorMessage(
          'Google Sign-In succeeded, but no email address was returned by the provider.'
        );
        return;
      }

      if (onAuthenticatedFirebase) {
        await onAuthenticatedFirebase(
          {
            uid: fbUser.uid,
            email,
            displayName: fbUser.displayName,
            emailVerified: fbUser.emailVerified,
          },
          rememberMe
        );
        return;
      }
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Google Sign-In failed or was cancelled.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetSuccessMessage(null);
    const validation = validateLoginInput(identifier, password);
    if (!validation.valid) {
      setErrorMessage(validation.error ?? 'Invalid login input.');
      return;
    }

    const normalized = identifier.trim().toLowerCase();

    if (authMode === 'firebase') {
      setIsLoading(true);
      try {
        const cred = await signInWithEmailAndPassword(
          auth,
          normalized,
          password
        );
        const fbUser = cred.user;
        const email = (fbUser.email || normalized).trim().toLowerCase();
        setErrorMessage(null);

        if (onAuthenticatedFirebase) {
          await onAuthenticatedFirebase(
            {
              uid: fbUser.uid,
              email,
              displayName: fbUser.displayName,
              emailVerified: fbUser.emailVerified,
            },
            rememberMe
          );
        }
      } catch (err: any) {
        if (
          err?.code === 'auth/invalid-credential' ||
          err?.code === 'auth/user-not-found' ||
          err?.code === 'auth/wrong-password'
        ) {
          setErrorMessage(
            'Firebase Authentication failed: Invalid email or password. Note: Cloud Firestore is a database and does not handle user passwords. The login account must be created in Firebase Console > Authentication > Users (with Email/Password enabled). Alternatively, click "Sign In with Verified Google Account" below for instant access.'
          );
        } else if (err?.code === 'auth/operation-not-allowed') {
          setErrorMessage(
            'Email/Password sign-in provider is disabled in your Firebase project. Please enable it in Firebase Console > Authentication > Sign-in method > Email/Password, or use "Sign In with Verified Google Account" below.'
          );
        } else {
          setErrorMessage(
            `Firebase Authentication failed: ${
              err?.message || 'Unable to authenticate with Firebase.'
            }`
          );
        }
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Explicit, isolated Demo Mode
    const matchedUser = demoUsers.find(
      (u) =>
        u.email.toLowerCase() === normalized ||
        u.username.toLowerCase() === normalized
    );

    if (!matchedUser) {
      setErrorMessage(
        'No matching demo account found. Select one of the demo profiles below or switch to Firebase Cloud Auth.'
      );
      return;
    }

    const expectedPassword = matchedUser.password || DEFAULT_DEMO_PASSWORD;
    if (password.trim() !== expectedPassword) {
      setErrorMessage(
        `Incorrect password for "${matchedUser.fullName}". Enter the demo password or click the account card below.`
      );
      return;
    }

    if (matchedUser.status === 'suspended') {
      setErrorMessage(
        `Account "${matchedUser.fullName}" (${matchedUser.email}) is currently suspended. Contact your administrator.`
      );
      return;
    }

    setErrorMessage(null);
    // Never pass or persist plaintext passwords in session state
    onAuthenticated({ ...matchedUser, password: undefined }, rememberMe, 'demo');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between">
      {/* Top Architecture Status Bar */}
      <div className="bg-slate-900 text-slate-200 px-3.5 sm:px-6 py-2 sm:py-2.5 border-b border-slate-800 text-xs flex flex-wrap items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <strong className="text-white">Phase 6 Cloud &amp; Multi-Shop Sync:</strong>{' '}
            <span className="hidden sm:inline">
              Firebase Authentication &amp; Cloud Firestore Security Rules active ({isFirebaseConfigured ? 'Connected' : 'Env Fallback'}). Isolated Demo Mode retained for role evaluation.
            </span>
            <span className="sm:hidden">Firebase Auth &amp; Demo Mode ready.</span>
          </span>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 text-slate-400 font-mono text-[11px] sm:text-xs">
          <span>Adapter: IndexedDB + Cloud Sync</span>
          <span aria-hidden="true">Â·</span>
          <span>Phase 6</span>
        </div>
      </div>

      {/* Main Centered Split Container */}
      <main className="flex-1 flex items-center justify-center p-3 sm:p-6 lg:p-10">
        <div className="w-full max-w-5xl bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          {/* Left Column: Architectural & Product Overview */}
          <div className="lg:col-span-5 bg-slate-900 text-white p-5 sm:p-8 lg:p-10 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3">
                <img
                  src="/smartmind-logo.png"
                  alt="SmartMind POS Logo"
                  className="w-10 h-10 rounded-xl object-contain shrink-0"
                />
                <div>
                  <h1 className="font-display font-bold text-lg sm:text-xl tracking-tight text-white">
                    SmartMind POS
                  </h1>
                  <p className="text-xs text-slate-400">
                    Multi-Shop Retail &amp; Enterprise Point of Sale
                  </p>
                </div>
              </div>

              <div className="mt-4 sm:mt-8 space-y-2 sm:space-y-4">
                <h2 className="font-display font-bold text-lg sm:text-2xl text-white leading-snug">
                  Independent shop operations under one unified business account.
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  Designed for supermarkets, pharmacies, express marts, and multi-branch retail stores requiring strict shop-level inventory isolation and resilient offline-to-cloud synchronization.
                </p>
              </div>

              <div className="hidden lg:block mt-8 pt-6 border-t border-slate-800 space-y-4 text-xs text-slate-300">
                <div className="flex items-start gap-3">
                  <Store className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">
                      Strict Per-Shop Isolation
                    </p>
                    <p className="text-slate-400 mt-0.5">
                      Each shop maintains its own independent product catalogue, prices, stock quantities, and sales ledger.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Database className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">
                      Idempotent Offline Queue &amp; Conflict Protection
                    </p>
                    <p className="text-slate-400 mt-0.5">
                      Offline sales are queued locally and synchronized with server stock validation without erasing completed local sales.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Monitor className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">
                      Server-Enforced Role Boundaries
                    </p>
                    <p className="text-slate-400 mt-0.5">
                      Platform admins provision businesses while owners, managers, and cashiers are isolated to their authorized tenant and shops.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="hidden lg:flex mt-8 pt-4 border-t border-slate-800 items-center justify-between text-xs text-slate-400">
              <span>SmartMind POS Architecture</span>
              <span>Phase 6 Cloud Sync</span>
            </div>
          </div>

          {/* Right Column: Sign-In Form & Demo Profile Switcher */}
          <div className="lg:col-span-7 p-5 sm:p-8 lg:p-10 flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-xl font-display font-bold text-slate-900">
                    Sign in to Terminal
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Authenticate via Firebase Cloud Auth or evaluate in isolated Demo Mode.
                  </p>
                </div>

                {/* Auth Mode Switcher */}
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('firebase');
                      if (identifier.endsWith('.demo')) {
                        setIdentifier('');
                        setPassword('');
                      }
                      setErrorMessage(null);
                      setResetSuccessMessage(null);
                    }}
                    className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                      authMode === 'firebase'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Cloud className="w-3.5 h-3.5" />
                    <span>Live Cloud Mode</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('demo');
                      if (!identifier) {
                        setIdentifier('owner@smartmindpos.demo');
                        setPassword(DEFAULT_DEMO_PASSWORD);
                      }
                      setErrorMessage(null);
                      setResetSuccessMessage(null);
                    }}
                    className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer transition-colors ${
                      authMode === 'demo'
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Isolated Demo Mode
                  </button>
                </div>
              </div>

              {errorMessage && (
                <div
                  role="alert"
                  className="mt-5 p-3.5 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-800"
                >
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {resetSuccessMessage && (
                <div
                  role="status"
                  className="mt-5 p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-start gap-2.5 text-xs text-emerald-900"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{resetSuccessMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
                <div>
                  <label
                    htmlFor="login-identifier"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Email Address {authMode === 'demo' ? 'or Demo Username' : ''}
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="login-identifier"
                      type="text"
                      value={identifier}
                      onChange={(e) => {
                        setIdentifier(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder={
                        authMode === 'firebase'
                          ? 'Enter your registered email address'
                          : 'e.g. owner@smartmindpos.demo'
                      }
                      autoComplete="username"
                      className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="login-password"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Password {authMode === 'demo' ? '(Demo)' : '(Firebase Auth)'}
                    </label>
                    <button
                      type="button"
                      onClick={handlePasswordReset}
                      className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <KeyRound className="w-3 h-3" />
                      <span>Forgot / Reset Password?</span>
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder="Enter password"
                      autoComplete="current-password"
                      className="w-full pl-10 pr-20 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1 rounded"
                    >
                      {showPassword ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>Hide</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>Show</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                    />
                    <span>Remember operator session</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIdentifier('');
                      setPassword('');
                      setErrorMessage(null);
                      setResetSuccessMessage(null);
                    }}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800"
                  >
                    Clear fields
                  </button>
                </div>

                <div className="space-y-2.5">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                  >
                    <span>
                      {isLoading
                        ? 'Authenticating...'
                        : authMode === 'firebase'
                        ? 'Sign In with Firebase Authentication'
                        : 'Sign In to SmartMind POS (Isolated Demo)'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  {authMode === 'firebase' && (
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={handleGoogleSignIn}
                      className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs border border-slate-300 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Cloud className="w-4 h-4 text-emerald-600" />
                      <span>Sign In with Verified Google Account</span>
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Mode-Specific Bottom Panel */}
            {authMode === 'firebase' ? (
              <div className="mt-8 pt-6 border-t border-slate-200">
                <div className="rounded-xl bg-emerald-50/70 border border-emerald-200 p-4 text-xs text-emerald-950 space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-emerald-900">
                    <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>Live Cloud Mode Active (Default)</span>
                  </div>
                  <p className="text-emerald-800 leading-relaxed">
                    Authenticating via Google or Firebase Email/Password loads
                    only your verified business and shop records from Cloud
                    Firestore. Sample/demo data is strictly excluded.
                  </p>
                  <div className="pt-2 border-t border-emerald-200/80 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-emerald-800 font-medium">Platform Admin:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('firebase');
                        setIdentifier('smartnwokolo@gmail.com');
                        setErrorMessage(null);
                        setResetSuccessMessage(null);
                      }}
                      className="px-2.5 py-1 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-[11px] transition-colors cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <UserIcon className="w-3 h-3 text-emerald-200" />
                      <span>Use smartnwokolo@gmail.com</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-emerald-700">
                    Need to evaluate sample data instead? Click{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('demo');
                        setIdentifier('owner@smartmindpos.demo');
                        setPassword(DEFAULT_DEMO_PASSWORD);
                      }}
                      className="underline font-semibold cursor-pointer"
                    >
                      Isolated Demo Mode
                    </button>{' '}
                    above.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-8 pt-6 border-t border-slate-200">
                <p className="text-xs font-semibold text-slate-700 mb-2.5">
                  Quick-Fill Isolated Demonstration Accounts (Click to populate credentials):
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {demoUsers.map((u) => {
                    const isSelected =
                      authMode === 'demo' &&
                      selectedPresetId === u.id &&
                      identifier.toLowerCase() === u.email.toLowerCase();
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleSelectPreset(u)}
                        className={`p-2.5 rounded-lg border text-left transition-colors ${
                          isSelected
                            ? 'bg-emerald-50/70 border-emerald-600 text-slate-900'
                            : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-900 truncate">
                            {u.fullName}
                          </span>
                          <span className="text-xs font-mono text-emerald-700 shrink-0">
                            {u.role === 'platform_admin'
                              ? 'Platform Admin'
                              : u.role === 'business_owner'
                              ? 'Primary Owner'
                              : `${u.assignedShopIds.length} shop${
                                  u.assignedShopIds.length === 1 ? '' : 's'
                                }`}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {u.roleLabel} Â· {u.email}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-3 bg-white border-t border-slate-200 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
        <span>SmartMind POS â€” Multi-Shop Point of Sale System</span>
        <span>
          Plaintext passwords are never stored in localStorage, IndexedDB, Firestore, or sync_queue.
        </span>
      </footer>
    </div>
  );
};

