import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDatabaseAdapter } from './adapters/memoryAdapter';
import {
  DbBusiness,
  DbCategory,
  DbProduct,
  DbShop,
  DbUser,
  fromMinorUnits,
  toMinorUnits,
} from './schema';
import { SaleFinalizationService } from '../services/saleFinalizationService';
import { DatabaseBackupService } from '../services/databaseBackupService';
import { CartItem, Product, User } from '../types/pos';

function makeProduct(
  p: Partial<Product> & {
    id: string;
    shopId: string;
    businessId: string;
    name: string;
    sku: string;
    sellingPrice: number;
    stockQuantity: number;
  }
): Product {
  return {
    barcode: p.sku,
    categoryId: 'cat-01',
    categoryName: 'General',
    unit: 'Unit',
    costPrice: 0,
    reorderLevel: 2,
    isActive: true,
    updatedAt: '2026-10-20T00:00:00Z',
    ...p,
  };
}

async function setupTestDb() {
  const db = new MemoryDatabaseAdapter();
  await db.initialize();

  const business: DbBusiness = {
    id: 'biz-01',
    name: 'Apex Supermarket Ltd',
    legal_name: 'Apex Supermarket Limited',
    business_type: 'Supermarket',
    registration_number: 'RC-123456',
    tax_identification_number: 'TIN-987654',
    owner_user_id: 'usr-owner-01',
    owner_name: 'Chief Okon',
    owner_email: 'okon@apex.ng',
    contact_email: 'info@apex.ng',
    primary_phone: '+2348011112222',
    headquarters_address: '12 Marina Road, Lagos',
    currency_code: 'NGN',
    currency_symbol: '₦',
    default_tax_rate_percent: 7.5,
    status: 'active',
    created_at: '2026-10-20T00:00:00Z',
    updated_at: '2026-10-20T00:00:00Z',
  };
  await db.saveBusiness(business);

  const shopA: DbShop = {
    id: 'shop-01',
    business_id: 'biz-01',
    code: 'APX-01',
    name: 'Apex Supermarket Marina',
    category: 'Supermarket',
    location_city: 'Lagos Island',
    address: '12 Marina, Lagos',
    phone: '+2348011112222',
    manager_name: 'Chief Okon',
    status: 'active',
    terminal_id: 'WIN-POS-01',
    tax_rate_percent: 7.5,
    receipt_header_note: 'Apex Supermarket Marina — Thank you',
    receipt_footer_note: 'Goods bought cannot be returned without receipt',
    created_at: '2026-10-20T00:00:00Z',
    updated_at: '2026-10-20T00:00:00Z',
  };
  await db.saveShop(shopA);

  const shopB: DbShop = {
    id: 'shop-02',
    business_id: 'biz-01',
    code: 'APX-02',
    name: 'Apex Supermarket Ikeja',
    category: 'Supermarket',
    location_city: 'Ikeja',
    address: '45 Allen Avenue, Ikeja',
    phone: '+2348033334444',
    manager_name: 'Mrs. Adebayo',
    status: 'active',
    terminal_id: 'WIN-POS-02',
    tax_rate_percent: 7.5,
    receipt_header_note: 'Apex Supermarket Ikeja',
    receipt_footer_note: 'Thank you for shopping with us',
    created_at: '2026-10-20T00:00:00Z',
    updated_at: '2026-10-20T00:00:00Z',
  };
  await db.saveShop(shopB);

  const ownerUser: User = {
    id: 'usr-owner-01',
    businessId: 'biz-01',
    username: 'okon',
    email: 'okon@apex.ng',
    fullName: 'Chief Okon',
    role: 'business_owner',
    roleLabel: 'Business Owner',
    assignedShopIds: ['shop-01', 'shop-02'],
    permissions: [
      'process_sales',
      'apply_discounts',
      'manage_products',
      'adjust_inventory',
      'manage_staff',
      'manage_shops',
      'manage_business_settings',
      'manage_debt_book',
      'manage_invoices',
      'process_returns',
      'process_refunds',
      'view_shop_reports',
      'view_business_reports',
    ],
    status: 'active',
    createdAt: '2026-10-20T00:00:00Z',
    lastLoginAt: '2026-10-20 10:00 AM',
  };

  const cashierShopA: User = {
    id: 'usr-cashier-01',
    businessId: 'biz-01',
    username: 'amaka',
    email: 'amaka@apex.ng',
    fullName: 'Amaka Cashier',
    role: 'cashier',
    roleLabel: 'Cashier (Marina)',
    assignedShopIds: ['shop-01'], // strictly shop-01
    permissions: ['process_sales'],
    status: 'active',
    createdAt: '2026-10-20T00:00:00Z',
    lastLoginAt: '2026-10-20 08:30 AM',
  };

  return { db, business, shopA, shopB, ownerUser, cashierShopA };
}

test('1. Product persistence: Products survive and can be saved, updated and retrieved', async () => {
  const { db } = await setupTestDb();

  const product: DbProduct = {
    id: 'prod-cornflakes-01',
    shop_id: 'shop-01',
    business_id: 'biz-01',
    category_id: 'cat-groceries',
    category_name: 'Groceries',
    sku: 'CRN-500G',
    barcode: '6151234567890',
    name: 'Golden Flakes 500g',
    unit: 'Pack',
    cost_price_kobo: toMinorUnits(1800),
    selling_price_kobo: toMinorUnits(2400),
    stock_quantity: 40,
    reorder_level: 10,
    tax_exempt: 0,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await db.saveProduct(product);

  const retrieved = await db.getProduct('prod-cornflakes-01');
  assert.ok(retrieved);
  assert.equal(retrieved?.name, 'Golden Flakes 500g');
  assert.equal(retrieved?.stock_quantity, 40);
  assert.equal(fromMinorUnits(retrieved?.selling_price_kobo ?? 0), 2400);
});

test('2. Category persistence: Categories persist and are queryable by shop', async () => {
  const { db } = await setupTestDb();

  const category: DbCategory = {
    id: 'cat-dairy-01',
    shop_id: 'shop-01',
    business_id: 'biz-01',
    name: 'Dairy & Eggs',
    description: 'Fresh milk, yogurt, and eggs',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await db.saveCategory(category);

  const categories = await db.getCategoriesForShop('shop-01');
  assert.equal(categories.length, 1);
  assert.equal(categories[0].name, 'Dairy & Eggs');
});

test('3. Stock movements: Adjustments record delta and update product stock', async () => {
  const { db } = await setupTestDb();

  const product: DbProduct = {
    id: 'prod-milk-01',
    shop_id: 'shop-01',
    business_id: 'biz-01',
    category_id: 'cat-dairy-01',
    category_name: 'Dairy',
    sku: 'MLK-1L',
    barcode: '61599998888',
    name: 'Fresh Cow Milk 1L',
    unit: 'Bottle',
    cost_price_kobo: toMinorUnits(1200),
    selling_price_kobo: toMinorUnits(1600),
    stock_quantity: 20,
    reorder_level: 5,
    tax_exempt: 0,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await db.saveProduct(product);

  // Manual Restock of +15
  await db.runTransaction(async (tx) => {
    await tx.updateProductStock(product.id, 35, new Date().toISOString());
    await tx.saveInventoryMovement({
      id: 'mov-001',
      shop_id: 'shop-01',
      business_id: 'biz-01',
      product_id: product.id,
      product_name: product.name,
      product_sku: product.sku,
      type: 'restock',
      quantity_delta: 15,
      previous_quantity: 20,
      new_quantity: 35,
      reason: 'New delivery batch',
      performed_by_user_id: 'usr-owner-01',
      performed_by_name: 'Chief Okon',
      created_at: new Date().toISOString(),
    });
  });

  const updated = await db.getProduct(product.id);
  assert.equal(updated?.stock_quantity, 35);

  const movements = await db.getInventoryMovements({
    shopId: 'shop-01',
    businessId: 'biz-01',
    productId: product.id,
  });
  assert.equal(movements.length, 1);
  assert.equal(movements[0].quantity_delta, 15);
  assert.equal(movements[0].new_quantity, 35);
});

test('4. Product deactivation: Deactivated products cannot be sold', async () => {
  const { db, cashierShopA } = await setupTestDb();
  const service = new SaleFinalizationService(db);

  const product: DbProduct = {
    id: 'prod-inactive-01',
    shop_id: 'shop-01',
    business_id: 'biz-01',
    category_id: 'cat-general',
    category_name: 'General',
    sku: 'DISC-01',
    barcode: '111222333',
    name: 'Discontinued Juice',
    unit: 'Bottle',
    cost_price_kobo: toMinorUnits(500),
    selling_price_kobo: toMinorUnits(800),
    stock_quantity: 10,
    reorder_level: 2,
    tax_exempt: 0,
    is_active: 0, // DEACTIVATED
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await db.saveProduct(product);

  const cartItem: CartItem = {
    product: makeProduct({
      id: product.id,
      shopId: product.shop_id,
      businessId: product.business_id,
      sku: product.sku,
      name: product.name,
      sellingPrice: 800,
      stockQuantity: 10,
      isActive: false,
    }),
    quantity: 1,
  };

  await assert.rejects(
    service.finalizeSale({
      businessId: 'biz-01',
      shopId: 'shop-01',
      user: cashierShopA,
      cart: [cartItem],
      paymentMethod: 'cash',
      discountAmount: 0,
      taxRatePercent: 0,
      taxAmount: 0,
      totalAmount: 800,
      amountTendered: 1000,
    }),
    /deactivated/i
  );
});

test('5. Shop isolation: Products and sales in Shop A are not visible in Shop B', async () => {
  const { db } = await setupTestDb();

  // Product in Shop 1
  await db.saveProduct({
    id: 'prod-sh1-01',
    shop_id: 'shop-01',
    business_id: 'biz-01',
    category_id: 'cat-01',
    category_name: 'General',
    sku: 'ISO-01',
    barcode: '444555666',
    name: 'Marina Exclusive Product',
    unit: 'Pack',
    cost_price_kobo: toMinorUnits(100),
    selling_price_kobo: toMinorUnits(200),
    stock_quantity: 5,
    reorder_level: 1,
    tax_exempt: 0,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const shop1Products = await db.getProducts({ shopId: 'shop-01', businessId: 'biz-01' });
  const shop2Products = await db.getProducts({ shopId: 'shop-02', businessId: 'biz-01' });

  assert.equal(shop1Products.length, 1);
  assert.equal(shop2Products.length, 0);
});

test('6. SKU collision rule: Same SKU allowed across different shops, rejected in same shop', async () => {
  const { db } = await setupTestDb();

  // Create SKU 'SUGAR-1KG' in Shop 1
  await db.saveProduct({
    id: 'prod-s1-sug',
    shop_id: 'shop-01',
    business_id: 'biz-01',
    category_id: 'cat-01',
    category_name: 'Groceries',
    sku: 'SUGAR-1KG',
    barcode: '777888999',
    name: 'Sugar 1kg (Marina)',
    unit: 'Bag',
    cost_price_kobo: toMinorUnits(800),
    selling_price_kobo: toMinorUnits(1000),
    stock_quantity: 10,
    reorder_level: 2,
    tax_exempt: 0,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Allowed: Same SKU in Shop 2
  await db.saveProduct({
    id: 'prod-s2-sug',
    shop_id: 'shop-02',
    business_id: 'biz-01',
    category_id: 'cat-02',
    category_name: 'Groceries',
    sku: 'SUGAR-1KG',
    barcode: '777888999',
    name: 'Sugar 1kg (Ikeja)',
    unit: 'Bag',
    cost_price_kobo: toMinorUnits(800),
    selling_price_kobo: toMinorUnits(1000),
    stock_quantity: 15,
    reorder_level: 2,
    tax_exempt: 0,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Rejected: Duplicate SKU 'SUGAR-1KG' within Shop 1
  await assert.rejects(
    db.saveProduct({
      id: 'prod-s1-sug-duplicate',
      shop_id: 'shop-01',
      business_id: 'biz-01',
      category_id: 'cat-01',
      category_name: 'Groceries',
      sku: 'SUGAR-1KG',
      barcode: '999999999',
      name: 'Another Sugar 1kg',
      unit: 'Bag',
      cost_price_kobo: toMinorUnits(800),
      selling_price_kobo: toMinorUnits(1000),
      stock_quantity: 5,
      reorder_level: 2,
      tax_exempt: 0,
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    /already in use/i
  );
});

test('7. Barcode lookup: Exact barcode match retrieves correct product', async () => {
  const { db } = await setupTestDb();

  await db.saveProduct({
    id: 'prod-bcode-01',
    shop_id: 'shop-01',
    business_id: 'biz-01',
    category_id: 'cat-01',
    category_name: 'Beverages',
    sku: 'MALT-33CL',
    barcode: '6151112223334',
    name: 'Malt Drink 33cl',
    unit: 'Can',
    cost_price_kobo: toMinorUnits(300),
    selling_price_kobo: toMinorUnits(450),
    stock_quantity: 24,
    reorder_level: 6,
    tax_exempt: 0,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const found = await db.getProductByBarcode('shop-01', '6151112223334');
  assert.ok(found);
  assert.equal(found?.name, 'Malt Drink 33cl');
});

test('8. Transaction atomicity: Failure mid-way rolls back completely with zero stock deducted', async () => {
  const { db, cashierShopA } = await setupTestDb();
  const service = new SaleFinalizationService(db);

  // Product 1: Stock 10
  await db.saveProduct({
    id: 'prod-item-1',
    shop_id: 'shop-01',
    business_id: 'biz-01',
    category_id: 'cat-01',
    category_name: 'General',
    sku: 'ITM-01',
    barcode: '1001',
    name: 'Item 1',
    unit: 'Unit',
    cost_price_kobo: toMinorUnits(100),
    selling_price_kobo: toMinorUnits(200),
    stock_quantity: 10,
    reorder_level: 2,
    tax_exempt: 0,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Product 2: Stock 1 (Insufficient for requested 5)
  await db.saveProduct({
    id: 'prod-item-2',
    shop_id: 'shop-01',
    business_id: 'biz-01',
    category_id: 'cat-01',
    category_name: 'General',
    sku: 'ITM-02',
    barcode: '1002',
    name: 'Item 2',
    unit: 'Unit',
    cost_price_kobo: toMinorUnits(100),
    selling_price_kobo: toMinorUnits(300),
    stock_quantity: 1,
    reorder_level: 2,
    tax_exempt: 0,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const cart: CartItem[] = [
    {
      product: makeProduct({
        id: 'prod-item-1',
        shopId: 'shop-01',
        businessId: 'biz-01',
        sku: 'ITM-01',
        name: 'Item 1',
        sellingPrice: 200,
        stockQuantity: 10,
      }),
      quantity: 2,
    },
    {
      product: makeProduct({
        id: 'prod-item-2',
        shopId: 'shop-01',
        businessId: 'biz-01',
        sku: 'ITM-02',
        name: 'Item 2',
        sellingPrice: 300,
        stockQuantity: 1,
      }),
      quantity: 5, // Insufficient!
    },
  ];

  await assert.rejects(
    service.finalizeSale({
      businessId: 'biz-01',
      shopId: 'shop-01',
      user: cashierShopA,
      cart,
      paymentMethod: 'cash',
      discountAmount: 0,
      taxRatePercent: 0,
      taxAmount: 0,
      totalAmount: 1900,
      amountTendered: 2000,
    }),
    /insufficient stock/i
  );

  // VERIFY ZERO STOCK DEDUCTED FOR ITEM 1
  const item1 = await db.getProduct('prod-item-1');
  assert.equal(item1?.stock_quantity, 10, 'Product 1 stock must remain unchanged (rollback)');

  // VERIFY NO SALE WAS CREATED
  const sales = await db.getSales({ shopId: 'shop-01', businessId: 'biz-01' });
  assert.equal(sales.length, 0, 'No sales records created on aborted transaction');
});

test('9. Concurrency safety: Concurrent checkout of last remaining item succeeds for one and rejects the other', async () => {
  const { db, cashierShopA } = await setupTestDb();
  const service = new SaleFinalizationService(db);

  await db.saveProduct({
    id: 'prod-single-01',
    shop_id: 'shop-01',
    business_id: 'biz-01',
    category_id: 'cat-01',
    category_name: 'General',
    sku: 'LST-01',
    barcode: '9988',
    name: 'Last Unit Item',
    unit: 'Unit',
    cost_price_kobo: toMinorUnits(500),
    selling_price_kobo: toMinorUnits(1000),
    stock_quantity: 1, // Only 1 remaining!
    reorder_level: 0,
    tax_exempt: 0,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const makeCheckout = () =>
    service.finalizeSale({
      businessId: 'biz-01',
      shopId: 'shop-01',
      user: cashierShopA,
      cart: [
        {
          product: makeProduct({
            id: 'prod-single-01',
            shopId: 'shop-01',
            businessId: 'biz-01',
            sku: 'LST-01',
            name: 'Last Unit Item',
            sellingPrice: 1000,
            stockQuantity: 1,
          }),
          quantity: 1,
        },
      ],
      paymentMethod: 'cash',
      discountAmount: 0,
      taxRatePercent: 0,
      taxAmount: 0,
      totalAmount: 1000,
      amountTendered: 1000,
    });

  const results = await Promise.allSettled([makeCheckout(), makeCheckout()]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');

  assert.equal(fulfilled.length, 1, 'Exactly one concurrent checkout must succeed');
  assert.equal(rejected.length, 1, 'The other concurrent checkout must be rejected');

  const finalProduct = await db.getProduct('prod-single-01');
  assert.equal(finalProduct?.stock_quantity, 0, 'Final stock must be exactly 0, never negative');
});

test('10. Idempotency key: Submitting same checkoutOperationId does not double-deduct stock', async () => {
  const { db, cashierShopA } = await setupTestDb();
  const service = new SaleFinalizationService(db);

  await db.saveProduct({
    id: 'prod-idem-01',
    shop_id: 'shop-01',
    business_id: 'biz-01',
    category_id: 'cat-01',
    category_name: 'General',
    sku: 'IDEM-01',
    barcode: '4455',
    name: 'Idempotency Test Item',
    unit: 'Unit',
    cost_price_kobo: toMinorUnits(100),
    selling_price_kobo: toMinorUnits(500),
    stock_quantity: 10,
    reorder_level: 2,
    tax_exempt: 0,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const idempotencyKey = 'checkout-op-uuid-12345';
  const cart: CartItem[] = [
    {
      product: makeProduct({
        id: 'prod-idem-01',
        shopId: 'shop-01',
        businessId: 'biz-01',
        sku: 'IDEM-01',
        name: 'Idempotency Test Item',
        sellingPrice: 500,
        stockQuantity: 10,
      }),
      quantity: 2,
    },
  ];

  // First submission
  const res1 = await service.finalizeSale({
    businessId: 'biz-01',
    shopId: 'shop-01',
    user: cashierShopA,
    cart,
    paymentMethod: 'cash',
    discountAmount: 0,
    taxRatePercent: 0,
    taxAmount: 0,
    totalAmount: 1000,
    amountTendered: 1000,
    checkoutOperationId: idempotencyKey,
  });

  assert.equal(res1.success, true);
  assert.equal(res1.isIdempotentReplay, undefined);

  // Check stock after first submission: 10 - 2 = 8
  const stockAfterFirst = (await db.getProduct('prod-idem-01'))?.stock_quantity;
  assert.equal(stockAfterFirst, 8);

  // Second submission with identical idempotency key (e.g. user double-clicked checkout or network retry)
  const res2 = await service.finalizeSale({
    businessId: 'biz-01',
    shopId: 'shop-01',
    user: cashierShopA,
    cart,
    paymentMethod: 'cash',
    discountAmount: 0,
    taxRatePercent: 0,
    taxAmount: 0,
    totalAmount: 1000,
    amountTendered: 1000,
    checkoutOperationId: idempotencyKey,
  });

  assert.equal(res2.success, true);
  assert.equal(res2.isIdempotentReplay, true);
  assert.equal(res2.sale.id, res1.sale.id);

  // Check stock: MUST STILL BE 8, NOT 6!
  const stockAfterSecond = (await db.getProduct('prod-idem-01'))?.stock_quantity;
  assert.equal(stockAfterSecond, 8, 'Stock must not be deducted a second time on idempotent replay');
});

test('11. Historical receipt accuracy: Changing product price later does not alter historical sales', async () => {
  const { db, cashierShopA } = await setupTestDb();
  const service = new SaleFinalizationService(db);

  const product: DbProduct = {
    id: 'prod-hist-01',
    shop_id: 'shop-01',
    business_id: 'biz-01',
    category_id: 'cat-01',
    category_name: 'General',
    sku: 'HIST-01',
    barcode: '332211',
    name: 'Original Item Name',
    unit: 'Unit',
    cost_price_kobo: toMinorUnits(200),
    selling_price_kobo: toMinorUnits(500),
    stock_quantity: 20,
    reorder_level: 2,
    tax_exempt: 0,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await db.saveProduct(product);

  // Finalize sale at ₦500
  const saleResult = await service.finalizeSale({
    businessId: 'biz-01',
    shopId: 'shop-01',
    user: cashierShopA,
    cart: [
      {
        product: makeProduct({
          id: product.id,
          shopId: product.shop_id,
          businessId: product.business_id,
          sku: product.sku,
          name: product.name,
          costPrice: 200,
          sellingPrice: 500,
          stockQuantity: 20,
        }),
        quantity: 1,
      },
    ],
    paymentMethod: 'cash',
    discountAmount: 0,
    taxRatePercent: 0,
    taxAmount: 0,
    totalAmount: 500,
    amountTendered: 500,
  });

  // Mutate product price to ₦1,200 and change name
  await db.saveProduct({
    ...product,
    name: 'Brand New Inflated Item Name',
    selling_price_kobo: toMinorUnits(1200),
  });

  // Retrieve historical sale line items
  const saleItems = await db.getSaleItems(saleResult.sale.id);
  assert.equal(saleItems.length, 1);
  assert.equal(saleItems[0].product_name, 'Original Item Name', 'Historical line item name preserved');
  assert.equal(fromMinorUnits(saleItems[0].unit_price_kobo), 500, 'Historical selling price preserved');
});

test('12. Decimal safety: Stored financial totals suffer no floating-point rounding errors', async () => {
  // In javascript: 0.1 + 0.2 = 0.30000000000000004
  // In minor units kobo:
  const itemA_kobo = toMinorUnits(0.1); // 10 kobo
  const itemB_kobo = toMinorUnits(0.2); // 20 kobo
  const sum_kobo = itemA_kobo + itemB_kobo; // 30 kobo
  assert.equal(sum_kobo, 30);
  assert.equal(fromMinorUnits(sum_kobo), 0.3);

  // NGN 12,345.67
  const naira = 12345.67;
  const kobo = toMinorUnits(naira);
  assert.equal(kobo, 1234567);
  assert.equal(fromMinorUnits(kobo), 12345.67);
});

test('13. Payment records: Payment records exist for each completed sale matching total amount', async () => {
  const { db, cashierShopA } = await setupTestDb();
  const service = new SaleFinalizationService(db);

  await db.saveProduct({
    id: 'prod-pmt-01',
    shop_id: 'shop-01',
    business_id: 'biz-01',
    category_id: 'cat-01',
    category_name: 'General',
    sku: 'PMT-01',
    barcode: '9911',
    name: 'Payment Test Item',
    unit: 'Unit',
    cost_price_kobo: toMinorUnits(500),
    selling_price_kobo: toMinorUnits(1500),
    stock_quantity: 10,
    reorder_level: 2,
    tax_exempt: 0,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const res = await service.finalizeSale({
    businessId: 'biz-01',
    shopId: 'shop-01',
    user: cashierShopA,
    cart: [
      {
        product: makeProduct({
          id: 'prod-pmt-01',
          shopId: 'shop-01',
          businessId: 'biz-01',
          sku: 'PMT-01',
          name: 'Payment Test Item',
          costPrice: 500,
          sellingPrice: 1500,
          stockQuantity: 10,
        }),
        quantity: 2,
      },
    ],
    paymentMethod: 'pos_card',
    paymentReference: 'POS-TXN-REF-789',
    discountAmount: 0,
    taxRatePercent: 0,
    taxAmount: 0,
    totalAmount: 3000,
    amountTendered: 3000,
  });

  const payments = await db.getPaymentsForReference('sale', res.sale.id);
  assert.equal(payments.length, 1);
  assert.equal(fromMinorUnits(payments[0].amount_kobo), 3000);
  assert.equal(payments[0].payment_method, 'pos_card');
  assert.equal(payments[0].payment_reference, 'POS-TXN-REF-789');
});

test('14. Audit log durability: Sale produces queryable audit records', async () => {
  const { db, cashierShopA } = await setupTestDb();
  const service = new SaleFinalizationService(db);

  await db.saveProduct({
    id: 'prod-aud-01',
    shop_id: 'shop-01',
    business_id: 'biz-01',
    category_id: 'cat-01',
    category_name: 'General',
    sku: 'AUD-01',
    barcode: '4433',
    name: 'Audit Test Item',
    unit: 'Unit',
    cost_price_kobo: toMinorUnits(100),
    selling_price_kobo: toMinorUnits(400),
    stock_quantity: 5,
    reorder_level: 1,
    tax_exempt: 0,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const res = await service.finalizeSale({
    businessId: 'biz-01',
    shopId: 'shop-01',
    user: cashierShopA,
    cart: [
      {
        product: makeProduct({
          id: 'prod-aud-01',
          shopId: 'shop-01',
          businessId: 'biz-01',
          sku: 'AUD-01',
          name: 'Audit Test Item',
          costPrice: 100,
          sellingPrice: 400,
          stockQuantity: 5,
        }),
        quantity: 1,
      },
    ],
    paymentMethod: 'cash',
    discountAmount: 0,
    taxRatePercent: 0,
    taxAmount: 0,
    totalAmount: 400,
    amountTendered: 500,
  });

  const auditEvents = await db.getAuditEvents('biz-01', 'shop-01');
  assert.ok(auditEvents.length > 0);
  const saleEvent = auditEvents.find((e) => e.entity_id === res.sale.id);
  assert.ok(saleEvent);
  assert.equal(saleEvent?.action, 'sale_finalized');
  assert.equal(saleEvent?.user_id, cashierShopA.id);
});

test('15. Sync queue durability: Offline sales enqueue a pending sync item with payload and status', async () => {
  const { db, cashierShopA } = await setupTestDb();
  const service = new SaleFinalizationService(db);

  await db.saveProduct({
    id: 'prod-sync-01',
    shop_id: 'shop-01',
    business_id: 'biz-01',
    category_id: 'cat-01',
    category_name: 'General',
    sku: 'SYNC-01',
    barcode: '5566',
    name: 'Sync Queue Item',
    unit: 'Unit',
    cost_price_kobo: toMinorUnits(200),
    selling_price_kobo: toMinorUnits(500),
    stock_quantity: 8,
    reorder_level: 2,
    tax_exempt: 0,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const res = await service.finalizeSale({
    businessId: 'biz-01',
    shopId: 'shop-01',
    user: cashierShopA,
    cart: [
      {
        product: makeProduct({
          id: 'prod-sync-01',
          shopId: 'shop-01',
          businessId: 'biz-01',
          sku: 'SYNC-01',
          name: 'Sync Queue Item',
          costPrice: 200,
          sellingPrice: 500,
          stockQuantity: 8,
        }),
        quantity: 1,
      },
    ],
    paymentMethod: 'cash',
    discountAmount: 0,
    taxRatePercent: 0,
    taxAmount: 0,
    totalAmount: 500,
    amountTendered: 500,
  });

  const queue = await db.getPendingSyncQueue('shop-01');
  assert.equal(queue.length, 1);
  assert.equal(queue[0].entity_id, res.sale.id);
  assert.equal(queue[0].status, 'pending');
  assert.equal(queue[0].entity_type, 'sale');

  // Verify payload contains JSON snapshot
  const parsed = JSON.parse(queue[0].payload_json);
  assert.equal(parsed.sale.id, res.sale.id);
});

test('16. Unauthorized user rejection: Cashier cannot finalize sales for an unassigned shop', async () => {
  const { db, cashierShopA } = await setupTestDb();
  const service = new SaleFinalizationService(db);

  await db.saveProduct({
    id: 'prod-sh2-item',
    shop_id: 'shop-02',
    business_id: 'biz-01',
    category_id: 'cat-02',
    category_name: 'General',
    sku: 'SH2-01',
    barcode: '7788',
    name: 'Ikeja Item',
    unit: 'Unit',
    cost_price_kobo: toMinorUnits(100),
    selling_price_kobo: toMinorUnits(300),
    stock_quantity: 10,
    reorder_level: 2,
    tax_exempt: 0,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Cashier is assigned only to shop-01 (Marina), attempts to checkout in shop-02 (Ikeja)
  await assert.rejects(
    service.finalizeSale({
      businessId: 'biz-01',
      shopId: 'shop-02', // Unassigned shop!
      user: cashierShopA,
      cart: [
        {
          product: makeProduct({
            id: 'prod-sh2-item',
            shopId: 'shop-02',
            businessId: 'biz-01',
            sku: 'SH2-01',
            name: 'Ikeja Item',
            costPrice: 100,
            sellingPrice: 300,
            stockQuantity: 10,
          }),
          quantity: 1,
        },
      ],
      paymentMethod: 'cash',
      discountAmount: 0,
      taxRatePercent: 0,
      taxAmount: 0,
      totalAmount: 300,
      amountTendered: 500,
    }),
    /not authorized for this shop/i
  );
});

test('17. Database export/restore: Sanitized export without passwords and accurate restore', async () => {
  const { db, cashierShopA } = await setupTestDb();
  const backupService = new DatabaseBackupService(db);

  // Add a user with a password hash to test sanitization
  await db.saveUser({
    id: cashierShopA.id,
    business_id: cashierShopA.businessId,
    username: cashierShopA.username,
    email: cashierShopA.email,
    password_hash: 'secret_sha256_hash_value',
    full_name: cashierShopA.fullName,
    role: cashierShopA.role,
    role_label: cashierShopA.roleLabel,
    status: cashierShopA.status,
    created_at: cashierShopA.createdAt,
    permissions_json: JSON.stringify(cashierShopA.permissions),
    last_login_at: '2026-10-20',
  });

  const exportPayload = await backupService.exportBackup('1.0.0-phase5');

  // Verify export format and schema
  assert.equal(exportPayload.format, 'smartmind_pos_backup');
  assert.equal(exportPayload.schemaVersion, 5);
  assert.ok(exportPayload.exportedAt);

  // VERIFY PASSWORD SANITIZATION: No password_hash in exported users!
  for (const u of exportPayload.data.users) {
    assert.equal((u as any).password_hash, undefined, 'Export must never expose password_hash');
  }

  // Restore into a fresh database instance
  const freshDb = new MemoryDatabaseAdapter();
  await freshDb.initialize();
  const freshBackupService = new DatabaseBackupService(freshDb);

  const restoreResult = await freshBackupService.restoreBackup(exportPayload);
  assert.equal(restoreResult.success, true);

  const restoredBusinesses = await freshDb.getAllBusinesses();
  assert.equal(restoredBusinesses.length, 1);
  assert.equal(restoredBusinesses[0].name, 'Apex Supermarket Ltd');
});
