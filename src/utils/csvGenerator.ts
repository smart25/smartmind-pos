import {
  Business,
  DebtCustomer,
  DebtTransaction,
  Product,
  SaleTransaction,
  Shop,
} from '../types/pos';
import { formatPaymentMethodLabel } from './pdfGenerator';
import { buildSalesSummaryReportData } from './posCalculations';

export interface SalesSummaryCsvOptions {
  sales: SaleTransaction[];
  business: Business;
  shop: Shop;
  dateRangeLabel: string;
  symbol?: string;
  products?: Product[];
  fileName?: string;
  reportType?: 'product_summary' | 'itemized' | 'receipts' | 'staff_summary';
}

/**
 * Escapes a cell value for standard CSV format (RFC 4180).
 * Wraps in quotes if it contains commas, double quotes, or newlines.
 */
export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates the CSV string with the exact table headers:
 * # | Date & Time | Product Name | Unit of Measurement | Quantity | Amount | Payment Method | Staff
 */
export function generateSalesSummaryCsvString({
  sales,
  products = [],
}: {
  sales: SaleTransaction[];
  products?: Product[];
}): string {
  const productUnitMap = new Map<string, string>();
  products.forEach((p) => {
    if (p.unit) productUnitMap.set(p.id, p.unit);
  });

  const headers = [
    '#',
    'Date & Time',
    'Product Name',
    'Unit of Measurement',
    'Quantity',
    'Amount',
    'Payment Method',
    'Staff',
  ];

  let itemCounter = 1;
  const rows = sales.flatMap((sale) =>
    sale.items.map((item) => [
      itemCounter++,
      sale.createdAt,
      item.productName,
      item.unit || productUnitMap.get(item.productId) || 'Unit',
      item.quantity,
      item.lineTotal.toFixed(2),
      formatPaymentMethodLabel(sale.paymentMethod),
      sale.cashierName,
    ])
  );

  const totalQuantity = rows.reduce((sum, r) => sum + Number(r[4]), 0);
  const totalAmount = rows.reduce((sum, r) => sum + Number(r[5]), 0);

  const csvLines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
    ['Total', '', '', '', totalQuantity, totalAmount.toFixed(2), '', ''].map(escapeCsvCell).join(','),
  ];

  // Prepend UTF-8 BOM (\uFEFF) so Excel, Google Sheets, Numbers open Unicode characters smoothly
  return '\uFEFF' + csvLines.join('\r\n');
}

/**
 * Generates an aggregated Product Sales Summary CSV string:
 * Rank | Product Name | Unit of Measurement | Total Quantity Sold | Total Amount | Average Unit Price | Receipts Count | % of Total Sales
 */
export function generateProductSalesSummaryCsvString({
  sales,
  products = [],
}: {
  sales: SaleTransaction[];
  products?: Product[];
}): string {
  const productUnitMap = new Map<string, string>();
  products.forEach((p) => {
    if (p.unit) productUnitMap.set(p.id, p.unit);
  });

  const productMap = new Map<
    string,
    {
      productName: string;
      unit: string;
      totalQuantity: number;
      totalAmount: number;
      receiptIds: Set<string>;
    }
  >();

  let overallRevenue = 0;

  sales.forEach((sale) => {
    (sale.items || []).forEach((item) => {
      const key = item.productId || item.productName.trim().toLowerCase();
      const unit = item.unit || productUnitMap.get(item.productId) || 'Unit';
      const lineTotal = Number(item.lineTotal !== undefined ? item.lineTotal : item.unitPrice * item.quantity);
      const qty = Number(item.quantity ?? 0);

      overallRevenue += lineTotal;

      const existing = productMap.get(key);
      if (existing) {
        existing.totalQuantity += qty;
        existing.totalAmount += lineTotal;
        existing.receiptIds.add(sale.id);
        if (unit && existing.unit === 'Unit') {
          existing.unit = unit;
        }
      } else {
        productMap.set(key, {
          productName: item.productName,
          unit,
          totalQuantity: qty,
          totalAmount: lineTotal,
          receiptIds: new Set([sale.id]),
        });
      }
    });
  });

  const rows = Array.from(productMap.values()).map((p) => ({
    productName: p.productName,
    unit: p.unit,
    totalQuantity: p.totalQuantity,
    totalAmount: p.totalAmount,
    receiptCount: p.receiptIds.size,
    avgUnitPrice: p.totalQuantity > 0 ? p.totalAmount / p.totalQuantity : 0,
    percentageOfSales: overallRevenue > 0 ? (p.totalAmount / overallRevenue) * 100 : 0,
  }));

  // Sort by highest quantity sold first, then total amount
  rows.sort((a, b) => {
    if (b.totalQuantity !== a.totalQuantity) {
      return b.totalQuantity - a.totalQuantity;
    }
    return b.totalAmount - a.totalAmount;
  });

  const headers = [
    '#',
    'Product Name',
    'Unit of Measurement',
    'Total Quantity Sold',
    'Total Amount',
    'Average Unit Price',
    'Receipts Count',
    '% of Total Sales',
  ];

  let rank = 1;
  const csvRows = rows.map((r) => [
    rank++,
    r.productName,
    r.unit,
    r.totalQuantity,
    r.totalAmount.toFixed(2),
    r.avgUnitPrice.toFixed(2),
    r.receiptCount,
    `${r.percentageOfSales.toFixed(1)}%`,
  ]);

  const totalQty = rows.reduce((sum, r) => sum + r.totalQuantity, 0);
  const totalAmt = rows.reduce((sum, r) => sum + r.totalAmount, 0);

  const csvLines = [
    headers.map(escapeCsvCell).join(','),
    ...csvRows.map((row) => row.map(escapeCsvCell).join(',')),
    ['Total', `${rows.length} Products`, '', totalQty, totalAmt.toFixed(2), '', `${sales.length} Receipts`, '100%'].map(escapeCsvCell).join(','),
  ];

  return '\uFEFF' + csvLines.join('\r\n');
}

/**
 * Triggers browser download of the Sales Summary CSV file.
 */
export function downloadSalesSummaryCsv(options: SalesSummaryCsvOptions): void {
  let csvContent = '';
  if (options.reportType === 'product_summary') {
    csvContent = generateProductSalesSummaryCsvString({
      sales: options.sales,
      products: options.products,
    });
  } else if (options.reportType === 'receipts') {
    csvContent = generateSalesReceiptsCsvString({
      sales: options.sales,
    });
  } else {
    csvContent = generateSalesSummaryCsvString({
      sales: options.sales,
      products: options.products,
    });
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  const safeShopCode = options.shop.code.replace(/[^a-zA-Z0-9]/g, '_');
  const safeRange = options.dateRangeLabel.replace(/[^a-zA-Z0-9]/g, '_');
  const defaultName = `Sales_Summary_${safeShopCode}_${safeRange}.csv`;

  link.setAttribute('href', url);
  link.setAttribute('download', options.fileName || defaultName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates an Excel-ready CSV string summarizing sales transactions at the receipt level:
 * # | Receipt Number | Date & Time | Terminal ID | Cashier | Payment Method | Items Count | Subtotal | Discount | Tax | Total Amount | Status
 */
export function generateSalesReceiptsCsvString({
  sales,
}: {
  sales: SaleTransaction[];
}): string {
  const headers = [
    '#',
    'Receipt Number',
    'Date & Time',
    'Terminal ID',
    'Cashier',
    'Payment Method',
    'Items Count',
    'Subtotal',
    'Discount',
    'Tax',
    'Total Amount',
    'Status',
  ];

  let counter = 1;
  const rows = sales.map((sale) => [
    counter++,
    sale.receiptNumber,
    sale.createdAt,
    sale.terminalId,
    sale.cashierName,
    formatPaymentMethodLabel(sale.paymentMethod),
    sale.items.reduce((sum, item) => sum + item.quantity, 0),
    sale.subtotal.toFixed(2),
    sale.discountAmount.toFixed(2),
    sale.taxAmount.toFixed(2),
    sale.totalAmount.toFixed(2),
    sale.syncStatus === 'synced_demo' ? 'Completed' : 'Pending Sync',
  ]);

  const totalItems = sales.reduce(
    (sum, s) => sum + s.items.reduce((iSum, item) => iSum + item.quantity, 0),
    0
  );
  const totalSubtotal = sales.reduce((sum, s) => sum + s.subtotal, 0);
  const totalDiscount = sales.reduce((sum, s) => sum + s.discountAmount, 0);
  const totalTax = sales.reduce((sum, s) => sum + s.taxAmount, 0);
  const totalAmount = sales.reduce((sum, s) => sum + s.totalAmount, 0);

  const csvLines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
    [
      'Total',
      `${sales.length} receipts`,
      '',
      '',
      '',
      '',
      totalItems,
      totalSubtotal.toFixed(2),
      totalDiscount.toFixed(2),
      totalTax.toFixed(2),
      totalAmount.toFixed(2),
      '',
    ].map(escapeCsvCell).join(','),
  ];

  // Prepend UTF-8 BOM (\uFEFF) for immediate opening in Microsoft Excel and spreadsheet software
  return '\uFEFF' + csvLines.join('\r\n');
}

export interface SalesHistoryExcelOptions extends SalesSummaryCsvOptions {
  reportType?: 'itemized' | 'receipts' | 'staff_summary';
  outstandingCreditFallback?: number;
}

/**
 * Generates an Excel-ready CSV string matching the Sales Summary Report sample:
 * - Top summary block: Payment Method Breakdown (Transfer, Pos, Cash) + Total Sales, VAT Collected, Outstanding Credit, Total Refunds
 * - Table headers: # | Date & Time | Product Name | Product Type | Quantity | Amount | Payment Method | Staff
 * - Staff-aggregated rows with "--" for Date & Time, Product Name, Product Type (no individual items listed).
 */
export function generateSalesSummaryStaffReportCsvString({
  sales,
  businessName = '',
  dateRangeLabel = '',
  outstandingCreditFallback = 0,
}: {
  sales: SaleTransaction[];
  businessName?: string;
  dateRangeLabel?: string;
  outstandingCreditFallback?: number;
}): string {
  const report = buildSalesSummaryReportData(sales, {
    outstandingCreditFallback,
  });

  const summaryLines: (string | number)[][] = [
    ['SALES REPORT'],
    ...(dateRangeLabel ? [['Date Range', dateRangeLabel]] : []),
    ...(businessName ? [['Business', businessName]] : []),
    [],
    ['Payment Method Breakdown', 'Amount', 'Summary Metrics', 'Amount'],
    [
      'Transfer',
      report.transferTotal.toFixed(2),
      'Total Sales',
      report.totalSales.toFixed(2),
    ],
    [
      'Pos',
      report.posTotal.toFixed(2),
      'VAT Collected',
      report.vatCollected.toFixed(2),
    ],
    [
      'Cash',
      report.cashTotal.toFixed(2),
      'Outstanding Credit',
      report.outstandingCredit.toFixed(2),
    ],
    [
      'Credit',
      report.creditSalesTotal.toFixed(2),
      'Total Refunds',
      report.totalRefunds.toFixed(2),
    ],
    [],
  ];

  const headers = [
    '#',
    'Date & Time',
    'Product Name',
    'Product Type',
    'Quantity',
    'Amount',
    'Payment Method',
    'Staff',
  ];

  const rows = report.staffRows.map((row) => [
    row.index,
    row.dateTime,
    row.productName,
    row.productType,
    row.quantity,
    row.amount.toFixed(2),
    row.paymentMethod,
    row.staffName,
  ]);

  const totalRow = [
    'Total',
    '--',
    '--',
    '--',
    report.totalQuantity,
    report.totalSales.toFixed(2),
    '',
    '',
  ];

  const csvLines = [
    ...summaryLines.map((line) => line.map(escapeCsvCell).join(',')),
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
    totalRow.map(escapeCsvCell).join(','),
  ];

  return '\uFEFF' + csvLines.join('\r\n');
}

/**
 * Downloads a Sales History / Sales Summary report in Excel / Spreadsheet format (.csv with UTF-8 BOM).
 * Compatible with Microsoft Excel, Office 365, Google Sheets, and LibreOffice.
 */
export function downloadSalesHistoryExcel(options: SalesHistoryExcelOptions): void {
  const reportType = options.reportType ?? 'itemized';
  let csvContent: string;
  if (reportType === 'staff_summary') {
    csvContent = generateSalesSummaryStaffReportCsvString({
      sales: options.sales,
      businessName: `${options.business.legalName || options.business.name} (${options.shop.name})`,
      dateRangeLabel: options.dateRangeLabel,
      outstandingCreditFallback: options.outstandingCreditFallback,
    });
  } else if (reportType === 'receipts') {
    csvContent = generateSalesReceiptsCsvString({ sales: options.sales });
  } else {
    csvContent = generateSalesSummaryCsvString({
      sales: options.sales,
      products: options.products,
    });
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  const safeShopCode = options.shop.code.replace(/[^a-zA-Z0-9]/g, '_');
  const safeRange = options.dateRangeLabel.replace(/[^a-zA-Z0-9]/g, '_');
  const suffix =
    reportType === 'staff_summary'
      ? 'Sales_Summary'
      : reportType === 'receipts'
      ? 'Receipts'
      : 'Itemized';
  const defaultName = `Sales_Report_${safeShopCode}_${suffix}_${safeRange}.csv`;

  link.setAttribute('href', url);
  link.setAttribute('download', options.fileName || defaultName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface DebtCustomersCsvOptions {
  customers: DebtCustomer[];
  business: Business;
  shop: Shop;
  symbol?: string;
  fileName?: string;
}

export function generateDebtCustomersCsvString({
  customers,
}: {
  customers: DebtCustomer[];
}): string {
  const headers = [
    '#',
    'Customer Name',
    'Phone Number',
    'Credit Limit',
    'Total Credit',
    'Amount Paid',
    'Balance Remaining',
    'Account Status',
    'Notes',
  ];

  const rows = customers.map((c, idx) => {
    const isSettled = c.balanceRemaining <= 0;
    const isOverLimit =
      c.creditLimitEnabled &&
      c.creditLimitAmount > 0 &&
      c.balanceRemaining > c.creditLimitAmount;
    const statusLabel = isSettled
      ? 'Settled'
      : isOverLimit
      ? 'Over Credit Limit'
      : 'Active Balance';

    return [
      idx + 1,
      c.fullName,
      c.phone,
      c.creditLimitEnabled && c.creditLimitAmount > 0
        ? c.creditLimitAmount.toFixed(2)
        : 'None',
      c.totalCredit.toFixed(2),
      c.amountPaid.toFixed(2),
      c.balanceRemaining.toFixed(2),
      statusLabel,
      c.notes || '',
    ];
  });

  const totalCredit = customers.reduce((sum, c) => sum + c.totalCredit, 0);
  const totalPaid = customers.reduce((sum, c) => sum + c.amountPaid, 0);
  const totalBalance = customers.reduce(
    (sum, c) => sum + c.balanceRemaining,
    0
  );

  const csvLines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
    [
      'Total',
      `${customers.length} Customers`,
      '',
      '',
      totalCredit.toFixed(2),
      totalPaid.toFixed(2),
      totalBalance.toFixed(2),
      '',
      '',
    ]
      .map(escapeCsvCell)
      .join(','),
  ];

  return '\uFEFF' + csvLines.join('\r\n');
}

export function downloadDebtCustomersCsv(options: DebtCustomersCsvOptions): void {
  const csvContent = generateDebtCustomersCsvString({
    customers: options.customers,
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  const safeShopCode = options.shop.code.replace(/[^a-zA-Z0-9]/g, '_');
  const safeDate = new Date().toISOString().slice(0, 10);
  const defaultName = `Debt_Customers_${safeShopCode}_${safeDate}.csv`;

  link.setAttribute('href', url);
  link.setAttribute('download', options.fileName || defaultName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface DebtTransactionsCsvOptions {
  transactions: DebtTransaction[];
  business: Business;
  shop: Shop;
  symbol?: string;
  fileName?: string;
}

export function generateDebtTransactionsCsvString({
  transactions,
}: {
  transactions: DebtTransaction[];
}): string {
  const headers = [
    '#',
    'Date & Time',
    'Reference',
    'Customer Name',
    'Customer Phone',
    'Transaction Type',
    'Amount',
    'Payment Method',
    'Staff / Cashier',
    'Notes',
  ];

  const rows = transactions.map((tx, idx) => [
    idx + 1,
    tx.createdAt,
    tx.reference,
    tx.customerName,
    tx.customerPhone,
    tx.type === 'credit' ? 'Credit Purchase' : 'Deposit / Payment',
    tx.amount.toFixed(2),
    tx.paymentMethod ? formatPaymentMethodLabel(tx.paymentMethod) : 'Credit',
    tx.recordedByName || 'Staff',
    tx.notes || '',
  ]);

  const totalCredit = transactions
    .filter((t) => t.type === 'credit')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalDeposit = transactions
    .filter((t) => t.type === 'deposit')
    .reduce((sum, t) => sum + t.amount, 0);

  const csvLines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
    [
      'Total',
      `${transactions.length} Transactions`,
      '',
      '',
      '',
      `Credit: ${totalCredit.toFixed(2)} | Deposit: ${totalDeposit.toFixed(2)}`,
      (totalCredit - totalDeposit).toFixed(2),
      '',
      '',
      '',
    ]
      .map(escapeCsvCell)
      .join(','),
  ];

  return '\uFEFF' + csvLines.join('\r\n');
}

export function downloadDebtTransactionsCsv(
  options: DebtTransactionsCsvOptions
): void {
  const csvContent = generateDebtTransactionsCsvString({
    transactions: options.transactions,
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  const safeShopCode = options.shop.code.replace(/[^a-zA-Z0-9]/g, '_');
  const safeDate = new Date().toISOString().slice(0, 10);
  const defaultName = `Debt_Transactions_${safeShopCode}_${safeDate}.csv`;

  link.setAttribute('href', url);
  link.setAttribute('download', options.fileName || defaultName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface CustomerStatementCsvOptions {
  customer: DebtCustomer;
  transactions: DebtTransaction[];
  business: Business;
  shop: Shop;
  symbol?: string;
  fileName?: string;
}

export function generateCustomerStatementCsvString({
  customer,
  transactions,
}: {
  customer: DebtCustomer;
  transactions: DebtTransaction[];
}): string {
  const sortedTx = [...transactions]
    .filter((t) => t.customerId === customer.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const headers = [
    '#',
    'Date & Time',
    'Reference',
    'Transaction Type',
    'Credit (Debt)',
    'Payment (Deposit)',
    'Running Balance',
    'Payment Method',
    'Staff / Cashier',
    'Notes',
  ];

  let runningBalance = 0;
  const rows = sortedTx.map((tx, idx) => {
    const isCredit = tx.type === 'credit';
    if (isCredit) {
      runningBalance += tx.amount;
    } else {
      runningBalance -= tx.amount;
    }
    return [
      idx + 1,
      tx.createdAt,
      tx.reference,
      isCredit ? 'Credit Purchase' : 'Deposit / Payment',
      isCredit ? tx.amount.toFixed(2) : '0.00',
      !isCredit ? tx.amount.toFixed(2) : '0.00',
      runningBalance.toFixed(2),
      tx.paymentMethod ? formatPaymentMethodLabel(tx.paymentMethod) : 'Credit',
      tx.recordedByName || 'Staff',
      tx.notes || '',
    ];
  });

  const csvLines = [
    [`Customer Name: ${customer.fullName}`],
    [`Phone Number: ${customer.phone}`],
    [
      `Credit Limit: ${
        customer.creditLimitEnabled && customer.creditLimitAmount > 0
          ? customer.creditLimitAmount.toFixed(2)
          : 'None'
      }`,
    ],
    [`Total Credit: ${customer.totalCredit.toFixed(2)}`],
    [`Total Paid: ${customer.amountPaid.toFixed(2)}`],
    [`Current Balance Due: ${customer.balanceRemaining.toFixed(2)}`],
    [''],
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
    [
      'Total',
      `${sortedTx.length} Transactions`,
      '',
      '',
      customer.totalCredit.toFixed(2),
      customer.amountPaid.toFixed(2),
      customer.balanceRemaining.toFixed(2),
      '',
      '',
      '',
    ]
      .map(escapeCsvCell)
      .join(','),
  ];

  return '\uFEFF' + csvLines.join('\r\n');
}

export function downloadCustomerStatementCsv(
  options: CustomerStatementCsvOptions
): void {
  const csvContent = generateCustomerStatementCsvString({
    customer: options.customer,
    transactions: options.transactions,
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  const safeCustomer = options.customer.fullName.replace(/[^a-zA-Z0-9]/g, '_');
  const safeDate = new Date().toISOString().slice(0, 10);
  const defaultName = `Debt_Statement_${safeCustomer}_${safeDate}.csv`;

  link.setAttribute('href', url);
  link.setAttribute('download', options.fileName || defaultName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

