# SmartMind POS — Google Desktop OAuth token-exchange fix

## What this patch changes

- Updates only `electron/main.ts`.
- Reads the Google Desktop OAuth client secret from the local process environment variable `SMARTMIND_GOOGLE_CLIENT_SECRET`.
- Adds that value to Google's authorization-code token exchange request.
- Keeps the existing loopback callback, state validation, PKCE, Firebase ID-token credential exchange, and renderer boundary unchanged.
- Fails before opening the browser if the local variable is missing.

No Firebase rules, Functions, Firestore data, production configuration, or database files are changed.

## Apply the patch

1. Close SmartMind POS and stop any running Vite/Electron processes.
2. Back up the project folder.
3. Extract the included `electron/main.ts` into the project, replacing the existing file at `electron/main.ts`.
4. Do not copy any client secret into this patch or into source code.

## Configure the secret locally for a test

Google Cloud's client page in the supplied screenshot masks the existing secret and says it can no longer be viewed or downloaded. If you did not save the original secret when it was created, create/rotate a new client secret from that same Desktop OAuth client. Do not create a new OAuth client.

For a one-session test in PowerShell, set the variable in the same PowerShell window you will use to launch SmartMind POS:

```powershell
$env:SMARTMIND_GOOGLE_CLIENT_SECRET = Read-Host "Paste the Desktop OAuth client secret"
npm.cmd run electron:start
```

The value is not echoed by `Read-Host`? PowerShell's standard `Read-Host` displays input. For less visible entry, use:

```powershell
$secure = Read-Host "Desktop OAuth client secret" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:SMARTMIND_GOOGLE_CLIENT_SECRET = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  Remove-Variable secure, ptr
}
npm.cmd run electron:start
```

This sets the variable only for that PowerShell process and child processes. Close the window after testing. Do not paste the secret into chat, a source file, `.env` committed to Git, or a ZIP.

## Security limitation

A desktop app is a public OAuth client. Any shared client secret delivered to a user's computer can ultimately be extracted by that user or malware with access to the account. The environment variable is a local development/test workaround, not a secure production secret-storage design. Before distributing SmartMind POS, reassess the OAuth flow against Google's current installed-app guidance and do not ship a shared client secret in the installer.

## Validate after applying

Run these from the project directory:

```powershell
npm.cmd run lint
npm.cmd run typecheck:electron
npm.cmd run build:desktop
npm.cmd run build:electron
npm.cmd test
```

Only if all checks pass, launch the app using the PowerShell session where the environment variable was set, then test Google sign-in. This patch has not been executed against your local Windows environment; report the exact error if a test fails.
