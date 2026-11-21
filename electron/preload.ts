
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
});
