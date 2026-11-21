import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, CheckCircle2, AlertCircle, X, Sparkles } from 'lucide-react';
import { APP_VERSION } from '../../constants/version';

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';

interface UpdateProgressInfo {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export const AppUpdateNotificationModal: React.FC = () => {
  const [updateState, setUpdateState] = useState<UpdateState>('idle');
  const [targetVersion, setTargetVersion] = useState<string>('');
  const [releaseNotes, setReleaseNotes] = useState<string | undefined>();
  const [progress, setProgress] = useState<UpdateProgressInfo>({
    percent: 0,
    transferred: 0,
    total: 0,
    bytesPerSecond: 0,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  const desktopApi = typeof window !== 'undefined' ? window.smartmindDesktopApi : undefined;

  useEffect(() => {
    if (!desktopApi) return;

    // Listen for update checking
    const unsubChecking = desktopApi.onUpdateChecking?.(() => {
      setErrorMessage(null);
    });

    // Listen for new version detected
    const unsubAvailable = desktopApi.onUpdateAvailable?.((info) => {
      setTargetVersion(info.version);
      setReleaseNotes(info.releaseNotes);
      setUpdateState('available');
      setIsDismissed(false);
    });

    // Listen for download progress
    const unsubProgress = desktopApi.onUpdateDownloadProgress?.((p) => {
      setUpdateState('downloading');
      setProgress(p);
    });

    // Listen for download completion
    const unsubDownloaded = desktopApi.onUpdateDownloaded?.((info) => {
      setTargetVersion(info.version);
      setReleaseNotes(info.releaseNotes);
      setUpdateState('downloaded');
      setIsDismissed(false);
    });

    // Listen for errors
    const unsubError = desktopApi.onUpdateError?.((err) => {
      console.warn('[SmartMind POS Update Error]', err);
      setErrorMessage(err.message);
      setUpdateState((prev) => (prev === 'downloading' ? 'error' : prev));
    });

    return () => {
      unsubChecking?.();
      unsubAvailable?.();
      unsubProgress?.();
      unsubDownloaded?.();
      unsubError?.();
    };
  }, [desktopApi]);

  const handleStartDownload = async () => {
    if (!desktopApi?.startDownloadUpdate) return;
    setUpdateState('downloading');
    setProgress({ percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 });
    try {
      await desktopApi.startDownloadUpdate();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to start download');
      setUpdateState('error');
    }
  };

  const handleRestartAndInstall = () => {
    if (!desktopApi?.quitAndInstallUpdate) return;
    desktopApi.quitAndInstallUpdate();
  };

  // If not on Electron or no update to show, render nothing
  if (!desktopApi?.isElectron || updateState === 'idle') {
    return null;
  }

  // If dismissed by user, show a small floating banner in the bottom corner so they can reopen it anytime
  if (isDismissed) {
    return (
      <aside aria-label="Updates" className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setIsDismissed(false)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-lg shadow-lg border border-emerald-500 transition-transform active:scale-95"
          title="Click to view update details"
        >
          {updateState === 'downloaded' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-200 animate-pulse" />
          ) : updateState === 'downloading' ? (
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-200" />
          ) : (
            <Sparkles className="w-4 h-4 text-amber-300" />
          )}
          <span>
            {updateState === 'downloaded'
              ? `Update Ready (v${targetVersion || 'New'})`
              : updateState === 'downloading'
              ? `Downloading v${targetVersion || ''}... (${progress.percent}%)`
              : `Update v${targetVersion || 'Available'}`}
          </span>
        </button>
      </aside>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden text-slate-800">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 p-5 text-white relative">
          <button
            onClick={() => setIsDismissed(true)}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
            title="Remind me later"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/15 rounded-xl backdrop-blur-sm">
              {updateState === 'downloaded' ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-200" />
              ) : updateState === 'downloading' ? (
                <Download className="w-6 h-6 text-emerald-200 animate-bounce" />
              ) : (
                <Sparkles className="w-6 h-6 text-amber-300" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">
                {updateState === 'downloaded'
                  ? 'Update Ready to Install'
                  : updateState === 'downloading'
                  ? 'Downloading Update...'
                  : 'New Update Available!'}
              </h3>
              <p className="text-xs text-emerald-100 mt-0.5">
                SmartMind POS Desktop • v{APP_VERSION} →{' '}
                <span className="font-semibold underline decoration-white/50">
                  v{targetVersion || 'Latest'}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          {updateState === 'available' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 leading-relaxed">
                A new version of SmartMind POS is available with security enhancements, bug fixes,
                and performance improvements.
              </p>
              {releaseNotes && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 max-h-32 overflow-y-auto font-mono">
                  <p className="font-semibold text-slate-900 mb-1">Release Highlights:</p>
                  <p className="whitespace-pre-wrap">{releaseNotes}</p>
                </div>
              )}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsDismissed(true)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Remind Me Later
                </button>
                <button
                  type="button"
                  onClick={handleStartDownload}
                  className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm hover:shadow transition-all active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  <span>Update Now</span>
                </button>
              </div>
            </div>
          )}

          {updateState === 'downloading' && (
            <div className="space-y-3 py-2">
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span>Downloading update package...</span>
                <span>{progress.percent}%</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                <div
                  className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[11px] text-slate-500 pt-1">
                <span>
                  {progress.transferred > 0 && progress.total > 0
                    ? `${(progress.transferred / 1024 / 1024).toFixed(1)} MB / ${(progress.total / 1024 / 1024).toFixed(1)} MB`
                    : 'Connecting to update server...'}
                </span>
                {progress.bytesPerSecond > 0 && (
                  <span>{(progress.bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s</span>
                )}
              </div>
              <div className="pt-2 text-right">
                <button
                  type="button"
                  onClick={() => setIsDismissed(true)}
                  className="text-xs text-slate-500 hover:text-slate-700 underline"
                >
                  Continue working in background
                </button>
              </div>
            </div>
          )}

          {updateState === 'downloaded' && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-900 leading-relaxed">
                  <p className="font-semibold">Update is ready to apply!</p>
                  <p className="text-emerald-700 mt-0.5">
                    Click <strong>Restart &amp; Install Now</strong> to restart SmartMind POS into version{' '}
                    <strong>v{targetVersion || 'latest'}</strong>. All shop transactions and offline data remain completely safe.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setIsDismissed(true)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Later on App Close
                </button>
                <button
                  type="button"
                  onClick={handleRestartAndInstall}
                  className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm hover:shadow transition-all active:scale-95"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Restart &amp; Install Now</span>
                </button>
              </div>
            </div>
          )}

          {updateState === 'error' && (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900">
                  <p className="font-semibold">Could not complete update</p>
                  <p className="text-amber-700 mt-0.5">
                    {errorMessage || 'A network error occurred while downloading the update.'}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDismissed(true)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleStartDownload}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                >
                  Retry Download
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
