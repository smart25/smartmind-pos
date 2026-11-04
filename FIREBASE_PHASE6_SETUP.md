# SmartMind POS — Phase 6: Firebase Cloud Backend, Authentication & Multi-Shop Synchronization Setup

## 1. Runtime & Provisioned Status
- **Provisioned Project ID**: `gen-lang-client-0985802946` (configured in `/firebase-applet-config.json` with environment variable overrides in `.env.example`).
- **Firestore Database ID**: `ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4`.
- **Firestore Security Rules (`firestore.rules`)**: Validated with `@firebase/eslint-plugin-security-rules` and deployed to the provisioned Firestore database.
- **Browser Local Storage Adapter**: `IndexedDbDatabaseAdapter` (`indexeddb-browser-dev`) is active in the browser preview runtime; `MemoryDatabaseAdapter` (`in-memory-test`) is used in automated Node test suites.
- **Windows Desktop SQLite Adapter**: `SqliteDesktopDatabaseAdapter` (`sqlite-electron-desktop`) and `src/db/sqliteSchema.sql` are implemented as typed contracts, awaiting Electron packaging (`electron` and `better-sqlite3` are not installed in this web container).

---

## 2. Environment Configuration
The application reads Firebase client credentials from `/firebase-applet-config.json` first and allows overriding any value via Vite environment variables (`.env` / `.env.local`):

```dotenv
VITE_FIREBASE_API_KEY="..."
VITE_FIREBASE_AUTH_DOMAIN="..."
VITE_FIREBASE_PROJECT_ID="..."
VITE_FIREBASE_STORAGE_BUCKET="..."
VITE_FIREBASE_MESSAGING_SENDER_ID="..."
VITE_FIREBASE_APP_ID="..."
VITE_FIREBASE_FIRESTORE_DATABASE_ID="..."
VITE_USE_FIREBASE_EMULATORS="false"
```

> **Security Note**: Client-side Firebase configuration only identifies the Firebase project and is **never** a substitute for security rules. All data access is enforced by `firestore.rules` and server-side validation. Never place Firebase Admin SDK service-account private keys in frontend code or `VITE_*` variables.

---

## 3. Firebase Console & Service Setup Guide

### A. Firebase Authentication
1. Open the Firebase Console -> **Build** -> **Authentication** -> **Sign-in method**.
2. Enable **Email/Password** (for staff, shop managers, business owners, and password-reset emails via `sendPasswordResetEmail`).
3. Enable **Google** Sign-In provider (for verified 1-click sign-in via `signInWithPopup`).
4. Under **Settings** -> **Authorized domains**, ensure your preview/production domain and `localhost` are listed.

### B. Cloud Firestore
1. Open **Build** -> **Firestore Database**.
2. Verify database `ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4` is provisioned.
3. Collection hierarchy enforced by `/firebase-blueprint.json` and `/firestore.rules`:
   - `/users/{userId}` — User profile, role, `businessId`, `assignedShopIds`, `permissions`, `status`.
   - `/businesses/{businessId}` — Tenant registry and primary owner binding (`ownerUserId`).
   - `/businesses/{businessId}/shops/{shopId}` — Individual retail branches.
   - `/businesses/{businessId}/shops/{shopId}/products/{productId}` — Shop-isolated product catalogue and stock balance.
   - `/businesses/{businessId}/shops/{shopId}/sales/{saleId}` — Historical POS sales and receipt snapshots.
   - `/businesses/{businessId}/shops/{shopId}/sync_operations/{operationId}` — Idempotency ledger and server acknowledgements.
   - `/businesses/{businessId}/audit_events/{eventId}` — Immutable security and operational audit trail.

### C. Cloud Functions (`/functions/src/index.ts`)
- **Billing Prerequisite**: Deploying Firebase Cloud Functions (2nd Gen / Node.js) requires upgrading the Firebase project to the **Blaze (Pay-as-you-go)** billing plan in the Firebase Console.
- Reference Cloud Functions are provided in `/functions/src/index.ts`:
  - `provisionBusinessAndPrimaryOwner`: Enforces Platform Administrator caller identity, single-primary-owner invariant, idempotency, and audit logging.
  - `inviteAuthorizedStaff`: Allows a Business Owner or Platform Admin to provision Shop Managers and Cashiers bound to explicit `assignedShopIds`.
  - `setTenantStatus`: Allows a Platform Admin to suspend or reactivate a business.
  - `syncShopOperation`: Processes queued offline operations idempotently inside a Firestore transaction, validating current stock and flagging `conflict_requires_review` on concurrent final-unit stock exhaustion.

### D. Firebase Emulator Suite (Local Development)
To test against local Firebase Emulators:
1. Install Firebase CLI: `npm install -g firebase-tools`
2. Run: `firebase emulators:start --only auth,firestore,functions`
3. Set `VITE_USE_FIREBASE_EMULATORS="true"` in `.env.local`.
