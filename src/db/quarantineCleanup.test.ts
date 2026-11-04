import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDatabaseAdapter } from './adapters/memoryAdapter';
import {
  DbAuditEvent,
  DbPayment,
  DbSale,
  DbSaleItem,
  DbSyncQueueEntry,
} from './schema';
import {
  PRE_FIREBASE_QUARANTINE_REASON,
  PRE_FIREBASE_TEST_BUSINESS_ID,
  PRE_FIREBASE_TEST_SHOP_ID,
  SPECIFIED_PRE_FIREBASE_AUDIT_IDS,
  SPECIFIED_PRE_FIREBASE_SALE_IDS,
  SPECIFIED_PRE_FIREBASE_SYNC_IDS,
  auditLocalStorageAndIndexedDb,
  purgeQuarantinedPreFirebaseRecords,
} from '../services/liveFirestoreDataService';
import { User } from '../types/pos';
import { ROLE_DEFAULT_PERMISSIONS } from '../utils/posCalculations';
import {
  cleanLocalStorageResiduals,
  PurgeQuarantinedPreFirebaseSalesCriteria,
} from './databaseAdapter';

const platformAdminActor: User = {
  id: 'usr-platform-admin',
  businessId: 'PLATFORM',
  username: 'smartadmin',
  email: 'smartnwokolo@gmail.com',
  fullName: 'SmartMind Platform Admin',
  role: 'platform_admin',
  roleLabel: 'Platform Administrator',
  assignedShopIds: [],
  permissions: [],
  status: 'active',
  createdAt: '2026-10-24',
  lastLoginAt: '2026-10-27T08:00:00Z',
};

const cashierActor: User = {
  id: 'usr-cashier-01',
  businessId: 'biz-0003-u42w',
  username: 'cashier1',
  email: 'cashier@smartmind.ng',
  fullName: 'Cashier One',
  role: 'cashier',
  roleLabel: 'Cashier',
  assignedShopIds: ['shop-0005-9i6p'],
  permissions: [...ROLE_DEFAULT_PERMISSIONS.cashier],
  status: 'active',
  createdAt: '2026-10-24',
  lastLoginAt: '2026-10-27T08:00:00Z',
};

async function seedFourQuarantinedPreFirebaseRecords(adapter: MemoryDatabaseAdapter) {
  for (let i = 0; i < 4; i++) {
    const saleId = SPECIFIED_PRE_FIREBASE_SALE_IDS[i];
    const syncId = SPECIFIED_PRE_FIREBASE_SYNC_IDS[i];
    const auditId = SPECIFIED_PRE_FIREBASE_AUDIT_IDS[i];
    const receiptNum = `SM-TEST-000${i + 1}`;
    const amountKobo = (i + 1) * 1000000;

    const dbSale: DbSale = {
      id: saleId,
      shop_id: PRE_FIREBASE_TEST_SHOP_ID,
      business_id: PRE_FIREBASE_TEST_BUSINESS_ID,
      receipt_number: receiptNum,
      terminal_id: 'TERM-PRE-FIREBASE',
      cashier_user_id: 'usr-test',
      cashier_name: 'Test Cashier',
      created_at: `2026-10-24T14:1${i}:00.000Z`,
      subtotal_kobo: amountKobo,
      discount_amount_kobo: 0,
      tax_rate_percent: 0,
      tax_amount_kobo: 0,
      total_amount_kobo: amountKobo,
      amount_tendered_kobo: amountKobo,
      change_due_kobo: 0,
      payment_method: 'cash',
      status: 'completed',
      idempotency_key: `idem-${saleId}`,
      is_synced: 0,
      sync_conflict_reason: PRE_FIREBASE_QUARANTINE_REASON,
    };

    const dbItems: DbSaleItem[] = [
      {
        id: `sitem-${saleId}-1`,
        sale_id: saleId,
        shop_id: PRE_FIREBASE_TEST_SHOP_ID,
        business_id: PRE_FIREBASE_TEST_BUSINESS_ID,
        product_id: 'prd-test-01',
        sku: 'SKU-01',
        barcode: 'SKU-01',
        product_name: 'Pre-Firebase Item',
        unit: 'Unit',
        unit_price_kobo: amountKobo,
        cost_price_kobo: 500000,
        quantity: 1,
        line_total_kobo: amountKobo,
      },
    ];

    await adapter.saveSale(dbSale, dbItems);

    const syncEntry: DbSyncQueueEntry = {
      id: syncId,
      business_id: PRE_FIREBASE_TEST_BUSINESS_ID,
      shop_id: PRE_FIREBASE_TEST_SHOP_ID,
      entity_type: 'sale',
      entity_id: saleId,
      operation_type: 'create',
      payload_json: JSON.stringify({ sale: dbSale, items: dbItems }),
      created_at: `2026-10-24T14:1${i}:00.000Z`,
      retry_count: 0,
      status: 'quarantined',
      quarantine_reason: PRE_FIREBASE_QUARANTINE_REASON,
      quarantined_at: `2026-10-24T14:1${i}:00.000Z`,
    };
    await adapter.enqueueSync(syncEntry);

    const payment: DbPayment = {
      id: `pmt-${saleId}-1`,
      shop_id: PRE_FIREBASE_TEST_SHOP_ID,
      business_id: PRE_FIREBASE_TEST_BUSINESS_ID,
      reference_type: 'sale',
      reference_id: saleId,
      amount_kobo: amountKobo,
      payment_method: 'cash',
      recorded_by_user_id: 'usr-test',
      recorded_by_name: 'Test Cashier',
      created_at: `2026-10-24T14:1${i}:00.000Z`,
    };
    await adapter.savePayment(payment);

    const audit: DbAuditEvent = {
      id: auditId,
      business_id: PRE_FIREBASE_TEST_BUSINESS_ID,
      shop_id: PRE_FIREBASE_TEST_SHOP_ID,
      user_id: 'system-quarantine-guard',
      user_name: 'System Quarantine Guard',
      action: 'sync_entry_quarantined',
      entity_type: 'sale',
      entity_id: saleId,
      created_at: `2026-10-24T14:1${i}:00.000Z`,
    };
    await adapter.saveAuditEvent(audit);
  }
}

test('Quarantined Demo Records Purge: 1. Successful cleanup permanently removes all 4 records, items, payments, and audits', async () => {
  const adapter = new MemoryDatabaseAdapter();
  await adapter.initialize();
  await seedFourQuarantinedPreFirebaseRecords(adapter);

  // Pre-condition: audit shows 4 quarantined items
  const preReport = await auditLocalStorageAndIndexedDb(adapter);
  assert.equal(preReport.quarantinedSyncCount, 4);
  assert.equal(preReport.quarantinedSyncItems.length, 4);

  // Execute purge as platform admin
  const result = await purgeQuarantinedPreFirebaseRecords(platformAdminActor, adapter);

  assert.equal(result.success, true);
  assert.equal(result.purgedCounts.syncQueue, 4);
  assert.equal(result.purgedCounts.sales, 4);
  assert.equal(result.purgedCounts.saleItems, 4);
  assert.equal(result.purgedCounts.payments, 4);
  assert.equal(result.purgedCounts.auditEvents, 4);

  // Post-condition: audit shows 0 quarantined items
  const postReport = await auditLocalStorageAndIndexedDb(adapter);
  assert.equal(postReport.quarantinedSyncCount, 0);
  assert.equal(postReport.quarantinedSyncItems.length, 0);

  // Direct adapter checks
  for (const sid of SPECIFIED_PRE_FIREBASE_SALE_IDS) {
    const sale = await adapter.getSale(sid);
    assert.equal(sale, null, `Expected sale ${sid} to be deleted`);
    const items = await adapter.getSaleItems(sid);
    assert.equal(items.length, 0, `Expected items for ${sid} to be deleted`);
  }
  const queue = await adapter.getAllSyncQueue();
  assert.equal(queue.length, 0);
  const audits = await adapter.getAuditEvents(PRE_FIREBASE_TEST_BUSINESS_ID);
  assert.equal(audits.length, 0);
});

test('Quarantined Demo Records Purge: 2. Idempotent repeat execution succeeds safely with 0 deleted records', async () => {
  const adapter = new MemoryDatabaseAdapter();
  await adapter.initialize();
  await seedFourQuarantinedPreFirebaseRecords(adapter);

  // First purge
  const first = await purgeQuarantinedPreFirebaseRecords(platformAdminActor, adapter);
  assert.equal(first.success, true);
  assert.equal(first.isIdempotent, false);
  assert.equal(first.purgedCounts.syncQueue, 4);

  // Second purge immediately after
  const second = await purgeQuarantinedPreFirebaseRecords(platformAdminActor, adapter);
  assert.equal(second.success, true);
  assert.equal(second.isIdempotent, true);
  assert.equal(second.purgedCounts.syncQueue, 0);
  assert.equal(second.purgedCounts.sales, 0);
  assert.equal(second.purgedCounts.saleItems, 0);
  assert.equal(second.purgedCounts.payments, 0);
  assert.equal(second.purgedCounts.auditEvents, 0);

  const postReport = await auditLocalStorageAndIndexedDb(adapter);
  assert.equal(postReport.quarantinedSyncCount, 0);
});

test('Quarantined Demo Records Purge: 3. Aborts and reports mismatch if business ID does not match expected synthetic tenant', async () => {
  const adapter = new MemoryDatabaseAdapter();
  await adapter.initialize();

  // Seed with mismatched business_id
  const mismatchedSyncEntry: DbSyncQueueEntry = {
    id: SPECIFIED_PRE_FIREBASE_SYNC_IDS[0],
    business_id: 'biz-legitimate-live-01', // MISMATCH!
    shop_id: PRE_FIREBASE_TEST_SHOP_ID,
    entity_type: 'sale',
    entity_id: SPECIFIED_PRE_FIREBASE_SALE_IDS[0],
    operation_type: 'create',
    payload_json: '{}',
    created_at: '2026-10-24T14:00:00.000Z',
    retry_count: 0,
    status: 'quarantined',
    quarantine_reason: PRE_FIREBASE_QUARANTINE_REASON,
  };
  await adapter.enqueueSync(mismatchedSyncEntry);

  const result = await purgeQuarantinedPreFirebaseRecords(platformAdminActor, adapter);
  assert.equal(result.success, false);
  assert.ok(result.mismatches && result.mismatches.length > 0);
  assert.match(result.mismatches[0], /business_id/);
  assert.equal(result.purgedCounts.syncQueue, 0);

  // Ensure record was NOT deleted
  const queue = await adapter.getAllSyncQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].id, SPECIFIED_PRE_FIREBASE_SYNC_IDS[0]);
});

test('Quarantined Demo Records Purge: 4. Aborts and reports mismatch if shop ID does not match expected synthetic shop', async () => {
  const adapter = new MemoryDatabaseAdapter();
  await adapter.initialize();

  const mismatchedSyncEntry: DbSyncQueueEntry = {
    id: SPECIFIED_PRE_FIREBASE_SYNC_IDS[0],
    business_id: PRE_FIREBASE_TEST_BUSINESS_ID,
    shop_id: 'shop-legitimate-branch-99', // MISMATCH!
    entity_type: 'sale',
    entity_id: SPECIFIED_PRE_FIREBASE_SALE_IDS[0],
    operation_type: 'create',
    payload_json: '{}',
    created_at: '2026-10-24T14:00:00.000Z',
    retry_count: 0,
    status: 'quarantined',
    quarantine_reason: PRE_FIREBASE_QUARANTINE_REASON,
  };
  await adapter.enqueueSync(mismatchedSyncEntry);

  const result = await purgeQuarantinedPreFirebaseRecords(platformAdminActor, adapter);
  assert.equal(result.success, false);
  assert.ok(result.mismatches && result.mismatches.length > 0);
  assert.match(result.mismatches[0], /shop_id/);
  assert.equal(result.purgedCounts.syncQueue, 0);

  const queue = await adapter.getAllSyncQueue();
  assert.equal(queue.length, 1);
});

test('Quarantined Demo Records Purge: 5. Aborts and reports mismatch if status or quarantine reason does not match expected marker', async () => {
  const adapter = new MemoryDatabaseAdapter();
  await adapter.initialize();

  const mismatchedSyncEntry: DbSyncQueueEntry = {
    id: SPECIFIED_PRE_FIREBASE_SYNC_IDS[0],
    business_id: PRE_FIREBASE_TEST_BUSINESS_ID,
    shop_id: PRE_FIREBASE_TEST_SHOP_ID,
    entity_type: 'sale',
    entity_id: SPECIFIED_PRE_FIREBASE_SALE_IDS[0],
    operation_type: 'create',
    payload_json: '{}',
    created_at: '2026-10-24T14:00:00.000Z',
    retry_count: 0,
    status: 'pending', // NOT quarantined!
    quarantine_reason: undefined,
  };
  await adapter.enqueueSync(mismatchedSyncEntry);

  const result = await purgeQuarantinedPreFirebaseRecords(platformAdminActor, adapter);
  assert.equal(result.success, false);
  assert.ok(result.mismatches && result.mismatches.length > 0);
  assert.match(result.mismatches[0], /status\/reason/);
  assert.equal(result.purgedCounts.syncQueue, 0);

  const queue = await adapter.getAllSyncQueue();
  assert.equal(queue.length, 1);
});

test('Quarantined Demo Records Purge: 6. Unrelated live sales, queue entries, and audits are strictly preserved', async () => {
  const adapter = new MemoryDatabaseAdapter();
  await adapter.initialize();
  await seedFourQuarantinedPreFirebaseRecords(adapter);

  // Seed an unrelated real live sale and sync queue item
  const liveSale: DbSale = {
    id: 'sale-live-zenith-01',
    shop_id: 'shop-live-zenith-01',
    business_id: 'biz-live-zenith',
    receipt_number: 'ZEN-2026-001',
    terminal_id: 'TERM-ZEN-01',
    cashier_user_id: 'usr-cashier-zenith',
    cashier_name: 'Zenith Cashier',
    created_at: '2026-10-27T08:00:00Z',
    subtotal_kobo: 500000,
    discount_amount_kobo: 0,
    tax_rate_percent: 7.5,
    tax_amount_kobo: 37500,
    total_amount_kobo: 537500,
    amount_tendered_kobo: 600000,
    change_due_kobo: 62500,
    payment_method: 'pos_card',
    status: 'completed',
    is_synced: 1,
  };
  const liveItem: DbSaleItem = {
    id: 'sitem-live-01',
    sale_id: 'sale-live-zenith-01',
    shop_id: 'shop-live-zenith-01',
    business_id: 'biz-live-zenith',
    product_id: 'prod-live-01',
    sku: 'ZEN-SKU-01',
    barcode: 'ZEN-SKU-01',
    product_name: 'Zenith Organic Rice 5kg',
    unit: 'Bag',
    unit_price_kobo: 500000,
    cost_price_kobo: 400000,
    quantity: 1,
    line_total_kobo: 500000,
  };
  await adapter.saveSale(liveSale, [liveItem]);

  const liveQueue: DbSyncQueueEntry = {
    id: 'sync-sale-live-zenith-01',
    business_id: 'biz-live-zenith',
    shop_id: 'shop-live-zenith-01',
    entity_type: 'sale',
    entity_id: 'sale-live-zenith-01',
    operation_type: 'create',
    payload_json: JSON.stringify({ sale: liveSale }),
    created_at: '2026-10-27T08:00:00Z',
    retry_count: 0,
    status: 'pending',
  };
  await adapter.enqueueSync(liveQueue);

  // Run purge
  const res = await purgeQuarantinedPreFirebaseRecords(platformAdminActor, adapter);
  assert.equal(res.success, true);
  assert.equal(res.purgedCounts.sales, 4);
  assert.equal(res.purgedCounts.syncQueue, 4);

  // Verify live sale and live queue entry remain completely preserved
  const preservedSale = await adapter.getSale('sale-live-zenith-01');
  assert.ok(preservedSale, 'Live sale must remain intact');
  assert.equal(preservedSale.receipt_number, 'ZEN-2026-001');

  const preservedItems = await adapter.getSaleItems('sale-live-zenith-01');
  assert.equal(preservedItems.length, 1);
  assert.equal(preservedItems[0].product_name, 'Zenith Organic Rice 5kg');

  const remainingQueue = await adapter.getAllSyncQueue();
  assert.equal(remainingQueue.length, 1);
  assert.equal(remainingQueue[0].id, 'sync-sale-live-zenith-01');
});

test('Quarantined Demo Records Purge: 7. Linked sale items and payments are removed while unrelated items are preserved', async () => {
  const adapter = new MemoryDatabaseAdapter();
  await adapter.initialize();
  await seedFourQuarantinedPreFirebaseRecords(adapter);

  // Seed another unrelated payment and sale
  const otherPayment: DbPayment = {
    id: 'pmt-unrelated-99',
    shop_id: 'shop-unrelated',
    business_id: 'biz-unrelated',
    reference_type: 'sale',
    reference_id: 'sale-unrelated-99',
    amount_kobo: 99000,
    payment_method: 'bank_transfer',
    recorded_by_user_id: 'usr-unrelated',
    recorded_by_name: 'Unrelated User',
    created_at: '2026-10-27T08:00:00Z',
  };
  await adapter.savePayment(otherPayment);

  const res = await purgeQuarantinedPreFirebaseRecords(platformAdminActor, adapter);
  assert.equal(res.success, true);
  assert.equal(res.purgedCounts.payments, 4);

  // Unrelated payment must remain
  const otherPayments = await adapter.getPaymentsForReference('sale', 'sale-unrelated-99');
  assert.equal(otherPayments.length, 1);
  assert.equal(otherPayments[0].id, 'pmt-unrelated-99');
});

test('Quarantined Demo Records Purge: 8. Non-admin roles and unauthenticated users are rejected with UNAUTHORIZED error', async () => {
  const adapter = new MemoryDatabaseAdapter();
  await adapter.initialize();
  await seedFourQuarantinedPreFirebaseRecords(adapter);

  // Cashier attempt
  await assert.rejects(
    purgeQuarantinedPreFirebaseRecords(cashierActor, adapter),
    /UNAUTHORIZED/
  );

  // Inactive admin attempt
  const inactiveAdmin: User = {
    ...platformAdminActor,
    status: 'suspended',
  };
  await assert.rejects(
    purgeQuarantinedPreFirebaseRecords(inactiveAdmin, adapter),
    /UNAUTHORIZED/
  );

  // None of the records should have been deleted
  const queue = await adapter.getAllSyncQueue();
  assert.equal(queue.length, 4);
});

function createMockStorage(initialData: Record<string, string> = {}, failOnSet = false): Storage {
  const store = new Map<string, string>(Object.entries(initialData));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failOnSet) {
        throw new Error('QuotaExceededError: LocalStorage quota exceeded.');
      }
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

test('Quarantined Demo Records Purge: 9. Incomplete target set aborts before deletion and reports exact missing records', async () => {
  const adapter = new MemoryDatabaseAdapter();
  await adapter.initialize();
  await seedFourQuarantinedPreFirebaseRecords(adapter);

  // Remove one queue entry to simulate incomplete target set (3 present, 1 missing)
  const missingSyncId = SPECIFIED_PRE_FIREBASE_SYNC_IDS[3];
  adapter['syncQueue'] = adapter['syncQueue'].filter((e) => e.id !== missingSyncId);

  const result = await purgeQuarantinedPreFirebaseRecords(platformAdminActor, adapter);

  assert.equal(result.success, false);
  assert.equal(result.isIdempotent, false);
  assert.ok(result.missingRecords && result.missingRecords.length > 0);
  assert.ok(
    result.missingRecords.some((msg) => msg.includes(missingSyncId)),
    `Expected missing record list to include ${missingSyncId}`
  );
  assert.equal(result.purgedCounts.syncQueue, 0);
  assert.equal(result.purgedCounts.sales, 0);

  // Verify no records were deleted
  const remainingQueue = await adapter.getAllSyncQueue();
  assert.equal(remainingQueue.length, 3);
  for (const sid of SPECIFIED_PRE_FIREBASE_SALE_IDS) {
    const sale = await adapter.getSale(sid);
    assert.ok(sale, `Sale ${sid} must not be deleted when target set is incomplete`);
  }
});

test('Quarantined Demo Records Purge: 10. Malformed JSON in smartmind_pos_store_v2 is honestly reported as failed without swallowing error', async () => {
  const adapter = new MemoryDatabaseAdapter();
  await adapter.initialize();
  await seedFourQuarantinedPreFirebaseRecords(adapter);

  const mockStorage = createMockStorage({
    smartmind_pos_store_v2: 'INVALID_JSON_CORRUPTED_DATA{{{',
  });

  const result = await purgeQuarantinedPreFirebaseRecords(
    platformAdminActor,
    adapter,
    mockStorage
  );

  assert.equal(result.success, false);
  assert.equal(result.localStorageStatus, 'failed');
  assert.ok(result.localStorageError);
  assert.match(result.localStorageError, /JSON parse error in smartmind_pos_store_v2/);
});

test('Quarantined Demo Records Purge: 11. Storage write failure (QuotaExceededError) honestly reports failure and error reason', async () => {
  const adapter = new MemoryDatabaseAdapter();
  await adapter.initialize();
  await seedFourQuarantinedPreFirebaseRecords(adapter);

  // Storage containing one target sale residual, but setItem throws
  const mockStorage = createMockStorage(
    {
      smartmind_pos_store_v2: JSON.stringify({
        sales: [{ id: SPECIFIED_PRE_FIREBASE_SALE_IDS[0], total_amount: 1000 }],
      }),
    },
    true // failOnSet
  );

  const result = await purgeQuarantinedPreFirebaseRecords(
    platformAdminActor,
    adapter,
    mockStorage
  );

  assert.equal(result.success, false);
  assert.equal(result.localStorageStatus, 'failed');
  assert.ok(result.localStorageError);
  assert.match(result.localStorageError, /QuotaExceededError/);
});

test('Quarantined Demo Records Purge: 12. LocalStorage residual cleanup removes only target demo records and preserves unrelated records', () => {
  const mockStorage = createMockStorage({
    smartmind_pos_store_v2: JSON.stringify({
      sales: [
        { id: SPECIFIED_PRE_FIREBASE_SALE_IDS[0], receiptNumber: 'SM-TEST-0001' },
        { id: 'sale-live-zenith-01', receiptNumber: 'ZEN-2026-001' },
      ],
      saleItems: [
        { id: 'sitem-target-1', saleId: SPECIFIED_PRE_FIREBASE_SALE_IDS[0] },
        { id: 'sitem-live-1', saleId: 'sale-live-zenith-01', productName: 'Live Product' },
      ],
      payments: [
        { id: 'pmt-target-1', referenceType: 'sale', referenceId: SPECIFIED_PRE_FIREBASE_SALE_IDS[0] },
        { id: 'pmt-live-1', referenceType: 'sale', referenceId: 'sale-live-zenith-01', amount: 5000 },
      ],
      syncQueue: [
        { id: SPECIFIED_PRE_FIREBASE_SYNC_IDS[0], entityType: 'sale', entityId: SPECIFIED_PRE_FIREBASE_SALE_IDS[0] },
        { id: 'sync-live-1', entityType: 'sale', entityId: 'sale-live-zenith-01' },
      ],
      auditEvents: [
        { id: SPECIFIED_PRE_FIREBASE_AUDIT_IDS[0], entityType: 'sale', entityId: SPECIFIED_PRE_FIREBASE_SALE_IDS[0] },
        { id: 'aud-live-1', entityType: 'sale', entityId: 'sale-live-zenith-01' },
      ],
      invoices: [
        { id: 'inv-target-1', saleId: SPECIFIED_PRE_FIREBASE_SALE_IDS[0] },
        { id: 'inv-live-1', saleId: 'sale-live-zenith-01', invoiceNumber: 'INV-001' },
      ],
      debtTransactions: [
        { id: 'dt-target-1', saleId: SPECIFIED_PRE_FIREBASE_SALE_IDS[0] },
        { id: 'dt-live-1', referenceId: 'sale-live-zenith-01', balance: 0 },
      ],
      unrelatedSettings: {
        currency: 'NGN',
        taxRate: 7.5,
      },
    }),
  });

  const criteria: PurgeQuarantinedPreFirebaseSalesCriteria = {
    expectedBusinessId: PRE_FIREBASE_TEST_BUSINESS_ID,
    expectedShopId: PRE_FIREBASE_TEST_SHOP_ID,
    expectedQuarantineReason: PRE_FIREBASE_QUARANTINE_REASON,
    targetQueueIds: SPECIFIED_PRE_FIREBASE_SYNC_IDS,
    targetSaleIds: SPECIFIED_PRE_FIREBASE_SALE_IDS,
    targetAuditEventIds: SPECIFIED_PRE_FIREBASE_AUDIT_IDS,
  };

  const outcome = cleanLocalStorageResiduals(criteria, mockStorage);

  assert.equal(outcome.status, 'cleaned');
  assert.equal(outcome.residualsRemoved, 7);

  const rawAfter = mockStorage.getItem('smartmind_pos_store_v2');
  assert.ok(rawAfter, 'smartmind_pos_store_v2 root key must not be deleted');
  const parsed = JSON.parse(rawAfter);

  // Verify demo items removed
  assert.equal(parsed.sales.length, 1);
  assert.equal(parsed.sales[0].id, 'sale-live-zenith-01');

  assert.equal(parsed.saleItems.length, 1);
  assert.equal(parsed.saleItems[0].id, 'sitem-live-1');

  assert.equal(parsed.payments.length, 1);
  assert.equal(parsed.payments[0].id, 'pmt-live-1');

  assert.equal(parsed.syncQueue.length, 1);
  assert.equal(parsed.syncQueue[0].id, 'sync-live-1');

  assert.equal(parsed.auditEvents.length, 1);
  assert.equal(parsed.auditEvents[0].id, 'aud-live-1');

  assert.equal(parsed.invoices.length, 1);
  assert.equal(parsed.invoices[0].id, 'inv-live-1');

  assert.equal(parsed.debtTransactions.length, 1);
  assert.equal(parsed.debtTransactions[0].id, 'dt-live-1');

  // Verify unrelated object preserved
  assert.deepEqual(parsed.unrelatedSettings, { currency: 'NGN', taxRate: 7.5 });
});

test('Quarantined Demo Records Purge: 13. Simulated deletion failure rolls back database adapter state atomically', async () => {
  const adapter = new MemoryDatabaseAdapter();
  await adapter.initialize();
  await seedFourQuarantinedPreFirebaseRecords(adapter);

  // Induce a simulated runtime failure during deletion
  const origDelete = adapter['sales'].delete.bind(adapter['sales']);
  let callCount = 0;
  adapter['sales'].delete = (key: string) => {
    callCount++;
    if (callCount === 3) {
      throw new Error('SIMULATED_TRANSACTION_FAILURE: Disk write failed during deletion');
    }
    return origDelete(key);
  };

  await assert.rejects(
    purgeQuarantinedPreFirebaseRecords(platformAdminActor, adapter),
    /SIMULATED_TRANSACTION_FAILURE/
  );

  // Restore method and verify all records were restored by rollback catch block
  adapter['sales'].delete = origDelete;

  const queue = await adapter.getAllSyncQueue();
  assert.equal(queue.length, 4, 'All 4 sync queue items must remain intact after rollback');

  for (const sid of SPECIFIED_PRE_FIREBASE_SALE_IDS) {
    const sale = await adapter.getSale(sid);
    assert.ok(sale, `Sale ${sid} must be intact after rollback`);
    const items = await adapter.getSaleItems(sid);
    assert.equal(items.length, 1, `Items for ${sid} must be intact after rollback`);
  }

  const audits = await adapter.getAuditEvents(PRE_FIREBASE_TEST_BUSINESS_ID);
  assert.equal(audits.length, 4, 'All 4 audit events must remain intact after rollback');
});

test('Quarantined Demo Records Purge: 14. Non-sale payment with matching reference ID is preserved, and linked sale payment is removed', () => {
  const targetSaleId = SPECIFIED_PRE_FIREBASE_SALE_IDS[0];

  const mockStorage = createMockStorage({
    smartmind_pos_store_v2: JSON.stringify({
      payments: [
        {
          id: 'pmt-supplier-99',
          referenceType: 'supplier_payment',
          referenceId: targetSaleId, // Colliding ID with non-sale referenceType -> MUST be preserved
          amount: 250000,
        },
        {
          id: 'pmt-debt-88',
          reference_type: 'debt_settlement',
          reference_id: targetSaleId, // Colliding ID with non-sale reference_type -> MUST be preserved
          amount: 50000,
        },
        {
          id: 'pmt-target-sale',
          referenceType: 'sale',
          referenceId: targetSaleId, // Genuinely linked sale payment -> MUST be removed
          amount: 10000,
        },
      ],
    }),
  });

  const criteria: PurgeQuarantinedPreFirebaseSalesCriteria = {
    expectedBusinessId: PRE_FIREBASE_TEST_BUSINESS_ID,
    expectedShopId: PRE_FIREBASE_TEST_SHOP_ID,
    expectedQuarantineReason: PRE_FIREBASE_QUARANTINE_REASON,
    targetQueueIds: SPECIFIED_PRE_FIREBASE_SYNC_IDS,
    targetSaleIds: SPECIFIED_PRE_FIREBASE_SALE_IDS,
    targetAuditEventIds: SPECIFIED_PRE_FIREBASE_AUDIT_IDS,
  };

  const outcome = cleanLocalStorageResiduals(criteria, mockStorage);
  assert.equal(outcome.status, 'cleaned');
  assert.equal(outcome.residualsRemoved, 1);

  const rawAfter = mockStorage.getItem('smartmind_pos_store_v2')!;
  const parsed = JSON.parse(rawAfter);

  assert.equal(parsed.payments.length, 2);
  assert.ok(
    parsed.payments.some((p: any) => p.id === 'pmt-supplier-99'),
    'Supplier payment with colliding referenceId must be preserved'
  );
  assert.ok(
    parsed.payments.some((p: any) => p.id === 'pmt-debt-88'),
    'Debt settlement payment with colliding reference_id must be preserved'
  );
  assert.ok(
    !parsed.payments.some((p: any) => p.id === 'pmt-target-sale'),
    'Genuinely linked target sale payment must be removed'
  );
});

test('Quarantined Demo Records Purge: 15. Unrelated invoice whose own ID matches target sale ID without sale link is preserved, and linked invoice is removed', () => {
  const targetSaleId = SPECIFIED_PRE_FIREBASE_SALE_IDS[0];

  const mockStorage = createMockStorage({
    smartmind_pos_store_v2: JSON.stringify({
      invoices: [
        {
          id: targetSaleId, // Invoice own ID matches targetSaleId, but has NO matching sale link
          invoiceNumber: 'INV-COLLIDING-01',
          saleId: 'sale-live-unrelated-42',
          totalAmount: 150000,
        },
        {
          id: 'inv-regular-linked',
          invoiceNumber: 'INV-TARGET-02',
          saleId: targetSaleId, // Explicitly linked to target sale -> MUST be removed
          totalAmount: 80000,
        },
        {
          id: 'inv-target-snake',
          invoiceNumber: 'INV-TARGET-03',
          sale_id: targetSaleId, // Explicitly linked to target sale via sale_id -> MUST be removed
          totalAmount: 65000,
        },
      ],
    }),
  });

  const criteria: PurgeQuarantinedPreFirebaseSalesCriteria = {
    expectedBusinessId: PRE_FIREBASE_TEST_BUSINESS_ID,
    expectedShopId: PRE_FIREBASE_TEST_SHOP_ID,
    expectedQuarantineReason: PRE_FIREBASE_QUARANTINE_REASON,
    targetQueueIds: SPECIFIED_PRE_FIREBASE_SYNC_IDS,
    targetSaleIds: SPECIFIED_PRE_FIREBASE_SALE_IDS,
    targetAuditEventIds: SPECIFIED_PRE_FIREBASE_AUDIT_IDS,
  };

  const outcome = cleanLocalStorageResiduals(criteria, mockStorage);
  assert.equal(outcome.status, 'cleaned');
  assert.equal(outcome.residualsRemoved, 2);

  const rawAfter = mockStorage.getItem('smartmind_pos_store_v2')!;
  const parsed = JSON.parse(rawAfter);

  assert.equal(parsed.invoices.length, 1);
  assert.equal(
    parsed.invoices[0].id,
    targetSaleId,
    'Invoice with colliding own ID must be preserved'
  );
  assert.equal(parsed.invoices[0].invoiceNumber, 'INV-COLLIDING-01');
  assert.ok(
    !parsed.invoices.some((inv: any) => inv.id === 'inv-regular-linked'),
    'Genuinely linked invoice via saleId must be removed'
  );
  assert.ok(
    !parsed.invoices.some((inv: any) => inv.id === 'inv-target-snake'),
    'Genuinely linked invoice via sale_id must be removed'
  );
});

test('Quarantined Demo Records Purge: 16. Non-sale entities in sync queue, audit events, and debt transactions are preserved', () => {
  const targetSaleId = SPECIFIED_PRE_FIREBASE_SALE_IDS[0];
  const targetQueueId = SPECIFIED_PRE_FIREBASE_SYNC_IDS[0];
  const targetAuditId = SPECIFIED_PRE_FIREBASE_AUDIT_IDS[0];

  const mockStorage = createMockStorage({
    smartmind_pos_store_v2: JSON.stringify({
      syncQueue: [
        {
          id: 'sync-prod-colliding-01',
          entityType: 'product',
          entityId: targetSaleId, // Colliding ID, but entityType is product -> preserved
        },
        {
          id: targetQueueId, // Approved target queue ID -> MUST be removed
          entityType: 'sale',
          entityId: targetSaleId,
        },
      ],
      auditEvents: [
        {
          id: 'aud-user-login-colliding',
          entityType: 'user',
          entityId: targetSaleId, // Colliding ID, but entityType is user -> preserved
        },
        {
          id: targetAuditId, // Approved target audit ID -> MUST be removed
          entityType: 'sale',
          entityId: targetSaleId,
        },
      ],
      debtTransactions: [
        {
          id: 'dt-deposit-colliding',
          referenceType: 'customer_deposit',
          referenceId: targetSaleId, // Non-sale debt transaction -> preserved
          amount: 12000,
        },
        {
          id: 'dt-target-credit',
          saleId: targetSaleId, // Explicitly linked to target sale -> MUST be removed
          amount: 34000,
        },
      ],
    }),
  });

  const criteria: PurgeQuarantinedPreFirebaseSalesCriteria = {
    expectedBusinessId: PRE_FIREBASE_TEST_BUSINESS_ID,
    expectedShopId: PRE_FIREBASE_TEST_SHOP_ID,
    expectedQuarantineReason: PRE_FIREBASE_QUARANTINE_REASON,
    targetQueueIds: SPECIFIED_PRE_FIREBASE_SYNC_IDS,
    targetSaleIds: SPECIFIED_PRE_FIREBASE_SALE_IDS,
    targetAuditEventIds: SPECIFIED_PRE_FIREBASE_AUDIT_IDS,
  };

  const outcome = cleanLocalStorageResiduals(criteria, mockStorage);
  assert.equal(outcome.status, 'cleaned');
  assert.equal(outcome.residualsRemoved, 3);

  const rawAfter = mockStorage.getItem('smartmind_pos_store_v2')!;
  const parsed = JSON.parse(rawAfter);

  assert.equal(parsed.syncQueue.length, 1);
  assert.equal(parsed.syncQueue[0].id, 'sync-prod-colliding-01');

  assert.equal(parsed.auditEvents.length, 1);
  assert.equal(parsed.auditEvents[0].id, 'aud-user-login-colliding');

  assert.equal(parsed.debtTransactions.length, 1);
  assert.equal(parsed.debtTransactions[0].id, 'dt-deposit-colliding');
});
