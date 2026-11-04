# SmartMind POS — Desktop SQLite Integration Guide (Phase 5)

## 1. Runtime Status & Architecture Decision

The application currently runs as a browser-based React application (Vite SPA).
No Electron desktop runtime is currently present in the codebase.

In compliance with the Phase 5 Architecture Guidelines:
- We **do not pretend** that Node.js native SQLite drivers (such as `better-sqlite3` or `sqlite3`) run directly in a web browser.
- We have implemented a clean, decoupled **`DatabaseAdapter`** interface.
- In browser development mode, the app uses **`IndexedDbDatabaseAdapter`**, explicitly identifying itself as `'indexeddb-browser-dev'`. It persists products, categories, stock movements, sales, payments, audit events, and the offline sync queue across page refreshes.
- For testing and headless environments, we provide **`MemoryDatabaseAdapter`** with true transactional isolation and rollbacks.
- For the future Windows desktop application, we provide **`SqliteDesktopDatabaseAdapter`** and the IPC bridge specification in `src/db/desktopSqliteBridge.ts`.

---

## 2. Exact Remaining Steps for Windows Desktop Packaging

When introducing the Electron desktop runtime:

1. **Install Electron and Desktop Dependencies**:
   ```bash
   npm install --save-dev electron electron-builder @types/better-sqlite3
   npm install better-sqlite3
   ```

2. **Add Electron Entry Point (`electron/main.ts`)**:
   - Create `electron/main.ts` creating a `BrowserWindow` with:
     ```ts
     webPreferences: {
       preload: path.join(__dirname, 'preload.js'),
       contextIsolation: true,
       nodeIntegration: false,
       sandbox: true,
     }
     ```
   - Load the compiled `dist/index.html` or dev server URL.
   - Initialize `setupDesktopSqlite()` from `src/db/desktopSqliteBridge.ts`.

3. **Add Preload Script (`electron/preload.ts`)**:
   - Expose the scoped `smartmindDesktopApi` via `contextBridge` using `PRELOAD_SCRIPT_REFERENCE` in `src/db/desktopSqliteBridge.ts`.

4. **Add Package Scripts**:
   ```json
   "scripts": {
     "electron:dev": "concurrently \"vite\" \"electron .\"",
     "electron:build:win": "vite build && electron-builder --win nsis"
   }
   ```

5. **Runtime Detection**:
   When `window.smartmindDesktopApi?.isElectron` is detected at startup, `src/services/posRepository.ts` automatically switches the active adapter to `SqliteDesktopDatabaseAdapter`.

---

## 3. Database Security & Concurrency Boundaries

- **Local Authorization vs. Cloud Authorization**: Local database checks enforce single-shop partitioning and cashier role boundaries on the device. However, a local database is never a substitute for server-enforced security rules. In Phase 6 (Cloud Synchronization), cloud sync services will independently validate authorization via Firebase Security Rules and Cloud Functions.
- **Atomic Transactions**: In SQLite desktop mode, `BEGIN IMMEDIATE TRANSACTION` ensures concurrency-safe stock checks and checkout finalization across multiple terminal threads.
- **No Unrestricted SQL**: The renderer is never granted raw SQL access. Only parameterized statements are invoked through typed IPC methods.
- **Integer Minor Units**: All monetary values are stored as integers (kobo) to ensure decimal safety without float rounding drift.

---

## 4. SQLite Backup & Recovery

- **Online Backup API**: When backing up SQLite, never perform a raw filesystem copy while writes might be active in WAL mode. The desktop bridge uses `db.backup(destinationFile)` to stream clean snapshots without blocking operations or generating torn pages.
- **Sensitive Data Exclusion**: Backup exports contain business catalogues, sales ledgers, and inventory audit logs; passwords and credentials are never included.
