/**
 * SmartMind POS — Phase 2 Mock Data Repository Implementation
 *
 * Centralizes business, shop, primary owner, staff, and shop-assignment
 * operations with explicit role and tenant isolation checks.
 * Designed so it can be swapped for a Firebase Auth + Firestore + Cloud Functions
 * implementation in Phase 3 without changing React page components.
 */

import {
  AccountStatus,
  Business,
  BusinessStatus,
  ProductCategory,
  Shop,
  ShopAssignment,
  ShopStatus,
  UnitOfMeasurement,
  User,
} from '../types/pos';
import {
  canUserAccessBusiness,
  CreateBusinessInput,
  CreateShopInput,
  CreateStaffInput,
  generateUniqueBusinessId,
  generateUniqueShopId,
  generateUniqueUserId,
  getRoleLabel,
  hasPermission,
  ROLE_DEFAULT_PERMISSIONS,
  validateBusinessRegistrationInput,
  validateShopRegistrationInput,
  validateStaffRegistrationInput,
} from '../utils/posCalculations';

export function getScopedBusinessesForActor(
  actor: User,
  allBusinesses: Business[]
): Business[] {
  if (actor.status !== 'active') return [];
  if (actor.role === 'platform_admin') {
    return allBusinesses;
  }
  return allBusinesses.filter((b) => canUserAccessBusiness(actor, b));
}

export function getScopedShopsForBusiness(
  actor: User,
  businessId: string,
  allBusinesses: Business[],
  allShops: Shop[]
): Shop[] {
  const targetBiz = allBusinesses.find((b) => b.id === businessId);
  if (!targetBiz) return [];

  if (actor.role === 'platform_admin') {
    return allShops.filter((s) => s.businessId === businessId);
  }
  if (!canUserAccessBusiness(actor, targetBiz)) {
    return [];
  }
  const bizShops = allShops.filter((s) => s.businessId === businessId);
  if (actor.role === 'business_owner') {
    return bizShops;
  }
  return bizShops.filter((s) => actor.assignedShopIds.includes(s.id));
}

export function getScopedStaffForBusiness(
  actor: User,
  businessId: string,
  allBusinesses: Business[],
  allUsers: User[]
): User[] {
  const targetBiz = allBusinesses.find((b) => b.id === businessId);
  if (!targetBiz) return [];
  if (actor.role !== 'platform_admin' && !canUserAccessBusiness(actor, targetBiz)) {
    return [];
  }
  const bizUsers = allUsers.filter((u) => u.businessId === businessId);
  if (actor.role === 'platform_admin' || actor.role === 'business_owner') {
    return bizUsers;
  }
  if (actor.role === 'shop_manager') {
    // Shop managers see staff assigned to their managed shops
    return bizUsers.filter(
      (u) =>
        u.id === actor.id ||
        u.assignedShopIds.some((sid) => actor.assignedShopIds.includes(sid))
    );
  }
  return bizUsers.filter((u) => u.id === actor.id);
}

/**
 * Platform Administrator operation:
 * Creates a new Business and assigns exactly one Primary Owner account to it.
 */
export function buildNewBusinessWithPrimaryOwner(
  actor: User,
  input: CreateBusinessInput,
  existingBusinesses: Business[],
  existingUsers: User[],
  todayDate = '2026-10-21'
): { business: Business; ownerUser: User } {
  if (actor.role !== 'platform_admin') {
    throw new Error('Only a Platform Administrator can register a new business.');
  }

  const validation = validateBusinessRegistrationInput(
    input,
    existingBusinesses,
    existingUsers
  );
  if (!validation.valid) {
    throw new Error(validation.error ?? 'Invalid business registration input.');
  }

  const newBusinessId = generateUniqueBusinessId(existingBusinesses);
  const newOwnerId = generateUniqueUserId(existingUsers);
  const cleanName = input.name.trim();
  const cleanOwnerEmail = input.ownerEmail.trim().toLowerCase();
  const usernamePrefix = cleanOwnerEmail.split('@')[0] || `owner.${existingBusinesses.length + 1}`;

  const ownerUser: User = {
    id: newOwnerId,
    businessId: newBusinessId,
    username: usernamePrefix,
    email: cleanOwnerEmail,
    fullName: input.ownerName.trim(),
    role: 'business_owner',
    roleLabel: `Business Owner (${cleanName})`,
    assignedShopIds: [],
    permissions: [...ROLE_DEFAULT_PERMISSIONS.business_owner],
    status: 'active',
    createdAt: todayDate,
    lastLoginAt: 'Never (Newly Assigned)',
  };

  const business: Business = {
    id: newBusinessId,
    name: cleanName,
    legalName: `${cleanName} (Registered Entity)`,
    businessType: input.businessType,
    registrationNumber: `RC-${Math.floor(1000000 + Math.random() * 9000000)}-DEMO`,
    taxIdentificationNumber: `TIN-${Math.floor(10000000 + Math.random() * 90000000)}-0001`,
    ownerUserId: ownerUser.id,
    ownerName: ownerUser.fullName,
    ownerEmail: ownerUser.email,
    contactEmail: (input.contactEmail || input.ownerEmail || '').trim().toLowerCase(),
    primaryPhone: input.primaryPhone.trim(),
    headquartersAddress: input.headquartersAddress.trim(),
    currencyCode: 'USD',
    currencySymbol: '$',
    defaultTaxRatePercent: 7.5,
    status: 'active',
    notes: input.notes?.trim() || '',
    createdAt: todayDate,
  };

  return { business, ownerUser };
}

/**
 * Business Owner operation:
 * Creates a new Shop strictly associated with their parent businessId,
 * plus initial shop-isolated category and unit of measurement records.
 */
export function buildNewShopForBusiness(
  actor: User,
  business: Business,
  input: CreateShopInput,
  allShops: Shop[],
  todayDate = '2026-10-21'
): {
  shop: Shop;
  defaultCategories: ProductCategory[];
  defaultUnits: UnitOfMeasurement[];
} {
  if (actor.role !== 'business_owner' && !hasPermission(actor, 'manage_shops')) {
    throw new Error('You do not have permission to create shops.');
  }
  if (actor.businessId !== business.id) {
    throw new Error('Cross-business modification is prohibited.');
  }

  const businessShops = allShops.filter((s) => s.businessId === business.id);
  const validation = validateShopRegistrationInput(input, businessShops);
  if (!validation.valid) {
    throw new Error(validation.error ?? 'Invalid shop input.');
  }

  const newShopId = generateUniqueShopId(allShops);
  const prefix = input.name
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 3)
    .padEnd(3, 'X');
  const seq = String(businessShops.length + 1).padStart(2, '0');
  const code = `${prefix}-${seq}`;

  const shop: Shop = {
    id: newShopId,
    businessId: business.id,
    code,
    name: input.name.trim(),
    category: input.category ?? 'Retail Store',
    locationCity: input.locationCity?.trim() || input.address.trim(),
    address: input.address.trim(),
    phone: input.phone.trim(),
    description: input.description?.trim() || '',
    managerName: business.ownerName,
    status: 'active',
    terminalId: `WIN-POS-${prefix}${seq}`,
    taxRatePercent: business.defaultTaxRatePercent,
    receiptHeaderNote: `${input.name.trim()} — Official Receipt`,
    receiptFooterNote: 'Thank you for your patronage',
    createdAt: todayDate,
    pendingSyncCount: 0,
    lastSyncedAt: `${todayDate} 10:00 AM`,
  };

  const defaultCategories: ProductCategory[] = [
    {
      id: `cat-${newShopId}-general`,
      shopId: newShopId,
      businessId: business.id,
      name: 'General Merchandise',
      description: `Default isolated category for ${shop.name}`,
    },
  ];

  const defaultUnits: UnitOfMeasurement[] = [
    {
      id: `unit-${newShopId}-pack`,
      shopId: newShopId,
      businessId: business.id,
      name: 'Pack',
      abbreviation: 'pk',
    },
    {
      id: `unit-${newShopId}-unit`,
      shopId: newShopId,
      businessId: business.id,
      name: 'Unit',
      abbreviation: 'unit',
    },
  ];

  return { shop, defaultCategories, defaultUnits };
}

/**
 * Business Owner / authorized staff manager operation:
 * Creates a new staff member (Shop Manager or Cashier) with explicit shop assignments.
 */
export function buildNewStaffMember(
  actor: User,
  business: Business,
  input: CreateStaffInput,
  allUsers: User[],
  businessShops: Shop[],
  todayDate = '2026-10-21'
): { user: User; assignments: ShopAssignment[] } {
  if (!hasPermission(actor, 'manage_staff')) {
    throw new Error('You do not have permission to manage staff.');
  }
  if (actor.businessId !== business.id) {
    throw new Error('Cannot create staff for another business.');
  }

  const validation = validateStaffRegistrationInput(
    input,
    business.id,
    allUsers,
    businessShops
  );
  if (!validation.valid) {
    throw new Error(validation.error ?? 'Invalid staff input.');
  }

  const newUserId = generateUniqueUserId(allUsers);
  const cleanEmail = input.email.trim().toLowerCase();
  const username = cleanEmail.split('@')[0] || `staff.${allUsers.length + 1}`;

  const shopNames = businessShops
    .filter((s) => input.assignedShopIds.includes(s.id))
    .map((s) => s.code)
    .join(', ');

  const roleBase = getRoleLabel(input.role);
  const roleLabel = shopNames
    ? `${roleBase} (${shopNames})`
    : `${roleBase} (No Shops Assigned)`;

  const user: User = {
    id: newUserId,
    businessId: business.id,
    username,
    email: cleanEmail,
    fullName: input.fullName.trim(),
    role: input.role,
    roleLabel,
    assignedShopIds: [...input.assignedShopIds],
    permissions: [...input.permissions],
    status: 'active',
    createdAt: todayDate,
    lastLoginAt: 'Never (Pending Firebase Auth)',
  };

  const assignments: ShopAssignment[] = input.assignedShopIds.map((shopId, idx) => ({
    id: `asgn-${Date.now()}-${idx}`,
    userId: newUserId,
    businessId: business.id,
    shopId,
    assignedAt: todayDate,
    assignedByUserId: actor.id,
    isActive: true,
  }));

  return { user, assignments };
}
