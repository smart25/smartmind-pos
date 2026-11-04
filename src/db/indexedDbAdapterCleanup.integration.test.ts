import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { IndexedDbDatabaseAdapter } from './adapters/indexedDbAdapter';
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
} from '../services/liveFirestoreDataService';
import { PurgeQuarantinedPreFirebaseSalesCriteria } from './databaseAdapter';

const TEST_DB_NAME = 'smartmind_pos_cleanup_integration_test_db';

function getStandardCriteria(): PurgeQuarantinedPreFirebaseSalesCriteria {
  return {
    expectedBusinessId: PRE_FIREBASE_TEST_BUSINESS_ID,
    expectedShopId: PRE_FIREBASE_TEST_SHOP_ID,
    expectedQuarantineReason: PRE_FIREBASE_QUARANTINE_REASON,
    targetQueueIds: SPECIFIED_PRE_FIREBASE_SYNC_IDS,
    targetSaleIds: SPECIFIED_PRE_FIREBASE_SALE_IDS,
    targetAuditEventIds: SPECIFIED_PRE_FIREBASE_AUDIT_IDS,
  };
}

async function seedQuarantinedRecordsInIndexedDb(adapter: IndexedDbDatabaseAdapter): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const saleId = SPECIFIED_PRE_FIREBASE_SALE_IDS[i];
    const syncId = SPECIFIED_PRE_FIREBASE_SYNC_IDS[i];
    const auditId = SPECIFIED_PRE_FIREBASE_AUDIT_IDS[i];
    const amountKobo = (i + 1) * 1000000;

    const sale: DbSale = {
      id: saleId,
      shop_id: PRE_FIREBASE_TEST_SHOP_ID,
      business_id: PRE_FIREBASE_TEST_BUSINESS_ID,
      receipt_number: `SM-IDB-TEST-00${i + 1}`,
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

    const items: DbSaleItem[] = [
      {
        id: `sitem-${saleId}-1`,
        sale_id: saleId,
        shop_id: PRE_FIREBASE_TEST_SHOP_ID,
        business_id: PRE_FIREBASE_TEST_BUSINESS_ID,
        product_id: 'prd-test-01',
        sku: 'SKU-01',
        barcode: 'SKU-01',
        product_name: 'Quarantined Item',
        unit: 'Unit',
        unit_price_kobo: amountKobo,
        cost_price_kobo: 500000,
        quantity: 1,
        line_total_kobo: amountKobo,
      },
    ];

    await adapter.saveSale(sale, items);

    const payment: DbPayment = {
      id: `pmt-${saleId}`,
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

    const syncEntry: DbSyncQueueEntry = {
      id: syncId,
      business_id: PRE_FIREBASE_TEST_BUSINESS_ID,
      shop_id: PRE_FIREBASE_TEST_SHOP_ID,
      entity_type: 'sale',
      entity_id: saleId,
      operation_type: 'create',
      payload_json: JSON.stringify({ sale, items }),
      created_at: `2026-10-24T14:1${i}:00.000Z`,
      retry_count: 0,
      status: 'quarantined',
      quarantine_reason: PRE_FIREBASE_QUARANTINE_REASON,
    };
    await adapter.enqueueSync(syncEntry);

    const audit: DbAuditEvent = {
      id: auditId,
      business_id: PRE_FIREBASE_TEST_BUSINESS_ID,
      shop_id: PRE_FIREBASE_TEST_SHOP_ID,
      user_id: 'usr-test',
      user_name: 'Test Cashier',
      action: 'sync_conflict',
      entity_type: 'sale',
      entity_id: saleId,
      details_json: JSON.stringify({ reason: PRE_FIREBASE_QUARANTINE_REASON }),
      created_at: `2026-10-24T14:1${i}:00.000Z`,
    };
    await adapter.saveAuditEvent(audit);
  }
}

test('IndexedDB Cleanup Integration: purges all 4 quarantined pre-Firebase records atomically while preserving unrelated records', async () => {
  const adapter = new IndexedDbDatabaseAdapter(TEST_DB_NAME);
  await adapter.initialize();

  try {
    assert.equal(adapter.getDatabaseName(), TEST_DB_NAME);
    await seedQuarantinedRecordsInIndexedDb(adapter);

    // Seed an unrelated legitimate live sale
    const liveSale: DbSale = {
      id: 'sale-live-legitimate-01',
      shop_id: 'shop-live-01',
      business_id: 'biz-live-01',
      receipt_number: 'SM-LIVE-0001',
      terminal_id: 'TERM-LIVE-01',
      cashier_user_id: 'usr-live-01',
      cashier_name: 'Live Cashier',
      created_at: '2026-10-28T10:00:00.000Z',
      subtotal_kobo: 500000,
      discount_amount_kobo: 0,
      tax_rate_percent: 7.5,
      tax_amount_kobo: 37500,
      total_amount_kobo: 537500,
      amount_tendered_kobo: 537500,
      change_due_kobo: 0,
      payment_method: 'pos_card',
      status: 'completed',
      idempotency_key: 'idem-live-01',
      is_synced: 1,
    };
    await adapter.saveSale(liveSale, []);

    const result = await adapter.purgeQuarantinedPreFirebaseSales(getStandardCriteria());
    assert.equal(result.success, true);
    assert.equal(result.isIdempotent, false);
    assert.equal(result.purgedCounts.sales, 4);
    assert.equal(result.purgedCounts.syncQueue, 4);
    assert.equal(result.purgedCounts.saleItems, 4);
    assert.equal(result.purgedCounts.payments, 4);
    assert.equal(result.purgedCounts.auditEvents, 4);

    // Verify quarantined sales are gone
    for (const saleId of SPECIFIED_PRE_FIREBASE_SALE_IDS) {
      assert.equal(await adapter.getSale(saleId), null);
    }

    // Verify legitimate live sale is untouched
    const preserved = await adapter.getSale('sale-live-legitimate-01');
    assert.ok(preserved);
    assert.equal(preserved.receipt_number, 'SM-LIVE-0001');

    // Second run is idempotent
    const secondRun = await adapter.purgeQuarantinedPreFirebaseSales(getStandardCriteria());
    assert.equal(secondRun.success, true);
    assert.equal(secondRun.isIdempotent, true);
  } finally {
    await adapter.close();
  }
});
