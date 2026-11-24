import { Business, Shop, SaleTransaction, User } from '../types/pos';
import {
  formatCurrency,
  getShopPrinterSettings,
  PosCustomerTab,
  calculateCartTotals,
} from './posCalculations';

export interface EffectivePrinterResolution {
  printerName: string;
  format: 'thermal-80mm' | 'thermal-58mm' | 'A4';
  mode: 'thermal' | 'a4';
  isAssigned: boolean;
}

/**
 * Escapes characters for HTML injection safety.
 */
function escapeHtml(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value).replace(/[&<>"']/g, (character) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[character] || character;
  });
}

/**
 * Resolves the active target printer name and page format configured for a given shop.
 */
export function resolveEffectivePrinter(
  shop?: Shop | null,
  overrideMode?: 'thermal' | 'a4'
): EffectivePrinterResolution {
  const settings = getShopPrinterSettings(shop);
  const mode = overrideMode || settings.receiptPrinterMode || 'thermal';
  const isA4 = mode === 'a4';

  let assignedName = isA4
    ? settings.a4PrinterId || settings.defaultPrinterId
    : settings.receiptPrinterId || settings.defaultPrinterId;

  if (!assignedName || !assignedName.trim()) {
    assignedName = settings.defaultPrinterId || settings.receiptPrinterId || settings.a4PrinterId || '';
  }

  const format: 'thermal-80mm' | 'thermal-58mm' | 'A4' = isA4
    ? 'A4'
    : settings.thermalPaperWidth === '58mm'
    ? 'thermal-58mm'
    : 'thermal-80mm';

  return {
    printerName: assignedName?.trim() || 'XP-80C',
    format,
    mode,
    isAssigned: Boolean(assignedName && assignedName.trim()),
  };
}

/**
 * Generates an ESC/POS or A4 HTML document string for a completed sale or reprint.
 */
export function generateSaleReceiptHtml(options: {
  sale: SaleTransaction;
  shop: Shop;
  business: Business;
  isDuplicate?: boolean;
  paperWidth?: '80mm' | '58mm';
}): string {
  const { sale, shop, business, isDuplicate = false } = options;
  const settings = getShopPrinterSettings(shop);
  const isA4 = settings.receiptPrinterMode === 'a4';
  const symbol = business.currencySymbol || '₦';
  const paperWidth = options.paperWidth || settings.thermalPaperWidth || '80mm';

  const shopName = escapeHtml(shop.name || business.name || 'SmartMind POS');
  const shopAddress = escapeHtml(shop.address || '');
  const shopPhone = escapeHtml(shop.phone || '');
  const businessName = escapeHtml(business.name || '');
  const cashier = escapeHtml(sale.cashierName || 'Cashier');
  const terminal = escapeHtml(sale.terminalId || shop.terminalId || 'POS-01');
  const receiptNo = escapeHtml(sale.receiptNumber || sale.id);
  const dateFormatted = escapeHtml(sale.createdAt || new Date().toLocaleString());
  const footerNote = escapeHtml(shop.receiptFooterNote || 'Thank you for your patronage!');

  let paymentLabel = sale.paymentMethod.replace(/_/g, ' ').toUpperCase();
  if (sale.paymentMethod === 'credit') {
    paymentLabel = 'CREDIT (DEBT BOOK)';
  } else if (sale.paymentMethod === 'pos_card') {
    paymentLabel = 'POS CARD';
  } else if (sale.paymentMethod === 'cash') {
    paymentLabel = 'CASH';
  } else if (sale.paymentMethod === 'bank_transfer') {
    paymentLabel = 'BANK TRANSFER';
  } else if (sale.paymentMethod === 'split_payment') {
    paymentLabel = 'SPLIT PAYMENT';
  }

  if (isA4) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Receipt ${receiptNo}</title>
<style>
  @page { size: A4; margin: 15mm; }
  body {
    font-family: Arial, sans-serif;
    color: #222;
    font-size: 12px;
    line-height: 1.4;
    margin: 0;
    padding: 0;
  }
  .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 16px; }
  .title { font-size: 20px; font-weight: bold; margin: 0 0 4px; }
  .subtitle { font-size: 13px; color: #555; margin: 0 0 4px; }
  .meta-grid { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 12px; }
  .watermark { background: #fee2e2; color: #991b1b; padding: 6px; text-align: center; font-weight: bold; margin-bottom: 12px; border: 1px solid #f87171; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th, td { border-bottom: 1px solid #ddd; padding: 8px 6px; text-align: left; }
  th { background: #f8fafc; font-weight: bold; }
  .right { text-align: right; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .totals-row td { font-size: 14px; font-weight: bold; border-top: 2px solid #333; border-bottom: 2px solid #333; }
  .footer { text-align: center; font-size: 11px; color: #666; margin-top: 24px; border-top: 1px dashed #ccc; padding-top: 12px; }
</style>
</head>
<body>
  <div class="header">
    <div class="title">${businessName}</div>
    ${businessName !== shopName ? `<div class="subtitle">${shopName}</div>` : ''}
    <div class="subtitle">${shopAddress}${shopPhone ? ` · Tel: ${shopPhone}` : ''}</div>
  </div>

  ${isDuplicate ? '<div class="watermark">*** DUPLICATE RECEIPT COPY ***</div>' : ''}

  <div class="meta-grid">
    <div>
      <div><strong>Receipt #:</strong> ${receiptNo}</div>
      <div><strong>Date:</strong> ${dateFormatted}</div>
      <div><strong>Terminal:</strong> ${terminal}</div>
    </div>
    <div class="right">
      <div><strong>Cashier:</strong> ${cashier}</div>
      <div><strong>Payment:</strong> ${paymentLabel}</div>
      ${sale.paymentReference ? `<div><strong>Ref:</strong> ${escapeHtml(sale.paymentReference)}</div>` : ''}
      ${sale.creditCustomerName ? `<div><strong>Customer:</strong> ${escapeHtml(sale.creditCustomerName)}</div>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Item Description</th>
        <th class="center">Qty</th>
        <th class="right">Unit Price</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${sale.items.map((line) => `
        <tr>
          <td>
            <div class="bold">${escapeHtml(line.productName)}</div>
            ${line.sku ? `<div style="font-size: 10px; color: #666;">SKU: ${escapeHtml(line.sku)}</div>` : ''}
          </td>
          <td class="center">${line.quantity}</td>
          <td class="right">${formatCurrency(line.unitPrice, symbol)}</td>
          <td class="right bold">${formatCurrency(line.lineTotal, symbol)}</td>
        </tr>
      `).join('')}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3" class="right">Subtotal:</td>
        <td class="right">${formatCurrency(sale.subtotal, symbol)}</td>
      </tr>
      ${sale.discountAmount > 0 ? `
      <tr>
        <td colspan="3" class="right">Discount:</td>
        <td class="right">-${formatCurrency(sale.discountAmount, symbol)}</td>
      </tr>` : ''}
      ${sale.taxAmount > 0 && shop.printVatOnReceipt !== false && (sale.taxRatePercent || 0) > 0 ? `
      <tr>
        <td colspan="3" class="right">Tax / VAT (${sale.taxRatePercent}%):</td>
        <td class="right">${formatCurrency(sale.taxAmount, symbol)}</td>
      </tr>` : ''}
      <tr class="totals-row">
        <td colspan="3" class="right">TOTAL PAYABLE:</td>
        <td class="right">${formatCurrency(sale.totalAmount, symbol)}</td>
      </tr>
      ${sale.paymentMethod === 'cash' ? `
      <tr>
        <td colspan="3" class="right">Amount Tendered:</td>
        <td class="right">${formatCurrency(sale.amountTendered, symbol)}</td>
      </tr>
      <tr>
        <td colspan="3" class="right">Change Due:</td>
        <td class="right bold">${formatCurrency(sale.changeDue, symbol)}</td>
      </tr>` : ''}
    </tfoot>
  </table>

  <div class="footer">
    <div>${footerNote}</div>
    <div style="margin-top: 4px;">SmartMind POS · Official Customer Receipt</div>
  </div>
</body>
</html>`;
  }

  // Thermal continuous roll layout (80mm / 58mm)
  const rollWidth = paperWidth === '58mm' ? '48mm' : '72mm';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Receipt ${receiptNo}</title>
<style>
  @page {
    margin: 2mm 1.5mm;
    size: auto;
  }
  @media print {
    body {
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
    }
  }
  body {
    width: ${rollWidth};
    margin: 0 auto;
    font-family: Arial, 'Segoe UI', Tahoma, sans-serif;
    font-size: 11px;
    line-height: 1.25;
    color: #000;
    background: #fff;
    -webkit-print-color-adjust: exact;
  }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: bold; }
  .store-title {
    font-size: 14px;
    font-weight: bold;
    text-transform: uppercase;
    margin-bottom: 2px;
  }
  .store-sub {
    font-size: 10px;
    color: #222;
    margin-bottom: 2px;
  }
  .line {
    border-top: 1px dashed #000;
    margin: 5px 0;
  }
  .double-line {
    border-top: 2px dashed #000;
    margin: 6px 0;
  }
  .meta-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10.5px;
    margin-bottom: 4px;
  }
  .meta-table td {
    padding: 1.5px 0;
  }
  .items-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }
  .items-table td {
    padding: 2px 0;
    vertical-align: top;
  }
  .totals-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    margin-top: 4px;
  }
  .totals-table td {
    padding: 1.5px 0;
  }
  .grand-total td {
    font-size: 13px;
    font-weight: bold;
    padding: 4px 0;
    border-top: 1px solid #000;
    border-bottom: 1px solid #000;
  }
  .watermark {
    text-align: center;
    font-weight: bold;
    font-size: 11px;
    padding: 3px 0;
    margin: 4px 0;
    border: 1px solid #000;
  }
  .footer {
    text-align: center;
    font-size: 10px;
    margin-top: 6px;
    line-height: 1.3;
  }
  .paper-feed {
    height: 12mm;
  }
</style>
</head>
<body>
  <div class="center store-title">${shopName}</div>
  ${businessName && businessName !== shopName ? `<div class="center store-sub">${businessName}</div>` : ''}
  ${shopAddress ? `<div class="center store-sub">${shopAddress}</div>` : ''}
  ${shopPhone ? `<div class="center store-sub">Tel: ${shopPhone}</div>` : ''}

  ${isDuplicate ? '<div class="watermark">*** DUPLICATE RECEIPT ***</div>' : ''}

  <div class="line"></div>

  <table class="meta-table">
    <tr>
      <td><strong>Receipt #:</strong></td>
      <td class="right bold">${receiptNo}</td>
    </tr>
    <tr>
      <td><strong>Date:</strong></td>
      <td class="right">${dateFormatted}</td>
    </tr>
    <tr>
      <td><strong>Cashier:</strong></td>
      <td class="right">${cashier}</td>
    </tr>
    <tr>
      <td><strong>Terminal:</strong></td>
      <td class="right">${terminal}</td>
    </tr>
    <tr>
      <td><strong>Payment:</strong></td>
      <td class="right bold">${paymentLabel}</td>
    </tr>
    ${sale.paymentReference ? `
    <tr>
      <td><strong>Ref:</strong></td>
      <td class="right">${escapeHtml(sale.paymentReference)}</td>
    </tr>` : ''}
    ${sale.creditCustomerName ? `
    <tr>
      <td><strong>Customer:</strong></td>
      <td class="right bold">${escapeHtml(sale.creditCustomerName)}${sale.creditCustomerPhone ? ` (${escapeHtml(sale.creditCustomerPhone)})` : ''}</td>
    </tr>` : ''}
  </table>

  <div class="line"></div>

  <table class="items-table">
    ${sale.items.map((line) => `
      <tr>
        <td colspan="2" class="bold">${escapeHtml(line.productName)}</td>
      </tr>
      <tr>
        <td style="padding-left: 6px; font-size: 10px; color: #333;">
          ${line.quantity} x ${formatCurrency(line.unitPrice, symbol)}
        </td>
        <td class="right bold">${formatCurrency(line.lineTotal, symbol)}</td>
      </tr>
    `).join('')}
  </table>

  <div class="line"></div>

  <table class="totals-table">
    <tr>
      <td>Subtotal:</td>
      <td class="right">${formatCurrency(sale.subtotal, symbol)}</td>
    </tr>
    ${sale.discountAmount > 0 ? `
    <tr>
      <td>Discount:</td>
      <td class="right">-${formatCurrency(sale.discountAmount, symbol)}</td>
    </tr>` : ''}
    ${sale.taxAmount > 0 && shop.printVatOnReceipt !== false && (sale.taxRatePercent || 0) > 0 ? `
    <tr>
      <td>Tax / VAT (${sale.taxRatePercent}%):</td>
      <td class="right">${formatCurrency(sale.taxAmount, symbol)}</td>
    </tr>` : ''}
    <tr class="grand-total">
      <td>TOTAL:</td>
      <td class="right">${formatCurrency(sale.totalAmount, symbol)}</td>
    </tr>
    ${sale.paymentMethod === 'cash' ? `
    <tr>
      <td>Tendered:</td>
      <td class="right">${formatCurrency(sale.amountTendered, symbol)}</td>
    </tr>
    <tr>
      <td>Change Due:</td>
      <td class="right bold">${formatCurrency(sale.changeDue, symbol)}</td>
    </tr>` : ''}
  </table>

  <div class="double-line"></div>

  <div class="footer">
    <div>${footerNote}</div>
    <div style="margin-top: 3px; font-size: 9px; color: #555;">SmartMind POS · Retail System</div>
  </div>

  <!-- Cutter Feed Spacing -->
  <div class="paper-feed"></div>
</body>
</html>`;
}

export interface PrintSaleReceiptResult {
  success: boolean;
  printerName: string;
  failureReason?: string;
}

/**
 * Prints a sales receipt silently to the configured printer via Electron native API,
 * or gracefully triggers browser print preview if running in a generic browser.
 */
export async function printSaleReceipt(options: {
  sale: SaleTransaction;
  shop: Shop;
  business: Business;
  isDuplicate?: boolean;
  copies?: number;
  targetPrinterName?: string;
}): Promise<PrintSaleReceiptResult> {
  const { sale, shop, business, isDuplicate = false, copies = 1, targetPrinterName } = options;
  const effective = resolveEffectivePrinter(shop);
  const printerName = targetPrinterName || effective.printerName;
  const format = effective.format;

  const html = generateSaleReceiptHtml({
    sale,
    shop,
    business,
    isDuplicate,
    paperWidth: effective.mode === 'thermal' ? (effective.format === 'thermal-58mm' ? '58mm' : '80mm') : undefined,
  });

  const desktopApi = typeof window !== 'undefined' ? window.smartmindDesktopApi : undefined;

  if (desktopApi?.printDocument) {
    try {
      const result = await desktopApi.printDocument({
        printerName,
        format,
        html,
        copies,
      });

      return {
        success: result.success,
        printerName,
        failureReason: result.failureReason,
      };
    } catch (error) {
      return {
        success: false,
        printerName,
        failureReason: error instanceof Error ? error.message : 'Printing failed.',
      };
    }
  }

  // Fallback for standard browser when not running in Electron desktop app
  if (typeof window !== 'undefined' && window.print) {
    try {
      window.print();
      return {
        success: true,
        printerName: 'System Print Dialog',
      };
    } catch (error) {
      return {
        success: false,
        printerName: 'System Print Dialog',
        failureReason: error instanceof Error ? error.message : 'Print dialog was cancelled.',
      };
    }
  }

  return {
    success: false,
    printerName,
    failureReason: 'No printer interface available in this environment.',
  };
}

/**
 * Generates an Interim Bill / Pro-Forma Check HTML string for thermal or A4 printing
 * so a bar customer can review their running table bill before settlement.
 */
export function generateInterimTabBillHtml(options: {
  tab: PosCustomerTab;
  shop: Shop;
  business: Business;
  currentUser: User;
  paperWidth?: '80mm' | '58mm';
}): string {
  const { tab, shop, business, currentUser, paperWidth = '80mm' } = options;
  const symbol = business.currencySymbol || '₦';
  const discountVal = Math.max(0, parseFloat(tab.discountInput) || 0);
  const totals = calculateCartTotals(
    tab.cart,
    discountVal,
    tab.discountMode,
    shop.taxRatePercent
  );

  const rollWidth = paperWidth === '58mm' ? '48mm' : '72mm';
  const tableLabel = tab.tableIdentifier || tab.label;
  const serverLabel =
    tab.serverName || currentUser.fullName || currentUser.username || 'Bar Staff';
  const nowStr = new Date().toLocaleString('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Interim Bill - ${escapeHtml(tableLabel)}</title>
  <style>
    @page {
      margin: 0;
      size: ${paperWidth} auto;
    }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: ${paperWidth === '58mm' ? '11px' : '12px'};
      line-height: 1.35;
      color: #000;
      background: #fff;
      margin: 0;
      padding: 6px 8px;
      width: ${rollWidth};
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
    }
    .center { text-align: center; }
    .right { text-align: right; }
    .bold { font-weight: bold; }
    .divider {
      border-top: 1px dashed #000;
      margin: 6px 0;
    }
    .double-divider {
      border-top: 2px dashed #000;
      margin: 6px 0;
    }
    .banner {
      border: 1px solid #000;
      padding: 4px;
      margin: 4px 0;
      font-weight: bold;
      text-align: center;
      font-size: ${paperWidth === '58mm' ? '10px' : '11px'};
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 4px 0;
    }
    td {
      padding: 2px 0;
      vertical-align: top;
    }
    .item-qty {
      width: 18%;
      text-align: left;
    }
    .item-desc {
      width: 52%;
    }
    .item-amt {
      width: 30%;
      text-align: right;
    }
    .totals-row td {
      font-weight: bold;
      font-size: ${paperWidth === '58mm' ? '12px' : '13px'};
      padding-top: 4px;
    }
  </style>
</head>
<body>
  <div class="center">
    <div class="bold" style="font-size: 14px;">${escapeHtml(shop.name)}</div>
    ${shop.address ? `<div>${escapeHtml(shop.address)}</div>` : ''}
    ${shop.phone ? `<div>Tel: ${escapeHtml(shop.phone)}</div>` : ''}
  </div>

  <div class="banner">
    *** INTERIM BILL / PRO-FORMA ***<br/>
    NOT A FINAL TAX RECEIPT
  </div>

  <div style="font-size: 11px;">
    <div><strong>TABLE / TAB:</strong> ${escapeHtml(tableLabel)}</div>
    <div><strong>SERVER / WAITER:</strong> ${escapeHtml(serverLabel)}</div>
    <div><strong>OPENED:</strong> ${escapeHtml(tab.createdAt)}</div>
    <div><strong>PRINTED:</strong> ${escapeHtml(nowStr)}</div>
    ${tab.customerNote ? `<div><strong>NOTE:</strong> ${escapeHtml(tab.customerNote)}</div>` : ''}
  </div>

  <div class="divider"></div>

  <table>
    <thead>
      <tr style="border-bottom: 1px solid #000; font-weight: bold;">
        <td class="item-qty">QTY</td>
        <td class="item-desc">ITEM</td>
        <td class="item-amt">TOTAL</td>
      </tr>
    </thead>
    <tbody>
      ${tab.cart.map((item) => {
        const itemLineTotal = item.product.sellingPrice * item.quantity;
        const isDispatched = (item.dispatchedQuantity || 0) >= item.quantity;
        return `
        <tr>
          <td class="item-qty bold">${item.quantity}x</td>
          <td class="item-desc">
            <div class="bold">${escapeHtml(item.product.name)}</div>
            <div style="font-size: 10px; color: #444;">@ ${formatCurrency(item.product.sellingPrice, symbol)} ${isDispatched ? '✓' : '(pending)'}</div>
          </td>
          <td class="item-amt bold">${formatCurrency(itemLineTotal, symbol)}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>

  <div class="divider"></div>

  <table>
    <tr>
      <td class="right">Subtotal (${totals.itemCount} item${totals.itemCount === 1 ? '' : 's'}):</td>
      <td class="right bold">${formatCurrency(totals.subtotal, symbol)}</td>
    </tr>
    ${totals.discountAmount > 0 ? `
    <tr>
      <td class="right">Discount:</td>
      <td class="right">-${formatCurrency(totals.discountAmount, symbol)}</td>
    </tr>` : ''}
    ${totals.taxAmount > 0 && shop.printVatOnReceipt !== false && (shop.taxRatePercent || 0) > 0 ? `
    <tr>
      <td class="right">VAT (${shop.taxRatePercent}%):</td>
      <td class="right">${formatCurrency(totals.taxAmount, symbol)}</td>
    </tr>` : ''}
    <tr class="totals-row">
      <td class="right">CURRENT TOTAL:</td>
      <td class="right">${formatCurrency(totals.totalAmount, symbol)}</td>
    </tr>
  </table>

  <div class="double-divider"></div>

  <div class="center" style="font-size: 10px;">
    <p style="margin: 2px 0;">PLEASE VERIFY ALL ITEMS AT TABLE</p>
    <p style="margin: 2px 0; font-weight: bold;">PAYMENT DUE UPON SERVICE COMPLETION</p>
    <p style="margin: 4px 0 0 0; color: #666;">SmartMind POS · Bar &amp; Table Management</p>
  </div>
</body>
</html>`;
}

/**
 * Prints an interim bill to the configured receipt printer for customer table verification.
 */
export async function printInterimTabBill(options: {
  tab: PosCustomerTab;
  shop: Shop;
  business: Business;
  currentUser: User;
  targetPrinterName?: string;
}): Promise<PrintSaleReceiptResult> {
  const { tab, shop, business, currentUser, targetPrinterName } = options;
  const effective = resolveEffectivePrinter(shop);
  const printerName = targetPrinterName || effective.printerName;
  const format = effective.format;

  const html = generateInterimTabBillHtml({
    tab,
    shop,
    business,
    currentUser,
    paperWidth: effective.mode === 'thermal' ? (effective.format === 'thermal-58mm' ? '58mm' : '80mm') : '80mm',
  });

  const desktopApi = typeof window !== 'undefined' ? window.smartmindDesktopApi : undefined;

  if (desktopApi?.printDocument) {
    try {
      const result = await desktopApi.printDocument({
        printerName,
        format,
        html,
        copies: 1,
      });

      return {
        success: result.success,
        printerName,
        failureReason: result.failureReason,
      };
    } catch (error) {
      return {
        success: false,
        printerName,
        failureReason: error instanceof Error ? error.message : 'Printing interim bill failed.',
      };
    }
  }

  // Web fallback: open print window
  if (typeof window !== 'undefined') {
    try {
      const printWin = window.open('', '_blank', 'width=420,height=600');
      if (printWin) {
        printWin.document.open();
        printWin.document.write(html);
        printWin.document.close();
        printWin.focus();
        setTimeout(() => {
          printWin.print();
        }, 300);
        return {
          success: true,
          printerName: 'Browser Print Preview',
        };
      }
    } catch (error) {
      return {
        success: false,
        printerName: 'Browser Window',
        failureReason: error instanceof Error ? error.message : 'Popup window blocked.',
      };
    }
  }

  return {
    success: false,
    printerName,
    failureReason: 'No printer interface available.',
  };
}
