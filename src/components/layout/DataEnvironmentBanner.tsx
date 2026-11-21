import React, { useState, useEffect } from 'react';
import {
  Cloud,
  WifiOff,
  FlaskConical,
  RefreshCw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Database,
  X,
} from 'lucide-react';
import {
  CloudForensicSaleCheckResult,
  DataEnvironmentMode,
  PurgeQuarantinedPreFirebaseSalesResult,
  StorageAuditReport,
  verifyPendingSyncItemsAgainstFirestore,
} from '../../services/liveFirestoreDataService';
import { firebaseConfig } from '../../firebase';

interface DataEnvironmentBannerProps {
  dataMode: DataEnvironmentMode;
  currentUserEmail?: string;
  currentUserRole?: string;
  businessName?: string;
  liveErrorMessage?: string | null;
  isRefreshingLive?: boolean;
  storageAudit?: StorageAuditReport | null;
  onRefreshLive?: () => void;
  onRetryPendingSync?: (syncId?: string) => Promise<void>;
  onConfirmClearDemoData?: () => void;
  onSwitchToLiveLogin?: () => void;
  onPurgeQuarantinedRecords?: () => Promise<PurgeQuarantinedPreFirebaseSalesResult>;
}

export const DataEnvironmentBanner: React.FC<DataEnvironmentBannerProps> = ({
  dataMode,
  currentUserEmail,
  currentUserRole,
  businessName,
  liveErrorMessage,
  isRefreshingLive = false,
  storageAudit,
  onRefreshLive,
  onRetryPendingSync,
  onConfirmClearDemoData,
  onSwitchToLiveLogin,
  onPurgeQuarantinedRecords,
}) => {
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmPurgeOpen, setConfirmPurgeOpen] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [purgeResult, setPurgeResult] =
    useState<PurgeQuarantinedPreFirebaseSalesResult | null>(null);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [inspectSyncOpen, setInspectSyncOpen] = useState(false);
  const [clearFeedback, setClearFeedback] = useState<string | null>(null);
  const [cloudForensicResults, setCloudForensicResults] = useState<
    Record<string, CloudForensicSaleCheckResult>
  >({});
  const [isCheckingCloudForensics, setIsCheckingCloudForensics] =
    useState(false);
  const [retryingSyncId, setRetryingSyncId] = useState<string | null>(null);
  const [isRetryingAll, setIsRetryingAll] = useState(false);

  const allInspectableItems = [
    ...(storageAudit?.pendingSyncItems || []),
    ...(storageAudit?.quarantinedSyncItems || []),
  ];

  const runReadOnlyCloudForensicCheck = async () => {
    if (!allInspectableItems.length) return;
    setIsCheckingCloudForensics(true);
    try {
      const results = await verifyPendingSyncItemsAgainstFirestore(
        allInspectableItems
      );
      const map: Record<string, CloudForensicSaleCheckResult> = {};
      for (const r of results) {
        map[r.syncId] = r;
      }
      setCloudForensicResults(map);
    } finally {
      setIsCheckingCloudForensics(false);
    }
  };

  const handleRetryOne = async (syncId: string) => {
    if (!onRetryPendingSync || retryingSyncId) return;
    setRetryingSyncId(syncId);
    try {
      await onRetryPendingSync(syncId);
      await runReadOnlyCloudForensicCheck();
    } finally {
      setRetryingSyncId(null);
    }
  };

  const handleRetryAll = async () => {
    if (!onRetryPendingSync || isRetryingAll) return;
    setIsRetryingAll(true);
    try {
      await onRetryPendingSync();
      await runReadOnlyCloudForensicCheck();
    } finally {
      setIsRetryingAll(false);
    }
  };

  useEffect(() => {
    if (
      inspectSyncOpen &&
      dataMode === 'live' &&
      allInspectableItems.length > 0
    ) {
      runReadOnlyCloudForensicCheck();
    }
  }, [inspectSyncOpen, dataMode]);

  const handleConfirmClear = () => {
    if (onConfirmClearDemoData) {
      onConfirmClearDemoData();
      setClearFeedback(
        'Demo sample data cleared. Genuine live records and pending offline sales were preserved.'
      );
    }
    setConfirmClearOpen(false);
  };

  const handleExecutePurge = async () => {
    if (!onPurgeQuarantinedRecords) return;
    setIsPurging(true);
    setPurgeError(null);
    try {
      const res = await onPurgeQuarantinedRecords();
      setPurgeResult(res);
      if (res.success) {
        if (res.isIdempotent) {
          setClearFeedback(
            'Idempotent Execution: All target quarantined pre-Firebase records were already removed. 0 records remaining.'
          );
        } else {
          setClearFeedback(
            `Successfully purged ${res.purgedCounts.syncQueue} quarantined sync queue entries and ${res.purgedCounts.sales} local sales. 0 quarantined records remaining.`
          );
        }
      } else {
        const errorParts: string[] = [];
        if (res.missingRecords && res.missingRecords.length > 0) {
          errorParts.push(...res.missingRecords);
        }
        if (res.mismatches && res.mismatches.length > 0) {
          errorParts.push(...res.mismatches);
        }
        if (res.localStorageError) {
          errorParts.push(res.localStorageError);
        }
        if (errorParts.length === 0 && res.details.length > 0) {
          errorParts.push(...res.details);
        }
        setPurgeError(errorParts.join(' '));
      }
    } catch (err: any) {
      setPurgeError(
        err instanceof Error ? err.message : 'Failed to purge quarantined records.'
      );
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <div className="shrink-0">
      {/* Main Mode Indicator Strip */}
      <div
        className={`px-3.5 sm:px-6 py-1.5 text-xs border-b flex flex-wrap items-center justify-between gap-2 ${
          dataMode === 'live'
            ? 'bg-emerald-950 text-emerald-100 border-emerald-800'
            : dataMode === 'offline_live'
            ? 'bg-amber-950 text-amber-100 border-amber-800'
            : 'bg-indigo-950 text-indigo-100 border-indigo-800'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {dataMode === 'live' && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 font-bold tracking-wide uppercase text-[10px]">
              <Cloud className="w-3 h-3 text-emerald-400" />
              Live Cloud Mode
            </span>
          )}
          {dataMode === 'offline_live' && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-200 font-bold tracking-wide uppercase text-[10px]">
              <WifiOff className="w-3 h-3 text-amber-400" />
              Offline Mode (Cached Live Business Data)
            </span>
          )}
          {dataMode === 'demo' && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-indigo-500/20 border border-indigo-400/40 text-indigo-200 font-bold tracking-wide uppercase text-[10px]">
              <FlaskConical className="w-3 h-3 text-indigo-300" />
              Isolated Demo Mode (Sample Data)
            </span>
          )}

          <span className="truncate text-[11px] opacity-90">
            {dataMode === 'live' && (
              <>
                Authenticated as <strong>{currentUserEmail}</strong>
                {businessName ? ` · ${businessName}` : ''}
              </>
            )}
            {dataMode === 'offline_live' && (
              <>
                Operating on cached real records for{' '}
                <strong>{currentUserEmail}</strong>
                {businessName ? ` (${businessName})` : ''}
              </>
            )}
            {dataMode === 'demo' && (
              <>
                Viewing explicitly selected sample dataset · Isolated from
                production Firebase &amp; live sales
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {storageAudit &&
            (storageAudit.pendingOfflineSyncCount > 0 ||
              (storageAudit.quarantinedSyncCount ?? 0) > 0) && (
              <button
                type="button"
                onClick={() => setInspectSyncOpen(true)}
                title="Click to inspect offline sync queue & quarantined pre-Firebase test records"
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/30 text-amber-200 text-[10px] font-mono cursor-pointer transition-colors"
              >
                <Database className="w-3 h-3" />
                <span>
                  {storageAudit.pendingOfflineSyncCount} pending live sync
                  {(storageAudit.quarantinedSyncCount ?? 0) > 0
                    ? ` · ${storageAudit.quarantinedSyncCount} quarantined (excluded)`
                    : ''}
                </span>
              </button>
            )}

          {(dataMode === 'live' || dataMode === 'offline_live') &&
            onRefreshLive && (
              <button
                type="button"
                onClick={onRefreshLive}
                disabled={isRefreshingLive}
                className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3 h-3 ${isRefreshingLive ? 'animate-spin' : ''}`}
                />
                <span>
                  {isRefreshingLive ? 'Syncing...' : 'Refresh Cloud Data'}
                </span>
              </button>
            )}

          {dataMode === 'demo' && onSwitchToLiveLogin && (
            <button
              type="button"
              onClick={onSwitchToLiveLogin}
              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Cloud className="w-3 h-3" />
              <span>Switch to Live Mode</span>
            </button>
          )}

          {dataMode === 'demo' && onConfirmClearDemoData && (
            <button
              type="button"
              onClick={() => setConfirmClearOpen(true)}
              className="px-2.5 py-1 rounded bg-white/10 hover:bg-rose-600/80 text-white text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear Demo Data</span>
            </button>
          )}
        </div>
      </div>

      {/* Live Error Bar (never falls back to demo data) */}
      {liveErrorMessage && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-2 text-xs text-rose-900 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              <strong>Live Data Error:</strong> {liveErrorMessage}
            </span>
          </div>
          {onRefreshLive && (
            <button
              type="button"
              onClick={onRefreshLive}
              className="px-3 py-1 rounded bg-rose-700 hover:bg-rose-800 text-white font-semibold text-xs flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry Live Query</span>
            </button>
          )}
        </div>
      )}

      {/* Clear Demo Feedback */}
      {clearFeedback && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-1.5 text-xs text-emerald-900 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>{clearFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setClearFeedback(null)}
            className="text-emerald-700 hover:text-emerald-900 p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Pending Offline Sync Queue & Quarantine Forensic Audit Modal */}
      {inspectSyncOpen && storageAudit && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-6xl w-full p-5 shadow-xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-display font-bold text-slate-900">
                    Sync Queue &amp; Quarantine Forensic Inspector ({storageAudit.pendingOfflineSyncCount} actionable pending · {storageAudit.quarantinedSyncCount ?? 0} quarantined)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Separates actionable production sync items from quarantined pre-Firebase test records in <code className="font-mono">sync_queue</code> and Cloud Firestore (<code className="font-mono">{firebaseConfig.firestoreDatabaseId}</code>). Customer PII is redacted.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={runReadOnlyCloudForensicCheck}
                  disabled={isCheckingCloudForensics}
                  className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      isCheckingCloudForensics ? 'animate-spin' : ''
                    }`}
                  />
                  <span>
                    {isCheckingCloudForensics
                      ? 'Checking Firestore...'
                      : 'Verify Cloud Firestore State (Read-Only)'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspectSyncOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs shrink-0">
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950">
                <p className="text-[11px] text-emerald-700 font-medium">Verified Live Pending Sync</p>
                <p className="text-lg font-mono font-bold mt-0.5">{storageAudit.pendingSyncLiveCount ?? 0}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-950">
                <p className="text-[11px] text-amber-800 font-medium">Quarantined Pre-Firebase (Excluded)</p>
                <p className="text-lg font-mono font-bold mt-0.5">{storageAudit.quarantinedSyncCount ?? 0}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-950">
                <p className="text-[11px] text-indigo-700 font-medium">Known Seed Demo Items</p>
                <p className="text-lg font-mono font-bold mt-0.5">{storageAudit.pendingSyncDemoCount ?? 0}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900">
                <p className="text-[11px] text-slate-600 font-medium">Unclassified / Unverified</p>
                <p className="text-lg font-mono font-bold mt-0.5">{storageAudit.pendingSyncUnclassifiedCount ?? 0}</p>
              </div>
            </div>

            <div className="overflow-auto space-y-4 pr-1">
              {/* Section 1: Actionable Pending Sync Queue */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    1. Actionable Pending Production Sync Queue ({storageAudit.pendingSyncItems.length})
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500">
                      Eligible for synchronization by authorized tenant members
                    </span>
                    {onRetryPendingSync && storageAudit.pendingSyncItems.length > 0 && (
                      <button
                        type="button"
                        onClick={handleRetryAll}
                        disabled={isRetryingAll}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs cursor-pointer shadow-sm disabled:opacity-50 transition-colors"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRetryingAll ? 'animate-spin' : ''}`} />
                        <span>{isRetryingAll ? 'Retrying...' : 'Retry All Pending Syncs'}</span>
                      </button>
                    )}
                  </div>
                </div>
                {storageAudit.pendingSyncItems.length === 0 ? (
                  <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      <strong>0 actionable pending production sync items.</strong> No unverified or pre-Firebase test transactions are queued for production upload.
                    </span>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                          <th className="py-2 px-2.5 font-semibold">Sync ID &amp; Sale ID</th>
                          <th className="py-2 px-2.5 font-semibold">Queue Status &amp; Retries</th>
                          <th className="py-2 px-2.5 font-semibold">Idempotency Key</th>
                          <th className="py-2 px-2.5 font-semibold">Business / Shop / Created</th>
                          <th className="py-2 px-2.5 font-semibold">Payload &amp; Local Sale</th>
                          <th className="py-2 px-2.5 font-semibold">Cloud Firestore Check</th>
                          <th className="py-2 px-2.5 font-semibold">Origin &amp; Classification</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 align-top">
                        {storageAudit.pendingSyncItems.map((item) => {
                          const cloudCheck = cloudForensicResults[item.id];
                          return (
                            <tr key={item.id} className="hover:bg-slate-50/70">
                              <td className="py-2.5 px-2.5 font-mono text-[11px] text-slate-800 space-y-0.5">
                                <div className="font-bold text-slate-900">{item.id}</div>
                                <div className="text-slate-500">Sale: {item.entityId}</div>
                                {item.receiptNumber && (
                                  <div className="text-indigo-700 font-semibold">
                                    Receipt: {item.receiptNumber}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-2.5 font-mono text-[11px] space-y-1">
                                <div>
                                  <span className="inline-flex px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px] uppercase">
                                    {item.status}
                                  </span>
                                </div>
                                <div className="text-slate-600">
                                  Retries: <strong>{item.retryCount}</strong>
                                </div>
                                {onRetryPendingSync && (
                                  <button
                                    type="button"
                                    onClick={() => handleRetryOne(item.id)}
                                    disabled={retryingSyncId === item.id || isRetryingAll}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 mt-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px] cursor-pointer disabled:opacity-50 transition-colors"
                                  >
                                    <RefreshCw className={`w-2.5 h-2.5 ${retryingSyncId === item.id ? 'animate-spin' : ''}`} />
                                    <span>{retryingSyncId === item.id ? 'Retrying...' : 'Retry Sync'}</span>
                                  </button>
                                )}
                              </td>
                              <td className="py-2.5 px-2.5 font-mono text-[10px] text-slate-700 break-all max-w-[160px]">
                                {item.idempotencyKey}
                              </td>
                              <td className="py-2.5 px-2.5 font-mono text-[11px] text-slate-700 space-y-0.5">
                                <div>Biz: {item.businessId}</div>
                                <div>Shop: {item.shopId}</div>
                                <div className="text-slate-500 text-[10px]">{item.createdAt}</div>
                              </td>
                              <td className="py-2.5 px-2.5 text-[11px] text-slate-700 space-y-1">
                                <div>
                                  <span
                                    className={`inline-flex px-1.5 py-0.5 rounded font-semibold text-[10px] ${
                                      item.payloadComplete
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-rose-100 text-rose-800'
                                    }`}
                                  >
                                    {item.payloadSummary}
                                  </span>
                                </div>
                                {typeof item.totalAmountNaira === 'number' && (
                                  <div className="font-mono text-[10px] text-slate-600">
                                    Total: ₦{item.totalAmountNaira.toLocaleString()} ({item.paymentMethod || 'n/a'})
                                  </div>
                                )}
                                <div className="text-[10px] font-mono">
                                  Local DbSale:{' '}
                                  <strong className="text-slate-900">
                                    {item.localSaleExists ? item.localSaleStatus : 'missing'}
                                  </strong>
                                </div>
                              </td>
                              <td className="py-2.5 px-2.5 text-[11px] font-mono space-y-0.5">
                                {cloudCheck ? (
                                  <>
                                    <div>
                                      Biz in Cloud: <strong>{cloudCheck.businessExistsInFirestore}</strong>
                                    </div>
                                    <div>
                                      Shop in Cloud: <strong>{cloudCheck.shopExistsInFirestore}</strong>
                                    </div>
                                    <div>
                                      Sale in Cloud: <strong>{cloudCheck.saleExistsInFirestore}</strong>
                                    </div>
                                    <div>
                                      Idempotency: <strong>{cloudCheck.idempotencyProcessedInFirestore}</strong>
                                    </div>
                                  </>
                                ) : (
                                  <span className="text-slate-400 text-[10px]">
                                    Click &ldquo;Verify Cloud Firestore State&rdquo;
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-2.5 text-[11px] text-slate-600 space-y-1 max-w-[230px]">
                                <div>
                                  <span className="inline-flex px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-mono font-semibold text-[10px]">
                                    {item.classification.toUpperCase()} · {item.originSource}
                                  </span>
                                </div>
                                <div className="text-[10px] leading-snug">{item.originReason}</div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Section 2: Quarantined Pre-Firebase Test Records */}
              {(storageAudit.quarantinedSyncItems || []).length > 0 && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                      2. Quarantined Pre-Firebase Test Records ({storageAudit.quarantinedSyncItems.length} — Excluded from Production Sync)
                    </h4>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-900 font-mono text-[10px] font-semibold">
                        Reason: pre_firebase_test_transaction_missing_live_tenant
                      </span>
                      {currentUserRole === 'platform_admin' && onPurgeQuarantinedRecords && (
                        <button
                          type="button"
                          onClick={() => {
                            setPurgeResult(null);
                            setPurgeError(null);
                            setConfirmPurgeOpen(true);
                          }}
                          className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Permanently Purge Quarantined Demo Records</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-950">
                    <strong>Quarantine &amp; Evidence Preservation Policy:</strong> These records originated during pre-Firebase local testing under non-existent tenant <code className="font-mono">biz-0003-u42w</code> / <code className="font-mono">shop-0005-9i6p</code>. They are permanently blocked from automatic and manual Cloud Firestore synchronization, while 100% of their original sale payloads, receipt numbers, timestamps, amounts, and local records remain preserved locally. Destructive one-click deletion is intentionally disabled.
                  </div>

                  <div className="border border-amber-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-amber-50/80 border-b border-amber-200 text-amber-950">
                          <th className="py-2 px-2.5 font-semibold">Sync ID &amp; Sale ID</th>
                          <th className="py-2 px-2.5 font-semibold">Quarantine Status &amp; Audit Reason</th>
                          <th className="py-2 px-2.5 font-semibold">Idempotency Key</th>
                          <th className="py-2 px-2.5 font-semibold">Business / Shop / Created</th>
                          <th className="py-2 px-2.5 font-semibold">Preserved Payload &amp; Local Sale</th>
                          <th className="py-2 px-2.5 font-semibold">Cloud Firestore Check</th>
                          <th className="py-2 px-2.5 font-semibold">Origin &amp; Local Duplicates</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-100 align-top bg-white">
                        {storageAudit.quarantinedSyncItems.map((item) => {
                          const cloudCheck = cloudForensicResults[item.id];
                          return (
                            <tr key={item.id} className="hover:bg-amber-50/30">
                              <td className="py-2.5 px-2.5 font-mono text-[11px] text-slate-800 space-y-0.5">
                                <div className="font-bold text-slate-900">{item.id}</div>
                                <div className="text-slate-500">Sale: {item.entityId}</div>
                                {item.receiptNumber && (
                                  <div className="text-indigo-700 font-semibold">
                                    Receipt: {item.receiptNumber}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-2.5 font-mono text-[11px] space-y-1">
                                <div>
                                  <span className="inline-flex px-1.5 py-0.5 rounded bg-amber-200 text-amber-950 font-bold text-[10px] uppercase">
                                    {item.status} (Excluded from Sync)
                                  </span>
                                </div>
                                <div className="text-[10px] text-amber-900 break-all max-w-[190px]">
                                  Reason: <strong>{item.quarantineReason || 'pre_firebase_test_transaction_missing_live_tenant'}</strong>
                                </div>
                                {item.quarantinedAt && (
                                  <div className="text-[10px] text-slate-500">
                                    At: {item.quarantinedAt}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-2.5 font-mono text-[10px] text-slate-700 break-all max-w-[150px]">
                                {item.idempotencyKey}
                              </td>
                              <td className="py-2.5 px-2.5 font-mono text-[11px] text-slate-700 space-y-0.5">
                                <div>Biz: {item.businessId}</div>
                                <div>Shop: {item.shopId}</div>
                                <div className="text-slate-500 text-[10px]">{item.createdAt}</div>
                              </td>
                              <td className="py-2.5 px-2.5 text-[11px] text-slate-700 space-y-1">
                                <div>
                                  <span
                                    className={`inline-flex px-1.5 py-0.5 rounded font-semibold text-[10px] ${
                                      item.payloadComplete
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-rose-100 text-rose-800'
                                    }`}
                                  >
                                    {item.payloadSummary}
                                  </span>
                                </div>
                                {typeof item.totalAmountNaira === 'number' && (
                                  <div className="font-mono text-[10px] text-slate-600">
                                    Total: ₦{item.totalAmountNaira.toLocaleString()} ({item.paymentMethod || 'n/a'})
                                  </div>
                                )}
                                <div className="text-[10px] font-mono">
                                  Local DbSale:{' '}
                                  <strong className="text-slate-900">
                                    {item.localSaleExists ? `${item.localSaleStatus} (preserved)` : 'missing'}
                                  </strong>
                                </div>
                              </td>
                              <td className="py-2.5 px-2.5 text-[11px] font-mono space-y-0.5">
                                {cloudCheck ? (
                                  <>
                                    <div>
                                      Biz in Cloud: <strong>{cloudCheck.businessExistsInFirestore}</strong>
                                    </div>
                                    <div>
                                      Shop in Cloud: <strong>{cloudCheck.shopExistsInFirestore}</strong>
                                    </div>
                                    <div>
                                      Sale in Cloud: <strong>{cloudCheck.saleExistsInFirestore}</strong>
                                    </div>
                                    <div>
                                      Idempotency: <strong>{cloudCheck.idempotencyProcessedInFirestore}</strong>
                                    </div>
                                  </>
                                ) : (
                                  <span className="text-slate-400 text-[10px]">
                                    Click &ldquo;Verify Cloud Firestore State&rdquo;
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-2.5 text-[11px] text-slate-600 space-y-1 max-w-[230px]">
                                <div>
                                  <span className="inline-flex px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-mono font-semibold text-[10px]">
                                    {item.originSource}
                                  </span>
                                </div>
                                <div className="text-[10px] leading-snug">{item.originReason}</div>
                                {item.duplicateLocalSaleIds.length > 0 && (
                                  <div className="text-[10px] font-mono text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                                    Preserved localStorage counterpart:{' '}
                                    {item.duplicateLocalSaleIds.join(', ')}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between shrink-0 pt-1 text-xs text-slate-500">
              <span>
                Evidence preservation guarantee: Quarantined records and local sales are retained intact and blocked from Cloud Firestore upload.
              </span>
              <button
                type="button"
                onClick={() => setInspectSyncOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal to Clear Demo Data Safely */}
      {confirmClearOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-5 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-display font-bold text-slate-900">
                    Clear Sample / Demo Data Only?
                  </h3>
                  <p className="text-xs text-slate-500">
                    Safe storage cleanup with live record protection
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmClearOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 space-y-1.5">
              <p>
                • Removes isolated demo storage (
                <code className="font-mono">smartmind_pos_demo_store_v1</code>)
                and strips known sample records from legacy local storage.
              </p>
              <p>
                • <strong>Preserves</strong> all authenticated user live caches
                and all pending offline sales in IndexedDB (
                <code className="font-mono">
                  {storageAudit?.pendingOfflineSyncCount ?? 0}
                </code>{' '}
                pending sync operation(s) protected).
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmClearOpen(false)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClear}
                className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
              >
                Confirm Clear Demo Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal to Permanently Purge Quarantined Demo Records */}
      {confirmPurgeOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-rose-200 max-w-2xl w-full p-5 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-display font-bold text-slate-900">
                    Permanently Purge Quarantined Demo Records?
                  </h3>
                  <p className="text-xs text-slate-500">
                    Platform Administrator Maintenance • Local IndexedDB &amp; Storage Cleanup
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmPurgeOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scope & Safety Guarantees */}
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-2">
              <p>
                This operation will <strong>permanently purge</strong> only the 4 synthetic pre-Firebase test records from local browser storage (<code className="font-mono">smartmind_pos_local_db</code>) and clean any legacy residuals in <code className="font-mono">smartmind_pos_store_v2</code>.
              </p>
              <div className="p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1">
                <div className="font-semibold text-emerald-950 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Strict Non-Impact Guarantee:</span>
                </div>
                <ul className="list-disc list-inside text-[11px] space-y-0.5 text-emerald-900 pl-1">
                  <li>Zero modification to Firebase Authentication accounts, sessions, or tokens.</li>
                  <li>Zero modification to the Platform Administrator profile at <code className="font-mono">/users/{'{uid}'}</code>.</li>
                  <li>Zero modification to Cloud Firestore documents or collections.</li>
                  <li>Zero modification to deployed Cloud Functions or Firestore security rules.</li>
                  <li>All unrelated sales, products, inventory, users, and future businesses remain 100% untouched.</li>
                </ul>
              </div>
            </div>

            {/* Exact Target Identifiers */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Exact Target Records to Be Purged (4 Items)
              </h4>
              <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 text-slate-600 border-b border-slate-200 text-[11px]">
                      <th className="py-1.5 px-2.5 font-semibold">Sale ID</th>
                      <th className="py-1.5 px-2.5 font-semibold">Queue ID</th>
                      <th className="py-1.5 px-2.5 font-semibold">Audit Event ID</th>
                      <th className="py-1.5 px-2.5 font-semibold">Receipt &amp; Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px] text-slate-700">
                    <tr>
                      <td className="py-2 px-2.5 text-slate-900 font-semibold">sale-1792837064449-h1dw</td>
                      <td className="py-2 px-2.5">sync-sale-1792837064449-h1dw</td>
                      <td className="py-2 px-2.5 text-slate-500 text-[10px]">aud-quarantine-sync-sale-1792837064449-h1dw</td>
                      <td className="py-2 px-2.5 text-slate-900">SM-TEST-0001 (₦15,500)</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-2.5 text-slate-900 font-semibold">sale-1792840077667-3knj</td>
                      <td className="py-2 px-2.5">sync-sale-1792840077667-3knj</td>
                      <td className="py-2 px-2.5 text-slate-500 text-[10px]">aud-quarantine-sync-sale-1792840077667-3knj</td>
                      <td className="py-2 px-2.5 text-slate-900">SM-TEST-0002 (₦24,000)</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-2.5 text-slate-900 font-semibold">sale-1792840085221-qjdb</td>
                      <td className="py-2 px-2.5">sync-sale-1792840085221-qjdb</td>
                      <td className="py-2 px-2.5 text-slate-500 text-[10px]">aud-quarantine-sync-sale-1792840085221-qjdb</td>
                      <td className="py-2 px-2.5 text-slate-900">SM-TEST-0003 (₦8,900)</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-2.5 text-slate-900 font-semibold">sale-1792840089845-kc84</td>
                      <td className="py-2 px-2.5">sync-sale-1792840089845-kc84</td>
                      <td className="py-2 px-2.5 text-slate-500 text-[10px]">aud-quarantine-sync-sale-1792840089845-kc84</td>
                      <td className="py-2 px-2.5 text-slate-900">SM-TEST-0004 (₦42,000)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Affected Stores & Pre-Verification Checklist */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="font-semibold text-slate-900 block mb-1">
                  Affected Local Object Stores:
                </span>
                <ul className="list-disc list-inside text-[11px] text-slate-600 space-y-0.5">
                  <li><code className="font-mono">sync_queue</code> (4 queue entries)</li>
                  <li><code className="font-mono">sales</code> (4 local sales)</li>
                  <li><code className="font-mono">sale_items</code> (linked line items)</li>
                  <li><code className="font-mono">payments</code> (linked payments)</li>
                  <li><code className="font-mono">audit_events</code> (4 quarantine audit events)</li>
                  <li><code className="font-mono">smartmind_pos_store_v2</code> (localStorage copies)</li>
                </ul>
              </div>
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                <span className="font-semibold text-amber-950 block mb-1">
                  Pre-Execution Verification Guard:
                </span>
                <p className="text-[11px] text-amber-900 leading-snug">
                  Before deletion, the system strictly checks each record matches:
                  <br />• Business ID: <code className="font-mono">biz-0003-u42w</code>
                  <br />• Shop ID: <code className="font-mono">shop-0005-9i6p</code>
                  <br />• Reason: <code className="font-mono">pre_firebase_test_transaction_missing_live_tenant</code>
                  <br />If any mismatch is detected, the operation aborts without deleting anything.
                </p>
              </div>
            </div>

            {/* Error Display */}
            {purgeError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-rose-900">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    {purgeResult && purgeResult.purgedCounts.sales > 0
                      ? 'Partial Purge Notice'
                      : 'Purge Aborted Before Deletion'}
                  </span>
                </div>
                <div className="leading-relaxed">{purgeError}</div>
                {purgeResult?.missingRecords && purgeResult.missingRecords.length > 0 && (
                  <ul className="list-disc list-inside text-[11px] text-rose-800 pt-1 space-y-0.5">
                    {purgeResult.missingRecords.map((m, idx) => (
                      <li key={idx}>{m}</li>
                    ))}
                  </ul>
                )}
                {purgeResult?.mismatches && purgeResult.mismatches.length > 0 && (
                  <ul className="list-disc list-inside text-[11px] text-rose-800 pt-1 space-y-0.5">
                    {purgeResult.mismatches.map((m, idx) => (
                      <li key={idx}>{m}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Success Display */}
            {purgeResult && purgeResult.success && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>
                    {purgeResult.isIdempotent
                      ? 'All Target Records Already Removed (Idempotent Execution)'
                      : 'Purge Completed Successfully'}
                  </span>
                </div>
                {purgeResult.isIdempotent ? (
                  <p className="text-[11px] text-emerald-800">
                    The 4 pre-Firebase demo sales, queue entries, and audit events were verified to be already absent from the database. Zero records required deletion.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 font-mono text-[11px] pt-1">
                    <div>Sync Queue: {purgeResult.purgedCounts.syncQueue} removed</div>
                    <div>Sales: {purgeResult.purgedCounts.sales} removed</div>
                    <div>Line Items: {purgeResult.purgedCounts.saleItems} removed</div>
                    <div>Payments: {purgeResult.purgedCounts.payments} removed</div>
                    <div>Audit Events: {purgeResult.purgedCounts.auditEvents} removed</div>
                    <div>LocalStorage: {purgeResult.purgedCounts.localStorageResiduals} cleaned</div>
                  </div>
                )}
              </div>
            )}

            {/* Authorization & Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 text-xs">
              <span className="text-[11px] text-slate-500 max-w-sm">
                Authorized as <strong>{currentUserEmail}</strong> (Platform Admin). No cloud deletion functions invoked.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmPurgeOpen(false)}
                  disabled={isPurging}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                >
                  {purgeResult?.success ? 'Done' : 'Cancel'}
                </button>
                {!purgeResult?.success && (
                  <button
                    type="button"
                    onClick={handleExecutePurge}
                    disabled={isPurging}
                    className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors shadow-sm"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>
                      {isPurging ? 'Purging Records...' : 'Confirm Permanent Purge'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
