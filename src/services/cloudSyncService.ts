/**
 * SmartMind POS — Phase 6: Multi-Shop Cloud Synchronization & Consolidation Service
 *
 * Extends the Phase 5 sync_queue architecture with:
 * - 10-step verified synchronization workflow
 * - Idempotent replay safety (never creates duplicate sales or double stock deductions)
 * - Verified server acknowledgement requirement before marking local records synced
 * - Non-destructive stock conflict handling (preserves completed local sale and flags 'requires_review')
 * - Strict multi-account cache & queue isolation on user switch / sign-out
 * - Deduplicated Business Owner consolidated reporting across local and cloud data
 */

import { DatabaseAdapter } from '../db/databaseAdapter';
import {
  DbSale,
  DbSyncQueueEntry,
  fromMinorUnits,
} from '../db/schema';
import { User } from '../types/pos';
import {
  CloudBackendService,
  CloudSyncEndpointRequest,
} from './cloudBackendService';
import {
  PRE_FIREBASE_QUARANTINE_REASON,
  SPECIFIED_PRE_FIREBASE_SALE_ID_SET,
  SPECIFIED_PRE_FIREBASE_SYNC_ID_SET,
  isKnownDemoRecord,
  isPreFirebaseTestRecord,
} from './liveFirestoreDataService';

export type GranularSyncClassification =
  | 'local_pending'
  | 'syncing'
  | 'cloud_confirmed'
  | 'failed_retryable'
  | 'requires_review';

export interface SyncBatchRunSummary {
  processedCount: number;
  syncedCount: number;
  failedRetryableCount: number;
  requiresReviewCount: number;
  quarantinedCount?: number;
  skippedUnauthorizedScopeCount: number;
  entries: DbSyncQueueEntry[];
}

export interface ShopSyncQueueBreakdown {
  shopId?: string;
  businessId: string;
  localPendingCount: number;
  syncingCount: number;
  syncedCount: number;
  failedRetryableCount: number;
  requiresReviewCount: number;
  quarantinedCount?: number;
  conflicts: Array<{
    syncEntryId: string;
    entityId: string;
    entityType: string;
    shopId: string;
    conflictReason: string;
    createdAt: string;
  }>;
}

export interface ConsolidatedSaleRecord {
  sale: DbSale;
  totalAmountNaira: number;
  syncClassification: GranularSyncClassification;
  syncAckId?: string;
  conflictReason?: string;
}

export interface ConsolidatedBusinessReport {
  businessId: string;
  totalRevenueNaira: number;
  totalTransactionsCount: number;
  cloudConfirmedRevenueNaira: number;
  cloudConfirmedCount: number;
  localPendingRevenueNaira: number;
  localPendingCount: number;
  requiresReviewCount: number;
  failedRetryableCount: number;
  sales: ConsolidatedSaleRecord[];
}

export class CloudSyncService {
  private activeActor: User | null = null;
  private accountSessionCache = new Map<string, unknown>();

  constructor(
    private adapter: DatabaseAdapter,
    private cloudBackend: CloudBackendService
  ) {}

  // ===========================================================================
  // ACCOUNT SWITCH & MULTI-TENANT CACHE ISOLATION
  // ===========================================================================
  setActiveActor(user: User | null): void {
    // Always purge in-memory session cache on account change or sign-out
    this.accountSessionCache.clear();
    this.activeActor = user ? { ...user, password: undefined } : null;
  }

  getActiveActor(): User | null {
    return this.activeActor ? { ...this.activeActor } : null;
  }

  clearSessionCache(): void {
    this.accountSessionCache.clear();
  }

  private assertActorMatchesScope(
    actor: User,
    businessId: string,
    shopId?: string
  ): void {
    if (actor.status !== 'active') {
      throw new Error('FORBIDDEN: Active user account is suspended.');
    }
    if (actor.role === 'platform_admin') {
      throw new Error(
        'FORBIDDEN: Platform Administrator cannot access operational shop sync queues or sales.'
      );
    }
    if (actor.businessId !== businessId) {
      throw new Error(
        `FORBIDDEN_CROSS_BUSINESS: Active user belongs to "${actor.businessId}", cannot access "${businessId}".`
      );
    }
    if (
      shopId &&
      actor.role !== 'business_owner' &&
      !actor.assignedShopIds.includes(shopId)
    ) {
      throw new Error(
        `FORBIDDEN_UNASSIGNED_SHOP: Active user is not assigned to shop "${shopId}".`
      );
    }
  }

  // ===========================================================================
  // AUTHORIZED LOCAL QUERIES (PREVENTING CROSS-ACCOUNT CACHE BLEED)
  // ===========================================================================
  async getAuthorizedLocalSales(
    actor: User,
    businessId: string,
    shopId: string
  ): Promise<DbSale[]> {
    this.assertActorMatchesScope(actor, businessId, shopId);
    return this.adapter.getSales({ businessId, shopId });
  }

  async getSyncQueueBreakdown(
    actor: User,
    businessId: string,
    shopId?: string
  ): Promise<ShopSyncQueueBreakdown> {
    this.assertActorMatchesScope(actor, businessId, shopId);

    const allEntries = this.adapter.getAllSyncQueue
      ? await this.adapter.getAllSyncQueue(shopId, businessId)
      : await this.adapter.getPendingSyncQueue(shopId);

    // Filter strictly to actor's authorized shops
    const scopedEntries = allEntries.filter((e) => {
      if (e.business_id !== businessId) return false;
      if (shopId && e.shop_id !== shopId) return false;
      if (
        actor.role !== 'business_owner' &&
        !actor.assignedShopIds.includes(e.shop_id)
      ) {
        return false;
      }
      return true;
    });

    let localPendingCount = 0;
    let syncingCount = 0;
    let syncedCount = 0;
    let failedRetryableCount = 0;
    let requiresReviewCount = 0;
    let quarantinedCount = 0;
    const conflicts: ShopSyncQueueBreakdown['conflicts'] = [];

    for (const entry of scopedEntries) {
      if (entry.status === 'quarantined') {
        quarantinedCount += 1;
      } else if (entry.status === 'pending') localPendingCount += 1;
      else if (entry.status === 'processing') syncingCount += 1;
      else if (entry.status === 'synced') syncedCount += 1;
      else if (entry.status === 'failed') failedRetryableCount += 1;
      else if (entry.status === 'requires_review') {
        requiresReviewCount += 1;
        conflicts.push({
          syncEntryId: entry.id,
          entityId: entry.entity_id,
          entityType: entry.entity_type,
          shopId: entry.shop_id,
          conflictReason:
            entry.conflict_reason ||
            entry.error_summary ||
            'Requires manager/owner conflict review.',
          createdAt: entry.created_at,
        });
      }
    }

    return {
      shopId,
      businessId,
      localPendingCount,
      syncingCount,
      syncedCount,
      failedRetryableCount,
      requiresReviewCount,
      quarantinedCount,
      conflicts,
    };
  }

  // ===========================================================================
  // 10-STEP SYNCHRONIZATION ENGINE
  // ===========================================================================
  async syncPendingOperations(
    actor: User,
    options?: { shopId?: string }
  ): Promise<SyncBatchRunSummary> {
    if (!actor || actor.status !== 'active') {
      throw new Error('UNAUTHORIZED: Active authenticated user is required to run synchronization.');
    }

    const allQueue = this.adapter.getAllSyncQueue
      ? await this.adapter.getAllSyncQueue(options?.shopId)
      : await this.adapter.getPendingSyncQueue(options?.shopId);

    // Select candidate entries in 'pending' or 'failed' (retryable) states;
    // 'quarantined' entries are permanently excluded from production sync attempts.
    const candidates = allQueue.filter(
      (e) =>
        (e.status === 'pending' || e.status === 'failed') &&
        e.status !== ('quarantined' as any)
    );

    let processedCount = 0;
    let syncedCount = 0;
    let failedRetryableCount = 0;
    let requiresReviewCount = 0;
    let quarantinedCount = 0;
    let skippedUnauthorizedScopeCount = 0;
    const updatedEntries: DbSyncQueueEntry[] = [];

    for (const entry of candidates) {
      // STEP 0: Quarantine Guard — never synchronize pre-Firebase test records or demo records
      if (
        SPECIFIED_PRE_FIREBASE_SYNC_ID_SET.has(entry.id) ||
        SPECIFIED_PRE_FIREBASE_SALE_ID_SET.has(entry.entity_id) ||
        isPreFirebaseTestRecord(entry) ||
        isKnownDemoRecord(entry)
      ) {
        const qAt = entry.quarantined_at || new Date().toISOString();
        await this.adapter.updateSyncStatus(
          entry.id,
          'quarantined',
          PRE_FIREBASE_QUARANTINE_REASON,
          {
            errorSummary: PRE_FIREBASE_QUARANTINE_REASON,
            conflictReason: PRE_FIREBASE_QUARANTINE_REASON,
            quarantinedAt: qAt,
            quarantineReason: PRE_FIREBASE_QUARANTINE_REASON,
          }
        );
        quarantinedCount += 1;
        continue;
      }

      // STEP 1: Validate operation structure, schema version, and sensitive-field hygiene
      if (
        !entry.id ||
        !entry.business_id ||
        !entry.shop_id ||
        !entry.entity_id ||
        !entry.payload_json
      ) {
        await this.adapter.updateSyncStatus(
          entry.id,
          'requires_review',
          'Malformed sync queue entry structure.',
          { conflictReason: 'Malformed sync queue entry structure.' }
        );
        requiresReviewCount += 1;
        continue;
      }

      if (
        entry.payload_json.includes('"password"') ||
        entry.payload_json.includes('"password_hash"')
      ) {
        await this.adapter.updateSyncStatus(
          entry.id,
          'requires_review',
          'Security quarantine: payload contains prohibited credential fields.',
          {
            conflictReason:
              'Security quarantine: payload contains prohibited credential fields.',
          }
        );
        requiresReviewCount += 1;
        continue;
      }

      let parsedPayload: Record<string, any>;
      try {
        parsedPayload = JSON.parse(entry.payload_json);
      } catch {
        await this.adapter.updateSyncStatus(
          entry.id,
          'requires_review',
          'Invalid JSON payload in sync queue.',
          { conflictReason: 'Invalid JSON payload in sync queue.' }
        );
        requiresReviewCount += 1;
        continue;
      }

      // STEP 2: Confirm authenticated user's authorization for the operation's business and shop
      // If the queue contains records from a previous user session (different business),
      // isolate them completely unless an explicit single-shop sync was forced against an unauthorized shop.
      if (entry.business_id !== actor.businessId) {
        if (options?.shopId && options.shopId === entry.shop_id) {
          // Explicit attempt by actor to sync another business's shop -> quarantine
          await this.adapter.updateSyncStatus(
            entry.id,
            'requires_review',
            'Permission mismatch: operation businessId does not match authenticated user business.',
            {
              conflictReason:
                'Permission mismatch: operation businessId does not match authenticated user business.',
            }
          );
          requiresReviewCount += 1;
        } else {
          skippedUnauthorizedScopeCount += 1;
        }
        continue;
      }

      if (
        actor.role !== 'business_owner' &&
        !actor.assignedShopIds.includes(entry.shop_id)
      ) {
        if (options?.shopId && options.shopId === entry.shop_id) {
          await this.adapter.updateSyncStatus(
            entry.id,
            'requires_review',
            `Permission mismatch: user is not assigned to shop ${entry.shop_id}.`,
            {
              conflictReason: `Permission mismatch: user is not assigned to shop ${entry.shop_id}.`,
            }
          );
          requiresReviewCount += 1;
        } else {
          skippedUnauthorizedScopeCount += 1;
        }
        continue;
      }

      processedCount += 1;

      // STEP 3: Use stable operation ID and idempotency key
      const idempotencyKey =
        entry.idempotency_key ||
        parsedPayload?.sale?.idempotency_key ||
        `idem-${entry.id}`;
      const schemaVersion = entry.schema_version ?? 6;

      // STEP 4: Transition to 'processing' (Syncing) and upload through trusted endpoint
      await this.adapter.updateSyncStatus(entry.id, 'processing');

      const request: CloudSyncEndpointRequest = {
        operationId: entry.id,
        idempotencyKey,
        schemaVersion,
        actorUserId: actor.id,
        businessId: entry.business_id,
        shopId: entry.shop_id,
        entityType: entry.entity_type,
        entityId: entry.entity_id,
        operationType: entry.operation_type,
        payload: parsedPayload,
      };

      try {
        // STEP 5: Validate stock and server-side constraints via trusted cloud backend
        const response = await this.cloudBackend.processSyncOperation(request);

        if (response.outcome === 'acknowledged') {
          // STEP 6 & 7: Verify server acknowledgement before marking synced!
          if (!response.ackId) {
            await this.adapter.updateSyncStatus(
              entry.id,
              'failed',
              'Missing server acknowledgement (ackId). Operation retained for retry.'
            );
            failedRetryableCount += 1;
            continue;
          }

          const ackTime = response.syncedAt || new Date().toISOString();
          await this.adapter.updateSyncStatus(entry.id, 'synced', undefined, {
            cloudAckId: response.ackId,
            acknowledgedAt: ackTime,
          });

          // Mark local sale as synced while preserving all historical details
          if (entry.entity_type === 'sale') {
            const existingSale = await this.adapter.getSale(entry.entity_id);
            if (existingSale) {
              const items = await this.adapter.getSaleItems(existingSale.id);
              await this.adapter.saveSale(
                {
                  ...existingSale,
                  is_synced: 1,
                  synced_at: ackTime,
                  sync_ack_id: response.ackId,
                },
                items
              );
            }
          }

          syncedCount += 1;
        } else if (response.outcome === 'conflict_requires_review') {
          // STEP 10: Stock conflict — preserve completed local sale and flag 'requires_review'
          const reason =
            response.conflictReason ||
            'Stock conflict detected during cloud synchronization.';

          await this.adapter.updateSyncStatus(entry.id, 'requires_review', reason, {
            conflictReason: reason,
          });

          if (entry.entity_type === 'sale') {
            const existingSale = await this.adapter.getSale(entry.entity_id);
            if (existingSale) {
              const items = await this.adapter.getSaleItems(existingSale.id);
              // Preserve the local completed sale! Never erase it.
              await this.adapter.saveSale(
                {
                  ...existingSale,
                  is_synced: 0,
                  sync_conflict_reason: reason,
                },
                items
              );
            }
          }

          await this.adapter.saveAuditEvent({
            id: `aud-conflict-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            business_id: entry.business_id,
            shop_id: entry.shop_id,
            user_id: actor.id,
            user_name: actor.fullName,
            action: 'sync_stock_conflict_flagged',
            entity_type: entry.entity_type,
            entity_id: entry.entity_id,
            details_json: JSON.stringify({
              syncEntryId: entry.id,
              idempotencyKey,
              conflictReason: reason,
            }),
            created_at: new Date().toISOString(),
          });

          requiresReviewCount += 1;
        } else {
          // STEP 9: Permission failure or business/shop mismatch -> quarantine as requires_review
          const reason =
            response.errorMessage ||
            'Unauthorized sync operation quarantined for review.';
          await this.adapter.updateSyncStatus(entry.id, 'requires_review', reason, {
            conflictReason: reason,
          });
          requiresReviewCount += 1;
        }
      } catch (networkOrServerErr: any) {
        // STEP 8: Temporary / network failure — retain local record, increment retry_count, mark 'failed'
        const errMsg =
          networkOrServerErr?.message || 'Temporary network error during sync.';
        await this.adapter.updateSyncStatus(entry.id, 'failed', errMsg, {
          errorSummary: errMsg,
        });
        failedRetryableCount += 1;
      }
    }

    const finalEntries = this.adapter.getAllSyncQueue
      ? await this.adapter.getAllSyncQueue(options?.shopId, actor.businessId)
      : await this.adapter.getPendingSyncQueue(options?.shopId);

    updatedEntries.push(...finalEntries);

    return {
      processedCount,
      syncedCount,
      failedRetryableCount,
      requiresReviewCount,
      quarantinedCount,
      skippedUnauthorizedScopeCount,
      entries: updatedEntries,
    };
  }

  // ===========================================================================
  // DEDUPLICATED BUSINESS OWNER CONSOLIDATED REPORTING
  // ===========================================================================
  async getConsolidatedBusinessReport(
    actor: User,
    businessId: string,
    shopIds: string[]
  ): Promise<ConsolidatedBusinessReport> {
    if (actor.role !== 'business_owner' || actor.businessId !== businessId) {
      throw new Error(
        'FORBIDDEN: Only the Business Owner of this business can access consolidated multi-shop reports.'
      );
    }

    // 1. Collect all local sales across the business's shops
    const localSales: DbSale[] = [];
    for (const shopId of shopIds) {
      const shopSales = await this.adapter.getSales({ businessId, shopId });
      localSales.push(...shopSales);
    }

    // 2. Collect all sync queue entries for this business to classify local states accurately
    const syncEntries = this.adapter.getAllSyncQueue
      ? await this.adapter.getAllSyncQueue(undefined, businessId)
      : [];
    const syncEntryByEntityId = new Map<string, DbSyncQueueEntry>();
    for (const entry of syncEntries) {
      if (entry.entity_type === 'sale') {
        syncEntryByEntityId.set(entry.entity_id, entry);
      }
    }

    // 3. Collect cloud-confirmed sales for this business (if reachable)
    let cloudSales: DbSale[] = [];
    try {
      cloudSales = await this.cloudBackend.getBusinessSalesForOwner(
        actor.id,
        businessId
      );
    } catch {
      // Offline fallback: cloud sales unavailable, rely on local records
      cloudSales = [];
    }

    // 4. Deduplicate sales by id, idempotency_key, and (shop_id + receipt_number)
    // so a sale that exists both locally and in the cloud is NEVER double-counted!
    const seenSaleIds = new Set<string>();
    const seenIdempotencyKeys = new Set<string>();
    const seenShopReceipts = new Set<string>();
    const mergedSales: ConsolidatedSaleRecord[] = [];

    // First index cloud-confirmed sales (authoritative synced state)
    for (const cloudSale of cloudSales) {
      if (cloudSale.status !== 'completed') continue;
      if (isKnownDemoRecord(cloudSale) || isPreFirebaseTestRecord(cloudSale)) {
        continue;
      }
      const receiptKey = `${cloudSale.shop_id}::${cloudSale.receipt_number}`;
      seenSaleIds.add(cloudSale.id);
      if (cloudSale.idempotency_key) {
        seenIdempotencyKeys.add(cloudSale.idempotency_key);
      }
      seenShopReceipts.add(receiptKey);

      mergedSales.push({
        sale: cloudSale,
        totalAmountNaira: fromMinorUnits(cloudSale.total_amount_kobo),
        syncClassification: 'cloud_confirmed',
        syncAckId: cloudSale.sync_ack_id,
      });
    }

    // Next merge local sales that are NOT already represented in cloudSales and NOT quarantined
    for (const localSale of localSales) {
      if (localSale.status !== 'completed') continue;
      if (isKnownDemoRecord(localSale) || isPreFirebaseTestRecord(localSale)) {
        continue;
      }
      if (localSale.sync_conflict_reason === PRE_FIREBASE_QUARANTINE_REASON) {
        continue;
      }
      const syncEntry = syncEntryByEntityId.get(localSale.id);
      if (syncEntry && syncEntry.status === 'quarantined') {
        continue;
      }

      const receiptKey = `${localSale.shop_id}::${localSale.receipt_number}`;

      const isDuplicate =
        seenSaleIds.has(localSale.id) ||
        (localSale.idempotency_key &&
          seenIdempotencyKeys.has(localSale.idempotency_key)) ||
        seenShopReceipts.has(receiptKey);

      if (isDuplicate) {
        continue;
      }

      seenSaleIds.add(localSale.id);
      if (localSale.idempotency_key) {
        seenIdempotencyKeys.add(localSale.idempotency_key);
      }
      seenShopReceipts.add(receiptKey);

      let classification: GranularSyncClassification = 'local_pending';

      if (localSale.is_synced === 1 && localSale.sync_ack_id) {
        classification = 'cloud_confirmed';
      } else if (syncEntry) {
        if (syncEntry.status === 'processing') {
          classification = 'syncing';
        } else if (syncEntry.status === 'requires_review') {
          classification = 'requires_review';
        } else if (syncEntry.status === 'failed') {
          classification = 'failed_retryable';
        } else if (syncEntry.status === 'synced' && syncEntry.cloud_ack_id) {
          classification = 'cloud_confirmed';
        }
      }

      mergedSales.push({
        sale: localSale,
        totalAmountNaira: fromMinorUnits(localSale.total_amount_kobo),
        syncClassification: classification,
        syncAckId: localSale.sync_ack_id || syncEntry?.cloud_ack_id,
        conflictReason:
          localSale.sync_conflict_reason || syncEntry?.conflict_reason,
      });
    }

    // 5. Compute totals without double counting
    let totalRevenueNaira = 0;
    let cloudConfirmedRevenueNaira = 0;
    let cloudConfirmedCount = 0;
    let localPendingRevenueNaira = 0;
    let localPendingCount = 0;
    let requiresReviewCount = 0;
    let failedRetryableCount = 0;

    for (const item of mergedSales) {
      totalRevenueNaira =
        Math.round((totalRevenueNaira + item.totalAmountNaira) * 100) / 100;

      if (item.syncClassification === 'cloud_confirmed') {
        cloudConfirmedRevenueNaira =
          Math.round((cloudConfirmedRevenueNaira + item.totalAmountNaira) * 100) /
          100;
        cloudConfirmedCount += 1;
      } else if (item.syncClassification === 'requires_review') {
        requiresReviewCount += 1;
        localPendingRevenueNaira =
          Math.round((localPendingRevenueNaira + item.totalAmountNaira) * 100) /
          100;
        localPendingCount += 1;
      } else if (item.syncClassification === 'failed_retryable') {
        failedRetryableCount += 1;
        localPendingRevenueNaira =
          Math.round((localPendingRevenueNaira + item.totalAmountNaira) * 100) /
          100;
        localPendingCount += 1;
      } else {
        localPendingRevenueNaira =
          Math.round((localPendingRevenueNaira + item.totalAmountNaira) * 100) /
          100;
        localPendingCount += 1;
      }
    }

    return {
      businessId,
      totalRevenueNaira,
      totalTransactionsCount: mergedSales.length,
      cloudConfirmedRevenueNaira,
      cloudConfirmedCount,
      localPendingRevenueNaira,
      localPendingCount,
      requiresReviewCount,
      failedRetryableCount,
      sales: mergedSales,
    };
  }
}
