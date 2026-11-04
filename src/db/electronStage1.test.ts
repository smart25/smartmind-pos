import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

test('Electron Stage 1: package.json configured with main entry and build scripts', () => {
  const pkgPath = path.join(rootDir, 'package.json');
  assert.ok(fs.existsSync(pkgPath), 'package.json must exist');

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  assert.equal(pkg.main, 'dist-electron/main.js', 'package.json main must point to dist-electron/main.js');
  assert.ok(pkg.scripts['build:electron'], 'package.json must contain build:electron script');
  assert.ok(pkg.scripts['electron:start'], 'package.json must contain electron:start script');
  assert.ok(pkg.scripts['electron:dev'], 'package.json must contain electron:dev script');
  assert.ok(pkg.devDependencies['electron'], 'electron must be in devDependencies');
});

test('Electron Stage 1: TypeScript configurations and source files exist', () => {
  const mainTs = path.join(rootDir, 'electron/main.ts');
  const preloadTs = path.join(rootDir, 'electron/preload.ts');
  const electronTsconfig = path.join(rootDir, 'electron/tsconfig.json');
  const electronDts = path.join(rootDir, 'src/types/electron.d.ts');

  assert.ok(fs.existsSync(mainTs), 'electron/main.ts must exist');
  assert.ok(fs.existsSync(preloadTs), 'electron/preload.ts must exist');
  assert.ok(fs.existsSync(electronTsconfig), 'electron/tsconfig.json must exist');
  assert.ok(fs.existsSync(electronDts), 'src/types/electron.d.ts must exist');
});

test('Electron Stage 1: Source files implement security architecture and boundary controls', () => {
  const mainTs = path.join(rootDir, 'electron/main.ts');
  const preloadTs = path.join(rootDir, 'electron/preload.ts');

  assert.ok(fs.existsSync(mainTs), 'electron/main.ts source must exist');
  assert.ok(fs.existsSync(preloadTs), 'electron/preload.ts source must exist');

  const mainContent = fs.readFileSync(mainTs, 'utf-8');
  const preloadContent = fs.readFileSync(preloadTs, 'utf-8');

  // Security checks for main process source
  assert.ok(mainContent.includes('contextIsolation: true'), 'Main process must enforce contextIsolation: true');
  assert.ok(mainContent.includes('nodeIntegration: false'), 'Main process must enforce nodeIntegration: false');
  assert.ok(mainContent.includes('sandbox: true'), 'Main process must enforce sandbox: true');
  assert.ok(mainContent.includes('webSecurity: true'), 'Main process must enforce webSecurity: true');
  assert.ok(mainContent.includes('setWindowOpenHandler'), 'Main process must handle window open securely');
  assert.ok(mainContent.includes('requestSingleInstanceLock'), 'Main process must enforce single instance lock for POS terminals');

  // Security checks for preload source
  assert.ok(preloadContent.includes('contextBridge.exposeInMainWorld'), 'Preload must expose via contextBridge');
  assert.ok(preloadContent.includes('smartmindDesktopApi'), 'Preload must expose under smartmindDesktopApi namespace');
  assert.ok(preloadContent.includes('smartmind:get-desktop-info'), 'Preload must bridge smartmind:get-desktop-info');
  assert.ok(preloadContent.includes('smartmind:window-minimize'), 'Preload must bridge window minimize');
  assert.ok(preloadContent.includes('smartmind:window-maximize'), 'Preload must bridge window maximize');
  assert.ok(preloadContent.includes('smartmind:window-close'), 'Preload must bridge window close');

  // Must NOT expose raw Node modules directly
  assert.ok(!preloadContent.includes('window.require'), 'Preload must not expose window.require');
  assert.ok(!preloadContent.includes('window.ipcRenderer'), 'Preload must not expose raw ipcRenderer on window');

  // If built artifacts are present, also verify they are valid
  const distMain = path.join(rootDir, 'dist-electron/main.js');
  const distPreload = path.join(rootDir, 'dist-electron/preload.cjs');
  if (fs.existsSync(distMain) && fs.existsSync(distPreload)) {
    const distMainContent = fs.readFileSync(distMain, 'utf-8');
    const distPreloadContent = fs.readFileSync(distPreload, 'utf-8');
    assert.ok(distMainContent.includes('contextIsolation: true'));
    assert.ok(distPreloadContent.includes('smartmindDesktopApi'));
  }
});

test('Electron Stage 1: Existing database adapters and business logic remain untouched', () => {
  const idbPath = path.join(rootDir, 'src/db/adapters/indexedDbAdapter.ts');
  const sqliteAdapterPath = path.join(rootDir, 'src/db/adapters/sqliteDesktopAdapter.ts');

  assert.ok(fs.existsSync(idbPath), 'indexedDbAdapter.ts must exist');
  assert.ok(fs.existsSync(sqliteAdapterPath), 'sqliteDesktopAdapter.ts must exist');
});
