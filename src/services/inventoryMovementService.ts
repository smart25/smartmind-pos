import { DatabaseAdapter } from '../db/databaseAdapter';
import {
  DbAuditEvent,
  DbInventoryMovement,
  DbProduct,
  DbSyncQueueEntry,
} from '../db/schema';
import { StockAdjustmentType, User } from '../types/pos';

export interface RecordInventoryMovementRequest {
  businessId: string;
  shopId: string;
  productId: string;
  type: StockAdjustmentType;
  quantity: number;
  reason: string;
  actor: User;
  createdAt: string;
  referenceId?: string;
  operationId?: string;
  productSnapshot?: DbProduct;
}

export interface RecordInventoryMovementResult {
  product: DbProduct;
  movement: DbInventoryMovement;
}

/** Persists an inventory change, its audit event and its cloud operation atomically. */
export class InventoryMovementService {
  constructor(private readonly adapter: DatabaseAdapter) {}

  async record(
    request: RecordInventoryMovementRequest
  ): Promise<RecordInventoryMovementResult> {
    const { businessId, shopId, productId, actor, createdAt } = request;
    if (!actor || actor.status !== 'active' || actor.businessId !== businessId) {
      throw new Error('INVENTORY_FORBIDDEN: An active user in this business is required.');
    }
    if (actor.role !== 'business_owner' && !actor.assignedShopIds.includes(shopId)) {
      throw new Error('INVENTORY_FORBIDDEN: User is not assigned to this shop.');
    }
    if (!Number.isSafeInteger(request.quantity) || request.quantity === 0 || (request.type !== 'audit_correction' && request.quantity < 0)) {
      throw new Error(request.type === 'audit_correction'
        ? 'INVALID_QUANTITY: Audit correction must be a non-zero whole-number adjustment.'
        : 'INVALID_QUANTITY: Quantity must be a positive whole number.');
    }
    if (!request.reason.trim()) {
      throw new Error('INVALID_REASON: A reason is required for stock adjustments.');
    }

    const operationId = request.operationId || `adj-${productId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const delta = request.type === 'damage_spoilage' || request.type === 'sale_deduction'
      ? -request.quantity
      : request.quantity;

    return this.adapter.runTransaction(async (tx) => {
      let current = await tx.getProduct(productId);
      if (!current && request.productSnapshot) {
        const snapshot = request.productSnapshot;
        if (snapshot.id === productId && snapshot.business_id === businessId && snapshot.shop_id === shopId) {
          current = snapshot;
          await tx.saveProduct(snapshot);
        }
      }
      if (!current || current.business_id !== businessId || current.shop_id !== shopId) {
        throw new Error('PRODUCT_NOT_FOUND: Product does not belong to the active shop.');
      }
      const nextQuantity = current.stock_quantity + delta;
      if (!Number.isSafeInteger(nextQuantity) || nextQuantity < 0) {
        throw new Error(`INSUFFICIENT_STOCK: Current stock is ${current.stock_quantity}; requested change is ${delta}.`);
      }

      const movement: DbInventoryMovement = {
        id: operationId,
        business_id: businessId,
        shop_id: shopId,
        product_id: productId,
        product_name: current.name,
        product_sku: current.sku,
        type: request.type,
        quantity_delta: delta,
        previous_quantity: current.stock_quantity,
        new_quantity: nextQuantity,
        reason: request.reason.trim(),
        reference_id: request.referenceId,
        performed_by_user_id: actor.id,
        performed_by_name: actor.fullName,
        created_at: createdAt,
      };
      const updatedProduct = { ...current, stock_quantity: nextQuantity, updated_at: createdAt };
      await tx.updateProductStock(productId, nextQuantity, createdAt);
      await tx.saveInventoryMovement(movement);

      const audit: DbAuditEvent = {
        id: `aud-${operationId}`,
        business_id: businessId,
        shop_id: shopId,
        user_id: actor.id,
        user_name: actor.fullName,
        action: 'inventory_movement_recorded',
        entity_type: 'inventory_movement',
        entity_id: operationId,
        details_json: JSON.stringify({ productId, type: request.type, quantityDelta: delta, previousQuantity: current.stock_quantity, newQuantity: nextQuantity }),
        created_at: createdAt,
      };
      await tx.saveAuditEvent(audit);

      const queueEntry: DbSyncQueueEntry = {
        id: `sync-${operationId}`,
        business_id: businessId,
        shop_id: shopId,
        entity_type: 'inventory_movement',
        entity_id: operationId,
        operation_type: 'adjust',
        payload_json: JSON.stringify({ movement }),
        created_at: createdAt,
        retry_count: 0,
        status: 'pending',
        idempotency_key: `idem-${operationId}`,
        schema_version: 6,
        actor_user_id: actor.id,
      };
      await tx.enqueueSync(queueEntry);
      return { product: updatedProduct, movement };
    });
  }
}
