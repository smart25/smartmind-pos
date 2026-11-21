
import type { ElectronSqliteBridge } from '../db/adapters/sqliteDesktopAdapter';

export interface SmartmindDesktopInfo {
  isElectron: boolean;
  platform: string;
  arch: string;
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
}

export interface SmartmindDesktopWindowControls {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
}

/** Information returned by the operating system for an installed printer. */
export interface SmartmindPrinterInfo {
  name: string;
  displayName: string;
  description: string;
}
/** Supported document formats for native printing. */
export type SmartmindPrintFormat = 'thermal-58mm' | 'thermal-80mm' | 'A4';

/** Request sent to the Electron main process. */
export interface SmartmindPrintRequest {
  printerName: string;
  format: SmartmindPrintFormat;
  html: string;
  copies?: number;
}

/** Result returned after Electron's native print callback. */
export interface SmartmindPrintResult {
  success: boolean;
  failureReason?: string;
}

export interface SmartmindDesktopApi {
  isElectron: boolean;
  platform: string;
  appVersion: string;
  getDesktopInfo: () => Promise<SmartmindDesktopInfo>;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;

  /** Discover printers installed on this computer. */
  getPrinters?: () => Promise<SmartmindPrinterInfo[]>;

  /** Submit an HTML document to an installed printer. */
  printDocument?: (
    request: SmartmindPrintRequest
  ) => Promise<SmartmindPrintResult>;

  sqlite?: ElectronSqliteBridge;
}

declare global {
  interface Window {
    smartmindDesktopApi?: SmartmindDesktopApi;
  }
}
