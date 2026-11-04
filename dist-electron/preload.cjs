"use strict";

// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("smartmindDesktopApi", {
  isElectron: true,
  platform: process.platform,
  appVersion: process.env.npm_package_version || "1.0.0",
  /**
   * Retrieves desktop environment metadata (OS platform, architecture, Electron/Node/Chrome versions)
   */
  getDesktopInfo: () => import_electron.ipcRenderer.invoke("smartmind:get-desktop-info"),
  /**
   * Desktop window controls (custom titlebar/kiosk controls)
   */
  minimize: () => import_electron.ipcRenderer.invoke("smartmind:window-minimize"),
  maximize: () => import_electron.ipcRenderer.invoke("smartmind:window-maximize"),
  close: () => import_electron.ipcRenderer.invoke("smartmind:window-close"),
  isMaximized: () => import_electron.ipcRenderer.invoke("smartmind:window-is-maximized")
});
