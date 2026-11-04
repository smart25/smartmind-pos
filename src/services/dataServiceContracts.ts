/**
 * SmartMind POS — Phase 1 & Phase 2 Service & Repository Contracts
 *
 * This module defines the explicit architectural separation between:
 * 1. Platform & Tenant Repository Interface (Ready for Firebase Auth, Cloud Functions & Firestore)
 * 2. Local Desktop Persistence Service (Future Electron IPC + SQLite durable storage)
 * 3. Cloud Synchronization Service (Future Firebase Cloud Firestore sync queue)
 *
 * IMPORTANT (Phase 2 Foundation):
 * In Phase 2, workflows execute against the Mock Data Repository in memory.
 * Frontend permission checks and demo role switching are for workflow verification
 * and do not replace production server-side Firebase Security Rules / Cloud Functions.
 */

import {
  AccountStatus,
  Business,
  BusinessStatus,
  ConnectivitySnapshot,
  Product,
  ProductCategory,
  SaleTransaction,
  Shop,
  ShopAssignment,
  ShopStatus,
  StockAdjustment,
  UnitOfMeasurement,
  User,
} from '../types/pos';
import {
  CreateBusinessInput,
  CreateShopInput,
  CreateStaffInput,
} from '../utils/posCalculations';

export interface PosPlatformRepositoryContract {
  readonly repositoryMode: 'mock-memory-repository' | 'firebase-cloud-firestore';
  getBusinessesForActor(actor: User): Business[];
  getShopsForBusiness(actor: User, businessId: string): Shop[];
  getStaffForBusiness(actor: User, businessId: string): User[];
  getShopAssignmentsForBusiness(actor: User, businessId: string): ShopAssignment[];
  createBusinessWithPrimaryOwner(
    actor: User,
    input: CreateBusinessInput
  ): { business: Business; ownerUser: User };
  updateBusiness(
    actor: User,
    businessId: string,
    input: CreateBusinessInput
  ): Business;
  setBusinessStatus(
    actor: User,
    businessId: string,
    nextStatus: BusinessStatus
  ): Business;
  createShopForBusiness(
    actor: User,
    businessId: string,
    input: CreateShopInput
  ): {
    shop: Shop;
    defaultCategories: ProductCategory[];
    defaultUnits: UnitOfMeasurement[];
  };
  updateShop(
    actor: User,
    businessId: string,
    shopId: string,
    input: CreateShopInput
  ): Shop;
  setShopStatus(
    actor: User,
    businessId: string,
    shopId: string,
    nextStatus: ShopStatus
  ): Shop;
  createStaffMember(
    actor: User,
    businessId: string,
    input: CreateStaffInput
  ): { user: User; assignments: ShopAssignment[] };
  updateStaffMember(
    actor: User,
    businessId: string,
    userId: string,
    input: CreateStaffInput,
    status: AccountStatus
  ): { user: User; assignments: ShopAssignment[] };
}

export interface LocalSqliteStorageContract {
  readonly engineName: 'sqlite3-electron-ipc' | 'phase1-in-memory-demo';
  readonly isDurableStorageActive: boolean;
  getDatabaseFilePath(): string;
  getShopProducts(businessId: string, shopId: string): Promise<Product[]>;
  getShopCategories(businessId: string, shopId: string): Promise<ProductCategory[]>;
  getShopSales(businessId: string, shopId: string): Promise<SaleTransaction[]>;
  getShopStockAdjustments(businessId: string, shopId: string): Promise<StockAdjustment[]>;
}

export interface CloudSyncServiceContract {
  readonly providerName: 'firebase-cloud-firestore' | 'phase1-unconnected-demo';
  readonly isCloudSyncActive: boolean;
  getConnectivitySnapshot(): ConnectivitySnapshot;
}

export const PHASE_5_ARCHITECTURE_STATUS = {
  phase: 'Phase 5 — Persistent Local Database & Offline-Ready Data Layer',
  desktopRuntime: 'Browser Preview (Active) • Electron Desktop SQLite Engine (Prepared for Windows)',
  localDatabase: 'IndexedDB Browser Persistent Adapter (Active) / Local SQLite Desktop Adapter',
  cloudBackend: 'Phase 6 Sync Foundation Ready (Local Durable sync_queue Enqueued)',
  shopIsolationRule: 'Strict businessId + shopId partitioning enforced in SQLite schema and database adapter',
  monetaryStandard: 'Integer minor units (Kobo) for decimal-safe financial calculations',
  transactionEngine: '10-Step Atomic Transaction with Idempotency Key (SaleFinalizationService)',
};

export const PHASE_1_ARCHITECTURE_STATUS = PHASE_5_ARCHITECTURE_STATUS;


export interface DemoStoreState {
  businesses: Business[];
  users: User[];
  shops: Shop[];
  shopAssignments: ShopAssignment[];
  categories: ProductCategory[];
  units: UnitOfMeasurement[];
  products: Product[];
  stockAdjustments: StockAdjustment[];
  sales: SaleTransaction[];
}
