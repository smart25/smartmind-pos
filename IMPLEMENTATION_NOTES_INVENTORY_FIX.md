# SmartMind POS — Inventory Sync Patch Notes

## Included changes

1. `src/services/cloudBackendService.ts`
   - Adds `processFirebaseSyncOperation()`, which calls the authenticated `syncPosOperation` Firebase callable.
   - Does not send a client-claimed actor identity; the callable uses Firebase Auth.

2. `src/services/cloudSyncService.ts` and `src/App.tsx`
   - Live app queue processing now uses the Firebase callable path.
   - The in-memory backend remains available as the default for deterministic tests/demo usage.

3. `functions/src/index.ts`
   - Inventory movement synchronization now reads the current cloud product inside the same Firestore transaction.
   - Applies the signed movement delta to the current cloud stock rather than trusting offline `previous_quantity` / `new_quantity` snapshots.
   - Writes the updated product, movement ledger, and idempotency acknowledgement in the transaction.
   - Rejects invalid movements and stock underflow as a review conflict.

4. `src/services/inventoryMovementService.ts` and `src/App.tsx`
   - Live manual stock adjustments now use a local database transaction.
   - The transaction updates product stock, records the inventory movement and audit event, and enqueues a durable cloud operation.
   - UI state is updated only after the local transaction succeeds.
   - Demo mode retains its previous demo calculation path.

5. `src/App.tsx`
   - Live receipt returns are temporarily blocked with an explicit message. The current data model does not yet have a durable return ledger or safe partial-return idempotency. Allowing the previous state-only implementation to run in live mode could restore stock more than once after refresh.

## Validation

- Cloud Functions TypeScript check passed with `tsc -p functions/tsconfig.json --noEmit`.
- Root application type-check/build and app tests were not completed: root dependencies could not be installed within the available time, and the root type-check reports missing `vite/client` because `node_modules` is incomplete.
- No Firebase deploy, Firestore write, production data mutation, or staging data mutation was performed.

## Important remaining work

- Implement durable receipt/return and returned-line records with transaction-level duplicate-return protection.
- Update local StockAdjustment display status when its corresponding sync queue entry is acknowledged.
- Add automated tests for inventory transaction rollback, offline replay, concurrent adjustments, idempotent replays, and stock conflicts.
- Run root `npm ci`, `npm run lint`, `npm test`, and `npm run build` on the user's supported Node version before deployment.
