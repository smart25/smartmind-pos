import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pkg = require('./package.json');

function stagingAdminAuthPlugin(): Plugin {
  return {
    name: 'staging-admin-auth-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0];
        if (
          url !== '/api/staging-admin/create-staff-account' &&
          url !== '/api/staging-admin/reset-password'
        ) {
          return next();
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }

        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });

        req.on('end', async () => {
          try {
            const data = JSON.parse(body || '{}');
            const email = (data.email || '').trim().toLowerCase();
            const password = (data.password || '').trim();
            const fullName = (data.fullName || '').trim() || email.split('@')[0];

            if (!email || !password) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Email and password are required.' }));
              return;
            }

            if (password.length < 6) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  error: 'Password must be at least 6 characters long.',
                })
              );
              return;
            }

            const candidatePaths = [
              process.env.STAGING_FIREBASE_SERVICE_ACCOUNT_PATH,
              'C:\\Users\\smart\\Desktop\\.secrets\\smartmind-pos-staging-firebase-adminsdk-fbsvc-9a9b060f48.json',
            ];
            const credPath = candidatePaths.find((p) => p && fs.existsSync(p));
            if (!credPath) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  error:
                    'Staging service account credentials not found on host machine.',
                })
              );
              return;
            }

            const requireFromRepo = createRequire(import.meta.url);
            const functionsDir = path.join(__dirname, 'functions');
            const resolveFromFunctions = (subpath: string) =>
              requireFromRepo.resolve(subpath, { paths: [functionsDir, __dirname] });

            const adminAppModule = requireFromRepo(
              resolveFromFunctions('firebase-admin/app')
            );
            const adminAuthModule = requireFromRepo(
              resolveFromFunctions('firebase-admin/auth')
            );

            const serviceAccountJson = JSON.parse(fs.readFileSync(credPath, 'utf8'));
            if (serviceAccountJson.project_id !== 'smartmind-pos-staging') {
              res.statusCode = 403;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  error: 'Refusing to use non-staging service account.',
                })
              );
              return;
            }

            const appName = 'smartmind-staging-admin-auth-handler';
            let adminApp = adminAppModule
              .getApps()
              .find((a: any) => a.name === appName);
            if (!adminApp) {
              adminApp = adminAppModule.initializeApp(
                {
                  credential: adminAppModule.cert(serviceAccountJson),
                  projectId: 'smartmind-pos-staging',
                },
                appName
              );
            }

            const auth = adminAuthModule.getAuth(adminApp);

            let authUser: any;
            let isExistingAuthUser = false;
            try {
              authUser = await auth.getUserByEmail(email);
              isExistingAuthUser = true;
              await auth.updateUser(authUser.uid, {
                password,
                displayName: fullName,
                emailVerified: true,
              });
            } catch (err: any) {
              if (err?.code === 'auth/user-not-found') {
                authUser = await auth.createUser({
                  email,
                  password,
                  displayName: fullName,
                  emailVerified: true,
                });
              } else {
                throw err;
              }
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                ok: true,
                uid: authUser.uid,
                email: authUser.email,
                isExistingAuthUser,
              })
            );
          } catch (serverErr: any) {
            console.error('Staging Admin Auth Middleware Error:', serverErr);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error:
                  serverErr?.message ||
                  'Internal server error while provisioning staff auth.',
              })
            );
          }
        });
      });
    },
  };
}

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
        registerType: 'autoUpdate',
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
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          globIgnores: ['**/*.zip', '**/*.tar.gz'],
        },
        devOptions: {
          enabled: false,
        },
      }),
      stagingAdminAuthPlugin(),
    ],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version || '1.0.0'),
      ...(mode === 'staging'
        ? Object.fromEntries(
            Object.entries(stagingEnv).map(([k, v]) => [
              `import.meta.env.${k}`,
              JSON.stringify(v),
            ])
          )
        : {}),
    },
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

