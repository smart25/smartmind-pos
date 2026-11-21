declare const __APP_VERSION__: string | undefined;

/**
 * Single source of truth for application version across Web & Electron Desktop.
 * Automatically synchronizes with package.json during build.
 */
export const APP_VERSION: string =
  (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ ? __APP_VERSION__ : '') ||
  (typeof window !== 'undefined' && (window as any).smartmindDesktopApi?.appVersion) ||
  '1.0.0';
