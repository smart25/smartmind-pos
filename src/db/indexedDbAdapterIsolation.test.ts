import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { IndexedDbDatabaseAdapter } from './adapters/indexedDbAdapter';
import { DbBusiness, DbProduct, DbShop } from './schema';

test('IndexedDB Adapter Isolation: separate testDatabaseName instances isolate data completely and default constructor preserves smartmind_pos_local_db', async () => {
  const defaultAdapter = new IndexedDbDatabaseAdapter();
  assert.equal(defaultAdapter.getDatabaseName(), 'smartmind_pos_local_db');

  const testDatabaseNameA = 'smartmind_pos_isolation_test_db_a';
  const testDatabaseNameB = 'smartmind_pos_isolation_test_db_b';

  const adapterA = new IndexedDbDatabaseAdapter(testDatabaseNameA);
  const adapterB = new IndexedDbDatabaseAdapter(testDatabaseNameB);

  await adapterA.initialize();
  await adapterB.initialize();

  try {
    assert.equal(adapterA.getDatabaseName(), testDatabaseNameA);
    assert.equal(adapterB.getDatabaseName(), testDatabaseNameB);

    const bizA: DbBusiness = {
      id: 'biz-iso-a',
      name: 'Isolation Business A',
      legal_name: 'Isolation Business A Ltd',
      business_type: 'Supermarket',
      registration_number: 'RC-ISO-A',
      tax_identification_number: 'TIN-ISO-A',
      owner_user_id: 'usr-iso-a',
      owner_name: 'Owner A',
      owner_email: 'owner.a@smartmind.ng',
      contact_email: 'owner.a@smartmind.ng',
      primary_phone: '+2348000000001',
      headquarters_address: 'Lagos',
      currency_code: 'NGN',
      currency_symbol: '₦',
      default_tax_rate_percent: 7.5,
      status: 'active',
      created_at: '2026-10-28T00:00:00Z',
      updated_at: '2026-10-28T00:00:00Z',
    };

    const shopA: DbShop = {
      id: 'shop-iso-a',
      business_id: 'biz-iso-a',
      code: 'ISO-A',
      name: 'Shop A',
      category: 'Retail',
      location_city: 'Lagos',
      address: '10 Marina',
      phone: '+2348000000001',
      manager_name: 'Manager A',
      status: 'active',
      terminal_id: 'TERM-A',
      tax_rate_percent: 7.5,
      receipt_header_note: '',
      receipt_footer_note: '',
      created_at: '2026-10-28T00:00:00Z',
      updated_at: '2026-10-28T00:00:00Z',
    };

    const productA: DbProduct = {
      id: 'prd-iso-a',
      shop_id: 'shop-iso-a',
      business_id: 'biz-iso-a',
      category_id: 'cat-01',
      category_name: 'General',
      sku: 'ISO-SKU-01',
      barcode: 'ISO-SKU-01',
      name: 'Isolated Product A',
      unit: 'Unit',
      cost_price_kobo: 100000,
      selling_price_kobo: 150000,
      stock_quantity: 25,
      reorder_level: 5,
      tax_exempt: 0,
      is_active: 1,
      created_at: '2026-10-28T00:00:00Z',
      updated_at: '2026-10-28T00:00:00Z',
    };

    await adapterA.saveBusiness(bizA);
    await adapterA.saveShop(shopA);
    await adapterA.saveProduct(productA);

    // Verify Adapter A has the records
    assert.ok(await adapterA.getBusiness('biz-iso-a'));
    assert.ok(await adapterA.getShop('shop-iso-a'));
    assert.ok(await adapterA.getProduct('prd-iso-a'));

    // Verify Adapter B is completely isolated and does not see Adapter A's data
    assert.equal(await adapterB.getBusiness('biz-iso-a'), null);
    assert.equal(await adapterB.getShop('shop-iso-a'), null);
    assert.equal(await adapterB.getProduct('prd-iso-a'), null);
  } finally {
    await adapterA.close();
    await adapterB.close();
  }
});
