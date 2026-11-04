# SmartMind POS — Email/Password Authentication Only

This patch removes Google sign-in from the SmartMind POS login UI and removes the Electron Google OAuth implementation.

## Preserved
- Firebase Email/Password sign-in (`signInWithEmailAndPassword`).
- Firebase password reset email (`sendPasswordResetEmail`).
- Existing Firebase auth state, sign-out, user profiles, roles, permissions, Firestore rules, and Cloud Functions.
- Isolated Demo Mode and its existing role-evaluation behavior.
- Electron window controls and desktop metadata IPC.

## Removed
- Google sign-in button and handler.
- Firebase Google popup/credential imports and provider instance.
- Electron Google OAuth callback server, PKCE flow, token exchange, and `smartmind:auth-google` IPC bridge.
- Google sign-in method from the central Electron TypeScript API.

## Apply
1. Close SmartMind POS.
2. Back up the current project folder.
3. Extract this ZIP into the project folder, preserving the folder paths and allowing these five files to be replaced:
   - `src/pages/LoginPage.tsx`
   - `src/firebase.ts`
   - `electron/main.ts`
   - `electron/preload.ts`
   - `src/types/electron.d.ts`
4. No OAuth secret is required. You can close the PowerShell window where `SMARTMIND_GOOGLE_CLIENT_SECRET` was set.
5. Run the validation commands below in a new PowerShell window.

```powershell
npm.cmd run lint
npm.cmd run typecheck:electron
npm.cmd run build:desktop
npm.cmd run build:electron
npm.cmd test
```

If all pass, start the app with `npm.cmd run electron:start`.

## Firebase Console
This patch does not disable Firebase Authentication or change the Email/Password provider. Keep Email/Password enabled in Firebase Console. Google provider may be disabled later in Firebase Console after confirming no other application depends on it.

## Important
The patch is based on the project ZIP supplied for review and the Google OAuth patch prepared in this conversation. It has not been run against the user's Windows project. Run all validation commands before using it. It does not deploy or modify Firebase remotely.
