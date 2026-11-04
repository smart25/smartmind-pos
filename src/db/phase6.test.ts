import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDatabaseAdapter } from './adapters/memoryAdapter';
import {
  DbBusiness,
  DbProduct,
  DbShop,
  DbUser,
  fromMinorUnits,
  toMinorUnits,
} from './schema';
import { SaleFinalizationService } from '../services/saleFinalizationService';
import { CloudBackendService } from '../services/cloudBackendService';
import { CloudSyncService } from '../services/cloudSyncService';
import { CartItem, Product, User } from '../types/pos';
import { ROLE_DEFAULT_PERMISSIONS } from '../utils/posCalculations';

function makeDomainProduct(
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
    costPrice: 500,
    reorderLevel: 2,
    isActive: true,
    updatedAt: '2026-10-24T00:00:00Z',
    ...p,
  };
}

async function setupPhase6Environment() {
  const localDb = new MemoryDatabaseAdapter();
  await localDb.initialize();
  const cloudBackend = new CloudBackendService();
  const syncService = new CloudSyncService(localDb, cloudBackend);
  const saleService = new SaleFinalizationService(localDb);

  // Platform Admin
  const platformAdminDb: DbUser = {
    id: 'usr-platform-admin',
    business_id: 'PLATFORM',
    username: 'superadmin',
    email: 'smartnwokolo@gmail.com',
    full_name: 'SmartMind Platform Admin',
    role: 'platform_admin',
    role_label: 'Platform Administrator',
    permissions_json: JSON.stringify([]),
    status: 'active',
    created_at: '2026-10-20T00:00:00Z',
    last_login_at: '2026-10-20T00:00:00Z',
  };
  cloudBackend.registerAuthAccount(platformAdminDb, 'AdminSecret#2026', []);
  await localDb.saveUser(platformAdminDb);

  // Business A (biz-alpha)
  const bizAlpha: DbBusiness = {
    id: 'biz-alpha',
    name: 'Alpha Superstores Ltd',
    legal_name: 'Alpha Superstores Limited',
    business_type: 'Supermarket & Grocery Chain',
    registration_number: 'RC-100001',
    tax_identification_number: 'TIN-100001',
    owner_user_id: 'usr-owner-alpha',
    owner_name: 'Chief Alpha Owner',
    owner_email: 'owner@alpha.ng',
    contact_email: 'hq@alpha.ng',
    primary_phone: '+2348010000001',
    headquarters_address: '10 Victoria Island, Lagos',
    currency_code: 'NGN',
    currency_symbol: '₦',
    default_tax_rate_percent: 7.5,
    status: 'active',
    created_at: '2026-10-20T00:00:00Z',
    updated_at: '2026-10-20T00:00:00Z',
  };
  cloudBackend.seedBusiness(bizAlpha);
  await localDb.saveBusiness(bizAlpha);

  // Business B (biz-beta)
  const bizBeta: DbBusiness = {
    id: 'biz-beta',
    name: 'Beta Pharmacy Group',
    legal_name: 'Beta Pharmacy Limited',
    business_type: 'Pharmacy & Healthcare Retail',
    registration_number: 'RC-200002',
    tax_identification_number: 'TIN-200002',
    owner_user_id: 'usr-owner-beta',
    owner_name: 'Dr. Beta Owner',
    owner_email: 'owner@beta.ng',
    contact_email: 'hq@beta.ng',
    primary_phone: '+2348020000002',
    headquarters_address: '20 Wuse II, Abuja',
    currency_code: 'NGN',
    currency_symbol: '₦',
    default_tax_rate_percent: 7.5,
    status: 'active',
    created_at: '2026-10-20T00:00:00Z',
    updated_at: '2026-10-20T00:00:00Z',
  };
  cloudBackend.seedBusiness(bizBeta);
  await localDb.saveBusiness(bizBeta);

  // Shops under Business A: shop-alpha-1 and shop-alpha-2
  const shopAlpha1: DbShop = {
    id: 'shop-alpha-1',
    business_id: 'biz-alpha',
    code: 'ALP-01',
    name: 'Alpha VI Branch',
    category: 'Supermarket',
    location_city: 'Lagos',
    address: '10 VI, Lagos',
    phone: '+2348010000001',
    manager_name: 'Chief Alpha Owner',
    status: 'active',
    terminal_id: 'TERM-ALP-01',
    tax_rate_percent: 7.5,
    receipt_header_note: 'Alpha VI',
    receipt_footer_note: 'Thank you',
    created_at: '2026-10-20T00:00:00Z',
    updated_at: '2026-10-20T00:00:00Z',
  };
  const shopAlpha2: DbShop = {
    id: 'shop-alpha-2',
    business_id: 'biz-alpha',
    code: 'ALP-02',
    name: 'Alpha Ikeja Branch',
    category: 'Supermarket',
    location_city: 'Lagos',
    address: '44 Allen Ave, Ikeja',
    phone: '+2348010000002',
    manager_name: 'Manager Ikeja',
    status: 'active',
    terminal_id: 'TERM-ALP-02',
    tax_rate_percent: 7.5,
    receipt_header_note: 'Alpha Ikeja',
    receipt_footer_note: 'Thank you',
    created_at: '2026-10-20T00:00:00Z',
    updated_at: '2026-10-20T00:00:00Z',
  };
  // Shop under Business B: shop-beta-1
  const shopBeta1: DbShop = {
    id: 'shop-beta-1',
    business_id: 'biz-beta',
    code: 'BET-01',
    name: 'Beta Abuja Central',
    category: 'Pharmacy',
    location_city: 'Abuja',
    address: '20 Wuse II, Abuja',
    phone: '+2348020000002',
    manager_name: 'Dr. Beta Owner',
    status: 'active',
    terminal_id: 'TERM-BET-01',
    tax_rate_percent: 7.5,
    receipt_header_note: 'Beta Abuja',
    receipt_footer_note: 'Thank you',
    created_at: '2026-10-20T00:00:00Z',
    updated_at: '2026-10-20T00:00:00Z',
  };

  for (const s of [shopAlpha1, shopAlpha2, shopBeta1]) {
    cloudBackend.seedShop(s);
    await localDb.saveShop(s);
  }

  // Users
  const ownerAlphaDb: DbUser = {
    id: 'usr-owner-alpha',
    business_id: 'biz-alpha',
    username: 'owner_alpha',
    email: 'owner@alpha.ng',
    full_name: 'Chief Alpha Owner',
    role: 'business_owner',
    role_label: 'Business Owner',
    permissions_json: JSON.stringify(ROLE_DEFAULT_PERMISSIONS.business_owner),
    status: 'active',
    created_at: '2026-10-20T00:00:00Z',
    last_login_at: '2026-10-20T00:00:00Z',
  };
  cloudBackend.registerAuthAccount(ownerAlphaDb, 'AlphaOwnerPass#1', [
    'shop-alpha-1',
    'shop-alpha-2',
  ]);
  await localDb.saveUser(ownerAlphaDb);

  const ownerBetaDb: DbUser = {
    id: 'usr-owner-beta',
    business_id: 'biz-beta',
    username: 'owner_beta',
    email: 'owner@beta.ng',
    full_name: 'Dr. Beta Owner',
    role: 'business_owner',
    role_label: 'Business Owner',
    permissions_json: JSON.stringify(ROLE_DEFAULT_PERMISSIONS.business_owner),
    status: 'active',
    created_at: '2026-10-20T00:00:00Z',
    last_login_at: '2026-10-20T00:00:00Z',
  };
  cloudBackend.registerAuthAccount(ownerBetaDb, 'BetaOwnerPass#1', ['shop-beta-1']);
  await localDb.saveUser(ownerBetaDb);

  const cashierAlpha1Db: DbUser = {
    id: 'usr-cashier-alpha-1',
    business_id: 'biz-alpha',
    username: 'cashier_alpha1',
    email: 'cashier1@alpha.ng',
    full_name: 'Seyi Cashier (VI)',
    role: 'cashier',
    role_label: 'Cashier',
    permissions_json: JSON.stringify(ROLE_DEFAULT_PERMISSIONS.cashier),
    status: 'active',
    created_at: '2026-10-20T00:00:00Z',
    last_login_at: '2026-10-20T00:00:00Z',
  };
  cloudBackend.registerAuthAccount(cashierAlpha1Db, 'CashierPass#1', ['shop-alpha-1']);
  await localDb.saveUser(cashierAlpha1Db);

  const ownerAlphaDomain: User = {
    id: 'usr-owner-alpha',
    businessId: 'biz-alpha',
    username: 'owner_alpha',
    email: 'owner@alpha.ng',
    fullName: 'Chief Alpha Owner',
    role: 'business_owner',
    roleLabel: 'Business Owner',
    assignedShopIds: ['shop-alpha-1', 'shop-alpha-2'],
    permissions: [...ROLE_DEFAULT_PERMISSIONS.business_owner],
    status: 'active',
    createdAt: '2026-10-20T00:00:00Z',
    lastLoginAt: '2026-10-20T00:00:00Z',
  };

  const ownerBetaDomain: User = {
    id: 'usr-owner-beta',
    businessId: 'biz-beta',
    username: 'owner_beta',
    email: 'owner@beta.ng',
    fullName: 'Dr. Beta Owner',
    role: 'business_owner',
    roleLabel: 'Business Owner',
    assignedShopIds: ['shop-beta-1'],
    permissions: [...ROLE_DEFAULT_PERMISSIONS.business_owner],
    status: 'active',
    createdAt: '2026-10-20T00:00:00Z',
    lastLoginAt: '2026-10-20T00:00:00Z',
  };

  const cashierAlpha1Domain: User = {
    id: 'usr-cashier-alpha-1',
    businessId: 'biz-alpha',
    username: 'cashier_alpha1',
    email: 'cashier1@alpha.ng',
    fullName: 'Seyi Cashier (VI)',
    role: 'cashier',
    roleLabel: 'Cashier',
    assignedShopIds: ['shop-alpha-1'],
    permissions: [...ROLE_DEFAULT_PERMISSIONS.cashier],
    status: 'active',
    createdAt: '2026-10-20T00:00:00Z',
    lastLoginAt: '2026-10-20T00:00:00Z',
  };

  // Seed a product in shop-alpha-1 and shop-beta-1
  const prodAlpha1: DbProduct = {
    id: 'prod-alpha-rice',
    shop_id: 'shop-alpha-1',
    business_id: 'biz-alpha',
    category_id: 'cat-01',
    category_name: 'Grains',
    sku: 'RICE-10KG',
    barcode: '61500001',
    name: 'Royal Rice 10kg',
    unit: 'Bag',
    cost_price_kobo: toMinorUnits(15000),
    selling_price_kobo: toMinorUnits(20000),
    stock_quantity: 10,
    reorder_level: 2,
    tax_exempt: 0,
    is_active: 1,
    created_at: '2026-10-20T00:00:00Z',
    updated_at: '2026-10-20T00:00:00Z',
  };
  cloudBackend.seedProduct(prodAlpha1);
  await localDb.saveProduct(prodAlpha1);

  const prodBeta1: DbProduct = {
    id: 'prod-beta-med',
    shop_id: 'shop-beta-1',
    business_id: 'biz-beta',
    category_id: 'cat-02',
    category_name: 'Analgesics',
    sku: 'MED-100',
    barcode: '61500002',
    name: 'Beta Paracetamol Pack',
    unit: 'Box',
    cost_price_kobo: toMinorUnits(1200),
    selling_price_kobo: toMinorUnits(1800),
    stock_quantity: 25,
    reorder_level: 5,
    tax_exempt: 0,
    is_active: 1,
    created_at: '2026-10-20T00:00:00Z',
    updated_at: '2026-10-20T00:00:00Z',
  };
  cloudBackend.seedProduct(prodBeta1);
  await localDb.saveProduct(prodBeta1);

  return {
    localDb,
    cloudBackend,
    syncService,
    saleService,
    ownerAlphaDomain,
    ownerBetaDomain,
    cashierAlpha1Domain,
    prodAlpha1,
    prodBeta1,
  };
}

test('Phase 6 — 1. Authenticated sign-in and sign-out behavior without storing plaintext passwords', async () => {
  const { cloudBackend } = await setupPhase6Environment();

  // Valid sign-in
  const signedInUser = await cloudBackend.signIn('owner@alpha.ng', 'AlphaOwnerPass#1');
  assert.equal(signedInUser.id, 'usr-owner-alpha');
  assert.equal(signedInUser.password_hash, undefined, 'Never expose or store password_hash on user profile');
  assert.equal(cloudBackend.getActiveSessionUser()?.id, 'usr-owner-alpha');

  // Wrong password rejected
  await assert.rejects(
    cloudBackend.signIn('owner@alpha.ng', 'WrongPassword'),
    /AUTH_INVALID_CREDENTIALS/
  );

  // Sign-out clears active session
  await cloudBackend.signOut();
  assert.equal(cloudBackend.getActiveSessionUser(), null);
});

test('Phase 6 — 2. Unauthorized access rejection for unauthenticated users', async () => {
  const { cloudBackend } = await setupPhase6Environment();

  await assert.rejects(
    cloudBackend.getShopSalesForActor('', 'biz-alpha', 'shop-alpha-1'),
    /UNAUTHORIZED/
  );

  await assert.rejects(
    cloudBackend.getShopProductsForActor('non-existent-uid', 'biz-alpha', 'shop-alpha-1'),
    /UNAUTHORIZED/
  );
});

test('Phase 6 — 3. Cross-business isolation: Business A user cannot read or write Business B data', async () => {
  const { cloudBackend, syncService, ownerAlphaDomain } = await setupPhase6Environment();

  // Business A owner attempting to read Business B shop products or sales is rejected
  await assert.rejects(
    cloudBackend.getShopProductsForActor(
      ownerAlphaDomain.id,
      'biz-beta',
      'shop-beta-1'
    ),
    /FORBIDDEN_CROSS_BUSINESS/
  );

  await assert.rejects(
    cloudBackend.getBusinessSalesForOwner(ownerAlphaDomain.id, 'biz-beta'),
    /FORBIDDEN/
  );

  await assert.rejects(
    syncService.getAuthorizedLocalSales(ownerAlphaDomain, 'biz-beta', 'shop-beta-1'),
    /FORBIDDEN_CROSS_BUSINESS/
  );
});

test('Phase 6 — 4. Shop assignment restriction: manager or cashier assigned to Shop A cannot read or write Shop B data', async () => {
  const { cloudBackend, cashierAlpha1Domain } = await setupPhase6Environment();

  // Cashier assigned to shop-alpha-1 CAN read shop-alpha-1 products
  const allowedProducts = await cloudBackend.getShopProductsForActor(
    cashierAlpha1Domain.id,
    'biz-alpha',
    'shop-alpha-1'
  );
  assert.equal(allowedProducts.length, 1);

  // Cashier assigned ONLY to shop-alpha-1 CANNOT read or write shop-alpha-2 (same business, unassigned shop)
  await assert.rejects(
    cloudBackend.getShopProductsForActor(
      cashierAlpha1Domain.id,
      'biz-alpha',
      'shop-alpha-2'
    ),
    /FORBIDDEN_UNASSIGNED_SHOP/
  );

  await assert.rejects(
    cloudBackend.getShopSalesForActor(
      cashierAlpha1Domain.id,
      'biz-alpha',
      'shop-alpha-2'
    ),
    /FORBIDDEN_UNASSIGNED_SHOP/
  );
});

test('Phase 6 — 5. Cashier restriction: cashier cannot escalate role, access cost prices, or administer business', async () => {
  const { cloudBackend, cashierAlpha1Domain } = await setupPhase6Environment();

  // Cashier cannot elevate their own role to business_owner or shop_manager
  await assert.rejects(
    cloudBackend.updateUserProfileOrRole(
      cashierAlpha1Domain.id,
      cashierAlpha1Domain.id,
      { role: 'business_owner' }
    ),
    /FORBIDDEN_PRIVILEGE_ESCALATION/
  );

  // Cashier cannot add unassigned shops to their own assignedShopIds
  await assert.rejects(
    cloudBackend.updateUserProfileOrRole(
      cashierAlpha1Domain.id,
      cashierAlpha1Domain.id,
      { assignedShopIds: ['shop-alpha-1', 'shop-alpha-2'] }
    ),
    /FORBIDDEN_PRIVILEGE_ESCALATION/
  );

  // Cashier cannot create a shop or invite staff
  await assert.rejects(
    cloudBackend.createShop(cashierAlpha1Domain.id, 'biz-alpha', {
      code: 'ALP-03',
      name: 'Unauthorized Branch',
      category: 'Supermarket',
      locationCity: 'Lagos',
      address: '12 Lekki',
      phone: '+234800000000',
    }),
    /FORBIDDEN/
  );

  // Cashier product query strips cost_price_kobo
  const cashierProducts = await cloudBackend.getShopProductsForActor(
    cashierAlpha1Domain.id,
    'biz-alpha',
    'shop-alpha-1'
  );
  assert.equal(cashierProducts[0].cost_price_kobo, undefined, 'Cashiers must not receive cost_price_kobo');
});

test('Phase 6 — 6. Platform administrator provisioning & operational shop data restriction', async () => {
  const { cloudBackend } = await setupPhase6Environment();

  // Platform admin provisions a new business and its single primary owner
  const result = await cloudBackend.provisionBusinessAndOwner('usr-platform-admin', {
    idempotencyKey: 'prov-crestview-001',
    businessId: 'biz-crestview',
    name: 'Crestview Retail Group',
    businessType: 'Supermarket & Grocery Chain',
    contactEmail: 'info@crestview.ng',
    primaryPhone: '+2348099998888',
    headquartersAddress: '15 Marina, Lagos',
    ownerUserId: 'usr-owner-crestview',
    ownerName: 'Mrs. Folake Coker',
    ownerEmail: 'folake@crestview.ng',
  });

  assert.equal(result.business.id, 'biz-crestview');
  assert.equal(result.owner.id, 'usr-owner-crestview');
  assert.equal(result.owner.role, 'business_owner');
  assert.equal(result.isIdempotentReplay, false);

  // Duplicate provisioning request with same idempotencyKey is safe against duplicate creation
  const replay = await cloudBackend.provisionBusinessAndOwner('usr-platform-admin', {
    idempotencyKey: 'prov-crestview-001',
    name: 'Crestview Retail Group',
    businessType: 'Supermarket & Grocery Chain',
    contactEmail: 'info@crestview.ng',
    primaryPhone: '+2348099998888',
    headquartersAddress: '15 Marina, Lagos',
    ownerName: 'Mrs. Folake Coker',
    ownerEmail: 'folake@crestview.ng',
  });
  assert.equal(replay.isIdempotentReplay, true);
  assert.equal(replay.business.id, 'biz-crestview');

  // Platform admin does NOT automatically inherit access to shop sales or shop inventory
  await assert.rejects(
    cloudBackend.getShopSalesForActor('usr-platform-admin', 'biz-alpha', 'shop-alpha-1'),
    /FORBIDDEN_ROLE_BOUNDARY/
  );
  await assert.rejects(
    cloudBackend.getShopProductsForActor('usr-platform-admin', 'biz-alpha', 'shop-alpha-1'),
    /FORBIDDEN_ROLE_BOUNDARY/
  );
});

test('Phase 6 — 7. Single primary owner constraint: creating a second primary owner for the same business is rejected', async () => {
  const { cloudBackend } = await setupPhase6Environment();

  // Attempting to assign a second primary owner to biz-alpha without explicit ownership transfer is rejected
  await assert.rejects(
    cloudBackend.assignOrTransferPrimaryOwner('usr-platform-admin', 'biz-alpha', {
      fullName: 'Second Owner Attempt',
      email: 'secondowner@alpha.ng',
    }),
    /SINGLE_PRIMARY_OWNER_CONSTRAINT/
  );

  // Attempting to invite staff with role 'business_owner' is also rejected
  await assert.rejects(
    cloudBackend.inviteStaff('usr-owner-alpha', 'biz-alpha', {
      fullName: 'Escalated Staff',
      email: 'staff@alpha.ng',
      role: 'business_owner' as any,
      assignedShopIds: ['shop-alpha-1'],
    }),
    /FORBIDDEN_ROLE_ESCALATION/
  );
});

test('Phase 6 — 8. Offline sale queue to cloud sync: locally completed sale syncs cleanly and updates sync_queue status to synced', async () => {
  const {
    localDb,
    cloudBackend,
    syncService,
    saleService,
    cashierAlpha1Domain,
    prodAlpha1,
  } = await setupPhase6Environment();

  const cart: CartItem[] = [
    {
      product: makeDomainProduct({
        id: prodAlpha1.id,
        shopId: prodAlpha1.shop_id,
        businessId: prodAlpha1.business_id,
        name: prodAlpha1.name,
        sku: prodAlpha1.sku,
        sellingPrice: 20000,
        stockQuantity: 10,
      }),
      quantity: 2,
    },
  ];

  const saleRes = await saleService.finalizeSale({
    businessId: 'biz-alpha',
    shopId: 'shop-alpha-1',
    user: cashierAlpha1Domain,
    cart,
    paymentMethod: 'cash',
    discountAmount: 0,
    taxRatePercent: 0,
    taxAmount: 0,
    totalAmount: 40000,
    amountTendered: 40000,
    checkoutOperationId: 'op-sync-clean-01',
  });

  // Verify local sale is initially unsynced and in pending sync_queue
  const pendingBefore = await localDb.getPendingSyncQueue('shop-alpha-1');
  assert.equal(pendingBefore.length, 1);
  assert.equal(pendingBefore[0].status, 'pending');

  // Run synchronization
  const syncSummary = await syncService.syncPendingOperations(cashierAlpha1Domain, {
    shopId: 'shop-alpha-1',
  });

  assert.equal(syncSummary.syncedCount, 1);
  assert.equal(syncSummary.failedRetryableCount, 0);
  assert.equal(syncSummary.requiresReviewCount, 0);

  // Verify local sale and sync_queue entry are now marked synced with server acknowledgement
  const syncedSale = await localDb.getSale(saleRes.sale.id);
  assert.equal(syncedSale?.is_synced, 1);
  assert.ok(syncedSale?.sync_ack_id);

  // Verify cloud stock was deducted from 10 to 8
  const cloudProd = cloudBackend.getCloudProduct(prodAlpha1.id);
  assert.equal(cloudProd?.stock_quantity, 8);
});

test('Phase 6 — 9. Idempotent sync replay: replaying the same operation ID does not create duplicate cloud sales or deduct stock twice', async () => {
  const {
    cloudBackend,
    syncService,
    saleService,
    cashierAlpha1Domain,
    prodAlpha1,
  } = await setupPhase6Environment();

  const cart: CartItem[] = [
    {
      product: makeDomainProduct({
        id: prodAlpha1.id,
        shopId: prodAlpha1.shop_id,
        businessId: prodAlpha1.business_id,
        name: prodAlpha1.name,
        sku: prodAlpha1.sku,
        sellingPrice: 20000,
        stockQuantity: 10,
      }),
      quantity: 3,
    },
  ];

  const saleRes = await saleService.finalizeSale({
    businessId: 'biz-alpha',
    shopId: 'shop-alpha-1',
    user: cashierAlpha1Domain,
    cart,
    paymentMethod: 'pos_card',
    discountAmount: 0,
    taxRatePercent: 0,
    taxAmount: 0,
    totalAmount: 60000,
    amountTendered: 60000,
    checkoutOperationId: 'op-idem-replay-001',
  });

  // First sync
  await syncService.syncPendingOperations(cashierAlpha1Domain, {
    shopId: 'shop-alpha-1',
  });

  assert.equal(cloudBackend.getCloudProduct(prodAlpha1.id)?.stock_quantity, 7);
  assert.equal(cloudBackend.getCloudSalesForShop('shop-alpha-1').length, 1);

  // Replay the exact same operation directly against the cloud endpoint
  const replayResponse = await cloudBackend.processSyncOperation({
    operationId: `sync-${saleRes.sale.id}`,
    idempotencyKey: 'op-idem-replay-001',
    schemaVersion: 6,
    actorUserId: cashierAlpha1Domain.id,
    businessId: 'biz-alpha',
    shopId: 'shop-alpha-1',
    entityType: 'sale',
    entityId: saleRes.sale.id,
    operationType: 'create',
    payload: {},
  });

  assert.equal(replayResponse.outcome, 'acknowledged');
  assert.equal(replayResponse.isDuplicateReplay, true);
  // Stock must STILL be 7 (not 4!) and cloud sales count must STILL be 1
  assert.equal(cloudBackend.getCloudProduct(prodAlpha1.id)?.stock_quantity, 7);
  assert.equal(cloudBackend.getCloudSalesForShop('shop-alpha-1').length, 1);
});

test('Phase 6 — 10 & 13. Concurrent final-unit stock conflict during sync & local preservation in requires_review state', async () => {
  const {
    localDb,
    cloudBackend,
    syncService,
    saleService,
    cashierAlpha1Domain,
  } = await setupPhase6Environment();

  // Create a product with only 1 unit remaining in both cloud and local Terminal 1
  const lastUnitProd: DbProduct = {
    id: 'prod-last-unit',
    shop_id: 'shop-alpha-1',
    business_id: 'biz-alpha',
    category_id: 'cat-01',
    category_name: 'Electronics',
    sku: 'UPS-1KVA',
    barcode: '61599999',
    name: 'Smart UPS 1000VA',
    unit: 'Unit',
    cost_price_kobo: toMinorUnits(45000),
    selling_price_kobo: toMinorUnits(60000),
    stock_quantity: 1,
    reorder_level: 1,
    tax_exempt: 0,
    is_active: 1,
    created_at: '2026-10-20T00:00:00Z',
    updated_at: '2026-10-20T00:00:00Z',
  };
  cloudBackend.seedProduct(lastUnitProd);
  await localDb.saveProduct(lastUnitProd);

  // Terminal A sells the 1 unit offline and syncs first -> succeeds and reduces cloud stock to 0
  const terminal1Request = await cloudBackend.processSyncOperation({
    operationId: 'sync-term1-sale',
    idempotencyKey: 'idem-term1-final-unit',
    schemaVersion: 6,
    actorUserId: cashierAlpha1Domain.id,
    businessId: 'biz-alpha',
    shopId: 'shop-alpha-1',
    entityType: 'sale',
    entityId: 'sale-term1-01',
    operationType: 'create',
    payload: {
      sale: {
        id: 'sale-term1-01',
        shop_id: 'shop-alpha-1',
        business_id: 'biz-alpha',
        receipt_number: 'ALP-TERM1-001',
        terminal_id: 'TERM-ALP-01',
        cashier_user_id: cashierAlpha1Domain.id,
        cashier_name: cashierAlpha1Domain.fullName,
        created_at: new Date().toISOString(),
        subtotal_kobo: toMinorUnits(60000),
        discount_amount_kobo: 0,
        tax_rate_percent: 0,
        tax_amount_kobo: 0,
        total_amount_kobo: toMinorUnits(60000),
        amount_tendered_kobo: toMinorUnits(60000),
        change_due_kobo: 0,
        payment_method: 'cash',
        status: 'completed',
        idempotency_key: 'idem-term1-final-unit',
        is_synced: 0,
      },
      items: [
        {
          id: 'line-term1-1',
          sale_id: 'sale-term1-01',
          shop_id: 'shop-alpha-1',
          business_id: 'biz-alpha',
          product_id: 'prod-last-unit',
          sku: 'UPS-1KVA',
          barcode: '61599999',
          product_name: 'Smart UPS 1000VA',
          unit: 'Unit',
          unit_price_kobo: toMinorUnits(60000),
          cost_price_kobo: toMinorUnits(45000),
          quantity: 1,
          line_total_kobo: toMinorUnits(60000),
        },
      ],
    },
  });

  assert.equal(terminal1Request.outcome, 'acknowledged');
  assert.equal(cloudBackend.getCloudProduct('prod-last-unit')?.stock_quantity, 0);

  // Terminal B ALSO completed an offline sale for that 1 unit before learning cloud stock reached 0
  const term2Sale = await saleService.finalizeSale({
    businessId: 'biz-alpha',
    shopId: 'shop-alpha-1',
    user: cashierAlpha1Domain,
    cart: [
      {
        product: makeDomainProduct({
          id: 'prod-last-unit',
          shopId: 'shop-alpha-1',
          businessId: 'biz-alpha',
          name: 'Smart UPS 1000VA',
          sku: 'UPS-1KVA',
          sellingPrice: 60000,
          stockQuantity: 1,
        }),
        quantity: 1,
      },
    ],
    paymentMethod: 'cash',
    discountAmount: 0,
    taxRatePercent: 0,
    taxAmount: 0,
    totalAmount: 60000,
    amountTendered: 60000,
    checkoutOperationId: 'idem-term2-final-unit',
  });

  // When Terminal B syncs its queue, cloud backend detects 0 remaining stock and returns conflict_requires_review
  const syncResult = await syncService.syncPendingOperations(cashierAlpha1Domain, {
    shopId: 'shop-alpha-1',
  });

  assert.equal(syncResult.requiresReviewCount, 1);
  assert.equal(syncResult.syncedCount, 0);

  // CRITICAL: The completed local sale on Terminal B is PRESERVED (never erased!) and flagged for review
  const preservedLocalSale = await localDb.getSale(term2Sale.sale.id);
  assert.ok(preservedLocalSale, 'Completed offline local sale must NEVER be erased on stock conflict');
  assert.equal(preservedLocalSale?.status, 'completed');
  assert.ok(
    preservedLocalSale?.sync_conflict_reason?.includes('Stock conflict'),
    'Local sale must record stock conflict reason for manager review'
  );

  // Breakdown surfaces the conflict in requires_review state
  const breakdown = await syncService.getSyncQueueBreakdown(
    cashierAlpha1Domain,
    'biz-alpha',
    'shop-alpha-1'
  );
  assert.equal(breakdown.requiresReviewCount, 1);
  assert.equal(breakdown.conflicts.length, 1);
  assert.equal(breakdown.conflicts[0].entityId, term2Sale.sale.id);
});

test('Phase 6 — 11. Failed sync retention: network failure increments retry_count and preserves local sale and sync_queue record', async () => {
  const {
    localDb,
    cloudBackend,
    syncService,
    saleService,
    cashierAlpha1Domain,
    prodAlpha1,
  } = await setupPhase6Environment();

  const saleRes = await saleService.finalizeSale({
    businessId: 'biz-alpha',
    shopId: 'shop-alpha-1',
    user: cashierAlpha1Domain,
    cart: [
      {
        product: makeDomainProduct({
          id: prodAlpha1.id,
          shopId: prodAlpha1.shop_id,
          businessId: prodAlpha1.business_id,
          name: prodAlpha1.name,
          sku: prodAlpha1.sku,
          sellingPrice: 20000,
          stockQuantity: 10,
        }),
        quantity: 1,
      },
    ],
    paymentMethod: 'cash',
    discountAmount: 0,
    taxRatePercent: 0,
    taxAmount: 0,
    totalAmount: 20000,
    amountTendered: 20000,
    checkoutOperationId: 'op-net-fail-01',
  });

  // Simulate cloud network outage
  cloudBackend.setNetworkOutage(true);

  const failedRun = await syncService.syncPendingOperations(cashierAlpha1Domain, {
    shopId: 'shop-alpha-1',
  });
  assert.equal(failedRun.failedRetryableCount, 1);
  assert.equal(failedRun.syncedCount, 0);

  const pendingQueue = await localDb.getPendingSyncQueue('shop-alpha-1');
  assert.equal(pendingQueue.length, 1);
  assert.equal(pendingQueue[0].status, 'failed');
  assert.equal(pendingQueue[0].retry_count, 1);
  assert.ok(pendingQueue[0].error_summary?.includes('NETWORK_UNAVAILABLE'));

  // Local sale remains intact and unsynced
  const localSale = await localDb.getSale(saleRes.sale.id);
  assert.ok(localSale);
  assert.equal(localSale?.is_synced, 0);

  // Restore network and retry -> succeeds cleanly
  cloudBackend.setNetworkOutage(false);
  const recoveryRun = await syncService.syncPendingOperations(cashierAlpha1Domain, {
    shopId: 'shop-alpha-1',
  });
  assert.equal(recoveryRun.syncedCount, 1);
});

test('Phase 6 — 12. Sync acknowledgement requirement: record is NOT marked synced without verified server acknowledgement', async () => {
  const {
    localDb,
    cloudBackend,
    syncService,
    saleService,
    cashierAlpha1Domain,
    prodAlpha1,
  } = await setupPhase6Environment();

  const saleRes = await saleService.finalizeSale({
    businessId: 'biz-alpha',
    shopId: 'shop-alpha-1',
    user: cashierAlpha1Domain,
    cart: [
      {
        product: makeDomainProduct({
          id: prodAlpha1.id,
          shopId: prodAlpha1.shop_id,
          businessId: prodAlpha1.business_id,
          name: prodAlpha1.name,
          sku: prodAlpha1.sku,
          sellingPrice: 20000,
          stockQuantity: 10,
        }),
        quantity: 1,
      },
    ],
    paymentMethod: 'cash',
    discountAmount: 0,
    taxRatePercent: 0,
    taxAmount: 0,
    totalAmount: 20000,
    amountTendered: 20000,
    checkoutOperationId: 'op-missing-ack-01',
  });

  // Simulate dropped server acknowledgement (ackId omitted)
  cloudBackend.setOmitServerAcknowledgement(true);

  const runWithoutAck = await syncService.syncPendingOperations(cashierAlpha1Domain, {
    shopId: 'shop-alpha-1',
  });
  assert.equal(runWithoutAck.syncedCount, 0, 'Must NOT count as synced without ackId');
  assert.equal(runWithoutAck.failedRetryableCount, 1);

  const saleAfterDroppedAck = await localDb.getSale(saleRes.sale.id);
  assert.equal(
    saleAfterDroppedAck?.is_synced,
    0,
    'Local sale must remain is_synced = 0 when server acknowledgement is missing'
  );

  // Restore acknowledgement and retry -> idempotent replay returns ackId and marks synced
  cloudBackend.setOmitServerAcknowledgement(false);
  const runWithAck = await syncService.syncPendingOperations(cashierAlpha1Domain, {
    shopId: 'shop-alpha-1',
  });
  assert.equal(runWithAck.syncedCount, 1);
  const saleAfterValidAck = await localDb.getSale(saleRes.sale.id);
  assert.equal(saleAfterValidAck?.is_synced, 1);
  assert.ok(saleAfterValidAck?.sync_ack_id);
});

test('Phase 6 — 14. Account switch isolation: switching from User A to User B clears/blocks access to User A business, shop, and pending sync data', async () => {
  const {
    syncService,
    saleService,
    ownerAlphaDomain,
    ownerBetaDomain,
    prodAlpha1,
  } = await setupPhase6Environment();

  // Sign in as User A (Alpha Business Owner) and create an offline sale in shop-alpha-1
  syncService.setActiveActor(ownerAlphaDomain);
  await saleService.finalizeSale({
    businessId: 'biz-alpha',
    shopId: 'shop-alpha-1',
    user: ownerAlphaDomain,
    cart: [
      {
        product: makeDomainProduct({
          id: prodAlpha1.id,
          shopId: prodAlpha1.shop_id,
          businessId: prodAlpha1.business_id,
          name: prodAlpha1.name,
          sku: prodAlpha1.sku,
          sellingPrice: 20000,
          stockQuantity: 10,
        }),
        quantity: 1,
      },
    ],
    paymentMethod: 'cash',
    discountAmount: 0,
    taxRatePercent: 0,
    taxAmount: 0,
    totalAmount: 20000,
    amountTendered: 20000,
    checkoutOperationId: 'op-alpha-private-sale',
  });

  // Switch active user to User B (Beta Pharmacy Owner)
  syncService.setActiveActor(ownerBetaDomain);
  assert.equal(syncService.getActiveActor()?.id, ownerBetaDomain.id);

  // User B cannot query User A's local sales or sync queue breakdown
  await assert.rejects(
    syncService.getAuthorizedLocalSales(ownerBetaDomain, 'biz-alpha', 'shop-alpha-1'),
    /FORBIDDEN_CROSS_BUSINESS/
  );
  await assert.rejects(
    syncService.getSyncQueueBreakdown(ownerBetaDomain, 'biz-alpha', 'shop-alpha-1'),
    /FORBIDDEN_CROSS_BUSINESS/
  );

  // User B's own sync queue breakdown for biz-beta has 0 items (does not leak User A's pending sale)
  const betaBreakdown = await syncService.getSyncQueueBreakdown(
    ownerBetaDomain,
    'biz-beta',
    'shop-beta-1'
  );
  assert.equal(betaBreakdown.localPendingCount, 0);

  // When User B runs syncPendingOperations, User A's pending sale is skipped/isolated and NOT uploaded under User B
  const betaSyncRun = await syncService.syncPendingOperations(ownerBetaDomain);
  assert.equal(betaSyncRun.processedCount, 0);
  assert.equal(betaSyncRun.skippedUnauthorizedScopeCount, 1);
});

test('Phase 6 — 15. Business owner consolidated reporting: combines authorized shop data without double-counting records present both locally and in the cloud', async () => {
  const {
    syncService,
    saleService,
    ownerAlphaDomain,
    prodAlpha1,
  } = await setupPhase6Environment();

  // Sale 1: ₦20,000 completed locally AND synced to cloud (exists in BOTH localDb and cloudBackend)
  await saleService.finalizeSale({
    businessId: 'biz-alpha',
    shopId: 'shop-alpha-1',
    user: ownerAlphaDomain,
    cart: [
      {
        product: makeDomainProduct({
          id: prodAlpha1.id,
          shopId: prodAlpha1.shop_id,
          businessId: prodAlpha1.business_id,
          name: prodAlpha1.name,
          sku: prodAlpha1.sku,
          sellingPrice: 20000,
          stockQuantity: 10,
        }),
        quantity: 1,
      },
    ],
    paymentMethod: 'cash',
    discountAmount: 0,
    taxRatePercent: 0,
    taxAmount: 0,
    totalAmount: 20000,
    amountTendered: 20000,
    checkoutOperationId: 'op-consol-synced-1',
  });

  await syncService.syncPendingOperations(ownerAlphaDomain, {
    shopId: 'shop-alpha-1',
  });

  // Sale 2: ₦40,000 completed locally offline (exists ONLY in localDb, pending sync)
  await saleService.finalizeSale({
    businessId: 'biz-alpha',
    shopId: 'shop-alpha-1',
    user: ownerAlphaDomain,
    cart: [
      {
        product: makeDomainProduct({
          id: prodAlpha1.id,
          shopId: prodAlpha1.shop_id,
          businessId: prodAlpha1.business_id,
          name: prodAlpha1.name,
          sku: prodAlpha1.sku,
          sellingPrice: 20000,
          stockQuantity: 9,
        }),
        quantity: 2,
      },
    ],
    paymentMethod: 'bank_transfer',
    discountAmount: 0,
    taxRatePercent: 0,
    taxAmount: 0,
    totalAmount: 40000,
    amountTendered: 40000,
    checkoutOperationId: 'op-consol-pending-2',
  });

  const report = await syncService.getConsolidatedBusinessReport(
    ownerAlphaDomain,
    'biz-alpha',
    ['shop-alpha-1', 'shop-alpha-2']
  );

  // Must count 2 total transactions (₦20,000 + ₦40,000 = ₦60,000), NOT 3 (₦80,000)
  assert.equal(report.totalTransactionsCount, 2, 'Sale present in both local and cloud must be counted once');
  assert.equal(report.totalRevenueNaira, 60000);
  assert.equal(report.cloudConfirmedCount, 1);
  assert.equal(report.cloudConfirmedRevenueNaira, 20000);
  assert.equal(report.localPendingCount, 1);
  assert.equal(report.localPendingRevenueNaira, 40000);
});

test('Phase 6 — 16. Firebase configuration & SDK initialization smoke test: verifies projectId and firestoreDatabaseId match initialized services without exposing credentials', async () => {
  const { app, auth, db, firebaseConfig, getFirebaseConfigDiagnostics } = await import('../firebase');
  const diag = getFirebaseConfigDiagnostics();

  assert.equal(diag.isFirebaseConfigured, true);
  assert.equal(diag.hasApiKey, true);
  assert.equal(diag.hasAppId, true);
  assert.equal(diag.hasMessagingSenderId, true);
  assert.equal(diag.projectId, 'gen-lang-client-0985802946');
  assert.equal(
    diag.firestoreDatabaseId,
    'ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4'
  );

  // Verify initialized SDK instances match configured IDs
  assert.equal(app.options.projectId, firebaseConfig.projectId);
  assert.equal(auth.app.options.projectId, firebaseConfig.projectId);
  const internalDbId = (db as any)._databaseId;
  assert.equal(internalDbId?.projectId, firebaseConfig.projectId);
  assert.equal(internalDbId?.database, firebaseConfig.firestoreDatabaseId);
});

// =========================================================================
// LIVE DATA MODE VS. DEMO MODE ISOLATION & ONBOARDING VERIFICATION TESTS
// =========================================================================
import {
  BOOTSTRAP_PLATFORM_ADMIN_EMAIL,
  canBootstrapPlatformAdminIdentity,
  FirestoreCloudStoreProvider,
  LiveCloudStoreProvider,
  LiveFirestoreDataService,
  auditLocalStorageAndIndexedDb,
  isKnownDemoRecord,
  isPreFirebaseTestRecord,
  isVerifiedLiveTenant,
  quarantinePreFirebaseTestSales,
  PRE_FIREBASE_QUARANTINE_REASON,
  PRE_FIREBASE_TEST_BUSINESS_ID,
  PRE_FIREBASE_TEST_SHOP_ID,
  SPECIFIED_PRE_FIREBASE_SYNC_IDS,
  SPECIFIED_PRE_FIREBASE_SALE_IDS,
} from '../services/liveFirestoreDataService';
import { Business, SaleTransaction, Shop } from '../types/pos';
import { DEMO_BUSINESSES, DEMO_PRODUCTS, DEMO_SALES, DEMO_SHOPS, DEMO_USERS } from '../data/mockPosData';

class InMemoryLiveCloudProvider implements LiveCloudStoreProvider {
  public users = new Map<string, User>();
  public businesses = new Map<string, Business>();
  public shopsByBusiness = new Map<string, Map<string, Shop>>();
  public productsByShop = new Map<string, Map<string, Product>>();
  public salesByShop = new Map<string, Map<string, SaleTransaction>>();
  public simulateOutage = false;

  private checkOnline() {
    if (this.simulateOutage) {
      throw new Error('FirebaseError: [code=unavailable]: Client is offline');
    }
  }

  async getUserProfile(uid: string): Promise<User | null> {
    this.checkOnline();
    return this.users.get(uid) ?? null;
  }

  async saveUserProfile(user: User): Promise<void> {
    this.checkOnline();
    this.users.set(user.id, { ...user });
  }

  async getBusiness(businessId: string): Promise<Business | null> {
    this.checkOnline();
    return this.businesses.get(businessId) ?? null;
  }

  async listAllBusinesses(): Promise<Business[]> {
    this.checkOnline();
    return Array.from(this.businesses.values());
  }

  async listAllUsers(): Promise<User[]> {
    this.checkOnline();
    return Array.from(this.users.values());
  }

  async listBusinessUsers(businessId: string): Promise<User[]> {
    this.checkOnline();
    return Array.from(this.users.values()).filter((u) => u.businessId === businessId);
  }

  async saveBusiness(business: Business): Promise<void> {
    this.checkOnline();
    this.businesses.set(business.id, { ...business });
  }

  async listBusinessShops(businessId: string): Promise<Shop[]> {
    this.checkOnline();
    const map = this.shopsByBusiness.get(businessId);
    return map ? Array.from(map.values()) : [];
  }

  async getShop(businessId: string, shopId: string): Promise<Shop | null> {
    this.checkOnline();
    return this.shopsByBusiness.get(businessId)?.get(shopId) ?? null;
  }

  async saveShop(shop: Shop): Promise<void> {
    this.checkOnline();
    if (!this.shopsByBusiness.has(shop.businessId)) {
      this.shopsByBusiness.set(shop.businessId, new Map());
    }
    this.shopsByBusiness.get(shop.businessId)!.set(shop.id, { ...shop });
  }

  async listShopProducts(businessId: string, shopId: string): Promise<Product[]> {
    this.checkOnline();
    const key = `${businessId}::${shopId}`;
    const map = this.productsByShop.get(key);
    return map ? Array.from(map.values()) : [];
  }

  async saveProduct(product: Product): Promise<void> {
    this.checkOnline();
    const key = `${product.businessId}::${product.shopId}`;
    if (!this.productsByShop.has(key)) {
      this.productsByShop.set(key, new Map());
    }
    this.productsByShop.get(key)!.set(product.id, { ...product });
  }

  async deleteProduct(businessId: string, shopId: string, productId: string): Promise<void> {
    this.checkOnline();
    const key = `${businessId}::${shopId}`;
    this.productsByShop.get(key)?.delete(productId);
  }

  async listShopSales(businessId: string, shopId: string): Promise<SaleTransaction[]> {
    this.checkOnline();
    const key = `${businessId}::${shopId}`;
    const map = this.salesByShop.get(key);
    return map ? Array.from(map.values()) : [];
  }

  async saveSale(sale: SaleTransaction): Promise<void> {
    this.checkOnline();
    const key = `${sale.businessId}::${sale.shopId}`;
    if (!this.salesByShop.has(key)) {
      this.salesByShop.set(key, new Map());
    }
    this.salesByShop.get(key)!.set(sale.id, { ...sale });
  }
}

test('Live Mode Verification 1: Authenticated user with no business membership returns no_membership and never invents demo records or platform_admin', async () => {
  const localDb = new MemoryDatabaseAdapter();
  await localDb.initialize();
  const cloudProvider = new InMemoryLiveCloudProvider();
  const liveService = new LiveFirestoreDataService(cloudProvider, localDb);

  const res = await liveService.resolveAuthenticatedSession({
    uid: 'firebase-uid-new-user-99',
    email: 'newmerchant@gmail.com',
    displayName: 'New Merchant',
  });

  assert.equal(res.status, 'no_membership');
  assert.equal(res.dataMode, 'live');
  assert.equal(res.user, undefined, 'Must not invent a fallback demo user');
  assert.equal(res.dataset, undefined, 'Must not return demo dataset when user has no membership');
  assert.ok(
    res.requiredProvisioningSteps?.some((step) =>
      step.includes('/users/firebase-uid-new-user-99')
    )
  );
});

test('Live Mode Verification 2, 4 & 5: Authenticated business owner with shops loads empty product catalog and empty sales history without demo data injection', async () => {
  const localDb = new MemoryDatabaseAdapter();
  await localDb.initialize();
  // Even if demo records exist in localDb, live mode must filter them out!
  await localDb.saveProduct({
    id: DEMO_PRODUCTS[0].id,
    shop_id: DEMO_SHOPS[0].id,
    business_id: DEMO_BUSINESSES[0].id,
    category_id: 'cat-01',
    category_name: 'Grains',
    sku: DEMO_PRODUCTS[0].sku,
    barcode: DEMO_PRODUCTS[0].barcode,
    name: DEMO_PRODUCTS[0].name,
    unit: 'Bag',
    cost_price_kobo: 500000,
    selling_price_kobo: 600000,
    stock_quantity: 20,
    reorder_level: 5,
    tax_exempt: 0,
    is_active: 1,
    created_at: '2026-10-20T00:00:00Z',
    updated_at: '2026-10-20T00:00:00Z',
  });

  const cloudProvider = new InMemoryLiveCloudProvider();
  const liveService = new LiveFirestoreDataService(cloudProvider, localDb);

  // Provision real business owner with 1 real shop in cloud
  const provisioned = await liveService.provisionLiveBusinessOwnerWorkspace({
    uid: 'uid-real-owner-01',
    email: 'realowner@koforidua-retail.com',
    fullName: 'Nana Kofi Mensah',
    businessInput: {
      name: 'Koforidua Fresh Mart Ltd',
      businessType: 'Supermarket & Grocery Chain',
      ownerName: 'Nana Kofi Mensah',
      ownerEmail: 'realowner@koforidua-retail.com',
      contactEmail: 'realowner@koforidua-retail.com',
      primaryPhone: '+2348031234567',
      headquartersAddress: '14 Independence Way, Lagos',
    },
    initialShopInput: {
      name: 'Central Market Branch',
      locationCity: 'Lagos',
      address: '14 Independence Way, Lagos',
      phone: '+2348031234567',
      category: 'Supermarket',
    },
  });

  assert.equal(provisioned.status, 'ready');
  assert.equal(provisioned.dataMode, 'live');
  assert.equal(provisioned.user?.id, 'uid-real-owner-01');
  assert.equal(provisioned.user?.role, 'business_owner');
  assert.equal(provisioned.dataset?.businesses[0].name, 'Koforidua Fresh Mart Ltd');
  assert.equal(provisioned.dataset?.shops.length, 1);
  assert.equal(provisioned.dataset?.shops[0].name, 'Central Market Branch');

  // Scenario 4 & 5: Empty product catalog and empty sales history in live mode
  assert.equal(provisioned.dataset?.products.length, 0, 'Empty live shop must have 0 products (no demo products)');
  assert.equal(provisioned.dataset?.sales.length, 0, 'Empty live shop must have 0 sales (no demo sales)');
  assert.equal(provisioned.dataset?.debtCustomers.length, 0);
  assert.equal(provisioned.dataset?.suppliers.length, 0);
});

test('Live Mode Verification 3: Authenticated shop manager or cashier assigned to a specific shop only receives their assigned shop', async () => {
  const localDb = new MemoryDatabaseAdapter();
  await localDb.initialize();
  const cloudProvider = new InMemoryLiveCloudProvider();
  const liveService = new LiveFirestoreDataService(cloudProvider, localDb);

  // Setup business with 2 shops in cloudProvider
  const biz: Business = {
    id: 'biz-live-100',
    name: 'Apex Stores',
    legalName: 'Apex Stores Ltd',
    businessType: 'Supermarket & Grocery Chain',
    registrationNumber: 'RC-999111',
    taxIdentificationNumber: 'TIN-999111',
    ownerUserId: 'uid-owner-100',
    ownerName: 'Apex Owner',
    ownerEmail: 'owner@apex.com',
    contactEmail: 'owner@apex.com',
    primaryPhone: '+234800000100',
    headquartersAddress: 'Lagos',
    currencyCode: 'NGN',
    currencySymbol: '₦',
    defaultTaxRatePercent: 7.5,
    status: 'active',
    createdAt: '2026-10-24',
  };
  await cloudProvider.saveBusiness(biz);

  const shop1: Shop = {
    id: 'shp-live-branch-1',
    businessId: 'biz-live-100',
    code: 'APX-01',
    name: 'Apex Lekki Branch',
    category: 'Supermarket',
    locationCity: 'Lagos',
    address: 'Lekki Phase 1',
    phone: '+234800000101',
    managerName: 'Apex Owner',
    status: 'active',
    terminalId: 'WIN-POS-APX01',
    taxRatePercent: 7.5,
    receiptHeaderNote: 'Apex Lekki',
    receiptFooterNote: 'Thank you',
    createdAt: '2026-10-24',
    pendingSyncCount: 0,
    lastSyncedAt: '2026-10-24',
  };
  const shop2: Shop = {
    ...shop1,
    id: 'shp-live-branch-2',
    code: 'APX-02',
    name: 'Apex Surulere Branch',
  };
  await cloudProvider.saveShop(shop1);
  await cloudProvider.saveShop(shop2);

  // Cashier assigned ONLY to shp-live-branch-1
  const cashierUser: User = {
    id: 'uid-cashier-100',
    businessId: 'biz-live-100',
    username: 'cashier.lekki',
    email: 'cashier.lekki@apex.com',
    fullName: 'Tunde Cashier',
    role: 'cashier',
    roleLabel: 'Cashier',
    assignedShopIds: ['shp-live-branch-1'],
    permissions: [...ROLE_DEFAULT_PERMISSIONS.cashier],
    status: 'active',
    createdAt: '2026-10-24',
    lastLoginAt: '2026-10-24',
  };
  await cloudProvider.saveUserProfile(cashierUser);

  const res = await liveService.resolveAuthenticatedSession({
    uid: 'uid-cashier-100',
    email: 'cashier.lekki@apex.com',
    displayName: 'Tunde Cashier',
  });

  assert.equal(res.status, 'ready');
  assert.equal(res.dataset?.shops.length, 1);
  assert.equal(res.dataset?.shops[0].id, 'shp-live-branch-1');
  assert.equal(
    res.dataset?.shops.some((s: Shop) => s.id === 'shp-live-branch-2'),
    false,
    'Cashier must not be granted access to unassigned shop shp-live-branch-2'
  );
});

test('Live Mode Verification 6, 7 & 8: Creating live product & sale, account switching isolation, and Demo vs Live storage audit', async () => {
  const localDb = new MemoryDatabaseAdapter();
  await localDb.initialize();
  const cloudProvider = new InMemoryLiveCloudProvider();
  const liveService = new LiveFirestoreDataService(cloudProvider, localDb);

  // User A provisions a live business and shop
  const userARes = await liveService.provisionLiveBusinessOwnerWorkspace({
    uid: 'uid-user-a',
    email: 'usera@livebusiness.com',
    fullName: 'Owner A',
    businessInput: {
      name: 'Owner A Mart',
      businessType: 'Supermarket & Grocery Chain',
      ownerName: 'Owner A',
      ownerEmail: 'usera@livebusiness.com',
      contactEmail: 'usera@livebusiness.com',
      primaryPhone: '+2348011112222',
      headquartersAddress: 'Abuja',
    },
    initialShopInput: {
      name: 'Owner A Main Shop',
      locationCity: 'Abuja',
      address: 'Abuja Central',
      phone: '+2348011112222',
      category: 'Supermarket',
    },
  });
  assert.equal(userARes.status, 'ready');
  const bizA = userARes.dataset!.businesses[0];
  const shopA = userARes.dataset!.shops[0];

  // Scenario 6: Create a real product and complete a real sale in live mode
  const liveProduct: Product = {
    id: `prod-${shopA.id}-real-01`,
    shopId: shopA.id,
    businessId: bizA.id,
    sku: 'REAL-SKU-001',
    barcode: '890111222333',
    name: 'Real Live Organic Honey 500ml',
    categoryId: `cat-${shopA.id}-general`,
    categoryName: 'General Merchandise',
    unit: 'Bottle',
    costPrice: 3500,
    sellingPrice: 5000,
    stockQuantity: 15,
    reorderLevel: 3,
    isActive: true,
    updatedAt: '2026-10-24T12:00:00Z',
  };
  await liveService.persistLiveProduct(liveProduct);

  const liveSale: SaleTransaction = {
    id: `sale-${shopA.id}-real-01`,
    shopId: shopA.id,
    businessId: bizA.id,
    receiptNumber: 'OAM-2026-0901',
    terminalId: shopA.terminalId,
    cashierUserId: 'uid-user-a',
    cashierName: 'Owner A',
    createdAt: '2026-10-24T12:05:00Z',
    items: [
      {
        id: 'line-real-1',
        productId: liveProduct.id,
        sku: liveProduct.sku,
        barcode: liveProduct.barcode,
        productName: liveProduct.name,
        unit: liveProduct.unit,
        unitPrice: 5000,
        costPrice: 3500,
        quantity: 2,
        lineTotal: 10000,
      },
    ],
    subtotal: 10000,
    discountAmount: 0,
    taxRatePercent: 7.5,
    taxAmount: 750,
    totalAmount: 10750,
    amountTendered: 11000,
    changeDue: 250,
    paymentMethod: 'cash',
    status: 'completed',
    syncStatus: 'synced',
    notes: 'POS checkout',
  };
  await liveService.persistLiveSale(liveSale, [
    { ...liveProduct, stockQuantity: 13 },
  ]);

  // Re-resolve User A session: verifies live product and live sale are loaded from Firestore
  const userAReloaded = await liveService.resolveAuthenticatedSession({
    uid: 'uid-user-a',
    email: 'usera@livebusiness.com',
    displayName: 'Owner A',
  });
  assert.equal(userAReloaded.dataset?.products.length, 1);
  assert.equal(userAReloaded.dataset?.products[0].name, 'Real Live Organic Honey 500ml');
  assert.equal(userAReloaded.dataset?.products[0].stockQuantity, 13);
  assert.equal(userAReloaded.dataset?.sales.length, 1);
  assert.equal(userAReloaded.dataset?.sales[0].receiptNumber, 'OAM-2026-0901');

  // Scenario 7: Sign out and sign in with another account (User B)
  // User B has no membership -> must NOT see User A's business, shop, product, or sale
  const userBRes = await liveService.resolveAuthenticatedSession({
    uid: 'uid-user-b',
    email: 'userb@anothercompany.com',
    displayName: 'User B',
  });
  assert.equal(userBRes.status, 'no_membership');
  assert.equal(userBRes.dataset, undefined);

  // Even if network goes offline, User B must NOT fall back to User A's cached data or Demo data
  cloudProvider.simulateOutage = true;
  const userBOfflineRes = await liveService.resolveAuthenticatedSession({
    uid: 'uid-user-b',
    email: 'userb@anothercompany.com',
    displayName: 'User B',
  });
  assert.equal(userBOfflineRes.status, 'error');
  assert.equal(userBOfflineRes.dataset, undefined);

  // Scenario 8: Verify Demo vs. Live record classification
  assert.equal(isKnownDemoRecord(DEMO_BUSINESSES[0]), true);
  assert.equal(isKnownDemoRecord(DEMO_USERS[0]), true);
  assert.equal(isKnownDemoRecord(DEMO_PRODUCTS[0]), true);
  assert.equal(isKnownDemoRecord(DEMO_SALES[0]), true);
  assert.equal(isKnownDemoRecord(liveProduct), false);
  assert.equal(isKnownDemoRecord(liveSale), false);

  const auditReport = await auditLocalStorageAndIndexedDb(localDb);
  assert.equal(auditReport.pendingOfflineSyncCount, 0);
});

test('Live Mode Verification 9: Platform Admin live business + primary owner + first shop provisioning & pending sync queue classification', async () => {
  const localDb = new MemoryDatabaseAdapter();
  await localDb.initialize();
  const cloudProvider = new InMemoryLiveCloudProvider();
  const liveService = new LiveFirestoreDataService(cloudProvider, localDb);

  // 1. Bootstrap Platform Admin
  const adminRes = await liveService.provisionLivePlatformAdminProfile({
    uid: 'uid-platform-admin-live',
    email: 'smartnwokolo@gmail.com',
    fullName: 'SmartMind Platform Admin',
  });
  assert.equal(adminRes.status, 'ready');
  assert.equal(adminRes.user?.role, 'platform_admin');
  assert.equal(adminRes.dataset?.businesses.length, 0);
  assert.equal(adminRes.dataset?.shops.length, 0);

  // 2. Reject privilege escalation if persistLiveBusinessAndOwner is called with platform_admin role
  const testBiz = {
    id: 'biz-live-zenith',
    name: 'Zenith Mart Ltd',
    legalName: 'Zenith Mart Limited',
    businessType: 'Supermarket & Grocery Chain' as const,
    registrationNumber: 'RC-900100',
    taxIdentificationNumber: 'TIN-900100',
    ownerUserId: 'uid-owner-zenith',
    ownerName: 'Adaeze Zenith',
    ownerEmail: 'adaeze@zenithmart.ng',
    contactEmail: 'hq@zenithmart.ng',
    primaryPhone: '+2348030009999',
    headquartersAddress: '14 Admiralty Way, Lekki',
    currencyCode: 'NGN',
    currencySymbol: '₦',
    defaultTaxRatePercent: 7.5,
    status: 'active' as const,
    createdAt: '2026-10-24',
  };

  const invalidEscalatedOwner: User = {
    id: 'uid-owner-zenith',
    businessId: 'biz-live-zenith',
    username: 'adaeze',
    email: 'adaeze@zenithmart.ng',
    fullName: 'Adaeze Zenith',
    role: 'platform_admin',
    roleLabel: 'Platform Administrator',
    assignedShopIds: [],
    permissions: [],
    status: 'active',
    createdAt: '2026-10-24',
    lastLoginAt: '2026-10-24T15:00:00Z',
  };

  await assert.rejects(
    liveService.persistLiveBusinessAndOwner(testBiz, invalidEscalatedOwner),
    /SECURITY_VIOLATION/
  );

  // 3. Provision real business, primary owner (business_owner), and first shop
  const validOwner: User = {
    ...invalidEscalatedOwner,
    role: 'business_owner',
    roleLabel: 'Business Owner',
    assignedShopIds: ['shop-live-zenith-01'],
    permissions: [...ROLE_DEFAULT_PERMISSIONS.business_owner],
  };

  const firstShop: Shop = {
    id: 'shop-live-zenith-01',
    businessId: 'biz-live-zenith',
    code: 'ZEN-01',
    name: 'Zenith Mart Lekki Branch',
    category: 'Supermarket',
    locationCity: 'Lagos',
    address: '14 Admiralty Way, Lekki',
    phone: '+2348030009999',
    managerName: 'Adaeze Zenith',
    status: 'active',
    terminalId: 'TERM-ZEN-01',
    taxRatePercent: 7.5,
    receiptHeaderNote: 'Zenith Mart Ltd — Zenith Mart Lekki Branch',
    receiptFooterNote: 'Thank you for shopping with us.',
    createdAt: '2026-10-24',
    pendingSyncCount: 0,
    lastSyncedAt: 'Cloud Synced',
  };

  await liveService.persistLiveBusinessAndOwner(testBiz, validOwner, firstShop);

  // 4. Verify Platform Admin sees the business, owner, and shop in directory, but ZERO operational products/sales
  const adminReloaded = await liveService.resolveAuthenticatedSession({
    uid: 'uid-platform-admin-live',
    email: 'smartnwokolo@gmail.com',
    displayName: 'SmartMind Platform Admin',
  });
  assert.equal(adminReloaded.status, 'ready');
  assert.equal(adminReloaded.dataset?.businesses.length, 1);
  assert.equal(adminReloaded.dataset?.businesses[0].id, 'biz-live-zenith');
  assert.equal(adminReloaded.dataset?.shops.length, 1);
  assert.equal(adminReloaded.dataset?.shops[0].id, 'shop-live-zenith-01');
  assert.equal(adminReloaded.dataset?.products.length, 0);
  assert.equal(adminReloaded.dataset?.sales.length, 0);

  // 5. Verify the provisioned Primary Owner can sign in and access their business and first shop
  const ownerReloaded = await liveService.resolveAuthenticatedSession({
    uid: 'uid-owner-zenith',
    email: 'adaeze@zenithmart.ng',
    displayName: 'Adaeze Zenith',
  });
  assert.equal(ownerReloaded.status, 'ready');
  assert.equal(ownerReloaded.user?.role, 'business_owner');
  assert.equal(ownerReloaded.dataset?.businesses.length, 1);
  assert.equal(ownerReloaded.dataset?.shops.length, 1);
  assert.equal(ownerReloaded.dataset?.shops[0].id, 'shop-live-zenith-01');

  // 6. Verify Pending Sync Queue Audit classifies demo vs live sync_queue items without deleting them
  await localDb.enqueueSync({
    id: 'sync-sale-vi-demo-01',
    business_id: 'biz-emerald-01',
    shop_id: 'shop-vi-01',
    entity_type: 'sale',
    entity_id: 'sale-vi-demo-01',
    operation_type: 'create',
    payload_json: JSON.stringify({ receipt_number: 'EML-DEMO-001' }),
    status: 'pending',
    retry_count: 0,
    created_at: '2026-10-24T10:00:00Z',
  });
  await localDb.enqueueSync({
    id: 'sync-sale-live-zen-01',
    business_id: 'biz-live-zenith',
    shop_id: 'shop-live-zenith-01',
    entity_type: 'sale',
    entity_id: 'sale-live-zen-01',
    operation_type: 'create',
    payload_json: JSON.stringify({ receipt_number: 'ZEN-2026-001' }),
    status: 'pending',
    retry_count: 0,
    created_at: '2026-10-24T15:10:00Z',
  });

  const syncAudit = await auditLocalStorageAndIndexedDb(localDb);
  assert.equal(syncAudit.pendingOfflineSyncCount, 2);
  assert.equal(syncAudit.pendingSyncDemoCount, 1);
  assert.equal(syncAudit.pendingSyncLiveCount, 1);
  assert.equal(syncAudit.pendingSyncUnclassifiedCount, 0);
  assert.equal(syncAudit.pendingSyncItems.length, 2);
});

test('Live Mode Verification 10: Pre-Firebase test sales quarantine, evidence preservation, sync exclusion, idempotency, and strict tenant classification', async () => {
  const localDb = new MemoryDatabaseAdapter();
  await localDb.initialize();
  const cloudBackend = new CloudBackendService();
  const syncService = new CloudSyncService(localDb, cloudBackend);
  const saleService = new SaleFinalizationService(localDb);
  const cloudProvider = new InMemoryLiveCloudProvider();
  const liveService = new LiveFirestoreDataService(cloudProvider, localDb);

  // Seed the 4 exact pre-Firebase test sales into localDb (both sales and sync_queue)
  const fourTestSales = [
    {
      syncId: 'sync-sale-1792837064449-h1dw',
      saleId: 'sale-1792837064449-h1dw',
      receiptNumber: 'SM-TEST-0001',
      totalMinor: 1550000,
      paymentMethod: 'cash' as const,
      createdAt: '2026-10-24T14:17:44.449Z',
      customerName: 'Sensitive Test Customer 1',
      customerPhone: '+2348000000001',
    },
    {
      syncId: 'sync-sale-1792840077667-3knj',
      saleId: 'sale-1792840077667-3knj',
      receiptNumber: 'SM-TEST-0002',
      totalMinor: 2400000,
      paymentMethod: 'pos_card' as const,
      createdAt: '2026-10-24T15:07:57.667Z',
      customerName: 'Sensitive Test Customer 2',
      customerPhone: '+2348000000002',
    },
    {
      syncId: 'sync-sale-1792840085221-qjdb',
      saleId: 'sale-1792840085221-qjdb',
      receiptNumber: 'SM-TEST-0003',
      totalMinor: 890000,
      paymentMethod: 'bank_transfer' as const,
      createdAt: '2026-10-24T15:08:05.221Z',
      customerName: 'Sensitive Test Customer 3',
      customerPhone: '+2348000000003',
    },
    {
      syncId: 'sync-sale-1792840089845-kc84',
      saleId: 'sale-1792840089845-kc84',
      receiptNumber: 'SM-TEST-0004',
      totalMinor: 4200000,
      paymentMethod: 'split' as const,
      createdAt: '2026-10-24T15:08:09.845Z',
      customerName: 'Sensitive Test Customer 4',
      customerPhone: '+2348000000004',
    },
  ];

  const originalPayloadsBySyncId = new Map<string, string>();

  for (const item of fourTestSales) {
    const dbSale = {
      id: item.saleId,
      shop_id: PRE_FIREBASE_TEST_SHOP_ID,
      business_id: PRE_FIREBASE_TEST_BUSINESS_ID,
      receipt_number: item.receiptNumber,
      terminal_id: 'TERM-PRE-FIREBASE',
      cashier_user_id: 'usr-pre-firebase-test',
      cashier_name: 'Test Cashier',
      created_at: item.createdAt,
      subtotal_kobo: item.totalMinor,
      discount_amount_kobo: 0,
      tax_rate_percent: 0,
      tax_amount_kobo: 0,
      total_amount_kobo: item.totalMinor,
      amount_tendered_kobo: item.totalMinor,
      change_due_kobo: 0,
      payment_method: item.paymentMethod,
      credit_customer_name: item.customerName,
      credit_customer_phone: item.customerPhone,
      status: 'completed' as const,
      idempotency_key: `idem-${item.saleId}`,
      is_synced: 0,
    };
    const dbItems = [
      {
        id: `sitem-${item.saleId}-1`,
        sale_id: item.saleId,
        shop_id: PRE_FIREBASE_TEST_SHOP_ID,
        business_id: PRE_FIREBASE_TEST_BUSINESS_ID,
        product_id: 'prd-test-01',
        sku: 'SKU-TEST-01',
        barcode: 'SKU-TEST-01',
        product_name: 'Pre-Firebase Test Item',
        unit: 'Unit',
        unit_price_kobo: Math.floor(item.totalMinor / 2),
        cost_price_kobo: 300000,
        quantity: 2,
        line_total_kobo: item.totalMinor,
      },
    ];
    await localDb.saveSale(dbSale, dbItems);

    const payloadJson = JSON.stringify({
      sale: dbSale,
      items: dbItems,
      receipt_number: item.receiptNumber,
    });
    originalPayloadsBySyncId.set(item.syncId, payloadJson);

    await localDb.enqueueSync({
      id: item.syncId,
      business_id: PRE_FIREBASE_TEST_BUSINESS_ID,
      shop_id: PRE_FIREBASE_TEST_SHOP_ID,
      entity_type: 'sale',
      entity_id: item.saleId,
      operation_type: 'create',
      payload_json: payloadJson,
      status: 'pending',
      retry_count: 0,
      created_at: item.createdAt,
    });
  }

  // 1. Run quarantinePreFirebaseTestSales and verify all 4 entries are quarantined with exact reason
  const firstRun = await quarantinePreFirebaseTestSales(localDb);
  assert.equal(firstRun.newlyQuarantinedIds.length, 4);
  assert.equal(firstRun.alreadyQuarantinedIds.length, 0);
  assert.equal(firstRun.totalQuarantinedCount, 4);

  const allEntriesAfterFirstRun = await localDb.getAllSyncQueue();
  for (const syncId of SPECIFIED_PRE_FIREBASE_SYNC_IDS) {
    const entry = allEntriesAfterFirstRun.find((e) => e.id === syncId);
    assert.ok(entry, `Expected sync entry ${syncId} to remain preserved in sync_queue`);
    assert.equal(entry.status, 'quarantined');
    assert.equal(entry.quarantine_reason, PRE_FIREBASE_QUARANTINE_REASON);
    assert.ok(entry.quarantined_at, 'Expected quarantined_at timestamp to be recorded');

    // 2. Verify original sale payloads, receipt numbers, timestamps, amounts, payment methods, items, and local sale records remain 100% intact
    assert.equal(
      entry.payload_json,
      originalPayloadsBySyncId.get(syncId),
      `Payload JSON for ${syncId} must not be mutated during quarantine`
    );
  }

  const preservedLocalSales = await localDb.getSales({
    shopId: PRE_FIREBASE_TEST_SHOP_ID,
    businessId: PRE_FIREBASE_TEST_BUSINESS_ID,
  });
  assert.equal(preservedLocalSales.length, 4, 'All 4 local DbSale records must remain preserved');
  for (const expected of fourTestSales) {
    const localSale = preservedLocalSales.find((s) => s.id === expected.saleId);
    assert.ok(localSale, `Local sale ${expected.saleId} must be preserved`);
    assert.equal(localSale.receipt_number, expected.receiptNumber);
    assert.equal(localSale.total_amount_kobo, expected.totalMinor);
    assert.equal(localSale.payment_method, expected.paymentMethod);
    assert.equal(localSale.created_at, expected.createdAt);
    const localItems = await localDb.getSaleItems(expected.saleId);
    assert.equal(localItems.length, 1, `Local sale items for ${expected.saleId} must be preserved`);
  }

  // Verify audit logs were recorded without customer PII
  const quarantineAudits = await localDb.getAuditEvents(PRE_FIREBASE_TEST_BUSINESS_ID);
  assert.equal(quarantineAudits.length, 4);
  for (const audit of quarantineAudits) {
    assert.equal(audit.action, 'sync_entry_quarantined');
    const detailsText = audit.details_json || '';
    assert.ok(!detailsText.includes('Sensitive Test Customer'), 'Audit log must not contain customer PII');
    assert.ok(!detailsText.includes('+234800000000'), 'Audit log must not contain customer phone PII');
  }

  // 6. Verify idempotency: running quarantinePreFirebaseTestSales a second time does not duplicate or alter timestamps
  const firstRunTimestamps = new Map(
    allEntriesAfterFirstRun.map((e) => [e.id, e.quarantined_at])
  );
  const secondRun = await quarantinePreFirebaseTestSales(localDb);
  assert.equal(secondRun.newlyQuarantinedIds.length, 0);
  assert.equal(secondRun.alreadyQuarantinedIds.length, 4);
  assert.equal(secondRun.totalQuarantinedCount, 4);

  const allEntriesAfterSecondRun = await localDb.getAllSyncQueue();
  assert.equal(allEntriesAfterSecondRun.length, 4);
  for (const entry of allEntriesAfterSecondRun) {
    assert.equal(entry.quarantined_at, firstRunTimestamps.get(entry.id));
  }
  const quarantineAuditsAfterSecondRun = await localDb.getAuditEvents(PRE_FIREBASE_TEST_BUSINESS_ID);
  assert.equal(quarantineAuditsAfterSecondRun.length, 4, 'Must not duplicate quarantine audit events');

  // 7. Verify quarantined entries do NOT count as actionable pending live sales
  const auditReport = await auditLocalStorageAndIndexedDb(localDb);
  assert.equal(auditReport.pendingOfflineSyncCount, 0, 'Quarantined entries must not count toward pendingOfflineSyncCount');
  assert.equal(auditReport.pendingSyncLiveCount, 0, 'Quarantined entries must not count toward pendingSyncLiveCount');
  assert.equal(auditReport.quarantinedSyncCount, 4, 'Expected 4 quarantined entries reported separately');
  assert.equal(auditReport.quarantinedSyncItems.length, 4);

  // 3 & 7. Verify none of the 4 can be submitted to CloudSyncService, LiveFirestoreDataService, or SaleFinalizationService
  const testPreFirebaseActor: User = {
    id: 'usr-pre-firebase-test',
    businessId: PRE_FIREBASE_TEST_BUSINESS_ID,
    username: 'test_owner',
    email: 'test@local.dev',
    fullName: 'Test Owner',
    role: 'business_owner',
    roleLabel: 'Business Owner',
    assignedShopIds: [PRE_FIREBASE_TEST_SHOP_ID],
    permissions: [...ROLE_DEFAULT_PERMISSIONS.business_owner],
    status: 'active',
    createdAt: '2026-10-24',
    lastLoginAt: '2026-10-24T14:00:00Z',
  };

  const breakdown = await syncService.getSyncQueueBreakdown(
    testPreFirebaseActor,
    PRE_FIREBASE_TEST_BUSINESS_ID,
    PRE_FIREBASE_TEST_SHOP_ID
  );
  assert.equal(breakdown.localPendingCount, 0, 'Quarantined entries must not count toward localPendingCount');
  assert.equal(breakdown.quarantinedCount, 4);

  const syncRunReport = await syncService.syncPendingOperations(testPreFirebaseActor, {
    shopId: PRE_FIREBASE_TEST_SHOP_ID,
  });
  assert.equal(syncRunReport.processedCount, 0);
  assert.equal(syncRunReport.syncedCount, 0);
  assert.equal(
    cloudBackend.getCloudSalesForShop(PRE_FIREBASE_TEST_SHOP_ID).length,
    0,
    'CloudBackendService must never receive quarantined pre-Firebase sales'
  );

  await assert.rejects(
    liveService.persistLiveSale({
      id: 'sale-1792837064449-h1dw',
      receiptNumber: 'SM-TEST-0001',
      businessId: PRE_FIREBASE_TEST_BUSINESS_ID,
      shopId: PRE_FIREBASE_TEST_SHOP_ID,
      terminalId: 'TERM-PRE-FIREBASE',
      createdAt: '2026-10-24T14:17:44.449Z',
      cashierUserId: 'usr-test',
      cashierName: 'Test Cashier',
      items: [],
      subtotal: 15500,
      discountAmount: 0,
      taxRatePercent: 0,
      taxAmount: 0,
      totalAmount: 15500,
      paymentMethod: 'cash',
      amountTendered: 15500,
      changeDue: 0,
      status: 'completed',
      syncStatus: 'pending_local_queue',
    }),
    /QUARANTINE_GUARD|QUARANTINE_VIOLATION/
  );

  // 5. Verify unknown tenant IDs cannot bypass classification into 'live'
  await localDb.enqueueSync({
    id: 'sync-sale-unknown-tenant-99',
    business_id: 'biz-unknown-unverified-99',
    shop_id: 'shop-unknown-unverified-99',
    entity_type: 'sale',
    entity_id: 'sale-unknown-99',
    operation_type: 'create',
    payload_json: JSON.stringify({ receipt_number: 'UNK-001' }),
    status: 'pending',
    retry_count: 0,
    created_at: '2026-10-25T01:00:00Z',
  });
  const unknownTenantAudit = await auditLocalStorageAndIndexedDb(localDb);
  const unknownItem = unknownTenantAudit.pendingSyncItems.find(
    (i) => i.id === 'sync-sale-unknown-tenant-99'
  );
  assert.ok(unknownItem);
  assert.equal(
    unknownItem.classification,
    'unclassified',
    'Unverified tenant IDs must be classified as unclassified, never live'
  );
  assert.equal(unknownTenantAudit.pendingSyncLiveCount, 0);
  assert.equal(unknownTenantAudit.pendingSyncUnclassifiedCount, 1);

  // Clean up the unknown test item before testing legitimate offline sale
  await localDb.updateSyncStatus(
    'sync-sale-unknown-tenant-99',
    'quarantined',
    'unverified_tenant_test',
    {
      quarantinedAt: '2026-10-25T01:05:00Z',
      quarantineReason: 'unverified_tenant_test',
    }
  );

  // 4. Verify a legitimate offline sale for an authorized live tenant still queues and synchronizes cleanly
  const liveBiz: Business = {
    id: 'biz-live-crestview-01',
    name: 'Crestview Retail Ltd',
    legalName: 'Crestview Retail Limited',
    businessType: 'Supermarket & Grocery Chain',
    registrationNumber: 'RC-881122',
    taxIdentificationNumber: 'TIN-881122',
    ownerUserId: 'usr-crestview-owner',
    ownerName: 'Chidi Crestview',
    ownerEmail: 'chidi@crestview.ng',
    contactEmail: 'info@crestview.ng',
    primaryPhone: '+2348091112233',
    headquartersAddress: '22 Marina Rd, Lagos',
    currencyCode: 'NGN',
    currencySymbol: '₦',
    defaultTaxRatePercent: 7.5,
    status: 'active',
    createdAt: '2026-10-25',
  };
  const liveOwner: User = {
    id: 'usr-crestview-owner',
    businessId: liveBiz.id,
    username: 'chidi',
    email: 'chidi@crestview.ng',
    fullName: 'Chidi Crestview',
    role: 'business_owner',
    roleLabel: 'Business Owner',
    assignedShopIds: ['shop-live-crestview-01'],
    permissions: [...ROLE_DEFAULT_PERMISSIONS.business_owner],
    status: 'active',
    createdAt: '2026-10-25',
    lastLoginAt: '2026-10-25T02:00:00Z',
  };
  const liveShop: Shop = {
    id: 'shop-live-crestview-01',
    businessId: liveBiz.id,
    code: 'CRV-01',
    name: 'Crestview Marina Branch',
    category: 'Supermarket',
    locationCity: 'Lagos',
    address: '22 Marina Rd, Lagos',
    phone: '+2348091112233',
    managerName: 'Chidi Crestview',
    status: 'active',
    terminalId: 'TERM-CRV-01',
    taxRatePercent: 7.5,
    receiptHeaderNote: 'Crestview Retail Ltd',
    receiptFooterNote: 'Thank you',
    createdAt: '2026-10-25',
    pendingSyncCount: 0,
    lastSyncedAt: 'Cloud Synced',
  };

  await liveService.persistLiveBusinessAndOwner(liveBiz, liveOwner, liveShop);

  const liveProduct = makeDomainProduct({
    id: 'prd-live-crestview-rice',
    shopId: liveShop.id,
    businessId: liveBiz.id,
    name: 'Royal Stallion Parboiled Rice 50kg',
    sku: 'CRV-RICE-50',
    sellingPrice: 75000,
    costPrice: 68000,
    stockQuantity: 20,
  });
  await liveService.persistLiveProduct(liveProduct);

  cloudBackend.seedBusiness({
    id: liveBiz.id,
    name: liveBiz.name,
    legal_name: liveBiz.legalName,
    business_type: liveBiz.businessType,
    registration_number: liveBiz.registrationNumber,
    tax_identification_number: liveBiz.taxIdentificationNumber,
    owner_user_id: liveBiz.ownerUserId,
    owner_name: liveBiz.ownerName,
    owner_email: liveBiz.ownerEmail,
    contact_email: liveBiz.contactEmail,
    primary_phone: liveBiz.primaryPhone,
    headquarters_address: liveBiz.headquartersAddress,
    currency_code: liveBiz.currencyCode,
    currency_symbol: liveBiz.currencySymbol,
    default_tax_rate_percent: liveBiz.defaultTaxRatePercent,
    status: 'active',
    created_at: liveBiz.createdAt,
    updated_at: liveBiz.createdAt,
  });
  cloudBackend.seedShop({
    id: liveShop.id,
    business_id: liveBiz.id,
    code: liveShop.code,
    name: liveShop.name,
    category: liveShop.category,
    location_city: liveShop.locationCity,
    address: liveShop.address,
    phone: liveShop.phone,
    manager_name: liveShop.managerName,
    status: 'active',
    terminal_id: liveShop.terminalId,
    tax_rate_percent: liveShop.taxRatePercent,
    receipt_header_note: liveShop.receiptHeaderNote,
    receipt_footer_note: liveShop.receiptFooterNote,
    created_at: liveShop.createdAt,
    updated_at: liveShop.createdAt,
  });
  cloudBackend.registerAuthAccount(
    {
      id: liveOwner.id,
      business_id: liveBiz.id,
      username: liveOwner.username,
      email: liveOwner.email,
      full_name: liveOwner.fullName,
      role: 'business_owner',
      role_label: 'Business Owner',
      permissions_json: JSON.stringify(liveOwner.permissions),
      status: 'active',
      created_at: liveOwner.createdAt,
      last_login_at: liveOwner.lastLoginAt,
    },
    'CrestviewOwnerPass#1',
    [liveShop.id]
  );
  cloudBackend.seedProduct({
    id: liveProduct.id,
    shop_id: liveShop.id,
    business_id: liveBiz.id,
    category_id: liveProduct.categoryId,
    category_name: liveProduct.categoryName,
    sku: liveProduct.sku,
    barcode: liveProduct.barcode,
    name: liveProduct.name,
    unit: liveProduct.unit,
    selling_price_kobo: toMinorUnits(liveProduct.sellingPrice),
    cost_price_kobo: toMinorUnits(liveProduct.costPrice),
    stock_quantity: liveProduct.stockQuantity,
    reorder_level: liveProduct.reorderLevel,
    tax_exempt: 0,
    is_active: 1,
    created_at: liveProduct.updatedAt,
    updated_at: liveProduct.updatedAt,
  });

  // Also ensure demo mode is rejected by SaleFinalizationService
  await assert.rejects(
    saleService.finalizeSale({
      saleId: 'sale-demo-should-block',
      businessId: liveBiz.id,
      shopId: liveShop.id,
      user: liveOwner,
      cart: [{ product: liveProduct, quantity: 1 }],
      paymentMethod: 'cash',
      discountAmount: 0,
      taxRatePercent: 0,
      taxAmount: 0,
      totalAmount: 75000,
      amountTendered: 75000,
      dataMode: 'demo',
    }),
    /QUARANTINE_GUARD|QUARANTINE_VIOLATION/
  );

  // Authorized live offline checkout with canonical saleId
  const canonicalSaleId = 'sale-live-crestview-canonical-01';
  const liveSaleRes = await saleService.finalizeSale({
    saleId: canonicalSaleId,
    businessId: liveBiz.id,
    shopId: liveShop.id,
    user: liveOwner,
    cart: [{ product: liveProduct, quantity: 2 }],
    paymentMethod: 'cash',
    discountAmount: 0,
    taxRatePercent: 0,
    taxAmount: 0,
    totalAmount: 150000,
    amountTendered: 150000,
    dataMode: 'offline_live',
  });
  assert.equal(liveSaleRes.sale.id, canonicalSaleId, 'SaleFinalizationService must preserve the canonical saleId');
  const pendingForLiveShop = await localDb.getPendingSyncQueue(liveShop.id);
  assert.equal(pendingForLiveShop.length, 1);
  assert.equal(pendingForLiveShop[0].entity_id, canonicalSaleId);
  assert.equal(pendingForLiveShop[0].id, `sync-${canonicalSaleId}`);

  const liveAuditBeforeSync = await auditLocalStorageAndIndexedDb(localDb);
  assert.equal(liveAuditBeforeSync.pendingOfflineSyncCount, 1);
  assert.equal(liveAuditBeforeSync.pendingSyncLiveCount, 1);
  assert.equal(liveAuditBeforeSync.quarantinedSyncCount, 5); // 4 pre-Firebase + 1 unknown test

  // Synchronize the legitimate offline sale
  const liveSyncReport = await syncService.syncPendingOperations(liveOwner, {
    shopId: liveShop.id,
  });
  assert.equal(liveSyncReport.processedCount, 1);
  assert.equal(liveSyncReport.syncedCount, 1);
  assert.equal(cloudBackend.getCloudSalesForShop(liveShop.id).length, 1);
  assert.equal(
    cloudBackend.getCloudSalesForShop(PRE_FIREBASE_TEST_SHOP_ID).length,
    0,
    'Quarantined pre-Firebase sales must remain completely untouched during legitimate sync'
  );
});

import {
  CLOUD_FUNCTIONS_MANIFEST,
  EXPECTED_FIREBASE_PROJECT_ID,
  NAMED_FIRESTORE_DATABASE_ID,
  STAGING_FIREBASE_PROJECT_ID,
  ServerAuthDirectory,
  ServerDatabaseDriver,
  ServerTransactionContext,
  executeInviteAuthorizedStaff,
  executeProvisionBusinessAndPrimaryOwner,
  executeRepairBusinessOwnerAuth,
  executeSetTenantStatus,
  executeSyncPosOperation,
  resolveCurrentEnvironment,
} from '../../functions/src/core';

class InMemoryNamedFirestoreDriver implements ServerDatabaseDriver {
  public readonly databaseId: string;
  public docs = new Map<string, Record<string, any>>();
  public simulateThrowOnCommit = false;

  constructor(databaseId: string = NAMED_FIRESTORE_DATABASE_ID) {
    this.databaseId = databaseId;
  }

  async runTransaction<T>(
    updateFunction: (tx: ServerTransactionContext) => Promise<T>
  ): Promise<T> {
    const snapshot = new Map<string, Record<string, any>>();
    for (const [k, v] of this.docs.entries()) {
      snapshot.set(k, JSON.parse(JSON.stringify(v)));
    }
    const stagedWrites = new Map<string, Record<string, any>>();
    const stagedDeletes = new Set<string>();

    const txContext: ServerTransactionContext = {
      async getDoc(path: string) {
        if (stagedDeletes.has(path)) {
          return null;
        }
        if (stagedWrites.has(path)) {
          return JSON.parse(JSON.stringify(stagedWrites.get(path)!));
        }
        const existing = snapshot.get(path);
        return existing ? JSON.parse(JSON.stringify(existing)) : null;
      },
      async queryDocsByField(collectionPath: string, field: string, value: string) {
        const prefix = `${collectionPath}/`;
        const results: Array<Record<string, any>> = [];
        for (const [docPath, docData] of snapshot.entries()) {
          if (stagedDeletes.has(docPath)) continue;
          if (
            docPath.startsWith(prefix) &&
            !docPath.slice(prefix.length).includes('/') &&
            docData[field] === value
          ) {
            results.push(JSON.parse(JSON.stringify(docData)));
          }
        }
        return results;
      },
      setDoc(path: string, data: Record<string, any>) {
        stagedDeletes.delete(path);
        stagedWrites.set(path, JSON.parse(JSON.stringify(data)));
      },
      deleteDoc(path: string) {
        stagedWrites.delete(path);
        stagedDeletes.add(path);
      },
    };

    const result = await updateFunction(txContext);
    if (this.simulateThrowOnCommit) {
      throw new Error('SIMULATED_TRANSACTION_ABORT: Atomic rollback verification');
    }
    for (const path of stagedDeletes) {
      this.docs.delete(path);
    }
    for (const [path, data] of stagedWrites.entries()) {
      this.docs.set(path, data);
    }
    return result;
  }
}

class InMemoryAuthDirectory implements ServerAuthDirectory {
  private usersByEmail = new Map<
    string,
    {
      uid: string;
      email: string;
      emailVerified?: boolean;
      disabled?: boolean;
      displayName?: string;
    }
  >();
  private usersByUid = new Map<
    string,
    {
      uid: string;
      email: string;
      emailVerified?: boolean;
      disabled?: boolean;
      displayName?: string;
    }
  >();
  public createdUsers: Array<{
    uid: string;
    email: string;
    displayName: string;
    emailVerified: boolean;
    disabled: boolean;
  }> = [];

  register(uid: string, email: string, emailVerified = true, disabled = false) {
    const cleanEmail = email.trim().toLowerCase();
    const record = { uid, email: cleanEmail, emailVerified, disabled };
    this.usersByEmail.set(cleanEmail, record);
    this.usersByUid.set(uid, record);
  }

  async getUserByEmail(email: string) {
    return this.usersByEmail.get(email.trim().toLowerCase()) ?? null;
  }

  async getUserByUid(uid: string) {
    return this.usersByUid.get(uid) ?? null;
  }

  async createUser(params: {
    email: string;
    displayName: string;
    emailVerified?: boolean;
    disabled?: boolean;
  }) {
    const cleanEmail = params.email.trim().toLowerCase();
    const existing = this.usersByEmail.get(cleanEmail);
    if (existing) {
      return existing;
    }
    const slug = cleanEmail.replace(/[^a-z0-9]/g, '').slice(0, 12) || 'owner';
    const uid = `uid-auth-created-${slug}-${this.createdUsers.length + 1}`;
    const created = {
      uid,
      email: cleanEmail,
      displayName: params.displayName,
      emailVerified: params.emailVerified ?? false,
      disabled: params.disabled ?? false,
    };
    this.usersByEmail.set(cleanEmail, created);
    this.usersByUid.set(uid, created);
    this.createdUsers.push(created);
    return created;
  }
}

test('Live Mode Verification 11: Cloud Functions security, privileged business provisioning, transaction sync, stock conflicts, quarantine exclusion, and named Firestore database binding', async () => {
  // 1. Verify Named Firestore Database Binding, Manifest & Staging Environment Separation
  assert.equal(CLOUD_FUNCTIONS_MANIFEST.runtime, 'nodejs22');
  assert.equal(EXPECTED_FIREBASE_PROJECT_ID, 'gen-lang-client-0985802946');
  assert.equal(STAGING_FIREBASE_PROJECT_ID, 'smartmind-pos-staging');
  assert.equal(
    NAMED_FIRESTORE_DATABASE_ID,
    'ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4'
  );
  assert.equal(
    CLOUD_FUNCTIONS_MANIFEST.firestoreDatabaseId,
    'ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4'
  );
  assert.equal(CLOUD_FUNCTIONS_MANIFEST.stagingProjectId, 'smartmind-pos-staging');
  assert.ok(
    CLOUD_FUNCTIONS_MANIFEST.endpoints.includes('provisionBusinessAndPrimaryOwner')
  );
  assert.ok(CLOUD_FUNCTIONS_MANIFEST.endpoints.includes('syncPosOperation'));

  // Verify baseline environment resolution
  const baselineEnv = resolveCurrentEnvironment();
  assert.equal(baselineEnv.projectId, 'gen-lang-client-0985802946');
  assert.equal(
    baselineEnv.databaseId,
    'ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4'
  );

  // Verify staging resolution & cross-environment violation protection
  const originalEnv = { ...process.env };
  try {
    process.env.GCLOUD_PROJECT = 'smartmind-pos-staging';
    delete process.env.FIRESTORE_DATABASE_ID;
    delete process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID;
    const stagingRes = resolveCurrentEnvironment();
    assert.equal(stagingRes.projectId, 'smartmind-pos-staging');
    assert.equal(stagingRes.databaseId, '(default)');
    assert.equal(stagingRes.isStaging, true);

    // Verify cross-environment violation throws if staging attempts to point to production DB
    process.env.FIRESTORE_DATABASE_ID =
      'ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4';
    assert.throws(
      () => resolveCurrentEnvironment(),
      /CROSS_ENVIRONMENT_VIOLATION/
    );
  } finally {
    process.env = originalEnv;
  }

  const wrongDefaultDbDriver = new InMemoryNamedFirestoreDriver('(default)');
  const namedDbDriver = new InMemoryNamedFirestoreDriver(
    'ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4'
  );
  const authDir = new InMemoryAuthDirectory();

  const platformAdminAuth = {
    uid: 'uid-platform-admin-01',
    token: {
      email: 'smartnwokolo@gmail.com',
      email_verified: true,
    },
  };
  authDir.register('uid-platform-admin-01', 'smartnwokolo@gmail.com', true);
  authDir.register('uid-verified-owner-alpha', 'owner@alphamart.ng', true);
  authDir.register('uid-other-person', 'someoneelse@gmail.com', true);

  // Rejects default Firestore database '(default)'
  await assert.rejects(
    executeProvisionBusinessAndPrimaryOwner(
      wrongDefaultDbDriver,
      authDir,
      platformAdminAuth,
      {
        idempotencyKey: 'idem-wrong-db-01',
        name: 'Alpha Mart',
        businessType: 'Supermarket',
        contactEmail: 'hq@alphamart.ng',
        primaryPhone: '+2348031234567',
        headquartersAddress: '10 Marina Road, Lagos',
        ownerName: 'Alpha Owner',
        ownerEmail: 'owner@alphamart.ng',
      }
    ),
    /DATABASE_CONFIG_MISMATCH/
  );

  // 2. Verify Unauthorized Business Provisioning Rejection
  // 2a. Unauthenticated caller rejected
  await assert.rejects(
    executeProvisionBusinessAndPrimaryOwner(namedDbDriver, authDir, null, {
      idempotencyKey: 'idem-unauth-01',
      name: 'Alpha Mart',
      businessType: 'Supermarket',
      contactEmail: 'hq@alphamart.ng',
      primaryPhone: '+2348031234567',
      headquartersAddress: '10 Marina Road, Lagos',
      ownerName: 'Alpha Owner',
      ownerEmail: 'owner@alphamart.ng',
    }),
    /UNAUTHENTICATED/
  );

  // 2b. Unverified email rejected
  await assert.rejects(
    executeProvisionBusinessAndPrimaryOwner(
      namedDbDriver,
      authDir,
      {
        uid: 'uid-platform-admin-01',
        token: { email: 'smartnwokolo@gmail.com', email_verified: false },
      },
      {
        idempotencyKey: 'idem-unverified-01',
        name: 'Alpha Mart',
        businessType: 'Supermarket',
        contactEmail: 'hq@alphamart.ng',
        primaryPhone: '+2348031234567',
        headquartersAddress: '10 Marina Road, Lagos',
        ownerName: 'Alpha Owner',
        ownerEmail: 'owner@alphamart.ng',
      }
    ),
    /PERMISSION_DENIED/
  );

  // 2c. Ordinary user / non-admin rejected
  await assert.rejects(
    executeProvisionBusinessAndPrimaryOwner(
      namedDbDriver,
      authDir,
      {
        uid: 'uid-ordinary-user',
        token: { email: 'cashier@alphamart.ng', email_verified: true },
      },
      {
        idempotencyKey: 'idem-nonadmin-01',
        name: 'Alpha Mart',
        businessType: 'Supermarket',
        contactEmail: 'hq@alphamart.ng',
        primaryPhone: '+2348031234567',
        headquartersAddress: '10 Marina Road, Lagos',
        ownerName: 'Alpha Owner',
        ownerEmail: 'owner@alphamart.ng',
      }
    ),
    /PERMISSION_DENIED/
  );

  // 2d-pre. Verified bootstrap email alone WITHOUT an initialized /users/{uid} profile is rejected
  await assert.rejects(
    executeProvisionBusinessAndPrimaryOwner(
      namedDbDriver,
      authDir,
      platformAdminAuth,
      {
        idempotencyKey: 'idem-missing-admin-profile-01',
        name: 'Alpha Mart',
        businessType: 'Supermarket',
        contactEmail: 'hq@alphamart.ng',
        primaryPhone: '+2348031234567',
        headquartersAddress: '10 Marina Road, Lagos',
        ownerName: 'Alpha Owner',
        ownerEmail: 'owner@alphamart.ng',
      }
    ),
    /PERMISSION_DENIED.*has not been initialized/
  );

  // Initialize the active Platform Administrator profile in Firestore
  namedDbDriver.docs.set('users/uid-platform-admin-01', {
    id: 'uid-platform-admin-01',
    businessId: 'PLATFORM',
    username: 'smartnwokolo',
    email: 'smartnwokolo@gmail.com',
    fullName: 'SmartMind Platform Admin',
    role: 'platform_admin',
    roleLabel: 'Platform Administrator',
    assignedShopIds: [],
    permissions: [],
    status: 'active',
    schemaVersion: 6,
    createdAt: '2026-10-25T00:00:00Z',
    updatedAt: '2026-10-25T00:00:00Z',
  });

  // 2d. Platform Admin attempting to assign themselves as business_owner is rejected (strict separation)
  await assert.rejects(
    executeProvisionBusinessAndPrimaryOwner(
      namedDbDriver,
      authDir,
      platformAdminAuth,
      {
        idempotencyKey: 'idem-self-owner-01',
        name: 'Admin Self Business',
        businessType: 'Supermarket',
        contactEmail: 'hq@alphamart.ng',
        primaryPhone: '+2348031234567',
        headquartersAddress: '10 Marina Road, Lagos',
        ownerName: 'Admin Self',
        ownerEmail: 'smartnwokolo@gmail.com',
      }
    ),
    /PERMISSION_DENIED/
  );

  // 2e. Client-supplied ownerUid that does not match ownerEmail in Firebase Auth is rejected
  await assert.rejects(
    executeProvisionBusinessAndPrimaryOwner(
      namedDbDriver,
      authDir,
      platformAdminAuth,
      {
        idempotencyKey: 'idem-spoofed-uid-01',
        name: 'Alpha Mart',
        businessType: 'Supermarket',
        contactEmail: 'hq@alphamart.ng',
        primaryPhone: '+2348031234567',
        headquartersAddress: '10 Marina Road, Lagos',
        ownerUid: 'uid-other-person',
        ownerName: 'Alpha Owner',
        ownerEmail: 'owner@alphamart.ng',
      }
    ),
    /PERMISSION_DENIED/
  );

  // 2f. Partial failure atomicity check: if transaction aborts, zero new documents are committed
  const docCountBeforeAbort = namedDbDriver.docs.size;
  namedDbDriver.simulateThrowOnCommit = true;
  await assert.rejects(
    executeProvisionBusinessAndPrimaryOwner(
      namedDbDriver,
      authDir,
      platformAdminAuth,
      {
        idempotencyKey: 'idem-atomic-abort-01',
        businessId: 'biz-live-alpha-01',
        initialShopId: 'shop-live-alpha-01',
        name: 'Alpha Mart',
        businessType: 'Supermarket',
        contactEmail: 'hq@alphamart.ng',
        primaryPhone: '+2348031234567',
        headquartersAddress: '10 Marina Road, Lagos',
        ownerName: 'Alpha Owner',
        ownerEmail: 'owner@alphamart.ng',
      }
    ),
    /SIMULATED_TRANSACTION_ABORT/
  );
  assert.equal(
    namedDbDriver.docs.size,
    docCountBeforeAbort,
    'Atomic rollback must leave zero partial documents'
  );
  namedDbDriver.simulateThrowOnCommit = false;

  // 2g. Successful business + primary owner + first shop provisioning & idempotent retry
  const prov1 = await executeProvisionBusinessAndPrimaryOwner(
    namedDbDriver,
    authDir,
    platformAdminAuth,
    {
      idempotencyKey: 'idem-prov-alpha-01',
      businessId: 'biz-live-alpha-01',
      initialShopId: 'shop-live-alpha-01',
      name: 'Alpha Mart',
      businessType: 'Supermarket',
      contactEmail: 'hq@alphamart.ng',
      primaryPhone: '+2348031234567',
      headquartersAddress: '10 Marina Road, Lagos',
      ownerName: 'Alpha Owner',
      ownerEmail: 'owner@alphamart.ng',
    }
  );
  assert.equal(prov1.status, 'provisioned');
  assert.equal(prov1.isIdempotentReplay, false);
  assert.equal(prov1.databaseId, NAMED_FIRESTORE_DATABASE_ID);
  assert.equal(prov1.business.id, 'biz-live-alpha-01');
  assert.equal(
    prov1.primaryOwner.id,
    'uid-verified-owner-alpha',
    'Server must resolve owner UID from Firebase Auth by ownerEmail'
  );
  assert.equal(prov1.primaryOwner.role, 'business_owner');
  assert.deepEqual(prov1.primaryOwner.assignedShopIds, ['shop-live-alpha-01']);
  assert.equal(prov1.firstShop.id, 'shop-live-alpha-01');

  // Retry with same idempotencyKey returns idempotent replay without duplicating
  const docCountAfterFirstProvision = namedDbDriver.docs.size;
  const provReplay = await executeProvisionBusinessAndPrimaryOwner(
    namedDbDriver,
    authDir,
    platformAdminAuth,
    {
      idempotencyKey: 'idem-prov-alpha-01',
      businessId: 'biz-live-alpha-01',
      initialShopId: 'shop-live-alpha-01',
      name: 'Alpha Mart',
      businessType: 'Supermarket',
      contactEmail: 'hq@alphamart.ng',
      primaryPhone: '+2348031234567',
      headquartersAddress: '10 Marina Road, Lagos',
      ownerName: 'Alpha Owner',
      ownerEmail: 'owner@alphamart.ng',
    }
  );
  assert.equal(provReplay.status, 'idempotent_replay');
  assert.equal(provReplay.isIdempotentReplay, true);
  assert.equal(namedDbDriver.docs.size, docCountAfterFirstProvision);

  // Provision a second shop and a cashier assigned only to shop-live-alpha-01
  namedDbDriver.docs.set('businesses/biz-live-alpha-01/shops/shop-live-alpha-02', {
    ...prov1.firstShop,
    id: 'shop-live-alpha-02',
    code: 'AM-02',
    name: 'Alpha Mart Branch 2',
  });

  const staffInviteRes = await executeInviteAuthorizedStaff(
    namedDbDriver,
    {
      uid: 'uid-verified-owner-alpha',
      token: { email: 'owner@alphamart.ng', email_verified: true },
    },
    {
      idempotencyKey: 'idem-staff-cashier-01',
      businessId: 'biz-live-alpha-01',
      staffUid: 'uid-cashier-alpha-01',
      fullName: 'Tunde Cashier',
      email: 'tunde@alphamart.ng',
      role: 'cashier',
      assignedShopIds: ['shop-live-alpha-01'],
    }
  );
  assert.equal(staffInviteRes.status, 'created');
  assert.equal(staffInviteRes.staffUser.role, 'cashier');

  // Seed a product with 2 units in shop-live-alpha-01
  namedDbDriver.docs.set(
    'businesses/biz-live-alpha-01/shops/shop-live-alpha-01/products/prd-live-alpha-milk',
    {
      id: 'prd-live-alpha-milk',
      shopId: 'shop-live-alpha-01',
      businessId: 'biz-live-alpha-01',
      categoryId: 'cat-dairy',
      categoryName: 'Dairy',
      sku: 'AM-MILK-01',
      barcode: '61511111',
      name: 'Peak Milk Tin',
      unit: 'Tin',
      costPriceKobo: 120000,
      sellingPriceKobo: 150000,
      stockQuantity: 2,
      reorderLevel: 1,
      isActive: true,
      schemaVersion: 6,
      createdAt: '2026-10-25T00:00:00Z',
      updatedAt: '2026-10-25T00:00:00Z',
    }
  );

  // 3. Verify Quarantined Record Exclusion in Cloud Function syncPosOperation
  for (const quarantinedSyncId of SPECIFIED_PRE_FIREBASE_SYNC_IDS) {
    const qRes = await executeSyncPosOperation(
      namedDbDriver,
      {
        uid: 'uid-verified-owner-alpha',
        token: { email: 'owner@alphamart.ng', email_verified: true },
      },
      {
        operationId: quarantinedSyncId,
        idempotencyKey: `idem-${quarantinedSyncId}`,
        schemaVersion: 6,
        businessId: PRE_FIREBASE_TEST_BUSINESS_ID,
        shopId: PRE_FIREBASE_TEST_SHOP_ID,
        entityType: 'sale',
        entityId: quarantinedSyncId.replace(/^sync-/, ''),
        operationType: 'create',
        payload: {},
      }
    );
    assert.equal(qRes.outcome, 'rejected_unauthorized');
    assert.equal(qRes.status, 'failed');
    assert.match(qRes.errorMessage || '', /QUARANTINE_ENFORCED/);
  }

  // 4. Verify Cross-Business, Cross-Shop, and Platform Admin Access Denial in syncPosOperation
  // 4a. Platform Admin rejected from syncing shop transactions
  namedDbDriver.docs.set('users/uid-platform-admin-01', {
    id: 'uid-platform-admin-01',
    businessId: 'PLATFORM',
    username: 'smartnwokolo',
    email: 'smartnwokolo@gmail.com',
    fullName: 'SmartMind Platform Admin',
    role: 'platform_admin',
    roleLabel: 'Platform Administrator',
    assignedShopIds: [],
    permissions: [],
    status: 'active',
    schemaVersion: 6,
    createdAt: '2026-10-25T00:00:00Z',
    updatedAt: '2026-10-25T00:00:00Z',
  });
  const adminSyncAttempt = await executeSyncPosOperation(
    namedDbDriver,
    platformAdminAuth,
    {
      operationId: 'sync-admin-attempt-01',
      idempotencyKey: 'idem-admin-attempt-01',
      schemaVersion: 6,
      businessId: 'biz-live-alpha-01',
      shopId: 'shop-live-alpha-01',
      entityType: 'sale',
      entityId: 'sale-admin-01',
      operationType: 'create',
      payload: {},
    }
  );
  assert.equal(adminSyncAttempt.outcome, 'rejected_unauthorized');
  assert.match(adminSyncAttempt.errorMessage || '', /FORBIDDEN_ROLE_BOUNDARY/);

  // 4b. Cross-business attempt rejected
  const crossBizAttempt = await executeSyncPosOperation(
    namedDbDriver,
    {
      uid: 'uid-cashier-alpha-01',
      token: { email: 'tunde@alphamart.ng', email_verified: true },
    },
    {
      operationId: 'sync-cross-biz-01',
      idempotencyKey: 'idem-cross-biz-01',
      schemaVersion: 6,
      businessId: 'biz-live-other-99',
      shopId: 'shop-live-alpha-01',
      entityType: 'sale',
      entityId: 'sale-cross-biz-01',
      operationType: 'create',
      clientClaimedRole: 'business_owner',
      payload: {},
    }
  );
  assert.equal(crossBizAttempt.outcome, 'rejected_unauthorized');
  assert.match(crossBizAttempt.errorMessage || '', /FORBIDDEN_CROSS_BUSINESS/);

  // 4c. Cross-shop attempt (cashier assigned to shop-01 attempting shop-02, even if spoofing clientClaimedRole: 'business_owner')
  const crossShopAttempt = await executeSyncPosOperation(
    namedDbDriver,
    {
      uid: 'uid-cashier-alpha-01',
      token: { email: 'tunde@alphamart.ng', email_verified: true },
    },
    {
      operationId: 'sync-cross-shop-01',
      idempotencyKey: 'idem-cross-shop-01',
      schemaVersion: 6,
      businessId: 'biz-live-alpha-01',
      shopId: 'shop-live-alpha-02',
      entityType: 'sale',
      entityId: 'sale-cross-shop-01',
      operationType: 'create',
      clientClaimedRole: 'business_owner',
      payload: {},
    }
  );
  assert.equal(crossShopAttempt.outcome, 'rejected_unauthorized');
  assert.match(crossShopAttempt.errorMessage || '', /FORBIDDEN_UNASSIGNED_SHOP/);

  // 5. Verify Authorized Sale Sync & Duplicate Sale Submission Idempotency
  const validSalePayload = {
    sale: {
      id: 'sale-live-alpha-100',
      shop_id: 'shop-live-alpha-01',
      business_id: 'biz-live-alpha-01',
      receipt_number: 'AM-2026-0100',
      terminal_id: 'TERM-AM01',
      cashier_user_id: 'uid-cashier-alpha-01',
      cashier_name: 'Tunde Cashier',
      created_at: '2026-10-25T04:00:00Z',
      subtotal_kobo: 300000,
      discount_amount_kobo: 0,
      tax_rate_percent: 0,
      tax_amount_kobo: 0,
      total_amount_kobo: 300000,
      amount_tendered_kobo: 300000,
      change_due_kobo: 0,
      payment_method: 'cash',
      status: 'completed' as const,
      idempotency_key: 'idem-sale-alpha-100',
    },
    items: [
      {
        id: 'line-alpha-100-1',
        sale_id: 'sale-live-alpha-100',
        shop_id: 'shop-live-alpha-01',
        business_id: 'biz-live-alpha-01',
        product_id: 'prd-live-alpha-milk',
        sku: 'AM-MILK-01',
        barcode: '61511111',
        product_name: 'Peak Milk Tin',
        unit: 'Tin',
        unit_price_kobo: 150000,
        cost_price_kobo: 120000,
        quantity: 2,
        line_total_kobo: 300000,
      },
    ],
  };

  const firstSyncRes = await executeSyncPosOperation(
    namedDbDriver,
    {
      uid: 'uid-cashier-alpha-01',
      token: { email: 'tunde@alphamart.ng', email_verified: true },
    },
    {
      operationId: 'sync-sale-live-alpha-100',
      idempotencyKey: 'idem-sale-alpha-100',
      schemaVersion: 6,
      businessId: 'biz-live-alpha-01',
      shopId: 'shop-live-alpha-01',
      entityType: 'sale',
      entityId: 'sale-live-alpha-100',
      operationType: 'create',
      payload: validSalePayload,
    }
  );
  assert.equal(firstSyncRes.outcome, 'acknowledged');
  assert.equal(firstSyncRes.status, 'synced');
  assert.equal(firstSyncRes.isDuplicateReplay, false);
  assert.ok(firstSyncRes.ackId);

  // Stock deducted from 2 to 0
  const prodAfterFirstSale = namedDbDriver.docs.get(
    'businesses/biz-live-alpha-01/shops/shop-live-alpha-01/products/prd-live-alpha-milk'
  );
  assert.equal(prodAfterFirstSale?.stockQuantity, 0);

  // Duplicate submission of the exact same sale / idempotencyKey returns acknowledged without error or double deduction
  const duplicateSyncRes = await executeSyncPosOperation(
    namedDbDriver,
    {
      uid: 'uid-cashier-alpha-01',
      token: { email: 'tunde@alphamart.ng', email_verified: true },
    },
    {
      operationId: 'sync-sale-live-alpha-100',
      idempotencyKey: 'idem-sale-alpha-100',
      schemaVersion: 6,
      businessId: 'biz-live-alpha-01',
      shopId: 'shop-live-alpha-01',
      entityType: 'sale',
      entityId: 'sale-live-alpha-100',
      operationType: 'create',
      payload: validSalePayload,
    }
  );
  assert.equal(duplicateSyncRes.outcome, 'acknowledged');
  assert.equal(duplicateSyncRes.status, 'synced');
  assert.equal(duplicateSyncRes.isDuplicateReplay, true);
  assert.equal(duplicateSyncRes.ackId, firstSyncRes.ackId);

  // 6. Verify Offline Stock Conflict Returns requires_review Without Erasing Completed Sale
  const conflictingOfflineSaleRes = await executeSyncPosOperation(
    namedDbDriver,
    {
      uid: 'uid-cashier-alpha-01',
      token: { email: 'tunde@alphamart.ng', email_verified: true },
    },
    {
      operationId: 'sync-sale-live-alpha-101-conflict',
      idempotencyKey: 'idem-sale-alpha-101-conflict',
      schemaVersion: 6,
      businessId: 'biz-live-alpha-01',
      shopId: 'shop-live-alpha-01',
      entityType: 'sale',
      entityId: 'sale-live-alpha-101',
      operationType: 'create',
      payload: {
        sale: {
          ...validSalePayload.sale,
          id: 'sale-live-alpha-101',
          receipt_number: 'AM-2026-0101',
          subtotal_kobo: 150000,
          total_amount_kobo: 150000,
          amount_tendered_kobo: 150000,
          idempotency_key: 'idem-sale-alpha-101-conflict',
        },
        items: [
          {
            ...validSalePayload.items[0],
            id: 'line-alpha-101-1',
            sale_id: 'sale-live-alpha-101',
            quantity: 1,
            line_total_kobo: 150000,
          },
        ],
      },
    }
  );
  assert.equal(conflictingOfflineSaleRes.outcome, 'conflict_requires_review');
  assert.equal(conflictingOfflineSaleRes.status, 'requires_review');
  assert.match(conflictingOfflineSaleRes.conflictReason || '', /Stock conflict/);
  // Cloud stock remains 0 (never goes negative)
  assert.equal(
    namedDbDriver.docs.get(
      'businesses/biz-live-alpha-01/shops/shop-live-alpha-01/products/prd-live-alpha-milk'
    )?.stockQuantity,
    0
  );
});

test('Live Mode Verification 12: Bootstrap Administrator Identity Hardening, Unrecognized Email Rejection, and Role Separation', async () => {
  const localDb = new MemoryDatabaseAdapter();
  await localDb.initialize();
  const cloudProvider = new InMemoryLiveCloudProvider();
  const liveService = new LiveFirestoreDataService(cloudProvider, localDb);
  const namedDbDriver = new InMemoryNamedFirestoreDriver(
    'ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4'
  );
  const authDir = new InMemoryAuthDirectory();

  const unrecognizedEmail = ['s.moronfola', 'gmail.com'].join('@');

  // 1. Canonical bootstrap administrator email is strictly smartnwokolo@gmail.com
  assert.equal(BOOTSTRAP_PLATFORM_ADMIN_EMAIL, 'smartnwokolo@gmail.com');

  // 2. Unrecognized email (s.moronfola@gmail.com) cannot receive bootstrap candidate status or administrator privileges
  assert.equal(
    canBootstrapPlatformAdminIdentity({
      uid: 'uid-unrecognized-01',
      email: unrecognizedEmail,
      emailVerified: true,
    }),
    false
  );

  const unrecognizedNoProfile = await liveService.resolveAuthenticatedSession({
    uid: 'uid-unrecognized-01',
    email: unrecognizedEmail,
    displayName: 'Unrecognized Account',
    emailVerified: true,
  });
  assert.equal(unrecognizedNoProfile.status, 'no_membership');
  assert.equal(unrecognizedNoProfile.isBootstrapAdminCandidate, false);
  assert.equal(unrecognizedNoProfile.user, undefined);

  // Attempting to initialize a Platform Admin profile with the unrecognized email is blocked
  await assert.rejects(
    liveService.provisionLivePlatformAdminProfile({
      uid: 'uid-unrecognized-01',
      email: unrecognizedEmail,
      fullName: 'Unrecognized Account',
      emailVerified: true,
    }),
    /SECURITY_VIOLATION.*not authorized/
  );

  // Even if a rogue /users/{uid} record in storage had role: 'platform_admin' for the unrecognized email,
  // both frontend session resolution and backend Cloud Functions reject it
  await cloudProvider.saveUserProfile({
    id: 'uid-unrecognized-01',
    businessId: 'PLATFORM',
    username: 'unrecognized',
    email: unrecognizedEmail,
    fullName: 'Unrecognized Account',
    role: 'platform_admin',
    roleLabel: 'Platform Administrator',
    assignedShopIds: [],
    permissions: [...ROLE_DEFAULT_PERMISSIONS.platform_admin],
    status: 'active',
    createdAt: '2026-10-25',
    lastLoginAt: '2026-10-25T00:00:00Z',
  });
  const rogueProfileResolution = await liveService.resolveAuthenticatedSession({
    uid: 'uid-unrecognized-01',
    email: unrecognizedEmail,
    displayName: 'Unrecognized Account',
    emailVerified: true,
  });
  assert.equal(rogueProfileResolution.status, 'error');
  assert.equal(
    rogueProfileResolution.errorCode,
    'UNAUTHORIZED_PLATFORM_ADMIN_IDENTITY'
  );
  assert.equal(rogueProfileResolution.user, undefined);

  namedDbDriver.docs.set('users/uid-unrecognized-01', {
    id: 'uid-unrecognized-01',
    businessId: 'PLATFORM',
    username: 'unrecognized',
    email: unrecognizedEmail,
    fullName: 'Unrecognized Account',
    role: 'platform_admin',
    roleLabel: 'Platform Administrator',
    assignedShopIds: [],
    permissions: [],
    status: 'active',
    schemaVersion: 6,
    createdAt: '2026-10-25T00:00:00Z',
    updatedAt: '2026-10-25T00:00:00Z',
  });
  await assert.rejects(
    executeProvisionBusinessAndPrimaryOwner(
      namedDbDriver,
      authDir,
      {
        uid: 'uid-unrecognized-01',
        token: { email: unrecognizedEmail, email_verified: true },
      },
      {
        idempotencyKey: 'idem-unrecognized-admin-01',
        name: 'Rogue Biz',
        businessType: 'Supermarket',
        contactEmail: 'hq@rogue.ng',
        primaryPhone: '+2348000000000',
        headquartersAddress: 'Lagos',
        ownerName: 'Owner',
        ownerEmail: 'owner@rogue.ng',
      }
    ),
    /PERMISSION_DENIED.*not authorized as the Platform Administrator/
  );

  // 3. Intended administrator (smartnwokolo@gmail.com) is NOT automatically granted privileges from email alone:
  // 3a. With emailVerified == false, rejected everywhere
  assert.equal(
    canBootstrapPlatformAdminIdentity({
      uid: 'uid-smart-admin',
      email: 'smartnwokolo@gmail.com',
      emailVerified: false,
    }),
    false
  );
  const unverifiedAdminRes = await liveService.resolveAuthenticatedSession({
    uid: 'uid-smart-admin',
    email: 'smartnwokolo@gmail.com',
    displayName: 'Smart Nwokolo',
    emailVerified: false,
  });
  assert.equal(unverifiedAdminRes.status, 'error');
  assert.equal(unverifiedAdminRes.errorCode, 'EMAIL_NOT_VERIFIED');
  assert.equal(unverifiedAdminRes.isBootstrapAdminCandidate, false);

  await assert.rejects(
    liveService.provisionLivePlatformAdminProfile({
      uid: 'uid-smart-admin',
      email: 'smartnwokolo@gmail.com',
      fullName: 'Smart Nwokolo',
      emailVerified: false,
    }),
    /SECURITY_VIOLATION.*emailVerified/
  );

  // 3b. With emailVerified == true but before /users/uid-smart-admin profile exists,
  // status is 'no_membership' (never automatically granted ready platform_admin session)
  const preInitAdminRes = await liveService.resolveAuthenticatedSession({
    uid: 'uid-smart-admin',
    email: 'smartnwokolo@gmail.com',
    displayName: 'Smart Nwokolo',
    emailVerified: true,
  });
  assert.equal(preInitAdminRes.status, 'no_membership');
  assert.equal(preInitAdminRes.isBootstrapAdminCandidate, true);
  assert.equal(preInitAdminRes.user, undefined);

  // 3c. Ordinary user cannot promote themselves to Platform Administrator
  await cloudProvider.saveUserProfile({
    id: 'uid-ordinary-cashier',
    businessId: 'biz-live-100',
    username: 'cashier1',
    email: 'cashier1@merchant.ng',
    fullName: 'Ordinary Cashier',
    role: 'cashier',
    roleLabel: 'Cashier',
    assignedShopIds: ['shop-100'],
    permissions: [...ROLE_DEFAULT_PERMISSIONS.cashier],
    status: 'active',
    createdAt: '2026-10-25',
    lastLoginAt: '2026-10-25T00:00:00Z',
  });
  await assert.rejects(
    liveService.provisionLivePlatformAdminProfile({
      uid: 'uid-ordinary-cashier',
      email: 'cashier1@merchant.ng',
      fullName: 'Ordinary Cashier',
      emailVerified: true,
    }),
    /SECURITY_VIOLATION/
  );

  // 3d. Rejection of a mismatched UID in profile document (both frontend and Cloud Functions)
  cloudProvider.users.set('uid-spoofed-doc-key', {
    id: 'uid-different-inner-id',
    businessId: 'biz-platform-live',
    username: 'smartnwokolo',
    email: 'smartnwokolo@gmail.com',
    fullName: 'Smart Nwokolo',
    role: 'platform_admin',
    roleLabel: 'Platform Administrator',
    assignedShopIds: [],
    permissions: [...ROLE_DEFAULT_PERMISSIONS.platform_admin],
    status: 'active',
    createdAt: '2026-10-25',
    lastLoginAt: '2026-10-25T00:00:00Z',
  });
  const mismatchedUidRes = await liveService.resolveAuthenticatedSession({
    uid: 'uid-spoofed-doc-key',
    email: 'smartnwokolo@gmail.com',
    displayName: 'Smart Nwokolo',
    emailVerified: true,
  });
  assert.equal(mismatchedUidRes.status, 'error');
  assert.equal(
    mismatchedUidRes.errorCode,
    'UNAUTHORIZED_PLATFORM_ADMIN_IDENTITY'
  );

  namedDbDriver.docs.set('users/uid-spoofed-doc-key', {
    id: 'uid-different-inner-id',
    businessId: 'PLATFORM',
    username: 'smartnwokolo',
    email: 'smartnwokolo@gmail.com',
    fullName: 'Smart Nwokolo',
    role: 'platform_admin',
    roleLabel: 'Platform Administrator',
    assignedShopIds: [],
    permissions: [],
    status: 'active',
    schemaVersion: 6,
    createdAt: '2026-10-25T00:00:00Z',
    updatedAt: '2026-10-25T00:00:00Z',
  });
  await assert.rejects(
    executeProvisionBusinessAndPrimaryOwner(
      namedDbDriver,
      authDir,
      {
        uid: 'uid-spoofed-doc-key',
        token: { email: 'smartnwokolo@gmail.com', email_verified: true },
      },
      {
        idempotencyKey: 'idem-mismatched-uid-admin-01',
        name: 'Mismatch Biz',
        businessType: 'Supermarket',
        contactEmail: 'hq@mismatch.ng',
        primaryPhone: '+2348000000000',
        headquartersAddress: 'Lagos',
        ownerName: 'Owner',
        ownerEmail: 'owner@mismatch.ng',
      }
    ),
    /PERMISSION_DENIED.*does not match/
  );

  // 3e. Once smartnwokolo@gmail.com explicitly initializes their profile with verified auth,
  // they are authorized as Platform Administrator, remain separate from Business Owner accounts,
  // and receive zero tenant operational sales/products.
  const initializedAdminRes = await liveService.provisionLivePlatformAdminProfile({
    uid: 'uid-smart-admin',
    email: 'smartnwokolo@gmail.com',
    fullName: 'Smart Nwokolo',
    emailVerified: true,
  });
  assert.equal(initializedAdminRes.status, 'ready');
  assert.equal(initializedAdminRes.user?.id, 'uid-smart-admin');
  assert.equal(initializedAdminRes.user?.email, 'smartnwokolo@gmail.com');
  assert.equal(initializedAdminRes.user?.role, 'platform_admin');
  assert.equal(initializedAdminRes.user?.status, 'active');
  assert.equal(initializedAdminRes.dataset?.products.length, 0);
  assert.equal(initializedAdminRes.dataset?.sales.length, 0);

  // 3f. Re-running provisionLivePlatformAdminProfile is idempotent and preserves immutable createdAt & businessId
  const secondInitRes = await liveService.provisionLivePlatformAdminProfile({
    uid: 'uid-smart-admin',
    email: 'smartnwokolo@gmail.com',
    fullName: 'Smart Nwokolo',
    emailVerified: true,
  });
  assert.equal(secondInitRes.status, 'ready');
  assert.equal(
    secondInitRes.user?.createdAt,
    initializedAdminRes.user?.createdAt
  );
  assert.equal(
    secondInitRes.user?.businessId,
    initializedAdminRes.user?.businessId
  );

  await assert.rejects(
    liveService.provisionLiveBusinessOwnerWorkspace({
      uid: 'uid-smart-admin',
      email: 'smartnwokolo@gmail.com',
      fullName: 'Smart Nwokolo',
      emailVerified: true,
      businessInput: {
        name: 'Admin Owned Shop',
        businessType: 'Supermarket & Grocery Chain',
        ownerName: 'Smart Nwokolo',
        ownerEmail: 'smartnwokolo@gmail.com',
        contactEmail: 'smartnwokolo@gmail.com',
        primaryPhone: '+2348000000000',
        headquartersAddress: 'Lagos',
      },
      initialShopInput: {
        name: 'Branch 1',
        category: 'Supermarket',
        locationCity: 'Lagos',
        address: 'Lagos',
        phone: '+2348000000000',
      },
    }),
    /SECURITY_VIOLATION.*must remain separate/
  );
});

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  PLATFORM_ADMIN_BUSINESS_SENTINEL,
  isPlatformAdminBusinessSentinel,
} from '../services/liveFirestoreDataService';

test('Security Hardening Regression Suite (SEC-01, SEC-02, SEC-06, SEC-10): Sale Integrity, Initial Status, Cashier Identity, Tender/Change Arithmetic, Granular Permissions, and Unsupported Sync Rejection', async () => {
  const namedDbDriver = new InMemoryNamedFirestoreDriver(
    'ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4'
  );
  const authDir = new InMemoryAuthDirectory();

  const platformAdminAuth = {
    uid: 'uid-platform-admin-sec',
    token: { email: 'smartnwokolo@gmail.com', email_verified: true },
  };
  const ownerAuth = {
    uid: 'uid-owner-sec',
    token: { email: 'owner@sec-retail.ng', email_verified: true },
  };
  const cashierFullAuth = {
    uid: 'uid-cashier-full-sec',
    token: { email: 'cashier.full@sec-retail.ng', email_verified: true },
  };
  const cashierRestrictedAuth = {
    uid: 'uid-cashier-restricted-sec',
    token: { email: 'cashier.restricted@sec-retail.ng', email_verified: true },
  };
  const managerRestrictedAuth = {
    uid: 'uid-manager-restricted-sec',
    token: { email: 'manager.restricted@sec-retail.ng', email_verified: true },
  };
  const managerFullAuth = {
    uid: 'uid-manager-full-sec',
    token: { email: 'manager.full@sec-retail.ng', email_verified: true },
  };

  authDir.register('uid-platform-admin-sec', 'smartnwokolo@gmail.com', true);
  authDir.register('uid-owner-sec', 'owner@sec-retail.ng', true);

  namedDbDriver.docs.set('users/uid-platform-admin-sec', {
    id: 'uid-platform-admin-sec',
    businessId: 'PLATFORM',
    username: 'smartnwokolo',
    email: 'smartnwokolo@gmail.com',
    fullName: 'Smart Nwokolo',
    role: 'platform_admin',
    roleLabel: 'Platform Administrator',
    assignedShopIds: [],
    permissions: [],
    status: 'active',
    schemaVersion: 6,
    createdAt: '2026-10-26T00:00:00Z',
    updatedAt: '2026-10-26T00:00:00Z',
  });

  await executeProvisionBusinessAndPrimaryOwner(
    namedDbDriver,
    authDir,
    platformAdminAuth,
    {
      idempotencyKey: 'idem-sec-biz-01',
      businessId: 'biz-sec-01',
      initialShopId: 'shop-sec-01',
      name: 'Sec Retail Ltd',
      businessType: 'Supermarket',
      contactEmail: 'hq@sec-retail.ng',
      primaryPhone: '+2348030001111',
      headquartersAddress: '12 Broad Street, Lagos',
      ownerName: 'Sec Owner',
      ownerEmail: 'owner@sec-retail.ng',
    }
  );

  // Seed product with 10 units
  namedDbDriver.docs.set(
    'businesses/biz-sec-01/shops/shop-sec-01/products/prd-sec-rice',
    {
      id: 'prd-sec-rice',
      shopId: 'shop-sec-01',
      businessId: 'biz-sec-01',
      categoryId: 'cat-grains',
      categoryName: 'Grains',
      sku: 'SEC-RICE-50',
      barcode: '61500001',
      name: 'Royal Stallion Rice 50kg',
      unit: 'Bag',
      costPriceKobo: 4000000,
      sellingPriceKobo: 5000000,
      stockQuantity: 10,
      reorderLevel: 2,
      isActive: true,
      schemaVersion: 6,
      createdAt: '2026-10-26T00:00:00Z',
      updatedAt: '2026-10-26T00:00:00Z',
    }
  );

  // Invite cashier with standard process_sales permission (no apply_discounts)
  await executeInviteAuthorizedStaff(namedDbDriver, ownerAuth, {
    idempotencyKey: 'idem-sec-cashier-full',
    businessId: 'biz-sec-01',
    staffUid: 'uid-cashier-full-sec',
    fullName: 'Full Cashier',
    email: 'cashier.full@sec-retail.ng',
    role: 'cashier',
    assignedShopIds: ['shop-sec-01'],
    permissions: ['process_sales', 'manage_invoices'],
  });

  // Invite restricted cashier WITHOUT process_sales permission (only manage_invoices)
  await executeInviteAuthorizedStaff(namedDbDriver, ownerAuth, {
    idempotencyKey: 'idem-sec-cashier-restricted',
    businessId: 'biz-sec-01',
    staffUid: 'uid-cashier-restricted-sec',
    fullName: 'Restricted Cashier',
    email: 'cashier.restricted@sec-retail.ng',
    role: 'cashier',
    assignedShopIds: ['shop-sec-01'],
    permissions: ['manage_invoices'],
  });

  // Invite restricted shop manager WITHOUT manage_products or adjust_inventory
  await executeInviteAuthorizedStaff(namedDbDriver, ownerAuth, {
    idempotencyKey: 'idem-sec-manager-restricted',
    businessId: 'biz-sec-01',
    staffUid: 'uid-manager-restricted-sec',
    fullName: 'Restricted Manager',
    email: 'manager.restricted@sec-retail.ng',
    role: 'shop_manager',
    assignedShopIds: ['shop-sec-01'],
    permissions: ['view_shop_reports'],
  });

  // Invite full shop manager with manage_products, adjust_inventory, process_sales, apply_discounts
  await executeInviteAuthorizedStaff(namedDbDriver, ownerAuth, {
    idempotencyKey: 'idem-sec-manager-full',
    businessId: 'biz-sec-01',
    staffUid: 'uid-manager-full-sec',
    fullName: 'Full Manager',
    email: 'manager.full@sec-retail.ng',
    role: 'shop_manager',
    assignedShopIds: ['shop-sec-01'],
    permissions: [
      'manage_products',
      'adjust_inventory',
      'process_sales',
      'apply_discounts',
      'process_refunds',
    ],
  });

  const baseSaleItem = {
    id: 'item-sec-1',
    sale_id: 'sale-sec-1',
    shop_id: 'shop-sec-01',
    business_id: 'biz-sec-01',
    product_id: 'prd-sec-rice',
    sku: 'SEC-RICE-50',
    barcode: '61500001',
    product_name: 'Royal Stallion Rice 50kg',
    unit: 'Bag',
    unit_price_kobo: 5000000,
    cost_price_kobo: 4000000,
    quantity: 1,
    line_total_kobo: 5000000,
  };

  // 1. SEC-06 DENIED: Restricted cashier without 'process_sales' cannot sync a sale
  const deniedNoPermRes = await executeSyncPosOperation(
    namedDbDriver,
    cashierRestrictedAuth,
    {
      operationId: 'op-sec-noperm-1',
      idempotencyKey: 'idem-sec-noperm-1',
      schemaVersion: 6,
      businessId: 'biz-sec-01',
      shopId: 'shop-sec-01',
      entityType: 'sale',
      entityId: 'sale-sec-noperm-1',
      operationType: 'create',
      payload: {
        sale: {
          id: 'sale-sec-noperm-1',
          shop_id: 'shop-sec-01',
          business_id: 'biz-sec-01',
          receipt_number: 'SEC-001',
          terminal_id: 'TERM-01',
          cashier_user_id: 'uid-cashier-restricted-sec',
          cashier_name: 'Restricted Cashier',
          created_at: '2026-10-26T01:00:00Z',
          subtotal_kobo: 5000000,
          discount_amount_kobo: 0,
          tax_rate_percent: 0,
          tax_amount_kobo: 0,
          total_amount_kobo: 5000000,
          amount_tendered_kobo: 5000000,
          change_due_kobo: 0,
          payment_method: 'cash',
          status: 'completed',
        },
        items: [{ ...baseSaleItem, sale_id: 'sale-sec-noperm-1' }],
      },
    }
  );
  assert.equal(deniedNoPermRes.outcome, 'rejected_unauthorized');
  assert.match(deniedNoPermRes.errorMessage || '', /FORBIDDEN_MISSING_PERMISSION/);

  // 2. SEC-02 DENIED: Initial sale status must be 'completed' (reject 'refunded' or 'voided' on creation)
  const deniedInitialStatusRes = await executeSyncPosOperation(
    namedDbDriver,
    cashierFullAuth,
    {
      operationId: 'op-sec-badstatus-1',
      idempotencyKey: 'idem-sec-badstatus-1',
      schemaVersion: 6,
      businessId: 'biz-sec-01',
      shopId: 'shop-sec-01',
      entityType: 'sale',
      entityId: 'sale-sec-badstatus-1',
      operationType: 'create',
      payload: {
        sale: {
          id: 'sale-sec-badstatus-1',
          shop_id: 'shop-sec-01',
          business_id: 'biz-sec-01',
          receipt_number: 'SEC-002',
          terminal_id: 'TERM-01',
          cashier_user_id: 'uid-cashier-full-sec',
          cashier_name: 'Full Cashier',
          created_at: '2026-10-26T01:05:00Z',
          subtotal_kobo: 5000000,
          discount_amount_kobo: 0,
          tax_rate_percent: 0,
          tax_amount_kobo: 0,
          total_amount_kobo: 5000000,
          amount_tendered_kobo: 5000000,
          change_due_kobo: 0,
          payment_method: 'cash',
          status: 'refunded',
        },
        items: [{ ...baseSaleItem, sale_id: 'sale-sec-badstatus-1' }],
      },
    }
  );
  assert.equal(deniedInitialStatusRes.outcome, 'rejected_unauthorized');
  assert.match(
    deniedInitialStatusRes.errorMessage || '',
    /FORBIDDEN_INVALID_INITIAL_SALE_STATUS/
  );

  // 3. SEC-02 DENIED: Cashier cannot spoof another user's cashier_user_id
  const deniedSpoofedCashierRes = await executeSyncPosOperation(
    namedDbDriver,
    cashierFullAuth,
    {
      operationId: 'op-sec-spoofcashier-1',
      idempotencyKey: 'idem-sec-spoofcashier-1',
      schemaVersion: 6,
      businessId: 'biz-sec-01',
      shopId: 'shop-sec-01',
      entityType: 'sale',
      entityId: 'sale-sec-spoofcashier-1',
      operationType: 'create',
      payload: {
        sale: {
          id: 'sale-sec-spoofcashier-1',
          shop_id: 'shop-sec-01',
          business_id: 'biz-sec-01',
          receipt_number: 'SEC-003',
          terminal_id: 'TERM-01',
          cashier_user_id: 'uid-manager-full-sec', // Spoofed!
          cashier_name: 'Full Manager',
          created_at: '2026-10-26T01:10:00Z',
          subtotal_kobo: 5000000,
          discount_amount_kobo: 0,
          tax_rate_percent: 0,
          tax_amount_kobo: 0,
          total_amount_kobo: 5000000,
          amount_tendered_kobo: 5000000,
          change_due_kobo: 0,
          payment_method: 'cash',
          status: 'completed',
        },
        items: [{ ...baseSaleItem, sale_id: 'sale-sec-spoofcashier-1' }],
      },
    }
  );
  assert.equal(deniedSpoofedCashierRes.outcome, 'rejected_unauthorized');
  assert.match(
    deniedSpoofedCashierRes.errorMessage || '',
    /FORBIDDEN_CASHIER_IDENTITY_MISMATCH/
  );

  // 4. SEC-06 DENIED: Cashier without 'apply_discounts' cannot sync a discounted sale
  const deniedDiscountRes = await executeSyncPosOperation(
    namedDbDriver,
    cashierFullAuth,
    {
      operationId: 'op-sec-discount-1',
      idempotencyKey: 'idem-sec-discount-1',
      schemaVersion: 6,
      businessId: 'biz-sec-01',
      shopId: 'shop-sec-01',
      entityType: 'sale',
      entityId: 'sale-sec-discount-1',
      operationType: 'create',
      payload: {
        sale: {
          id: 'sale-sec-discount-1',
          shop_id: 'shop-sec-01',
          business_id: 'biz-sec-01',
          receipt_number: 'SEC-004',
          terminal_id: 'TERM-01',
          cashier_user_id: 'uid-cashier-full-sec',
          cashier_name: 'Full Cashier',
          created_at: '2026-10-26T01:15:00Z',
          subtotal_kobo: 5000000,
          discount_amount_kobo: 500000,
          tax_rate_percent: 0,
          tax_amount_kobo: 0,
          total_amount_kobo: 4500000,
          amount_tendered_kobo: 4500000,
          change_due_kobo: 0,
          payment_method: 'cash',
          status: 'completed',
        },
        items: [{ ...baseSaleItem, sale_id: 'sale-sec-discount-1' }],
      },
    }
  );
  assert.equal(deniedDiscountRes.outcome, 'rejected_unauthorized');
  assert.match(
    deniedDiscountRes.errorMessage || '',
    /FORBIDDEN_MISSING_PERMISSION.*apply_discounts/
  );

  // 5. SEC-02 DENIED: Tender and change arithmetic mismatch is flagged for review and not applied to stock
  const badTenderRes = await executeSyncPosOperation(
    namedDbDriver,
    cashierFullAuth,
    {
      operationId: 'op-sec-badtender-1',
      idempotencyKey: 'idem-sec-badtender-1',
      schemaVersion: 6,
      businessId: 'biz-sec-01',
      shopId: 'shop-sec-01',
      entityType: 'sale',
      entityId: 'sale-sec-badtender-1',
      operationType: 'create',
      payload: {
        sale: {
          id: 'sale-sec-badtender-1',
          shop_id: 'shop-sec-01',
          business_id: 'biz-sec-01',
          receipt_number: 'SEC-005',
          terminal_id: 'TERM-01',
          cashier_user_id: 'uid-cashier-full-sec',
          cashier_name: 'Full Cashier',
          created_at: '2026-10-26T01:20:00Z',
          subtotal_kobo: 5000000,
          discount_amount_kobo: 0,
          tax_rate_percent: 0,
          tax_amount_kobo: 0,
          total_amount_kobo: 5000000,
          amount_tendered_kobo: 6000000,
          change_due_kobo: 2500000, // Mismatch! 6000000 - 5000000 != 2500000
          payment_method: 'cash',
          status: 'completed',
        },
        items: [{ ...baseSaleItem, sale_id: 'sale-sec-badtender-1' }],
      },
    }
  );
  assert.equal(badTenderRes.outcome, 'conflict_requires_review');
  assert.match(
    badTenderRes.conflictReason || '',
    /tender\/change arithmetic mismatch/
  );
  // Stock remains 10
  assert.equal(
    namedDbDriver.docs.get(
      'businesses/biz-sec-01/shops/shop-sec-01/products/prd-sec-rice'
    )?.stockQuantity,
    10
  );

  // 6. SEC-02 & SEC-06 PERMITTED: Manager with 'process_sales' + 'apply_discounts' can sync a valid discounted sale
  const permittedManagerSaleRes = await executeSyncPosOperation(
    namedDbDriver,
    managerFullAuth,
    {
      operationId: 'op-sec-mgr-sale-1',
      idempotencyKey: 'idem-sec-mgr-sale-1',
      schemaVersion: 6,
      businessId: 'biz-sec-01',
      shopId: 'shop-sec-01',
      entityType: 'sale',
      entityId: 'sale-sec-mgr-1',
      operationType: 'create',
      payload: {
        sale: {
          id: 'sale-sec-mgr-1',
          shop_id: 'shop-sec-01',
          business_id: 'biz-sec-01',
          receipt_number: 'SEC-006',
          terminal_id: 'TERM-01',
          cashier_user_id: 'uid-manager-full-sec',
          cashier_name: 'Full Manager',
          created_at: '2026-10-26T01:25:00Z',
          subtotal_kobo: 5000000,
          discount_amount_kobo: 500000,
          tax_rate_percent: 0,
          tax_amount_kobo: 0,
          total_amount_kobo: 4500000,
          amount_tendered_kobo: 5000000,
          change_due_kobo: 500000,
          payment_method: 'cash',
          status: 'completed',
        },
        items: [{ ...baseSaleItem, sale_id: 'sale-sec-mgr-1' }],
      },
    }
  );
  assert.equal(permittedManagerSaleRes.outcome, 'acknowledged');
  assert.equal(permittedManagerSaleRes.status, 'synced');
  assert.equal(
    namedDbDriver.docs.get(
      'businesses/biz-sec-01/shops/shop-sec-01/products/prd-sec-rice'
    )?.stockQuantity,
    9
  );

  // 7. SEC-06 & SEC-10 DENIED: Restricted manager without 'manage_products' cannot sync product updates
  const deniedProductSyncRes = await executeSyncPosOperation(
    namedDbDriver,
    managerRestrictedAuth,
    {
      operationId: 'op-sec-prod-denied',
      idempotencyKey: 'idem-sec-prod-denied',
      schemaVersion: 6,
      businessId: 'biz-sec-01',
      shopId: 'shop-sec-01',
      entityType: 'product',
      entityId: 'prd-sec-rice',
      operationType: 'update',
      payload: {
        product: {
          id: 'prd-sec-rice',
          shopId: 'shop-sec-01',
          businessId: 'biz-sec-01',
          sellingPriceKobo: 5500000,
        },
      },
    }
  );
  assert.equal(deniedProductSyncRes.outcome, 'rejected_unauthorized');
  assert.match(
    deniedProductSyncRes.errorMessage || '',
    /FORBIDDEN_MISSING_PERMISSION.*manage_products/
  );

  // 8. SEC-10 DENIED: Unsupported sync operation (e.g. sale:delete or product:update with empty payload) is rejected, NEVER acknowledged
  const unsupportedSaleDeleteRes = await executeSyncPosOperation(
    namedDbDriver,
    ownerAuth,
    {
      operationId: 'op-sec-unsupported-del',
      idempotencyKey: 'idem-sec-unsupported-del',
      schemaVersion: 6,
      businessId: 'biz-sec-01',
      shopId: 'shop-sec-01',
      entityType: 'sale',
      entityId: 'sale-sec-mgr-1',
      operationType: 'delete',
      payload: {},
    }
  );
  assert.equal(unsupportedSaleDeleteRes.outcome, 'rejected_unauthorized');
  assert.equal(unsupportedSaleDeleteRes.status, 'failed');
  assert.match(
    unsupportedSaleDeleteRes.errorMessage || '',
    /UNSUPPORTED_SYNC_OPERATION/
  );

  const emptyProductSyncRes = await executeSyncPosOperation(
    namedDbDriver,
    managerFullAuth,
    {
      operationId: 'op-sec-empty-prod',
      idempotencyKey: 'idem-sec-empty-prod',
      schemaVersion: 6,
      businessId: 'biz-sec-01',
      shopId: 'shop-sec-01',
      entityType: 'product',
      entityId: 'prd-sec-rice',
      operationType: 'update',
      payload: {},
    }
  );
  assert.equal(emptyProductSyncRes.outcome, 'rejected_unauthorized');
  assert.match(
    emptyProductSyncRes.errorMessage || '',
    /UNSUPPORTED_SYNC_OPERATION/
  );

  // 9. SEC-06 & SEC-10 PERMITTED: Authorized manager with 'manage_products' and valid payload syncs product cleanly
  const permittedProductSyncRes = await executeSyncPosOperation(
    namedDbDriver,
    managerFullAuth,
    {
      operationId: 'op-sec-valid-prod',
      idempotencyKey: 'idem-sec-valid-prod',
      schemaVersion: 6,
      businessId: 'biz-sec-01',
      shopId: 'shop-sec-01',
      entityType: 'product',
      entityId: 'prd-sec-rice',
      operationType: 'update',
      payload: {
        product: {
          id: 'prd-sec-rice',
          shopId: 'shop-sec-01',
          businessId: 'biz-sec-01',
          sellingPriceKobo: 5200000,
        },
      },
    }
  );
  assert.equal(permittedProductSyncRes.outcome, 'acknowledged');
  assert.equal(
    namedDbDriver.docs.get(
      'businesses/biz-sec-01/shops/shop-sec-01/products/prd-sec-rice'
    )?.sellingPriceKobo,
    5200000
  );
});

test('Security Hardening Regression Suite (SEC-05, SEC-08, SEC-09, SEC-11): Platform Admin Sentinel Isolation, Staff Invitation Protections, and Tenant Status Audit Records', async () => {
  const namedDbDriver = new InMemoryNamedFirestoreDriver(
    'ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4'
  );
  const authDir = new InMemoryAuthDirectory();
  const localDb = new MemoryDatabaseAdapter();
  await localDb.initialize();
  const cloudProvider = new InMemoryLiveCloudProvider();
  const liveService = new LiveFirestoreDataService(cloudProvider, localDb);

  const platformAdminAuth = {
    uid: 'uid-admin-sec09',
    token: { email: 'smartnwokolo@gmail.com', email_verified: true },
  };
  const ownerAlphaAuth = {
    uid: 'uid-owner-alpha-sec09',
    token: { email: 'owner@alpha-sec09.ng', email_verified: true },
  };
  const ownerBetaAuth = {
    uid: 'uid-owner-beta-sec09',
    token: { email: 'owner@beta-sec09.ng', email_verified: true },
  };

  authDir.register('uid-admin-sec09', 'smartnwokolo@gmail.com', true);
  authDir.register('uid-owner-alpha-sec09', 'owner@alpha-sec09.ng', true);
  authDir.register('uid-owner-beta-sec09', 'owner@beta-sec09.ng', true);

  // 1. SEC-05: Bootstrap Platform Admin initializes with non-tenant sentinel 'PLATFORM' and 0 assignedShopIds
  const initAdminRes = await liveService.provisionLivePlatformAdminProfile({
    uid: 'uid-admin-sec09',
    email: 'smartnwokolo@gmail.com',
    fullName: 'Smart Nwokolo',
    emailVerified: true,
  });
  assert.equal(initAdminRes.status, 'ready');
  assert.equal(
    initAdminRes.user?.businessId,
    PLATFORM_ADMIN_BUSINESS_SENTINEL,
    'Platform Admin must use the canonical non-tenant sentinel PLATFORM'
  );
  assert.equal(isPlatformAdminBusinessSentinel('PLATFORM'), true);
  assert.equal(isPlatformAdminBusinessSentinel('biz-platform-live'), true);
  assert.equal(isPlatformAdminBusinessSentinel('biz-tenant-01'), false);

  namedDbDriver.docs.set('users/uid-admin-sec09', {
    id: 'uid-admin-sec09',
    businessId: 'PLATFORM',
    username: 'smartnwokolo',
    email: 'smartnwokolo@gmail.com',
    fullName: 'Smart Nwokolo',
    role: 'platform_admin',
    roleLabel: 'Platform Administrator',
    assignedShopIds: [],
    permissions: [],
    status: 'active',
    schemaVersion: 6,
    createdAt: '2026-10-26T00:00:00Z',
    updatedAt: '2026-10-26T00:00:00Z',
  });

  // SEC-05 DENIED: Provisioning a tenant business with sentinel businessId 'PLATFORM' or 'biz-platform-live' is rejected
  await assert.rejects(
    executeProvisionBusinessAndPrimaryOwner(
      namedDbDriver,
      authDir,
      platformAdminAuth,
      {
        idempotencyKey: 'idem-sentinel-biz-attempt',
        businessId: 'PLATFORM',
        name: 'Illegal Sentinel Biz',
        businessType: 'Supermarket',
        contactEmail: 'hq@alpha-sec09.ng',
        primaryPhone: '+2348000001111',
        headquartersAddress: 'Lagos',
        ownerName: 'Alpha Owner',
        ownerEmail: 'owner@alpha-sec09.ng',
      }
    ),
    /INVALID_ARGUMENT.*reserved or quarantined/
  );

  // Provision two legitimate businesses: Alpha and Beta
  await executeProvisionBusinessAndPrimaryOwner(
    namedDbDriver,
    authDir,
    platformAdminAuth,
    {
      idempotencyKey: 'idem-alpha-sec09',
      businessId: 'biz-alpha-sec09',
      initialShopId: 'shop-alpha-sec09',
      name: 'Alpha Sec09 Ltd',
      businessType: 'Supermarket',
      contactEmail: 'hq@alpha-sec09.ng',
      primaryPhone: '+2348000001111',
      headquartersAddress: 'Lagos',
      ownerName: 'Alpha Owner',
      ownerEmail: 'owner@alpha-sec09.ng',
    }
  );

  await executeProvisionBusinessAndPrimaryOwner(
    namedDbDriver,
    authDir,
    platformAdminAuth,
    {
      idempotencyKey: 'idem-beta-sec09',
      businessId: 'biz-beta-sec09',
      initialShopId: 'shop-beta-sec09',
      name: 'Beta Sec09 Ltd',
      businessType: 'Pharmacy',
      contactEmail: 'hq@beta-sec09.ng',
      primaryPhone: '+2348000002222',
      headquartersAddress: 'Abuja',
      ownerName: 'Beta Owner',
      ownerEmail: 'owner@beta-sec09.ng',
    }
  );

  // 2. SEC-09 DENIED: Staff invitation cannot overwrite an existing user profile from another tenant or a business_owner / platform_admin
  await assert.rejects(
    executeInviteAuthorizedStaff(namedDbDriver, ownerAlphaAuth, {
      idempotencyKey: 'idem-hijack-beta-owner',
      businessId: 'biz-alpha-sec09',
      staffUid: 'uid-owner-beta-sec09', // Attempting to overwrite Beta's owner by UID!
      fullName: 'Hijacked Owner',
      email: 'freshstaff@alpha-sec09.ng',
      role: 'cashier',
      assignedShopIds: ['shop-alpha-sec09'],
    }),
    /PERMISSION_DENIED.*belongs to another tenant/
  );

  await assert.rejects(
    executeInviteAuthorizedStaff(namedDbDriver, ownerAlphaAuth, {
      idempotencyKey: 'idem-hijack-admin-email',
      businessId: 'biz-alpha-sec09',
      staffUid: 'uid-new-staff-99',
      fullName: 'Admin Email Attempt',
      email: 'smartnwokolo@gmail.com',
      role: 'shop_manager',
      assignedShopIds: ['shop-alpha-sec09'],
    }),
    /PERMISSION_DENIED.*Platform Administrator/
  );

  await assert.rejects(
    executeInviteAuthorizedStaff(namedDbDriver, ownerAlphaAuth, {
      idempotencyKey: 'idem-owner-only-perm-attempt',
      businessId: 'biz-alpha-sec09',
      staffUid: 'uid-new-staff-98',
      fullName: 'Escalated Cashier',
      email: 'escalated@alpha-sec09.ng',
      role: 'cashier',
      assignedShopIds: ['shop-alpha-sec09'],
      permissions: ['process_sales', 'manage_business_settings'], // Owner-only permission!
    }),
    /PERMISSION_DENIED.*owner-only permission/
  );

  // 3. SEC-09 PERMITTED & IDEMPOTENT: Valid staff invitation creates user + idempotency key + audit event, and rejects duplicate email on a different key
  const validStaffInvite = await executeInviteAuthorizedStaff(
    namedDbDriver,
    ownerAlphaAuth,
    {
      idempotencyKey: 'idem-valid-staff-sec09',
      businessId: 'biz-alpha-sec09',
      staffUid: 'uid-staff-alpha-01',
      fullName: 'Chidi Staff',
      email: 'chidi@alpha-sec09.ng',
      role: 'shop_manager',
      assignedShopIds: ['shop-alpha-sec09'],
    }
  );
  assert.equal(validStaffInvite.status, 'created');
  assert.equal(validStaffInvite.isIdempotentReplay, false);
  assert.ok(
    namedDbDriver.docs.has(
      'businesses/biz-alpha-sec09/audit_events/aud-staff-idem-valid-staff-sec09'
    ),
    'Staff invitation must record an audit event'
  );

  // Replaying with same idempotencyKey succeeds idempotently
  const replayStaffInvite = await executeInviteAuthorizedStaff(
    namedDbDriver,
    ownerAlphaAuth,
    {
      idempotencyKey: 'idem-valid-staff-sec09',
      businessId: 'biz-alpha-sec09',
      staffUid: 'uid-staff-alpha-01',
      fullName: 'Chidi Staff',
      email: 'chidi@alpha-sec09.ng',
      role: 'shop_manager',
      assignedShopIds: ['shop-alpha-sec09'],
    }
  );
  assert.equal(replayStaffInvite.isIdempotentReplay, true);

  // Attempting to invite another user with the same email under a new idempotencyKey is rejected
  await assert.rejects(
    executeInviteAuthorizedStaff(namedDbDriver, ownerBetaAuth, {
      idempotencyKey: 'idem-duplicate-email-beta',
      businessId: 'biz-beta-sec09',
      staffUid: 'uid-staff-beta-01',
      fullName: 'Duplicate Chidi',
      email: 'chidi@alpha-sec09.ng',
      role: 'cashier',
      assignedShopIds: ['shop-beta-sec09'],
    }),
    /ALREADY_EXISTS.*already registered/
  );

  // 4. SEC-11: setTenantStatus validates databaseId, status, and businessId, and writes both subscription_events and audit_events
  await assert.rejects(
    executeSetTenantStatus(namedDbDriver, ownerAlphaAuth, {
      businessId: 'biz-alpha-sec09',
      status: 'suspended',
    }),
    /PERMISSION_DENIED/
  );

  await assert.rejects(
    executeSetTenantStatus(namedDbDriver, platformAdminAuth, {
      businessId: 'biz-alpha-sec09',
      status: 'deleted' as any,
    }),
    /INVALID_ARGUMENT.*Tenant status/
  );

  const suspendRes = await executeSetTenantStatus(
    namedDbDriver,
    platformAdminAuth,
    {
      businessId: 'biz-alpha-sec09',
      status: 'suspended',
      reason: 'Compliance verification hold',
    }
  );
  assert.equal(suspendRes.status, 'suspended');
  assert.ok(suspendRes.auditEventId);
  assert.ok(suspendRes.subscriptionEventId);
  assert.ok(
    namedDbDriver.docs.has(
      `businesses/biz-alpha-sec09/subscription_events/${suspendRes.subscriptionEventId}`
    ),
    'setTenantStatus must create a subscription_events record'
  );
  assert.ok(
    namedDbDriver.docs.has(
      `businesses/biz-alpha-sec09/audit_events/${suspendRes.auditEventId}`
    ),
    'setTenantStatus must create an audit_events record'
  );
});

test('Security Hardening Regression Suite (SEC-01, SEC-05, SEC-06, SEC-07): Firestore Security Rules Structural & Policy Verification', async () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesSource = fs.readFileSync(rulesPath, 'utf8');

  // 1. SEC-01 & SEC-02: Verify sale creation and update rules lock checkout-time financial & identity fields
  assert.match(
    rulesSource,
    /data\.subtotalKobo - data\.discountAmountKobo \+ data\.taxAmountKobo == data\.totalAmountKobo/,
    'firestore.rules must enforce sale subtotal/discount/tax/total arithmetic'
  );
  assert.match(
    rulesSource,
    /data\.changeDueKobo == data\.amountTenderedKobo - data\.totalAmountKobo/,
    'firestore.rules must enforce sale tender/change arithmetic'
  );
  assert.match(
    rulesSource,
    /request\.resource\.data\.status == 'completed'/,
    'firestore.rules must require initial sale status == completed on create'
  );
  assert.match(
    rulesSource,
    /request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasOnly\(\['status', 'syncedAt', 'syncAckId'\]\)/,
    'firestore.rules must restrict sale updates to status, syncedAt, and syncAckId'
  );
  assert.match(
    rulesSource,
    /resource\.data\.status == 'completed' &&\s*request\.resource\.data\.status in \['refunded', 'voided'\]/,
    'firestore.rules must enforce one-way status transitions from completed to refunded/voided'
  );

  // 2. SEC-05: Verify Platform Admin non-tenant sentinel enforcement
  assert.match(
    rulesSource,
    /function isPlatformAdminBusinessSentinel\(id\)/,
    'firestore.rules must define isPlatformAdminBusinessSentinel'
  );
  assert.match(
    rulesSource,
    /!isPlatformAdminBusinessSentinel\(businessId\)/,
    'firestore.rules must forbid creating a /businesses/{businessId} document using the Platform Admin sentinel'
  );

  // 3. SEC-06: Verify granular permission helpers are enforced across shop subcollections
  assert.match(rulesSource, /function hasSalesPermission\(\)/);
  assert.match(rulesSource, /function hasCataloguePermission\(\)/);
  assert.match(rulesSource, /function hasInventoryAdjustmentPermission\(\)/);
  assert.match(rulesSource, /function hasCustomerPermission\(\)/);
  assert.match(rulesSource, /function hasInvoicePermission\(\)/);
  assert.match(rulesSource, /function hasRefundOrVoidPermission\(\)/);

  // 4. SEC-07: Verify audit_events shopId scoping and cashier forgery prevention
  assert.match(
    rulesSource,
    /request\.resource\.data\.shopId in getUserProfile\(\)\.assignedShopIds/,
    'firestore.rules must scope staff audit events to their assignedShopIds'
  );

  // 5. Quarantine invariant: all 4 pre-Firebase sync IDs remain permanently blocked in firestore.rules
  for (const syncId of [
    'sync-sale-1792837064449-h1dw',
    'sync-sale-1792840077667-3knj',
    'sync-sale-1792840085221-qjdb',
    'sync-sale-1792840089845-kc84',
  ]) {
    assert.ok(
      rulesSource.includes(syncId),
      `Quarantined sync ID ${syncId} must remain blocked in firestore.rules`
    );
  }
});

test('Final Checkout Architecture Hardening: Offline durability, atomic syncPosOperation routing, verified ackId, idempotency, stock conflict preservation, atomic rollback, and permission boundaries', async () => {
  // 0. Verify direct non-transactional client sale writes are strictly forbidden on FirestoreCloudStoreProvider
  const prodProvider = new FirestoreCloudStoreProvider();
  await assert.rejects(
    prodProvider.saveSale({
      id: 'sale-direct-forbidden-01',
      shopId: 'shop-live-01',
      businessId: 'biz-live-01',
      receiptNumber: 'FORB-001',
      terminalId: 'TERM-01',
      cashierUserId: 'uid-cashier-01',
      cashierName: 'Cashier One',
      createdAt: '2026-10-26T08:00:00Z',
      items: [],
      subtotal: 1000,
      discountAmount: 0,
      taxRatePercent: 0,
      taxAmount: 0,
      totalAmount: 1000,
      amountTendered: 1000,
      changeDue: 0,
      paymentMethod: 'cash',
      status: 'completed',
      syncStatus: 'pending_local_queue',
    }),
    /DIRECT_CLIENT_SALE_WRITE_FORBIDDEN/
  );

  // Set up local offline database + atomic server transaction driver (`executeSyncPosOperation`)
  const localDb = new MemoryDatabaseAdapter();
  await localDb.initialize();
  const saleService = new SaleFinalizationService(localDb);
  const namedDbDriver = new InMemoryNamedFirestoreDriver(NAMED_FIRESTORE_DATABASE_ID);

  const bizId = 'biz-atomic-checkout-01';
  const shopId = 'shop-atomic-checkout-01';
  const ownerUid = 'uid-owner-atomic-01';
  const cashierUid = 'uid-cashier-atomic-01';
  const otherBizCashierUid = 'uid-cashier-other-biz-99';

  const business: Business = {
    id: bizId,
    name: 'Atomic Checkout Retail Ltd',
    legalName: 'Atomic Checkout Retail Limited',
    businessType: 'Supermarket & Grocery Chain',
    registrationNumber: 'RC-777001',
    taxIdentificationNumber: 'TIN-777001',
    ownerUserId: ownerUid,
    ownerName: 'Adaeze Atomic',
    ownerEmail: 'adaeze@atomicretail.ng',
    contactEmail: 'adaeze@atomicretail.ng',
    primaryPhone: '+2348035550101',
    headquartersAddress: '10 Victoria Island, Lagos',
    currencyCode: 'NGN',
    currencySymbol: '₦',
    defaultTaxRatePercent: 7.5,
    status: 'active',
    createdAt: '2026-10-26',
  };

  const shop: Shop = {
    id: shopId,
    businessId: bizId,
    code: 'ATM-01',
    name: 'Atomic VI Flagship',
    category: 'Supermarket',
    locationCity: 'Lagos',
    address: '10 Victoria Island, Lagos',
    phone: '+2348035550101',
    managerName: 'Adaeze Atomic',
    status: 'active',
    terminalId: 'TERM-ATM-01',
    taxRatePercent: 7.5,
    receiptHeaderNote: 'Atomic VI Flagship',
    receiptFooterNote: 'Thank you',
    createdAt: '2026-10-26',
    pendingSyncCount: 0,
    lastSyncedAt: '2026-10-26',
  };

  const cashierUser: User = {
    id: cashierUid,
    businessId: bizId,
    username: 'cashier.atomic',
    email: 'cashier@atomicretail.ng',
    fullName: 'Bolanle Cashier',
    role: 'cashier',
    roleLabel: 'Cashier',
    assignedShopIds: [shopId],
    permissions: [...ROLE_DEFAULT_PERMISSIONS.cashier],
    status: 'active',
    createdAt: '2026-10-26',
    lastLoginAt: '2026-10-26T08:00:00Z',
  };

  const otherBizCashier: User = {
    ...cashierUser,
    id: otherBizCashierUid,
    businessId: 'biz-other-99',
    email: 'cashier@otherbiz.ng',
    assignedShopIds: ['shop-other-99'],
  };

  const prodRice: Product = {
    id: 'prd-atomic-rice-50kg',
    shopId,
    businessId: bizId,
    categoryId: `cat-${shopId}-grains`,
    categoryName: 'Grains',
    sku: 'ATM-RICE-50',
    barcode: '890777001',
    name: 'Mama Gold Parboiled Rice 50kg',
    unit: 'Bag',
    costPrice: 65000,
    sellingPrice: 75000,
    stockQuantity: 10,
    reorderLevel: 2,
    isActive: true,
    updatedAt: '2026-10-26T08:00:00Z',
  };

  const prodOil: Product = {
    id: 'prd-atomic-oil-5l',
    shopId,
    businessId: bizId,
    categoryId: `cat-${shopId}-oils`,
    categoryName: 'Cooking Oils',
    sku: 'ATM-OIL-5L',
    barcode: '890777002',
    name: 'Devon Kings Vegetable Oil 5L',
    unit: 'Keg',
    costPrice: 12000,
    sellingPrice: 15000,
    stockQuantity: 4,
    reorderLevel: 1,
    isActive: true,
    updatedAt: '2026-10-26T08:00:00Z',
  };

  // Seed local DB products
  for (const p of [prodRice, prodOil]) {
    await localDb.saveProduct({
      id: p.id,
      shop_id: p.shopId,
      business_id: p.businessId,
      category_id: p.categoryId,
      category_name: p.categoryName,
      sku: p.sku,
      barcode: p.barcode,
      name: p.name,
      unit: p.unit,
      cost_price_kobo: toMinorUnits(p.costPrice),
      selling_price_kobo: toMinorUnits(p.sellingPrice),
      stock_quantity: p.stockQuantity,
      reorder_level: p.reorderLevel,
      tax_exempt: 0,
      is_active: 1,
      created_at: p.updatedAt,
      updated_at: p.updatedAt,
    });
  }

  // Seed server Firestore driver
  namedDbDriver.docs.set(`businesses/${bizId}`, {
    id: bizId,
    name: business.name,
    status: 'active',
  });
  namedDbDriver.docs.set(`businesses/${bizId}/shops/${shopId}`, {
    id: shopId,
    businessId: bizId,
    name: shop.name,
    status: 'active',
  });
  namedDbDriver.docs.set(`users/${cashierUid}`, {
    id: cashierUid,
    businessId: bizId,
    email: cashierUser.email,
    fullName: cashierUser.fullName,
    role: 'cashier',
    assignedShopIds: [shopId],
    permissions: [...ROLE_DEFAULT_PERMISSIONS.cashier],
    status: 'active',
  });
  namedDbDriver.docs.set(`users/${otherBizCashierUid}`, {
    id: otherBizCashierUid,
    businessId: 'biz-other-99',
    email: otherBizCashier.email,
    fullName: otherBizCashier.fullName,
    role: 'cashier',
    assignedShopIds: ['shop-other-99'],
    permissions: ['process_sales'],
    status: 'active',
  });
  for (const p of [prodRice, prodOil]) {
    namedDbDriver.docs.set(`businesses/${bizId}/shops/${shopId}/products/${p.id}`, {
      id: p.id,
      shopId: p.shopId,
      businessId: p.businessId,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      costPriceKobo: toMinorUnits(p.costPrice),
      sellingPriceKobo: toMinorUnits(p.sellingPrice),
      stockQuantity: p.stockQuantity,
      reorderLevel: p.reorderLevel,
      isActive: true,
    });
  }

  // Provider wired directly to the trusted atomic Cloud Function (`executeSyncPosOperation`)
  const activeCallerAuth = {
    uid: cashierUid,
    token: {
      email: cashierUser.email,
      email_verified: true,
    },
  };
  let stripServerAckId = false;

  const ownerUser: User = {
    id: ownerUid,
    businessId: bizId,
    username: 'adaeze.atomic',
    email: 'adaeze@atomicretail.ng',
    fullName: 'Adaeze Atomic',
    role: 'business_owner',
    roleLabel: 'Business Owner',
    assignedShopIds: [shopId],
    permissions: [...ROLE_DEFAULT_PERMISSIONS.business_owner],
    status: 'active',
    createdAt: '2026-10-26',
    lastLoginAt: '2026-10-26T08:00:00Z',
  };

  const cloudProvider = new InMemoryLiveCloudProvider();
  const liveService = new LiveFirestoreDataService(cloudProvider, localDb);
  await liveService.persistLiveBusinessAndOwner(business, ownerUser, shop);
  await cloudProvider.saveUserProfile(cashierUser);
  await cloudProvider.saveUserProfile(otherBizCashier);
  await liveService.persistLiveProduct(prodRice);
  await liveService.persistLiveProduct(prodOil);

  (cloudProvider as LiveCloudStoreProvider).executeAtomicSaleSync = async (req) => {
    if (cloudProvider.simulateOutage) {
      throw new Error('FirebaseError: [code=unavailable]: Client is offline');
    }
    if (stripServerAckId) {
      return {
        outcome: 'acknowledged',
        status: 'synced',
        ackId: '',
        syncedAt: new Date().toISOString(),
        isDuplicateReplay: false,
        databaseId: NAMED_FIRESTORE_DATABASE_ID,
      };
    }
    return executeSyncPosOperation(namedDbDriver, activeCallerAuth, req);
  };

  // =========================================================================
  // SCENARIO 1: Offline checkout succeeds without internet and creates a durable pending sync operation
  // =========================================================================
  cloudProvider.simulateOutage = true;
  const offlineSaleId = 'sale-atomic-offline-001';
  const offlineOpId = `chk-${shopId}-offline-001`;
  const offlineFinalized = await saleService.finalizeSale({
    saleId: offlineSaleId,
    dataMode: 'offline_live',
    businessId: bizId,
    shopId,
    user: cashierUser,
    cart: [{ product: prodRice, quantity: 2 }],
    paymentMethod: 'cash',
    discountAmount: 0,
    taxRatePercent: 7.5,
    taxAmount: 11250,
    totalAmount: 161250,
    amountTendered: 165000,
    receiptNumber: 'ATM-2026-0901',
    checkoutOperationId: offlineOpId,
  });

  assert.equal(offlineFinalized.success, true);
  assert.equal(offlineFinalized.sale.id, offlineSaleId);
  const initialDbSale = await localDb.getSale(offlineSaleId);
  assert.ok(initialDbSale);
  assert.equal(initialDbSale.status, 'completed');
  assert.equal(initialDbSale.is_synced, 0, 'Offline sale must not be marked synced before server ack');
  const initialQueue = await localDb.getAllSyncQueue!(shopId, bizId);
  const initialSyncEntry = initialQueue.find((e) => e.id === `sync-${offlineSaleId}`);
  assert.ok(initialSyncEntry);
  assert.equal(initialSyncEntry.status, 'pending');
  assert.equal(initialSyncEntry.id, `sync-${offlineSaleId}`);

  // =========================================================================
  // SCENARIO 3: Failed server transaction (network outage or missing ackId) does not leave a falsely synced sale
  // =========================================================================
  const offlineSaleTx: SaleTransaction = {
    id: offlineSaleId,
    shopId,
    businessId: bizId,
    receiptNumber: 'ATM-2026-0901',
    terminalId: shop.terminalId,
    cashierUserId: cashierUid,
    cashierName: cashierUser.fullName,
    createdAt: offlineFinalized.sale.createdAt,
    items: [
      {
        id: `line-${offlineSaleId}-1`,
        productId: prodRice.id,
        sku: prodRice.sku,
        barcode: prodRice.barcode,
        productName: prodRice.name,
        unit: prodRice.unit,
        unitPrice: prodRice.sellingPrice,
        costPrice: prodRice.costPrice,
        quantity: 2,
        lineTotal: 150000,
      },
    ],
    subtotal: 150000,
    discountAmount: 0,
    taxRatePercent: 7.5,
    taxAmount: 11250,
    totalAmount: 161250,
    amountTendered: 165000,
    changeDue: 3750,
    paymentMethod: 'cash',
    status: 'completed',
    syncStatus: 'pending_local_queue',
  };

  await assert.rejects(
    liveService.persistLiveSale(offlineSaleTx, [], {
      operationId: `sync-${offlineSaleId}`,
      idempotencyKey: offlineOpId,
      actorUserId: cashierUid,
    }),
    /unavailable|offline/i
  );

  // Verify local sale is preserved and NOT marked synced, and queue entry is 'failed' (retryable)
  const localSaleAfterOutage = await localDb.getSale(offlineSaleId);
  assert.ok(localSaleAfterOutage, 'Completed local sale must never be deleted on cloud failure');
  assert.equal(localSaleAfterOutage.status, 'completed');
  assert.equal(localSaleAfterOutage.is_synced, 0, 'Failed cloud transaction must never mark local sale as synced');
  const queueAfterOutage = await localDb.getAllSyncQueue!(shopId, bizId);
  const failedEntry = queueAfterOutage.find((e) => e.id === `sync-${offlineSaleId}`);
  assert.equal(failedEntry?.status, 'failed');
  assert.equal(
    namedDbDriver.docs.has(`businesses/${bizId}/shops/${shopId}/sales/${offlineSaleId}`),
    false,
    'No sale document should exist on server when offline'
  );

  // Restore connectivity, but test missing server ackId protection
  cloudProvider.simulateOutage = false;
  stripServerAckId = true;
  const noAckSaleId = 'sale-atomic-noack-002';
  await assert.rejects(
    liveService.persistLiveSale(
      {
        ...offlineSaleTx,
        id: noAckSaleId,
        receiptNumber: 'ATM-2026-0902',
      },
      [],
      {
        operationId: `sync-${noAckSaleId}`,
        idempotencyKey: 'chk-noack-002',
        actorUserId: cashierUid,
      }
    ),
    /MISSING_SERVER_ACK/
  );
  stripServerAckId = false;

  // =========================================================================
  // SCENARIO 2 & 6: Online checkout routes through the trusted atomic transaction, commits sale + stock + payment + movement + sync receipt together, and marks synced ONLY after valid ackId
  // =========================================================================
  const ackRes = await liveService.persistLiveSale(offlineSaleTx, [], {
    operationId: `sync-${offlineSaleId}`,
    idempotencyKey: offlineOpId,
    actorUserId: cashierUid,
  });

  assert.equal(ackRes.outcome, 'acknowledged');
  assert.equal(ackRes.status, 'synced');
  assert.ok(ackRes.ackId && ackRes.ackId.startsWith('ack-'), 'Valid server ackId is required');
  assert.equal(ackRes.isDuplicateReplay, false);

  // Verify local sale and sync_queue entry are now marked synced with server ackId
  const localSaleAfterAck = await localDb.getSale(offlineSaleId);
  assert.equal(localSaleAfterAck?.is_synced, 1);
  assert.equal(localSaleAfterAck?.sync_ack_id, ackRes.ackId);
  const queueAfterAck = await localDb.getAllSyncQueue!(shopId, bizId);
  const syncedEntry = queueAfterAck.find((e) => e.id === `sync-${offlineSaleId}`);
  assert.equal(syncedEntry?.status, 'synced');
  assert.equal(syncedEntry?.cloud_ack_id, ackRes.ackId);

  // Verify atomic multi-record commit in Firestore: sale, line item, stock deduction, payment, inventory movement, and sync receipt
  assert.ok(
    namedDbDriver.docs.has(`businesses/${bizId}/shops/${shopId}/sales/${offlineSaleId}`),
    'Sale document must be committed in server transaction'
  );
  assert.ok(
    namedDbDriver.docs.has(
      `businesses/${bizId}/shops/${shopId}/sales/${offlineSaleId}/items/line-${offlineSaleId}-1`
    ),
    'Sale line item document must be committed in server transaction'
  );
  assert.ok(
    namedDbDriver.docs.has(`businesses/${bizId}/shops/${shopId}/payments/pay-${offlineSaleId}`),
    'Payment document must be committed in server transaction'
  );
  assert.ok(
    namedDbDriver.docs.has(
      `businesses/${bizId}/shops/${shopId}/inventory_movements/mov-${offlineSaleId}-${prodRice.id}`
    ),
    'Inventory movement ledger must be committed in server transaction'
  );
  assert.ok(
    namedDbDriver.docs.has(
      `businesses/${bizId}/shops/${shopId}/sync_operations/${offlineOpId}`
    ),
    'Idempotency receipt must be committed in server transaction'
  );
  const serverRiceAfterSale = namedDbDriver.docs.get(
    `businesses/${bizId}/shops/${shopId}/products/${prodRice.id}`
  );
  assert.equal(serverRiceAfterSale?.stockQuantity, 8, 'Server rice stock must be atomically deducted from 10 to 8');

  // =========================================================================
  // SCENARIO 4: Retrying the same checkout/sync operation is idempotent and does not duplicate the sale or deduct stock twice
  // =========================================================================
  const replayAckRes = await liveService.persistLiveSale(offlineSaleTx, [], {
    operationId: `sync-${offlineSaleId}`,
    idempotencyKey: offlineOpId,
    actorUserId: cashierUid,
  });
  assert.equal(replayAckRes.outcome, 'acknowledged');
  assert.equal(replayAckRes.isDuplicateReplay, true, 'Replay must be recognized as duplicate replay');
  assert.equal(replayAckRes.ackId, ackRes.ackId);
  const serverRiceAfterReplay = namedDbDriver.docs.get(
    `businesses/${bizId}/shops/${shopId}/products/${prodRice.id}`
  );
  assert.equal(
    serverRiceAfterReplay?.stockQuantity,
    8,
    'Idempotent retry must NEVER deduct stock a second time'
  );

  // =========================================================================
  // SCENARIO 5 & 6: Multi-item stock conflict or transaction abort leaves ZERO partial stock deductions, preserves local sale, and flags requires_review
  // =========================================================================
  // Local DB still thinks prodOil has 4 units, but suppose another terminal sold 3 units in cloud so cloud only has 1 unit left:
  namedDbDriver.docs.set(`businesses/${bizId}/shops/${shopId}/products/${prodOil.id}`, {
    ...namedDbDriver.docs.get(`businesses/${bizId}/shops/${shopId}/products/${prodOil.id}`)!,
    stockQuantity: 1,
  });

  const conflictSaleId = 'sale-atomic-conflict-003';
  const conflictOpId = `chk-${shopId}-conflict-003`;
  // Checkout has 2 items: 1 Bag of Rice (in stock: 8 available) + 3 Kegs of Oil (conflict: 4 locally, only 1 in cloud!)
  const conflictLocalRes = await saleService.finalizeSale({
    saleId: conflictSaleId,
    dataMode: 'live',
    businessId: bizId,
    shopId,
    user: cashierUser,
    cart: [
      { product: { ...prodRice, stockQuantity: 8 }, quantity: 1 },
      { product: prodOil, quantity: 3 },
    ],
    paymentMethod: 'cash',
    discountAmount: 0,
    taxRatePercent: 0,
    taxAmount: 0,
    totalAmount: 120000,
    amountTendered: 120000,
    receiptNumber: 'ATM-2026-0903',
    checkoutOperationId: conflictOpId,
  });

  const conflictSaleTx: SaleTransaction = {
    id: conflictSaleId,
    shopId,
    businessId: bizId,
    receiptNumber: 'ATM-2026-0903',
    terminalId: shop.terminalId,
    cashierUserId: cashierUid,
    cashierName: cashierUser.fullName,
    createdAt: conflictLocalRes.sale.createdAt,
    items: [
      {
        id: `line-${conflictSaleId}-1`,
        productId: prodRice.id,
        sku: prodRice.sku,
        barcode: prodRice.barcode,
        productName: prodRice.name,
        unit: prodRice.unit,
        unitPrice: prodRice.sellingPrice,
        costPrice: prodRice.costPrice,
        quantity: 1,
        lineTotal: 75000,
      },
      {
        id: `line-${conflictSaleId}-2`,
        productId: prodOil.id,
        sku: prodOil.sku,
        barcode: prodOil.barcode,
        productName: prodOil.name,
        unit: prodOil.unit,
        unitPrice: prodOil.sellingPrice,
        costPrice: prodOil.costPrice,
        quantity: 3,
        lineTotal: 45000,
      },
    ],
    subtotal: 120000,
    discountAmount: 0,
    taxRatePercent: 0,
    taxAmount: 0,
    totalAmount: 120000,
    amountTendered: 120000,
    changeDue: 0,
    paymentMethod: 'cash',
    status: 'completed',
    syncStatus: 'pending_local_queue',
  };

  const conflictSyncRes = await liveService.persistLiveSale(conflictSaleTx, [], {
    operationId: `sync-${conflictSaleId}`,
    idempotencyKey: conflictOpId,
    actorUserId: cashierUid,
  });

  assert.equal(conflictSyncRes.outcome, 'conflict_requires_review');
  assert.equal(conflictSyncRes.status, 'requires_review');
  assert.match(
    conflictSyncRes.conflictReason || '',
    /Stock conflict|Insufficient cloud stock/i
  );

  // Verify atomicity: even though item #1 (Rice) had plenty of stock, Rice stock in cloud MUST remain 8 (not 7!) and no partial sale or payment was written
  const serverRiceAfterConflict = namedDbDriver.docs.get(
    `businesses/${bizId}/shops/${shopId}/products/${prodRice.id}`
  );
  assert.equal(
    serverRiceAfterConflict?.stockQuantity,
    8,
    'Atomic transaction must not deduct stock for item #1 when item #2 has a stock conflict'
  );
  assert.equal(
    namedDbDriver.docs.has(`businesses/${bizId}/shops/${shopId}/sales/${conflictSaleId}`),
    false,
    'Conflicted sale must not be partially written to cloud sales collection'
  );

  // Verify local sale is preserved intact (`status === 'completed'`, `is_synced === 0`) and sync_queue entry is flagged `requires_review`
  const preservedConflictSale = await localDb.getSale(conflictSaleId);
  assert.ok(preservedConflictSale, 'Completed local sale must be preserved on stock conflict');
  assert.equal(preservedConflictSale.status, 'completed');
  assert.equal(preservedConflictSale.is_synced, 0);
  assert.match(
    preservedConflictSale.sync_conflict_reason || '',
    /Stock conflict|Insufficient cloud stock/i
  );

  const queueAfterConflict = await localDb.getAllSyncQueue!(shopId, bizId);
  const reviewEntry = queueAfterConflict.find((e) => e.id === `sync-${conflictSaleId}`);
  assert.equal(reviewEntry?.status, 'requires_review');

  // =========================================================================
  // SCENARIO 7: Business and shop permission boundaries remain strictly enforced
  // =========================================================================
  // 7a. Cross-business user cannot synchronize a sale into this business
  await assert.rejects(
    liveService.persistLiveSale(offlineSaleTx, [], {
      operationId: 'sync-cross-biz-attempt',
      idempotencyKey: 'idem-cross-biz-attempt',
      actorUserId: otherBizCashierUid,
    }),
    /PERMISSION_DENIED.*Cross-business/i
  );

  // 7b. Cashier without apply_discounts permission cannot synchronize a discounted sale
  const unauthorizedDiscountSale: SaleTransaction = {
    ...offlineSaleTx,
    id: 'sale-unauth-discount-004',
    receiptNumber: 'ATM-2026-0904',
    subtotal: 150000,
    discountAmount: 10000,
    taxRatePercent: 0,
    taxAmount: 0,
    totalAmount: 140000,
    amountTendered: 140000,
    changeDue: 0,
  };
  await assert.rejects(
    liveService.persistLiveSale(unauthorizedDiscountSale, [], {
      operationId: 'sync-unauth-discount-004',
      idempotencyKey: 'idem-unauth-discount-004',
      actorUserId: cashierUid,
    }),
    /PERMISSION_DENIED.*apply_discounts/i
  );

  // 7c. Cashier cannot spoof another user's cashierUserId
  await assert.rejects(
    liveService.persistLiveSale(
      {
        ...offlineSaleTx,
        id: 'sale-spoofed-cashier-005',
        receiptNumber: 'ATM-2026-0905',
        cashierUserId: ownerUid,
      },
      [],
      {
        operationId: 'sync-spoofed-cashier-005',
        idempotencyKey: 'idem-spoofed-cashier-005',
        actorUserId: cashierUid,
      }
    ),
    /PERMISSION_DENIED.*Cashier identity mismatch/i
  );
});

test('Firestore Rules Hardening Regression: firestore.rules enforces discount ceiling, immutable sale line items, granular staff permissions, platform admin sentinel, terminal sale status locks, and stays below the 1000-expression evaluation limit', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesText = fs.readFileSync(rulesPath, 'utf8');

  // Verify SEC-01..SEC-11 + Sale Line Item Immutability markers exist in firestore.rules
  assert.ok(
    rulesText.includes('function hasSalesPermission()'),
    'firestore.rules must define hasSalesPermission()'
  );
  assert.ok(
    rulesText.includes('function hasDiscountPermission()'),
    'firestore.rules must define hasDiscountPermission()'
  );
  assert.ok(
    rulesText.includes('function hasRefundOrVoidPermission()'),
    'firestore.rules must define hasRefundOrVoidPermission()'
  );
  assert.ok(
    rulesText.includes('function hasCataloguePermission()'),
    'firestore.rules must define hasCataloguePermission()'
  );
  assert.ok(
    rulesText.includes('function hasInventoryAdjustmentPermission()'),
    'firestore.rules must define hasInventoryAdjustmentPermission()'
  );
  assert.ok(
    rulesText.includes('function isPlatformAdminBusinessSentinel(id)'),
    'firestore.rules must define isPlatformAdminBusinessSentinel(id)'
  );
  assert.ok(
    rulesText.includes('function isValidSaleItem(data, businessId, shopId, saleId, itemId)'),
    'firestore.rules must define isValidSaleItem validator for /sales/{saleId}/items/{itemId}'
  );
  assert.ok(
    rulesText.includes('data.discountAmountKobo <= data.subtotalKobo'),
    'firestore.rules must prevent discounts exceeding subtotalKobo'
  );
  assert.ok(
    rulesText.includes('match /items/{itemId}'),
    'firestore.rules must explicitly protect /sales/{saleId}/items/{itemId} line items'
  );
  assert.ok(
    rulesText.includes("request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'syncedAt', 'syncAckId'])"),
    'firestore.rules must lock all checkout-time financial and identity fields on completed sales'
  );
  assert.ok(
    rulesText.includes('function isAssignedShopStaffProfile(profile, businessId, shopId, allowedRoles)'),
    'firestore.rules must use single-profile-lookup helper isAssignedShopStaffProfile to avoid 1000-expression evaluation overflow'
  );
  assert.ok(
    rulesText.includes('function profileHasPermission(profile, allowedKeys)'),
    'firestore.rules must use single-profile-lookup helper profileHasPermission to avoid redundant get() expansions'
  );
  assert.equal(
    rulesText.includes('request.resource.data.receiptNumber == resource.data.receiptNumber'),
    false,
    'firestore.rules must not duplicate 18 field equality checks that are already enforced by diff(resource.data).affectedKeys().hasOnly()'
  );
});

test('Cloud Functions Security Hardening Regression: role-specific staff permission boundaries, runtime tenant status validation, staff profile overwrite prevention, and UI/client validation parity', async () => {
  const { validateStaffRegistrationInput } = await import('../utils/posCalculations');
  const namedDbDriver = new InMemoryNamedFirestoreDriver(
    'ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4'
  );
  const authDir = new InMemoryAuthDirectory();

  const platformAdminAuth = {
    uid: 'uid-platform-admin-sec',
    token: {
      email: 'smartnwokolo@gmail.com',
      email_verified: true,
    },
  };
  const ownerAlphaAuth = {
    uid: 'uid-owner-alpha-sec',
    token: {
      email: 'owner@alphamart-sec.ng',
      email_verified: true,
    },
  };
  const ownerBetaAuth = {
    uid: 'uid-owner-beta-sec',
    token: {
      email: 'owner@betamart-sec.ng',
      email_verified: true,
    },
  };

  authDir.register(platformAdminAuth.uid, 'smartnwokolo@gmail.com', true);
  authDir.register(ownerAlphaAuth.uid, 'owner@alphamart-sec.ng', true);
  authDir.register(ownerBetaAuth.uid, 'owner@betamart-sec.ng', true);
  authDir.register('uid-auth-bound-staff', 'boundstaff@alphamart-sec.ng', true);

  // Seed Platform Admin profile
  namedDbDriver.docs.set(`users/${platformAdminAuth.uid}`, {
    id: platformAdminAuth.uid,
    businessId: 'PLATFORM',
    username: 'smartnwokolo',
    email: 'smartnwokolo@gmail.com',
    fullName: 'SmartMind Platform Admin',
    role: 'platform_admin',
    roleLabel: 'Platform Administrator',
    assignedShopIds: [],
    permissions: [],
    status: 'active',
    schemaVersion: 6,
    createdAt: '2026-10-27T00:00:00Z',
    updatedAt: '2026-10-27T00:00:00Z',
  });

  // Provision Business Alpha & Business Beta via Platform Admin
  await executeProvisionBusinessAndPrimaryOwner(
    namedDbDriver,
    authDir,
    platformAdminAuth,
    {
      idempotencyKey: 'idem-sec-prov-alpha',
      businessId: 'biz-live-sec-alpha',
      initialShopId: 'shop-live-sec-alpha-01',
      name: 'Alpha Security Superstore',
      businessType: 'Supermarket',
      contactEmail: 'hq@alphamart-sec.ng',
      primaryPhone: '+2348030001111',
      headquartersAddress: '10 Victoria Island, Lagos',
      ownerName: 'Alpha Owner',
      ownerEmail: 'owner@alphamart-sec.ng',
    }
  );

  await executeProvisionBusinessAndPrimaryOwner(
    namedDbDriver,
    authDir,
    platformAdminAuth,
    {
      idempotencyKey: 'idem-sec-prov-beta',
      businessId: 'biz-live-sec-beta',
      initialShopId: 'shop-live-sec-beta-01',
      name: 'Beta Security Superstore',
      businessType: 'Supermarket',
      contactEmail: 'hq@betamart-sec.ng',
      primaryPhone: '+2348030002222',
      headquartersAddress: '20 Ikeja GRA, Lagos',
      ownerName: 'Beta Owner',
      ownerEmail: 'owner@betamart-sec.ng',
    }
  );

  // =========================================================================
  // 1. Role-specific staff permissions: Cashier cannot obtain manager, inventory, refund/void, report, or owner permissions
  // =========================================================================
  const forbiddenCashierPermissions = [
    'manage_products',
    'manage_catalogue',
    'manage_inventory',
    'manage_categories',
    'adjust_inventory',
    'adjust_stock',
    'process_refunds',
    'process_returns',
    'void_sale',
    'view_shop_reports',
    'manage_business_settings',
    'manage_shops',
    'manage_staff',
    'view_business_reports',
  ];

  for (const forbiddenPerm of forbiddenCashierPermissions) {
    await assert.rejects(
      executeInviteAuthorizedStaff(
        namedDbDriver,
        ownerAlphaAuth,
        {
          idempotencyKey: `idem-cashier-forbidden-${forbiddenPerm}`,
          businessId: 'biz-live-sec-alpha',
          fullName: 'Crafted Cashier',
          email: `cashier.${forbiddenPerm}@alphamart-sec.ng`,
          role: 'cashier',
          assignedShopIds: ['shop-live-sec-alpha-01'],
          permissions: ['process_sales', forbiddenPerm],
        },
        authDir
      ),
      /PERMISSION_DENIED/,
      `Cashier must be denied elevated permission "${forbiddenPerm}"`
    );
  }

  // Shop manager cannot obtain owner-only permissions
  for (const ownerPerm of [
    'manage_business_settings',
    'manage_shops',
    'manage_staff',
    'view_business_reports',
  ]) {
    await assert.rejects(
      executeInviteAuthorizedStaff(
        namedDbDriver,
        ownerAlphaAuth,
        {
          idempotencyKey: `idem-mgr-forbidden-${ownerPerm}`,
          businessId: 'biz-live-sec-alpha',
          fullName: 'Crafted Manager',
          email: `mgr.${ownerPerm}@alphamart-sec.ng`,
          role: 'shop_manager',
          assignedShopIds: ['shop-live-sec-alpha-01'],
          permissions: ['process_sales', ownerPerm],
        },
        authDir
      ),
      /PERMISSION_DENIED/,
      `Shop manager must be denied owner-only permission "${ownerPerm}"`
    );
  }

  // =========================================================================
  // 2. Unknown permissions, non-array permissions, and empty permissions arrays are rejected
  // =========================================================================
  await assert.rejects(
    executeInviteAuthorizedStaff(
      namedDbDriver,
      ownerAlphaAuth,
      {
        idempotencyKey: 'idem-unknown-perm-01',
        businessId: 'biz-live-sec-alpha',
        fullName: 'Unknown Perm Staff',
        email: 'unknownperm@alphamart-sec.ng',
        role: 'cashier',
        assignedShopIds: ['shop-live-sec-alpha-01'],
        permissions: ['process_sales', 'super_root_override'],
      },
      authDir
    ),
    /INVALID_ARGUMENT.*Unrecognized.*staff permission key/
  );

  await assert.rejects(
    executeInviteAuthorizedStaff(
      namedDbDriver,
      ownerAlphaAuth,
      {
        idempotencyKey: 'idem-empty-perm-01',
        businessId: 'biz-live-sec-alpha',
        fullName: 'Empty Perm Staff',
        email: 'emptyperm@alphamart-sec.ng',
        role: 'cashier',
        assignedShopIds: ['shop-live-sec-alpha-01'],
        permissions: [],
      },
      authDir
    ),
    /INVALID_ARGUMENT.*non-empty array/
  );

  await assert.rejects(
    executeInviteAuthorizedStaff(
      namedDbDriver,
      ownerAlphaAuth,
      {
        idempotencyKey: 'idem-nonarray-perm-01',
        businessId: 'biz-live-sec-alpha',
        fullName: 'NonArray Perm Staff',
        email: 'nonarrayperm@alphamart-sec.ng',
        role: 'cashier',
        assignedShopIds: ['shop-live-sec-alpha-01'],
        permissions: 'process_sales' as any,
      },
      authDir
    ),
    /INVALID_ARGUMENT.*non-empty array/
  );

  // Client-side UI validator and LiveFirestoreDataService also enforce role-specific permission boundaries
  const clientValidationBadCashier = validateStaffRegistrationInput(
    {
      fullName: 'UI Bypass Cashier',
      email: 'uibypass@alphamart-sec.ng',
      role: 'cashier',
      assignedShopIds: ['shop-live-sec-alpha-01'],
      permissions: ['process_sales', 'manage_products'],
    },
    'biz-live-sec-alpha',
    [],
    [
      {
        id: 'shop-live-sec-alpha-01',
        businessId: 'biz-live-sec-alpha',
      } as any,
    ]
  );
  assert.equal(clientValidationBadCashier.valid, false);
  assert.match(clientValidationBadCashier.error || '', /Cashier accounts cannot be granted/i);

  const localDb = new MemoryDatabaseAdapter();
  await localDb.initialize();
  const cloudProvider = new InMemoryLiveCloudProvider();
  const liveService = new LiveFirestoreDataService(cloudProvider, localDb);
  await assert.rejects(
    liveService.persistLiveStaffUser({
      id: 'usr-crafted-cashier-client',
      businessId: 'biz-live-sec-alpha',
      username: 'crafted',
      email: 'crafted@alphamart-sec.ng',
      fullName: 'Crafted Client Cashier',
      role: 'cashier',
      roleLabel: 'Cashier',
      assignedShopIds: ['shop-live-sec-alpha-01'],
      permissions: ['process_sales', 'adjust_inventory'],
      status: 'active',
      createdAt: '2026-10-27',
      lastLoginAt: 'Never',
    }),
    /PERMISSION_DENIED.*cannot be granted elevated permission/
  );

  // =========================================================================
  // 3. Valid Business Owner workflows: create cashier (with defaults and with allowed permissions) & create shop_manager
  // =========================================================================
  const createdCashierRes = await executeInviteAuthorizedStaff(
    namedDbDriver,
    ownerAlphaAuth,
    {
      idempotencyKey: 'idem-valid-cashier-01',
      businessId: 'biz-live-sec-alpha',
      staffUid: 'uid-cashier-sec-01',
      fullName: 'Valid Cashier One',
      email: 'cashier1@alphamart-sec.ng',
      role: 'cashier',
      assignedShopIds: ['shop-live-sec-alpha-01'],
      permissions: ['process_sales', 'manage_invoices', 'apply_discounts', 'process_sales'],
    },
    authDir
  );
  assert.equal(createdCashierRes.status, 'created');
  assert.equal(createdCashierRes.isIdempotentReplay, false);
  assert.deepEqual(createdCashierRes.staffUser.permissions, [
    'process_sales',
    'manage_invoices',
    'apply_discounts',
  ]);

  const createdManagerRes = await executeInviteAuthorizedStaff(
    namedDbDriver,
    ownerAlphaAuth,
    {
      idempotencyKey: 'idem-valid-manager-01',
      businessId: 'biz-live-sec-alpha',
      staffUid: 'uid-manager-sec-01',
      fullName: 'Valid Shop Manager One',
      email: 'manager1@alphamart-sec.ng',
      role: 'shop_manager',
      assignedShopIds: ['shop-live-sec-alpha-01'],
    },
    authDir
  );
  assert.equal(createdManagerRes.status, 'created');
  assert.ok(createdManagerRes.staffUser.permissions.includes('manage_products'));
  assert.ok(createdManagerRes.staffUser.permissions.includes('adjust_inventory'));
  assert.equal(
    createdManagerRes.staffUser.permissions.includes('manage_staff'),
    false
  );

  // Safe idempotent replay when exact same key & parameters are retried
  const replayCashierRes = await executeInviteAuthorizedStaff(
    namedDbDriver,
    ownerAlphaAuth,
    {
      idempotencyKey: 'idem-valid-cashier-01',
      businessId: 'biz-live-sec-alpha',
      staffUid: 'uid-cashier-sec-01',
      fullName: 'Valid Cashier One',
      email: 'cashier1@alphamart-sec.ng',
      role: 'cashier',
      assignedShopIds: ['shop-live-sec-alpha-01'],
      permissions: ['process_sales', 'manage_invoices', 'apply_discounts'],
    },
    authDir
  );
  assert.equal(replayCashierRes.status, 'created');
  assert.equal(replayCashierRes.isIdempotentReplay, true);
  assert.equal(replayCashierRes.staffUser.id, 'uid-cashier-sec-01');

  // Reusing an existing idempotencyKey with a different email, role, or staffUid is rejected
  await assert.rejects(
    executeInviteAuthorizedStaff(
      namedDbDriver,
      ownerAlphaAuth,
      {
        idempotencyKey: 'idem-valid-cashier-01',
        businessId: 'biz-live-sec-alpha',
        staffUid: 'uid-different-user-99',
        fullName: 'Hijack Replay Attempt',
        email: 'different@alphamart-sec.ng',
        role: 'shop_manager',
        assignedShopIds: ['shop-live-sec-alpha-01'],
      },
      authDir
    ),
    /ALREADY_EXISTS.*cannot be reused with modified parameters/
  );

  // =========================================================================
  // 4. Existing user profiles cannot be overwritten through staff provisioning
  // =========================================================================
  // 4a. Cannot overwrite Platform Admin UID
  await assert.rejects(
    executeInviteAuthorizedStaff(
      namedDbDriver,
      ownerAlphaAuth,
      {
        idempotencyKey: 'idem-overwrite-admin-01',
        businessId: 'biz-live-sec-alpha',
        staffUid: platformAdminAuth.uid,
        fullName: 'Overwrite Admin Attempt',
        email: 'newstaff1@alphamart-sec.ng',
        role: 'cashier',
        assignedShopIds: ['shop-live-sec-alpha-01'],
      },
      authDir
    ),
    /PERMISSION_DENIED/
  );

  // 4b. Cannot overwrite Business Owner's own UID
  await assert.rejects(
    executeInviteAuthorizedStaff(
      namedDbDriver,
      ownerAlphaAuth,
      {
        idempotencyKey: 'idem-overwrite-self-01',
        businessId: 'biz-live-sec-alpha',
        staffUid: ownerAlphaAuth.uid,
        fullName: 'Overwrite Owner Self',
        email: 'newstaff2@alphamart-sec.ng',
        role: 'cashier',
        assignedShopIds: ['shop-live-sec-alpha-01'],
      },
      authDir
    ),
    /PERMISSION_DENIED/
  );

  // 4c. Cannot overwrite cross-tenant Business Beta owner UID
  await assert.rejects(
    executeInviteAuthorizedStaff(
      namedDbDriver,
      ownerAlphaAuth,
      {
        idempotencyKey: 'idem-overwrite-cross-owner-01',
        businessId: 'biz-live-sec-alpha',
        staffUid: ownerBetaAuth.uid,
        fullName: 'Overwrite Cross Owner',
        email: 'newstaff3@alphamart-sec.ng',
        role: 'cashier',
        assignedShopIds: ['shop-live-sec-alpha-01'],
      },
      authDir
    ),
    /PERMISSION_DENIED/
  );

  // 4d. Cannot overwrite existing staff UID in the same business
  await assert.rejects(
    executeInviteAuthorizedStaff(
      namedDbDriver,
      ownerAlphaAuth,
      {
        idempotencyKey: 'idem-overwrite-existing-staff-01',
        businessId: 'biz-live-sec-alpha',
        staffUid: 'uid-cashier-sec-01',
        fullName: 'Overwrite Existing Cashier',
        email: 'newstaff4@alphamart-sec.ng',
        role: 'shop_manager',
        assignedShopIds: ['shop-live-sec-alpha-01'],
      },
      authDir
    ),
    /ALREADY_EXISTS.*cannot be overwritten/
  );

  // 4e. Cannot bind a staffUid that belongs to a different email in Firebase Auth
  await assert.rejects(
    executeInviteAuthorizedStaff(
      namedDbDriver,
      ownerAlphaAuth,
      {
        idempotencyKey: 'idem-auth-uid-mismatch-01',
        businessId: 'biz-live-sec-alpha',
        staffUid: 'uid-auth-bound-staff',
        fullName: 'Mismatched Auth UID',
        email: 'wrongemail@alphamart-sec.ng',
        role: 'cashier',
        assignedShopIds: ['shop-live-sec-alpha-01'],
      },
      authDir
    ),
    /PERMISSION_DENIED.*different Firebase Authentication account/
  );

  // =========================================================================
  // 5. Unauthorized users cannot invite staff or change tenant status
  // =========================================================================
  const cashierAuth = {
    uid: 'uid-cashier-sec-01',
    token: {
      email: 'cashier1@alphamart-sec.ng',
      email_verified: true,
    },
  };
  const managerAuth = {
    uid: 'uid-manager-sec-01',
    token: {
      email: 'manager1@alphamart-sec.ng',
      email_verified: true,
    },
  };

  for (const unauthorizedCaller of [null, cashierAuth, managerAuth, ownerBetaAuth]) {
    await assert.rejects(
      executeInviteAuthorizedStaff(
        namedDbDriver,
        unauthorizedCaller as any,
        {
          idempotencyKey: `idem-unauth-invite-${unauthorizedCaller?.uid || 'anon'}`,
          businessId: 'biz-live-sec-alpha',
          fullName: 'Unauthorized Staff',
          email: `unauth.${unauthorizedCaller?.uid || 'anon'}@alphamart-sec.ng`,
          role: 'cashier',
          assignedShopIds: ['shop-live-sec-alpha-01'],
        },
        authDir
      ),
      /UNAUTHENTICATED|PERMISSION_DENIED/
    );

    await assert.rejects(
      executeSetTenantStatus(namedDbDriver, unauthorizedCaller as any, {
        businessId: 'biz-live-sec-alpha',
        status: 'suspended',
        reason: 'Unauthorized status change attempt',
      }),
      /UNAUTHENTICATED|PERMISSION_DENIED/
    );
  }

  // =========================================================================
  // 6. Validate tenant status & businessId at runtime in executeSetTenantStatus
  // =========================================================================
  for (const invalidStatus of [
    'deleted',
    'paused',
    'inactive',
    'pending',
    '',
    null,
    undefined,
    123,
    { status: 'active' },
  ]) {
    await assert.rejects(
      executeSetTenantStatus(namedDbDriver, platformAdminAuth, {
        businessId: 'biz-live-sec-alpha',
        status: invalidStatus as any,
      }),
      /INVALID_ARGUMENT.*Tenant status must be "active" or "suspended"/
    );
  }

  for (const invalidBizId of [
    '',
    'PLATFORM',
    '__PLATFORM_ADMIN__',
    'biz-emerald-01',
    'biz-0003-u42w',
    'biz-0001-abcd',
    '../users/uid-platform-admin-sec',
    'biz/with/slash',
  ]) {
    await assert.rejects(
      executeSetTenantStatus(namedDbDriver, platformAdminAuth, {
        businessId: invalidBizId,
        status: 'suspended',
      }),
      /INVALID_ARGUMENT.*Business ID/
    );
  }

  // Valid Platform Administrator tenant suspension and reactivation works as intended
  const suspendRes = await executeSetTenantStatus(
    namedDbDriver,
    platformAdminAuth,
    {
      businessId: 'biz-live-sec-alpha',
      status: 'suspended',
      reason: 'Scheduled compliance verification',
    }
  );
  assert.equal(suspendRes.status, 'suspended');
  assert.equal(
    namedDbDriver.docs.get('businesses/biz-live-sec-alpha')?.status,
    'suspended'
  );

  const reactivateRes = await executeSetTenantStatus(
    namedDbDriver,
    platformAdminAuth,
    {
      businessId: 'biz-live-sec-alpha',
      status: 'active',
      reason: 'Compliance verification completed',
    }
  );
  assert.equal(reactivateRes.status, 'active');
  assert.equal(
    namedDbDriver.docs.get('businesses/biz-live-sec-alpha')?.status,
    'active'
  );
});

test('Phase 6 Cloud Functions Client-to-Server Integration: persistLiveBusinessAndOwner, inviteLiveStaffUser, setLiveTenantStatus, non-quarantined live IDs, and canonical ID reconciliation', async () => {
  const {
    generateUniqueBusinessId,
    generateUniqueShopId,
    generateUniqueUserId,
    isSyntheticClientUserId,
    ROLE_DEFAULT_PERMISSIONS: DEFAULT_PERMS,
  } = await import('../utils/posCalculations');
  const {
    LiveFirestoreDataService,
    reconcileInvitedStaffState,
    reconcileProvisionedBusinessState,
    isPreFirebaseTestRecord,
  } = await import('../services/liveFirestoreDataService');
  const {
    executeProvisionBusinessAndPrimaryOwner,
    executeInviteAuthorizedStaff,
    executeSetTenantStatus,
  } = await import('../../functions/src/core');

  // 1. Verify live ID generators never match quarantined legacy regexes
  const generatedBizId = generateUniqueBusinessId([]);
  const generatedShopId = generateUniqueShopId([]);
  const generatedSyntheticUserId = generateUniqueUserId([]);

  assert.match(generatedBizId, /^biz-live-\d{4}-[a-z0-9]{4}$/);
  assert.match(generatedShopId, /^shop-live-\d{4}-[a-z0-9]{4}$/);
  assert.equal(/^biz-00\d\d-[a-z0-9]{4}$/i.test(generatedBizId), false);
  assert.equal(/^shop-00\d\d-[a-z0-9]{4}$/i.test(generatedShopId), false);
  assert.equal(
    isPreFirebaseTestRecord({
      id: generatedBizId,
      businessId: generatedBizId,
      shopId: generatedShopId,
    }),
    false,
    'Generated live business and shop IDs must never be flagged as quarantined pre-Firebase test records'
  );
  assert.equal(isSyntheticClientUserId(generatedSyntheticUserId), true);
  assert.equal(
    isSyntheticClientUserId('firebase-auth-uid-owner-998877'),
    false
  );

  // 2. Wire LiveFirestoreDataService to the real Cloud Function executors
  const namedDbDriver = new InMemoryNamedFirestoreDriver(
    'ai-studio-smartmindpos-3ebff8f1-fed5-4111-b7db-f027e942fbb4'
  );
  const authDir = new InMemoryAuthDirectory();

  const platformAdminAuth = {
    uid: 'uid-platform-admin-p6int',
    token: {
      email: 'smartnwokolo@gmail.com',
      email_verified: true,
    },
  };
  const ownerFirebaseUid = 'firebase-uid-owner-horizon-01';
  const ownerEmail = 'owner@horizonstores.ng';
  const staffFirebaseUid = 'firebase-uid-cashier-horizon-01';
  const staffEmail = 'cashier1@horizonstores.ng';

  authDir.register(platformAdminAuth.uid, 'smartnwokolo@gmail.com', true);
  authDir.register(ownerFirebaseUid, ownerEmail, true);
  authDir.register(staffFirebaseUid, staffEmail, true);

  namedDbDriver.docs.set(`users/${platformAdminAuth.uid}`, {
    id: platformAdminAuth.uid,
    businessId: 'PLATFORM',
    username: 'smartnwokolo',
    email: 'smartnwokolo@gmail.com',
    fullName: 'SmartMind Platform Admin',
    role: 'platform_admin',
    roleLabel: 'Platform Administrator',
    assignedShopIds: [],
    permissions: [],
    status: 'active',
    schemaVersion: 6,
    createdAt: '2026-10-27T00:00:00Z',
    updatedAt: '2026-10-27T00:00:00Z',
  });

  let activeCallerAuth = platformAdminAuth;

  const cloudStoreProvider: any = {
    async getUserProfile(uid: string) {
      return (namedDbDriver.docs.get(`users/${uid}`) as any) || null;
    },
    async getBusiness(businessId: string) {
      return (namedDbDriver.docs.get(`businesses/${businessId}`) as any) || null;
    },
    async listAllBusinesses() {
      const results: any[] = [];
      for (const [k, v] of namedDbDriver.docs.entries()) {
        if (k.startsWith('businesses/') && !k.slice('businesses/'.length).includes('/')) {
          results.push({ ...v });
        }
      }
      return results;
    },
    async listAllUsers() {
      const results: any[] = [];
      for (const [k, v] of namedDbDriver.docs.entries()) {
        if (k.startsWith('users/')) {
          results.push({ ...v });
        }
      }
      return results;
    },
    async listBusinessUsers(businessId: string) {
      const results: any[] = [];
      for (const [k, v] of namedDbDriver.docs.entries()) {
        if (k.startsWith('users/') && (v as any).businessId === businessId) {
          results.push({ ...v });
        }
      }
      return results;
    },
    async listBusinessShops(businessId: string) {
      const results: any[] = [];
      const prefix = `businesses/${businessId}/shops/`;
      for (const [k, v] of namedDbDriver.docs.entries()) {
        if (k.startsWith(prefix) && !k.slice(prefix.length).includes('/')) {
          results.push({ ...v });
        }
      }
      return results;
    },
    async getShop(businessId: string, shopId: string) {
      return (
        (namedDbDriver.docs.get(
          `businesses/${businessId}/shops/${shopId}`
        ) as any) || null
      );
    },
    async listShopProducts() {
      return [];
    },
    async listShopSales() {
      return [];
    },
    async saveUserProfile(user: User) {
      namedDbDriver.docs.set(`users/${user.id}`, { ...user });
    },
    async saveBusiness(biz: any) {
      namedDbDriver.docs.set(`businesses/${biz.id}`, { ...biz });
    },
    async saveShop(shop: any) {
      namedDbDriver.docs.set(`shops/${shop.id}`, { ...shop });
      namedDbDriver.docs.set(
        `businesses/${shop.businessId}/shops/${shop.id}`,
        { ...shop }
      );
    },
    async saveProduct() {},
    async deleteProduct() {},
    async saveSale() {},
    async provisionBusinessAndPrimaryOwner(request: any) {
      return executeProvisionBusinessAndPrimaryOwner(
        namedDbDriver,
        authDir,
        activeCallerAuth,
        request
      );
    },
    async inviteAuthorizedStaff(request: any) {
      return executeInviteAuthorizedStaff(
        namedDbDriver,
        activeCallerAuth,
        request,
        authDir
      );
    },
    async setTenantStatus(request: any) {
      return executeSetTenantStatus(namedDbDriver, activeCallerAuth, request);
    },
  };

  const localDb = new MemoryDatabaseAdapter();
  await localDb.initialize();
  const liveService = new LiveFirestoreDataService(cloudStoreProvider, localDb);

  // 3. Test persistLiveBusinessAndOwner -> provisionBusinessAndPrimaryOwner
  // Pass a synthetic client user ID ('usr-0001-abcd') on the local optimistic User object.
  // Verify that persistLiveBusinessAndOwner strips the synthetic UID, resolves the real
  // Firebase Auth UID ('firebase-uid-owner-horizon-01') by email on the server, and
  // returns canonical business, owner, and shop records.
  const optimisticBiz = {
    id: generatedBizId,
    name: 'Horizon Retail Mart',
    legalName: 'Horizon Retail Mart Ltd',
    businessType: 'Supermarket & Grocery Chain' as const,
    registrationNumber: 'RC-8829101',
    taxIdentificationNumber: 'TIN-8829101-0001',
    ownerUserId: generatedSyntheticUserId, // synthetic client ID that must NOT be sent as ownerUid
    ownerName: 'Adaeze Horizon',
    ownerEmail,
    contactEmail: 'hq@horizonstores.ng',
    primaryPhone: '+2348031234567',
    headquartersAddress: '45 Admiralty Way, Lekki',
    currencyCode: 'NGN' as const,
    currencySymbol: '₦',
    defaultTaxRatePercent: 7.5,
    status: 'active' as const,
    createdAt: '2026-10-27',
  };

  const optimisticOwner = {
    id: generatedSyntheticUserId,
    businessId: generatedBizId,
    username: 'owner',
    email: ownerEmail,
    fullName: 'Adaeze Horizon',
    role: 'business_owner' as const,
    roleLabel: 'Business Owner (Horizon Retail Mart)',
    assignedShopIds: [generatedShopId],
    permissions: [...DEFAULT_PERMS.business_owner],
    status: 'active' as const,
    createdAt: '2026-10-27',
    lastLoginAt: '2026-10-27 09:00',
  };

  const optimisticShop = {
    id: generatedShopId,
    businessId: generatedBizId,
    code: 'HRM-01',
    name: 'Horizon Retail Mart — Main Branch',
    category: 'Supermarket' as const,
    locationCity: 'Lagos',
    address: '45 Admiralty Way, Lekki',
    phone: '+2348031234567',
    managerName: 'Adaeze Horizon',
    status: 'active' as const,
    terminalId: 'TERM-HRM01',
    taxRatePercent: 7.5,
    receiptHeaderNote: 'Horizon Retail Mart — Official Receipt',
    receiptFooterNote: 'Thank you for your patronage',
    createdAt: '2026-10-27',
    pendingSyncCount: 0,
    lastSyncedAt: 'Cloud Synced',
  };

  const optimisticAssignment = {
    id: `asgn-${generatedShopId}-${generatedSyntheticUserId}`,
    userId: generatedSyntheticUserId,
    businessId: generatedBizId,
    shopId: generatedShopId,
    assignedAt: '2026-10-27',
    assignedByUserId: platformAdminAuth.uid,
    isActive: true,
  };

  const provisionIdempotencyKey = `prov-biz-${generatedBizId}-test0001`;
  const provisionedResult = await liveService.persistLiveBusinessAndOwner(
    optimisticBiz,
    optimisticOwner,
    optimisticShop,
    { idempotencyKey: provisionIdempotencyKey }
  );

  assert.equal(provisionedResult.business.id, generatedBizId);
  assert.equal(provisionedResult.primaryOwner.id, ownerFirebaseUid);
  assert.equal(provisionedResult.business.ownerUserId, ownerFirebaseUid);
  assert.equal(provisionedResult.firstShop?.id, generatedShopId);
  assert.equal(provisionedResult.isIdempotentReplay, false);

  // Verify server Firestore state created by provisionBusinessAndPrimaryOwner
  const cloudBizDoc = namedDbDriver.docs.get(`businesses/${generatedBizId}`);
  const cloudOwnerDoc = namedDbDriver.docs.get(`users/${ownerFirebaseUid}`);
  const cloudShopDoc = namedDbDriver.docs.get(
    `businesses/${generatedBizId}/shops/${generatedShopId}`
  );
  assert.ok(cloudBizDoc, 'Business document must exist in cloud Firestore');
  assert.equal(cloudBizDoc?.ownerUserId, ownerFirebaseUid);
  assert.ok(
    cloudOwnerDoc,
    'Owner profile must be keyed by canonical Firebase Auth UID'
  );
  assert.equal(
    namedDbDriver.docs.has(`users/${generatedSyntheticUserId}`),
    false,
    'Synthetic client user ID must never be written to Firestore users collection'
  );
  assert.ok(cloudShopDoc, 'First shop document must exist in cloud Firestore');

  // Verify idempotent replay with same idempotencyKey
  const replayProvisionResult = await liveService.persistLiveBusinessAndOwner(
    optimisticBiz,
    optimisticOwner,
    optimisticShop,
    { idempotencyKey: provisionIdempotencyKey }
  );
  assert.equal(replayProvisionResult.isIdempotentReplay, true);
  assert.equal(replayProvisionResult.primaryOwner.id, ownerFirebaseUid);

  // Verify local state reconciliation replaces synthetic IDs with canonical server IDs
  const reconciledBizState = reconcileProvisionedBusinessState(
    {
      businesses: [optimisticBiz],
      users: [optimisticOwner],
      shops: [optimisticShop],
      shopAssignments: [optimisticAssignment],
    },
    {
      businessId: generatedBizId,
      ownerUserId: generatedSyntheticUserId,
      firstShopId: generatedShopId,
      firstAssignmentId: optimisticAssignment.id,
    },
    provisionedResult
  );

  assert.equal(reconciledBizState.businesses[0].ownerUserId, ownerFirebaseUid);
  assert.equal(reconciledBizState.users[0].id, ownerFirebaseUid);
  assert.equal(reconciledBizState.shopAssignments[0].userId, ownerFirebaseUid);
  assert.equal(
    reconciledBizState.shopAssignments[0].id,
    `asgn-${generatedShopId}-${ownerFirebaseUid}`
  );

  // 4. Test inviteLiveStaffUser -> inviteAuthorizedStaff as the Business Owner
  activeCallerAuth = {
    uid: ownerFirebaseUid,
    token: {
      email: ownerEmail,
      email_verified: true,
    },
  };

  const syntheticStaffId = 'usr-0002-staf';
  const optimisticStaff: User = {
    id: syntheticStaffId,
    businessId: generatedBizId,
    username: 'cashier1',
    email: staffEmail,
    fullName: 'Chinedu Cashier',
    role: 'cashier',
    roleLabel: 'Senior Cashier',
    assignedShopIds: [generatedShopId],
    permissions: [...DEFAULT_PERMS.cashier],
    status: 'active',
    createdAt: '2026-10-27',
    lastLoginAt: 'Never (Newly Created)',
  };
  const optimisticStaffAssignment = {
    id: `asgn-temp-${syntheticStaffId}`,
    userId: syntheticStaffId,
    businessId: generatedBizId,
    shopId: generatedShopId,
    assignedAt: '2026-10-27',
    assignedByUserId: ownerFirebaseUid,
    isActive: true,
  };

  const staffInviteKey = `invite-staff-${generatedBizId}-${syntheticStaffId}-0001`;
  const inviteResult = await liveService.inviteLiveStaffUser(optimisticStaff, {
    idempotencyKey: staffInviteKey,
  });

  assert.equal(inviteResult.staffUser.id, staffFirebaseUid);
  assert.equal(inviteResult.isIdempotentReplay, false);
  assert.equal(
    namedDbDriver.docs.has(`users/${syntheticStaffId}`),
    false,
    'Synthetic staff ID must not be written to Firestore users collection'
  );
  assert.ok(
    namedDbDriver.docs.has(`users/${staffFirebaseUid}`),
    'Canonical Firebase Auth UID staff profile must be created by inviteAuthorizedStaff'
  );
  assert.ok(
    namedDbDriver.docs.has(
      `businesses/${generatedBizId}/staff_provisioning_keys/${staffInviteKey}`
    ),
    'Staff provisioning idempotency ledger must be recorded by inviteAuthorizedStaff'
  );
  assert.ok(
    namedDbDriver.docs.has(
      `businesses/${generatedBizId}/audit_events/aud-staff-${staffInviteKey}`
    ),
    'Staff invitation audit event must be recorded by inviteAuthorizedStaff'
  );

  // Reconcile local UI state for invited staff
  const reconciledStaffState = reconcileInvitedStaffState(
    {
      users: [reconciledBizState.users[0], optimisticStaff],
      shopAssignments: [
        reconciledBizState.shopAssignments[0],
        optimisticStaffAssignment,
      ],
    },
    syntheticStaffId,
    inviteResult.staffUser
  );
  const reconciledStaffUser = reconciledStaffState.users.find(
    (u) => u.email === staffEmail
  );
  assert.equal(reconciledStaffUser?.id, staffFirebaseUid);
  assert.equal(
    reconciledStaffState.shopAssignments.some(
      (a) => a.userId === staffFirebaseUid && a.shopId === generatedShopId
    ),
    true
  );

  // Idempotent retry with the same idempotencyKey returns replay without error
  const inviteReplay = await liveService.inviteLiveStaffUser(optimisticStaff, {
    idempotencyKey: staffInviteKey,
  });
  assert.equal(inviteReplay.isIdempotentReplay, true);
  assert.equal(inviteReplay.staffUser.id, staffFirebaseUid);

  // Attempting to invite an already-existing staff profile with a NEW idempotencyKey is rejected
  await assert.rejects(
    liveService.inviteLiveStaffUser(optimisticStaff, {
      idempotencyKey: `invite-staff-${generatedBizId}-duplicate-attempt`,
    }),
    /ALREADY_EXISTS/
  );

  // Existing staff profile edits and status toggles continue to work via persistLiveStaffUser
  await liveService.persistLiveStaffUser({
    ...inviteResult.staffUser,
    fullName: 'Chinedu Cashier (Updated)',
    status: 'suspended',
  });
  const updatedStaffDoc = namedDbDriver.docs.get(`users/${staffFirebaseUid}`);
  assert.equal(updatedStaffDoc?.fullName, 'Chinedu Cashier (Updated)');
  assert.equal(updatedStaffDoc?.status, 'suspended');

  // 5. Test setLiveTenantStatus -> setTenantStatus
  // Non-platform-admin (business_owner) cannot suspend a tenant
  await assert.rejects(
    liveService.setLiveTenantStatus(
      generatedBizId,
      'suspended',
      'Unauthorized attempt'
    ),
    /PERMISSION_DENIED/
  );
  assert.equal(
    namedDbDriver.docs.get(`businesses/${generatedBizId}`)?.status,
    'active',
    'Business status must remain unchanged when setLiveTenantStatus fails'
  );

  // Switch back to Platform Admin and suspend, then reactivate
  activeCallerAuth = platformAdminAuth;

  await assert.rejects(
    liveService.setLiveTenantStatus(
      generatedBizId,
      'archived' as any,
      'Invalid status'
    ),
    /INVALID_ARGUMENT/
  );

  const suspendedRes = await liveService.setLiveTenantStatus(
    generatedBizId,
    'suspended',
    'Billing review'
  );
  assert.equal(suspendedRes.status, 'suspended');
  assert.equal(
    namedDbDriver.docs.get(`businesses/${generatedBizId}`)?.status,
    'suspended'
  );

  const reactivatedRes = await liveService.setLiveTenantStatus(
    generatedBizId,
    'active',
    'Billing cleared'
  );
  assert.equal(reactivatedRes.status, 'active');
  assert.equal(
    namedDbDriver.docs.get(`businesses/${generatedBizId}`)?.status,
    'active'
  );
});

test('Phase 6 Deployment Environment Resolution: trusted runtime project identity, database isolation, and cross-environment violation protection', async () => {
  const {
    resolveCurrentEnvironment,
    PRODUCTION_FIREBASE_PROJECT_ID,
    STAGING_FIREBASE_PROJECT_ID,
    PRODUCTION_NAMED_FIRESTORE_DATABASE_ID,
  } = await import('../../functions/src/core');

  const originalEnv = { ...process.env };

  try {
    // 1. Default test environment resolves to production with named Firestore database
    delete process.env.GCLOUD_PROJECT;
    delete process.env.FIREBASE_PROJECT;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.FIREBASE_CONFIG;
    delete process.env.PROJECT_ID;
    delete process.env.VITE_FIREBASE_PROJECT_ID;
    delete process.env.FIRESTORE_DATABASE_ID;
    delete process.env.FUNCTION_TARGET;
    delete process.env.K_SERVICE;

    const defaultRes = resolveCurrentEnvironment();
    assert.equal(defaultRes.projectId, PRODUCTION_FIREBASE_PROJECT_ID);
    assert.equal(defaultRes.databaseId, PRODUCTION_NAMED_FIRESTORE_DATABASE_ID);
    assert.equal(defaultRes.isProduction, true);
    assert.equal(defaultRes.isStaging, false);
    assert.equal(defaultRes.environment, 'production');

    // 2. Staging runtime project resolution defaults to "(default)" database
    process.env.GCLOUD_PROJECT = STAGING_FIREBASE_PROJECT_ID;
    const stagingRes = resolveCurrentEnvironment();
    assert.equal(stagingRes.projectId, STAGING_FIREBASE_PROJECT_ID);
    assert.equal(stagingRes.databaseId, '(default)');
    assert.equal(stagingRes.isProduction, false);
    assert.equal(stagingRes.isStaging, true);
    assert.equal(stagingRes.environment, 'staging');

    // 3. Staging cannot access production named database (CROSS_ENVIRONMENT_VIOLATION)
    process.env.FIRESTORE_DATABASE_ID = PRODUCTION_NAMED_FIRESTORE_DATABASE_ID;
    assert.throws(
      () => resolveCurrentEnvironment(),
      /CROSS_ENVIRONMENT_VIOLATION.*Staging project.*strictly forbidden/
    );

    // 4. Production cannot connect to non-production database (e.g. "(default)")
    process.env.GCLOUD_PROJECT = PRODUCTION_FIREBASE_PROJECT_ID;
    process.env.FIRESTORE_DATABASE_ID = '(default)';
    assert.throws(
      () => resolveCurrentEnvironment(),
      /CROSS_ENVIRONMENT_VIOLATION.*Production project.*strictly forbidden/
    );

    // 5. Unknown project fails explicitly
    delete process.env.FIRESTORE_DATABASE_ID;
    process.env.GCLOUD_PROJECT = 'malicious-or-unknown-project';
    assert.throws(
      () => resolveCurrentEnvironment(),
      /UNKNOWN_PROJECT_CONFIGURATION.*malicious-or-unknown-project/
    );

    // 6. Cloud Functions runtime without project identity fails explicitly
    delete process.env.GCLOUD_PROJECT;
    process.env.FUNCTION_TARGET = 'provisionBusinessAndPrimaryOwner';
    assert.throws(
      () => resolveCurrentEnvironment(),
      /MISSING_PROJECT_CONFIGURATION/
    );

    // 7. Client-side VITE_FIREBASE_PROJECT_ID does not override Cloud Function runtime identity
    process.env.VITE_FIREBASE_PROJECT_ID = 'client-spoofed-project';
    assert.throws(
      () => resolveCurrentEnvironment(),
      /MISSING_PROJECT_CONFIGURATION/
    );
  } finally {
    process.env = originalEnv;
  }
});


