import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Building2,
  Plus,
  Search,
  ShieldCheck,
  Store,
  UserCheck,
  Edit3,
  Eye,
  EyeOff,
  Power,
  AlertCircle,
  CheckCircle2,
  LogOut,
  X,
  Mail,
  Phone,
  MapPin,
  Lock,
  Key,
  Users,
  UserPlus,
  ArrowRight,
  Wrench,
  Send,
  RefreshCw,
  BarChart3,
  TrendingUp,
  DollarSign,
  Package,
  ShoppingCart,
  Calendar,
  Clock,
  Filter,
  AlertTriangle,
  ShieldAlert,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  FileText,
  Settings,
  BadgePercent,
  History,
  Briefcase,
  SlidersHorizontal,
  Image as ImageIcon,
  Upload,
  Trash2,
  Sparkles,
} from 'lucide-react';
import {
  Business,
  BusinessStatus,
  BusinessType,
  BusinessSubscription,
  BusinessWorkspaceTab,
  ConnectivitySnapshot,
  ConnectivityState,
  CustomRole,
  GlobalSalesDateRange,
  PermissionKey,
  PlatformAdminAuditLog,
  PlatformAdminSection,
  Product,
  SaleTransaction,
  Shop,
  StockAdjustment,
  StockAdjustmentType,
  SubscriptionStatus,
  SubscriptionTier,
  User,
  UserRole,
} from '../types/pos';
import {
  SMARTMIND_LOGO_URL,
  SMARTMIND_FALLBACK_LOGO_URL,
} from '../constants/branding';
import {
  CreateBusinessInput,
  CreateCustomRoleInput,
  getAdminPageBusinessOwners,
  getVisibleUsersForActor,
  resolveBusinessOwnerAuthState,
  validateBusinessRegistrationInput,
} from '../utils/posCalculations';
import { ConnectivityStatusControl } from '../components/layout/ConnectivityStatusControl';
import {
  DataEnvironmentMode,
  RepairLiveBusinessOwnerAuthResult,
  SendOwnerPasswordSetupEmailResult,
} from '../services/liveFirestoreDataService';
import {
  firebaseConfig,
  callSyncPlatformAdminClaims,
  callGrantPlatformAdminRole,
} from '../firebase';
import type {
  PlatformAdminSupportSessionResponse,
} from '../firebase';
import {
  validateLogoFile,
  getCachedOfflineLogo,
  getCleanBrandInitials,
  resolveDocumentIdentity,
  BRANDING_UPLOAD_CONSTRAINTS,
} from '../utils/brandingHierarchy';
import {
  uploadLogoToCloudStorage,
  deleteLogoFromCloudStorage,
} from '../services/brandingStorageService';

export interface PlatformAdminPageProps {
  currentUser: User;
  businesses: Business[];
  shops: Shop[];
  users: User[];
  products?: Product[];
  sales?: SaleTransaction[];
  stockAdjustments?: StockAdjustment[];
  auditLogs?: PlatformAdminAuditLog[];
  subscriptions?: BusinessSubscription[];
  customRoles?: CustomRole[];
  dataMode?: DataEnvironmentMode;
  firestoreDatabaseId?: string;
  connectivity: ConnectivitySnapshot;
  onChangeConnectivityState: (state: ConnectivityState) => void;
  onCreateBusiness: (input: CreateBusinessInput) => Business | Promise<Business>;
  onUpdateBusiness: (
    businessId: string,
    input: CreateBusinessInput
  ) => void | Promise<void>;
  onToggleBusinessStatus: (
    businessId: string,
    nextStatus: BusinessStatus,
    reason?: string
  ) => void | Promise<void>;
  onResetUserPassword?: (userId: string, newPassword: string) => Promise<void> | void;
  onRepairBusinessOwnerAuth?: (
    business: Business,
    ownerUser?: User
  ) => Promise<RepairLiveBusinessOwnerAuthResult>;
  onSendOwnerPasswordSetupEmail?: (
    ownerUser: User,
    business?: Business,
    options?: { skipEmailDispatch?: boolean }
  ) => Promise<SendOwnerPasswordSetupEmailResult>;
  onAdjustInventory?: (params: {
    businessId: string;
    shopId: string;
    productId: string;
    delta: number;
    type: StockAdjustmentType;
    reason: string;
  }) => Promise<void> | void;
  onUpdateSaleStatus?: (params: {
    businessId: string;
    shopId: string;
    saleId: string;
    nextStatus: 'refunded' | 'voided';
    reason: string;
  }) => Promise<void> | void;
  onToggleUserStatus?: (params: {
    userId: string;
    status: 'active' | 'suspended';
    reason: string;
  }) => Promise<void> | void;
  onUpdateUserRoleAndShops?: (params: {
    userId: string;
    role: UserRole;
    roleLabel?: string;
    assignedShopIds: string[];
    permissions?: PermissionKey[];
    reason: string;
  }) => Promise<void> | void;
  onCreateShop?: (input: {
    businessId: string;
    code: string;
    name: string;
    category: Shop['category'];
    locationCity: string;
    address: string;
    phone: string;
    managerName: string;
    taxRatePercent: number;
  }) => Promise<Shop> | Shop;
  onUpdateShop?: (
    shopId: string,
    updates: Partial<Shop>
  ) => Promise<void> | void;
  onUpdateSubscription?: (sub: BusinessSubscription) => Promise<void> | void;
  onRecordAuditLog?: (
    log: Omit<PlatformAdminAuditLog, 'id' | 'createdAt'>
  ) => Promise<void> | void;
    // Platform Admin Support Mode
  activeSupportSession?: PlatformAdminSupportSessionResponse | null;
  onStartSupportSession?: (
    businessId: string,
    shopId: string
  ) => Promise<PlatformAdminSupportSessionResponse>;
  onEndSupportSession?: () => Promise<void>;
  onCreateUser?: (params: {
    businessId: string;
    fullName: string;
    email: string;
    password?: string;
    role: UserRole;
    roleLabel?: string;
    assignedShopIds: string[];
    permissions: PermissionKey[];
    reason?: string;
  }) => Promise<User> | User;
  onSwitchDemoUser: (userId: string) => void;
  onSignOut: () => void;
  onCreateCustomRole?: (input: CreateCustomRoleInput) => CustomRole;
  onUpdateCustomRole?: (roleId: string, input: CreateCustomRoleInput) => void;
  onDeleteCustomRole?: (roleId: string) => { success: boolean; error?: string };
}

const BUSINESS_TYPES: BusinessType[] = [
  'Supermarket & Grocery Chain',
  'Pharmacy & Healthcare Retail',
  'Department & General Retail',
  'Restaurant, Bakery & Hospitality',
  'Specialty & Convenience Stores',
];

export const PlatformAdminPage: React.FC<PlatformAdminPageProps> = ({
  currentUser,
  businesses,
  shops,
  users,
  products = [],
  sales = [],
  stockAdjustments = [],
  auditLogs = [],
  subscriptions = [],
  customRoles = [],
  dataMode = 'live',
  firestoreDatabaseId = firebaseConfig.firestoreDatabaseId,
  activeSupportSession = null,
  onStartSupportSession,
  onEndSupportSession,
  connectivity,
  onChangeConnectivityState,
  onCreateBusiness,
  onUpdateBusiness,
  onToggleBusinessStatus,
  onResetUserPassword,
  onRepairBusinessOwnerAuth,
  onSendOwnerPasswordSetupEmail,
  onAdjustInventory,
  onUpdateSaleStatus,
  onToggleUserStatus,
  onUpdateUserRoleAndShops,
  onCreateUser,
  onCreateShop,
  onUpdateShop,
  onUpdateSubscription,
  onRecordAuditLog,
  onSwitchDemoUser,
  onSignOut,
  onCreateCustomRole,
  onUpdateCustomRole,
  onDeleteCustomRole,
}) => {
  const isDemoMode = dataMode === 'demo';

  // Navigation State
  const [activeSection, setActiveSection] =
    useState<PlatformAdminSection>('overview');
  const [selectedWorkspaceBizId, setSelectedWorkspaceBizId] = useState<string>(
    businesses[0]?.id || ''
  );
  const [workspaceTab, setWorkspaceTab] =
    useState<BusinessWorkspaceTab>('overview');

  // Branding Management State
  const [adminSelectedShopId, setAdminSelectedShopId] = useState<string>('');
  const [adminBrandingSaving, setAdminBrandingSaving] = useState<boolean>(false);
  const [adminBrandingError, setAdminBrandingError] = useState<string | null>(null);

  // Platform Admin Custom Claims (Digital Keycard) State
  const [syncingClaims, setSyncingClaims] = useState<boolean>(false);
  const [claimsActionEmail, setClaimsActionEmail] = useState<string>('');
  const [claimsActionLoading, setClaimsActionLoading] = useState<boolean>(false);
  const [claimsFeedback, setClaimsFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleSyncMyClaims = async () => {
    setSyncingClaims(true);
    setClaimsFeedback(null);
    try {
      const res = await callSyncPlatformAdminClaims({});
      setClaimsFeedback({
        type: 'success',
        message: res.data.message || 'Platform administrator keycard claim applied to your session.',
      });
    } catch (err: any) {
      setClaimsFeedback({
        type: 'error',
        message: err?.message || 'Failed to sync admin keycard claims.',
      });
    } finally {
      setSyncingClaims(false);
    }
  };

  const handleToggleAdminRole = async (enabled: boolean) => {
    if (!claimsActionEmail.trim()) {
      setClaimsFeedback({
        type: 'error',
        message: 'Please enter a valid user email address.',
      });
      return;
    }
    setClaimsActionLoading(true);
    setClaimsFeedback(null);
    try {
      const res = await callGrantPlatformAdminRole({
        targetEmail: claimsActionEmail.trim(),
        enabled,
      });
      setClaimsFeedback({
        type: 'success',
        message: res.data.message,
      });
      setClaimsActionEmail('');
    } catch (err: any) {
      setClaimsFeedback({
        type: 'error',
        message: err?.message || 'Failed to update admin role.',
      });
    } finally {
      setClaimsActionLoading(false);
    }
  };

  // Tab Navigation Scroll Controls
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState<boolean>(false);
  const [canScrollRight, setCanScrollRight] = useState<boolean>(false);

  const checkTabScroll = () => {
    const el = tabsContainerRef.current;
    if (el) {
      setCanScrollLeft(el.scrollLeft > 6);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 6);
    }
  };

  useEffect(() => {
    checkTabScroll();
    window.addEventListener('resize', checkTabScroll);
    return () => window.removeEventListener('resize', checkTabScroll);
  }, [businesses.length, shops.length]);

  const handleScrollTabs = (direction: 'left' | 'right') => {
    if (tabsContainerRef.current) {
      tabsContainerRef.current.scrollBy({
        left: direction === 'left' ? -260 : 260,
        behavior: 'smooth',
      });
      setTimeout(checkTabScroll, 320);
    }
  };

  // Ensure workspace selection defaults to a valid business
  useEffect(() => {
    if (!selectedWorkspaceBizId && businesses.length > 0) {
      setSelectedWorkspaceBizId(businesses[0].id);
    }
  }, [businesses, selectedWorkspaceBizId]);

  const activeWorkspaceBusiness = useMemo(() => {
    return (
      businesses.find((b) => b.id === selectedWorkspaceBizId) ||
      businesses[0] ||
      null
    );
  }, [businesses, selectedWorkspaceBizId]);

  // UI Banner & Flash Feedback
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const [supportActionBusy, setSupportActionBusy] =
  useState(false);

  const showFeedback = (
    type: 'success' | 'error' | 'info',
    message: string
  ) => {
    setFeedbackBanner({ type, message });
    setTimeout(() => setFeedbackBanner(null), 6000);
  };

  // Local state fallbacks for audits & subscriptions if not externally provided
  const [localAuditLogs, setLocalAuditLogs] = useState<PlatformAdminAuditLog[]>(
    () => (auditLogs && auditLogs.length > 0 ? auditLogs : [])
  );

  const [localSubscriptions, setLocalSubscriptions] = useState<
    BusinessSubscription[]
  >(() => {
    if (subscriptions.length > 0) return subscriptions;
    return businesses.map((b, idx) => ({
      businessId: b.id,
      businessName: b.name,
      tier: (idx === 0 ? 'enterprise' : 'professional') as SubscriptionTier,
      status: 'active' as SubscriptionStatus,
      maxShops: idx === 0 ? 10 : 3,
      maxUsers: idx === 0 ? 50 : 15,
      monthlyFeeNaira: idx === 0 ? 75000 : 35000,
      startDate: b.createdAt || '2026-01-01',
      renewalDate: '2026-12-31',
      gracePeriodDays: 14,
      notes: 'Active standard commercial license',
    }));
  });

  // Keep local subscriptions in sync with incoming businesses
  useEffect(() => {
    setLocalSubscriptions((prev) => {
      const existingMap = new Map(prev.map((s) => [s.businessId, s]));
      return businesses.map((b, idx) => {
        if (existingMap.has(b.id)) return existingMap.get(b.id)!;
        return {
          businessId: b.id,
          businessName: b.name,
          tier: 'standard',
          status: 'active',
          maxShops: 3,
          maxUsers: 15,
          monthlyFeeNaira: 25000,
          startDate: b.createdAt || new Date().toISOString().slice(0, 10),
          renewalDate: '2026-12-31',
          gracePeriodDays: 14,
          notes: 'Standard provisioning license',
        };
      });
    });
  }, [businesses]);

  // Keep local audit logs in sync with incoming props
  useEffect(() => {
    if (auditLogs && auditLogs.length > 0) {
      setLocalAuditLogs(auditLogs);
    }
  }, [auditLogs]);

  const addAuditLog = (
    log: Omit<PlatformAdminAuditLog, 'id' | 'createdAt'>
  ) => {
    const fullLog: PlatformAdminAuditLog = {
      ...log,
      id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    setLocalAuditLogs((prev) => [fullLog, ...prev]);
    if (onRecordAuditLog) {
      onRecordAuditLog(log);
    }
  };

  // -------------------------------------------------------------
  // Filter States
  // -------------------------------------------------------------
  // Businesses Filter
  const [bizSearchQuery, setBizSearchQuery] = useState('');
  const [bizStatusFilter, setBizStatusFilter] = useState<'all' | BusinessStatus>(
    'all'
  );
  const [bizTypeFilter, setBizTypeFilter] = useState<string>('all');

  // Shops Filter
  const [shopSearchQuery, setShopSearchQuery] = useState('');
  const [shopBizFilter, setShopBizFilter] = useState<string>('all');
  const [shopStatusFilter, setShopStatusFilter] = useState<string>('all');

  // Sales Filter
  const [salesDatePreset, setSalesDatePreset] =
    useState<GlobalSalesDateRange>('last_30_days');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [salesBizFilter, setSalesBizFilter] = useState<string>('all');
  const [salesShopFilter, setSalesShopFilter] = useState<string>('all');
  const [salesPaymentFilter, setSalesPaymentFilter] = useState<string>('all');
  const [salesStatusFilter, setSalesStatusFilter] = useState<string>('all');
  const [salesSearchQuery, setSalesSearchQuery] = useState('');

  // Inventory Filter
  const [invSearchQuery, setInvSearchQuery] = useState('');
  const [invBizFilter, setInvBizFilter] = useState<string>('all');
  const [invShopFilter, setInvShopFilter] = useState<string>('all');
  const [invStockStatusFilter, setInvStockStatusFilter] = useState<
    'all' | 'in_stock' | 'low_stock' | 'out_of_stock'
  >('all');

  // Users Filter
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
  const [userBizFilter, setUserBizFilter] = useState<string>('all');
  const [userStatusFilter, setUserStatusFilter] = useState<string>('all');

  // Audit Logs Filter
  const [auditBizFilter, setAuditBizFilter] = useState<string>('all');
  const [auditActionFilter, setAuditActionFilter] = useState<string>('all');
  const [auditSearchQuery, setAuditSearchQuery] = useState('');

  // -------------------------------------------------------------
  // Modals & Action Confirmation States
  // -------------------------------------------------------------
  // 1. Business Register / Edit Modal
  const [businessModalOpen, setBusinessModalOpen] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState<Business | null>(null);
  const [showOwnerPassword, setShowOwnerPassword] = useState(false);
  const [businessForm, setBusinessForm] = useState<CreateBusinessInput>({
    name: '',
    legalName: '',
    businessType: 'Supermarket & Grocery Chain',
    registrationNumber: '',
    taxIdentificationNumber: '',
    ownerName: '',
    ownerEmail: '',
    ownerPassword: '',
    contactEmail: '',
    primaryPhone: '',
    headquartersAddress: '',
    currencyCode: 'NGN',
    currencySymbol: '₦',
    defaultTaxRatePercent: 7.5,
    status: 'active',
    notes: '',
  });

  // 2. Reason-Required Confirmation Modal (Generic for sensitive actions)
  const [reasonModal, setReasonModal] = useState<{
    open: boolean;
    title: string;
    description: string;
    targetName: string;
    actionType:
      | 'suspend_business'
      | 'activate_business'
      | 'disable_user'
      | 'enable_user'
      | 'void_sale'
      | 'refund_sale'
      | 'adjust_inventory';
    metadata: Record<string, any>;
    reasonText: string;
    loading: boolean;
    error: string | null;
  }>({
    open: false,
    title: '',
    description: '',
    targetName: '',
    actionType: 'suspend_business',
    metadata: {},
    reasonText: '',
    loading: false,
    error: null,
  });

  // 3. Inspect Modal (Business, Sale, User)
  const [inspectBusiness, setInspectBusiness] = useState<Business | null>(null);
  const [inspectSale, setInspectSale] = useState<SaleTransaction | null>(null);
  const [inspectAuditLog, setInspectAuditLog] =
    useState<PlatformAdminAuditLog | null>(null);

  // 4. Shop Management Modals
  const [shopModalOpen, setShopModalOpen] = useState(false);
  const [editingShop, setEditingShop] = useState<Shop | null>(null);
  const [shopForm, setShopForm] = useState({
    businessId: selectedWorkspaceBizId,
    code: '',
    name: '',
    category: 'Supermarket' as Shop['category'],
    locationCity: 'Lagos',
    address: '',
    phone: '',
    managerName: '',
    taxRatePercent: 7.5,
  });

  // 5. User Edit Role & Shops Modal
  const [editUserModalOpen, setEditUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [passwordModalUser, setPasswordModalUser] = useState<User | null>(null);
  const [newPasswordVal, setNewPasswordVal] = useState('');
  const [showNewPasswordVal, setShowNewPasswordVal] = useState(false);
  const [passwordModalLoading, setPasswordModalLoading] = useState(false);
  const [userRoleForm, setUserRoleForm] = useState<{
    role: UserRole;
    roleLabel: string;
    assignedShopIds: string[];
    status: 'active' | 'suspended';
    reason: string;
  }>({
    role: 'cashier',
    roleLabel: 'Cashier',
    assignedShopIds: [],
    status: 'active',
    reason: '',
  });

  // 5b. Create User Modal
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [createUserBusy, setCreateUserBusy] = useState(false);
  const [showCreateUserPassword, setShowCreateUserPassword] = useState(false);
  const [createUserForm, setCreateUserForm] = useState<{
    fullName: string;
    email: string;
    password?: string;
    role: UserRole;
    roleLabel: string;
    assignedShopIds: string[];
    permissions: PermissionKey[];
    reason: string;
  }>({
    fullName: '',
    email: '',
    password: '',
    role: 'shop_manager',
    roleLabel: 'Shop Manager',
    assignedShopIds: [],
    permissions: [
      'process_sales',
      'manage_products',
      'adjust_inventory',
      'process_returns',
      'process_refunds',
      'view_shop_reports',
    ],
    reason: '',
  });

  // 6. Manage Subscription Modal
  const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false);
  const [editingSubscription, setEditingSubscription] =
    useState<BusinessSubscription | null>(null);
  const [subscriptionForm, setSubscriptionForm] = useState({
    tier: 'standard' as SubscriptionTier,
    status: 'active' as SubscriptionStatus,
    maxShops: 3,
    maxUsers: 15,
    monthlyFeeNaira: 25000,
    renewalDate: '2026-12-31',
    gracePeriodDays: 14,
    notes: '',
  });

  // 7. Inventory Adjustment Modal
  const [invAdjustModalOpen, setInvAdjustModalOpen] = useState(false);
  const [adjustingProduct, setAdjustingProduct] = useState<{
    product: Product;
    businessName: string;
    shopName: string;
  } | null>(null);
  const [invAdjustForm, setInvAdjustForm] = useState<{
    type: StockAdjustmentType;
    delta: number;
    reason: string;
  }>({
    type: 'audit_correction',
    delta: 0,
    reason: '',
  });

  // -------------------------------------------------------------
  // Data Filtering & Analytics Calculations
  // -------------------------------------------------------------

  // Filtered Businesses
  const filteredBusinesses = useMemo(() => {
    return businesses.filter((b) => {
      const matchesSearch =
        !bizSearchQuery.trim() ||
        b.name.toLowerCase().includes(bizSearchQuery.toLowerCase()) ||
        b.legalName.toLowerCase().includes(bizSearchQuery.toLowerCase()) ||
        b.ownerName.toLowerCase().includes(bizSearchQuery.toLowerCase()) ||
        b.ownerEmail.toLowerCase().includes(bizSearchQuery.toLowerCase()) ||
        b.registrationNumber.toLowerCase().includes(bizSearchQuery.toLowerCase());
      const matchesStatus =
        bizStatusFilter === 'all' || b.status === bizStatusFilter;
      const matchesType =
        bizTypeFilter === 'all' || b.businessType === bizTypeFilter;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [businesses, bizSearchQuery, bizStatusFilter, bizTypeFilter]);

  // Filtered Shops
  const filteredShops = useMemo(() => {
    return shops.filter((s) => {
      const biz = businesses.find((b) => b.id === s.businessId);
      const matchesSearch =
        !shopSearchQuery.trim() ||
        s.name.toLowerCase().includes(shopSearchQuery.toLowerCase()) ||
        s.code.toLowerCase().includes(shopSearchQuery.toLowerCase()) ||
        s.locationCity.toLowerCase().includes(shopSearchQuery.toLowerCase()) ||
        s.managerName.toLowerCase().includes(shopSearchQuery.toLowerCase()) ||
        (biz && biz.name.toLowerCase().includes(shopSearchQuery.toLowerCase()));
      const matchesBiz =
        shopBizFilter === 'all' || s.businessId === shopBizFilter;
      const matchesStatus =
        shopStatusFilter === 'all' || s.status === shopStatusFilter;
      return matchesSearch && matchesBiz && matchesStatus;
    });
  }, [shops, businesses, shopSearchQuery, shopBizFilter, shopStatusFilter]);

  // Date Filtering Helper
  const isDateInRange = (dateStr: string) => {
    if (!dateStr) return false;
    const txDate = new Date(dateStr);
    const now = new Date();

    if (salesDatePreset === 'today') {
      return txDate.toDateString() === now.toDateString();
    }
    if (salesDatePreset === 'yesterday') {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return txDate.toDateString() === yesterday.toDateString();
    }
    if (salesDatePreset === 'last_7_days') {
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 7);
      return txDate >= cutoff;
    }
    if (salesDatePreset === 'last_30_days') {
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 30);
      return txDate >= cutoff;
    }
    if (salesDatePreset === 'this_month') {
      return (
        txDate.getFullYear() === now.getFullYear() &&
        txDate.getMonth() === now.getMonth()
      );
    }
    if (salesDatePreset === 'prev_month') {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return (
        txDate.getFullYear() === prev.getFullYear() &&
        txDate.getMonth() === prev.getMonth()
      );
    }
    if (salesDatePreset === 'custom') {
      if (customStartDate && txDate < new Date(customStartDate)) return false;
      if (customEndDate) {
        const end = new Date(customEndDate);
        end.setHours(23, 59, 59, 999);
        if (txDate > end) return false;
      }
      return true;
    }
    return true;
  };

  // Filtered Sales
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      const matchesDate = isDateInRange(s.createdAt);
      const matchesBiz =
        salesBizFilter === 'all' || s.businessId === salesBizFilter;
      const matchesShop =
        salesShopFilter === 'all' || s.shopId === salesShopFilter;
      const matchesPayment =
        salesPaymentFilter === 'all' || s.paymentMethod === salesPaymentFilter;
      const matchesStatus =
        salesStatusFilter === 'all' || s.status === salesStatusFilter;
      const matchesSearch =
        !salesSearchQuery.trim() ||
        s.receiptNumber.toLowerCase().includes(salesSearchQuery.toLowerCase()) ||
        s.cashierName.toLowerCase().includes(salesSearchQuery.toLowerCase()) ||
        s.terminalId.toLowerCase().includes(salesSearchQuery.toLowerCase());
      return (
        matchesDate &&
        matchesBiz &&
        matchesShop &&
        matchesPayment &&
        matchesStatus &&
        matchesSearch
      );
    });
  }, [
    sales,
    salesDatePreset,
    customStartDate,
    customEndDate,
    salesBizFilter,
    salesShopFilter,
    salesPaymentFilter,
    salesStatusFilter,
    salesSearchQuery,
  ]);

  // Sales Analytics Metrics
  const salesMetrics = useMemo(() => {
    let totalValue = 0;
    let cashValue = 0;
    let cardValue = 0;
    let transferValue = 0;
    let creditValue = 0;

    const bizSalesMap: Record<string, { count: number; value: number }> = {};
    const shopSalesMap: Record<string, { count: number; value: number }> = {};

    for (const s of filteredSales) {
      const amt = s.totalAmount || 0;
      totalValue += amt;

      if (s.paymentMethod === 'cash') cashValue += amt;
      else if (s.paymentMethod === 'pos_card') cardValue += amt;
      else if (s.paymentMethod === 'bank_transfer') transferValue += amt;
      else if (s.paymentMethod === 'credit') creditValue += amt;
      else cashValue += amt;

      if (!bizSalesMap[s.businessId]) {
        bizSalesMap[s.businessId] = { count: 0, value: 0 };
      }
      bizSalesMap[s.businessId].count += 1;
      bizSalesMap[s.businessId].value += amt;

      if (!shopSalesMap[s.shopId]) {
        shopSalesMap[s.shopId] = { count: 0, value: 0 };
      }
      shopSalesMap[s.shopId].count += 1;
      shopSalesMap[s.shopId].value += amt;
    }

    const txCount = filteredSales.length;
    const avgTxValue = txCount > 0 ? totalValue / txCount : 0;

    const topBusinesses = Object.entries(bizSalesMap)
      .map(([bId, stat]) => {
        const b = businesses.find((biz) => biz.id === bId);
        return {
          id: bId,
          name: b?.name || bId,
          count: stat.count,
          value: stat.value,
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const topShops = Object.entries(shopSalesMap)
      .map(([sId, stat]) => {
        const sh = shops.find((shop) => shop.id === sId);
        const biz = businesses.find((b) => b.id === sh?.businessId);
        return {
          id: sId,
          name: sh?.name || sId,
          businessName: biz?.name || 'Unknown',
          count: stat.count,
          value: stat.value,
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return {
      totalValue,
      txCount,
      avgTxValue,
      cashValue,
      cardValue,
      transferValue,
      creditValue,
      topBusinesses,
      topShops,
    };
  }, [filteredSales, businesses, shops]);

  // Filtered Products / Inventory
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const biz = businesses.find((b) => b.id === p.businessId);
      const sh = shops.find((s) => s.id === p.shopId);
      const matchesSearch =
        !invSearchQuery.trim() ||
        p.name.toLowerCase().includes(invSearchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(invSearchQuery.toLowerCase()) ||
        p.barcode.toLowerCase().includes(invSearchQuery.toLowerCase()) ||
        (biz && biz.name.toLowerCase().includes(invSearchQuery.toLowerCase())) ||
        (sh && sh.name.toLowerCase().includes(invSearchQuery.toLowerCase()));
      const matchesBiz = invBizFilter === 'all' || p.businessId === invBizFilter;
      const matchesShop = invShopFilter === 'all' || p.shopId === invShopFilter;

      let matchesStock = true;
      if (invStockStatusFilter === 'in_stock') {
        matchesStock = p.stockQuantity > p.reorderLevel;
      } else if (invStockStatusFilter === 'low_stock') {
        matchesStock =
          p.stockQuantity <= p.reorderLevel && p.stockQuantity > 0;
      } else if (invStockStatusFilter === 'out_of_stock') {
        matchesStock = p.stockQuantity <= 0;
      }

      return matchesSearch && matchesBiz && matchesShop && matchesStock;
    });
  }, [
    products,
    businesses,
    shops,
    invSearchQuery,
    invBizFilter,
    invShopFilter,
    invStockStatusFilter,
  ]);

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const biz = businesses.find((b) => b.id === u.businessId);
      const matchesSearch =
        !userSearchQuery.trim() ||
        u.fullName.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
        u.username.toLowerCase().includes(userSearchQuery.toLowerCase());
      const matchesRole =
        userRoleFilter === 'all' || u.role === userRoleFilter;
      const matchesBiz =
        userBizFilter === 'all' || u.businessId === userBizFilter;
      const matchesStatus =
        userStatusFilter === 'all' || u.status === userStatusFilter;
      return matchesSearch && matchesRole && matchesBiz && matchesStatus;
    });
  }, [
    users,
    businesses,
    userSearchQuery,
    userRoleFilter,
    userBizFilter,
    userStatusFilter,
  ]);

  // Filtered Audit Logs
  const filteredAuditLogs = useMemo(() => {
    return localAuditLogs.filter((l) => {
      const matchesBiz =
        auditBizFilter === 'all' || l.businessId === auditBizFilter;
      const matchesAction =
        auditActionFilter === 'all' || l.action === auditActionFilter;
      const matchesSearch =
        !auditSearchQuery.trim() ||
        l.reason.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
        l.adminName.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
        l.adminEmail.toLowerCase().includes(auditSearchQuery.toLowerCase()) ||
        l.targetEntityName
          .toLowerCase()
          .includes(auditSearchQuery.toLowerCase()) ||
        l.businessName.toLowerCase().includes(auditSearchQuery.toLowerCase());
      return matchesBiz && matchesAction && matchesSearch;
    });
  }, [localAuditLogs, auditBizFilter, auditActionFilter, auditSearchQuery]);

  // Platform Global Totals
  const platformOverview = useMemo(() => {
    const totalBiz = businesses.length;
    const activeBiz = businesses.filter((b) => b.status === 'active').length;
    const suspendedBiz = businesses.filter((b) => b.status === 'suspended').length;
    const totalShops = shops.length;
    const totalOwners = users.filter((u) => u.role === 'business_owner').length;
    const totalStaff = users.filter((u) =>
      ['shop_manager', 'cashier'].includes(u.role)
    ).length;
    const totalSalesCount = sales.length;
    const totalSalesVolume = sales.reduce(
      (sum, s) => sum + (s.totalAmount || 0),
      0
    );
    const totalProducts = products.length;

    return {
      totalBiz,
      activeBiz,
      suspendedBiz,
      totalShops,
      totalOwners,
      totalStaff,
      totalSalesCount,
      totalSalesVolume,
      totalProducts,
    };
  }, [businesses, shops, users, sales, products]);

  // -------------------------------------------------------------
  // Workspace-Specific Entities
  // -------------------------------------------------------------
  const workspaceShops = useMemo(() => {
    if (!activeWorkspaceBusiness) return [];
    return shops.filter((s) => s.businessId === activeWorkspaceBusiness.id);
  }, [shops, activeWorkspaceBusiness]);

  const workspaceUsers = useMemo(() => {
    if (!activeWorkspaceBusiness) return [];
    return users.filter((u) => u.businessId === activeWorkspaceBusiness.id);
  }, [users, activeWorkspaceBusiness]);

  const workspaceSales = useMemo(() => {
    if (!activeWorkspaceBusiness) return [];
    return sales.filter((s) => s.businessId === activeWorkspaceBusiness.id);
  }, [sales, activeWorkspaceBusiness]);

  const workspaceProducts = useMemo(() => {
    if (!activeWorkspaceBusiness) return [];
    return products.filter((p) => p.businessId === activeWorkspaceBusiness.id);
  }, [products, activeWorkspaceBusiness]);

  const workspaceOwner = useMemo(() => {
    if (!activeWorkspaceBusiness) return null;
    return (
      users.find((u) => u.id === activeWorkspaceBusiness.ownerUserId) ||
      users.find(
        (u) =>
          u.businessId === activeWorkspaceBusiness.id &&
          u.role === 'business_owner'
      ) ||
      null
    );
  }, [users, activeWorkspaceBusiness]);

  // -------------------------------------------------------------
  // Action Handlers
  // -------------------------------------------------------------

  // Platform Admin Business Logo Upload
  const handleAdminUploadBusinessLogo = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !activeWorkspaceBusiness) return;
    setAdminBrandingError(null);

    const validation = validateLogoFile(file);
    if (!validation.valid) {
      setAdminBrandingError(validation.error || 'Invalid logo image file.');
      return;
    }

    setAdminBrandingSaving(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        const res = await uploadLogoToCloudStorage({
          businessId: activeWorkspaceBusiness.id,
          dataUrl,
          mimeType: file.type,
        });

        if (!res.success) {
          setAdminBrandingError(res.error || 'Failed to upload business logo.');
          setAdminBrandingSaving(false);
          return;
        }

        await onUpdateBusiness(activeWorkspaceBusiness.id, {
          ...activeWorkspaceBusiness,
          logoUrl: res.logoUrl,
        });

        addAuditLog({
          businessId: activeWorkspaceBusiness.id,
          businessName: activeWorkspaceBusiness.name,
          adminUid: currentUser.id,
          adminEmail: currentUser.email,
          adminName: currentUser.fullName,
          action: 'business_profile_updated',
          targetEntityType: 'business',
          targetEntityId: activeWorkspaceBusiness.id,
          targetEntityName: activeWorkspaceBusiness.name,
          reason: 'Platform Admin uploaded business logo to Cloud Storage',
        });

        showFeedback(
          'success',
          `Business logo for "${activeWorkspaceBusiness.name}" updated successfully.`
        );
        setAdminBrandingSaving(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setAdminBrandingError(
        err?.message || 'Failed to process business logo.'
      );
      setAdminBrandingSaving(false);
    }
  };

  // Platform Admin Business Logo Deletion
  const handleAdminDeleteBusinessLogo = async () => {
    if (!activeWorkspaceBusiness) return;
    setAdminBrandingSaving(true);
    setAdminBrandingError(null);
    try {
      const deleteResult = await deleteLogoFromCloudStorage(
  activeWorkspaceBusiness.id
);

if (!deleteResult) {
  setAdminBrandingError(
    'Cloud deletion failed. The existing business logo has been preserved. Please check Storage permissions or connectivity and try again.'
  );
  return;
}
      await onUpdateBusiness(activeWorkspaceBusiness.id, {
        ...activeWorkspaceBusiness,
        logoUrl: '',
      });

      addAuditLog({
        businessId: activeWorkspaceBusiness.id,
        businessName: activeWorkspaceBusiness.name,
        adminUid: currentUser.id,
        adminEmail: currentUser.email,
        adminName: currentUser.fullName,
        action: 'business_profile_updated',
        targetEntityType: 'business',
        targetEntityId: activeWorkspaceBusiness.id,
        targetEntityName: activeWorkspaceBusiness.name,
        reason: 'Platform Admin deleted business logo from Cloud Storage',
      });

      showFeedback(
        'success',
        `Business logo for "${activeWorkspaceBusiness.name}" removed.`
      );
    } catch (err: any) {
      setAdminBrandingError(err?.message || 'Failed to delete business logo.');
    } finally {
      setAdminBrandingSaving(false);
    }
  };

  // Platform Admin Shop Logo Upload
  const handleAdminUploadShopLogo = async (
    shopId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !activeWorkspaceBusiness) return;
    setAdminBrandingError(null);

    const targetShop = workspaceShops.find((s) => s.id === shopId);
    if (!targetShop) return;

    const validation = validateLogoFile(file);
    if (!validation.valid) {
      setAdminBrandingError(validation.error || 'Invalid logo image file.');
      return;
    }

    setAdminBrandingSaving(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        const res = await uploadLogoToCloudStorage({
          businessId: activeWorkspaceBusiness.id,
          shopId: targetShop.id,
          dataUrl,
          mimeType: file.type,
        });

        if (!res.success) {
          setAdminBrandingError(res.error || 'Failed to upload shop logo.');
          setAdminBrandingSaving(false);
          return;
        }

        if (onUpdateShop) {
          await onUpdateShop(targetShop.id, { logoUrl: res.logoUrl });
        }

        addAuditLog({
          businessId: activeWorkspaceBusiness.id,
          businessName: activeWorkspaceBusiness.name,
          shopId: targetShop.id,
          shopName: targetShop.name,
          adminUid: currentUser.id,
          adminEmail: currentUser.email,
          adminName: currentUser.fullName,
          action: 'shop_updated',
          targetEntityType: 'shop',
          targetEntityId: targetShop.id,
          targetEntityName: targetShop.name,
          reason: 'Platform Admin uploaded shop logo to Cloud Storage',
        });

        showFeedback(
          'success',
          `Shop logo for "${targetShop.name}" updated successfully.`
        );
        setAdminBrandingSaving(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setAdminBrandingError(err?.message || 'Failed to process shop logo.');
      setAdminBrandingSaving(false);
    }
  };

  // Platform Admin Shop Logo Deletion
  const handleAdminDeleteShopLogo = async (shopId: string) => {
    if (!activeWorkspaceBusiness) return;
    const targetShop = workspaceShops.find((s) => s.id === shopId);
    if (!targetShop) return;

    setAdminBrandingSaving(true);
    setAdminBrandingError(null);
    try {
      const deleteResult = await deleteLogoFromCloudStorage(
  activeWorkspaceBusiness.id,
  targetShop.id
);

if (!deleteResult) {
  setAdminBrandingError(
    'Cloud deletion failed. The existing shop logo has been preserved. Please check Storage permissions or connectivity and try again.'
  );
  return;
}
      if (onUpdateShop) {
        await onUpdateShop(targetShop.id, { logoUrl: '' });
      }

      addAuditLog({
        businessId: activeWorkspaceBusiness.id,
        businessName: activeWorkspaceBusiness.name,
        shopId: targetShop.id,
        shopName: targetShop.name,
        adminUid: currentUser.id,
        adminEmail: currentUser.email,
        adminName: currentUser.fullName,
        action: 'shop_updated',
        targetEntityType: 'shop',
        targetEntityId: targetShop.id,
        targetEntityName: targetShop.name,
        reason: 'Platform Admin deleted shop logo from Cloud Storage',
      });

      showFeedback('success', `Shop logo for "${targetShop.name}" removed.`);
    } catch (err: any) {
      setAdminBrandingError(err?.message || 'Failed to delete shop logo.');
    } finally {
      setAdminBrandingSaving(false);
    }
  };

  // Save / Register Business
  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanForm: CreateBusinessInput = {
      ...businessForm,
      contactEmail: (
        businessForm.contactEmail ||
        businessForm.ownerEmail ||
        ''
      )
        .trim()
        .toLowerCase(),
      ownerPassword: businessForm.ownerPassword?.trim() || undefined,
    };

    if (!editingBusiness && (!cleanForm.ownerPassword || cleanForm.ownerPassword.length < 6)) {
      showFeedback(
        'error',
        'Owner login password is required (at least 6 characters).'
      );
      return;
    }

    const validation = validateBusinessRegistrationInput(
      cleanForm,
      businesses,
      users,
      editingBusiness?.id
    );
    if (!validation.valid) {
      showFeedback(
        'error',
        validation.error || 'Please provide all required business details.'
      );
      return;
    }

    try {
      if (editingBusiness) {
        await onUpdateBusiness(editingBusiness.id, cleanForm);
        addAuditLog({
          businessId: editingBusiness.id,
          businessName: cleanForm.name,
          adminUid: currentUser.id,
          adminEmail: currentUser.email,
          adminName: currentUser.fullName,
          action: 'business_profile_updated',
          targetEntityType: 'business',
          targetEntityId: editingBusiness.id,
          targetEntityName: cleanForm.name,
          reason: 'Platform Admin updated tenant business profile details',
        });
        showFeedback(
          'success',
          `Business "${cleanForm.name}" updated successfully.`
        );
      } else {
        const created = await onCreateBusiness(cleanForm);
        addAuditLog({
          businessId: created.id,
          businessName: created.name,
          adminUid: currentUser.id,
          adminEmail: currentUser.email,
          adminName: currentUser.fullName,
          action: 'business_registered',
          targetEntityType: 'business',
          targetEntityId: created.id,
          targetEntityName: created.name,
          reason: 'Platform Admin provisioned new commercial business tenant',
        });
        showFeedback(
          'success',
          `Business "${created.name}" registered and provisioned successfully.`
        );
      }
      setBusinessModalOpen(false);
      setEditingBusiness(null);
      setShowOwnerPassword(false);
    } catch (err: any) {
      showFeedback('error', err?.message || 'Failed to save business.');
    }
  };

  // Open Reason-Required Confirmation Modal
  const requestReasonConfirmation = (
    title: string,
    description: string,
    targetName: string,
    actionType: typeof reasonModal.actionType,
    metadata: Record<string, any>
  ) => {
    setReasonModal({
      open: true,
      title,
      description,
      targetName,
      actionType,
      metadata,
      reasonText: '',
      loading: false,
      error: null,
    });
  };

  // Execute Reason-Confirmed Action
  const handleExecuteConfirmedAction = async () => {
    if (!reasonModal.reasonText.trim()) {
      setReasonModal((prev) => ({
        ...prev,
        error:
          'A clear reason is mandatory to execute this administrative operation.',
      }));
      return;
    }

    setReasonModal((prev) => ({ ...prev, loading: true, error: null }));
    const reason = reasonModal.reasonText.trim();

    try {
      if (
        reasonModal.actionType === 'suspend_business' ||
        reasonModal.actionType === 'activate_business'
      ) {
        const { businessId, nextStatus } = reasonModal.metadata;
        await onToggleBusinessStatus(businessId, nextStatus, reason);
        const biz = businesses.find((b) => b.id === businessId);
        addAuditLog({
          businessId,
          businessName: biz?.name || businessId,
          adminUid: currentUser.id,
          adminEmail: currentUser.email,
          adminName: currentUser.fullName,
          action:
            nextStatus === 'suspended'
              ? 'business_suspended'
              : 'business_activated',
          targetEntityType: 'business',
          targetEntityId: businessId,
          targetEntityName: biz?.name || businessId,
          previousState: { status: biz?.status },
          newState: { status: nextStatus },
          reason,
        });
        showFeedback(
          'success',
          `Business "${biz?.name || businessId}" status changed to ${nextStatus}.`
        );
      } else if (
        reasonModal.actionType === 'disable_user' ||
        reasonModal.actionType === 'enable_user'
      ) {
        const { userId, status } = reasonModal.metadata;
        const targetUser = users.find((u) => u.id === userId);
        if (onToggleUserStatus) {
          await onToggleUserStatus({ userId, status, reason });
        }
        addAuditLog({
          businessId: targetUser?.businessId || 'platform',
          businessName: targetUser?.businessId || 'platform',
          adminUid: currentUser.id,
          adminEmail: currentUser.email,
          adminName: currentUser.fullName,
          action: status === 'suspended' ? 'user_disabled' : 'user_enabled',
          targetEntityType: 'user',
          targetEntityId: userId,
          targetEntityName: targetUser?.fullName || targetUser?.email || userId,
          previousState: { status: targetUser?.status },
          newState: { status },
          reason,
        });
        showFeedback(
          'success',
          `User account ${status === 'suspended' ? 'disabled' : 'enabled'} successfully.`
        );
      } else if (
        reasonModal.actionType === 'void_sale' ||
        reasonModal.actionType === 'refund_sale'
      ) {
        const { businessId, shopId, saleId, nextStatus } = reasonModal.metadata;
        const targetSale = sales.find((s) => s.id === saleId);
        if (onUpdateSaleStatus) {
          await onUpdateSaleStatus({
            businessId,
            shopId,
            saleId,
            nextStatus,
            reason,
          });
        }
        addAuditLog({
          businessId,
          businessName: businessId,
          shopId,
          adminUid: currentUser.id,
          adminEmail: currentUser.email,
          adminName: currentUser.fullName,
          action: nextStatus === 'refunded' ? 'sale_refunded' : 'sale_voided',
          targetEntityType: 'sale',
          targetEntityId: saleId,
          targetEntityName: `Receipt #${targetSale?.receiptNumber || saleId}`,
          previousState: { status: targetSale?.status },
          newState: { status: nextStatus },
          reason,
        });
        showFeedback(
          'success',
          `Sale receipt #${targetSale?.receiptNumber || saleId} ${nextStatus} successfully.`
        );
      } else if (reasonModal.actionType === 'adjust_inventory') {
        const { businessId, shopId, productId, delta, type } =
          reasonModal.metadata;
        const targetProd = products.find((p) => p.id === productId);
        if (onAdjustInventory) {
          await onAdjustInventory({
            businessId,
            shopId,
            productId,
            delta,
            type,
            reason,
          });
        }
        addAuditLog({
          businessId,
          businessName: businessId,
          shopId,
          adminUid: currentUser.id,
          adminEmail: currentUser.email,
          adminName: currentUser.fullName,
          action: 'inventory_adjusted',
          targetEntityType: 'product',
          targetEntityId: productId,
          targetEntityName: targetProd?.name || productId,
          previousState: { stockQuantity: targetProd?.stockQuantity },
          newState: {
            stockQuantity: (targetProd?.stockQuantity || 0) + delta,
            delta,
            type,
          },
          reason,
        });
        showFeedback(
          'success',
          `Inventory for "${targetProd?.name || productId}" adjusted (${delta > 0 ? `+${delta}` : delta} units).`
        );
      }

      setReasonModal((prev) => ({ ...prev, open: false, loading: false }));
    } catch (err: any) {
      setReasonModal((prev) => ({
        ...prev,
        loading: false,
        error: err?.message || 'Administrative operation failed.',
      }));
    }
  };

  const handleExecutePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalUser || !newPasswordVal.trim()) return;
    if (newPasswordVal.trim().length < 6) {
      showFeedback('error', 'Password must be at least 6 characters long.');
      return;
    }
    setPasswordModalLoading(true);
    try {
      if (onResetUserPassword) {
        await onResetUserPassword(passwordModalUser.id, newPasswordVal.trim());
      }
      showFeedback(
        'success',
        `Password updated successfully for "${passwordModalUser.fullName || passwordModalUser.email}".`
      );
      addAuditLog({
        businessId: passwordModalUser.businessId || 'platform',
        businessName: passwordModalUser.businessId || 'platform',
        adminUid: currentUser.id,
        adminEmail: currentUser.email,
        adminName: currentUser.fullName,
        action: 'user_password_reset',
        targetEntityType: 'user',
        targetEntityId: passwordModalUser.id,
        targetEntityName: passwordModalUser.fullName || passwordModalUser.email,
        reason: 'Platform Administrator updated user authentication password',
      });
      setPasswordModalUser(null);
      setNewPasswordVal('');
    } catch (err: any) {
      showFeedback('error', err?.message || 'Failed to update user password.');
    } finally {
      setPasswordModalLoading(false);
    }
  };

  // -------------------------------------------------------------
  // Render Tab Navigation
  // -------------------------------------------------------------
  const navigationTabs = [
    { id: 'overview', label: 'Platform Overview', icon: BarChart3 },
    { id: 'businesses', label: 'All Businesses', icon: Building2 },
    { id: 'workspace', label: 'Business Workspaces', icon: Briefcase },
    { id: 'shops', label: 'All Shops', icon: Store },
    { id: 'sales', label: 'Global Sales', icon: ShoppingCart },
    { id: 'inventory', label: 'Inventory Overview', icon: Package },
    { id: 'users', label: 'Business Users', icon: Users },
    { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
    { id: 'audit_logs', label: 'Activity Logs', icon: History },
    { id: 'settings', label: 'Platform Settings', icon: Settings },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans antialiased selection:bg-indigo-500 selection:text-white">
      {/* ---------------- Top Platform Administration Header ---------------- */}
      <header className="bg-slate-950 border-b border-slate-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <img
              src={SMARTMIND_LOGO_URL}
              onError={(e) => {
                const target = e.currentTarget;
                if (target.src !== SMARTMIND_FALLBACK_LOGO_URL) {
                  target.src = SMARTMIND_FALLBACK_LOGO_URL;
                }
              }}
              alt="SmartMind POS Logo"
              className="w-10 h-10 rounded-xl object-contain shrink-0 bg-slate-900 border border-slate-700 shadow-md p-0.5"
            />
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold text-white tracking-tight">
                  SMARTMIND POS
                </h1>
                <span className="px-2 py-0.5 text-xs font-semibold uppercase tracking-wider rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-300" />
                  Global Platform Admin
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Multi-Tenant Oversight & Universal Administration Console
              </p>
            </div>
          </div>

          {/* Global Business Context Dropdown */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 shadow-inner">
              <Building2 className="w-4 h-4 text-indigo-400" />
              <span className="text-xs text-slate-400 font-medium">
                Workspace Context:
              </span>
              <select
                value={selectedWorkspaceBizId}
                onChange={(e) => {
                  setSelectedWorkspaceBizId(e.target.value);
                  if (activeSection !== 'workspace') {
                    // Optional switch
                  }
                }}
                className="bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer pr-2"
              >
                {businesses.map((b) => (
                  <option
                    key={b.id}
                    value={b.id}
                    className="bg-slate-900 text-white"
                  >
                    {b.name} ({b.id})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => {
                setActiveSection('workspace');
                setWorkspaceTab('branding');
              }}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 flex items-center space-x-1 transition"
              title="Open Dedicated Business Workspace Branding"
            >
              <span>Enter Workspace</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Admin User Badge & Controls */}
          <div className="flex items-center space-x-3">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-medium text-slate-200">
                {currentUser.fullName || 'Platform Administrator'}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-end space-x-1">
                <span>{currentUser.email}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              </div>
            </div>

            <div className="h-6 w-px bg-slate-800" />

            <ConnectivityStatusControl
              snapshot={connectivity}
              onChangeState={onChangeConnectivityState}
            />

            <button
              onClick={onSignOut}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-red-950/40 hover:text-red-300 text-slate-300 border border-slate-700 hover:border-red-800/50 flex items-center space-x-1.5 transition"
              title="Sign Out of Platform Admin"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* 10 Navigation Section Tabs Bar */}
        <div className="border-t border-slate-800/80 bg-slate-950/60 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-1.5 py-1.5">
            {canScrollLeft && (
              <button
                type="button"
                onClick={() => handleScrollTabs('left')}
                className="shrink-0 p-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 transition cursor-pointer shadow-sm"
                title="Scroll navigation tabs left"
                aria-label="Scroll left"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}

            <div
              ref={tabsContainerRef}
              onScroll={checkTabScroll}
              className="flex-1 flex space-x-1 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900/40 py-0.5"
            >
              {navigationTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeSection === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveSection(tab.id as PlatformAdminSection)}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-semibold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                    {tab.id === 'businesses' && (
                      <span className="ml-1 px-1.5 py-0.2 text-[10px] rounded-full bg-slate-800 text-slate-300">
                        {businesses.length}
                      </span>
                    )}
                    {tab.id === 'shops' && (
                      <span className="ml-1 px-1.5 py-0.2 text-[10px] rounded-full bg-slate-800 text-slate-300">
                        {shops.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {canScrollRight && (
              <button
                type="button"
                onClick={() => handleScrollTabs('right')}
                className="shrink-0 flex items-center space-x-1 px-2 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400/40 transition cursor-pointer shadow-md shadow-indigo-900/50"
                title="Scroll to see Platform Settings and other tabs"
                aria-label="Scroll right"
              >
                <span className="text-[11px] font-medium hidden sm:inline">More</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ---------------- Flash Feedback Banner ---------------- */}
      {feedbackBanner && (
        <div
          className={`px-4 py-2.5 text-xs font-medium flex items-center justify-between transition-all ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-b border-emerald-800'
              : feedbackBanner.type === 'error'
              ? 'bg-rose-950/90 text-rose-200 border-b border-rose-800'
              : 'bg-indigo-950/90 text-indigo-200 border-b border-indigo-800'
          }`}
        >
          <div className="max-w-7xl mx-auto w-full flex items-center space-x-2">
            {feedbackBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedbackBanner.message}</span>
          </div>
          <button
            onClick={() => setFeedbackBanner(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ---------------- Main View Content Routing ---------------- */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* ========================================================= */}
        {/* SECTION 1: PLATFORM OVERVIEW                              */}
        {/* ========================================================= */}
        {activeSection === 'overview' && (
          <div className="space-y-6">
            {/* Hero / Quick Context */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
              <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight flex items-center space-x-2">
                    <span>Global Platform Infrastructure</span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Database: {firestoreDatabaseId}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                    Unified oversight across all commercial tenants. Full administrative access to inspect,
                    monitor, adjust, and configure businesses, shops, inventories, and transactions.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      setEditingBusiness(null);
                      setShowOwnerPassword(false);
                      setBusinessForm({
                        name: '',
                        legalName: '',
                        businessType: 'Supermarket & Grocery Chain',
                        registrationNumber: '',
                        taxIdentificationNumber: '',
                        ownerName: '',
                        ownerEmail: '',
                        ownerPassword: '',
                        contactEmail: '',
                        primaryPhone: '',
                        headquartersAddress: '',
                        currencyCode: 'NGN',
                        currencySymbol: '₦',
                        defaultTaxRatePercent: 7.5,
                        status: 'active',
                        notes: '',
                      });
                      setBusinessModalOpen(true);
                    }}
                    className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 flex items-center space-x-1.5 transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Register New Business</span>
                  </button>
                  <button
                    onClick={() => setActiveSection('sales')}
                    className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center space-x-1.5 transition"
                  >
                    <BarChart3 className="w-4 h-4 text-cyan-400" />
                    <span>Inspect Global Sales</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Global KPIs Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium">Businesses</span>
                  <Building2 className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-2xl font-bold text-white">
                  {platformOverview.totalBiz}
                </div>
                <div className="text-[11px] text-emerald-400 mt-1 flex items-center space-x-1">
                  <span>{platformOverview.activeBiz} active</span>
                  {platformOverview.suspendedBiz > 0 && (
                    <span className="text-rose-400">
                      • {platformOverview.suspendedBiz} suspended
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium">Total Shops</span>
                  <Store className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-2xl font-bold text-white">
                  {platformOverview.totalShops}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Across all tenants
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium">Business Owners</span>
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-white">
                  {platformOverview.totalOwners}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Primary tenant accounts
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium">Authorized Staff</span>
                  <Users className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-2xl font-bold text-white">
                  {platformOverview.totalStaff}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Managers & cashiers
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium">Platform Sales</span>
                  <ShoppingCart className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold text-white">
                  {platformOverview.totalSalesCount}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Synced transactions
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-medium">Catalog Items</span>
                  <Package className="w-4 h-4 text-blue-400" />
                </div>
                <div className="text-2xl font-bold text-white">
                  {platformOverview.totalProducts}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Global active inventory
                </div>
              </div>
            </div>

            {/* Platform Sales Volume Banner */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                  Global Platform Sales Value
                </span>
                <div className="text-3xl font-extrabold text-white mt-1">
                  ₦{platformOverview.totalSalesVolume.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Gross transacted merchandise value across all tenants and connected shop terminals.
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setActiveSection('businesses')}
                  className="px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                >
                  Manage All Businesses
                </button>
                <button
                  onClick={() => setActiveSection('workspace')}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition"
                >
                  Enter Selected Workspace
                </button>
              </div>
            </div>

            {/* Quick Overview Panels: Recent Audit Activity & Quick Directory */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Platform Audit Logs */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center space-x-2">
                    <History className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-sm font-bold text-white">
                      Recent Administrative Audit Trail
                    </h3>
                  </div>
                  <button
                    onClick={() => setActiveSection('audit_logs')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 transition"
                  >
                    View All ({localAuditLogs.length})
                  </button>
                </div>

                <div className="space-y-3">
                  {localAuditLogs.slice(0, 5).map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 text-xs flex items-start justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-slate-200">
                            {log.adminName}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono uppercase bg-slate-800 text-indigo-300">
                            {log.action.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-slate-400 mt-1">
                          <span className="text-slate-300 font-medium">
                            {log.targetEntityName}
                          </span>{' '}
                          — {log.reason}
                        </p>
                      </div>
                      <span className="text-[10px] text-slate-500 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                  {localAuditLogs.length === 0 && (
                    <p className="text-xs text-slate-500 italic py-4 text-center">
                      No administrative audit records logged yet.
                    </p>
                  )}
                </div>
              </div>

              {/* Tenants Summary */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center space-x-2">
                    <Building2 className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-sm font-bold text-white">
                      Registered Tenants Snapshot
                    </h3>
                  </div>
                  <button
                    onClick={() => setActiveSection('businesses')}
                    className="text-xs text-cyan-400 hover:text-cyan-300 transition"
                  >
                    Browse Directory
                  </button>
                </div>

                <div className="space-y-2.5">
                  {businesses.slice(0, 5).map((biz) => {
                    const bizShops = shops.filter((s) => s.businessId === biz.id);
                    const bizUsers = users.filter((u) => u.businessId === biz.id);
                    return (
                      <div
                        key={biz.id}
                        className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs hover:border-slate-700 transition cursor-pointer"
                        onClick={() => {
                          setSelectedWorkspaceBizId(biz.id);
                          setActiveSection('workspace');
                        }}
                      >
                        <div className="space-y-0.5">
                          <div className="font-semibold text-white flex items-center space-x-2">
                            <span>{biz.name}</span>
                            <span
                              className={`px-1.5 py-0.2 rounded-full text-[10px] font-medium ${
                                biz.status === 'active'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-rose-500/20 text-rose-300'
                              }`}
                            >
                              {biz.status}
                            </span>
                          </div>
                          <div className="text-slate-400 text-[11px]">
                            {biz.businessType} • Owner: {biz.ownerName}
                          </div>
                        </div>
                        <div className="text-right text-[11px] text-slate-400">
                          <div>{bizShops.length} shop(s)</div>
                          <div>{bizUsers.length} staff</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SECTION 2: ALL BUSINESSES DIRECTORY                       */}
        {/* ========================================================= */}
        {activeSection === 'businesses' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Tenant Businesses Directory
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Manage commercial businesses, configure headquarters, toggle operational status, and inspect workspaces.
                </p>
              </div>

              <button
                onClick={() => {
                  setEditingBusiness(null);
                  setShowOwnerPassword(false);
                  setBusinessForm({
                    name: '',
                    legalName: '',
                    businessType: 'Supermarket & Grocery Chain',
                    registrationNumber: '',
                    taxIdentificationNumber: '',
                    ownerName: '',
                    ownerEmail: '',
                    ownerPassword: '',
                    contactEmail: '',
                    primaryPhone: '',
                    headquartersAddress: '',
                    currencyCode: 'NGN',
                    currencySymbol: '₦',
                    defaultTaxRatePercent: 7.5,
                    status: 'active',
                    notes: '',
                  });
                  setBusinessModalOpen(true);
                }}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 flex items-center space-x-1.5 transition self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Register New Business</span>
              </button>
            </div>

            {/* Filter Bar */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search by business name, owner, RC, email..."
                  value={bizSearchQuery}
                  onChange={(e) => setBizSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-700/80 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <select
                  value={bizStatusFilter}
                  onChange={(e) =>
                    setBizStatusFilter(e.target.value as 'all' | BusinessStatus)
                  }
                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700/80 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All Statuses (Active & Suspended)</option>
                  <option value="active">Active Only</option>
                  <option value="suspended">Suspended Only</option>
                </select>
              </div>

              <div>
                <select
                  value={bizTypeFilter}
                  onChange={(e) => setBizTypeFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700/80 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All Business Types</option>
                  {BUSINESS_TYPES.map((bt) => (
                    <option key={bt} value={bt}>
                      {bt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Businesses Table */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/90 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Business Info</th>
                      <th className="py-3 px-4">Type & Headquarters</th>
                      <th className="py-3 px-4">Owner & Contact</th>
                      <th className="py-3 px-4 text-center">Shops</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Administrative Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredBusinesses.map((b) => {
                      const bizShops = shops.filter((s) => s.businessId === b.id);
                      const owner = users.find((u) => u.id === b.ownerUserId);
                      return (
                        <tr
                          key={b.id}
                          className="hover:bg-slate-900/50 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div className="font-bold text-white text-sm">
                              {b.name}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              Legal: {b.legalName || b.name}
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                              ID: {b.id} • RC: {b.registrationNumber || 'N/A'}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-200">
                              {b.businessType}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {b.headquartersAddress}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Currency: {b.currencyCode} ({b.currencySymbol}) • Tax: {b.defaultTaxRatePercent}%
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-200">
                              {b.ownerName}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {b.ownerEmail}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Phone: {b.primaryPhone}
                            </div>
                          </td>

                          <td className="py-3 px-4 text-center">
                            <span className="px-2 py-1 rounded-md bg-slate-900 text-indigo-300 font-semibold border border-slate-800">
                              {bizShops.length} shop{bizShops.length === 1 ? '' : 's'}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                                b.status === 'active'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {b.status === 'active' ? 'Active' : 'Suspended'}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                            <button
                              onClick={() => {
                                setSelectedWorkspaceBizId(b.id);
                                setActiveSection('workspace');
                              }}
                              className="px-2.5 py-1 text-xs font-semibold rounded bg-indigo-600/30 hover:bg-indigo-600/60 text-indigo-200 border border-indigo-500/40 transition"
                              title="Enter Dedicated Business Workspace"
                            >
                              Workspace
                            </button>

                            <button
                              onClick={() => setInspectBusiness(b)}
                              className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition"
                              title="View Details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => {
                                setEditingBusiness(b);
                                setBusinessForm({
                                  name: b.name,
                                  legalName: b.legalName || b.name,
                                  businessType: b.businessType,
                                  registrationNumber: b.registrationNumber,
                                  taxIdentificationNumber: b.taxIdentificationNumber,
                                  ownerName: b.ownerName,
                                  ownerEmail: b.ownerEmail,
                                  contactEmail: b.contactEmail,
                                  primaryPhone: b.primaryPhone,
                                  headquartersAddress: b.headquartersAddress,
                                  currencyCode: b.currencyCode || 'NGN',
                                  currencySymbol: b.currencySymbol || '₦',
                                  defaultTaxRatePercent: b.defaultTaxRatePercent ?? 7.5,
                                  status: b.status,
                                  notes: b.notes || '',
                                });
                                setBusinessModalOpen(true);
                              }}
                              className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition"
                              title="Edit Business"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => {
                                const nextStatus =
                                  b.status === 'active' ? 'suspended' : 'active';
                                requestReasonConfirmation(
                                  nextStatus === 'suspended'
                                    ? 'Suspend Business'
                                    : 'Activate Business',
                                  `You are about to change the status of business "${b.name}" to ${nextStatus}.`,
                                  b.name,
                                  nextStatus === 'suspended'
                                    ? 'suspend_business'
                                    : 'activate_business',
                                  { businessId: b.id, nextStatus }
                                );
                              }}
                              className={`p-1 rounded transition ${
                                b.status === 'active'
                                  ? 'hover:bg-rose-950/50 text-rose-400 hover:text-rose-300'
                                  : 'hover:bg-emerald-950/50 text-emerald-400 hover:text-emerald-300'
                              }`}
                              title={
                                b.status === 'active'
                                  ? 'Suspend Business'
                                  : 'Activate Business'
                              }
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {filteredBusinesses.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400 italic">
                  No businesses matched your search or status filter.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SECTION 3: ADMINISTRATIVE BUSINESS WORKSPACE              */}
        {/* ========================================================= */}
        {activeSection === 'workspace' && activeWorkspaceBusiness && (
          <div className="space-y-6">
            {/* Workspace Context Bar */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center font-bold text-white text-lg shadow-md">
                    {activeWorkspaceBusiness.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h2 className="text-xl font-bold text-white tracking-tight">
                        {activeWorkspaceBusiness.name}
                      </h2>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          activeWorkspaceBusiness.status === 'active'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {activeWorkspaceBusiness.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      ID: {activeWorkspaceBusiness.id} • {activeWorkspaceBusiness.businessType} • Owner: {activeWorkspaceBusiness.ownerName} ({activeWorkspaceBusiness.ownerEmail})
                    </p>
                  </div>
                </div>

                {/* Workspace Business Switcher Dropdown */}
                <div className="flex items-center space-x-2">
                  <label className="text-xs text-slate-400 font-medium">
                    Switch Business:
                  </label>
                  <select
                    value={activeWorkspaceBusiness.id}
                    onChange={(e) => setSelectedWorkspaceBizId(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
                  >
                    {businesses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Workspace Deep Tabs */}
              <div className="flex border-t border-slate-800/80 mt-5 pt-3 space-x-2 overflow-x-auto scrollbar-none">
                {[
                  { id: 'overview', label: 'Business Overview', icon: Building2 },
                  { id: 'sales', label: 'Sales Management', icon: ShoppingCart },
                  { id: 'inventory', label: 'Inventory Management', icon: Package },
                  { id: 'shops', label: 'Shop Management', icon: Store },
                  { id: 'staff', label: 'Staff Management', icon: Users },
                  { id: 'branding', label: 'Business Branding', icon: ImageIcon },
                ].map((t) => {
                  const Icon = t.icon;
                  const isActive = workspaceTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setWorkspaceTab(t.id as BusinessWorkspaceTab)}
                      className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* TAB A: Business Overview */}
            {workspaceTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                    <span className="text-xs font-medium text-slate-400">
                      Total Shops
                    </span>
                    <div className="text-2xl font-bold text-white mt-1">
                      {workspaceShops.length}
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                    <span className="text-xs font-medium text-slate-400">
                      Staff Accounts
                    </span>
                    <div className="text-2xl font-bold text-white mt-1">
                      {workspaceUsers.length}
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                    <span className="text-xs font-medium text-slate-400">
                      Products in Catalog
                    </span>
                    <div className="text-2xl font-bold text-white mt-1">
                      {workspaceProducts.length}
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                    <span className="text-xs font-medium text-slate-400">
                      Total Sales Revenue
                    </span>
                    <div className="text-2xl font-bold text-emerald-400 mt-1">
                      ₦{workspaceSales.reduce((sum, s) => sum + (s.totalAmount || 0), 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                {/* Profile Details Grid */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4 text-xs">
                  <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2">
                    Tenant Profile & Legal Registration
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-slate-300">
                    <div>
                      <span className="text-slate-500 block text-[11px]">
                        Business Name:
                      </span>
                      <span className="font-semibold">{activeWorkspaceBusiness.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">
                        Legal Name:
                      </span>
                      <span>{activeWorkspaceBusiness.legalName}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">
                        Registration Number (RC):
                      </span>
                      <span>{activeWorkspaceBusiness.registrationNumber || 'Pending'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">
                        Tax Identification Number (TIN):
                      </span>
                      <span>{activeWorkspaceBusiness.taxIdentificationNumber || 'Pending'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">
                        Primary Contact Phone:
                      </span>
                      <span>{activeWorkspaceBusiness.primaryPhone}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">
                        Headquarters Address:
                      </span>
                      <span>{activeWorkspaceBusiness.headquartersAddress}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">
                        Default Tax Rate:
                      </span>
                      <span>{activeWorkspaceBusiness.defaultTaxRatePercent}%</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">
                        Currency Code:
                      </span>
                      <span>{activeWorkspaceBusiness.currencyCode} ({activeWorkspaceBusiness.currencySymbol})</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[11px]">
                        Provisioned Date:
                      </span>
                      <span>{activeWorkspaceBusiness.createdAt}</span>
                    </div>
                  </div>
                </div>

                {/* Shops & Outlets with Direct "Enter Shop" Access */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Store className="w-4 h-4 text-emerald-400" />
                        <span>Shops & Outlets Under {activeWorkspaceBusiness.name} ({workspaceShops.length})</span>
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Direct administrative access to enter any shop or checkout counter for support, troubleshooting, or inspection without requesting customer credentials.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setWorkspaceTab('shops')}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
                      >
                        Manage Shops
                      </button>
                    </div>
                  </div>

                  {workspaceShops.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs bg-slate-900/40 rounded-lg border border-slate-800/80 p-4">
                      <Store className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <p className="font-medium text-slate-300">No shops registered under this business yet.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingShop(null);
                          setShopForm({
                            businessId: activeWorkspaceBusiness.id,
                            code: `SH-${String(workspaceShops.length + 1).padStart(2, '0')}`,
                            name: '',
                            category: 'Retail Store',
                            locationCity: activeWorkspaceBusiness.headquartersAddress || 'Lagos',
                            address: '',
                            phone: activeWorkspaceBusiness.primaryPhone || '',
                            managerName: '',
                            taxRatePercent: activeWorkspaceBusiness.defaultTaxRatePercent || 7.5,
                          });
                          setShopModalOpen(true);
                        }}
                        className="mt-3 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
                      >
                        Create First Shop
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {workspaceShops.map((sh) => {
                        const isCurrentActiveShop =
                          activeSupportSession?.businessId === activeWorkspaceBusiness.id &&
                          activeSupportSession?.shopId === sh.id;

                        return (
                          <div
                            key={sh.id}
                            className={`rounded-xl border p-4 flex flex-col justify-between transition-all ${
                              isCurrentActiveShop
                                ? 'bg-amber-950/20 border-amber-500/50 shadow-lg shadow-amber-500/10'
                                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div>
                                  <h4 className="font-bold text-white text-sm flex items-center gap-1.5">
                                    <Store className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                    <span>{sh.name}</span>
                                  </h4>
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <span className="font-mono text-[10px] bg-slate-800 text-indigo-300 px-1.5 py-0.5 rounded border border-slate-700">
                                      {sh.code}
                                    </span>
                                    <span className="text-[11px] text-slate-400 capitalize">
                                      {sh.category}
                                    </span>
                                  </div>
                                </div>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0 ${
                                    sh.status === 'active'
                                      ? 'bg-emerald-500/20 text-emerald-300'
                                      : 'bg-amber-500/20 text-amber-300'
                                  }`}
                                >
                                  {sh.status}
                                </span>
                              </div>

                              <div className="text-xs text-slate-400 space-y-1 my-3 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60">
                                <div className="truncate">
                                  <span className="text-slate-500">Location:</span> {sh.address || sh.locationCity}
                                </div>
                                <div>
                                  <span className="text-slate-500">Manager:</span> {sh.managerName || 'Unassigned'}
                                </div>
                                <div className="text-[11px] text-slate-500 flex justify-between">
                                  <span>Terminal: {sh.terminalId || 'T1'}</span>
                                  <span>Tax: {sh.taxRatePercent}%</span>
                                </div>
                              </div>
                            </div>

                            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 mt-auto">
                              <span className="text-[11px] font-mono text-slate-500 truncate">
                                ID: {sh.id}
                              </span>

                              {isCurrentActiveShop ? (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!onEndSupportSession || supportActionBusy) return;
                                    setSupportActionBusy(true);
                                    try {
                                      await onEndSupportSession();
                                      showFeedback('success', 'Support session ended successfully.');
                                    } catch (error) {
                                      showFeedback(
                                        'error',
                                        error instanceof Error ? error.message : 'Could not end support session.'
                                      );
                                    } finally {
                                      setSupportActionBusy(false);
                                    }
                                  }}
                                  disabled={supportActionBusy}
                                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                                >
                                  <LogOut className="w-3.5 h-3.5" />
                                  <span>Exit Shop</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!onStartSupportSession || supportActionBusy) return;
                                    setSupportActionBusy(true);
                                    try {
                                      await onStartSupportSession(activeWorkspaceBusiness.id, sh.id);
                                      showFeedback(
                                        'success',
                                        `Entered ${sh.name} in audited Platform Support mode.`
                                      );
                                    } catch (error) {
                                      showFeedback(
                                        'error',
                                        error instanceof Error ? error.message : 'Could not enter shop.'
                                      );
                                    } finally {
                                      setSupportActionBusy(false);
                                    }
                                  }}
                                  disabled={
                                    supportActionBusy ||
                                    !onStartSupportSession ||
                                    sh.status !== 'active' ||
                                    !!activeSupportSession
                                  }
                                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm shadow-emerald-900/30"
                                >
                                  <Store className="w-3.5 h-3.5" />
                                  <span>Enter Shop</span>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB B: Sales Management */}
            {workspaceTab === 'sales' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">
                    Sales Transactions for {activeWorkspaceBusiness.name} ({workspaceSales.length})
                  </h3>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3">Receipt #</th>
                        <th className="py-2.5 px-3">Shop</th>
                        <th className="py-2.5 px-3">Cashier</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Payment</th>
                        <th className="py-2.5 px-3 text-right">Amount</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {workspaceSales.map((s) => {
                        const sh = workspaceShops.find((shop) => shop.id === s.shopId);
                        return (
                          <tr key={s.id} className="hover:bg-slate-900/50">
                            <td className="py-2.5 px-3 font-mono font-medium text-white">
                              {s.receiptNumber}
                            </td>
                            <td className="py-2.5 px-3">{sh?.name || s.shopId}</td>
                            <td className="py-2.5 px-3">{s.cashierName}</td>
                            <td className="py-2.5 px-3 text-slate-400">
                              {new Date(s.createdAt).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 capitalize">
                              {s.paymentMethod.replace(/_/g, ' ')}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold text-emerald-400">
                              ₦{s.totalAmount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  s.status === 'completed'
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-rose-500/20 text-rose-300'
                                }`}
                              >
                                {s.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right space-x-1">
                              <button
                                onClick={() => setInspectSale(s)}
                                className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300"
                                title="Inspect Transaction"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              {s.status === 'completed' && (
                                <button
                                  onClick={() => {
                                    requestReasonConfirmation(
                                      'Void Transaction',
                                      `You are about to void receipt #${s.receiptNumber} (₦${s.totalAmount}).`,
                                      s.receiptNumber,
                                      'void_sale',
                                      {
                                        businessId: activeWorkspaceBusiness.id,
                                        shopId: s.shopId,
                                        saleId: s.id,
                                        nextStatus: 'voided',
                                      }
                                    );
                                  }}
                                  className="px-2 py-0.5 rounded text-[10px] bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/40"
                                >
                                  Void
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {workspaceSales.length === 0 && (
                    <div className="py-6 text-center text-xs text-slate-400 italic">
                      No sales recorded for this business yet.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB C: Inventory Management */}
            {workspaceTab === 'inventory' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">
                    Inventory Catalog for {activeWorkspaceBusiness.name} ({workspaceProducts.length})
                  </h3>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3">Product Name</th>
                        <th className="py-2.5 px-3">SKU / Barcode</th>
                        <th className="py-2.5 px-3">Shop</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3 text-right">Cost Price</th>
                        <th className="py-2.5 px-3 text-right">Selling Price</th>
                        <th className="py-2.5 px-3 text-center">Stock</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {workspaceProducts.map((p) => {
                        const sh = workspaceShops.find((shop) => shop.id === p.shopId);
                        return (
                          <tr key={p.id} className="hover:bg-slate-900/50">
                            <td className="py-2.5 px-3 font-semibold text-white">
                              {p.name}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                              {p.sku}
                            </td>
                            <td className="py-2.5 px-3">{sh?.name || p.shopId}</td>
                            <td className="py-2.5 px-3">{p.categoryName}</td>
                            <td className="py-2.5 px-3 text-right">
                              ₦{p.costPrice.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold text-white">
                              ₦{p.sellingPrice.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded font-bold ${
                                  p.stockQuantity <= 0
                                    ? 'bg-rose-500/20 text-rose-300'
                                    : p.stockQuantity <= p.reorderLevel
                                    ? 'bg-amber-500/20 text-amber-300'
                                    : 'bg-emerald-500/20 text-emerald-300'
                                }`}
                              >
                                {p.stockQuantity}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                onClick={() => {
                                  setAdjustingProduct({
                                    product: p,
                                    businessName: activeWorkspaceBusiness.name,
                                    shopName: sh?.name || p.shopId,
                                  });
                                  setInvAdjustForm({
                                    type: 'audit_correction',
                                    delta: 0,
                                    reason: '',
                                  });
                                  setInvAdjustModalOpen(true);
                                }}
                                className="px-2.5 py-1 text-xs font-semibold rounded bg-indigo-600/30 hover:bg-indigo-600/60 text-indigo-200 border border-indigo-500/40"
                              >
                                Adjust Stock
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {workspaceProducts.length === 0 && (
                    <div className="py-6 text-center text-xs text-slate-400 italic">
                      No products found in this business catalog.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB D: Shop Management */}
            {workspaceTab === 'shops' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">
                    Shops under {activeWorkspaceBusiness.name} ({workspaceShops.length})
                  </h3>
                  <button
                    onClick={() => {
                      setEditingShop(null);
                      setShopForm({
                        businessId: activeWorkspaceBusiness.id,
                        code: `SHP-0${workspaceShops.length + 1}`,
                        name: '',
                        category: 'Supermarket',
                        locationCity: 'Lagos',
                        address: '',
                        phone: activeWorkspaceBusiness.primaryPhone,
                        managerName: activeWorkspaceBusiness.ownerName,
                        taxRatePercent: 7.5,
                      });
                      setShopModalOpen(true);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create New Shop</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {workspaceShops.map((sh) => (
                    <div
                      key={sh.id}
                      className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <h4 className="font-bold text-white text-sm">
                              {sh.name}
                            </h4>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-800 text-cyan-300">
                              {sh.code}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {sh.category} • {sh.locationCity}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            sh.status === 'active'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {sh.status}
                        </span>
                      </div>

                      <div className="text-xs text-slate-400 space-y-1">
                        <div>Address: {sh.address}</div>
                        <div>Manager: {sh.managerName} • Phone: {sh.phone}</div>
                        <div>Terminal ID: {sh.terminalId} • Tax Rate: {sh.taxRatePercent}%</div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
  <div>
    {activeSupportSession?.businessId === activeWorkspaceBusiness.id &&
    activeSupportSession?.shopId === sh.id ? (
      <button
        type="button"
        onClick={async () => {
          if (!onEndSupportSession || supportActionBusy) return;

          setSupportActionBusy(true);
          try {
            await onEndSupportSession();
            showFeedback('success', 'Support session ended successfully.');
          } catch (error) {
            showFeedback(
              'error',
              error instanceof Error ? error.message : 'Could not end support session.'
            );
          } finally {
            setSupportActionBusy(false);
          }
        }}
        disabled={supportActionBusy}
        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white flex items-center gap-1.5 transition cursor-pointer"
      >
        <LogOut className="w-3.5 h-3.5" />
        <span>Exit Shop</span>
      </button>
    ) : (
      <button
        type="button"
        onClick={async () => {
          if (!onStartSupportSession || supportActionBusy) return;

          setSupportActionBusy(true);
          try {
            await onStartSupportSession(activeWorkspaceBusiness.id, sh.id);
            showFeedback(
              'success',
              `Entered ${sh.name} in audited Platform Support mode.`
            );
          } catch (error) {
            showFeedback(
              'error',
              error instanceof Error ? error.message : 'Could not enter shop.'
            );
          } finally {
            setSupportActionBusy(false);
          }
        }}
        disabled={
          supportActionBusy ||
          !onStartSupportSession ||
          sh.status !== 'active' ||
          !!activeSupportSession
        }
        className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white flex items-center gap-1.5 transition cursor-pointer"
      >
        <Store className="w-3.5 h-3.5" />
        <span>Enter Shop</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    )}
  </div>

  <button
    onClick={() => {
      setEditingShop(sh);
      setShopForm({
        businessId: sh.businessId,
        code: sh.code,
        name: sh.name,
        category: sh.category,
        locationCity: sh.locationCity,
        address: sh.address,
        phone: sh.phone,
        managerName: sh.managerName,
        taxRatePercent: sh.taxRatePercent,
      });
      setShopModalOpen(true);
    }}
    className="px-2.5 py-1 text-xs font-medium rounded bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700"
  >
    Edit Settings
  </button>
</div>

                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB E: Staff Management */}
            {workspaceTab === 'staff' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Authorized Staff & Owner for {activeWorkspaceBusiness.name} ({workspaceUsers.length})
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Provision managers, cashiers, and store personnel for this business directly without customer credentials.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCreateUserForm({
                        fullName: '',
                        email: '',
                        password: '',
                        role: 'shop_manager',
                        roleLabel: 'Shop Manager',
                        assignedShopIds: workspaceShops[0]?.id ? [workspaceShops[0].id] : [],
                        permissions: [
                          'process_sales',
                          'manage_products',
                          'adjust_inventory',
                          'process_returns',
                          'process_refunds',
                          'view_shop_reports',
                        ],
                        reason: `Admin user provisioned for ${activeWorkspaceBusiness.name}`,
                      });
                      setShowCreateUserPassword(false);
                      setCreateUserModalOpen(true);
                    }}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer shrink-0"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Create User</span>
                  </button>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3">Name & Email</th>
                        <th className="py-2.5 px-3">Role</th>
                        <th className="py-2.5 px-3">Assigned Shops</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {workspaceUsers.map((u) => {
                        return (
                          <tr key={u.id} className="hover:bg-slate-900/50">
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-white">
                                {u.fullName || u.username}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {u.email}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 capitalize">
                              <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-slate-900 text-indigo-300 border border-slate-800">
                                {u.role.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              {u.assignedShopIds?.length > 0
                                ? `${u.assignedShopIds.length} shop(s)`
                                : 'All Shops (Owner)'}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  u.status === 'active'
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-rose-500/20 text-rose-300'
                                }`}
                              >
                                {u.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right space-x-1">
                              <button
                                onClick={() => {
                                  setEditingUser(u);
                                  setUserRoleForm({
                                    role: u.role as UserRole,
                                    roleLabel: u.roleLabel,
                                    assignedShopIds: u.assignedShopIds || [],
                                    status: u.status,
                                    reason: '',
                                  });
                                  setEditUserModalOpen(true);
                                }}
                                className="px-2 py-1 text-xs rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700"
                              >
                                Edit Role
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setPasswordModalUser(u);
                                  setNewPasswordVal('');
                                  setShowNewPasswordVal(false);
                                }}
                                className="px-2 py-1 text-xs rounded bg-indigo-950/70 hover:bg-indigo-900 text-indigo-300 border border-indigo-800/50"
                              >
                                Set Password
                              </button>
                              <button
                                onClick={() => {
                                  const nextStatus =
                                    u.status === 'active' ? 'suspended' : 'active';
                                  requestReasonConfirmation(
                                    nextStatus === 'suspended'
                                      ? 'Disable User Account'
                                      : 'Enable User Account',
                                    `Change status of user "${u.fullName || u.email}" to ${nextStatus}.`,
                                    u.fullName || u.email,
                                    nextStatus === 'suspended'
                                      ? 'disable_user'
                                      : 'enable_user',
                                    { userId: u.id, status: nextStatus }
                                  );
                                }}
                                className={`px-2 py-1 text-xs rounded font-semibold transition ${
                                  u.status === 'active'
                                    ? 'bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/40'
                                    : 'bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/40'
                                }`}
                              >
                                {u.status === 'active' ? 'Disable' : 'Enable'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB F: Business & Shop Branding */}
            {workspaceTab === 'branding' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <ImageIcon className="w-5 h-5 text-indigo-400" />
                      <span>Cloud Branding &amp; Logo Management for {activeWorkspaceBusiness.name}</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Upload, preview, replace and sync business-wide and shop-specific logos in Firebase Storage.
                    </p>
                  </div>
                  <div className="text-xs font-mono text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg shrink-0">
                    Max Size: 512 KB • Formats: PNG, JPEG, WebP
                  </div>
                </div>

                {adminBrandingError && (
                  <div className="p-3 bg-rose-950/80 border border-rose-800/80 rounded-xl text-rose-200 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{adminBrandingError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Business Logo Card */}
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div>
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-indigo-400" />
                          <span>Parent Business Logo</span>
                        </h4>
                        <p className="text-[11px] text-slate-400">
                          Applies across all shops unless overridden by a shop-specific logo.
                        </p>
                      </div>
                      <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-indigo-950 text-indigo-300 border border-indigo-800/50">
                        businesses/{activeWorkspaceBusiness.id}/branding/business-logo
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-5">
                      <div className="w-24 h-24 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0 shadow-inner p-1">
                        {activeWorkspaceBusiness.logoUrl || getCachedOfflineLogo(activeWorkspaceBusiness.id) ? (
                          <img
                            src={activeWorkspaceBusiness.logoUrl || getCachedOfflineLogo(activeWorkspaceBusiness.id)}
                            alt={activeWorkspaceBusiness.name}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="text-center">
                            <span className="text-xl font-bold text-indigo-400">
                              {getCleanBrandInitials(activeWorkspaceBusiness.name)}
                            </span>
                            <span className="block text-[9px] text-slate-500 mt-0.5">No Logo</span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-3 flex-1 text-center sm:text-left">
                        <div className="text-xs text-slate-300">
                          <p className="font-semibold text-white">{activeWorkspaceBusiness.name}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {activeWorkspaceBusiness.logoUrl
                              ? 'Cloud Synchronized Logo Active'
                              : 'Default Monogram Fallback Active'}
                          </p>
                        </div>

                        <div className="flex items-center justify-center sm:justify-start gap-2">
                          <label
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer flex items-center gap-1.5 transition ${
                              adminBrandingSaving ? 'opacity-50 pointer-events-none' : ''
                            }`}
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>{activeWorkspaceBusiness.logoUrl ? 'Replace Logo' : 'Upload Logo'}</span>
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              onChange={handleAdminUploadBusinessLogo}
                              className="hidden"
                              disabled={adminBrandingSaving}
                            />
                          </label>

                          {(activeWorkspaceBusiness.logoUrl || getCachedOfflineLogo(activeWorkspaceBusiness.id)) && (
                            <button
                              type="button"
                              onClick={handleAdminDeleteBusinessLogo}
                              disabled={adminBrandingSaving}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/50 flex items-center gap-1.5 transition disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Brand Hierarchy Preview Card */}
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4">
                    <div className="border-b border-slate-800 pb-3">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                        <span>Customer Receipt Branding Resolution</span>
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Real-time preview of how logos resolve for shop terminals and printed receipts.
                      </p>
                    </div>

                    {workspaceShops.length > 0 ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-slate-400 font-medium">Inspect Shop:</label>
                          <select
                            value={adminSelectedShopId || workspaceShops[0]?.id}
                            onChange={(e) => setAdminSelectedShopId(e.target.value)}
                            className="bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-2.5 py-1 focus:outline-none focus:border-indigo-500"
                          >
                            {workspaceShops.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name} ({s.code})
                              </option>
                            ))}
                          </select>
                        </div>

                        {(() => {
                          const currentShop =
                            workspaceShops.find((s) => s.id === (adminSelectedShopId || workspaceShops[0]?.id)) ||
                            workspaceShops[0];
                          const resolved = resolveDocumentIdentity(activeWorkspaceBusiness, currentShop);
                          return (
                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-lg bg-slate-950 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                                  {resolved.logoUrl ? (
                                    <img
                                      src={resolved.logoUrl}
                                      alt={resolved.businessName}
                                      className="w-full h-full object-contain"
                                    />
                                  ) : (
                                    <span className="font-bold text-indigo-400">{resolved.initials}</span>
                                  )}
                                </div>
                                <div>
                                  <p className="font-bold text-white">{resolved.businessName}</p>
                                  <p className="text-[11px] text-slate-400">
                                    {resolved.shopName} ({resolved.shopCode})
                                  </p>
                                  <span
                                    className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                      resolved.isShopOverride
                                        ? 'bg-amber-500/20 text-amber-300'
                                        : resolved.logoUrl
                                        ? 'bg-indigo-500/20 text-indigo-300'
                                        : 'bg-slate-800 text-slate-400'
                                    }`}
                                  >
                                    {resolved.isShopOverride
                                      ? 'Shop-Specific Logo Override'
                                      : resolved.logoUrl
                                      ? 'Inherited Business Logo'
                                      : 'Text Monogram Fallback'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">No shops provisioned for this business yet.</p>
                    )}
                  </div>
                </div>

                {/* Shop Logos Grid */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Store className="w-4 h-4 text-cyan-400" />
                        <span>Shop Logos ({workspaceShops.length} Branches)</span>
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Upload custom shop logos to override the parent business logo on branch receipts.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {workspaceShops.map((sh) => {
                      const shopLogo = sh.logoUrl || getCachedOfflineLogo(activeWorkspaceBusiness.id, sh.id);
                      return (
                        <div key={sh.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <h5 className="font-bold text-white text-xs">{sh.name}</h5>
                              <p className="text-[11px] font-mono text-cyan-400">
                                {sh.code} • {sh.locationCity}
                              </p>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                sh.status === 'active'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              {sh.status}
                            </span>
                          </div>

                          <div className="flex items-center gap-4 pt-2 border-t border-slate-800/80">
                            <div className="w-16 h-16 rounded-xl bg-slate-950 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0 p-0.5">
                              {shopLogo ? (
                                <img src={shopLogo} alt={sh.name} className="w-full h-full object-contain" />
                              ) : (
                                <div className="text-center">
                                  <span className="text-xs font-bold text-slate-500">
                                    {getCleanBrandInitials(sh.name)}
                                  </span>
                                  <span className="block text-[8px] text-slate-600">Inherited</span>
                                </div>
                              )}
                            </div>

                            <div className="space-y-2 flex-1">
                              <div className="flex items-center gap-2">
                                <label
                                  className={`px-2.5 py-1 rounded text-xs font-semibold bg-indigo-600/40 hover:bg-indigo-600 text-indigo-100 border border-indigo-500/50 cursor-pointer flex items-center gap-1 transition ${
                                    adminBrandingSaving ? 'opacity-50 pointer-events-none' : ''
                                  }`}
                                >
                                  <Upload className="w-3 h-3" />
                                  <span>{shopLogo ? 'Replace' : 'Upload'}</span>
                                  <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    onChange={(e) => handleAdminUploadShopLogo(sh.id, e)}
                                    className="hidden"
                                    disabled={adminBrandingSaving}
                                  />
                                </label>

                                {shopLogo && (
                                  <button
                                    type="button"
                                    onClick={() => handleAdminDeleteShopLogo(sh.id)}
                                    disabled={adminBrandingSaving}
                                    className="p-1 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-950/60 border border-rose-800/40 transition disabled:opacity-50"
                                    title="Remove Shop Logo"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-500">
                                {shopLogo ? 'Custom Shop Logo' : 'Uses Business Logo Fallback'}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {workspaceShops.length === 0 && (
                      <div className="col-span-full py-8 text-center text-xs text-slate-500 italic">
                        No shops found for this business.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* SECTION 4: ALL SHOPS GLOBAL DIRECTORY                     */}
        {/* ========================================================= */}
        {activeSection === 'shops' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Global Shops Directory
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Universal registry of all physical shops and retail branches across all commercial tenants.
                </p>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search by shop code, name, city, manager..."
                  value={shopSearchQuery}
                  onChange={(e) => setShopSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-700/80 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <select
                  value={shopBizFilter}
                  onChange={(e) => setShopBizFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700/80 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All Businesses</option>
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={shopStatusFilter}
                  onChange={(e) => setShopStatusFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700/80 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All Shop Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
            </div>

            {/* Shops Table */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Code & Shop Name</th>
                      <th className="py-3 px-4">Business Tenant</th>
                      <th className="py-3 px-4">Category & City</th>
                      <th className="py-3 px-4">Manager & Phone</th>
                      <th className="py-3 px-4">Terminal & Tax</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredShops.map((sh) => {
                      const biz = businesses.find((b) => b.id === sh.businessId);
                      return (
                        <tr key={sh.id} className="hover:bg-slate-900/50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-white text-sm">
                              {sh.name}
                            </div>
                            <div className="text-[11px] font-mono text-cyan-400">
                              {sh.code}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-200">
                              {biz?.name || sh.businessId}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              ID: {sh.businessId}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="text-slate-300">{sh.category}</div>
                            <div className="text-[11px] text-slate-400">
                              {sh.locationCity}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="text-slate-300">{sh.managerName}</div>
                            <div className="text-[11px] text-slate-400">
                              {sh.phone}
                            </div>
                          </td>

                          <td className="py-3 px-4 font-mono text-[11px]">
                            <div>Terminal: {sh.terminalId}</div>
                            <div className="text-slate-400">Tax: {sh.taxRatePercent}%</div>
                          </td>

                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                                sh.status === 'active'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              {sh.status}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right space-x-1">
                            <button
                              onClick={() => {
                                setSelectedWorkspaceBizId(sh.businessId);
                                setActiveSection('workspace');
                                setWorkspaceTab('shops');
                              }}
                              className="px-2.5 py-1 text-xs font-semibold rounded bg-indigo-600/30 hover:bg-indigo-600/60 text-indigo-200 border border-indigo-500/40"
                            >
                              Manage
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {filteredShops.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400 italic">
                  No shops found matching your search criteria.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SECTION 5: GLOBAL SALES & ANALYTICS                       */}
        {/* ========================================================= */}
        {activeSection === 'sales' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Global Sales & Commercial Analytics
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Platform-wide transaction history, payment method breakdowns, and multi-tenant performance.
                </p>
              </div>

              {/* Date Presets Selector */}
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                {[
                  { id: 'today', label: 'Today' },
                  { id: 'yesterday', label: 'Yesterday' },
                  { id: 'last_7_days', label: 'Last 7d' },
                  { id: 'last_30_days', label: 'Last 30d' },
                  { id: 'this_month', label: 'This Month' },
                  { id: 'prev_month', label: 'Prev Month' },
                  { id: 'custom', label: 'Custom' },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() =>
                      setSalesDatePreset(preset.id as GlobalSalesDateRange)
                    }
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                      salesDatePreset === preset.id
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Date Inputs if 'custom' is selected */}
            {salesDatePreset === 'custom' && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center space-x-3 text-xs">
                <span className="text-slate-400 font-medium">Custom Range:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-white"
                />
                <span className="text-slate-500">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-white"
                />
              </div>
            )}

            {/* Sales Metric KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                <span className="text-xs font-medium text-slate-400">
                  Total Sales Value
                </span>
                <div className="text-2xl font-bold text-emerald-400 mt-1">
                  ₦{salesMetrics.totalValue.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Across selected date range
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                <span className="text-xs font-medium text-slate-400">
                  Total Transactions
                </span>
                <div className="text-2xl font-bold text-white mt-1">
                  {salesMetrics.txCount}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Completed & verified checkouts
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                <span className="text-xs font-medium text-slate-400">
                  Average Ticket Size
                </span>
                <div className="text-2xl font-bold text-indigo-400 mt-1">
                  ₦{salesMetrics.avgTxValue.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Per receipt transaction
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-1">
                <span className="text-xs font-medium text-slate-400">
                  Payment Mix
                </span>
                <div className="text-[11px] text-slate-300 space-y-0.5 pt-1">
                  <div className="flex justify-between">
                    <span>Cash:</span>
                    <span className="font-semibold text-white">
                      ₦{salesMetrics.cashValue.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Card / POS:</span>
                    <span className="font-semibold text-white">
                      ₦{salesMetrics.cardValue.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Transfer:</span>
                    <span className="font-semibold text-white">
                      ₦{salesMetrics.transferValue.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Top Performers Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-3">
                  Top Businesses by Sales Value
                </h4>
                <div className="space-y-2">
                  {salesMetrics.topBusinesses.map((b, idx) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between text-xs py-1.5 border-b border-slate-900 last:border-0"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="w-5 h-5 rounded-full bg-slate-900 flex items-center justify-center font-bold text-[10px] text-indigo-300">
                          {idx + 1}
                        </span>
                        <span className="font-medium text-white">{b.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold text-emerald-400">
                          ₦{b.value.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-slate-500 ml-1.5">
                          ({b.count} tx)
                        </span>
                      </div>
                    </div>
                  ))}
                  {salesMetrics.topBusinesses.length === 0 && (
                    <p className="text-xs text-slate-500 italic">No sales recorded.</p>
                  )}
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-3">
                  Top Shops by Sales Value
                </h4>
                <div className="space-y-2">
                  {salesMetrics.topShops.map((s, idx) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between text-xs py-1.5 border-b border-slate-900 last:border-0"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="w-5 h-5 rounded-full bg-slate-900 flex items-center justify-center font-bold text-[10px] text-cyan-300">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="font-medium text-white">{s.name}</div>
                          <div className="text-[10px] text-slate-500">
                            {s.businessName}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold text-emerald-400">
                          ₦{s.value.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-slate-500 ml-1.5">
                          ({s.count} tx)
                        </span>
                      </div>
                    </div>
                  ))}
                  {salesMetrics.topShops.length === 0 && (
                    <p className="text-xs text-slate-500 italic">No sales recorded.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Sales Table Filters */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Receipt #, cashier..."
                  value={salesSearchQuery}
                  onChange={(e) => setSalesSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-700/80 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <select
                  value={salesBizFilter}
                  onChange={(e) => setSalesBizFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700/80 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All Businesses</option>
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={salesPaymentFilter}
                  onChange={(e) => setSalesPaymentFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700/80 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All Payment Methods</option>
                  <option value="cash">Cash</option>
                  <option value="pos_card">POS / Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="credit">Credit / Customer Tab</option>
                </select>
              </div>

              <div>
                <select
                  value={salesStatusFilter}
                  onChange={(e) => setSalesStatusFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700/80 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="completed">Completed</option>
                  <option value="refunded">Refunded</option>
                  <option value="voided">Voided</option>
                </select>
              </div>
            </div>

            {/* Sales Table */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Receipt #</th>
                      <th className="py-3 px-4">Business & Shop</th>
                      <th className="py-3 px-4">Cashier</th>
                      <th className="py-3 px-4">Date & Time</th>
                      <th className="py-3 px-4">Payment Method</th>
                      <th className="py-3 px-4 text-right">Total Amount</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredSales.map((s) => {
                      const biz = businesses.find((b) => b.id === s.businessId);
                      const sh = shops.find((shop) => shop.id === s.shopId);
                      return (
                        <tr key={s.id} className="hover:bg-slate-900/50">
                          <td className="py-3 px-4 font-mono font-bold text-white">
                            {s.receiptNumber}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-200">
                              {biz?.name || s.businessId}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {sh?.name || s.shopId}
                            </div>
                          </td>
                          <td className="py-3 px-4">{s.cashierName}</td>
                          <td className="py-3 px-4 text-slate-400">
                            {new Date(s.createdAt).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 capitalize">
                            {s.paymentMethod.replace(/_/g, ' ')}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-emerald-400">
                            ₦{s.totalAmount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                s.status === 'completed'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-rose-500/20 text-rose-300'
                              }`}
                            >
                              {s.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                            <button
                              onClick={() => setInspectSale(s)}
                              className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300"
                              title="Inspect Receipt"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {s.status === 'completed' && (
                              <button
                                onClick={() => {
                                  requestReasonConfirmation(
                                    'Void Transaction',
                                    `Void sale receipt #${s.receiptNumber} (₦${s.totalAmount}) across all records.`,
                                    s.receiptNumber,
                                    'void_sale',
                                    {
                                      businessId: s.businessId,
                                      shopId: s.shopId,
                                      saleId: s.id,
                                      nextStatus: 'voided',
                                    }
                                  );
                                }}
                                className="px-2 py-0.5 rounded text-[10px] bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/40"
                              >
                                Void
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredSales.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400 italic">
                  No sales match your search and date filters.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SECTION 6: INVENTORY OVERVIEW                             */}
        {/* ========================================================= */}
        {activeSection === 'inventory' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Aggregated Inventory Catalog
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Universal catalog of all products across all businesses and shops with stock levels and administrative adjustment tools.
                </p>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search product, SKU, barcode..."
                  value={invSearchQuery}
                  onChange={(e) => setInvSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-700/80 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <select
                  value={invBizFilter}
                  onChange={(e) => setInvBizFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700/80 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All Businesses</option>
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={invShopFilter}
                  onChange={(e) => setInvShopFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700/80 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All Shops</option>
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={invStockStatusFilter}
                  onChange={(e) =>
                    setInvStockStatusFilter(
                      e.target.value as 'all' | 'in_stock' | 'low_stock' | 'out_of_stock'
                    )
                  }
                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700/80 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All Stock Levels</option>
                  <option value="in_stock">In Stock (&gt; reorder level)</option>
                  <option value="low_stock">Low Stock (≤ reorder level)</option>
                  <option value="out_of_stock">Out of Stock (0 units)</option>
                </select>
              </div>
            </div>

            {/* Inventory Table */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Product Name & SKU</th>
                      <th className="py-3 px-4">Business & Shop</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4 text-right">Cost Price</th>
                      <th className="py-3 px-4 text-right">Selling Price</th>
                      <th className="py-3 px-4 text-right">Margin %</th>
                      <th className="py-3 px-4 text-center">Stock Level</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredProducts.map((p) => {
                      const biz = businesses.find((b) => b.id === p.businessId);
                      const sh = shops.find((s) => s.id === p.shopId);
                      const margin =
                        p.sellingPrice > 0
                          ? ((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100
                          : 0;
                      return (
                        <tr key={p.id} className="hover:bg-slate-900/50">
                          <td className="py-3 px-4">
                            <div className="font-bold text-white text-sm">
                              {p.name}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400">
                              SKU: {p.sku} {p.barcode && `• Barcode: ${p.barcode}`}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-200">
                              {biz?.name || p.businessId}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {sh?.name || p.shopId}
                            </div>
                          </td>

                          <td className="py-3 px-4">{p.categoryName}</td>

                          <td className="py-3 px-4 text-right text-slate-300">
                            ₦{p.costPrice.toLocaleString()}
                          </td>

                          <td className="py-3 px-4 text-right font-semibold text-white">
                            ₦{p.sellingPrice.toLocaleString()}
                          </td>

                          <td className="py-3 px-4 text-right font-mono text-cyan-400">
                            {margin.toFixed(1)}%
                          </td>

                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-2.5 py-1 rounded font-bold ${
                                p.stockQuantity <= 0
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                  : p.stockQuantity <= p.reorderLevel
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              }`}
                            >
                              {p.stockQuantity} {p.unit}
                            </span>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              Reorder: {p.reorderLevel}
                            </div>
                          </td>

                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => {
                                setAdjustingProduct({
                                  product: p,
                                  businessName: biz?.name || p.businessId,
                                  shopName: sh?.name || p.shopId,
                                });
                                setInvAdjustForm({
                                  type: 'audit_correction',
                                  delta: 0,
                                  reason: '',
                                });
                                setInvAdjustModalOpen(true);
                              }}
                              className="px-2.5 py-1 text-xs font-semibold rounded bg-indigo-600/30 hover:bg-indigo-600/60 text-indigo-200 border border-indigo-500/40 transition"
                            >
                              Adjust Stock
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {filteredProducts.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400 italic">
                  No products found matching your catalog filters.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SECTION 7: BUSINESS USERS REGISTRY                        */}
        {/* ========================================================= */}
        {activeSection === 'users' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Universal User Accounts Registry
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Complete registry of all registered business owners, shop managers, and cashiers across all tenants.
                </p>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search user name, email, username..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-700/80 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700/80 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All Roles</option>
                  <option value="business_owner">Business Owner</option>
                  <option value="shop_manager">Shop Manager</option>
                  <option value="cashier">Cashier</option>
                </select>
              </div>

              <div>
                <select
                  value={userBizFilter}
                  onChange={(e) => setUserBizFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700/80 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All Businesses</option>
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={userStatusFilter}
                  onChange={(e) => setUserStatusFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700/80 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="suspended">Suspended Only</option>
                </select>
              </div>
            </div>

            {/* Users Table */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[11px]">
                    <tr>
                      <th className="py-3 px-4">User Profile</th>
                      <th className="py-3 px-4">Role & Permissions</th>
                      <th className="py-3 px-4">Business Tenant</th>
                      <th className="py-3 px-4">Assigned Shops</th>
                      <th className="py-3 px-4 text-center">Auth Status</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredUsers.map((u) => {
                      const biz = businesses.find((b) => b.id === u.businessId);
                      const isOwner = u.role === 'business_owner';
                      const authResolution = isOwner
                        ? resolveBusinessOwnerAuthState(u, biz)
                        : null;

                      return (
                        <tr key={u.id} className="hover:bg-slate-900/50">
                          <td className="py-3 px-4">
                            <div className="font-bold text-white text-sm">
                              {u.fullName || u.username}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {u.email}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              UID: {u.id}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-slate-900 text-indigo-300 border border-slate-800 capitalize">
                              {u.role.replace(/_/g, ' ')}
                            </span>
                            <div className="text-[10px] text-slate-500 mt-1">
                              {u.roleLabel || u.role}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-200">
                              {biz?.name || u.businessId}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            {isOwner ? (
                              <span className="text-slate-400 italic">
                                Full Tenant Access
                              </span>
                            ) : (
                              <span>
                                {u.assignedShopIds?.length || 0} assigned shop(s)
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-center">
                            {authResolution ? (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  authResolution.isUidLinked &&
                                  authResolution.isEmailVerified
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-amber-500/20 text-amber-300'
                                }`}
                              >
                                {authResolution.primaryState}
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[10px]">
                                Staff Account
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                                u.status === 'active'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-rose-500/20 text-rose-300'
                              }`}
                            >
                              {u.status}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                            {isOwner && onSendOwnerPasswordSetupEmail && (
                              <button
                                onClick={async () => {
                                  try {
                                    await onSendOwnerPasswordSetupEmail(u, biz);
                                    showFeedback(
                                      'success',
                                      `Password setup email sent to ${u.email}.`
                                    );
                                  } catch (err: any) {
                                    showFeedback('error', err?.message || 'Failed to send email.');
                                  }
                                }}
                                className="px-2 py-1 text-xs rounded bg-slate-900 hover:bg-slate-800 text-indigo-300 border border-indigo-900/50"
                                title="Send Password Setup Email"
                              >
                                Send Setup Email
                              </button>
                            )}

                            <button
                              onClick={() => {
                                setEditingUser(u);
                                setUserRoleForm({
                                  role: u.role as UserRole,
                                  roleLabel: u.roleLabel,
                                  assignedShopIds: u.assignedShopIds || [],
                                  status: u.status,
                                  reason: '',
                                });
                                setEditUserModalOpen(true);
                              }}
                              className="px-2 py-1 text-xs rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() => {
                                const nextStatus =
                                  u.status === 'active' ? 'suspended' : 'active';
                                requestReasonConfirmation(
                                  nextStatus === 'suspended'
                                    ? 'Disable User Account'
                                    : 'Enable User Account',
                                  `Are you sure you want to change user "${u.fullName || u.email}" status to ${nextStatus}?`,
                                  u.fullName || u.email,
                                  nextStatus === 'suspended'
                                    ? 'disable_user'
                                    : 'enable_user',
                                  { userId: u.id, status: nextStatus }
                                );
                              }}
                              className={`px-2 py-1 text-xs rounded font-semibold transition ${
                                u.status === 'active'
                                  ? 'bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/40'
                                  : 'bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/40'
                              }`}
                            >
                              {u.status === 'active' ? 'Disable' : 'Enable'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {filteredUsers.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400 italic">
                  No users matched your filter criteria.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SECTION 8: SUBSCRIPTIONS MANAGEMENT                       */}
        {/* ========================================================= */}
        {activeSection === 'subscriptions' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Tenant Subscriptions & License Tiers
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Manage commercial plan quotas, subscription terms, renewal dates, and grace periods for all registered businesses.
                </p>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Business Tenant</th>
                    <th className="py-3 px-4">Plan Tier</th>
                    <th className="py-3 px-4 text-center">Quota (Shops / Staff)</th>
                    <th className="py-3 px-4 text-right">Monthly Fee</th>
                    <th className="py-3 px-4">Renewal Date</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {localSubscriptions.map((sub) => {
                    return (
                      <tr key={sub.businessId} className="hover:bg-slate-900/50">
                        <td className="py-3 px-4">
                          <div className="font-bold text-white text-sm">
                            {sub.businessName}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            ID: {sub.businessId}
                          </div>
                        </td>

                        <td className="py-3 px-4 capitalize">
                          <span className="px-2.5 py-1 rounded font-semibold text-xs bg-indigo-950/60 text-indigo-300 border border-indigo-800/50 uppercase">
                            {sub.tier}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-center">
                          <span className="text-slate-200 font-medium">
                            {sub.maxShops} shops / {sub.maxUsers} users
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right font-bold text-emerald-400">
                          ₦{sub.monthlyFeeNaira.toLocaleString()}/mo
                        </td>

                        <td className="py-3 px-4 text-slate-400">
                          {sub.renewalDate}
                        </td>

                        <td className="py-3 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                              sub.status === 'active'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : sub.status === 'trial'
                                ? 'bg-blue-500/20 text-blue-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {sub.status}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => {
                              setEditingSubscription(sub);
                              setSubscriptionForm({
                                tier: sub.tier,
                                status: sub.status,
                                maxShops: sub.maxShops,
                                maxUsers: sub.maxUsers,
                                monthlyFeeNaira: sub.monthlyFeeNaira,
                                renewalDate: sub.renewalDate,
                                gracePeriodDays: sub.gracePeriodDays,
                                notes: sub.notes || '',
                              });
                              setSubscriptionModalOpen(true);
                            }}
                            className="px-2.5 py-1 text-xs font-semibold rounded bg-indigo-600/30 hover:bg-indigo-600/60 text-indigo-200 border border-indigo-500/40"
                          >
                            Manage Tier
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SECTION 9: ACTIVITY LOGS (AUDIT TRAIL)                    */}
        {/* ========================================================= */}
        {activeSection === 'audit_logs' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Global Administrative Audit Trail
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Append-only immutable record of all administrative operations, status toggles, stock adjustments, and account updates.
                </p>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search reason, admin, entity..."
                  value={auditSearchQuery}
                  onChange={(e) => setAuditSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-700/80 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <select
                  value={auditBizFilter}
                  onChange={(e) => setAuditBizFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700/80 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All Businesses</option>
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={auditActionFilter}
                  onChange={(e) => setAuditActionFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700/80 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All Action Types</option>
                  <option value="business_registered">Business Registered</option>
                  <option value="business_suspended">Business Suspended</option>
                  <option value="business_activated">Business Activated</option>
                  <option value="user_disabled">User Disabled</option>
                  <option value="user_enabled">User Enabled</option>
                  <option value="user_role_changed">User Role Changed</option>
                  <option value="inventory_adjusted">Inventory Adjusted</option>
                  <option value="sale_voided">Sale Voided</option>
                  <option value="sale_refunded">Sale Refunded</option>
                </select>
              </div>
            </div>

            {/* Audit Logs Table */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Administrator</th>
                      <th className="py-3 px-4">Business Tenant</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Target Entity</th>
                      <th className="py-3 px-4">Mandatory Reason</th>
                      <th className="py-3 px-4 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredAuditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-900/50">
                        <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">
                            {log.adminName}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {log.adminEmail}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-200">
                          {log.businessName}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-900 text-indigo-300 border border-slate-800 uppercase">
                            {log.action.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-200">
                          {log.targetEntityName}
                        </td>
                        <td className="py-3 px-4 text-slate-300 italic max-w-xs truncate">
                          "{log.reason}"
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setInspectAuditLog(log)}
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                            title="Inspect Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredAuditLogs.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400 italic">
                  No activity logs matched your filter.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SECTION 10: PLATFORM SETTINGS & SECURITY BOUNDARIES       */}
        {/* ========================================================= */}
        {activeSection === 'settings' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Platform Environment & Security Configuration
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Staging environment metadata, fail-closed policy enforcement, and cross-tenant boundary verification.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Infrastructure Metadata */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4 text-xs">
                <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2 flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                  <span>Staging Runtime & Infrastructure</span>
                </h3>
                <div className="space-y-2 text-slate-300">
                  <div className="flex justify-between py-1 border-b border-slate-900">
                    <span className="text-slate-400">Firebase Active Project:</span>
                    <span className="font-mono text-cyan-300">smartmind-pos-staging</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-900">
                    <span className="text-slate-400">Firestore Database:</span>
                    <span className="font-mono text-emerald-300">(default)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-900">
                    <span className="text-slate-400">Cloud Functions Region:</span>
                    <span className="font-mono text-indigo-300">africa-south1</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-900">
                    <span className="text-slate-400">Runtime Engine:</span>
                    <span className="font-mono text-slate-200">Node.js 22 (2nd Gen)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-900">
                    <span className="text-slate-400">Authorized Staging Admin:</span>
                    <span className="font-mono text-indigo-300">smart@smartmindconcept.com</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-900">
                    <span className="text-slate-400">Security Rules File:</span>
                    <span className="font-mono text-amber-300">firestore.staging.rules</span>
                  </div>
                </div>
              </div>

              {/* Security Boundary Enforcement */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4 text-xs">
                <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2 flex items-center space-x-2">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span>Security & Isolation Integrity</span>
                </h3>
                <div className="space-y-3">
                  <div className="flex items-start space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-white">Fail-Closed Regional Resolution</div>
                      <div className="text-slate-400 text-[11px]">Strict regional checks prevent staging code from connecting to production.</div>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-white">Tenant Cross-Access Prevention</div>
                      <div className="text-slate-400 text-[11px]">Non-admin users are strictly isolated to their own business shops and products.</div>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-white">Immutable Platform Audit Logging</div>
                      <div className="text-slate-400 text-[11px]">Sensitive administrative operations require mandatory reasons and are committed append-only.</div>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-white">Production Resource Protection</div>
                      <div className="text-slate-400 text-[11px]">Production Firestore rules and configuration files are preserved and untouched.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Cryptographic Keycard & Custom Claims Administration */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Key className="w-4 h-4 text-amber-400" />
                    <span>Cryptographic Admin Keycard (Firebase Custom Claims)</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Transition from hardcoded email checks to encrypted, token-based custom claims recognized across Firestore and Storage.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSyncMyClaims}
                  disabled={syncingClaims}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold text-xs transition cursor-pointer flex items-center space-x-1.5 self-start sm:self-auto"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>{syncingClaims ? 'Applying Keycard...' : 'Sync My Admin Keycard'}</span>
                </button>
              </div>

              {claimsFeedback && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-center justify-between ${
                    claimsFeedback.type === 'success'
                      ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-200'
                      : 'bg-red-950/60 border border-red-800 text-red-200'
                  }`}
                >
                  <span>{claimsFeedback.message}</span>
                  <button
                    type="button"
                    onClick={() => setClaimsFeedback(null)}
                    className="text-xs underline ml-2 cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div className="space-y-2">
                  <span className="font-semibold text-slate-200 block">Manage Administrator Privileges</span>
                  <p className="text-[11px] text-slate-400">
                    Grant or revoke the cryptographic <code className="text-amber-300">platform_admin</code> custom claim for any registered user email without editing rule files.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="email"
                      value={claimsActionEmail}
                      onChange={(e) => setClaimsActionEmail(e.target.value)}
                      placeholder="admin.user@example.com"
                      className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleToggleAdminRole(true)}
                      disabled={claimsActionLoading || !claimsActionEmail.trim()}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs cursor-pointer transition whitespace-nowrap"
                    >
                      Grant
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleAdminRole(false)}
                      disabled={claimsActionLoading || !claimsActionEmail.trim()}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-red-400 disabled:opacity-50 font-semibold text-xs cursor-pointer transition whitespace-nowrap border border-slate-700"
                    >
                      Revoke
                    </button>
                  </div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-3 text-slate-300 space-y-1.5">
                  <span className="font-semibold text-white block">Keycard Security Guarantees:</span>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-400">
                    <li>Tokens are cryptographically signed by Google Private Keys.</li>
                    <li>Eliminates reliance on hardcoded email addresses in database code.</li>
                    <li>Backward compatible: existing verified administrator emails retain access.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================= */}
      {/* MODAL 1: REGISTER / EDIT BUSINESS                         */}
      {/* ========================================================= */}
      {businessModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Building2 className="w-5 h-5 text-indigo-400" />
                <span>
                  {editingBusiness ? 'Edit Business Tenant Profile' : 'Register New Commercial Tenant'}
                </span>
              </h3>
              <button
                onClick={() => setBusinessModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBusiness} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    Business Commercial Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={businessForm.name}
                    onChange={(e) =>
                      setBusinessForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="e.g. Apex Hypermarket Ltd"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    Legal / Registered Entity Name
                  </label>
                  <input
                    type="text"
                    value={businessForm.legalName}
                    onChange={(e) =>
                      setBusinessForm((prev) => ({
                        ...prev,
                        legalName: e.target.value,
                      }))
                    }
                    placeholder="e.g. Apex Hypermarket Nigeria Limited"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    Business Type
                  </label>
                  <select
                    value={businessForm.businessType}
                    onChange={(e) =>
                      setBusinessForm((prev) => ({
                        ...prev,
                        businessType: e.target.value as BusinessType,
                      }))
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  >
                    {BUSINESS_TYPES.map((bt) => (
                      <option key={bt} value={bt}>
                        {bt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    Registration No (RC)
                  </label>
                  <input
                    type="text"
                    value={businessForm.registrationNumber}
                    onChange={(e) =>
                      setBusinessForm((prev) => ({
                        ...prev,
                        registrationNumber: e.target.value,
                      }))
                    }
                    placeholder="RC-123456"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    Tax ID (TIN)
                  </label>
                  <input
                    type="text"
                    value={businessForm.taxIdentificationNumber}
                    onChange={(e) =>
                      setBusinessForm((prev) => ({
                        ...prev,
                        taxIdentificationNumber: e.target.value,
                      }))
                    }
                    placeholder="TIN-987654"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    Primary Business Owner Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={businessForm.ownerName}
                    onChange={(e) =>
                      setBusinessForm((prev) => ({
                        ...prev,
                        ownerName: e.target.value,
                      }))
                    }
                    placeholder="e.g. Adebayo Adeleke"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    Owner Email (Firebase Auth Sign-In) *
                  </label>
                  <input
                    type="email"
                    required
                    value={businessForm.ownerEmail}
                    onChange={(e) =>
                      setBusinessForm((prev) => ({
                        ...prev,
                        ownerEmail: e.target.value,
                      }))
                    }
                    placeholder="owner@example.com"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {!editingBusiness && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-300 font-medium block">
                      Owner Login Password *
                    </label>
                    <span className="text-[11px] text-emerald-400 font-medium">
                      Direct Login (Pre-verified)
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type={showOwnerPassword ? 'text' : 'password'}
                      required
                      value={businessForm.ownerPassword || ''}
                      onChange={(e) =>
                        setBusinessForm((prev) => ({
                          ...prev,
                          ownerPassword: e.target.value,
                        }))
                      }
                      placeholder="e.g. Min. 6 characters"
                      autoComplete="new-password"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-10 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOwnerPassword((prev) => !prev)}
                      aria-label={showOwnerPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
                    >
                      {showOwnerPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Allows the business owner to log in immediately with this email and password without waiting for or needing email verification.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    Primary Phone Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={businessForm.primaryPhone}
                    onChange={(e) =>
                      setBusinessForm((prev) => ({
                        ...prev,
                        primaryPhone: e.target.value,
                      }))
                    }
                    placeholder="+2348000000000"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    Headquarters Address *
                  </label>
                  <input
                    type="text"
                    required
                    value={businessForm.headquartersAddress}
                    onChange={(e) =>
                      setBusinessForm((prev) => ({
                        ...prev,
                        headquartersAddress: e.target.value,
                      }))
                    }
                    placeholder="Victoria Island, Lagos, Nigeria"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setBusinessModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition"
                >
                  {editingBusiness ? 'Update Profile' : 'Confirm Registration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: MANDATORY-REASON CONFIRMATION MODAL              */}
      {/* ========================================================= */}
      {reasonModal.open && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {reasonModal.title}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Administrative authorization required
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReasonModal((prev) => ({ ...prev, open: false }))}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {reasonModal.description}
            </p>

            <div className="space-y-1.5 text-xs">
              <label className="text-slate-300 font-semibold flex items-center justify-between">
                <span>Mandatory Reason for Operation *</span>
                <span className="text-[10px] text-indigo-400">
                  (Written to audit log)
                </span>
              </label>
              <textarea
                rows={3}
                required
                value={reasonModal.reasonText}
                onChange={(e) =>
                  setReasonModal((prev) => ({
                    ...prev,
                    reasonText: e.target.value,
                    error: null,
                  }))
                }
                placeholder="Explain why this action is being taken (e.g., Non-payment, Customer requested refund, Discrepancy discovered during physical stock count...)"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-xs"
              />
            </div>

            {reasonModal.error && (
              <div className="text-xs text-rose-400 bg-rose-950/40 p-2.5 rounded border border-rose-900/50">
                {reasonModal.error}
              </div>
            )}

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                disabled={reasonModal.loading}
                onClick={() => setReasonModal((prev) => ({ ...prev, open: false }))}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={reasonModal.loading}
                onClick={handleExecuteConfirmedAction}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition disabled:opacity-50"
              >
                {reasonModal.loading ? 'Executing...' : 'Confirm & Log Operation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: INVENTORY ADJUSTMENT MODAL                       */}
      {/* ========================================================= */}
      {invAdjustModalOpen && adjustingProduct && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Package className="w-5 h-5 text-indigo-400" />
                <span>Adjust Inventory Stock</span>
              </h3>
              <button
                onClick={() => setInvAdjustModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs space-y-1 bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div className="font-semibold text-white">
                {adjustingProduct.product.name}
              </div>
              <div className="text-slate-400">
                SKU: {adjustingProduct.product.sku} • Shop: {adjustingProduct.shopName}
              </div>
              <div className="text-indigo-300 font-medium">
                Current Stock: {adjustingProduct.product.stockQuantity} {adjustingProduct.product.unit}
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Adjustment Type
                </label>
                <select
                  value={invAdjustForm.type}
                  onChange={(e) =>
                    setInvAdjustForm((prev) => ({
                      ...prev,
                      type: e.target.value as StockAdjustmentType,
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="audit_correction">Audit Stock Count Correction</option>
                  <option value="restock">Direct Restock (+)</option>
                  <option value="damage_spoilage">Damage / Spoilage (-)</option>
                  <option value="add_stock">Add Received Stock (+)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Quantity Delta (Positive or Negative)
                </label>
                <input
                  type="number"
                  value={invAdjustForm.delta}
                  onChange={(e) =>
                    setInvAdjustForm((prev) => ({
                      ...prev,
                      delta: parseInt(e.target.value, 10) || 0,
                    }))
                  }
                  placeholder="e.g. +10 or -5"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
                <div className="text-[11px] text-slate-400 mt-1">
                  Resulting Stock Level:{' '}
                  <span className="font-bold text-emerald-400">
                    {Math.max(
                      0,
                      adjustingProduct.product.stockQuantity + invAdjustForm.delta
                    )}{' '}
                    {adjustingProduct.product.unit}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Reason for Adjustment (Mandatory) *
                </label>
                <textarea
                  rows={2}
                  required
                  value={invAdjustForm.reason}
                  onChange={(e) =>
                    setInvAdjustForm((prev) => ({
                      ...prev,
                      reason: e.target.value,
                    }))
                  }
                  placeholder="Reason for adjusting stock..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setInvAdjustModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!invAdjustForm.reason.trim()) {
                    showFeedback('error', 'A reason is mandatory for stock adjustments.');
                    return;
                  }
                  setInvAdjustModalOpen(false);
                  requestReasonConfirmation(
                    'Confirm Stock Adjustment',
                    `Adjusting stock for "${adjustingProduct.product.name}" by ${invAdjustForm.delta > 0 ? `+${invAdjustForm.delta}` : invAdjustForm.delta} units.`,
                    adjustingProduct.product.name,
                    'adjust_inventory',
                    {
                      businessId: adjustingProduct.product.businessId,
                      shopId: adjustingProduct.product.shopId,
                      productId: adjustingProduct.product.id,
                      delta: invAdjustForm.delta,
                      type: invAdjustForm.type,
                    }
                  );
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition"
              >
                Proceed to Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 4: INSPECT SALE / TRANSACTION                       */}
      {/* ========================================================= */}
      {inspectSale && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <ShoppingCart className="w-5 h-5 text-indigo-400" />
                <span>Transaction Inspector #{inspectSale.receiptNumber}</span>
              </h3>
              <button
                onClick={() => setInspectSale(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-500 block text-[10px]">Date & Time:</span>
                <span>{new Date(inspectSale.createdAt).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Payment Method:</span>
                <span className="capitalize">{inspectSale.paymentMethod.replace(/_/g, ' ')}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Cashier:</span>
                <span>{inspectSale.cashierName}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Terminal:</span>
                <span>{inspectSale.terminalId}</span>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-2">Purchased Items:</h4>
              <div className="bg-slate-950 rounded-lg p-2.5 space-y-1.5 border border-slate-800 max-h-48 overflow-y-auto">
                {inspectSale.items?.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between items-center text-[11px] text-slate-300 py-0.5 border-b border-slate-900 last:border-0"
                  >
                    <div>
                      <div className="font-medium text-white">{item.productName}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {item.quantity} x ₦{item.unitPrice.toLocaleString()}
                      </div>
                    </div>
                    <span className="font-semibold text-white">
                      ₦{item.lineTotal.toLocaleString()}
                    </span>
                  </div>
                ))}
                {(!inspectSale.items || inspectSale.items.length === 0) && (
                  <p className="text-[11px] text-slate-500 italic">
                    Line item breakdown recorded under atomic synchronization receipt.
                  </p>
                )}
              </div>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1 text-slate-300">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>₦{inspectSale.subtotal.toLocaleString()}</span>
              </div>
              {inspectSale.discountAmount > 0 && (
                <div className="flex justify-between text-rose-400">
                  <span>Discount:</span>
                  <span>-₦{inspectSale.discountAmount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Tax ({inspectSale.taxRatePercent}%):</span>
                <span>₦{inspectSale.taxAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-white pt-1 border-t border-slate-800">
                <span>Total Amount:</span>
                <span className="text-emerald-400">
                  ₦{inspectSale.totalAmount.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setInspectSale(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 5: INSPECT AUDIT LOG DETAILS                        */}
      {/* ========================================================= */}
      {inspectAuditLog && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <History className="w-5 h-5 text-indigo-400" />
                <span>Audit Log Details #{inspectAuditLog.id}</span>
              </h3>
              <button
                onClick={() => setInspectAuditLog(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 bg-slate-950 p-3.5 rounded-lg border border-slate-800 text-slate-300">
              <div>
                <span className="text-slate-500 block text-[10px]">Action Type:</span>
                <span className="font-semibold text-indigo-300 uppercase font-mono">
                  {inspectAuditLog.action}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Administrator:</span>
                <span>{inspectAuditLog.adminName} ({inspectAuditLog.adminEmail})</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Target Entity:</span>
                <span>{inspectAuditLog.targetEntityType} — {inspectAuditLog.targetEntityName} ({inspectAuditLog.targetEntityId})</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Timestamp:</span>
                <span>{inspectAuditLog.createdAt}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Mandatory Reason:</span>
                <span className="italic text-white">"{inspectAuditLog.reason}"</span>
              </div>
            </div>

            {inspectAuditLog.previousState && (
              <div>
                <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Previous State:
                </span>
                <pre className="bg-slate-950 p-2.5 rounded font-mono text-[10px] text-slate-300 overflow-x-auto border border-slate-800">
                  {typeof inspectAuditLog.previousState === 'string'
                    ? inspectAuditLog.previousState
                    : JSON.stringify(inspectAuditLog.previousState, null, 2)}
                </pre>
              </div>
            )}

            {inspectAuditLog.newState && (
              <div>
                <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                  New State:
                </span>
                <pre className="bg-slate-950 p-2.5 rounded font-mono text-[10px] text-slate-300 overflow-x-auto border border-slate-800">
                  {typeof inspectAuditLog.newState === 'string'
                    ? inspectAuditLog.newState
                    : JSON.stringify(inspectAuditLog.newState, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setInspectAuditLog(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 6: EDIT USER ROLE & ASSIGNED SHOPS                  */}
      {/* ========================================================= */}
      {editUserModalOpen && editingUser && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Users className="w-5 h-5 text-indigo-400" />
                <span>Edit User Role & Permissions</span>
              </h3>
              <button
                onClick={() => setEditUserModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
              <div className="font-semibold text-white">{editingUser.fullName}</div>
              <div className="text-slate-400">{editingUser.email}</div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-slate-300 font-medium block mb-1">Role</label>
                <select
                  value={userRoleForm.role}
                  onChange={(e) =>
                    setUserRoleForm((prev) => ({
                      ...prev,
                      role: e.target.value as UserRole,
                      roleLabel:
                        e.target.value === 'shop_manager'
                          ? 'Shop Manager'
                          : e.target.value === 'cashier'
                          ? 'Cashier'
                          : 'Business Owner',
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs"
                >
                  <option value="business_owner">Business Owner</option>
                  <option value="shop_manager">Shop Manager</option>
                  <option value="cashier">Cashier</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Reason for Role Change (Mandatory) *
                </label>
                <textarea
                  rows={2}
                  required
                  value={userRoleForm.reason}
                  onChange={(e) =>
                    setUserRoleForm((prev) => ({
                      ...prev,
                      reason: e.target.value,
                    }))
                  }
                  placeholder="Explain why role is being changed..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditUserModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!userRoleForm.reason.trim()) {
                    showFeedback('error', 'A reason is mandatory to change user roles.');
                    return;
                  }
                  try {
                    if (onUpdateUserRoleAndShops) {
                      await onUpdateUserRoleAndShops({
                        userId: editingUser.id,
                        role: userRoleForm.role,
                        roleLabel: userRoleForm.roleLabel,
                        assignedShopIds: userRoleForm.assignedShopIds,
                        reason: userRoleForm.reason.trim(),
                      });
                    }
                    addAuditLog({
                      businessId: editingUser.businessId,
                      businessName: editingUser.businessId,
                      adminUid: currentUser.id,
                      adminEmail: currentUser.email,
                      adminName: currentUser.fullName,
                      action: 'user_role_changed',
                      targetEntityType: 'user',
                      targetEntityId: editingUser.id,
                      targetEntityName: editingUser.fullName || editingUser.email,
                      previousState: { role: editingUser.role },
                      newState: { role: userRoleForm.role },
                      reason: userRoleForm.reason.trim(),
                    });
                    showFeedback('success', `User role updated to ${userRoleForm.role}.`);
                    setEditUserModalOpen(false);
                  } catch (err: any) {
                    showFeedback('error', err?.message || 'Failed to update user role.');
                  }
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition"
              >
                Save Role
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: SET / RESET USER PASSWORD                          */}
      {/* ========================================================= */}
      {passwordModalUser && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Lock className="w-5 h-5 text-indigo-400" />
                <span>Set Account Password</span>
              </h3>
              <button
                type="button"
                onClick={() => setPasswordModalUser(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleExecutePasswordReset} className="space-y-4 text-xs">
              <div>
                <p className="text-slate-300">
                  Target Account: <strong className="text-white">{passwordModalUser.fullName || passwordModalUser.username}</strong>
                </p>
                <p className="text-slate-400 font-mono text-[11px] mt-0.5">
                  {passwordModalUser.email} • {passwordModalUser.role.replace(/_/g, ' ')}
                </p>
              </div>
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  New Password * (Min. 6 characters)
                </label>
                <div className="relative">
                  <input
                    type={showNewPasswordVal ? 'text' : 'password'}
                    required
                    value={newPasswordVal}
                    onChange={(e) => setNewPasswordVal(e.target.value)}
                    placeholder="Enter new login password"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-10 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPasswordVal((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
                  >
                    {showNewPasswordVal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Sets the password directly in Firebase Authentication with pre-verified status so the user can log in immediately.
                </p>
              </div>
              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setPasswordModalUser(null)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordModalLoading || newPasswordVal.trim().length < 6}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold flex items-center space-x-1.5 cursor-pointer"
                >
                  {passwordModalLoading ? (
                    <span>Saving...</span>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>Update Password</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 6B: CREATE USER FOR BUSINESS                       */}
      {/* ========================================================= */}
      {createUserModalOpen && activeWorkspaceBusiness && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <UserPlus className="w-5 h-5 text-indigo-400" />
                <span>Create Staff User for {activeWorkspaceBusiness.name}</span>
              </h3>
              <button
                type="button"
                onClick={() => setCreateUserModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
              <div className="text-[11px] text-slate-400">Target Business</div>
              <div className="font-semibold text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-400" />
                <span>{activeWorkspaceBusiness.name}</span>
                <span className="font-mono text-slate-500 text-[11px]">({activeWorkspaceBusiness.id})</span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={createUserForm.fullName}
                  onChange={(e) =>
                    setCreateUserForm((prev) => ({
                      ...prev,
                      fullName: e.target.value,
                    }))
                  }
                  placeholder="e.g. John Doe"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={createUserForm.email}
                  onChange={(e) =>
                    setCreateUserForm((prev) => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                  placeholder="e.g. staff@domain.com"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 font-medium block">
                    Password (Direct Login)
                  </label>
                  <span className="text-[10px] text-emerald-400 font-mono">
                    Pre-verified (Direct Login)
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showCreateUserPassword ? 'text' : 'password'}
                    value={createUserForm.password || ''}
                    onChange={(e) =>
                      setCreateUserForm((prev) => ({
                        ...prev,
                        password: e.target.value,
                      }))
                    }
                    placeholder="e.g. Min. 6 characters"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-10 py-2 text-white font-mono focus:outline-none focus:border-indigo-500 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreateUserPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
                  >
                    {showCreateUserPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Enables instant terminal sign-in without requiring email confirmation.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Role *</label>
                  <select
                    value={createUserForm.role}
                    onChange={(e) => {
                      const nextRole = e.target.value as UserRole;
                      setCreateUserForm((prev) => ({
                        ...prev,
                        role: nextRole,
                        roleLabel:
                          nextRole === 'shop_manager'
                            ? 'Shop Manager'
                            : nextRole === 'cashier'
                            ? 'Cashier'
                            : 'Business Owner',
                        permissions:
                          nextRole === 'cashier'
                            ? ['process_sales', 'process_returns']
                            : [
                                'process_sales',
                                'manage_products',
                                'adjust_inventory',
                                'process_returns',
                                'process_refunds',
                                'view_shop_reports',
                              ],
                      }));
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs"
                  >
                    <option value="shop_manager">Shop Manager</option>
                    <option value="cashier">Cashier</option>
                    <option value="business_owner">Business Owner</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">Role Title / Label</label>
                  <input
                    type="text"
                    value={createUserForm.roleLabel}
                    onChange={(e) =>
                      setCreateUserForm((prev) => ({
                        ...prev,
                        roleLabel: e.target.value,
                      }))
                    }
                    placeholder="e.g. Senior Cashier"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs"
                  />
                </div>
              </div>

              {/* Assigned Shops Checkboxes */}
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Assigned Shops {createUserForm.role !== 'business_owner' && '*'}
                </label>
                {workspaceShops.length === 0 ? (
                  <p className="text-amber-400 text-[11px]">No shops created yet under this business.</p>
                ) : (
                  <div className="space-y-1.5 max-h-32 overflow-y-auto bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                    {workspaceShops.map((sh) => {
                      const isAssigned = createUserForm.assignedShopIds.includes(sh.id);
                      return (
                        <label
                          key={sh.id}
                          className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white"
                        >
                          <input
                            type="checkbox"
                            checked={isAssigned}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setCreateUserForm((prev) => ({
                                ...prev,
                                assignedShopIds: checked
                                  ? [...prev.assignedShopIds, sh.id]
                                  : prev.assignedShopIds.filter((id) => id !== sh.id),
                              }));
                            }}
                            className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="font-medium">{sh.name}</span>
                          <span className="text-[10px] text-slate-500 font-mono">({sh.code})</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Administrative Reason (Mandatory Audit Log) *
                </label>
                <textarea
                  rows={2}
                  required
                  value={createUserForm.reason}
                  onChange={(e) =>
                    setCreateUserForm((prev) => ({
                      ...prev,
                      reason: e.target.value,
                    }))
                  }
                  placeholder="e.g. Customer requested staff creation for Shop 1..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setCreateUserModalOpen(false)}
                disabled={createUserBusy}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={createUserBusy}
                onClick={async () => {
                  if (!createUserForm.fullName.trim()) {
                    showFeedback('error', 'Full name is required.');
                    return;
                  }
                  if (!createUserForm.email.trim() || !createUserForm.email.includes('@')) {
                    showFeedback('error', 'A valid email address is required.');
                    return;
                  }
                  if (
                    createUserForm.role !== 'business_owner' &&
                    createUserForm.assignedShopIds.length === 0
                  ) {
                    showFeedback('error', 'Please assign at least one shop to this staff member.');
                    return;
                  }
                  if (!createUserForm.reason.trim()) {
                    showFeedback('error', 'Administrative reason is required for security audit trail.');
                    return;
                  }
                  if (!onCreateUser) {
                    showFeedback('error', 'User creation handler not configured.');
                    return;
                  }

                  setCreateUserBusy(true);
                  try {
                    const newUser = await onCreateUser({
                      businessId: activeWorkspaceBusiness.id,
                      fullName: createUserForm.fullName.trim(),
                      email: createUserForm.email.trim().toLowerCase(),
                      password: createUserForm.password?.trim() || undefined,
                      role: createUserForm.role,
                      roleLabel: createUserForm.roleLabel.trim() || undefined,
                      assignedShopIds: createUserForm.assignedShopIds,
                      permissions: createUserForm.permissions,
                      reason: createUserForm.reason.trim(),
                    });

                    addAuditLog({
                      businessId: activeWorkspaceBusiness.id,
                      businessName: activeWorkspaceBusiness.name,
                      adminUid: currentUser.id,
                      adminEmail: currentUser.email,
                      adminName: currentUser.fullName,
                      action: 'user_created',
                      targetEntityType: 'user',
                      targetEntityId: newUser.id,
                      targetEntityName: newUser.fullName || newUser.email,
                      previousState: undefined,
                      newState: {
                        email: newUser.email,
                        role: newUser.role,
                        assignedShopIds: newUser.assignedShopIds,
                      },
                      reason: createUserForm.reason.trim(),
                    });

                    showFeedback('success', `User ${newUser.email} created successfully.`);
                    setCreateUserModalOpen(false);
                  } catch (err: any) {
                    showFeedback('error', err?.message || 'Failed to create user.');
                  } finally {
                    setCreateUserBusy(false);
                  }
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white shadow-md transition flex items-center gap-1.5 cursor-pointer"
              >
                {createUserBusy ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Creating User...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Create User</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 7: CREATE / EDIT SHOP                               */}
      {/* ========================================================= */}
      {shopModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Store className="w-5 h-5 text-indigo-400" />
                <span>{editingShop ? 'Edit Shop Settings' : 'Create New Shop'}</span>
              </h3>
              <button
                onClick={() => setShopModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    Shop Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={shopForm.code}
                    onChange={(e) =>
                      setShopForm((prev) => ({ ...prev, code: e.target.value }))
                    }
                    placeholder="e.g. SHP-01"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    Shop Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={shopForm.name}
                    onChange={(e) =>
                      setShopForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="e.g. Victoria Island Main Branch"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    Category
                  </label>
                  <select
                    value={shopForm.category}
                    onChange={(e) =>
                      setShopForm((prev) => ({
                        ...prev,
                        category: e.target.value as Shop['category'],
                      }))
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="Supermarket">Supermarket</option>
                    <option value="Pharmacy">Pharmacy</option>
                    <option value="Express Mart">Express Mart</option>
                    <option value="Restaurant & Bakery">Restaurant & Bakery</option>
                    <option value="Retail Store">Retail Store</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    City / Location *
                  </label>
                  <input
                    type="text"
                    required
                    value={shopForm.locationCity}
                    onChange={(e) =>
                      setShopForm((prev) => ({
                        ...prev,
                        locationCity: e.target.value,
                      }))
                    }
                    placeholder="e.g. Lagos"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Physical Address *
                </label>
                <input
                  type="text"
                  required
                  value={shopForm.address}
                  onChange={(e) =>
                    setShopForm((prev) => ({ ...prev, address: e.target.value }))
                  }
                  placeholder="Street address..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    Manager Name
                  </label>
                  <input
                    type="text"
                    value={shopForm.managerName}
                    onChange={(e) =>
                      setShopForm((prev) => ({
                        ...prev,
                        managerName: e.target.value,
                      }))
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    Shop Phone
                  </label>
                  <input
                    type="text"
                    value={shopForm.phone}
                    onChange={(e) =>
                      setShopForm((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShopModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!shopForm.name.trim() || !shopForm.code.trim()) {
                    showFeedback('error', 'Shop name and code are required.');
                    return;
                  }
                  try {
                    if (editingShop && onUpdateShop) {
                      await onUpdateShop(editingShop.id, shopForm);
                      showFeedback('success', `Shop "${shopForm.name}" updated.`);
                    } else if (onCreateShop) {
                      await onCreateShop(shopForm);
                      showFeedback('success', `Shop "${shopForm.name}" created.`);
                    }
                    setShopModalOpen(false);
                  } catch (err: any) {
                    showFeedback('error', err?.message || 'Failed to save shop.');
                  }
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition"
              >
                Save Shop
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 8: MANAGE SUBSCRIPTION MODAL                        */}
      {/* ========================================================= */}
      {subscriptionModalOpen && editingSubscription && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <CreditCard className="w-5 h-5 text-indigo-400" />
                <span>Manage Subscription Tier</span>
              </h3>
              <button
                onClick={() => setSubscriptionModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div className="font-semibold text-white">
                {editingSubscription.businessName}
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                ID: {editingSubscription.businessId}
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    Plan Tier
                  </label>
                  <select
                    value={subscriptionForm.tier}
                    onChange={(e) =>
                      setSubscriptionForm((prev) => ({
                        ...prev,
                        tier: e.target.value as SubscriptionTier,
                      }))
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="starter">Starter</option>
                    <option value="standard">Standard</option>
                    <option value="professional">Professional</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    Status
                  </label>
                  <select
                    value={subscriptionForm.status}
                    onChange={(e) =>
                      setSubscriptionForm((prev) => ({
                        ...prev,
                        status: e.target.value as SubscriptionStatus,
                      }))
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="active">Active</option>
                    <option value="trial">Trial</option>
                    <option value="grace_period">Grace Period</option>
                    <option value="expired">Expired</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    Max Shops Quota
                  </label>
                  <input
                    type="number"
                    value={subscriptionForm.maxShops}
                    onChange={(e) =>
                      setSubscriptionForm((prev) => ({
                        ...prev,
                        maxShops: parseInt(e.target.value, 10) || 1,
                      }))
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium block mb-1">
                    Max Users Quota
                  </label>
                  <input
                    type="number"
                    value={subscriptionForm.maxUsers}
                    onChange={(e) =>
                      setSubscriptionForm((prev) => ({
                        ...prev,
                        maxUsers: parseInt(e.target.value, 10) || 1,
                      }))
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Renewal Date
                </label>
                <input
                  type="date"
                  value={subscriptionForm.renewalDate}
                  onChange={(e) =>
                    setSubscriptionForm((prev) => ({
                      ...prev,
                      renewalDate: e.target.value,
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSubscriptionModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const updated: BusinessSubscription = {
                    ...editingSubscription,
                    ...subscriptionForm,
                  };
                  setLocalSubscriptions((prev) =>
                    prev.map((s) =>
                      s.businessId === updated.businessId ? updated : s
                    )
                  );
                  if (onUpdateSubscription) {
                    onUpdateSubscription(updated);
                  }
                  addAuditLog({
                    businessId: updated.businessId,
                    businessName: updated.businessName,
                    adminUid: currentUser.id,
                    adminEmail: currentUser.email,
                    adminName: currentUser.fullName,
                    action: 'subscription_plan_updated',
                    targetEntityType: 'subscription',
                    targetEntityId: updated.businessId,
                    targetEntityName: `${updated.businessName} Plan`,
                    reason: `Platform Admin updated subscription plan to ${updated.tier} (${updated.status})`,
                  });
                  showFeedback(
                    'success',
                    `Subscription updated for ${updated.businessName}.`
                  );
                  setSubscriptionModalOpen(false);
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition"
              >
                Save Subscription
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
