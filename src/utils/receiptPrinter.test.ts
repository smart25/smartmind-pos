import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveEffectivePrinter,
  generateSaleReceiptHtml,
} from './receiptPrinter';
import { Shop, Business, SaleTransaction } from '../types/pos';

const mockBusiness = {
  id: 'biz-01',
  name: 'SmartMind Validation Store',
  currencyCode: 'NGN',
  currencySymbol: '₦',
  createdAt: '2026-01-01',
  ownerUserId: 'user-01',
  taxIdentificationNumber: 'TIN-987654321',
} as unknown as Business;

const mockShop = {
  id: 'shop-01',
  businessId: 'biz-01',
  code: 'SVS-01',
  name: 'Main Branch',
  category: 'supermarket',
  locationCity: 'Asaba',
  address: '47, Dennis Osadebe Way',
  phone: '08012345678',
  managerName: 'Sandy Manager',
  status: 'active',
  terminalId: 'TERM-SVS01',
  taxRatePercent: 7.5,
  receiptHeaderNote: 'Welcome to Main Branch',
  receiptFooterNote: 'Thank you for shopping with us!',
  createdAt: '2026-01-01',
  pendingSyncCount: 0,
  lastSyncedAt: '2026-01-01',
  printerSettings: {
    defaultPrinterId: 'XP-80C',
    receiptPrinterId: 'XP-80C',
    a4PrinterId: 'SHARP AR-6031NV 1',
    receiptPrinterMode: 'thermal',
    allowReceiptReprint: true,
    thermalPaperWidth: '80mm',
    autoCutReceipt: true,
    openCashDrawerOnPrint: false,
    printStoreLogo: true,
    autoPrintOnSale: true,
  },
} as unknown as Shop;

const mockSale = {
  id: 'sale-001',
  shopId: 'shop-01',
  businessId: 'biz-01',
  receiptNumber: 'SVS-2026-0904',
  terminalId: 'TERM-SVS01',
  cashierUserId: 'user-02',
  cashierName: 'SmartMind Test Owner',
  createdAt: '2026-11-14 12:00 PM',
  items: [
    {
      id: 'line-1',
      productId: 'prod-1',
      productName: 'Golden Penny Sugar 500g',
      sku: 'GPS5-1001',
      unitPrice: 1200,
      quantity: 1,
      lineTotal: 1200,
    },
    {
      id: 'line-2',
      productId: 'prod-2',
      productName: 'Milo Refill 800g',
      sku: 'MILO-800',
      unitPrice: 3500,
      quantity: 2,
      lineTotal: 7000,
    },
  ],
  subtotal: 8200,
  discountAmount: 200,
  taxRatePercent: 7.5,
  taxAmount: 600,
  totalAmount: 8600,
  amountTendered: 10000,
  changeDue: 1400,
  paymentMethod: 'cash',
  status: 'completed',
  syncStatus: 'synced',
} as unknown as SaleTransaction;

test('resolveEffectivePrinter accurately resolves configured XP-80C and thermal-80mm format', () => {
  const effective = resolveEffectivePrinter(mockShop);
  assert.equal(effective.printerName, 'XP-80C');
  assert.equal(effective.format, 'thermal-80mm');
  assert.equal(effective.mode, 'thermal');
  assert.equal(effective.isAssigned, true);
});

test('resolveEffectivePrinter resolves A4 printer when shop receiptPrinterMode is a4', () => {
  const a4Shop: Shop = {
    ...mockShop,
    printerSettings: {
      ...mockShop.printerSettings!,
      receiptPrinterMode: 'a4',
    },
  };
  const effective = resolveEffectivePrinter(a4Shop);
  assert.equal(effective.printerName, 'SHARP AR-6031NV 1');
  assert.equal(effective.format, 'A4');
  assert.equal(effective.mode, 'a4');
  assert.equal(effective.isAssigned, true);
});

test('generateSaleReceiptHtml renders items, totals, and shop information in thermal format', () => {
  const html = generateSaleReceiptHtml({
    sale: mockSale,
    shop: mockShop,
    business: mockBusiness,
  });

  assert.match(html, /Main Branch/);
  assert.match(html, /SVS-2026-0904/);
  assert.match(html, /SmartMind Test Owner/);
  assert.match(html, /Golden Penny Sugar 500g/);
  assert.match(html, /Milo Refill 800g/);
  assert.match(html, /TOTAL:/);
  assert.match(html, /Thank you for shopping with us!/);
  assert.doesNotMatch(html, /DUPLICATE RECEIPT/);
  assert.doesNotMatch(html, /TIN:/);
});

test('generateSaleReceiptHtml renders duplicate watermark when isDuplicate is true', () => {
  const html = generateSaleReceiptHtml({
    sale: mockSale,
    shop: mockShop,
    business: mockBusiness,
    isDuplicate: true,
  });

  assert.match(html, /DUPLICATE RECEIPT/);
});

test('generateSaleReceiptHtml completely omits VAT when printVatOnReceipt is false or taxRatePercent is 0', () => {
  const shopWithoutVat: Shop = {
    ...mockShop,
    taxRatePercent: 0,
    vatEnabled: false,
    printVatOnReceipt: false,
  };
  const saleWithoutVat: SaleTransaction = {
    ...mockSale,
    taxRatePercent: 0,
    taxAmount: 0,
    totalAmount: mockSale.subtotal - mockSale.discountAmount,
  };

  const html = generateSaleReceiptHtml({
    sale: saleWithoutVat,
    shop: shopWithoutVat,
    business: mockBusiness,
  });

  assert.doesNotMatch(html, /VAT/);
  assert.doesNotMatch(html, /TIN:/);
});

test('generateSaleReceiptHtml renders VAT breakdown only when printVatOnReceipt is true and tax > 0', () => {
  const shopWithVatDisplay: Shop = {
    ...mockShop,
    taxRatePercent: 7.5,
    vatEnabled: true,
    printVatOnReceipt: true,
  };

  const html = generateSaleReceiptHtml({
    sale: mockSale,
    shop: shopWithVatDisplay,
    business: mockBusiness,
  });

  assert.match(html, /VAT \(7\.5%\)/);
});
