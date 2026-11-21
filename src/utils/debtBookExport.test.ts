import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateDebtCustomersCsvString,
  generateDebtTransactionsCsvString,
  generateCustomerStatementCsvString,
} from './csvGenerator';
import { DebtCustomer, DebtTransaction } from '../types/pos';

test('Debt Book CSV Export Suite', async (t) => {
  const mockCustomers: DebtCustomer[] = [
    {
      id: 'cust-01',
      shopId: 'shop-01',
      businessId: 'biz-01',
      fullName: 'Chief Emeka Okafor',
      phone: '08031234567',
      creditLimitEnabled: true,
      creditLimitAmount: 50000,
      totalCredit: 35000,
      amountPaid: 15000,
      balanceRemaining: 20000,
      notes: 'Wholesale client',
      createdAt: '2026-10-01',
      updatedAt: '2026-10-15',
    },
    {
      id: 'cust-02',
      shopId: 'shop-01',
      businessId: 'biz-01',
      fullName: 'Hajiya Fatima Bello',
      phone: '08029876543',
      creditLimitEnabled: false,
      creditLimitAmount: 0,
      totalCredit: 10000,
      amountPaid: 10000,
      balanceRemaining: 0,
      notes: '',
      createdAt: '2026-10-05',
      updatedAt: '2026-10-20',
    },
  ];

  const mockTransactions: DebtTransaction[] = [
    {
      id: 'tx-01',
      customerId: 'cust-01',
      customerName: 'Chief Emeka Okafor',
      customerPhone: '08031234567',
      shopId: 'shop-01',
      businessId: 'biz-01',
      type: 'credit',
      amount: 25000,
      reference: 'CR-1001',
      notes: 'Provisions credit purchase',
      recordedByUserId: 'usr-01',
      recordedByName: 'Sandra Cashier',
      createdAt: '2026-10-10 10:00:00',
    },
    {
      id: 'tx-02',
      customerId: 'cust-01',
      customerName: 'Chief Emeka Okafor',
      customerPhone: '08031234567',
      shopId: 'shop-01',
      businessId: 'biz-01',
      type: 'deposit',
      amount: 15000,
      paymentMethod: 'bank_transfer',
      reference: 'DEP-2001',
      notes: 'Part-payment via bank transfer',
      recordedByUserId: 'usr-01',
      recordedByName: 'Sandra Cashier',
      createdAt: '2026-10-12 14:30:00',
    },
    {
      id: 'tx-03',
      customerId: 'cust-01',
      customerName: 'Chief Emeka Okafor',
      customerPhone: '08031234567',
      shopId: 'shop-01',
      businessId: 'biz-01',
      type: 'credit',
      amount: 10000,
      reference: 'CR-1002',
      notes: 'Additional items on credit',
      recordedByUserId: 'usr-01',
      recordedByName: 'Sandra Cashier',
      createdAt: '2026-10-15 11:15:00',
    },
  ];

  await t.test('1. generateDebtCustomersCsvString generates correct headers, debtor lines, and totals', () => {
    const csv = generateDebtCustomersCsvString({ customers: mockCustomers });
    assert.ok(csv.startsWith('\uFEFF'), 'CSV should contain UTF-8 BOM');
    assert.ok(csv.includes('#,Customer Name,Phone Number,Credit Limit,Total Credit,Amount Paid,Balance Remaining,Account Status,Notes'));
    assert.ok(csv.includes('Chief Emeka Okafor,08031234567,50000.00,35000.00,15000.00,20000.00,Active Balance,Wholesale client'));
    assert.ok(csv.includes('Hajiya Fatima Bello,08029876543,None,10000.00,10000.00,0.00,Settled,'));
    assert.ok(csv.includes('Total,2 Customers,,,45000.00,25000.00,20000.00,,'));
  });

  await t.test('2. generateDebtTransactionsCsvString generates accurate ledger rows and credit/deposit totals', () => {
    const csv = generateDebtTransactionsCsvString({ transactions: mockTransactions });
    assert.ok(csv.startsWith('\uFEFF'), 'CSV should contain UTF-8 BOM');
    assert.ok(csv.includes('#,Date & Time,Reference,Customer Name,Customer Phone,Transaction Type,Amount,Payment Method,Staff / Cashier,Notes'));
    assert.ok(csv.includes('CR-1001,Chief Emeka Okafor,08031234567,Credit Purchase,25000.00,Credit,Sandra Cashier,Provisions credit purchase'));
    assert.ok(csv.includes('DEP-2001,Chief Emeka Okafor,08031234567,Deposit / Payment,15000.00,Bank Transfer,Sandra Cashier,Part-payment via bank transfer'));
    assert.ok(csv.includes('Total,3 Transactions,,,,Credit: 35000.00 | Deposit: 15000.00,20000.00,,,'));
  });

  await t.test('3. generateCustomerStatementCsvString produces accurate customer summary and running balance ledger', () => {
    const csv = generateCustomerStatementCsvString({
      customer: mockCustomers[0],
      transactions: mockTransactions,
    });
    assert.ok(csv.includes('Customer Name: Chief Emeka Okafor'));
    assert.ok(csv.includes('Phone Number: 08031234567'));
    assert.ok(csv.includes('Current Balance Due: 20000.00'));
    // Running balance checks:
    // tx-01: +25000 -> 25000.00
    // tx-02: -15000 -> 10000.00
    // tx-03: +10000 -> 20000.00
    assert.ok(csv.includes('CR-1001,Credit Purchase,25000.00,0.00,25000.00'));
    assert.ok(csv.includes('DEP-2001,Deposit / Payment,0.00,15000.00,10000.00'));
    assert.ok(csv.includes('CR-1002,Credit Purchase,10000.00,0.00,20000.00'));
    assert.ok(csv.includes('Total,3 Transactions,,,35000.00,15000.00,20000.00,,,'));
  });
});
