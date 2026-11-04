/**
 * SmartMind POS — Phase 5 Database Layer Entrypoint
 *
 * Exports adapters, schema models, converters, and an adapter factory
 * that dynamically selects the appropriate adapter:
 * - SqliteDesktopDatabaseAdapter when running in the Windows Electron desktop runtime
 * - IndexedDbDatabaseAdapter when running in the browser development preview
 * - MemoryDatabaseAdapter when running in in-memory test environments
 */

import { DatabaseAdapter } from './databaseAdapter';
import { IndexedDbDatabaseAdapter } from './adapters/indexedDbAdapter';
import { MemoryDatabaseAdapter } from './adapters/memoryAdapter';
import { SqliteDesktopDatabaseAdapter } from './adapters/sqliteDesktopAdapter';

export * from './databaseAdapter';
export * from './schema';
export {
  ELECTRON_DESKTOP_IPC_CHANNELS,
  PRELOAD_SCRIPT_REFERENCE,
  MAIN_PROCESS_DB_MANAGER_REFERENCE,
} from './desktopSqliteBridge';

let activeAdapterInstance: DatabaseAdapter | null = null;

export function getDatabaseAdapter(): DatabaseAdapter {
  if (activeAdapterInstance) {
    return activeAdapterInstance;
  }

  // Detect Electron Windows Desktop runtime
  if (
    typeof window !== 'undefined' &&
    (window as any).smartmindDesktopApi?.sqlite
  ) {
    activeAdapterInstance = new SqliteDesktopDatabaseAdapter();
    return activeAdapterInstance;
  }

  // Detect browser environment
  if (typeof window !== 'undefined' && window.indexedDB) {
    activeAdapterInstance = new IndexedDbDatabaseAdapter();
    return activeAdapterInstance;
  }

  // Headless test or Node environment
  activeAdapterInstance = new MemoryDatabaseAdapter();
  return activeAdapterInstance;
}

export function resetDatabaseAdapterForTesting(customAdapter?: DatabaseAdapter): void {
  activeAdapterInstance = customAdapter || null;
}
