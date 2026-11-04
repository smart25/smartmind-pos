# SmartMind POS — Stage 1: Electron Desktop Foundation

## Windows PowerShell Setup & Verification Guide

This guide provides the exact steps to install, build, verify, and run the SmartMind POS Electron Desktop Foundation on your Windows workstation at:
`C:\Users\smart\Desktop\smartmind-pos-validation-updated`

---

### Prerequisites
- Node.js (v20 or v22 LTS recommended)
- PowerShell or Windows Command Prompt

---

### Step 1: Extract Files into Your Project
Extract the contents of `stage1-electron-desktop-foundation.zip` directly into your project root:
`C:\Users\smart\Desktop\smartmind-pos-validation-updated`

Verify that the following folder structure exists:
```
C:\Users\smart\Desktop\smartmind-pos-validation-updated\
  ├── electron\
  │     ├── main.ts
  │     ├── preload.ts
  │     └── tsconfig.json
  ├── src\
  │     ├── types\
  │     │     └── electron.d.ts
  │     └── db\
  │           └── electronStage1.test.ts
  ├── package.json
  ├── tsconfig.json
  └── vite.config.ts
```

---

### Step 2: Install Development Dependencies
Open Windows PowerShell in the project directory:
```powershell
Set-Location -Path "C:\Users\smart\Desktop\smartmind-pos-validation-updated"
npm install -D electron concurrently
```

---

### Step 3: Run Static Type Checking
Verify there are zero TypeScript compiler errors:
```powershell
npm run lint
```
*Expected result*: Command exits with code 0 (`tsc --noEmit` completed without errors).

---

### Step 4: Run the Automated Test Suite
Run the test runner to verify all calculations, adapter safety, and Electron foundation security policies:
```powershell
npm test
```
*Expected result*: All 91 tests pass (`ok 1` through `ok 91`), including:
- Package configuration & scripts verification
- TypeScript configuration and file existence
- Main process security rules (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, `requestSingleInstanceLock`)
- Preload boundary validation (`contextBridge.exposeInMainWorld`, no raw `ipcRenderer` or Node globals exposed)
- Database adapter integrity

---

### Step 5: Build Production Artifacts
Compile the React frontend with Vite and the Electron main/preload scripts with esbuild:
```powershell
npm run build:all
```
*Expected result*:
- `dist/index.html` and bundled frontend assets in `dist/`
- `dist-electron/main.js` (ESM module)
- `dist-electron/preload.cjs` (CommonJS module)

---

### Step 6: Launch SmartMind POS in Desktop Mode
To run in development mode (starts Vite dev server on port 3000, compiles Electron scripts, waits for dev server, and launches the native Windows window):
```powershell
npm run electron:dev
```

To run against the production build:
```powershell
npm run electron:start
```

---

### Architecture & Security Highlights
1. **Zero Impact on Existing Features**:
   - Web development mode (`npm run dev`) continues to run on `http://localhost:3000` with full HMR and file watching.
   - IndexedDB, Firebase Firestore sync, and all POS business logic remain completely untouched.
   - SQLite integration is cleanly isolated and deferred to Stage 2.
2. **Hardened Desktop Security**:
   - `contextIsolation: true` and `nodeIntegration: false` strictly prevent renderer-to-OS privilege escalation.
   - `sandbox: true` enables OS-level sandboxing for the Chromium renderer.
   - External links automatically open in the user's default web browser (`shell.openExternal`) rather than inside the POS shell.
   - Single-instance lock (`app.requestSingleInstanceLock()`) guarantees POS terminal stability by preventing accidental duplicate cashier processes.
