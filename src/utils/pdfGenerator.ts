import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import {
  Business,
  DebtCustomer,
  DebtTransaction,
  Invoice,
  Product,
  SaleTransaction,
  Shop,
  Supplier,
} from '../types/pos';
import {
  buildSalesSummaryReportData,
  SupplierItemizedSupplyRow,
} from './posCalculations';

function formatPdfCurrency(amount: number, symbol: string): string {
  const safeSymbol = symbol === '₦' ? 'NGN ' : `${symbol} `;
  return `${safeSymbol}${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Downloads a high-fidelity, perfectly aligned PDF document for an invoice.
 * Column order: ITEM DESCRIPTION | QTY | UNIT PRICE | AMOUNT
 * Includes payment breakdown (Amount Paid & Balance Due) for partially paid invoices.
 */
export async function downloadInvoicePdf(
  invoice: Invoice,
  business: Business,
  shop: Shop,
  symbol: string = '₦',
  elementId?: string
): Promise<void> {
  const targetId = elementId || `invoice-document-${invoice.id}`;
  const targetElement = document.getElementById(targetId);

  if (targetElement) {
    try {
      const canvas = await html2canvas(targetElement, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${invoice.invoiceNumber}.pdf`);
      return;
    } catch {
      // Fallback to vector PDF generator
    }
  }

  // Pure Native Vector PDF fallback with 100% precise alignment
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const margin = 15;
  const contentWidth = pageWidth - margin * 2; // 180mm
  let y = margin;

  // Colors
  const primaryColor = [5, 150, 105]; // Emerald-600
  const darkSlate = [15, 23, 42]; // Slate-900
  const lightBg = [248, 250, 252]; // Slate-50
  const textMuted = [100, 116, 139]; // Slate-500
  const borderColor = [226, 232, 240]; // Slate-200

  const safeCurrencyLabel = symbol === '₦' ? 'NGN' : symbol;

  // ----------------------------------------------------
  // 1. HEADER SECTION
  // ----------------------------------------------------
  // Brand Header Icon
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.roundedRect(margin, y, 10, 10, 2, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('SM', margin + 2.2, y + 6.8);

  // Business Name & Shop Info
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.setFontSize(13);
  doc.text(business.legalName || business.name, margin + 13, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(`${shop.name} (${shop.code})`, margin + 13, y + 10.5);
  doc.text(`${shop.address}, ${shop.locationCity}`, margin, y + 16);
  doc.text(
    `Phone: ${shop.phone} | TIN: ${business.taxIdentificationNumber || 'N/A'}`,
    margin,
    y + 20.5
  );

  // Invoice Title & Number
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text('INVOICE', pageWidth - margin, y + 6, { align: 'right' });

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(invoice.invoiceNumber, pageWidth - margin, y + 11.5, { align: 'right' });

  // Status Badge
  const formattedStatus = invoice.status.replace('_', ' ').toUpperCase();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);

  if (invoice.status === 'paid') {
    doc.setFillColor(209, 250, 229); // Emerald
    doc.setTextColor(6, 95, 70);
  } else if (invoice.status === 'partially_paid') {
    doc.setFillColor(219, 234, 254); // Blue
    doc.setTextColor(30, 64, 175);
  } else if (invoice.status === 'overdue') {
    doc.setFillColor(254, 226, 226); // Rose
    doc.setTextColor(153, 27, 27);
  } else {
    doc.setFillColor(254, 243, 199); // Amber
    doc.setTextColor(146, 64, 14);
  }

  const badgeWidth = doc.getTextWidth(formattedStatus) + 8;
  doc.roundedRect(pageWidth - margin - badgeWidth, y + 14.5, badgeWidth, 5.5, 1.5, 1.5, 'F');
  doc.text(formattedStatus, pageWidth - margin - badgeWidth / 2, y + 18.5, { align: 'center' });

  y += 28;

  // Divider
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // ----------------------------------------------------
  // 2. BILLED TO & DETAILS
  // ----------------------------------------------------
  const boxWidth = (contentWidth - 6) / 2;
  const boxHeight = 28;

  // Billed To Box
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(margin, y, boxWidth, boxHeight, 2, 2, 'F');
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.roundedRect(margin, y, boxWidth, boxHeight, 2, 2, 'D');

  let boxY = y + 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('BILLED TO:', margin + 4, boxY);
  boxY += 4.5;

  doc.setFontSize(9.5);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text(invoice.customerName, margin + 4, boxY);
  boxY += 4.5;

  if (invoice.companyName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(invoice.companyName, margin + 4, boxY);
    boxY += 4;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text(`Tel: ${invoice.customerPhone}`, margin + 4, boxY);
  if (invoice.customerEmail) {
    boxY += 3.8;
    doc.text(`Email: ${invoice.customerEmail}`, margin + 4, boxY);
  }

  // Details Box
  const rightBoxX = margin + boxWidth + 6;
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(rightBoxX, y, boxWidth, boxHeight, 2, 2, 'F');
  doc.roundedRect(rightBoxX, y, boxWidth, boxHeight, 2, 2, 'D');

  let rBoxY = y + 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('INVOICE DETAILS:', rightBoxX + 4, rBoxY);
  rBoxY += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text(`Issue Date: ${invoice.issueDate}`, rightBoxX + 4, rBoxY);
  rBoxY += 4.5;
  doc.text(`Due Date: ${invoice.dueDate}`, rightBoxX + 4, rBoxY);
  rBoxY += 4.5;
  doc.text(`Issued By: ${invoice.createdByName}`, rightBoxX + 4, rBoxY);

  y += boxHeight + 8;

  // ----------------------------------------------------
  // 3. LINE ITEMS TABLE
  // ----------------------------------------------------
  const tableX = margin;
  const colDescX = tableX + 4;
  const colQtyX = tableX + 90;
  const colPriceX = tableX + 140;
  const colAmountX = tableX + 176;

  doc.setFillColor(241, 245, 249);
  doc.roundedRect(tableX, y, contentWidth, 7, 1, 1, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text('ITEM DESCRIPTION', colDescX, y + 4.8);
  doc.text('QTY', colQtyX, y + 4.8, { align: 'center' });
  doc.text(`UNIT PRICE (${safeCurrencyLabel})`, colPriceX, y + 4.8, { align: 'right' });
  doc.text(`AMOUNT (${safeCurrencyLabel})`, colAmountX, y + 4.8, { align: 'right' });

  y += 7;

  invoice.items.forEach((item, index) => {
    const rowHeight = 9;
    if (index % 2 === 1) {
      doc.setFillColor(250, 250, 250);
      doc.rect(tableX, y, contentWidth, rowHeight, 'F');
    }

    doc.setDrawColor(241, 245, 249);
    doc.line(tableX, y + rowHeight, tableX + contentWidth, y + rowHeight);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.text(item.productName, colDescX, y + 4.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(`SKU: ${item.sku}`, colDescX, y + 7.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.text(`${item.quantity} ${item.unit || 'Unit'}${item.quantity > 1 ? 's' : ''}`, colQtyX, y + 5.2, { align: 'center' });

    doc.text(formatPdfCurrency(item.unitPrice, symbol), colPriceX, y + 5.2, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.text(formatPdfCurrency(item.lineTotal, symbol), colAmountX, y + 5.2, { align: 'right' });

    y += rowHeight;
  });

  y += 6;

  // ----------------------------------------------------
  // 4. FINANCIAL SUMMARY (SUBTOTAL, TAX, PAID, BALANCE DUE)
  // ----------------------------------------------------
  const summaryXLabel = tableX + 115;
  const summaryXValue = colAmountX;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);

  doc.text('Subtotal:', summaryXLabel, y);
  doc.text(formatPdfCurrency(invoice.subtotal, symbol), summaryXValue, y, { align: 'right' });
  y += 4.8;

  if (invoice.discountAmount > 0) {
    doc.setTextColor(6, 95, 70);
    doc.text('Discount:', summaryXLabel, y);
    doc.text(`-${formatPdfCurrency(invoice.discountAmount, symbol)}`, summaryXValue, y, { align: 'right' });
    y += 4.8;
  }

  doc.setTextColor(80, 80, 80);
  doc.text(`VAT (${invoice.taxRatePercent}%):`, summaryXLabel, y);
  doc.text(formatPdfCurrency(invoice.taxAmount, symbol), summaryXValue, y, { align: 'right' });
  y += 6;

  doc.setDrawColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.setLineWidth(0.5);
  doc.line(summaryXLabel, y - 1.5, summaryXValue, y - 1.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text('TOTAL AMOUNT:', summaryXLabel, y + 3.5);
  doc.text(formatPdfCurrency(invoice.totalAmount, symbol), summaryXValue, y + 3.5, { align: 'right' });
  y += 6;

  const paidAmount = invoice.amountPaid || 0;
  const balanceDue = invoice.balanceRemaining ?? Math.max(0, invoice.totalAmount - paidAmount);

  if (paidAmount > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(6, 95, 70);
    doc.text('Amount Paid:', summaryXLabel, y + 3);
    doc.text(`-${formatPdfCurrency(paidAmount, symbol)}`, summaryXValue, y + 3, { align: 'right' });
    y += 5.5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    if (balanceDue === 0) {
      doc.setTextColor(6, 95, 70);
      doc.text('BALANCE DUE:', summaryXLabel, y + 3.5);
      doc.text(formatPdfCurrency(0, symbol), summaryXValue, y + 3.5, { align: 'right' });
    } else {
      doc.setTextColor(180, 30, 30);
      doc.text('BALANCE DUE:', summaryXLabel, y + 3.5);
      doc.text(formatPdfCurrency(balanceDue, symbol), summaryXValue, y + 3.5, { align: 'right' });
    }
  }

  y += 14;

  // ----------------------------------------------------
  // 5. REMITTANCE & PAYMENT INSTRUCTIONS
  // ----------------------------------------------------
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(margin, y, contentWidth, 18, 2, 2, 'F');
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, 18, 2, 2, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text('REMITTANCE & PAYMENT INSTRUCTIONS:', margin + 4, y + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  const noteLines = doc.splitTextToSize(
    invoice.notes || `Please pay via Bank Transfer to ${business.name}.`,
    contentWidth - 8
  );
  doc.text(noteLines, margin + 4, y + 8.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(
    `Payment Description / Ref: ${invoice.invoiceNumber}`,
    margin + 4,
    y + 15
  );

  // ----------------------------------------------------
  // 6. FOOTER
  // ----------------------------------------------------
  const footerY = 285;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(`Thank you for doing business with ${business.name}.`, pageWidth / 2, footerY, {
    align: 'center',
  });
  doc.text(
    'Computer Generated Official Tax Invoice · SmartMind POS System',
    pageWidth / 2,
    footerY + 3.8,
    { align: 'center' }
  );

  doc.save(`${invoice.invoiceNumber}.pdf`);
}

/**
 * High-fidelity DOM-to-PDF export using html2canvas and jsPDF.
 */
export async function downloadInvoiceModalPdf(
  elementId: string,
  fileName: string = 'Invoice.pdf'
): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) return;

  const canvas = await html2canvas(element, {
    scale: 3,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

  pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
  pdf.save(fileName);
}

export interface SalesSummaryPdfOptions {
  sales: SaleTransaction[];
  business: Business;
  shop: Shop;
  dateRangeLabel: string;
  symbol?: string;
  products?: Product[];
  fileName?: string;
  generatedBy?: string;
  reportType?: 'itemized' | 'receipts' | 'staff_summary';
  outstandingCreditFallback?: number;
  elementId?: string;
}

export function formatPaymentMethodLabel(pm: string): string {
  switch (pm) {
    case 'cash':
      return 'Cash';
    case 'transfer':
    case 'bank_transfer':
      return 'Bank Transfer';
    case 'pos_card':
      return 'POS Card';
    case 'credit':
      return 'Credit';
    case 'split_payment':
      return 'Split Payment';
    default:
      return pm.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

/**
 * Downloads a Sales Summary PDF report.
 * When reportType === 'staff_summary', generates the non-itemized Sales Report matching the reference sample:
 * - Portrait A4
 * - Header: SALES REPORT, Date Range, Business/Shop Name
 * - Two-column breakdown: Payment Method Breakdown (Transfer, Pos, Cash) + Total Sales, VAT Collected, Outstanding Credit, Total Refunds
 * - Table Headers: # | Date & Time | Product Name | Product Type | Quantity | Amount | Payment Method | Staff
 *   with "--" for Date & Time, Product Name, Product Type, and aggregated totals per Staff.
 */
export async function downloadSalesSummaryPdf({
  sales,
  business,
  shop,
  dateRangeLabel,
  symbol = '₦',
  products = [],
  fileName,
  generatedBy,
  reportType = 'itemized',
  outstandingCreditFallback = 0,
  elementId,
}: SalesSummaryPdfOptions): Promise<void> {
  const safeShopCode = shop.code.replace(/[^a-zA-Z0-9]/g, '_');
  const safeRange = dateRangeLabel.replace(/[^a-zA-Z0-9]/g, '_');

  // Build lookup map for product units
  const productUnitMap = new Map<string, string>();
  products.forEach((p) => {
    if (p.unit) productUnitMap.set(p.id, p.unit);
  });

  if (reportType === 'staff_summary') {
    const defaultStaffFileName =
      fileName || `Sales_Report_${safeShopCode}_${safeRange}.pdf`;

    if (elementId && typeof document !== 'undefined') {
      const targetEl = document.getElementById(elementId);
      if (targetEl) {
        try {
          const canvas = await html2canvas(targetEl, {
            scale: 3,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
          });
          const imgData = canvas.toDataURL('image/png');
          const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4',
          });
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
          pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
          pdf.save(defaultStaffFileName);
          return;
        } catch {
          // Fall back to vector PDF generation below
        }
      }
    }

    const report = buildSalesSummaryReportData(sales, {
      outstandingCreditFallback,
    });

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
    const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
    const margin = 11;
    let y = 18;

    // 1. HEADER BLOCK (Centered/Left-aligned at x=73mm like sample)
    const headerX = 73;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(0, 0, 0);
    doc.text('SALES REPORT', headerX, y);
    y += 7;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(dateRangeLabel, headerX, y);
    y += 5.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    const bizTitle = `${business.legalName || business.name} (${shop.name})`;
    const bizLines = doc.splitTextToSize(bizTitle, 80);
    doc.text(bizLines, headerX, y);
    y += bizLines.length * 4.8 + 6;

    // 2. TWO-COLUMN BREAKDOWN
    const leftX = margin;
    const leftValX = margin + 18;
    const rightLabelX = 111;
    const rightValX = pageWidth - margin;

    let leftY = y;
    let rightY = y;

    // Left: Payment Method Breakdown
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text('Payment Method Breakdown', leftX, leftY);
    leftY += 6.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text('Transfer', leftX, leftY);
    doc.text(formatPdfCurrency(report.transferTotal, symbol), leftValX, leftY);
    leftY += 5.2;

    doc.text('Pos', leftX, leftY);
    doc.text(formatPdfCurrency(report.posTotal, symbol), leftValX, leftY);
    leftY += 5.2;

    doc.text('Cash', leftX, leftY);
    doc.text(formatPdfCurrency(report.cashTotal, symbol), leftValX, leftY);
    leftY += 5.2;

    if (report.splitTotal > 0) {
      doc.text('Split', leftX, leftY);
      doc.text(formatPdfCurrency(report.splitTotal, symbol), leftValX, leftY);
      leftY += 5.2;
    }

    // Right: Total Sales, VAT Collected, Outstanding Credit, Total Refunds
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text('Total Sales', rightLabelX, rightY);
    doc.text(formatPdfCurrency(report.totalSales, symbol), rightValX, rightY, {
      align: 'right',
    });
    rightY += 5.2;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 58, 138); // Blue
    doc.text('VAT Collected', rightLabelX, rightY);
    doc.text(formatPdfCurrency(report.vatCollected, symbol), rightValX, rightY, {
      align: 'right',
    });
    rightY += 5.2;

    doc.setTextColor(185, 28, 28); // Red
    doc.text('Outstanding Credit', rightLabelX, rightY);
    doc.text(
      formatPdfCurrency(report.outstandingCredit, symbol),
      rightValX,
      rightY,
      { align: 'right' }
    );
    rightY += 5.2;

    doc.setTextColor(217, 119, 6); // Amber/Gold
    doc.text('Total Refunds', rightLabelX, rightY);
    doc.text(formatPdfCurrency(report.totalRefunds, symbol), rightValX, rightY, {
      align: 'right',
    });
    rightY += 5.2;

    y = Math.max(leftY, rightY) + 5;

    // 3. MAIN TABLE (Sales Transactions Aggregated Per Receipt)
    const saleRows = sales.map((sale, idx) => {
      const saleQuantity =
        sale.items && sale.items.length > 0
          ? sale.items.reduce((sum, item) => sum + item.quantity, 0)
          : 1;

      const itemsSummary =
        sale.items && sale.items.length > 0
          ? sale.items
              .map((item) =>
                item.quantity > 1
                  ? `${item.productName} (x${item.quantity})`
                  : item.productName
              )
              .join(', ')
          : 'General Sale';

      const distinctUnits =
        sale.items && sale.items.length > 0
          ? Array.from(
              new Set(
                sale.items.map(
                  (item) =>
                    item.unit || productUnitMap.get(item.productId) || 'Unit'
                )
              )
            )
          : ['Unit'];

      const unitDisplay =
        distinctUnits.length === 1
          ? distinctUnits[0]
          : distinctUnits.length > 1
          ? 'Mixed'
          : 'Unit';

      return {
        index: idx + 1,
        dateTime: sale.createdAt,
        productName: itemsSummary,
        unit: unitDisplay,
        quantity: saleQuantity,
        amount: sale.totalAmount,
        paymentMethod: formatPaymentMethodLabel(sale.paymentMethod),
        staff: sale.cashierName || 'Staff',
      };
    });

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: 15 },
      head: [
        [
          '#',
          'Date & Time',
          'Product Name',
          'Unit of Measurement',
          'Quantity',
          'Amount',
          'Payment Method',
          'Staff',
        ],
      ],
      body:
        saleRows.length > 0
          ? saleRows.map((row) => [
              row.index,
              row.dateTime,
              row.productName,
              row.unit,
              row.quantity.toLocaleString('en-US'),
              formatPdfCurrency(row.amount, symbol),
              row.paymentMethod,
              row.staff,
            ])
          : [['--', '--', '--', '--', '0', formatPdfCurrency(0, symbol), '--', 'No sales in period']],
      theme: 'plain',
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        cellPadding: { top: 3.2, right: 2, bottom: 3.2, left: 2 },
        textColor: [15, 23, 42],
      },
      headStyles: {
        fillColor: [154, 168, 184],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [242, 244, 247],
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 23, halign: 'left' },
        2: { cellWidth: 28, halign: 'left' },
        3: { cellWidth: 25, halign: 'left' },
        4: { cellWidth: 18, halign: 'right' },
        5: { cellWidth: 28, halign: 'right' },
        6: { cellWidth: 30, halign: 'center' },
        7: { cellWidth: 26, halign: 'left' },
      },
      didDrawPage: () => {
        const totalPages = doc.getNumberOfPages();
        const footerY = pageHeight - 7;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(30, 41, 59);
        doc.text('Powered By SmartMind POS', margin, footerY);
        doc.text(
          `Page ${doc.getNumberOfPages()} of ${totalPages}`,
          pageWidth / 2,
          footerY,
          { align: 'center' }
        );
        doc.text('www.smartmindpos.ng', pageWidth - margin, footerY, {
          align: 'right',
        });
      },
    });

    doc.save(defaultStaffFileName);
    return;
  }

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 297mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 210mm
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Colors
  const primaryColor = [5, 150, 105]; // Emerald-600
  const darkSlate = [15, 23, 42]; // Slate-900
  const lightBg = [248, 250, 252]; // Slate-50
  const textMuted = [100, 116, 139]; // Slate-500
  const borderColor = [226, 232, 240]; // Slate-200

  // ----------------------------------------------------
  // 1. HEADER SECTION
  // ----------------------------------------------------
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.roundedRect(margin, y, 10, 10, 2, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('SM', margin + 2.2, y + 6.8);

  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.setFontSize(13);
  doc.text(business.legalName || business.name, margin + 13, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(
    `${shop.name} (${shop.code}) • ${shop.address}, ${shop.locationCity} • Tel: ${shop.phone}`,
    margin + 13,
    y + 10.5
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text('SALES SUMMARY REPORT', pageWidth - margin, y + 6, { align: 'right' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(`Period: ${dateRangeLabel}`, pageWidth - margin, y + 11.5, {
    align: 'right',
  });

  y += 16;

  // Divider Line
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  // ----------------------------------------------------
  // 2. SALE DATA & SUMMARY METRICS (Aggregated Per Sale / Receipt)
  // ----------------------------------------------------
  const saleRows = sales.map((sale, idx) => {
    const saleQuantity =
      sale.items && sale.items.length > 0
        ? sale.items.reduce((sum, item) => sum + item.quantity, 0)
        : 1;

    const itemsSummary =
      sale.items && sale.items.length > 0
        ? sale.items
            .map((item) =>
              item.quantity > 1
                ? `${item.productName} (x${item.quantity})`
                : item.productName
            )
            .join(', ')
        : 'General Sale';

    const productNameDisplay = itemsSummary;

    const distinctUnits =
      sale.items && sale.items.length > 0
        ? Array.from(
            new Set(
              sale.items.map(
                (item) =>
                  item.unit || productUnitMap.get(item.productId) || 'Unit'
              )
            )
          )
        : ['Unit'];

    const unitDisplay =
      distinctUnits.length === 1
        ? distinctUnits[0]
        : distinctUnits.length > 1
        ? 'Mixed'
        : 'Unit';

    return {
      index: idx + 1,
      dateTime: sale.createdAt,
      productName: productNameDisplay,
      unit: unitDisplay,
      quantity: saleQuantity,
      amount: sale.totalAmount,
      paymentMethod: formatPaymentMethodLabel(sale.paymentMethod),
      staff: sale.cashierName,
      receiptNumber: sale.receiptNumber,
    };
  });

  const totalGrossSales = sales.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalQuantitySold = saleRows.reduce((sum, r) => sum + r.quantity, 0);

  const cardWidth = (contentWidth - 12) / 3;
  const cardHeight = 13;

  // Card 1: Gross Sales
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(margin, y, cardWidth, cardHeight, 1.5, 1.5, 'F');
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.roundedRect(margin, y, cardWidth, cardHeight, 1.5, 1.5, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('TOTAL GROSS SALES', margin + 3.5, y + 4.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(formatPdfCurrency(totalGrossSales, symbol), margin + 3.5, y + 9.8);

  // Card 2: Total Items Sold
  const card2X = margin + cardWidth + 6;
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(card2X, y, cardWidth, cardHeight, 1.5, 1.5, 'F');
  doc.roundedRect(card2X, y, cardWidth, cardHeight, 1.5, 1.5, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('TOTAL QUANTITY SOLD', card2X + 3.5, y + 4.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text(`${totalQuantitySold.toLocaleString('en-US')} units`, card2X + 3.5, y + 9.8);

  // Card 3: Total Completed Receipts
  const card3X = card2X + cardWidth + 6;
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(card3X, y, cardWidth, cardHeight, 1.5, 1.5, 'F');
  doc.roundedRect(card3X, y, cardWidth, cardHeight, 1.5, 1.5, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('COMPLETED TRANSACTIONS', card3X + 3.5, y + 4.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text(
    `${sales.length} receipt${sales.length === 1 ? '' : 's'}`,
    card3X + 3.5,
    y + 9.8
  );

  y += cardHeight + 6;

  // ----------------------------------------------------
  // 3. TABLE WITH EXACT HEADERS MATCHING USER ATTACHMENT:
  // # | Date & Time | Product Name | Unit of Measurement | Quantity | Amount | Payment Method | Staff
  // ----------------------------------------------------
  if (saleRows.length === 0) {
    doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
    doc.roundedRect(margin, y, contentWidth, 22, 2, 2, 'F');
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.roundedRect(margin, y, contentWidth, 22, 2, 2, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.text(`No sales records found for period: ${dateRangeLabel}`, margin + 6, y + 9);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(
      'Select a different date or date range to view and export sales data.',
      margin + 6,
      y + 15
    );
  } else {
    if (reportType === 'receipts') {
      const totalItemsCount = sales.reduce(
        (sum, s) => sum + s.items.reduce((iSum, it) => iSum + it.quantity, 0),
        0
      );
      const totalSubtotal = sales.reduce((sum, s) => sum + s.subtotal, 0);
      const totalDiscount = sales.reduce((sum, s) => sum + s.discountAmount, 0);

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin, bottom: 12 },
        head: [
          [
            '#',
            'Receipt Number',
            'Date & Time',
            'Cashier',
            'Payment Method',
            'Items',
            'Subtotal',
            'Discount',
            'Total Amount',
            'Status',
          ],
        ],
        body: sales.map((s, idx) => [
          idx + 1,
          s.receiptNumber,
          s.createdAt,
          s.cashierName,
          formatPaymentMethodLabel(s.paymentMethod),
          s.items.reduce((sum, it) => sum + it.quantity, 0),
          formatPdfCurrency(s.subtotal, symbol),
          s.discountAmount > 0 ? `-${formatPdfCurrency(s.discountAmount, symbol)}` : '-',
          formatPdfCurrency(s.totalAmount, symbol),
          s.syncStatus === 'synced_demo' ? 'Completed' : 'Pending Sync',
        ]),
        foot: [
          [
            'Total',
            `${sales.length} receipts`,
            '',
            '',
            '',
            totalItemsCount.toLocaleString('en-US'),
            formatPdfCurrency(totalSubtotal, symbol),
            totalDiscount > 0 ? `-${formatPdfCurrency(totalDiscount, symbol)}` : '-',
            formatPdfCurrency(totalGrossSales, symbol),
            '',
          ],
        ],
        theme: 'grid',
        styles: {
          font: 'helvetica',
          fontSize: 7.5,
          cellPadding: { top: 2.2, right: 2.5, bottom: 2.2, left: 2.5 },
          textColor: [15, 23, 42],
          lineColor: [226, 232, 240],
          lineWidth: 0.2,
        },
        headStyles: {
          fillColor: [248, 250, 252],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          lineWidth: 0.3,
          lineColor: [203, 213, 225],
        },
        footStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          lineWidth: 0.3,
          lineColor: [203, 213, 225],
        },
        alternateRowStyles: {
          fillColor: [253, 254, 255],
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 32, halign: 'left' },
          2: { cellWidth: 36, halign: 'left' },
          3: { cellWidth: 32, halign: 'left' },
          4: { cellWidth: 28, halign: 'left' },
          5: { cellWidth: 16, halign: 'center' },
          6: { cellWidth: 28, halign: 'right' },
          7: { cellWidth: 24, halign: 'right' },
          8: { cellWidth: 34, halign: 'right' },
          9: { cellWidth: 28, halign: 'center' },
        },
        didDrawPage: () => {
          const totalPages = doc.getNumberOfPages();
          const footerY = pageHeight - 6.5;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
          doc.text(
            `SmartMind POS • ${shop.name} Sales Summary (Receipts) • Period: ${dateRangeLabel}${
              generatedBy ? ` • Generated by ${generatedBy}` : ''
            }`,
            margin,
            footerY
          );
          doc.text(
            `Page ${doc.getNumberOfPages()} of ${totalPages}`,
            pageWidth - margin,
            footerY,
            { align: 'right' }
          );
        },
      });
    } else {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin, bottom: 12 },
        head: [
          [
            '#',
            'Date & Time',
            'Product Name',
            'Unit of Measurement',
            'Quantity',
            'Amount',
            'Payment Method',
            'Staff',
          ],
        ],
        body: saleRows.map((r) => [
          r.index,
          r.dateTime,
          r.productName,
          r.unit,
          r.quantity.toLocaleString('en-US'),
          formatPdfCurrency(r.amount, symbol),
          r.paymentMethod,
          r.staff,
        ]),
        foot: [
          [
            'Total',
            '',
            '',
            '',
            totalQuantitySold.toLocaleString('en-US'),
            formatPdfCurrency(totalGrossSales, symbol),
            '',
            '',
          ],
        ],
        theme: 'grid',
        styles: {
          font: 'helvetica',
          fontSize: 7.5,
          cellPadding: { top: 2.2, right: 2.5, bottom: 2.2, left: 2.5 },
          textColor: [15, 23, 42],
          lineColor: [226, 232, 240],
          lineWidth: 0.2,
        },
        headStyles: {
          fillColor: [248, 250, 252],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          lineWidth: 0.3,
          lineColor: [203, 213, 225],
        },
        footStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          lineWidth: 0.3,
          lineColor: [203, 213, 225],
        },
        alternateRowStyles: {
          fillColor: [253, 254, 255],
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 36, halign: 'left' },
          2: { cellWidth: 'auto', halign: 'left' },
          3: { cellWidth: 34, halign: 'center' },
          4: { cellWidth: 18, halign: 'center' },
          5: { cellWidth: 34, halign: 'right' },
          6: { cellWidth: 30, halign: 'left' },
          7: { cellWidth: 32, halign: 'left' },
        },
        didDrawPage: () => {
          const totalPages = doc.getNumberOfPages();
          const footerY = pageHeight - 6.5;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
          doc.text(
            `SmartMind POS • ${shop.name} Sales Summary (Itemized) • Period: ${dateRangeLabel}${
              generatedBy ? ` • Generated by ${generatedBy}` : ''
            }`,
            margin,
            footerY
          );
          doc.text(
            `Page ${doc.getNumberOfPages()} of ${totalPages}`,
            pageWidth - margin,
            footerY,
            { align: 'right' }
          );
        },
      });
    }
  }

  const defaultName = `Sales_Summary_${safeShopCode}_${safeRange}.pdf`;
  doc.save(fileName || defaultName);
}

export interface SuppliersReportPdfOptions {
  suppliers: Supplier[];
  itemizedRows: SupplierItemizedSupplyRow[];
  business: Business;
  shop: Shop;
  dateRangeLabel: string;
  supplierFilterLabel?: string;
  productFilterLabel?: string;
  symbol?: string;
  fileName?: string;
  generatedBy?: string;
}

/**
 * Downloads a Supplier & Product Supply Report PDF filtered by Date Range, Supplier Name, and/or Product.
 * Contains both the Supplier Summary table (Supplier Name, Total Supplies, Total Amount, Amount Paid, Remaining Balance, Date Added)
 * and the Itemized Product Supply table (Date, Supplier, Product, Unit, Qty, Cost Price, Line Total, Staff).
 */
export async function downloadSuppliersReportPdf({
  suppliers,
  itemizedRows,
  business,
  shop,
  dateRangeLabel,
  supplierFilterLabel = 'All Suppliers',
  productFilterLabel = 'All Products',
  symbol = '₦',
  fileName,
  generatedBy,
}: SuppliersReportPdfOptions): Promise<void> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 297mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 210mm
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Colors
  const primaryColor = [5, 150, 105]; // Emerald-600
  const darkSlate = [15, 23, 42]; // Slate-900
  const lightBg = [248, 250, 252]; // Slate-50
  const textMuted = [100, 116, 139]; // Slate-500
  const borderColor = [226, 232, 240]; // Slate-200

  // ----------------------------------------------------
  // 1. HEADER SECTION
  // ----------------------------------------------------
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.roundedRect(margin, y, 10, 10, 2, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('SM', margin + 2.2, y + 6.8);

  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.setFontSize(13);
  doc.text(business.legalName || business.name, margin + 13, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(
    `${shop.name} (${shop.code}) • ${shop.address}, ${shop.locationCity} • Tel: ${shop.phone}`,
    margin + 13,
    y + 10.5
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text('SUPPLIER & SUPPLY DETAILS REPORT', pageWidth - margin, y + 5.5, {
    align: 'right',
  });

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(
    `Date Period: ${dateRangeLabel}`,
    pageWidth - margin,
    y + 10.5,
    { align: 'right' }
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(
    `Supplier: ${supplierFilterLabel}   |   Product: ${productFilterLabel}`,
    pageWidth - margin,
    y + 15,
    { align: 'right' }
  );

  y += 18;

  // Divider Line
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  // ----------------------------------------------------
  // 2. SUMMARY METRICS CARDS
  // ----------------------------------------------------
  const totalSuppliersCount = suppliers.length;
  const totalSupplyBatches = suppliers.reduce((s, sup) => s + sup.totalSupplies, 0);
  const totalUnitsSupplied = itemizedRows.reduce((s, r) => s + r.quantity, 0);
  const totalSupplyAmount = suppliers.reduce((s, sup) => s + sup.totalAmount, 0);
  const totalAmountPaid = suppliers.reduce((s, sup) => s + sup.amountPaid, 0);
  const totalBalanceRemaining = suppliers.reduce(
    (s, sup) => s + sup.balanceRemaining,
    0
  );

  const cardWidth = (contentWidth - 15) / 4;
  const cardHeight = 14;

  // Card 1: Suppliers & Batches
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(margin, y, cardWidth, cardHeight, 1.5, 1.5, 'F');
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.roundedRect(margin, y, cardWidth, cardHeight, 1.5, 1.5, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('SUPPLIERS & SUPPLY BATCHES', margin + 3.5, y + 4.3);
  doc.setFontSize(10);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text(
    `${totalSuppliersCount} supplier${totalSuppliersCount === 1 ? '' : 's'} (${totalSupplyBatches} supply batch${totalSupplyBatches === 1 ? '' : 'es'})`,
    margin + 3.5,
    y + 10.2
  );

  // Card 2: Total Amount
  const card2X = margin + cardWidth + 5;
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(card2X, y, cardWidth, cardHeight, 1.5, 1.5, 'F');
  doc.roundedRect(card2X, y, cardWidth, cardHeight, 1.5, 1.5, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('TOTAL SUPPLY AMOUNT', card2X + 3.5, y + 4.3);
  doc.setFontSize(10);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text(formatPdfCurrency(totalSupplyAmount, symbol), card2X + 3.5, y + 10.2);

  // Card 3: Amount Paid
  const card3X = card2X + cardWidth + 5;
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(card3X, y, cardWidth, cardHeight, 1.5, 1.5, 'F');
  doc.roundedRect(card3X, y, cardWidth, cardHeight, 1.5, 1.5, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('TOTAL AMOUNT PAID', card3X + 3.5, y + 4.3);
  doc.setFontSize(10);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(formatPdfCurrency(totalAmountPaid, symbol), card3X + 3.5, y + 10.2);

  // Card 4: Remaining Balance
  const card4X = card3X + cardWidth + 5;
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(card4X, y, cardWidth, cardHeight, 1.5, 1.5, 'F');
  doc.roundedRect(card4X, y, cardWidth, cardHeight, 1.5, 1.5, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('REMAINING BALANCE DUE', card4X + 3.5, y + 4.3);
  doc.setFontSize(10);
  if (totalBalanceRemaining > 0) {
    doc.setTextColor(180, 83, 9); // Amber-700
  } else {
    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  }
  doc.text(
    formatPdfCurrency(totalBalanceRemaining, symbol),
    card4X + 3.5,
    y + 10.2
  );

  y += cardHeight + 6;

  const drawFooter = () => {
    const totalPages = doc.getNumberOfPages();
    const footerY = pageHeight - 6.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(
      `SmartMind POS • ${shop.name} Supplier Report • Period: ${dateRangeLabel} • Supplier: ${supplierFilterLabel} • Product: ${productFilterLabel}${
        generatedBy ? ` • Generated by ${generatedBy}` : ''
      }`,
      margin,
      footerY
    );
    doc.text(
      `Page ${doc.getNumberOfPages()} of ${totalPages}`,
      pageWidth - margin,
      footerY,
      { align: 'right' }
    );
  };

  // ----------------------------------------------------
  // 3. SECTION 1: SUPPLIER SUMMARY TABLE
  // ----------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.text('1. Supplier Directory & Balance Summary', margin, y);
  y += 2.5;

  if (suppliers.length === 0) {
    doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
    doc.roundedRect(margin, y, contentWidth, 16, 2, 2, 'F');
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.roundedRect(margin, y, contentWidth, 16, 2, 2, 'D');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(
      'No suppliers matched the selected date range, supplier name, or product filter.',
      margin + 5,
      y + 9.5
    );
    y += 22;
    drawFooter();
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: 12 },
      head: [
        [
          '#',
          'Supplier Name',
          'Contact Details',
          'Total Supplies',
          'Total Amount',
          'Amount Paid',
          'Remaining Balance',
          'Date Added',
        ],
      ],
      body: suppliers.map((sup, idx) => {
        const contactParts = [sup.phone, sup.email, sup.address].filter(Boolean);
        return [
          idx + 1,
          sup.fullName,
          contactParts.join(' • '),
          sup.totalSupplies.toLocaleString('en-US'),
          formatPdfCurrency(sup.totalAmount, symbol),
          formatPdfCurrency(sup.amountPaid, symbol),
          formatPdfCurrency(sup.balanceRemaining, symbol),
          sup.createdAt,
        ];
      }),
      foot: [
        [
          'Total',
          `${suppliers.length} Supplier${suppliers.length === 1 ? '' : 's'}`,
          '',
          totalSupplyBatches.toLocaleString('en-US'),
          formatPdfCurrency(totalSupplyAmount, symbol),
          formatPdfCurrency(totalAmountPaid, symbol),
          formatPdfCurrency(totalBalanceRemaining, symbol),
          '',
        ],
      ],
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 7.5,
        cellPadding: { top: 2.2, right: 2.5, bottom: 2.2, left: 2.5 },
        textColor: [15, 23, 42],
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [248, 250, 252],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        lineWidth: 0.3,
        lineColor: [203, 213, 225],
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        lineWidth: 0.3,
        lineColor: [203, 213, 225],
      },
      alternateRowStyles: {
        fillColor: [253, 254, 255],
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 52, halign: 'left' },
        2: { cellWidth: 'auto', halign: 'left' },
        3: { cellWidth: 24, halign: 'center' },
        4: { cellWidth: 34, halign: 'right' },
        5: { cellWidth: 34, halign: 'right' },
        6: { cellWidth: 34, halign: 'right' },
        7: { cellWidth: 32, halign: 'left' },
      },
      didDrawPage: drawFooter,
    });

    const lastAutoTable = (doc as unknown as { lastAutoTable?: { finalY?: number } })
      .lastAutoTable;
    y = (lastAutoTable?.finalY ?? y + 30) + 8;
  }

  // ----------------------------------------------------
  // 4. SECTION 2: ITEMIZED PRODUCT SUPPLIES TABLE
  // ----------------------------------------------------
  if (itemizedRows.length > 0) {
    if (y > pageHeight - 38) {
      doc.addPage();
      y = margin;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.text(
      `2. Itemized Product Supplies (${totalUnitsSupplied.toLocaleString('en-US')} total units across ${itemizedRows.length} product line${itemizedRows.length === 1 ? '' : 's'})`,
      margin,
      y
    );
    y += 2.5;

    const itemizedTotalValue = itemizedRows.reduce(
      (s, r) => s + r.lineTotal,
      0
    );

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: 12 },
      head: [
        [
          '#',
          'Supply Date',
          'Supplier Name',
          'Product Supplied',
          'SKU / Unit',
          'Qty',
          'Cost Price',
          'Line Total',
          'Recorded By',
        ],
      ],
      body: itemizedRows.map((row, idx) => [
        idx + 1,
        row.supplyDate,
        row.supplierName,
        row.productName,
        `${row.sku} (${row.unit})`,
        row.quantity.toLocaleString('en-US'),
        formatPdfCurrency(row.costPrice, symbol),
        formatPdfCurrency(row.lineTotal, symbol),
        row.recordedByName,
      ]),
      foot: [
        [
          'Total',
          '',
          '',
          `${itemizedRows.length} Product Line${itemizedRows.length === 1 ? '' : 's'}`,
          '',
          totalUnitsSupplied.toLocaleString('en-US'),
          '',
          formatPdfCurrency(itemizedTotalValue, symbol),
          '',
        ],
      ],
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 7.5,
        cellPadding: { top: 2.2, right: 2.5, bottom: 2.2, left: 2.5 },
        textColor: [15, 23, 42],
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [248, 250, 252],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        lineWidth: 0.3,
        lineColor: [203, 213, 225],
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        lineWidth: 0.3,
        lineColor: [203, 213, 225],
      },
      alternateRowStyles: {
        fillColor: [253, 254, 255],
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 32, halign: 'left' },
        2: { cellWidth: 48, halign: 'left' },
        3: { cellWidth: 'auto', halign: 'left' },
        4: { cellWidth: 30, halign: 'left' },
        5: { cellWidth: 16, halign: 'center' },
        6: { cellWidth: 30, halign: 'right' },
        7: { cellWidth: 32, halign: 'right' },
        8: { cellWidth: 28, halign: 'left' },
      },
      didDrawPage: drawFooter,
    });
  }

  const safeShopCode = shop.code.replace(/[^a-zA-Z0-9]/g, '_');
  const safeSupplier =
    supplierFilterLabel === 'All Suppliers'
      ? 'All_Suppliers'
      : supplierFilterLabel.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 24);
  const safeProduct =
    productFilterLabel === 'All Products'
      ? ''
      : `_${productFilterLabel.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)}`;
  const safeRange = dateRangeLabel.replace(/[^a-zA-Z0-9]/g, '_');
  const defaultName = `Supplier_Report_${safeShopCode}_${safeSupplier}${safeProduct}_${safeRange}.pdf`;
  doc.save(fileName || defaultName);
}

export interface DebtBookReportPdfOptions {
  business: Business;
  shop: Shop;
  customers: DebtCustomer[];
  transactions: DebtTransaction[];
  reportType?: 'customers' | 'transactions' | 'statement';
  selectedCustomer?: DebtCustomer | null;
  symbol?: string;
  generatedBy?: string;
  filterLabel?: string;
  fileName?: string;
}

/**
 * Downloads a high-fidelity vector PDF for the Debt Book:
 * - 'customers': Customer Balances & Credit Limits Summary
 * - 'transactions': Complete Credit & Deposit Transactions Ledger
 * - 'statement': Detailed Statement of Account for an individual customer
 */
export async function downloadDebtBookReportPdf({
  business,
  shop,
  customers,
  transactions,
  reportType = 'customers',
  selectedCustomer = null,
  symbol = '₦',
  generatedBy,
  filterLabel,
  fileName,
}: DebtBookReportPdfOptions): Promise<void> {
  const isStatement = reportType === 'statement' && !!selectedCustomer;
  const isTransactions = reportType === 'transactions';

  const doc = new jsPDF({
    orientation: isStatement ? 'portrait' : 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Colors
  const primaryColor = [5, 150, 105]; // Emerald-600
  const darkSlate = [15, 23, 42]; // Slate-900
  const lightBg = [248, 250, 252]; // Slate-50
  const textMuted = [100, 116, 139]; // Slate-500
  const borderColor = [226, 232, 240]; // Slate-200

  // ----------------------------------------------------
  // 1. HEADER SECTION
  // ----------------------------------------------------
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.roundedRect(margin, y, 10, 10, 2, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('SM', margin + 2.2, y + 6.8);

  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
  doc.setFontSize(13);
  doc.text(business.legalName || business.name, margin + 13, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(
    `${shop.name} (${shop.code}) • ${shop.address}, ${shop.locationCity} • Tel: ${shop.phone}`,
    margin + 13,
    y + 10.5
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isStatement ? 13 : 15);
  doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);

  const reportTitle = isStatement
    ? 'STATEMENT OF ACCOUNT'
    : isTransactions
    ? 'DEBT TRANSACTIONS LEDGER'
    : 'CUSTOMER DEBT BALANCES REPORT';

  doc.text(reportTitle, pageWidth - margin, y + 5.5, { align: 'right' });

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  const todayLabel = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  doc.text(`Generated: ${todayLabel}`, pageWidth - margin, y + 10.5, {
    align: 'right',
  });

  if (filterLabel || isStatement) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    const filterSub = isStatement
      ? `Customer: ${selectedCustomer!.fullName} (${selectedCustomer!.phone})`
      : `Filter: ${filterLabel || 'All Records'}`;
    doc.text(filterSub, pageWidth - margin, y + 15, { align: 'right' });
  }

  y += 18;

  // Divider Line
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  const drawFooter = () => {
    const totalPages = doc.getNumberOfPages();
    const footerY = pageHeight - 6.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    const footerLabel = isStatement
      ? `Customer: ${selectedCustomer!.fullName}`
      : `Shop: ${shop.name}`;
    doc.text(
      `SmartMind POS • Debt Book • ${footerLabel}${
        generatedBy ? ` • Generated by ${generatedBy}` : ''
      }`,
      margin,
      footerY
    );
    doc.text(
      `Page ${doc.getNumberOfPages()} of ${totalPages}`,
      pageWidth - margin,
      footerY,
      { align: 'right' }
    );
  };

  // ----------------------------------------------------
  // 2. METRIC CARDS OR CUSTOMER PROFILE
  // ----------------------------------------------------
  if (isStatement && selectedCustomer) {
    // Statement Customer Card
    doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
    doc.roundedRect(margin, y, contentWidth, 22, 2, 2, 'F');
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.roundedRect(margin, y, contentWidth, 22, 2, 2, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
    doc.text(selectedCustomer.fullName, margin + 4, y + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(`Phone: ${selectedCustomer.phone}`, margin + 4, y + 11.5);
    if (selectedCustomer.notes) {
      doc.text(`Notes: ${selectedCustomer.notes}`, margin + 4, y + 16.5);
    }

    // Right side numbers
    const colRight = pageWidth - margin - 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('OUTSTANDING BALANCE DUE', colRight, y + 6, { align: 'right' });

    doc.setFontSize(12);
    doc.setTextColor(
      selectedCustomer.balanceRemaining > 0 ? 225 : 5,
      selectedCustomer.balanceRemaining > 0 ? 29 : 150,
      selectedCustomer.balanceRemaining > 0 ? 72 : 105
    );
    doc.text(
      formatPdfCurrency(selectedCustomer.balanceRemaining, symbol),
      colRight,
      y + 12,
      { align: 'right' }
    );

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(
      `Total Credit: ${formatPdfCurrency(
        selectedCustomer.totalCredit,
        symbol
      )}  |  Total Paid: ${formatPdfCurrency(
        selectedCustomer.amountPaid,
        symbol
      )}`,
      colRight,
      y + 17,
      { align: 'right' }
    );

    y += 28;
  } else if (!isTransactions) {
    // Customers Summary Cards
    const totalCredit = customers.reduce((s, c) => s + c.totalCredit, 0);
    const totalPaid = customers.reduce((s, c) => s + c.amountPaid, 0);
    const totalBalance = customers.reduce((s, c) => s + c.balanceRemaining, 0);
    const debtorsCount = customers.filter((c) => c.balanceRemaining > 0).length;

    const cardWidth = (contentWidth - 15) / 4;
    const cardHeight = 14;

    const renderCard = (
      x: number,
      title: string,
      mainText: string,
      subText: string,
      accentColor?: number[]
    ) => {
      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
      doc.roundedRect(x, y, cardWidth, cardHeight, 1.5, 1.5, 'F');
      doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      doc.roundedRect(x, y, cardWidth, cardHeight, 1.5, 1.5, 'D');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
      doc.text(title, x + 3.5, y + 4.3);

      doc.setFontSize(10);
      if (accentColor) {
        doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
      } else {
        doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      }
      doc.text(mainText, x + 3.5, y + 9);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
      doc.text(subText, x + 3.5, y + 12.3);
    };

    renderCard(
      margin,
      'TOTAL CREDIT ISSUED',
      formatPdfCurrency(totalCredit, symbol),
      `Across ${customers.length} customer records`
    );
    renderCard(
      margin + cardWidth + 5,
      'TOTAL DEPOSITS PAID',
      formatPdfCurrency(totalPaid, symbol),
      'Customer repayments & deposits',
      [5, 150, 105]
    );
    renderCard(
      margin + (cardWidth + 5) * 2,
      'TOTAL BALANCE REMAINING',
      formatPdfCurrency(totalBalance, symbol),
      `${debtorsCount} customer${debtorsCount === 1 ? '' : 's'} with active debt`,
      [225, 29, 72]
    );
    renderCard(
      margin + (cardWidth + 5) * 3,
      'REGISTERED CUSTOMERS',
      `${customers.length} Customers`,
      `${customers.filter((c) => c.creditLimitEnabled).length} with credit limits`
    );

    y += cardHeight + 6;
  } else {
    // Transactions Summary Cards
    const creditTxs = transactions.filter((t) => t.type === 'credit');
    const depositTxs = transactions.filter((t) => t.type === 'deposit');
    const totalCreditAmount = creditTxs.reduce((s, t) => s + t.amount, 0);
    const totalDepositAmount = depositTxs.reduce((s, t) => s + t.amount, 0);
    const netDifference = totalCreditAmount - totalDepositAmount;

    const cardWidth = (contentWidth - 10) / 3;
    const cardHeight = 14;

    const renderCard = (
      x: number,
      title: string,
      mainText: string,
      subText: string,
      accentColor?: number[]
    ) => {
      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
      doc.roundedRect(x, y, cardWidth, cardHeight, 1.5, 1.5, 'F');
      doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      doc.roundedRect(x, y, cardWidth, cardHeight, 1.5, 1.5, 'D');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
      doc.text(title, x + 3.5, y + 4.3);

      doc.setFontSize(10);
      if (accentColor) {
        doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
      } else {
        doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
      }
      doc.text(mainText, x + 3.5, y + 9);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
      doc.text(subText, x + 3.5, y + 12.3);
    };

    renderCard(
      margin,
      'TOTAL CREDIT PURCHASES',
      formatPdfCurrency(totalCreditAmount, symbol),
      `${creditTxs.length} credit transactions`
    );
    renderCard(
      margin + cardWidth + 5,
      'TOTAL DEPOSITS & REPAYMENTS',
      formatPdfCurrency(totalDepositAmount, symbol),
      `${depositTxs.length} deposit transactions`,
      [5, 150, 105]
    );
    renderCard(
      margin + (cardWidth + 5) * 2,
      'NET OUTSTANDING CHANGE',
      formatPdfCurrency(netDifference, symbol),
      netDifference >= 0 ? 'Net increase in debt' : 'Net reduction in debt',
      netDifference > 0 ? [225, 29, 72] : [5, 150, 105]
    );

    y += cardHeight + 6;
  }

  // ----------------------------------------------------
  // 3. TABLES SECTION
  // ----------------------------------------------------
  if (isStatement && selectedCustomer) {
    const custTxs = [...transactions]
      .filter((t) => t.customerId === selectedCustomer.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    let runningBal = 0;
    const bodyRows = custTxs.map((tx, idx) => {
      const isCredit = tx.type === 'credit';
      if (isCredit) {
        runningBal += tx.amount;
      } else {
        runningBal -= tx.amount;
      }
      return [
        idx + 1,
        tx.createdAt,
        tx.reference,
        isCredit ? 'Credit Purchase' : 'Deposit / Payment',
        isCredit ? formatPdfCurrency(tx.amount, symbol) : '—',
        !isCredit ? formatPdfCurrency(tx.amount, symbol) : '—',
        formatPdfCurrency(runningBal, symbol),
        tx.paymentMethod ? formatPaymentMethodLabel(tx.paymentMethod) : '—',
        tx.recordedByName || 'Staff',
      ];
    });

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: 12 },
      head: [
        [
          '#',
          'Date & Time',
          'Reference',
          'Description',
          'Credit (Debt)',
          'Payment (Deposit)',
          'Balance',
          'Method',
          'Recorded By',
        ],
      ],
      body: bodyRows,
      foot: [
        [
          'Total',
          `${custTxs.length} Transactions`,
          '',
          '',
          formatPdfCurrency(selectedCustomer.totalCredit, symbol),
          formatPdfCurrency(selectedCustomer.amountPaid, symbol),
          formatPdfCurrency(selectedCustomer.balanceRemaining, symbol),
          '',
          '',
        ],
      ],
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 7.5,
        cellPadding: { top: 2.2, right: 2.5, bottom: 2.2, left: 2.5 },
        textColor: [15, 23, 42],
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [248, 250, 252],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        lineWidth: 0.3,
        lineColor: [203, 213, 225],
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        lineWidth: 0.3,
        lineColor: [203, 213, 225],
      },
      alternateRowStyles: {
        fillColor: [253, 254, 255],
      },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 26, halign: 'left' },
        2: { cellWidth: 22, halign: 'left' },
        3: { cellWidth: 26, halign: 'left' },
        4: { cellWidth: 20, halign: 'right' },
        5: { cellWidth: 20, halign: 'right' },
        6: { cellWidth: 22, halign: 'right' },
        7: { cellWidth: 16, halign: 'center' },
        8: { cellWidth: 'auto', halign: 'left' },
      },
      didDrawPage: drawFooter,
    });
  } else if (!isTransactions) {
    // Customers Summary Table
    const totalCredit = customers.reduce((s, c) => s + c.totalCredit, 0);
    const totalPaid = customers.reduce((s, c) => s + c.amountPaid, 0);
    const totalBalance = customers.reduce((s, c) => s + c.balanceRemaining, 0);

    const bodyRows = customers.map((c, idx) => {
      const isSettled = c.balanceRemaining <= 0;
      const isOverLimit =
        c.creditLimitEnabled &&
        c.creditLimitAmount > 0 &&
        c.balanceRemaining > c.creditLimitAmount;
      const statusLabel = isSettled
        ? 'Settled'
        : isOverLimit
        ? 'Over Limit'
        : 'Active Balance';

      return [
        idx + 1,
        c.fullName,
        c.phone,
        c.creditLimitEnabled && c.creditLimitAmount > 0
          ? formatPdfCurrency(c.creditLimitAmount, symbol)
          : 'No Limit',
        formatPdfCurrency(c.totalCredit, symbol),
        formatPdfCurrency(c.amountPaid, symbol),
        formatPdfCurrency(c.balanceRemaining, symbol),
        statusLabel,
        c.notes || '—',
      ];
    });

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: 12 },
      head: [
        [
          '#',
          'Customer Name',
          'Phone Number',
          'Credit Limit',
          'Total Credit',
          'Amount Paid',
          'Balance Remaining',
          'Account Status',
          'Notes',
        ],
      ],
      body: bodyRows,
      foot: [
        [
          'Total',
          `${customers.length} Customers`,
          '',
          '',
          formatPdfCurrency(totalCredit, symbol),
          formatPdfCurrency(totalPaid, symbol),
          formatPdfCurrency(totalBalance, symbol),
          '',
          '',
        ],
      ],
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 7.5,
        cellPadding: { top: 2.2, right: 2.5, bottom: 2.2, left: 2.5 },
        textColor: [15, 23, 42],
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [248, 250, 252],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        lineWidth: 0.3,
        lineColor: [203, 213, 225],
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        lineWidth: 0.3,
        lineColor: [203, 213, 225],
      },
      alternateRowStyles: {
        fillColor: [253, 254, 255],
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 48, halign: 'left' },
        2: { cellWidth: 28, halign: 'left' },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 32, halign: 'right' },
        5: { cellWidth: 32, halign: 'right' },
        6: { cellWidth: 34, halign: 'right' },
        7: { cellWidth: 26, halign: 'center' },
        8: { cellWidth: 'auto', halign: 'left' },
      },
      didDrawPage: drawFooter,
    });
  } else {
    // Transactions Ledger Table
    const totalCreditAmount = transactions
      .filter((t) => t.type === 'credit')
      .reduce((s, t) => s + t.amount, 0);
    const totalDepositAmount = transactions
      .filter((t) => t.type === 'deposit')
      .reduce((s, t) => s + t.amount, 0);

    const bodyRows = transactions.map((tx, idx) => [
      idx + 1,
      tx.createdAt,
      tx.reference,
      tx.customerName,
      tx.customerPhone,
      tx.type === 'credit' ? 'Credit' : 'Deposit',
      formatPdfCurrency(tx.amount, symbol),
      tx.paymentMethod ? formatPaymentMethodLabel(tx.paymentMethod) : 'Credit',
      tx.recordedByName || 'Staff',
      tx.notes || '—',
    ]);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: 12 },
      head: [
        [
          '#',
          'Date & Time',
          'Reference',
          'Customer Name',
          'Phone',
          'Type',
          'Amount',
          'Payment Method',
          'Staff',
          'Notes',
        ],
      ],
      body: bodyRows,
      foot: [
        [
          'Total',
          `${transactions.length} Records`,
          '',
          '',
          '',
          '',
          `Credit: ${formatPdfCurrency(
            totalCreditAmount,
            symbol
          )} | Deposit: ${formatPdfCurrency(totalDepositAmount, symbol)}`,
          '',
          '',
          '',
        ],
      ],
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 7.5,
        cellPadding: { top: 2.2, right: 2.5, bottom: 2.2, left: 2.5 },
        textColor: [15, 23, 42],
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [248, 250, 252],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        lineWidth: 0.3,
        lineColor: [203, 213, 225],
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: 'bold',
        lineWidth: 0.3,
        lineColor: [203, 213, 225],
      },
      alternateRowStyles: {
        fillColor: [253, 254, 255],
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 32, halign: 'left' },
        2: { cellWidth: 26, halign: 'left' },
        3: { cellWidth: 38, halign: 'left' },
        4: { cellWidth: 26, halign: 'left' },
        5: { cellWidth: 18, halign: 'center' },
        6: { cellWidth: 26, halign: 'right' },
        7: { cellWidth: 24, halign: 'center' },
        8: { cellWidth: 26, halign: 'left' },
        9: { cellWidth: 'auto', halign: 'left' },
      },
      didDrawPage: drawFooter,
    });
  }

  const safeShopCode = shop.code.replace(/[^a-zA-Z0-9]/g, '_');
  const safeDate = new Date().toISOString().slice(0, 10);
  const defaultDocName = isStatement
    ? `Debt_Statement_${safeShopCode}_${selectedCustomer!.fullName.replace(/[^a-zA-Z0-9]/g, '_')}_${safeDate}.pdf`
    : isTransactions
    ? `Debt_Transactions_${safeShopCode}_${safeDate}.pdf`
    : `Debt_Customer_Balances_${safeShopCode}_${safeDate}.pdf`;

  doc.save(fileName || defaultDocName);
}

