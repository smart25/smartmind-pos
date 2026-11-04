// electron/main.ts
import { app, BrowserWindow, ipcMain, shell } from "electron";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var mainWindow = null;
var isDev = !app.isPackaged && (process.env.ELECTRON_DEV === "true" || process.env.NODE_ENV === "development" || process.env.VITE_DEV_SERVER_URL !== void 0);
var DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || "http://localhost:3000";
var gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.warn("[SmartMind POS] Another instance of SmartMind POS is already running. Quitting.");
  app.quit();
} else {
  app.on("second-instance", () => {
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
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });
}
function waitForDevServer(url, maxAttempts = 30, intervalMs = 300) {
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
      req.on("error", () => {
        if (attempts < maxAttempts) {
          setTimeout(check, intervalMs);
        } else {
          resolve(false);
        }
      });
      req.setTimeout(1e3, () => {
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
async function createMainWindow() {
  const iconPath = path.join(__dirname, "../public/assets/aistudio/smartmind_pos_4bb52e16.png");
  mainWindow = new BrowserWindow({
    title: "SmartMind POS",
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0f172a",
    icon: iconPath,
    show: false,
    // Prevent white flash until ready
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    if (isDev) {
      mainWindow?.webContents.openDevTools({ mode: "detach" });
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url).catch((err) => {
        console.error("[SmartMind POS] Failed to open external URL:", err);
      });
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    let allowed = false;
    try {
      const target = new URL(url);
      if (isDev) {
        allowed = target.origin === new URL(DEV_SERVER_URL).origin;
      } else {
        const expectedFile = pathToFileURL(
          path.join(__dirname, "../dist/index.html")
        ).href;
        allowed = target.href === expectedFile;
      }
    } catch {
      allowed = false;
    }
    if (!allowed) {
      event.preventDefault();
      try {
        const target = new URL(url);
        if (target.protocol === "https:" || target.protocol === "http:") {
          shell.openExternal(target.href).catch((err) => {
            console.error("[SmartMind POS] Failed to open external URL:", err);
          });
        }
      } catch {
        console.warn("[SmartMind POS] Blocked invalid navigation URL.");
      }
    }
  });
  if (isDev) {
    console.log(`[SmartMind POS] Development mode active. Connecting to dev server at ${DEV_SERVER_URL}...`);
    const serverReady = await waitForDevServer(DEV_SERVER_URL);
    if (serverReady) {
      await mainWindow.loadURL(DEV_SERVER_URL);
    } else {
      console.warn(`[SmartMind POS] Dev server at ${DEV_SERVER_URL} was not reachable within timeout. Loading fallback.`);
      await mainWindow.loadURL(DEV_SERVER_URL);
    }
  } else {
    const indexPath = path.join(__dirname, "../dist/index.html");
    console.log(`[SmartMind POS] Production mode active. Loading local assets from ${indexPath}...`);
    await mainWindow.loadFile(indexPath);
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
function registerIpcHandlers() {
  ipcMain.handle("smartmind:get-desktop-info", () => {
    return {
      isElectron: true,
      platform: process.platform,
      arch: process.arch,
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node
    };
  });
  ipcMain.handle("smartmind:window-minimize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
  });
  ipcMain.handle("smartmind:window-maximize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });
  ipcMain.handle("smartmind:window-close", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
  });
  ipcMain.handle("smartmind:window-is-maximized", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win?.isMaximized() ?? false;
  });
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
