import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDatabaseAdapter } from '../db/adapters/memoryAdapter';
import { CloudBackendService } from './cloudBackendService';
import { CloudSyncService } from './cloudSyncService';
import type { User } from '../types/pos';

test('sale_return remains pending and never reaches the generic cloud sync endpoint', async () => {
  const adapter = new MemoryDatabaseAdapter();
  await adapter.initialize();

  const payload = JSON.stringify({
    returnId: 'return-test-001',
    originalSaleId: 'sale-test-001',
    reason: 'Customer returned an item',
  });

  await adapter.enqueueSync({
    id: 'sync-return-test-001',
    business_id: 'biz-test-001',
    shop_id: 'shop-test-001',
    entity_type: 'sale_return',
    entity_id: 'return-test-001',
    operation_type: 'create',
    payload_json: payload,
    created_at: '2026-11-11T07:30:00.000Z',
    retry_count: 0,
    status: 'pending',
    idempotency_key: 'idem-return-test-001',
    schema_version: 1,
    actor_user_id: 'manager-test-001',
  });

  const actor: User = {
    id: 'manager-test-001',
    businessId: 'biz-test-001',
    username: 'testmanager',
    email: 'manager@example.test',
    fullName: 'Test Manager',
    role: 'shop_manager',
    roleLabel: 'Shop Manager',
    assignedShopIds: ['shop-test-001'],
    permissions: [],
    status: 'active',
    createdAt: '2026-11-11T07:00:00.000Z',
    lastLoginAt: '2026-11-11T07:00:00.000Z',
  };

  const cloudBackend = new CloudBackendService();
  let genericEndpointCalls = 0;

  Object.defineProperty(cloudBackend, 'processSyncOperation', {
    configurable: true,
    value: async () => {
      genericEndpointCalls += 1;
      throw new Error('A sale_return must not reach the generic sync endpoint.');
    },
  });

  const syncService = new CloudSyncService(adapter, cloudBackend);

  const summary = await syncService.syncPendingOperations(actor, {
    shopId: 'shop-test-001',
  });

  const queue = await adapter.getAllSyncQueue(
    'shop-test-001',
    'biz-test-001'
  );

  const savedReturn = queue.find(
    (entry) => entry.id === 'sync-return-test-001'
  );

  assert.equal(genericEndpointCalls, 0);
  assert.equal(summary.processedCount, 0);
  assert.equal(summary.syncedCount, 0);
  assert.ok(savedReturn, 'The return queue entry must still exist.');
  assert.equal(savedReturn.status, 'pending');
  assert.equal(savedReturn.payload_json, payload);
  assert.equal(savedReturn.retry_count, 0);
  assert.equal(savedReturn.idempotency_key, 'idem-return-test-001');
});
