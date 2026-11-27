import React, { useState, useMemo } from 'react';
import {
  Barcode,
  Search,
  Sparkles,
  Printer,
  Download,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  CheckSquare,
  Square,
} from 'lucide-react';
import { Business, Product, Shop } from '../types/pos';
import { ProductFormInput } from '../utils/posCalculations';
import {
  buildCode128SvgMarkup,
  generateUniqueShopBarcode,
  isProductMissingBarcode,
} from '../utils/barcodeGenerator';

interface GenerateBarcodePageProps {
  business: Business;
  shop: Shop;
  shopProducts: Product[];
  onSaveProduct: (input: ProductFormInput, editingProductId?: string) => void;
}

function escapeHtml(value: string): string {
  return (value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toProductFormInput(product: Product, newBarcode: string): ProductFormInput {
  return {
    categoryId: product.categoryId,
    sku: product.sku,
    barcode: newBarcode,
    name: product.name,
    unit: product.unit,
    costPrice: product.costPrice,
    sellingPrice: product.sellingPrice,
    stockQuantity: product.stockQuantity,
    reorderLevel: product.reorderLevel,
    hasExpiry: Boolean(product.hasExpiry),
    expiryDate: product.expiryDate || undefined,
  };
}

export const GenerateBarcodePage: React.FC<GenerateBarcodePageProps> = ({
  business,
  shop,
  shopProducts,
  onSaveProduct,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'missing' | 'all'>('missing');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [banner, setBanner] = useState<{
    type: 'success' | 'info';
    message: string;
  } | null>(null);

  // Label Print Modal State
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printItems, setPrintItems] = useState<
    Array<{ id: string; label: string; barcode: string; copies: number }>
  >([]);
  const [labelPaperFormat, setLabelPaperFormat] = useState<
    'thermal_80mm' | 'thermal_58mm' | 'a4_grid'
  >('thermal_80mm');

  // Standalone / Unregistered Stock Barcodes State
  const [blankCount, setBlankCount] = useState<number>(5);
  const [blankCopiesEach, setBlankCopiesEach] = useState<number>(1);
  const [generatedBlanks, setGeneratedBlanks] = useState<string[]>([]);

  const activeProducts = useMemo(
    () => shopProducts.filter((p) => p.isActive !== false),
    [shopProducts]
  );

  const missingBarcodeProducts = useMemo(
    () => activeProducts.filter((p) => isProductMissingBarcode(p)),
    [activeProducts]
  );

  const existingBarcodeSet = useMemo(() => {
    const set = new Set<string>();
    for (const p of shopProducts) {
      if (p.barcode && p.barcode.trim()) {
        set.add(p.barcode.trim());
      }
    }
    return set;
  }, [shopProducts]);

  const filteredProducts = useMemo(() => {
    const source = filterTab === 'missing' ? missingBarcodeProducts : activeProducts;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return source;
    return source.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q) ||
        (p.categoryName || '').toLowerCase().includes(q)
    );
  }, [filterTab, missingBarcodeProducts, activeProducts, searchQuery]);

  const handleGenerateSingle = (product: Product) => {
    const newBarcode = generateUniqueShopBarcode(existingBarcodeSet);
    onSaveProduct(toProductFormInput(product, newBarcode), product.id);
    setBanner({
      type: 'success',
      message: `Generated scannable barcode "${newBarcode}" for "${product.name}".`,
    });
  };

  const handleGenerateAllMissing = () => {
    if (missingBarcodeProducts.length === 0) return;
    const workingSet = new Set(existingBarcodeSet);
    let count = 0;
    for (const product of missingBarcodeProducts) {
      const code = generateUniqueShopBarcode(workingSet);
      workingSet.add(code);
      onSaveProduct(toProductFormInput(product, code), product.id);
      count++;
    }
    setBanner({
      type: 'success',
      message: `Generated and saved ${count} unique barcode${count === 1 ? '' : 's'} for items in ${shop.name}.`,
    });
  };

  const toggleSelect = (productId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    const visibleWithBarcode = filteredProducts.filter((p) => (p.barcode || '').trim().length > 0);
    if (
      visibleWithBarcode.length > 0 &&
      visibleWithBarcode.every((p) => selectedIds.has(p.id))
    ) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleWithBarcode.map((p) => p.id)));
    }
  };

  const openSinglePrintModal = (product: Product) => {
    setPrintItems([
      {
        id: product.id,
        label: product.name,
        barcode: (product.barcode || '').trim(),
        copies: 1,
      },
    ]);
    setPrintModalOpen(true);
  };

  const openBulkPrintModal = () => {
    const items = activeProducts
      .filter((p) => selectedIds.has(p.id) && (p.barcode || '').trim().length > 0)
      .map((p) => ({
        id: p.id,
        label: p.name,
        barcode: (p.barcode || '').trim(),
        copies: 1,
      }));
    if (items.length === 0) return;
    setPrintItems(items);
    setPrintModalOpen(true);
  };

  const handleGenerateStandaloneBlanks = () => {
    const qty = Math.max(1, Math.min(100, Number(blankCount) || 1));
    const workingSet = new Set(existingBarcodeSet);
    for (const existingBlank of generatedBlanks) {
      workingSet.add(existingBlank);
    }
    const created: string[] = [];
    for (let i = 0; i < qty; i++) {
      const code = generateUniqueShopBarcode(workingSet);
      workingSet.add(code);
      created.push(code);
    }
    setGeneratedBlanks(created);
    setBanner({
      type: 'success',
      message: `Generated ${created.length} unique standalone barcode${created.length === 1 ? '' : 's'} ready to print and paste on new items before adding them to inventory.`,
    });
  };

  const openBlankPrintModal = (codes: string[], copiesOverride?: number) => {
    const items = codes.map((code, idx) => ({
      id: `blank-${code}-${idx}`,
      label: `Pre-Print Label #${idx + 1}`,
      barcode: code,
      copies: copiesOverride ?? Math.max(1, Math.min(100, blankCopiesEach || 1)),
    }));
    if (items.length === 0) return;
    setPrintItems(items);
    setPrintModalOpen(true);
  };

  const handleDownloadSvg = (codeInput: string) => {
    const code = (codeInput || '').trim();
    if (!code) return;
    const svgBody = buildCode128SvgMarkup(code, { height: 70, moduleWidth: 2 });
    const fullSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="110" viewBox="0 0 320 110" style="background:#ffffff;">
  <rect width="320" height="110" fill="#ffffff" />
  <g transform="translate(20, 14)">
    ${svgBody.replace(/width="100%"/, 'width="280"')}
  </g>
  <text x="160" y="98" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#000000" text-anchor="middle">${escapeHtml(code)}</text>
</svg>`;
    const blob = new Blob([fullSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `barcode-${code}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const executePrintLabels = () => {
    const labelsHtml: string[] = [];
    for (const { barcode, copies } of printItems) {
      const code = (barcode || '').trim();
      if (!code) continue;
      const svg = buildCode128SvgMarkup(code, {
        height: labelPaperFormat === 'thermal_58mm' ? 46 : 56,
        moduleWidth: 2,
      });
      for (let c = 0; c < Math.max(1, Math.min(100, copies)); c++) {
        labelsHtml.push(`
          <div class="label-card">
            <div class="barcode-wrap">${svg}</div>
            <div class="barcode-num">${escapeHtml(code)}</div>
          </div>
        `);
      }
    }

    if (labelsHtml.length === 0) return;

    const isA4 = labelPaperFormat === 'a4_grid';
    const rollWidth = labelPaperFormat === 'thermal_58mm' ? '48mm' : '72mm';

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Barcode Labels — ${escapeHtml(shop.name)}</title>
  <style>
    @page {
      margin: ${isA4 ? '8mm' : '2mm'};
      size: ${isA4 ? 'A4 portrait' : 'auto'};
    }
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: Arial, 'Segoe UI', Tahoma, sans-serif;
      -webkit-print-color-adjust: exact;
    }
    .grid {
      ${
        isA4
          ? 'display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;'
          : `width: ${rollWidth}; margin: 0 auto; display: flex; flex-direction: column; gap: 8px;`
      }
    }
    .label-card {
      border: 1px dashed #000000;
      padding: 6px 8px;
      text-align: center;
      background: #ffffff;
      page-break-inside: avoid;
    }
    .product-name {
      font-size: ${labelPaperFormat === 'thermal_58mm' ? '11px' : '12px'};
      font-weight: 700;
      color: #000000;
      margin-bottom: 4px;
      word-break: break-word;
    }
    .barcode-wrap {
      width: 100%;
      margin: 2px auto;
    }
    .barcode-num {
      font-family: 'Courier New', Courier, monospace;
      font-size: ${labelPaperFormat === 'thermal_58mm' ? '11px' : '12px'};
      font-weight: 700;
      color: #000000;
      letter-spacing: 1px;
      margin-top: 3px;
    }
  </style>
</head>
<body>
  <div class="grid">
    ${labelsHtml.join('')}
  </div>
</body>
</html>`;

    const printWin = window.open('', '_blank', 'width=520,height=640');
    if (printWin) {
      printWin.document.open();
      printWin.document.write(html);
      printWin.document.close();
      setTimeout(() => {
        printWin.focus();
        printWin.print();
      }, 250);
    }
    setPrintModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Info & KPI Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                <Barcode className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-display font-bold text-slate-900">
                  Generate Barcode · {shop.name} ({shop.code})
                </h2>
                <p className="text-xs text-slate-500">
                  Create unique scannable barcodes for unlabelled products in {business.name} and print sticker labels (Product Name &amp; Barcode Number).
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={openBulkPrintModal}
                className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Printer className="w-4 h-4" />
                <span>Print Selected ({selectedIds.size})</span>
              </button>
            )}

            {missingBarcodeProducts.length > 0 && (
              <button
                type="button"
                onClick={handleGenerateAllMissing}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Sparkles className="w-4 h-4" />
                <span>Generate All Missing ({missingBarcodeProducts.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Active Shop Products
            </span>
            <p className="text-2xl font-display font-bold text-slate-900 mt-1">
              {activeProducts.length}
            </p>
          </div>
          <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
              Missing Dedicated Barcode
            </span>
            <p className="text-2xl font-display font-bold text-amber-900 mt-1">
              {missingBarcodeProducts.length}
            </p>
          </div>
          <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
              Ready to Scan
            </span>
            <p className="text-2xl font-display font-bold text-emerald-900 mt-1">
              {activeProducts.length - missingBarcodeProducts.length}
            </p>
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {banner && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs text-emerald-900">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{banner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Standalone / Pre-Print Blank Barcodes for Newly Bought Unregistered Items */}
      <div className="bg-white rounded-xl border border-indigo-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Pre-Print Barcodes for New Items (Before Adding to System)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Bought new stock that hasn&apos;t been entered into the POS yet? Generate unique barcodes here, print &amp; paste them onto the items, then scan them when adding products to your catalogue.
            </p>
          </div>

          <div className="flex items-end gap-2 flex-wrap shrink-0">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Unique Barcodes
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={blankCount}
                onChange={(e) => setBlankCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                className="w-20 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-mono text-center"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Copies Each
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={blankCopiesEach}
                onChange={(e) => setBlankCopiesEach(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                className="w-20 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-mono text-center"
              />
            </div>
            <button
              type="button"
              onClick={handleGenerateStandaloneBlanks}
              className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Generate Blank Barcodes</span>
            </button>
          </div>
        </div>

        {generatedBlanks.length > 0 && (
          <div className="pt-3 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">
                {generatedBlanks.length} Standalone Barcode{generatedBlanks.length === 1 ? '' : 's'} Ready to Print
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openBlankPrintModal(generatedBlanks)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print All Blank Labels</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGeneratedBlanks([])}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {generatedBlanks.map((code) => {
                const svg = buildCode128SvgMarkup(code, { height: 40, moduleWidth: 1.5 });
                return (
                  <div
                    key={code}
                    className="border border-slate-200 rounded-lg p-2.5 bg-white text-center space-y-1.5"
                  >
                    <div dangerouslySetInnerHTML={{ __html: svg }} />
                    <div className="font-mono text-[11px] font-bold text-slate-900 tracking-wider">
                      {code}
                    </div>
                    <div className="flex items-center justify-center gap-1 pt-1">
                      <button
                        type="button"
                        onClick={() => openBlankPrintModal([code])}
                        className="px-2 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-semibold cursor-pointer"
                      >
                        Print
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadSvg(code)}
                        className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold cursor-pointer"
                      >
                        SVG
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterTab('missing')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              filterTab === 'missing'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Needs Barcode ({missingBarcodeProducts.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              filterTab === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            All Products ({activeProducts.length})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search item name, SKU, or barcode..."
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-600"
          />
        </div>
      </div>

      {/* Product Barcode List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredProducts.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <p className="text-sm font-semibold text-slate-800">
              {filterTab === 'missing'
                ? 'All active products in this shop already have barcodes!'
                : 'No products match your search.'}
            </p>
            {filterTab === 'missing' && activeProducts.length > 0 && (
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                className="text-xs font-semibold text-emerald-600 hover:underline cursor-pointer"
              >
                View all {activeProducts.length} products to print or regenerate barcodes
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                <tr>
                  <th className="py-3 px-4 w-10">
                    <button
                      type="button"
                      onClick={toggleSelectAllVisible}
                      className="text-slate-600 hover:text-slate-900 cursor-pointer"
                      title="Select all visible items with barcodes"
                    >
                      {filteredProducts.some((p) => (p.barcode || '').trim()) &&
                      filteredProducts
                        .filter((p) => (p.barcode || '').trim())
                        .every((p) => selectedIds.has(p.id)) ? (
                        <CheckSquare className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-4">Product &amp; SKU</th>
                  <th className="py-3 px-4">Barcode Status</th>
                  <th className="py-3 px-4 text-center">Label Preview (Barcode Only)</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((product) => {
                  const needsCode = isProductMissingBarcode(product);
                  const hasCode = Boolean((product.barcode || '').trim());
                  const svgPreview = hasCode
                    ? buildCode128SvgMarkup(product.barcode.trim(), {
                        height: 36,
                        moduleWidth: 1.5,
                      })
                    : '';

                  return (
                    <tr key={product.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4">
                        {hasCode && (
                          <button
                            type="button"
                            onClick={() => toggleSelect(product.id)}
                            className="text-slate-500 hover:text-slate-900 cursor-pointer"
                          >
                            {selectedIds.has(product.id) ? (
                              <CheckSquare className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 text-xs">
                          {product.name}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          SKU: {product.sku} · {product.categoryName}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {needsCode ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Needs Barcode</span>
                          </span>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Ready</span>
                            </span>
                            <div className="font-mono text-[11px] font-semibold text-slate-700">
                              {product.barcode}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {hasCode ? (
                          <div className="mx-auto max-w-[200px] border border-slate-200 rounded-md p-2 bg-white text-center">
                            <div
                              className="my-1"
                              dangerouslySetInnerHTML={{ __html: svgPreview }}
                            />
                            <div className="font-mono text-[10px] font-bold text-slate-900 tracking-wider">
                              {product.barcode}
                            </div>
                          </div>
                        ) : (
                          <span className="block text-center text-[11px] text-slate-400 italic">
                            No barcode generated yet
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleGenerateSingle(product)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition ${
                            needsCode
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {needsCode ? (
                            <>
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Generate</span>
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Regenerate</span>
                            </>
                          )}
                        </button>

                        {hasCode && (
                          <>
                            <button
                              type="button"
                              onClick={() => openSinglePrintModal(product)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>Print Label</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadSvg(product.barcode)}
                              title="Download SVG barcode"
                              className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 inline-flex items-center cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Print Label(s) Modal */}
      {printModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Print Barcode Labels
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPrintModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Each printed label displays only the scannable <strong>Barcode</strong> and <strong>Barcode Number</strong> (no item name or price).
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Paper / Label Format
              </label>
              <select
                value={labelPaperFormat}
                onChange={(e) =>
                  setLabelPaperFormat(e.target.value as any)
                }
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-900"
              >
                <option value="thermal_80mm">80mm Thermal Roll</option>
                <option value="thermal_58mm">58mm Thermal Roll</option>
                <option value="a4_grid">A4 Sticker Sheet (3-Column Grid)</option>
              </select>
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {printItems.map((entry, idx) => (
                <div
                  key={entry.id}
                  className="p-3 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">
                      {entry.label}
                    </div>
                    <div className="font-mono text-[11px] text-slate-500">
                      {entry.barcode}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-slate-500">Copies:</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={entry.copies}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(100, Number(e.target.value) || 1));
                        setPrintItems((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, copies: val } : item
                          )
                        );
                      }}
                      className="w-16 px-2 py-1 border border-slate-300 rounded text-center font-mono"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setPrintModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executePrintLabels}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Printer className="w-4 h-4" />
                <span>Print Labels</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
