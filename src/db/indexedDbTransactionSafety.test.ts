import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { IndexedDbDatabaseAdapter } from './adapters/indexedDbAdapter';
import { DbProduct } from './schema';

test('IndexedDB Transaction Safety: runTransaction commits atomically on success and rolls back cleanly on error', async () => {
  const adapter = new IndexedDbDatabaseAdapter('smartmind_pos_tx_safety_test_db');
  await adapter.initialize();

  try {
    const initialProduct: DbProduct = {
      id: 'prd-tx-01',
      shop_id: 'shop-tx-01',
      business_id: 'biz-tx-01',
      category_id: 'cat-01',
      category_name: 'Beverages',
      sku: 'TX-SKU-01',
      barcode: 'TX-SKU-01',
      name: 'Transaction Test Item',
      unit: 'Pack',
      cost_price_kobo: 200000,
      selling_price_kobo: 300000,
      stock_quantity: 10,
      reorder_level: 2,
      tax_exempt: 0,
      is_active: 1,
      created_at: '2026-10-28T00:00:00Z',
      updated_at: '2026-10-28T00:00:00Z',
    };

    await adapter.saveProduct(initialProduct);

    // 1. Failing transaction must roll back all staged modifications
    await assert.rejects(
      async () => {
        await adapter.runTransaction(async (tx) => {
          await tx.updateProductStock('prd-tx-01', 4, '2026-10-28T01:00:00Z');
          throw new Error('SIMULATED_TRANSACTION_FAILURE');
        });
      },
      /SIMULATED_TRANSACTION_FAILURE/
    );

    const afterFailedTx = await adapter.getProduct('prd-tx-01');
    assert.ok(afterFailedTx);
    assert.equal(
      afterFailedTx.stock_quantity,
      10,
      'Stock quantity must remain 10 after transaction rollback'
    );

    // 2. Successful transaction must commit all staged modifications atomically
    await adapter.runTransaction(async (tx) => {
      await tx.updateProductStock('prd-tx-01', 7, '2026-10-28T02:00:00Z');
    });

    const afterCommittedTx = await adapter.getProduct('prd-tx-01');
    assert.ok(afterCommittedTx);
    assert.equal(
      afterCommittedTx.stock_quantity,
      7,
      'Stock quantity must be updated to 7 after committed transaction'
    );
  } finally {
    await adapter.close();
  }
});
