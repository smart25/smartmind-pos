
import { contextBridge, ipcRenderer } from 'electron';
import type {
  SmartmindPrintRequest,
  SmartmindPrintResult,
  SmartmindPrinterInfo,
} from '../src/types/electron';

contextBridge.exposeInMainWorld('smartmindDesktopApi', {
  isElectron: true,
  platform: process.platform,
  appVersion: process.env.npm_package_version || '1.0.0',

  getDesktopInfo: () => ipcRenderer.invoke('smartmind:get-desktop-info'),

  minimize: () => ipcRenderer.invoke('smartmind:window-minimize'),
  maximize: () => ipcRenderer.invoke('smartmind:window-maximize'),
  close: () => ipcRenderer.invoke('smartmind:window-close'),
  isMaximized: () => ipcRenderer.invoke('smartmind:window-is-maximized'),

  // Native printer discovery and printing.
  getPrinters: (): Promise<SmartmindPrinterInfo[]> =>
    ipcRenderer.invoke('smartmind:printers-list'),

  printDocument: (
    request: SmartmindPrintRequest
  ): Promise<SmartmindPrintResult> =>
    ipcRenderer.invoke('smartmind:print-document', request),

  // In-App Auto-Update controls
  checkForUpdates: () => ipcRenderer.invoke('smartmind:check-for-updates'),
  startDownloadUpdate: () => ipcRenderer.invoke('smartmind:start-download-update'),
  quitAndInstallUpdate: () => ipcRenderer.invoke('smartmind:quit-and-install-update'),

  onUpdateChecking: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('smartmind:update-checking', handler);
    return () => ipcRenderer.removeListener('smartmind:update-checking', handler);
  },
  onUpdateAvailable: (callback: (info: { version: string; releaseDate?: string; releaseNotes?: string }) => void) => {
    const handler = (_event: any, info: any) => callback(info);
    ipcRenderer.on('smartmind:update-available', handler);
    return () => ipcRenderer.removeListener('smartmind:update-available', handler);
  },
  onUpdateNotAvailable: (callback: (info: { version: string }) => void) => {
    const handler = (_event: any, info: any) => callback(info);
    ipcRenderer.on('smartmind:update-not-available', handler);
    return () => ipcRenderer.removeListener('smartmind:update-not-available', handler);
  },
  onUpdateDownloadProgress: (callback: (progress: { percent: number; transferred: number; total: number; bytesPerSecond: number }) => void) => {
    const handler = (_event: any, progress: any) => callback(progress);
    ipcRenderer.on('smartmind:update-download-progress', handler);
    return () => ipcRenderer.removeListener('smartmind:update-download-progress', handler);
  },
  onUpdateDownloaded: (callback: (info: { version: string; releaseNotes?: string }) => void) => {
    const handler = (_event: any, info: any) => callback(info);
    ipcRenderer.on('smartmind:update-downloaded', handler);
    return () => ipcRenderer.removeListener('smartmind:update-downloaded', handler);
  },
  onUpdateError: (callback: (err: { message: string }) => void) => {
    const handler = (_event: any, err: any) => callback(err);
    ipcRenderer.on('smartmind:update-error', handler);
    return () => ipcRenderer.removeListener('smartmind:update-error', handler);
  },
});
