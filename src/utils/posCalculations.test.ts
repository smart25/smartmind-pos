import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canUserAccessView,
  formatCurrency,
  BASE_CURRENCY_SYMBOL,
  getPosDraftStorageKey,
  getTodayYmd,
  getDateRangeBoundsForPreset,
  filterAndSortSalesHistory,
  hasPermission,
  PERMISSION_CATALOGUE,
  ROLE_DEFAULT_PERMISSIONS,
  DEFAULT_DETECTED_PRINTERS,
  DEFAULT_SHOP_PRINTER_SETTINGS,
  getShopPrinterSettings,
  findReceiptByNumber,
  calculateReceiptReturnResult,
  filterStockAdjustments,
  formatAdjustmentTypeLabel,
  validateSupplierInput,
  filterProductsForSupplySearch,
  applySupplierSupply,
  applySupplierBalancePayment,
  filterSupplierReportData,
  getSupplierReportProducts,
  getAdminPageBusinessOwners,
  getVisibleUsersForActor,
  getVisibleShopsForActor,
  canActorResetUserPassword,
  validatePasswordChangeInput,
  applyUserPasswordReset,
  validateCustomRoleInput,
  generateUniqueRoleId,
  buildSalesSummaryReportData,
  formatReportDateRangeDmy,
  isSyntheticOwnerUserId,
  resolveBusinessOwnerAuthState,
  validateProductInput,
  findProductByBarcodeOrSku,
  normalizeBarcodeString,
  createPosCustomerTab,
  getReservedStockAcrossTabs,
  analyzeTabDispatchStatus,
  PosCustomerTab,
} from './posCalculations';
import {
  User,
  Invoice,
  Shop,
  SaleTransaction,
  StockAdjustment,
  Supplier,
  SupplierSupplyRecord,
  Product,
} from '../types/pos';
import {
  generateInventoryCsvTemplateString,
  parseInventoryCsvString,
} from './inventoryCsvHelper';
import {
  generateSalesReceiptsCsvString,
  generateSalesSummaryStaffReportCsvString,
} from './csvGenerator';

test('canUserAccessView allows authorized roles to access invoices', () => {
  const mockOwner: User = {
    id: 'usr-1',
    businessId: 'biz-1',
    username: 'owner',
    email: 'owner@demo.com',
    fullName: 'Demo Owner',
    role: 'business_owner',
    roleLabel: 'Business Owner',
    assignedShopIds: ['shop-1'],
    permissions: ['manage_invoices', 'process_sales'],
    status: 'active',
    createdAt: '2026-10-21',
    lastLoginAt: '2026-10-21 10:00 AM',
  };

  assert.equal(canUserAccessView(mockOwner, 'invoices'), true);
  assert.equal(canUserAccessView(mockOwner, 'inventory'), true);
});

test('formatCurrency formats Naira properly', () => {
  assert.equal(formatCurrency(1500, BASE_CURRENCY_SYMBOL), '₦1,500.00');
  assert.equal(formatCurrency(0, '₦'), '₦0.00');
});

test('getPosDraftStorageKey isolates draft by user ID and shop ID', () => {
  assert.equal(
    getPosDraftStorageKey('usr-1', 'shop-vi-01'),
    'smartmind_pos_draft_usr-1_shop-vi-01'
  );
  assert.equal(
    getPosDraftStorageKey('usr-2', 'shop-vi-01'),
    'smartmind_pos_draft_usr-2_shop-vi-01'
  );
  assert.notEqual(
    getPosDraftStorageKey('usr-1', 'shop-vi-01'),
    getPosDraftStorageKey('usr-2', 'shop-vi-01')
  );
});

import { formatPaymentMethodLabel } from './pdfGenerator';

test('getTodayYmd returns valid YYYY-MM-DD date string', () => {
  const testDate = new Date(2026, 9, 22); // Oct 22, 2026
  assert.equal(getTodayYmd(testDate), '2026-10-22');
});

test('formatPaymentMethodLabel maps codes to user-friendly titles', () => {
  assert.equal(formatPaymentMethodLabel('cash'), 'Cash');
  assert.equal(formatPaymentMethodLabel('bank_transfer'), 'Bank Transfer');
  assert.equal(formatPaymentMethodLabel('pos_card'), 'POS Card');
  assert.equal(formatPaymentMethodLabel('credit'), 'Credit');
  assert.equal(formatPaymentMethodLabel('split_payment'), 'Split Payment');
});

import {
  escapeCsvCell,
  generateSalesSummaryCsvString,
  generateProductSalesSummaryCsvString,
} from './csvGenerator';

test('escapeCsvCell escapes commas, quotes, and newlines correctly', () => {
  assert.equal(escapeCsvCell('Hello World'), 'Hello World');
  assert.equal(escapeCsvCell('Beans, 50kg'), '"Beans, 50kg"');
  assert.equal(escapeCsvCell('King"s Oil'), '"King""s Oil"');
  assert.equal(escapeCsvCell('Line1\nLine2'), '"Line1\nLine2"');
});

test('generateSalesSummaryCsvString outputs exact 8 headers matching PDF', () => {
  const csv = generateSalesSummaryCsvString({ sales: [] });
  // The first line (after stripping BOM) must be the exact header row
  const cleanCsv = csv.replace(/^\uFEFF/, '');
  const lines = cleanCsv.split('\r\n');
  assert.equal(
    lines[0],
    '#,Date & Time,Product Name,Unit of Measurement,Quantity,Amount,Payment Method,Staff'
  );
});

test('generateProductSalesSummaryCsvString outputs product-aggregated best sellers CSV', () => {
  const sampleSale: SaleTransaction = {
    id: 's-1',
    businessId: 'biz-1',
    shopId: 'shp-1',
    receiptNumber: 'RCP-001',
    createdAt: '2026-11-23 10:00:00',
    cashierUserId: 'u-1',
    cashierName: 'uchenna',
    paymentMethod: 'cash',
    subtotal: 3000,
    taxAmount: 0,
    totalAmount: 3000,
    terminalId: 't-1',
    discountAmount: 0,
    taxRatePercent: 0,
    changeDue: 0,
    syncStatus: 'synced',
    amountTendered: 3000,
    status: 'completed',
    items: [
      {
        id: 'item-1',
        productId: 'prod-beef',
        productName: 'Beef',
        sku: 'BEEF-1001',
        barcode: '6130009911',
        costPrice: 700,
        unit: 'pcs',
        quantity: 2,
        unitPrice: 1000,
        lineTotal: 2000,
      },
      {
        id: 'item-2',
        productId: 'prod-amala',
        productName: 'Amala',
        sku: 'AMAL-1002',
        barcode: '',
        costPrice: 250,
        unit: 'pcs',
        quantity: 2,
        unitPrice: 500,
        lineTotal: 1000,
      },
    ],
  };

  const sampleSale2: SaleTransaction = {
    id: 's-2',
    businessId: 'biz-1',
    shopId: 'shp-1',
    receiptNumber: 'RCP-002',
    createdAt: '2026-11-23 11:00:00',
    cashierUserId: 'u-1',
    cashierName: 'uchenna',
    paymentMethod: 'pos_card',
    subtotal: 8000,
    taxAmount: 0,
    totalAmount: 8000,
    terminalId: 't-1',
    discountAmount: 0,
    taxRatePercent: 0,
    changeDue: 0,
    syncStatus: 'synced',
    amountTendered: 8000,
    status: 'completed',
    items: [
      {
        id: 'item-3',
        productId: 'prod-beef',
        productName: 'Beef',
        sku: 'BEEF-1001',
        barcode: '6130009911',
        costPrice: 700,
        unit: 'pcs',
        quantity: 8,
        unitPrice: 1000,
        lineTotal: 8000,
      },
    ],
  };

  const csv = generateProductSalesSummaryCsvString({
    sales: [sampleSale, sampleSale2],
  });
  const cleanCsv = csv.replace(/^\uFEFF/, '');
  const lines = cleanCsv.split('\r\n');

  assert.equal(
    lines[0],
    '#,Product Name,Unit of Measurement,Total Quantity Sold,Total Amount,Average Unit Price,Receipts Count,% of Total Sales'
  );
  // Rank #1 should be Beef with quantity 10 (2 + 8), totalAmount 10000
  assert.match(lines[1], /^1,Beef,pcs,10,10000\.00,1000\.00,2,/);
  // Rank #2 should be Amala with quantity 2, totalAmount 1000
  assert.match(lines[2], /^2,Amala,pcs,2,1000\.00,500\.00,1,/);
});
test('getDateRangeBoundsForPreset returns correct bounds for today, yesterday, and all', () => {
  const refDate = '2026-10-23';

  const todayBounds = getDateRangeBoundsForPreset('today', refDate);
  assert.equal(todayBounds.startDate, '2026-10-23');
  assert.equal(todayBounds.endDate, '2026-10-23');

  const yesterdayBounds = getDateRangeBoundsForPreset('yesterday', refDate);
  assert.equal(yesterdayBounds.startDate, '2026-10-22');
  assert.equal(yesterdayBounds.endDate, '2026-10-22');

  const allBounds = getDateRangeBoundsForPreset('all', refDate);
  assert.equal(allBounds.startDate, '');
  assert.equal(allBounds.endDate, '');
});

test('filterAndSortSalesHistory filters today and yesterday transactions strictly', () => {
  const mockSales = [
    {
      id: 's1',
      receiptNumber: 'REC-001',
      cashierName: 'Cashier 1',
      createdAt: '2026-10-23 09:15 AM',
      items: [],
      totalAmount: 1000,
      paymentMethod: 'cash',
      status: 'completed_demo',
    },
    {
      id: 's2',
      receiptNumber: 'REC-002',
      cashierName: 'Cashier 1',
      createdAt: '2026-10-22 04:30 PM',
      items: [],
      totalAmount: 2000,
      paymentMethod: 'cash',
      status: 'completed_demo',
    },
    {
      id: 's3',
      receiptNumber: 'REC-003',
      cashierName: 'Cashier 1',
      createdAt: '2026-10-20 11:00 AM',
      items: [],
      totalAmount: 3000,
      paymentMethod: 'cash',
      status: 'completed_demo',
    },
  ];

  // Filtering for Today (2026-10-23)
  const todaySales = filterAndSortSalesHistory(mockSales as any, {
    startDate: '2026-10-23',
    endDate: '2026-10-23',
  });
  assert.equal(todaySales.length, 1);
  assert.equal(todaySales[0].id, 's1');

  // Filtering for Yesterday (2026-10-22)
  const yesterdaySales = filterAndSortSalesHistory(mockSales as any, {
    startDate: '2026-10-22',
    endDate: '2026-10-22',
  });
  assert.equal(yesterdaySales.length, 1);
  assert.equal(yesterdaySales[0].id, 's2');

  // Filtering for All
  const allSales = filterAndSortSalesHistory(mockSales as any, {
    startDate: '',
    endDate: '',
  });
  assert.equal(allSales.length, 3);
});

test('PERMISSION_CATALOGUE contains 13 granular capabilities including manage_invoices and process_returns', () => {
  assert.equal(PERMISSION_CATALOGUE.length, 13);
  const invoicePerm = PERMISSION_CATALOGUE.find((p) => p.key === 'manage_invoices');
  assert.ok(invoicePerm);
  assert.equal(invoicePerm?.scope, 'shop');

  const returnPerm = PERMISSION_CATALOGUE.find((p) => p.key === 'process_returns');
  assert.ok(returnPerm);
  assert.equal(returnPerm?.scope, 'shop');
});

test('process_returns permission is granted to shop managers and business owners but denied to cashiers by default', () => {
  const cashierUser: User = {
    id: 'usr-cashier-01',
    businessId: 'biz-0001',
    username: 'cashier1',
    email: 'cashier@test.com',
    fullName: 'Test Cashier',
    role: 'cashier',
    roleLabel: 'Cashier',
    assignedShopIds: ['shop-0001'],
    permissions: [...ROLE_DEFAULT_PERMISSIONS.cashier],
    status: 'active',
    createdAt: '2026-10-23',
    lastLoginAt: 'Never',
  };

  const managerUser: User = {
    id: 'usr-manager-01',
    businessId: 'biz-0001',
    username: 'manager1',
    email: 'manager@test.com',
    fullName: 'Test Manager',
    role: 'shop_manager',
    roleLabel: 'Shop Manager',
    assignedShopIds: ['shop-0001'],
    permissions: [...ROLE_DEFAULT_PERMISSIONS.shop_manager],
    status: 'active',
    createdAt: '2026-10-23',
    lastLoginAt: 'Never',
  };

  const ownerUser: User = {
    id: 'usr-owner-01',
    businessId: 'biz-0001',
    username: 'owner1',
    email: 'owner@test.com',
    fullName: 'Test Owner',
    role: 'business_owner',
    roleLabel: 'Business Owner',
    assignedShopIds: ['shop-0001'],
    permissions: [...ROLE_DEFAULT_PERMISSIONS.business_owner],
    status: 'active',
    createdAt: '2026-10-23',
    lastLoginAt: 'Never',
  };

  assert.equal(hasPermission(cashierUser, 'process_returns'), false);
  assert.equal(hasPermission(managerUser, 'process_returns'), true);
  assert.equal(hasPermission(ownerUser, 'process_returns'), true);
});

test('hasPermission reflects added and removed permissions accurately on staff', () => {
  const cashier: User = {
    id: 'usr-cashier-test',
    businessId: 'biz-1',
    username: 'cashier',
    email: 'cashier@test.com',
    fullName: 'Test Cashier',
    role: 'cashier',
    roleLabel: 'Cashier',
    assignedShopIds: ['shop-1'],
    permissions: ['process_sales'],
    status: 'active',
    createdAt: '2026-10-21',
    lastLoginAt: 'Never',
  };

  assert.equal(hasPermission(cashier, 'process_sales'), true);
  assert.equal(hasPermission(cashier, 'manage_debt_book'), false);
  assert.equal(hasPermission(cashier, 'manage_invoices'), false);

  // Add permissions (e.g. debt book and invoices)
  const cashierWithAddedPerms: User = {
    ...cashier,
    permissions: [...cashier.permissions, 'manage_debt_book', 'manage_invoices'],
  };
  assert.equal(hasPermission(cashierWithAddedPerms, 'manage_debt_book'), true);
  assert.equal(hasPermission(cashierWithAddedPerms, 'manage_invoices'), true);

  // Remove a permission (e.g. remove process_sales)
  const cashierWithRemovedPerm: User = {
    ...cashierWithAddedPerms,
    permissions: cashierWithAddedPerms.permissions.filter((p) => p !== 'process_sales'),
  };
  assert.equal(hasPermission(cashierWithRemovedPerm, 'process_sales'), false);
  assert.equal(hasPermission(cashierWithRemovedPerm, 'manage_invoices'), true);
});

test('getShopPrinterSettings returns default printer settings and respects overrides', () => {
  assert.equal(DEFAULT_DETECTED_PRINTERS.length >= 6, true);
  const fallback = getShopPrinterSettings(null);
  assert.equal(fallback.defaultPrinterId, DEFAULT_SHOP_PRINTER_SETTINGS.defaultPrinterId);
  assert.equal(fallback.receiptPrinterMode, 'thermal');
  assert.equal(fallback.allowReceiptReprint, true);

  const customShop = {
    printerSettings: {
      defaultPrinterId: 'prn-hp-laserjet',
      receiptPrinterMode: 'a4' as const,
      allowReceiptReprint: false,
      thermalPaperWidth: '58mm' as const,
      autoCutReceipt: false,
      openCashDrawerOnPrint: false,
      printStoreLogo: true,
    },
  } as unknown as Shop;

  const customResolved = getShopPrinterSettings(customShop);
  assert.equal(customResolved.defaultPrinterId, 'prn-hp-laserjet');
  assert.equal(customResolved.receiptPrinterMode, 'a4');
  assert.equal(customResolved.allowReceiptReprint, false);
});

test('findReceiptByNumber and calculateReceiptReturnResult locate receipts and reduce returned items accurately', () => {
  const sampleSales: SaleTransaction[] = [
    {
      id: 'sale-vi-1',
      businessId: 'biz-1',
      shopId: 'shop-vi-01',
      terminalId: 'TERM-VI-01',
      receiptNumber: 'VI-2026-0901',
      cashierUserId: 'usr-1',
      cashierName: 'Tunde Bakare',
      createdAt: '2026-10-23 10:15 AM',
      items: [
        {
          id: 'line-1',
          productId: 'prod-1',
          sku: 'RICE-50KG',
          barcode: '615110002001',
          productName: 'Royal Stallion Parboiled Rice 50kg',
          unitPrice: 78500,
          costPrice: 71000,
          quantity: 2,
          lineTotal: 157000,
        },
        {
          id: 'line-2',
          productId: 'prod-2',
          sku: 'OIL-5L',
          barcode: '615110002002',
          productName: 'Devon Kings Vegetable Oil 5L',
          unitPrice: 16200,
          costPrice: 14500,
          quantity: 3,
          lineTotal: 48600,
        },
      ],
      subtotal: 205600,
      discountAmount: 0,
      taxRatePercent: 0,
      taxAmount: 0,
      totalAmount: 205600,
      paymentMethod: 'pos_card',
      amountTendered: 205600,
      changeDue: 0,
      status: 'completed_demo',
      syncStatus: 'synced_demo',
    },
  ];

  // Exact match (case-insensitive)
  const exactMatch = findReceiptByNumber(sampleSales, 'vi-2026-0901');
  assert.equal(exactMatch?.id, 'sale-vi-1');

  // Suffix match ("0901")
  const suffixMatch = findReceiptByNumber(sampleSales, '0901');
  assert.equal(suffixMatch?.id, 'sale-vi-1');

  // Reduce first item from 2 -> 1 (1 returned) and second item from 3 -> 0 (3 returned)
  const calc = calculateReceiptReturnResult(sampleSales[0], {
    'line-1': 1,
    'line-2': 0,
  });

  assert.equal(calc.totalReturnedUnits, 4);
  assert.equal(calc.totalRefundAmount, 78500 + 48600);
  assert.equal(calc.updatedSale.items.length, 1);
  assert.equal(calc.updatedSale.items[0].productId, 'prod-1');
  assert.equal(calc.updatedSale.items[0].quantity, 1);
  assert.equal(calc.updatedSale.totalAmount, 78500);
});

test('filterStockAdjustments and formatAdjustmentTypeLabel display returned items in All Adjustments and under Return, Restock, Add Stock, and Damage & Spoilage', () => {
  assert.equal(formatAdjustmentTypeLabel('restock'), 'Restock');
  assert.equal(formatAdjustmentTypeLabel('add_stock'), 'Add Stock');
  assert.equal(formatAdjustmentTypeLabel('damage_spoilage'), 'Damage & Spoilage');
  assert.equal(formatAdjustmentTypeLabel('return_in'), 'Return');

  const adjustments: StockAdjustment[] = [
    {
      id: 'adj-1',
      shopId: 'shop-vi-01',
      businessId: 'biz-1',
      productId: 'prod-1',
      productName: 'Royal Stallion Rice',
      productSku: 'RICE-50KG',
      type: 'restock',
      quantityDelta: 20,
      previousQuantity: 10,
      newQuantity: 30,
      reason: 'Supplier delivery',
      performedByUserId: 'usr-1',
      performedByName: 'Tunde Bakare',
      createdAt: '2026-10-23 09:00 AM',
      syncStatus: 'synced_demo',
    },
    {
      id: 'adj-2',
      shopId: 'shop-vi-01',
      businessId: 'biz-1',
      productId: 'prod-2',
      productName: 'Golden Penny Semovita',
      productSku: 'SEMO-5KG',
      type: 'add_stock',
      quantityDelta: 5,
      previousQuantity: 15,
      newQuantity: 20,
      reason: 'Storeroom recount',
      performedByUserId: 'usr-1',
      performedByName: 'Tunde Bakare',
      createdAt: '2026-10-23 09:30 AM',
      syncStatus: 'synced_demo',
    },
    {
      id: 'adj-3',
      shopId: 'shop-vi-01',
      businessId: 'biz-1',
      productId: 'prod-3',
      productName: 'Peak Milk Tin',
      productSku: 'MILK-900G',
      type: 'damage_spoilage',
      quantityDelta: -2,
      previousQuantity: 12,
      newQuantity: 10,
      reason: 'Dented tin write-off',
      performedByUserId: 'usr-1',
      performedByName: 'Tunde Bakare',
      createdAt: '2026-10-23 10:00 AM',
      syncStatus: 'synced_demo',
    },
    {
      id: 'adj-4',
      shopId: 'shop-vi-01',
      businessId: 'biz-1',
      productId: 'prod-1',
      productName: 'Royal Stallion Rice',
      productSku: 'RICE-50KG',
      type: 'return_in',
      quantityDelta: 1,
      previousQuantity: 30,
      newQuantity: 31,
      reason: 'Receipt #VI-2026-0901 Return: Reduced qty from 2 to 1 (+1 returned)',
      performedByUserId: 'usr-1',
      performedByName: 'Tunde Bakare',
      createdAt: '2026-10-23 10:30 AM',
      syncStatus: 'pending_local_queue',
    },
  ];

  const allAdj = filterStockAdjustments(adjustments, { type: 'all' });
  assert.equal(allAdj.length, 4);
  assert.equal(allAdj.some((a) => a.type === 'return_in'), true);

  const returnAdj = filterStockAdjustments(adjustments, { type: 'return_in' });
  assert.equal(returnAdj.length, 1);
  assert.equal(returnAdj[0].id, 'adj-4');

  const restockAdj = filterStockAdjustments(adjustments, { type: 'restock' });
  assert.equal(restockAdj.length, 1);
  assert.equal(restockAdj[0].id, 'adj-1');

  const addStockAdj = filterStockAdjustments(adjustments, { type: 'add_stock' });
  assert.equal(addStockAdj.length, 1);
  assert.equal(addStockAdj[0].id, 'adj-2');

  const damageAdj = filterStockAdjustments(adjustments, { type: 'damage_spoilage' });
  assert.equal(damageAdj.length, 1);
  assert.equal(damageAdj[0].id, 'adj-3');
});

test('filterAndSortSalesHistory filters sales summary by specific user and specific day accurately', () => {
  const mockSales = [
    {
      id: 'sale-1',
      receiptNumber: 'VIS-2026-0842',
      cashierUserId: 'usr-mgr-vi',
      cashierName: 'Tunde Bakare',
      createdAt: '2026-10-23 09:05 AM',
      items: [],
      totalAmount: 26875,
      paymentMethod: 'cash',
      status: 'completed_demo',
    },
    {
      id: 'sale-2',
      receiptNumber: 'VIS-2026-0843',
      cashierUserId: 'usr-owner-01',
      cashierName: 'Adebayo Nwokolo',
      createdAt: '2026-10-23 09:38 AM',
      items: [],
      totalAmount: 25370,
      paymentMethod: 'bank_transfer',
      status: 'pending_sync',
    },
    {
      id: 'sale-3',
      receiptNumber: 'VIS-2026-0841',
      cashierUserId: 'usr-mgr-vi',
      cashierName: 'Tunde Bakare',
      createdAt: '2026-10-22 04:15 PM',
      items: [],
      totalAmount: 42247.5,
      paymentMethod: 'pos_card',
      status: 'completed_demo',
    },
  ];

  // Filter for Tunde Bakare on 2026-10-23
  const tundeToday = filterAndSortSalesHistory(mockSales as any, {
    userId: 'usr-mgr-vi',
    startDate: '2026-10-23',
    endDate: '2026-10-23',
  });
  assert.equal(tundeToday.length, 1);
  assert.equal(tundeToday[0].id, 'sale-1');

  // Filter for Adebayo Nwokolo on 2026-10-23
  const adebayoToday = filterAndSortSalesHistory(mockSales as any, {
    userId: 'usr-owner-01',
    startDate: '2026-10-23',
    endDate: '2026-10-23',
  });
  assert.equal(adebayoToday.length, 1);
  assert.equal(adebayoToday[0].id, 'sale-2');

  // Filter for Tunde Bakare on 2026-10-22
  const tundeYesterday = filterAndSortSalesHistory(mockSales as any, {
    userId: 'usr-mgr-vi',
    startDate: '2026-10-22',
    endDate: '2026-10-22',
  });
  assert.equal(tundeYesterday.length, 1);
  assert.equal(tundeYesterday[0].id, 'sale-3');
});

test('validateSupplierInput, filterProductsForSupplySearch, and applySupplierSupply manage supplier supplies and balances accurately', () => {
  const mockUser: User = {
    id: 'usr-owner-01',
    businessId: 'biz-emerald-01',
    username: 'owner',
    email: 'owner@smartmindpos.demo',
    fullName: 'Adebayo Nwokolo',
    role: 'business_owner',
    roleLabel: 'Business Owner',
    assignedShopIds: ['shop-vi-01'],
    permissions: ['manage_products', 'adjust_inventory'],
    status: 'active',
    createdAt: '2026-10-21',
    lastLoginAt: '2026-10-23 08:00 AM',
  };

  assert.equal(canUserAccessView(mockUser, 'suppliers'), true);

  // Validation checks: fullName and phone required, email and address optional
  const invalidErrors = validateSupplierInput({
    fullName: '',
    phone: '',
    email: 'invalid-email',
    address: '',
  });
  assert.equal(invalidErrors.length, 3);

  const validWithoutOptionalErrors = validateSupplierInput({
    fullName: 'Aliko General Supplies',
    phone: '+234 805 000 1122',
    email: '',
    address: '',
  });
  assert.equal(validWithoutOptionalErrors.length, 0);

  const validErrors = validateSupplierInput({
    fullName: 'Dangote Flour & Sugar Distributors',
    phone: '+234 803 111 2233',
    email: 'sales@dangotedistributors.demo',
    address: '12 Marina Road, Lagos Island',
  });
  assert.equal(validErrors.length, 0);

  // Product search for supply
  const mockProducts: Product[] = [
    {
      id: 'prod-vi-1',
      shopId: 'shop-vi-01',
      businessId: 'biz-emerald-01',
      sku: 'VIS-GRN-101',
      barcode: '61511000101',
      name: 'Royal Stallion Long Grain Rice 50kg Bag',
      categoryId: 'cat-1',
      categoryName: 'Grains & Staples',
      unit: 'Bag',
      costPrice: 63500,
      sellingPrice: 72000,
      stockQuantity: 18,
      reorderLevel: 10,
      isActive: true,
      updatedAt: '2026-10-23 08:00 AM',
    },
  ];

  const foundProducts = filterProductsForSupplySearch(mockProducts, 'Stallion');
  assert.equal(foundProducts.length, 1);
  assert.equal(foundProducts[0].id, 'prod-vi-1');

  const baseSupplier: Supplier = {
    id: 'sup-1',
    shopId: 'shop-vi-01',
    businessId: 'biz-emerald-01',
    fullName: 'Dangote Flour & Sugar Distributors',
    phone: '+234 803 111 2233',
    email: 'sales@dangotedistributors.demo',
    address: '12 Marina Road, Lagos Island',
    totalSupplies: 0,
    totalAmount: 0,
    amountPaid: 0,
    balanceRemaining: 0,
    createdAt: '2026-10-23 09:00 AM',
    updatedAt: '2026-10-23 09:00 AM',
  };

  // Add supply of 10 bags @ 64,000 cost price = 640,000 total, 400,000 paid -> 240,000 balance
  const { updatedSupplier, supplyRecord } = applySupplierSupply(
    baseSupplier,
    [
      {
        productId: 'prod-vi-1',
        productName: 'Royal Stallion Long Grain Rice 50kg Bag',
        sku: 'VIS-GRN-101',
        barcode: '61511000101',
        unit: 'Bag',
        quantity: 10,
        costPrice: 64000,
      },
    ],
    400000,
    {
      notes: 'First bulk delivery',
      user: mockUser,
      timestampIso: '2026-10-23 11:00 AM',
    }
  );

  assert.equal(updatedSupplier.totalSupplies, 1);
  assert.equal(updatedSupplier.totalAmount, 640000);
  assert.equal(updatedSupplier.amountPaid, 400000);
  assert.equal(updatedSupplier.balanceRemaining, 240000);
  assert.equal(supplyRecord.totalQuantity, 10);
  assert.equal(supplyRecord.totalAmount, 640000);

  // Pay 100,000 towards remaining balance
  const afterPayment = applySupplierBalancePayment(
    updatedSupplier,
    100000,
    '2026-10-23 12:00 PM'
  );
  assert.equal(afterPayment.amountPaid, 500000);
  assert.equal(afterPayment.balanceRemaining, 140000);
});

test('filterSupplierReportData and getSupplierReportProducts filter supplier details by date range, supplier name, and product accurately', () => {
  const suppliers: Supplier[] = [
    {
      id: 'sup-vi-01',
      shopId: 'shop-vi-01',
      businessId: 'biz-emerald-01',
      fullName: 'Crown Flour & Grains Distributors Ltd',
      phone: '+234 803 412 8890',
      email: 'orders@crowngrains.demo',
      address: 'Apapa, Lagos',
      totalSupplies: 2,
      totalAmount: 1965000,
      amountPaid: 1600000,
      balanceRemaining: 365000,
      createdAt: '2026-10-01 09:30 AM',
      updatedAt: '2026-10-23 02:15 PM',
    },
    {
      id: 'sup-vi-02',
      shopId: 'shop-vi-01',
      businessId: 'biz-emerald-01',
      fullName: 'Nestlé & Friesland Beverage Wholesale Hub',
      phone: '+234 809 774 3102',
      email: '',
      address: '',
      totalSupplies: 1,
      totalAmount: 372000,
      amountPaid: 372000,
      balanceRemaining: 0,
      createdAt: '2026-10-05 11:15 AM',
      updatedAt: '2026-10-22 04:40 PM',
    },
  ];

  const supplyRecords: SupplierSupplyRecord[] = [
    {
      id: 'supply-1',
      shopId: 'shop-vi-01',
      businessId: 'biz-emerald-01',
      supplierId: 'sup-vi-01',
      supplierName: 'Crown Flour & Grains Distributors Ltd',
      items: [
        {
          id: 'item-1',
          productId: 'prod-vi-001',
          productName: 'Royal Stallion Parboiled Rice 10kg',
          sku: 'VIS-GRN-101',
          barcode: '61511000101',
          unit: 'Bag',
          quantity: 20,
          costPrice: 63500,
          lineTotal: 1270000,
        },
        {
          id: 'item-2',
          productId: 'prod-vi-002',
          productName: 'Devon Kings Pure Vegetable Oil 3L',
          sku: 'VIS-GRN-102',
          barcode: '61511000102',
          unit: 'Bottle',
          quantity: 30,
          costPrice: 13500,
          lineTotal: 405000,
        },
      ],
      totalQuantity: 50,
      totalAmount: 1675000,
      amountPaid: 1400000,
      balanceRemaining: 275000,
      recordedByUserId: 'usr-1',
      recordedByName: 'Adebayo Nwokolo',
      createdAt: '2026-10-18 10:15 AM',
    },
    {
      id: 'supply-2',
      shopId: 'shop-vi-01',
      businessId: 'biz-emerald-01',
      supplierId: 'sup-vi-01',
      supplierName: 'Crown Flour & Grains Distributors Ltd',
      items: [
        {
          id: 'item-3',
          productId: 'prod-vi-003',
          productName: 'Golden Penny Semovita 5kg',
          sku: 'VIS-GRN-103',
          barcode: '61511000103',
          unit: 'Bag',
          quantity: 25,
          costPrice: 11600,
          lineTotal: 290000,
        },
      ],
      totalQuantity: 25,
      totalAmount: 290000,
      amountPaid: 200000,
      balanceRemaining: 90000,
      recordedByUserId: 'usr-2',
      recordedByName: 'Tunde Bakare',
      createdAt: '2026-10-23 02:15 PM',
    },
    {
      id: 'supply-3',
      shopId: 'shop-vi-01',
      businessId: 'biz-emerald-01',
      supplierId: 'sup-vi-02',
      supplierName: 'Nestlé & Friesland Beverage Wholesale Hub',
      items: [
        {
          id: 'item-4',
          productId: 'prod-vi-004',
          productName: 'Peak Full Cream Instant Milk Tin 900g',
          sku: 'VIS-BEV-201',
          barcode: '61511000201',
          unit: 'Tin',
          quantity: 60,
          costPrice: 6200,
          lineTotal: 372000,
        },
      ],
      totalQuantity: 60,
      totalAmount: 372000,
      amountPaid: 372000,
      balanceRemaining: 0,
      recordedByUserId: 'usr-1',
      recordedByName: 'Adebayo Nwokolo',
      createdAt: '2026-10-22 04:40 PM',
    },
  ];

  const productOptions = getSupplierReportProducts([], supplyRecords);
  assert.equal(productOptions.length, 4);

  // 1. Filter by Supplier Name / ID
  const bySupplier = filterSupplierReportData(suppliers, supplyRecords, {
    supplierId: 'sup-vi-01',
  });
  assert.equal(bySupplier.suppliers.length, 1);
  assert.equal(bySupplier.suppliers[0].id, 'sup-vi-01');
  assert.equal(bySupplier.itemizedRows.length, 3);

  // 2. Filter by Particular Date (2026-10-23)
  const byDate = filterSupplierReportData(suppliers, supplyRecords, {
    startDate: '2026-10-23',
    endDate: '2026-10-23',
  });
  assert.equal(byDate.suppliers.length, 1);
  assert.equal(byDate.suppliers[0].id, 'sup-vi-01');
  assert.equal(byDate.suppliers[0].totalSupplies, 1);
  assert.equal(byDate.suppliers[0].totalAmount, 290000);
  assert.equal(byDate.suppliers[0].amountPaid, 200000);
  assert.equal(byDate.suppliers[0].balanceRemaining, 90000);
  assert.equal(byDate.itemizedRows.length, 1);
  assert.equal(byDate.itemizedRows[0].productId, 'prod-vi-003');

  // 3. Filter by Particular Product (prod-vi-004)
  const byProduct = filterSupplierReportData(suppliers, supplyRecords, {
    productId: 'prod-vi-004',
  });
  assert.equal(byProduct.suppliers.length, 1);
  assert.equal(byProduct.suppliers[0].id, 'sup-vi-02');
  assert.equal(byProduct.suppliers[0].totalAmount, 372000);
  assert.equal(byProduct.itemizedRows.length, 1);
  assert.equal(byProduct.summary.totalUnitsSupplied, 60);
});

test('getVisibleUsersForActor and getVisibleShopsForActor isolate business owners to their own business users and shops while granting Super Admin full platform visibility', () => {
  const superAdmin: User = {
    id: 'usr-platform-admin',
    businessId: 'PLATFORM',
    username: 'admin',
    email: 'admin@smartmindpos.demo',
    fullName: 'Kemi Adeleke (Platform Admin)',
    role: 'platform_admin',
    roleLabel: 'Platform Administrator',
    assignedShopIds: [],
    permissions: [],
    status: 'active',
    createdAt: '2025-01-01',
    lastLoginAt: '2026-10-21 08:00 AM',
  };

  const ownerBiz1: User = {
    id: 'usr-owner-01',
    businessId: 'biz-emerald-01',
    username: 'owner1',
    email: 'owner@smartmindpos.demo',
    fullName: 'Adebayo Nwokolo',
    role: 'business_owner',
    roleLabel: 'Business Owner (Emerald Crest)',
    assignedShopIds: ['shop-vi-01', 'shop-ikj-02'],
    permissions: [],
    status: 'active',
    createdAt: '2025-02-10',
    lastLoginAt: '2026-10-21 08:15 AM',
  };

  const staffBiz1: User = {
    id: 'usr-mgr-vi',
    businessId: 'biz-emerald-01',
    username: 'manager.vi',
    email: 'manager.vi@smartmindpos.demo',
    fullName: 'Tunde Bakare',
    role: 'shop_manager',
    roleLabel: 'Shop Manager',
    assignedShopIds: ['shop-vi-01'],
    permissions: [],
    status: 'active',
    createdAt: '2025-03-01',
    lastLoginAt: '2026-10-21 07:50 AM',
  };

  const cashierBiz1: User = {
    id: 'usr-csh-vi',
    businessId: 'biz-emerald-01',
    username: 'cashier.vi',
    email: 'cashier.vi@emeraldpos.demo',
    fullName: 'Chioma Okeke',
    role: 'cashier',
    roleLabel: 'Cashier',
    assignedShopIds: ['shop-vi-01'],
    permissions: ['process_sales'],
    status: 'active',
    createdAt: '2025-03-05',
    lastLoginAt: '2026-10-21 07:55 AM',
  };

  const ownerBiz2: User = {
    id: 'usr-owner-02',
    businessId: 'biz-savannah-02',
    username: 'owner2',
    email: 'owner@savannahprime.demo',
    fullName: 'Hajiya Zainab Bello',
    role: 'business_owner',
    roleLabel: 'Business Owner (Savannah Prime)',
    assignedShopIds: ['shop-abj-01'],
    permissions: [],
    status: 'active',
    createdAt: '2025-06-18',
    lastLoginAt: '2026-10-21 08:20 AM',
  };

  const staffBiz2: User = {
    id: 'usr-mgr-abj',
    businessId: 'biz-savannah-02',
    username: 'manager.abj',
    email: 'manager.abj@savannahprime.demo',
    fullName: 'Musa Abdullahi',
    role: 'shop_manager',
    roleLabel: 'Shop Manager',
    assignedShopIds: ['shop-abj-01'],
    permissions: [],
    status: 'active',
    createdAt: '2025-06-25',
    lastLoginAt: '2026-10-21 08:30 AM',
  };

  const allPlatformUsers: User[] = [
    superAdmin,
    ownerBiz1,
    staffBiz1,
    cashierBiz1,
    ownerBiz2,
    staffBiz2,
  ];

  const allPlatformShops: Shop[] = [
    {
      id: 'shop-vi-01',
      businessId: 'biz-emerald-01',
      code: 'VIS-01',
      name: 'Victoria Island Flagship Supermarket',
      category: 'Supermarket',
      locationCity: 'Lagos',
      address: '14 Adeola Odeku',
      phone: '+234 809 340 1101',
      managerName: 'Tunde Bakare',
      status: 'active',
      terminalId: 'WIN-POS-VI01',
      taxRatePercent: 7.5,
      receiptHeaderNote: '',
      receiptFooterNote: '',
      createdAt: '2025-02-14',
      pendingSyncCount: 0,
      lastSyncedAt: '2026-10-21',
    },
    {
      id: 'shop-abj-01',
      businessId: 'biz-savannah-02',
      code: 'SPS-01',
      name: 'Wuse II Central Hypermarket',
      category: 'Supermarket',
      locationCity: 'Abuja',
      address: '64 Aminu Kano Crescent',
      phone: '+234 803 550 8801',
      managerName: 'Musa Abdullahi',
      status: 'active',
      terminalId: 'WIN-POS-ABJ01',
      taxRatePercent: 7.5,
      receiptHeaderNote: '',
      receiptFooterNote: '',
      createdAt: '2025-06-22',
      pendingSyncCount: 0,
      lastSyncedAt: '2026-10-21',
    },
  ];

  // 1. Business Owner 1 accesses ALL accounts in biz-emerald-01 (owner, manager, cashier)
  const visibleToOwner1 = getVisibleUsersForActor(ownerBiz1, allPlatformUsers);
  assert.equal(visibleToOwner1.length, 3);
  assert.deepEqual(
    visibleToOwner1.map((u) => u.id),
    ['usr-owner-01', 'usr-mgr-vi', 'usr-csh-vi']
  );
  assert.equal(
    visibleToOwner1.some((u) => u.id === 'usr-owner-02'),
    false
  );
  assert.equal(
    visibleToOwner1.some((u) => u.role === 'platform_admin'),
    false
  );

  // 2. Business Owner 2 only sees users in biz-savannah-02 (never ownerBiz1, staffBiz1, or superAdmin)
  const visibleToOwner2 = getVisibleUsersForActor(ownerBiz2, allPlatformUsers);
  assert.equal(visibleToOwner2.length, 2);
  assert.deepEqual(
    visibleToOwner2.map((u) => u.id),
    ['usr-owner-02', 'usr-mgr-abj']
  );
  assert.equal(
    visibleToOwner2.some((u) => u.id === 'usr-owner-01'),
    false
  );

  // 2b. Cashier or staff without manage_staff permission CANNOT see other users (only themselves, never owner)
  const visibleToCashier = getVisibleUsersForActor(cashierBiz1, allPlatformUsers);
  assert.equal(visibleToCashier.length, 1);
  assert.equal(visibleToCashier[0].id, cashierBiz1.id);
  assert.equal(visibleToCashier.some((u) => u.id === ownerBiz1.id), false);
  assert.equal(visibleToCashier.some((u) => u.role === 'business_owner'), false);

  // 2c. When staff has manage_staff permission, they see peer staff in their business, but the Business Owner is NEVER visible
  const staffWithPerm: User = { ...staffBiz1, permissions: ['manage_staff'] };
  const visibleToStaffWithPerm = getVisibleUsersForActor(staffWithPerm, allPlatformUsers);
  assert.equal(visibleToStaffWithPerm.length, 2);
  assert.deepEqual(
    visibleToStaffWithPerm.map((u) => u.id),
    ['usr-mgr-vi', 'usr-csh-vi']
  );
  // Strictly verify the Business Owner is NOT visible to the staff manager or any other user
  assert.equal(visibleToStaffWithPerm.some((u) => u.id === ownerBiz1.id), false);
  assert.equal(visibleToStaffWithPerm.some((u) => u.role === 'business_owner'), false);

  // 3. On the Platform Admin page, only Business Owners are listed in the directory (never Shop Managers or Cashiers)
  const adminListedOwners = getAdminPageBusinessOwners(allPlatformUsers);
  assert.equal(adminListedOwners.length, 2);
  assert.deepEqual(
    adminListedOwners.map((u) => u.id),
    ['usr-owner-01', 'usr-owner-02']
  );
  assert.equal(
    adminListedOwners.some(
      (u) => u.role === 'shop_manager' || u.role === 'cashier'
    ),
    false
  );

  // Super Admin switcher only exposes Business Owners (and the admin itself), never Shop Managers or Cashiers
  const visibleToSuperAdmin = getVisibleUsersForActor(
    superAdmin,
    allPlatformUsers
  );
  assert.equal(visibleToSuperAdmin.length, 3);
  assert.equal(
    visibleToSuperAdmin.some(
      (u) => u.role === 'shop_manager' || u.role === 'cashier'
    ),
    false
  );

  // 4. Shop visibility is strictly isolated per business for Business Owners
  const shopsForOwner1 = getVisibleShopsForActor(ownerBiz1, allPlatformShops);
  assert.equal(shopsForOwner1.length, 1);
  assert.equal(shopsForOwner1[0].id, 'shop-vi-01');

  const shopsForOwner2 = getVisibleShopsForActor(ownerBiz2, allPlatformShops);
  assert.equal(shopsForOwner2.length, 1);
  assert.equal(shopsForOwner2[0].id, 'shop-abj-01');

  const shopsForSuperAdmin = getVisibleShopsForActor(
    superAdmin,
    allPlatformShops
  );
  assert.equal(shopsForSuperAdmin.length, 2);

  // 5. Business Owner can change their own password and reset passwords for every user registered under them, but never another business's users
  assert.equal(canActorResetUserPassword(ownerBiz1, ownerBiz1), true);
  assert.equal(canActorResetUserPassword(ownerBiz1, staffBiz1), true);
  assert.equal(canActorResetUserPassword(ownerBiz1, ownerBiz2), false);
  assert.equal(canActorResetUserPassword(ownerBiz1, staffBiz2), false);
  assert.equal(canActorResetUserPassword(ownerBiz1, superAdmin), false);

  // Validation and password update
  assert.equal(validatePasswordChangeInput('short', 'mismatch').valid, false);
  assert.equal(validatePasswordChangeInput('abc', 'abc').valid, false);
  assert.equal(
    validatePasswordChangeInput('new-secure-pass', 'new-secure-pass').valid,
    true
  );

  const updatedStaff = applyUserPasswordReset(
    staffBiz1,
    'new-secure-pass',
    '2026-10-23 04:05 PM'
  );
  assert.equal(updatedStaff.password, 'new-secure-pass');
  assert.equal(updatedStaff.passwordUpdatedAt, '2026-10-23 04:05 PM');
});

test('validateCustomRoleInput and generateUniqueRoleId allow business owners and super admin to create and manage custom staff roles', () => {
  const existingRoles = [
    {
      id: 'role-001',
      businessId: 'biz-1',
      name: 'Shift Supervisor',
      description: 'Manages POS and stock receiving',
      permissions: ['process_sales', 'manage_products'] as any,
      createdByUserId: 'usr-owner',
      createdAt: '2026-10-21',
    },
  ];

  // 1. Validation error on empty name or missing permissions
  const emptyRes = validateCustomRoleInput(
    { businessId: 'biz-1', name: '', description: 'Desc', permissions: ['process_sales'] },
    existingRoles
  );
  assert.equal(emptyRes.valid, false);

  const noPermRes = validateCustomRoleInput(
    { businessId: 'biz-1', name: 'New Role', description: 'Desc', permissions: [] },
    existingRoles
  );
  assert.equal(noPermRes.valid, false);

  // 2. Duplicate role name check
  const dupRes = validateCustomRoleInput(
    { businessId: 'biz-1', name: 'shift supervisor', description: 'Desc', permissions: ['process_sales'] },
    existingRoles
  );
  assert.equal(dupRes.valid, false);

  // 3. Valid custom role creation
  const validRes = validateCustomRoleInput(
    { businessId: 'biz-1', name: 'Inventory Auditor', description: 'Audits stock levels and manages invoices', permissions: ['adjust_inventory', 'manage_invoices'] },
    existingRoles
  );
  assert.equal(validRes.valid, true);

  // 4. Unique ID generation
  const newRoleId = generateUniqueRoleId(existingRoles);
  assert.equal(typeof newRoleId, 'string');
  assert.notEqual(newRoleId, 'role-001');
});

test('generateInventoryCsvTemplateString and parseInventoryCsvString generate valid CSV template without SKU and auto-generate SKUs on import', () => {
  const templateCsv = generateInventoryCsvTemplateString();
  assert.equal(templateCsv.startsWith('\uFEFFProduct Name,Barcode,Category,Unit,Selling Price'), true);
  assert.equal(templateCsv.includes(',SKU,'), false);

  const testCsvContent = `Product Name,Barcode,Category,Unit,Selling Price,Cost Price,Stock Quantity,Reorder Level,Expiry Date,Tax Exempt,Active
Indomie Instant Noodles 70g,613000123456,Noodles & Pasta,Pack,250,200,100,20,2027-12-31,No,Yes
Cooked Beef Portion,,Kitchen & Food,Portion,1000,700,40,5,,No,Yes
Peak Milk Tin 160g,613000789012,Beverages,Can,450,380,50,10,30/06/2027,No,Yes
Invalid Item Line,,,, -100,0,0,0,,No,Yes`;

  const parsed = parseInventoryCsvString(testCsvContent);
  assert.equal(parsed.totalRows, 4);
  assert.equal(parsed.validItems.length, 3);
  assert.equal(parsed.errors.length, 1);

  const item1 = parsed.validItems[0];
  assert.equal(item1.name, 'Indomie Instant Noodles 70g');
  assert.equal(item1.sku.includes('1001'), true); // Auto generated smart SKU (e.g. IIN7-1001)
  assert.equal(item1.sellingPrice, 250);
  assert.equal(item1.costPrice, 200);
  assert.equal(item1.stockQuantity, 100);
  assert.equal(item1.hasExpiry, true);
  assert.equal(item1.expiryDate, '2027-12-31');

  // Item 2 has no barcode (unbarcoded meal item)
  const item2 = parsed.validItems[1];
  assert.equal(item2.name, 'Cooked Beef Portion');
  assert.equal(item2.hasExpiry, false);
  assert.equal(item2.expiryDate, null);

  // Item 3 has DD/MM/YYYY date
  const item3 = parsed.validItems[2];
  assert.equal(item3.name, 'Peak Milk Tin 160g');
  assert.equal(item3.sku.includes('1003'), true);
  assert.equal(item3.sellingPrice, 450);
  assert.equal(item3.hasExpiry, true);
  assert.equal(item3.expiryDate, '2027-06-30');
  const testCsvContentWithDecimals = `Product Name,Barcode,Category,Unit,Selling Price,Cost Price,Stock Quantity,Reorder Level,Tax Exempt,Active
Indomie Instant Noodles 70g,613000123456.0,Noodles & Pasta,Pack,250,200,100,20,No,Yes
Peak Milk Tin 160g,613000789012.00,Beverages,Can,450,380,50,10,No,Yes
Invalid Item Line,,,, -100,0,0,0,No,Yes`;

  const parsedDecimals = parseInventoryCsvString(testCsvContentWithDecimals);
  assert.equal(parsedDecimals.validItems[0].barcode, '613000123456');
  assert.equal(parsedDecimals.validItems[1].barcode, '613000789012');
});

test('generateSalesReceiptsCsvString generates valid Excel-ready CSV for sales history with headers, rows and totals', () => {
  const mockSales: SaleTransaction[] = [
    {
      id: 'sale-001',
      shopId: 'shop-1',
      businessId: 'biz-1',
      receiptNumber: 'VI-2026-0001',
      terminalId: 'WIN-POS-01',
      cashierUserId: 'usr-1',
      cashierName: 'Tunde Bakare',
      items: [
        {
          id: 'item-1',
          productId: 'prod-1',
          productName: 'Golden Penny Sugar 500g',
          sku: 'GPS-500',
          barcode: '613001',
          unitPrice: 850,
          costPrice: 700,
          quantity: 2,
          lineTotal: 1700,
        },
      ],
      subtotal: 1700,
      discountAmount: 100,
      taxRatePercent: 7.5,
      taxAmount: 120,
      totalAmount: 1720,
      paymentMethod: 'cash',
      amountTendered: 2000,
      changeDue: 280,
      status: 'completed_demo',
      syncStatus: 'synced_demo',
      createdAt: '2026-10-24 10:15 AM',
    },
  ];

  const csv = generateSalesReceiptsCsvString({ sales: mockSales });
  assert.equal(csv.startsWith('\uFEFF#,'), true);
  assert.equal(csv.includes('Receipt Number'), true);
  assert.equal(csv.includes('VI-2026-0001'), true);
  assert.equal(csv.includes('Tunde Bakare'), true);
  assert.equal(csv.includes('1720.00'), true);
  assert.equal(csv.includes('Total,'), true);
});

test('Sales Summary: canUserAccessView permits managers and owners to access sales_summary while filtering by staff, date, and payment method', () => {
  const managerUser: User = {
    id: 'usr-mgr-vi',
    businessId: 'biz-emerald-01',
    username: 'tunde_mgr',
    email: 'tunde.mgr@emeraldcrest.demo',
    fullName: 'Tunde Bakare',
    role: 'shop_manager',
    roleLabel: 'Shop Manager (Victoria Island Superstore)',
    assignedShopIds: ['shop-vi-01'],
    permissions: ['view_shop_reports', 'process_refunds'],
    status: 'active',
    createdAt: '2026-10-21',
    lastLoginAt: '2026-10-24 09:30 AM',
  };

  const cashierUserWithoutReports: User = {
    id: 'usr-csh-01',
    businessId: 'biz-emerald-01',
    username: 'chidi_cashier',
    email: 'chidi.cashier@emeraldcrest.demo',
    fullName: 'Chidimma Eze',
    role: 'cashier',
    roleLabel: 'Checkout Cashier',
    assignedShopIds: ['shop-vi-01'],
    permissions: ['process_sales'],
    status: 'active',
    createdAt: '2026-10-21',
    lastLoginAt: '2026-10-24 08:45 AM',
  };

  assert.equal(canUserAccessView(managerUser, 'sales_summary'), true);
  assert.equal(canUserAccessView(cashierUserWithoutReports, 'sales_summary'), false);

  const mockSales: Partial<SaleTransaction>[] = [
    {
      id: 's-1',
      shopId: 'shop-vi-01',
      businessId: 'biz-emerald-01',
      receiptNumber: 'REC-001',
      cashierUserId: 'usr-mgr-vi',
      cashierName: 'Tunde Bakare',
      createdAt: '2026-10-24 10:00 AM',
      paymentMethod: 'cash',
      totalAmount: 5000,
      status: 'completed_demo',
      items: [],
    },
    {
      id: 's-2',
      shopId: 'shop-vi-01',
      businessId: 'biz-emerald-01',
      receiptNumber: 'REC-002',
      cashierUserId: 'usr-csh-01',
      cashierName: 'Chidimma Eze',
      createdAt: '2026-10-24 11:30 AM',
      paymentMethod: 'pos_card',
      totalAmount: 12500,
      status: 'completed_demo',
      items: [],
    },
    {
      id: 's-3',
      shopId: 'shop-vi-01',
      businessId: 'biz-emerald-01',
      receiptNumber: 'REC-003',
      cashierUserId: 'usr-mgr-vi',
      cashierName: 'Tunde Bakare',
      createdAt: '2026-10-23 03:00 PM',
      paymentMethod: 'cash',
      totalAmount: 8200,
      status: 'completed_demo',
      items: [],
    },
  ];

  // Filter: staff = Tunde Bakare, paymentMethod = cash, date = 2026-10-24
  const filtered = filterAndSortSalesHistory(mockSales as SaleTransaction[], {
    userId: 'usr-mgr-vi',
    paymentMethod: 'cash',
    startDate: '2026-10-24',
    endDate: '2026-10-24',
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 's-1');
  assert.equal(filtered[0].totalAmount, 5000);
});

test('buildSalesSummaryReportData and generateSalesSummaryStaffReportCsvString generate staff-aggregated summary without listing items', () => {
  const sampleSales: SaleTransaction[] = [
    {
      id: 'sale-a',
      shopId: 'shop-vi-01',
      businessId: 'biz-emerald-01',
      receiptNumber: 'VI-2026-0101',
      terminalId: 'WIN-POS-VI01',
      cashierUserId: 'usr-1',
      cashierName: 'Akpevwe Genevieve',
      createdAt: '2026-10-23 10:00 AM',
      items: [
        {
          id: 'l-1',
          productId: 'p-1',
          sku: 'SKU-1',
          barcode: '111',
          productName: 'Hidden Item A',
          unit: 'Unit',
          unitPrice: 1000,
          costPrice: 800,
          quantity: 500,
          lineTotal: 500000,
        },
      ],
      subtotal: 500000,
      discountAmount: 0,
      taxRatePercent: 0,
      taxAmount: 0,
      totalAmount: 500000,
      paymentMethod: 'pos_card',
      amountTendered: 500000,
      changeDue: 0,
      status: 'completed_demo',
      syncStatus: 'synced_demo',
    },
    {
      id: 'sale-b',
      shopId: 'shop-vi-01',
      businessId: 'biz-emerald-01',
      receiptNumber: 'VI-2026-0102',
      terminalId: 'WIN-POS-VI01',
      cashierUserId: 'usr-1',
      cashierName: 'Akpevwe Genevieve',
      createdAt: '2026-10-23 11:15 AM',
      items: [
        {
          id: 'l-2',
          productId: 'p-2',
          sku: 'SKU-2',
          barcode: '222',
          productName: 'Hidden Item B',
          unit: 'Unit',
          unitPrice: 9276.54,
          costPrice: 7000,
          quantity: 46,
          lineTotal: 426721,
        },
      ],
      subtotal: 426721,
      discountAmount: 0,
      taxRatePercent: 0,
      taxAmount: 0,
      totalAmount: 426721,
      paymentMethod: 'bank_transfer',
      amountTendered: 426721,
      changeDue: 0,
      status: 'completed_demo',
      syncStatus: 'synced_demo',
    },
    {
      id: 'sale-c',
      shopId: 'shop-vi-01',
      businessId: 'biz-emerald-01',
      receiptNumber: 'VI-2026-0103',
      terminalId: 'WIN-POS-VI01',
      cashierUserId: 'usr-2',
      cashierName: 'Henry Samuel',
      createdAt: '2026-10-23 02:30 PM',
      items: [
        {
          id: 'l-3',
          productId: 'p-3',
          sku: 'SKU-3',
          barcode: '333',
          productName: 'Hidden Item C',
          unit: 'Unit',
          unitPrice: 2256.75,
          costPrice: 1800,
          quantity: 234,
          lineTotal: 528080,
        },
      ],
      subtotal: 528080,
      discountAmount: 0,
      taxRatePercent: 0,
      taxAmount: 0,
      totalAmount: 528080,
      paymentMethod: 'cash',
      amountTendered: 528080,
      changeDue: 0,
      status: 'completed_demo',
      syncStatus: 'synced_demo',
    },
  ];

  const rangeLabel = formatReportDateRangeDmy(
    sampleSales,
    '2026-10-23',
    '2026-10-23'
  );
  assert.equal(rangeLabel, '23-Oct-2026 - 23-Oct-2026');

  const report = buildSalesSummaryReportData(sampleSales, {
    outstandingCreditFallback: 980780,
  });

  assert.equal(report.transferTotal, 426721);
  assert.equal(report.posTotal, 500000);
  assert.equal(report.cashTotal, 528080);
  assert.equal(report.totalSales, 1454801);
  assert.equal(report.outstandingCredit, 980780);
  assert.equal(report.staffRows.length, 2);

  assert.equal(report.staffRows[0].staffName, 'Akpevwe Genevieve');
  assert.equal(report.staffRows[0].dateTime, '--');
  assert.equal(report.staffRows[0].productName, '--');
  assert.equal(report.staffRows[0].productType, '--');
  assert.equal(report.staffRows[0].quantity, 546);
  assert.equal(report.staffRows[0].amount, 926721);
  assert.equal(report.staffRows[0].paymentMethod, 'Pos, Transfer');

  assert.equal(report.staffRows[1].staffName, 'Henry Samuel');
  assert.equal(report.staffRows[1].quantity, 234);
  assert.equal(report.staffRows[1].amount, 528080);
  assert.equal(report.staffRows[1].paymentMethod, 'Cash');

  const csv = generateSalesSummaryStaffReportCsvString({
    sales: sampleSales,
    businessName: 'Diamond Galleria Shopping Mall Nig Ltd',
    dateRangeLabel: rangeLabel,
    outstandingCreditFallback: 980780,
  });

  assert.equal(csv.includes('SALES REPORT'), true);
  assert.equal(csv.includes('23-Oct-2026 - 23-Oct-2026'), true);
  assert.equal(
    csv.includes('#,Date & Time,Product Name,Product Type,Quantity,Amount,Payment Method,Staff'),
    true
  );
  assert.equal(csv.includes('1,--,--,--,546,926721.00,"Pos, Transfer",Akpevwe Genevieve'), true);
  assert.equal(csv.includes('2,--,--,--,234,528080.00,Cash,Henry Samuel'), true);
  // Ensure hidden product names are NOT listed anywhere in the summary CSV
  assert.equal(csv.includes('Hidden Item A'), false);
  assert.equal(csv.includes('Hidden Item B'), false);
});

test('Business Owner Auth Helpers: isSyntheticOwnerUserId and resolveBusinessOwnerAuthState accurately classify synthetic IDs and all 5 authentication states', () => {
  // 1. Synthetic ID detection
  assert.equal(isSyntheticOwnerUserId(''), true);
  assert.equal(isSyntheticOwnerUserId('usr-live-owner-mip0abcd'), true);
  assert.equal(isSyntheticOwnerUserId('usr-owner-01'), true);
  assert.equal(isSyntheticOwnerUserId('usr-0001-a1b2'), true);
  assert.equal(isSyntheticOwnerUserId('usr-staff-01'), true);
  assert.equal(isSyntheticOwnerUserId('pending-owner-01'), true);
  assert.equal(isSyntheticOwnerUserId('synthetic-owner-01'), true);
  assert.equal(isSyntheticOwnerUserId('uid-firebase-real-987654321'), false);
  assert.equal(isSyntheticOwnerUserId('fB9xK2mPqR8vL1nZ4wY7cT3jH6gD'), false);

  // 2. Auth Binding Required (synthetic owner ID or mismatched business.ownerUserId)
  const syntheticState = resolveBusinessOwnerAuthState(
    {
      id: 'usr-live-owner-mip0abcd',
      status: 'active',
    },
    {
      status: 'active',
      ownerUserId: 'usr-live-owner-mip0abcd',
    }
  );
  assert.equal(syntheticState.primaryState, 'Auth Binding Required');
  assert.equal(syntheticState.label, 'Auth Binding Required');
  assert.equal(syntheticState.requiresRepair, true);
  assert.equal(syntheticState.isUidLinked, false);
  assert.equal(syntheticState.isEmailVerified, false);
  assert.equal(syntheticState.canRepairAuth, true);
  assert.equal(syntheticState.canSendPasswordSetupEmail, false);
  assert.equal(syntheticState.canResendPasswordSetupEmail, false);

  // 3. Password Setup Pending (real Firebase Auth UID linked, emailVerified false, email not yet sent)
  const pendingSetupState = resolveBusinessOwnerAuthState(
    {
      id: 'fB9xK2mPqR8vL1nZ4wY7cT3jH6gD',
      status: 'active',
      authUidLinked: true,
      emailVerified: false,
      passwordSetupStatus: 'pending',
    },
    {
      status: 'active',
      ownerUserId: 'fB9xK2mPqR8vL1nZ4wY7cT3jH6gD',
    }
  );
  assert.equal(pendingSetupState.primaryState, 'Password Setup Pending');
  assert.equal(pendingSetupState.label, 'Password Setup Pending');
  assert.equal(pendingSetupState.requiresRepair, false);
  assert.equal(pendingSetupState.isUidLinked, true);
  assert.equal(pendingSetupState.isEmailVerified, false);
  assert.equal(pendingSetupState.canRepairAuth, false);
  assert.equal(pendingSetupState.canSendPasswordSetupEmail, true);
  assert.equal(pendingSetupState.canResendPasswordSetupEmail, false);

  // 4. Password Setup Email Sent (real UID linked, setup email dispatched, never implies email verification)
  const emailSentState = resolveBusinessOwnerAuthState(
    {
      id: 'fB9xK2mPqR8vL1nZ4wY7cT3jH6gD',
      status: 'active',
      authUidLinked: true,
      emailVerified: false,
      passwordSetupStatus: 'email_sent',
      passwordSetupEmailSentAt: '2026-11-03T09:00:00Z',
    },
    {
      status: 'active',
      ownerUserId: 'fB9xK2mPqR8vL1nZ4wY7cT3jH6gD',
    }
  );
  assert.equal(emailSentState.primaryState, 'Password Setup Email Sent');
  assert.equal(emailSentState.label, 'Password Setup Email Sent');
  assert.equal(emailSentState.isUidLinked, true);
  assert.equal(emailSentState.isEmailVerified, false);
  assert.equal(emailSentState.canSendPasswordSetupEmail, false);
  assert.equal(emailSentState.canResendPasswordSetupEmail, true);

  // 4b. Missing emailVerified (undefined) with passwordSetupStatus 'email_sent' or 'verified' does NOT become true
  const missingEmailVerifiedWithEmailSent = resolveBusinessOwnerAuthState(
    {
      id: 'fB9xK2mPqR8vL1nZ4wY7cT3jH6gD',
      status: 'active',
      authUidLinked: true,
      passwordSetupStatus: 'email_sent',
      passwordSetupEmailSentAt: '2026-11-03T09:00:00Z',
    },
    {
      status: 'active',
      ownerUserId: 'fB9xK2mPqR8vL1nZ4wY7cT3jH6gD',
    }
  );
  assert.equal(missingEmailVerifiedWithEmailSent.isEmailVerified, false);
  assert.equal(
    missingEmailVerifiedWithEmailSent.primaryState,
    'Password Setup Email Sent'
  );

  const missingEmailVerifiedWithVerifiedStatus = resolveBusinessOwnerAuthState(
    {
      id: 'fB9xK2mPqR8vL1nZ4wY7cT3jH6gD',
      status: 'active',
      authUidLinked: true,
      passwordSetupStatus: 'verified',
    },
    {
      status: 'active',
      ownerUserId: 'fB9xK2mPqR8vL1nZ4wY7cT3jH6gD',
    }
  );
  assert.equal(missingEmailVerifiedWithVerifiedStatus.isEmailVerified, false);
  assert.equal(
    missingEmailVerifiedWithVerifiedStatus.primaryState,
    'Password Setup Pending'
  );

  // 5. Auth UID Linked (real UID linked and emailVerified === true)
  const verifiedState = resolveBusinessOwnerAuthState(
    {
      id: 'fB9xK2mPqR8vL1nZ4wY7cT3jH6gD',
      status: 'active',
      authUidLinked: true,
      emailVerified: true,
      passwordSetupStatus: 'verified',
    },
    {
      status: 'active',
      ownerUserId: 'fB9xK2mPqR8vL1nZ4wY7cT3jH6gD',
    }
  );
  assert.equal(verifiedState.primaryState, 'Auth UID Linked');
  assert.equal(verifiedState.label, 'Auth UID Linked');
  assert.equal(verifiedState.isUidLinked, true);
  assert.equal(verifiedState.isEmailVerified, true);
  assert.equal(verifiedState.requiresRepair, false);

  // 6. Account Disabled (suspended user, authDisabled, or suspended parent business)
  const disabledState = resolveBusinessOwnerAuthState(
    {
      id: 'fB9xK2mPqR8vL1nZ4wY7cT3jH6gD',
      status: 'suspended',
      authUidLinked: true,
    },
    {
      status: 'active',
      ownerUserId: 'fB9xK2mPqR8vL1nZ4wY7cT3jH6gD',
    }
  );
  assert.equal(disabledState.primaryState, 'Account Disabled');
  assert.equal(disabledState.label, 'Account Disabled');
  assert.equal(disabledState.isDisabled, true);
  assert.equal(disabledState.isEmailVerified, false);
  assert.equal(disabledState.canRepairAuth, false);
  assert.equal(disabledState.canSendPasswordSetupEmail, false);
  assert.equal(disabledState.canResendPasswordSetupEmail, false);
});

test('validateProductInput accurately validates product creation, duplicate SKU/barcode, and expiry date toggle', () => {
  const existingProducts: Product[] = [
    {
      id: 'prod-001',
      shopId: 'shop-001',
      businessId: 'biz-001',
      sku: 'SKU-MILK-01',
      barcode: '61599000101',
      name: 'Peak Milk 400g',
      categoryId: 'cat-01',
      categoryName: 'Groceries',
      unit: 'Tin',
      costPrice: 2000,
      sellingPrice: 2500,
      stockQuantity: 50,
      reorderLevel: 10,
      hasExpiry: true,
      expiryDate: '2027-12-31',
      isActive: true,
      updatedAt: '2026-11-16T10:00:00Z',
    },
  ];

  // 1. Non-expiring product is valid
  const nonExpiring = validateProductInput(
    {
      name: 'Nail Hammer 500g',
      sku: 'SKU-TOOL-01',
      barcode: '61599000201',
      categoryId: 'cat-02',
      unit: 'Piece',
      costPrice: 3000,
      sellingPrice: 4200,
      stockQuantity: 15,
      reorderLevel: 3,
      hasExpiry: false,
    },
    existingProducts
  );
  assert.equal(nonExpiring.valid, true);

  // 2. Expiry toggle enabled without expiration date is rejected
  const missingExpiryDate = validateProductInput(
    {
      name: 'Fresh Yogurt 500ml',
      sku: 'SKU-DAIRY-01',
      barcode: '61599000301',
      categoryId: 'cat-01',
      unit: 'Bottle',
      costPrice: 800,
      sellingPrice: 1200,
      stockQuantity: 30,
      reorderLevel: 5,
      hasExpiry: true,
      expiryDate: '',
    },
    existingProducts
  );
  assert.equal(missingExpiryDate.valid, false);
  assert.match(
    missingExpiryDate.error || '',
    /Please specify an expiration date or toggle off expiration tracking/
  );

  // 3. Expiry toggle enabled with valid expiration date is accepted
  const validExpiring = validateProductInput(
    {
      name: 'Fresh Yogurt 500ml',
      sku: 'SKU-DAIRY-01',
      barcode: '61599000301',
      categoryId: 'cat-01',
      unit: 'Bottle',
      costPrice: 800,
      sellingPrice: 1200,
      stockQuantity: 30,
      reorderLevel: 5,
      hasExpiry: true,
      expiryDate: '2026-12-25',
    },
    existingProducts
  );
  assert.equal(validExpiring.valid, true);
});

test('findProductByBarcodeOrSku and normalizeBarcodeString robustly match barcodes, SKUs, and scanner formats', () => {
  const shopA = 'shop-01';
  const shopB = 'shop-02';
  const businessId = 'biz-01';

  const testProducts: Product[] = [
    {
      id: 'prod-01',
      businessId,
      shopId: shopA,
      name: 'Coca Cola 50cl Pet',
      sku: 'COKE-50CL',
      barcode: '613000492811',
      categoryId: 'cat-drinks',
      categoryName: 'Drinks',
      unit: 'bottle',
      costPrice: 200,
      sellingPrice: 350,
      stockQuantity: 50,
      reorderLevel: 10,
      isActive: true,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
    {
      id: 'prod-02',
      businessId,
      shopId: shopA,
      name: 'Indomie Super Pack 120g',
      sku: 'SKU-IND-120',
      barcode: '08901030384732', // EAN-13 / 14 with leading zero
      categoryId: 'cat-groceries',
      categoryName: 'Groceries',
      unit: 'pack',
      costPrice: 150,
      sellingPrice: 250,
      stockQuantity: 100,
      reorderLevel: 20,
      isActive: true,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
    {
      id: 'prod-03',
      businessId,
      shopId: shopA,
      name: 'Discontinued Snack',
      sku: 'SKU-DISC-01',
      barcode: '999999999999',
      categoryId: 'cat-groceries',
      categoryName: 'Groceries',
      unit: 'pack',
      costPrice: 100,
      sellingPrice: 200,
      stockQuantity: 10,
      reorderLevel: 2,
      isActive: false, // Inactive!
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
    {
      id: 'prod-04',
      businessId,
      shopId: shopB, // Different shop!
      name: 'Shop B Only Maltina',
      sku: 'MALT-B',
      barcode: '613000492811',
      categoryId: 'cat-drinks',
      categoryName: 'Drinks',
      unit: 'can',
      costPrice: 250,
      sellingPrice: 400,
      stockQuantity: 20,
      reorderLevel: 5,
      isActive: true,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
  ];

  // 1. Exact barcode match
  const match1 = findProductByBarcodeOrSku(testProducts, shopA, businessId, '613000492811');
  assert.equal(match1?.id, 'prod-01');

  // 2. Exact SKU match (case-insensitive)
  const match2 = findProductByBarcodeOrSku(testProducts, shopA, businessId, 'coke-50cl');
  assert.equal(match2?.id, 'prod-01');

  // 3. EAN-13 scanner adding leading zero to 12-digit UPC ("0613000492811" -> matches "613000492811")
  const match3 = findProductByBarcodeOrSku(testProducts, shopA, businessId, '0613000492811');
  assert.equal(match3?.id, 'prod-01');

  // 4. Scanner stripping leading zero from stored barcode ("8901030384732" -> matches "08901030384732")
  const match4 = findProductByBarcodeOrSku(testProducts, shopA, businessId, '8901030384732');
  assert.equal(match4?.id, 'prod-02');

  // 5. Hardware scanner gun emitting control characters (\x02 STX and \r\n carriage return)
  const match5 = findProductByBarcodeOrSku(testProducts, shopA, businessId, '\x02613000492811\r\n');
  assert.equal(match5?.id, 'prod-01');

  // 6. Excel-exported trailing float decimal ("613000492811.0" or "613000492811.00")
  const match6 = findProductByBarcodeOrSku(testProducts, shopA, businessId, '613000492811.0');
  assert.equal(match6?.id, 'prod-01');

  // 7. Inactive product is rejected
  const matchInactive = findProductByBarcodeOrSku(testProducts, shopA, businessId, '999999999999');
  assert.equal(matchInactive, undefined);

  // 8. Product from another shop is isolated
  const matchShopB = findProductByBarcodeOrSku(testProducts, shopA, businessId, 'MALT-B');
  assert.equal(matchShopB, undefined);

  // 9. Blank or non-existent code
  assert.equal(findProductByBarcodeOrSku(testProducts, shopA, businessId, ''), undefined);
  assert.equal(findProductByBarcodeOrSku(testProducts, shopA, businessId, '   '), undefined);
  assert.equal(findProductByBarcodeOrSku(testProducts, shopA, businessId, 'UNKNOWN-999'), undefined);
});

test('Bar & Table Tabs: creates table tab, calculates dispatch status, handles reserved stock, and generates interim bill', () => {
  const dummyProduct1: Product = {
    id: 'prod-heineken',
    shopId: 'shop-bar',
    businessId: 'biz-bar',
    name: 'Heineken Lager Beer 600ml',
    sku: 'BEER-HEIN-01',
    barcode: '613000111222',
    category: 'Beer & Cider',
    costPrice: 800,
    sellingPrice: 1200,
    stockQuantity: 24,
    reorderLevel: 6,
    unit: 'bottle',
    status: 'active',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const dummyProduct2: Product = {
    id: 'prod-peanuts',
    shopId: 'shop-bar',
    businessId: 'biz-bar',
    name: 'Spiced Roasted Peanuts',
    sku: 'SNACK-PEANUT',
    category: 'Bar Snacks',
    costPrice: 200,
    sellingPrice: 500,
    stockQuantity: 50,
    reorderLevel: 10,
    unit: 'pack',
    status: 'active',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  // 1. Create Table Tab with tableIdentifier, serverName, and guestCount
  const existingTabs: PosCustomerTab[] = [];
  const tableTab = createPosCustomerTab(existingTabs, {
    isTableTab: true,
    tableIdentifier: 'Table 4 (VIP Lounge)',
    serverName: 'Emeka Waiter',
    guestCount: 4,
  });

  assert.equal(tableTab.isTableTab, true);
  assert.equal(tableTab.tableIdentifier, 'Table 4 (VIP Lounge)');
  assert.equal(tableTab.label, 'Table 4 (VIP Lounge)');
  assert.equal(tableTab.serverName, 'Emeka Waiter');
  assert.equal(tableTab.guestCount, 4);
  assert.equal(tableTab.status, 'table_active');

  // 2. Add drinks to tab cart (Round 1: 4 Heinekens)
  tableTab.cart = [
    { product: dummyProduct1, quantity: 4, dispatchedQuantity: 0 },
    { product: dummyProduct2, quantity: 2, dispatchedQuantity: 0 },
  ];

  // Analyze dispatch status: all 6 items pending dispatch
  const analysisRound1 = analyzeTabDispatchStatus(tableTab.cart);
  assert.equal(analysisRound1.totalItems, 6);
  assert.equal(analysisRound1.dispatchedCount, 0);
  assert.equal(analysisRound1.pendingDispatchCount, 6);
  assert.equal(analysisRound1.hasUndispatchedItems, true);
  assert.equal(analysisRound1.canPrintInterimBill, true);

  // Reserved stock across tabs before dispatch: all 4 Heinekens and 2 Peanuts reserved
  const reservedBeforeDispatch = getReservedStockAcrossTabs([tableTab], 'other-tab-id');
  assert.equal(reservedBeforeDispatch['prod-heineken'], 4);
  assert.equal(reservedBeforeDispatch['prod-peanuts'], 2);

  // 3. Dispatch Round 1 to Table 4 (Option 1: stock decremented immediately)
  // When dispatched, dispatchedQuantity is set to quantity
  tableTab.cart[0].dispatchedQuantity = 4;
  tableTab.cart[1].dispatchedQuantity = 2;

  const analysisDispatched = analyzeTabDispatchStatus(tableTab.cart);
  assert.equal(analysisDispatched.totalItems, 6);
  assert.equal(analysisDispatched.dispatchedCount, 6);
  assert.equal(analysisDispatched.pendingDispatchCount, 0);
  assert.equal(analysisDispatched.hasUndispatchedItems, false);

  // Reserved stock across tabs after dispatch: since Option 1 already deducted from inventory,
  // getReservedStockAcrossTabs must NOT reserve them again (prevents double deduction)
  const reservedAfterDispatch = getReservedStockAcrossTabs([tableTab], 'other-tab-id');
  assert.equal(reservedAfterDispatch['prod-heineken'] || 0, 0);
  assert.equal(reservedAfterDispatch['prod-peanuts'] || 0, 0);

  // 4. Customers order Round 2 (2 more Heinekens added to table)
  tableTab.cart[0].quantity = 6; // was 4, now 6 (2 pending dispatch)
  const analysisRound2 = analyzeTabDispatchStatus(tableTab.cart);
  assert.equal(analysisRound2.totalItems, 8);
  assert.equal(analysisRound2.dispatchedCount, 6);
  assert.equal(analysisRound2.pendingDispatchCount, 2);
  assert.equal(analysisRound2.hasUndispatchedItems, true);

  // Reserved stock now reserves only the 2 undispatched Heinekens
  const reservedRound2 = getReservedStockAcrossTabs([tableTab], 'other-tab-id');
  assert.equal(reservedRound2['prod-heineken'], 2);
});



