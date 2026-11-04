# SmartMind POS — Phase 6 Security Specification (`security_spec.md`)

## 1. Access Control & Role Boundaries (RBAC)
SmartMind POS enforces four strict role tiers across `/users/{userId}` and `/businesses/{businessId}/**`:

1. **Platform Administrator (`platform_admin`)**:
   - Identified via verified bootstrap admin email (`smartnwokolo@gmail.com`) or `/users/{uid}.role == 'platform_admin'`.
   - Authorized to create and manage `/businesses/{businessId}` documents, assign the single primary owner (`ownerUserId`), and write platform-level `/businesses/{businessId}/audit_events/{eventId}`.
   - **Explicitly Restricted**: Platform Administrators do **not** automatically inherit read/write access to shop POS sales (`/sales/{saleId}`), payments, or shop inventory (`/products/{productId}`).

2. **Business Owner (`business_owner`)**:
   - Bound to a single `businessId` (`getUserData().businessId == businessId`).
   - Full read/write access to all shops (`/businesses/{businessId}/shops/{shopId}`) within their own business, staff profiles within their business, products, sales, sync operations, and consolidated business reports.
   - Cannot access any document belonging to another `businessId`.

3. **Shop Manager (`shop_manager`)**:
   - Bound to a single `businessId` and an explicit list of `assignedShopIds`.
   - Can read/write products, sales, and sync operations **only** for shops where `shopId in getUserData().assignedShopIds`.
   - Cannot access unassigned shops within the same business or any shop in another business.

4. **Cashier (`cashier`)**:
   - Bound to a single `businessId` and an explicit list of `assignedShopIds`.
   - Can read active products and create sales (`status == 'completed'`) and sync operations in assigned shops (`shopId in getUserData().assignedShopIds`).
   - Cannot create or modify businesses, shops, or user roles, and cannot modify product catalogue pricing or perform unrestricted stock adjustments.

## 2. Anti-Privilege Escalation & Immutability Invariants
- Users cannot self-assign `role`, `businessId`, `assignedShopIds`, or `permissions` in `/users/{userId}`.
- Only a Platform Administrator can provision a `business_owner` profile, and only a Business Owner (or Platform Admin for initial owner provisioning) can create or update staff profiles within their business.
- Every business document (`/businesses/{businessId}`) enforces immutable `id` and `createdAt` on update, and `ownerUserId` can only be set by a Platform Administrator.
- Every shop, product, sale, sync operation, and audit event enforces path-to-field consistency (`request.resource.data.businessId == businessId` and `request.resource.data.shopId == shopId`).

## 3. Data Validation & DoS Protection
- All document IDs are validated via `isValidId()` (`^[a-zA-Z0-9_-]{1,128}$`).
- All writes validate required fields with `.keys().hasAll([...])`, prevent arbitrary extra fields with `.keys().hasOnly([...])`, and bound string/list sizes (`.size()`).
- Monetary fields (`costPriceKobo`, `sellingPriceKobo`, `totalAmountKobo`, etc.) are non-negative integers (`is int && >= 0`).
- Audit events and completed sales are append-only (`allow delete: if false`).
