import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // Only suppress HMR websocket errors if explicitly requested in container sandbox
  const disableHmr = process.env.VITE_DISABLE_HMR === 'true';

  let stagingEnv: Record<string, string> = {};
  if (mode === 'staging') {
    const stagingPath = path.resolve(__dirname, '.env.staging');
    if (fs.existsSync(stagingPath)) {
      stagingEnv = dotenv.parse(fs.readFileSync(stagingPath, 'utf8'));
      // In staging mode, override any ambient container/host process.env variables
      // to ensure staging credentials strictly take precedence over production
      for (const [key, value] of Object.entries(stagingEnv)) {
        process.env[key] = value;
      }
    }
  }

  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.png', 'smartmind-logo.png'],
        manifest: {
          id: '/',
          name: 'SmartMind POS — Multi-Shop Point of Sale System',
          short_name: 'SmartMind',
          description:
            'Commercial multi-shop Point of Sale desktop application foundation with shop-isolated inventory, POS terminal, sales history, reporting, and offline sync status architecture.',
          theme_color: '#059669',
          background_color: '#f8fafc',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/favicon.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/smartmind-logo.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          globIgnores: ['**/*.zip', '**/*.tar.gz'],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    define:
      mode === 'staging'
        ? Object.fromEntries(
            Object.entries(stagingEnv).map(([k, v]) => [
              `import.meta.env.${k}`,
              JSON.stringify(v),
            ])
          )
        : {},
    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(__dirname, '.') },
        ...(mode === 'staging'
          ? [
              {
                find: /.*firebase-applet-config\.json$/,
                replacement: path.resolve(
                  __dirname,
                  'src/config/staging-applet-config.json'
                ),
              },
            ]
          : []),
      ],
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      ...(disableHmr ? { hmr: false, watch: null } : {}),
    },
  };
});

