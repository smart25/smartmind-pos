/**
 * SmartMind POS — Business & Shop Branding Hierarchy & Document Identity Resolver
 *
 * Implements strict hierarchical brand resolution for customer-facing documents
 * (sales receipts, customer invoices, financial statements, and operational reports):
 * 1. Shop-specific logo, if one has been configured.
 * 2. Otherwise, parent business logo.
 * 3. If neither exists, clean text-based business identity with initials fallback (no broken images or unrelated placeholders).
 *
 * Distinguishes tenant business branding from SmartMind POS software branding.
 */

import { Business, Shop } from '../types/pos';

export interface ResolvedDocumentIdentity {
  /** The effective logo URL for the document (shop logo if configured, else business logo, else undefined) */
  logoUrl?: string;
  /** Primary trading or registered business name */
  businessName: string;
  /** Legal registered business name if different */
  legalName?: string;
  /** Selected shop/branch name */
  shopName: string;
  /** Selected shop/branch code */
  shopCode: string;
  /** Full formatted address of the shop */
  shopAddress: string;
  /** Location city */
  shopCity: string;
  /** Shop contact telephone */
  shopPhone: string;
  /** Business headquarters address */
  businessAddress: string;
  /** Business primary telephone */
  businessPhone: string;
  /** Business contact email */
  businessEmail: string;
  /** Tax Identification Number (TIN) */
  taxId?: string;
  /** Clean 2-letter uppercase initials for non-distorting text fallback */
  initials: string;
  /** Whether the active logo is a shop-level override */
  isShopOverride: boolean;
  /** Clean label describing the document brand scope */
  scopeLabel: string;
}

/**
 * Resolves the logo to use according to the 3-tier hierarchy:
 * 1. Shop-specific logo (if present and non-empty)
 * 2. Parent business logo (if present and non-empty)
 * 3. undefined (render clean text badge instead)
 */
export function resolveDocumentLogo(
  business?: Pick<Business, 'logoUrl'> | null,
  shop?: Pick<Shop, 'logoUrl'> | null
): string | undefined {
  const shopLogo = shop?.logoUrl?.trim();
  if (shopLogo && shopLogo.length > 0) {
    return shopLogo;
  }
  const bizLogo = business?.logoUrl?.trim();
  if (bizLogo && bizLogo.length > 0) {
    return bizLogo;
  }
  return undefined;
}

/**
 * Derives clean 2-letter monogram initials from a business or shop name
 * for text-based badge rendering when no logo is uploaded.
 */
export function getCleanBrandInitials(name?: string): string {
  if (!name || !name.trim()) return 'SM';
  const clean = name.trim().replace(/[^a-zA-Z0-9\s]/g, '');
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'SM';
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Resolves the complete document branding identity for a specific shop context.
 */
export function resolveDocumentIdentity(
  business: Business,
  shop: Shop
): ResolvedDocumentIdentity {
  const logoUrl = resolveDocumentLogo(business, shop);
  const isShopOverride = Boolean(shop.logoUrl && shop.logoUrl.trim().length > 0);
  const businessName = business.name || 'SmartMind POS Store';
  const legalName = business.legalName && business.legalName.trim() !== businessName.trim()
    ? business.legalName.trim()
    : undefined;

  return {
    logoUrl,
    businessName,
    legalName,
    shopName: shop.name,
    shopCode: shop.code,
    shopAddress: shop.address,
    shopCity: shop.locationCity,
    shopPhone: shop.phone,
    businessAddress: business.headquartersAddress,
    businessPhone: business.primaryPhone,
    businessEmail: business.contactEmail || business.ownerEmail,
    taxId: business.taxIdentificationNumber || undefined,
    initials: getCleanBrandInitials(businessName),
    isShopOverride,
    scopeLabel: `${businessName} · ${shop.name} (${shop.code})`,
  };
}

export interface ConsolidatedReportIdentity {
  logoUrl?: string;
  businessName: string;
  legalName?: string;
  businessAddress: string;
  businessPhone: string;
  businessEmail: string;
  taxId?: string;
  initials: string;
  branchNames: string[];
  branchCount: number;
  scopeLabel: string;
}

/**
 * Resolves document branding identity for consolidated multi-shop reports.
 * In consolidated reports, always uses the parent business-wide logo and lists branches.
 */
export function resolveConsolidatedReportIdentity(
  business: Business,
  shops: Shop[]
): ConsolidatedReportIdentity {
  const logoUrl = business.logoUrl?.trim() || undefined;
  const businessName = business.name || 'SmartMind POS Store';
  const legalName = business.legalName && business.legalName.trim() !== businessName.trim()
    ? business.legalName.trim()
    : undefined;
  const branchNames = shops.map((s) => `${s.name} (${s.code})`);

  return {
    logoUrl,
    businessName,
    legalName,
    businessAddress: business.headquartersAddress,
    businessPhone: business.primaryPhone,
    businessEmail: business.contactEmail || business.ownerEmail,
    taxId: business.taxIdentificationNumber || undefined,
    initials: getCleanBrandInitials(businessName),
    branchNames,
    branchCount: shops.length,
    scopeLabel: `${businessName} (Consolidated: ${shops.length} branch${shops.length === 1 ? '' : 'es'})`,
  };
}

/**
 * File validation parameters for logo uploads:
 * - Supported types: image/png, image/jpeg, image/webp
 * - Max raw file size: 500KB (to prevent memory/quota issues and enforce fast document rendering)
 * - Minimum file size: 50 bytes
 */
export const BRANDING_UPLOAD_CONSTRAINTS = {
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'] as const,
  maxSizeBytes: 512 * 1024, // 512 KB
  maxDisplaySizeLabel: '512 KB',
  minSizeBytes: 50,
};

export interface ValidateLogoFileResult {
  valid: boolean;
  error?: string;
  sanitizedMimeType?: string;
}

/**
 * Validates a file before processing for logo storage.
 */
export function validateLogoFile(file: File | { type: string; size: number; name?: string }): ValidateLogoFileResult {
  if (!file) {
    return { valid: false, error: 'No image file selected.' };
  }
  const mimeType = (file.type || '').toLowerCase();
  const allowed = BRANDING_UPLOAD_CONSTRAINTS.allowedMimeTypes;
  const isAllowed = allowed.some((t) => mimeType === t || (t === 'image/jpeg' && mimeType === 'image/jpg'));

  if (!isAllowed) {
    return {
      valid: false,
      error: 'Invalid file format. Only PNG, JPEG, and WebP images are supported.',
    };
  }

  if (file.size > BRANDING_UPLOAD_CONSTRAINTS.maxSizeBytes) {
    return {
      valid: false,
      error: `File size exceeds ${BRANDING_UPLOAD_CONSTRAINTS.maxDisplaySizeLabel}. Please choose an optimized logo image.`,
    };
  }

  if (file.size < BRANDING_UPLOAD_CONSTRAINTS.minSizeBytes) {
    return {
      valid: false,
      error: 'Selected file is empty or corrupted.',
    };
  }

  return {
    valid: true,
    sanitizedMimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType,
  };
}

/**
 * Local storage caching key for offline logo persistence.
 * Isolates cached logos per business ID and shop ID to preserve tenant isolation.
 */
export function getOfflineLogoStorageKey(businessId: string, shopId?: string): string {
  if (shopId) {
    return `smartmind_branding_${businessId}_shop_${shopId}`;
  }
  return `smartmind_branding_${businessId}_business`;
}

/**
 * Caches a logo in local browser storage for offline usage.
 * If logoData is empty, removes the entry from cache to free storage space.
 */
export function cacheOfflineLogo(businessId: string, logoData: string, shopId?: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const key = getOfflineLogoStorageKey(businessId, shopId);
    if (!logoData || !logoData.trim()) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, logoData);
    }
  } catch {
    // Ignore storage quota warnings in offline mode
  }
}

/**
 * Explicitly removes a cached offline logo.
 */
export function removeOfflineLogo(businessId: string, shopId?: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const key = getOfflineLogoStorageKey(businessId, shopId);
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Retrieves a cached offline logo.
 */
export function getCachedOfflineLogo(businessId: string, shopId?: string): string | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const key = getOfflineLogoStorageKey(businessId, shopId);
    const value = window.localStorage.getItem(key);
    return value && value.trim().length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}
