/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  AccountStatus,
  AppView,
  Business,
  BusinessStatus,
  CartItem,
  ConnectivitySnapshot,
  ConnectivityState,
  DebtCustomer,
  DebtTransaction,
  DebtTransactionType,
  Invoice,
  InvoicePaymentRecord,
  InvoiceStatus,
  PaymentMethod,
  PermissionKey,
  Product,
  ProductCategory,
  SaleTransaction,
  Shop,
  ShopAssignment,
  ShopStatus,
  StockAdjustment,
  StockAdjustmentType,
  Supplier,
  SupplierSupplyRecord,
  UnitOfMeasurement,
  User,
  CustomRole,
} from './types/pos';
import {
  CONNECTIVITY_PRESETS,
  DEMO_BUSINESSES,
  DEMO_CATEGORIES,
  DEMO_CUSTOM_ROLES,
  DEMO_DEBT_CUSTOMERS,
  DEMO_DEBT_TRANSACTIONS,
  DEMO_INVOICES,
  DEMO_PRODUCTS,
  DEMO_SALES,
  DEMO_SHOP_ASSIGNMENTS,
  DEMO_SHOPS,
  DEMO_STOCK_ADJUSTMENTS,
  DEMO_SUPPLIERS,
  DEMO_SUPPLIER_SUPPLIES,
  DEMO_UNITS,
  DEMO_USERS,
} from './data/mockPosData';
import {
  applyDebtTransaction,
  applyStockAdjustment,
  applySupplierBalancePayment,
  applySupplierSupply,
  applyUserPasswordReset,
  BASE_CURRENCY_CODE,
  BASE_CURRENCY_SYMBOL,
  calculateReceiptReturnResult,
  canActorResetUserPassword,
  CreateBusinessInput,
  canUserAccessView,
  CreateCustomRoleInput,
  CreateDebtCustomerInput,
  CreateShopInput,
  CreateStaffInput,
  CreateSupplierInput,
  formatCurrency,
  formatPosTimestamp,
  getTodayYmd,
  generateUniqueBusinessId,
  generateUniqueCategoryId,
  generateUniqueDebtCustomerId,
  generateUniqueInvoiceId,
  generateUniqueProductId,
  generateUniqueRoleId,
  generateUniqueShopId,
  generateUniqueSupplierId,
  generateUniqueUnitId,
  generateUniqueUserId,
  getUniqueTimestampSuffix,
  getAuthorizedShopsForUser,
  getCurrencyOptionByCode,
  getDefaultViewForUser,
  getVisibleUsersForActor,
  hasPermission,
  isSyntheticClientUserId,
  isSyntheticOwnerUserId,
  ProductFormInput,
  ROLE_DEFAULT_PERMISSIONS,
  SupplyDraftItem,
} from './utils/posCalculations';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { DataEnvironmentBanner } from './components/layout/DataEnvironmentBanner';
import {
  LoginPage,
  AuthenticatedFirebaseIdentity,
} from './pages/LoginPage';
import { LiveOnboardingPage } from './pages/LiveOnboardingPage';
import { ShopSelectionPage } from './pages/ShopSelectionPage';
import { PlatformAdminPage } from './pages/PlatformAdminPage';
import { DashboardPage } from './pages/DashboardPage';
import { PosPage } from './pages/PosPage';
import { ProductsInventoryPage } from './pages/ProductsInventoryPage';
import { SalesHistoryPage } from './pages/SalesHistoryPage';
import { SalesSummaryPage } from './pages/SalesSummaryPage';
import { DebtBookPage } from './pages/DebtBookPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { ReportsPage } from './pages/ReportsPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { ShopsManagementPage } from './pages/ShopsManagementPage';
import { StaffManagementPage } from './pages/StaffManagementPage';
import { SettingsPage } from './pages/SettingsPage';
import { getDatabaseAdapter } from './db';
import { SaleFinalizationService } from './services/saleFinalizationService';
import { CloudBackendService } from './services/cloudBackendService';
import { CloudSyncService } from './services/cloudSyncService';
import {
  ACTIVE_MODE_STORAGE_KEY,
  auditLocalStorageAndIndexedDb,
  clearDemoDataSafely,
  DataEnvironmentMode,
  DEMO_ISOLATED_STORAGE_KEY,
  isKnownDemoRecord,
  isPreFirebaseTestRecord,
  LiveFirestoreDataService,
  LiveSessionResolutionResult,
  loadUserScopedLiveCache,
  purgeQuarantinedPreFirebaseRecords,
  quarantinePreFirebaseTestSales,
  reconcileInvitedStaffState,
  RepairLiveBusinessOwnerAuthResult,
  saveUserScopedLiveCache,
  SendOwnerPasswordSetupEmailResult,
  StorageAuditReport,
} from './services/liveFirestoreDataService';
import type { PurgeQuarantinedPreFirebaseSalesResult } from './db/databaseAdapter';
import {
  auth,
  firebaseConfig,
  firebaseSignOut,
  onAuthStateChanged,
} from './firebase';

type SessionStage =
  | 'login'
  | 'live_onboarding'
  | 'platform_admin'
  | 'shop_selection'
  | 'workspace';

const LIVE_SESSION_META_KEY = 'smartmind_pos_live_session_meta_v1';

interface PersistedLiveSessionMeta {
  uid: string;
  email: string;
  displayName?: string | null;
  sessionStage: SessionStage;
  activeShopId: string | null;
  activeView: AppView;
  dataMode: DataEnvironmentMode;
  liveStatus: LiveSessionResolutionResult['status'];
}

function loadPersistedLiveSessionMeta(): PersistedLiveSessionMeta | null {
  if (typeof window === 'undefined') return null;
  try {
    const rawSession = window.sessionStorage.getItem(LIVE_SESSION_META_KEY);
    const rawLocal = window.localStorage.getItem(LIVE_SESSION_META_KEY);
    const raw = rawSession || rawLocal;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedLiveSessionMeta;
    if (!parsed || !parsed.uid || !parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePersistedLiveSessionMeta(meta: PersistedLiveSessionMeta): void {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(meta);
    window.sessionStorage.setItem(LIVE_SESSION_META_KEY, serialized);
    window.localStorage.setItem(LIVE_SESSION_META_KEY, serialized);
  } catch {
    // Ignore storage errors
  }
}

function clearPersistedLiveSessionMeta(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(LIVE_SESSION_META_KEY);
    window.localStorage.removeItem(LIVE_SESSION_META_KEY);
  } catch {
    // Ignore storage errors
  }
}

function ensureUniqueIds<T extends { id: string }>(items: T[], prefix: string): T[] {
  const seen = new Set<string>();
  return items.map((item) => {
    let id = item.id;
    if (!id || seen.has(id)) {
      id = `${prefix}-${getUniqueTimestampSuffix()}`;
    }
    seen.add(id);
    return { ...item, id };
  });
}

interface PersistedAppStore {
  businesses: Business[];
  users: User[];
  shops: Shop[];
  shopAssignments: ShopAssignment[];
  categories: ProductCategory[];
  units: UnitOfMeasurement[];
  products: Product[];
  stockAdjustments: StockAdjustment[];
  sales: SaleTransaction[];
  invoices?: Invoice[];
  debtCustomers?: DebtCustomer[];
  debtTransactions?: DebtTransaction[];
  suppliers?: Supplier[];
  supplierSupplies?: SupplierSupplyRecord[];
  customRoles?: CustomRole[];
  currentUserId: string;
  sessionStage: SessionStage;
  activeShopId: string | null;
  activeView: AppView;
  sidebarCollapsed: boolean;
  connectivityState: ConnectivityState;
}

function loadIsolatedDemoStore(): Partial<PersistedAppStore> | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset') === '1') {
      try {
        window.localStorage.removeItem(DEMO_ISOLATED_STORAGE_KEY);
        window.sessionStorage.removeItem(DEMO_ISOLATED_STORAGE_KEY);
      } catch {
        // Ignore storage errors
      }
      return null;
    }
    const rawLocal = window.localStorage.getItem(DEMO_ISOLATED_STORAGE_KEY);
    const rawSession = window.sessionStorage.getItem(DEMO_ISOLATED_STORAGE_KEY);
    const raw = rawLocal || rawSession;
    return raw ? (JSON.parse(raw) as Partial<PersistedAppStore>) : null;
  } catch {
    return null;
  }
}

function determineInitialDataMode(): DataEnvironmentMode {
  if (typeof window === 'undefined') return 'live';
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'demo' || params.get('autostart') === '1') {
      return 'demo';
    }
    if (params.get('mode') === 'live') {
      return 'live';
    }
    const savedMode = window.sessionStorage.getItem(ACTIVE_MODE_STORAGE_KEY);
    if (savedMode === 'demo') return 'demo';
  } catch {
    // Ignore URL/storage errors
  }
  return 'live';
}

const EMPTY_USER_FALLBACK: User = {
  id: 'unauthenticated',
  businessId: '',
  username: 'unauthenticated',
  email: '',
  fullName: 'Unauthenticated Operator',
  role: 'cashier',
  roleLabel: 'Unassigned',
  assignedShopIds: [],
  permissions: [],
  status: 'active',
  createdAt: '',
  lastLoginAt: '',
};

const EMPTY_BUSINESS_FALLBACK: Business = {
  id: '',
  name: 'No Business Assigned',
  legalName: 'No Business Assigned',
  businessType: 'Supermarket & Grocery Chain',
  registrationNumber: '',
  taxIdentificationNumber: '',
  ownerUserId: '',
  ownerName: '',
  ownerEmail: '',
  contactEmail: '',
  primaryPhone: '',
  headquartersAddress: '',
  currencyCode: BASE_CURRENCY_CODE,
  currencySymbol: BASE_CURRENCY_SYMBOL,
  defaultTaxRatePercent: 7.5,
  status: 'active',
  createdAt: '',
};

export default function App() {
  const isAutoStart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [dataMode, setDataMode] = useState<DataEnvironmentMode>(() =>
    determineInitialDataMode()
  );

  const persistedDemo = useMemo(() => loadIsolatedDemoStore(), []);
  const persistedLiveMeta = useMemo(
    () => (dataMode !== 'demo' ? loadPersistedLiveSessionMeta() : null),
    []
  );
  const persistedLiveCache = useMemo(
    () =>
      dataMode !== 'demo' && persistedLiveMeta?.uid
        ? loadUserScopedLiveCache(persistedLiveMeta.uid)
        : null,
    []
  );

  // Phase 5 & Phase 6 Persistent Database Adapter, Atomic Sale Finalization & Cloud Sync Services
  const dbAdapter = useMemo(() => getDatabaseAdapter(), []);
  const saleFinalizationService = useMemo(
    () => new SaleFinalizationService(dbAdapter),
    [dbAdapter]
  );
  const cloudBackendService = useMemo(() => new CloudBackendService(), []);
  const cloudSyncService = useMemo(
    () => new CloudSyncService(dbAdapter, cloudBackendService),
    [dbAdapter, cloudBackendService]
  );
  const liveDataService = useMemo(
    () => new LiveFirestoreDataService(undefined, dbAdapter),
    [dbAdapter]
  );

  const [liveResolution, setLiveResolution] =
    useState<LiveSessionResolutionResult | null>(() => {
      if (dataMode === 'demo' || !persistedLiveMeta) return null;
      const cachedUser =
        persistedLiveCache?.users.find((u) => u.id === persistedLiveMeta.uid) ??
        undefined;
      return {
        status: persistedLiveMeta.liveStatus,
        dataMode: persistedLiveMeta.dataMode,
        uid: persistedLiveMeta.uid,
        email: persistedLiveMeta.email,
        displayName: persistedLiveMeta.displayName || persistedLiveMeta.email,
        user: cachedUser,
        dataset: persistedLiveCache ?? undefined,
        provisioningChecklist: [],
      };
    });
  const [liveErrorMessage, setLiveErrorMessage] = useState<string | null>(null);
  const [isRefreshingLive, setIsRefreshingLive] = useState(false);
  const [storageAudit, setStorageAudit] = useState<StorageAuditReport | null>(
    null
  );
  const restoredUidRef = useRef<string | null>(null);

  useEffect(() => {
    dbAdapter
      .initialize()
      .then(() => quarantinePreFirebaseTestSales(dbAdapter))
      .then(() => auditLocalStorageAndIndexedDb(dbAdapter))
      .then((report) => setStorageAudit(report))
      .catch((err) => {
        console.warn('Persistent database adapter initialized with warning:', err);
      });
  }, [dbAdapter]);

  // Strictly initialize collections:
  // - In 'live' / 'offline_live' mode: restore from authenticated user's isolated live cache if present, NEVER from DEMO_*!
  // - In 'demo' mode: load from isolated demo store or DEMO_* constants.
  const [businesses, setBusinesses] = useState<Business[]>(() =>
    dataMode === 'demo'
      ? persistedDemo?.businesses ?? DEMO_BUSINESSES
      : persistedLiveCache?.businesses ?? []
  );
  const [users, setUsers] = useState<User[]>(() =>
    dataMode === 'demo'
      ? persistedDemo?.users ?? DEMO_USERS
      : persistedLiveCache?.users ?? []
  );
  const [shops, setShops] = useState<Shop[]>(() =>
    dataMode === 'demo'
      ? persistedDemo?.shops ?? DEMO_SHOPS
      : persistedLiveCache?.shops ?? []
  );
  const [shopAssignments, setShopAssignments] = useState<ShopAssignment[]>(() =>
    dataMode === 'demo'
      ? persistedDemo?.shopAssignments ?? DEMO_SHOP_ASSIGNMENTS
      : persistedLiveCache?.shopAssignments ?? []
  );
  const [categories, setCategories] = useState<ProductCategory[]>(() =>
    dataMode === 'demo'
      ? ensureUniqueIds(persistedDemo?.categories ?? DEMO_CATEGORIES, 'cat')
      : persistedLiveCache?.categories ?? []
  );
  const [units, setUnits] = useState<UnitOfMeasurement[]>(() =>
    dataMode === 'demo'
      ? ensureUniqueIds(persistedDemo?.units ?? DEMO_UNITS, 'unit')
      : persistedLiveCache?.units ?? []
  );
  const [products, setProducts] = useState<Product[]>(() =>
    dataMode === 'demo'
      ? ensureUniqueIds(persistedDemo?.products ?? DEMO_PRODUCTS, 'prod')
      : persistedLiveCache?.products ?? []
  );
  const [stockAdjustments, setStockAdjustments] = useState<StockAdjustment[]>(
    () =>
      dataMode === 'demo'
        ? ensureUniqueIds(
            persistedDemo?.stockAdjustments ?? DEMO_STOCK_ADJUSTMENTS,
            'adj'
          )
        : persistedLiveCache?.stockAdjustments ?? []
  );
  const [sales, setSales] = useState<SaleTransaction[]>(() =>
    dataMode === 'demo'
      ? ensureUniqueIds(persistedDemo?.sales ?? DEMO_SALES, 'sale')
      : persistedLiveCache?.sales ?? []
  );
  const [invoices, setInvoices] = useState<Invoice[]>(() =>
    dataMode === 'demo'
      ? ensureUniqueIds(persistedDemo?.invoices ?? DEMO_INVOICES, 'inv')
      : persistedLiveCache?.invoices ?? []
  );
  const [debtCustomers, setDebtCustomers] = useState<DebtCustomer[]>(() =>
    dataMode === 'demo'
      ? ensureUniqueIds(
          persistedDemo?.debtCustomers ?? DEMO_DEBT_CUSTOMERS,
          'debt-cust'
        )
      : persistedLiveCache?.debtCustomers ?? []
  );
  const [debtTransactions, setDebtTransactions] = useState<DebtTransaction[]>(
    () =>
      dataMode === 'demo'
        ? ensureUniqueIds(
            persistedDemo?.debtTransactions ?? DEMO_DEBT_TRANSACTIONS,
            'debt-tx'
          )
        : persistedLiveCache?.debtTransactions ?? []
  );
  const [suppliers, setSuppliers] = useState<Supplier[]>(() =>
    dataMode === 'demo'
      ? ensureUniqueIds(persistedDemo?.suppliers ?? DEMO_SUPPLIERS, 'sup')
      : persistedLiveCache?.suppliers ?? []
  );
  const [supplierSupplies, setSupplierSupplies] = useState<
    SupplierSupplyRecord[]
  >(() =>
    dataMode === 'demo'
      ? ensureUniqueIds(
          persistedDemo?.supplierSupplies ?? DEMO_SUPPLIER_SUPPLIES,
          'supply'
        )
      : persistedLiveCache?.supplierSupplies ?? []
  );
  const [customRoles, setCustomRoles] = useState<CustomRole[]>(() =>
    dataMode === 'demo'
      ? persistedDemo?.customRoles ?? DEMO_CUSTOM_ROLES
      : persistedLiveCache?.customRoles ?? []
  );

  const defaultDemoOwner =
    DEMO_USERS.find((u) => u.id === 'usr-owner-01') ?? DEMO_USERS[1];

  const [currentUserId, setCurrentUserId] = useState<string>(() =>
    dataMode === 'demo'
      ? persistedDemo?.currentUserId ?? defaultDemoOwner.id
      : persistedLiveMeta?.uid ?? ''
  );

  const currentUser = useMemo(() => {
    const matched = users.find((u) => u.id === currentUserId);
    if (matched) return matched;
    if (dataMode === 'demo') return defaultDemoOwner;
    if (liveResolution?.user) return liveResolution.user;
    return EMPTY_USER_FALLBACK;
  }, [users, currentUserId, dataMode, defaultDemoOwner, liveResolution]);

  const [sessionStage, setSessionStage] = useState<SessionStage>(() => {
    if (dataMode === 'demo') {
      if (persistedDemo?.sessionStage && persistedDemo.sessionStage !== 'login') {
        return persistedDemo.sessionStage;
      }
      return isAutoStart ? 'workspace' : 'login';
    }
    if (
      persistedLiveMeta?.sessionStage &&
      persistedLiveMeta.sessionStage !== 'login'
    ) {
      return persistedLiveMeta.sessionStage;
    }
    return 'login';
  });

  const [activeShopId, setActiveShopId] = useState<string | null>(() => {
    if (dataMode === 'demo') {
      if (persistedDemo?.activeShopId) return persistedDemo.activeShopId;
      return isAutoStart ? 'shop-vi-01' : null;
    }
    return persistedLiveMeta?.activeShopId ?? null;
  });

  const [activeView, setActiveView] = useState<AppView>(() =>
    dataMode === 'demo'
      ? persistedDemo?.activeView ?? 'dashboard'
      : persistedLiveMeta?.activeView ?? 'dashboard'
  );

  // Compute safe view strictly enforced by the current user's granted permissions
  const safeActiveView = useMemo<AppView>(() => {
    if (canUserAccessView(currentUser, activeView)) {
      return activeView;
    }
    return getDefaultViewForUser(currentUser);
  }, [currentUser, activeView]);

  useEffect(() => {
    if (activeView !== safeActiveView) {
      setActiveView(safeActiveView);
    }
  }, [safeActiveView, activeView]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(
    () => persistedDemo?.sidebarCollapsed ?? false
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Cross-screen inspection pointer
  const [inspectedSale, setInspectedSale] = useState<SaleTransaction | null>(
    null
  );

  // Connectivity & Offline Sync Simulator state
  const [connectivityState, setConnectivityState] = useState<ConnectivityState>(
    () => (dataMode === 'demo' ? persistedDemo?.connectivityState ?? 'pending_sync' : 'online')
  );

  // Persist active mode flag
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(ACTIVE_MODE_STORAGE_KEY, dataMode);
    } catch {
      // Ignore storage errors
    }
  }, [dataMode]);

  // Persist state strictly into the appropriate isolated store:
  // - If dataMode === 'demo': save only to DEMO_ISOLATED_STORAGE_KEY
  // - If dataMode === 'live' | 'offline_live': save only to user-scoped live cache
  useEffect(() => {
    const sanitizedUsers = users.map((u) => {
      const copy = { ...u };
      delete copy.password;
      return copy;
    });

    if (dataMode === 'demo') {
      const payload: PersistedAppStore = {
        businesses,
        users: sanitizedUsers,
        shops,
        shopAssignments,
        categories,
        units,
        products,
        stockAdjustments,
        sales,
        invoices,
        debtCustomers,
        debtTransactions,
        suppliers,
        supplierSupplies,
        customRoles,
        currentUserId,
        sessionStage,
        activeShopId,
        activeView,
        sidebarCollapsed,
        connectivityState,
      };
      const serialized = JSON.stringify(payload);
      try {
        window.localStorage.setItem(DEMO_ISOLATED_STORAGE_KEY, serialized);
        window.sessionStorage.setItem(DEMO_ISOLATED_STORAGE_KEY, serialized);
      } catch {
        // Ignore storage quota errors
      }
      return;
    }

    // Live / Offline Live Mode: save session metadata and user's isolated live cache
    const liveUid = liveResolution?.uid || currentUserId;
    const liveEmail = liveResolution?.email || currentUser.email;
    if (liveUid && liveUid !== 'unauthenticated' && liveEmail && sessionStage !== 'login') {
      savePersistedLiveSessionMeta({
        uid: liveUid,
        email: liveEmail,
        displayName: liveResolution?.displayName || currentUser.fullName,
        sessionStage,
        activeShopId,
        activeView,
        dataMode,
        liveStatus: liveResolution?.status ?? 'ready',
      });
    }

    if (
      currentUserId &&
      currentUserId !== 'unauthenticated' &&
      sessionStage !== 'login' &&
      sessionStage !== 'live_onboarding'
    ) {
      saveUserScopedLiveCache(currentUserId, {
        businesses,
        users: sanitizedUsers,
        shops,
        shopAssignments,
        categories,
        units,
        products,
        stockAdjustments,
        sales,
        invoices,
        debtCustomers,
        debtTransactions,
        suppliers,
        supplierSupplies,
        customRoles,
        cachedAt: new Date().toISOString(),
        ownerUserId: currentUserId,
        businessId: currentUser.businessId,
      });
    }
  }, [
    dataMode,
    businesses,
    users,
    shops,
    shopAssignments,
    categories,
    units,
    products,
    stockAdjustments,
    sales,
    invoices,
    debtCustomers,
    debtTransactions,
    suppliers,
    supplierSupplies,
    customRoles,
    currentUserId,
    currentUser.businessId,
    currentUser.email,
    currentUser.fullName,
    liveResolution,
    sessionStage,
    activeShopId,
    activeView,
    sidebarCollapsed,
    connectivityState,
  ]);

  // Active Business for the current user (strict tenant isolation, zero fallback to DEMO_BUSINESSES)
  const activeBusiness = useMemo<Business>(() => {
    if (currentUser.role === 'platform_admin') {
      return businesses[0] ?? EMPTY_BUSINESS_FALLBACK;
    }
    return (
      businesses.find((b) => b.id === currentUser.businessId) ??
      EMPTY_BUSINESS_FALLBACK
    );
  }, [businesses, currentUser]);

  // Authorized shops for the signed-in user (enforces businessId match, suspended business check, and role/assignment rules)
  const authorizedShops = useMemo(
    () => getAuthorizedShopsForUser(currentUser, shops, businesses),
    [currentUser, shops, businesses]
  );

  // All shops belonging to the active business
  const businessShops = useMemo(
    () =>
      activeBusiness.id
        ? shops.filter((s) => s.businessId === activeBusiness.id)
        : [],
    [shops, activeBusiness.id]
  );

  // All users belonging to the active business (strictly isolated to activeBusiness.id, never platform_admin or other businesses)
  const businessUsers = useMemo(
    () =>
      activeBusiness.id
        ? users.filter(
            (u) =>
              u.businessId === activeBusiness.id && u.role !== 'platform_admin'
          )
        : [],
    [users, activeBusiness.id]
  );

  // Visible users for the currently logged-in actor
  const visibleUsersForActor = useMemo(
    () => getVisibleUsersForActor(currentUser, users),
    [currentUser, users]
  );

  // Active shop object (must be within authorizedShops)
  const activeShop = useMemo(() => {
    if (!activeShopId) return null;
    return authorizedShops.find((s) => s.id === activeShopId) ?? null;
  }, [activeShopId, authorizedShops]);

  // Isolated shop-scoped collections
  const activeShopCategories = useMemo(() => {
    if (!activeShop) return [];
    return categories.filter(
      (c) => c.shopId === activeShop.id && c.businessId === activeBusiness.id
    );
  }, [categories, activeShop, activeBusiness.id]);

  const activeShopUnits = useMemo(() => {
    if (!activeShop) return [];
    return units.filter(
      (u) => u.shopId === activeShop.id && u.businessId === activeBusiness.id
    );
  }, [units, activeShop, activeBusiness.id]);

  const activeShopProducts = useMemo(() => {
    if (!activeShop) return [];
    return products.filter(
      (p) => p.shopId === activeShop.id && p.businessId === activeBusiness.id
    );
  }, [products, activeShop, activeBusiness.id]);

  const activeShopAdjustments = useMemo(() => {
    if (!activeShop) return [];
    return stockAdjustments.filter(
      (a) => a.shopId === activeShop.id && a.businessId === activeBusiness.id
    );
  }, [stockAdjustments, activeShop, activeBusiness.id]);

  const activeShopSales = useMemo(() => {
    if (!activeShop) return [];
    return sales.filter(
      (s) => s.shopId === activeShop.id && s.businessId === activeBusiness.id
    );
  }, [sales, activeShop, activeBusiness.id]);

  const activeShopInvoices = useMemo(() => {
    if (!activeShop) return [];
    return invoices.filter(
      (inv) => inv.shopId === activeShop.id && inv.businessId === activeBusiness.id
    );
  }, [invoices, activeShop, activeBusiness.id]);

  const activeShopDebtCustomers = useMemo(() => {
    if (!activeShop) return [];
    return debtCustomers.filter(
      (c) => c.shopId === activeShop.id && c.businessId === activeBusiness.id
    );
  }, [debtCustomers, activeShop, activeBusiness.id]);

  const activeShopDebtTransactions = useMemo(() => {
    if (!activeShop) return [];
    return debtTransactions.filter(
      (t) => t.shopId === activeShop.id && t.businessId === activeBusiness.id
    );
  }, [debtTransactions, activeShop, activeBusiness.id]);

  const activeShopSuppliers = useMemo(() => {
    if (!activeShop) return [];
    return suppliers.filter(
      (s) => s.shopId === activeShop.id && s.businessId === activeBusiness.id
    );
  }, [suppliers, activeShop, activeBusiness.id]);

  const activeShopSupplierSupplies = useMemo(() => {
    if (!activeShop) return [];
    return supplierSupplies.filter(
      (r) => r.shopId === activeShop.id && r.businessId === activeBusiness.id
    );
  }, [supplierSupplies, activeShop, activeBusiness.id]);

  // Pending sync count for current context
  const pendingTransactionsCount = useMemo(() => {
    if (activeShop) {
      const unsynced = activeShopSales.filter(
        (s) => s.syncStatus !== 'synced_demo'
      ).length;
      return Math.max(activeShop.pendingSyncCount, unsynced);
    }
    return authorizedShops.reduce((sum, s) => sum + s.pendingSyncCount, 0);
  }, [activeShop, activeShopSales, authorizedShops]);

  const connectivitySnapshot: ConnectivitySnapshot = useMemo(() => {
    const effectiveState: ConnectivityState =
      dataMode === 'offline_live' ? 'offline' : connectivityState;
    const preset = CONNECTIVITY_PRESETS[effectiveState];
    return {
      ...preset,
      pendingTransactionsCount,
    };
  }, [dataMode, connectivityState, pendingTransactionsCount]);

  // =========================================================================
  // LIVE SESSION RESOLUTION & DEMO MODE ISOLATION HANDLERS
  // =========================================================================
  const clearInMemoryWorkspaceState = () => {
    setBusinesses([]);
    setUsers([]);
    setShops([]);
    setShopAssignments([]);
    setCategories([]);
    setUnits([]);
    setProducts([]);
    setStockAdjustments([]);
    setSales([]);
    setInvoices([]);
    setDebtCustomers([]);
    setDebtTransactions([]);
    setSuppliers([]);
    setSupplierSupplies([]);
    setCustomRoles([]);
    setCurrentUserId('');
    setActiveShopId(null);
    setInspectedSale(null);
  };

  const applyLiveResolutionResult = (
    res: LiveSessionResolutionResult,
    options?: { preserveWorkspaceContext?: boolean }
  ) => {
    setLiveResolution(res);

    if (res.status !== 'ready' || !res.user || !res.dataset) {
      // If we are already on the live_onboarding screen, do not clear state or cause a remount
      setDataMode(res.dataMode);
      setLiveErrorMessage(res.errorMessage || null);
      if (sessionStage !== 'live_onboarding') {
        clearInMemoryWorkspaceState();
        setSessionStage('live_onboarding');
      }
      return;
    }

    setLiveErrorMessage(null);
    setDataMode(res.dataMode);
    setConnectivityState(res.dataMode === 'offline_live' ? 'offline' : 'online');
    setBusinesses(res.dataset.businesses);
    setUsers(res.dataset.users);
    setShops(res.dataset.shops);
    setShopAssignments(res.dataset.shopAssignments);
    setCategories(res.dataset.categories);
    setUnits(res.dataset.units);
    setProducts(res.dataset.products);
    setStockAdjustments(res.dataset.stockAdjustments);
    setSales(res.dataset.sales);
    setInvoices(res.dataset.invoices);
    setDebtCustomers(res.dataset.debtCustomers);
    setDebtTransactions(res.dataset.debtTransactions);
    setSuppliers(res.dataset.suppliers);
    setSupplierSupplies(res.dataset.supplierSupplies);
    setCustomRoles(res.dataset.customRoles);

    cloudSyncService.setActiveActor(res.user);
    setCurrentUserId(res.user.id);

    if (res.user.role === 'platform_admin') {
      setActiveShopId(null);
      setSessionStage('platform_admin');
      return;
    }

    const userShops = getAuthorizedShopsForUser(
      res.user,
      res.dataset.shops,
      res.dataset.businesses
    );
    const preservedShop =
      activeShopId && userShops.some((s) => s.id === activeShopId)
        ? activeShopId
        : userShops[0]?.id ?? null;
    setActiveShopId(preservedShop);

    const safeTargetView = canUserAccessView(res.user, activeView)
      ? activeView
      : getDefaultViewForUser(res.user);
    setActiveView(safeTargetView);

    if (
      options?.preserveWorkspaceContext &&
      sessionStage === 'workspace' &&
      preservedShop
    ) {
      // Keep user in their active workspace without resetting or remounting the screen
      return;
    }

    setInspectedSale(null);
    setSessionStage('shop_selection');
  };

  const handleAuthenticatedFirebase = async (
    identity: AuthenticatedFirebaseIdentity,
    _rememberMe?: boolean,
    options?: { preserveWorkspaceContext?: boolean }
  ) => {
    restoredUidRef.current = identity.uid;
    setIsRefreshingLive(true);
    setLiveErrorMessage(null);
    try {
      if (auth.currentUser) {
        try {
          await auth.currentUser.reload();
          await auth.currentUser.getIdToken(true);
        } catch {
          // Non-blocking network catch
        }
      }
      const activeUser = auth.currentUser;
      const res = await liveDataService.resolveAuthenticatedSession({
        uid: activeUser?.uid || identity.uid,
        email: activeUser?.email || identity.email,
        displayName: activeUser?.displayName || identity.displayName,
        emailVerified: activeUser?.emailVerified ?? identity.emailVerified,
      });
      applyLiveResolutionResult(res, options);
    } finally {
      setIsRefreshingLive(false);
    }
  };

  // Restore Firebase Authentication session once on initial mount when in Live Mode,
  // never re-triggering on stage transitions or wiping active form inputs.
  useEffect(() => {
    if (dataMode === 'demo') return;
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser || !fbUser.email) {
        restoredUidRef.current = null;
        return;
      }
      if (restoredUidRef.current === fbUser.uid) {
        return;
      }
      restoredUidRef.current = fbUser.uid;

      // Only resolve automatically if we started on the login screen (no restored session stage yet)
      if (sessionStage === 'login') {
        try {
          await fbUser.reload();
          await fbUser.getIdToken(true);
        } catch {
          // Non-blocking
        }
        handleAuthenticatedFirebase({
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName,
          emailVerified: fbUser.emailVerified,
        });
      }
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataMode]);

  const handleRefreshLiveWorkspace = async () => {
    setIsRefreshingLive(true);
    setLiveErrorMessage(null);
    try {
      if (auth.currentUser) {
        try {
          await auth.currentUser.reload();
          await auth.currentUser.getIdToken(true);
        } catch (e) {
          console.warn('Could not reload Firebase auth user:', e);
        }
      }
      const activeUser = auth.currentUser;
      const uid = activeUser?.uid || liveResolution?.uid || currentUser.id;
      const email = activeUser?.email || liveResolution?.email || currentUser.email;
      const displayName = activeUser?.displayName || liveResolution?.displayName || currentUser.fullName;
      const emailVerified = activeUser?.emailVerified ?? liveResolution?.emailVerified;
      if (!uid || uid === 'unauthenticated' || !email) return;

      const res = await liveDataService.resolveAuthenticatedSession({
        uid,
        email,
        displayName,
        emailVerified,
      });
      applyLiveResolutionResult(res, { preserveWorkspaceContext: true });
      const report = await auditLocalStorageAndIndexedDb(dbAdapter);
      setStorageAudit(report);
    } finally {
      setIsRefreshingLive(false);
    }
  };

  const handleConfirmClearDemoData = async () => {
    clearDemoDataSafely();
    const report = await auditLocalStorageAndIndexedDb(dbAdapter);
    setStorageAudit(report);
    if (dataMode === 'demo') {
      // Reset demo store to fresh initial sample data or return to login
      setSessionStage('login');
    }
  };

  const handlePurgeQuarantinedRecords = async (): Promise<PurgeQuarantinedPreFirebaseSalesResult> => {
    if (currentUser.role !== 'platform_admin' || currentUser.status !== 'active') {
      throw new Error(
        'UNAUTHORIZED: Only an active Platform Administrator can purge quarantined pre-Firebase demo records.'
      );
    }
    const res = await liveDataService.purgeQuarantinedPreFirebaseRecords(currentUser);
    const report = await auditLocalStorageAndIndexedDb(dbAdapter);
    setStorageAudit(report);
    return res;
  };

  const routeUserToRoleStage = (
    user: User,
    preferWorkspace = false,
    nextShops = shops,
    nextBusinesses = businesses
  ) => {
    cloudSyncService.setActiveActor(user);
    setCurrentUserId(user.id);
    setInspectedSale(null);

    if (user.role === 'platform_admin') {
      setActiveShopId(null);
      setSessionStage('platform_admin');
      return;
    }

    const userShops = getAuthorizedShopsForUser(
      user,
      nextShops,
      nextBusinesses
    );
    const nextShopId = userShops[0]?.id ?? null;
    setActiveShopId(nextShopId);

    const safeTargetView = canUserAccessView(user, activeView)
      ? activeView
      : getDefaultViewForUser(user);
    setActiveView(safeTargetView);

    if (preferWorkspace && nextShopId) {
      setSessionStage('workspace');
    } else {
      setSessionStage('shop_selection');
    }
  };

  const handleAuthenticated = (
    user: User,
    _rememberMe: boolean,
    authMode: 'firebase' | 'demo' = 'demo'
  ) => {
    if (authMode === 'demo') {
      // Explicitly enter isolated Demo Mode and load demo dataset
      const savedDemo = loadIsolatedDemoStore();
      const demoBiz = savedDemo?.businesses ?? DEMO_BUSINESSES;
      const demoUsr = savedDemo?.users ?? DEMO_USERS;
      const demoShp = savedDemo?.shops ?? DEMO_SHOPS;

      setDataMode('demo');
      setLiveResolution(null);
      setLiveErrorMessage(null);
      setBusinesses(demoBiz);
      setUsers(demoUsr);
      setShops(demoShp);
      setShopAssignments(savedDemo?.shopAssignments ?? DEMO_SHOP_ASSIGNMENTS);
      setCategories(
        ensureUniqueIds(savedDemo?.categories ?? DEMO_CATEGORIES, 'cat')
      );
      setUnits(ensureUniqueIds(savedDemo?.units ?? DEMO_UNITS, 'unit'));
      setProducts(
        ensureUniqueIds(savedDemo?.products ?? DEMO_PRODUCTS, 'prod')
      );
      setStockAdjustments(
        ensureUniqueIds(
          savedDemo?.stockAdjustments ?? DEMO_STOCK_ADJUSTMENTS,
          'adj'
        )
      );
      setSales(ensureUniqueIds(savedDemo?.sales ?? DEMO_SALES, 'sale'));
      setInvoices(ensureUniqueIds(savedDemo?.invoices ?? DEMO_INVOICES, 'inv'));
      setDebtCustomers(
        ensureUniqueIds(
          savedDemo?.debtCustomers ?? DEMO_DEBT_CUSTOMERS,
          'debt-cust'
        )
      );
      setDebtTransactions(
        ensureUniqueIds(
          savedDemo?.debtTransactions ?? DEMO_DEBT_TRANSACTIONS,
          'debt-tx'
        )
      );
      setSuppliers(
        ensureUniqueIds(savedDemo?.suppliers ?? DEMO_SUPPLIERS, 'sup')
      );
      setSupplierSupplies(
        ensureUniqueIds(
          savedDemo?.supplierSupplies ?? DEMO_SUPPLIER_SUPPLIES,
          'supply'
        )
      );
      setCustomRoles(savedDemo?.customRoles ?? DEMO_CUSTOM_ROLES);

      routeUserToRoleStage(user, false, demoShp, demoBiz);
      return;
    }

    handleAuthenticatedFirebase({
      uid: user.id,
      email: user.email,
      displayName: user.fullName,
    });
  };

  const handleSwitchDemoUserAnywhere = (userId: string) => {
    // Only permitted in explicit Demo Mode; Live Mode requires real Firebase authentication per user
    if (dataMode !== 'demo') {
      return;
    }
    if (
      currentUser.role !== 'business_owner' &&
      currentUser.role !== 'platform_admin'
    ) {
      return;
    }
    const allowedUsers = getVisibleUsersForActor(currentUser, users);
    const nextUser = allowedUsers.find((u) => u.id === userId);
    if (!nextUser) return;
    routeUserToRoleStage(nextUser, sessionStage === 'workspace');
  };

  const handleSelectShopAndContinue = (shopId: string) => {
    const authorizedTarget = authorizedShops.find((s) => s.id === shopId);
    if (!authorizedTarget) return;
    setActiveShopId(authorizedTarget.id);
    const safeTargetView = canUserAccessView(currentUser, activeView)
      ? activeView
      : getDefaultViewForUser(currentUser);
    setActiveView(safeTargetView);
    setSessionStage('workspace');
  };

  const handleSwitchShopInWorkspace = (shopId: string) => {
    const targetShop = authorizedShops.find((s) => s.id === shopId);
    if (!targetShop) return;
    setActiveShopId(targetShop.id);
    setInspectedSale(null);
  };

  const handleSignOut = () => {
    restoredUidRef.current = null;
    clearPersistedLiveSessionMeta();
    cloudSyncService.setActiveActor(null);
    cloudBackendService.signOut().catch(() => {});
    firebaseSignOut(auth).catch(() => {});
    clearInMemoryWorkspaceState();
    setLiveResolution(null);
    setLiveErrorMessage(null);
    setDataMode('live');
    setSessionStage('login');
  };

  // =========================================================================
  // PHASE 2 & 6: PLATFORM ADMINISTRATOR BUSINESS HANDLERS
  // =========================================================================
  const handleCreateBusiness = async (
    input: CreateBusinessInput
  ): Promise<Business> => {
    if (
      currentUser.role !== 'platform_admin' ||
      currentUser.status !== 'active'
    ) {
      throw new Error(
        'UNAUTHORIZED: Only an active Platform Administrator can provision a business.'
      );
    }

    const newBusinessId = generateUniqueBusinessId(businesses);
    const cleanExplicitUid = input.ownerUid
      ?.trim()
      .replace(/[^a-zA-Z0-9_-]/g, '');
    const explicitFirebaseOwnerUid =
      cleanExplicitUid &&
      cleanExplicitUid.length >= 4 &&
      !isSyntheticClientUserId(cleanExplicitUid) &&
      !isSyntheticOwnerUserId(cleanExplicitUid)
        ? cleanExplicitUid
        : undefined;
    const newOwnerUserId =
      explicitFirebaseOwnerUid || generateUniqueUserId(users);
    const firstShopId = generateUniqueShopId(shops);
    const todayDate = getTodayYmd();
    const isDemo = dataMode === 'demo';
    const prefix =
      input.name
        .trim()
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 3) || 'SHP';

    const newBusiness: Business = {
      id: newBusinessId,
      name: input.name.trim(),
      legalName: isDemo
        ? `${input.name.trim()} (Demo Registered Business)`
        : `${input.name.trim()} Ltd`,
      businessType: input.businessType,
      registrationNumber: `RC-${Math.floor(1000000 + Math.random() * 9000000)}${isDemo ? '-DEMO' : ''}`,
      taxIdentificationNumber: `TIN-${Math.floor(10000000 + Math.random() * 90000000)}-0001`,
      ownerUserId: newOwnerUserId,
      ownerName: input.ownerName.trim(),
      ownerEmail: input.ownerEmail.trim().toLowerCase(),
      contactEmail: input.contactEmail.trim().toLowerCase(),
      primaryPhone: input.primaryPhone.trim(),
      headquartersAddress: input.headquartersAddress.trim(),
      currencyCode: BASE_CURRENCY_CODE,
      currencySymbol: BASE_CURRENCY_SYMBOL,
      defaultTaxRatePercent: 7.5,
      status: 'active',
      notes: input.notes?.trim() || undefined,
      createdAt: todayDate,
    };

    const firstShopName =
      input.initialShopName?.trim() || `${newBusiness.name} — Main Branch`;
    const firstShop: Shop = {
      id: firstShopId,
      businessId: newBusinessId,
      code: `${prefix}-01`,
      name: firstShopName,
      category:
        (input.initialShopCategory?.trim() as Shop['category']) ||
        'Supermarket',
      locationCity: input.initialShopCity?.trim() || 'Lagos',
      address:
        input.initialShopAddress?.trim() || newBusiness.headquartersAddress,
      phone: newBusiness.primaryPhone,
      managerName: newBusiness.ownerName,
      status: 'active',
      terminalId: `TERM-${prefix}01`,
      taxRatePercent: newBusiness.defaultTaxRatePercent,
      receiptHeaderNote: isDemo
        ? `${firstShopName} — Demo Receipt`
        : `${firstShopName} — Official Receipt`,
      receiptFooterNote: isDemo
        ? 'Prototype Receipt Only • Thank you for your patronage'
        : 'Thank you for your patronage',
      createdAt: todayDate,
      pendingSyncCount: 0,
      lastSyncedAt: isDemo ? formatPosTimestamp() : 'Cloud Synced',
    };

    const primaryOwnerUser: User = {
      id: newOwnerUserId,
      businessId: newBusinessId,
      username: input.ownerEmail.trim().toLowerCase().split('@')[0],
      email: input.ownerEmail.trim().toLowerCase(),
      fullName: input.ownerName.trim(),
      role: 'business_owner',
      roleLabel: `Business Owner (${newBusiness.name})`,
      assignedShopIds: [firstShopId],
      permissions: [...ROLE_DEFAULT_PERMISSIONS.business_owner],
      status: 'active',
      createdAt: todayDate,
      lastLoginAt: formatPosTimestamp(),
    };

    const firstAssignment: ShopAssignment = {
      id: `asgn-${firstShopId}-${newOwnerUserId}`,
      userId: newOwnerUserId,
      businessId: newBusinessId,
      shopId: firstShopId,
      assignedAt: todayDate,
      assignedByUserId: currentUser.id,
      isActive: true,
    };

    if (isDemo) {
      setBusinesses((prev) => [newBusiness, ...prev]);
      setUsers((prev) => [...prev, primaryOwnerUser]);
      setShops((prev) => [...prev, firstShop]);
      setShopAssignments((prev) => [...prev, firstAssignment]);
      return newBusiness;
    }

    const idempotencyKey = `prov-biz-${newBusinessId}-${Date.now()}`;
    try {
      const provisioned = await liveDataService.persistLiveBusinessAndOwner(
        newBusiness,
        primaryOwnerUser,
        firstShop,
        {
          idempotencyKey,
          explicitOwnerUid: explicitFirebaseOwnerUid,
        }
      );

      let finalPrimaryOwner = provisioned.primaryOwner;
      if (input.sendPasswordSetupEmail) {
        try {
          const emailRes =
            await liveDataService.sendBusinessOwnerPasswordSetupEmail({
              actor: currentUser,
              ownerUser: provisioned.primaryOwner,
              business: provisioned.business,
            });
          finalPrimaryOwner = emailRes.updatedOwner;
        } catch (emailErr) {
          console.warn(
            'Business provisioned, but password setup email could not be sent automatically:',
            emailErr
          );
        }
      }

      setLiveErrorMessage(null);

      const canonicalShop = provisioned.firstShop ?? firstShop;
      const canonicalAssignment: ShopAssignment = {
        ...firstAssignment,
        id: `asgn-${canonicalShop.id}-${finalPrimaryOwner.id}`,
        userId: finalPrimaryOwner.id,
        businessId: provisioned.business.id,
        shopId: canonicalShop.id,
      };

      setBusinesses((prev) => [
        provisioned.business,
        ...prev.filter((b) => b.id !== provisioned.business.id && b.id !== newBusinessId),
      ]);
      setUsers((prev) => [
        ...prev.filter((u) => u.id !== finalPrimaryOwner.id && u.id !== newOwnerUserId),
        finalPrimaryOwner,
      ]);
      setShops((prev) => [
        ...prev.filter((s) => s.id !== canonicalShop.id && s.id !== firstShopId),
        canonicalShop,
      ]);
      setShopAssignments((prev) => [
        ...prev.filter((a) => a.id !== canonicalAssignment.id && a.id !== firstAssignment.id),
        canonicalAssignment,
      ]);

      return provisioned.business;
    } catch (err) {
      const errMessage =
        err instanceof Error
          ? err.message
          : 'Failed to provision business, owner, and first shop via Cloud Function.';
      setLiveErrorMessage(errMessage);
      throw err instanceof Error ? err : new Error(errMessage);
    }
  };

  const handleRepairBusinessOwnerAuth = async (
    business: Business,
    ownerUser?: User
  ): Promise<RepairLiveBusinessOwnerAuthResult> => {
    if (
      currentUser.role !== 'platform_admin' ||
      currentUser.status !== 'active'
    ) {
      throw new Error(
        'PERMISSION_DENIED: Only an active Platform Administrator can repair Business Owner authentication.'
      );
    }

    const result = await liveDataService.repairLiveBusinessOwnerAuth({
      actor: currentUser,
      business,
      currentOwnerUser: ownerUser,
    });

    const previousId = result.previousOwnerUserId || ownerUser?.id;

    setBusinesses((prev) =>
      prev.map((b) => (b.id === result.business.id ? result.business : b))
    );
    setUsers((prev) => [
      ...prev.filter(
        (u) =>
          u.id !== result.primaryOwner.id &&
          (!previousId || u.id !== previousId)
      ),
      result.primaryOwner,
    ]);
    setShopAssignments((prev) =>
      prev.map((a) => {
        if (
          a.businessId === result.business.id &&
          previousId &&
          a.userId === previousId
        ) {
          return {
            ...a,
            id: `asgn-${a.shopId}-${result.canonicalOwnerUid}`,
            userId: result.canonicalOwnerUid,
          };
        }
        return a;
      })
    );

    return result;
  };

  const handleSendOwnerPasswordSetupEmail = async (
    ownerUser: User,
    business?: Business,
    options?: { skipEmailDispatch?: boolean }
  ): Promise<SendOwnerPasswordSetupEmailResult> => {
    if (
      currentUser.role !== 'platform_admin' ||
      currentUser.status !== 'active'
    ) {
      throw new Error(
        'PERMISSION_DENIED: Only an active Platform Administrator can dispatch Business Owner password setup emails.'
      );
    }

    const res = await liveDataService.sendBusinessOwnerPasswordSetupEmail({
      actor: currentUser,
      ownerUser,
      business,
      skipEmailDispatch: options?.skipEmailDispatch,
    });

    if (res.metadataPersisted) {
      setUsers((prev) =>
        prev.map((u) => (u.id === res.updatedOwner.id ? res.updatedOwner : u))
      );
    }

    return res;
  };

  const handleUpdateBusiness = (
    businessId: string,
    input: CreateBusinessInput
  ) => {
    if (
      currentUser.role !== 'platform_admin' ||
      currentUser.status !== 'active'
    ) {
      return;
    }
    const targetBiz = businesses.find((b) => b.id === businessId);
    if (!targetBiz) return;

    const updatedBiz: Business = {
      ...targetBiz,
      name: input.name.trim(),
      businessType: input.businessType,
      contactEmail: input.contactEmail.trim().toLowerCase(),
      primaryPhone: input.primaryPhone.trim(),
      headquartersAddress: input.headquartersAddress.trim(),
      ownerName: input.ownerName.trim(),
      ownerEmail: input.ownerEmail.trim().toLowerCase(),
      notes: input.notes?.trim() || undefined,
    };

    setBusinesses((prev) =>
      prev.map((b) => (b.id === businessId ? updatedBiz : b))
    );

    const existingOwner = users.find((u) => u.id === targetBiz.ownerUserId);
    const updatedOwner: User | undefined = existingOwner
      ? {
          ...existingOwner,
          fullName: input.ownerName.trim(),
          email: input.ownerEmail.trim().toLowerCase(),
          role: 'business_owner',
          roleLabel: `Business Owner (${input.name.trim()})`,
        }
      : undefined;

    // Sync single primary owner account record
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id !== targetBiz.ownerUserId) return u;
        return {
          ...u,
          fullName: input.ownerName.trim(),
          email: input.ownerEmail.trim().toLowerCase(),
          role: 'business_owner',
          roleLabel: `Business Owner (${input.name.trim()})`,
        };
      })
    );

    if (dataMode !== 'demo') {
      liveDataService
        .persistLiveBusiness(updatedBiz, updatedOwner)
        .catch((err) => {
          setLiveErrorMessage(
            err instanceof Error
              ? err.message
              : 'Failed to update business in Cloud Firestore.'
          );
        });
    }
  };

  const handleToggleBusinessStatus = async (
    businessId: string,
    nextStatus: BusinessStatus
  ): Promise<void> => {
    const targetBiz = businesses.find((b) => b.id === businessId);
    if (!targetBiz) {
      throw new Error(`Business "${businessId}" was not found.`);
    }

    if (dataMode === 'demo') {
      setBusinesses((prev) =>
        prev.map((b) =>
          b.id === businessId ? { ...b, status: nextStatus } : b
        )
      );
      return;
    }

    try {
      const response = await liveDataService.setLiveTenantStatus(
        businessId,
        nextStatus,
        nextStatus === 'suspended'
          ? 'Suspended by Platform Administrator'
          : 'Reactivated by Platform Administrator'
      );
      setBusinesses((prev) =>
        prev.map((b) =>
          b.id === businessId ? { ...b, status: response.status } : b
        )
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Failed to update business status via Cloud Function.';
      setLiveErrorMessage(msg);
      throw err;
    }
  };

  // =========================================================================
  // PHASE 2: BUSINESS SHOP MANAGEMENT HANDLERS
  // =========================================================================
  const handleCreateShop = (input: CreateShopInput): Shop => {
    const newShopId = generateUniqueShopId(shops);
    const bizShopSeq = businessShops.length + 1;
    const prefix = activeBusiness.name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 3);
    const code = `${prefix}-0${bizShopSeq}`;
    const todayDate = getTodayYmd();
    const isDemo = dataMode === 'demo';

    const newShop: Shop = {
      id: newShopId,
      businessId: activeBusiness.id,
      code,
      name: input.name.trim(),
      category: input.category ?? 'Supermarket',
      locationCity: input.locationCity?.trim() || 'Lagos',
      address: input.address.trim(),
      phone: input.phone.trim(),
      description: input.description?.trim() || undefined,
      managerName: activeBusiness.ownerName,
      status: 'active',
      terminalId: `WIN-POS-${code.replace('-', '')}`,
      taxRatePercent: activeBusiness.defaultTaxRatePercent,
      receiptHeaderNote: isDemo
        ? `${input.name.trim()} — Demo Receipt`
        : `${input.name.trim()} — Official Receipt`,
      receiptFooterNote: isDemo
        ? 'Prototype Receipt Only • Thank you for your patronage'
        : 'Thank you for your patronage',
      createdAt: todayDate,
      pendingSyncCount: 0,
      lastSyncedAt: formatPosTimestamp(),
    };

    // Initialize independent shop context (default isolated category and units)
    const defaultCat: ProductCategory = {
      id: `cat-${newShopId}-general`,
      shopId: newShopId,
      businessId: activeBusiness.id,
      name: 'General Merchandise',
      description: `Default category for ${newShop.name}`,
    };

    const defaultUnits: UnitOfMeasurement[] = [
      {
        id: `unit-${newShopId}-unit`,
        shopId: newShopId,
        businessId: activeBusiness.id,
        name: 'Unit',
        abbreviation: 'unit',
      },
      {
        id: `unit-${newShopId}-pack`,
        shopId: newShopId,
        businessId: activeBusiness.id,
        name: 'Pack',
        abbreviation: 'pk',
      },
    ];

    setShops((prev) => [...prev, newShop]);
    setCategories((prev) => [...prev, defaultCat]);
    setUnits((prev) => [...prev, ...defaultUnits]);

    // Update Business Owner's assignedShopIds list for convenience
    const ownerUser = users.find(
      (u) => u.businessId === activeBusiness.id && u.role === 'business_owner'
    );
    const updatedOwnerShopIds = ownerUser
      ? Array.from(new Set([...ownerUser.assignedShopIds, newShopId]))
      : [newShopId];

    setUsers((prev) =>
      prev.map((u) => {
        if (
          u.businessId === activeBusiness.id &&
          u.role === 'business_owner' &&
          !u.assignedShopIds.includes(newShopId)
        ) {
          return { ...u, assignedShopIds: [...u.assignedShopIds, newShopId] };
        }
        return u;
      })
    );

    if (!activeShopId) {
      setActiveShopId(newShopId);
    }

    if (!isDemo) {
      liveDataService
        .persistLiveShop(
          newShop,
          ownerUser?.id || currentUser.id,
          updatedOwnerShopIds
        )
        .catch((err) => {
          setLiveErrorMessage(
            err instanceof Error
              ? err.message
              : 'Failed to persist new shop to Cloud Firestore.'
          );
        });
    }

    return newShop;
  };

  const handleUpdateShop = (shopId: string, input: CreateShopInput) => {
    const existingShop = shops.find(
      (s) => s.id === shopId && s.businessId === activeBusiness.id
    );
    if (!existingShop) return;

    const updatedShop: Shop = {
      ...existingShop,
      name: input.name.trim(),
      address: input.address.trim(),
      locationCity: input.locationCity?.trim() || existingShop.locationCity,
      phone: input.phone.trim(),
      category: input.category ?? existingShop.category,
      description: input.description?.trim() || undefined,
    };

    setShops((prev) =>
      prev.map((s) => (s.id === shopId ? updatedShop : s))
    );

    if (dataMode !== 'demo') {
      const ownerUser = users.find(
        (u) => u.businessId === activeBusiness.id && u.role === 'business_owner'
      );
      liveDataService
        .persistLiveShop(
          updatedShop,
          ownerUser?.id || currentUser.id,
          ownerUser?.assignedShopIds || []
        )
        .catch((err) => {
          setLiveErrorMessage(
            err instanceof Error
              ? err.message
              : 'Failed to update shop in Cloud Firestore.'
          );
        });
    }
  };

  const handleToggleShopStatus = (shopId: string, nextStatus: ShopStatus) => {
    const existingShop = shops.find(
      (s) => s.id === shopId && s.businessId === activeBusiness.id
    );
    setShops((prev) =>
      prev.map((s) =>
        s.id === shopId && s.businessId === activeBusiness.id
          ? { ...s, status: nextStatus }
          : s
      )
    );
    if (dataMode !== 'demo' && existingShop) {
      const ownerUser = users.find(
        (u) => u.businessId === activeBusiness.id && u.role === 'business_owner'
      );
      liveDataService
        .persistLiveShop(
          { ...existingShop, status: nextStatus },
          ownerUser?.id || currentUser.id,
          ownerUser?.assignedShopIds || []
        )
        .catch((err) => {
          setLiveErrorMessage(
            err instanceof Error
              ? err.message
              : 'Failed to update shop status in Cloud Firestore.'
          );
        });
    }
  };

  // =========================================================================
  // PHASE 2: STAFF & CUSTOM ROLE MANAGEMENT HANDLERS
  // =========================================================================
  const handleCreateCustomRole = (input: CreateCustomRoleInput): CustomRole => {
    const newRole: CustomRole = {
      id: generateUniqueRoleId(customRoles),
      businessId: input.businessId,
      name: input.name.trim(),
      description: input.description.trim(),
      permissions: [...input.permissions],
      createdByUserId: currentUser.id,
      createdByName: currentUser.fullName,
      createdAt: getTodayYmd(),
      isBuiltIn: false,
    };
    setCustomRoles((prev) => [newRole, ...prev]);
    return newRole;
  };

  const handleUpdateCustomRole = (
    roleId: string,
    input: CreateCustomRoleInput
  ) => {
    setCustomRoles((prev) =>
      prev.map((r) =>
        r.id === roleId
          ? {
              ...r,
              name: input.name.trim(),
              description: input.description.trim(),
              permissions: [...input.permissions],
            }
          : r
      )
    );
  };

  const handleDeleteCustomRole = (
    roleId: string
  ): { success: boolean; error?: string } => {
    const target = customRoles.find((r) => r.id === roleId);
    if (!target) return { success: false, error: 'Role not found.' };
    if (target.isBuiltIn) {
      return { success: false, error: 'System default roles cannot be deleted.' };
    }
    const assignedUsers = users.filter(
      (u) => u.customRoleId === roleId || u.role === roleId
    );
    if (assignedUsers.length > 0) {
      return {
        success: false,
        error: `Cannot delete custom role "${target.name}" because ${assignedUsers.length} staff member(s) are assigned to it. Reassign them first.`,
      };
    }
    setCustomRoles((prev) => prev.filter((r) => r.id !== roleId));
    return { success: true };
  };

  const handleCreateStaff = (input: CreateStaffInput): User => {
    const newUserId = generateUniqueUserId(users);
    const todayDate = getTodayYmd();
    const roleTitle =
      input.roleLabel ||
      (input.role === 'shop_manager' ? 'Shop Manager' : 'Cashier');

    const newStaff: User = {
      id: newUserId,
      businessId: activeBusiness.id,
      username: input.email.trim().toLowerCase().split('@')[0],
      email: input.email.trim().toLowerCase(),
      fullName: input.fullName.trim(),
      role: input.role,
      roleLabel: roleTitle,
      customRoleId: input.customRoleId,
      assignedShopIds: [...input.assignedShopIds],
      permissions: [...input.permissions],
      status: 'active',
      createdAt: todayDate,
      lastLoginAt: 'Never (Newly Created)',
    };

    const newAssignments: ShopAssignment[] = input.assignedShopIds.map(
      (shopId: string, idx: number) => ({
        id: `asgn-${Date.now()}-${idx}`,
        userId: newUserId,
        businessId: activeBusiness.id,
        shopId,
        assignedAt: todayDate,
        assignedByUserId: currentUser.id,
        isActive: true,
      })
    );

    setUsers((prev) => [...prev, newStaff]);
    setShopAssignments((prev) => [...prev, ...newAssignments]);

    if (dataMode !== 'demo') {
      const idempotencyKey = `invite-staff-${activeBusiness.id}-${newUserId}-${Date.now()}`;
      liveDataService
        .inviteLiveStaffUser(newStaff, {
          idempotencyKey,
        })
        .then((invited) => {
          setUsers((prevU) => {
            setShopAssignments((prevA) => {
              const reconciled = reconcileInvitedStaffState(
                { users: prevU, shopAssignments: prevA },
                newUserId,
                invited.staffUser
              );
              return reconciled.shopAssignments;
            });
            return prevU.map((u) =>
              u.id === newUserId ? invited.staffUser : u
            );
          });
        })
        .catch((err) => {
          const assignmentIds = new Set(newAssignments.map((a) => a.id));
          setUsers((prev) => prev.filter((u) => u.id !== newUserId));
          setShopAssignments((prev) =>
            prev.filter((a) => !assignmentIds.has(a.id) && a.userId !== newUserId)
          );
          setLiveErrorMessage(
            err instanceof Error
              ? err.message
              : 'Failed to invite staff user via Cloud Function.'
          );
        });
    }

    return newStaff;
  };

  const handleUpdateStaff = (
    userId: string,
    input: CreateStaffInput,
    status: AccountStatus
  ) => {
    const todayDate = getTodayYmd();
    const roleTitle =
      input.roleLabel ||
      (input.role === 'shop_manager' ? 'Shop Manager' : 'Cashier');

    const existingStaff = users.find(
      (u) =>
        u.id === userId &&
        u.businessId === activeBusiness.id &&
        u.role !== 'business_owner'
    );
    const previousAssignments = shopAssignments.filter(
      (a) => a.userId === userId
    );

    setUsers((prev) =>
      prev.map((u) => {
        if (
          u.id !== userId ||
          u.businessId !== activeBusiness.id ||
          u.role === 'business_owner'
        ) {
          return u;
        }
        return {
          ...u,
          fullName: input.fullName.trim(),
          email: input.email.trim().toLowerCase(),
          role: input.role,
          roleLabel: roleTitle,
          customRoleId: input.customRoleId,
          assignedShopIds: [...input.assignedShopIds],
          permissions: [...input.permissions],
          status,
        };
      })
    );

    // Sync shopAssignments collection for this staff member
    setShopAssignments((prev) => {
      const otherUsersAssignments = prev.filter((a) => a.userId !== userId);
      const updatedAssignments: ShopAssignment[] = input.assignedShopIds.map(
        (shopId: string, idx: number) => ({
          id: `asgn-${userId}-${shopId}-${idx}`,
          userId,
          businessId: activeBusiness.id,
          shopId,
          assignedAt: todayDate,
          assignedByUserId: currentUser.id,
          isActive: true,
        })
      );
      return [...otherUsersAssignments, ...updatedAssignments];
    });

    if (dataMode !== 'demo' && existingStaff) {
      liveDataService
        .persistLiveStaffUser({
          ...existingStaff,
          fullName: input.fullName.trim(),
          email: input.email.trim().toLowerCase(),
          role: input.role,
          roleLabel: roleTitle,
          customRoleId: input.customRoleId,
          assignedShopIds: [...input.assignedShopIds],
          permissions: [...input.permissions],
          status,
        })
        .catch((err) => {
          setUsers((prev) =>
            prev.map((u) => (u.id === userId ? existingStaff : u))
          );
          setShopAssignments((prev) => [
            ...prev.filter((a) => a.userId !== userId),
            ...previousAssignments,
          ]);
          setLiveErrorMessage(
            err instanceof Error
              ? err.message
              : 'Failed to update staff user in Cloud Firestore.'
          );
        });
    }
  };

  const handleToggleStaffStatus = (
    userId: string,
    nextStatus: AccountStatus
  ) => {
    const existingStaff = users.find(
      (u) =>
        u.id === userId &&
        u.businessId === activeBusiness.id &&
        u.role !== 'business_owner'
    );
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId &&
        u.businessId === activeBusiness.id &&
        u.role !== 'business_owner'
          ? { ...u, status: nextStatus }
          : u
      )
    );
    if (dataMode !== 'demo' && existingStaff) {
      liveDataService
        .persistLiveStaffUser({ ...existingStaff, status: nextStatus })
        .catch((err) => {
          setUsers((prev) =>
            prev.map((u) => (u.id === userId ? existingStaff : u))
          );
          setLiveErrorMessage(
            err instanceof Error
              ? err.message
              : 'Failed to update staff status in Cloud Firestore.'
          );
        });
    }
  };

  const handleUpdateUserPermissions = (
    userId: string,
    permissions: PermissionKey[]
  ) => {
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id !== userId) return u;
        return {
          ...u,
          permissions: [...permissions],
        };
      })
    );
  };

  const handleResetUserPassword = (userId: string, newPassword: string) => {
    const nowFormatted = formatPosTimestamp();
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id !== userId) return u;
        if (!canActorResetUserPassword(currentUser, u)) return u;
        return applyUserPasswordReset(u, newPassword, nowFormatted);
      })
    );
  };

  // =========================================================================
  // PHASE 1: POS, INVENTORY, CATEGORY, UNIT & SETTINGS HANDLERS
  // =========================================================================
  const handleCompleteDemoSale = (
    cart: CartItem[],
    paymentMethod: PaymentMethod,
    discountAmount: number,
    taxAmount: number,
    totalAmount: number,
    amountTendered: number,
    paymentReference?: string,
    creditCustomer?: DebtCustomer
  ): SaleTransaction => {
    if (!activeShop) {
      throw new Error('No active shop selected');
    }

    const nowFormatted = formatPosTimestamp();
    const receiptSeq = 900 + activeShopSales.length + 1;
    const receiptNumber = `${activeShop.code.split('-')[0]}-2026-0${receiptSeq}`;
    const isDemo = dataMode === 'demo';

    const subtotal = cart.reduce(
      (sum, item) => sum + item.product.sellingPrice * item.quantity,
      0
    );

    const isCreditSale = paymentMethod === 'credit';
    const effectiveTendered = isCreditSale ? 0 : amountTendered;
    const effectiveChangeDue = isCreditSale
      ? 0
      : Math.max(0, amountTendered - totalAmount);

    const canonicalSaleId = `sale-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const newSale: SaleTransaction = {
      id: canonicalSaleId,
      shopId: activeShop.id,
      businessId: activeBusiness.id,
      receiptNumber,
      terminalId: activeShop.terminalId,
      cashierUserId: currentUser.id,
      cashierName: currentUser.fullName,
      createdAt: nowFormatted,
      items: cart.map((item, idx) => ({
        id: `line-${canonicalSaleId}-${idx + 1}`,
        productId: item.product.id,
        sku: item.product.sku,
        barcode: item.product.barcode,
        productName: item.product.name,
        unit: item.product.unit || 'Unit',
        unitPrice: item.product.sellingPrice,
        costPrice: item.product.costPrice,
        quantity: item.quantity,
        lineTotal: item.product.sellingPrice * item.quantity,
      })),
      subtotal,
      discountAmount,
      taxRatePercent: activeShop.taxRatePercent,
      taxAmount,
      totalAmount,
      amountTendered: effectiveTendered,
      changeDue: effectiveChangeDue,
      paymentMethod,
      paymentReference: isCreditSale
        ? paymentReference || `CREDIT-${receiptNumber}`
        : paymentReference,
      creditCustomerId: creditCustomer?.id,
      creditCustomerName: creditCustomer?.fullName,
      creditCustomerPhone: creditCustomer?.phone,
      status: 'completed',
      syncStatus: isDemo ? 'queued_offline_demo' : 'pending_local_queue',
      notes: isCreditSale && creditCustomer
        ? `Credit Sale to ${creditCustomer.fullName} (${creditCustomer.phone})`
        : isDemo
          ? 'Demonstration POS checkout'
          : 'POS checkout',
    };

    setProducts((prev) =>
      prev.map((prod) => {
        if (prod.shopId !== activeShop.id) return prod;
        const cartMatch = cart.find((c) => c.product.id === prod.id);
        if (!cartMatch) return prod;
        const newQty = Math.max(0, prod.stockQuantity - cartMatch.quantity);
        const updatedProd: Product = {
          ...prod,
          stockQuantity: newQty,
          updatedAt: nowFormatted,
        };
        return updatedProd;
      })
    );

    if (isCreditSale && creditCustomer) {
      const totalItemsCount = cart.reduce((sum, i) => sum + i.quantity, 0);
      handleRecordDebtTransaction(creditCustomer.id, 'credit', totalAmount, {
        reference: receiptNumber,
        notes: `POS Credit Sale (${receiptNumber}) — ${totalItemsCount} item${
          totalItemsCount === 1 ? '' : 's'
        }`,
      });
    }

    const isAuthorizedLiveTenantCheckout =
      !isDemo &&
      Boolean(currentUser.id && currentUser.id !== 'unauthenticated') &&
      currentUser.status === 'active' &&
      currentUser.businessId === activeBusiness.id &&
      !isKnownDemoRecord(activeBusiness) &&
      !isKnownDemoRecord(activeShop) &&
      !isPreFirebaseTestRecord(activeBusiness) &&
      !isPreFirebaseTestRecord(activeShop);

    setSales((prev) => [newSale, ...prev]);
    setShops((prev) =>
      prev.map((s) =>
        s.id === activeShop.id
          ? { ...s, pendingSyncCount: s.pendingSyncCount + 1 }
          : s
      )
    );

    // Phase 5 & 6: Concurrency-safe atomic local transaction followed by verified atomic server sync (syncPosOperation)
    if (isAuthorizedLiveTenantCheckout) {
      const checkoutOpId = `chk-${activeShop.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const syncOperationId = `sync-${canonicalSaleId}`;
      saleFinalizationService
        .finalizeSale({
          saleId: canonicalSaleId,
          dataMode,
          businessId: activeBusiness.id,
          shopId: activeShop.id,
          user: currentUser,
          cart,
          paymentMethod,
          discountAmount,
          taxRatePercent: activeShop.taxRatePercent,
          taxAmount,
          totalAmount,
          amountTendered: effectiveTendered,
          paymentReference: isCreditSale
            ? paymentReference || `CREDIT-${receiptNumber}`
            : paymentReference,
          creditCustomerId: creditCustomer?.id,
          creditCustomerName: creditCustomer?.fullName,
          creditCustomerPhone: creditCustomer?.phone,
          notes:
            isCreditSale && creditCustomer
              ? `Credit Sale to ${creditCustomer.fullName} (${creditCustomer.phone})`
              : 'POS checkout',
          terminalId: activeShop.terminalId,
          checkoutOperationId: checkoutOpId,
          receiptNumber,
        })
        .then(async () => {
          if (dataMode !== 'live') return;
          const ackResult = await liveDataService.persistLiveSale(
            newSale,
            [],
            {
              operationId: syncOperationId,
              idempotencyKey: checkoutOpId,
              actorUserId: currentUser.id,
            }
          );
          if (ackResult.outcome === 'acknowledged' && ackResult.ackId) {
            setSales((prev) =>
              prev.map((s) =>
                s.id === canonicalSaleId
                  ? { ...s, status: 'completed', syncStatus: 'synced' }
                  : s
              )
            );
            setShops((prev) =>
              prev.map((s) =>
                s.id === activeShop.id
                  ? {
                      ...s,
                      pendingSyncCount: Math.max(0, s.pendingSyncCount - 1),
                      lastSyncedAt: 'Just now (Cloud Verified)',
                    }
                  : s
              )
            );
          }
        })
        .catch((err) => {
          console.warn(
            'Sale preserved locally in pending sync queue:',
            err?.message || err
          );
        });
    }

    return newSale;
  };

  const handleDeleteProduct = (productId: string) => {
    if (!activeShop) return;
    setProducts((prev) =>
      prev.filter((p) => !(p.id === productId && p.shopId === activeShop.id))
    );
    if (dataMode === 'demo') {
      dbAdapter.deleteProduct(productId, activeShop.id).catch(() => {});
    } else {
      liveDataService
        .removeLiveProduct(activeBusiness.id, activeShop.id, productId)
        .catch((err) => {
          setLiveErrorMessage(
            err instanceof Error
              ? err.message
              : 'Failed to delete product from Cloud Firestore.'
          );
        });
    }
  };

  const handleSaveProduct = (
    input: ProductFormInput,
    editingProductId?: string
  ) => {
    if (!activeShop) return;
    const categoryObj = activeShopCategories.find(
      (c) => c.id === input.categoryId
    );
    const categoryName = categoryObj?.name ?? 'General';

    if (editingProductId) {
      const existingProduct = products.find(
        (p) => p.id === editingProductId && p.shopId === activeShop.id
      );
      if (!existingProduct) return;

      const updatedProduct: Product = {
        ...existingProduct,
        name: input.name.trim(),
        sku: input.sku.trim(),
        barcode: input.barcode.trim(),
        categoryId: input.categoryId,
        categoryName,
        unit: input.unit.trim() || 'Unit',
        costPrice: input.costPrice,
        sellingPrice: input.sellingPrice,
        stockQuantity: input.stockQuantity,
        reorderLevel: input.reorderLevel,
        updatedAt: formatPosTimestamp(),
      };

      setProducts((prev) =>
        prev.map((p) =>
          p.id === editingProductId && p.shopId === activeShop.id
            ? updatedProduct
            : p
        )
      );

      if (dataMode !== 'demo') {
        liveDataService.persistLiveProduct(updatedProduct).catch((err) => {
          setLiveErrorMessage(
            err instanceof Error
              ? err.message
              : 'Failed to update product in Cloud Firestore.'
          );
        });
      }
    } else {
      const newProduct: Product = {
        id: generateUniqueProductId(products, activeShop.id),
        shopId: activeShop.id,
        businessId: activeBusiness.id,
        sku: input.sku.trim(),
        barcode: input.barcode.trim(),
        name: input.name.trim(),
        categoryId: input.categoryId,
        categoryName,
        unit: input.unit.trim() || 'Unit',
        costPrice: input.costPrice,
        sellingPrice: input.sellingPrice,
        stockQuantity: input.stockQuantity,
        reorderLevel: input.reorderLevel,
        isActive: true,
        updatedAt: formatPosTimestamp(),
      };
      setProducts((prev) => [newProduct, ...prev]);

      if (dataMode !== 'demo') {
        liveDataService.persistLiveProduct(newProduct).catch((err) => {
          setLiveErrorMessage(
            err instanceof Error
              ? err.message
              : 'Failed to save product to Cloud Firestore.'
          );
        });
      }
    }
  };

  const handleRecordStockAdjustment = (
    productId: string,
    type: StockAdjustmentType,
    quantity: number,
    reason: string
  ) => {
    if (!activeShop) return;
    const target = activeShopProducts.find((p) => p.id === productId);
    if (!target) return;

    const { updatedProduct, adjustment } = applyStockAdjustment(
      target,
      type,
      quantity,
      reason,
      currentUser,
      formatPosTimestamp()
    );

    setProducts((prev) =>
      prev.map((p) => (p.id === updatedProduct.id ? updatedProduct : p))
    );
    setStockAdjustments((prev) => [adjustment, ...prev]);

    if (dataMode !== 'demo') {
      liveDataService.persistLiveProduct(updatedProduct).catch(() => {});
    }
  };

  const handleProcessReceiptReturn = (
    saleId: string,
    updatedQuantitiesByLineId: Record<string, number>,
    reason: string
  ) => {
    if (!activeShop) return;
    const targetSale = activeShopSales.find((s) => s.id === saleId);
    if (!targetSale) return;

    const result = calculateReceiptReturnResult(
      targetSale,
      updatedQuantitiesByLineId
    );
    if (result.returnedItems.length === 0) return;

    const nowFormatted = formatPosTimestamp();

    // 1. Update receipt items and reduced totals in sales state
    setSales((prev) =>
      prev.map((s) => (s.id === saleId ? result.updatedSale : s))
    );

    // 2. Build return_in stock adjustments and updated product quantities synchronously
    const newAdjustments: StockAdjustment[] = [];
    const updatedStockByProductId: Record<string, number> = {};

    result.returnedItems.forEach((retItem, idx) => {
      const shopProduct = activeShopProducts.find(
        (p) => p.id === retItem.productId
      );
      const baseStock =
        updatedStockByProductId[retItem.productId] !== undefined
          ? updatedStockByProductId[retItem.productId]
          : shopProduct?.stockQuantity ?? 0;
      const nextStock = baseStock + retItem.returnedQuantity;
      updatedStockByProductId[retItem.productId] = nextStock;

      newAdjustments.push({
        id: `adj-ret-${getUniqueTimestampSuffix()}-${idx}-${retItem.lineId}`,
        shopId: activeShop.id,
        businessId: activeBusiness.id,
        productId: retItem.productId,
        productName: shopProduct?.name ?? retItem.productName,
        productSku: shopProduct?.sku ?? retItem.sku,
        type: 'return_in',
        quantityDelta: retItem.returnedQuantity,
        previousQuantity: baseStock,
        newQuantity: nextStock,
        reason: `Receipt #${targetSale.receiptNumber} Return: Reduced qty from ${retItem.originalQuantity} to ${retItem.remainingQuantity} (+${retItem.returnedQuantity} returned) — ${
          reason.trim() || 'Customer receipt return'
        }`,
        performedByUserId: currentUser.id,
        performedByName: currentUser.fullName,
        createdAt: nowFormatted,
        syncStatus: 'pending_local_queue',
      });
    });

    // 3. Apply stock restoration to shop products
    setProducts((prev) =>
      prev.map((p) => {
        if (
          p.shopId !== activeShop.id ||
          updatedStockByProductId[p.id] === undefined
        ) {
          return p;
        }
        return {
          ...p,
          stockQuantity: updatedStockByProductId[p.id],
          updatedAt: nowFormatted,
        };
      })
    );

    // 4. Prepend returned item records to stockAdjustments so they appear in All Adjustments & Returns
    if (newAdjustments.length > 0) {
      setStockAdjustments((prev) => [...newAdjustments, ...prev]);
    }
  };

  const handleAddCategory = (
    name: string,
    description: string
  ): ProductCategory => {
    if (!activeShop) {
      throw new Error('No active shop selected');
    }
    const newCat: ProductCategory = {
      id: generateUniqueCategoryId(categories, activeShop.id),
      shopId: activeShop.id,
      businessId: activeBusiness.id,
      name,
      description: description || `Category for ${activeShop.name}`,
    };
    setCategories((prev) => [...prev, newCat]);
    return newCat;
  };

  const handleAddUnit = (
    name: string,
    abbreviation: string
  ): UnitOfMeasurement => {
    if (!activeShop) {
      throw new Error('No active shop selected');
    }
    const newUnit: UnitOfMeasurement = {
      id: generateUniqueUnitId(units, activeShop.id),
      shopId: activeShop.id,
      businessId: activeBusiness.id,
      name,
      abbreviation: abbreviation || name.toLowerCase().slice(0, 4),
    };
    setUnits((prev) => [...prev, newUnit]);
    return newUnit;
  };

  const handleUpdateShopSettings = (
    shopId: string,
    updates: Partial<
      Pick<
        Shop,
        | 'name'
        | 'phone'
        | 'taxRatePercent'
        | 'receiptHeaderNote'
        | 'receiptFooterNote'
        | 'printerSettings'
      >
    >
  ) => {
    setShops((prev) =>
      prev.map((s) => (s.id === shopId ? { ...s, ...updates } : s))
    );
  };

  const handleUpdateBusinessCurrency = (
    businessId: string,
    currencyCode: string
  ) => {
    const option = getCurrencyOptionByCode(currencyCode);
    setBusinesses((prev) =>
      prev.map((b) =>
        b.id === businessId
          ? {
              ...b,
              currencyCode: option.code,
              currencySymbol: option.symbol,
            }
          : b
      )
    );
  };

  // =========================================================================
  // DEBT BOOK HANDLERS (CUSTOMER REGISTRATION & CREDIT / DEPOSIT TRANSACTIONS)
  // =========================================================================
  const handleAddDebtCustomer = (
    input: CreateDebtCustomerInput
  ): DebtCustomer => {
    if (!activeShop) {
      throw new Error('No active shop selected');
    }
    const nowFormatted = formatPosTimestamp();
    const newCustomer: DebtCustomer = {
      id: generateUniqueDebtCustomerId(debtCustomers, activeShop.id),
      shopId: activeShop.id,
      businessId: activeBusiness.id,
      fullName: input.fullName.trim(),
      phone: input.phone.trim(),
      creditLimitEnabled: input.creditLimitEnabled,
      creditLimitAmount: input.creditLimitEnabled
        ? Math.max(0, Math.round(input.creditLimitAmount * 100) / 100)
        : 0,
      totalCredit: 0,
      amountPaid: 0,
      balanceRemaining: 0,
      createdAt: nowFormatted,
      updatedAt: nowFormatted,
      notes: input.notes?.trim() || undefined,
    };

    setDebtCustomers((prev) => [newCustomer, ...prev]);
    return newCustomer;
  };

  const handleRecordDebtTransaction = (
    customerId: string,
    type: DebtTransactionType,
    amount: number,
    options?: {
      paymentMethod?: PaymentMethod;
      reference?: string;
      notes?: string;
    }
  ) => {
    if (!activeShop) return;
    const nowFormatted = formatPosTimestamp();

    setDebtCustomers((prev) => {
      const targetCustomer = prev.find(
        (c) => c.id === customerId && c.shopId === activeShop.id
      );
      if (!targetCustomer) return prev;

      const { updatedCustomer, transaction } = applyDebtTransaction(
        targetCustomer,
        type,
        amount,
        {
          paymentMethod: options?.paymentMethod,
          reference: options?.reference,
          notes: options?.notes,
          user: currentUser,
          timestampIso: nowFormatted,
        }
      );

      setDebtTransactions((prevTx) => [transaction, ...prevTx]);
      return prev.map((c) =>
        c.id === updatedCustomer.id ? updatedCustomer : c
      );
    });
  };

  // =========================================================================
  // INVOICE HANDLERS
  // =========================================================================
  const handleSaveInvoice = (
    invoiceData: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>
  ): Invoice => {
    if (!activeShop) {
      throw new Error('No active shop selected');
    }
    const nowFormatted = formatPosTimestamp();
    const initialPaid = invoiceData.amountPaid || 0;
    const initialBalance = Math.max(0, invoiceData.totalAmount - initialPaid);
    let initialStatus: InvoiceStatus = invoiceData.status || 'unpaid';

    if (initialBalance === 0) {
      initialStatus = 'paid';
    } else if (initialPaid > 0) {
      initialStatus = 'partially_paid';
    }

    const newInvoice: Invoice = {
      ...invoiceData,
      id: generateUniqueInvoiceId(invoices, activeShop.id),
      amountPaid: initialPaid,
      balanceRemaining: initialBalance,
      status: initialStatus,
      payments: invoiceData.payments || [],
      createdAt: nowFormatted,
      updatedAt: nowFormatted,
    };
    setInvoices((prev) => [newInvoice, ...prev]);
    return newInvoice;
  };

  const handleRecordInvoicePayment = (
    invoiceId: string,
    amount: number,
    paymentMethod: PaymentMethod,
    paymentReference?: string,
    notes?: string
  ) => {
    const nowFormatted = formatPosTimestamp();
    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id !== invoiceId) return inv;

        const currentPaid = inv.amountPaid || 0;
        const newPaymentAmount = Math.max(0, amount);
        const updatedAmountPaid = Math.min(
          inv.totalAmount,
          Math.round((currentPaid + newPaymentAmount) * 100) / 100
        );
        const newBalance = Math.max(
          0,
          Math.round((inv.totalAmount - updatedAmountPaid) * 100) / 100
        );

        let newStatus: InvoiceStatus = inv.status;
        if (newBalance === 0) {
          newStatus = 'paid';
        } else if (updatedAmountPaid > 0) {
          newStatus = 'partially_paid';
        }

        const newRecord: InvoicePaymentRecord = {
          id: `pmt-${getUniqueTimestampSuffix()}`,
          invoiceId,
          amount: newPaymentAmount,
          paymentMethod,
          paymentReference: paymentReference?.trim() || undefined,
          notes: notes?.trim() || undefined,
          recordedByUserId: currentUser.id,
          recordedByName: currentUser.fullName,
          recordedAt: nowFormatted,
        };

        const existingPayments = inv.payments ?? [];

        return {
          ...inv,
          amountPaid: updatedAmountPaid,
          balanceRemaining: newBalance,
          status: newStatus,
          payments: [...existingPayments, newRecord],
          updatedAt: nowFormatted,
        };
      })
    );
  };

  // =========================================================================
  // SUPPLIER & SUPPLY HANDLERS
  // =========================================================================
  const handleAddSupplier = (input: CreateSupplierInput): Supplier => {
    if (!activeShop) {
      throw new Error('No active shop selected');
    }
    const nowFormatted = formatPosTimestamp();
    const newSupplier: Supplier = {
      id: generateUniqueSupplierId(suppliers, activeShop.id),
      shopId: activeShop.id,
      businessId: activeBusiness.id,
      fullName: input.fullName.trim(),
      phone: input.phone.trim(),
      email: input.email.trim(),
      address: input.address.trim(),
      totalSupplies: 0,
      totalAmount: 0,
      amountPaid: 0,
      balanceRemaining: 0,
      createdAt: nowFormatted,
      updatedAt: nowFormatted,
    };
    setSuppliers((prev) => [newSupplier, ...prev]);
    return newSupplier;
  };

  const handleAddSupplierSupplies = (
    supplierId: string,
    draftItems: SupplyDraftItem[],
    amountPaid: number,
    notes?: string
  ) => {
    if (!activeShop) return;
    const targetSupplier = suppliers.find(
      (s) => s.id === supplierId && s.shopId === activeShop.id
    );
    if (!targetSupplier) return;

    const nowFormatted = formatPosTimestamp();
    const { updatedSupplier, supplyRecord } = applySupplierSupply(
      targetSupplier,
      draftItems,
      amountPaid,
      {
        notes,
        user: currentUser,
        timestampIso: nowFormatted,
      }
    );

    // 1. Update supplier record and prepend supply record
    setSuppliers((prev) =>
      prev.map((s) => (s.id === updatedSupplier.id ? updatedSupplier : s))
    );
    setSupplierSupplies((prev) => [supplyRecord, ...prev]);

    // 2. Synchronize shop products stockQuantity & costPrice and log restock adjustments
    const newAdjustments: StockAdjustment[] = [];
    const productUpdates = new Map<
      string,
      { nextStock: number; nextCostPrice: number }
    >();

    supplyRecord.items.forEach((item, idx) => {
      const shopProduct = activeShopProducts.find(
        (p) => p.id === item.productId
      );
      if (!shopProduct) return;

      const prevStock =
        productUpdates.get(item.productId)?.nextStock ??
        shopProduct.stockQuantity;
      const nextStock = prevStock + item.quantity;
      const nextCostPrice =
        item.costPrice > 0 ? item.costPrice : shopProduct.costPrice;

      productUpdates.set(item.productId, { nextStock, nextCostPrice });

      newAdjustments.push({
        id: `adj-sup-${Date.now()}-${idx}-${item.productId}`,
        shopId: activeShop.id,
        businessId: activeBusiness.id,
        productId: item.productId,
        productName: shopProduct.name,
        productSku: shopProduct.sku,
        type: 'restock',
        quantityDelta: item.quantity,
        previousQuantity: prevStock,
        newQuantity: nextStock,
        reason: `Supplier Supply (${targetSupplier.fullName}): +${item.quantity} ${item.unit} @ ${formatCurrency(
          item.costPrice,
          activeBusiness.currencySymbol
        )}${notes?.trim() ? ` — ${notes.trim()}` : ''}`,
        performedByUserId: currentUser.id,
        performedByName: currentUser.fullName,
        createdAt: nowFormatted,
        syncStatus: 'pending_local_queue',
      });
    });

    if (productUpdates.size > 0) {
      setProducts((prev) =>
        prev.map((p) => {
          const upd = productUpdates.get(p.id);
          if (!upd || p.shopId !== activeShop.id) return p;
          return {
            ...p,
            stockQuantity: upd.nextStock,
            costPrice: upd.nextCostPrice,
            updatedAt: nowFormatted,
          };
        })
      );
    }

    if (newAdjustments.length > 0) {
      setStockAdjustments((prev) => [...newAdjustments, ...prev]);
    }
  };

  const handleRecordSupplierPayment = (supplierId: string, amount: number) => {
    if (!activeShop) return;
    const nowFormatted = formatPosTimestamp();
    setSuppliers((prev) =>
      prev.map((s) => {
        if (s.id !== supplierId || s.shopId !== activeShop.id) return s;
        return applySupplierBalancePayment(s, amount, nowFormatted);
      })
    );
  };

  const environmentBannerNode = (
    <DataEnvironmentBanner
      dataMode={dataMode}
      currentUserEmail={liveResolution?.email || currentUser.email}
      currentUserRole={currentUser.role}
      businessName={
        activeBusiness.id !== 'unassigned' ? activeBusiness.name : undefined
      }
      storageAudit={storageAudit}
      liveErrorMessage={liveErrorMessage}
      isRefreshingLive={isRefreshingLive}
      onRefreshLive={
        dataMode !== 'demo' ? handleRefreshLiveWorkspace : undefined
      }
      onSwitchToLiveLogin={handleSignOut}
      onConfirmClearDemoData={handleConfirmClearDemoData}
      onPurgeQuarantinedRecords={
        currentUser.role === 'platform_admin'
          ? handlePurgeQuarantinedRecords
          : undefined
      }
    />
  );

  // =========================================================================
  // STAGE 1: LOGIN
  // =========================================================================
  if (sessionStage === 'login') {
    const savedDemoUsers = loadIsolatedDemoStore()?.users ?? DEMO_USERS;
    return (
      <LoginPage
        demoUsers={savedDemoUsers}
        onAuthenticated={handleAuthenticated}
        onAuthenticatedFirebase={handleAuthenticatedFirebase}
      />
    );
  }

  // =========================================================================
  // STAGE 1B: LIVE ONBOARDING / NO BUSINESS MEMBERSHIP ASSIGNED IN FIRESTORE
  // =========================================================================
  if (sessionStage === 'live_onboarding' && liveResolution) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-950">
        {environmentBannerNode}
        <LiveOnboardingPage
          status={
            liveResolution.status === 'ready'
              ? 'no_membership'
              : liveResolution.status
          }
          uid={liveResolution.uid}
          email={liveResolution.email}
          displayName={liveResolution.displayName}
          missingBusinessId={liveResolution.missingBusinessId}
          isBootstrapAdminCandidate={liveResolution.isBootstrapAdminCandidate}
          errorCode={liveResolution.errorCode}
          errorMessage={liveResolution.errorMessage}
          requiredProvisioningSteps={liveResolution.requiredProvisioningSteps}
          isBusy={isRefreshingLive}
          onRetryMembershipCheck={handleRefreshLiveWorkspace}
          onProvisionLiveBusinessOwner={async (businessInput, shopInput) => {
            const res = await liveDataService.provisionLiveBusinessOwnerWorkspace(
              {
                uid: liveResolution.uid,
                email: liveResolution.email,
                fullName: liveResolution.displayName,
                emailVerified:
                  liveResolution.emailVerified ??
                  auth.currentUser?.emailVerified,
                businessInput,
                initialShopInput: shopInput,
              }
            );
            applyLiveResolutionResult(res);
          }}
          onProvisionLivePlatformAdmin={async () => {
            const res = await liveDataService.provisionLivePlatformAdminProfile({
              uid: liveResolution.uid,
              email: liveResolution.email,
              fullName: liveResolution.displayName,
              emailVerified:
                liveResolution.emailVerified ??
                auth.currentUser?.emailVerified,
            });
            applyLiveResolutionResult(res);
          }}
          onSignOut={handleSignOut}
        />
      </div>
    );
  }

  // =========================================================================
  // STAGE 2: PLATFORM ADMINISTRATOR CONSOLE
  // =========================================================================
  if (
    sessionStage === 'platform_admin' ||
    currentUser.role === 'platform_admin'
  ) {
    return (
      <div className="min-h-screen flex flex-col">
        {environmentBannerNode}
        <div className="flex-1">
          <PlatformAdminPage
            currentUser={currentUser}
            businesses={businesses}
            shops={shops}
            users={users}
            products={products}
            sales={sales}
            customRoles={customRoles}
            dataMode={dataMode}
            firestoreDatabaseId={firebaseConfig.firestoreDatabaseId}
            connectivity={connectivitySnapshot}
            onChangeConnectivityState={setConnectivityState}
            onCreateBusiness={handleCreateBusiness}
            onUpdateBusiness={handleUpdateBusiness}
            onToggleBusinessStatus={handleToggleBusinessStatus}
            onRepairBusinessOwnerAuth={
              dataMode !== 'demo' ? handleRepairBusinessOwnerAuth : undefined
            }
            onSendOwnerPasswordSetupEmail={
              dataMode !== 'demo' ? handleSendOwnerPasswordSetupEmail : undefined
            }
            onAdjustInventory={async (params) => {
              if (dataMode !== 'demo' && liveDataService) {
                await liveDataService.adjustInventoryAsAdmin({
                  ...params,
                  adminUser: currentUser,
                });
              }
              setProducts((prev) =>
                prev.map((p) =>
                  p.id === params.productId
                    ? {
                        ...p,
                        stockQuantity: Math.max(0, p.stockQuantity + params.delta),
                        updatedAt: new Date().toISOString(),
                      }
                    : p
                )
              );
            }}
            onUpdateSaleStatus={async (params) => {
              if (dataMode !== 'demo' && liveDataService) {
                await liveDataService.updateSaleStatusAsAdmin({
                  ...params,
                  adminUser: currentUser,
                });
              }
              setSales((prev) =>
                prev.map((s) =>
                  s.id === params.saleId
                    ? {
                        ...s,
                        status:
                          params.nextStatus === 'refunded'
                            ? 'refunded_demo'
                            : 'voided_demo',
                      }
                    : s
                )
              );
            }}
            onToggleUserStatus={async (params) => {
              if (dataMode !== 'demo' && liveDataService) {
                await liveDataService.toggleUserStatusAsAdmin({
                  ...params,
                  adminUser: currentUser,
                });
              }
              setUsers((prev) =>
                prev.map((u) =>
                  u.id === params.userId ? { ...u, status: params.status } : u
                )
              );
            }}
            onUpdateUserRoleAndShops={async (params) => {
              if (dataMode !== 'demo' && liveDataService) {
                await liveDataService.updateUserRoleAndShopsAsAdmin({
                  ...params,
                  adminUser: currentUser,
                });
              }
              setUsers((prev) =>
                prev.map((u) =>
                  u.id === params.userId
                    ? {
                        ...u,
                        role: params.role,
                        roleLabel: params.roleLabel || u.roleLabel,
                        assignedShopIds: params.assignedShopIds,
                      }
                    : u
                )
              );
            }}
            onCreateShop={handleCreateShop}
            onUpdateShop={handleUpdateShopSettings}
            onSwitchDemoUser={handleSwitchDemoUserAnywhere}
            onSignOut={handleSignOut}
            onCreateCustomRole={handleCreateCustomRole}
            onUpdateCustomRole={handleUpdateCustomRole}
            onDeleteCustomRole={handleDeleteCustomRole}
          />
        </div>
      </div>
    );
  }

  // =========================================================================
  // STAGE 3: BUSINESS & SHOP SELECTION
  // =========================================================================
  if (sessionStage === 'shop_selection' || !activeShop) {
    return (
      <div className="min-h-screen flex flex-col">
        {environmentBannerNode}
        <div className="flex-1">
          <ShopSelectionPage
            business={activeBusiness}
            currentUser={currentUser}
            authorizedShops={authorizedShops}
            businessShops={businessShops}
            allShops={businessShops}
            activeShopId={activeShopId}
            onSelectShop={handleSelectShopAndContinue}
            onCreateShop={handleCreateShop}
            onOpenWorkspaceView={(view, shopId) => {
              if (shopId) {
                setActiveShopId(shopId);
              }
              setActiveView(view);
              setSessionStage('workspace');
            }}
            onSignOut={handleSignOut}
            connectivity={connectivitySnapshot}
            onChangeConnectivityState={setConnectivityState}
            onSwitchDemoUser={handleSwitchDemoUserAnywhere}
            onResetUserPassword={handleResetUserPassword}
            allDemoUsers={visibleUsersForActor}
          />
        </div>
      </div>
    );
  }

  // =========================================================================
  // STAGE 4: SHOP & BUSINESS WORKSPACE SHELL
  // =========================================================================
  return (
    <div className="min-h-screen h-screen h-[100dvh] bg-slate-100 flex flex-col overflow-hidden">
      {environmentBannerNode}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <Sidebar
          activeView={safeActiveView}
          onSelectView={setActiveView}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
          activeShop={activeShop}
          currentUser={currentUser}
          onReturnToShopSelection={() => setSessionStage('shop_selection')}
          onSignOut={handleSignOut}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <TopBar
            activeView={safeActiveView}
            business={activeBusiness}
            activeShop={activeShop}
            authorizedShops={authorizedShops}
            onSwitchShop={handleSwitchShopInWorkspace}
            onOpenShopDirectory={() => setSessionStage('shop_selection')}
            currentUser={currentUser}
            allUsers={visibleUsersForActor}
            onSwitchDemoUser={handleSwitchDemoUserAnywhere}
            connectivity={connectivitySnapshot}
            onChangeConnectivityState={setConnectivityState}
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          />

          <main className="flex-1 overflow-y-auto">
            {safeActiveView === 'dashboard' && (
              <DashboardPage
                business={activeBusiness}
                shop={activeShop}
                currentUser={currentUser}
                businessUsers={businessUsers}
                businessShops={businessShops}
                shopProducts={activeShopProducts}
                shopSales={activeShopSales}
                pendingSyncCount={pendingTransactionsCount}
                dataMode={dataMode}
                onNavigate={setActiveView}
                onSelectTransaction={(sale) => setInspectedSale(sale)}
                onResetUserPassword={handleResetUserPassword}
              />
            )}

            {safeActiveView === 'pos' && (
              <PosPage
                key={`pos-${currentUser.id}-${activeShop.id}`}
                business={activeBusiness}
                shop={activeShop}
                currentUser={currentUser}
                shopCategories={activeShopCategories}
                shopProducts={activeShopProducts}
                shopSales={activeShopSales}
                shopDebtCustomers={activeShopDebtCustomers}
                onCompleteDemoSale={handleCompleteDemoSale}
                onProcessReceiptReturn={handleProcessReceiptReturn}
                onAddDebtCustomer={handleAddDebtCustomer}
                onRecordDebtTransaction={handleRecordDebtTransaction}
                onOpenDebtBook={
                  canUserAccessView(currentUser, 'debt_book')
                    ? () => setActiveView('debt_book')
                    : undefined
                }
              />
            )}

            {safeActiveView === 'inventory' && (
              <ProductsInventoryPage
                key={activeShop.id}
                business={activeBusiness}
                shop={activeShop}
                currentUser={currentUser}
                allUsers={businessUsers}
                shopCategories={activeShopCategories}
                shopUnits={activeShopUnits}
                shopProducts={activeShopProducts}
                shopSales={activeShopSales}
                shopAdjustments={activeShopAdjustments}
                onSaveProduct={handleSaveProduct}
                onDeleteProduct={handleDeleteProduct}
                onRecordStockAdjustment={handleRecordStockAdjustment}
                onProcessReceiptReturn={handleProcessReceiptReturn}
                onAddCategory={handleAddCategory}
                onAddUnit={handleAddUnit}
              />
            )}

            {safeActiveView === 'invoices' && (
              <InvoicesPage
                key={activeShop.id}
                shop={activeShop}
                business={activeBusiness}
                shopProducts={activeShopProducts}
                invoices={activeShopInvoices}
                debtCustomers={activeShopDebtCustomers}
                currentUser={currentUser}
                onSaveInvoice={handleSaveInvoice}
                onRecordInvoicePayment={handleRecordInvoicePayment}
                onAddDebtCustomer={handleAddDebtCustomer}
              />
            )}

            {safeActiveView === 'sales' && (
              <SalesHistoryPage
                key={activeShop.id}
                business={activeBusiness}
                shop={activeShop}
                shopSales={activeShopSales}
                businessUsers={businessUsers}
                shopProducts={activeShopProducts}
                currentUser={currentUser}
                initialSelectedSale={inspectedSale}
                onClearInitialSelectedSale={() => setInspectedSale(null)}
              />
            )}

            {safeActiveView === 'sales_summary' && (
              <SalesSummaryPage
                key={activeShop.id}
                business={activeBusiness}
                shop={activeShop}
                shopSales={activeShopSales}
                businessUsers={businessUsers}
                shopDebtCustomers={activeShopDebtCustomers}
                currentUser={currentUser}
              />
            )}

            {safeActiveView === 'debt_book' && (
              <DebtBookPage
                key={activeShop.id}
                business={activeBusiness}
                shop={activeShop}
                currentUser={currentUser}
                shopDebtCustomers={activeShopDebtCustomers}
                shopDebtTransactions={activeShopDebtTransactions}
                onAddDebtCustomer={handleAddDebtCustomer}
                onRecordDebtTransaction={handleRecordDebtTransaction}
              />
            )}

            {safeActiveView === 'reports' && (
              <ReportsPage
                business={activeBusiness}
                activeShop={activeShop}
                authorizedShops={authorizedShops}
                currentUser={currentUser}
                businessUsers={businessUsers}
                allProducts={products}
                allSales={sales}
                onSwitchActiveShop={handleSwitchShopInWorkspace}
              />
            )}

            {safeActiveView === 'suppliers' && (
              <SuppliersPage
                key={activeShop.id}
                business={activeBusiness}
                shop={activeShop}
                currentUser={currentUser}
                shopProducts={activeShopProducts}
                shopSuppliers={activeShopSuppliers}
                shopSupplierSupplies={activeShopSupplierSupplies}
                onAddSupplier={handleAddSupplier}
                onAddSupplierSupplies={handleAddSupplierSupplies}
                onRecordSupplierPayment={handleRecordSupplierPayment}
              />
            )}

            {safeActiveView === 'shops' && (
              <ShopsManagementPage
                business={activeBusiness}
                currentUser={currentUser}
                businessShops={businessShops}
                activeShop={activeShop}
                businessUsers={businessUsers}
                onCreateShop={handleCreateShop}
                onUpdateShop={handleUpdateShop}
                onToggleShopStatus={handleToggleShopStatus}
                onSwitchActiveShop={handleSwitchShopInWorkspace}
              />
            )}

            {safeActiveView === 'staff' && (
              <StaffManagementPage
                business={activeBusiness}
                currentUser={currentUser}
                businessUsers={businessUsers}
                businessShops={businessShops}
                shopAssignments={shopAssignments}
                allUsers={users}
                customRoles={customRoles}
                onCreateStaff={handleCreateStaff}
                onUpdateStaff={handleUpdateStaff}
                onToggleStaffStatus={handleToggleStaffStatus}
                onResetUserPassword={handleResetUserPassword}
                onCreateCustomRole={handleCreateCustomRole}
                onUpdateCustomRole={handleUpdateCustomRole}
                onDeleteCustomRole={handleDeleteCustomRole}
              />
            )}

            {safeActiveView === 'settings' && (
              <SettingsPage
                key={activeShop.id}
                business={activeBusiness}
                activeShop={activeShop}
                allUsers={businessUsers}
                currentUser={currentUser}
                connectivity={connectivitySnapshot}
                onChangeConnectivityState={setConnectivityState}
                onUpdateShopSettings={handleUpdateShopSettings}
                onUpdateBusinessCurrency={handleUpdateBusinessCurrency}
                onUpdateUserPermissions={handleUpdateUserPermissions}
                onResetUserPassword={handleResetUserPassword}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
