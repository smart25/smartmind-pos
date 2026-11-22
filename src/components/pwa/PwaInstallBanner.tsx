import React, { useState, useEffect } from 'react';
import { Download, X, Share2, Smartphone } from 'lucide-react';
import { SMARTMIND_LOGO_URL } from '../../constants/branding';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export const PwaInstallBanner: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    // 1. If running inside Electron desktop app, do not show PWA banner
    if (typeof window !== 'undefined' && (window as any).smartmindDesktopApi?.isElectron) {
      return;
    }

    // 2. If already running as standalone installed PWA, do not show
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;
    if (isStandalone) {
      return;
    }

    // 3. Check if user dismissed it in this session
    if (sessionStorage.getItem('smartmind_pwa_dismissed') === 'true') {
      return;
    }

    // 4. Detect iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    setIsIos(isIosDevice);

    // 5. Listen for Android Chrome beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // If on iOS and not dismissed, show iOS helper banner after a short delay
    if (isIosDevice) {
      const timer = setTimeout(() => setShowPrompt(true), 1500);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    } else if (isIos) {
      setShowIosGuide(true);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    sessionStorage.setItem('smartmind_pwa_dismissed', 'true');
  };

  if (!showPrompt) {
    return null;
  }

  return (
    <>
      {/* Floating Bottom Installation Banner */}
      <aside
        aria-label="App installation banner"
        className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-emerald-500/30 bg-slate-900/95 p-4 text-white shadow-2xl backdrop-blur-md transition-all duration-300 animate-in slide-in-from-bottom-5"
      >
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-800 p-1.5 border border-slate-700">
            <img
              src={SMARTMIND_LOGO_URL}
              alt="SmartMind POS"
              className="h-full w-full object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-white tracking-tight flex items-center gap-1.5">
              <span>Install SmartMind POS</span>
              <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                App
              </span>
            </h4>
            <p className="text-xs text-slate-300 truncate">
              {isIos
                ? 'Add to home screen for fullscreen mode'
                : 'Install on your phone for quick offline access'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleInstallClick}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-emerald-900/40 hover:bg-emerald-500 active:scale-95 transition-all"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Install</span>
            </button>

            <button
              onClick={handleDismiss}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              aria-label="Dismiss banner"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* iOS Guided Step Drawer */}
        {showIosGuide && (
          <div className="mt-3.5 rounded-xl bg-slate-800/90 p-3 text-xs border border-slate-700 text-slate-200 space-y-1.5 animate-in fade-in-50">
            <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
              <Smartphone className="h-4 w-4" />
              <span>How to install on iPhone / iPad:</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-slate-300">
              <li>
                Tap the <Share2 className="inline h-3.5 w-3.5 text-blue-400 mx-0.5" /> <strong>Share</strong> button at the bottom of Safari.
              </li>
              <li>
                Scroll down and tap <strong>Add to Home Screen</strong>.
              </li>
              <li>
                Tap <strong>Add</strong> in the top right corner.
              </li>
            </ol>
          </div>
        )}
      </aside>
    </>
  );
};
