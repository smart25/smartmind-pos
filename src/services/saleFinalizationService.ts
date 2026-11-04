/**
 * SmartMind POS — Phase 5: Reliable Sale Finalization Service
 *
 * Implements a concurrency-safe, transactional 10-step sale finalization workflow.
 * Uses an idempotency key (checkoutOperationId) to prevent duplicate sales or
 * multiple stock deductions when checkouts are retried.
 */

import { DatabaseAdapter } from '../db/databaseAdapter';
import {
  DbAuditEvent,
  DbInventoryMovement,
  DbPayment,
  DbProduct,
  DbSale,
  DbSaleItem,
  DbSyncQueueEntry,
  fromMinorUnits,
  toMinorUnits,
} from '../db/schema';
import {
  CartItem,
  PaymentMethod,
  SaleTransaction,
  User,
} from '../types/pos';
import { hasPermission } from '../utils/posCalculations';
import {
  DataEnvironmentMode,
  isKnownDemoRecord,
  isPreFirebaseTestRecord,
} from './liveFirestoreDataService';

export interface FinalizeSaleRequest {
  saleId?: string;
  dataMode?: DataEnvironmentMode;
  businessId: string;
  shopId: string;
  user: User;
  cart: CartItem[];
  paymentMethod: PaymentMethod;
  discountAmount: number;
  taxRatePercent: number;
  taxAmount: number;
  totalAmount: number;
  amountTendered: number;
  paymentReference?: string;
  creditCustomerId?: string;
  creditCustomerName?: string;
  creditCustomerPhone?: string;
  notes?: string;
  terminalId?: string;
  /**
   * Idempotency key (e.g. checkoutOperationId generated at start of checkout).
   * Prevents repeated submissions from creating duplicate sales or deducting stock twice.
   */
  checkoutOperationId?: string;
  receiptNumber?: string;
}

export interface FinalizeSaleResult {
  success: boolean;
  sale: SaleTransaction;
  isIdempotentReplay?: boolean;
  error?: string;
}

export class SaleFinalizationService {
  constructor(private adapter: DatabaseAdapter) {}

  async finalizeSale(request: FinalizeSaleRequest): Promise<FinalizeSaleResult> {
    const {
      businessId,
      shopId,
      user,
      cart,
      paymentMethod,
      discountAmount,
      taxRatePercent,
      taxAmount,
      totalAmount,
      amountTendered,
      paymentReference,
      creditCustomerId,
      creditCustomerName,
      creditCustomerPhone,
      notes,
      terminalId = 'TERM-01',
      checkoutOperationId,
    } = request;

    // STEP 0: Quarantine & Environment Mode Guard (never allow demo or pre-Firebase test tenants into persistent sync_queue)
    if (
      request.dataMode === 'demo' ||
      !businessId ||
      !shopId ||
      isKnownDemoRecord({ id: user?.id, businessId, shopId }) ||
      isPreFirebaseTestRecord({
        id: request.saleId,
        businessId,
        shopId,
      })
    ) {
      throw new Error(
        'QUARANTINE_GUARD: Demo or pre-Firebase test tenants cannot write to the persistent production sale and sync queue.'
      );
    }

    // STEP 1: Authorization validation
    if (!user || !user.id || user.id === 'unauthenticated' || user.status !== 'active') {
      throw new Error('User account is suspended, inactive, or unauthenticated.');
    }
    if (user.role === 'platform_admin') {
      throw new Error('Platform Administrator cannot finalize operational shop sales.');
    }
    if (user.businessId !== businessId) {
      throw new Error('Cross-business access is strictly prohibited.');
    }
    if (user.role !== 'business_owner') {
      if (!hasPermission(user, 'process_sales')) {
        throw new Error('User does not have permission to process sales.');
      }
      if (!user.assignedShopIds.includes(shopId)) {
        throw new Error('User is not authorized for this shop.');
      }
    }

    // Verify that the business and shop are registered in local DB or use verified live tenant IDs
    const isLivePrefixed =
      businessId.startsWith('biz-live-') &&
      (shopId.startsWith('shop-live-') || shopId.startsWith('shp-live-'));
    if (!isLivePrefixed) {
      const registeredBiz = await this.adapter.getBusiness(businessId);
      const registeredShop = await this.adapter.getShop(shopId);
      if (
        !registeredBiz ||
        !registeredShop ||
        registeredShop.business_id !== businessId
      ) {
        throw new Error(
          `UNVERIFIED_LIVE_TENANT: Cannot queue production sale for unverified business/shop tenant (${businessId} / ${shopId}).`
        );
      }
    }

    // Validate cart
    if (!cart || cart.length === 0) {
      throw new Error('Cannot finalize an empty cart.');
    }

    // Check for existing sale with the same idempotency key (prevent duplicate sales on network retries)
    if (checkoutOperationId) {
      const existing = await this.adapter.getSaleByIdempotencyKey(checkoutOperationId);
      if (existing) {
        const items = await this.adapter.getSaleItems(existing.id);
        const mappedSale = this.mapDbSaleToDomain(existing, items);
        return {
          success: true,
          sale: mappedSale,
          isIdempotentReplay: true,
        };
      }
    }

    // Financial calculations validation
    const computedSubtotal = cart.reduce(
      (sum, item) => sum + item.product.sellingPrice * item.quantity,
      0
    );
    const expectedSubtotal = Math.round(computedSubtotal * 100) / 100;
    const cleanDiscount = Math.max(0, Math.round(discountAmount * 100) / 100);
    const cleanTax = Math.max(0, Math.round(taxAmount * 100) / 100);
    const cleanTotal = Math.round(totalAmount * 100) / 100;
    const computedTotal = Math.round((expectedSubtotal - cleanDiscount + cleanTax) * 100) / 100;

    if (Math.abs(computedTotal - cleanTotal) > 0.05) {
      throw new Error(
        `Financial mismatch: Total ${cleanTotal} does not match subtotal ${expectedSubtotal} - discount ${cleanDiscount} + tax ${cleanTax} (expected ${computedTotal}).`
      );
    }

    const isCredit = paymentMethod === 'credit';
    const effectiveTendered = isCredit ? 0 : amountTendered;
    const changeDue = isCredit ? 0 : Math.max(0, Math.round((effectiveTendered - cleanTotal) * 100) / 100);

    if (!isCredit && effectiveTendered < cleanTotal) {
      throw new Error(
        `Insufficient tender: Amount tendered (₦${effectiveTendered}) is less than total amount (₦${cleanTotal}).`
      );
    }

    const nowIso = new Date().toISOString();
    const saleId =
      request.saleId ||
      `sale-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const receiptNum =
      request.receiptNumber ||
      `REC-${shopId.slice(-4).toUpperCase()}-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

    // RUN ATOMIC DATABASE TRANSACTION
    return await this.adapter.runTransaction<FinalizeSaleResult>(async (tx) => {
      // Concurrency-safe stock validation & product reservation
      const productsToUpdate: { product: DbProduct; newStock: number; qtyDeducted: number }[] = [];

      for (const item of cart) {
        if (item.quantity <= 0) {
          throw new Error(`Invalid item quantity for "${item.product.name}": ${item.quantity}`);
        }

        const freshProduct = await tx.getProduct(item.product.id);
        if (!freshProduct) {
          throw new Error(`Product not found in shop database: ${item.product.name}`);
        }
        if (freshProduct.shop_id !== shopId) {
          throw new Error(
            `Shop partition violation: Product "${freshProduct.name}" does not belong to shop "${shopId}".`
          );
        }
        if (freshProduct.is_active !== 1) {
          throw new Error(`Product "${freshProduct.name}" is deactivated and cannot be sold.`);
        }
        if (freshProduct.stock_quantity < item.quantity) {
          throw new Error(
            `Insufficient stock for "${freshProduct.name}". Available: ${freshProduct.stock_quantity}, Requested: ${item.quantity}.`
          );
        }

        const newStock = freshProduct.stock_quantity - item.quantity;
        productsToUpdate.push({
          product: freshProduct,
          newStock,
          qtyDeducted: item.quantity,
        });
      }

      // 1. Create Sale Record
      const dbSale: DbSale = {
        id: saleId,
        shop_id: shopId,
        business_id: businessId,
        receipt_number: receiptNum,
        terminal_id: terminalId,
        cashier_user_id: user.id,
        cashier_name: user.fullName,
        created_at: nowIso,
        subtotal_kobo: toMinorUnits(expectedSubtotal),
        discount_amount_kobo: toMinorUnits(cleanDiscount),
        tax_rate_percent: taxRatePercent,
        tax_amount_kobo: toMinorUnits(cleanTax),
        total_amount_kobo: toMinorUnits(cleanTotal),
        amount_tendered_kobo: toMinorUnits(effectiveTendered),
        change_due_kobo: toMinorUnits(changeDue),
        payment_method: paymentMethod,
        payment_reference: paymentReference,
        credit_customer_id: creditCustomerId,
        credit_customer_name: creditCustomerName,
        credit_customer_phone: creditCustomerPhone,
        status: 'completed',
        notes: notes || (isCredit ? 'Credit Sale' : 'POS Checkout'),
        idempotency_key: checkoutOperationId,
        is_synced: 0,
      };

      await tx.saveSale(dbSale);

      // 2. Create Sale Items Snapshots (immutable historical details)
      const dbSaleItems: DbSaleItem[] = cart.map((item, idx) => ({
        id: `line-${saleId}-${idx + 1}`,
        sale_id: saleId,
        shop_id: shopId,
        business_id: businessId,
        product_id: item.product.id,
        sku: item.product.sku,
        barcode: item.product.barcode || item.product.sku,
        product_name: item.product.name,
        unit: item.product.unit || 'Unit',
        unit_price_kobo: toMinorUnits(item.product.sellingPrice),
        cost_price_kobo: toMinorUnits(item.product.costPrice || 0),
        quantity: item.quantity,
        line_total_kobo: toMinorUnits(item.product.sellingPrice * item.quantity),
      }));

      await tx.saveSaleItems(dbSaleItems);

      // 3. Create Payment Record
      const dbPayment: DbPayment = {
        id: `pmt-${saleId}-1`,
        shop_id: shopId,
        business_id: businessId,
        reference_type: 'sale',
        reference_id: saleId,
        amount_kobo: toMinorUnits(cleanTotal),
        payment_method: paymentMethod,
        payment_reference: paymentReference,
        notes: `POS checkout payment for ${receiptNum}`,
        recorded_by_user_id: user.id,
        recorded_by_name: user.fullName,
        created_at: nowIso,
      };

      await tx.savePayment(dbPayment);

      // 4. Update Stock and Record Inventory Movements
      for (const update of productsToUpdate) {
        await tx.updateProductStock(update.product.id, update.newStock, nowIso);

        const movement: DbInventoryMovement = {
          id: `adj-sale-${saleId}-${update.product.id}`,
          shop_id: shopId,
          business_id: businessId,
          product_id: update.product.id,
          product_name: update.product.name,
          product_sku: update.product.sku,
          type: 'sale_deduction',
          quantity_delta: -update.qtyDeducted,
          previous_quantity: update.product.stock_quantity,
          new_quantity: update.newStock,
          reason: `POS Sale Receipt #${receiptNum}`,
          reference_id: saleId,
          performed_by_user_id: user.id,
          performed_by_name: user.fullName,
          created_at: nowIso,
        };

        await tx.saveInventoryMovement(movement);
      }

      // 5. Record Audit Event
      const auditEvent: DbAuditEvent = {
        id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        business_id: businessId,
        shop_id: shopId,
        user_id: user.id,
        user_name: user.fullName,
        action: 'sale_finalized',
        entity_type: 'sale',
        entity_id: saleId,
        details_json: JSON.stringify({
          receiptNumber: receiptNum,
          totalAmount: cleanTotal,
          itemsCount: cart.length,
          paymentMethod,
        }),
        created_at: nowIso,
      };

      await tx.saveAuditEvent(auditEvent);

      // 6. Enqueue Offline Sync Queue Entry (immutable operation)
      const effectiveIdempotencyKey = checkoutOperationId || `op-${saleId}`;
      const syncEntry: DbSyncQueueEntry = {
        id: `sync-${saleId}`,
        business_id: businessId,
        shop_id: shopId,
        entity_type: 'sale',
        entity_id: saleId,
        operation_type: 'create',
        payload_json: JSON.stringify({
          sale: dbSale,
          items: dbSaleItems,
          payment: dbPayment,
        }),
        created_at: nowIso,
        retry_count: 0,
        status: 'pending',
        idempotency_key: effectiveIdempotencyKey,
        schema_version: 6,
        actor_user_id: user.id,
      };

      await tx.enqueueSync(syncEntry);

      const domainSale = this.mapDbSaleToDomain(dbSale, dbSaleItems);
      return {
        success: true,
        sale: domainSale,
      };
    });
  }

  private mapDbSaleToDomain(dbSale: DbSale, items: DbSaleItem[]): SaleTransaction {
    return {
      id: dbSale.id,
      shopId: dbSale.shop_id,
      businessId: dbSale.business_id,
      receiptNumber: dbSale.receipt_number,
      terminalId: dbSale.terminal_id,
      cashierUserId: dbSale.cashier_user_id,
      cashierName: dbSale.cashier_name,
      createdAt: dbSale.created_at,
      items: items.map((i) => ({
        id: i.id,
        productId: i.product_id,
        sku: i.sku,
        barcode: i.barcode,
        productName: i.product_name,
        unit: i.unit,
        unitPrice: fromMinorUnits(i.unit_price_kobo),
        costPrice: fromMinorUnits(i.cost_price_kobo),
        quantity: i.quantity,
        lineTotal: fromMinorUnits(i.line_total_kobo),
      })),
      subtotal: fromMinorUnits(dbSale.subtotal_kobo),
      discountAmount: fromMinorUnits(dbSale.discount_amount_kobo),
      taxRatePercent: dbSale.tax_rate_percent,
      taxAmount: fromMinorUnits(dbSale.tax_amount_kobo),
      totalAmount: fromMinorUnits(dbSale.total_amount_kobo),
      amountTendered: fromMinorUnits(dbSale.amount_tendered_kobo),
      changeDue: fromMinorUnits(dbSale.change_due_kobo),
      paymentMethod: dbSale.payment_method as PaymentMethod,
      paymentReference: dbSale.payment_reference,
      creditCustomerId: dbSale.credit_customer_id,
      creditCustomerName: dbSale.credit_customer_name,
      creditCustomerPhone: dbSale.credit_customer_phone,
      status: dbSale.status === 'completed' ? 'completed_demo' : 'refunded_demo',
      syncStatus: dbSale.is_synced ? 'synced_demo' : 'queued_offline_demo',
      notes: dbSale.notes,
    };
  }
}
