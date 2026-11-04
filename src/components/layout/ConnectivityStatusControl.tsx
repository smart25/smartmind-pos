import React, { useState, useRef, useEffect } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  AlertTriangle,
  Clock,
  ChevronDown,
  Database,
  Cloud,
  Check,
  ShieldAlert,
} from 'lucide-react';
import { ConnectivitySnapshot, ConnectivityState } from '../../types/pos';

interface ConnectivityStatusControlProps {
  snapshot: ConnectivitySnapshot;
  onChangeState: (nextState: ConnectivityState) => void;
  onTriggerSync?: () => void;
  shopName?: string;
}

const STATE_META: Record<
  ConnectivityState,
  {
    label: string;
    shortLabel: string;
    description: string;
    textColor: string;
    borderColor: string;
    bgColor: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  online: {
    label: 'Synced (Cloud Confirmed)',
    shortLabel: 'Synced',
    description: 'All acknowledged operations synced with Cloud Firestore.',
    textColor: 'text-emerald-800',
    borderColor: 'border-emerald-200',
    bgColor: 'bg-emerald-50/80',
    icon: Wifi,
  },
  offline: {
    label: 'Offline (Local Queue Active)',
    shortLabel: 'Offline',
    description: 'No internet connection. Sales are queued locally in IndexedDB/SQLite.',
    textColor: 'text-slate-700',
    borderColor: 'border-slate-300',
    bgColor: 'bg-slate-100',
    icon: WifiOff,
  },
  pending_sync: {
    label: 'Local Only / Pending Sync',
    shortLabel: 'Pending Sync',
    description: 'Local transactions waiting for verified server acknowledgement.',
    textColor: 'text-amber-800',
    borderColor: 'border-amber-200',
    bgColor: 'bg-amber-50/90',
    icon: Clock,
  },
  syncing: {
    label: 'Syncing with Cloud Backend',
    shortLabel: 'Syncing...',
    description: 'Uploading idempotent operations and validating server stock ledger.',
    textColor: 'text-sky-800',
    borderColor: 'border-sky-200',
    bgColor: 'bg-sky-50/90',
    icon: RefreshCw,
  },
  sync_error: {
    label: 'Failed (Retryable)',
    shortLabel: 'Failed (Retry)',
    description: 'Temporary failure. Local records retained with retry counter.',
    textColor: 'text-red-800',
    borderColor: 'border-red-200',
    bgColor: 'bg-red-50/90',
    icon: AlertTriangle,
  },
  requires_review: {
    label: 'Requires Review (Stock / Permission Conflict)',
    shortLabel: 'Requires Review',
    description: 'Completed local sale preserved; stock or permission conflict flagged for review.',
    textColor: 'text-purple-900',
    borderColor: 'border-purple-300',
    bgColor: 'bg-purple-50/90',
    icon: ShieldAlert,
  },
};

export const ConnectivityStatusControl: React.FC<ConnectivityStatusControlProps> = ({
  snapshot,
  onChangeState,
  onTriggerSync,
  shopName,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentMeta = STATE_META[snapshot.state] || STATE_META.pending_sync;
  const StatusIcon = currentMeta.icon;

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={`Connectivity status: ${currentMeta.shortLabel}, ${snapshot.pendingTransactionsCount} waiting to sync`}
        className={`flex items-center gap-2 px-2.5 sm:px-3 py-1.5 min-h-[38px] sm:min-h-0 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${currentMeta.bgColor} ${currentMeta.borderColor} ${currentMeta.textColor} hover:brightness-95`}
      >
        <StatusIcon
          className={`w-3.5 h-3.5 shrink-0 ${
            snapshot.state === 'syncing' ? 'animate-spin' : ''
          }`}
        />
        <span>{currentMeta.shortLabel}</span>
        <span aria-hidden="true" className="hidden sm:inline opacity-40">
          ·
        </span>
        <span className="font-mono tabular-nums font-semibold">
          <span className="hidden sm:inline">
            {snapshot.pendingTransactionsCount} waiting
          </span>
          <span className="sm:hidden">({snapshot.pendingTransactionsCount})</span>
        </span>
        {(snapshot.requiresReviewCount ?? 0) > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-purple-700 text-white text-[10px] font-mono font-bold">
            {snapshot.requiresReviewCount} review
          </span>
        )}
        <ChevronDown className="w-3.5 h-3.5 opacity-60 shrink-0" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Offline and Synchronization Status Monitor"
          className="absolute right-0 mt-2 w-[calc(100vw-2rem)] sm:w-96 max-w-sm bg-white rounded-xl border border-slate-200 shadow-xl z-50 p-4 text-slate-800 max-h-[85vh] overflow-y-auto"
        >
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <p className="text-xs font-semibold text-slate-900">
                Phase 6 Cloud Synchronization Monitor
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {shopName ? `Scope: ${shopName}` : 'Business-wide synchronization status'}
              </p>
            </div>
            {onTriggerSync && (
              <button
                type="button"
                onClick={onTriggerSync}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Sync Now</span>
              </button>
            )}
          </div>

          <div className="py-3 border-b border-slate-100 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Current State</span>
              <span className={`font-semibold ${currentMeta.textColor}`}>
                {currentMeta.label}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Local Only / Pending Sync</span>
              <span className="font-mono tabular-nums font-semibold text-amber-800">
                {snapshot.pendingTransactionsCount} records
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Synced (Acknowledged)</span>
              <span className="font-mono tabular-nums font-semibold text-emerald-700">
                {snapshot.syncedCount ?? 0} records
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Failed (Retryable)</span>
              <span className="font-mono tabular-nums font-semibold text-red-700">
                {snapshot.failedRetryableCount ?? 0} records
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Requires Review (Conflicts)</span>
              <span className="font-mono tabular-nums font-semibold text-purple-800">
                {snapshot.requiresReviewCount ?? 0} records
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Last Sync Attempt</span>
              <span className="font-mono tabular-nums text-slate-700">
                {snapshot.lastSyncAttemptAt}
              </span>
            </div>
            {snapshot.errorMessage && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 mt-2">
                {snapshot.errorMessage}
              </div>
            )}
            {snapshot.conflicts && snapshot.conflicts.length > 0 && (
              <div className="p-2.5 rounded-lg bg-purple-50 border border-purple-200 text-xs text-purple-900 mt-2 space-y-1">
                <p className="font-semibold">Flagged Stock / Permission Conflicts:</p>
                {snapshot.conflicts.map((c) => (
                  <p key={c.syncEntryId} className="text-[11px] leading-snug">
                    • [{c.entityType.toUpperCase()} {c.entityId}]: {c.conflictReason}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="py-3 border-b border-slate-100">
            <p className="text-xs font-medium text-slate-700 mb-2">
              Synchronization States:
            </p>
            <div className="space-y-1">
              {(Object.keys(STATE_META) as ConnectivityState[]).map((key) => {
                const item = STATE_META[key];
                const ItemIcon = item.icon;
                const isSelected = snapshot.state === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      onChangeState(key);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left ${
                      isSelected
                        ? 'bg-emerald-50 text-emerald-900 font-semibold border border-emerald-200'
                        : 'text-slate-700 hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <ItemIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>{item.label}</span>
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-emerald-700" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-3 space-y-1.5 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Local Adapter: IndexedDB Browser Queue (SQLite contract ready)</span>
            </div>
            <div className="flex items-center gap-2">
              <Cloud className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Firebase Cloud Sync: Provisioned &amp; Security Rules Active</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
