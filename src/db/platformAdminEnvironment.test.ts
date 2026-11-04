import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import {
  getBootstrapPlatformAdminEmail,
  PRODUCTION_FIREBASE_PROJECT_ID,
  STAGING_FIREBASE_PROJECT_ID,
  PRODUCTION_BOOTSTRAP_PLATFORM_ADMIN_EMAIL,
  STAGING_BOOTSTRAP_PLATFORM_ADMIN_EMAIL,
} from '../utils/platformAdminEnvironment';

test('staging project authorizes only the staging bootstrap administrator identity', () => {
  assert.equal(
    getBootstrapPlatformAdminEmail(STAGING_FIREBASE_PROJECT_ID),
    'smart@smartmindconcept.com'
  );
  assert.equal(
    STAGING_BOOTSTRAP_PLATFORM_ADMIN_EMAIL,
    'smart@smartmindconcept.com'
  );
});

test('production project retains the existing production bootstrap administrator identity', () => {
  assert.equal(
    getBootstrapPlatformAdminEmail(PRODUCTION_FIREBASE_PROJECT_ID),
    'smartnwokolo@gmail.com'
  );
  assert.equal(
    PRODUCTION_BOOTSTRAP_PLATFORM_ADMIN_EMAIL,
    'smartnwokolo@gmail.com'
  );
});

test('unknown Firebase projects cannot resolve a bootstrap administrator identity', () => {
  assert.throws(
    () => getBootstrapPlatformAdminEmail('unrecognized-project'),
    /UNKNOWN_PROJECT_CONFIGURATION/
  );
});


test('Firebase deployment configs keep staging rules isolated from production rules', () => {
  const stagingConfig = JSON.parse(
    readFileSync(resolve(process.cwd(), 'firebase.staging.json'), 'utf8')
  );
  const productionConfig = JSON.parse(
    readFileSync(resolve(process.cwd(), 'firebase.production.json'), 'utf8')
  );
  const stagingRules = readFileSync(
    resolve(process.cwd(), stagingConfig.firestore.rules),
    'utf8'
  );
  const productionRules = readFileSync(
    resolve(process.cwd(), productionConfig.firestore.rules),
    'utf8'
  );

  assert.equal(stagingConfig.firestore.database, '(default)');
  assert.equal(stagingConfig.firestore.rules, 'firestore.staging.rules');
  assert.equal(productionConfig.firestore.database, 'ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4');
  assert.equal(productionConfig.firestore.rules, 'firestore.rules');
  assert.ok(stagingRules.includes('smart@smartmindconcept.com'));
  assert.ok(!stagingRules.includes('smartnwokolo@gmail.com'));
  assert.ok(productionRules.includes('smartnwokolo@gmail.com'));
  assert.ok(!productionRules.includes('smart@smartmindconcept.com'));
});
