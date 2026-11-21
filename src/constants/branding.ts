/**
 * SmartMind POS — Centralized Branding Assets
 *
 * Uses project-relative URLs derived from Vite's `BASE_URL` ('./') so the logo resolves correctly:
 * 1. In Google AI Studio web preview (served via HTTP).
 * 2. In local Windows Vite dev server (http://localhost:3000).
 * 3. In static production web builds (dist/).
 * 4. In Electron desktop runtime on Windows (loaded via file:// protocol without absolute C:\ root failures).
 */

import bundledLogo from '../assets/smartmind-logo.png';

export const SMARTMIND_LOGO_IMAGE = bundledLogo;
export const SMARTMIND_LOGO_URL = bundledLogo || `${import.meta.env.BASE_URL}smartmind-logo.png`;
export const SMARTMIND_FALLBACK_LOGO_URL = `${import.meta.env.BASE_URL}smartmind-logo.png`;
export const SMARTMIND_FAVICON_URL = `${import.meta.env.BASE_URL}favicon.png`;
