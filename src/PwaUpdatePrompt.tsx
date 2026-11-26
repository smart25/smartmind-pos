import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export const PwaUpdatePrompt: React.FC = () => {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (r) {
        setInterval(() => {
          r.update().catch(() => {});
        }, 60 * 1000);
      }
    },
    onRegisterError() {
      // Non-fatal registration error in non-PWA or desktop environments
    },
  });

  React.useEffect(() => {
    if (needRefresh) {
      updateServiceWorker(true);
    }
  }, [needRefresh, updateServiceWorker]);

  const handleClose = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  if (!offlineReady && !needRefresh) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-800 shadow-lg"
    >
      <div className="flex-1">
        {offlineReady ? (
          <span>App is ready to work offline.</span>
        ) : (
          <span>New version available. Reload to update.</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {needRefresh && (
          <button
            type="button"
            onClick={() => updateServiceWorker(true)}
            className="rounded bg-emerald-600 px-2.5 py-1 font-semibold text-white hover:bg-emerald-700"
          >
            Reload
          </button>
        )}
        <button
          type="button"
          onClick={handleClose}
          className="rounded border border-slate-200 px-2 py-1 font-medium text-slate-600 hover:bg-slate-100"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};

export default PwaUpdatePrompt;
