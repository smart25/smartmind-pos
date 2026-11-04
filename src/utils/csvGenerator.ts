import { Business, Product, SaleTransaction, Shop } from '../types/pos';
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
 * Triggers browser download of the Sales Summary CSV file.
 */
export function downloadSalesSummaryCsv(options: SalesSummaryCsvOptions): void {
  const csvContent = generateSalesSummaryCsvString({
    sales: options.sales,
    products: options.products,
  });

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

