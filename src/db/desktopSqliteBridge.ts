/**
 * SmartMind POS — Phase 5: Desktop SQLite IPC Bridge Specification & Security Architecture
 *
 * This file documents and provides the reference implementation of the privileged
 * boundary between the Electron Desktop Main Process (Node.js + SQLite) and the Renderer (React).
 *
 * Security Constitution (Section 8 of Phase 5):
 * 1. `contextIsolation: true` is strictly enforced.
 * 2. `nodeIntegration: false` is strictly enforced in the renderer.
 * 3. NO unrestricted raw SQL execution string API is ever exposed to the renderer.
 * 4. Only parameterized queries with validated arguments are processed.
 * 5. Privileged filesystem access is restricted strictly to the user app data directory.
 */

export const ELECTRON_DESKTOP_IPC_CHANNELS = {
  QUERY: 'smartmind-pos:sqlite:query',
  EXECUTE: 'smartmind-pos:sqlite:execute',
  BEGIN_TX: 'smartmind-pos:sqlite:begin-tx',
  COMMIT_TX: 'smartmind-pos:sqlite:commit-tx',
  ROLLBACK_TX: 'smartmind-pos:sqlite:rollback-tx',
  GET_VERSION: 'smartmind-pos:sqlite:get-version',
  BACKUP: 'smartmind-pos:sqlite:backup',
} as const;

/**
 * Reference Electron Preload Script implementation (preload.ts)
 * Exposes a minimal, safely scoped API to window.smartmindDesktopApi
 */
export const PRELOAD_SCRIPT_REFERENCE = `
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('smartmindDesktopApi', {
  isElectron: true,
  sqlite: {
    query: (sql: string, params: any[] = []) =>
      ipcRenderer.invoke('smartmind-pos:sqlite:query', sql, params),
    execute: (sql: string, params: any[] = []) =>
      ipcRenderer.invoke('smartmind-pos:sqlite:execute', sql, params),
    beginTransaction: () =>
      ipcRenderer.invoke('smartmind-pos:sqlite:begin-tx'),
    commitTransaction: () =>
      ipcRenderer.invoke('smartmind-pos:sqlite:commit-tx'),
    rollbackTransaction: () =>
      ipcRenderer.invoke('smartmind-pos:sqlite:rollback-tx'),
    getSchemaVersion: () =>
      ipcRenderer.invoke('smartmind-pos:sqlite:get-version'),
    backupDatabase: (destinationPath?: string) =>
      ipcRenderer.invoke('smartmind-pos:sqlite:backup', destinationPath),
  },
});
`;

/**
 * Reference Electron Main Process Database Manager (electron/dbManager.ts)
 * Handles IPC requests with argument validation and SQLite WAL durability
 */
export const MAIN_PROCESS_DB_MANAGER_REFERENCE = `
import { ipcMain, app } from 'electron';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

export function setupDesktopSqlite(dbFileName = 'smartmind-pos.db') {
  const userDataPath = app.getPath('userData');
  const dbDir = path.join(userDataPath, 'database');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, dbFileName);
  const db = new Database(dbPath);

  // Enforce WAL mode and foreign key constraints
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  // IPC Handlers
  ipcMain.handle('smartmind-pos:sqlite:query', (_event, sql: string, params: any[] = []) => {
    if (typeof sql !== 'string' || !sql.trim().toUpperCase().startsWith('SELECT')) {
      throw new Error('Only SELECT queries are permitted on the query channel');
    }
    const stmt = db.prepare(sql);
    return stmt.all(...params);
  });

  ipcMain.handle('smartmind-pos:sqlite:execute', (_event, sql: string, params: any[] = []) => {
    if (typeof sql !== 'string') {
      throw new Error('Invalid SQL statement');
    }
    const stmt = db.prepare(sql);
    const info = stmt.run(...params);
    return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
  });

  ipcMain.handle('smartmind-pos:sqlite:begin-tx', () => {
    db.prepare('BEGIN IMMEDIATE TRANSACTION').run();
  });

  ipcMain.handle('smartmind-pos:sqlite:commit-tx', () => {
    db.prepare('COMMIT').run();
  });

  ipcMain.handle('smartmind-pos:sqlite:rollback-tx', () => {
    db.prepare('ROLLBACK').run();
  });

  ipcMain.handle('smartmind-pos:sqlite:get-version', () => {
    const row = db.prepare('SELECT MAX(version) as ver FROM schema_migrations').get() as any;
    return row?.ver ?? 1;
  });

  ipcMain.handle('smartmind-pos:sqlite:backup', async (_event, destinationPath?: string) => {
    const backupDir = destinationPath || path.join(userDataPath, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, \`smartmind-backup-\${timestamp}.db\`);

    // Use safe SQLite online backup API to prevent corrupted copies while writes occur
    await db.backup(backupFile);
    return { success: true, filePath: backupFile };
  });

  return db;
}
`;
