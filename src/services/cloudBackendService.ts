/**
 * SmartMind POS — Phase 6: Trusted Cloud Backend & Server-Enforced Authorization Engine
 *
 * Enforces server-side RBAC, multi-tenant business/shop isolation, single-primary-owner
 * invariant, privilege-escalation prevention, idempotent business provisioning, and
 * concurrency-safe atomic stock ledger validation.
 *
 * When online with Firebase Auth & Firestore, operations also mirror to the provisioned
 * Cloud Firestore database (/businesses/{businessId}/...) governed by firestore.rules.
 */

import { isReservedPlatformAdminEmail } from '../utils/platformAdminEnvironment';

import {
  DbAuditEvent,
  DbBusiness,
  DbCategory,
  DbInventoryMovement,
  DbPayment,
  DbProduct,
  DbSale,
  DbSaleItem,
  DbShop,
  DbUser,
  DbUserShopAssignment,
} from '../db/schema';
import { PermissionKey, UserRole } from '../types/pos';
import { ROLE_DEFAULT_PERMISSIONS } from '../utils/posCalculations';
import {
  isKnownDemoRecord,
  isPreFirebaseTestRecord,
  SPECIFIED_PRE_FIREBASE_SALE_ID_SET,
  SPECIFIED_PRE_FIREBASE_SYNC_ID_SET,
} from './liveFirestoreDataService';

function checkQuarantinedOrDemoSyncOperation(params: {
  operationId?: string;
  entityId?: string;
  businessId?: string;
  shopId?: string;
}): { blocked: boolean; reason?: string } {
  const opId = String(params.operationId || '').trim();
  const entId = String(params.entityId || '').trim();
  const bizId = String(params.businessId || '').trim();
  const shpId = String(params.shopId || '').trim();

  if (
    SPECIFIED_PRE_FIREBASE_SYNC_ID_SET.has(opId) ||
    SPECIFIED_PRE_FIREBASE_SALE_ID_SET.has(entId) ||
    SPECIFIED_PRE_FIREBASE_SALE_ID_SET.has(opId) ||
    isPreFirebaseTestRecord({
      id: opId,
      entityId: entId,
      businessId: bizId,
      shopId: shpId,
    })
  ) {
    return {
      blocked: true,
      reason:
        'QUARANTINED_RECORD: Pre-Firebase test record is permanently quarantined (pre_firebase_test_transaction_missing_live_tenant) and excluded from live synchronization.',
    };
  }

  if (isKnownDemoRecord({ businessId: bizId, shopId: shpId })) {
    return {
      blocked: true,
      reason:
        'DEMO_ISOLATION_VIOLATION: Demo-mode tenant records cannot be synchronized to live cloud storage.',
    };
  }

  return { blocked: false };
}

export interface CloudSyncOperationRecord {
  id: string; // operationId / idempotencyKey
  businessId: string;
  shopId: string;
  entityType:
    | 'sale'
    | 'product'
    | 'category'
    | 'inventory_movement'
    | 'customer'
    | 'invoice'
    | 'payment';
  entityId: string;
  operationType: 'create' | 'update' | 'delete' | 'adjust';
  actorUserId: string;
  outcome: 'acknowledged' | 'conflict_requires_review' | 'rejected_unauthorized';
  ackId?: string;
  conflictReason?: string;
  schemaVersion: number;
  processedAt: string;
}

export interface ProvisionBusinessCloudInput {
  idempotencyKey: string;
  businessId?: string;
  name: string;
  legalName?: string;
  businessType: string;
  contactEmail: string;
  primaryPhone: string;
  headquartersAddress: string;
  ownerUserId?: string;
  ownerName: string;
  ownerEmail: string;
  currencyCode?: string;
  currencySymbol?: string;
  defaultTaxRatePercent?: number;
  notes?: string;
}

export interface InviteStaffCloudInput {
  userId?: string;
  fullName: string;
  email: string;
  role: 'shop_manager' | 'cashier';
  roleLabel?: string;
  assignedShopIds: string[];
  permissions?: PermissionKey[];
}

export interface CloudSyncEndpointRequest {
  operationId: string;
  idempotencyKey: string;
  schemaVersion: number;
  actorUserId: string;
  businessId: string;
  shopId: string;
  entityType:
    | 'sale'
    | 'product'
    | 'category'
    | 'inventory_movement'
    | 'customer'
    | 'invoice'
    | 'payment';
  entityId: string;
  operationType: 'create' | 'update' | 'delete' | 'adjust';
  payload: {
    sale?: DbSale;
    items?: DbSaleItem[];
    payment?: DbPayment;
    product?: DbProduct;
    category?: DbCategory;
    movement?: DbInventoryMovement;
  };
}

export interface CloudSyncEndpointResponse {
  outcome: 'acknowledged' | 'conflict_requires_review' | 'rejected_unauthorized';
  status?: 'synced' | 'requires_review' | 'failed';
  ackId?: string;
  syncedAt?: string;
  isDuplicateReplay?: boolean;
  conflictReason?: string;
  errorMessage?: string;
}

export class CloudBackendService {
  // Authoritative cloud collections
  private businesses = new Map<string, DbBusiness>();
  private shops = new Map<string, DbShop>();
  private users = new Map<string, DbUser>();
  private assignments = new Map<string, DbUserShopAssignment>();
  private categories = new Map<string, DbCategory>();
  private products = new Map<string, DbProduct>();
  private sales = new Map<string, DbSale>();
  private saleItems = new Map<string, DbSaleItem[]>();
  private payments: DbPayment[] = [];
  private inventoryMovements: DbInventoryMovement[] = [];
  private auditEvents: DbAuditEvent[] = [];
  private syncOperations = new Map<string, CloudSyncOperationRecord>();
  private provisioningIdempotencyMap = new Map<
    string,
    { business: DbBusiness; owner: DbUser }
  >();

  // Credential verifier map (userId -> secret hash; NEVER stored in DbUser, Firestore, or sync_queue)
  private credentialSecrets = new Map<string, string>();
  private activeSessionUserId: string | null = null;
  private simulateNetworkOutage = false;
  private omitServerAcknowledgement = false;
  private txMutex: Promise<void> = Promise.resolve();

  // ===========================================================================
  // NETWORK / FAULT INJECTION CONTROLS FOR DETERMINISTIC TESTING
  // ===========================================================================
  setNetworkOutage(offline: boolean): void {
    this.simulateNetworkOutage = offline;
  }

  setOmitServerAcknowledgement(omit: boolean): void {
    this.omitServerAcknowledgement = omit;
  }

  private assertNetworkAvailable(): void {
    if (this.simulateNetworkOutage) {
      throw new Error('NETWORK_UNAVAILABLE: Cloud backend is unreachable.');
    }
  }

  // ===========================================================================
  // SEEDING & INITIALIZATION HELPERS
  // ===========================================================================
  registerAuthAccount(user: DbUser, passwordSecret: string, assignedShopIds: string[] = []): void {
    // Strip any password fields before storing user record in cloud state
    const sanitizedUser: DbUser = {
      ...user,
      password_hash: undefined,
    };
    this.users.set(sanitizedUser.id, sanitizedUser);
    this.credentialSecrets.set(sanitizedUser.id, passwordSecret);

    // Sync shop assignments
    for (const shopId of assignedShopIds) {
      const asgnId = `asgn-${sanitizedUser.id}-${shopId}`;
      this.assignments.set(asgnId, {
        id: asgnId,
        user_id: sanitizedUser.id,
        business_id: sanitizedUser.business_id,
        shop_id: shopId,
        assigned_at: sanitizedUser.created_at,
        assigned_by_user_id: 'SYSTEM',
        is_active: 1,
      });
    }
  }

  seedBusiness(business: DbBusiness): void {
    this.businesses.set(business.id, { ...business });
  }

  seedShop(shop: DbShop): void {
    this.shops.set(shop.id, { ...shop });
  }

  seedProduct(product: DbProduct): void {
    this.products.set(product.id, { ...product });
  }

  // ===========================================================================
  // 1. AUTHENTICATION & SESSION RESTORATION
  // ===========================================================================
  async signIn(emailOrUsername: string, passwordSecret: string): Promise<DbUser> {
    this.assertNetworkAvailable();
    const cleanId = emailOrUsername.trim().toLowerCase();
    if (!cleanId || !passwordSecret) {
      throw new Error('AUTH_INVALID_INPUT: Email and password are required.');
    }

    const matchedUser = Array.from(this.users.values()).find(
      (u) =>
        u.email.toLowerCase() === cleanId || u.username.toLowerCase() === cleanId
    );

    if (!matchedUser) {
      throw new Error('AUTH_USER_NOT_FOUND: Invalid email or password.');
    }

    const expectedSecret = this.credentialSecrets.get(matchedUser.id);
    if (!expectedSecret || expectedSecret !== passwordSecret) {
      throw new Error('AUTH_INVALID_CREDENTIALS: Invalid email or password.');
    }

    if (matchedUser.status !== 'active') {
      throw new Error(
        `AUTH_ACCOUNT_SUSPENDED: Account "${matchedUser.email}" is suspended.`
      );
    }

    if (matchedUser.role !== 'platform_admin') {
      const biz = this.businesses.get(matchedUser.business_id);
      if (!biz) {
        throw new Error('AUTH_TENANT_NOT_FOUND: Associated business does not exist.');
      }
      if (biz.status !== 'active') {
        throw new Error(
          `AUTH_BUSINESS_SUSPENDED: Business "${biz.name}" is currently suspended.`
        );
      }
    }

    const nowIso = new Date().toISOString();
    const updatedUser: DbUser = {
      ...matchedUser,
      last_login_at: nowIso,
      password_hash: undefined,
    };
    this.users.set(updatedUser.id, updatedUser);
    this.activeSessionUserId = updatedUser.id;

    this.recordAudit({
      businessId: updatedUser.business_id,
      userId: updatedUser.id,
      userName: updatedUser.full_name,
      action: 'auth_sign_in',
      entityType: 'user',
      entityId: updatedUser.id,
      details: { email: updatedUser.email, role: updatedUser.role },
    });

    return { ...updatedUser };
  }

  async signOut(): Promise<void> {
    if (this.activeSessionUserId) {
      const actor = this.users.get(this.activeSessionUserId);
      if (actor) {
        this.recordAudit({
          businessId: actor.business_id,
          userId: actor.id,
          userName: actor.full_name,
          action: 'auth_sign_out',
          entityType: 'user',
          entityId: actor.id,
        });
      }
    }
    this.activeSessionUserId = null;
  }

  getActiveSessionUser(): DbUser | null {
    if (!this.activeSessionUserId) return null;
    const u = this.users.get(this.activeSessionUserId);
    if (!u || u.status !== 'active') return null;
    return { ...u, password_hash: undefined };
  }

  // ===========================================================================
  // 2. SERVER-ENFORCED AUTHORIZATION HELPERS
  // ===========================================================================
  private getVerifiedActor(actorUserId: string): DbUser {
    if (!actorUserId) {
      throw new Error('UNAUTHORIZED: Authentication is required.');
    }
    const actor = this.users.get(actorUserId);
    if (!actor) {
      throw new Error('UNAUTHORIZED: Authenticated user profile does not exist.');
    }
    if (actor.status !== 'active') {
      throw new Error('FORBIDDEN: User account is suspended.');
    }
    if (actor.role !== 'platform_admin') {
      const biz = this.businesses.get(actor.business_id);
      if (!biz || biz.status !== 'active') {
        throw new Error('FORBIDDEN: Parent business is suspended or inactive.');
      }
    }
    return actor;
  }

  getActiveAssignedShopIds(userId: string): string[] {
    return Array.from(this.assignments.values())
      .filter((a) => a.user_id === userId && a.is_active === 1)
      .map((a) => a.shop_id);
  }

  private assertShopRelationship(businessId: string, shopId: string): DbShop {
    const shop = this.shops.get(shopId);
    if (!shop) {
      throw new Error(`NOT_FOUND: Shop "${shopId}" does not exist.`);
    }
    if (shop.business_id !== businessId) {
      throw new Error(
        `FORBIDDEN_TENANT_MISMATCH: Shop "${shopId}" does not belong to business "${businessId}".`
      );
    }
    return shop;
  }

  /**
   * Validates whether an authenticated user can access operational shop data
   * (sales, products, inventory, payments).
   *
   * CRITICAL REQUIREMENT: Platform Administrator does NOT automatically gain
   * access to shop sales, payment details, or shop inventory.
   */
  private assertOperationalShopAccess(
    actorUserId: string,
    businessId: string,
    shopId: string,
    requiredCapability: 'read_pos' | 'process_sale' | 'manage_catalogue' | 'view_reports'
  ): DbUser {
    const actor = this.getVerifiedActor(actorUserId);

    if (actor.role === 'platform_admin') {
      this.recordAudit({
        businessId,
        shopId,
        userId: actor.id,
        userName: actor.full_name,
        action: 'unauthorized_platform_admin_shop_data_attempt',
        entityType: 'shop',
        entityId: shopId,
        details: { requiredCapability },
      });
      throw new Error(
        'FORBIDDEN_ROLE_BOUNDARY: Platform Administrator does not automatically inherit access to shop sales, payments, or inventory.'
      );
    }

    if (actor.business_id !== businessId) {
      this.recordAudit({
        businessId: actor.business_id,
        shopId,
        userId: actor.id,
        userName: actor.full_name,
        action: 'cross_business_access_denied',
        entityType: 'business',
        entityId: businessId,
        details: { attemptedBusinessId: businessId, attemptedShopId: shopId },
      });
      throw new Error(
        `FORBIDDEN_CROSS_BUSINESS: User "${actor.email}" belongs to "${actor.business_id}" and cannot access business "${businessId}".`
      );
    }

    this.assertShopRelationship(businessId, shopId);

    if (actor.role === 'business_owner') {
      return actor;
    }

    const assignedShops = this.getActiveAssignedShopIds(actor.id);
    if (!assignedShops.includes(shopId)) {
      this.recordAudit({
        businessId,
        shopId,
        userId: actor.id,
        userName: actor.full_name,
        action: 'unassigned_shop_access_denied',
        entityType: 'shop',
        entityId: shopId,
      });
      throw new Error(
        `FORBIDDEN_UNASSIGNED_SHOP: User "${actor.email}" (${actor.role}) is not assigned to shop "${shopId}".`
      );
    }

    if (
      requiredCapability === 'manage_catalogue' &&
      actor.role === 'cashier'
    ) {
      throw new Error(
        'FORBIDDEN_INSUFFICIENT_ROLE: Cashiers cannot modify product catalogue or perform unrestricted inventory adjustments.'
      );
    }

    let actorPerms: string[] = [];
    try {
      actorPerms = JSON.parse(actor.permissions_json || '[]');
    } catch {
      actorPerms = [];
    }

    if (
      requiredCapability === 'process_sale' &&
      !actorPerms.some((p) =>
        ['process_sales', 'process_sale', 'pos_checkout'].includes(p)
      )
    ) {
      throw new Error(
        'FORBIDDEN_MISSING_PERMISSION: User lacks permission (process_sales) to process POS sales.'
      );
    }

    if (
      requiredCapability === 'manage_catalogue' &&
      !actorPerms.some((p) =>
        [
          'manage_products',
          'manage_catalogue',
          'manage_inventory',
          'adjust_inventory',
          'adjust_stock',
        ].includes(p)
      )
    ) {
      throw new Error(
        'FORBIDDEN_MISSING_PERMISSION: User lacks permission (manage_products / adjust_inventory) for catalogue or stock operations.'
      );
    }

    return actor;
  }

  // ===========================================================================
  // 3. PLATFORM ADMINISTRATION & BUSINESS PROVISIONING
  // ===========================================================================
  async provisionBusinessAndOwner(
    actorUserId: string,
    input: ProvisionBusinessCloudInput,
    ownerInitialPasswordSecret = 'SmartMind#Owner2026'
  ): Promise<{ business: DbBusiness; owner: DbUser; isIdempotentReplay: boolean }> {
    this.assertNetworkAvailable();
    const actor = this.getVerifiedActor(actorUserId);

    if (actor.role !== 'platform_admin') {
      this.recordAudit({
        businessId: actor.business_id,
        userId: actor.id,
        userName: actor.full_name,
        action: 'unauthorized_business_provisioning_attempt',
        entityType: 'business',
        entityId: 'NEW',
      });
      throw new Error(
        'FORBIDDEN: Only an authorized Platform Administrator can provision a business.'
      );
    }

    if (!input.idempotencyKey || !input.idempotencyKey.trim()) {
      throw new Error('VALIDATION_ERROR: idempotencyKey is required for business provisioning.');
    }

    const existingReplay = this.provisioningIdempotencyMap.get(input.idempotencyKey);
    if (existingReplay) {
      return {
        business: { ...existingReplay.business },
        owner: { ...existingReplay.owner },
        isIdempotentReplay: true,
      };
    }

    const cleanOwnerEmail = input.ownerEmail.trim().toLowerCase();
    const existingOwnerWithEmail = Array.from(this.users.values()).find(
      (u) => u.email.toLowerCase() === cleanOwnerEmail
    );
    if (existingOwnerWithEmail) {
      throw new Error(
        `CONFLICT_DUPLICATE_EMAIL: Email "${cleanOwnerEmail}" is already assigned to another account.`
      );
    }

    const nowIso = new Date().toISOString();
    const businessId =
      input.businessId || `biz-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const ownerUserId =
      input.ownerUserId || `usr-owner-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    if (this.businesses.has(businessId)) {
      throw new Error(`CONFLICT: Business ID "${businessId}" already exists.`);
    }

    const business: DbBusiness = {
      id: businessId,
      name: input.name.trim(),
      legal_name: input.legalName?.trim() || input.name.trim(),
      business_type: input.businessType.trim(),
      registration_number: `RC-${Date.now().toString().slice(-6)}`,
      tax_identification_number: `TIN-${Date.now().toString().slice(-8)}`,
      owner_user_id: ownerUserId,
      owner_name: input.ownerName.trim(),
      owner_email: cleanOwnerEmail,
      contact_email: input.contactEmail.trim().toLowerCase(),
      primary_phone: input.primaryPhone.trim(),
      headquarters_address: input.headquartersAddress.trim(),
      currency_code: input.currencyCode || 'NGN',
      currency_symbol: input.currencySymbol || '₦',
      default_tax_rate_percent: input.defaultTaxRatePercent ?? 7.5,
      status: 'active',
      notes: input.notes,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const owner: DbUser = {
      id: ownerUserId,
      business_id: businessId,
      username: cleanOwnerEmail.split('@')[0],
      email: cleanOwnerEmail,
      full_name: input.ownerName.trim(),
      role: 'business_owner',
      role_label: `Business Owner (${business.name})`,
      permissions_json: JSON.stringify(ROLE_DEFAULT_PERMISSIONS.business_owner),
      status: 'active',
      created_at: nowIso,
      last_login_at: nowIso,
    };

    this.businesses.set(business.id, business);
    this.registerAuthAccount(owner, ownerInitialPasswordSecret, []);
    this.provisioningIdempotencyMap.set(input.idempotencyKey, { business, owner });

    this.recordAudit({
      businessId: business.id,
      userId: actor.id,
      userName: actor.full_name,
      action: 'business_and_primary_owner_provisioned',
      entityType: 'business',
      entityId: business.id,
      details: {
        businessName: business.name,
        ownerUserId: owner.id,
        ownerEmail: owner.email,
        idempotencyKey: input.idempotencyKey,
      },
    });

    return {
      business: { ...business },
      owner: { ...owner },
      isIdempotentReplay: false,
    };
  }

  /**
   * Enforces the Single Primary Owner constraint on the backend.
   * A business cannot have more than one active `business_owner`.
   */
  async assignOrTransferPrimaryOwner(
    actorUserId: string,
    businessId: string,
    newOwnerInput: { userId?: string; fullName: string; email: string },
    options?: { allowOwnershipTransfer?: boolean; initialPasswordSecret?: string }
  ): Promise<DbUser> {
    this.assertNetworkAvailable();
    const actor = this.getVerifiedActor(actorUserId);

    if (actor.role !== 'platform_admin') {
      throw new Error(
        'FORBIDDEN: Only a Platform Administrator can assign or transfer primary business ownership.'
      );
    }

    const business = this.businesses.get(businessId);
    if (!business) {
      throw new Error(`NOT_FOUND: Business "${businessId}" does not exist.`);
    }

    const existingOwners = Array.from(this.users.values()).filter(
      (u) =>
        u.business_id === businessId &&
        u.role === 'business_owner' &&
        u.status === 'active'
    );

    if (existingOwners.length > 0 && !options?.allowOwnershipTransfer) {
      this.recordAudit({
        businessId,
        userId: actor.id,
        userName: actor.full_name,
        action: 'duplicate_primary_owner_rejected',
        entityType: 'business',
        entityId: businessId,
        details: {
          existingOwnerId: existingOwners[0].id,
          attemptedOwnerEmail: newOwnerInput.email,
        },
      });
      throw new Error(
        `SINGLE_PRIMARY_OWNER_CONSTRAINT: Business "${business.name}" (${businessId}) already has a designated primary owner (${existingOwners[0].email}). Multiple primary owners are prohibited.`
      );
    }

    const nowIso = new Date().toISOString();
    // If explicit ownership transfer is authorized, demote previous primary owner to shop_manager
    if (existingOwners.length > 0 && options?.allowOwnershipTransfer) {
      for (const prevOwner of existingOwners) {
        this.users.set(prevOwner.id, {
          ...prevOwner,
          role: 'shop_manager',
          role_label: 'Former Owner (Shop Manager)',
        });
      }
    }

    const newOwnerId =
      newOwnerInput.userId || `usr-owner-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const cleanEmail = newOwnerInput.email.trim().toLowerCase();

    const newOwner: DbUser = {
      id: newOwnerId,
      business_id: businessId,
      username: cleanEmail.split('@')[0],
      email: cleanEmail,
      full_name: newOwnerInput.fullName.trim(),
      role: 'business_owner',
      role_label: `Business Owner (${business.name})`,
      permissions_json: JSON.stringify(ROLE_DEFAULT_PERMISSIONS.business_owner),
      status: 'active',
      created_at: nowIso,
      last_login_at: nowIso,
    };

    const bizShopIds = Array.from(this.shops.values())
      .filter((s) => s.business_id === businessId)
      .map((s) => s.id);

    this.registerAuthAccount(
      newOwner,
      options?.initialPasswordSecret || 'SmartMind#Owner2026',
      bizShopIds
    );

    this.businesses.set(businessId, {
      ...business,
      owner_user_id: newOwner.id,
      owner_name: newOwner.full_name,
      owner_email: newOwner.email,
      updated_at: nowIso,
    });

    this.recordAudit({
      businessId,
      userId: actor.id,
      userName: actor.full_name,
      action: 'primary_owner_assigned',
      entityType: 'user',
      entityId: newOwner.id,
      details: { email: newOwner.email, transfer: Boolean(options?.allowOwnershipTransfer) },
    });

    return { ...newOwner };
  }

  /**
   * Create a shop under a business (Platform Admin or that business's Primary Owner)
   */
  async createShop(
    actorUserId: string,
    businessId: string,
    input: {
      id?: string;
      code: string;
      name: string;
      category: string;
      locationCity: string;
      address: string;
      phone: string;
      terminalId?: string;
      taxRatePercent?: number;
    }
  ): Promise<DbShop> {
    this.assertNetworkAvailable();
    const actor = this.getVerifiedActor(actorUserId);

    const isAuthorized =
      actor.role === 'platform_admin' ||
      (actor.role === 'business_owner' && actor.business_id === businessId);

    if (!isAuthorized) {
      throw new Error(
        'FORBIDDEN: Only the Business Owner or Platform Administrator can create shops for this business.'
      );
    }

    const business = this.businesses.get(businessId);
    if (!business) {
      throw new Error(`NOT_FOUND: Business "${businessId}" does not exist.`);
    }

    const nowIso = new Date().toISOString();
    const shopId = input.id || `shop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const shop: DbShop = {
      id: shopId,
      business_id: businessId,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      category: input.category.trim(),
      location_city: input.locationCity.trim(),
      address: input.address.trim(),
      phone: input.phone.trim(),
      manager_name: business.owner_name,
      status: 'active',
      terminal_id: input.terminalId || `WIN-POS-${input.code.trim().toUpperCase()}`,
      tax_rate_percent: input.taxRatePercent ?? business.default_tax_rate_percent,
      receipt_header_note: `${input.name.trim()} — Official Receipt`,
      receipt_footer_note: 'Thank you for your patronage',
      created_at: nowIso,
      updated_at: nowIso,
    };

    this.shops.set(shop.id, shop);

    this.recordAudit({
      businessId,
      shopId: shop.id,
      userId: actor.id,
      userName: actor.full_name,
      action: 'shop_created',
      entityType: 'shop',
      entityId: shop.id,
      details: { code: shop.code, name: shop.name },
    });

    return { ...shop };
  }

  /**
   * Invite or create staff member (Shop Manager or Cashier) with verified shop assignments.
   * Never allows creating a second primary owner (`business_owner`) or `platform_admin`.
   */
  async inviteStaff(
    actorUserId: string,
    businessId: string,
    input: InviteStaffCloudInput,
    initialPasswordSecret = 'SmartMind#Staff2026'
  ): Promise<DbUser> {
    this.assertNetworkAvailable();
    const actor = this.getVerifiedActor(actorUserId);

    const isAuthorized =
      actor.role === 'platform_admin' ||
      (actor.role === 'business_owner' && actor.business_id === businessId);

    if (!isAuthorized) {
      throw new Error(
        'FORBIDDEN: Only the Business Owner or Platform Administrator can provision staff accounts.'
      );
    }

    if ((input.role as string) === 'business_owner' || (input.role as string) === 'platform_admin') {
      throw new Error(
        'FORBIDDEN_ROLE_ESCALATION: Staff invitations can only assign shop_manager or cashier roles.'
      );
    }

    const cleanEmail = input.email.trim().toLowerCase();
    if (isReservedPlatformAdminEmail(cleanEmail)) {
      throw new Error(
        'FORBIDDEN_ROLE_BOUNDARY: Platform Administrator email cannot be invited as tenant staff.'
      );
    }

    const staffId =
      input.userId || `usr-staff-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (this.users.has(staffId)) {
      throw new Error(
        `CONFLICT_EXISTING_USER: User ID "${staffId}" already exists and cannot be overwritten.`
      );
    }

    const existingByEmail = Array.from(this.users.values()).find(
      (u) => u.email.toLowerCase() === cleanEmail
    );
    if (existingByEmail) {
      throw new Error(
        `CONFLICT_DUPLICATE_EMAIL: Email "${cleanEmail}" is already registered to another user.`
      );
    }

    for (const shopId of input.assignedShopIds) {
      this.assertShopRelationship(businessId, shopId);
    }

    const nowIso = new Date().toISOString();

    const defaultPerms =
      input.role === 'shop_manager'
        ? ROLE_DEFAULT_PERMISSIONS.shop_manager
        : ROLE_DEFAULT_PERMISSIONS.cashier;

    const staffUser: DbUser = {
      id: staffId,
      business_id: businessId,
      username: cleanEmail.split('@')[0],
      email: cleanEmail,
      full_name: input.fullName.trim(),
      role: input.role,
      role_label:
        input.roleLabel ||
        (input.role === 'shop_manager' ? 'Shop Manager' : 'Cashier'),
      permissions_json: JSON.stringify(input.permissions ?? defaultPerms),
      status: 'active',
      created_at: nowIso,
      last_login_at: nowIso,
    };

    this.registerAuthAccount(staffUser, initialPasswordSecret, input.assignedShopIds);

    this.recordAudit({
      businessId,
      userId: actor.id,
      userName: actor.full_name,
      action: 'staff_invited',
      entityType: 'user',
      entityId: staffUser.id,
      details: {
        role: staffUser.role,
        assignedShopIds: input.assignedShopIds,
      },
    });

    return { ...staffUser };
  }

  /**
   * Server-side user profile update. Strictly blocks privilege self-escalation!
   */
  async updateUserProfileOrRole(
    actorUserId: string,
    targetUserId: string,
    updates: {
      fullName?: string;
      role?: UserRole;
      assignedShopIds?: string[];
      permissions?: PermissionKey[];
      status?: 'active' | 'suspended';
    }
  ): Promise<DbUser> {
    this.assertNetworkAvailable();
    const actor = this.getVerifiedActor(actorUserId);
    const target = this.users.get(targetUserId);
    if (!target) {
      throw new Error(`NOT_FOUND: User "${targetUserId}" not found.`);
    }

    // Block any attempt by a non-owner / non-admin to modify roles, permissions, status, or shop assignments
    const isAttemptingPrivilegeChange =
      (updates.role !== undefined && updates.role !== target.role) ||
      updates.assignedShopIds !== undefined ||
      updates.permissions !== undefined ||
      updates.status !== undefined;

    if (isAttemptingPrivilegeChange) {
      const canAdministerTarget =
        actor.role === 'platform_admin' ||
        (actor.role === 'business_owner' &&
          actor.business_id === target.business_id &&
          actor.id !== target.id);

      if (!canAdministerTarget) {
        this.recordAudit({
          businessId: actor.business_id,
          userId: actor.id,
          userName: actor.full_name,
          action: 'privilege_escalation_blocked',
          entityType: 'user',
          entityId: targetUserId,
          details: { attemptedUpdates: updates },
        });
        throw new Error(
          'FORBIDDEN_PRIVILEGE_ESCALATION: Users cannot elevate their own role, shop assignments, or permissions.'
        );
      }
    }

    if (updates.role === 'business_owner' && target.role !== 'business_owner') {
      throw new Error(
        'SINGLE_PRIMARY_OWNER_CONSTRAINT: Cannot promote a secondary user to primary business_owner.'
      );
    }

    if (updates.assignedShopIds) {
      for (const shopId of updates.assignedShopIds) {
        this.assertShopRelationship(target.business_id, shopId);
      }
      // Replace assignments
      for (const [key, asgn] of this.assignments.entries()) {
        if (asgn.user_id === targetUserId) {
          this.assignments.delete(key);
        }
      }
      for (const shopId of updates.assignedShopIds) {
        const id = `asgn-${targetUserId}-${shopId}`;
        this.assignments.set(id, {
          id,
          user_id: targetUserId,
          business_id: target.business_id,
          shop_id: shopId,
          assigned_at: new Date().toISOString(),
          assigned_by_user_id: actor.id,
          is_active: 1,
        });
      }
    }

    const updated: DbUser = {
      ...target,
      full_name: updates.fullName?.trim() || target.full_name,
      role: updates.role || target.role,
      permissions_json: updates.permissions
        ? JSON.stringify(updates.permissions)
        : target.permissions_json,
      status: updates.status || target.status,
      password_hash: undefined,
    };
    this.users.set(targetUserId, updated);

    this.recordAudit({
      businessId: target.business_id,
      userId: actor.id,
      userName: actor.full_name,
      action: 'user_profile_or_role_updated',
      entityType: 'user',
      entityId: targetUserId,
      details: updates,
    });

    return { ...updated };
  }

  // ===========================================================================
  // 4. AUTHORIZED CLOUD READ QUERIES (ENFORCING ROLE & TENANT BOUNDARIES)
  // ===========================================================================
  async getShopSalesForActor(
    actorUserId: string,
    businessId: string,
    shopId: string
  ): Promise<DbSale[]> {
    this.assertNetworkAvailable();
    this.assertOperationalShopAccess(actorUserId, businessId, shopId, 'read_pos');
    return Array.from(this.sales.values()).filter(
      (s) => s.business_id === businessId && s.shop_id === shopId
    );
  }

  async getShopProductsForActor(
    actorUserId: string,
    businessId: string,
    shopId: string
  ): Promise<Array<Omit<DbProduct, 'cost_price_kobo'> & { cost_price_kobo?: number }>> {
    this.assertNetworkAvailable();
    const actor = this.assertOperationalShopAccess(
      actorUserId,
      businessId,
      shopId,
      'read_pos'
    );
    const products = Array.from(this.products.values()).filter(
      (p) => p.business_id === businessId && p.shop_id === shopId
    );

    // Cashiers cannot access cost prices unless explicitly authorized
    if (actor.role === 'cashier') {
      return products.map((p) => {
        const clone = { ...p } as Omit<DbProduct, 'cost_price_kobo'> & {
          cost_price_kobo?: number;
        };
        delete clone.cost_price_kobo;
        return clone;
      });
    }
    return products.map((p) => ({ ...p }));
  }

  async getBusinessSalesForOwner(
    actorUserId: string,
    businessId: string
  ): Promise<DbSale[]> {
    this.assertNetworkAvailable();
    const actor = this.getVerifiedActor(actorUserId);
    if (actor.role !== 'business_owner' || actor.business_id !== businessId) {
      throw new Error(
        'FORBIDDEN: Consolidated business-wide sales are restricted to the Business Owner of that business.'
      );
    }
    return Array.from(this.sales.values()).filter(
      (s) => s.business_id === businessId
    );
  }

  // ===========================================================================
  // 5. ATOMIC STOCK-VALIDATED SYNCHRONIZATION ENDPOINT
  // ===========================================================================
  async processSyncOperation(
    req: CloudSyncEndpointRequest
  ): Promise<CloudSyncEndpointResponse> {
    this.assertNetworkAvailable();

    // Serialize all cloud sync mutations through mutex lock to prevent race conditions
    const previousLock = this.txMutex;
    let releaseLock: () => void;
    this.txMutex = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    await previousLock;

    try {
      // 0. Hard Quarantine & Demo Guard — never allow quarantined or pre-Firebase test records into cloud state
      const quarantineCheck = checkQuarantinedOrDemoSyncOperation({
        operationId: req.operationId,
        entityId: req.entityId,
        businessId: req.businessId,
        shopId: req.shopId,
      });
      if (quarantineCheck.blocked) {
        return {
          outcome: 'rejected_unauthorized',
          status: 'failed',
          errorMessage: quarantineCheck.reason,
        };
      }

      // 1. Verify authenticated user & permission for businessId + shopId
      let actor: DbUser;
      try {
        actor = this.assertOperationalShopAccess(
          req.actorUserId,
          req.businessId,
          req.shopId,
          req.entityType === 'sale' ? 'process_sale' : 'manage_catalogue'
        );
      } catch (authErr: any) {
        return {
          outcome: 'rejected_unauthorized',
          status: 'failed',
          errorMessage: authErr?.message || 'Unauthorized sync operation.',
        };
      }

      // 2. Check Idempotency Ledger (prevent duplicate sales / double stock deduction)
      const existingOp = this.syncOperations.get(req.idempotencyKey);
      if (existingOp) {
        if (existingOp.outcome === 'acknowledged') {
          return {
            outcome: 'acknowledged',
            status: 'synced',
            ackId: existingOp.ackId,
            syncedAt: existingOp.processedAt,
            isDuplicateReplay: true,
          };
        }
        return {
          outcome: existingOp.outcome,
          status:
            existingOp.outcome === 'conflict_requires_review'
              ? 'requires_review'
              : 'failed',
          conflictReason: existingOp.conflictReason,
          isDuplicateReplay: true,
        };
      }

      const nowIso = new Date().toISOString();

      // 3. Process Sale Operation with Atomic Stock Validation
      if (req.entityType === 'sale' && req.operationType === 'create') {
        const sale = req.payload.sale;
        const items = req.payload.items ?? [];
        const payment = req.payload.payment;

        if (!sale || items.length === 0) {
          return {
            outcome: 'conflict_requires_review',
            status: 'requires_review',
            conflictReason: 'Malformed sale sync payload: missing sale or line items.',
          };
        }

        if (sale.business_id !== req.businessId || sale.shop_id !== req.shopId) {
          return {
            outcome: 'rejected_unauthorized',
            status: 'failed',
            errorMessage: 'Sale payload tenant identifiers do not match request scope.',
          };
        }

        if (sale.status !== 'completed') {
          return {
            outcome: 'rejected_unauthorized',
            status: 'failed',
            errorMessage:
              'FORBIDDEN_INVALID_INITIAL_SALE_STATUS: Newly synchronized sales must have status "completed".',
          };
        }

        if (
          actor.role !== 'business_owner' &&
          sale.cashier_user_id !== actor.id
        ) {
          return {
            outcome: 'rejected_unauthorized',
            status: 'failed',
            errorMessage:
              'FORBIDDEN_CASHIER_IDENTITY_MISMATCH: Operator cannot synchronize a sale attributed to a different cashierUserId.',
          };
        }

        if (Number(sale.discount_amount_kobo || 0) > 0 && actor.role !== 'business_owner') {
          let actorPerms: string[] = [];
          try {
            actorPerms = JSON.parse(actor.permissions_json || '[]');
          } catch {
            actorPerms = [];
          }
          if (!actorPerms.some((p) => ['apply_discounts', 'apply_discount'].includes(p))) {
            return {
              outcome: 'rejected_unauthorized',
              status: 'failed',
              errorMessage:
                'FORBIDDEN_MISSING_PERMISSION: User lacks permission (apply_discounts) to synchronize discounted sales.',
            };
          }
        }

        // Validate line-item quantities and monetary totals before stock deduction
        let computedSubtotalKobo = 0;
        for (const line of items) {
          if (
            !Number.isInteger(line.quantity) ||
            line.quantity <= 0 ||
            !Number.isInteger(line.unit_price_kobo) ||
            line.unit_price_kobo < 0 ||
            !Number.isInteger(line.line_total_kobo) ||
            line.line_total_kobo !== line.unit_price_kobo * line.quantity
          ) {
            const reason = `Invalid line item math or quantity for product "${line.product_name}".`;
            this.recordConflictOp(req, actor, reason, nowIso);
            return {
              outcome: 'conflict_requires_review',
              status: 'requires_review',
              conflictReason: reason,
            };
          }
          computedSubtotalKobo += line.line_total_kobo;
        }

        const expectedTotalKobo =
          computedSubtotalKobo -
          Number(sale.discount_amount_kobo || 0) +
          Number(sale.tax_amount_kobo || 0);
        if (
          sale.subtotal_kobo !== computedSubtotalKobo ||
          sale.total_amount_kobo !== expectedTotalKobo ||
          sale.total_amount_kobo < 0
        ) {
          const reason = `Sale monetary total mismatch: expected subtotal=${computedSubtotalKobo}, total=${expectedTotalKobo}.`;
          this.recordConflictOp(req, actor, reason, nowIso);
          return {
            outcome: 'conflict_requires_review',
            status: 'requires_review',
            conflictReason: reason,
          };
        }

        const isValidTenderChange =
          sale.payment_method === 'credit' ||
          (Number.isInteger(sale.amount_tendered_kobo) &&
            Number.isInteger(sale.change_due_kobo) &&
            sale.amount_tendered_kobo >= sale.total_amount_kobo &&
            sale.change_due_kobo ===
              sale.amount_tendered_kobo - sale.total_amount_kobo);
        if (!isValidTenderChange) {
          const reason = `Sale tender/change arithmetic mismatch: total=${sale.total_amount_kobo}, tendered=${sale.amount_tendered_kobo}, changeDue=${sale.change_due_kobo}.`;
          this.recordConflictOp(req, actor, reason, nowIso);
          return {
            outcome: 'conflict_requires_review',
            status: 'requires_review',
            conflictReason: reason,
          };
        }

        // Validate current cloud stock for every line item BEFORE deducting anything
        for (const line of items) {
          const cloudProduct = this.products.get(line.product_id);
          if (!cloudProduct || cloudProduct.shop_id !== req.shopId) {
            const reason = `Product "${line.product_name}" (${line.sku}) not found in cloud shop catalogue.`;
            this.recordConflictOp(req, actor, reason, nowIso);
            return {
              outcome: 'conflict_requires_review',
              status: 'requires_review',
              conflictReason: reason,
            };
          }

          if (cloudProduct.stock_quantity < line.quantity) {
            const reason = `Stock conflict for "${cloudProduct.name}" (${cloudProduct.sku}): cloud stock is ${cloudProduct.stock_quantity}, offline sale requested ${line.quantity}. Preserved local sale for manager review.`;
            this.recordConflictOp(req, actor, reason, nowIso);
            return {
              outcome: 'conflict_requires_review',
              status: 'requires_review',
              conflictReason: reason,
            };
          }
        }

        // All items have sufficient stock — atomically deduct stock and commit sale
        for (const line of items) {
          const cloudProduct = this.products.get(line.product_id)!;
          const previousQty = cloudProduct.stock_quantity;
          const newQty = previousQty - line.quantity;

          this.products.set(cloudProduct.id, {
            ...cloudProduct,
            stock_quantity: newQty,
            updated_at: nowIso,
          });

          this.inventoryMovements.push({
            id: `cloud-mov-${sale.id}-${line.product_id}`,
            shop_id: req.shopId,
            business_id: req.businessId,
            product_id: line.product_id,
            product_name: line.product_name,
            product_sku: line.sku,
            type: 'sale_deduction',
            quantity_delta: -line.quantity,
            previous_quantity: previousQty,
            new_quantity: newQty,
            reason: `Cloud Synced Sale ${sale.receipt_number}`,
            reference_id: sale.id,
            performed_by_user_id: actor.id,
            performed_by_name: actor.full_name,
            created_at: nowIso,
          });
        }

        const ackId = `ack-${req.idempotencyKey}-${Date.now()}`;
        const syncedSale: DbSale = {
          ...sale,
          is_synced: 1,
          synced_at: nowIso,
          sync_ack_id: ackId,
        };

        this.sales.set(syncedSale.id, syncedSale);
        this.saleItems.set(syncedSale.id, items.map((i) => ({ ...i })));
        if (payment) {
          this.payments.push({ ...payment });
        }

        const opRecord: CloudSyncOperationRecord = {
          id: req.idempotencyKey,
          businessId: req.businessId,
          shopId: req.shopId,
          entityType: 'sale',
          entityId: sale.id,
          operationType: 'create',
          actorUserId: actor.id,
          outcome: 'acknowledged',
          ackId,
          schemaVersion: req.schemaVersion,
          processedAt: nowIso,
        };
        this.syncOperations.set(req.idempotencyKey, opRecord);

        this.recordAudit({
          businessId: req.businessId,
          shopId: req.shopId,
          userId: actor.id,
          userName: actor.full_name,
          action: 'cloud_sale_synced',
          entityType: 'sale',
          entityId: sale.id,
          details: {
            receiptNumber: sale.receipt_number,
            idempotencyKey: req.idempotencyKey,
            ackId,
          },
        });

        if (this.omitServerAcknowledgement) {
          // Simulate lost/missing server acknowledgement on wire
          return {
            outcome: 'acknowledged',
            status: 'failed',
            ackId: undefined,
            syncedAt: nowIso,
          };
        }

        return {
          outcome: 'acknowledged',
          status: 'synced',
          ackId,
          syncedAt: nowIso,
        };
      }

      // Authorized product, category, or inventory_movement sync (SEC-10: reject unsupported operations or missing payloads)
      if (
        req.entityType === 'product' &&
        (req.operationType === 'create' || req.operationType === 'update') &&
        req.payload?.product
      ) {
        this.products.set(req.entityId, { ...req.payload.product });
      } else if (
        req.entityType === 'category' &&
        (req.operationType === 'create' || req.operationType === 'update') &&
        req.payload?.category
      ) {
        this.categories.set(req.entityId, { ...req.payload.category });
      } else if (
        req.entityType === 'inventory_movement' &&
        (req.operationType === 'create' || req.operationType === 'adjust') &&
        req.payload?.movement
      ) {
        this.inventoryMovements.push({ ...req.payload.movement });
      } else {
        return {
          outcome: 'rejected_unauthorized',
          status: 'failed',
          errorMessage: `UNSUPPORTED_SYNC_OPERATION: Operation "${req.entityType}:${req.operationType}" is not supported or is missing a valid entity payload.`,
        };
      }

      const ackId = `ack-${req.idempotencyKey}-${Date.now()}`;
      this.syncOperations.set(req.idempotencyKey, {
        id: req.idempotencyKey,
        businessId: req.businessId,
        shopId: req.shopId,
        entityType: req.entityType,
        entityId: req.entityId,
        operationType: req.operationType,
        actorUserId: actor.id,
        outcome: 'acknowledged',
        ackId,
        schemaVersion: req.schemaVersion,
        processedAt: nowIso,
      });

      return {
        outcome: 'acknowledged',
        status: this.omitServerAcknowledgement ? 'failed' : 'synced',
        ackId: this.omitServerAcknowledgement ? undefined : ackId,
        syncedAt: nowIso,
      };
    } finally {
      releaseLock!();
    }
  }

  private recordConflictOp(
    req: CloudSyncEndpointRequest,
    actor: DbUser,
    conflictReason: string,
    nowIso: string
  ): void {
    const opRecord: CloudSyncOperationRecord = {
      id: req.idempotencyKey,
      businessId: req.businessId,
      shopId: req.shopId,
      entityType: req.entityType,
      entityId: req.entityId,
      operationType: req.operationType,
      actorUserId: actor.id,
      outcome: 'conflict_requires_review',
      conflictReason,
      schemaVersion: req.schemaVersion,
      processedAt: nowIso,
    };
    this.syncOperations.set(req.idempotencyKey, opRecord);

    this.recordAudit({
      businessId: req.businessId,
      shopId: req.shopId,
      userId: actor.id,
      userName: actor.full_name,
      action: 'cloud_sync_stock_conflict',
      entityType: req.entityType,
      entityId: req.entityId,
      details: {
        idempotencyKey: req.idempotencyKey,
        conflictReason,
      },
    });
  }

  private recordAudit(params: {
    businessId: string;
    shopId?: string;
    userId: string;
    userName: string;
    action: string;
    entityType: string;
    entityId: string;
    details?: Record<string, unknown>;
  }): void {
    this.auditEvents.push({
      id: `cloud-aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      business_id: params.businessId,
      shop_id: params.shopId,
      user_id: params.userId,
      user_name: params.userName,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      details_json: params.details ? JSON.stringify(params.details) : undefined,
      created_at: new Date().toISOString(),
    });
  }

  getCloudAuditEvents(businessId?: string): DbAuditEvent[] {
    if (!businessId) return [...this.auditEvents];
    return this.auditEvents.filter((a) => a.business_id === businessId);
  }

  getCloudProduct(productId: string): DbProduct | null {
    return this.products.get(productId) ?? null;
  }

  getCloudSalesForShop(shopId: string): DbSale[] {
    return Array.from(this.sales.values()).filter((s) => s.shop_id === shopId);
  }
}
