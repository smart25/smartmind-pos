
/**
 * SmartMind POS — Phase 2: Cloud-Synchronized Business Branding Service
 *
 * Manages uploading, replacing, and removing tenant business and shop logos
 * in Firebase Storage with automatic local offline caching and fallback.
 */

import type { FirebaseStorage } from 'firebase/storage';
import { cacheOfflineLogo, removeOfflineLogo } from '../utils/brandingHierarchy';

export interface UploadLogoParams {
  businessId: string;
  shopId?: string;
  dataUrl: string;
  mimeType?: string;
}

export interface UploadLogoResult {
  success: boolean;
  logoUrl: string;
  isCloudStored: boolean;
  error?: string;
}

/**
 * Derives the canonical tenant-isolated storage path.
 */
export function getStoragePathForLogo(
  businessId: string,
  shopId?: string
): string {
  const cleanBiz = (businessId || '').trim();
  const cleanShop = (shopId || '').trim();

  if (cleanShop.length > 0) {
    return `businesses/${cleanBiz}/shops/${cleanShop}/branding/shop-logo`;
  }

  return `businesses/${cleanBiz}/branding/business-logo`;
}

/**
 * Resolves Storage lazily.
 * Pass null explicitly in unit tests to prevent Firebase access.
 */
async function resolveStorage(
  storageOverride?: FirebaseStorage | null
): Promise<FirebaseStorage | null> {
  if (storageOverride !== undefined) {
    return storageOverride;
  }

  const firebase = await import('../firebase');
  return firebase.storage;
}

/**
 * Uploads a logo to Firebase Storage.
 * If Storage is unavailable or the network fails, retains a local copy.
 *
 * The optional second argument is intended for dependency injection in tests.
 */
export async function uploadLogoToCloudStorage(
  params: UploadLogoParams,
  storageOverride?: FirebaseStorage | null
): Promise<UploadLogoResult> {
  const { businessId, shopId, dataUrl } = params;

  if (!dataUrl || !dataUrl.trim()) {
    return {
      success: false,
      logoUrl: '',
      isCloudStored: false,
      error: 'Empty image data.',
    };
  }

  cacheOfflineLogo(businessId, dataUrl, shopId);

  try {
    const activeStorage = await resolveStorage(storageOverride);

    if (!activeStorage) {
      return {
        success: true,
        logoUrl: dataUrl,
        isCloudStored: false,
      };
    }

    const { ref, uploadString, getDownloadURL } =
      await import('firebase/storage');

    const path = getStoragePathForLogo(businessId, shopId);
    const storageRef = ref(activeStorage, path);

    const mimeMatch = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,/);
    const contentType = mimeMatch
      ? mimeMatch[1]
      : (params.mimeType || 'image/png');

    await uploadString(storageRef, dataUrl, 'data_url', {
      contentType,
      customMetadata: {
        businessId,
        shopId: shopId || '',
        uploadedAt: new Date().toISOString(),
      },
    });

    const downloadUrl = await getDownloadURL(storageRef);

    cacheOfflineLogo(businessId, downloadUrl, shopId);

    return {
      success: true,
      logoUrl: downloadUrl,
      isCloudStored: true,
    };
  } catch (err: any) {
    console.warn(
      'Firebase Storage upload failed or operating offline:',
      err?.message || err
    );

    return {
      success: true,
      logoUrl: dataUrl,
      isCloudStored: false,
      error: err?.message || 'Storage upload deferred to local cache.',
    };
  }
}

/**
 * Deletes a logo from Firebase Storage.
 *
 * Local cache is cleared only after cloud deletion succeeds,
 * the object is confirmed missing, or Storage is explicitly disabled.
 *
 * The optional third argument supports isolated unit testing.
 */
export async function deleteLogoFromCloudStorage(
  businessId: string,
  shopId?: string,
  storageOverride?: FirebaseStorage | null
): Promise<boolean> {
  try {
    const activeStorage = await resolveStorage(storageOverride);

    if (!activeStorage) {
      removeOfflineLogo(businessId, shopId);
      return true;
    }

    const { ref, deleteObject } = await import('firebase/storage');
    const path = getStoragePathForLogo(businessId, shopId);
    const storageRef = ref(activeStorage, path);

    await deleteObject(storageRef);

    removeOfflineLogo(businessId, shopId);
    return true;
  } catch (err: any) {
    if (err?.code === 'storage/object-not-found') {
      removeOfflineLogo(businessId, shopId);
      return true;
    }

    console.warn(
      'Failed to delete storage object:',
      err?.message || err
    );

    return false;
  }
}
