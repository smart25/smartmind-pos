import { contextBridge, ipcRenderer } from 'electron';

/**
 * SmartMind POS — Stage 1: Electron Desktop Preload Script
 *
 * Exposes a strictly scoped, non-privileged desktop API to the renderer process
 * via Electron contextBridge.
 *
 * Security architecture:
 * - contextIsolation: true (enforced in main process)
 * - nodeIntegration: false (enforced in main process)
 * - sandbox: true (enforced in main process)
 * - No Node.js globals, filesystem access, or raw ipcRenderer are exposed.
 * - SQLite bridge is deferred to Stage 2.
 */

contextBridge.exposeInMainWorld('smartmindDesktopApi', {
  isElectron: true,
  platform: process.platform,
  appVersion: process.env.npm_package_version || '1.0.0',

  /**
   * Retrieves desktop environment metadata (OS platform, architecture, Electron/Node/Chrome versions)
   */
  getDesktopInfo: () => ipcRenderer.invoke('smartmind:get-desktop-info'),

  /**
   * Desktop window controls (custom titlebar/kiosk controls)
   */
  minimize: () => ipcRenderer.invoke('smartmind:window-minimize'),
  maximize: () => ipcRenderer.invoke('smartmind:window-maximize'),
  close: () => ipcRenderer.invoke('smartmind:window-close'),
  isMaximized: () => ipcRenderer.invoke('smartmind:window-is-maximized'),
});
