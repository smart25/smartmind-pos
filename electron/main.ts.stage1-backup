import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as http from 'node:http';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * SmartMind POS — Stage 1: Electron Desktop Main Process
 *
 * Professional Windows Desktop Foundation for SmartMind POS.
 *
 * Architecture & Security Standards:
 * - Single-instance application lock for POS terminal reliability
 * - contextIsolation: true, nodeIntegration: false, sandbox: true
 * - Navigation lock: Prevents renderer hijacking; external URLs open in system browser
 * - Development: Automatically waits for Vite dev server (port 3000)
 * - Production: Loads built assets from dist/index.html
 * - Window state & lifecycle management tailored for POS cashier and manager workflows
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

// Determine environment
const isDev =
  !app.isPackaged &&
  (process.env.ELECTRON_DEV === 'true' ||
    process.env.NODE_ENV === 'development' ||
    process.env.VITE_DEV_SERVER_URL !== undefined ||
    !process.env.NODE_ENV);

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000';

// Acquire single-instance lock to ensure only one POS process runs per terminal
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.warn('[SmartMind POS] Another instance of SmartMind POS is already running. Quitting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    // If a second instance is launched, focus the existing window
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    registerIpcHandlers();
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });
}

/**
 * Helper to wait for the local Vite dev server before loading
 */
function waitForDevServer(url: string, maxAttempts = 30, intervalMs = 300): Promise<boolean> {
  return new Promise((resolve) => {
    let attempts = 0;

    const check = () => {
      attempts++;
      const req = http.get(url, (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
          resolve(true);
        } else if (attempts < maxAttempts) {
          setTimeout(check, intervalMs);
        } else {
          resolve(false);
        }
      });

      req.on('error', () => {
        if (attempts < maxAttempts) {
          setTimeout(check, intervalMs);
        } else {
          resolve(false);
        }
      });

      req.setTimeout(1000, () => {
        req.destroy();
        if (attempts < maxAttempts) {
          setTimeout(check, intervalMs);
        } else {
          resolve(false);
        }
      });
    };

    check();
  });
}

/**
 * Creates and configures the primary POS BrowserWindow
 */
async function createMainWindow(): Promise<void> {
  const iconPath = path.join(__dirname, '../public/assets/aistudio/smartmind_pos_4bb52e16.png');

  mainWindow = new BrowserWindow({
    title: 'SmartMind POS',
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0f172a',
    icon: iconPath,
    show: false, // Prevent white flash until ready
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Smooth appearance when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (isDev) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // Security: Deny window.open requests and open external links safely in user's OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url).catch((err) => {
        console.error('[SmartMind POS] Failed to open external URL:', err);
      });
    }
    return { action: 'deny' };
  });

  // Security: Prevent navigation away from the application
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isAppOrigin = url.startsWith(DEV_SERVER_URL) || url.startsWith('file:');
    if (!isAppOrigin) {
      event.preventDefault();
      shell.openExternal(url).catch((err) => {
        console.error('[SmartMind POS] Failed to open external URL:', err);
      });
    }
  });

  // Load the application based on environment
  if (isDev) {
    console.log(`[SmartMind POS] Development mode active. Connecting to dev server at ${DEV_SERVER_URL}...`);
    const serverReady = await waitForDevServer(DEV_SERVER_URL);
    if (serverReady) {
      await mainWindow.loadURL(DEV_SERVER_URL);
    } else {
      console.warn(`[SmartMind POS] Dev server at ${DEV_SERVER_URL} was not reachable within timeout. Loading fallback.`);
      await mainWindow.loadURL(DEV_SERVER_URL); // Let Chromium display connection info or retry
    }
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html');
    console.log(`[SmartMind POS] Production mode active. Loading local assets from ${indexPath}...`);
    await mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Registers safe, non-privileged IPC communication channels
 */
function registerIpcHandlers(): void {
  // Information channel
  ipcMain.handle('smartmind:get-desktop-info', () => {
    return {
      isElectron: true,
      platform: process.platform,
      arch: process.arch,
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
    };
  });

  // Window control channels
  ipcMain.handle('smartmind:window-minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
  });

  ipcMain.handle('smartmind:window-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });

  ipcMain.handle('smartmind:window-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
  });

  ipcMain.handle('smartmind:window-is-maximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isMaximized() ?? false;
  });
}

// App lifecycle
app.on('window-all-closed', () => {
  // On POS terminals, closing the main window quits the application
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
