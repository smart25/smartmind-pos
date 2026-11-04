# SmartMind POS — Staging Administrator Bootstrap & Firestore Isolation Fix

## Scope
This patch prepares the current source archive for staging-only local validation. It does not deploy to Firebase and does not create or modify any live Firebase records.

## Changes
1. Added `src/utils/platformAdminEnvironment.ts` with fail-closed mapping:
   - `smartmind-pos-staging` -> `smart@smartmindconcept.com`
   - `gen-lang-client-0985802946` -> `smartnwokolo@gmail.com`
2. Updated the live Firestore onboarding service to resolve the active bootstrap identity from `firebaseConfig.projectId`.
3. Reserved both administrator identities from tenant-owner and tenant-staff assignment paths in the frontend validation/service layers.
4. Added `firestore.staging.rules`, cloned from the existing production rules with only the bootstrap administrator email changed to the staging email. The verified-email requirement and remaining rule logic are preserved.
5. Updated `firebase.staging.json` to use `firestore.staging.rules`. `firebase.production.json` continues to use the original `firestore.rules`.
6. Updated Cloud Functions to resolve the expected Firestore database from trusted runtime project configuration:
   - staging -> `(default)`
   - production -> `ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4`
   The four affected handlers now validate against the resolved environment database.
7. Made the backend Platform Administrator identity environment-specific. The staging admin is accepted only in the staging project; the production admin remains the production identity.
8. Updated Cloud Functions manifests to report the active project/database rather than always reporting production.
9. Added unit/static tests for project-to-admin mapping, database isolation, fail-closed unknown projects, and separate staging/production rules configuration.

## Validation performed in this workspace
- Static configuration/rules isolation checks: PASS.
- Executed transpiled backend resolver checks for staging and production: PASS.
- Executed backend database guard checks for correct and cross-environment database IDs: PASS.
- Executed transpiled frontend administrator mapping/reserved identity checks: PASS.
- TypeScript syntax parsing of changed TypeScript files: no syntax diagnostics.
- Type-checked `functions/src/core.ts` and `functions/src/index.ts` with the available global TypeScript compiler and minimal Node globals: PASS.

## Validation not completed here
A full `npm test`, frontend `npm run lint` / `npm run build:staging`, Functions dependency-backed build, and Firebase Rules compiler/emulator validation were not completed. Dependency installation timed out in this environment; its Node.js runtime is 22.16.0 while the current Firebase web packages in this project require Node.js >=24.12.0. The user's Windows environment previously reported Node.js 24.22.1 and is the appropriate place to run the full project checks.

## Deployment restriction
No Firebase deployment commands were run. Do not deploy until the user separately approves. The staging deploy config is now pointed at `firestore.staging.rules`; production config and production rules remain unchanged.
