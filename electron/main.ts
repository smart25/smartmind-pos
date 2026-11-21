import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import * as fs from 'node:fs';
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
    // Configure session webRequest headers so that local desktop requests (file://)
    // can reliably communicate with Google Cloud Functions and Firebase APIs without CORS blocks.
    const allowedCloudHosts = [
      'cloudfunctions.net',
      'run.app',
      'googleapis.com',
      'firebaseio.com',
      'firebaseapp.com',
      'identitytoolkit.googleapis.com',
      'securetoken.googleapis.com',
    ];

    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
      const isCloudTarget = allowedCloudHosts.some((h) => details.url.includes(h));
      const requestHeaders = { ...details.requestHeaders };
      if (isCloudTarget) {
        requestHeaders['Origin'] = 'https://gen-lang-client-0985802946.web.app';
      }
      callback({ requestHeaders });
    });

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const isCloudTarget = allowedCloudHosts.some((h) => details.url.includes(h));
      const responseHeaders = { ...details.responseHeaders };
      if (isCloudTarget) {
        responseHeaders['Access-Control-Allow-Origin'] = ['*'];
        responseHeaders['Access-Control-Allow-Methods'] = [
          'GET, POST, PUT, DELETE, OPTIONS, HEAD',
        ];
        responseHeaders['Access-Control-Allow-Headers'] = [
          'Content-Type, Authorization, X-Requested-With, Accept, Origin, x-goog-api-client',
        ];
      }
      callback({ responseHeaders });
    });

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
        res.resume();
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
  const iconPath =
    process.platform === 'win32'
      ? path.join(__dirname, '../build/icon.ico')
      : path.join(__dirname, '../build/icon.png');
  const fallbackIcon = path.join(__dirname, '../public/smartmind-logo.png');
  const appIcon = fs.existsSync(iconPath) ? iconPath : fallbackIcon;

  mainWindow = new BrowserWindow({
    title: `SmartMind POS v${app.getVersion()} — Multi-Shop System`,
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0f172a',
    icon: appIcon,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Ensure window is focused and visible
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  // Support F12 and Ctrl+Shift+I to toggle DevTools for diagnostic inspection
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (
      input.key === 'F12' ||
      (input.control && input.shift && input.key.toLowerCase() === 'i')
    ) {
      mainWindow?.webContents.toggleDevTools();
      event.preventDefault();
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
    console.log(`[SmartMind POS] Development mode active. Loading ${DEV_SERVER_URL}...`);
    try {
      await mainWindow.loadURL(DEV_SERVER_URL);
      console.log(`[SmartMind POS] Connected successfully to ${DEV_SERVER_URL}`);
    } catch (err) {
      console.warn(`[SmartMind POS] Failed to load ${DEV_SERVER_URL}, attempting fallback:`, err);
      const indexPath = path.join(__dirname, '../dist/index.html');
      await mainWindow.loadFile(indexPath).catch(() => {});
    }
    mainWindow?.show();
    mainWindow?.focus();
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


  // Native printer discovery
  ipcMain.handle('smartmind:printers-list', async (event) => {
    // Accept requests only from the main application window.
    if (
      !mainWindow ||
      event.sender !== mainWindow.webContents ||
      event.senderFrame !== event.sender.mainFrame
    ) {
      throw new Error('Unauthorized printer discovery request.');
    }

    const printers = await event.sender.getPrintersAsync();

    return printers.map((printer) => ({
      name: printer.name,
      displayName: printer.displayName,
      description: printer.description,
    }));
  });


  // Native document printing
  ipcMain.handle('smartmind:print-document', async (event, request) => {
    if (
      !mainWindow ||
      event.sender !== mainWindow.webContents ||
      event.senderFrame !== event.sender.mainFrame
    ) {
      throw new Error('Unauthorized print request.');
    }

    if (
      !request ||
      typeof request.printerName !== 'string' ||
      typeof request.html !== 'string' ||
      !['A4', 'thermal-58mm', 'thermal-80mm'].includes(request.format)
    ) {
      throw new Error('Invalid print request.');
    }

    const printerName = request.printerName.trim();
    const html = request.html;
    const copies = request.copies ?? 1;

    if (!printerName || printerName.length > 256) {
      throw new Error('Invalid printer name.');
    }

    if (!html.trim() || html.length > 2_000_000) {
      throw new Error('Print document is empty or exceeds the 2 MB limit.');
    }

    if (!Number.isInteger(copies) || copies < 1 || copies > 10) {
      throw new Error('Copies must be a whole number between 1 and 10.');
    }

    const printers = await event.sender.getPrintersAsync();
    let selectedPrinter = printers.find(
      (printer) => printer.name === printerName
    );

    if (!selectedPrinter) {
      selectedPrinter = printers.find(
        (printer) => printer.name.toLowerCase() === printerName.toLowerCase()
      );
    }

    if (!selectedPrinter && (printerName.toLowerCase().includes('default') || printerName === '')) {
      selectedPrinter = printers.find((p) => (p as { isDefault?: boolean }).isDefault) || printers[0];
    }

    if (!selectedPrinter) {
      throw new Error(
        `The selected printer "${printerName}" is not installed. Please check printer assignments in Settings.`
      );
    }

    const securityPolicy =
  '<meta http-equiv="Content-Security-Policy" ' +
  'content="default-src \'none\'; img-src data: blob:; ' +
  'style-src \'unsafe-inline\' data:; font-src data:; ' +
  'form-action \'none\'; base-uri \'none\'; object-src \'none\'; ' +
  'frame-src \'none\'; connect-src \'none\';">';

    const documentHtml = /<head[^>]*>/i.test(html)
      ? html.replace(/<head([^>]*)>/i, `<head$1>${securityPolicy}`)
      : `<!DOCTYPE html><html><head>${securityPolicy}</head><body>${html}</body></html>`;

    const printWindow = new BrowserWindow({
      show: false,
      width: 800,
      height: 1000,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        javascript: false,
      },
    });

    printWindow.webContents.setWindowOpenHandler(() => ({
      action: 'deny',
    }));

    try {
      await printWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(documentHtml)}`
      );

      const printOptions =
        request.format === 'A4'
          ? {
              silent: true,
              printBackground: true,
              deviceName: printerName,
              pageSize: 'A4' as const,
              copies,
            }
          : {
    silent: true,
    printBackground: true,
    deviceName: printerName,
    usePrinterDefaultPageSize: true,
    copies,
  };

      return await new Promise((resolve) => {
        printWindow.webContents.print(printOptions, (success, failureReason) => {
          resolve({
            success,
            failureReason: success ? undefined : failureReason,
          });
        });
      });
    } catch (error) {
      return {
        success: false,
        failureReason:
          error instanceof Error ? error.message : 'Unknown printing error.',
      };
    } finally {
      if (!printWindow.isDestroyed()) {
        printWindow.close();
      }
    }
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
