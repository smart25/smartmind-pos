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

export interface SmartmindDesktopApi {
  isElectron: boolean;
  platform: string;
  appVersion: string;
  getDesktopInfo: () => Promise<SmartmindDesktopInfo>;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  sqlite?: ElectronSqliteBridge;
}
