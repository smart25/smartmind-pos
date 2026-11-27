/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { LogOut } from 'lucide-react';
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
  PayrollEmployee,
  PayrollPeriod,
  PermissionKey,
  Product,
  ProductCategory,
  ProductTransfer,
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
  ShopPrinterSettings,
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
  canUserAccessShop,
} from './utils/posCalculations';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { DataEnvironmentBanner } from './components/layout/DataEnvironmentBanner';
import { AppUpdateNotificationModal } from './components/desktop/AppUpdateNotificationModal';
import { PwaInstallBanner } from './components/pwa/PwaInstallBanner';
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
import { ProductTransferPage } from './pages/ProductTransferPage';
import { ExpiringProductsPage } from './pages/ExpiringProductsPage';
import { GenerateBarcodePage } from './pages/GenerateBarcodePage';
import { SalesHistoryPage } from './pages/SalesHistoryPage';
import { SalesSummaryPage } from './pages/SalesSummaryPage';
import { DebtBookPage } from './pages/DebtBookPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { ReportsPage } from './pages/ReportsPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { ShopsManagementPage } from './pages/ShopsManagementPage';
import { StaffManagementPage } from './pages/StaffManagementPage';
import { PayrollEmployeesPage } from './pages/PayrollEmployeesPage';
import { PayrollPaymentsPage } from './pages/PayrollPaymentsPage';
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
  loadBusinessScopedLiveCache,
  loadUserScopedLiveCache,
  purgeQuarantinedPreFirebaseRecords,
  quarantinePreFirebaseTestSales,
  reconcileInvitedStaffState,
  RepairLiveBusinessOwnerAuthResult,
  saveBusinessScopedLiveCache,
  saveUserScopedLiveCache,
  SendOwnerPasswordSetupEmailResult,
  SPECIFIED_PRE_FIREBASE_SALE_ID_SET,
  SPECIFIED_PRE_FIREBASE_SYNC_ID_SET,
  StorageAuditReport,
} from './services/liveFirestoreDataService';
import { fromMinorUnits } from './db/schema';
import type { PurgeQuarantinedPreFirebaseSalesResult } from './db/databaseAdapter';
import {
  auth,
  firebaseConfig,
  firebaseSignOut,
  onAuthStateChanged,
  testFirestoreConnection,
  callStartPlatformAdminSupportSession,
  callEndPlatformAdminSupportSession,
  callGetPlatformAdminSupportSession,
} from './firebase';

import type {
  PlatformAdminSupportSessionResponse,
} from './firebase';
import {
  provisionStaffAccount,
  resetStaffAccountPassword,
} from './services/staffAuthService';

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
  businessId?: string;
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
  const persistedLiveCache = useMemo(() => {
    if (dataMode === 'demo' || !persistedLiveMeta?.uid) return null;
    const userCache = loadUserScopedLiveCache(persistedLiveMeta.uid);
    const bizCache = persistedLiveMeta.businessId
      ? loadBusinessScopedLiveCache(persistedLiveMeta.businessId)
      : null;
    if (userCache && bizCache) {
      return {
        ...userCache,
        users:
          bizCache.users && bizCache.users.length > userCache.users.length
            ? bizCache.users
            : userCache.users,
        debtCustomers:
          bizCache.debtCustomers.length > 0
            ? bizCache.debtCustomers
            : userCache.debtCustomers,
        debtTransactions:
          bizCache.debtTransactions.length > 0
            ? bizCache.debtTransactions
            : userCache.debtTransactions,
        suppliers:
          bizCache.suppliers.length > 0
            ? bizCache.suppliers
            : userCache.suppliers,
        supplierSupplies:
          bizCache.supplierSupplies.length > 0
            ? bizCache.supplierSupplies
            : userCache.supplierSupplies,
        invoices:
          bizCache.invoices.length > 0
            ? bizCache.invoices
            : userCache.invoices,
        stockAdjustments:
          bizCache.stockAdjustments.length > 0
            ? bizCache.stockAdjustments
            : userCache.stockAdjustments,
      };
    }
    return userCache || bizCache;
  }, [dataMode, persistedLiveMeta]);

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

  const [payrollEmployees, setPayrollEmployees] = useState<PayrollEmployee[]>([]);
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([]);
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
  const authResolutionRequestRef = useRef(0);
  const isSyncingPendingRef = useRef(false);
  const isRefreshingLiveRef = useRef(false);
  const handleRefreshLiveWorkspaceRef = useRef<(() => Promise<void>) | null>(null);
  const handleRetryPendingSyncRef = useRef<((syncId?: string) => Promise<void>) | null>(null);

  useEffect(() => {
    isRefreshingLiveRef.current = isRefreshingLive;
  }, [isRefreshingLive]);

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
  const [transfers, setTransfers] = useState<ProductTransfer[]>([]);

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

// Platform Admin Support Mode — server-issued, time-limited session
const [activeSupportSession, setActiveSupportSession] =
  useState<PlatformAdminSupportSessionResponse | null>(null);

const isPlatformSupportMode = useMemo(() => {
  const session = activeSupportSession;
  const authenticatedUid = auth.currentUser?.uid;
  const expiresAtMs = session?.expiresAt
    ? Date.parse(session.expiresAt)
    : NaN;

  return Boolean(
    currentUser.role === 'platform_admin' &&
    authenticatedUid &&
    session &&
    session.status === 'active' &&
    session.adminUid === authenticatedUid &&
    session.supportSessionId &&
    session.businessId &&
    session.shopId &&
    Number.isFinite(expiresAtMs) &&
    expiresAtMs > Date.now()
  );
}, [activeSupportSession, currentUser.role, auth.currentUser?.uid]);

// Enforce the server-issued expiry in the UI as well as on the backend.
useEffect(() => {
  if (!activeSupportSession) return;

  const expiresAtMs = activeSupportSession.expiresAt
    ? Date.parse(activeSupportSession.expiresAt)
    : NaN;

  if (!Number.isFinite(expiresAtMs)) {
    setActiveSupportSession(null);
    setActiveShopId(null);
    setActiveView('platform_admin');
    setSessionStage('platform_admin');
    return;
  }

  const remainingMs = expiresAtMs - Date.now();

  if (remainingMs <= 0) {
    setActiveSupportSession(null);
    setActiveShopId(null);
    setActiveView('platform_admin');
    setSessionStage('platform_admin');
    return;
  }

  const timeoutId = window.setTimeout(() => {
    setActiveSupportSession(null);
    setActiveShopId(null);
    setActiveView('platform_admin');
    setSessionStage('platform_admin');
  }, remainingMs);

  return () => window.clearTimeout(timeoutId);
}, [activeSupportSession]);

// Until operational write paths are fully implemented, expose only
// the initial support views. Do not grant ordinary Platform Admin permissions.
const safeActiveView = useMemo<AppView>(() => {
  if (currentUser.role === 'platform_admin') {
    if (!isPlatformSupportMode) return 'platform_admin';

    // Support Mode exposes full shop operational surfaces for administrator
    // inspection and troubleshooting.
    const supportAllowedViews: AppView[] = [
      'dashboard',
      'pos',
      'inventory',
      'product_transfer',
      'expiring_products',
      'generate_barcode',
      'invoices',
      'sales',
      'sales_summary',
      'debt_book',
      'reports',
      'suppliers',
      'shops',
      'staff',
      'payroll_employees',
      'payroll_payments',
      'settings',
    ];

    return supportAllowedViews.includes(activeView)
      ? activeView
      : 'dashboard';
  }

  if (canUserAccessView(currentUser, activeView)) {
    return activeView;
  }

  return getDefaultViewForUser(currentUser);
}, [currentUser, activeView, isPlatformSupportMode]);

useEffect(() => {
  if (activeView !== safeActiveView) {
    setActiveView(safeActiveView);
  }
}, [safeActiveView, activeView]);
const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(
  () => persistedDemo?.sidebarCollapsed ?? false
);
const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

const handleStartSupportSession = async (
  businessId: string,
  shopId: string
): Promise<PlatformAdminSupportSessionResponse> => {
  if (dataMode === 'demo') {
    throw new Error('Platform Admin Support Mode requires live Firebase authentication.');
  }

  if (currentUser.role !== 'platform_admin') {
    throw new Error('Only an authenticated Platform Admin can start a support session.');
  }

  if (!auth.currentUser) {
    throw new Error('Your Firebase authentication session is unavailable. Please sign in again.');
  }

  if (!businessId || !shopId) {
    throw new Error('A valid business and shop must be selected.');
  }

  if (activeSupportSession) {
    throw new Error('End the existing support session before starting another.');
  }

  const result = await callStartPlatformAdminSupportSession({
    businessId,
    shopId,
  });

  const session = result.data;

  const expiresAtMs = session.expiresAt
  ? Date.parse(session.expiresAt)
  : NaN;

if (
  session.status !== 'active' ||
  !session.supportSessionId ||
  session.adminUid !== auth.currentUser.uid ||
  session.businessId !== businessId ||
  session.shopId !== shopId ||
  !Number.isFinite(expiresAtMs) ||
  expiresAtMs <= Date.now()
) {
  throw new Error('The server returned an invalid or expired support-session response.');
}

setActiveSupportSession(session);
setActiveShopId(shopId);
setActiveView('dashboard');
setSessionStage('workspace');

return session;
};

const handleEndSupportSession = async (): Promise<void> => {
  if (!activeSupportSession) {
    throw new Error('There is no active support session to end.');
  }

  if (!auth.currentUser) {
    throw new Error('Your Firebase authentication session is unavailable.');
  }

  if (activeSupportSession.adminUid !== auth.currentUser.uid) {
    throw new Error('This support session does not belong to the current administrator.');
  }

  await callEndPlatformAdminSupportSession({
    supportSessionId: activeSupportSession.supportSessionId,
  });

  // Clear local support context only after the server confirms the request.
  setActiveSupportSession(null);
  setActiveShopId(null);
  setActiveView('platform_admin');
  setSessionStage('platform_admin');
  setSuppliers([]);
  setSupplierSupplies([]);
  setDebtCustomers([]);
  setDebtTransactions([]);
  setInvoices([]);
};

// In Platform Admin Support Mode: automatically load the inspected shop's live products, sales, and catalog
useEffect(() => {
  if (
    currentUser.role === 'platform_admin' &&
    isPlatformSupportMode &&
    activeSupportSession
  ) {
    const bizId = activeSupportSession.businessId;
    const shId = activeSupportSession.shopId;
    void (async () => {
      try {
        const supportData = await liveDataService.loadSupportWorkspaceData(bizId, shId);
        const {
          products: cloudProducts,
          sales: cloudSales,
          users: bizUsers,
          transfers: cloudTransfers,
          categories: cloudCategories,
          suppliers: cloudSuppliers,
          supplierSupplies: cloudSupplierSupplies,
          debtCustomers: cloudCustomers,
          debtTransactions: cloudDebtTransactions,
          invoices: cloudInvoices,
        } = supportData;

        if (cloudTransfers) {
          setTransfers(cloudTransfers);
        }

        const validProducts = cloudProducts.filter(
          (p) => p.businessId === bizId && p.shopId === shId && !isKnownDemoRecord(p)
        );
        const validSales = cloudSales.filter(
          (s) => s.businessId === bizId && s.shopId === shId && !isKnownDemoRecord(s)
        );

        setProducts((prev) => [
          ...prev.filter((p) => p.businessId !== bizId || p.shopId !== shId),
          ...validProducts,
        ]);

        setSales((prev) => [
          ...prev.filter((s) => s.businessId !== bizId || s.shopId !== shId),
          ...validSales,
        ]);

        if (bizUsers.length > 0) {
          setUsers((prev) => {
            const existingIds = new Set(prev.map((u) => u.id));
            const freshUsers = bizUsers.filter((u) => !existingIds.has(u.id) && !isKnownDemoRecord(u));
            return [...prev, ...freshUsers];
          });
        }

        if (cloudCategories && cloudCategories.length > 0) {
          setCategories((prev) => {
            const otherCats = prev.filter((c) => c.businessId !== bizId || c.shopId !== shId);
            return [...otherCats, ...cloudCategories];
          });
        }

        setUnits((prev) => {
          const hasUnit = prev.some((u) => u.shopId === shId && u.businessId === bizId);
          if (hasUnit) return prev;
          return [
            ...prev,
            { id: `unit-${shId}-unit`, shopId: shId, businessId: bizId, name: 'Unit', abbreviation: 'unit' },
            { id: `unit-${shId}-pack`, shopId: shId, businessId: bizId, name: 'Pack', abbreviation: 'pk' },
          ];
        });

        // Load business-scoped live records (suppliers, supplier supplies, debt customers, debt transactions, invoices, stock adjustments)
        const bizCache = loadBusinessScopedLiveCache(bizId);
        const mergeEntities = <T extends { id: string; businessId?: string }>(
          prev: T[],
          incoming: T[] = []
        ): T[] => {
          const map = new Map<string, T>();
          prev.forEach((item) => map.set(item.id, item));
          incoming.forEach((item) => {
            if (item.businessId === bizId && !isKnownDemoRecord(item as any)) {
              map.set(item.id, item);
            }
          });
          return Array.from(map.values());
        };

        const mergedSuppliers = mergeEntities(cloudSuppliers || [], bizCache?.suppliers || []);
        if (mergedSuppliers.length > 0) {
          setSuppliers((prev) => mergeEntities(prev, mergedSuppliers));
        }

        const mergedSupplies = mergeEntities(cloudSupplierSupplies || [], bizCache?.supplierSupplies || []);
        if (mergedSupplies.length > 0) {
          setSupplierSupplies((prev) => mergeEntities(prev, mergedSupplies));
        }

        const mergedCustomers = mergeEntities(cloudCustomers || [], bizCache?.debtCustomers || []);
        if (mergedCustomers.length > 0) {
          setDebtCustomers((prev) => mergeEntities(prev, mergedCustomers));
        }

        const mergedDebtTransactions = mergeEntities(cloudDebtTransactions || [], bizCache?.debtTransactions || []);
        if (mergedDebtTransactions.length > 0) {
          setDebtTransactions((prev) => mergeEntities(prev, mergedDebtTransactions));
        }

        const mergedInvoices = mergeEntities(cloudInvoices || [], bizCache?.invoices || []);
        if (mergedInvoices.length > 0) {
          setInvoices((prev) => mergeEntities(prev, mergedInvoices));
        }

        if (bizCache?.stockAdjustments && bizCache.stockAdjustments.length > 0) {
          setStockAdjustments((prev) => mergeEntities(prev, bizCache.stockAdjustments));
        }
      } catch (err) {
        console.warn('Failed to load shop data during Platform Admin Support Mode:', err);
      }
    })();
  }
}, [
  currentUser.role,
  isPlatformSupportMode,
  activeSupportSession?.supportSessionId,
  activeSupportSession?.businessId,
  activeSupportSession?.shopId,
  liveDataService,
]);

// In Platform Admin Console (non-support mode): automatically load all global products and sales across all businesses & shops
useEffect(() => {
  if (
    currentUser.role === 'platform_admin' &&
    !isPlatformSupportMode &&
    dataMode !== 'demo' &&
    liveDataService
  ) {
    let isCancelled = false;
    void (async () => {
      try {
        const [globalProducts, globalSales] = await Promise.all([
          liveDataService.listAllProductsGlobal(),
          liveDataService.listAllSalesGlobal(),
        ]);
        if (!isCancelled) {
          setProducts(globalProducts.filter((p) => !isKnownDemoRecord(p)));
          setSales(globalSales.filter((s) => !isKnownDemoRecord(s)));
        }
      } catch (err) {
        console.warn('Failed to load global platform products and sales:', err);
      }
    })();
    return () => {
      isCancelled = true;
    };
  }
}, [
  currentUser.role,
  isPlatformSupportMode,
  dataMode,
  liveDataService,
  businesses.length,
  shops.length,
]);

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
        businessId: currentUser.businessId,
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
      const activeBizId =
        currentUser.businessId && currentUser.businessId !== 'unassigned' && currentUser.businessId !== 'PLATFORM'
          ? currentUser.businessId
          : isPlatformSupportMode && activeSupportSession?.businessId
          ? activeSupportSession.businessId
          : undefined;

      const liveDatasetPayload = {
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
        businessId: activeBizId || currentUser.businessId,
      };
      saveUserScopedLiveCache(currentUserId, liveDatasetPayload);
      if (activeBizId) {
        saveBusinessScopedLiveCache(
          activeBizId,
          liveDatasetPayload
        );
      }
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
    isPlatformSupportMode,
    activeSupportSession?.businessId,
  ]);

  // Platform Admin has no tenant business outside a valid support session.
const activeBusiness = useMemo<Business>(() => {
  if (currentUser.role === 'platform_admin') {
    if (!isPlatformSupportMode || !activeSupportSession) {
      return EMPTY_BUSINESS_FALLBACK;
    }

    return (
      businesses.find(
        (business) =>
          business.id === activeSupportSession.businessId &&
          business.status === 'active'
      ) ?? EMPTY_BUSINESS_FALLBACK
    );
  }

  return (
    businesses.find((business) => business.id === currentUser.businessId) ??
    EMPTY_BUSINESS_FALLBACK
  );
}, [
  businesses,
  currentUser,
  activeSupportSession,
  isPlatformSupportMode,
]);

  // Authorized shops for the signed-in user (enforces businessId match, suspended business check, and role/assignment rules)
  const authorizedShops = useMemo(() => {
    if (currentUser.role === 'platform_admin' && isPlatformSupportMode && activeSupportSession) {
      return shops.filter((s) => s.businessId === activeSupportSession.businessId);
    }
    return getAuthorizedShopsForUser(currentUser, shops, businesses);
  }, [currentUser, shops, businesses, isPlatformSupportMode, activeSupportSession]);

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

  // In Shop Workspaces: automatically load business inter-shop product transfers
  useEffect(() => {
    if (activeBusiness?.id && activeBusiness.id !== 'unassigned' && dataMode !== 'demo' && liveDataService) {
      let isCancelled = false;
      void (async () => {
        try {
          const list = await liveDataService.listBusinessTransfers(activeBusiness.id);
          if (!isCancelled) {
            setTransfers(list);

            // Auto-reconciliation: ensure transfers have source deductions and destination products reflected in Cloud Firestore
            for (const t of list) {
              if (t.businessId === activeBusiness.id) {
                // A. Ensure source shop stock is deducted for transfers where source deduction was interrupted
                if (!t.sourceDeductedAt) {
                  let allSourceDeducted = true;
                  let sourceShopProds: Product[] = [];
                  try {
                    sourceShopProds = await liveDataService.listShopProducts(t.businessId, t.sourceShopId);
                  } catch {
                    sourceShopProds = products.filter(
                      (p) => p.businessId === t.businessId && p.shopId === t.sourceShopId
                    );
                  }

                  for (const item of t.items) {
                    const sourceProd = sourceShopProds.find(
                      (p) =>
                        p.id === item.productId ||
                        p.sku.toLowerCase() === item.sku.toLowerCase() ||
                        (p.barcode && item.barcode && p.barcode === item.barcode)
                    );
                    if (sourceProd) {
                      const nextQty = Math.max(0, sourceProd.stockQuantity - item.quantity);
                      const updatedSourceProd: Product = {
                        ...sourceProd,
                        stockQuantity: nextQty,
                        updatedAt: new Date().toISOString(),
                      };
                      try {
                        await liveDataService.persistLiveProduct(updatedSourceProd, { operationType: 'update' });
                        if (!isCancelled) {
                          setProducts((prev) =>
                            prev.map((p) => (p.id === updatedSourceProd.id ? updatedSourceProd : p))
                          );
                        }
                      } catch (err) {
                        console.warn('Failed to deduct source product stock during reconciliation:', err);
                        allSourceDeducted = false;
                      }
                    } else {
                      allSourceDeducted = false;
                    }
                  }
                  if (allSourceDeducted) {
                    const updatedT: ProductTransfer = {
                      ...t,
                      sourceDeducted: true,
                      sourceDeductedAt: new Date().toISOString(),
                    };
                    try {
                      await liveDataService.saveTransfer(updatedT);
                      if (!isCancelled) {
                        setTransfers((prev) =>
                          prev.map((tr) => (tr.id === updatedT.id ? updatedT : tr))
                        );
                      }
                    } catch (err) {
                      console.warn('Failed to update transfer sourceDeducted flag:', err);
                    }
                  }
                }

                // B. Ensure completed transfers have products in destination shop (verify against Cloud Firestore)
                if (t.status === 'completed') {
                  let destProds: Product[] = [];
                  try {
                    destProds = await liveDataService.listShopProducts(t.businessId, t.destinationShopId);
                  } catch {
                    continue; // Skip healing if unable to query cloud database
                  }

                  for (const item of t.items) {
                    const exists = destProds.some(
                      (p) =>
                        (p.sku && item.sku && p.sku.toLowerCase() === item.sku.toLowerCase()) ||
                        (p.barcode && item.barcode && p.barcode.toLowerCase() === item.barcode.toLowerCase()) ||
                        (p.name && item.productName && p.name.trim().toLowerCase() === item.productName.trim().toLowerCase())
                    );
                    if (!exists) {
                      const healedProdId = generateUniqueProductId(destProds, t.destinationShopId);
                      const healedProd: Product = {
                        id: healedProdId,
                        shopId: t.destinationShopId,
                        businessId: t.businessId,
                        name: item.productName,
                        sku: item.sku,
                        barcode: item.barcode || item.sku,
                        unit: item.unit || 'Unit',
                        costPrice: item.costPrice || 0,
                        sellingPrice: item.sellingPrice || 0,
                        categoryId: `cat-${t.destinationShopId}-general`,
                        categoryName: item.categoryName || 'General',
                        stockQuantity: item.quantity,
                        reorderLevel: 5,
                        isActive: true,
                        updatedAt: new Date().toISOString(),
                      };
                      try {
                        await liveDataService.persistLiveProduct(healedProd, { operationType: 'create' });
                        destProds.push(healedProd);
                        if (!isCancelled) {
                          setProducts((prev) => {
                            if (prev.some((p) => p.id === healedProd.id)) return prev;
                            return [...prev, healedProd];
                          });
                        }
                      } catch (healErr) {
                        console.warn('Auto-heal transfer product error:', healErr);
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (err) {
          console.warn('Failed to fetch business transfers:', err);
        }
      })();
      return () => {
        isCancelled = true;
      };
    }
  }, [activeBusiness?.id, dataMode, liveDataService]);

  // Active shop object (must be within authorizedShops)
  // Support Mode resolves only the shop authorized by its server-issued session.
const activeShop = useMemo(() => {
  if (currentUser.role === 'platform_admin') {
  if (!isPlatformSupportMode || !activeSupportSession || activeBusiness.id === 'unassigned') {
      return null;
    }

    return (
      shops.find(
        (shop) =>
          shop.id === activeSupportSession.shopId &&
          shop.businessId === activeSupportSession.businessId &&
          (shop.status === 'active' || !shop.status)
      ) ?? null
    );
  }

  if (!activeShopId) return null;

  return authorizedShops.find((shop) => shop.id === activeShopId) ?? null;
}, [
  currentUser.role,
  activeSupportSession,
  activeBusiness.id,
  shops,
  activeShopId,
  authorizedShops,
]);

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
      (s) => s.businessId === activeBusiness.id && (s.shopId === activeShop.id || !s.shopId)
    );
  }, [suppliers, activeShop, activeBusiness.id]);

  const activeShopSupplierSupplies = useMemo(() => {
    if (!activeShop) return [];
    return supplierSupplies.filter(
      (r) => r.businessId === activeBusiness.id && (r.shopId === activeShop.id || !r.shopId)
    );
  }, [supplierSupplies, activeShop, activeBusiness.id]);

  // Reconcile invoices with customer debt book transactions
  useEffect(() => {
    if (!activeShop || !activeBusiness) return;
    if (invoices.length === 0 || debtCustomers.length === 0) return;

    // Check for any invoice that has not been posted to debtTransactions
    const shopTxs = debtTransactions.filter(
      (t) => t.shopId === activeShop.id && t.businessId === activeBusiness.id
    );
    const recordedRefs = new Set(shopTxs.map((t) => t.reference).filter(Boolean));

    let hadUpdates = false;
    let currentCustomers = [...debtCustomers];
    const newTransactions: DebtTransaction[] = [];

    const shopInvs = invoices.filter(
      (inv) => inv.shopId === activeShop.id && inv.businessId === activeBusiness.id
    );

    for (const inv of shopInvs) {
      if (inv.totalAmount <= 0) continue;
      // Find matching customer
      let targetCust = currentCustomers.find(
        (c) =>
          c.shopId === activeShop.id &&
          c.businessId === activeBusiness.id &&
          (c.id === inv.customerId ||
            (c.phone && inv.customerPhone && c.phone.trim() === inv.customerPhone.trim()) ||
            (c.fullName && inv.customerName && c.fullName.trim().toLowerCase() === inv.customerName.trim().toLowerCase()))
      );

      if (!targetCust) continue;

      // Has this invoice been recorded as a credit?
      if (!recordedRefs.has(inv.invoiceNumber)) {
        const { updatedCustomer, transaction } = applyDebtTransaction(
          targetCust,
          'credit',
          inv.totalAmount,
          {
            reference: inv.invoiceNumber,
            notes: `Invoice ${inv.invoiceNumber} issued`,
            user: currentUser,
            timestampIso: inv.createdAt || formatPosTimestamp(),
          }
        );
        targetCust = updatedCustomer;
        currentCustomers = currentCustomers.map((c) =>
          c.id === targetCust!.id ? targetCust! : c
        );
        newTransactions.push(transaction);
        recordedRefs.add(inv.invoiceNumber);
        hadUpdates = true;
      }

      // Check recorded payments
      if (inv.payments && inv.payments.length > 0) {
        for (const pmt of inv.payments) {
          const pmtRef = pmt.paymentReference || `${inv.invoiceNumber}-PMT-${pmt.id}`;
          if (!recordedRefs.has(pmtRef) && pmt.amount > 0) {
            const { updatedCustomer, transaction } = applyDebtTransaction(
              targetCust,
              'deposit',
              pmt.amount,
              {
                paymentMethod: pmt.paymentMethod,
                reference: pmtRef,
                notes: pmt.notes || `Payment for invoice ${inv.invoiceNumber}`,
                user: currentUser,
                timestampIso: pmt.recordedAt || formatPosTimestamp(),
              }
            );
            targetCust = updatedCustomer;
            currentCustomers = currentCustomers.map((c) =>
              c.id === targetCust!.id ? targetCust! : c
            );
            newTransactions.push(transaction);
            recordedRefs.add(pmtRef);
            hadUpdates = true;
          }
        }
      } else if (inv.amountPaid > 0) {
        const pmtRef = `${inv.invoiceNumber}-PMT-INITIAL`;
        if (!recordedRefs.has(pmtRef)) {
          const { updatedCustomer, transaction } = applyDebtTransaction(
            targetCust,
            'deposit',
            inv.amountPaid,
            {
              reference: pmtRef,
              notes: `Initial payment for invoice ${inv.invoiceNumber}`,
              user: currentUser,
              timestampIso: inv.createdAt || formatPosTimestamp(),
            }
          );
          targetCust = updatedCustomer;
          currentCustomers = currentCustomers.map((c) =>
            c.id === targetCust!.id ? targetCust! : c
          );
          newTransactions.push(transaction);
          recordedRefs.add(pmtRef);
          hadUpdates = true;
        }
      }
    }

    if (hadUpdates) {
      setDebtCustomers(currentCustomers);
      setDebtTransactions((prev) => [...newTransactions, ...prev]);

      if (dataMode !== 'demo' && liveDataService) {
        for (const cust of currentCustomers) {
          void liveDataService.saveShopDebtCustomer(activeBusiness.id, activeShop.id, cust);
        }
        for (const tx of newTransactions) {
          void liveDataService.saveShopDebtTransaction(activeBusiness.id, activeShop.id, tx);
        }
      }
    }
  }, [activeShop?.id, activeBusiness?.id, invoices, debtCustomers.length, debtTransactions.length]);

  // Pending sync count for current context
  const pendingTransactionsCount = useMemo(() => {
    if (activeShop) {
      return activeShopSales.filter(
        (s) =>
          (s.syncStatus === 'pending_local_queue' ||
            s.syncStatus === 'queued_offline_demo' ||
            s.status === 'pending_sync') &&
          s.syncStatus !== 'synced' &&
          s.syncStatus !== 'synced_demo'
      ).length;
    }
    return sales.filter(
      (s) =>
        (s.syncStatus === 'pending_local_queue' ||
          s.syncStatus === 'queued_offline_demo' ||
          s.status === 'pending_sync') &&
        s.syncStatus !== 'synced' &&
        s.syncStatus !== 'synced_demo'
    ).length;
  }, [activeShop, activeShopSales, sales]);

  const connectivitySnapshot: ConnectivitySnapshot = useMemo(() => {
    const effectiveState: ConnectivityState =
      dataMode === 'offline_live' ? 'offline' : connectivityState;
    const preset = CONNECTIVITY_PRESETS[effectiveState];
    return {
      ...preset,
      pendingTransactionsCount,
    };
  }, [dataMode, connectivityState, pendingTransactionsCount]);

  const handleConnectivityStateChange = (nextState: ConnectivityState) => {
    setConnectivityState(nextState);
    if (nextState === 'online') {
      if (dataMode === 'offline_live' && handleRefreshLiveWorkspaceRef.current) {
        void handleRefreshLiveWorkspaceRef.current();
      } else if (dataMode === 'live') {
        void syncPendingSalesWithCloud();
      }
    } else if (nextState === 'offline') {
      if (dataMode === 'live') {
        setDataMode('offline_live');
      }
    }
  };

  // Background cloud synchronization worker for pending offline / queued sales
  const syncPendingSalesWithCloud = useCallback(async () => {
    if (isSyncingPendingRef.current) return;
    if (dataMode !== 'live' || !navigator.onLine) return;
    if (!activeBusiness || isKnownDemoRecord(activeBusiness)) return;
    if (!currentUser || currentUser.status !== 'active') return;

    // 1. Reconcile dbAdapter sync_queue for any sales that have already synced to Cloud Firestore
    if (dbAdapter) {
      try {
        const queue = await dbAdapter.getPendingSyncQueue();
        let queueUpdated = false;
        for (const entry of queue) {
          if (entry.entity_type === 'sale') {
            const matchingSale = sales.find((s) => s.id === entry.entity_id);
            if (
              matchingSale &&
              (matchingSale.syncStatus === 'synced' ||
                matchingSale.syncStatus === 'synced_demo' ||
                matchingSale.status === 'completed')
            ) {
              await dbAdapter.updateSyncStatus(entry.id, 'synced', undefined, {
                cloudAckId: `ack-reconciled-${Date.now()}`,
              });
              queueUpdated = true;
            }
          }
        }
        if (queueUpdated) {
          const report = await auditLocalStorageAndIndexedDb(dbAdapter);
          setStorageAudit(report);
        }
      } catch (err) {
        console.warn('Failed to reconcile local sync queue with synced sales:', err);
      }
    }

    const targetShopId = activeShop?.id;
    const pendingSales = sales.filter(
      (s) =>
        (s.syncStatus === 'pending_local_queue' ||
          s.syncStatus === 'queued_offline_demo' ||
          s.status === 'pending_sync') &&
        s.syncStatus !== 'synced' &&
        s.syncStatus !== 'synced_demo' &&
        (!targetShopId || s.shopId === targetShopId) &&
        s.businessId === activeBusiness.id &&
        !isKnownDemoRecord(s)
    );

    if (pendingSales.length === 0) return;

    isSyncingPendingRef.current = true;
    try {
      for (const pendingSale of pendingSales) {
        try {
          const syncOperationId = `sync-${pendingSale.id}`;
          const checkoutOpId = `chk-${pendingSale.shopId}-${pendingSale.id}`;
          const ackResult = await liveDataService.persistLiveSale(
            pendingSale,
            [],
            {
              operationId: syncOperationId,
              idempotencyKey: checkoutOpId,
              actorUserId: isPlatformSupportMode ? pendingSale.cashierUserId : currentUser.id,
              ...(isPlatformSupportMode && activeSupportSession
                ? { supportSessionId: activeSupportSession.supportSessionId }
                : {}),
            }
          );

          if (ackResult.outcome === 'acknowledged' && ackResult.ackId) {
            if (dbAdapter) {
              try {
                const queue = await dbAdapter.getPendingSyncQueue();
                const matchingEntries = queue.filter(
                  (q) => q.entity_id === pendingSale.id || q.id === syncOperationId
                );
                for (const qEntry of matchingEntries) {
                  await dbAdapter.updateSyncStatus(qEntry.id, 'synced', undefined, {
                    cloudAckId: ackResult.ackId,
                  });
                }
              } catch (qErr) {
                console.warn('Failed to mark local queue entry as synced in dbAdapter:', qErr);
              }
            }

            setSales((prev) =>
              prev.map((s) =>
                s.id === pendingSale.id
                  ? { ...s, status: 'completed', syncStatus: 'synced' }
                  : s
              )
            );
            setShops((prev) =>
              prev.map((s) =>
                s.id === pendingSale.shopId
                  ? {
                      ...s,
                      pendingSyncCount: Math.max(0, s.pendingSyncCount - 1),
                      lastSyncedAt: 'Just now (Cloud Verified)',
                    }
                  : s
              )
            );
          }
        } catch (err) {
          console.warn(`Background sync failed for sale ${pendingSale.receiptNumber}:`, err);
        }
      }
    } finally {
      isSyncingPendingRef.current = false;
      if (dbAdapter) {
        try {
          const report = await auditLocalStorageAndIndexedDb(dbAdapter);
          setStorageAudit(report);
        } catch {
          // continue
        }
      }
    }
  }, [
    dataMode,
    activeShop,
    activeBusiness,
    currentUser,
    sales,
    isPlatformSupportMode,
    activeSupportSession,
    liveDataService,
    dbAdapter,
  ]);

  // Sync automatically when online connectivity is restored or detected
  useEffect(() => {
    if (dataMode === 'live' && connectivityState === 'online' && navigator.onLine) {
      void syncPendingSalesWithCloud();
    }
  }, [dataMode, connectivityState, syncPendingSalesWithCloud]);

  // Real-time Cloud Firestore synchronization for the active shop (stock, products, shop settings, sales)
  useEffect(() => {
    if (
      dataMode !== 'live' ||
      sessionStage !== 'workspace' ||
      !activeBusiness?.id ||
      !activeShop?.id ||
      !liveDataService
    ) {
      return;
    }

    const bizId = activeBusiness.id;
    const shopId = activeShop.id;

    const unsubscribe = liveDataService.subscribeToActiveShopLiveUpdates({
      businessId: bizId,
      shopId,
      onProductsUpdated: (liveShopProducts) => {
        setProducts((prev) => [
          ...prev.filter((p) => p.shopId !== shopId),
          ...liveShopProducts,
        ]);
      },
      onShopUpdated: (liveShop) => {
        setShops((prev) =>
          prev.map((s) => (s.id === liveShop.id ? { ...s, ...liveShop } : s))
        );
      },
      onSalesUpdated: (liveShopSales) => {
        setSales((prev) => {
          const otherShopSales = prev.filter((s) => s.shopId !== shopId);
          const localPendingForShop = prev.filter(
            (s) =>
              s.shopId === shopId &&
              s.syncStatus !== 'synced' &&
              !liveShopSales.some((ls) => ls.id === s.id)
          );
          return [...otherShopSales, ...localPendingForShop, ...liveShopSales];
        });
      },
    });

    const unsubPayrollEmployees = liveDataService.subscribeToPayrollEmployees(
      bizId,
      shopId,
      (liveEmps) => {
        setPayrollEmployees((prev) => [
          ...prev.filter((e) => e.shopId !== shopId),
          ...liveEmps,
        ]);
      }
    );

    const unsubPayrollPeriods = liveDataService.subscribeToPayrollPeriods(
      bizId,
      shopId,
      (livePeriods) => {
        setPayrollPeriods((prev) => [
          ...prev.filter((p) => p.shopId !== shopId),
          ...livePeriods,
        ]);
      }
    );

    return () => {
      unsubscribe();
      unsubPayrollEmployees();
      unsubPayrollPeriods();
    };
  }, [dataMode, sessionStage, activeBusiness?.id, activeShop?.id]);

  // Listen to browser network online / offline events and run periodic auto-sync & auto-reconnect
  useEffect(() => {
    let isCancelled = false;

    const handleOnline = async () => {
      setConnectivityState('online');
      if (dataMode === 'offline_live') {
        if (!isRefreshingLiveRef.current && handleRefreshLiveWorkspaceRef.current) {
          try {
            await handleRefreshLiveWorkspaceRef.current();
          } catch (err) {
            console.warn('Auto-reconnect on network online event failed, will retry via heartbeat:', err);
          }
        }
      } else if (dataMode === 'live') {
        void syncPendingSalesWithCloud();
      }
    };

    const handleOffline = () => {
      setConnectivityState('offline');
      if (dataMode === 'live') {
        setDataMode('offline_live');
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Active heartbeat:
    // - When in offline_live (or connectivityState === 'offline'): poll every 3 seconds to auto-reconnect as soon as internet is reachable!
    // - When in live: poll every 15 seconds to sync any pending queue.
    const pollIntervalMs =
      dataMode === 'offline_live' || connectivityState === 'offline' ? 3000 : 15000;

    const interval = setInterval(async () => {
      if (isCancelled || dataMode === 'demo') return;

      if (dataMode === 'offline_live' || connectivityState === 'offline') {
        if (navigator.onLine && !isRefreshingLiveRef.current && handleRefreshLiveWorkspaceRef.current) {
          try {
            const isReachable = await testFirestoreConnection();
            if (isReachable && !isCancelled) {
              setConnectivityState('online');
              await handleRefreshLiveWorkspaceRef.current();
            }
          } catch (err) {
            console.warn('Auto-reconnect heartbeat check failed:', err);
          }
        }
      } else if (dataMode === 'live') {
        if (navigator.onLine) {
          void syncPendingSalesWithCloud();
        }
      }
    }, pollIntervalMs);

    return () => {
      isCancelled = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [dataMode, connectivityState, syncPendingSalesWithCloud]);

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
      setLiveErrorMessage(res.status === 'suspended' ? null : (res.errorMessage || null));
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
      if (options?.preserveWorkspaceContext && isPlatformSupportMode && activeSupportSession) {
        return;
      }
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
  const requestId = ++authResolutionRequestRef.current;

  const isCurrentRequest = () =>
    authResolutionRequestRef.current === requestId &&
    auth.currentUser?.uid === identity.uid;

  restoredUidRef.current = identity.uid;

  setIsRefreshingLive(true);
  setLiveErrorMessage(null);
  setActiveSupportSession(null);

  try {
    if (auth.currentUser) {
      try {
        await auth.currentUser.reload();
        await auth.currentUser.getIdToken(true);
      } catch {
        // The fresh session resolver remains authoritative.
      }
    }

    // Stop if another authentication request superseded this one.
    if (!isCurrentRequest()) return;

    const activeUser = auth.currentUser;

    if (!activeUser || activeUser.uid !== identity.uid) {
      return;
    }

    const res = await liveDataService.resolveAuthenticatedSession({
      uid: activeUser.uid,
      email: activeUser.email || identity.email,
      displayName: activeUser.displayName || identity.displayName,
      emailVerified: activeUser.emailVerified ?? identity.emailVerified,
    });

    // CRITICAL: Never apply a stale authentication resolution.
    if (!isCurrentRequest()) return;

    applyLiveResolutionResult(res, options);

    // Recover support sessions only after fresh online resolution.
    if (
      res.status !== 'ready' ||
      res.dataMode !== 'live' ||
      res.user?.role !== 'platform_admin' ||
      !res.dataset
    ) {
      return;
    }

    try {
      const recoveryResult =
        await callGetPlatformAdminSupportSession({});

      // Authentication may have changed during the recovery request.
      if (!isCurrentRequest()) return;

      const session = recoveryResult.data;

      if (!session) return;

      const expiresAtMs = session.expiresAt
        ? Date.parse(session.expiresAt)
        : NaN;

      const business = res.dataset.businesses.find(
        (item) =>
          item.id === session.businessId &&
          item.status === 'active'
      );

      const shop = res.dataset.shops.find(
        (item) =>
          item.id === session.shopId &&
          item.businessId === session.businessId &&
          item.status === 'active'
      );

      const isValidSession =
        session.status === 'active' &&
        session.adminUid === identity.uid &&
        typeof session.supportSessionId === 'string' &&
        session.supportSessionId.length > 0 &&
        typeof session.businessId === 'string' &&
        session.businessId.length > 0 &&
        typeof session.shopId === 'string' &&
        session.shopId.length > 0 &&
        Number.isFinite(expiresAtMs) &&
        expiresAtMs > Date.now() &&
        Boolean(business) &&
        Boolean(shop);

      if (!isCurrentRequest() || !isValidSession) {
        return;
      }

      setActiveSupportSession(session);
      setActiveShopId(session.shopId);
      setActiveView('dashboard');
      setSessionStage('workspace');

    } catch (recoveryError) {
      if (!isCurrentRequest()) return;

      console.warn(
        'Platform Admin support-session recovery failed:',
        recoveryError
      );

      setActiveSupportSession(null);
      setActiveShopId(null);
      setActiveView('platform_admin');
      setSessionStage('platform_admin');
    }

  } finally {
    // An older request must not clear a newer request's loading state.
    if (authResolutionRequestRef.current === requestId) {
      setIsRefreshingLive(false);
    }
  }
};


  // Restore Firebase Authentication once on initial mount in Live Mode.
// Always perform fresh resolution, even if a workspace stage was persisted.
useEffect(() => {
  if (dataMode === 'demo') return;

  const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
    if (!fbUser || !fbUser.email) {
  ++authResolutionRequestRef.current;
  restoredUidRef.current = null;
  setActiveSupportSession(null);
  setActiveShopId(null);
  return;
}

    if (restoredUidRef.current === fbUser.uid) {
      return;
    }

    restoredUidRef.current = fbUser.uid;

    const preserveWorkspaceContext =
      sessionStage === 'workspace';

    handleAuthenticatedFirebase(
      {
        uid: fbUser.uid,
        email: fbUser.email,
        displayName: fbUser.displayName,
        emailVerified: fbUser.emailVerified,
      },
      undefined,
      { preserveWorkspaceContext }
    );
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
      if (currentUser.role === 'platform_admin') {
        if (isPlatformSupportMode && activeSupportSession) {
          try {
            const supportData = await liveDataService.loadSupportWorkspaceData(
              activeSupportSession.businessId,
              activeSupportSession.shopId
            );
            const {
              products: cloudProducts,
              sales: cloudSales,
              users: bizUsers,
              transfers: cloudTransfers,
              categories: cloudCategories,
              suppliers: cloudSuppliers,
              supplierSupplies: cloudSupplierSupplies,
              debtCustomers: cloudCustomers,
              debtTransactions: cloudDebtTransactions,
              invoices: cloudInvoices,
            } = supportData;

            setProducts(cloudProducts);
            setSales(cloudSales);
            if (cloudTransfers) {
              setTransfers(cloudTransfers);
            }
            if (bizUsers.length > 0) {
              setUsers((prev) => {
                const existingIds = new Set(prev.map((u) => u.id));
                const freshUsers = bizUsers.filter((u) => !existingIds.has(u.id) && !isKnownDemoRecord(u));
                return [...prev, ...freshUsers];
              });
            }

            if (cloudCategories && cloudCategories.length > 0) {
              setCategories((prev) => {
                const otherCats = prev.filter(
                  (c) =>
                    c.businessId !== activeSupportSession.businessId ||
                    c.shopId !== activeSupportSession.shopId
                );
                return [...otherCats, ...cloudCategories];
              });
            }

            const bizCache = loadBusinessScopedLiveCache(activeSupportSession.businessId);
            const mergeEntities = <T extends { id: string; businessId?: string }>(
              prev: T[],
              incoming: T[] = []
            ): T[] => {
              const map = new Map<string, T>();
              prev.forEach((item) => map.set(item.id, item));
              incoming.forEach((item) => {
                if (item.businessId === activeSupportSession.businessId && !isKnownDemoRecord(item as any)) {
                  map.set(item.id, item);
                }
              });
              return Array.from(map.values());
            };

            const mergedSuppliers = mergeEntities(cloudSuppliers || [], bizCache?.suppliers || []);
            if (mergedSuppliers.length > 0) {
              setSuppliers((prev) => mergeEntities(prev, mergedSuppliers));
            }

            const mergedSupplies = mergeEntities(cloudSupplierSupplies || [], bizCache?.supplierSupplies || []);
            if (mergedSupplies.length > 0) {
              setSupplierSupplies((prev) => mergeEntities(prev, mergedSupplies));
            }

            const mergedCustomers = mergeEntities(cloudCustomers || [], bizCache?.debtCustomers || []);
            if (mergedCustomers.length > 0) {
              setDebtCustomers((prev) => mergeEntities(prev, mergedCustomers));
            }

            const mergedDebtTransactions = mergeEntities(cloudDebtTransactions || [], bizCache?.debtTransactions || []);
            if (mergedDebtTransactions.length > 0) {
              setDebtTransactions((prev) => mergeEntities(prev, mergedDebtTransactions));
            }

            const mergedInvoices = mergeEntities(cloudInvoices || [], bizCache?.invoices || []);
            if (mergedInvoices.length > 0) {
              setInvoices((prev) => mergeEntities(prev, mergedInvoices));
            }

            if (bizCache?.stockAdjustments && bizCache.stockAdjustments.length > 0) {
              setStockAdjustments((prev) => mergeEntities(prev, bizCache.stockAdjustments));
            }
          } catch {
            // ignore
          }
        } else {
          try {
            const [globalProducts, globalSales] = await Promise.all([
              liveDataService.listAllProductsGlobal(),
              liveDataService.listAllSalesGlobal(),
            ]);
            setProducts(globalProducts.filter((p) => !isKnownDemoRecord(p)));
            setSales(globalSales.filter((s) => !isKnownDemoRecord(s)));
          } catch {
            // ignore
          }
        }
      }
      void syncPendingSalesWithCloud();
      if (currentUser && currentUser.status === 'active' && handleRetryPendingSyncRef.current) {
        try {
          await handleRetryPendingSyncRef.current();
        } catch {
          // ignore
        }
      }
      const report = await auditLocalStorageAndIndexedDb(dbAdapter);
      setStorageAudit(report);
    } finally {
      setIsRefreshingLive(false);
    }
  };
  handleRefreshLiveWorkspaceRef.current = handleRefreshLiveWorkspace;

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

  const [isSwitchingSupportShop, setIsSwitchingSupportShop] = useState(false);

  const handleSwitchShopInWorkspace = async (shopId: string) => {
    const targetShop = authorizedShops.find((s) => s.id === shopId);
    if (!targetShop) return;
    if (targetShop.id === activeShop?.id) return;

    if (
      currentUser.role === 'platform_admin' &&
      isPlatformSupportMode &&
      activeSupportSession
    ) {
      if (isSwitchingSupportShop) return;
      try {
        setIsSwitchingSupportShop(true);
        // Cleanly end the previous support session on the backend
        try {
          await callEndPlatformAdminSupportSession({
            supportSessionId: activeSupportSession.supportSessionId,
          });
        } catch (endErr) {
          console.warn('Note: previous support session ended or expired:', endErr);
        }

        // Start a fresh support session for the target shop under this business
        const result = await callStartPlatformAdminSupportSession({
          businessId: targetShop.businessId,
          shopId: targetShop.id,
        });

        const newSession = result.data;
        if (
          newSession.status !== 'active' ||
          !newSession.supportSessionId ||
          newSession.shopId !== targetShop.id
        ) {
          throw new Error('The server returned an invalid or expired support-session response.');
        }

        setActiveSupportSession(newSession);
        setActiveShopId(targetShop.id);
        setInspectedSale(null);
      } catch (err: any) {
        console.error('Failed to switch support shop:', err);
        setLiveErrorMessage(
          err instanceof Error
            ? `Unable to switch to ${targetShop.name}: ${err.message}`
            : `Unable to switch to ${targetShop.name}.`
        );
      } finally {
        setIsSwitchingSupportShop(false);
      }
      return;
    }

    setActiveShopId(targetShop.id);
    setInspectedSale(null);
  };

  const handleSignOut = () => {
	++authResolutionRequestRef.current;
    restoredUidRef.current = null;
    setActiveSupportSession(null);
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
    const isDemo = dataMode === 'demo';

    let provisionedOwnerUid: string | undefined;
    if (!isDemo && input.ownerPassword?.trim()) {
      try {
        const provisioned = await provisionStaffAccount({
          email: input.ownerEmail.trim().toLowerCase(),
          password: input.ownerPassword.trim(),
          fullName: input.ownerName.trim(),
        });
        provisionedOwnerUid = provisioned.uid;
      } catch (err: any) {
        setLiveErrorMessage(
          err instanceof Error
            ? err.message
            : 'Failed to provision business owner authentication credentials.'
        );
        throw err;
      }
    }

    const cleanExplicitUid = (provisionedOwnerUid || input.ownerUid)
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
    const prefix =
      input.name
        .trim()
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 3) || 'SHP';

    const cleanContactEmail = (
      input.contactEmail ||
      input.ownerEmail ||
      ''
    ).trim().toLowerCase();

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
      contactEmail: cleanContactEmail,
      primaryPhone: input.primaryPhone.trim(),
      headquartersAddress: input.headquartersAddress.trim(),
      currencyCode: BASE_CURRENCY_CODE,
      currencySymbol: BASE_CURRENCY_SYMBOL,
      defaultTaxRatePercent: 7.5,
      status: 'active',
      notes: input.notes?.trim() || undefined,
      createdAt: todayDate,
    };

    const hasInitialShop = Boolean(input.initialShopName?.trim());
    const firstShopName = input.initialShopName?.trim();
    const firstShop: Shop | undefined = hasInitialShop
      ? {
          id: firstShopId,
          businessId: newBusinessId,
          code: `${prefix}-01`,
          name: firstShopName!,
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
          receiptHeaderNote: `${firstShopName} — Official Receipt`,
          receiptFooterNote: 'Thank you for your patronage',
          createdAt: todayDate,
          pendingSyncCount: 0,
          lastSyncedAt: isDemo ? formatPosTimestamp() : 'Cloud Synced',
        }
      : undefined;

    const primaryOwnerUser: User = {
      id: newOwnerUserId,
      businessId: newBusinessId,
      username: input.ownerEmail.trim().toLowerCase().split('@')[0],
      email: input.ownerEmail.trim().toLowerCase(),
      fullName: input.ownerName.trim(),
      role: 'business_owner',
      roleLabel: `Business Owner (${newBusiness.name})`,
      assignedShopIds: firstShop ? [firstShop.id] : [],
      permissions: [...ROLE_DEFAULT_PERMISSIONS.business_owner],
      status: 'active',
      password: input.ownerPassword?.trim() || undefined,
      passwordSetupStatus: 'verified',
      emailVerified: true,
      authUidLinked: Boolean(explicitFirebaseOwnerUid),
      createdAt: todayDate,
      lastLoginAt: formatPosTimestamp(),
    };

    const firstAssignment: ShopAssignment | undefined = firstShop
      ? {
          id: `asgn-${firstShop.id}-${newOwnerUserId}`,
          userId: newOwnerUserId,
          businessId: newBusinessId,
          shopId: firstShop.id,
          assignedAt: todayDate,
          assignedByUserId: currentUser.id,
          isActive: true,
        }
      : undefined;

    if (isDemo) {
      setBusinesses((prev) => [newBusiness, ...prev]);
      setUsers((prev) => [...prev, primaryOwnerUser]);
      if (firstShop && firstAssignment) {
        setShops((prev) => [...prev, firstShop]);
        setShopAssignments((prev) => [...prev, firstAssignment]);
      }
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
      if (input.ownerPassword?.trim()) {
        finalPrimaryOwner = {
          ...finalPrimaryOwner,
          emailVerified: true,
          passwordSetupStatus: 'verified',
          authUidLinked: true,
        };
      } else if (input.sendPasswordSetupEmail) {
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

      const canonicalShop = provisioned.firstShop;
      if (canonicalShop) {
        const canonicalAssignment: ShopAssignment = {
          id: `asgn-${canonicalShop.id}-${finalPrimaryOwner.id}`,
          userId: finalPrimaryOwner.id,
          businessId: provisioned.business.id,
          shopId: canonicalShop.id,
          assignedAt: todayDate,
          assignedByUserId: currentUser.id,
          isActive: true,
        };
        setShops((prev) => [
          ...prev.filter((s) => s.id !== canonicalShop.id),
          canonicalShop,
        ]);
        setShopAssignments((prev) => [
          ...prev.filter((a) => a.id !== canonicalAssignment.id),
          canonicalAssignment,
        ]);
      }

      setBusinesses((prev) => [
        provisioned.business,
        ...prev.filter((b) => b.id !== provisioned.business.id && b.id !== newBusinessId),
      ]);
      setUsers((prev) => [
        ...prev.filter((u) => u.id !== finalPrimaryOwner.id && u.id !== newOwnerUserId),
        finalPrimaryOwner,
      ]);

      return provisioned.business;
    } catch (err: any) {
      console.error('[SmartMind POS] Business provisioning error:', err);
      const errMessage =
        err?.message ||
        err?.details?.message ||
        'Failed to provision business, owner, and first shop via Cloud Function.';
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
      contactEmail: (input.contactEmail || input.ownerEmail || '').trim().toLowerCase(),
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
  const handleCreateShop = async (input: CreateShopInput): Promise<Shop> => {
    const targetBusinessId = (
      input.businessId && input.businessId !== 'unassigned'
        ? input.businessId
        : (activeBusiness && activeBusiness.id !== 'unassigned' ? activeBusiness.id : '')
    ).trim();

    const targetBusiness =
      businesses.find((b) => b.id === targetBusinessId) || activeBusiness;

    const targetBusinessShops = shops.filter(
      (s) => s.businessId === targetBusinessId
    );

    const newShopId = generateUniqueShopId(shops);
    const bizShopSeq = targetBusinessShops.length + 1;
    const prefix = (targetBusiness.name || 'SHP')
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 3) || 'SHP';
    const code = input.code?.trim() || `${prefix}-0${bizShopSeq}`;
    const todayDate = getTodayYmd();
    const isDemo = dataMode === 'demo';

    const effectiveBusinessId = targetBusinessId || activeBusiness.id;

    const newShop: Shop = {
      id: newShopId,
      businessId: effectiveBusinessId,
      code,
      name: input.name.trim(),
      category: input.category ?? 'Supermarket',
      enableTableTabs:
        typeof input.enableTableTabs === 'boolean'
          ? input.enableTableTabs
          : input.category === 'Bar & Lounge',
      locationCity: input.locationCity?.trim() || targetBusiness.headquartersAddress || 'Lagos',
      address: input.address.trim(),
      phone: input.phone.trim() || targetBusiness.primaryPhone || '+2348000000000',
      description: input.description?.trim() || undefined,
      managerName: input.managerName?.trim() || targetBusiness.ownerName || 'Shop Manager',
      status: 'active',
      terminalId: `WIN-POS-${code.replace(/[^A-Z0-9]/g, '')}`,
      taxRatePercent:
        typeof input.taxRatePercent === 'number'
          ? input.taxRatePercent
          : (targetBusiness.defaultTaxRatePercent ?? 7.5),
      receiptHeaderNote: `${input.name.trim()} — Official Receipt`,
      receiptFooterNote: 'Thank you for your patronage',
      createdAt: todayDate,
      pendingSyncCount: 0,
      lastSyncedAt: formatPosTimestamp(),
    };

    // Initialize independent shop context (default isolated category and units)
    const defaultCat: ProductCategory = {
      id: `cat-${newShopId}-general`,
      shopId: newShopId,
      businessId: effectiveBusinessId,
      name: 'General Merchandise',
      description: `Default category for ${newShop.name}`,
    };

    const defaultUnits: UnitOfMeasurement[] = [
      {
        id: `unit-${newShopId}-unit`,
        shopId: newShopId,
        businessId: effectiveBusinessId,
        name: 'Unit',
        abbreviation: 'unit',
      },
      {
        id: `unit-${newShopId}-pack`,
        shopId: newShopId,
        businessId: effectiveBusinessId,
        name: 'Pack',
        abbreviation: 'pk',
      },
    ];

    setShops((prev) => [...prev, newShop]);
    setCategories((prev) => [...prev, defaultCat]);
    setUnits((prev) => [...prev, ...defaultUnits]);

    // Update Business Owner's assignedShopIds list for convenience
    const ownerUser = users.find(
      (u) => u.businessId === effectiveBusinessId && u.role === 'business_owner'
    );
    const updatedOwnerShopIds = ownerUser
      ? Array.from(new Set([...ownerUser.assignedShopIds, newShopId]))
      : [newShopId];

    if (ownerUser) {
      setUsers((prev) =>
        prev.map((u) => {
          if (
            u.businessId === effectiveBusinessId &&
            u.role === 'business_owner' &&
            !u.assignedShopIds.includes(newShopId)
          ) {
            return { ...u, assignedShopIds: [...u.assignedShopIds, newShopId] };
          }
          return u;
        })
      );
    }

    if (!activeShopId && currentUser.role !== 'platform_admin') {
      setActiveShopId(newShopId);
    }

    if (!isDemo) {
      try {
        await liveDataService.persistLiveShop(
          newShop,
          ownerUser?.id || (currentUser.role === 'platform_admin' ? undefined : currentUser.id),
          updatedOwnerShopIds
        );
        setLiveErrorMessage(null);
      } catch (err: any) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Failed to persist new shop to Cloud Firestore.';
        setLiveErrorMessage(msg);
        console.error('[handleCreateShop] persistLiveShop failed:', err);
        setShops((prev) => prev.filter((s) => s.id !== newShopId));
        throw err;
      }
    }

    return newShop;
  };

  const handleUpdateShop = async (
    shopId: string,
    input: CreateShopInput | Partial<Shop>
  ): Promise<void> => {
    const existingShop = shops.find((s) => s.id === shopId);
    if (!existingShop) return;

    const updatedShop: Shop = {
      ...existingShop,
      name: input.name !== undefined ? input.name.trim() : existingShop.name,
      address: input.address !== undefined ? input.address.trim() : existingShop.address,
      locationCity: input.locationCity?.trim() || existingShop.locationCity,
      phone: input.phone !== undefined ? input.phone.trim() : existingShop.phone,
      category: input.category ?? existingShop.category,
      description:
        input.description !== undefined
          ? input.description?.trim() || undefined
          : existingShop.description,
      managerName: input.managerName?.trim() || existingShop.managerName,
      code: input.code?.trim() || existingShop.code,
      taxRatePercent:
        typeof input.taxRatePercent === 'number'
          ? input.taxRatePercent
          : existingShop.taxRatePercent,
      enableTableTabs:
        typeof input.enableTableTabs === 'boolean'
          ? input.enableTableTabs
          : input.category !== undefined
            ? input.category === 'Bar & Lounge'
            : existingShop.enableTableTabs,
    };

    setShops((prev) =>
      prev.map((s) => (s.id === shopId ? updatedShop : s))
    );

    if (dataMode !== 'demo') {
      const ownerUser = users.find(
        (u) => u.businessId === existingShop.businessId && u.role === 'business_owner'
      );
      try {
        await liveDataService.persistLiveShop(
          updatedShop,
          ownerUser?.id || (currentUser.role === 'platform_admin' ? undefined : currentUser.id),
          ownerUser?.assignedShopIds || []
        );
        setLiveErrorMessage(null);
      } catch (err: any) {
        setLiveErrorMessage(
          err instanceof Error
            ? err.message
            : 'Failed to update shop in Cloud Firestore.'
        );
        throw err;
      }
    }
  };

  const handleToggleShopStatus = (shopId: string, nextStatus: ShopStatus) => {
    const existingShop = shops.find((s) => s.id === shopId);
    if (!existingShop) return;

    setShops((prev) =>
      prev.map((s) =>
        s.id === shopId ? { ...s, status: nextStatus } : s
      )
    );
    if (dataMode !== 'demo') {
      const ownerUser = users.find(
        (u) => u.businessId === existingShop.businessId && u.role === 'business_owner'
      );
      liveDataService
        .persistLiveShop(
          { ...existingShop, status: nextStatus },
          ownerUser?.id || (currentUser.role === 'platform_admin' ? undefined : currentUser.id),
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

  const handleCreateStaff = async (input: CreateStaffInput): Promise<User> => {
    let explicitStaffUid: string | undefined = input.staffUid?.trim() || undefined;

    if (!explicitStaffUid && dataMode !== 'demo' && input.password?.trim()) {
      try {
        const provisioned = await provisionStaffAccount({
          email: input.email,
          password: input.password.trim(),
          fullName: input.fullName,
        });
        explicitStaffUid = provisioned.uid;
      } catch (err: any) {
        setLiveErrorMessage(
          err instanceof Error
            ? err.message
            : 'Failed to provision staff authentication credentials.'
        );
        throw err;
      }
    }

    const newUserId = explicitStaffUid || generateUniqueUserId(users);
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
      password: input.password?.trim() || undefined,
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
      try {
        const invited = await liveDataService.inviteLiveStaffUser(newStaff, {
          idempotencyKey,
          explicitStaffUid,
          ...(isPlatformSupportMode && activeSupportSession?.supportSessionId
            ? { supportSessionId: activeSupportSession.supportSessionId }
            : {}),
        });
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
      } catch (err: any) {
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
        throw err;
      }
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

  const handleDeleteStaff = async (userId: string): Promise<void> => {
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser || targetUser.role === 'platform_admin' || targetUser.id === currentUser.id) {
      throw new Error('Cannot delete your own account or a Platform Administrator.');
    }
    if (dataMode !== 'demo' && liveDataService) {
      await liveDataService.deleteUserProfile(userId);
    }
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    setShopAssignments((prev) => prev.filter((a) => a.userId !== userId));
  };

  const handleSavePayrollEmployee = async (employee: PayrollEmployee): Promise<void> => {
    setPayrollEmployees((prev) => {
      const exists = prev.some((e) => e.id === employee.id);
      return exists ? prev.map((e) => (e.id === employee.id ? employee : e)) : [...prev, employee];
    });
    if (dataMode !== 'demo' && liveDataService) {
      await liveDataService.savePayrollEmployee(employee);
    }
  };

  const handleDeletePayrollEmployee = async (employeeId: string): Promise<void> => {
    setPayrollEmployees((prev) => prev.filter((e) => e.id !== employeeId));
    if (dataMode !== 'demo' && liveDataService && activeBusiness?.id) {
      await liveDataService.deletePayrollEmployee(activeBusiness.id, employeeId);
    }
  };

  const handleSavePayrollPeriod = async (period: PayrollPeriod): Promise<void> => {
    setPayrollPeriods((prev) => {
      const exists = prev.some((p) => p.id === period.id);
      return exists ? prev.map((p) => (p.id === period.id ? period : p)) : [...prev, period];
    });
    if (dataMode !== 'demo' && liveDataService) {
      await liveDataService.savePayrollPeriod(period);
    }
  };

  const handleDeletePayrollPeriod = async (periodId: string): Promise<void> => {
    setPayrollPeriods((prev) => prev.filter((p) => p.id !== periodId));
    if (dataMode !== 'demo' && liveDataService && activeBusiness?.id) {
      await liveDataService.deletePayrollPeriod(activeBusiness.id, periodId);
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

  const handleResetUserPassword = async (userId: string, newPassword: string) => {
    const nowFormatted = formatPosTimestamp();
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) {
      throw new Error('User not found.');
    }
    if (!canActorResetUserPassword(currentUser, targetUser)) {
      const msg = 'PERMISSION_DENIED: You do not have permission to reset this user\'s password.';
      setLiveErrorMessage(msg);
      throw new Error(msg);
    }

    if (dataMode !== 'demo') {
      try {
        await liveDataService.resetLiveUserPassword({
          targetUserId: targetUser.id,
          targetEmail: targetUser.email,
          newPassword,
        });
      } catch (err: any) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Failed to reset password in Firebase Authentication.';
        setLiveErrorMessage(msg);
        throw err instanceof Error ? err : new Error(msg);
      }
    }

    setUsers((prev) =>
      prev.map((u) => {
        if (u.id !== userId) return u;
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
        const unDeductedQty = Math.max(0, cartMatch.quantity - (cartMatch.dispatchedQuantity || 0));
        if (unDeductedQty <= 0) return prod;
        const newQty = Math.max(0, prod.stockQuantity - unDeductedQty);
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
      (async () => {
        try {
          await saleFinalizationService.finalizeSale({
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
          });
        } catch (localErr) {
          console.warn('Local sale finalization warning:', localErr);
        }

        if (dataMode === 'live' && navigator.onLine) {
          try {
            const ackResult = await liveDataService.persistLiveSale(
              newSale,
              [],
              {
                operationId: syncOperationId,
                idempotencyKey: checkoutOpId,
                actorUserId: isPlatformSupportMode ? newSale.cashierUserId : currentUser.id,
                ...(isPlatformSupportMode && activeSupportSession
                  ? { supportSessionId: activeSupportSession.supportSessionId }
                  : {}),
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
          } catch (err) {
            console.warn(
              'Sale preserved locally in pending sync queue for auto-sync:',
              err instanceof Error ? err.message : String(err)
            );
          }
        }
      })();
    }

    return newSale;
  };

  const handleDeleteProduct = (productId: string) => {
    if (isPlatformSupportMode) {
      setLiveErrorMessage('Product deletion is not available in Platform Admin Support Mode.');
      return;
    }
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

  const handleDeduplicateProducts = async (
    shopId: string
  ): Promise<{ mergedCount: number; removedCount: number }> => {
    if (!activeBusiness || !shopId) return { mergedCount: 0, removedCount: 0 };

    const shopProds = products.filter(
      (p) => (p.businessId === activeBusiness.id || !p.businessId) && p.shopId === shopId
    );

    // Group by Barcode > SKU > normalized Name
    const groups = new Map<string, Product[]>();
    for (const p of shopProds) {
      const barcodeKey = p.barcode?.trim().toLowerCase();
      const skuKey = p.sku?.trim().toLowerCase();
      const nameKey = p.name?.trim().toLowerCase();

      const key = barcodeKey && barcodeKey !== 'none'
        ? `bc:${barcodeKey}`
        : skuKey
        ? `sku:${skuKey}`
        : `name:${nameKey}`;

      const list = groups.get(key) || [];
      list.push(p);
      groups.set(key, list);
    }

    let mergedCount = 0;
    let removedCount = 0;
    const removedProductIds = new Set<string>();
    const updatedProducts: Product[] = [];

    for (const [, items] of groups) {
      if (items.length <= 1) continue;

      // Primary product is the oldest created or first item
      const sorted = [...items].sort((a, b) => {
        const tA = new Date(a.createdAt || 0).getTime();
        const tB = new Date(b.createdAt || 0).getTime();
        return tA - tB;
      });

      const primary = sorted[0];
      const duplicates = sorted.slice(1);
      const combinedStock = items.reduce((sum, item) => sum + (item.stockQuantity || 0), 0);

      const mergedPrimary: Product = {
        ...primary,
        stockQuantity: combinedStock,
        updatedAt: formatPosTimestamp(),
      };

      updatedProducts.push(mergedPrimary);
      mergedCount++;

      // Update primary in Cloud Firestore
      if (dataMode !== 'demo' && liveDataService) {
        try {
          await liveDataService.persistLiveProduct(mergedPrimary, {
            operationType: 'update',
            supportSessionId: activeSupportSession?.supportSessionId,
          });
        } catch (err) {
          console.error('Failed to update merged primary product:', err);
        }

        // Delete each duplicate document from Cloud Firestore and local storage
        for (const dup of duplicates) {
          try {
            await liveDataService.removeLiveProduct(activeBusiness.id, shopId, dup.id);
            removedProductIds.add(dup.id);
            removedCount++;
          } catch (err) {
            console.error('Failed to remove duplicate product document:', dup.id, err);
          }
        }
      } else {
        duplicates.forEach((d) => {
          removedProductIds.add(d.id);
          removedCount++;
          if (dbAdapter) {
            dbAdapter.deleteProduct(d.id, shopId).catch(() => {});
          }
        });
      }
    }

    if (removedProductIds.size > 0 || updatedProducts.length > 0) {
      const updatedMap = new Map(updatedProducts.map((p) => [p.id, p]));
      setProducts((prev) =>
        prev
          .filter((p) => !removedProductIds.has(p.id))
          .map((p) => updatedMap.get(p.id) || p)
      );
    }

    return { mergedCount, removedCount };
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
        stockQuantity: existingProduct.stockQuantity,
        reorderLevel: input.reorderLevel,
        hasExpiry: Boolean(input.hasExpiry),
        expiryDate: input.hasExpiry && input.expiryDate ? input.expiryDate.trim() : null,
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
        liveDataService.persistLiveProduct(updatedProduct, {
          operationType: 'update',
          ...(isPlatformSupportMode && activeSupportSession
            ? { supportSessionId: activeSupportSession.supportSessionId }
            : {}),
        }).catch((err) => {
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
        hasExpiry: Boolean(input.hasExpiry),
        expiryDate: input.hasExpiry && input.expiryDate ? input.expiryDate.trim() : null,
        isActive: true,
        updatedAt: formatPosTimestamp(),
      };
      setProducts((prev) => [newProduct, ...prev]);

      if (dataMode !== 'demo') {
        liveDataService.persistLiveProduct(newProduct, {
          operationType: 'create',
          ...(isPlatformSupportMode && activeSupportSession
            ? { supportSessionId: activeSupportSession.supportSessionId }
            : {}),
        }).catch((err) => {
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
      liveDataService.persistInventoryMovement(adjustment,
        isPlatformSupportMode && activeSupportSession
          ? activeSupportSession.supportSessionId
          : undefined
      ).catch((err) => {
        setLiveErrorMessage(err instanceof Error ? err.message : 'Failed to synchronize inventory movement.');
      });
    }
  };

  const handleDispatchTabItems = (
    _tabId: string,
    itemsToDispatch: Array<{ product: Product; quantity: number }>,
    tableName: string
  ) => {
    if (!activeShop || itemsToDispatch.length === 0) return;
    const nowFormatted = formatPosTimestamp();

    setProducts((prev) =>
      prev.map((prod) => {
        if (prod.shopId !== activeShop.id) return prod;
        const match = itemsToDispatch.find((i) => i.product.id === prod.id);
        if (!match || match.quantity <= 0) return prod;
        const newQty = Math.max(0, prod.stockQuantity - match.quantity);
        return {
          ...prod,
          stockQuantity: newQty,
          updatedAt: nowFormatted,
        };
      })
    );

    for (const item of itemsToDispatch) {
      if (item.quantity <= 0) continue;
      const target = activeShopProducts.find((p) => p.id === item.product.id) || item.product;
      const { adjustment } = applyStockAdjustment(
        target,
        'damage_spoilage',
        item.quantity,
        `Dispatched to ${tableName || 'Bar Tab'}`,
        currentUser,
        nowFormatted
      );
      setStockAdjustments((prev) => [adjustment, ...prev]);

      if (dataMode !== 'demo') {
        liveDataService.persistInventoryMovement(adjustment,
          isPlatformSupportMode && activeSupportSession
            ? activeSupportSession.supportSessionId
            : undefined
        ).catch((err) => {
          console.warn('Inventory dispatch sync warning:', err);
        });
      }
    }
  };

  const handleVoidTabItems = (
    _tabId: string,
    itemsToVoid: Array<{ product: Product; quantity: number }>,
    tableName: string,
    reason: string
  ) => {
    if (!activeShop || itemsToVoid.length === 0) return;
    const nowFormatted = formatPosTimestamp();

    setProducts((prev) =>
      prev.map((prod) => {
        if (prod.shopId !== activeShop.id) return prod;
        const match = itemsToVoid.find((i) => i.product.id === prod.id);
        if (!match || match.quantity <= 0) return prod;
        const newQty = prod.stockQuantity + match.quantity;
        return {
          ...prod,
          stockQuantity: newQty,
          updatedAt: nowFormatted,
        };
      })
    );

    for (const item of itemsToVoid) {
      if (item.quantity <= 0) continue;
      const target = activeShopProducts.find((p) => p.id === item.product.id) || item.product;
      const { adjustment } = applyStockAdjustment(
        target,
        'return_in',
        item.quantity,
        `Voided from ${tableName || 'Bar Tab'}: ${reason || 'Customer canceled before consumption'}`,
        currentUser,
        nowFormatted
      );
      setStockAdjustments((prev) => [adjustment, ...prev]);

      if (dataMode !== 'demo') {
        liveDataService.persistInventoryMovement(adjustment,
          isPlatformSupportMode && activeSupportSession
            ? activeSupportSession.supportSessionId
            : undefined
        ).catch((err) => {
          console.warn('Inventory void sync warning:', err);
        });
      }
    }
  };

  const handleProcessReceiptReturn = (
    saleId: string,
    updatedQuantitiesByLineId: Record<string, number>,
    reason: string
  ) => {
    if (isPlatformSupportMode) {
      setLiveErrorMessage('Receipt returns are not available in Platform Admin Support Mode.');
      return;
    }
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

    // 5. In live mode: persist the receipt return & stock restoration to Cloud Firestore atomically
    if (dataMode !== 'demo' && liveDataService) {
      liveDataService
        .processLiveReceiptReturn({
          businessId: activeBusiness.id,
          shopId: activeShop.id,
          saleId,
          updatedSale: result.updatedSale,
          returnedItems: result.returnedItems,
          reason,
          supportSessionId:
            isPlatformSupportMode && activeSupportSession
              ? activeSupportSession.supportSessionId
              : undefined,
        })
        .catch((err) => {
          console.error('Failed to sync receipt return to cloud:', err);
          setLiveErrorMessage(
            err instanceof Error
              ? err.message
              : 'Failed to synchronize receipt return to cloud.'
          );
        });
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

  const handleInitiateTransfer = async (
    transferInput: Omit<ProductTransfer, 'id' | 'transferNumber' | 'createdAt' | 'updatedAt'>
  ): Promise<ProductTransfer> => {
    const transferId = `trf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const transferCount = transfers.length + 1;
    const transferNumber = `TRF-${new Date().getFullYear()}-${String(transferCount).padStart(4, '0')}`;
    const nowIso = new Date().toISOString();

    let allSourceDeducted = true;
    const updatedSourceProds: Product[] = [];

    // 1. Immediately deduct transferred quantities from source shop stock in state and Firestore
    for (const item of transferInput.items) {
      const sourceProd = products.find(
        (p) => p.id === item.productId && p.shopId === transferInput.sourceShopId
      );
      if (sourceProd) {
        const nextQty = Math.max(0, sourceProd.stockQuantity - item.quantity);
        const updatedSourceProd: Product = {
          ...sourceProd,
          stockQuantity: nextQty,
          updatedAt: nowIso,
        };

        if (dataMode !== 'demo' && liveDataService) {
          try {
            await liveDataService.persistLiveProduct(updatedSourceProd, {
              operationType: 'update',
              supportSessionId: activeSupportSession?.supportSessionId,
            });

            // Record source shop inventory movement
            await liveDataService.persistInventoryMovement({
              id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              shopId: transferInput.sourceShopId,
              businessId: transferInput.businessId,
              productId: sourceProd.id,
              productName: sourceProd.name,
              productSku: sourceProd.sku,
              type: 'audit_correction',
              quantityDelta: -item.quantity,
              previousQuantity: sourceProd.stockQuantity,
              newQuantity: nextQty,
              reason: `Transfer dispatched to ${transferInput.destinationShopName} (${transferNumber})`,
              referenceId: transferNumber,
              performedByUserId: currentUser.id,
              performedByName: currentUser.fullName,
              createdAt: nowIso,
              syncStatus: 'synced',
            });
          } catch (err) {
            console.error('Failed to persist source stock deduction during transfer initiation:', err);
            allSourceDeducted = false;
          }
        }

        updatedSourceProds.push(updatedSourceProd);
      }
    }

    if (updatedSourceProds.length > 0) {
      setProducts((prev) => {
        const updatedMap = new Map(updatedSourceProds.map((p) => [p.id, p]));
        return prev.map((p) => updatedMap.get(p.id) || p);
      });
    }

    const newTransfer: ProductTransfer = {
      ...transferInput,
      id: transferId,
      transferNumber,
      sourceDeducted: allSourceDeducted,
      sourceDeductedAt: allSourceDeducted ? nowIso : undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    // 2. Persist the transfer record
    if (dataMode !== 'demo' && liveDataService) {
      try {
        await liveDataService.saveTransfer(newTransfer);
      } catch (err) {
        console.warn('Network offline or error persisting transfer online, retained locally for auto-sync:', err);
      }
    }

    setTransfers((prev) => [newTransfer, ...prev]);
    return newTransfer;
  };

  const handleConfirmTransfer = async (
    transferId: string,
    confirmedItems?: { productId: string; receivedQuantity: number }[]
  ): Promise<void> => {
    const transfer = transfers.find((t) => t.id === transferId);
    if (!transfer) throw new Error('Transfer not found');
    if (transfer.status !== 'pending') throw new Error('Transfer is not pending');

    const nowIso = new Date().toISOString();
    const confirmedMap = new Map(
      (confirmedItems || []).map((ci) => [ci.productId, ci.receivedQuantity])
    );

    // 1. Add transferred items to destination shop stock immediately
    // Pre-fetch all destination shop products directly from live cloud or fallback to in-memory state
    let destProds: Product[] = [];
    if (dataMode !== 'demo' && liveDataService) {
      try {
        destProds = await liveDataService.listShopProducts(
          transfer.businessId,
          transfer.destinationShopId
        );
      } catch {
        destProds = products.filter(
          (p) =>
            p.businessId === transfer.businessId &&
            p.shopId === transfer.destinationShopId
        );
      }
    } else {
      destProds = products.filter(
        (p) =>
          p.businessId === transfer.businessId &&
          p.shopId === transfer.destinationShopId
      );
    }

    for (const item of transfer.items) {
      const receivedQty = confirmedMap.has(item.productId)
        ? confirmedMap.get(item.productId)!
        : item.quantity;
      if (receivedQty <= 0) continue;

      // Look up if product already exists in destination shop by SKU, barcode, or exact name
      const existingDestProd = destProds.find(
        (p) =>
          p.shopId === transfer.destinationShopId &&
          ((p.sku && item.sku && p.sku.trim().toLowerCase() === item.sku.trim().toLowerCase()) ||
            (p.barcode && item.barcode && p.barcode.trim().toLowerCase() === item.barcode.trim().toLowerCase()) ||
            (p.name && item.productName && p.name.trim().toLowerCase() === item.productName.trim().toLowerCase()))
      );

      if (existingDestProd) {
        const nextQty = existingDestProd.stockQuantity + receivedQty;
        const updatedDestProd: Product = {
          ...existingDestProd,
          stockQuantity: nextQty,
          updatedAt: nowIso,
        };

        if (dataMode !== 'demo' && liveDataService) {
          try {
            await liveDataService.persistLiveProduct(updatedDestProd, {
              operationType: 'update',
              supportSessionId: activeSupportSession?.supportSessionId,
            });
          } catch (err) {
            console.error('Failed to update destination product in Cloud Firestore:', err);
            setLiveErrorMessage(
              err instanceof Error ? err.message : 'Failed to update destination product in Cloud Firestore.'
            );
          }

          try {
            await liveDataService.persistInventoryMovement({
              id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              shopId: transfer.destinationShopId,
              businessId: transfer.businessId,
              productId: existingDestProd.id,
              productName: existingDestProd.name,
              productSku: existingDestProd.sku,
              type: 'audit_correction',
              quantityDelta: receivedQty,
              previousQuantity: existingDestProd.stockQuantity,
              newQuantity: nextQty,
              reason: `Transfer received from ${transfer.sourceShopName} (${transfer.transferNumber})`,
              referenceId: transfer.transferNumber,
              performedByUserId: currentUser.id,
              performedByName: currentUser.fullName,
              createdAt: nowIso,
              syncStatus: 'synced',
            });
          } catch {
            // continue
          }
        }

        destProds = destProds.map((p) => (p.id === updatedDestProd.id ? updatedDestProd : p));
        setProducts((prev) =>
          prev.map((p) => (p.id === updatedDestProd.id ? updatedDestProd : p))
        );
      } else {
        // Create product in destination shop
        const newDestProdId = generateUniqueProductId(destProds, transfer.destinationShopId);
        const newDestProd: Product = {
          id: newDestProdId,
          shopId: transfer.destinationShopId,
          businessId: transfer.businessId,
          name: item.productName,
          sku: item.sku,
          barcode: item.barcode || item.sku,
          unit: item.unit,
          costPrice: item.costPrice || 0,
          sellingPrice: item.sellingPrice || 0,
          categoryId: `cat-${transfer.destinationShopId}-general`,
          categoryName: item.categoryName || 'General',
          stockQuantity: receivedQty,
          reorderLevel: 5,
          isActive: true,
          updatedAt: nowIso,
        };

        if (dataMode !== 'demo' && liveDataService) {
          try {
            await liveDataService.persistLiveProduct(newDestProd, {
              operationType: 'create',
              supportSessionId: activeSupportSession?.supportSessionId,
            });
          } catch (err) {
            console.error('Failed to persist transferred product to Cloud Firestore:', err);
            setLiveErrorMessage(
              err instanceof Error ? err.message : 'Failed to save transferred product to Cloud Firestore.'
            );
          }

          try {
            await liveDataService.persistInventoryMovement({
              id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              shopId: transfer.destinationShopId,
              businessId: transfer.businessId,
              productId: newDestProd.id,
              productName: newDestProd.name,
              productSku: newDestProd.sku,
              type: 'audit_correction',
              quantityDelta: receivedQty,
              previousQuantity: 0,
              newQuantity: receivedQty,
              reason: `Initial stock from transfer received from ${transfer.sourceShopName} (${transfer.transferNumber})`,
              referenceId: transfer.transferNumber,
              performedByUserId: currentUser.id,
              performedByName: currentUser.fullName,
              createdAt: nowIso,
              syncStatus: 'synced',
            });
          } catch {
            // continue
          }
        }

        destProds.push(newDestProd);
        setProducts((prev) => [...prev, newDestProd]);
      }
    }

    // 2. Mark transfer completed
    const updatedTransfer: ProductTransfer = {
      ...transfer,
      status: 'completed',
      confirmedByUserId: currentUser.id,
      confirmedByUserName: currentUser.fullName,
      confirmedAt: nowIso,
      updatedAt: nowIso,
    };

    if (dataMode !== 'demo' && liveDataService) {
      try {
        await liveDataService.saveTransfer(updatedTransfer);
      } catch (err) {
        console.warn('Network offline or error confirming transfer online, updated locally for sync:', err);
      }
    }

    setTransfers((prev) =>
      prev.map((t) => (t.id === updatedTransfer.id ? updatedTransfer : t))
    );
  };

  const handleRejectTransfer = async (
    transferId: string,
    reason: string
  ): Promise<void> => {
    const transfer = transfers.find((t) => t.id === transferId);
    if (!transfer) throw new Error('Transfer not found');
    const nowIso = new Date().toISOString();

    // Restore stock to source shop only if it was deducted
    if (transfer.sourceDeducted || transfer.sourceDeductedAt) {
      for (const item of transfer.items) {
        const sourceProd = products.find(
          (p) => p.id === item.productId && p.shopId === transfer.sourceShopId
        );
        if (sourceProd) {
          const nextQty = sourceProd.stockQuantity + item.quantity;
          const restoredSourceProd: Product = {
            ...sourceProd,
            stockQuantity: nextQty,
            updatedAt: nowIso,
          };

          if (dataMode !== 'demo' && liveDataService) {
            try {
              await liveDataService.persistLiveProduct(restoredSourceProd, {
                operationType: 'update',
                supportSessionId: activeSupportSession?.supportSessionId,
              });

              await liveDataService.persistInventoryMovement({
                id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                shopId: transfer.sourceShopId,
                businessId: transfer.businessId,
                productId: sourceProd.id,
                productName: sourceProd.name,
                productSku: sourceProd.sku,
                type: 'audit_correction',
                quantityDelta: item.quantity,
                previousQuantity: sourceProd.stockQuantity,
                newQuantity: nextQty,
                reason: `Stock restored from rejected transfer (${transfer.transferNumber}): ${reason}`,
                referenceId: transfer.transferNumber,
                performedByUserId: currentUser.id,
                performedByName: currentUser.fullName,
                createdAt: nowIso,
                syncStatus: 'synced',
              });
            } catch {
              // continue
            }
          }

          setProducts((prev) =>
            prev.map((p) => (p.id === restoredSourceProd.id ? restoredSourceProd : p))
          );
        }
      }
    }

    const updatedTransfer: ProductTransfer = {
      ...transfer,
      status: 'rejected',
      rejectionReason: reason,
      rejectedByUserId: currentUser.id,
      rejectedByUserName: currentUser.fullName,
      rejectedAt: nowIso,
      updatedAt: nowIso,
    };

    if (dataMode !== 'demo' && liveDataService) {
      try {
        await liveDataService.saveTransfer(updatedTransfer);
      } catch (err) {
        console.warn('Network offline or error confirming transfer online, updated locally for sync:', err);
      }
    }

    setTransfers((prev) =>
      prev.map((t) => (t.id === updatedTransfer.id ? updatedTransfer : t))
    );
  };

  const handleCancelTransfer = async (transferId: string): Promise<void> => {
    const transfer = transfers.find((t) => t.id === transferId);
    if (!transfer) throw new Error('Transfer not found');
    const nowIso = new Date().toISOString();

    // Restore stock to source shop only if it was deducted
    if (transfer.sourceDeducted || transfer.sourceDeductedAt) {
      for (const item of transfer.items) {
        const sourceProd = products.find(
          (p) => p.id === item.productId && p.shopId === transfer.sourceShopId
        );
        if (sourceProd) {
          const nextQty = sourceProd.stockQuantity + item.quantity;
          const restoredSourceProd: Product = {
            ...sourceProd,
            stockQuantity: nextQty,
            updatedAt: nowIso,
          };

          if (dataMode !== 'demo' && liveDataService) {
            try {
              await liveDataService.persistLiveProduct(restoredSourceProd, {
                operationType: 'update',
                supportSessionId: activeSupportSession?.supportSessionId,
              });

              await liveDataService.persistInventoryMovement({
                id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                shopId: transfer.sourceShopId,
                businessId: transfer.businessId,
                productId: sourceProd.id,
                productName: sourceProd.name,
                productSku: sourceProd.sku,
                type: 'audit_correction',
                quantityDelta: item.quantity,
                previousQuantity: sourceProd.stockQuantity,
                newQuantity: nextQty,
                reason: `Stock restored from cancelled transfer (${transfer.transferNumber})`,
                referenceId: transfer.transferNumber,
                performedByUserId: currentUser.id,
                performedByName: currentUser.fullName,
                createdAt: nowIso,
                syncStatus: 'synced',
              });
            } catch {
              // continue
            }
          }

          setProducts((prev) =>
            prev.map((p) => (p.id === restoredSourceProd.id ? restoredSourceProd : p))
          );
        }
      }
    }

    const updatedTransfer: ProductTransfer = {
      ...transfer,
      status: 'cancelled',
      rejectedByUserId: currentUser.id,
      rejectedByUserName: currentUser.fullName,
      rejectedAt: nowIso,
      updatedAt: nowIso,
    };

    if (dataMode !== 'demo' && liveDataService) {
      try {
        await liveDataService.saveTransfer(updatedTransfer);
      } catch (err) {
        console.warn('Network offline or error confirming transfer online, updated locally for sync:', err);
      }
    }

    setTransfers((prev) =>
      prev.map((t) => (t.id === updatedTransfer.id ? updatedTransfer : t))
    );
  };

  const handleUpdateShopSettings = (
    shopId: string,
    updates: Partial<
      Pick<
        Shop,
        | 'name'
        | 'phone'
        | 'taxRatePercent'
        | 'vatEnabled'
        | 'printVatOnReceipt'
        | 'receiptHeaderNote'
        | 'receiptFooterNote'
        | 'printerSettings'
        | 'enableTableTabs'
      >
    >
  ) => {
    let targetShop: Shop | null = null;
    setShops((prev) =>
      prev.map((s) => {
        if (s.id === shopId) {
          targetShop = { ...s, ...updates };
          return targetShop;
        }
        return s;
      })
    );

    if (targetShop) {
      const persistedShop: Shop = targetShop;
      if (dataMode !== 'demo') {
        liveDataService.persistLiveShop(persistedShop).catch((err) => {
          console.error('Failed to persist shop settings to Cloud Firestore:', err);
        });
      } else {
        void dbAdapter.saveShop({
          id: persistedShop.id,
          business_id: persistedShop.businessId,
          code: persistedShop.code,
          name: persistedShop.name,
          category: persistedShop.category,
          location_city: persistedShop.locationCity,
          address: persistedShop.address,
          phone: persistedShop.phone,
          description: persistedShop.description,
          manager_name: persistedShop.managerName,
          status: persistedShop.status,
          terminal_id: persistedShop.terminalId,
          tax_rate_percent: persistedShop.taxRatePercent,
          receipt_header_note: persistedShop.receiptHeaderNote,
          receipt_footer_note: persistedShop.receiptFooterNote,
          printer_settings_json: persistedShop.printerSettings
            ? JSON.stringify(persistedShop.printerSettings)
            : undefined,
          created_at: persistedShop.createdAt,
          updated_at: new Date().toISOString(),
        }).catch((err) => {
          console.error('Failed to save shop settings locally:', err);
        });
      }
    }
  };

  const handleSavePrinterSettings = async (
    shopId: string,
    settings: ShopPrinterSettings
  ): Promise<void> => {
    const shop = shops.find((item) => item.id === shopId);

    if (!shop) {
      throw new Error('Shop not found. Please refresh and try again.');
    }

    const existingLocalShop = await dbAdapter.getShop(shopId);

    if (
      existingLocalShop &&
      existingLocalShop.business_id !== shop.businessId
    ) {
      throw new Error('Local shop ownership verification failed.');
    }

    const now = new Date().toISOString();

    await dbAdapter.saveShop({
      ...(existingLocalShop || {}),
      id: shop.id,
      business_id: shop.businessId,
      code: shop.code,
      name: shop.name,
      category: shop.category,
      location_city: shop.locationCity,
      address: shop.address,
      phone: shop.phone,
      description: shop.description,
      manager_name: shop.managerName,
      status: shop.status,
      terminal_id: shop.terminalId,
      tax_rate_percent: shop.taxRatePercent,
      receipt_header_note: shop.receiptHeaderNote,
      receipt_footer_note: shop.receiptFooterNote,
      printer_settings_json: JSON.stringify(settings),
      created_at: existingLocalShop?.created_at || shop.createdAt,
      updated_at: now,
    });

    setShops((prev) =>
      prev.map((item) =>
        item.id === shopId
          ? { ...item, printerSettings: settings }
          : item
      )
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
    if (dataMode !== 'demo' && liveDataService) {
      void liveDataService.saveShopDebtCustomer(activeBusiness.id, activeShop.id, newCustomer);
    }
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
        (c) =>
          (c.id === customerId ||
            (c.phone && options?.reference && c.phone === customerId)) &&
          c.shopId === activeShop.id &&
          c.businessId === activeBusiness.id
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

      if (dataMode !== 'demo' && liveDataService) {
        void liveDataService.saveShopDebtCustomer(activeBusiness.id, activeShop.id, updatedCustomer);
        void liveDataService.saveShopDebtTransaction(activeBusiness.id, activeShop.id, transaction);
      }

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

    // Resolve or auto-register debt customer so invoice appears in Debt Book
    let targetCustomerId = invoiceData.customerId;
    if (!targetCustomerId || targetCustomerId === 'none') {
      const match = debtCustomers.find(
        (c) =>
          c.shopId === activeShop.id &&
          c.businessId === activeBusiness.id &&
          ((c.phone && invoiceData.customerPhone && c.phone.trim() === invoiceData.customerPhone.trim()) ||
            (c.fullName && invoiceData.customerName && c.fullName.trim().toLowerCase() === invoiceData.customerName.trim().toLowerCase()))
      );
      if (match) {
        targetCustomerId = match.id;
      } else if (invoiceData.customerName?.trim() && invoiceData.customerPhone?.trim()) {
        const newCust = handleAddDebtCustomer({
          fullName: invoiceData.customerName.trim(),
          phone: invoiceData.customerPhone.trim(),
          creditLimitEnabled: false,
          creditLimitAmount: 0,
          notes: invoiceData.companyName?.trim()
            ? `Company: ${invoiceData.companyName.trim()}`
            : 'Registered from Invoicing workspace',
        });
        targetCustomerId = newCust.id;
      }
    }

    const newInvoice: Invoice = {
      ...invoiceData,
      id: generateUniqueInvoiceId(invoices, activeShop.id),
      customerId: targetCustomerId !== 'none' ? targetCustomerId : undefined,
      amountPaid: initialPaid,
      balanceRemaining: initialBalance,
      status: initialStatus,
      payments: invoiceData.payments || [],
      createdAt: nowFormatted,
      updatedAt: nowFormatted,
    };
    setInvoices((prev) => [newInvoice, ...prev]);

    // Record credit and initial deposit transactions in Customer Debt Book
    if (targetCustomerId && targetCustomerId !== 'none') {
      if (newInvoice.totalAmount > 0) {
        handleRecordDebtTransaction(targetCustomerId, 'credit', newInvoice.totalAmount, {
          reference: newInvoice.invoiceNumber,
          notes: `Invoice ${newInvoice.invoiceNumber} issued`,
        });
      }
      if (initialPaid > 0) {
        handleRecordDebtTransaction(targetCustomerId, 'deposit', initialPaid, {
          reference: `${newInvoice.invoiceNumber}-PMT-INITIAL`,
          notes: `Initial payment for invoice ${newInvoice.invoiceNumber}`,
        });
      }
    }

    if (dataMode !== 'demo' && liveDataService) {
      void liveDataService.saveShopInvoice(activeBusiness.id, activeShop.id, newInvoice);
    }

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
    let updatedTargetInvoice: Invoice | null = null;
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

        const updated: Invoice = {
          ...inv,
          amountPaid: updatedAmountPaid,
          balanceRemaining: newBalance,
          status: newStatus,
          payments: [...existingPayments, newRecord],
          updatedAt: nowFormatted,
        };
        updatedTargetInvoice = updated;
        return updated;
      })
    );

    // Also record the deposit in the Customer Debt Book
    const inv = invoices.find((i) => i.id === invoiceId);
    if (inv && amount > 0) {
      let targetCustId = inv.customerId;
      if (!targetCustId || targetCustId === 'none') {
        const match = debtCustomers.find(
          (c) =>
            c.shopId === inv.shopId &&
            c.businessId === inv.businessId &&
            ((c.phone && inv.customerPhone && c.phone.trim() === inv.customerPhone.trim()) ||
              (c.fullName && inv.customerName && c.fullName.trim().toLowerCase() === inv.customerName.trim().toLowerCase()))
        );
        if (match) targetCustId = match.id;
      }
      if (targetCustId && targetCustId !== 'none') {
        handleRecordDebtTransaction(targetCustId, 'deposit', amount, {
          paymentMethod,
          reference: paymentReference?.trim() || `${inv.invoiceNumber}-PMT-${getUniqueTimestampSuffix()}`,
          notes: notes?.trim() || `Payment for invoice ${inv.invoiceNumber}`,
        });
      }
    }

    if (dataMode !== 'demo' && liveDataService && updatedTargetInvoice && activeShop) {
      void liveDataService.saveShopInvoice(activeBusiness.id, activeShop.id, updatedTargetInvoice);
    }
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
    if (dataMode !== 'demo' && liveDataService) {
      void liveDataService.saveShopSupplier(activeBusiness.id, activeShop.id, newSupplier);
    }
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
      (s) =>
        s.id === supplierId &&
        s.businessId === activeBusiness.id &&
        (s.shopId === activeShop.id || !s.shopId)
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
    if (dataMode !== 'demo' && liveDataService) {
      void liveDataService.saveShopSupplier(activeBusiness.id, activeShop.id, updatedSupplier);
      void liveDataService.saveShopSupplierSupply(activeBusiness.id, activeShop.id, supplyRecord);
    }

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

    const updatedProductsToPersist: Product[] = [];

    if (productUpdates.size > 0) {
      activeShopProducts.forEach((p) => {
        const upd = productUpdates.get(p.id);
        if (upd) {
          updatedProductsToPersist.push({
            ...p,
            stockQuantity: upd.nextStock,
            costPrice: upd.nextCostPrice,
            updatedAt: nowFormatted,
          });
        }
      });

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

    if (dataMode !== 'demo') {
      for (const prod of updatedProductsToPersist) {
        liveDataService
          .persistLiveProduct(prod, {
            operationType: 'update',
            ...(isPlatformSupportMode && activeSupportSession
              ? { supportSessionId: activeSupportSession.supportSessionId }
              : {}),
          })
          .catch((err) => {
            console.error('Failed to update product stock from supplier supply:', err);
          });
      }

      for (const adj of newAdjustments) {
        liveDataService
          .persistInventoryMovement(
            adj,
            isPlatformSupportMode && activeSupportSession
              ? activeSupportSession.supportSessionId
              : undefined
          )
          .catch((err) => {
            console.error('Failed to record stock movement from supplier supply:', err);
          });
      }

      void cloudSyncService
        .syncPendingOperations(currentUser, {
          shopId: activeShop.id,
          includeRequiresReview: true,
        })
        .then(async () => {
          if (dbAdapter) {
            const report = await auditLocalStorageAndIndexedDb(dbAdapter);
            setStorageAudit(report);
          }
        })
        .catch(() => {});
    }
  };

  const handleRecordSupplierPayment = (supplierId: string, amount: number) => {
    if (!activeShop) return;
    const nowFormatted = formatPosTimestamp();
    setSuppliers((prev) =>
      prev.map((s) => {
        if (
          s.id !== supplierId ||
          s.shopId !== activeShop.id ||
          s.businessId !== activeBusiness.id
        ) {
          return s;
        }
        return applySupplierBalancePayment(s, amount, nowFormatted);
      })
    );
  };

  const handleRetryPendingSync = useCallback(
    async (syncId?: string) => {
      if (
        dataMode !== 'live' ||
        !currentUser ||
        currentUser.status !== 'active' ||
        !activeBusiness ||
        isKnownDemoRecord(activeBusiness)
      ) {
        return;
      }

      if (!dbAdapter) return;

      try {
        // 1. Ensure all active shop products in memory have their latest stock persisted to Cloud Firestore
        if (activeShopProducts && activeShopProducts.length > 0) {
          for (const prod of activeShopProducts) {
            try {
              await liveDataService.persistLiveProduct(prod, {
                operationType: 'update',
                ...(isPlatformSupportMode && activeSupportSession
                  ? { supportSessionId: activeSupportSession.supportSessionId }
                  : {}),
              });
            } catch (pErr) {
              console.warn('Could not update live product stock before sync retry:', pErr);
            }
          }
        }

        // 2. Fetch actionable queue entries
        const allQueue = dbAdapter.getAllSyncQueue
          ? await dbAdapter.getAllSyncQueue(activeShop?.id, activeBusiness.id)
          : await dbAdapter.getPendingSyncQueue(activeShop?.id);

        const candidates = allQueue.filter((e) => {
          if (syncId && e.id !== syncId) return false;
          if (e.status === 'synced' || e.status === ('quarantined' as any)) return false;
          if (
            SPECIFIED_PRE_FIREBASE_SYNC_ID_SET.has(e.id) ||
            SPECIFIED_PRE_FIREBASE_SALE_ID_SET.has(e.entity_id) ||
            isPreFirebaseTestRecord(e) ||
            isKnownDemoRecord(e)
          ) {
            return false;
          }
          return true;
        });

        for (const entry of candidates) {
          if (entry.entity_type === 'sale') {
            const localSale = await dbAdapter.getSale(entry.entity_id);
            if (!localSale) continue;
            const localItems = await dbAdapter.getSaleItems(localSale.id);

            const saleTx: SaleTransaction = {
              id: localSale.id,
              shopId: localSale.shop_id,
              businessId: localSale.business_id,
              receiptNumber: localSale.receipt_number,
              terminalId: localSale.terminal_id,
              cashierUserId: localSale.cashier_user_id,
              cashierName: localSale.cashier_name,
              createdAt: localSale.created_at,
              items: localItems.map((item) => ({
                id: item.id,
                productId: item.product_id,
                sku: item.sku,
                barcode: item.barcode,
                productName: item.product_name,
                unit: item.unit,
                unitPrice: fromMinorUnits(item.unit_price_kobo),
                costPrice: fromMinorUnits(item.cost_price_kobo),
                quantity: item.quantity,
                lineTotal: fromMinorUnits(item.line_total_kobo),
              })),
              subtotal: fromMinorUnits(localSale.subtotal_kobo),
              discountAmount: fromMinorUnits(localSale.discount_amount_kobo),
              taxRatePercent: localSale.tax_rate_percent,
              taxAmount: fromMinorUnits(localSale.tax_amount_kobo),
              totalAmount: fromMinorUnits(localSale.total_amount_kobo),
              amountTendered: fromMinorUnits(localSale.amount_tendered_kobo),
              changeDue: fromMinorUnits(localSale.change_due_kobo),
              paymentMethod: (localSale.payment_method as SaleTransaction['paymentMethod']) || 'cash',
              paymentReference: localSale.payment_reference,
              creditCustomerId: localSale.credit_customer_id,
              creditCustomerName: localSale.credit_customer_name,
              creditCustomerPhone: localSale.credit_customer_phone,
              status: 'completed',
              syncStatus: 'pending_local_queue',
              notes: localSale.notes,
            };

            const baseIdem = entry.idempotency_key || `chk-${localSale.shop_id}-${localSale.id}`;
            const retryIdempotencyKey =
              entry.status === 'requires_review'
                ? `${baseIdem}-retry-${Date.now()}`
                : baseIdem;

            const ackResult = await liveDataService.persistLiveSale(
              saleTx,
              [],
              {
                operationId: entry.id,
                idempotencyKey: retryIdempotencyKey,
                actorUserId: isPlatformSupportMode ? saleTx.cashierUserId : currentUser.id,
                ...(isPlatformSupportMode && activeSupportSession
                  ? { supportSessionId: activeSupportSession.supportSessionId }
                  : {}),
              }
            );

            if (ackResult.outcome === 'acknowledged' && ackResult.ackId) {
              await dbAdapter.updateSyncStatus(entry.id, 'synced', undefined, {
                cloudAckId: ackResult.ackId,
                acknowledgedAt: ackResult.syncedAt || new Date().toISOString(),
              });

              await dbAdapter.saveSale(
                {
                  ...localSale,
                  is_synced: 1,
                  sync_conflict_reason: undefined,
                  synced_at: ackResult.syncedAt || new Date().toISOString(),
                  sync_ack_id: ackResult.ackId,
                },
                localItems
              );

              setSales((prev) =>
                prev.map((s) =>
                  s.id === localSale.id
                    ? { ...s, status: 'completed', syncStatus: 'synced' }
                    : s
                )
              );

              setShops((prev) =>
                prev.map((s) =>
                  s.id === localSale.shop_id
                    ? {
                        ...s,
                        pendingSyncCount: Math.max(0, s.pendingSyncCount - 1),
                        lastSyncedAt: 'Just now (Cloud Verified)',
                      }
                    : s
                )
              );
            }
          }
        }
      } catch (err) {
        console.warn('Live sync retry encountered error:', err);
      } finally {
        const report = await auditLocalStorageAndIndexedDb(dbAdapter);
        setStorageAudit(report);
      }
    },
    [
      dataMode,
      currentUser,
      activeBusiness,
      activeShop?.id,
      activeShopProducts,
      dbAdapter,
      liveDataService,
      isPlatformSupportMode,
      activeSupportSession,
    ]
  );
  handleRetryPendingSyncRef.current = handleRetryPendingSync;

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
      onRetryPendingSync={handleRetryPendingSync}
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
      <>
        <LoginPage
          demoUsers={savedDemoUsers}
          onAuthenticated={handleAuthenticated}
          onAuthenticatedFirebase={handleAuthenticatedFirebase}
        />
        <AppUpdateNotificationModal />
      <PwaInstallBanner />
        <PwaInstallBanner />
      </>
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
        <AppUpdateNotificationModal />
      <PwaInstallBanner />
        <PwaInstallBanner />
      </div>
    );
  }

  // =========================================================================
  // STAGE 2: PLATFORM ADMINISTRATOR CONSOLE
  // =========================================================================
  if (
  currentUser.role === 'platform_admin' &&
  !isPlatformSupportMode
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
            activeSupportSession={activeSupportSession}
            onStartSupportSession={handleStartSupportSession}
            onEndSupportSession={handleEndSupportSession}
            connectivity={connectivitySnapshot}
            onChangeConnectivityState={handleConnectivityStateChange}
            onCreateBusiness={handleCreateBusiness}
            onUpdateBusiness={handleUpdateBusiness}
            onToggleBusinessStatus={handleToggleBusinessStatus}
            onResetUserPassword={handleResetUserPassword}
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
                  supportSessionId: activeSupportSession?.supportSessionId || '',
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
            onCreateUser={async (params) => {
              let explicitUserId: string | undefined =
                params.firebaseUid?.trim() || undefined;
              if (!explicitUserId && dataMode !== 'demo' && params.password?.trim()) {
                try {
                  const provisioned = await provisionStaffAccount({
                    email: params.email,
                    password: params.password.trim(),
                    fullName: params.fullName,
                  });
                  explicitUserId = provisioned.uid;
                } catch (err: any) {
                  setLiveErrorMessage(
                    err instanceof Error
                      ? err.message
                      : 'Failed to provision staff authentication credentials.'
                  );
                  throw err;
                }
              }

              let createdUser: User;
              if (dataMode !== 'demo' && liveDataService) {
                createdUser = await liveDataService.createUserAsAdmin({
                  ...params,
                  explicitUserId,
                  adminUser: currentUser,
                });
              } else {
                const newUserId = explicitUserId || generateUniqueUserId(users);
                createdUser = {
                  id: newUserId,
                  businessId: params.businessId,
                  username: params.email.trim().toLowerCase().split('@')[0],
                  email: params.email.trim().toLowerCase(),
                  fullName: params.fullName.trim(),
                  role: params.role,
                  roleLabel:
                    params.roleLabel ||
                    (params.role === 'shop_manager' ? 'Shop Manager' : 'Cashier'),
                  assignedShopIds: params.assignedShopIds,
                  permissions: params.permissions,
                  status: 'active',
                  createdAt: getTodayYmd(),
                  lastLoginAt: 'Never (Newly Created)',
                };
              }
              setUsers((prev) => [...prev, createdUser]);

              const todayDate = getTodayYmd();
              const newAssignments: ShopAssignment[] = params.assignedShopIds.map(
                (shopId: string, idx: number) => ({
                  id: `asgn-${Date.now()}-${idx}`,
                  userId: createdUser.id,
                  businessId: params.businessId,
                  shopId,
                  assignedAt: todayDate,
                  assignedByUserId: currentUser.id,
                  isActive: true,
                })
              );
              setShopAssignments((prev) => [...prev, ...newAssignments]);
              return createdUser;
            }}
            onDeleteUser={handleDeleteStaff}
            onLinkUserFirebaseUid={async (targetUser, newFirebaseUid, reason) => {
              const cleanUid = newFirebaseUid.trim();
              if (!cleanUid || cleanUid.length < 5) {
                throw new Error('A valid Firebase Auth UID is required.');
              }

              const updatedUser: User = {
                ...targetUser,
                id: cleanUid,
                authUidLinked: true,
              };

              if (dataMode !== 'demo' && liveDataService) {
                await liveDataService.saveUserProfile(updatedUser);
                await liveDataService.recordPlatformAuditLog({
                  businessId: targetUser.businessId,
                  businessName: targetUser.businessId,
                  adminUid: currentUser.id,
                  adminEmail: currentUser.email,
                  adminName: currentUser.fullName,
                  action: 'staff_user_updated',
                  targetEntityType: 'user',
                  targetEntityId: cleanUid,
                  targetEntityName: targetUser.fullName || targetUser.email,
                  reason: reason || 'Linked Firebase Authentication UID',
                  previousState: { id: targetUser.id },
                  newState: { id: cleanUid, email: targetUser.email },
                });
              }

              setUsers((prev) => [
                ...prev.filter((u) => u.id !== targetUser.id && u.id !== cleanUid),
                updatedUser,
              ]);

              setShopAssignments((prev) =>
                prev.map((a) =>
                  a.userId === targetUser.id ? { ...a, userId: cleanUid } : a
                )
              );
            }}
            onCreateShop={handleCreateShop}
            onUpdateShop={handleUpdateShop}
            onSwitchDemoUser={handleSwitchDemoUserAnywhere}
            onSignOut={handleSignOut}
            onCreateCustomRole={handleCreateCustomRole}
            onUpdateCustomRole={handleUpdateCustomRole}
            onDeleteCustomRole={handleDeleteCustomRole}
          />
        </div>
        <AppUpdateNotificationModal />
      <PwaInstallBanner />
        <PwaInstallBanner />
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
            onChangeConnectivityState={handleConnectivityStateChange}
            onSwitchDemoUser={handleSwitchDemoUserAnywhere}
            onResetUserPassword={handleResetUserPassword}
            allDemoUsers={visibleUsersForActor}
          />
        </div>
        <AppUpdateNotificationModal />
      <PwaInstallBanner />
        <PwaInstallBanner />
      </div>
    );
  }

  // =========================================================================
  // STAGE 4: SHOP & BUSINESS WORKSPACE SHELL
  // =========================================================================
  return (
    <div className="min-h-screen h-screen h-[100dvh] bg-slate-100 flex flex-col overflow-hidden">
      {environmentBannerNode}
      {isPlatformSupportMode && activeSupportSession && (
        <div className="bg-amber-400 border-b border-amber-500 text-slate-950 px-4 py-2 flex items-center justify-between text-xs font-semibold shrink-0 shadow-sm z-30">
          <div className="flex items-center gap-2 truncate">
            <span className="px-1.5 py-0.5 rounded bg-slate-950 text-amber-300 font-mono text-[10px] uppercase tracking-wider font-bold">
              Support Mode Active
            </span>
            <span className="truncate">
              Platform Admin inspecting <strong>{activeBusiness.name}</strong> — <strong>{activeShop?.name} ({activeShop?.code})</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={handleEndSupportSession}
            className="px-3 py-1 rounded bg-slate-950 hover:bg-slate-900 text-white font-bold transition flex items-center gap-1.5 shrink-0 shadow-sm cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Exit Shop &amp; Return to Console</span>
          </button>
        </div>
      )}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <Sidebar
          activeView={safeActiveView}
          onSelectView={setActiveView}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
          activeShop={activeShop}
          currentUser={currentUser}
          onReturnToShopSelection={() => {
            if (isPlatformSupportMode) {
              handleEndSupportSession();
            } else {
              setSessionStage('shop_selection');
            }
          }}
          onSignOut={handleSignOut}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          supportMode={isPlatformSupportMode}
        />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <TopBar
            activeView={safeActiveView}
            business={activeBusiness}
            activeShop={activeShop}
            authorizedShops={authorizedShops}
            onSwitchShop={handleSwitchShopInWorkspace}
            isSwitchingShop={isSwitchingSupportShop}
            onOpenShopDirectory={() => {
              if (isPlatformSupportMode) {
                handleEndSupportSession();
              } else {
                setSessionStage('shop_selection');
              }
            }}
            currentUser={currentUser}
            allUsers={visibleUsersForActor}
            onSwitchDemoUser={handleSwitchDemoUserAnywhere}
            connectivity={connectivitySnapshot}
            onChangeConnectivityState={handleConnectivityStateChange}
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
            onTriggerSync={syncPendingSalesWithCloud}
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
                onDispatchTabItems={handleDispatchTabItems}
                onVoidTabItems={handleVoidTabItems}
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
                onDeduplicateProducts={handleDeduplicateProducts}
              />
            )}

            {safeActiveView === 'product_transfer' && (
              <ProductTransferPage
                key={`transfers-${activeShop.id}`}
                currentUser={currentUser}
                activeShop={activeShop}
                allShops={shops}
                products={products}
                transfers={transfers}
                categories={activeShopCategories}
                dataMode={dataMode}
                onInitiateTransfer={handleInitiateTransfer}
                onConfirmTransfer={handleConfirmTransfer}
                onRejectTransfer={handleRejectTransfer}
                onCancelTransfer={handleCancelTransfer}
              />
            )}

            {safeActiveView === 'expiring_products' && (
              <ExpiringProductsPage
                key={`expiring-${activeShop.id}`}
                currentUser={currentUser}
                activeShop={activeShop}
                business={activeBusiness}
                products={activeShopProducts}
                categories={activeShopCategories}
                onSaveProduct={handleSaveProduct}
                onRecordStockAdjustment={handleRecordStockAdjustment}
                onNavigateToInventory={() => setActiveView('inventory')}
              />
            )}

            {safeActiveView === 'generate_barcode' && (
              <GenerateBarcodePage
                key={`generate-barcode-${activeShop.id}`}
                business={activeBusiness}
                shop={activeShop}
                shopProducts={activeShopProducts}
                onSaveProduct={handleSaveProduct}
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
                products={activeShopProducts}
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
                onDeleteStaff={handleDeleteStaff}
                onResetUserPassword={handleResetUserPassword}
                onCreateCustomRole={handleCreateCustomRole}
                onUpdateCustomRole={handleUpdateCustomRole}
                onDeleteCustomRole={handleDeleteCustomRole}
              />
            )}

            {safeActiveView === 'payroll_employees' && (
              <PayrollEmployeesPage
                business={activeBusiness}
                shop={activeShop}
                businessUsers={businessUsers}
                employees={payrollEmployees}
                onSaveEmployee={handleSavePayrollEmployee}
                onDeleteEmployee={handleDeletePayrollEmployee}
              />
            )}

            {safeActiveView === 'payroll_payments' && (
              <PayrollPaymentsPage
                business={activeBusiness}
                shop={activeShop}
                currentUser={currentUser}
                employees={payrollEmployees}
                payrollPeriods={payrollPeriods}
                onSavePeriod={handleSavePayrollPeriod}
                onDeletePeriod={handleDeletePayrollPeriod}
                onNavigateToEmployees={() => setActiveView('payroll_employees')}
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
                onChangeConnectivityState={handleConnectivityStateChange}
                onUpdateShopSettings={handleUpdateShopSettings}
				onSavePrinterSettings={handleSavePrinterSettings}
                onUpdateBusinessCurrency={handleUpdateBusinessCurrency}
                onUpdateUserPermissions={handleUpdateUserPermissions}
                onResetUserPassword={handleResetUserPassword}
              />
            )}
          </main>
        </div>
      </div>
      <AppUpdateNotificationModal />
      <PwaInstallBanner />
    </div>
  );
}
