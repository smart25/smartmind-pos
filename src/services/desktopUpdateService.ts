import { useState, useEffect } from 'react';
import { APP_VERSION } from '../constants/version';

export type DesktopUpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error';

export interface UpdateProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
}

interface UpdateStore {
  state: DesktopUpdateState;
  latestVersion: string;
  releaseNotes?: string;
  progress: UpdateProgress;
  errorMessage: string | null;
  isModalOpen: boolean;
}

let globalStore: UpdateStore = {
  state: 'idle',
  latestVersion: '',
  progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 },
  errorMessage: null,
  isModalOpen: false,
};

const listeners = new Set<(store: UpdateStore) => void>();

function notify() {
  listeners.forEach((l) => l({ ...globalStore }));
}

export function setUpdateStore(partial: Partial<UpdateStore>) {
  globalStore = { ...globalStore, ...partial };
  notify();
}

/**
 * Checks for updates on GitHub Releases and Electron native updater
 */
export async function checkForAppUpdates(): Promise<void> {
  const desktopApi = typeof window !== 'undefined' ? window.smartmindDesktopApi : undefined;
  if (!desktopApi?.isElectron) {
    return;
  }
  setUpdateStore({ state: 'checking', errorMessage: null });

  // 1. If running inside Electron, trigger electron-updater IPC
  if (desktopApi?.checkForUpdates) {
    try {
      await desktopApi.checkForUpdates();
    } catch (err: unknown) {
      console.warn('[SmartMind POS Update] Native IPC check failed:', err);
    }
  }

  // 2. Also query public GitHub Releases API as a reliable fallback / real-time version check
  try {
    const res = await fetch(
      'https://api.github.com/repos/smart25/smartmind-pos/releases/latest',
      { headers: { Accept: 'application/vnd.github.v3+json' } }
    );
    if (res.ok) {
      const data = await res.json();
      const remoteTag = (data.tag_name || '').replace(/^v/, '').trim();
      const currentVer = APP_VERSION.replace(/^v/, '').trim();

      if (remoteTag && isVersionGreater(remoteTag, currentVer)) {
        setUpdateStore({
          state: 'available',
          latestVersion: remoteTag,
          releaseNotes: data.body || 'SmartMind POS Update is Ready',
          isModalOpen: true,
        });
        return;
      } else {
        setUpdateStore({
          state: 'up-to-date',
          latestVersion: currentVer,
        });
        setTimeout(() => {
          if (globalStore.state === 'up-to-date') {
            setUpdateStore({ state: 'idle' });
          }
        }, 4000);
        return;
      }
    }
  } catch (err: unknown) {
    console.warn('[SmartMind POS Update] GitHub API check error:', err);
  }

  if (globalStore.state === 'checking') {
    setUpdateStore({ state: 'idle' });
  }
}

/**
 * Compares two semantic version strings (e.g. "1.0.2" > "1.0.1")
 */
function isVersionGreater(remote: string, current: string): boolean {
  const rParts = remote.split('.').map((p) => parseInt(p, 10) || 0);
  const cParts = current.split('.').map((p) => parseInt(p, 10) || 0);
  const len = Math.max(rParts.length, cParts.length);

  for (let i = 0; i < len; i++) {
    const r = rParts[i] || 0;
    const c = cParts[i] || 0;
    if (r > c) return true;
    if (r < c) return false;
  }
  return false;
}

// Global initialization: setup listeners once
let isInitialized = false;
export function initDesktopUpdateService() {
  if (isInitialized || typeof window === 'undefined') return;
  isInitialized = true;

  const desktopApi = window.smartmindDesktopApi;
  if (!desktopApi?.isElectron) {
    // Only running inside Electron desktop application; ignore in web browser and mobile
    return;
  }

  // Listen to Electron events
  desktopApi.onUpdateChecking?.(() => {
    setUpdateStore({ state: 'checking', errorMessage: null });
  });

  desktopApi.onUpdateAvailable?.((info) => {
    setUpdateStore({
      state: 'available',
      latestVersion: info.version.replace(/^v/, ''),
      releaseNotes: info.releaseNotes,
      isModalOpen: true,
    });
  });

  desktopApi.onUpdateNotAvailable?.((info) => {
    setUpdateStore({
      state: 'up-to-date',
      latestVersion: info.version.replace(/^v/, ''),
    });
    setTimeout(() => {
      if (globalStore.state === 'up-to-date') {
        setUpdateStore({ state: 'idle' });
      }
    }, 4000);
  });

  desktopApi.onUpdateDownloadProgress?.((p) => {
    setUpdateStore({
      state: 'downloading',
      progress: p,
      isModalOpen: true,
    });
  });

  desktopApi.onUpdateDownloaded?.((info) => {
    setUpdateStore({
      state: 'downloaded',
      latestVersion: info.version.replace(/^v/, ''),
      releaseNotes: info.releaseNotes,
      isModalOpen: true,
    });
  });

  desktopApi.onUpdateError?.((err) => {
    console.warn('[SmartMind POS Update Service] Error:', err);
    setUpdateStore({
      errorMessage: err.message,
      state: globalStore.state === 'downloading' ? 'error' : globalStore.state,
    });
  });

  // Listen for menu trigger event from native top menu
  window.addEventListener('smartmind:menu-check-update', () => {
    checkForAppUpdates();
  });

  // Initial check 2.5s after desktop startup
  setTimeout(() => {
    checkForAppUpdates();
  }, 2500);

  // Periodic check every 30 minutes
  setInterval(() => {
    checkForAppUpdates();
  }, 30 * 60 * 1000);
}

/**
 * Custom React Hook for Desktop & Web Updates
 */
export function useDesktopUpdate() {
  const [store, setStore] = useState<UpdateStore>(globalStore);

  useEffect(() => {
    initDesktopUpdateService();
    listeners.add(setStore);
    return () => {
      listeners.delete(setStore);
    };
  }, []);

  const openModal = () => setUpdateStore({ isModalOpen: true });
  const closeModal = () => setUpdateStore({ isModalOpen: false });

  const startDownload = async () => {
    const desktopApi = window.smartmindDesktopApi;
    if (desktopApi?.startDownloadUpdate) {
      setUpdateStore({
        state: 'downloading',
        progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 },
        isModalOpen: true,
      });
      try {
        await desktopApi.startDownloadUpdate();
      } catch (err: unknown) {
        setUpdateStore({
          state: 'error',
          errorMessage: err instanceof Error ? err.message : 'Download failed',
        });
      }
    } else {
      // Web fallback: open releases page
      window.open('https://github.com/smart25/smartmind-pos/releases/latest', '_blank');
    }
  };

  const restartAndInstall = () => {
    const desktopApi = window.smartmindDesktopApi;
    if (desktopApi?.quitAndInstallUpdate) {
      desktopApi.quitAndInstallUpdate();
    }
  };

  return {
    ...store,
    isUpdateAvailable: store.state === 'available' || store.state === 'downloaded',
    isDownloading: store.state === 'downloading',
    isDownloaded: store.state === 'downloaded',
    isChecking: store.state === 'checking',
    isUpToDate: store.state === 'up-to-date',
    checkForUpdates: checkForAppUpdates,
    openModal,
    closeModal,
    startDownload,
    restartAndInstall,
  };
}
