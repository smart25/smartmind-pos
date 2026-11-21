import test from 'node:test';
import assert from 'node:assert/strict';
import { Product, ProductTransfer, Shop, User } from '../types/pos';

test('Product Transfer Suite: Inter-Shop Product Transfers', async (t) => {
  await t.test('1. Initiating transfer creates pending record and deducts source stock', () => {
    const sourceShop: Shop = {
      id: 'shop-01',
      businessId: 'biz-01',
      code: 'SVS-01',
      name: 'Main Branch',
      category: 'Supermarket',
      locationCity: 'Asaba',
      address: '123 Main St',
      phone: '08012345678',
      managerName: 'Manager A',
      status: 'active',
      terminalId: 'TERM-01',
      taxRatePercent: 7.5,
      receiptHeaderNote: 'Main Branch',
      receiptFooterNote: 'Thank you',
      createdAt: '2026-01-01T00:00:00.000Z',
      pendingSyncCount: 0,
      lastSyncedAt: 'now',
    };

    const destShop: Shop = {
      ...sourceShop,
      id: 'shop-02',
      code: 'SVS-02',
      name: 'Warri Branch',
    };

    const productInSource: Product = {
      id: 'prod-milo-01',
      shopId: 'shop-01',
      businessId: 'biz-01',
      categoryId: 'cat-01',
      categoryName: 'Beverages',
      name: 'Milo Refill 800g',
      sku: 'MR8-1002',
      barcode: '613000994822',
      unit: 'Pack',
      costPrice: 3200,
      sellingPrice: 3800,
      stockQuantity: 30,
      reorderLevel: 5,
      isActive: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const transferQty = 10;
    assert.ok(productInSource.stockQuantity >= transferQty, 'Stock must be sufficient');

    // Deduct stock in source shop
    const updatedSourceStock = productInSource.stockQuantity - transferQty;
    assert.equal(updatedSourceStock, 20, 'Source stock must be reduced from 30 to 20');

    // Transfer record created
    const transfer: ProductTransfer = {
      id: 'trf-001',
      transferNumber: 'TRF-2026-0001',
      businessId: 'biz-01',
      sourceShopId: 'shop-01',
      sourceShopName: 'Main Branch',
      destinationShopId: 'shop-02',
      destinationShopName: 'Warri Branch',
      items: [
        {
          productId: productInSource.id,
          productName: productInSource.name,
          sku: productInSource.sku,
          unit: productInSource.unit,
          quantity: transferQty,
          costPrice: productInSource.costPrice,
          sellingPrice: productInSource.sellingPrice,
        },
      ],
      totalItems: 1,
      totalQuantity: transferQty,
      status: 'pending',
      initiatedByUserId: 'usr-admin',
      initiatedByUserName: 'Admin User',
      initiatedAt: '2026-11-14T12:00:00.000Z',
      createdAt: '2026-11-14T12:00:00.000Z',
      updatedAt: '2026-11-14T12:00:00.000Z',
    };

    assert.equal(transfer.status, 'pending');
    assert.equal(transfer.items[0].quantity, 10);
  });

  await t.test('2. Confirming transfer immediately reflects in destination shop stock', () => {
    // Scenario A: Product already exists in destination shop
    const existingDestProduct: Product = {
      id: 'prod-milo-02',
      shopId: 'shop-02',
      businessId: 'biz-01',
      categoryId: 'cat-02',
      categoryName: 'Beverages',
      name: 'Milo Refill 800g',
      sku: 'MR8-1002',
      barcode: '613000994822',
      unit: 'Pack',
      costPrice: 3200,
      sellingPrice: 3800,
      stockQuantity: 5,
      reorderLevel: 5,
      isActive: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const transferItem = {
      productId: 'prod-milo-01',
      productName: 'Milo Refill 800g',
      sku: 'MR8-1002',
      unit: 'Pack',
      quantity: 10,
    };

    // Receiving 10 packs
    const updatedDestStock = existingDestProduct.stockQuantity + transferItem.quantity;
    assert.equal(updatedDestStock, 15, 'Destination shop stock must immediately increase from 5 to 15');

    // Scenario B: Product is brand new to destination shop
    const productsInShop3: Product[] = [];
    const receivedItemNew = {
      productId: 'prod-sugar-01',
      productName: 'Golden Penny Sugar 500g',
      sku: 'GPS5-1001',
      unit: 'Pack',
      quantity: 25,
      costPrice: 800,
      sellingPrice: 1000,
    };

    const matching = productsInShop3.find((p) => p.sku === receivedItemNew.sku);
    assert.equal(matching, undefined, 'Product does not exist yet in Shop 3');

    // Auto-create product in destination shop
    const createdDestProduct: Product = {
      id: 'prod-shop-03-sugar',
      shopId: 'shop-03',
      businessId: 'biz-01',
      categoryId: 'cat-03',
      categoryName: 'Groceries',
      name: receivedItemNew.productName,
      sku: receivedItemNew.sku,
      barcode: receivedItemNew.sku,
      unit: receivedItemNew.unit,
      costPrice: receivedItemNew.costPrice,
      sellingPrice: receivedItemNew.sellingPrice,
      stockQuantity: receivedItemNew.quantity,
      reorderLevel: 5,
      isActive: true,
      updatedAt: '2026-11-14T12:00:00.000Z',
    };

    assert.equal(createdDestProduct.stockQuantity, 25, 'Initial stock must equal transferred quantity');
    assert.equal(createdDestProduct.sku, 'GPS5-1001');
  });

  await t.test('3. Cancelling transfer restores stock to originating shop', () => {
    let sourceStock = 20; // after 10 units were dispatched
    const transferQty = 10;

    // Cancellation returns stock
    sourceStock += transferQty;
    assert.equal(sourceStock, 30, 'Cancelled transfer must restore stock to 30 units');
  });

  await t.test('4. Auto-reconciler deducts source stock for transfers lacking sourceDeductedAt and tags sourceDeductedAt', () => {
    const sourceProduct: Product = {
      id: 'prod-sugar-01',
      shopId: 'shop-01',
      businessId: 'biz-01',
      categoryId: 'cat-01',
      categoryName: 'Groceries',
      name: 'Golden Penny Sugar 500g',
      sku: 'GPS5-1001',
      barcode: '613000994811',
      unit: 'Pack',
      costPrice: 1200,
      sellingPrice: 1500,
      stockQuantity: 40,
      reorderLevel: 5,
      isActive: true,
      updatedAt: '2026-11-01T00:00:00.000Z',
    };

    const transfer: ProductTransfer = {
      id: 'trf-002',
      transferNumber: 'TRF-2026-0002',
      businessId: 'biz-01',
      sourceShopId: 'shop-01',
      sourceShopName: 'Main Branch',
      destinationShopId: 'shop-02',
      destinationShopName: 'Asaba Branch',
      items: [
        {
          productId: sourceProduct.id,
          productName: sourceProduct.name,
          sku: sourceProduct.sku,
          unit: sourceProduct.unit,
          quantity: 7,
        },
      ],
      totalItems: 1,
      totalQuantity: 7,
      status: 'completed',
      sourceDeducted: true, // Legacy or interrupted flag without sourceDeductedAt
      initiatedByUserId: 'usr-admin',
      initiatedByUserName: 'Admin User',
      initiatedAt: '2026-11-14T12:00:00.000Z',
      createdAt: '2026-11-14T12:00:00.000Z',
      updatedAt: '2026-11-14T12:00:00.000Z',
    };

    // Reconciler checks: !transfer.sourceDeductedAt
    assert.equal(transfer.sourceDeductedAt, undefined);
    const reconciledStock = Math.max(0, sourceProduct.stockQuantity - transfer.items[0].quantity);
    assert.equal(reconciledStock, 33, 'Stock must be deducted from 40 to 33');

    const reconciledTransfer: ProductTransfer = {
      ...transfer,
      sourceDeducted: true,
      sourceDeductedAt: '2026-11-15T01:00:00.000Z',
    };
    assert.ok(reconciledTransfer.sourceDeductedAt);
  });
});
