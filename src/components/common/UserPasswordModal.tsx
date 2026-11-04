import React, { useState } from 'react';
import {
  Key,
  Eye,
  EyeOff,
  AlertCircle,
  RotateCcw,
  Sparkles,
  X,
  ShieldCheck,
} from 'lucide-react';
import { Business, User } from '../../types/pos';
import {
  DEFAULT_DEMO_PASSWORD,
  validatePasswordChangeInput,
} from '../../utils/posCalculations';

interface UserPasswordModalProps {
  targetUser: User;
  currentUser: User;
  business: Business;
  onClose: () => void;
  onSavePassword: (userId: string, newPassword: string) => void;
}

export const UserPasswordModal: React.FC<UserPasswordModalProps> = ({
  targetUser,
  currentUser,
  business,
  onClose,
  onSavePassword,
}) => {
  const isSelf = currentUser.id === targetUser.id;
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleQuickFill = (presetPassword: string) => {
    setNewPassword(presetPassword);
    setConfirmPassword(presetPassword);
    setShowPassword(true);
    setError(null);
  };

  const handleGenerateTempPassword = () => {
    const slug = targetUser.username
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase()
      .slice(0, 6);
    const code = Math.floor(1000 + Math.random() * 9000);
    const generated = `${slug || 'staff'}-${code}`;
    handleQuickFill(generated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validatePasswordChangeInput(
      newPassword,
      confirmPassword
    );
    if (!validation.valid) {
      setError(validation.error ?? 'Please enter a valid password.');
      return;
    }

    onSavePassword(targetUser.id, newPassword.trim());
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="password-modal-title"
      className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full overflow-hidden shadow-xl my-auto">
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <Key className="w-4 h-4 text-emerald-400 shrink-0" />
            <h2
              id="password-modal-title"
              className="text-sm sm:text-base font-display font-bold truncate"
            >
              {isSelf
                ? 'Change Your Account Password'
                : `Reset / Change Password · ${targetUser.fullName}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close password modal"
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs" noValidate>
          {/* User Identity Card */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-900">
                {targetUser.fullName}
              </span>
              <span
                className={`px-2 py-0.5 rounded font-semibold text-[11px] ${
                  targetUser.role === 'business_owner'
                    ? 'bg-emerald-100 text-emerald-900'
                    : targetUser.role === 'shop_manager'
                    ? 'bg-blue-50 text-blue-800'
                    : 'bg-slate-200 text-slate-800'
                }`}
              >
                {targetUser.role === 'business_owner'
                  ? 'Business Owner'
                  : targetUser.role === 'shop_manager'
                  ? 'Shop Manager'
                  : 'Cashier'}
              </span>
            </div>
            <p className="font-mono text-slate-600 text-[11px]">
              {targetUser.email} · Business: {business.name}
            </p>
            <p className="text-[11px] text-slate-500">
              Current Password Status:{' '}
              <span className="font-mono font-semibold text-slate-700">
                {targetUser.password
                  ? `Custom password active${
                      targetUser.passwordUpdatedAt
                        ? ` (Updated ${targetUser.passwordUpdatedAt})`
                        : ''
                    }`
                  : `Default (${DEFAULT_DEMO_PASSWORD})`}
              </span>
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 text-red-800"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Reset Actions */}
          <div className="space-y-1.5">
            <span className="block font-semibold text-slate-700">
              Quick Password Reset Options:
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleGenerateTempPassword}
                className="px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>Generate Temp Password</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill(DEFAULT_DEMO_PASSWORD)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Reset to Default ({DEFAULT_DEMO_PASSWORD})</span>
              </button>
            </div>
          </div>

          {/* New Password Input */}
          <div>
            <label
              htmlFor="user-new-password"
              className="block font-semibold text-slate-700 mb-1"
            >
              New Password *
            </label>
            <div className="relative">
              <input
                id="user-new-password"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Enter new password (min. 4 characters)"
                className="w-full pl-3 pr-16 py-2 border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-none focus:border-emerald-600"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
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

          {/* Confirm Password Input */}
          <div>
            <label
              htmlFor="user-confirm-password"
              className="block font-semibold text-slate-700 mb-1"
            >
              Confirm New Password *
            </label>
            <input
              id="user-confirm-password"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Re-enter new password"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200 text-emerald-900 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <span>
              Saving updates login credentials for{' '}
              <strong>{targetUser.fullName}</strong> under{' '}
              <strong>{business.name}</strong> immediately.
            </span>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer inline-flex items-center gap-1.5"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Save New Password</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
