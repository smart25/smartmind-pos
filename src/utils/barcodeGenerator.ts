import { Product } from '../types/pos';

/**
 * Standard Code-128 (Set B) bar-width patterns (indices 0..106).
 * Each string represents alternating bar/space widths (1-4 modules).
 * Index 104 = Start Code B, Index 106 = Stop pattern (7 elements).
 */
const CODE128_PATTERNS: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112',
];

const START_B_CODE = 104;
const STOP_CODE = 106;

/**
 * Encodes an ASCII string into Code-128B module widths.
 * Returns an array of bar/space widths starting with a bar.
 */
export function encodeCode128B(text: string): number[] {
  const sanitized = (text || '')
    .trim()
    .replace(/[^\x20-\x7E]/g, '');
  if (!sanitized) return [];

  const codes: number[] = [START_B_CODE];
  let checksum = START_B_CODE;

  for (let i = 0; i < sanitized.length; i++) {
    const code = sanitized.charCodeAt(i) - 32;
    if (code >= 0 && code <= 94) {
      codes.push(code);
      checksum += code * (i + 1);
    }
  }

  codes.push(checksum % 103);
  codes.push(STOP_CODE);

  const widths: number[] = [];
  for (const c of codes) {
    const pattern = CODE128_PATTERNS[c];
    if (pattern) {
      for (let j = 0; j < pattern.length; j++) {
        widths.push(Number(pattern[j]));
      }
    }
  }
  return widths;
}

/**
 * Builds a crisp, pure black-and-white scannable SVG string for a Code-128B barcode.
 */
export function buildCode128SvgMarkup(
  value: string,
  options?: {
    height?: number;
    moduleWidth?: number;
    quietZoneModules?: number;
  }
): string {
  const widths = encodeCode128B(value);
  if (widths.length === 0) return '';

  const height = options?.height ?? 56;
  const moduleWidth = options?.moduleWidth ?? 2;
  const quietZone = (options?.quietZoneModules ?? 10) * moduleWidth;

  const totalModules = widths.reduce((sum, w) => sum + w, 0);
  const totalWidth = totalModules * moduleWidth + quietZone * 2;

  let x = quietZone;
  const rects: string[] = [];
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i] * moduleWidth;
    // Even indices are black bars, odd indices are white spaces
    if (i % 2 === 0) {
      rects.push(`<rect x="${x}" y="0" width="${w}" height="${height}" fill="#000000" />`);
    }
    x += w;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${height}" width="100%" height="${height}" preserveAspectRatio="xMidYMid meet" style="display:block;background:#ffffff;">${rects.join('')}</svg>`;
}

/**
 * Generates a unique, collision-free 13-digit EAN-13 style numeric barcode
 * using the GS1 in-store prefix "200" + 9 random digits + valid EAN-13 check digit.
 */
export function generateUniqueShopBarcode(existingBarcodes: Set<string>): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const bodyDigits =
      '200' +
      String(Math.floor(100000000 + Math.random() * 900000000));
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = Number(bodyDigits[i]);
      sum += i % 2 === 0 ? digit : digit * 3;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    const candidate = `${bodyDigits}${checkDigit}`;
    if (!existingBarcodes.has(candidate)) {
      return candidate;
    }
  }
  return `200${String(Date.now()).slice(-10)}`;
}

/**
 * Determines whether a product is missing a dedicated scannable barcode.
 */
export function isProductMissingBarcode(product: Product): boolean {
  const b = (product.barcode || '').trim();
  const s = (product.sku || '').trim();
  if (!b) return true;
  // Treat identical SKU-only placeholders as needing a dedicated barcode if not numeric
  if (b === s && !/^\d{8,14}$/.test(b)) return true;
  return false;
}
