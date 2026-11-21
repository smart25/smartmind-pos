import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveDocumentLogo,
  getCleanBrandInitials,
  resolveDocumentIdentity,
  resolveConsolidatedReportIdentity,
  validateLogoFile,
  getOfflineLogoStorageKey,
  cacheOfflineLogo,
  getCachedOfflineLogo,
  removeOfflineLogo,
  BRANDING_UPLOAD_CONSTRAINTS,
} from './brandingHierarchy';
import {
  getStoragePathForLogo,
  uploadLogoToCloudStorage,
  deleteLogoFromCloudStorage,
} from '../services/brandingStorageService';
import { Business, Shop, SaleTransaction, Product } from '../types/pos';

const mockBusiness: Business = {
  id: 'biz-test-001',
  name: 'Acme Supermarket',
  legalName: 'Acme Retail Enterprises Ltd',
  businessType: 'Supermarket & Grocery Chain',
  registrationNumber: 'RC-123456',
  taxIdentificationNumber: 'TIN-987654321',
  ownerUserId: 'user-owner-001',
  ownerName: 'Alice Owner',
  ownerEmail: 'alice@acme.ng',
  contactEmail: 'support@acme.ng',
  primaryPhone: '+234 801 111 2222',
  headquartersAddress: '10 Marina Boulevard, Lagos Island',
  currencyCode: 'NGN',
  currencySymbol: '₦',
  defaultTaxRatePercent: 7.5,
  status: 'active',
  logoUrl: 'https://example.com/acme-business-logo.png',
  createdAt: '2026-01-01',
};

const mockShopA: Shop = {
  id: 'shop-vi-01',
  businessId: 'biz-test-001',
  code: 'VI-01',
  name: 'Victoria Island Flagship',
  category: 'Supermarket',
  locationCity: 'Victoria Island, Lagos',
  address: 'Plot 4 Ahmadu Bello Way',
  phone: '+234 802 333 4444',
  managerName: 'Bob Manager',
  status: 'active',
  terminalId: 'POS-TERM-VI01',
  taxRatePercent: 7.5,
  receiptHeaderNote: 'Welcome to Acme VI Flagship',
  receiptFooterNote: 'Thank you for shopping with Acme',
  logoUrl: 'https://example.com/acme-vi-branch-logo.png',
  createdAt: '2026-01-01',
  pendingSyncCount: 0,
  lastSyncedAt: '2026-01-01',
};

const mockShopB: Shop = {
  id: 'shop-ik-02',
  businessId: 'biz-test-001',
  code: 'IK-02',
  name: 'Ikeja Mall Branch',
  category: 'Supermarket',
  locationCity: 'Ikeja, Lagos',
  address: '14 Obafemi Awolowo Way',
  phone: '+234 803 555 6666',
  managerName: 'Charlie Manager',
  status: 'active',
  terminalId: 'POS-TERM-IK02',
  taxRatePercent: 7.5,
  receiptHeaderNote: 'Welcome to Acme Ikeja',
  receiptFooterNote: 'Thank you for shopping with Acme',
  logoUrl: undefined, // No shop-specific logo
  createdAt: '2026-01-01',
  pendingSyncCount: 0,
  lastSyncedAt: '2026-01-01',
};

test('Branding Hierarchy 1: Shop-specific logo overrides parent business logo', () => {
  const effectiveLogo = resolveDocumentLogo(mockBusiness, mockShopA);
  assert.equal(effectiveLogo, 'https://example.com/acme-vi-branch-logo.png');

  const identity = resolveDocumentIdentity(mockBusiness, mockShopA);
  assert.equal(identity.logoUrl, 'https://example.com/acme-vi-branch-logo.png');
  assert.equal(identity.isShopOverride, true);
  assert.equal(identity.shopName, 'Victoria Island Flagship');
  assert.equal(identity.shopCode, 'VI-01');
});

test('Branding Hierarchy 2: Fallback to parent business logo when shop has no logo', () => {
  const effectiveLogo = resolveDocumentLogo(mockBusiness, mockShopB);
  assert.equal(effectiveLogo, 'https://example.com/acme-business-logo.png');

  const identity = resolveDocumentIdentity(mockBusiness, mockShopB);
  assert.equal(identity.logoUrl, 'https://example.com/acme-business-logo.png');
  assert.equal(identity.isShopOverride, false);
  assert.equal(identity.shopName, 'Ikeja Mall Branch');
  assert.equal(identity.shopCode, 'IK-02');
});

test('Branding Hierarchy 3: Clean text initials when neither shop nor business has logo', () => {
  const noLogoBiz: Business = { ...mockBusiness, logoUrl: undefined };
  const effectiveLogo = resolveDocumentLogo(noLogoBiz, mockShopB);
  assert.equal(effectiveLogo, undefined);

  const identity = resolveDocumentIdentity(noLogoBiz, mockShopB);
  assert.equal(identity.logoUrl, undefined);
  assert.equal(identity.initials, 'AS'); // Acme Supermarket -> AS
  assert.equal(identity.businessName, 'Acme Supermarket');
  assert.equal(identity.legalName, 'Acme Retail Enterprises Ltd');
});

test('Branding Initials Generator: Handles various name configurations cleanly', () => {
  assert.equal(getCleanBrandInitials('SmartMind POS'), 'SP');
  assert.equal(getCleanBrandInitials('Zenith Pharmacy'), 'ZP');
  assert.equal(getCleanBrandInitials('Shoprite'), 'SH');
  assert.equal(getCleanBrandInitials(''), 'SM');
  assert.equal(getCleanBrandInitials(undefined), 'SM');
});

test('Consolidated Multi-Shop Reporting: Uses business-wide logo and lists branches', () => {
  const consolidated = resolveConsolidatedReportIdentity(mockBusiness, [mockShopA, mockShopB]);
  // Consolidated reports must use the parent business logo, not individual shop logos
  assert.equal(consolidated.logoUrl, 'https://example.com/acme-business-logo.png');
  assert.equal(consolidated.businessName, 'Acme Supermarket');
  assert.equal(consolidated.branchCount, 2);
  assert.deepEqual(consolidated.branchNames, [
    'Victoria Island Flagship (VI-01)',
    'Ikeja Mall Branch (IK-02)',
  ]);
  assert.ok(consolidated.scopeLabel.includes('Consolidated: 2 branches'));
});

test('Logo Validation: Enforces formats and size limits', () => {
  // Valid PNG
  const validPng = validateLogoFile({ type: 'image/png', size: 100 * 1024 });
  assert.equal(validPng.valid, true);

  // Valid JPEG
  const validJpeg = validateLogoFile({ type: 'image/jpeg', size: 250 * 1024 });
  assert.equal(validJpeg.valid, true);

  // Valid WebP
  const validWebp = validateLogoFile({ type: 'image/webp', size: 300 * 1024 });
  assert.equal(validWebp.valid, true);

  // Invalid mime type (e.g., SVG or PDF or GIF)
  const invalidType = validateLogoFile({ type: 'image/svg+xml', size: 50 * 1024 });
  assert.equal(invalidType.valid, false);
  assert.ok(invalidType.error?.includes('PNG, JPEG, and WebP'));

  // Exceeding maximum allowed size (e.g. 600KB > 512KB)
  const oversized = validateLogoFile({ type: 'image/png', size: 600 * 1024 });
  assert.equal(oversized.valid, false);
  assert.ok(oversized.error?.includes('File size exceeds'));

  // Empty file (0 bytes)
  const emptyFile = validateLogoFile({ type: 'image/png', size: 0 });
  assert.equal(emptyFile.valid, false);
});

test('Offline Tenant-Isolated Logo Caching: Isolates cache keys by tenant and shop', () => {
  const bizKey = getOfflineLogoStorageKey('biz-test-001');
  const shopKey = getOfflineLogoStorageKey('biz-test-001', 'shop-vi-01');
  const otherBizKey = getOfflineLogoStorageKey('biz-other-999');

  assert.equal(bizKey, 'smartmind_branding_biz-test-001_business');
  assert.equal(shopKey, 'smartmind_branding_biz-test-001_shop_shop-vi-01');
  assert.notEqual(bizKey, otherBizKey);
  assert.notEqual(bizKey, shopKey);
});

test('Branding Permissions & RBAC Enforcement: Owner, Manager, and Cashier distinctions', () => {
  interface TestUser {
    id: string;
    businessId: string;
    role: string;
    assignedShopIds: string[];
    permissions: string[];
  }

  const businessOwnerUser: TestUser = {
    id: 'usr-owner-01',
    businessId: 'biz-test-001',
    role: 'business_owner',
    assignedShopIds: ['shop-vi-01', 'shop-ik-02'],
    permissions: ['manage_business_settings', 'manage_shops'],
  };

  const assignedShopManager: TestUser = {
    id: 'usr-mgr-01',
    businessId: 'biz-test-001',
    role: 'shop_manager',
    assignedShopIds: ['shop-vi-01'],
    permissions: ['manage_products', 'manage_inventory'],
  };

  const unassignedShopManager: TestUser = {
    id: 'usr-mgr-02',
    businessId: 'biz-test-001',
    role: 'shop_manager',
    assignedShopIds: ['shop-ik-02'],
    permissions: ['manage_products'],
  };

  const cashierUser: TestUser = {
    id: 'usr-cashier-01',
    businessId: 'biz-test-001',
    role: 'cashier',
    assignedShopIds: ['shop-vi-01'],
    permissions: ['process_sales'],
  };

  const crossTenantOwner: TestUser = {
    id: 'usr-owner-99',
    businessId: 'biz-other-999',
    role: 'business_owner',
    assignedShopIds: ['shop-other-01'],
    permissions: ['manage_business_settings'],
  };

  const platformAdminUser: TestUser = {
    id: 'usr-admin-01',
    businessId: 'PLATFORM',
    role: 'platform_admin',
    assignedShopIds: [],
    permissions: [],
  };

  // Helper verifying RBAC policy matches UI & backend security rules
  const canModifyBusinessBranding = (user: TestUser, targetBizId: string) => {
    return (
      (user.role === 'business_owner' && user.businessId === targetBizId) ||
      user.role === 'platform_admin'
    );
  };

  const canModifyShopBranding = (user: TestUser, targetBizId: string, targetShopId: string) => {
    if (canModifyBusinessBranding(user, targetBizId)) return true;
    return (
      user.role === 'shop_manager' &&
      user.businessId === targetBizId &&
      user.assignedShopIds.includes(targetShopId)
    );
  };

  // 1. Business Owner can modify business branding for own business
  assert.equal(canModifyBusinessBranding(businessOwnerUser, 'biz-test-001'), true);

  // 2. Platform Admin can modify business branding and shop branding for ANY business
  assert.equal(canModifyBusinessBranding(platformAdminUser, 'biz-test-001'), true);
  assert.equal(canModifyShopBranding(platformAdminUser, 'biz-test-001', 'shop-vi-01'), true);

  // 3. Cross-tenant owner CANNOT modify another business
  assert.equal(canModifyBusinessBranding(crossTenantOwner, 'biz-test-001'), false);

  // 4. Cashier CANNOT modify business or shop branding
  assert.equal(canModifyBusinessBranding(cashierUser, 'biz-test-001'), false);
  assert.equal(canModifyShopBranding(cashierUser, 'biz-test-001', 'shop-vi-01'), false);

  // 5. Assigned Shop Manager can modify assigned shop branding, but NOT parent business branding
  assert.equal(canModifyBusinessBranding(assignedShopManager, 'biz-test-001'), false);
  assert.equal(canModifyShopBranding(assignedShopManager, 'biz-test-001', 'shop-vi-01'), true);

  // 6. Shop Manager CANNOT modify unassigned shop
  assert.equal(canModifyShopBranding(unassignedShopManager, 'biz-test-001', 'shop-vi-01'), false);
});

test('Offline Cache Invalidation & Removal: Clearing logo removes stored key', () => {
  // Simulated storage
  const mockStorage: Record<string, string> = {};
  const fakeLocalStorage = {
    getItem: (k: string) => mockStorage[k] || null,
    setItem: (k: string, v: string) => { mockStorage[k] = v; },
    removeItem: (k: string) => { delete mockStorage[k]; },
  };

  const originalWindow = globalThis.window;
  (globalThis as any).window = { localStorage: fakeLocalStorage };

  try {
    const bizId = 'biz-cache-test';
    const shopId = 'shop-cache-01';

    // 1. Save business logo
    cacheOfflineLogo(bizId, 'data:image/png;base64,TEST_BIZ_LOGO');
    assert.equal(getCachedOfflineLogo(bizId), 'data:image/png;base64,TEST_BIZ_LOGO');

    // 2. Save shop logo
    cacheOfflineLogo(bizId, 'data:image/png;base64,TEST_SHOP_LOGO', shopId);
    assert.equal(getCachedOfflineLogo(bizId, shopId), 'data:image/png;base64,TEST_SHOP_LOGO');

    // 3. Remove business logo (empty string)
    cacheOfflineLogo(bizId, '');
    assert.equal(getCachedOfflineLogo(bizId), undefined);
    assert.equal(mockStorage[getOfflineLogoStorageKey(bizId)], undefined);

    // 4. Shop logo remains isolated and intact
    assert.equal(getCachedOfflineLogo(bizId, shopId), 'data:image/png;base64,TEST_SHOP_LOGO');

    // 5. Remove shop logo
    removeOfflineLogo(bizId, shopId);
    assert.equal(getCachedOfflineLogo(bizId, shopId), undefined);
  } finally {
    (globalThis as any).window = originalWindow;
  }
});

test('Cloud Storage Tenant Paths: Enforces tenant-isolated Storage path hierarchy', () => {
  const bizPath = getStoragePathForLogo('biz-alpha-100');
  assert.equal(bizPath, 'businesses/biz-alpha-100/branding/business-logo');

  const shopPath = getStoragePathForLogo('biz-alpha-100', 'shop-beta-200');
  assert.equal(shopPath, 'businesses/biz-alpha-100/shops/shop-beta-200/branding/shop-logo');
});

test('Cloud Storage Service: Local caching fallback and logo deletion', async () => {
  const mockStorage: Record<string, string> = {};
  const fakeLocalStorage = {
    getItem: (k: string) => mockStorage[k] || null,
    setItem: (k: string, v: string) => { mockStorage[k] = v; },
    removeItem: (k: string) => { delete mockStorage[k]; },
  };

  const originalWindow = globalThis.window;
  (globalThis as any).window = { localStorage: fakeLocalStorage };

  try {
    const bizId = 'biz-cloud-test';
    const shopId = 'shop-cloud-01';
    const testDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    // 1. Upload business logo (falls back gracefully to local cache when offline or storage uninitialized)
    const uploadRes = await uploadLogoToCloudStorage(
  { businessId: bizId, dataUrl: testDataUrl },
  null
);

    assert.equal(uploadRes.success, true);
    assert.equal(getCachedOfflineLogo(bizId), testDataUrl);

    // 2. Upload shop logo
    const shopUploadRes = await uploadLogoToCloudStorage(
  { businessId: bizId, shopId, dataUrl: testDataUrl },
  null
);

    assert.equal(shopUploadRes.success, true);
    assert.equal(getCachedOfflineLogo(bizId, shopId), testDataUrl);

    // 3. Delete shop logo removes cached key
    const deleteResult = await deleteLogoFromCloudStorage(bizId, shopId, null);
    assert.equal(deleteResult, true);
    assert.equal(getCachedOfflineLogo(bizId, shopId), undefined);

    // Parent business logo remains intact
    assert.equal(getCachedOfflineLogo(bizId), testDataUrl);
  } finally {
    (globalThis as any).window = originalWindow;
  }
});
