# SmartMind POS — Google Desktop OAuth patch

## Included changes
- Electron main process: loopback callback on 127.0.0.1, OAuth state validation, PKCE (S256), system-browser authorization and token exchange.
- Electron preload: exposes only `signInWithGoogle()`.
- Renderer declarations: central `SmartmindDesktopApi` and SQLite bridge type.
- Firebase: exports `signInWithCredential` and `GoogleAuthProvider`.
- Login page: uses the desktop OAuth flow in Electron and preserves `signInWithPopup` in ordinary browsers.

## Before testing
1. Ensure the OAuth client is the Google Cloud **Desktop app** client associated with the same Google Cloud project as Firebase Authentication.
2. Ensure the OAuth consent screen is configured and your Google account is allowed to sign in (if the app is in Testing, add the account as a test user).
3. Confirm Google is enabled in Firebase Authentication.
4. Do not create or embed a client secret. This implementation uses PKCE and the public Desktop client ID.
5. Do not deploy Firebase rules or Functions for this change.

## Apply safely
1. Close SmartMind POS and stop any running Vite/Electron processes.
2. Back up the current project folder.
3. Extract this patch ZIP over the matching project folder, allowing replacement of the seven listed source files only.
4. From PowerShell in the project folder, run:

```powershell
npm.cmd run lint
npm.cmd run typecheck:electron
npm.cmd run build:desktop
npm.cmd run build:electron
npm.cmd test
```

5. If all checks pass, launch:

```powershell
npm.cmd run electron:start
```

6. Test Google sign-in in Electron. The system browser should open. Complete Google authentication and return to SmartMind POS.

## Security notes
- The OAuth client ID is public; no client secret is included.
- PKCE verifier and OAuth state remain in Electron's main process.
- The renderer receives only the Google ID token, which is exchanged with Firebase Auth.
- The Firebase user still passes through the existing `onAuthenticatedFirebase` callback and application profile/role resolution.
- This patch does not modify Firestore rules, Cloud Functions, Firebase data, or production deployment settings.

## Troubleshooting
- `redirect_uri_mismatch`: verify the credential is an OAuth client of type Desktop app; do not use a Web application client ID.
- `access_blocked` / app not configured: review Google Auth Platform branding, audience, and test users.
- Firebase `auth/invalid-credential`: verify Google sign-in is enabled in the Firebase project corresponding to the app's `firebaseConfig`.
- If the browser says sign-in completed but the app times out, check local firewall/security software for localhost loopback restrictions.
