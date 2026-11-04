import { Product, ProductCategory, UnitOfMeasurement } from '../types/pos';
import { escapeCsvCell } from './csvGenerator';

export interface ParsedInventoryItem {
  rowNumber: number;
  name: string;
  sku: string;
  barcode: string;
  categoryName: string;
  unit: string;
  sellingPrice: number;
  costPrice: number;
  stockQuantity: number;
  reorderLevel: number;
  taxExempt: boolean;
  isActive: boolean;
  isExisting: boolean;
  existingProductId?: string;
}

export interface CsvRowError {
  rowNumber: number;
  productName: string;
  reason: string;
}

export interface InventoryCsvParseResult {
  totalRows: number;
  validItems: ParsedInventoryItem[];
  errors: CsvRowError[];
  newCategoriesToCreate: string[];
  newUnitsToCreate: string[];
}

/**
 * Standard CSV Headers for Bulk Inventory Imports (SKU excluded so system auto-generates it)
 */
export const INVENTORY_CSV_HEADERS = [
  'Product Name',
  'Barcode',
  'Category',
  'Unit',
  'Selling Price',
  'Cost Price',
  'Stock Quantity',
  'Reorder Level',
  'Tax Exempt',
  'Active',
];

/**
 * Generates the official UTF-8 pre-formatted CSV template string
 * containing headers (without SKU) and realistic sample rows for customers to fill out.
 */
export function generateInventoryCsvTemplateString(): string {
  const sampleRows = [
    [
      'Golden Penny Sugar 500g',
      '613000492811',
      'Groceries & Baking',
      'Pack',
      '1200',
      '950',
      '50',
      '10',
      'No',
      'Yes',
    ],
    [
      'Milo Refill 800g',
      '613000994822',
      'Beverages & Drinks',
      'Pack',
      '3800',
      '3200',
      '30',
      '5',
      'No',
      'Yes',
    ],
    [
      'Peak Milk Powder 350g',
      '613000118277',
      'Beverages & Drinks',
      'Can',
      '2400',
      '1950',
      '40',
      '8',
      'No',
      'Yes',
    ],
    [
      'Dangote Refined Salt 1kg',
      '613000339100',
      'Groceries & Baking',
      'Kg',
      '600',
      '450',
      '100',
      '15',
      'No',
      'Yes',
    ],
    [
      'Eve Dishwashing Liquid 750ml',
      '613000552911',
      'Household & Cleaning',
      'Bottle',
      '1500',
      '1150',
      '25',
      '5',
      'No',
      'Yes',
    ],
  ];

  const csvLines = [
    INVENTORY_CSV_HEADERS.map(escapeCsvCell).join(','),
    ...sampleRows.map((row) => row.map(escapeCsvCell).join(',')),
  ];

  // Prepend UTF-8 BOM (\uFEFF) so Excel, Google Sheets, Numbers open Unicode characters smoothly
  return '\uFEFF' + csvLines.join('\r\n');
}

/**
 * Triggers a browser download of the official Inventory CSV Template file.
 */
export function downloadInventoryCsvTemplate(fileName?: string): void {
  const csvContent = generateInventoryCsvTemplateString();
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.setAttribute('href', url);
  link.setAttribute(
    'download',
    fileName || 'SmartMind_POS_Inventory_Import_Template.csv'
  );
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Sanitizes currency & numeric strings like "₦1,500.00", "$2,000", "1,200"
 */
function parseCleanNumber(val: string | undefined, defaultVal = 0): number {
  if (!val) return defaultVal;
  const clean = val.replace(/[^0-9.-]+/g, '');
  const parsed = parseFloat(clean);
  return Number.isNaN(parsed) ? defaultVal : parsed;
}

/**
 * Cleanly parses barcode values, stripping any decimals (e.g. "613000492811.0" -> "613000492811"),
 * scientific notation (e.g. "6.13E+11" -> "613000000000"), or floating points so barcodes are whole numbers.
 */
export function parseCleanBarcode(val: string | undefined): string {
  if (!val) return '';
  let clean = val.trim();
  if (!clean) return '';

  // Handle scientific notation e.g. 6.13000492811e+11 or 6.13E11 exported by Excel
  if (/^[0-9.]+[eE]\+?[0-9]+$/.test(clean)) {
    const num = Number(clean);
    if (!Number.isNaN(num) && Number.isFinite(num)) {
      clean = BigInt(Math.round(num)).toString();
    }
  }

  // Strip floating point decimals like "613000492811.0" or "613000492811.00"
  if (clean.includes('.')) {
    const parts = clean.split('.');
    clean = parts[0];
  }

  return clean.replace(/[^a-zA-Z0-9-]/g, '').trim();
}

/**
 * Simple CSV Line Splitter supporting quoted values with commas
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += char;
    }
  }
  result.push(cur.trim());
  return result;
}

/**
 * Generates a smart, clean SKU based on product name words or abbreviation
 */
export function generateSmartSkuForProductName(productName: string, counter: number): string {
  const words = productName
    .trim()
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);

  let prefix = words.map((w) => w[0]?.toUpperCase()).join('').slice(0, 4);
  if (prefix.length < 2) {
    prefix = productName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) || 'SKU';
  }
  return `${prefix}-${counter}`;
}

/**
 * Parses uploaded CSV content, validates rows, automatically generates SKUs if omitted,
 * detects new categories/units needing creation, and checks for duplicates.
 */
export function parseInventoryCsvString(
  csvText: string,
  existingProducts: Product[] = [],
  existingCategories: ProductCategory[] = [],
  existingUnits: UnitOfMeasurement[] = []
): InventoryCsvParseResult {
  const cleanText = csvText.replace(/^\uFEFF/, '').trim();
  if (!cleanText) {
    return {
      totalRows: 0,
      validItems: [],
      errors: [
        { rowNumber: 0, productName: 'N/A', reason: 'The uploaded file is empty.' },
      ],
      newCategoriesToCreate: [],
      newUnitsToCreate: [],
    };
  }

  const lines = cleanText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return {
      totalRows: 0,
      validItems: [],
      errors: [
        {
          rowNumber: 0,
          productName: 'N/A',
          reason: 'CSV file must contain a header row and at least one data row.',
        },
      ],
      newCategoriesToCreate: [],
      newUnitsToCreate: [],
    };
  }

  const headerLine = lines[0];
  const headerCols = parseCsvLine(headerLine).map((col) =>
    col.toLowerCase().replace(/[^a-z0-9]/g, '')
  );

  // Helper index lookups with flexible header aliases
  const findColIndex = (aliases: string[]): number => {
    return headerCols.findIndex((col) =>
      aliases.some((alias) => col === alias.toLowerCase().replace(/[^a-z0-9]/g, ''))
    );
  };

  const nameIdx = findColIndex(['productname', 'name', 'itemname', 'product', 'title', 'item']);
  const skuIdx = findColIndex(['sku', 'code', 'productcode', 'itemcode', 'stockkeepingunit']);
  const barcodeIdx = findColIndex(['barcode', 'upc', 'ean', 'qrcode']);
  const categoryIdx = findColIndex(['category', 'categoryname', 'productcategory', 'department', 'dept']);
  const unitIdx = findColIndex(['unit', 'unitofmeasurement', 'uom', 'pack', 'measurement']);
  const sellingPriceIdx = findColIndex(['sellingprice', 'price', 'unitprice', 'retailprice', 'rate', 'amount']);
  const costPriceIdx = findColIndex(['costprice', 'cost', 'buyprice', 'purchaseprice']);
  const stockQtyIdx = findColIndex(['stockquantity', 'stock', 'qty', 'quantity', 'initialstock', 'openingstock']);
  const reorderIdx = findColIndex(['reorderlevel', 'minstock', 'minimumstock', 'alertlevel']);
  const taxIdx = findColIndex(['taxexempt', 'taxable', 'vat']);
  const activeIdx = findColIndex(['active', 'status', 'isactive']);

  if (nameIdx === -1) {
    return {
      totalRows: lines.length - 1,
      validItems: [],
      errors: [
        {
          rowNumber: 1,
          productName: 'Header Row',
          reason:
            'Could not find a "Product Name" column header in the uploaded CSV file.',
        },
      ],
      newCategoriesToCreate: [],
      newUnitsToCreate: [],
    };
  }

  const existingSkusMap = new Map<string, Product>();
  const existingNamesMap = new Map<string, Product>();
  existingProducts.forEach((p) => {
    if (p.sku) existingSkusMap.set(p.sku.trim().toLowerCase(), p);
    if (p.name) existingNamesMap.set(p.name.trim().toLowerCase(), p);
  });

  const existingCatNamesSet = new Set(
    existingCategories.map((c) => c.name.trim().toLowerCase())
  );
  const existingUnitNamesSet = new Set(
    existingUnits.map((u) => u.name.trim().toLowerCase())
  );

  const validItems: ParsedInventoryItem[] = [];
  const errors: CsvRowError[] = [];
  const newCatNamesSet = new Set<string>();
  const newUnitNamesSet = new Set<string>();

  const dataLines = lines.slice(1);
  let autoSkuCounter = 1001;

  dataLines.forEach((line, idx) => {
    const rowNum = idx + 2; // 1-based index (Header is row 1)
    const cols = parseCsvLine(line);

    const rawName = nameIdx !== -1 ? cols[nameIdx] || '' : '';
    const name = rawName.trim();

    if (!name) {
      errors.push({
        rowNumber: rowNum,
        productName: 'Empty Row',
        reason: 'Product name is missing or blank.',
      });
      return;
    }

    const rawSellingPrice = sellingPriceIdx !== -1 ? cols[sellingPriceIdx] : '';
    const sellingPrice = parseCleanNumber(rawSellingPrice, -1);

    if (sellingPrice < 0) {
      errors.push({
        rowNumber: rowNum,
        productName: name,
        reason: `Invalid or missing Selling Price ("${rawSellingPrice}"). Selling price must be a valid positive number.`,
      });
      return;
    }

    let rawSku = skuIdx !== -1 ? (cols[skuIdx] || '').trim() : '';
    if (!rawSku) {
      // Auto-generate clean, smart SKU from product name abbreviation
      rawSku = generateSmartSkuForProductName(name, autoSkuCounter++);
    }

    const rawBarcodeVal = barcodeIdx !== -1 ? cols[barcodeIdx] : '';
    const barcode = parseCleanBarcode(rawBarcodeVal) || rawSku;
    const rawCategory = categoryIdx !== -1 ? (cols[categoryIdx] || '').trim() : 'General';
    const categoryName = rawCategory || 'General';

    const rawUnit = unitIdx !== -1 ? (cols[unitIdx] || '').trim() : 'Pack';
    const unit = rawUnit || 'Pack';

    const costPrice = costPriceIdx !== -1 ? parseCleanNumber(cols[costPriceIdx], 0) : 0;
    const stockQuantity =
      stockQtyIdx !== -1 ? Math.max(0, Math.floor(parseCleanNumber(cols[stockQtyIdx], 0))) : 0;
    const reorderLevel =
      reorderIdx !== -1 ? Math.max(0, Math.floor(parseCleanNumber(cols[reorderIdx], 5))) : 5;

    const rawTax = taxIdx !== -1 ? (cols[taxIdx] || '').trim().toLowerCase() : '';
    const taxExempt = rawTax === 'yes' || rawTax === 'true' || rawTax === '1';

    const rawActive = activeIdx !== -1 ? (cols[activeIdx] || '').trim().toLowerCase() : '';
    const isActive =
      rawActive === '' ||
      rawActive === 'yes' ||
      rawActive === 'true' ||
      rawActive === '1' ||
      rawActive === 'active';

    // Track missing categories & units for auto-creation
    if (!existingCatNamesSet.has(categoryName.toLowerCase())) {
      newCatNamesSet.add(categoryName);
    }
    if (!existingUnitNamesSet.has(unit.toLowerCase())) {
      newUnitNamesSet.add(unit);
    }

    const existingMatch =
      existingSkusMap.get(rawSku.toLowerCase()) ||
      existingNamesMap.get(name.toLowerCase());

    validItems.push({
      rowNumber: rowNum,
      name,
      sku: rawSku,
      barcode,
      categoryName,
      unit,
      sellingPrice,
      costPrice,
      stockQuantity,
      reorderLevel,
      taxExempt,
      isActive,
      isExisting: Boolean(existingMatch),
      existingProductId: existingMatch?.id,
    });
  });

  return {
    totalRows: dataLines.length,
    validItems,
    errors,
    newCategoriesToCreate: Array.from(newCatNamesSet),
    newUnitsToCreate: Array.from(newUnitNamesSet),
  };
}
