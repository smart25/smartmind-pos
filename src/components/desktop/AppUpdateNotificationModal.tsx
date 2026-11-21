import React from 'react';
import { Download, RefreshCw, CheckCircle2, AlertCircle, X, Sparkles } from 'lucide-react';
import { APP_VERSION } from '../../constants/version';
import { useDesktopUpdate } from '../../services/desktopUpdateService';

export const AppUpdateNotificationModal: React.FC = () => {
  const {
    state,
    latestVersion,
    releaseNotes,
    progress,
    errorMessage,
    isModalOpen,
    isUpdateAvailable,
    isDownloading,
    isDownloaded,
    isChecking,
    isUpToDate,
    closeModal,
    openModal,
    startDownload,
    restartAndInstall,
  } = useDesktopUpdate();

  // 1. Toast for "Checking for updates..."
  if (isChecking && isModalOpen) {
    return (
      <aside aria-label="Checking for updates" className="fixed bottom-5 right-5 z-50 animate-bounce">
        <div className="flex items-center gap-2.5 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl border border-slate-700 text-xs">
          <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
          <span>Checking for SmartMind POS updates...</span>
        </div>
      </aside>
    );
  }

  // 2. Toast for "You are on the latest version"
  if (isUpToDate && isModalOpen) {
    return (
      <aside aria-label="Up to date" className="fixed bottom-5 right-5 z-50">
        <div className="flex items-center gap-2.5 bg-emerald-900 text-white px-4 py-2.5 rounded-xl shadow-xl border border-emerald-700 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>You are running the latest version (v{APP_VERSION}).</span>
          <button
            type="button"
            onClick={closeModal}
            className="text-emerald-300 hover:text-white p-0.5 ml-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>
    );
  }

  // 3. If update is available or downloaded or downloading, but modal is closed, show floating button
  if ((isUpdateAvailable || isDownloading) && !isModalOpen) {
    return (
      <aside aria-label="Updates" className="fixed bottom-4 right-4 z-50">
        <button
          type="button"
          onClick={openModal}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-lg shadow-lg border border-emerald-500 transition-transform active:scale-95 cursor-pointer"
          title="Click to view update details"
        >
          {isDownloaded ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-200 animate-pulse" />
          ) : isDownloading ? (
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-200" />
          ) : (
            <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
          )}
          <span>
            {isDownloaded
              ? `Update Ready (v${latestVersion || 'New'})`
              : isDownloading
              ? `Downloading v${latestVersion || ''}... (${progress.percent}%)`
              : `Update to v${latestVersion || 'Latest'}`}
          </span>
        </button>
      </aside>
    );
  }

  // 4. If modal is not open or idle, render nothing
  if (!isModalOpen || (!isUpdateAvailable && !isDownloading && state !== 'error')) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-update-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fadeIn"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden text-slate-800">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 p-5 text-white relative">
          <button
            type="button"
            onClick={closeModal}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            title="Remind me later"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/15 rounded-xl backdrop-blur-xs">
              {isDownloaded ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-200" />
              ) : isDownloading ? (
                <Download className="w-6 h-6 text-emerald-200 animate-bounce" />
              ) : (
                <Sparkles className="w-6 h-6 text-amber-300" />
              )}
            </div>
            <div>
              <h3 id="app-update-modal-title" className="font-bold text-lg leading-tight">
                {isDownloaded
                  ? 'Update Ready to Install'
                  : isDownloading
                  ? 'Downloading Update...'
                  : 'New Update Available!'}
              </h3>
              <p className="text-xs text-emerald-100 mt-0.5">
                SmartMind POS Desktop • v{APP_VERSION} →{' '}
                <span className="font-semibold underline decoration-white/50">
                  v{latestVersion || 'Latest'}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          {state === 'available' && (
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
                  onClick={closeModal}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Later
                </button>
                <button
                  type="button"
                  onClick={startDownload}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Update Now (v{latestVersion})</span>
                </button>
              </div>
            </div>
          )}

          {isDownloading && (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between text-xs font-medium text-slate-700">
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                  <span>Downloading patch files...</span>
                </span>
                <span className="font-bold text-emerald-700 font-mono">{progress.percent}%</span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
                <div
                  className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>

              <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                <span>
                  {(progress.transferred / 1024 / 1024).toFixed(1)} MB /{' '}
                  {(progress.total / 1024 / 1024).toFixed(1)} MB
                </span>
                <span>{(progress.bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s</span>
              </div>
              <p className="text-[11px] text-slate-400 italic text-center">
                You can keep using the POS while the update downloads in the background.
              </p>
            </div>
          )}

          {isDownloaded && (
            <div className="space-y-3">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Update download complete!</p>
                  <p className="text-[11px] text-emerald-800 mt-0.5">
                    Click <strong>Restart &amp; Install Now</strong> to restart into v{latestVersion} in seconds. Your shop data and settings will be preserved safely.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Install on Next Launch
                </button>
                <button
                  type="button"
                  onClick={restartAndInstall}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Restart &amp; Install Now</span>
                </button>
              </div>
            </div>
          )}

          {state === 'error' && (
            <div className="space-y-3">
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Update encountered an issue</p>
                  <p className="text-[11px] text-red-700 mt-0.5">{errorMessage || 'Network error'}</p>
                </div>
              </div>
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={startDownload}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Retry Download</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
