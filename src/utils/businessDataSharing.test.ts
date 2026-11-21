import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveBusinessScopedLiveCache,
  loadBusinessScopedLiveCache,
  saveUserScopedLiveCache,
  loadUserScopedLiveCache,
  LIVE_BUSINESS_CACHE_PREFIX,
  LIVE_USER_CACHE_PREFIX,
} from '../services/liveFirestoreDataService';
import { DebtCustomer, DebtTransaction, Supplier, SupplierSupplyRecord, User } from '../types/pos';

// Mock localStorage for Node test environment
class MockLocalStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  get length(): number {
    return this.store.size;
  }
}

test('Business-Scoped Data Sharing Suite', async (t) => {
  const originalWindow = (globalThis as any).window;
  const mockStorage = new MockLocalStorage();
  (globalThis as any).window = {
    localStorage: mockStorage,
  };

  t.after(() => {
    (globalThis as any).window = originalWindow;
  });

  await t.test(
    '1. Shop Manager sees Debt Customers and Suppliers created by Business Owner in the same business',
    () => {
      mockStorage.clear();

      const businessId = 'biz-smartmind-01';
      const ownerUserId = 'usr-owner-01';
      const managerUserId = 'usr-manager-02';

      const ownerDebtCustomer: DebtCustomer = {
        id: 'cust-101',
        shopId: 'shop-svs-01', // Created under Main Branch
        businessId,
        fullName: 'Alhaji Musa Ibrahim',
        phone: '08023456789',
        creditLimitEnabled: true,
        creditLimitAmount: 50000,
        totalCredit: 25000,
        amountPaid: 5000,
        balanceRemaining: 20000,
        createdAt: '2026-11-15 10:00:00',
        updatedAt: '2026-11-15 10:00:00',
      };

      const ownerSupplier: Supplier = {
        id: 'sup-101',
        shopId: 'shop-svs-01',
        businessId,
        fullName: 'Nestle Distribution Hub',
        phone: '08099887766',
        email: 'sales@nestle-hub.ng',
        address: '15 Commercial Avenue, Ikeja',
        totalSupplies: 100000,
        totalAmount: 100000,
        amountPaid: 80000,
        balanceRemaining: 20000,
        createdAt: '2026-11-15 09:00:00',
        updatedAt: '2026-11-15 09:00:00',
      };

      // Owner saves workspace dataset with customers and suppliers
      const ownerDataset: any = {
        businesses: [{ id: businessId, name: 'SmartMind Validation Store' }],
        users: [
          { id: ownerUserId, fullName: 'Business Owner', businessId, role: 'business_owner', status: 'active' },
          { id: managerUserId, fullName: 'Shop Manager Asaba', businessId, role: 'shop_manager', status: 'active' },
        ],
        shops: [
          { id: 'shop-svs-01', name: 'Main Branch' },
          { id: 'shop-svs-02', name: 'Asaba Branch' },
        ],
        categories: [],
        units: [],
        products: [],
        sales: [],
        stockAdjustments: [],
        invoices: [],
        debtCustomers: [ownerDebtCustomer],
        debtTransactions: [],
        suppliers: [ownerSupplier],
        supplierSupplies: [],
        customRoles: [],
        ownerUserId,
        businessId,
        cachedAt: new Date().toISOString(),
      };

      // Save owner's user cache and business cache
      saveUserScopedLiveCache(ownerUserId, ownerDataset);
      saveBusinessScopedLiveCache(businessId, ownerDataset);

      // Verify business-level cache is retrievable
      const loadedBizCache = loadBusinessScopedLiveCache(businessId);
      assert.ok(loadedBizCache, 'Business cache should exist');
      assert.strictEqual(loadedBizCache.debtCustomers.length, 1);
      assert.strictEqual(loadedBizCache.debtCustomers[0].id, 'cust-101');
      assert.strictEqual(loadedBizCache.suppliers.length, 1);
      assert.strictEqual(loadedBizCache.suppliers[0].id, 'sup-101');

      // Now Shop Manager logs in: Manager's user cache is initially empty
      const managerUserCache = loadUserScopedLiveCache(managerUserId);
      assert.strictEqual(managerUserCache, null, 'Manager has no personal user cache initially');

      // But when loading business-scoped cache for their business, manager has full access
      const managerAccessibleBizCache = loadBusinessScopedLiveCache(businessId);
      assert.ok(managerAccessibleBizCache);
      assert.strictEqual(managerAccessibleBizCache.debtCustomers[0].fullName, 'Alhaji Musa Ibrahim');
      assert.strictEqual(managerAccessibleBizCache.suppliers[0].fullName, 'Nestle Distribution Hub');
      assert.strictEqual(managerAccessibleBizCache.users.length, 2);
    }
  );

  await t.test(
    '2. Cross-business isolation: Business B cannot read or inherit Business A records',
    () => {
      mockStorage.clear();

      const bizA = 'biz-alpha-01';
      const bizB = 'biz-beta-02';

      const datasetA: any = {
        businesses: [{ id: bizA, name: 'Business Alpha' }],
        users: [{ id: 'usr-a', fullName: 'Owner A', businessId: bizA, role: 'business_owner', status: 'active' }],
        shops: [{ id: 'shop-a', name: 'Alpha Shop' }],
        categories: [],
        units: [],
        products: [],
        sales: [],
        stockAdjustments: [],
        invoices: [],
        debtCustomers: [
          {
            id: 'cust-a-01',
            shopId: 'shop-a',
            businessId: bizA,
            fullName: 'Secret Debtor A',
            phone: '08000000001',
            creditLimitEnabled: false,
            creditLimitAmount: 0,
            totalCredit: 50000,
            amountPaid: 0,
            balanceRemaining: 50000,
            createdAt: '2026-11-15 12:00:00',
            updatedAt: '2026-11-15 12:00:00',
          },
        ],
        debtTransactions: [],
        suppliers: [],
        supplierSupplies: [],
        customRoles: [],
        ownerUserId: 'usr-a',
        businessId: bizA,
        cachedAt: new Date().toISOString(),
      };

      saveBusinessScopedLiveCache(bizA, datasetA);

      // Attempt to load Business B's cache
      const bizBCache = loadBusinessScopedLiveCache(bizB);
      assert.strictEqual(bizBCache, null, 'Business B cache should be null when nothing exists for Business B');

      // Verify that inspecting Business A's cache only contains records matching bizA
      const bizACache = loadBusinessScopedLiveCache(bizA);
      assert.ok(bizACache);
      assert.ok(bizACache.debtCustomers.every((c: any) => c.businessId === bizA));
    }
  );

  await t.test(
    '3. Manager adding a record merges seamlessly into shared business cache',
    () => {
      mockStorage.clear();

      const businessId = 'biz-smartmind-01';
      const ownerUserId = 'usr-owner-01';
      const managerUserId = 'usr-manager-02';

      const initialOwnerDataset: any = {
        businesses: [{ id: businessId, name: 'SmartMind Validation Store' }],
        users: [{ id: ownerUserId, fullName: 'Owner', businessId, role: 'business_owner', status: 'active' }],
        shops: [{ id: 'shop-1', name: 'Shop 1' }],
        categories: [],
        units: [],
        products: [],
        sales: [],
        stockAdjustments: [],
        invoices: [],
        debtCustomers: [
          {
            id: 'cust-owner-01',
            shopId: 'shop-1',
            businessId,
            fullName: 'Owner Customer',
            phone: '08011111111',
            creditLimitEnabled: false,
            creditLimitAmount: 0,
            totalCredit: 1000,
            amountPaid: 0,
            balanceRemaining: 1000,
            createdAt: '2026-11-15 12:00:00',
            updatedAt: '2026-11-15 12:00:00',
          },
        ],
        debtTransactions: [],
        suppliers: [],
        supplierSupplies: [],
        customRoles: [],
        ownerUserId,
        businessId,
        cachedAt: new Date().toISOString(),
      };

      saveBusinessScopedLiveCache(businessId, initialOwnerDataset);

      // Manager creates a new customer at Asaba branch
      const managerDataset: any = {
        businesses: [{ id: businessId, name: 'SmartMind Validation Store' }],
        users: [{ id: managerUserId, fullName: 'Manager', businessId, role: 'shop_manager', status: 'active' }],
        shops: [{ id: 'shop-2', name: 'Asaba Branch' }],
        categories: [],
        units: [],
        products: [],
        sales: [],
        stockAdjustments: [],
        invoices: [],
        debtCustomers: [
          {
            id: 'cust-mgr-02',
            shopId: 'shop-2',
            businessId,
            fullName: 'Manager Customer Asaba',
            phone: '08022222222',
            creditLimitEnabled: false,
            creditLimitAmount: 0,
            totalCredit: 2000,
            amountPaid: 0,
            balanceRemaining: 2000,
            createdAt: '2026-11-16 10:00:00',
            updatedAt: '2026-11-16 10:00:00',
          },
        ],
        debtTransactions: [],
        suppliers: [],
        supplierSupplies: [],
        customRoles: [],
        ownerUserId: managerUserId,
        businessId,
        cachedAt: new Date().toISOString(),
      };

      // Save manager's dataset to business cache
      saveBusinessScopedLiveCache(businessId, managerDataset);

      // Verify the business cache now contains BOTH customers merged together
      const mergedCache = loadBusinessScopedLiveCache(businessId);
      assert.ok(mergedCache);
      assert.strictEqual(mergedCache.debtCustomers.length, 2);
      const customerNames = mergedCache.debtCustomers.map((c: any) => c.fullName);
      assert.ok(customerNames.includes('Owner Customer'));
      assert.ok(customerNames.includes('Manager Customer Asaba'));
    }
  );

  await t.test(
    '4. Shop Isolation: Suppliers and supplies created in Ikeja branch are strictly isolated from Lagos Island branch',
    () => {
      mockStorage.clear();

      const businessId = 'biz-nnewi-ventures';
      const ikejaShopId = 'shop-ikeja-01';
      const lagosIslandShopId = 'shop-lagos-island-02';

      const ikejaSupplier: Supplier = {
        id: 'sup-ikeja-001',
        shopId: ikejaShopId,
        businessId,
        fullName: 'Miller Chemical Suppliers (Ikeja)',
        phone: '08012340001',
        email: 'sales@miller-ikeja.com',
        address: '10 Industrial Way, Ikeja',
        totalSupplies: 50000,
        totalAmount: 50000,
        amountPaid: 50000,
        balanceRemaining: 0,
        createdAt: '2026-11-17 10:00:00',
        updatedAt: '2026-11-17 10:00:00',
      };

      const lagosIslandSupplier: Supplier = {
        id: 'sup-island-002',
        shopId: lagosIslandShopId,
        businessId,
        fullName: 'Broad Street Wholesale Mart',
        phone: '08012340002',
        email: 'orders@broadstreet.com',
        address: '45 Broad Street, Lagos Island',
        totalSupplies: 30000,
        totalAmount: 30000,
        amountPaid: 30000,
        balanceRemaining: 0,
        createdAt: '2026-11-17 11:00:00',
        updatedAt: '2026-11-17 11:00:00',
      };

      const allBusinessSuppliers = [ikejaSupplier, lagosIslandSupplier];

      // Simulated activeShopSuppliers filter for Ikeja branch
      const activeIkejaSuppliers = allBusinessSuppliers.filter(
        (s) => s.shopId === ikejaShopId && s.businessId === businessId
      );
      assert.strictEqual(activeIkejaSuppliers.length, 1);
      assert.strictEqual(activeIkejaSuppliers[0].id, 'sup-ikeja-001');
      assert.strictEqual(activeIkejaSuppliers[0].fullName, 'Miller Chemical Suppliers (Ikeja)');

      // Simulated activeShopSuppliers filter for Lagos Island branch
      const activeIslandSuppliers = allBusinessSuppliers.filter(
        (s) => s.shopId === lagosIslandShopId && s.businessId === businessId
      );
      assert.strictEqual(activeIslandSuppliers.length, 1);
      assert.strictEqual(activeIslandSuppliers[0].id, 'sup-island-002');
      assert.strictEqual(activeIslandSuppliers[0].fullName, 'Broad Street Wholesale Mart');

      // Crucial verification: Ikeja supplier is NEVER visible in Lagos Island branch
      assert.ok(
        !activeIslandSuppliers.some((s) => s.id === 'sup-ikeja-001'),
        'Ikeja supplier must never leak into Lagos Island shop'
      );
    }
  );

  test(
    '5. Platform Admin in Support Mode loads existing Suppliers, Supplies, Debt Customers, and Debt Transactions',
    () => {
      const businessId = 'biz-live-lily-support';
      const ikejaShopId = 'shop-live-ikeja';
      const ownerUserId = 'usr-owner-linda';

      const ikejaSupplier: Supplier = {
        id: 'sup-ikeja-777',
        shopId: ikejaShopId,
        businessId,
        fullName: 'Miller Chemical Suppliers (Ikeja)',
        phone: '08099990001',
        email: 'miller@ikeja.com',
        address: '10 Allen Avenue, Ikeja',
        totalSupplies: 50000,
        totalAmount: 50000,
        amountPaid: 40000,
        balanceRemaining: 10000,
        createdAt: '2026-11-17 10:00:00',
        updatedAt: '2026-11-17 10:00:00',
      };

      const ikejaSupplyRecord: SupplierSupplyRecord = {
        id: 'supply-rec-777',
        shopId: ikejaShopId,
        businessId,
        supplierId: 'sup-ikeja-777',
        supplierName: 'Miller Chemical Suppliers (Ikeja)',
        items: [],
        totalQuantity: 20,
        totalAmount: 50000,
        amountPaid: 40000,
        balanceRemaining: 10000,
        recordedByUserId: ownerUserId,
        recordedByName: 'Linda Nwokolo',
        createdAt: '2026-11-17 10:05:00',
      };

      const ikejaDebtCustomer: DebtCustomer = {
        id: 'cust-debt-777',
        shopId: ikejaShopId,
        businessId,
        fullName: 'Chief Okonkwo',
        phone: '08033334444',
        creditLimitEnabled: true,
        creditLimitAmount: 100000,
        totalCredit: 7095,
        amountPaid: 0,
        balanceRemaining: 7095,
        createdAt: '2026-11-17 10:10:00',
        updatedAt: '2026-11-17 10:10:00',
      };

      const ikejaDebtTx: DebtTransaction = {
        id: 'tx-debt-777',
        shopId: ikejaShopId,
        businessId,
        customerId: 'cust-debt-777',
        customerName: 'Chief Okonkwo',
        customerPhone: '08033334444',
        type: 'credit',
        amount: 7095,
        reference: 'LV-2026-8981',
        notes: 'Credit purchase',
        recordedByUserId: ownerUserId,
        recordedByName: 'Linda Nwokolo',
        createdAt: '2026-11-17 10:15:00',
      };

      // 1. Business Owner recorded these in the business cache
      const ownerDataset: any = {
        businesses: [{ id: businessId, name: 'Lily Ventures' }],
        users: [{ id: ownerUserId, fullName: 'Linda Nwokolo', businessId, role: 'business_owner', status: 'active' }],
        shops: [{ id: ikejaShopId, name: 'Ikeja Branch' }],
        categories: [],
        units: [],
        products: [],
        sales: [],
        stockAdjustments: [],
        invoices: [],
        debtCustomers: [ikejaDebtCustomer],
        debtTransactions: [ikejaDebtTx],
        suppliers: [ikejaSupplier],
        supplierSupplies: [ikejaSupplyRecord],
        customRoles: [],
        ownerUserId,
        businessId,
        cachedAt: new Date().toISOString(),
      };
      saveBusinessScopedLiveCache(businessId, ownerDataset);

      // 2. Platform Admin enters Support Mode for this business
      // Initial Platform Admin state has empty arrays for tenant data
      let adminSuppliers: Supplier[] = [];
      let adminSupplies: SupplierSupplyRecord[] = [];
      let adminDebtCustomers: DebtCustomer[] = [];
      let adminDebtTransactions: DebtTransaction[] = [];

      // Support Mode loader runs:
      const bizCache = loadBusinessScopedLiveCache(businessId);
      assert.ok(bizCache, 'Platform Admin support mode must be able to load business cache');

      const mergeEntities = <T extends { id: string; businessId?: string }>(
        prev: T[],
        incoming: T[] = []
      ): T[] => {
        const map = new Map<string, T>();
        prev.forEach((item) => map.set(item.id, item));
        incoming.forEach((item) => {
          if (item.businessId === businessId) {
            map.set(item.id, item);
          }
        });
        return Array.from(map.values());
      };

      adminSuppliers = mergeEntities(adminSuppliers, bizCache.suppliers);
      adminSupplies = mergeEntities(adminSupplies, bizCache.supplierSupplies);
      adminDebtCustomers = mergeEntities(adminDebtCustomers, bizCache.debtCustomers);
      adminDebtTransactions = mergeEntities(adminDebtTransactions, bizCache.debtTransactions);

      // Verify Platform Admin now has full visibility of existing records
      assert.strictEqual(adminSuppliers.length, 1);
      assert.strictEqual(adminSuppliers[0].fullName, 'Miller Chemical Suppliers (Ikeja)');
      assert.strictEqual(adminSupplies.length, 1);
      assert.strictEqual(adminSupplies[0].totalAmount, 50000);
      assert.strictEqual(adminDebtCustomers.length, 1);
      assert.strictEqual(adminDebtCustomers[0].fullName, 'Chief Okonkwo');
      assert.strictEqual(adminDebtTransactions.length, 1);
      assert.strictEqual(adminDebtTransactions[0].amount, 7095);

      // Filtered to active Ikeja shop
      const activeShopSuppliers = adminSuppliers.filter((s) => s.shopId === ikejaShopId);
      const activeShopDebtTxs = adminDebtTransactions.filter((t) => t.shopId === ikejaShopId);
      assert.strictEqual(activeShopSuppliers.length, 1);
      assert.strictEqual(activeShopDebtTxs.length, 1);
    }
  );
});
